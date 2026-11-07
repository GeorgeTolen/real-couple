"""SQLite: схема, соединения и загрузка чек-листа из файла."""
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import CHECKLISTS_DIR, get_settings

_db_override: Path | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  language TEXT NOT NULL,
  audio_url TEXT,
  transcript_json TEXT NOT NULL,
  transcript_hash TEXT NOT NULL,
  operator_name TEXT,
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (group_id, conversation_id)
);
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ui',
  source_hash TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  transcript_hash TEXT NOT NULL,
  checklist_id TEXT NOT NULL,
  checklist_version INTEGER NOT NULL,
  mode TEXT NOT NULL,
  models_json TEXT NOT NULL,
  prompt_version TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  total_score REAL,
  sections_json TEXT,
  gross_violation INTEGER NOT NULL DEFAULT 0,
  gross_items_json TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  spent_usd REAL NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  signals_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_eval_conv
  ON evaluations(conversation_id, checklist_id, checklist_version);
CREATE TABLE IF NOT EXISTS criterion_results (
  evaluation_id INTEGER NOT NULL,
  criterion_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  earned_points REAL,
  max_points REAL,
  weighted_points REAL,
  weight REAL NOT NULL,
  normalized_weight REAL,
  reasoning TEXT,
  evidence_ids_json TEXT,
  checked_range_json TEXT,
  na_reason TEXT,
  agreement TEXT,
  judge_answers_json TEXT,
  source TEXT NOT NULL DEFAULT 'ai',
  PRIMARY KEY (evaluation_id, criterion_id)
);
CREATE TABLE IF NOT EXISTS appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL,
  criterion_id TEXT NOT NULL,
  comment TEXT NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appeal_id INTEGER NOT NULL,
  reviewer TEXT NOT NULL,
  action TEXT NOT NULL,
  new_answer TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  in_progress INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  params_json TEXT NOT NULL,
  recent_json TEXT NOT NULL DEFAULT '[]',
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS llm_cache (
  key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  response_json TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def use_database(path: Path | None) -> None:
    """Подменяет файл БД. Нужно только тестам."""
    global _db_override
    _db_override = path


def db_file() -> Path:
    return _db_override or get_settings().db_file


@contextmanager
def connect():
    path = db_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        columns = {r["name"] for r in conn.execute("PRAGMA table_info(criterion_results)")}
        if "category" not in columns:
            conn.execute("ALTER TABLE criterion_results ADD COLUMN category TEXT")
        # Задачи прошлого запуска уже не выполняются: процесс завершён.
        conn.execute(
            "UPDATE jobs SET status='interrupted', in_progress=0, finished_at=? "
            "WHERE status IN ('queued','running')",
            (now_iso(),),
        )
    seed_checklists()


def seed_checklists() -> None:
    """Каждая правка файла чек-листа становится новой неизменяемой версией."""
    for path in sorted(CHECKLISTS_DIR.glob("*.json")):
        raw = path.read_text(encoding="utf-8")
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        config = json.loads(raw)
        cid = config["id"]
        with connect() as conn:
            seen = conn.execute(
                "SELECT source_hash FROM checklists WHERE id=? AND source='file' "
                "ORDER BY version DESC LIMIT 1",
                (cid,),
            ).fetchone()
            if seen and seen["source_hash"] == digest:
                continue
            latest = conn.execute(
                "SELECT COALESCE(MAX(version),0) AS v FROM checklists WHERE id=?", (cid,)
            ).fetchone()["v"]
            version = latest + 1
            config["version"] = version
            conn.execute(
                "INSERT INTO checklists(id,version,name,config_json,source,source_hash,created_at) "
                "VALUES(?,?,?,?,'file',?,?)",
                (
                    cid,
                    version,
                    config["name"],
                    json.dumps(config, ensure_ascii=False),
                    digest,
                    now_iso(),
                ),
            )
