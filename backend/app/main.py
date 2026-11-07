"""FastAPI: API под /api и собранный интерфейс на /."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import repo
from .config import FRONTEND_DIST
from .db import init_db
from .llm import LLMError
from .routers import appeals, checklists, conversations, evaluations, export, jobs, models, stats

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="CQA Freedom Broker", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(repo.NotFound)
async def _not_found(_: Request, exc: repo.NotFound):
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.exception_handler(ValueError)
async def _bad_request(_: Request, exc: ValueError):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(LLMError)
async def _llm_error(_: Request, exc: LLMError):
    return JSONResponse({"detail": str(exc)}, status_code=502)


@app.get("/api/health")
def health():
    return {"status": "ok"}


for module in (conversations, checklists, evaluations, appeals, jobs, export, models, stats):
    app.include_router(module.router, prefix="/api")

if (FRONTEND_DIST / "index.html").exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def _no_frontend():
        return "<h1>CQA API</h1><p>Интерфейс не собран. API: <a href='/docs'>/docs</a></p>"
