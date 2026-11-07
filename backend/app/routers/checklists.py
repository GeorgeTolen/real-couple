from fastapi import APIRouter, HTTPException

from .. import export, repo
from ..schemas import Checklist, Criterion

router = APIRouter()


def _card(checklist: Checklist) -> dict:
    return {
        **checklist.model_dump(),
        "weight_sum": sum(c.weight for c in checklist.criteria),
        "missing_export_ids": export.missing_export_ids(checklist),
    }


@router.get("/checklists")
def list_checklists():
    return repo.list_checklists()


@router.get("/checklists/{checklist_id}")
def get_checklist(checklist_id: str, version: int | None = None):
    checklist = repo.get_checklist(checklist_id, version)
    versions = next((c["versions"] for c in repo.list_checklists() if c["id"] == checklist_id), [])
    return {**_card(checklist), "versions": versions, "latest_version": versions[0]["version"]}


@router.post("/checklists", status_code=201)
def create_checklist(config: Checklist):
    if any(c["id"] == config.id for c in repo.list_checklists()):
        raise HTTPException(409, f"Чек-лист {config.id} уже существует, сохраните новую версию")
    return _card(repo.save_new_version(config))


@router.post("/checklists/{checklist_id}/versions", status_code=201)
def create_version(checklist_id: str, config: Checklist):
    if config.id != checklist_id:
        raise HTTPException(400, "id в теле запроса не совпадает с адресом")
    repo.get_checklist(checklist_id)
    return _card(repo.save_new_version(config))


@router.post("/checklists/{checklist_id}/criteria/{criterion_id}/replace", status_code=201)
def replace_criterion(checklist_id: str, criterion_id: str, replacement: Criterion):
    return _card(repo.replace_criterion(checklist_id, criterion_id, replacement))
