// Маленькая библиотека движения на Web Animations API. Без зависимостей.
// Всё движение выключается при prefers-reduced-motion и в body.instant (печать, экспорт, шаг назад).

export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
export const EASE_IO = 'cubic-bezier(0.65, 0, 0.35, 1)'
export const EASE_SNAP = 'cubic-bezier(0.3, 1.3, 0.5, 1)'
export const T = { 1: 180, 2: 420, 3: 720, 4: 1100 } as const
export const STAGGER = 45

export function still(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('instant')
}

/** Оборачивает слова в span с --i. Пробелы и переносы сохраняются, текст целиком уходит в aria-label. */
export function splitWords(el: HTMLElement): HTMLElement[] {
  return split(el, /(\s+)/, 'w')
}

/** Оборачивает буквы в span с --i (внутри слов, чтобы перенос строк не ломался). */
export function splitChars(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>('.ch')]
  el.dataset.split = '1'
  el.setAttribute('aria-label', el.textContent?.trim() ?? '')
  const chars: HTMLElement[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment()
      for (const part of (node.textContent ?? '').split(/(\s+)/)) {
        if (!part) continue
        if (/^\s+$/.test(part)) {
          frag.append(part)
          continue
        }
        const word = document.createElement('span')
        word.className = 'wd'
        for (const c of part) {
          const span = document.createElement('span')
          span.className = 'ch'
          span.setAttribute('aria-hidden', 'true')
          span.textContent = c
          span.style.setProperty('--i', String(chars.length))
          chars.push(span)
          word.append(span)
        }
        frag.append(word)
      }
      node.parentNode?.replaceChild(frag, node)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      ;[...node.childNodes].forEach(walk)
    }
  }
  ;[...el.childNodes].forEach(walk)
  return chars
}

function split(el: HTMLElement, re: RegExp, cls: string): HTMLElement[] {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>('.' + cls)]
  el.dataset.split = '1'
  el.setAttribute('aria-label', el.textContent?.trim() ?? '')
  const out: HTMLElement[] = []
  const text = el.textContent ?? ''
  el.textContent = ''
  for (const part of text.split(re)) {
    if (!part) continue
    if (re.test(part) && /^\s+$/.test(part)) {
      el.append(part)
      continue
    }
    const span = document.createElement('span')
    span.className = cls
    span.setAttribute('aria-hidden', 'true')
    span.textContent = part
    span.style.setProperty('--i', String(out.length))
    out.push(span)
    el.append(span)
  }
  return out
}

