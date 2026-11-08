// Сцена 5 (405-555, локальный 0 = глобальный 399). Два сценария выбора модели.
// Локально: RTX 5070 Ti 8 ГБ, пять баров. Облако: 11 моделей, цена × точность, Парето, роли. Итог $0,021 и 83 с.
import { useCurrentFrame } from 'remotion'
import { cloud, local, opus, opusTimes, pareto, price, seconds10 } from '../data'
import { C, DISPLAY, EASE_IO, EASE_OUT, formatNum, LightBg, MONO, Odometer, progress, UI } from '../lib'

const G = (g: number) => g - 399

function Gpu({ f }: { f: number }) {
  const d = 1 - progress(f, G(406), 22, EASE_IO)
  const stroke = { fill: 'none', stroke: C.accent, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1, strokeDasharray: 1, strokeDashoffset: d }
  return (
    <svg width={168} height={104} viewBox="0 0 168 104" style={{ position: 'absolute', left: 120, top: 112 }}>
      <rect x={4} y={10} width={150} height={70} rx={10} {...stroke} />
      <circle cx={50} cy={45} r={22} {...stroke} />
      <circle cx={108} cy={45} r={22} {...stroke} />
      <circle cx={50} cy={45} r={5} {...stroke} />
      <circle cx={108} cy={45} r={5} {...stroke} />
      <path d="M22 80 V96 H96 V80 M154 26 H164 V64 H154" {...stroke} />
    </svg>
  )
}

