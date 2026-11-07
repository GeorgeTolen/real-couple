"""Судьи: одна модель, ансамбль с арбитром, локальная модель."""
import asyncio
from dataclasses import dataclass, field
from typing import Any

from . import llm
from .config import get_settings
from .prompt_builder import build_arbiter_prompt, build_schema, build_system_prompt
from .schemas import Checklist
from .scoring import allowed_answers, criteria_for_channel

AGREEMENT_SINGLE = "single"
AGREEMENT_FULL = "full"
AGREEMENT_ARBITRATED = "arbitrated"
AGREEMENT_FALLBACK = "unresolved"


@dataclass
class JudgeOutcome:
    criteria: dict[str, dict[str, Any]]
    models: dict[str, str]
    needs_review: bool = False
    cost_usd: float = 0.0
    spent_usd: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    notes: list[str] = field(default_factory=list)

    def add(self, result: llm.LLMResult) -> None:
        self.cost_usd += result.cost_usd
        self.spent_usd += 0.0 if result.cached else result.cost_usd
        self.tokens_in += result.tokens_in
        self.tokens_out += result.tokens_out


def resolve_models(mode: str, overrides: dict[str, str] | None) -> dict[str, str]:
    settings = get_settings()
    overrides = overrides or {}
    if mode == "ensemble":
        return {
            "judge_a": overrides.get("judge_a") or settings.judge_a,
            "judge_b": overrides.get("judge_b") or settings.judge_b,
            "arbiter": overrides.get("arbiter") or settings.arbiter,
        }
    if mode == "local":
        model = overrides.get("single") or settings.local_model
        if not model:
            raise llm.LLMError("Для локального режима задайте LOCAL_MODEL в .env")
        return {"single": model}
    return {"single": overrides.get("single") or settings.judge_a}


def make_validator(checklist: Checklist, channel: str | None, n_turns: int, only: list[str] | None = None):
    """Проверяет ответ модели по конфигурации и убирает ссылки на несуществующие реплики."""
    criteria = [c for c in criteria_for_channel(checklist, channel) if only is None or c.id in only]

    def validate(data: dict[str, Any]) -> dict[str, Any]:
        cleaned: dict[str, Any] = {}
        for criterion in criteria:
            item = data.get(criterion.id)
            if not isinstance(item, dict):
                raise ValueError(f"нет ответа по критерию {criterion.id}")
            answer = str(item.get("answer"))
            allowed = allowed_answers(criterion)
            if answer not in allowed:
                raise ValueError(
                    f"критерий {criterion.id}: ответ {answer!r} недопустим, можно только {allowed}"
                )
            category = None
            if criterion.categories and answer == "Y":
                category = item.get("category")
                if category not in criterion.categories:
                    raise ValueError(
                        f"критерий {criterion.id}: при ответе Y укажи category из {criterion.categories}"
                    )
            cleaned[criterion.id] = {
                "answer": answer,
                "reasoning": str(item.get("reasoning") or ""),
                "evidence_ids": _turn_numbers(item.get("evidence_ids"), n_turns),
                "checked_range": _range(item.get("checked_range"), n_turns),
                "category": category,
            }
        return cleaned

    return validate


def _turn_numbers(values: Any, n_turns: int) -> list[int]:
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= n_turns:
            if value not in result:
                result.append(value)
    return result


def _range(values: Any, n_turns: int) -> list[int] | None:
    numbers = _turn_numbers(values, n_turns)
    if len(numbers) < 2:
        return None
    return [min(numbers), max(numbers)]


def _final(opinion: dict[str, Any], agreement: str, judges: dict[str, Any]) -> dict[str, Any]:
    return {
        "answer": opinion["answer"],
        "reasoning": opinion["reasoning"],
        "evidence_ids": opinion["evidence_ids"],
        "checked_range": opinion["checked_range"],
        "category": opinion.get("category"),
        "agreement": agreement,
        "judge_answers": judges,
    }


def _forced_disputes(checklist: Checklist, opinions: list[dict[str, Any]]) -> set[str]:
    """Правила из конфигурации: например, идентификация «Нет» проверяет пропуск грубой ошибки."""
    forced = set()
    for rule in checklist.review_rules:
        triggered = any(
            o.get(rule.when_criterion, {}).get("answer") == rule.when_answer for o in opinions
        )
        if triggered and any(o.get(rule.dispute, {}).get("answer") == "N" for o in opinions):
            forced.add(rule.dispute)
    return forced


