// Тот же язык движения, что в pitch/slides/src/motion.ts, переведённый в кадры при 30 fps.
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import type { CSSProperties, ReactNode } from 'react'

export const C = {
  bg: '#f6f5f1',
  bg2: '#efede6',
  card: '#ffffff',
  line: '#e3e1da',
  text: '#1c1f1d',
  text2: '#5e655f',
  text3: '#8a908b',
  accent: '#138a4e',
  accentDark: '#0e6b3c',
  accentSoft: '#e7f3ec',
  accentGlow: '#3fbf7f',
  dark: '#0e3b27',
  dark2: '#17533a',
  darkText: '#cfe3d8',
  yes: '#1f7a4d',
  no: '#b4232c',
  mid: '#a35f00',
  midMark: '#e2a227',
  na: '#6b6f76',
}
export const DISPLAY = "'Unbounded Variable', 'Segoe UI', sans-serif"
export const UI = "'Onest Variable', 'Segoe UI Variable', 'Segoe UI', sans-serif"
export const MONO = "'JetBrains Mono Variable', 'Cascadia Mono', monospace"
export const SERIF = "'Source Serif 4 Variable', Georgia, serif"
export const ACCENT = "'Geologica Variable', 'Onest Variable', sans-serif"

// --ease-out, --ease-io и длительности --t-2/--t-3/--t-4 из презентации
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)
export const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1)
export const T2 = 13
export const T3 = 22
export const T4 = 33
/** Налив веса Unbounded 250 → 700 по брифу ролика v2. */
export const TW = 20

export function progress(frame: number, from: number, dur: number, ease = EASE_OUT) {
  return interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
}

/** Въезд снизу на 24 px с маской, как reveal() в слайдах. */
export function Appear({ delay, children, style, dy = 24 }: { delay: number; children: ReactNode; style?: CSSProperties; dy?: number }) {
  const frame = useCurrentFrame()
  const p = progress(frame, delay, T2)
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * dy}px)`, clipPath: `inset(0 0 ${(1 - p) * 100}% 0)` }}>{children}</div>
}

export function formatNum(value: number, decimals: number) {
  return (Math.round(value * 10 ** decimals + 1e-9) / 10 ** decimals).toFixed(decimals).replace('.', ',')
}

/** Заголовок: маска и «налив» веса Unbounded 250 → 700; акцентное слово с линией слева направо. */
export function Title({ text, accent, delay = 0, color = C.text }: { text: string; accent?: string; delay?: number; color?: string }) {
  const frame = useCurrentFrame()
  const p = progress(frame, delay, TW)
  const w = 250 + 450 * p
  const ul = progress(frame, delay + 8, 15)
  const acc = progress(frame, delay + 8, T3)
  const parts = accent ? text.split(accent) : [text]
  return (
    <div style={{ position: 'absolute', left: 120, top: 92, fontFamily: DISPLAY, fontSize: 64, letterSpacing: '-0.035em', color, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * 24}px)`, clipPath: `inset(0 0 ${(1 - Math.min(1, p * 1.6)) * 100}% 0)`, fontVariationSettings: `'wght' ${w}`, paddingBottom: 12 }}>
      {parts[0]}
      {accent && (
        <span style={{ position: 'relative', display: 'inline-block', fontFamily: ACCENT, color: color === C.text ? C.accent : '#8be0b2', fontVariationSettings: `'wght' ${400 + 200 * acc}, 'slnt' ${-8 * acc}, 'SHRP' ${100 * acc}` }}>
          {accent}
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 4, borderRadius: 2, background: 'currentColor', transform: `scaleX(${ul})`, transformOrigin: 'left' }} />
        </span>
      )}
      {parts[1]}
    </div>
  )
}

export function Caption({ children, delay = 0, color = C.text2, top = 980 }: { children: ReactNode; delay?: number; color?: string; top?: number }) {
  return (
    <Appear delay={delay} dy={12} style={{ position: 'absolute', left: 120, top, fontFamily: MONO, fontSize: 22, color }}>
      {children}
    </Appear>
  )
}

