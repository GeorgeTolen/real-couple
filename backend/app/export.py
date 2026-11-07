"""Экспорт в формат организаторов JSON 1.0 и его проверка."""
import json
from pathlib import Path
from typing import Any

from . import repo
from .config import RESULTS_DIR, get_settings
from .schemas import Checklist
from .scoring import compute_totals

SCHEMA_VERSION = "1.0"
ALLOWED_SETS = ("dev", "prod")
# Таблица со стр. 3 приложения к гайду: тип значения для каждого кода критерия.
REQUIRED_CRITERIA: dict[str, dict[str, Any]] = {
    "contact": {"kind": "bool", "nullable": False, "weight": 10},
    "discovery": {"kind": "bool", "nullable": True, "weight": 15},
    "identification": {"kind": "bool", "nullable": True, "weight": 20},
    "consultation": {"kind": "scale", "values": {0, 5, 10, 15, 20}, "nullable": True, "weight": 20},
    "empathy": {"kind": "bool", "nullable": False, "weight": 15},
    "dialogue": {"kind": "scale", "values": {0, 4, 7, 10}, "nullable": False, "weight": 15},
    "closure": {"kind": "bool", "nullable": True, "weight": 5},
    "critical": {"kind": "bool", "nullable": False, "weight": 0},
}
VALID_MODES = {"local", "external_api", "hybrid"}


class ExportError(ValueError):
    pass


def missing_export_ids(checklist: Checklist) -> list[str]:
    present = {c.export_id for c in checklist.criteria if c.export_id}
    return [code for code in REQUIRED_CRITERIA if code not in present]


def is_official(checklist: Checklist) -> bool:
    """Все 8 кодов с весами, шкалами и правилами N/A из таблицы организаторов."""
    if missing_export_ids(checklist):
        return False
    for criterion in checklist.criteria:
        rule = REQUIRED_CRITERIA.get(criterion.export_id or "")
        if rule is None:
            if criterion.weight > 0:
                return False
            continue
        if criterion.weight != rule["weight"] or criterion.allow_na != rule["nullable"]:
            return False
        if rule["kind"] == "scale":
            if criterion.type != "scale" or {s.value for s in criterion.scale or []} != rule["values"]:
                return False
        elif criterion.type == "scale":
            return False
    return True


def latest_exportable_version(checklist_id: str) -> int:
    """Последняя версия по правилам организаторов. Правки для демо в сдачу сами не попадают."""
    versions = next(
        (c["versions"] for c in repo.list_checklists() if c["id"] == checklist_id), []
    )
    for item in versions:
        if is_official(repo.get_checklist(checklist_id, item["version"])):
            return item["version"]
    raise ExportError(
        f"Ни одна версия чек-листа {checklist_id} не совпадает с таблицей организаторов. "
        "Укажите версию явно."
    )


def _value(answer: str) -> Any:
    if answer == "NA":
        return None
    if answer in ("Y", "N"):
        return answer == "Y"
    return int(answer)


def _evidence(item: dict[str, Any]) -> list[int]:
    if item["evidence_ids"]:
        return sorted(item["evidence_ids"])
    if item["checked_range"]:
        first, last = item["checked_range"]
        return list(range(first, last + 1))
    return []


def _rationale(item: dict[str, Any]) -> str:
    text = item.get("reasoning") or ""
    if item.get("decision_reason"):
        return f"Решение проверяющего: {item['decision_reason']}"
    return text


