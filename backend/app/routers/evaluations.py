from fastapi import APIRouter, HTTPException

from .. import jobs, repo
from ..db import connect
from ..schemas import AppealRequest, RunRequest

router = APIRouter()


@router.post("/evaluations/run", status_code=202)
async def run_evaluation(request: RunRequest):
    checklist = repo.get_checklist(request.checklist_id, request.version)
    if request.conversation_ids == "all":
        ids = (
            repo.group_conversation_ids(request.group_id)
            if request.group_id
            else repo.all_conversation_ids()
        )
    else:
        ids = list(request.conversation_ids)
        for conversation_id in ids:
            repo.get_conversation(conversation_id)
    ids = jobs.select_ids(ids, checklist.id, checklist.version, request.only_missing)
    if not ids:
        raise HTTPException(400, "Нет диалогов для оценки")
    params = {
        "checklist_id": checklist.id, "version": checklist.version, "mode": request.mode,
        "models": request.models, "group_id": request.group_id, "source": "api",
    }
    job_id = jobs.create_job(params, len(ids))
    jobs.start_background(
        job_id, ids, checklist.id, checklist.version, request.mode, request.models,
        force=request.force, changed_only=request.changed_only,
    )
    return {"job_id": job_id, "total": len(ids)}


@router.get("/evaluations")
def list_evaluations(
    conversation_id: str | None = None, checklist_id: str | None = None,
    checklist_version: int | None = None, limit: int = 200,
):
    sql = (
        "SELECT id, conversation_id, checklist_id, checklist_version, mode, status, error, total_score, "
        "gross_violation, needs_review, cost_usd, latency_ms, created_at FROM evaluations WHERE 1=1"
    )
    args: list = []
    for clause, value in (
        (" AND conversation_id=?", conversation_id),
        (" AND checklist_id=?", checklist_id),
        (" AND checklist_version=?", checklist_version),
    ):
        if value is not None:
            sql += clause
            args.append(value)
    with connect() as conn:
        rows = conn.execute(sql + " ORDER BY id DESC LIMIT ?", [*args, limit]).fetchall()
    return [dict(r) for r in rows]


@router.get("/evaluations/{evaluation_id}")
def get_evaluation(evaluation_id: int):
    return repo.build_view(evaluation_id)


@router.get("/evaluations/{evaluation_id}/diff")
def diff(evaluation_id: int, against: int | None = None):
    return repo.diff_evaluations(evaluation_id, against)


@router.get("/evaluations/{evaluation_id}/preview")
def preview(evaluation_id: int, criterion: str, answer: str):
    """Пересчёт итога на сервере, чтобы формула была в одном месте."""
    return repo.preview_change(evaluation_id, criterion, answer)


@router.post("/evaluations/{evaluation_id}/appeals", status_code=201)
def create_appeal(evaluation_id: int, request: AppealRequest):
    return repo.create_appeal(evaluation_id, request.criterion_id, request.comment, request.author)