type RevealMode = 'mask' | 'rise' | 'weight'
/** Появление: маска снизу вверх, подъём на 24 px или «налив» веса по буквам. */
export function reveal(el: HTMLElement, opts: { mode?: RevealMode; delay?: number; duration?: number; to?: number } = {}): Animation[] {
  const { mode = 'rise', delay = 0, duration = T[3] } = opts
  if (still()) return []
  if (mode === 'weight') {
    const to = opts.to ?? 700
    return splitChars(el).map((ch, i) =>
      ch.animate(
        [
          { fontWeight: 250, opacity: 0, transform: 'translateY(0.28em)' },
          { opacity: 1, offset: 0.45 },
          { fontWeight: to, opacity: 1, transform: 'none' },
        ],
        { duration, delay: delay + i * 18, easing: EASE_OUT, fill: 'backwards' },
      ),
    )
  }
  const frames: Keyframe[] =
    mode === 'mask'
      ? [
          { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(24px)' },
          { clipPath: 'inset(-20% -5% -20% -5%)', transform: 'none' },
        ]
      : [
          { opacity: 0, transform: 'translateY(24px)' },
          { opacity: 1, transform: 'none' },
        ]
  return [el.animate(frames, { duration, delay, easing: EASE_OUT, fill: 'backwards' })]
}

/** Округление как в продукте: ROUND_HALF_UP. */
export function roundHalfUp(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.sign(value) * Math.round(Math.abs(value) * f + 1e-9) / f
}
export function fmt(value: number, decimals: number, prefix = '', suffix = ''): string {
  return prefix + roundHalfUp(value, decimals).toFixed(decimals).replace('.', ',') + suffix
}

/**
 * Одометр: каждый разряд это колонка 0–9 в маске высотой в строку.
 * Старшие разряды встают раньше младших (+40 мс на разряд вправо). Знаки статичны.
 * По окончании в элементе остаётся обычный текст.
 */
export function odometer(el: HTMLElement, text: string, opts: { from?: string; duration?: number; delay?: number } = {}): Promise<void> {
  const { duration = T[4], delay = 0 } = opts
  el.setAttribute('aria-label', text)
  if (still()) {
    el.textContent = text
    return Promise.resolve()
  }
  const from = (opts.from ?? text.replace(/\d/g, '0')).padStart(text.length, ' ')
  el.textContent = ''
  el.classList.add('odo')
  const anims: Animation[] = []
  let digitIndex = 0
  ;[...text].forEach((c, k) => {
    if (!/\d/.test(c)) {
      const s = document.createElement('span')
      s.className = 'odo-s'
      s.textContent = c
      el.append(s)
      return
    }
    const target = Number(c)
    const start = /\d/.test(from[k]) ? Number(from[k]) : 0
    const col = document.createElement('span')
    col.className = 'odo-c'
    col.innerHTML = `<span class="odo-g">${c}</span><span class="odo-strip">${'0123456789'.split('').map((d) => `<i>${d}</i>`).join('')}</span>`
    el.append(col)
    const strip = col.querySelector<HTMLElement>('.odo-strip')!
    anims.push(
      strip.animate([{ transform: `translateY(${-start * 10}%)` }, { transform: `translateY(${-target * 10}%)` }], {
        duration: duration + digitIndex * 40,
        delay,
        easing: EASE_OUT,
        fill: 'both',
      }),
    )
    digitIndex += 1
  })
  return Promise.all(anims.map((a) => a.finished))
    .then(() => {
      el.textContent = text
      el.classList.remove('odo')
    })
    .catch(() => {})
}

/** Прорисовка пути через stroke-dashoffset. */
export function drawPath(path: SVGPathElement | SVGGeometryElement, duration = T[3], delay = 0): Animation | null {
  if (still()) return null
  const len = path.getTotalLength()
  path.style.strokeDasharray = `${len}`
  const a = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay, easing: EASE_IO, fill: 'backwards' })
  a.finished.then(() => (path.style.strokeDasharray = '')).catch(() => {})
  return a
}

/** FLIP: запомнить положения, изменить DOM, проиграть переход из старых мест в новые. */
export function flip(items: HTMLElement[] | SVGElement[], mutate: () => void, opts: { duration?: number; easing?: string; stagger?: number } = {}): Animation[] {
  const { duration = T[3], easing = EASE_IO, stagger = 0 } = opts
  const first = new Map<Element, DOMRect>()
  items.forEach((el) => first.set(el, el.getBoundingClientRect()))
  mutate()
  if (still()) return []
  const scale = stageScale()
  return [...items].map((el, i) => {
    const a = first.get(el)!
    const b = el.getBoundingClientRect()
    const dx = (a.left - b.left) / scale
    const dy = (a.top - b.top) / scale
    if (!dx && !dy) return el.animate([], {})
    return el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing, delay: i * stagger })
  })
}

/** Масштаб холста 1920×1080 относительно окна (для пересчёта координат FLIP). */
export function stageScale(): number {
  const stage = document.querySelector<HTMLElement>('.stage')
  if (!stage) return 1
  const r = stage.getBoundingClientRect()
  return r.width / 1920 || 1
}

/** Ждёт окончания всех анимаций и CSS-переходов документа. Его вызывает экспорт. */
export async function settled(timeout = 8000): Promise<void> {
  const until = performance.now() + timeout
  for (;;) {
    const running = document.getAnimations().filter((a) => {
      if (a.playState !== 'running') return false
      const t = a.effect?.getComputedTiming()
      return t && t.iterations !== Infinity
    })
    if (!running.length || performance.now() > until) break
    await Promise.all(running.map((a) => a.finished.catch(() => {})))
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

/** Пауза для последовательностей. */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, still() ? 0 : ms))
