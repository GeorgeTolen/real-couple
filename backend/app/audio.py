"""Аудио звонков: получение свежей ссылки, кеш mp3 и метрики речи."""
import asyncio
import html
import json
import re
import subprocess
from pathlib import Path
from typing import Any

import httpx

from .config import AUDIO_DIR, get_settings

_SOURCE_RE = re.compile(r"<source[^>]*\bsrc=[\"']([^\"']+)[\"']", re.IGNORECASE)
_SILENCE_RE = re.compile(r"silence_start: ([\d.]+)|silence_end: ([\d.]+) \| silence_duration: ([\d.]+)")
PAUSED = ("приостановлен", "paused")
RESUMED = ("возобновлен", "resumed")
TEMPO_NORM = (110, 170)
LONG_PAUSE_SEC = 3
INTERRUPTION_SEC = 1
_locks: dict[str, asyncio.Lock] = {}


class AudioError(RuntimeError):
    pass


def extract_source_url(page: str) -> str:
    match = _SOURCE_RE.search(page)
    if not match:
        raise AudioError("На странице плеера нет ссылки на запись")
    return html.unescape(match.group(1))


def audio_path(conversation_id: str) -> Path:
    return AUDIO_DIR / f"{conversation_id}.mp3"


async def _download(audio_url: str, target: Path) -> None:
    async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
        page = await client.get(audio_url)
        if page.status_code != 200:
            raise AudioError(f"Страница плеера ответила HTTP {page.status_code}")
        temp = target.with_suffix(".part")
        async with client.stream("GET", extract_source_url(page.text)) as stream:
            if stream.status_code != 200:
                raise AudioError(f"Хранилище записи ответило HTTP {stream.status_code}")
            with temp.open("wb") as handle:
                async for chunk in stream.aiter_bytes():
                    handle.write(chunk)
    if temp.stat().st_size < 1024:
        temp.unlink(missing_ok=True)
        raise AudioError("Запись оказалась пустой")
    temp.replace(target)


async def ensure_audio(conversation_id: str, audio_url: str | None) -> Path:
    """Ссылка на файл живёт около часа, поэтому при скачивании страница плеера читается заново."""
    if not audio_url:
        raise AudioError("У диалога нет записи")
    if not audio_url.lower().startswith("https://"):
        raise AudioError("Ссылка на запись должна быть https")
    target = audio_path(conversation_id)
    lock = _locks.setdefault(conversation_id, asyncio.Lock())
    async with lock:
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            await _download(audio_url, target)
    return target


def recording_gaps(turns: list[dict]) -> list[tuple[float, float]]:
    """Интервалы, когда запись была приостановлена: в mp3 их нет."""
    gaps, started = [], None
    for turn in turns:
        if turn["speaker"] != "system" or turn["t_sec"] is None:
            continue
        low = turn["text"].lower()
        if any(p in low for p in PAUSED):
            started = turn["t_sec"]
        elif any(r in low for r in RESUMED) and started is not None:
            gaps.append((started, turn["t_sec"]))
            started = None
    return gaps


def add_audio_time(turns: list[dict]) -> list[dict]:
    """Добавляет t_audio: положение реплики в записи с учётом пауз записи."""
    gaps = recording_gaps(turns)
    result = []
    for turn in turns:
        t_sec = turn["t_sec"]
        t_audio = None
        if t_sec is not None:
            skipped = sum(
                min(t_sec, end) - start for start, end in gaps if t_sec > start
            )
            t_audio = round(max(0.0, t_sec - skipped), 3)
        result.append({**turn, "t_audio": t_audio})
    return result


