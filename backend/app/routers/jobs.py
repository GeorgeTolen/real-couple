from fastapi import APIRouter

from .. import jobs

router = APIRouter()


@router.get("/jobs")
def list_jobs(limit: int = 10):
    return jobs.list_jobs(limit)


@router.get("/jobs/{job_id}")
def get_job(job_id: int):
    return jobs.get_job(job_id)


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: int):
    return jobs.request_cancel(job_id)
