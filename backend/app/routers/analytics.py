"""Данные для карты диалогов, распределения баллов и замеров точности."""
import json
from statistics import median
from typing import Any

from fastapi import APIRouter

from .. import repo
from ..config import BENCH_DIR
from ..scoring import axis_scores
from .stats import _resolve_version

router = APIRouter()


def _final_views(
    checklist_id: str, version: int | None, group_id: str | None,
    channel: str | None = None, language: str | None = None,
) -> list[tuple[dict, dict]]:
    ids = repo.group_conversation_ids(group_id) if group_id else repo.all_conversation_ids()
    result = []
    for conversation_id in ids:
        conversation = repo.get_conversation(conversation_id)
        if (channel and conversation["channel"] != channel) or (language and conversation["language"] != language):
            continue
        evaluation_id = repo.latest_evaluation_id(conversation_id, checklist_id, version, only_ok=True)
        if evaluation_id:
            result.append((conversation, repo.build_view(evaluation_id)))
    return result


@router.get("/analytics/map")
def dialog_map(
    checklist_id: str = "freedom-default", version: int | None = None, group_id: str | None = None,
    channel: str | None = None, language: str | None = None,
):
    """Положение каждого диалога считается тем же кодом, что итог, с учётом решений проверяющих."""
    version = _resolve_version(checklist_id, version)
    checklist = repo.get_checklist(checklist_id, version) if version else None
    items = []
    for conversation, view in _final_views(checklist_id, version, group_id, channel, language) if version else []:
        answers = {c["criterion_id"]: c["answer"] for c in view["final"]["criteria"]}
        axes = axis_scores(checklist, answers, conversation["channel"])
        items.append(
            {
                "id": conversation["id"], "operator": conversation["operator"],
                "channel": conversation["channel"], "language": conversation["language"],
                "total": view["final"]["total"], "x": axes["resolution"], "y": axes["service"],
                "gross": view["final"]["gross_violation"], "needs_review": view["needs_review"],
            }
        )
    return {"checklist_id": checklist_id, "version": version, "items": items}


@router.get("/analytics/distribution")
def distribution(
    checklist_id: str = "freedom-default", version: int | None = None, group_id: str | None = None,
    channel: str | None = None, language: str | None = None,
):
    version = _resolve_version(checklist_id, version)
    rows = _final_views(checklist_id, version, group_id, channel, language) if version else []
    scores = [
        {"id": conversation["id"], "total": view["final"]["total"]}
        for conversation, view in rows
        if view["final"]["total"] is not None
    ]
    values = [row["total"] for row in scores]
    return {
        "checklist_id": checklist_id, "version": version, "n": len(values),
        "median": round(median(values), 2) if values else None, "scores": scores,
    }


def _read_measurement(path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    report = data.get("report", data)
    stability = report.get("stability") or {}
    return {
        "accuracy": report.get("accuracy"), "mae": report.get("mae"),
        "cost_per_dialog": report.get("cost_per_dialog"), "dialogs": report.get("dialogs"),
        "measured_at": report.get("measured_at"), "stability": stability.get("share"),
    }


@router.get("/analytics/benchmark")
def benchmark():
    """Только цифры из файлов замера. Нет файла, значит нет цифры."""
    modes = {
        mode: _read_measurement(BENCH_DIR / f"results_{mode}.json") for mode in ("ensemble", "single", "local")
    }
    return {"modes": modes, "holdout": _read_measurement(BENCH_DIR / "holdout" / "holdout_report.json")}