function LocalBars({ f }: { f: number }) {
  const max = 1040
  return (
    <>
      <Gpu f={f} />
      <div style={{ position: 'absolute', left: 316, top: 114, fontFamily: DISPLAY, fontSize: 60, letterSpacing: '-0.04em', color: C.text, fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(408), 20)}`, opacity: progress(f, G(408), 12), whiteSpace: 'nowrap' }}>
        RTX 5070 Ti · 8 ГБ
      </div>
      <div style={{ position: 'absolute', left: 318, top: 190, fontFamily: UI, fontSize: 32, color: C.accentDark, opacity: progress(f, G(414), 12) }}>бесплатно, данные не выходят наружу</div>
      {local.map((m, i) => {
        const p = progress(f, G(414) + i * 5, 18, EASE_OUT)
        const y = 330 + i * 128
        const top = i === 0
        return (
          <div key={m.id} style={{ position: 'absolute', left: 120, top: y, height: 84, width: 1700, opacity: Math.min(1, p * 3) }}>
            <div style={{ position: 'absolute', left: 0, top: 18, width: 360, fontFamily: UI, fontWeight: top ? 600 : 400, fontSize: 40, color: C.text }}>{m.name}</div>
            <div style={{ position: 'absolute', left: 380, top: 12, width: (m.acc / 100) * max * p, height: 60, borderRadius: 8, background: top ? C.accent : '#b9c9bf' }} />
            <div style={{ position: 'absolute', left: 380 + (m.acc / 100) * max * p + 18, top: 18, fontFamily: MONO, fontWeight: 600, fontSize: 42, color: top ? C.accentDark : C.text2, fontVariantNumeric: 'tabular-nums' }}>
              {formatNum(m.acc * Math.min(1, p * 1.05), 1)}
            </div>
          </div>
        )
      })}
    </>
  )
}

// Облако: лог-ось цены, линейная точность
const BOX = { x: 230, y: 236, w: 1130, h: 470 }
const LX = (c: number) => BOX.x + ((Math.log10(c) - Math.log10(0.0004)) / (Math.log10(0.05) - Math.log10(0.0004))) * BOX.w
const LY = (a: number) => BOX.y + (1 - (a - 78) / (100 - 78)) * BOX.h

// Подписи ролей в колонке справа с выносками: точки облака стоят плотно.
const LABEL: Record<string, number> = { Sol: 250, Flash: 350, Argon: 450, Opus: 580 }
const LABEL_X = 1490

function Scatter({ f }: { f: number }) {
  const axes = progress(f, G(476), 14)
  const line = progress(f, G(496), 14, EASE_IO)
  const roles = progress(f, G(506), 16, EASE_OUT)
  const front = pareto.map((m) => `${LX(m.cost)},${LY(m.acc)}`).join(' ')
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
      <g opacity={axes} fontFamily={MONO} fontSize={22} fill={C.text3}>
        {[80, 90, 100].map((a) => (
          <g key={a}>
            <line x1={BOX.x} x2={BOX.x + BOX.w} y1={LY(a)} y2={LY(a)} stroke={C.line} strokeWidth={1.5} />
            <text x={BOX.x - 18} y={LY(a) + 8} textAnchor="end">{a}%</text>
          </g>
        ))}
        {[0.001, 0.01].map((c) => (
          <text key={c} x={LX(c)} y={BOX.y + BOX.h + 40} textAnchor="middle">${formatNum(c, 3)}</text>
        ))}
        <text x={BOX.x + BOX.w} y={BOX.y + BOX.h + 40} textAnchor="end" fill={C.text2}>цена за диалог →</text>
        <text x={BOX.x} y={BOX.y - 30} fill={C.text2}>точность на 12 чатах</text>
      </g>
      <polyline points={front} fill="none" stroke={C.accent} strokeWidth={2.5} strokeDasharray="1" pathLength={1} strokeDashoffset={1 - line} opacity={0.75} />
      {cloud.map((m, i) => {
        const p = progress(f, G(480) + i * 1.3, 12, EASE_OUT)
        const hero = Boolean(m.role)
        const isOpus = m.id === opus.id
        const lift = hero ? roles : 0
        const x = LX(m.cost)
        const y = LY(m.acc) - (1 - p) * 220 - lift * 10
        const r = 9 + (hero ? 6 * roles : 0)
        const fill = hero ? (roles > 0 ? C.accent : '#9aa59e') : isOpus ? C.text3 : '#9aa59e'
        const lab = LABEL[m.name] as number | undefined
        const show = hero || isOpus ? roles : 0
        return (
          <g key={m.id} opacity={Math.min(1, p * 2)}>
            <circle cx={x} cy={y} r={r} fill={fill} stroke={C.card} strokeWidth={3} />
            {lab !== undefined && show > 0 && (
              <g opacity={show} fontFamily={UI}>
                <path d={`M${x + r + 4} ${y} L${LABEL_X - 120} ${lab} H${LABEL_X - 16}`} fill="none" stroke={isOpus ? C.text3 : C.accent} strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - show} />
                <text x={LABEL_X} y={lab + 4} fontSize={36} fontWeight={600} fill={isOpus ? C.text3 : C.text}>
                  {m.name} <tspan fontFamily={MONO} fontWeight={500}>{formatNum(m.acc, 1)}</tspan>
                </text>
                <text x={LABEL_X} y={lab + 40} fontSize={28} fill={isOpus ? C.text3 : C.accentDark}>
                  {isOpus ? `×${opusTimes} по цене` : m.role}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Totals({ f }: { f: number }) {
  const s = G(514)
  const items = [
    { node: <Odometer value={price} decimals={3} prefix="$" start={s} dur={26} />, label: 'за диалог' },
    { node: <><Odometer value={seconds10} start={s + 5} dur={26} /> с</>, label: 'на 10 чатов' },
  ]
  return (
    <div style={{ position: 'absolute', left: 230, top: 830, display: 'flex', gap: 120 }}>
      {items.map((it, i) => {
        const p = progress(f, s + i * 5, 14)
        return (
          <div key={it.label} style={{ display: 'flex', alignItems: 'baseline', gap: 22, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 104, letterSpacing: '-0.05em', lineHeight: 1, color: i ? C.text : C.accent, fontVariationSettings: `'wght' ${250 + 450 * progress(f, s + i * 5, 20)}`, whiteSpace: 'nowrap' }}>{it.node}</div>
            <div style={{ fontFamily: UI, fontSize: 34, color: C.text2 }}>{it.label}</div>
          </div>
        )
      })}
    </div>
  )
}

export function S5Models() {
  const f = useCurrentFrame()
  const away = progress(f, G(460), 12, EASE_IO) // группа баров уезжает влево
  return (
    <>
      <LightBg />
      {away < 1 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-away * 1920}px)` }}>
          <LocalBars f={f} />
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - progress(f, G(470), 14, EASE_OUT)) * 500}px)`, opacity: progress(f, G(470), 8) }}>
        <div style={{ position: 'absolute', left: 120, top: 92, fontFamily: DISPLAY, fontSize: 60, letterSpacing: '-0.04em', color: C.text, fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(472), 20)}` }}>
          Облако: {cloud.length} моделей
        </div>
        <Scatter f={f} />
      </div>
      <Totals f={f} />
    </>
  )
}
