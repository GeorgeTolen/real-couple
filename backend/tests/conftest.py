import json

import pytest

from app import db, llm
from app.config import CHECKLISTS_DIR, DATA_DIR


@pytest.fixture()
def database(tmp_path):
    db.use_database(tmp_path / "test.sqlite")
    db.init_db()
    yield
    db.use_database(None)


@pytest.fixture()
def default_config():
    return json.loads((CHECKLISTS_DIR / "freedom_default.json").read_text(encoding="utf-8"))


@pytest.fixture()
def dev_records():
    return json.loads((DATA_DIR / "dev.json").read_text(encoding="utf-8"))["data"]["records"]


DEFAULT_ANSWERS = {"c1": "Y", "c2": "Y", "c3": "NA", "c4": "20", "c5": "Y", "c6": "10", "c7": "Y", "c8": "N"}


@pytest.fixture()
def fake_llm(monkeypatch):
    """Подменяет сеть. answers задаёт ответы по моделям, calls хранит сделанные вызовы."""

    class Fake:
        answers: dict[str, dict[str, str]] = {}
        calls: list[dict] = []
        fail: set[str] = set()

    fake = Fake()
    fake.answers, fake.calls, fake.fail = {}, [], set()

    async def chat_json(*, provider, model, system, user, schema, validator=None, use_cache=True):
        fake.calls.append({"model": model, "system": system, "user": user, "schema": schema})
        if model in fake.fail:
            raise llm.LLMError(f"{model}: недоступна")
        chosen = {**DEFAULT_ANSWERS, **fake.answers.get(model, {})}
        data = {
            cid: {
                "evidence_ids": [1],
                "checked_range": [],
                "reasoning": f"Вывод {model} по {cid}",
                "answer": chosen.get(cid, spec["properties"]["answer"]["enum"][0]),
            }
            for cid, spec in schema["properties"].items()
        }
        checked = validator(data) if validator else data
        return llm.LLMResult(data=checked, model=model, cost_usd=0.01, tokens_in=10, tokens_out=5, latency_ms=1)

    monkeypatch.setattr(llm, "chat_json", chat_json)
    return fake
