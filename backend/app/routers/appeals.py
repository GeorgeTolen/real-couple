from fastapi import APIRouter

from .. import repo
from ..schemas import DecisionRequest

router = APIRouter()


@router.get("/appeals")
def list_appeals(status: str | None = None):
    return repo.list_appeals(status)


@router.get("/appeals/{appeal_id}")
def get_appeal(appeal_id: int):
    return repo.get_appeal(appeal_id)


@router.post("/appeals/{appeal_id}/decision")
def decide(appeal_id: int, request: DecisionRequest):
    appeal = repo.decide_appeal(
        appeal_id, request.reviewer, request.action, request.new_answer, request.reason
    )
    return {"appeal": appeal, "evaluation": repo.build_view(appeal["evaluation_id"])}