def transcript_metrics(turns: list[dict]) -> dict[str, Any]:
    """Оценка по меткам времени транскрипта. Длительность реплики: время до следующей реплики."""
    spoken = [t for t in turns if t["speaker"] in ("operator", "client") and t["t_sec"] is not None]
    operator_words = client_words = timed_words = 0
    operator_seconds = 0.0
    interruptions = 0
    long_pauses = 0
    for current, following in zip(spoken, spoken[1:] + [None]):
        words = len(current["text"].split())
        if current["speaker"] == "operator":
            operator_words += words
            if following is not None:
                gap = following["t_sec"] - current["t_sec"]
                # В темп идут только реплики с известной длительностью.
                if 0 < gap <= 60:
                    operator_seconds += gap
                    timed_words += words
        else:
            client_words += words
        if following is not None:
            gap = following["t_sec"] - current["t_sec"]
            if gap > LONG_PAUSE_SEC + words * 0.5:
                long_pauses += 1
            if (
                following["speaker"] != current["speaker"]
                and following["speaker"] == "operator"
                and 0 <= gap < INTERRUPTION_SEC
            ):
                interruptions += 1
    tempo = round(timed_words / operator_seconds * 60) if operator_seconds > 0 else None
    total_words = operator_words + client_words
    return {
        "tempo_wpm": tempo,
        "tempo_in_norm": TEMPO_NORM[0] <= tempo <= TEMPO_NORM[1] if tempo else None,
        "operator_words": operator_words,
        "operator_share_pct": round(operator_words / total_words * 100) if total_words else None,
        "long_pauses": long_pauses,
        "interruptions": interruptions,
    }


def _probe_duration(path: Path) -> float | None:
    done = subprocess.run(
        [get_settings().ffprobe_bin, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace",
    )
    try:
        return round(float(done.stdout.strip()), 1)
    except ValueError:
        return None


def _silences(path: Path) -> list[dict[str, float]]:
    done = subprocess.run(
        [get_settings().ffmpeg_bin, "-hide_banner", "-nostats", "-i", str(path),
         "-af", "silencedetect=noise=-35dB:d=1.5", "-f", "null", "-"],
        capture_output=True, text=True, timeout=180, encoding="utf-8", errors="replace",
    )
    result, start = [], None
    for match in _SILENCE_RE.finditer(done.stderr):
        if match.group(1):
            start = float(match.group(1))
        elif start is not None:
            result.append({"start": start, "duration": float(match.group(3))})
            start = None
    return result


def _describe(metrics: dict[str, Any]) -> str:
    parts = []
    if metrics.get("tempo_wpm"):
        state = "в норме" if metrics["tempo_in_norm"] else "вне нормы"
        parts.append(
            f"темп {metrics['tempo_wpm']} сл/мин, {state} ({TEMPO_NORM[0]}-{TEMPO_NORM[1]})"
        )
    if metrics.get("audio_pauses_over_3s") is not None:
        parts.append(f"паузы дольше 3 с по записи: {metrics['audio_pauses_over_3s']}")
    else:
        parts.append(f"долгие паузы по транскрипту: {metrics['long_pauses']}")
    parts.append(f"перебивания оператором: {metrics['interruptions']}")
    if metrics.get("operator_share_pct") is not None:
        parts.append(f"доля слов оператора {metrics['operator_share_pct']}%")
    parts.append("дикция и интонация не оцениваются")
    return "; ".join(parts) + "."


async def speech_metrics(conversation_id: str, audio_url: str | None, turns: list[dict]) -> dict[str, Any]:
    """Метрики по транскрипту есть всегда. Метрики по записи добавляются, когда запись доступна."""
    metrics = transcript_metrics(turns)
    metrics["audio_available"] = False
    cache = AUDIO_DIR / f"{conversation_id}.metrics.json"
    try:
        path = await ensure_audio(conversation_id, audio_url)
        if cache.exists():
            measured = json.loads(cache.read_text(encoding="utf-8"))
        else:
            duration = await asyncio.to_thread(_probe_duration, path)
            silences = await asyncio.to_thread(_silences, path)
            measured = {"duration_sec": duration, "silences": silences}
            cache.write_text(json.dumps(measured, ensure_ascii=False), encoding="utf-8")
        timed = add_audio_time(turns)
        operator_times = [t["t_audio"] for t in timed if t["speaker"] == "operator" and t["t_audio"] is not None]
        if operator_times:
            window = (operator_times[0], operator_times[-1])
            inner = [s for s in measured["silences"] if window[0] <= s["start"] <= window[1]]
        else:
            inner = []
        metrics.update(
            audio_available=True,
            duration_sec=measured["duration_sec"],
            audio_pauses_over_3s=sum(1 for s in inner if s["duration"] > LONG_PAUSE_SEC),
        )
    except (AudioError, OSError, subprocess.SubprocessError, httpx.HTTPError, ValueError) as exc:
        metrics["audio_error"] = str(exc)
    metrics["summary"] = _describe(metrics)
    return metrics