def build_results(
    group_id: str,
    checklist_id: str = "freedom-default",
    version: int | None = None,
    allow_partial: bool = False,
    limit: int | None = None,
    with_decisions: bool = False,
) -> dict[str, Any]:
    """По умолчанию в файл идут ответы модели: организаторы сравнивают с эталоном работу системы.

    Решения проверяющих, в том числе тестовые на демо, добавляются только по with_decisions.
    """
    if version is None:
        version = latest_exportable_version(checklist_id)
    checklist = repo.get_checklist(checklist_id, version)
    missing = missing_export_ids(checklist)
    if missing:
        raise ExportError(
            f"Версия {version} чек-листа {checklist_id} не подходит для сдачи: нет кодов критериев "
            f"{', '.join(missing)}. Укажите export_id у критериев этой версии или выберите другую версию."
        )
    ids = repo.group_conversation_ids(group_id)
    if not ids:
        raise ExportError(f"Набор {group_id} не импортирован")
    if limit:
        ids = ids[:limit]

    codes = {c.id: c.export_id for c in checklist.criteria if c.export_id in REQUIRED_CRITERIA}
    results, unevaluated, modes, names = [], [], set(), []
    for conversation_id in ids:
        conversation = repo.get_conversation(conversation_id)
        evaluation_id = repo.latest_evaluation_id(
            conversation_id, checklist_id, version, only_ok=True,
            transcript_hash=conversation["transcript_hash"],
        )
        if evaluation_id is None:
            failed = repo.latest_evaluation_id(conversation_id, checklist_id, version)
            if failed is None:
                unevaluated.append(conversation_id)
                if allow_partial:
                    results.append(_error_entry(conversation_id, "Диалог ещё не оценён этой версией чек-листа."))
                continue
            view = repo.build_view(failed)
            results.append(_error_entry(conversation_id, view["error"] or "Оценка не удалась."))
            continue
        view = repo.build_view(evaluation_id)
        modes.add("local" if view["mode"] == "local" else "external_api")
        for model in view["models"].values():
            if model not in names:
                names.append(model)
        criteria = []
        layer = view["final"] if with_decisions else view["original"]
        by_code = {codes[c["criterion_id"]]: c for c in layer["criteria"] if c["criterion_id"] in codes}
        for code in REQUIRED_CRITERIA:
            item = by_code[code]
            criteria.append(
                {
                    "criterion_id": code,
                    "value": _value(item["answer"]),
                    "rationale": _rationale(item),
                    "evidence_turns": _evidence(item),
                }
            )
        critical = next(c["value"] for c in criteria if c["criterion_id"] == "critical")
        results.append(
            {
                "conversation_id": conversation_id,
                "status": "ok",
                "criteria": criteria,
                "score": {"final_score": layer["total"], "critical_flag": critical},
            }
        )
    if unevaluated and not allow_partial:
        raise ExportError(
            f"Не оценены версией {version} ({len(unevaluated)} из {len(ids)}): "
            f"{', '.join(unevaluated[:10])}{' ...' if len(unevaluated) > 10 else ''}. "
            "Запустите оценку или передайте allow_partial для черновика."
        )
    mode = "hybrid" if len(modes) > 1 else (modes.pop() if modes else "external_api")
    return {
        "schema_version": SCHEMA_VERSION,
        "team_name": get_settings().team_name,
        "model": {"mode": mode, "name": ", ".join(names) or "нет успешных оценок"},
        "results": results,
    }


def _error_entry(conversation_id: str, error: str) -> dict[str, Any]:
    return {"conversation_id": conversation_id, "status": "error", "criteria": [], "score": None, "error": error}


def validate_results(doc: Any, expected_n: int | None = None) -> list[str]:
    """Возвращает список нарушений правил приложения. Пустой список означает, что файл годен."""
    if not isinstance(doc, dict):
        return ["Корень файла должен быть объектом"]
    problems: list[str] = []
    if doc.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"schema_version должен быть {SCHEMA_VERSION!r}")
    if not isinstance(doc.get("team_name"), str) or not doc.get("team_name"):
        problems.append("team_name должен быть непустой строкой")
    model = doc.get("model")
    if not isinstance(model, dict) or model.get("mode") not in VALID_MODES or not model.get("name"):
        problems.append("model: нужны name и mode из local, external_api, hybrid")
    results = doc.get("results")
    if not isinstance(results, list):
        return problems + ["results должен быть массивом"]
    if expected_n is not None and len(results) != expected_n:
        problems.append(f"Ожидалось записей: {expected_n}, в файле: {len(results)}")
    seen: set[str] = set()
    for index, entry in enumerate(results):
        if not isinstance(entry, dict):
            problems.append(f"results[{index}] должен быть объектом")
            continue
        cid = entry.get("conversation_id")
        where = cid or f"results[{index}]"
        if not cid:
            problems.append(f"{where}: нет conversation_id")
        elif cid in seen:
            problems.append(f"{where}: повторяющийся conversation_id")
        else:
            seen.add(cid)
        status = entry.get("status")
        if status == "error":
            if entry.get("criteria") != [] or entry.get("score") is not None or not entry.get("error"):
                problems.append(f"{where}: при status=error нужны пустой criteria, score=null и причина в error")
        elif status == "ok":
            problems.extend(_check_ok_entry(where, entry))
        else:
            problems.append(f"{where}: status должен быть ok или error")
    return problems


