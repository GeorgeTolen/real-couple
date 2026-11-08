// Сцена 6, вторая половина (660-735, локальный 0 = глобальный 656). Два скриншота диалогов рядом:
// ru-014 (38,13) и ru-015 (92,31). Подсветки фраз проявляются маской, Ken Burns на 3 процента.
// Скриншоты не редактируются: показан фрагмент транскрипта, рамки слов измерены по пикселям PNG
// (если PNG пересняли, координаты в SHOTS надо измерить заново).
import { Img, useCurrentFrame } from 'remotion'
import shot14 from '../../../../docs/screens/2x/14-chat-ru-014-words.png'
import shot15 from '../../../../docs/screens/2x/15-chat-ru-015-words.png'
import { words } from '../data'
import { C, Caption, DISPLAY, EASE_IO, EASE_OUT, LightBg, MONO, Odometer, progress, UI } from '../lib'

const G = (g: number) => g - 656
const INNER = 880
/** Высота видимого фрагмента в кадре, px: оба окна одной высоты. */
const VIEW_H = 352

type Mark = { x0: number; y0: number; x1: number; y1: number; kind: 'no' | 'yes'; at: number }
// Координаты в пикселях исходных PNG. Фрагмент: колонка «кто» и текст реплик, строки целиком.
const SHOTS = [
  {
    src: shot14, w: 2880, h: 1800, cx: 400, cy: 1231, cw: 1205, // строки #9–#14
    dialog: words.left.dialog, total: words.left.total, color: C.no,
    marks: [
      { x0: 604, y0: 1330, x1: 700, y1: 1354, kind: 'no', at: 684 }, // «Привет»
      { x0: 604, y0: 1478, x1: 685, y1: 1502, kind: 'no', at: 690 }, // «Понял»
    ] as Mark[],
  },
  {
    src: shot15, w: 1905, h: 990, cx: 240, cy: 661, cw: 820, // строки #8–#12
    dialog: words.right.dialog, total: words.right.total, color: C.yes,
    marks: [{ x0: 373, y0: 776, x1: 619, y1: 792, kind: 'yes', at: 696 }] as Mark[], // «Здравствуйте, меня зовут Дина»
  },
]

function Window({ i, f }: { i: number; f: number }) {
  const s = SHOTS[i]
  const S = INNER / s.cw
  const p = progress(f, G(660) + i * 4, 16, EASE_OUT)
  const kb = 1 + 0.03 * progress(f, G(660), 75, EASE_IO) // Ken Burns на 3 процента
  const left = 64 + i * (INNER + 16 + 32)
  return (
    <div style={{ position: 'absolute', left, top: 220, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * 60}px)` }}>
      {/* номер диалога и итог над окном */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 22, paddingLeft: 8 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 120, letterSpacing: '-0.05em', lineHeight: 1, color: s.color, fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(664) + i * 4, 20)}` }}>
          <Odometer value={s.total} decimals={2} start={G(664) + i * 4} dur={26} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 26, color: C.text2 }}>{s.dialog}</div>
      </div>
      {/* окно: внешний радиус 20 = внутренний 12 + отступ 8 */}
      <div style={{ padding: 8, borderRadius: 20, background: '#ffffff', border: `1px solid ${C.line}`, boxShadow: '0 18px 40px rgba(14,59,39,0.12)' }}>
        <div style={{ display: 'flex', gap: 8, padding: '6px 8px 12px' }}>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ width: 12, height: 12, borderRadius: 6, background: C.line }} />
          ))}
        </div>
        <div style={{ position: 'relative', width: INNER, height: VIEW_H, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: s.w * S, height: s.h * S, transform: `translate(${-s.cx * S}px, ${-s.cy * S}px) scale(${kb})`, transformOrigin: `${(s.cx + s.cw / 2) * S}px ${s.cy * S + VIEW_H / 2}px` }}>
            <Img src={s.src} style={{ width: s.w * S, height: s.h * S, display: 'block' }} />
            {s.marks.map((m, k) => {
              const r = progress(f, G(m.at), 10, EASE_OUT)
              const col = m.kind === 'no' ? C.no : C.yes
              return (
                <div key={k} style={{ position: 'absolute', left: m.x0 * S - 6, top: m.y0 * S - 7, width: (m.x1 - m.x0) * S + 12, height: (m.y1 - m.y0) * S + 14, borderRadius: 4, background: m.kind === 'no' ? 'rgba(180,35,44,0.16)' : 'rgba(19,138,78,0.16)', borderBottom: `3px solid ${col}`, clipPath: `inset(0 ${(1 - r) * 100}% 0 0)` }} />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function S6bExamples() {
  const f = useCurrentFrame()
  return (
    <>
      <LightBg />
      <Window i={0} f={f} />
      <Window i={1} f={f} />
      <Caption delay={G(700)} color={C.text} top={820}>
        <span style={{ fontFamily: UI, fontSize: 34 }}>каждое снижение со ссылкой на номер реплики</span>
      </Caption>
    </>
  )
}
