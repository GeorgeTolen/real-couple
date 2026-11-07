"""Локальное распознавание записей звонков через faster-whisper.

Расшифровка организаторов остаётся основой оценки. Результат Whisper показывается рядом с ней.
Запись одноканальная, поэтому спикер берётся из транскрипта организаторов: слова Whisper
привязываются к репликам выравниванием текстов, нумерация реплик не меняется.

В записи звучит то, что организаторы скрыли масками, поэтому файлы лежат только в data/whisper.
"""
import asyncio
import difflib
import importlib.util
import json
import logging
import os
import re
import sys
import threading
import time
from pathlib import Path
from typing import Any

from . import audio
from .config import WHISPER_DIR, get_settings

log = logging.getLogger("cqa.asr")

LANGUAGES = {"RU": "ru", "KZ": "kk", "EN": "en"}
INITIAL_PROMPT = "Служба поддержки Freedom Broker, Фридом Брокер, Tradernet, брокерский счёт, поручение."
TIME_TOLERANCE_SEC = 0.5
_MASK = re.compile(r"\[[^\]]*\]")
_TOKEN = re.compile(r"[^\w]+", re.UNICODE)
_gpu_lock = threading.Lock()
_model = None
_model_device: str | None = None
_state: dict[str, dict[str, Any]] = {}
_tasks: set[asyncio.Task] = set()


class AsrError(RuntimeError):
    pass


def is_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def result_path(conversation_id: str) -> Path:
    return WHISPER_DIR / f"{conversation_id}.json"


def _add_cuda_paths() -> None:
    """На Windows библиотеки CUDA лежат в пакетах nvidia, их нужно добавить в поиск DLL."""
    if sys.platform != "win32":
        return
    site = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    for folder in (site / "cublas" / "bin", site / "cudnn" / "bin"):
        if folder.exists():
            os.add_dll_directory(str(folder))
            os.environ["PATH"] = f"{folder}{os.pathsep}{os.environ.get('PATH', '')}"


def _load_model():
    global _model, _model_device
    if _model is not None:
        return _model
    if not is_available():
        raise AsrError("Whisper не установлен: pip install -r backend/requirements-whisper.txt")
    _add_cuda_paths()
    from faster_whisper import WhisperModel

    settings = get_settings()
    attempts = (
        [("cuda", settings.whisper_compute_type), ("cpu", "int8")]
        if settings.whisper_device == "auto"
        else [(settings.whisper_device, settings.whisper_compute_type)]
    )
    last_error: Exception | None = None
    for device, compute_type in attempts:
        try:
            _model = WhisperModel(settings.whisper_model, device=device, compute_type=compute_type)
            _model_device = device
            log.info("Whisper %s загружен на %s (%s)", settings.whisper_model, device, compute_type)
            return _model
        except (RuntimeError, ValueError, OSError) as exc:
            last_error = exc
            log.warning("Whisper не запустился на %s: %s", device, exc)
    raise AsrError(f"Whisper не запустился: {last_error}")


