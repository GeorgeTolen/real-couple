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
    "c02-octagon-ru-009.png": ("octagon-ru-009.webp", 1152, 92),
    "05-call-p4-ru-001.png": ("call-p4-ru-001.webp", 1760, 84),
    # слайд «Демо»: окно приложения
    "06-gross.png": ("demo-gross.webp", 1080, 72),
    "02-chat-ru-009-identification.png": ("demo-chat.webp", 1080, 72),
    "08-checklists.png": ("demo-checklists.webp", 1080, 72),
    "11-map-operators.png": ("demo-map.webp", 1080, 72),
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
