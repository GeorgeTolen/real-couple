FROM python:3.12-slim

ENV PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Интерфейс уже собран и лежит в frontend/dist, Node в образе не нужен.
COPY backend backend
COPY checklists checklists
COPY frontend/dist frontend/dist

WORKDIR /srv/backend
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
