from collections import defaultdict
from statistics import mean

from fastapi import APIRouter

from .. import repo
from ..db import connect

router = APIRouter()


def _resolve_version(checklist_id: str, version: int | None) -> int | None:
    if version is not None:
        return version
    with connect() as conn:
        row = conn.execute(
            "SELECT MAX(checklist_version) AS v FROM evaluations WHERE checklist_id=? AND status='ok'",
            (checklist_id,),
        ).fetchone()
    return row["v"]


@router.get("/stats")
def stats(
    checklist_id: str = "freedom-default", version: int | None = None,
    channel: str | None = None, language: str | None = None, group_id: str | None = None,
):
    """Сводка по последним успешным оценкам одной версии чек-листа, с учётом решений проверяющих."""
    version = _resolve_version(checklist_id, version)
    ids = repo.group_conversation_ids(group_id) if group_id else repo.all_conversation_ids()
    views = []
    for conversation_id in ids:
        conversation = repo.get_conversation(conversation_id)
        if channel and conversation["channel"] != channel:
            continue
        if language and conversation["language"] != language:
            continue
        evaluation_id = repo.latest_evaluation_id(conversation_id, checklist_id, version, only_ok=True)
        if evaluation_id:
            views.append((conversation, repo.build_view(evaluation_id)))

    criteria: dict[str, dict] = {}
    operators: dict[str, dict] = defaultdict(lambda: {"scores": [], "gross": 0, "lost": defaultdict(float)})
    for conversation, view in views:
        final = view["final"]
        name = conversation["operator"] or "Не определён"
        operator = operators[name]
        if final["total"] is not None:
            operator["scores"].append(final["total"])
        operator["gross"] += int(final["gross_violation"])
        for item in final["criteria"]:
            row = criteria.setdefault(
                item["criterion_id"],
                {"criterion_id": item["criterion_id"], "title": item["title"], "weight": item["weight"],
                 "type": item["type"], "yes": 0, "no": 0, "partial": 0, "na": 0, "agree": 0, "disagree": 0},
            )
            answer = item["answer"]
            if answer == "NA":
                row["na"] += 1
            elif item["type"] == "scale":
                top = max(s["value"] for s in item["scale"])
                key = "yes" if int(answer) == top else ("no" if int(answer) == 0 else "partial")
                row[key] += 1
            else:
                row["yes" if answer == "Y" else "no"] += 1
            if item["agreement"] == "full":
                row["agree"] += 1
            elif item["agreement"] in ("arbitrated", "unresolved"):
                row["disagree"] += 1
            if item["max_points"] and item["earned_points"] is not None:
                operator["lost"][item["title"]] += item["max_points"] - item["earned_points"]

    decisions = changed = 0
    for _, view in views:
        for appeal in view["appeals"]:
            if appeal.get("decision"):
                decisions += 1
                changed += int(appeal["decision"]["action"] == "change")

    scores = [v["final"]["total"] for _, v in views if v["final"]["total"] is not None]
    operator_rows = []
    for name, data in sorted(operators.items(), key=lambda kv: -len(kv[1]["scores"])):
        worst = max(data["lost"].items(), key=lambda kv: kv[1], default=(None, 0))
        operator_rows.append(
            {
                "operator": name, "dialogs": len(data["scores"]),
                "avg_score": round(mean(data["scores"]), 2) if data["scores"] else None,
                "worst_criterion": worst[0] if worst[1] > 0 else None, "gross": data["gross"],
            }
        )
    costs = [v["cost_usd"] for _, v in views]
    latencies = [v["latency_ms"] for _, v in views]
    return {
        "checklist_id": checklist_id, "checklist_version": version,
        "evaluated": len(views), "total_conversations": len(ids),
        "avg_score": round(mean(scores), 2) if scores else None,
        "needs_review": sum(v["needs_review"] for _, v in views),
        "gross": sum(v["final"]["gross_violation"] for _, v in views),
        "criteria": list(criteria.values()), "operators": operator_rows,
        "decisions": decisions, "decisions_changed": changed,
        "models": views[-1][1]["models"] if views else {},
        "avg_cost_usd": round(mean(costs), 5) if costs else None,
        "total_cost_usd": round(sum(costs), 4), "avg_latency_ms": round(mean(latencies)) if latencies else None,
    }
