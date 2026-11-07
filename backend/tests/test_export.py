import copy
import json

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


async def test_export_refuses_partial_then_writes_one_based_turns(database, fake_llm, sample_records):
    records = sample_records[:2]
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


async def test_export_refuses_version_without_codes(database, fake_llm, sample_records):
    records = sample_records[:1]
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


async def test_export_uses_requested_version_not_latest_evaluation(database, fake_llm, sample_records):
    records = sample_records[:1]
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


async def test_failed_evaluation_is_exported_as_error(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.fail = {"google/gemini-3.8-flash"}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    assert result["status"] == "error"
    doc = export.build_results("DEV")
    assert doc["results"][0]["status"] == "error"
    assert doc["results"][0]["error"]
    assert export.validate_results(doc, 1) == []


async def test_ensemble_agreement_arbiter_and_insurance(database, fake_llm, sample_records):
    records = sample_records[:1]
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


async def test_ensemble_without_arbiter_takes_lower_scale(database, fake_llm, sample_records):
    records = sample_records[:1]
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


async def test_demo_edit_of_weight_does_not_reach_submission(database, fake_llm, sample_records):
    """Правка веса на демо создаёт новую версию, но сдача остаётся на версии организаторов."""
    records = sample_records[:1]
    checklist = await _prepare(records)
    changed = repo.patch_criterion(checklist.id, "c5", {"weight": 25})
    assert export.is_official(checklist) is True
    assert export.is_official(changed) is False
    assert export.latest_exportable_version(checklist.id) == checklist.version


async def test_check_against_data_catches_bad_turn_and_score(database, fake_llm, sample_records):
    records = sample_records[:1]
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


async def test_changed_only_asks_model_about_new_criterion_only(database, fake_llm, sample_records):
    records = sample_records[:1]
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


async def test_gross_reason_has_category_and_quote(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {"google/gemini-3.8-flash": {"c8": "Y"}}
    fake_llm.category = "Раскрытие данных"
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    view = repo.build_view(result["evaluation_id"])
    reason = view["gross_reasons"][0]
    assert reason["category"] == "Раскрытие данных"
    assert reason["turn"] == 1 and reason["quote"]


async def test_gross_without_category_is_rejected_by_validator(database, sample_records):
    from app.judge import make_validator
    from app.schemas import Checklist

    records = sample_records[:1]
    checklist: Checklist = await _prepare(records)
    validate = make_validator(checklist, "agent chat", 5, only=["c8"])
    bad = {"c8": {"answer": "Y", "category": "нет", "reasoning": "", "evidence_ids": [], "checked_range": []}}
    with pytest.raises(ValueError, match="category"):
        validate(bad)


async def test_score_drivers_sorted_by_loss(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {"google/gemini-3.8-flash": {"c3": "N", "c7": "N", "c5": "Y"}}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    drivers = repo.build_view(result["evaluation_id"])["score_drivers"]
    assert [d["criterion_id"] for d in drivers] == ["c3", "c7"]
    assert drivers[0]["lost_points"] == 20 and drivers[0]["reason"] and drivers[0]["turn"] == 1


A_MODEL, B_MODEL, ARBITER_MODEL = "google/gemini-3.8-flash", "openai/gpt-6.1-sol", "google/gemini-4-argon"


async def test_repeat_returns_saved_evaluation_and_force_creates_new(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    conversation_id = records[0]["conversation_id"]
    first = await evaluator.evaluate_conversation(conversation_id, checklist, "ensemble")
    calls = len(fake_llm.calls)

    again = await evaluator.evaluate_conversation(conversation_id, checklist, "ensemble")
    assert again["unchanged"] is True and again["evaluation_id"] == first["evaluation_id"]
    assert len(fake_llm.calls) == calls and again["spent_usd"] == 0

    fake_llm.answers = {A_MODEL: {"c6": "7"}, B_MODEL: {"c6": "7"}}
    forced = await evaluator.evaluate_conversation(conversation_id, checklist, "ensemble", force=True)
    assert forced["evaluation_id"] != first["evaluation_id"] and "unchanged" not in forced
    diff = repo.diff_evaluations(forced["evaluation_id"], first["evaluation_id"])
    assert [c["criterion_id"] for c in diff["changes"]] == ["c6"]
    assert diff["changes"][0]["old_answer"] == "10" and diff["changes"][0]["new_answer"] == "7"
    assert diff["changes"][0]["old_reasoning"] and diff["changes"][0]["new_reasoning"]
    assert repo.diff_evaluations(forced["evaluation_id"])["old_id"] == first["evaluation_id"]


async def test_scale_below_top_without_failure_is_requested_again(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {A_MODEL: {"c6": "7"}}
    fake_llm.no_ref = {A_MODEL: 1}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    assert fake_llm.calls[-1]["schema"]["required"] == ["c6"]
    assert "Назови конкретный сбой" in fake_llm.calls[-1]["user"]
    view = repo.build_view(result["evaluation_id"])
    item = next(c for c in view["original"]["criteria"] if c["criterion_id"] == "c6")
    assert "#1" in item["reasoning"] and item["answer"] == "7"
    assert view["needs_review"] is False


async def test_no_answer_without_evidence_follows_config(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {A_MODEL: {"c5": "N", "c3": "N"}}
    fake_llm.no_ref = {A_MODEL: 1}
    await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    # c5 требует доказательств по конфигурации, c3 нет.
    assert fake_llm.calls[-1]["schema"]["required"] == ["c5"]


async def test_failure_never_named_goes_to_review(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {A_MODEL: {"c6": "7"}}
    fake_llm.no_ref = {A_MODEL: 2}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "single")
    view = repo.build_view(result["evaluation_id"])
    assert view["needs_review"] is True
    assert any("без конкретного сбоя" in note for note in view["signals"]["notes"])
    # Снижение без сбоя не попадает в блок причин.
    assert all(d["criterion_id"] != "c6" for d in view["score_drivers"])


async def test_no_arbiter_without_failure_takes_top_step(database, fake_llm, sample_records):
    """Правило «брать меньшее» убрано: без названного сбоя шкала не снижается."""
    from app.judge import _fallback_answer

    checklist = await _prepare(sample_records[:1])
    c6 = checklist.criterion("c6")
    plain = lambda answer: {"answer": answer, "reasoning": "Всё ясно", "evidence_ids": [], "checked_range": None}
    named = {"answer": "4", "reasoning": "Сбой в #5", "evidence_ids": [5], "checked_range": None}
    assert _fallback_answer(c6, plain("7"), plain("4"))["answer"] == "10"
    assert _fallback_answer(c6, plain("10"), named)["answer"] == "4"
    assert _fallback_answer(c6, named, plain("10"))["answer"] == "4"


async def test_driver_reason_keeps_failure_and_points_to_it(database, sample_records):
    criteria = [
        {
            "criterion_id": "c6", "title": "Ведение диалога", "max_points": 15.0, "earned_points": 10.5,
            "reasoning": "Реплики ясные [#11]. Однако допущен сбой: сначала передача [#16], деталь вдогонку [#19].",
            "evidence_ids": [11, 16, 19], "checked_range": None, "source": "ai",
        },
        {
            "criterion_id": "c1", "title": "Контакт", "max_points": 10.0, "earned_points": 10.0,
            "reasoning": "Всё хорошо", "evidence_ids": [], "checked_range": None, "source": "ai",
        },
    ]
    drivers = repo.score_drivers(criteria)
    assert len(drivers) == 1 and drivers[0]["reason"].startswith("Однако допущен сбой")
    assert drivers[0]["turn"] == 16


def _insert_job(source):
    from app.db import connect, now_iso

    with connect() as conn:
        return conn.execute(
            "INSERT INTO jobs(status,total,params_json,created_at) VALUES('running',1,?,?)",
            (json.dumps({"source": source}), now_iso()),
        ).lastrowid


def test_cli_start_does_not_touch_running_jobs(database):
    from app import db, jobs

    cli_job, api_job = _insert_job("cli"), _insert_job("api")
    db.init_db()
    assert jobs.get_job(cli_job)["status"] == "running"
    assert jobs.get_job(api_job)["status"] == "running"
    # Старт сервера завершает только собственные задачи.
    assert db.mark_interrupted_jobs() == 1
    assert jobs.get_job(cli_job)["status"] == "running"
    assert jobs.get_job(api_job)["status"] == "interrupted"


def test_holdout_files_match_checklist(default_config):
    from app.config import BENCH_DIR
    from app.schemas import Checklist
    from app.scoring import allowed_answers

    checklist = Checklist.model_validate(default_config)
    records = ingest.parse_records(
        json.loads((BENCH_DIR / "holdout/holdout_chats.json").read_text(encoding="utf-8"))
    )
    gt = json.loads((BENCH_DIR / "holdout/gt_holdout.json").read_text(encoding="utf-8"))
    gt.pop("_legend")
    assert len(records) == 10 and {r["conversation_id"] for r in records} == set(gt)
    # Данных организаторов в чистом клоне нет, тогда сравнивать не с чем.
    dev_file = BENCH_DIR.parent / "data/dev.json"
    dev = json.loads(dev_file.read_text(encoding="utf-8"))["data"]["records"] if dev_file.exists() else []
    dev_lines = {t["text"] for r in dev for t in r["transcript"] if t["speaker"] == "operator"}
    for record in records:
        assert all(
            t["text"] not in dev_lines for t in record["transcript"] if t["speaker"] == "operator"
        ), record["conversation_id"]
    for labels in gt.values():
        for criterion in checklist.criteria:
            assert str(labels[criterion.id]).rstrip("?") in allowed_answers(criterion), labels


def _opinion(answer):
    return {"answer": answer, "reasoning": "[#1]", "evidence_ids": [1], "checked_range": None}


def test_review_flag_only_when_arbiter_sides_with_nobody():
    from app.judge import item_needs_review

    judges = {"a": _opinion("20"), "b": _opinion("10")}
    agree = {"answer": "10", "agreement": "arbitrated", "judge_answers": {**judges, "c (арбитр)": _opinion("10")}}
    neither = {"answer": "15", "agreement": "arbitrated", "judge_answers": {**judges, "c (арбитр)": _opinion("15")}}
    assert item_needs_review(agree) is False
    assert item_needs_review(neither) is True
    assert item_needs_review({"answer": "10", "agreement": "full", "judge_answers": judges}) is False
    assert item_needs_review({"answer": "10", "agreement": "unresolved", "judge_answers": judges}) is True


async def test_arbiter_siding_with_judge_needs_no_review(database, fake_llm, sample_records):
    records = sample_records[:1]
    checklist = await _prepare(records)
    fake_llm.answers = {A_MODEL: {"c4": "20"}, B_MODEL: {"c4": "10"}, ARBITER_MODEL: {"c4": "10"}}
    result = await evaluator.evaluate_conversation(records[0]["conversation_id"], checklist, "ensemble")
    view = repo.build_view(result["evaluation_id"])
    item = next(c for c in view["original"]["criteria"] if c["criterion_id"] == "c4")
    assert item["agreement"] == "arbitrated" and view["needs_review"] is False


def test_startup_numbers_come_from_measurement_files(tmp_path, monkeypatch):
    from app.routers import models

    monkeypatch.setattr(models, "BENCH_DIR", tmp_path)
    assert models.mode_info("local")["accuracy"] is None
    (tmp_path / "results_single.json").write_text(
        json.dumps({"accuracy": 91.5, "cost_per_dialog": 0.01, "dialogs": 12, "measured_at": "2026-11-08"}),
        encoding="utf-8",
    )
    info = models.mode_info("single")
    assert info["accuracy"] == 91.5 and info["dialogs"] == 12 and info["measured_at"] == "2026-11-08"
    (tmp_path / "holdout").mkdir()
    (tmp_path / "holdout/holdout_report.json").write_text(
        json.dumps({"report": {"accuracy": 90.0, "dialogs": 10, "measured_at": "2026-11-08"}}), encoding="utf-8"
    )
    assert models.mode_info("ensemble")["holdout"]["dialogs"] == 10
