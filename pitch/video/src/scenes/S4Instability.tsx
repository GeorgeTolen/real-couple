// Сцена 4 (285-405, локальный 0 = глобальный 279). Один чат, два итога: 85,00 → 80,50.
// Оба судьи стабильны (10 и 7), арбитр выбирает то одно, то другое. Слой согласованности: три карточки.
// Итог: 95 из 96 на повторе и κ 0,96 рядом с потолком людей 0,80.
import { useCurrentFrame } from 'remotion'
import { instability as I } from '../data'
import { Appear, C, Kappa, DISPLAY, EASE_IO, EASE_OUT, formatNum, LightBg, MONO, Odometer, progress, UI } from '../lib'

const G = (g: number) => g - 279

function Table({ f }: { f: number }) {
  const rows = [
    { name: 'Судья A', v: I.runs.map((r) => r.judge_a), key: false },
    { name: 'Судья B', v: I.runs.map((r) => r.judge_b), key: false },
    { name: 'Арбитр', v: I.runs.map((r) => r.arbiter), key: true },
  ]
  const p = progress(f, G(288), 14)
  return (
    // карточка: радиус 24 = 8 (строка) + 16 (отступ)
    <div style={{ position: 'absolute', left: 120, top: 230, width: 700, padding: 16, borderRadius: 24, background: C.card, border: `1px solid ${C.line}`, boxShadow: '0 10px 30px rgba(14,59,39,0.08)', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ display: 'flex', padding: '10px 16px 14px', fontFamily: MONO, fontSize: 22, color: C.text2 }}>
        <div style={{ flex: 1 }}>{I.dialog} · {I.criterion.toLowerCase()}</div>
        <div style={{ width: 130, textAlign: 'right' }}>прогон 1</div>
        <div style={{ width: 130, textAlign: 'right' }}>прогон 2</div>
      </div>
      {rows.map((r, i) => {
        const rp = progress(f, G(292) + i * 4, 12)
        const diff = r.key && progress(f, G(306), 10)
        return (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', height: 68, padding: '0 16px', borderRadius: 8, background: r.key ? `rgba(180,35,44,${0.07 * (diff || 0)})` : 'transparent', opacity: rp, fontFamily: UI, fontSize: 34, color: C.text }}>
            <div style={{ flex: 1, fontWeight: r.key ? 600 : 400 }}>{r.name}</div>
            {r.v.map((v, k) => (
              <div key={k} style={{ width: 130, textAlign: 'right', fontFamily: MONO, fontWeight: r.key ? 700 : 500, fontSize: 38, color: r.key && k === 1 ? C.no : C.text, fontVariantNumeric: 'tabular-nums' }}>
                {v}
              </div>
            ))}
          </div>
        )
      })}
      <div style={{ height: 1, background: C.line, margin: '8px 16px' }} />
      <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 16px', fontFamily: UI, fontSize: 30, color: C.text2, opacity: progress(f, G(304), 12) }}>
        <div style={{ flex: 1 }}>итог диалога</div>
        {I.runs.map((r, k) => (
          <div key={k} style={{ width: 130, textAlign: 'right', fontFamily: MONO, fontSize: 30, color: k ? C.no : C.text, fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.total, 2)}</div>
        ))}
      </div>
    </div>
  )
}

