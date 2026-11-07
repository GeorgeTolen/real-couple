"""Оценка одного диалога от транскрипта до сохранённого результата."""
import logging
import time
from typing import Any

from . import audio, judge, repo
from .prompt_builder import build_user_prompt, prompt_version
from .schemas import Checklist
from .scoring import compute_totals, criteria_for_channel
from .signals import compute_signals

log = logging.getLogger("cqa.evaluator")


def _fill_checked_range(criteria: dict[str, dict], checklist: Checklist, channel: str, turns: list[dict]) -> None:
    """Если действие пропущено и модель не указала участок, это весь участок работы оператора."""
    operator = [t["n"] for t in turns if t["speaker"] == "operator"]
    if not operator:
        return
    for criterion in criteria_for_channel(checklist, channel):
        item = criteria[criterion.id]
        if item["answer"] == "N" and criterion.type != "flag" and not item["checked_range"]:
            item["checked_range"] = [operator[0], operator[-1]]


async def evaluate_conversation(
    conversation_id: str,
    checklist: Checklist,
    mode: str = "ensemble",
    models: dict[str, str] | None = None,
    force: bool = False,
    changed_only: bool = False,
) -> dict[str, Any]:
    """Повтор отдаёт сохранённую оценку. force пересчитывает заново и сохраняет новую версию оценки.

    changed_only берёт ответы прошлой версии чек-листа по неизменённым критериям.
    """
    conversation = repo.get_conversation(conversation_id)
    channel = conversation["channel"]
    turns = conversation["turns"]
    version = prompt_version(checklist, channel)
    started = time.monotonic()
    signals: dict[str, Any] = {}
    use_cache = not force
    try:
        if not force:
            same = repo.find_same_evaluation(
                conversation, checklist, version, mode, judge.resolve_models(mode, models)
            )
            if same:
                return {
                    "conversation_id": conversation_id, "evaluation_id": same["id"], "status": "ok",
                    "score": same["total_score"], "gross": bool(same["gross_violation"]),
                    "needs_review": bool(same["needs_review"]), "cost_usd": 0.0, "spent_usd": 0.0,
                    "latency_ms": 0, "unchanged": True,
                }
        metrics = None
        if channel == "voice call":
            metrics = await audio.speech_metrics(conversation_id, conversation["audio_url"], turns)
        signals = compute_signals(turns, metrics)
        user_prompt = build_user_prompt(conversation_id, channel, conversation["language"], turns, signals)
        reused: dict[str, dict[str, Any]] = {}
        reused_models: dict[str, str] = {}
        found = repo.reusable_results(conversation, checklist, mode) if changed_only else None
        if found:
            reused, reused_models = found
        pending = [c.id for c in criteria_for_channel(checklist, channel) if c.id not in reused]
        if pending:
            outcome = await judge.judge_conversation(
                checklist=checklist,
                channel=channel,
                user_prompt=user_prompt,
                n_turns=len(turns),
                mode=mode,
                models=models,
                use_cache=use_cache,
                only=pending if reused else None,
            )
        else:
            outcome = judge.JudgeOutcome(criteria={}, models=reused_models)
        if reused:
            outcome.criteria = {**reused, **outcome.criteria}
            outcome.needs_review = outcome.needs_review or any(
                judge.item_needs_review(item) for item in reused.values()
            )
            signals["reused_criteria"] = sorted(reused)
        _fill_checked_range(outcome.criteria, checklist, channel, turns)
        totals = compute_totals(
            checklist, {cid: item["answer"] for cid, item in outcome.criteria.items()}, channel
        )
        if outcome.notes:
            signals["notes"] = outcome.notes
        latency = int((time.monotonic() - started) * 1000)
        evaluation_id = repo.insert_evaluation(
            conversation=conversation, checklist=checklist, mode=mode, models=outcome.models,
            prompt_version=version, status="ok", totals=totals, criteria=outcome.criteria,
            needs_review=outcome.needs_review, cost_usd=outcome.cost_usd, spent_usd=outcome.spent_usd,
            tokens_in=outcome.tokens_in, tokens_out=outcome.tokens_out, latency_ms=latency, signals=signals,
        )
        return {
            "conversation_id": conversation_id, "evaluation_id": evaluation_id, "status": "ok",
            "score": totals["total"], "gross": totals["gross_violation"],
            "needs_review": outcome.needs_review, "cost_usd": outcome.cost_usd,
            "spent_usd": outcome.spent_usd, "latency_ms": latency,
        }
    except Exception as exc:  # Ошибка одного диалога не должна останавливать весь прогон.
        log.exception("Оценка %s не удалась", conversation_id)
        latency = int((time.monotonic() - started) * 1000)
        evaluation_id = repo.insert_evaluation(
            conversation=conversation, checklist=checklist, mode=mode, models=models or {},
            prompt_version=version, status="error", error=f"{type(exc).__name__}: {exc}"[:500],
            latency_ms=latency, signals=signals,
        )
        return {
            "conversation_id": conversation_id, "evaluation_id": evaluation_id, "status": "error",
            "error": str(exc)[:300], "score": None, "gross": False, "needs_review": False,
            "cost_usd": 0.0, "spent_usd": 0.0, "latency_ms": latency,
        }
