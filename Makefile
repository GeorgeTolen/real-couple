export PYTHONUTF8 := 1

ifeq ($(OS),Windows_NT)
PY := ../.venv/Scripts/python
ROOT_PY := .venv/Scripts/python
else
PY := ../.venv/bin/python
ROOT_PY := .venv/bin/python
endif

GROUP ?= DEV

.PHONY: install run test build-front import bench evaluate-all export-dev validate-dev prod rehearsal

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

# Час контроля: импорт, оценка, экспорт, проверка, коммит и пуш results/prod/results.json.
prod:
	cd backend && $(PY) -m app.cli prod --group $(GROUP)

# Репетиция без коммита и пуша: файл пишется в data/rehearsal.
rehearsal:
	cd backend && $(PY) -m app.cli prod --group $(GROUP) --limit 10 --dry-run
