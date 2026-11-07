import pytest

from app.schemas import Checklist
from app.scoring import ScoringError, axis_scores, compute_totals, criterion_axis


@pytest.fixture()
def checklist(default_config):
    return Checklist.model_validate(default_config)


def test_case_with_gross_violation(checklist):
    answers = {"c1": "Y", "c2": "Y", "c3": "N", "c4": "5", "c5": "N", "c6": "4", "c7": "Y", "c8": "Y"}
    totals = compute_totals(checklist, answers)
    assert totals["total"] == 41.00
    assert totals["gross_violation"] is True
    assert totals["gross_items"] == ["c8"]


def test_case_with_na_redistribution(checklist):
    answers = {"c1": "Y", "c2": "NA", "c3": "NA", "c4": "20", "c5": "Y", "c6": "10", "c7": "N", "c8": "N"}
    totals = compute_totals(checklist, answers)
    assert totals["total"] == 92.31
    assert totals["gross_violation"] is False
    points = {p["criterion_id"]: p for p in totals["per_criterion"]}
    assert points["c2"]["applicable"] is False
    assert points["c2"]["earned_points"] is None
    assert points["c1"]["max_points"] == pytest.approx(15.38)


def test_appendix_example(checklist):
    answers = {"c1": "Y", "c2": "NA", "c3": "NA", "c4": "15", "c5": "Y", "c6": "7", "c7": "Y", "c8": "N"}
    assert compute_totals(checklist, answers)["total"] == 85.38


def test_flag_never_changes_total(checklist):
    base = {"c1": "Y", "c2": "Y", "c3": "Y", "c4": "20", "c5": "Y", "c6": "10", "c7": "Y"}
    assert compute_totals(checklist, {**base, "c8": "Y"})["total"] == 100.00
    assert compute_totals(checklist, {**base, "c8": "N"})["total"] == 100.00


def test_all_na_allowed_keeps_denominator(checklist):
    answers = {"c1": "Y", "c2": "NA", "c3": "NA", "c4": "NA", "c5": "N", "c6": "10", "c7": "NA", "c8": "N"}
    assert compute_totals(checklist, answers)["total"] == 62.50


def _custom(criteria):
    return Checklist.model_validate(
        {"id": "custom", "name": "Тест", "sections": [{"id": "s", "title": "Секция"}], "criteria": criteria}
    )


def test_everything_na_gives_null():
    checklist = _custom(
        [
            {"id": "a", "section": "s", "title": "A", "type": "binary", "allow_na": True, "weight": 50},
            {"id": "b", "section": "s", "title": "B", "type": "binary", "allow_na": True, "weight": 50},
        ]
    )
    totals = compute_totals(checklist, {"a": "NA", "b": "NA"})
    assert totals["total"] is None
    assert totals["sections"][0]["score"] is None


def test_custom_scale_zero_to_three():
    checklist = _custom(
        [
            {
                "id": "a", "section": "s", "title": "A", "type": "scale", "weight": 30,
                "scale": [{"value": v} for v in (0, 1, 2, 3)],
            },
            {"id": "b", "section": "s", "title": "B", "type": "binary", "weight": 10},
        ]
    )
    assert compute_totals(checklist, {"a": "2", "b": "N"})["total"] == 50.00


def test_rounding_half_up():
    checklist = _custom(
        [
            {"id": "a", "section": "s", "title": "A", "type": "binary", "weight": 1},
            {
                "id": "b", "section": "s", "title": "B", "type": "scale", "weight": 7,
                "scale": [{"value": 0}, {"value": 8}, {"value": 16}, {"value": 1600}],
            },
        ]
    )
    # Ступень 8 из 1600: (1*0 + 7*0.005) / 8 * 100 = 0.4375, половина вверх даёт 0.44
    assert compute_totals(checklist, {"a": "N", "b": "8"})["total"] == 0.44


