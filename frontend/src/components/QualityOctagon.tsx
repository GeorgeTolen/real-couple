import { useId, useMemo, type ReactNode } from 'react'
import type { CriterionResult, ScaleStep } from '../api'
import { AGREEMENT, answerLabel, answerTone, points, score } from '../format'
import { AgreementDots } from './common'

export type OctagonItem = {
  criterion_id: string
  title: string
  type: 'binary' | 'scale' | 'flag'
  scale: ScaleStep[]
  answer?: string
  weight: number
  weighted_points?: number | null
}

const WIDE = { width: 1000, height: 640, cx: 500, cy: 320, radius: 190 }
const COMPACT = { width: 640, height: 640, cx: 320, cy: 320, radius: 270 }
const LEVELS = [0.25, 0.5, 0.75, 1]
const TONE_COLOR = { yes: '#138a4e', no: '#d13b45', mid: '#e2a227', na: '#9aa09b' }

export function fractionOf(item: OctagonItem, answer = item.answer): number | null {
  if (answer === undefined || answer === 'NA') return null
  if (item.type === 'flag') return answer === 'Y' ? 0 : 1
  if (item.type === 'binary') return answer === 'Y' ? 1 : 0
  const top = Math.max(...item.scale.map((s) => s.value))
  return top > 0 ? Number(answer) / top : 0
}

// Центр занят итогом, поэтому ноль лежит на внутреннем круге, а не в центре.
function radial(fraction: number, radius: number): number {
  return radius * (0.38 + 0.62 * fraction)
}

function vertex(index: number, total: number, r: number, cx: number, cy: number) {
  const angle = (index / total) * Math.PI * 2
  return { x: cx + Math.sin(angle) * r, y: cy - Math.cos(angle) * r, angle }
}

