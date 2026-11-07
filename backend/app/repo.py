"""Чтение и запись доменных сущностей. Исходная оценка неизменна, финальный слой считается из решений."""
import json
import re
from typing import Any

from .audio import add_audio_time
from .db import connect, now_iso
from .normalize import mark_duplicates, normalize_transcript
from .schemas import Checklist, Criterion
from .scoring import allowed_answers, compute_totals, criteria_for_channel


class NotFound(LookupError):
    pass


# ---------- Диалоги ----------

def get_conversation(conversation_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id=?", (conversation_id,)).fetchone()
    if not row:
        raise NotFound(f"Диалог {conversation_id} не найден")
    return _conversation(row)


def _conversation(row) -> dict[str, Any]:
    raw = json.loads(row["transcript_json"])
    turns = normalize_transcript(raw)
    if row["channel"] == "voice call":
        turns = mark_duplicates(add_audio_time(turns))
    return {
        "id": row["id"],
        "channel": row["channel"],
        "language": row["language"],
        "audio_url": row["audio_url"],
        "operator": row["operator_name"],
        "transcript_hash": row["transcript_hash"],
        "imported_at": row["imported_at"],
        "started_at": raw[0]["timestamp"] if raw and "T" in str(raw[0].get("timestamp")) else None,
        "turns": turns,
    }


def group_conversation_ids(group_id: str) -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT conversation_id FROM group_members WHERE group_id=? ORDER BY position", (group_id,)
        ).fetchall()
    return [r["conversation_id"] for r in rows]


def all_conversation_ids() -> list[str]:
    with connect() as conn:
        rows = conn.execute("SELECT id FROM conversations ORDER BY id").fetchall()
    return [r["id"] for r in rows]


def list_groups() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT group_id, COUNT(*) AS total FROM group_members GROUP BY group_id ORDER BY group_id"
        ).fetchall()
    return [dict(r) for r in rows]


# ---------- Чек-листы ----------

def get_checklist(checklist_id: str, version: int | None = None) -> Checklist:
    with connect() as conn:
        if version is None:
            row = conn.execute(
                "SELECT config_json FROM checklists WHERE id=? ORDER BY version DESC LIMIT 1",
                (checklist_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT config_json FROM checklists WHERE id=? AND version=?",
                (checklist_id, version),
            ).fetchone()
    if not row:
        raise NotFound(f"Чек-лист {checklist_id} версии {version or 'последней'} не найден")
    return Checklist.model_validate_json(row["config_json"])


def list_checklists() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, version, name, created_at FROM checklists ORDER BY id, version DESC"
        ).fetchall()
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = grouped.setdefault(
            row["id"], {"id": row["id"], "name": row["name"], "latest_version": row["version"], "versions": []}
        )
        entry["versions"].append({"version": row["version"], "name": row["name"], "created_at": row["created_at"]})
    return list(grouped.values())


def save_new_version(config: Checklist) -> Checklist:
    """Версии неизменяемы: любая правка получает следующий номер."""
    with connect() as conn:
        latest = conn.execute(
            "SELECT COALESCE(MAX(version),0) AS v FROM checklists WHERE id=?", (config.id,)
        ).fetchone()["v"]
        saved = config.model_copy(update={"version": latest + 1})
        conn.execute(
            "INSERT INTO checklists(id,version,name,config_json,source,created_at) VALUES(?,?,?,?,'ui',?)",
            (saved.id, saved.version, saved.name, saved.model_dump_json(), now_iso()),
        )
    return saved


def add_criterion(checklist_id: str, criterion: Criterion) -> Checklist:
    current = get_checklist(checklist_id)
    data = current.model_dump()
    data["criteria"].append(criterion.model_dump())
    return save_new_version(Checklist.model_validate(data))


def patch_criterion(checklist_id: str, criterion_id: str, fields: dict[str, Any]) -> Checklist:
    current = get_checklist(checklist_id)
    if not current.criterion(criterion_id):
        raise NotFound(f"Критерий {criterion_id} не найден")
    data = current.model_dump()
    data["criteria"] = [
        {**c, **fields} if c["id"] == criterion_id else c for c in data["criteria"]
    ]
    return save_new_version(Checklist.model_validate(data))


