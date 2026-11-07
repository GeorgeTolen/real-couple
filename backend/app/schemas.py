"""Модели чек-листа и запросов API."""
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,39}$")


class ScaleStep(BaseModel):
    value: int
    label: str = ""


class Section(BaseModel):
    id: str
    title: str


class ReviewRule(BaseModel):
    """Если какой-то судья ответил when_answer на when_criterion, ответ N по dispute идёт арбитру."""

    when_criterion: str
    when_answer: str
    dispute: str


class Criterion(BaseModel):
    id: str
    section: str
    title: str
    type: Literal["binary", "scale", "flag"]
    allow_na: bool = False
    weight: float = 0
    description: str = ""
    na_condition: str | None = None
    scale: list[ScaleStep] | None = None
    channels: list[str] | None = None
    channel_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)
    guidance: str | None = None
    export_id: str | None = None
    categories: list[str] | None = None
    evidence_required_on_no: bool = False

    @model_validator(mode="after")
    def _check(self):
        if not ID_RE.match(self.id):
            raise ValueError(f"Недопустимый id критерия: {self.id!r}")
        if self.categories and self.type != "flag":
            raise ValueError(f"Критерий {self.id}: типы нарушений задаются только у флага")
        if self.weight < 0:
            raise ValueError(f"Критерий {self.id}: вес не может быть отрицательным")
        if self.type == "scale":
            steps = self.scale or []
            values = [s.value for s in steps]
            if len(steps) < 2:
                raise ValueError(f"Критерий {self.id}: у шкалы должно быть минимум две ступени")
            if len(set(values)) != len(values):
                raise ValueError(f"Критерий {self.id}: ступени шкалы повторяются")
            if max(values) <= 0 or min(values) < 0:
                raise ValueError(f"Критерий {self.id}: ступени должны быть >= 0, максимальная > 0")
        if self.type == "flag":
            if self.weight != 0:
                raise ValueError(f"Критерий {self.id}: у флага вес должен быть 0")
            if self.allow_na:
                raise ValueError(f"Критерий {self.id}: у флага нет варианта N/A")
        return self


class Checklist(BaseModel):
    id: str
    version: int = 1
    name: str
    sections: list[Section]
    criteria: list[Criterion]
    general_rules: list[str] = Field(default_factory=list)
    channel_notes: dict[str, str] = Field(default_factory=dict)
    review_rules: list[ReviewRule] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self):
        if not ID_RE.match(self.id):
            raise ValueError(f"Недопустимый id чек-листа: {self.id!r}")
        if not self.criteria:
            raise ValueError("В чек-листе должен быть хотя бы один критерий")
        ids = [c.id for c in self.criteria]
        if len(set(ids)) != len(ids):
            raise ValueError("Идентификаторы критериев должны быть уникальными")
        section_ids = {s.id for s in self.sections}
        if len(section_ids) != len(self.sections):
            raise ValueError("Идентификаторы секций должны быть уникальными")
        for crit in self.criteria:
            if crit.section not in section_ids:
                raise ValueError(f"Критерий {crit.id}: неизвестная секция {crit.section!r}")
        exports = [c.export_id for c in self.criteria if c.export_id]
        if len(set(exports)) != len(exports):
            raise ValueError("export_id критериев должны быть уникальными")
        return self

    def criterion(self, criterion_id: str) -> Criterion | None:
        return next((c for c in self.criteria if c.id == criterion_id), None)


class ImportRequest(BaseModel):
    group_id: str = "DEV"


class RunRequest(BaseModel):
    conversation_ids: list[str] | Literal["all"] = "all"
    group_id: str | None = None
    checklist_id: str = "freedom-default"
    version: int | None = None
    mode: Literal["single", "ensemble", "local"] = "ensemble"
    models: dict[str, str] | None = None
    only_missing: bool = False
    force: bool = False
    changed_only: bool = False


class CriterionPatch(BaseModel):
    """Частичная правка критерия: передаются только изменённые поля."""

    title: str | None = None
    section: str | None = None
    type: Literal["binary", "scale", "flag"] | None = None
    allow_na: bool | None = None
    weight: float | None = None
    description: str | None = None
    na_condition: str | None = None
    scale: list[ScaleStep] | None = None
    channels: list[str] | None = None
    guidance: str | None = None
    export_id: str | None = None


class AppealRequest(BaseModel):
    criterion_id: str
    comment: str = Field(min_length=1, max_length=2000)
    author: str = Field(min_length=1, max_length=100)


class DecisionRequest(BaseModel):
    reviewer: str = Field(min_length=1, max_length=100)
    action: Literal["confirm", "change"]
    new_answer: str | None = None
    reason: str = Field(min_length=1, max_length=2000)
