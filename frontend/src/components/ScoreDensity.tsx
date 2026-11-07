import { useMemo, useState } from 'react'
import { score } from '../format'

const WIDTH = 900
const HEIGHT = 440
const LEFT = 24
const RIGHT = 24
const BOTTOM = 32
const TOP = 32
const BAND = 5
const THRESHOLD = 70
const BANDWIDTH = 4.5
const ROW = 5
const COLUMN = 1

// Детерминированный генератор: картинка не прыгает между перерисовками.
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function ScoreDensity({ scores, median, onPick }: {
  scores: number[]
  median: number | null
  onPick?: (from: number, to: number) => void
}) {
  const [hover, setHover] = useState<{ from: number; count: number } | null>(null)
  const plotWidth = WIDTH - LEFT - RIGHT
  const plotHeight = HEIGHT - TOP - BOTTOM
  const x = (value: number) => LEFT + (value / 100) * plotWidth
  const floor = HEIGHT - BOTTOM

  const dots = useMemo(() => {
    const density = (value: number) =>
      scores.reduce((sum, s) => sum + Math.exp(-((value - s) ** 2) / (2 * BANDWIDTH ** 2)), 0)
    const columns = Array.from({ length: 101 / COLUMN }, (_, i) => i * COLUMN)
    const peak = Math.max(1e-6, ...columns.map(density))
    const random = seeded(4242)
    let path = ''
    for (const value of columns) {
      const rows = Math.round((density(value) / peak) * (plotHeight / ROW))
      for (let row = 0; row < rows; row += 1) {
        const px = x(value) + (random() - 0.5) * 6
        const py = floor - 2 - row * ROW + (random() - 0.5) * 3
        path += `M${px.toFixed(1)} ${py.toFixed(1)}h0`
      }
    }
    return path
    // x и floor зависят только от констант.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, plotHeight, floor])

  const bands = Array.from({ length: 100 / BAND }, (_, i) => {
    const from = i * BAND
    const to = from + BAND
    const count = scores.filter((s) => s >= from && (to === 100 ? s <= to : s < to)).length
    return { from, to, count }
  })

  return (
    <div className="chart" data-testid="density">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label={`Распределение итоговых баллов, диалогов ${scores.length}, медиана ${score(median)}`}
      >
        <path d={dots} stroke="#138a4e" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".75" />
        <line x1={LEFT} x2={WIDTH - RIGHT} y1={floor} y2={floor} stroke="#9aa09b" />
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={floor} y2={floor + 4} stroke="#9aa09b" />
            <text className="chart-axis" x={x(tick)} y={floor + 20} textAnchor="middle">{tick}</text>
          </g>
        ))}
        <line x1={x(THRESHOLD)} x2={x(THRESHOLD)} y1={TOP} y2={floor} stroke="#b4232c" strokeDasharray="2 4" />
        <text className="chart-axis" x={x(THRESHOLD) - 4} y={TOP + 12} textAnchor="end">порог {THRESHOLD}</text>
        {median !== null && (
          <>
            <line x1={x(median)} x2={x(median)} y1={TOP - 8} y2={floor} stroke="#0e3b27" strokeDasharray="6 4" strokeWidth="2" />
            <text className="chart-label" x={x(median)} y={TOP - 12} textAnchor={median > 85 ? 'end' : median < 15 ? 'start' : 'middle'}>
              медиана {score(median)}
            </text>
          </>
        )}
        {bands.map((band) => (
          <rect
            key={band.from}
            className="band"
            data-from={band.from}
            x={x(band.from)}
            y={TOP}
            width={x(band.to) - x(band.from)}
            height={plotHeight}
            tabIndex={band.count ? 0 : undefined}
            role="button"
            aria-label={`баллы ${band.from}..${band.to}: диалогов ${band.count}`}
            onMouseEnter={() => setHover({ from: band.from, count: band.count })}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover({ from: band.from, count: band.count })}
            onBlur={() => setHover(null)}
            onClick={() => band.count && onPick?.(band.from, band.to)}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && band.count) onPick?.(band.from, band.to)
            }}
          />
        ))}
        {hover && (
          <text
            className="chart-label"
            data-testid="density-tip"
            x={Math.min(x(hover.from) + 4, WIDTH - 180)}
            y={TOP + 32}
          >
            баллы {hover.from}..{hover.from + BAND}: {hover.count}
          </text>
        )}
      </svg>
    </div>
  )
}
