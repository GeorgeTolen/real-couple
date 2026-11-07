import json
import time
from pathlib import Path

import httpx
from fastapi import APIRouter

from ..config import BENCH_DIR, OPENROUTER_BASE_URL, get_settings

router = APIRouter()
_CACHE_SEC = 300
_cache: dict = {"at": 0.0, "cloud": None, "local": None}

LABELS = {
    "ensemble": "Ансамбль: две модели и арбитр",
    "single": "Одна модель",
    "local": "Локальная модель",
}


def _read_report(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data.get("report", data)


def measurement(path: Path) -> dict:
    """Цифры только из файла замера. Нет файла, значит нет цифры."""
    report = _read_report(path) or {}
    return {
        "accuracy": report.get("accuracy"),
        "cost_per_dialog": report.get("cost_per_dialog"),
        "dialogs": report.get("dialogs"),
        "measured_at": report.get("measured_at"),
    }


def mode_info(mode: str) -> dict:
    info = {"label": LABELS[mode], **measurement(BENCH_DIR / f"results_{mode}.json")}
    if mode == "ensemble":
        info["holdout"] = measurement(BENCH_DIR / "holdout" / "holdout_report.json")
    return info


async def _fetch_ids(base_url: str) -> set[str] | None:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(f"{base_url.rstrip('/')}/models")
        response.raise_for_status()
        return {m["id"] for m in response.json().get("data", [])}
    except (httpx.HTTPError, ValueError, KeyError):
        return None


@router.get("/models")
async def models():
    settings = get_settings()
    if time.monotonic() - _cache["at"] > _CACHE_SEC:
        _cache.update(
            at=time.monotonic(),
            cloud=await _fetch_ids(OPENROUTER_BASE_URL),
            local=await _fetch_ids(settings.local_base_url),
        )
    cloud, local = _cache["cloud"], _cache["local"]

    def state(model: str, known: set[str] | None) -> dict:
        return {"model": model, "available": None if known is None else model in known}

    return {
        "judge_a": state(settings.judge_a, cloud),
        "judge_b": state(settings.judge_b, cloud),
        "arbiter": state(settings.arbiter, cloud),
        "local": state(settings.local_model, local) if settings.local_model else
                 {"model": None, "available": False},
        "local_server_up": local is not None,
        "api_key_configured": bool(settings.openrouter_api_key),
        "modes": {mode: mode_info(mode) for mode in LABELS},
    }