def _collect_words(model, path: Path, language: str | None) -> tuple[list[dict[str, Any]], float]:
    segments, info = model.transcribe(
        str(path), language=language, word_timestamps=True, vad_filter=True,
        beam_size=5, initial_prompt=INITIAL_PROMPT, condition_on_previous_text=False,
    )
    words = [
        {"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)}
        for segment in segments
        for w in segment.words or []
    ]
    return words, float(info.duration)


def _transcribe(path: Path, language: str | None) -> tuple[list[dict[str, Any]], float]:
    global _model, _model_device
    with _gpu_lock:
        model = _load_model()
        try:
            return _collect_words(model, path, language)
        except RuntimeError as exc:
            # Библиотеки CUDA проверяются только при первом обращении к видеокарте.
            if _model_device != "cuda" or get_settings().whisper_device != "auto":
                raise AsrError(f"Whisper не смог распознать запись: {exc}") from exc
            log.warning("Whisper не сработал на видеокарте, перехожу на процессор: %s", exc)
            from faster_whisper import WhisperModel

            _model = WhisperModel(get_settings().whisper_model, device="cpu", compute_type="int8")
            _model_device = "cpu"
            return _collect_words(_model, path, language)


def _normalize(text: str) -> str:
    return _TOKEN.sub("", text.lower().replace("ё", "е"))


def align_words_to_turns(turns: list[dict], words: list[dict[str, Any]]) -> tuple[dict[int, str], float]:
    """Привязывает слова Whisper к репликам. Возвращает текст по номерам реплик и долю совпавших слов."""
    spoken = [
        t for t in turns
        if t["speaker"] in ("operator", "client", "bot") and not t.get("duplicate_of")
    ]
    tokens: list[str] = []
    owners: list[int] = []
    for turn in spoken:
        for piece in _MASK.sub(" ", turn["text"]).split():
            token = _normalize(piece)
            if token:
                tokens.append(token)
                owners.append(turn["n"])
    if not words or not spoken:
        return {}, 0.0
    heard = [_normalize(w["word"]) for w in words]
    owner_of: list[int | None] = [None] * len(words)
    matcher = difflib.SequenceMatcher(None, tokens, heard, autojunk=False)
    matched = 0
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            owner_of[block.b + offset] = owners[block.a + offset]
            matched += 1

    position = {t["n"]: i for i, t in enumerate(spoken)}
    resolved: list[int] = []
    for index, owner in enumerate(owner_of):
        if owner is not None:
            resolved.append(owner)
            continue
        previous = resolved[-1] if resolved else None
        following = next((o for o in owner_of[index + 1:] if o is not None), None)
        if previous is not None and previous == following:
            resolved.append(previous)
            continue
        # Слово не совпало ни с чем. Реплика могла быть искажена целиком, поэтому решает время.
        low = position[previous] if previous is not None else 0
        high = position[following] if following is not None else len(spoken) - 1
        choice = previous if previous is not None else spoken[low]["n"]
        for turn in spoken[low: high + 1]:
            begin = turn.get("t_audio")
            if begin is not None and words[index]["start"] >= begin - TIME_TOLERANCE_SEC:
                choice = turn["n"]
        resolved.append(choice)

    grouped: dict[int, list[str]] = {}
    for word, owner in zip(words, resolved):
        grouped.setdefault(owner, []).append(word["word"])
    text = {n: " ".join(parts) for n, parts in grouped.items()}
    return text, matched / len(words)


async def run_for_conversation(conversation: dict[str, Any]) -> dict[str, Any]:
    path = await audio.ensure_audio(conversation["id"], conversation["audio_url"])
    started = time.monotonic()
    language = LANGUAGES.get(conversation["language"])
    words, duration = await asyncio.to_thread(_transcribe, path, language)
    turns, ratio = align_words_to_turns(conversation["turns"], words)
    result = {
        "conversation_id": conversation["id"],
        "model": get_settings().whisper_model,
        "device": _model_device,
        "language": language,
        "duration_sec": duration,
        "processing_sec": round(time.monotonic() - started, 1),
        "match_ratio": round(ratio, 3),
        "turns": {str(n): text for n, text in turns.items()},
        "words": words,
    }
    target = result_path(conversation["id"])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def status(conversation_id: str) -> dict[str, Any]:
    state = _state.get(conversation_id, {})
    if state.get("status") == "running":
        return {"status": "running", "available": True}
    path = result_path(conversation_id)
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        data.pop("words", None)
        return {"status": "ready", "available": True, **data}
    if state.get("status") == "error":
        return {"status": "error", "available": is_available(), "error": state.get("error")}
    return {"status": "none", "available": is_available()}


def start(conversation: dict[str, Any]) -> dict[str, Any]:
    if not is_available():
        raise AsrError("Whisper не установлен: pip install -r backend/requirements-whisper.txt")
    conversation_id = conversation["id"]
    if _state.get(conversation_id, {}).get("status") == "running":
        return status(conversation_id)

    async def work() -> None:
        try:
            await run_for_conversation(conversation)
            _state[conversation_id] = {"status": "done"}
        except Exception as exc:  # Ошибка показывается пользователю в карточке звонка.
            log.exception("Whisper: %s", conversation_id)
            _state[conversation_id] = {"status": "error", "error": str(exc)[:300]}

    _state[conversation_id] = {"status": "running"}
    task = asyncio.create_task(work())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return status(conversation_id)
