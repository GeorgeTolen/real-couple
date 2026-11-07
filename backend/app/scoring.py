"""Расчёт баллов: чистые функции без ввода-вывода. Модель выбирает ответ, баллы считает код."""
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from .schemas import Checklist, Criterion

ROUNDING_MODE = ROUND_HALF_UP
_TWO_PLACES = Decimal("0.01")
NA = "NA"


class ScoringError(ValueError):
    """Ответ не соответствует конфигурации критерия."""


def round2(value: Decimal) -> float:
    return float(value.quantize(_TWO_PLACES, rounding=ROUNDING_MODE))


def effective_criterion(criterion: Criterion, channel: str | None) -> Criterion:
    """Критерий с учётом формулировки для канала."""
    override = criterion.channel_overrides.get(channel or "")
    if not override:
        return criterion
    data = criterion.model_dump()
    data.update(override)
    return Criterion.model_validate(data)


def applies_to_channel(criterion: Criterion, channel: str | None) -> bool:
    return not criterion.channels or channel is None or channel in criterion.channels


def criteria_for_channel(checklist: Checklist, channel: str | None) -> list[Criterion]:
    return [
        effective_criterion(c, channel)
        for c in checklist.criteria
        if applies_to_channel(c, channel)
    ]


def allowed_answers(criterion: Criterion) -> list[str]:
    if criterion.type == "scale":
        values = sorted((s.value for s in criterion.scale or []), reverse=True)
        answers = [str(v) for v in values]
    else:
        answers = ["Y", "N"]
    if criterion.allow_na:
        answers.append(NA)
    return answers


def criterion_fraction(criterion: Criterion, answer: str) -> Decimal | None:
    """Доля веса: 1 и 0 для Да/Нет, value/max для шкалы, None для N/A и флага."""
    if answer not in allowed_answers(criterion):
        raise ScoringError(f"Критерий {criterion.id}: недопустимый ответ {answer!r}")
    if criterion.type == "flag" or answer == NA:
        return None
    if criterion.type == "binary":
        return Decimal(1) if answer == "Y" else Decimal(0)
    top = max(s.value for s in criterion.scale or [])
    return Decimal(answer) / Decimal(top)


def _aggregate(rows: list[tuple[Decimal, Decimal]]) -> tuple[Decimal, Decimal]:
    return sum((w * f for w, f in rows), Decimal(0)), sum((w for w, _ in rows), Decimal(0))


def compute_totals(
    checklist: Checklist, answers: dict[str, str], channel: str | None = None
) -> dict[str, Any]:
    criteria = criteria_for_channel(checklist, channel)
    fractions: dict[str, Decimal | None] = {}
    for crit in criteria:
        if crit.id not in answers:
            raise ScoringError(f"Нет ответа по критерию {crit.id}")
        fractions[crit.id] = criterion_fraction(crit, answers[crit.id])

    applied = [
        (Decimal(str(c.weight)), fractions[c.id])
        for c in criteria
        if fractions[c.id] is not None and c.weight > 0
    ]
    earned_sum, weight_sum = _aggregate(applied)
    total = round2(earned_sum / weight_sum * 100) if weight_sum > 0 else None

    per_criterion = []
    for crit in criteria:
        fraction = fractions[crit.id]
        weight = Decimal(str(crit.weight))
        scored = fraction is not None and crit.weight > 0
        normalized = weight / weight_sum * 100 if scored and weight_sum > 0 else None
        per_criterion.append(
            {
                "criterion_id": crit.id,
                "answer": answers[crit.id],
                "applicable": fraction is not None,
                "weight": float(crit.weight),
                "normalized_weight": round2(normalized) if normalized is not None else None,
                "max_points": round2(normalized) if normalized is not None else None,
                "earned_points": round2(normalized * fraction) if normalized is not None else None,
                "weighted_points": round2(weight * fraction) if scored else None,
            }
        )

    sections = []
    for section in checklist.sections:
        rows = [
            (Decimal(str(c.weight)), fractions[c.id])
            for c in criteria
            if c.section == section.id and fractions[c.id] is not None and c.weight > 0
        ]
        earned, weight = _aggregate(rows)
        sections.append(
            {
                "id": section.id,
                "title": section.title,
                "score": round2(earned / weight * 100) if weight > 0 else None,
                "earned": round2(earned),
                "max": round2(weight),
            }
        )

    gross_items = [c.id for c in criteria if c.type == "flag" and answers[c.id] == "Y"]
    return {
        "total": total,
        "sections": sections,
        "per_criterion": per_criterion,
        "gross_violation": bool(gross_items),
        "gross_items": gross_items,
    }
