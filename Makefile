export PYTHONUTF8 := 1

# Абсолютный путь с прямыми слэшами работает и в cmd, и в sh.
ifeq ($(OS),Windows_NT)
PY := "$(CURDIR)/.venv/Scripts/python.exe"
else
PY := "$(CURDIR)/.venv/bin/python"
endif
ROOT_PY := $(PY)

GROUP ?= DEV

.PHONY: holdout install-whisper whisper install run test build-front import bench evaluate-all export-dev validate-dev prod rehearsal

install:
	python -m venv .venv
	$(ROOT_PY) -m pip install -r backend/requirements.txt

run:
	cd backend && $(PY) -m uvicorn app.main:app --host 0.0.0.0 --port 8000

test:
	cd backend && $(PY) -m pytest -q

build-front:
	cd frontend && npm install && npm run build

import:
	cd backend && $(PY) -m app.cli import --group $(GROUP)

bench:
	cd backend && $(PY) -m app.cli bench --mode ensemble

evaluate-all:
	cd backend && $(PY) -m app.cli evaluate --group DEV --only-missing

export-dev:
	cd backend && $(PY) -m app.cli export --set dev --group DEV

validate-dev:
	cd backend && $(PY) -m app.cli validate --set dev --expect 65

install-whisper:
	$(ROOT_PY) -m pip install -r backend/requirements-whisper.txt

whisper:
	cd backend && $(PY) -m app.cli whisper

# Контрольный набор вне калибровки: отдельная база, отчёт в bench/holdout.
holdout:
	cd backend && $(PY) -m app.cli holdout

# Час контроля: импорт, оценка, экспорт, проверка, коммит и пуш results/prod/results.json.
prod:
	cd backend && $(PY) -m app.cli prod --group $(GROUP)

# Репетиция без коммита и пуша: файл пишется в data/rehearsal.
rehearsal:
	cd backend && $(PY) -m app.cli prod --group $(GROUP) --limit 10 --dry-run
