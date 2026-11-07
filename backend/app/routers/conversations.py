import json
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from .. import asr, audio, ingest, repo
from ..db import connect
from ..schemas import ImportRequest

router = APIRouter()


def _summary(conversation_id: str) -> dict[str, Any]:
    conversation = repo.get_conversation(conversation_id)
    evaluation_id = repo.latest_evaluation_id(conversation_id)
    view = repo.build_view(evaluation_id) if evaluation_id else None
    evaluation = None
    if view:
        final = view["final"]
        evaluation = {
            "id": view["id"], "status": view["status"], "error": view["error"],
            "checklist_id": view["checklist_id"], "checklist_version": view["checklist_version"],
            "checklist_name": view["checklist_name"], "needs_review": view["needs_review"],
            "cost_usd": view["cost_usd"], "created_at": view["created_at"],
        }
        if final:
            evaluation.update(
                total=view["original"]["total"], final_total=final["total"],
                gross_violation=final["gross_violation"], gross_reasons=view["gross_reasons"],
                criteria=[
                    {
                        "criterion_id": c["criterion_id"], "title": c["title"], "type": c["type"],
                        "answer": c["answer"], "agreement": c["agreement"], "source": c["source"],
                        "scale": c["scale"],
                    }
                    for c in final["criteria"]
                ],
            )
    appeal_states = [a["status"] for a in view["appeals"]] if view else []
    return {
        "id": conversation["id"], "channel": conversation["channel"], "language": conversation["language"],
        "operator": conversation["operator"], "started_at": conversation["started_at"],
        "n_turns": len(conversation["turns"]), "duration_sec": conversation["turns"][-1]["t_sec"],
        "status": repo.conversation_status(view), "evaluation": evaluation,
        "appeal_status": "open" if "open" in appeal_states else ("resolved" if appeal_states else None),
    }


@router.post("/datasets/import")
async def import_dataset(request: ImportRequest):
    count = await ingest.import_group(request.group_id)
    return {"group_id": request.group_id, "imported": count}


@router.get("/datasets")
def datasets():
    return repo.list_groups()


@router.post("/conversations/upload")
async def upload(file: UploadFile = File(...), group_id: str = ingest.UPLOAD_GROUP):
    try:
        payload = json.loads(await file.read())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(400, f"Файл не является JSON в UTF-8: {exc}") from exc
    records = ingest.parse_records(payload)
    return {"group_id": group_id, "imported": ingest.store_records(records, group_id),
            "conversation_ids": [r["conversation_id"] for r in records]}


@router.get("/conversations")
def list_conversations(
    language: str | None = None, channel: str | None = None, status: str | None = None,
    needs_review: bool | None = None, gross: bool | None = None, q: str | None = None,
    group_id: str | None = None, limit: int = Query(default=500, le=1000),
):
    ids = repo.group_conversation_ids(group_id) if group_id else repo.all_conversation_ids()
    items = []
    needle = (q or "").strip().lower()
    for conversation_id in ids:
        item = _summary(conversation_id)
        evaluation = item["evaluation"] or {}
        if language and item["language"] != language:
            continue
        if channel and item["channel"] != channel:
            continue
        if status and item["status"] != status:
            continue
        if needs_review is not None and bool(evaluation.get("needs_review")) != needs_review:
            continue
        if gross is not None and bool(evaluation.get("gross_violation")) != gross:
            continue
        if needle and needle not in _search_text(conversation_id, item):
            continue
        items.append(item)
    return {"total": len(items), "items": items[:limit]}


def _search_text(conversation_id: str, item: dict[str, Any]) -> str:
    turns = repo.get_conversation(conversation_id)["turns"]
    return " ".join([conversation_id, item["operator"] or ""] + [t["text"] for t in turns]).lower()


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    conversation = repo.get_conversation(conversation_id)
    evaluation_id = repo.latest_evaluation_id(conversation_id)
    has_audio = bool(conversation.pop("audio_url"))
    return {
        **conversation, "has_audio": has_audio,
        "evaluation": repo.build_view(evaluation_id) if evaluation_id else None,
        "evaluations": _history(conversation_id),
    }


def _history(conversation_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, checklist_id, checklist_version, status, total_score, created_at, mode "
            "FROM evaluations WHERE conversation_id=? ORDER BY id DESC",
            (conversation_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/conversations/{conversation_id}/audio")
async def get_audio(conversation_id: str):
    conversation = repo.get_conversation(conversation_id)
    try:
        path = await audio.ensure_audio(conversation_id, conversation["audio_url"])
    except audio.AudioError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(path, media_type="audio/mpeg", filename=f"{conversation_id}.mp3")


@router.get("/conversations/{conversation_id}/whisper")
def get_whisper(conversation_id: str):
    repo.get_conversation(conversation_id)
    return asr.status(conversation_id)


@router.post("/conversations/{conversation_id}/whisper", status_code=202)
async def start_whisper(conversation_id: str):
    conversation = repo.get_conversation(conversation_id)
    if not conversation["audio_url"]:
        raise HTTPException(400, "У этого диалога нет записи")
    try:
        return asr.start(conversation)
    except asr.AsrError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/conversations/{conversation_id}/audio-metrics")
async def get_audio_metrics(conversation_id: str):
    conversation = repo.get_conversation(conversation_id)
    return await audio.speech_metrics(conversation_id, conversation["audio_url"], conversation["turns"])
