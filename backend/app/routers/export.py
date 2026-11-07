import csv
import io

from fastapi import APIRouter
from fastapi.responses import Response

from .. import export, repo

router = APIRouter()


def _build(set_name: str, group_id: str | None, checklist_id: str, version: int | None, allow_partial: bool):
    export.results_path(set_name)
    group = group_id or ("DEV" if set_name == "dev" else None)
    if not group:
        raise export.ExportError("Для набора prod укажите group_id")
    doc = export.build_results(group, checklist_id, version, allow_partial=allow_partial)
    problems = export.validate_results(doc, None if allow_partial else len(repo.group_conversation_ids(group)))
    if not problems:
        used = version or export.latest_exportable_version(checklist_id)
        problems = export.check_against_data(doc, repo.get_checklist(checklist_id, used))
    return doc, problems


@router.get("/export/results-json")
def preview_results(
    set: str = "dev", group_id: str | None = None, checklist_id: str = "freedom-default",
    version: int | None = None, allow_partial: bool = False,
):
    doc, problems = _build(set, group_id, checklist_id, version, allow_partial)
    return {"problems": problems, "document": doc}


@router.post("/export/results-json")
def write_results(
    set: str = "dev", group_id: str | None = None, checklist_id: str = "freedom-default",
    version: int | None = None,
):
    """Записывает файл для сдачи. Черновики и файлы с нарушениями не записываются."""
    doc, problems = _build(set, group_id, checklist_id, version, allow_partial=False)
    if problems:
        raise export.ExportError("Файл не прошёл проверку: " + "; ".join(problems[:5]))
    path = export.write_results(doc, export.results_path(set))
    return {"path": str(path), "records": len(doc["results"])}


@router.get("/export/results")
def export_results(
    format: str = "json", group_id: str = "DEV", checklist_id: str = "freedom-default",
    checklist_version: int | None = None,
):
    doc = export.build_results(group_id, checklist_id, checklist_version, allow_partial=True)
    if format != "csv":
        return doc
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    codes = list(export.REQUIRED_CRITERIA)
    writer.writerow(["conversation_id", "status", *codes, "final_score", "critical_flag", "model"])
    for entry in doc["results"]:
        values = {c["criterion_id"]: c["value"] for c in entry["criteria"]}
        score = entry["score"] or {}
        writer.writerow(
            [entry["conversation_id"], entry["status"], *[values.get(c, "") for c in codes],
             score.get("final_score", ""), score.get("critical_flag", ""), doc["model"]["name"]]
        )
    return Response(
        "﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="results.csv"'},
    )
