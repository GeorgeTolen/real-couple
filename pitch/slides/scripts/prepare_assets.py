"""Готовит снимки из docs/screens/2x для встраивания в презентацию.

Запуск из pitch/slides:  python scripts/prepare_assets.py
Нужен Pillow (pip install pillow). Результат: src/assets/*.webp
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "docs" / "screens" / "2x"
OUT = Path(__file__).resolve().parents[1] / "src" / "assets"

# имя исходника -> (имя результата, ширина, качество)
JOBS = {
    # слайды 08 и 09: скриншоты в исходном размере, без обрезки, текст реплик читается с 3 метров
    "14-chat-ru-014-words.png": ("shot-ru-014.webp", 1810, 92),
    "15-chat-ru-015-words.png": ("shot-ru-015.webp", 1905, 92),
    # резерв R2: звонок и Whisper
    "05-call-p4-ru-001.png": ("call-p4-ru-001.webp", 1760, 84),
    # резерв R3: октагон ru-020 с N/A
    "c03-octagon-ru-020.png": ("octagon-ru-020.webp", 1152, 90),
    # резерв R5: апелляции и редактор чек-листа
    "07-appeals.png": ("demo-appeals.webp", 1440, 82),
    "08-checklists.png": ("demo-checklists.webp", 1440, 82),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (target, width, quality) in JOBS.items():
        image = Image.open(SRC / name).convert("RGB")
        if image.width > width:
            height = round(image.height * width / image.width)
            image = image.resize((width, height), Image.LANCZOS)
        path = OUT / target
        image.save(path, "WEBP", quality=quality, method=6)
        print(f"{name} -> {path.name} {image.size} {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
