"""Саунд-дизайн ролика: всё синтезируется кодом, без сэмплов и чужих лицензий.

Каждый звук привязан к глобальному кадру анимации (30 fps). Номера кадров те же, что
в src/scenes/*.tsx (там они записаны как G(кадр)), поэтому при правке тайминга сцены
надо поправить и событие здесь.

Запуск: python scripts/sound.py out/sound.wav
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parents[3]
SR = 48000
FPS = 30
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

# Стыки сцен (src/Video.tsx): шторка между мирами и растворение внутри мира
WIPES = [195, 555, 660, 735]
BLENDS = [75, 285, 405, 825]


def f2s(frame: float) -> float:
    return frame / FPS


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


class Bus:
    def __init__(self) -> None:
        self.x = np.zeros((2, N))

    def add(self, sig: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
        i = int(t * SR)
        if i >= N or i + len(sig) <= 0:
            return
        sig = sig[: N - i] if i >= 0 else sig[-i:][: N]
        i = max(i, 0)
        left = np.cos((pan + 1) * np.pi / 4)
        right = np.sin((pan + 1) * np.pi / 4)
        self.x[0, i : i + len(sig)] += sig * gain * left
        self.x[1, i : i + len(sig)] += sig * gain * right


def tt(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def env(seconds: float, attack: float, decay: float) -> np.ndarray:
    t = tt(seconds)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def filt(x: np.ndarray, kind: str, f, order: int = 2) -> np.ndarray:
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x)


def sweep_lp(x: np.ndarray, f0: float, f1: float, block: int = 256) -> np.ndarray:
    """Фильтр с плавно уходящей частотой среза (для свиста перехода)."""
    out = np.zeros_like(x)
    zi = np.zeros((1, 2))
    for k in range(0, len(x), block):
        p = k / max(len(x) - 1, 1)
        fc = f0 * (f1 / f0) ** p
        sos = butter(2, fc, btype='lowpass', fs=SR, output='sos')
        out[k : k + block], zi = sosfilt(sos, x[k : k + block], zi=zi)
    return out


# ---------------------------------------------------------------- инструменты

def pluck(f: float, seconds: float = 0.9, bright: float = 0.5) -> np.ndarray:
    """Мягкий щипок: синус с парой обертонов, как маримба без дерева."""
    t = tt(seconds)
    s = np.sin(2 * np.pi * f * t) + bright * 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.08) + 0.12 * np.sin(2 * np.pi * 4.01 * f * t) * np.exp(-t / 0.03)
    return s * env(seconds, 0.003, 0.28)


def bell(f: float, seconds: float = 2.4) -> np.ndarray:
    """Металлический звон монеты: негармонические парциалы."""
    t = tt(seconds)
    ratios = [1, 2.76, 5.40, 8.93]
    amps = [1, 0.45, 0.22, 0.1]
    decays = [1.1, 0.5, 0.25, 0.12]
    s = sum(a * np.sin(2 * np.pi * f * r * t + rng.random()) * np.exp(-t / d) for r, a, d in zip(ratios, amps, decays))
    return s * np.clip(t / 0.002, 0, 1)


def tick(f: float = 2600, gain: float = 1.0) -> np.ndarray:
    """Короткий щелчок разряда одометра."""
    t = tt(0.03)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [f * 0.7, f * 1.4]) * np.exp(-t / 0.004)
    return (0.6 * n + 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006)) * gain


def whoosh(seconds: float = 0.45, f0: float = 300, f1: float = 6000, rise: float = 0.65) -> np.ndarray:
    n = rng.standard_normal(int(seconds * SR))
    x = sweep_lp(n, f0, f1)
    t = tt(seconds)
    shape = np.where(t < seconds * rise, (t / (seconds * rise)) ** 2, np.exp(-(t - seconds * rise) / (seconds * 0.12)))
    return filt(x * shape, 'highpass', 120)


def thud(f0: float = 70, f1: float = 38, seconds: float = 0.6) -> np.ndarray:
    t = tt(seconds)
    freq = f1 + (f0 - f1) * np.exp(-t / 0.08)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * env(seconds, 0.004, 0.18)


def glide(f0: float, f1: float, seconds: float) -> np.ndarray:
    t = tt(seconds)
    freq = f0 * (f1 / f0) ** (t / seconds)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    s = np.sin(phase) + 0.3 * np.sin(2 * phase)
    return s * np.sin(np.pi * t / seconds) ** 2


def pad_chord(notes: list[int], seconds: float) -> np.ndarray:
    """Подложка: расстроенные синусы с гармониками, медленная атака и спад."""
    t = tt(seconds)
    s = np.zeros(len(t))
    for m in notes:
        for det in (-0.06, 0.06):
            f = hz(m + det)
            for h, a in ((1, 1.0), (2, 0.28), (3, 0.12)):
                s += a * np.sin(2 * np.pi * f * h * t + rng.random() * 6.28)
    fade = np.minimum(1, np.minimum(t / 1.2, (seconds - t) / 1.0))
    return filt(s * np.clip(fade, 0, 1), 'lowpass', 1800) / len(notes)


# ---------------------------------------------------------------- время одометра

def bezier_ease(x1: float, y1: float, x2: float, y2: float):
    """cubic-bezier как в CSS: --ease-out (0.16, 1, 0.3, 1)."""
    def bx(u):
        return 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3

    def by(u):
        return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3

    us = np.linspace(0, 1, 4001)
    xs, ys = bx(us), by(us)
    return lambda p: np.interp(p, xs, ys)


EASE_OUT = bezier_ease(0.16, 1, 0.3, 1)


def odometer_ticks(bus: Bus, start_frame: float, dur_frames: float, steps: int, gain: float = 0.08, pitch: float = 2600, pan: float = 0.0) -> None:
    """Щелчок на каждый проход младшего разряда, частота затихает по --ease-out."""
    ps = np.linspace(0, 1, 2000)
    pos = EASE_OUT(ps) * steps
    last = 0
    for p, v in zip(ps, pos):
        if int(v) > last:
            last = int(v)
            k = last / max(steps, 1)
            bus.add(tick(pitch * (1 + 0.15 * k), gain), f2s(start_frame + p * dur_frames), pan=pan)


def lsd_steps(final: str, from_text: str | None = None) -> int:
    """Сколько цифр прокрутит младший разряд, как в Odometer (lib.tsx)."""
    digits = [c for c in final if c.isdigit()]
    target = int(digits[-1])
    if from_text:
        f0 = int([c for c in from_text if c.isdigit()][-1])
        return (target - f0) % 10
    rank = len(digits) - 1
    loops = max(0, 1 - (rank + 1) // 3)
    return loops * 10 + target


# ---------------------------------------------------------------- партитура

def build() -> np.ndarray:
    music = Bus()
    sfx = Bus()

    # Подложка: ре мажор, смена аккорда на смене сцены
    chords = [
        (0.0, 2.9, [50, 57, 61, 64, 66]),  # титул, Dmaj9
        (2.5, 4.4, [47, 54, 57, 62, 66]),  # судья предвзят, Bm9
        (6.5, 3.4, [43, 50, 54, 59, 64]),  # стабильно, честно, Gmaj9
        (9.5, 4.4, [40, 47, 50, 55, 59]),  # 85,00 → 80,50, Em9
        (13.5, 5.4, [43, 50, 54, 59, 64]),  # два сценария, Gmaj9
        (18.5, 6.4, [40, 47, 50, 55, 59]),  # конвейер и примеры, Em9
        (24.5, 3.4, [45, 52, 57, 59, 64]),  # судьи и арбитр, Asus2
        (27.5, 2.5, [38, 50, 57, 61, 64, 66]),  # финал, Dmaj9
    ]
    for t0, d, notes in chords:
        music.add(pad_chord(notes, d), t0, gain=0.085)

    # Пульс 120 BPM (бит = 15 кадров), тихий
    for b in np.arange(2.5, 27.5, 0.5):
        music.add(thud(62, 44, 0.25), b, gain=0.06)
        if 13.5 <= b < 27:
            music.add(filt(rng.standard_normal(int(0.04 * SR)), 'highpass', 6000) * env(0.04, 0.001, 0.012), b + 0.25, gain=0.025, pan=0.3)

    def paper(seconds: float = 0.18) -> np.ndarray:
        return filt(rng.standard_normal(int(seconds * SR)), 'bandpass', [900, 4000]) * env(seconds, 0.01, seconds / 3)

    # Переходы: свист шторки, мягкий свист растворения
    for w in WIPES:
        sfx.add(whoosh(0.4, 250, 5000, 0.6), f2s(w - 4) - 0.12, gain=0.12, pan=-0.3)
    for w in BLENDS[:-1]:
        sfx.add(filt(whoosh(0.3, 600, 4000, 0.7), 'highpass', 600), f2s(w - 6), gain=0.05)

    # 1. Титул: монеты поднимаются с пола и звенят, буквы CQA
    for k in range(6):
        sfx.add(bell(hz(86 + [0, 3, 7, 5, 10, 12][k]), 2.0), f2s(10 + k * 6), gain=0.065, pan=[-0.6, 0.5, -0.2, 0.7, -0.5, 0.2][k])
    sfx.add(glide(220, 660, 1.0), f2s(24), gain=0.05)

    # 2. Судья предвзят: плашки на весы, обмен, колонки, коробка, чеки, каппа
    for k, fr in enumerate([96, 99]):
        sfx.add(thud(180, 90, 0.2), f2s(fr), gain=0.12, pan=[-0.4, 0.3][k])
    sfx.add(filt(whoosh(0.4, 500, 4000, 0.5), 'highpass', 500), f2s(98), gain=0.06)
    sfx.add(tick(1400, 0.2), f2s(110), pan=-0.2)
    for k in range(11):
        sfx.add(pluck(hz(76 + (k % 4) * 2), 0.25, 0.2), f2s(122 + k * 1.2), gain=0.04, pan=-0.3 if k < 3 else 0.4)
    sfx.add(thud(110, 50, 0.4), f2s(154), gain=0.2, pan=0.5)
    for fr in (158, 170):
        sfx.add(thud(240, 120, 0.12), f2s(fr), gain=0.1, pan=0.5)
    for fr in (154, 166):
        sfx.add(paper(0.3), f2s(fr), gain=0.08, pan=0.5)
    sfx.add(bell(hz(81), 1.8), f2s(160), gain=0.07, pan=0.7)

    # 3. Стабильно. Честно.: бруски вырастают, деление на ступени
    penta = [74, 76, 78, 81, 83, 86, 88, 90]
    for i in range(8):
        sfx.add(pluck(hz(penta[i]), 0.5, 0.3), f2s(214 + i * 3.5), gain=0.07, pan=-0.2 + i * 0.1)
    sfx.add(glide(400, 800, 0.4), f2s(226), gain=0.03, pan=-0.4)
    for k in range(4):
        sfx.add(tick(2200 + k * 200, 0.12), f2s(246 + k * 3), pan=0.4)

    # 4. 85,00 → 80,50: удар, трещина, падение, карточки на стол, одометры
    for i in range(3):
        sfx.add(pluck(hz(69 + i * 2), 0.4, 0.3), f2s(292 + i * 4), gain=0.06, pan=-0.5)
    sfx.add(thud(130, 45, 0.5), f2s(320), gain=0.25, pan=0.4)
    sfx.add(filt(rng.standard_normal(int(0.2 * SR)), 'highpass', 3000) * env(0.2, 0.002, 0.05), f2s(318), gain=0.06, pan=0.4)
    sfx.add(glide(500, 140, 0.5), f2s(322), gain=0.04, pan=0.4)
    for i in range(3):
        sfx.add(thud(200, 100, 0.15), f2s(352 + i * 5), gain=0.12, pan=-0.5 + i * 0.5)
    odometer_ticks(sfx, 364, 26, lsd_steps('95'), pan=0.2)
    odometer_ticks(sfx, 370, 26, lsd_steps('0,96'), pitch=3000, pan=0.6)

    # 5. Два сценария: бары, уезд, точки по точности, Парето, роли, итог
    for i in range(5):
        sfx.add(pluck(hz(81 - i * 2), 0.5, 0.4), f2s(414 + i * 5), gain=0.08, pan=-0.4)
    sfx.add(whoosh(0.35, 400, 5000, 0.5), f2s(458), gain=0.08, pan=-0.6)
    bench = json.loads((ROOT / 'docs/pitch/data/model_benchmark.json').read_text(encoding='utf-8'))
    accs = [m['accuracy'] for m in bench['models'] if not m['fits_8gb_laptop']]
    for i, a in enumerate(accs):
        sfx.add(pluck(hz(64 + (a - 78) * 0.9), 0.25, 0.1), f2s(480 + i * 1.3 + 9), gain=0.05, pan=-0.6 + i / 9)
    sfx.add(glide(300, 900, 0.5), f2s(496), gain=0.05, pan=0.2)
    for k, m in enumerate([74, 78, 81]):
        sfx.add(pluck(hz(m), 1.0, 0.7), f2s(506 + k * 3), gain=0.12, pan=0.5)
    odometer_ticks(sfx, 514, 26, lsd_steps('$0,021'), pan=-0.3)
    odometer_ticks(sfx, 519, 26, lsd_steps('83'), pitch=2200, pan=0.1)

    # 6. Конвейер: токен по узлам, пять фактов, раздвоение, спор, арбитр, 38,13
    for fr in (562, 569, 576, 602, 620, 637):
        sfx.add(tick(1600, 0.16), f2s(fr), pan=-0.2)
    for k in range(5):
        sfx.add(pluck(hz(81 + [0, 2, 4, 7, 9][k]), 0.4, 0.4), f2s(577 + k * 3.5), gain=0.07, pan=-0.5)
    sfx.add(tick(1500, 0.18), f2s(602), pan=-0.4)
    sfx.add(tick(1700, 0.18), f2s(602) + 0.04, pan=0.4)
    sfx.add(pluck(hz(69), 0.6), f2s(611), gain=0.1, pan=-0.3)  # судьи «вдыхают»
    sfx.add(pluck(hz(73), 0.6), f2s(611), gain=0.1, pan=0.3)
    sfx.add(pluck(hz(63), 0.5, 0.2) + pluck(hz(64), 0.5, 0.2), f2s(623), gain=0.07, pan=0.4)  # спор: малая секунда
    sfx.add(pluck(hz(76), 0.9, 0.6), f2s(628), gain=0.12, pan=0.5)  # арбитр решил
    sfx.add(thud(120, 50, 0.4), f2s(648), gain=0.18, pan=0.5)
    sfx.add(bell(hz(74), 1.2), f2s(648), gain=0.06, pan=0.5)

    # 6b. Два примера: окна, одометры, подсветки
    odometer_ticks(sfx, 664, 26, lsd_steps('38,13'), pitch=1800, pan=-0.5)
    odometer_ticks(sfx, 668, 26, lsd_steps('92,31'), pitch=2800, pan=0.5)
    for fr, m, pan in ((684, 62, -0.5), (690, 61, -0.5), (696, 81, 0.5)):
        sfx.add(pluck(hz(m), 0.6, 0.3), f2s(fr), gain=0.09, pan=pan)

    # 7. Два судьи и арбитр: плитки поворачиваются, линия «только спорное», «код»
    for k, fr in enumerate((742, 750, 758)):
        sfx.add(filt(whoosh(0.25, 800, 5000, 0.6), 'highpass', 800), f2s(fr), gain=0.05, pan=-0.5 + k * 0.5)
        sfx.add(pluck(hz([74, 78, 81][k]), 0.7, 0.5), f2s(fr + 12), gain=0.09, pan=-0.5 + k * 0.5)
    sfx.add(glide(500, 1000, 0.6), f2s(766), gain=0.03, pan=0.3)
    sfx.add(bell(hz(86), 1.4), f2s(784), gain=0.06)

    # 8. Финал: низкий удар, четыре одометра, звон «Журнал контроля»
    sfx.add(whoosh(0.6, 200, 4000, 0.75), f2s(819) - 0.3, gain=0.12)
    sfx.add(thud(90, 34, 1.2), f2s(825), gain=0.3)
    for i, (txt, pan) in enumerate([('97,2%', -0.6), ('0,96', -0.2), ('99%', 0.2), ('$0,021', 0.6)]):
        odometer_ticks(sfx, 826 + i * 4, 26, lsd_steps(txt), gain=0.06, pan=pan)
    for k, m in enumerate([62, 69, 74, 78, 81]):
        sfx.add(bell(hz(m + 12), 2.0), f2s(846) + k * 0.07, gain=0.08, pan=-0.4 + k * 0.2)

    # Реверберация: общая комната на эффекты, больше на подложку
    def verb(x: np.ndarray, seconds: float, wet: float) -> np.ndarray:
        out = np.zeros_like(x)
        for ch in range(2):
            t = tt(seconds)
            ir = rng.standard_normal(len(t)) * np.exp(-t / (seconds / 5))
            ir = filt(ir, 'lowpass', 5000)
            out[ch] = fftconvolve(x[ch], ir)[: x.shape[1]] / np.sqrt(np.sum(ir ** 2))
        return x + wet * out

    mix = verb(music.x, 2.4, 0.5) + 1.6 * verb(sfx.x, 1.4, 0.25)
    rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    print(f'музыка {rms(music.x):.1f} дБ, эффекты {rms(sfx.x * 1.6):.1f} дБ')
    # конец: мягкий спад последних 0,6 с
    fade = np.ones(N)
    k = int(0.6 * SR)
    fade[-k:] = np.linspace(1, 0, k) ** 2
    mix *= fade
    mix = filt(mix, 'highpass', 30)
    peak = np.max(np.abs(mix))
    return mix / peak * 0.7


if __name__ == '__main__':
    from scipy.io import wavfile

    out = sys.argv[1] if len(sys.argv) > 1 else 'out/sound.wav'
    wavfile.write(out, SR, (build().T * 32767).astype(np.int16))
    print('written', out)