def replace_criterion(checklist_id: str, criterion_id: str, replacement: Criterion) -> Checklist:
    current = get_checklist(checklist_id)
    if not current.criterion(criterion_id):
        raise NotFound(f"Критерий {criterion_id} не найден")
    criteria = [replacement if c.id == criterion_id else c for c in current.criteria]
    rules = [
        r for r in current.review_rules
        if criterion_id not in (r.when_criterion, r.dispute) or replacement.id == criterion_id
    ]
    return save_new_version(
        Checklist.model_validate(
            {**current.model_dump(), "criteria": [c.model_dump() for c in criteria],
             "review_rules": [r.model_dump() for r in rules]}
        )
    )


# ---------- Оценки ----------

def insert_evaluation(
    *, conversation: dict, checklist: Checklist, mode: str, models: dict, prompt_version: str | None,
    status: str, error: str | None = None, totals: dict | None = None, criteria: dict | None = None,
    needs_review: bool = False, cost_usd: float = 0, spent_usd: float = 0, tokens_in: int = 0,
    tokens_out: int = 0, latency_ms: int = 0, signals: dict | None = None,
) -> int:
    totals = totals or {}
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO evaluations(conversation_id,transcript_hash,checklist_id,checklist_version,mode,"
            "models_json,prompt_version,status,error,created_at,total_score,sections_json,gross_violation,"
            "gross_items_json,needs_review,cost_usd,spent_usd,tokens_in,tokens_out,latency_ms,signals_json) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                conversation["id"], conversation["transcript_hash"], checklist.id, checklist.version, mode,
                json.dumps(models, ensure_ascii=False), prompt_version, status, error, now_iso(),
                totals.get("total"), json.dumps(totals.get("sections", []), ensure_ascii=False),
                int(bool(totals.get("gross_violation"))), json.dumps(totals.get("gross_items", [])),
                int(needs_review), cost_usd, spent_usd, tokens_in, tokens_out, latency_ms,
                json.dumps(signals or {}, ensure_ascii=False),
            ),
        )
        evaluation_id = cursor.lastrowid
        points = {p["criterion_id"]: p for p in totals.get("per_criterion", [])}
        for cid, item in (criteria or {}).items():
            point = points.get(cid, {})
            conn.execute(
                "INSERT INTO criterion_results(evaluation_id,criterion_id,answer,earned_points,max_points,"
                "weighted_points,weight,normalized_weight,reasoning,evidence_ids_json,checked_range_json,"
                "na_reason,agreement,judge_answers_json,category,source) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ai')",
                (
                    evaluation_id, cid, item["answer"], point.get("earned_points"), point.get("max_points"),
                    point.get("weighted_points"), point.get("weight", 0), point.get("normalized_weight"),
                    item["reasoning"], json.dumps(item["evidence_ids"]), json.dumps(item["checked_range"]),
                    item["reasoning"] if item["answer"] == "NA" else None, item["agreement"],
                    json.dumps(item["judge_answers"], ensure_ascii=False), item.get("category"),
                ),
            )
    return evaluation_id


