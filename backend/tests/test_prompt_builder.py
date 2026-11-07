from app.prompt_builder import build_schema, build_system_prompt, prompt_version
from app.schemas import Checklist
from app.scoring import compute_totals


def test_schema_follows_types(default_config):
    checklist = Checklist.model_validate(default_config)
    schema = build_schema(checklist, "agent chat")
    assert schema["required"] == [f"c{i}" for i in range(1, 9)]
    enum = lambda cid: schema["properties"][cid]["properties"]["answer"]["enum"]
    assert enum("c1") == ["Y", "N"]
    assert enum("c2") == ["Y", "N", "NA"]
    assert enum("c4") == ["20", "15", "10", "5", "0", "NA"]
    assert enum("c6") == ["10", "7", "4", "0"]
    assert enum("c8") == ["Y", "N"]
    order = list(schema["properties"]["c1"]["properties"])
    assert order == ["evidence_ids", "checked_range", "reasoning", "answer"]


def test_voice_override_changes_prompt_only_for_calls(default_config):
    checklist = Checklist.model_validate(default_config)
    chat = build_system_prompt(checklist, "agent chat")
    call = build_system_prompt(checklist, "voice call")
    assert "Логичность ведения разговора" in call
    assert "Логичность ведения разговора" not in chat
    assert "[Имя скрыто]" in call
    assert prompt_version(checklist, "agent chat") != prompt_version(checklist, "voice call")


def test_replacing_criterion_changes_prompt_schema_and_score(default_config):
    """Требование контроля: новый критерий работает через конфигурацию, без правки кода."""
    before = Checklist.model_validate(default_config)
    config = before.model_dump()
    config["criteria"] = [c for c in config["criteria"] if c["id"] != "c5"] + [
        {
            "id": "c9", "section": "dialogue_closure", "title": "Проактивность", "type": "scale",
            "weight": 15, "description": "Оператор предложил полезное без запроса.",
            "scale": [{"value": 0, "label": "Нет"}, {"value": 1, "label": "Частично"}, {"value": 3, "label": "Да"}],
        }
    ]
    after = Checklist.model_validate(config)

    prompt = build_system_prompt(after, "agent chat")
    assert "Проактивность" in prompt and "Эмпатия" not in prompt
    schema = build_schema(after, "agent chat")
    assert "c9" in schema["properties"] and "c5" not in schema["properties"]
    assert schema["properties"]["c9"]["properties"]["answer"]["enum"] == ["3", "1", "0"]
    assert prompt_version(before, "agent chat") != prompt_version(after, "agent chat")

    answers = {"c1": "Y", "c2": "Y", "c3": "Y", "c4": "20", "c6": "10", "c7": "Y", "c8": "N", "c9": "1"}
    assert compute_totals(after, answers)["total"] == 90.00


def test_schema_can_be_limited_to_disputed(default_config):
    checklist = Checklist.model_validate(default_config)
    schema = build_schema(checklist, "agent chat", only=["c4", "c8"])
    assert schema["required"] == ["c4", "c8"]
    prompt = build_system_prompt(checklist, "agent chat", only=["c4"])
    assert "Консультация" in prompt and "Завершение" not in prompt
