"""Настройки приложения. Все пути строятся от корня репозитория (ROOT)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]
CHECKLISTS_DIR = ROOT / "checklists"
DATA_DIR = ROOT / "data"
AUDIO_DIR = DATA_DIR / "audio"
WHISPER_DIR = DATA_DIR / "whisper"
RESULTS_DIR = ROOT / "results"
FRONTEND_DIST = ROOT / "frontend" / "dist"
BENCH_DIR = ROOT / "bench"

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    openrouter_api_key: str = ""
    organizer_api_url: str = ""
    judge_a: str = "google/gemini-3.8-flash"
    judge_b: str = "openai/gpt-6.1-sol"
    arbiter: str = "google/gemini-4-argon"
    local_base_url: str = "http://localhost:11434/v1"
    local_model: str = ""
    llm_concurrency: int = 4
    db_path: str = "data/cqa.sqlite"
    team_name: str = "real-couple"
    ffmpeg_bin: str = "ffmpeg"
    whisper_model: str = "large-v3"
    whisper_device: str = "auto"
    whisper_compute_type: str = "float16"

    @property
    def db_file(self) -> Path:
        path = Path(self.db_path)
        return path if path.is_absolute() else ROOT / path

    @property
    def ffprobe_bin(self) -> str:
        path = Path(self.ffmpeg_bin)
        name = path.name.replace("ffmpeg", "ffprobe")
        return str(path.with_name(name)) if path.parent != Path(".") else name


@lru_cache
def get_settings() -> Settings:
    return Settings()
