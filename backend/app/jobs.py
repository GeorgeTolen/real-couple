"""Пакетная оценка с прогрессом и остановкой. Состояние хранится в таблице jobs."""
import asyncio
import json
from typing import Any, Callable

from . import evaluator, repo
from .config import get_settings
from .db import connect, now_iso

RECENT_LIMIT = 25
_tasks: set[asyncio.Task] = set()


def create_job(params: dict[str, Any], total: int) -> int:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO jobs(status,total,params_json,created_at) VALUES('queued',?,?,?)",
            (total, json.dumps(params, ensure_ascii=False), now_iso()),
        )
    return cursor.lastrowid


def get_job(job_id: int) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise repo.NotFound(f"Задача {job_id} не найдена")
    data = dict(row)
    data["params"] = json.loads(data.pop("params_json"))
    data["recent"] = json.loads(data.pop("recent_json"))
    data["cancel_requested"] = bool(data["cancel_requested"])
    return data


def list_jobs(limit: int = 10) -> list[dict[str, Any]]:
    with connect() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM jobs ORDER BY id DESC LIMIT ?", (limit,))]
    return [get_job(i) for i in ids]


def request_cancel(job_id: int) -> dict[str, Any]:
    with connect() as conn:
        conn.execute("UPDATE jobs SET cancel_requested=1 WHERE id=?", (job_id,))
    return get_job(job_id)


def _cancelled(job_id: int) -> bool:
    with connect() as conn:
        row = conn.execute("SELECT cancel_requested FROM jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["cancel_requested"])


def select_ids(ids: list[str], checklist_id: str, version: int, only_missing: bool) -> list[str]:
    """Диалоги без успешной оценки этой версии чек-листа на текущем транскрипте."""
    if not only_missing:
        return ids
    selected = []
    for conversation_id in ids:
        conversation = repo.get_conversation(conversation_id)
        if not repo.latest_evaluation_id(
            conversation_id, checklist_id, version, only_ok=True,
            transcript_hash=conversation["transcript_hash"],
        ):
            selected.append(conversation_id)
    return selected


async def run_job(
    job_id: int,
    conversation_ids: list[str],
    checklist_id: str,
    version: int | None,
    mode: str,
    models: dict[str, str] | None = None,
    use_cache: bool = True,
    on_result: Callable[[dict[str, Any]], None] | None = None,
    changed_only: bool = False,
) -> dict[str, Any]:
    checklist = repo.get_checklist(checklist_id, version)
    limiter = asyncio.Semaphore(max(1, get_settings().llm_concurrency))
    recent: list[dict[str, Any]] = []
    state = {"done": 0, "errors": 0, "in_progress": 0, "cost": 0.0}

    def save(status: str | None = None) -> None:
        with connect() as conn:
            conn.execute(
                "UPDATE jobs SET status=COALESCE(?,status), done=?, errors=?, in_progress=?, cost_usd=?, "
                "recent_json=?, finished_at=CASE WHEN ? IN ('finished','cancelled','failed') THEN ? "
                "ELSE finished_at END WHERE id=?",
                (status, state["done"], state["errors"], state["in_progress"], state["cost"],
                 json.dumps(recent, ensure_ascii=False), status, now_iso(), job_id),
            )

    async def one(conversation_id: str) -> None:
        async with limiter:
            if _cancelled(job_id):
                return
            state["in_progress"] += 1
            save()
            result = await evaluator.evaluate_conversation(
                conversation_id, checklist, mode, models, use_cache, changed_only
            )
            state["in_progress"] -= 1
            state["done"] += 1
            state["errors"] += 1 if result["status"] == "error" else 0
            state["cost"] += result["spent_usd"]
            conversation = repo.get_conversation(conversation_id)
            recent.insert(
                0,
                {
                    **result, "operator": conversation["operator"],
                    "channel": conversation["channel"], "language": conversation["language"],
                },
            )
            del recent[RECENT_LIMIT:]
            save()
            if on_result:
                on_result(result)

    save("running")
    try:
        await asyncio.gather(*(one(cid) for cid in conversation_ids))
    except Exception:
        save("failed")
        raise
    save("cancelled" if _cancelled(job_id) else "finished")
    return get_job(job_id)


def start_background(job_id: int, *args, **kwargs) -> None:
    task = asyncio.create_task(run_job(job_id, *args, **kwargs))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
