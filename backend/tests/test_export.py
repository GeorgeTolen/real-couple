import copy

import pytest

from app import evaluator, export, ingest, repo


def demo_doc():
    """Пример со стр. 2 приложения к гайду."""
    criteria = [
        ("contact", True), ("discovery", None), ("identification", None), ("consultation", 15),
        ("empathy", True), ("dialogue", 7), ("closure", True), ("critical", False),
    ]
    return {
        "schema_version": "1.0",
        "team_name": "Название команды",
        "model": {"mode": "local", "name": "Название модели"},
        "results": [
            {
                "conversation_id": "demo-001",
                "status": "ok",
                "criteria": [
                    {"criterion_id": c, "value": v, "rationale": "Текст.", "evidence_turns": [4]}
                    for c, v in criteria
                ],
                "score": {"final_score": 85.38, "critical_flag": False},
            },
            {"conversation_id": "demo-002", "status": "error", "criteria": [], "score": None,
             "error": "Не удалось получить ответ модели."},
        ],
    }


def test_appendix_example_is_valid():
    assert export.validate_results(demo_doc(), 2) == []


def _mutated(change):
    doc = copy.deepcopy(demo_doc())
    change(doc)
    return export.validate_results(doc)


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d.update(schema_version="2.0"),
        lambda d: d["model"].update(mode="cloud"),
        lambda d: d["results"][0]["criteria"].pop(),
        lambda d: d["results"][0]["criteria"].append(d["results"][0]["criteria"][0]),
        lambda d: d["results"][1].update(conversation_id="demo-001"),
        lambda d: d["results"][0]["criteria"][0].update(value=None),
        lambda d: d["results"][0]["criteria"][3].update(value=12),
        lambda d: d["results"][0]["criteria"][5].update(value=None),
        lambda d: d["results"][0]["criteria"][0].update(value=1),
        lambda d: d["results"][0]["criteria"][0].update(evidence_turns=[0]),
        lambda d: d["results"][0]["score"].update(final_score=85.385),
        lambda d: d["results"][0]["score"].update(final_score=101),
        lambda d: d["results"][0]["score"].update(critical_flag=True),
        lambda d: d["results"][1].update(score=0),
        lambda d: d["results"][1].update(status="failed"),
    ],
)
def test_validator_catches_violations(change):
    assert _mutated(change)


def test_validator_checks_record_count():
    assert export.validate_results(demo_doc(), 10)


async def _prepare(records, group="DEV"):
    ingest.store_records(records, group)
    return repo.get_checklist("freedom-default")


async def test_export_refuses_partial_then_writes_one_based_turns(database, fake_llm, dev_records):
    records = dev_records[:2]
    checklist = await _prepare(records)
    first = records[0]["conversation_id"]
    await evaluator.evaluate_conversation(first, checklist, "single")

    with pytest.raises(export.ExportError, match="Не оценены"):
        export.build_results("DEV")

    partial = export.build_results("DEV", allow_partial=True)
    assert partial["results"][1]["status"] == "error"

    await evaluator.evaluate_conversation(records[1]["conversation_id"], checklist, "single")
    doc = export.build_results("DEV")
    assert export.validate_results(doc, 2) == []
    assert doc["team_name"] == "real-couple"
    assert doc["model"]["mode"] == "external_api"
    assert doc["results"][0]["criteria"][0]["evidence_turns"] == [1]