def _load_appeals(conn, evaluation_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if not evaluation_ids:
        return {}
    marks = ",".join("?" * len(evaluation_ids))
    appeals = conn.execute(
        f"SELECT * FROM appeals WHERE evaluation_id IN ({marks}) ORDER BY id", evaluation_ids
    ).fetchall()
    ids = [a["id"] for a in appeals]
    decisions: dict[int, dict[str, Any]] = {}
    if ids:
        marks = ",".join("?" * len(ids))
        for row in conn.execute(f"SELECT * FROM decisions WHERE appeal_id IN ({marks}) ORDER BY id", ids):
            decisions[row["appeal_id"]] = dict(row)
    result: dict[int, list[dict[str, Any]]] = {}
    for appeal in appeals:
        item = dict(appeal)
        item["decision"] = decisions.get(appeal["id"])
        result.setdefault(appeal["evaluation_id"], []).append(item)
    return result


def _final_answers(rows: list[dict[str, Any]], appeals: list[dict[str, Any]]) -> tuple[dict[str, str], dict[str, dict]]:
    answers = {r["criterion_id"]: r["answer"] for r in rows}
    overrides: dict[str, dict] = {}
    for appeal in appeals:
        decision = appeal.get("decision")
        if decision and decision["action"] == "change" and decision["new_answer"] is not None:
            answers[appeal["criterion_id"]] = decision["new_answer"]
            overrides[appeal["criterion_id"]] = decision
    return answers, overrides


def build_view(evaluation_id: int) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM evaluations WHERE id=?", (evaluation_id,)).fetchone()
        if not row:
            raise NotFound(f"Оценка {evaluation_id} не найдена")
        rows = [
            dict(r) for r in conn.execute(
                "SELECT * FROM criterion_results WHERE evaluation_id=?", (evaluation_id,)
            )
        ]
        appeals = _load_appeals(conn, [evaluation_id]).get(evaluation_id, [])
    return _view(row, rows, appeals)


def _view(row, rows: list[dict[str, Any]], appeals: list[dict[str, Any]]) -> dict[str, Any]:
    conversation = get_conversation(row["conversation_id"])
    channel = conversation["channel"]
    checklist = get_checklist(row["checklist_id"], row["checklist_version"])
    base = {
        "id": row["id"], "conversation_id": row["conversation_id"], "checklist_id": row["checklist_id"],
        "checklist_version": row["checklist_version"], "checklist_name": checklist.name,
        "mode": row["mode"], "models": json.loads(row["models_json"]), "prompt_version": row["prompt_version"],
        "status": row["status"], "error": row["error"], "created_at": row["created_at"],
        "needs_review": bool(row["needs_review"]), "cost_usd": row["cost_usd"], "tokens_in": row["tokens_in"],
        "tokens_out": row["tokens_out"], "latency_ms": row["latency_ms"],
        "signals": json.loads(row["signals_json"] or "{}"), "appeals": appeals,
        "decisions": [a["decision"] for a in appeals if a.get("decision")],
    }
    if row["status"] != "ok":
        return {**base, "original": None, "final": None}

    by_id = {r["criterion_id"]: r for r in rows}
    criteria_view = []
    for criterion in criteria_for_channel(checklist, channel):
        result = by_id.get(criterion.id)
        if not result:
            continue
        criteria_view.append(
            {
                "criterion_id": criterion.id, "title": criterion.title, "section": criterion.section,
                "description": criterion.description, "export_id": criterion.export_id,
                "type": criterion.type, "scale": [s.model_dump() for s in criterion.scale or []],
                "allow_na": criterion.allow_na, "allowed_answers": allowed_answers(criterion),
                "weight": result["weight"], "answer": result["answer"],
                "earned_points": result["earned_points"], "max_points": result["max_points"],
                "weighted_points": result["weighted_points"], "normalized_weight": result["normalized_weight"],
                "reasoning": result["reasoning"], "evidence_ids": json.loads(result["evidence_ids_json"] or "[]"),
                "checked_range": json.loads(result["checked_range_json"] or "null"),
                "na_reason": result["na_reason"], "agreement": result["agreement"],
                "judge_answers": json.loads(result["judge_answers_json"] or "{}"), "source": result["source"],
                "category": result["category"],
            }
        )
    original = {
        "total": row["total_score"], "sections": json.loads(row["sections_json"] or "[]"),
        "gross_violation": bool(row["gross_violation"]),
        "gross_items": json.loads(row["gross_items_json"] or "[]"), "criteria": criteria_view,
    }
    answers, overrides = _final_answers(rows, appeals)
    totals = compute_totals(checklist, answers, channel)
    points = {p["criterion_id"]: p for p in totals["per_criterion"]}
    final_criteria = []
    for item in criteria_view:
        point = points[item["criterion_id"]]
        decision = overrides.get(item["criterion_id"])
        final_criteria.append(
            {
                **item, "answer": point["answer"], "earned_points": point["earned_points"],
                "max_points": point["max_points"], "weighted_points": point["weighted_points"],
                "normalized_weight": point["normalized_weight"],
                "source": "reviewer" if decision else "ai",
                "decision_reason": decision["reason"] if decision else None,
                "original_answer": item["answer"],
            }
        )
    final = {
        "total": totals["total"], "sections": totals["sections"],
        "gross_violation": totals["gross_violation"], "gross_items": totals["gross_items"],
        "criteria": final_criteria,
    }
    return {
        **base, "original": original, "final": final,
        "score_drivers": score_drivers(final_criteria),
        "gross_reasons": gross_reasons(final_criteria, conversation["turns"]),
    }


def _failure_sentence(reasoning: str) -> str | None:
    """Модель сначала пишет, что хорошо, а сбой называет в конце: это последнее предложение со ссылкой."""
    for sentence in reversed(re.split(r"(?<=[.!?])\s+", reasoning or "")):
        if re.search(r"#\d+", sentence):
            return sentence
    return None


def _failure_turn(reasoning: str, evidence: list[int]) -> int | None:
    found = re.findall(r"#(\d+)", _failure_sentence(reasoning) or "")
    if found:
        return int(found[0])
    return evidence[0] if evidence else None


def score_drivers(criteria: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    """Критерии, снизившие итог из-за конкретного сбоя. Причина взята из reasoning, она не генерируется."""
    lost = []
    for item in criteria:
        if item["max_points"] is None or item["earned_points"] is None:
            continue
        points = round(item["max_points"] - item["earned_points"], 2)
        has_failure = "#" in (item["reasoning"] or "") or item["evidence_ids"]
        if points > 0 and (has_failure or item["source"] == "reviewer"):
            lost.append(
                {
                    "criterion_id": item["criterion_id"], "title": item["title"], "lost_points": points,
                    "reason": item.get("decision_reason") or _failure_sentence(item["reasoning"]) or item["reasoning"],
                    "turn": _failure_turn(item["reasoning"], item["evidence_ids"]),
                }
            )
    lost.sort(key=lambda row: -row["lost_points"])
    return lost[:limit]


def find_same_evaluation(
    conversation: dict[str, Any], checklist: Checklist, prompt_version: str, mode: str, models: dict[str, str]
):
    """Готовая оценка с теми же транскриптом, версией чек-листа, промптом и моделями."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, total_score, gross_violation, needs_review, models_json FROM evaluations "
            "WHERE conversation_id=? AND transcript_hash=? AND checklist_id=? AND checklist_version=? "
            "AND prompt_version=? AND mode=? AND status='ok' ORDER BY id DESC",
            (conversation["id"], conversation["transcript_hash"], checklist.id, checklist.version,
             prompt_version, mode),
        ).fetchall()
    for row in rows:
        if json.loads(row["models_json"]) == models:
            return row
    return None


def diff_evaluations(new_id: int, old_id: int | None = None) -> dict[str, Any]:
    """Что изменилось между оценками: ответы, итог и объяснения обеих версий."""
    new = build_view(new_id)
    if old_id is None:
        with connect() as conn:
            row = conn.execute(
                "SELECT id FROM evaluations WHERE conversation_id=? AND checklist_id=? AND checklist_version=? "
                "AND status='ok' AND id<? ORDER BY id DESC LIMIT 1",
                (new["conversation_id"], new["checklist_id"], new["checklist_version"], new_id),
            ).fetchone()
        if not row:
            return {"new_id": new_id, "old_id": None, "changes": [], "old_total": None,
                    "new_total": new["original"]["total"] if new["original"] else None}
        old_id = row["id"]
    old = build_view(old_id)
    if not new["original"] or not old["original"]:
        raise ValueError("Сравнивать можно только успешные оценки")
    before = {c["criterion_id"]: c for c in old["original"]["criteria"]}
    changes = []
    for item in new["original"]["criteria"]:
        previous = before.get(item["criterion_id"])
        if previous and previous["answer"] != item["answer"]:
            changes.append(
                {
                    "criterion_id": item["criterion_id"], "title": item["title"],
                    "old_answer": previous["answer"], "new_answer": item["answer"],
                    "old_reasoning": previous["reasoning"], "new_reasoning": item["reasoning"],
                }
            )
    return {
        "new_id": new_id, "old_id": old_id, "changes": changes,
        "old_total": old["original"]["total"], "new_total": new["original"]["total"],
    }


def gross_reasons(criteria: list[dict[str, Any]], turns: list[dict]) -> list[dict[str, Any]]:
    """Грубые нарушения с типом и цитатой реплики: для экрана и фильтра."""
    reasons = []
    by_number = {t["n"]: t for t in turns}
    for item in criteria:
        if item["type"] != "flag" or item["answer"] != "Y":
            continue
        operator_turns = [
            n for n in item["evidence_ids"] if by_number.get(n, {}).get("speaker") == "operator"
        ]
        target = (operator_turns or item["evidence_ids"] or [None])[0]
        reasons.append(
            {
                "criterion_id": item["criterion_id"], "title": item["title"],
                "category": item.get("category"), "explanation": item["reasoning"],
                "turn": target, "quote": by_number[target]["text"] if target in by_number else None,
                "evidence_ids": item["evidence_ids"],
            }
        )
    return reasons


def semantic_key(criterion: Criterion) -> str:
    """То, что видит модель. Вес и код сдачи на ответ модели не влияют."""
    return criterion.model_dump_json(
        exclude={"weight", "export_id", "section", "channel_overrides", "map_axis"}
    )


def reusable_results(
    conversation: dict[str, Any], checklist: Checklist, mode: str
) -> tuple[dict[str, dict[str, Any]], dict[str, str]] | None:
    """Ответы прошлой версии чек-листа по критериям, формулировка которых не менялась."""
    with connect() as conn:
        row = conn.execute(
            "SELECT id, checklist_version FROM evaluations WHERE conversation_id=? AND checklist_id=? "
            "AND checklist_version<>? AND status='ok' AND mode=? AND transcript_hash=? "
            "ORDER BY checklist_version DESC, id DESC LIMIT 1",
            (conversation["id"], checklist.id, checklist.version, mode, conversation["transcript_hash"]),
        ).fetchone()
    if not row:
        return None
    previous = get_checklist(checklist.id, row["checklist_version"])
    if previous.general_rules != checklist.general_rules:
        return None
    channel = conversation["channel"]
    old = {c.id: semantic_key(c) for c in criteria_for_channel(previous, channel)}
    view = build_view(row["id"])
    items = {c["criterion_id"]: c for c in view["original"]["criteria"]}
    reused = {}
    for criterion in criteria_for_channel(checklist, channel):
        item = items.get(criterion.id)
        if item and old.get(criterion.id) == semantic_key(criterion):
            reused[criterion.id] = {
                key: item[key]
                for key in ("answer", "reasoning", "evidence_ids", "checked_range", "category",
                            "agreement", "judge_answers")
            }
    return reused, view["models"]


def latest_evaluation_id(
    conversation_id: str, checklist_id: str | None = None, version: int | None = None,
    only_ok: bool = False, transcript_hash: str | None = None,
) -> int | None:
    sql = "SELECT id FROM evaluations WHERE conversation_id=?"
    args: list[Any] = [conversation_id]
    if checklist_id:
        sql += " AND checklist_id=?"
        args.append(checklist_id)
    if version is not None:
        sql += " AND checklist_version=?"
        args.append(version)
    if only_ok:
        sql += " AND status='ok'"
    if transcript_hash:
        sql += " AND transcript_hash=?"
        args.append(transcript_hash)
    with connect() as conn:
        row = conn.execute(sql + " ORDER BY id DESC LIMIT 1", args).fetchone()
    return row["id"] if row else None


def conversation_status(view: dict[str, Any] | None) -> str:
    if not view or view["status"] != "ok":
        return "not_evaluated"
    states = [a["status"] for a in view["appeals"]]
    if "open" in states:
        return "appealed"
    if states:
        return "resolved"
    return "needs_review" if view["needs_review"] else "evaluated"


# ---------- Апелляции ----------

def create_appeal(evaluation_id: int, criterion_id: str, comment: str, author: str) -> dict[str, Any]:
    view = build_view(evaluation_id)
    if view["status"] != "ok":
        raise ValueError("Оценка завершилась ошибкой, оспаривать нечего")
    if not any(c["criterion_id"] == criterion_id for c in view["original"]["criteria"]):
        raise ValueError(f"В оценке нет критерия {criterion_id}")
    if any(a["criterion_id"] == criterion_id and a["status"] == "open" for a in view["appeals"]):
        raise ValueError("По этому критерию уже есть открытая апелляция")
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO appeals(evaluation_id,criterion_id,comment,author,status,created_at) "
            "VALUES(?,?,?,?,'open',?)",
            (evaluation_id, criterion_id, comment, author, now_iso()),
        )
    return get_appeal(cursor.lastrowid)


def _fragment(turns: list[dict], numbers: list[int], radius: int = 2) -> list[dict]:
    operator = [t["n"] for t in turns if t["speaker"] == "operator"]
    anchors = numbers or operator or [1]
    low, high = max(1, min(anchors) - radius), min(len(turns), max(anchors) + radius)
    return [t for t in turns if low <= t["n"] <= high]


def get_appeal(appeal_id: int) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM appeals WHERE id=?", (appeal_id,)).fetchone()
        if not row:
            raise NotFound(f"Апелляция {appeal_id} не найдена")
        decision = conn.execute("SELECT * FROM decisions WHERE appeal_id=? ORDER BY id DESC", (appeal_id,)).fetchone()
    view = build_view(row["evaluation_id"])
    original = next(c for c in view["original"]["criteria"] if c["criterion_id"] == row["criterion_id"])
    conversation = get_conversation(view["conversation_id"])
    numbers = list(original["evidence_ids"])
    if original["checked_range"]:
        numbers += original["checked_range"]
    return {
        **dict(row),
        "decision": dict(decision) if decision else None,
        "conversation_id": view["conversation_id"],
        "channel": conversation["channel"],
        "language": conversation["language"],
        "operator": conversation["operator"],
        "checklist_name": view["checklist_name"],
        "checklist_version": view["checklist_version"],
        "models": view["models"],
        "evaluation_created_at": view["created_at"],
        "original_criterion": original,
        "original_total": view["original"]["total"],
        "final_total": view["final"]["total"],
        "fragment": _fragment(conversation["turns"], numbers),
    }


def list_appeals(status: str | None = None) -> list[dict[str, Any]]:
    sql, args = "SELECT id FROM appeals", []
    if status:
        sql, args = sql + " WHERE status=?", [status]
    with connect() as conn:
        ids = [r["id"] for r in conn.execute(sql + " ORDER BY id DESC", args)]
    return [get_appeal(i) for i in ids]


def preview_change(evaluation_id: int, criterion_id: str, answer: str) -> dict[str, Any]:
    view = build_view(evaluation_id)
    if view["status"] != "ok":
        raise ValueError("Оценка завершилась ошибкой")
    conversation = get_conversation(view["conversation_id"])
    checklist = get_checklist(view["checklist_id"], view["checklist_version"])
    answers = {c["criterion_id"]: c["answer"] for c in view["final"]["criteria"]}
    if criterion_id not in answers:
        raise ValueError(f"В оценке нет критерия {criterion_id}")
    answers[criterion_id] = answer
    totals = compute_totals(checklist, answers, conversation["channel"])
    return {
        "before": view["final"]["total"], "after": totals["total"],
        "gross_violation": totals["gross_violation"], "sections": totals["sections"],
    }


def decide_appeal(appeal_id: int, reviewer: str, action: str, new_answer: str | None, reason: str) -> dict[str, Any]:
    appeal = get_appeal(appeal_id)
    if appeal["status"] != "open":
        raise ValueError("Апелляция уже закрыта")
    if action == "change":
        allowed = appeal["original_criterion"]["allowed_answers"]
        if new_answer not in allowed:
            raise ValueError(f"Новый ответ должен быть одним из: {', '.join(allowed)}")
    else:
        new_answer = None
    with connect() as conn:
        conn.execute(
            "INSERT INTO decisions(appeal_id,reviewer,action,new_answer,reason,created_at) VALUES(?,?,?,?,?,?)",
            (appeal_id, reviewer, action, new_answer, reason, now_iso()),
        )
        conn.execute("UPDATE appeals SET status='resolved' WHERE id=?", (appeal_id,))
    return get_appeal(appeal_id)

