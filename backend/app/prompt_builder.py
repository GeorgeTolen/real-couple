"""Чек-лист и канал превращаются в системный промпт и JSON Schema. Код не знает конкретных критериев."""
import hashlib
import json
from typing import Any

from .normalize import render_for_prompt
from .schemas import Checklist, Criterion
from .scoring import allowed_answers, criteria_for_channel
from .signals import signals_to_text

NO_CATEGORY = "нет"

BASE_RULES = """Ты эксперт отдела контроля качества (QA) Freedom Broker. Оцениваешь работу оператора поддержки строго по чек-листу.

Правила:
- Оценивается только оператор (speaker = operator). Реплики client, bot и system служат контекстом.
- Диалоги бывают на русском, казахском и английском. Правила одинаковы для всех языков. Пиши reasoning на русском.
- Опирайся только на транскрипт. Не додумывай факты. Блок «Факты, посчитанные системой» это подсказка, а не вердикт.
- Реплики пронумерованы как [#N]. Ссылайся на эти номера.
- Для каждого критерия заполняй поля строго по порядку: evidence_ids, checked_range, reasoning, answer. Сначала доказательства и рассуждение, потом ответ.
- evidence_ids: номера реплик, подтверждающих вывод.
- checked_range: если действие пропущено, укажи [первый, последний] номер проверенного участка разговора. В остальных случаях оставь пустой массив.
- reasoning: не больше трёх коротких предложений. При N/A назови причину неприменимости.
- answer: Y значит Да, N значит Нет, NA значит N/A. Для шкалы выбери ровно одну ступень.
- Если для шкалы ставишь не максимальную ступень, в reasoning назови конкретный сбой с номером реплики в виде #N. Если такого сбоя нет, ставь максимальную ступень."""


def _criterion_block(criterion: Criterion) -> str:
    lines = [f"### {criterion.id}. {criterion.title}"]
    if criterion.type == "binary":
        lines.append("Тип ответа: Да/Нет" + "/N/A" if criterion.allow_na else "Тип ответа: Да/Нет")
    elif criterion.type == "flag":
        lines.append("Тип ответа: Да/Нет. Флаг без баллов.")
    else:
        lines.append("Тип ответа: шкала" + " или N/A" if criterion.allow_na else "Тип ответа: шкала")
    if criterion.description:
        lines.append(criterion.description)
    for step in sorted(criterion.scale or [], key=lambda s: s.value, reverse=True):
        lines.append(f"- {step.value}: {step.label}")
    if criterion.allow_na and criterion.na_condition:
        lines.append(f"N/A: {criterion.na_condition}")
    if criterion.categories:
        lines.append(
            "Поле category: при ответе Y укажи тип нарушения из списка: "
            + ", ".join(criterion.categories)
            + f". При ответе N укажи {NO_CATEGORY}."
        )
    if criterion.guidance:
        lines.append(f"Подсказка: {criterion.guidance}")
    lines.append("Допустимые значения answer: " + ", ".join(allowed_answers(criterion)))
    return "\n".join(lines)


def build_system_prompt(
    checklist: Checklist, channel: str | None, only: list[str] | None = None
) -> str:
    parts = [BASE_RULES]
    note = checklist.channel_notes.get(channel or "")
    if note:
        parts.append(f"Особенности канала: {note}")
    if checklist.general_rules:
        parts.append("Общие правила чек-листа:\n" + "\n".join(f"- {r}" for r in checklist.general_rules))
    blocks = [
        _criterion_block(c)
        for c in criteria_for_channel(checklist, channel)
        if only is None or c.id in only
    ]
    parts.append("Критерии:\n\n" + "\n\n".join(blocks))
    return "\n\n".join(parts)


def _criterion_schema(criterion: Criterion) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "evidence_ids": {"type": "array", "items": {"type": "integer"}},
        "checked_range": {"type": "array", "items": {"type": "integer"}},
        "reasoning": {"type": "string"},
    }
    if criterion.categories:
        properties["category"] = {"type": "string", "enum": [*criterion.categories, NO_CATEGORY]}
    properties["answer"] = {"type": "string", "enum": allowed_answers(criterion)}
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def build_schema(
    checklist: Checklist, channel: str | None, only: list[str] | None = None
) -> dict[str, Any]:
    criteria = [
        c for c in criteria_for_channel(checklist, channel) if only is None or c.id in only
    ]
    return {
        "type": "object",
        "additionalProperties": False,
        "required": [c.id for c in criteria],
        "properties": {c.id: _criterion_schema(c) for c in criteria},
    }


def prompt_version(checklist: Checklist, channel: str | None) -> str:
    payload = build_system_prompt(checklist, channel) + json.dumps(
        build_schema(checklist, channel), ensure_ascii=False, sort_keys=True
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def build_user_prompt(
    conversation_id: str, channel: str, language: str, turns: list[dict], signals: dict[str, Any]
) -> str:
    transcript = render_for_prompt(conversation_id, channel, language, turns)
    return (
        f"Оцени диалог:\n\n{transcript}\n\n"
        f"Факты, посчитанные системой:\n{signals_to_text(signals)}"
    )


def build_arbiter_prompt(user_prompt: str, disputes: dict[str, dict[str, dict[str, Any]]]) -> str:
    """disputes: критерий, затем модель, затем её ответ с доказательствами."""
    lines = [
        user_prompt,
        "",
        "Судьи разошлись во мнениях. Ты арбитр: проверь транскрипт сам и вынеси своё решение "
        "только по перечисленным критериям. Мнения судей могут быть ошибочными. "
        "Для шкалы выбери ступень, назвав конкретный сбой с номером реплики #N. "
        "Если конкретного сбоя нет, выбери максимальную ступень.",
    ]
    for criterion_id, opinions in disputes.items():
        lines.append(f"\nКритерий {criterion_id}:")
        for label, opinion in opinions.items():
            evidence = ", ".join(f"#{n}" for n in opinion.get("evidence_ids", [])) or "нет"
            lines.append(
                f"- {label}: ответ {opinion.get('answer')}; доказательства {evidence}; "
                f"рассуждение: {opinion.get('reasoning', '')}"
            )
    return "\n".join(lines)