def _check_ok_entry(where: str, entry: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    criteria = entry.get("criteria")
    if not isinstance(criteria, list):
        return [f"{where}: criteria должен быть массивом"]
    codes = [c.get("criterion_id") for c in criteria if isinstance(c, dict)]
    if sorted(map(str, codes)) != sorted(REQUIRED_CRITERIA):
        problems.append(f"{where}: нужны все 8 критериев ровно по одному разу, есть {codes}")
    values: dict[str, Any] = {}
    for item in criteria:
        if not isinstance(item, dict):
            problems.append(f"{where}: критерий должен быть объектом")
            continue
        code = item.get("criterion_id")
        rule = REQUIRED_CRITERIA.get(code)
        if rule is None:
            problems.append(f"{where}: неизвестный критерий {code}")
            continue
        value = item.get("value")
        values[code] = value
        if value is None:
            if not rule["nullable"]:
                problems.append(f"{where}/{code}: N/A недопустим")
        elif rule["kind"] == "bool":
            if not isinstance(value, bool):
                problems.append(f"{where}/{code}: значение должно быть true или false")
        elif isinstance(value, bool) or value not in rule["values"]:
            problems.append(f"{where}/{code}: значение должно быть из {sorted(rule['values'])}")
        if not isinstance(item.get("rationale"), str):
            problems.append(f"{where}/{code}: rationale должен быть строкой")
        turns = item.get("evidence_turns")
        if not isinstance(turns, list) or any(
            not isinstance(t, int) or isinstance(t, bool) or t < 1 for t in turns
        ):
            problems.append(f"{where}/{code}: evidence_turns должен содержать целые номера от 1")
    score = entry.get("score")
    if not isinstance(score, dict):
        return problems + [f"{where}: нет score"]
    final = score.get("final_score")
    if final is None:
        # Допустимо, только если все критерии с весом получили N/A.
        if any(values.get(c) is not None for c, r in REQUIRED_CRITERIA.items() if r["weight"]):
            problems.append(f"{where}: final_score пуст, хотя есть применимые критерии")
    elif isinstance(final, bool) or not isinstance(final, (int, float)) or not 0 <= final <= 100:
        problems.append(f"{where}: final_score должен быть числом от 0 до 100")
    elif round(final, 2) != final:
        problems.append(f"{where}: final_score должен быть округлён до двух знаков")
    if "critical" in values and score.get("critical_flag") != values["critical"]:
        problems.append(f"{where}: critical_flag должен совпадать со значением critical")
    return problems


def check_against_data(doc: dict[str, Any], checklist: Checklist) -> list[str]:
    """Сверка с данными: ID существует, номера реплик в границах, итог совпадает с пересчётом."""
    problems: list[str] = []
    ids_by_code = {c.export_id: c.id for c in checklist.criteria if c.export_id}
    for entry in doc.get("results", []):
        cid = entry.get("conversation_id")
        try:
            conversation = repo.get_conversation(cid)
        except repo.NotFound:
            problems.append(f"{cid}: такого диалога нет в импортированных данных")
            continue
        if entry.get("status") != "ok":
            continue
        n_turns = len(conversation["turns"])
        answers: dict[str, str] = {}
        for item in entry["criteria"]:
            code = item["criterion_id"]
            value = item["value"]
            answers[ids_by_code[code]] = (
                "NA" if value is None else ("Y" if value is True else "N" if value is False else str(value))
            )
            outside = [t for t in item["evidence_turns"] if t > n_turns]
            if outside:
                problems.append(f"{cid}/{code}: реплик {n_turns}, а указаны номера {outside}")
        recomputed = compute_totals(checklist, answers, conversation["channel"])["total"]
        if recomputed != entry["score"]["final_score"]:
            problems.append(
                f"{cid}: final_score {entry['score']['final_score']}, а пересчёт даёт {recomputed}"
            )
    return problems


def results_path(set_name: str) -> Path:
    if set_name not in ALLOWED_SETS:
        raise ExportError(f"Набор должен быть одним из: {', '.join(ALLOWED_SETS)}")
    return RESULTS_DIR / set_name / "results.json"


def write_results(doc: dict[str, Any], target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return target
