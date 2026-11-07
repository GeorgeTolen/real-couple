"""Нормализация транскрипта. Исходные метки времени сохраняются без изменений."""
import hashlib
import json
import re
from datetime import datetime
from typing import Any

HIDDEN_NAME = "[Имя скрыто]"
_NAME = r"([A-ZА-ЯЁӘҒҚҢӨҰҮҺІ][a-zа-яёәғқңөұүһі]+)"
_NAME_PATTERNS = [
    re.compile(r"меня зовут\s+" + _NAME),
    re.compile(r"(?:^|[\s,.!])я\s*[,:-]?\s*" + _NAME),
    re.compile(r"\b[Мм]ен\s+" + _NAME),
    re.compile(r"\bАтым\s+" + _NAME),
    re.compile(r"[Mm]y name is\s+" + _NAME),
    re.compile(r"\bI['’]m\s+" + _NAME),
    re.compile(r"\bI am\s+" + _NAME),
    re.compile(r"\b[Tt]his is\s+" + _NAME),
]
_KZ_SUFFIX = re.compile(r"(мын|мін|пын|пін)$")


def parse_timestamp(value: str) -> tuple[str, float] | None:
    """Возвращает вид метки и число секунд: clock для MM:SS, iso для ISO 8601."""
    text = (value or "").strip()
    if re.fullmatch(r"\d{1,3}:\d{2}(:\d{2})?", text):
        seconds = 0
        for part in text.split(":"):
            seconds = seconds * 60 + int(part)
        return "clock", float(seconds)
    try:
        return "iso", datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def normalize_transcript(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    parsed = [parse_timestamp(str(t.get("timestamp", ""))) for t in raw]
    iso_start = next((p[1] for p in parsed if p and p[0] == "iso"), None)
    turns = []
    for idx, (turn, stamp) in enumerate(zip(raw, parsed)):
        t_sec = None
        if stamp:
            t_sec = stamp[1] - iso_start if stamp[0] == "iso" else stamp[1]
        turns.append(
            {
                "idx": idx,
                "n": idx + 1,
                "speaker": turn.get("speaker", ""),
                "timestamp": turn.get("timestamp", ""),
                "t_sec": round(t_sec, 3) if t_sec is not None else None,
                "text": turn.get("text", ""),
            }
        )
    return turns


def transcript_hash(raw: list[dict[str, Any]]) -> str:
    payload = json.dumps(raw, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def format_clock(t_sec: float | None) -> str:
    if t_sec is None:
        return "--:--"
    total = int(t_sec)
    return f"{total // 60:02d}:{total % 60:02d}"


def render_for_prompt(conversation_id: str, channel: str, language: str, turns: list[dict]) -> str:
    """Номер [#N] считается с 1 по исходному массиву: так же в карточке и в results.json."""
    lines = [f"conversation_id: {conversation_id} | канал: {channel} | язык: {language}"]
    for turn in turns:
        lines.append(
            f"[#{turn['n']}] {format_clock(turn['t_sec'])} {turn['speaker']}: {turn['text']}"
        )
    return "\n".join(lines)


def extract_operator_name(turns: list[dict]) -> str | None:
    """Имя оператора из его реплик для карточки. В оценке не используется."""
    for turn in turns:
        if turn["speaker"] != "operator":
            continue
        text = turn["text"]
        if HIDDEN_NAME in text:
            return None
        for pattern in _NAME_PATTERNS:
            match = pattern.search(text)
            if match:
                return _KZ_SUFFIX.sub("", match.group(1))
    return None
