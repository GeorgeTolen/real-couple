"""Единый клиент OpenAI-совместимых провайдеров: повторы, кеш, учёт токенов и стоимости."""
import asyncio
import hashlib
import json
import logging
import time
import weakref
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

from .config import OPENROUTER_BASE_URL, get_settings
from .db import connect, now_iso

log = logging.getLogger("cqa.llm")

TIMEOUT_SEC = 180
MAX_ATTEMPTS = 4
MAX_REPAIRS = 2
RETRY_STATUS = {402, 408, 409, 425, 429, 500, 502, 503, 504, 529}
REASONING_EFFORT = "medium"

_semaphores: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = (
    weakref.WeakKeyDictionary()
)


class LLMError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    api_key: str = ""

    @property
    def is_openrouter(self) -> bool:
        return "openrouter.ai" in self.base_url


@dataclass
class LLMResult:
    data: dict[str, Any]
    model: str
    cost_usd: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    cached: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


def cloud_provider() -> Provider:
    return Provider("openrouter", OPENROUTER_BASE_URL, get_settings().openrouter_api_key)


def local_provider() -> Provider:
    return Provider("local", get_settings().local_base_url, "local")


def _semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    semaphore = _semaphores.get(loop)
    if semaphore is None:
        semaphore = asyncio.Semaphore(max(1, get_settings().llm_concurrency))
        _semaphores[loop] = semaphore
    return semaphore


def cache_key(model: str, system: str, user: str, schema: dict[str, Any]) -> str:
    """Ключ охватывает весь запрос: правка сигналов или подсказок сама сбрасывает кеш."""
    payload = json.dumps(
        {"model": model, "system": system, "user": user, "schema": schema},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> tuple[dict, dict] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT response_json, usage_json FROM llm_cache WHERE key=?", (key,)
        ).fetchone()
    return (json.loads(row["response_json"]), json.loads(row["usage_json"])) if row else None


def _cache_put(key: str, model: str, data: dict, usage: dict) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO llm_cache(key,model,response_json,usage_json,created_at) "
            "VALUES(?,?,?,?,?)",
            (key, model, json.dumps(data, ensure_ascii=False), json.dumps(usage), now_iso()),
        )


def parse_json_content(content: Any) -> dict[str, Any]:
    """Снимает обёртку ```json и лишний текст вокруг объекта."""
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Модель вернула пустой ответ")
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text.strip("`")
        text = text.rsplit("```", 1)[0]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("В ответе модели нет JSON-объекта") from None
        data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("Ответ модели должен быть JSON-объектом")
    return data


def _body(
    provider: Provider,
    model: str,
    messages: list[dict[str, str]],
    schema: dict[str, Any],
    json_mode: bool,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "max_tokens": 16000,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    else:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "qa_eval", "strict": True, "schema": schema},
        }
    if provider.is_openrouter:
        body["usage"] = {"include": True}
        body["reasoning"] = {"effort": REASONING_EFFORT}
    return body


def _headers(provider: Provider) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"
    if provider.is_openrouter:
        headers["HTTP-Referer"] = "https://github.com/GeorgeTolen/real-couple"
        headers["X-Title"] = "CQA hackathon"
    return headers


async def _post(client: httpx.AsyncClient, provider: Provider, body: dict[str, Any]) -> httpx.Response:
    async with _semaphore():
        return await client.post(
            f"{provider.base_url.rstrip('/')}/chat/completions",
            json=body,
            headers=_headers(provider),
        )


async def chat_json(
    *,
    provider: Provider,
    model: str,
    system: str,
    user: str,
    schema: dict[str, Any],
    validator: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    use_cache: bool = True,
) -> LLMResult:
    """Возвращает проверенный JSON-ответ. Ошибка содержания возвращается модели для исправления."""
    if provider.is_openrouter and not provider.api_key:
        raise LLMError("OPENROUTER_API_KEY не задан в .env")

    key = cache_key(model, system, user, schema)
    if use_cache:
        hit = _cache_get(key)
        if hit:
            data, usage = hit
            checked = validator(data) if validator else data
            return LLMResult(
                data=checked,
                model=model,
                cost_usd=float(usage.get("cost") or 0),
                tokens_in=int(usage.get("prompt_tokens") or 0),
                tokens_out=int(usage.get("completion_tokens") or 0),
                latency_ms=0,
                cached=True,
                raw=data,
            )

    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    json_mode = False
    repairs = 0
    last_error = "нет ответа"
    cost, tokens_in, tokens_out = 0.0, 0, 0
    started = time.monotonic()

    async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
        attempt = 0
        while attempt < MAX_ATTEMPTS:
            attempt += 1
            try:
                response = await _post(
                    client, provider, _body(provider, model, messages, schema, json_mode)
                )
            except httpx.HTTPError as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                await asyncio.sleep(2**attempt)
                continue

            if response.status_code in RETRY_STATUS:
                last_error = f"HTTP {response.status_code}: {response.text[:200]}"
                log.warning("%s: %s, попытка %d", model, last_error, attempt)
                await asyncio.sleep(2**attempt)
                continue
            if response.status_code == 400 and not json_mode and not provider.is_openrouter:
                # Локальный сервер не поддерживает json_schema: схема передаётся текстом.
                json_mode = True
                attempt -= 1
                messages[0]["content"] = (
                    f"{system}\n\nВерни только JSON-объект по этой схеме:\n"
                    f"{json.dumps(schema, ensure_ascii=False)}"
                )
                continue
            if response.status_code != 200:
                raise LLMError(f"{model}: HTTP {response.status_code}: {response.text[:300]}")

            try:
                payload = response.json()
                usage = payload.get("usage") or {}
                cost += float(usage.get("cost") or 0)
                tokens_in += int(usage.get("prompt_tokens") or 0)
                tokens_out += int(usage.get("completion_tokens") or 0)
                content = payload["choices"][0]["message"].get("content")
                data = parse_json_content(content)
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                last_error = f"Некорректный ответ: {exc}"
                log.warning("%s: %s, попытка %d", model, last_error, attempt)
                await asyncio.sleep(attempt)
                continue

            try:
                checked = validator(data) if validator else data
            except ValueError as exc:
                last_error = f"Ответ не прошёл проверку: {exc}"
                repairs += 1
                if repairs > MAX_REPAIRS:
                    break
                attempt -= 1
                messages += [
                    {"role": "assistant", "content": json.dumps(data, ensure_ascii=False)},
                    {"role": "user", "content": f"Ответ не прошёл проверку: {exc}. Исправь и верни JSON целиком."},
                ]
                continue

            latency = int((time.monotonic() - started) * 1000)
            stored = {"cost": cost, "prompt_tokens": tokens_in, "completion_tokens": tokens_out}
            _cache_put(key, model, data, stored)
            log.info(
                "%s: токены %d/%d, $%.5f, %d мс", model, tokens_in, tokens_out, cost, latency
            )
            return LLMResult(
                data=checked,
                model=model,
                cost_usd=cost,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency,
                raw=data,
            )
    raise LLMError(f"{model}: {last_error}")
