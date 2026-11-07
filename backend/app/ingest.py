"""Импорт диалогов из API организаторов и из файла."""
import json
import re
from typing import Any

import httpx

from .config import get_settings
from .db import connect, now_iso
from .normalize import extract_operator_name, normalize_transcript, transcript_hash

_SAFE_ID = re.compile(r"^[\w.-]{1,128}$")
UPLOAD_GROUP = "UPLOAD"


class IngestError(ValueError):
    pass


def parse_records(payload: Any) -> list[dict[str, Any]]:
    """Принимает ответ API целиком, объект с records или массив записей."""
    if isinstance(payload, dict) and "data" in payload:
        if payload.get("isSuccess") is False:
            raise IngestError(f"API организаторов вернул ошибку: {payload.get('error')}")
        payload = payload["data"]
    if isinstance(payload, dict) and "records" in payload:
        payload = payload["records"]
    if isinstance(payload, dict) and "conversation_id" in payload:
        payload = [payload]
    if not isinstance(payload, list):
        raise IngestError("Ожидался массив записей или ответ API организаторов")
    for record in payload:
        if not isinstance(record, dict):
            raise IngestError("Каждая запись должна быть объектом")
        cid = str(record.get("conversation_id", ""))
        if not _SAFE_ID.match(cid):
            raise IngestError(f"Недопустимый conversation_id: {cid!r}")
        if not isinstance(record.get("transcript"), list) or not record["transcript"]:
            raise IngestError(f"{cid}: поле transcript должно быть непустым массивом")
    return payload


def store_records(records: list[dict[str, Any]], group_id: str) -> int:
    with connect() as conn:
        conn.execute("DELETE FROM group_members WHERE group_id=?", (group_id,))
        for position, record in enumerate(records):
            raw = record["transcript"]
            turns = normalize_transcript(raw)
            conn.execute(
                "INSERT INTO conversations"
                "(id,channel,language,audio_url,transcript_json,transcript_hash,operator_name,imported_at) "
                "VALUES(?,?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET channel=excluded.channel, language=excluded.language, "
                "audio_url=excluded.audio_url, transcript_json=excluded.transcript_json, "
                "transcript_hash=excluded.transcript_hash, operator_name=excluded.operator_name, "
                "imported_at=excluded.imported_at",
                (
                    record["conversation_id"],
                    record.get("channel", "agent chat"),
                    record.get("language", "RU"),
                    record.get("audio_url"),
                    json.dumps(raw, ensure_ascii=False),
                    transcript_hash(raw),
                    extract_operator_name(turns),
                    now_iso(),
                ),
            )
            conn.execute(
                "INSERT INTO group_members(group_id,conversation_id,position) VALUES(?,?,?)",
                (group_id, record["conversation_id"], position),
            )
    return len(records)


async def fetch_group(group_id: str) -> list[dict[str, Any]]:
    url = get_settings().organizer_api_url
    if not url:
        raise IngestError("ORGANIZER_API_URL не задан в .env")
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        response = await client.get(_with_group(url, group_id))
    if response.status_code != 200:
        raise IngestError(f"API организаторов ответил HTTP {response.status_code}")
    return parse_records(response.json())


def _with_group(url: str, group_id: str) -> str:
    if not _SAFE_ID.match(group_id):
        raise IngestError(f"Недопустимый group_id: {group_id!r}")
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}group_id={group_id}"


async def import_group(group_id: str) -> int:
    return store_records(await fetch_group(group_id), group_id)