def test_na_rejected_when_not_allowed(checklist):
    answers = {"c1": "NA", "c2": "Y", "c3": "Y", "c4": "20", "c5": "Y", "c6": "10", "c7": "Y", "c8": "N"}
    with pytest.raises(ScoringError):
        compute_totals(checklist, answers)


def test_unknown_scale_step_rejected(checklist):
    answers = {"c1": "Y", "c2": "Y", "c3": "Y", "c4": "12", "c5": "Y", "c6": "10", "c7": "Y", "c8": "N"}
    with pytest.raises(ScoringError):
        compute_totals(checklist, answers)


def test_missing_answer_rejected(checklist):
    with pytest.raises(ScoringError):
        compute_totals(checklist, {"c1": "Y"})


def test_sections_use_same_formula(checklist):
    answers = {"c1": "Y", "c2": "N", "c3": "NA", "c4": "10", "c5": "Y", "c6": "10", "c7": "Y", "c8": "N"}
    sections = {s["id"]: s for s in compute_totals(checklist, answers)["sections"]}
    assert sections["start"]["score"] == 40.00
    assert sections["security_solution"]["score"] == 50.00
    assert sections["dialogue_closure"]["score"] == 100.00
    assert sections["control"]["score"] is None


def test_channel_restricted_criterion_excluded():
    checklist = _custom(
        [
            {"id": "a", "section": "s", "title": "A", "type": "binary", "weight": 50},
            {"id": "b", "section": "s", "title": "B", "type": "binary", "weight": 50, "channels": ["voice call"]},
        ]
    )
    assert compute_totals(checklist, {"a": "Y"}, "agent chat")["total"] == 100.00
    assert compute_totals(checklist, {"a": "Y", "b": "N"}, "voice call")["total"] == 50.00


@pytest.mark.parametrize(
    "criterion, message",
    [
        ({"id": "a", "section": "s", "title": "A", "type": "scale", "weight": 10}, "шкал"),
        ({"id": "a", "section": "s", "title": "A", "type": "flag", "weight": 5}, "флаг"),
        ({"id": "a", "section": "s", "title": "A", "type": "binary", "weight": -1}, "отрицательн"),
        ({"id": "a", "section": "missing", "title": "A", "type": "binary", "weight": 1}, "секция"),
    ],
)
def test_invalid_configuration_rejected(criterion, message):
    with pytest.raises(ValueError, match=message):
        _custom([criterion])


def test_axis_scores_use_weights_and_skip_na(checklist):
    answers = {"c1": "Y", "c2": "NA", "c3": "N", "c4": "10", "c5": "N", "c6": "10", "c7": "Y", "c8": "Y"}
    axes = axis_scores(checklist, answers)
    # Решение: c3 0 из 20, c4 10 из 20, c2 исключён. Сервис: c1 10, c5 0 из 15, c6 15, c7 5 из 45.
    assert axes["resolution"] == 25.00
    assert axes["service"] == 66.67


def test_axis_empty_when_everything_is_na_or_no_axis():
    checklist = _custom(
        [
            {"id": "a", "section": "s", "title": "A", "type": "binary", "allow_na": True, "weight": 50, "map_axis": "service"},
            {"id": "b", "section": "s", "title": "B", "type": "binary", "weight": 50},
        ]
    )
    assert axis_scores(checklist, {"a": "NA", "b": "Y"}) == {"resolution": None, "service": None}


def test_axis_override_from_config(checklist):
    config = checklist.model_dump()
    next(c for c in config["criteria"] if c["id"] == "c1")["map_axis"] = "resolution"
    changed = Checklist.model_validate(config)
    answers = {"c1": "Y", "c2": "NA", "c3": "NA", "c4": "NA", "c5": "Y", "c6": "10", "c7": "Y", "c8": "N"}
    assert axis_scores(changed, answers)["resolution"] == 100.00


def test_flag_has_no_axis(checklist):
    assert criterion_axis(checklist.criterion("c8")) is None
    assert criterion_axis(checklist.criterion("c3")) == "resolution"
    assert criterion_axis(checklist.criterion("c5")) == "service"