/** Справа: 85,00 появляется, 80,50 бьёт по нему, старое число трескается и уезжает вниз. */
function Hero({ f }: { f: number }) {
  const a = progress(f, G(294), 16)
  const hit = progress(f, G(312), 8, EASE_IO)
  const crack = progress(f, G(318), 6)
  const fall = progress(f, G(321), 12, EASE_IO)
  const slide = progress(f, G(327), 14, EASE_IO)
  const leave = progress(f, G(360), 10, EASE_IO)
  const shake = hit >= 1 && crack < 1 ? Math.sin(f * 2.4) * 4 * (1 - crack) : 0
  const big = { fontFamily: DISPLAY, fontSize: 180, letterSpacing: '-0.05em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' } as const
  return (
    <div style={{ position: 'absolute', left: 980, top: 240, width: 820, height: 340, opacity: 1 - leave, transform: `translateY(${-leave * 40}px)` }}>
      <div style={{ fontFamily: MONO, fontSize: 24, color: C.text2, opacity: a }}>один чат, два итога</div>
      {/* 85,00 */}
      <div style={{ position: 'absolute', left: 0, top: 54, ...big, color: C.text, opacity: a * (1 - fall) ** 1.5, transform: `translate(${shake}px, ${fall * 200}px) rotate(${fall * 4}deg)`, fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(294), 20)}` }}>
        {formatNum(I.runs[0].total, 2)}
        {/* тонкая трещина поперёк числа */}
        <svg width={560} height={180} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <polyline points="40,40 150,92 210,70 300,118 380,96 470,150 530,138" fill="none" stroke={C.bg} strokeWidth={4} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - crack} />
          <polyline points="40,40 150,92 210,70 300,118 380,96 470,150 530,138" fill="none" stroke={C.no} strokeWidth={1.5} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - crack} />
        </svg>
      </div>
      {/* 80,50 влетает справа, упирается в 85,00, затем занимает его место */}
      <div style={{ position: 'absolute', left: 0, top: 54, ...big, color: C.no, opacity: hit > 0 ? 1 : 0, transform: `translateX(${900 - 330 * hit - 570 * slide}px)`, fontVariationSettings: "'wght' 700" }}>
        {formatNum(I.runs[1].total, 2)}
      </div>
      <div style={{ position: 'absolute', left: 0, top: 262, fontFamily: UI, fontSize: 32, color: C.text2, opacity: progress(f, G(330), 12) }}>
        арбитр выбирал то 10, то 7
      </div>
    </div>
  )
}

function Fixes({ f }: { f: number }) {
  return (
    <div style={{ position: 'absolute', left: 120, top: 676, width: 1680 }}>
      <Appear delay={G(336)} dy={10}>
        <div style={{ fontFamily: MONO, fontSize: 24, color: C.accentDark }}>проверка согласованности</div>
      </Appear>
      <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
        {I.fixes.map((t, i) => {
          const p = progress(f, G(340) + i * 5, 12, EASE_OUT)
          // карточка ложится на стол: опускается, тень собирается
          return (
            <div key={t} style={{ flex: 1, padding: 16, borderRadius: 24, background: C.card, border: `1px solid ${C.line}`, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * -46}px) scale(${1.04 - 0.04 * p})`, boxShadow: `0 ${4 + 22 * (1 - p)}px ${10 + 30 * (1 - p)}px rgba(14,59,39,${0.1 + 0.06 * p})` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 16px', borderRadius: 8, background: C.accentSoft, minHeight: 92 }}>
                <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 28, color: C.accent }}>{i + 1}</div>
                <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 32, color: C.text, lineHeight: 1.2 }}>{t}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Result({ f }: { f: number }) {
  const s = G(364)
  const p = progress(f, s, 14)
  const k = progress(f, s + 6, 14)
  const bar = progress(f, s + 10, 20, EASE_IO)
  const X = (v: number) => v * 380
  return (
    <div style={{ position: 'absolute', left: 980, top: 252, width: 860 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 116, letterSpacing: '-0.05em', lineHeight: 1, color: C.text, fontVariationSettings: `'wght' ${250 + 450 * progress(f, s, 20)}`, whiteSpace: 'nowrap' }}>
          <Odometer value={I.same} start={s} dur={26} />
          <span style={{ fontSize: 56, letterSpacing: '-0.02em' }}> из {I.total}</span>
        </div>
        <div style={{ fontFamily: UI, fontSize: 30, color: C.text2, marginTop: 14 }}>совпали на повторе</div>
      </div>
      <div style={{ position: 'absolute', left: 470, top: 0, opacity: k, transform: `translateY(${(1 - k) * 24}px)` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 116, letterSpacing: '-0.05em', lineHeight: 1, color: C.accent, fontVariationSettings: `'wght' ${250 + 450 * progress(f, s + 6, 20)}`, whiteSpace: 'nowrap' }}>
          <Kappa size={120} gap={0.16} />
          <Odometer value={I.kappa} decimals={2} start={s + 6} dur={26} />
        </div>
        {/* шкала каппы 0..1: метка людей 0,80 и наша 0,96 */}
        <div style={{ position: 'relative', width: 380, height: 64, marginTop: 18 }}>
          <div style={{ position: 'absolute', left: 0, top: 10, width: 380, height: 8, borderRadius: 4, background: C.bg2 }} />
          <div style={{ position: 'absolute', left: 0, top: 10, width: X(I.kappa) * bar, height: 8, borderRadius: 4, background: C.accent }} />
          <div style={{ position: 'absolute', left: X(I.ceiling) - 1, top: 0, width: 2, height: 28, background: C.text }} />
          <div style={{ position: 'absolute', left: X(I.ceiling) - 120, width: 240, top: 32, textAlign: 'center', fontFamily: MONO, fontSize: 20, color: C.text2 }}>люди {formatNum(I.ceiling, 2)}</div>
        </div>
      </div>
    </div>
  )
}

export function S4Instability() {
  const f = useCurrentFrame()
  return (
    <>
      <LightBg />
      <Table f={f} />
      <Hero f={f} />
      <Fixes f={f} />
      <Result f={f} />
    </>
  )
}
