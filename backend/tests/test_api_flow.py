"""Полный сценарий через API с подменой модели: импорт, оценка, апелляция, решение, экспорт."""
import json
import time

import pytest
from fastapi.testclient import TestClient

from app import export
from app.main import app

A = "google/gemini-3.8-flash"


@pytest.fixture()
def client(database, fake_llm):
    with TestClient(app) as test_client:
        yield test_client


def _upload(client, records, group="DEV"):
    body = json.dumps(records, ensure_ascii=False).encode("utf-8")
    response = client.post(
        "/api/conversations/upload", params={"group_id": group},
        files={"file": ("dev.json", body, "application/json")},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _run_and_wait(client, payload):
    response = client.post("/api/evaluations/run", json=payload)
    assert response.status_code == 202, response.text
    job_id = response.json()["job_id"]
    for _ in range(200):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("finished", "cancelled", "failed"):
            return job
        time.sleep(0.02)
    raise AssertionError(f"Задача не завершилась: {job}")


def test_full_flow(client, fake_llm, sample_records):
    records = sample_records[:2]
    _upload(client, records)
    ids = [r["conversation_id"] for r in records]
    fake_llm.answers = {A: {"c5": "N"}}

    job = _run_and_wait(client, {"conversation_ids": "all", "group_id": "DEV", "mode": "single"})
    assert job["status"] == "finished" and job["done"] == 2 and job["errors"] == 0

    listing = client.get("/api/conversations", params={"group_id": "DEV"}).json()
    assert listing["total"] == 2
    assert listing["items"][0]["status"] == "evaluated"

    card = client.get(f"/api/conversations/{ids[0]}").json()
    assert "audio_url" not in card
    evaluation = card["evaluation"]
    original_total = evaluation["original"]["total"]
    empathy = next(c for c in evaluation["original"]["criteria"] if c["criterion_id"] == "c5")
    assert empathy["answer"] == "N" and empathy["checked_range"]

    appeal = client.post(
        f"/api/evaluations/{evaluation['id']}/appeals",
        json={"criterion_id": "c5", "comment": "Оператор проявил эмпатию", "author": "Руслан"},
    )
    assert appeal.status_code == 201, appeal.text
    appeal_id = appeal.json()["id"]
    assert appeal.json()["fragment"]

    assert client.post(
        f"/api/evaluations/{evaluation['id']}/appeals",
        json={"criterion_id": "c5", "comment": "Ещё раз", "author": "Руслан"},
    ).status_code == 400

    queue = client.get("/api/appeals", params={"status": "open"}).json()
    assert [a["id"] for a in queue] == [appeal_id]
    assert client.get(f"/api/conversations/{ids[0]}").json()["evaluation"]["appeals"][0]["status"] == "open"

    preview = client.get(
        f"/api/evaluations/{evaluation['id']}/preview", params={"criterion": "c5", "answer": "Y"}
    ).json()
    assert preview["after"] > preview["before"]

    bad = client.post(
        f"/api/appeals/{appeal_id}/decision",
        json={"reviewer": "Проверяющий", "action": "change", "new_answer": "15", "reason": "Причина"},
    )
    assert bad.status_code == 400

    decision = client.post(
        f"/api/appeals/{appeal_id}/decision",
        json={"reviewer": "Проверяющий", "action": "change", "new_answer": "Y", "reason": "Эмпатия была"},
    )
    assert decision.status_code == 200, decision.text
    result = decision.json()["evaluation"]
    assert result["final"]["total"] == preview["after"]
    assert result["final"]["total"] > original_total
    assert result["original"]["total"] == original_total
    final_empathy = next(c for c in result["final"]["criteria"] if c["criterion_id"] == "c5")
    assert final_empathy["source"] == "reviewer" and final_empathy["original_answer"] == "N"
    assert len(result["decisions"]) == 1

    assert client.post(
        f"/api/appeals/{appeal_id}/decision",
        json={"reviewer": "Проверяющий", "action": "confirm", "reason": "Повтор"},
    ).status_code == 400

    item = next(
        i for i in client.get("/api/conversations").json()["items"] if i["id"] == ids[0]
    )
    assert item["status"] == "resolved" and item["appeal_status"] == "resolved"

    payload = client.get("/api/export/results-json", params={"set": "dev"}).json()
    assert payload["problems"] == []
    row = next(r for r in payload["document"]["results"] if r["conversation_id"] == ids[0])
    # В файл для сдачи идёт ответ модели, решение проверяющего не подменяет его.
    assert row["score"]["final_score"] == original_total
    empathy_row = next(c for c in row["criteria"] if c["criterion_id"] == "empathy")
    assert empathy_row["value"] is False
    with_decisions = client.get(
        "/api/export/results-json", params={"set": "dev", "with_decisions": True}
    ).json()["document"]
    reviewed = next(r for r in with_decisions["results"] if r["conversation_id"] == ids[0])
    assert reviewed["score"]["final_score"] == result["final"]["total"]
    assert export.validate_results(payload["document"], 2) == []

    stats = client.get("/api/stats").json()
    assert stats["evaluated"] == 2 and stats["decisions_changed"] == 1

    csv_response = client.get("/api/export/results", params={"format": "csv"})
    assert csv_response.status_code == 200 and "consultation" in csv_response.text


def test_confirm_keeps_score(client, fake_llm, sample_records):
    _upload(client, sample_records[:1])
    _run_and_wait(client, {"mode": "single"})
    conversation_id = sample_records[0]["conversation_id"]
    evaluation = client.get(f"/api/conversations/{conversation_id}").json()["evaluation"]
    appeal_id = client.post(
        f"/api/evaluations/{evaluation['id']}/appeals",
        json={"criterion_id": "c4", "comment": "Не согласен", "author": "Оператор"},
    ).json()["id"]
    result = client.post(
        f"/api/appeals/{appeal_id}/decision",
        json={"reviewer": "Проверяющий", "action": "confirm", "reason": "Оценка верна"},
    ).json()["evaluation"]
    assert result["final"]["total"] == result["original"]["total"]


def test_replace_criterion_through_api_applies_without_code(client, fake_llm, sample_records):
    """Контроль организаторов: заменить критерий и применить новый чек-лист."""
    _upload(client, sample_records[:1])
    before = client.get("/api/checklists/freedom-default").json()
    response = client.post(
        "/api/checklists/freedom-default/criteria/c5/replace",
        json={
            "id": "c5", "section": "dialogue_closure", "title": "Проактивность", "type": "scale",
            "weight": 15, "description": "Предложил полезное без запроса.", "export_id": "empathy",
            "scale": [{"value": 0, "label": "Нет"}, {"value": 2, "label": "Частично"}, {"value": 4, "label": "Да"}],
        },
    )
    assert response.status_code == 201, response.text
    changed = response.json()
    assert changed["version"] == before["version"] + 1

    fake_llm.answers = {A: {"c5": "2"}}
    job = _run_and_wait(client, {"mode": "single", "version": changed["version"]})
    assert job["errors"] == 0
    assert "Проактивность" in fake_llm.calls[-1]["system"]
    evaluation = client.get(f"/api/conversations/{sample_records[0]['conversation_id']}").json()["evaluation"]
    item = next(c for c in evaluation["original"]["criteria"] if c["criterion_id"] == "c5")
    assert item["title"] == "Проактивность" and item["weighted_points"] == 7.5

    old = client.get("/api/checklists/freedom-default", params={"version": before["version"]}).json()
    assert any(c["title"] == "Эмпатия" for c in old["criteria"])


def test_invalid_checklist_rejected(client):
    config = client.get("/api/checklists/freedom-default").json()
    config["criteria"][0]["id"] = config["criteria"][1]["id"]
    response = client.post("/api/checklists/freedom-default/versions", json=config)
    assert response.status_code == 422


def test_upload_rejects_unsafe_id(client):
    response = client.post(
        "/api/conversations/upload",
        files={"file": ("x.json", json.dumps([{"conversation_id": "../../evil", "transcript": [{}]}]), "application/json")},
    )
    assert response.status_code == 400


def test_not_found(client):
    assert client.get("/api/conversations/none").status_code == 404
    assert client.get("/api/evaluations/999").status_code == 404


def test_quick_checklist_edits_create_versions(client):
    before = client.get("/api/checklists/freedom-default").json()
    added = client.post(
        "/api/checklists/freedom-default/criteria",
        json={"id": "c9", "section": "start", "title": "Новый", "type": "binary", "weight": 5},
    )
    assert added.status_code == 201, added.text
    body = added.json()
    assert body["version"] == before["version"] + 1
    assert body["weight_warning"] and body["official"] is False

    patched = client.patch("/api/checklists/freedom-default/criteria/c9", json={"weight": 0, "title": "Переименован"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["version"] == before["version"] + 2
    assert patched.json()["weight_warning"] is None
    item = next(c for c in patched.json()["criteria"] if c["id"] == "c9")
    assert item["title"] == "Переименован" and item["weight"] == 0

    assert client.patch("/api/checklists/freedom-default/criteria/none", json={"weight": 1}).status_code == 404
    assert client.patch("/api/checklists/freedom-default/criteria/c9", json={}).status_code == 400
    assert client.post(
        "/api/checklists/freedom-default/criteria",
        json={"id": "c9", "section": "start", "title": "Дубль", "type": "binary", "weight": 5},
    ).status_code == 400


def test_gross_filter_returns_reasons(client, fake_llm, sample_records):
    _upload(client, sample_records[:2])
    fake_llm.answers = {A: {"c8": "Y"}}
    fake_llm.category = "Оскорбление"
    _run_and_wait(client, {"conversation_ids": [sample_records[0]["conversation_id"]], "mode": "single"})
    rows = client.get("/api/conversations", params={"gross": True}).json()["items"]
    assert [r["id"] for r in rows] == [sample_records[0]["conversation_id"]]
    assert rows[0]["evaluation"]["gross_reasons"][0]["category"] == "Оскорбление"