def _fallback_answer(criterion, first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    """Арбитр недоступен: для шкалы берётся меньшая ступень, для остального ответ судьи A."""
    if criterion.type == "scale" and "NA" not in (first["answer"], second["answer"]):
        return first if int(first["answer"]) <= int(second["answer"]) else second
    return first


async def _run_single(*, provider, model, system, user, schema, validator, use_cache, outcome):
    result = await llm.chat_json(
        provider=provider,
        model=model,
        system=system,
        user=user,
        schema=schema,
        validator=validator,
        use_cache=use_cache,
    )
    outcome.add(result)
    return result.data


async def judge_conversation(
    *,
    checklist: Checklist,
    channel: str,
    user_prompt: str,
    n_turns: int,
    mode: str,
    models: dict[str, str] | None = None,
    use_cache: bool = True,
    only: list[str] | None = None,
) -> JudgeOutcome:
    """only ограничивает оценку перечисленными критериями: остальные берутся из прошлой оценки."""
    resolved = resolve_models(mode, models)
    system = build_system_prompt(checklist, channel, only=only)
    schema = build_schema(checklist, channel, only=only)
    validator = make_validator(checklist, channel, n_turns, only=only)
    outcome = JudgeOutcome(criteria={}, models=resolved)
    common = dict(
        system=system, user=user_prompt, schema=schema, validator=validator,
        use_cache=use_cache, outcome=outcome,
    )

    if mode in ("single", "local"):
        provider = llm.local_provider() if mode == "local" else llm.cloud_provider()
        answers = await _run_single(provider=provider, model=resolved["single"], **common)
        outcome.criteria = {
            cid: _final(opinion, AGREEMENT_SINGLE, {resolved["single"]: opinion})
            for cid, opinion in answers.items()
        }
        return outcome

    provider = llm.cloud_provider()
    first, second = await asyncio.gather(
        _run_single(provider=provider, model=resolved["judge_a"], **common),
        _run_single(provider=provider, model=resolved["judge_b"], **common),
        return_exceptions=True,
    )
    failed = [r for r in (first, second) if isinstance(r, BaseException)]
    if len(failed) == 2:
        raise llm.LLMError(f"Оба судьи недоступны: {failed[0]}; {failed[1]}")
    if failed:
        survivor, name = (
            (second, resolved["judge_b"]) if isinstance(first, BaseException) else (first, resolved["judge_a"])
        )
        outcome.needs_review = True
        outcome.notes.append(f"Один судья недоступен: {failed[0]}")
        outcome.criteria = {
            cid: _final(opinion, AGREEMENT_FALLBACK, {name: opinion})
            for cid, opinion in survivor.items()
        }
        return outcome

    name_a, name_b = resolved["judge_a"], resolved["judge_b"]
    disputed = [cid for cid in first if first[cid]["answer"] != second[cid]["answer"]]
    forced = _forced_disputes(checklist, [first, second])
    disputed += [cid for cid in forced if cid in first and cid not in disputed]

    for cid in first:
        if cid not in disputed:
            opinion = first[cid] if first[cid]["evidence_ids"] else second[cid]
            outcome.criteria[cid] = _final(
                opinion, AGREEMENT_FULL, {name_a: first[cid], name_b: second[cid]}
            )
    if not disputed:
        return outcome

    outcome.needs_review = True
    arbiter = resolved["arbiter"]
    try:
        verdicts = await _run_single(
            provider=provider,
            model=arbiter,
            system=build_system_prompt(checklist, channel, only=disputed),
            user=build_arbiter_prompt(
                user_prompt,
                {cid: {"Судья A": first[cid], "Судья B": second[cid]} for cid in disputed},
            ),
            schema=build_schema(checklist, channel, only=disputed),
            validator=make_validator(checklist, channel, n_turns, only=disputed),
            use_cache=use_cache,
            outcome=outcome,
        )
    except llm.LLMError as exc:
        verdicts = None
        outcome.notes.append(f"Арбитр недоступен: {exc}")

    by_id = {c.id: c for c in criteria_for_channel(checklist, channel)}
    for cid in disputed:
        judges = {name_a: first[cid], name_b: second[cid]}
        if verdicts:
            judges[f"{arbiter} (арбитр)"] = verdicts[cid]
            outcome.criteria[cid] = _final(verdicts[cid], AGREEMENT_ARBITRATED, judges)
        else:
            chosen = _fallback_answer(by_id[cid], first[cid], second[cid])
            outcome.criteria[cid] = _final(chosen, AGREEMENT_FALLBACK, judges)
    return outcome