async def test_export_refuses_version_without_codes(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    replacement = {
        "id": "c5", "section": "dialogue_closure", "title": "Новый", "type": "binary", "weight": 15,
    }
    from app.schemas import Criterion

    changed = repo.replace_criterion(checklist.id, "c5", Criterion.model_validate(replacement))
    await evaluator.evaluate_conversation(records[0]["conversation_id"], changed, "single")
    with pytest.raises(export.ExportError, match="empathy"):
        export.build_results("DEV", version=changed.version)

    # Без явной версии берётся последняя полная: новая оценка на неё не влияет.
    assert export.latest_exportable_version(checklist.id) == checklist.version


async def test_export_uses_requested_version_not_latest_evaluation(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    conversation_id = records[0]["conversation_id"]
    await evaluator.evaluate_conversation(conversation_id, checklist, "single")
    newer = repo.save_new_version(checklist)
    fake_llm.answers = {"google/gemini-3.8-flash": {"c4": "0"}}
    await evaluator.evaluate_conversation(conversation_id, newer, "single")

    old = export.build_results("DEV", version=checklist.version)
    new = export.build_results("DEV", version=newer.version)
    value = lambda doc: next(c["value"] for c in doc["results"][0]["criteria"] if c["criterion_id"] == "consultation")
    assert value(old) == 20
    assert value(new) == 0


async def test_failed_evaluation_is_exported_as_error(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    fake_llm.fail = {"google/gemini-3.8-flash"}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    assert result["status"] == "error"
    doc = export.build_results("DEV")
    assert doc["results"][0]["status"] == "error"
    assert doc["results"][0]["error"]
    assert export.validate_results(doc, 1) == []


async def test_ensemble_agreement_arbiter_and_insurance(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    a, b, arbiter = "google/gemini-3.8-flash", "openai/gpt-6.1-sol", "google/gemini-4-argon"
    fake_llm.answers = {
        a: {"c3": "N", "c8": "N", "c4": "20"},
        b: {"c3": "N", "c8": "N", "c4": "10"},
        arbiter: {"c4": "15", "c8": "Y"},
    }
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "ensemble")
    view = repo.build_view(result["evaluation_id"])
    by_id = {c["criterion_id"]: c for c in view["original"]["criteria"]}
    assert by_id["c1"]["agreement"] == "full"
    assert by_id["c4"]["agreement"] == "arbitrated" and by_id["c4"]["answer"] == "15"
    # c3 = N и c8 = N: правило из конфигурации отправляет c8 арбитру, хотя судьи совпали.
    assert by_id["c8"]["agreement"] == "arbitrated" and by_id["c8"]["answer"] == "Y"
    assert view["needs_review"] is True
    assert view["original"]["gross_violation"] is True
    arbiter_call = next(c for c in fake_llm.calls if c["model"] == arbiter)
    assert set(arbiter_call["schema"]["required"]) == {"c4", "c8"}


async def test_ensemble_without_arbiter_takes_lower_scale(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    a, b, arbiter = "google/gemini-3.8-flash", "openai/gpt-6.1-sol", "google/gemini-4-argon"
    fake_llm.answers = {a: {"c4": "20", "c5": "Y"}, b: {"c4": "10", "c5": "N"}}
    fake_llm.fail = {arbiter}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "ensemble")
    view = repo.build_view(result["evaluation_id"])
    by_id = {c["criterion_id"]: c for c in view["original"]["criteria"]}
    assert by_id["c4"]["answer"] == "10" and by_id["c4"]["agreement"] == "unresolved"
    assert by_id["c5"]["answer"] == "Y"
    assert view["needs_review"] is True


async def test_demo_edit_of_weight_does_not_reach_submission(database, fake_llm, dev_records):
    """Правка веса на демо создаёт новую версию, но сдача остаётся на версии организаторов."""
    records = dev_records[:1]
    checklist = await _prepare(records)
    changed = repo.patch_criterion(checklist.id, "c5", {"weight": 25})
    assert export.is_official(checklist) is True
    assert export.is_official(changed) is False
    assert export.latest_exportable_version(checklist.id) == checklist.version


async def test_check_against_data_catches_bad_turn_and_score(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    doc = export.build_results("DEV")
    assert export.check_against_data(doc, checklist) == []

    broken = copy.deepcopy(doc)
    broken["results"][0]["criteria"][0]["evidence_turns"] = [9999]
    assert any("9999" in p for p in export.check_against_data(broken, checklist))

    broken = copy.deepcopy(doc)
    broken["results"][0]["score"]["final_score"] = 1.0
    assert any("пересчёт" in p for p in export.check_against_data(broken, checklist))

    broken = copy.deepcopy(doc)
    broken["results"][0]["conversation_id"] = "missing"
    assert any("нет в импортированных" in p for p in export.check_against_data(broken, checklist))


async def test_changed_only_asks_model_about_new_criterion_only(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    conversation_id = records[0]["conversation_id"]
    await evaluator.evaluate_conversation(conversation_id, checklist, "single")
    calls_before = len(fake_llm.calls)

    # Вес на ответ модели не влияет: вызовов нет, итог пересчитан.
    weight_only = repo.patch_criterion(checklist.id, "c5", {"weight": 25})
    result = await evaluator.evaluate_conversation(conversation_id, weight_only, "single", changed_only=True)
    assert result["status"] == "ok" and len(fake_llm.calls) == calls_before and result["cost_usd"] == 0

    # Изменена формулировка одного критерия: модель спрашивают только о нём.
    reworded = repo.patch_criterion(checklist.id, "c5", {"description": "Новая формулировка"})
    result = await evaluator.evaluate_conversation(conversation_id, reworded, "single", changed_only=True)
    assert result["status"] == "ok"
    assert fake_llm.calls[-1]["schema"]["required"] == ["c5"]
    view = repo.build_view(result["evaluation_id"])
    assert view["signals"]["reused_criteria"] == ["c1", "c2", "c3", "c4", "c6", "c7", "c8"]
    assert len(view["original"]["criteria"]) == 8


async def test_gross_reason_has_category_and_quote(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {"google/gemini-3.8-flash": {"c8": "Y"}}
    fake_llm.category = "Раскрытие данных"
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    view = repo.build_view(result["evaluation_id"])
    reason = view["gross_reasons"][0]
    assert reason["category"] == "Раскрытие данных"
    assert reason["turn"] == 1 and reason["quote"]


async def test_gross_without_category_is_rejected_by_validator(database, dev_records):
    from app.judge import make_validator
    from app.schemas import Checklist

    records = dev_records[:1]
    checklist: Checklist = await _prepare(records)
    validate = make_validator(checklist, "agent chat", 5, only=["c8"])
    bad = {"c8": {"answer": "Y", "category": "нет", "reasoning": "", "evidence_ids": [], "checked_range": []}}
    with pytest.raises(ValueError, match="category"):
        validate(bad)


async def test_score_drivers_sorted_by_loss(database, fake_llm, dev_records):
    records = dev_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {"google/gemini-3.8-flash": {"c3": "N", "c7": "N", "c5": "Y"}}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    drivers = repo.build_view(result["evaluation_id"])["score_drivers"]
    assert [d["criterion_id"] for d in drivers] == ["c3", "c7"]
    assert drivers[0]["lost_points"] == 20 and drivers[0]["reason"] and drivers[0]["turn"] == 1