function polygon(total: number, r: number, cx: number, cy: number): string {
  return Array.from({ length: total }, (_, i) => vertex(i, total, r, cx, cy))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

function profile(items: OctagonItem[], cx: number, cy: number, radius: number, answers?: Record<string, string>): string {
  return items
    .flatMap((item, i) => {
      const fraction = fractionOf(item, answers?.[item.criterion_id] ?? item.answer)
      if (fraction === null) return []
      const p = vertex(i, items.length, radial(fraction, radius), cx, cy)
      return [`${p.x.toFixed(1)},${p.y.toFixed(1)}`]
    })
    .join(' ')
}

function statusLabel(item: OctagonItem): string {
  if (item.answer === undefined) return `вес ${points(item.weight)}`
  return answerLabel(item.answer)
}

export function pointsAfterWeight(item: OctagonItem): string {
  if (item.answer === 'NA') return 'N/A'
  if (item.type === 'flag' || item.weighted_points === undefined) return ''
  return `${points(item.weighted_points)} / ${points(item.weight)}`
}

export function stepOf(item: OctagonItem): string | null {
  if (item.type !== 'scale' || !item.answer || item.answer === 'NA') return null
  return `${item.answer} из ${Math.max(...item.scale.map((s) => s.value))}`
}

export default function QualityOctagon({ items, total, active, onActivate, compact = false, center, overlay, label }: {
  items: OctagonItem[]
  total?: number | null
  active?: string | null
  onActivate?: (criterionId: string) => void
  compact?: boolean
  center?: ReactNode
  /** Второй профиль поверх: было пунктиром, стало заливкой. */
  overlay?: Record<string, string>
  label?: string
}) {
  const box = compact ? COMPACT : WIDE
  const { cx, cy, radius } = box
  const titleId = useId()
  const n = items.length

  const cards = useMemo(() => {
    const placed = items.map((item, index) => ({ item, index, point: vertex(index, n, radius, cx, cy) }))
    const right = placed.filter((p) => p.point.angle < Math.PI).sort((a, b) => a.point.y - b.point.y)
    const left = placed.filter((p) => p.point.angle >= Math.PI).sort((a, b) => a.point.y - b.point.y)
    const slot = (list: typeof placed, side: 'left' | 'right') =>
      list.map((entry, order) => {
        const top = ((order + 0.5) / list.length) * box.height
        const edge = side === 'left' ? box.width * 0.27 + 8 : box.width * 0.73 - 8
        return { ...entry, side, top, edge }
      })
    return [...slot(right, 'right'), ...slot(left, 'left')]
  }, [items, n, radius, cx, cy, box])

  const summary = items
    .map((item) => `${item.title}: ${statusLabel(item)}`)
    .join(', ')

  return (
    <div className="octagon-wrap">
      <div className={`octagon ${compact ? 'compact' : ''}`} data-vertices={n}>
        <svg viewBox={`0 0 ${box.width} ${box.height}`} role="group" aria-labelledby={titleId}>
          <title id={titleId}>{label ?? `Профиль оценки. ${summary}`}</title>
          {LEVELS.map((level) => (
            <polygon
              key={level}
              points={polygon(n, radial(level, radius), cx, cy)}
              fill="none"
              stroke="#d5d3cb"
              strokeDasharray={level === 1 ? undefined : '4 4'}
            />
          ))}
          {LEVELS.map((level) => (
            <text key={level} className="oct-level" x={cx + 4} y={cy - radial(level, radius) + 16}>
              {level * 100}
            </text>
          ))}
          {items.map((item, i) => {
            const p = vertex(i, n, radius, cx, cy)
            return <line key={item.criterion_id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#ecebe4" />
          })}
          {overlay && (
            <polygon
              points={profile(items, cx, cy, radius)}
              fill="none"
              stroke="#5e655f"
              strokeWidth="2"
              strokeDasharray="6 5"
              data-layer="before"
            />
          )}
          <polygon
            points={profile(items, cx, cy, radius, overlay)}
            fill="rgba(19, 138, 78, .12)"
            stroke="#138a4e"
            strokeWidth="2"
            data-layer="current"
          />
          <g className="oct-lines">
            {!compact &&
              cards.map(({ item, index, top, edge }) => {
                const fraction = fractionOf(item, overlay?.[item.criterion_id] ?? item.answer)
                const p = vertex(index, n, fraction === null ? radius : radial(fraction, radius), cx, cy)
                return (
                  <polyline
                    key={item.criterion_id}
                    points={`${p.x.toFixed(1)},${p.y.toFixed(1)} ${edge},${top}`}
                    fill="none"
                    stroke={active === item.criterion_id ? '#138a4e' : '#c9c7be'}
                  />
                )
              })}
          </g>
          {items.map((item, i) => {
            const answer = overlay?.[item.criterion_id] ?? item.answer
            const fraction = fractionOf(item, answer)
            const hollow = fraction === null
            const p = vertex(i, n, hollow ? radius : radial(fraction, radius), cx, cy)
            const tone = answer === undefined ? 'na' : answerTone(item, answer)
            const size = active === item.criterion_id ? 11 : 8
            return (
              <circle
                key={item.criterion_id}
                className="oct-vertex"
                data-criterion={item.criterion_id}
                cx={p.x}
                cy={p.y}
                r={size}
                fill={hollow ? '#ffffff' : TONE_COLOR[tone]}
                stroke={hollow ? '#6b6f76' : '#ffffff'}
                strokeWidth="2"
                strokeDasharray={hollow ? '3 3' : undefined}
                tabIndex={onActivate ? 0 : undefined}
                role={onActivate ? 'button' : 'img'}
                aria-label={`${item.title}: ${statusLabel(item)}`}
                onMouseEnter={() => onActivate?.(item.criterion_id)}
                onFocus={() => onActivate?.(item.criterion_id)}
              />
            )
          })}
          {center === undefined && (
            <>
              <text className="oct-center" x={cx} y={cy + 8} textAnchor="middle">{score(total)}</text>
              <text className="oct-center-note" x={cx} y={cy + 36} textAnchor="middle">из 100</text>
            </>
          )}
          {center}
        </svg>
        {!compact &&
          cards.map(({ item, side, top }) => (
            <button
              key={item.criterion_id}
              type="button"
              className={`oct-card ${active === item.criterion_id ? 'on' : ''}`}
              style={{ top: `${(top / box.height) * 100}%`, [side]: 0 }}
              onMouseEnter={() => onActivate?.(item.criterion_id)}
              onFocus={() => onActivate?.(item.criterion_id)}
            >
              <b>{item.title}</b>
              <span className={item.answer ? `tone-${answerTone(item, item.answer)}` : undefined}>{statusLabel(item)}</span>
              {pointsAfterWeight(item) && item.answer !== 'NA' && <span className="mono"> · {pointsAfterWeight(item)}</span>}
              {stepOf(item) && <div className="step mono">{stepOf(item)}</div>}
            </button>
          ))}
      </div>
    </div>
  )
}

function howToImprove(item: CriterionResult): string | null {
  const lost = item.max_points !== null && item.earned_points !== null && item.earned_points < item.max_points
  const flagged = item.type === 'flag' && item.answer === 'Y'
  if (!lost && !flagged) return null
  if (item.type === 'scale') {
    const value = Number(item.answer)
    const next = item.scale
      .filter((s) => s.value > value)
      .sort((a, b) => a.value - b.value)[0]
    return next ? `Следующая ступень ${next.value}: ${next.label}` : null
  }
  return item.description || null
}

export function CriterionPassport({ item, onJump }: { item: CriterionResult; onJump: (n: number) => void }) {
  const steps = item.type === 'scale'
    ? [...item.scale].sort((a, b) => a.value - b.value).map((s) => ({ value: String(s.value), label: String(s.value) }))
    : [{ value: item.type === 'flag' ? 'Y' : 'N', label: item.type === 'flag' ? 'Да' : 'Нет' }, { value: item.type === 'flag' ? 'N' : 'Y', label: item.type === 'flag' ? 'Нет' : 'Да' }]
  const position = steps.findIndex((s) => s.value === item.answer)
  const improve = howToImprove(item)
  return (
    <div className="passport" data-testid="passport" data-criterion={item.criterion_id}>
      <div className="row between wrap">
        <b>
          <span className="mono">{item.export_id ?? item.criterion_id}</span>
          {item.type !== 'flag' && <span className="muted"> · вес {points(item.weight)}</span>}
        </b>
        <span className="row small muted">
          <AgreementDots agreement={item.agreement} /> {AGREEMENT[item.agreement] ?? item.agreement}
        </span>
      </div>
      <b>{item.title}: {answerLabel(item.answer)}</b>
      {item.answer !== 'NA' ? (
        <div className="scale-track" aria-label={`Ответ модели: ${answerLabel(item.answer)}`} role="img">
          {steps.map((s, i) => (
            <span key={s.value} className="tick" style={{ left: `${(i / (steps.length - 1)) * 100}%` }}>
              <span>{s.label}</span>
            </span>
          ))}
          {position >= 0 && (
            <i
              className="diamond"
              style={{ left: `${(position / (steps.length - 1)) * 100}%`, background: TONE_COLOR[answerTone(item, item.answer)] }}
            />
          )}
        </div>
      ) : (
        <div className="small muted">Критерий неприменим, его вес распределён между остальными.</div>
      )}
      <div><b>{item.answer === 'NA' ? 'Причина N/A: ' : 'Почему: '}</b>{item.decision_reason ?? item.reasoning}</div>
      {improve && <div data-testid="how-to-improve"><b>Как улучшить: </b>{improve}</div>}
      {(item.evidence_ids.length > 0 || item.checked_range) && (
        <div className="row wrap">
          {item.evidence_ids.map((n) => (
            <button key={n} type="button" className="evidence" onClick={() => onJump(n)}>#{n}</button>
          ))}
          {item.checked_range && (
            <button type="button" className="evidence" onClick={() => onJump(item.checked_range![0])}>
              участок #{item.checked_range[0]} до #{item.checked_range[1]}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