/**
 * Одометр: колонка 0-9 на разряд в маске одной строки, старшие разряды встают раньше
 * (40 мс ≈ 1,2 кадра на разряд справа налево). После конца обычный текст.
 */
export function Odometer({ value, decimals = 0, prefix = '', suffix = '', start, dur = T4, from }: { value: number; decimals?: number; prefix?: string; suffix?: string; start: number; dur?: number; from?: number }) {
  const frame = useCurrentFrame()
  const final = prefix + formatNum(value, decimals) + suffix
  if (frame >= start + dur) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{final}</span>
  const startText = from !== undefined ? (prefix + formatNum(from, decimals) + suffix).padStart(final.length, ' ') : null
  const chars = [...final]
  const digits = chars.filter((c) => /\d/.test(c)).length
  let k = 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', fontVariantNumeric: 'tabular-nums' }}>
      {chars.map((c, idx) => {
        if (!/\d/.test(c)) return <span key={idx}>{c}</span>
        const rank = k++ // 0 у старшего
        const target = Number(c)
        const f0 = startText && /\d/.test(startText[idx]) ? Number(startText[idx]) : 0
        const loops = startText ? 0 : Math.max(0, 1 - Math.floor((rank + 1) / 3))
        const steps = loops * 10 + ((target - f0 + 10) % 10)
        // старший разряд (rank 0) встаёт раньше: короче на 1,2 кадра за каждый разряд справа
        const p = progress(frame, start, Math.max(6, dur - (digits - 1 - rank) * 1.2), EASE_OUT)
        const pos = p * steps
        const seq = Array.from({ length: steps + 1 }, (_, s) => (f0 + s) % 10)
        return (
          <span key={idx} style={{ display: 'inline-block', height: '1.1em', lineHeight: '1.1em', overflow: 'hidden', verticalAlign: 'bottom' }}>
            <span style={{ display: 'flex', flexDirection: 'column', transform: `translateY(${-pos * 1.1}em)` }}>
              {seq.map((d, s) => (
                <span key={s} style={{ height: '1.1em' }}>{d}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

export function SceneFade({ children, fadeIn = 8, bg = C.bg }: { children: ReactNode; fadeIn?: number; bg?: string }) {
  const frame = useCurrentFrame()
  const o = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' }) : 1
  const y = fadeIn ? interpolate(frame, [0, fadeIn], [16, 0], { extrapolateRight: 'clamp', easing: EASE_OUT }) : 0
  return <div style={{ position: 'absolute', inset: 0, background: bg, opacity: o, transform: `translateY(${y}px)`, overflow: 'hidden' }}>{children}</div>
}

/** Тёмный мир: #0e3b27, глубже к краям #082518. */
export function DarkBg() {
  return <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1400px 900px at 50% 42%, #134a32 0%, #0e3b27 46%, #082518 100%)' }} />
}

/** Светлый мир для данных. */
export function LightBg() {
  return <div style={{ position: 'absolute', inset: 0, background: C.bg }} />
}

/** Чип источника: JetBrains Mono, радиус 8 при отступе 6/12 (внешние карточки берут 8 + отступ). */
export function Chip({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-block', fontFamily: MONO, fontSize: 20, lineHeight: '28px', padding: '4px 12px', borderRadius: 8,
        color: dark ? '#cfe3d8' : C.text2, background: dark ? 'rgba(207,227,216,0.08)' : C.card,
        border: `1px solid ${dark ? 'rgba(207,227,216,0.22)' : C.line}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...style,
      }}
    >
      {children}
    </span>
  )
}

/** Видимость элемента сцены: появление и уход (кадры локальные). */
export function vis(frame: number, inAt: number, outAt = Infinity, dur = T2) {
  return Math.min(progress(frame, inAt, dur), 1 - progress(frame, outAt, 8, EASE_IO))
}

/** Греческая каппа: в Unbounded её нет, берём курсив Source Serif 4, как цитаты в деке. */
export function Kappa({ size, color, gap = 0.12 }: { size?: number; color?: string; gap?: number }) {
  return <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 500, fontSize: size, color, marginRight: `${gap}em`, letterSpacing: 0 }}>κ</span>
}
