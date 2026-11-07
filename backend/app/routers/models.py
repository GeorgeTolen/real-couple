import time

import httpx
from fastapi import APIRouter

from ..config import OPENROUTER_BASE_URL, get_settings

router = APIRouter()
_CACHE_SEC = 300
_cache: dict = {"at": 0.0, "cloud": None, "local": None}

# Замеры бенчмарка на 12 диалогах DEV, docs/stage2-model-selection.md.
BENCH = {
    "ensemble": {"label": "Ансамбль: две модели и арбитр", "cost_per_dialog": 0.019, "accuracy": None},
    "single": {"label": "Одна модель", "cost_per_dialog": 0.0089, "accuracy": 97.3},
    "local": {"label": "Локальная модель", "cost_per_dialog": 0.0, "accuracy": 91.1},
}


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
        "modes": BENCH,
    }
