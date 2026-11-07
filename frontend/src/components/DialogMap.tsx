import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Select } from '@fluentui/react-components'
import { useNavigate } from 'react-router-dom'
import { api, type MapItem } from '../api'
import { score } from '../format'
import { ErrorBox, Segments } from './common'

const WIDTH = 720
const HEIGHT = 520
const LEFT = 56
const RIGHT = 24
const TOP = 24
const BOTTOM = 56
const NORM = 85
const PROBLEM = 70

type Mode = 'dialogs' | 'operators' | 'shift'
type Placed = MapItem & { x: number; y: number; px: number; py: number }

const sx = (value: number) => LEFT + (value / 100) * (WIDTH - LEFT - RIGHT)
const sy = (value: number) => HEIGHT - BOTTOM - (value / 100) * (HEIGHT - TOP - BOTTOM)

function colorOf(item: MapItem): string {
  if (item.needs_review) return '#e2a227'
  if ((item.total ?? 0) < PROBLEM) return '#d13b45'
  return '#138a4e'
}

function hasAxes(item: MapItem): item is MapItem & { x: number; y: number } {
  return item.x !== null && item.y !== null
}

// Совпадающие точки раздвигаются по спирали: положение остаётся читаемым, счётчик показывает группу.
function spread(items: MapItem[]): { points: Placed[]; groups: { x: number; y: number; count: number }[] } {
  const grouped = new Map<string, (MapItem & { x: number; y: number })[]>()
  for (const item of items.filter(hasAxes)) {
    const key = `${item.x}|${item.y}`
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  const points: Placed[] = []
  const groups: { x: number; y: number; count: number }[] = []
  for (const list of grouped.values()) {
    list.forEach((item, index) => {
      const r = 6 * Math.sqrt(index)
      const angle = index * 2.4
      // У края графика облако отражается внутрь, чтобы точки не вылезали за оси.
      let px = sx(item.x) + Math.cos(angle) * r
      let py = sy(item.y) + Math.sin(angle) * r
      if (px > sx(100)) px = 2 * sx(100) - px
      if (py < sy(100)) py = 2 * sy(100) - py
      points.push({ ...item, px, py })
    })
    if (list.length > 1) groups.push({ x: list[0].x, y: list[0].y, count: list.length })
  }
  return { points, groups }
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="Карта диалогов: решение вопроса и сервис">
      <defs>
        <marker id="shift-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#5e655f" />
        </marker>
      </defs>
      <rect
        x={sx(NORM)} y={sy(100)} width={sx(100) - sx(NORM)} height={sy(NORM) - sy(100)}
        fill="rgba(19, 138, 78, .1)" stroke="#138a4e" strokeDasharray="4 4"
      />
      {[0, 20, 40, 60, 80, 100].map((tick) => (
        <g key={tick}>
          <line x1={sx(tick)} x2={sx(tick)} y1={sy(0)} y2={sy(100)} stroke="#ecebe4" />
          <line x1={sx(0)} x2={sx(100)} y1={sy(tick)} y2={sy(tick)} stroke="#ecebe4" />
          <text className="chart-axis" x={sx(tick)} y={sy(0) + 20} textAnchor="middle">{tick}</text>
          <text className="chart-axis" x={sx(0) - 8} y={sy(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}
      <text className="chart-title" x={(sx(0) + sx(100)) / 2} y={HEIGHT - 12} textAnchor="middle">Решение вопроса</text>
      <text className="chart-title" transform={`translate(16 ${(sy(0) + sy(100)) / 2}) rotate(-90)`} textAnchor="middle">Сервис</text>
      {children}
      <path
        d={`M${sx(100)} ${sy(100) - 8} l8 8 l-8 8 l-8 -8 z`}
        fill="#0e3b27"
        stroke="#ffffff"
        data-testid="etalon"
      >
        <title>Эталон чек-листа: 100 и 100</title>
      </path>
    </svg>
  )
}

export default function DialogMap({ items, version, versions, channel, language }: {
  items: MapItem[]
  version: number | null
  versions: number[]
  channel?: string
  language?: string
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('dialogs')
  const [selected, setSelected] = useState<string | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const [right, setRight] = useState<number | null>(null)
  const [pairs, setPairs] = useState<{ before: MapItem[]; after: MapItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'shift' || left !== null || versions.length < 2) return
    setLeft(versions[1])
    setRight(versions[0])
  }, [mode, left, versions])

  useEffect(() => {
    if (mode !== 'shift' || left === null || right === null) return
    let live = true
    Promise.all([api.analyticsMap({ version: left, channel, language }), api.analyticsMap({ version: right, channel, language })])
      .then(([before, after]) => {
        if (live) setPairs({ before: before.items, after: after.items })
      })
      .catch((e: Error) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [mode, left, right, channel, language])

  const { points, groups } = useMemo(() => spread(items), [items])
  const worst = useMemo(
    () => [...points].sort((a, b) => (a.total ?? 0) - (b.total ?? 0)).slice(0, 3).map((p) => p.id),
    [points],
  )
  const skipped = items.length - points.length

  const operators = useMemo(() => {
    const map = new Map<string, Placed[]>()
    for (const point of points) {
      if (point.operator && point.operator !== 'Имя скрыто') {
        map.set(point.operator, [...(map.get(point.operator) ?? []), point])
      }
    }
    return [...map.entries()].map(([name, list]) => {
      const mx = list.reduce((sum, p) => sum + p.x, 0) / list.length
      const my = list.reduce((sum, p) => sum + p.y, 0) / list.length
      const dev = (values: number[], mean: number) =>
        Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
      return { name, mx, my, dx: dev(list.map((p) => p.x), mx), dy: dev(list.map((p) => p.y), my), n: list.length }
    })
  }, [points])

  const open = (id: string) => navigate(`/conversations/${id}`)

  return (
    <div className="chart" data-testid="dialog-map">
      <div className="row between wrap" style={{ marginBottom: 8 }}>
        <Segments
          value={mode}
          onChange={setMode}
          options={[
            { value: 'dialogs', label: 'Диалоги' },
            { value: 'operators', label: 'Центры операторов' },
            { value: 'shift', label: 'Сдвиг версий' },
          ]}
        />
        {mode === 'shift' && versions.length >= 2 && (
          <div className="row">
            <Select aria-label="Было" value={String(left ?? '')} onChange={(_, d) => setLeft(Number(d.value))}>
              {versions.map((v) => <option key={v} value={v}>Версия {v}</option>)}
            </Select>
            <span className="muted">к</span>
            <Select aria-label="Стало" value={String(right ?? '')} onChange={(_, d) => setRight(Number(d.value))}>
              {versions.map((v) => <option key={v} value={v}>Версия {v}</option>)}
            </Select>
          </div>
        )}
      </div>
      <ErrorBox message={error} />
      {mode === 'dialogs' && (
        <Frame>
          {points
            .filter((p) => (p.total ?? 100) < PROBLEM)
            .map((p) => (
              <line key={`l-${p.id}`} x1={p.px} y1={p.py} x2={sx(100)} y2={sy(100)} stroke="#c9c7be" strokeDasharray="3 4" />
            ))}
          {points.map((p) => (
            <g key={p.id}>
              {p.gross && <circle cx={p.px} cy={p.py} r={8} fill="none" stroke="#b4232c" strokeWidth="2" />}
              <circle
                className="map-point"
                data-id={p.id}
                cx={p.px}
                cy={p.py}
                r={selected === p.id ? 6 : 4}
                fill={colorOf(p)}
                tabIndex={0}
                role="link"
                aria-label={`${p.id}, итог ${score(p.total)}${p.gross ? ', грубое нарушение' : ''}`}
                onMouseEnter={() => setSelected(p.id)}
                onFocus={() => setSelected(p.id)}
                onClick={() => open(p.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') open(p.id)
                }}
              />
            </g>
          ))}
          {groups.filter((g) => g.count > 2).map((g) => (
            <text key={`${g.x}-${g.y}`} className="chart-label" x={sx(g.x) + 12} y={sy(g.y) - 12} textAnchor={g.x > 70 ? 'end' : 'start'}>
              <title>Диалогов в этой точке: {g.count}</title>
              ×{g.count}
            </text>
          ))}
          {points
            .filter((p) => p.id === selected || worst.includes(p.id))
            .sort((a, b) => a.py - b.py)
            .reduce<{ point: Placed; y: number }[]>((labels, point) => {
              // Подписи близких точек расходятся по вертикали.
              const previous = labels[labels.length - 1]
              const y = previous && point.py + 4 - previous.y < 16 ? previous.y + 16 : point.py + 4
              return [...labels, { point, y }]
            }, [])
            .map(({ point, y }) => (
              <text
                key={`t-${point.id}`}
                className="chart-label"
                x={point.x > 70 ? point.px - 12 : point.px + 12}
                y={y}
                textAnchor={point.x > 70 ? 'end' : 'start'}
              >
                {point.id} {score(point.total)}
              </text>
            ))}
        </Frame>
      )}
      {mode === 'operators' && (
        <Frame>
          {operators.map((o) => (
            <g key={o.name}>
              <ellipse
                cx={sx(o.mx)} cy={sy(o.my)}
                rx={Math.max(6, (o.dx / 100) * (WIDTH - LEFT - RIGHT))}
                ry={Math.max(6, (o.dy / 100) * (HEIGHT - TOP - BOTTOM))}
                fill="rgba(19, 138, 78, .08)" stroke="#9fc8b1"
              />
              <path d={`M${sx(o.mx) - 6} ${sy(o.my)} h12 M${sx(o.mx)} ${sy(o.my) - 6} v12`} stroke="#0e3b27" strokeWidth="2" />
              <title>{o.name}: диалогов {o.n}</title>
            </g>
          ))}
          {operators
            .sort((a, b) => a.mx + a.my - (b.mx + b.my))
            .slice(0, 6)
            .map((o) => (
              <text key={`n-${o.name}`} className="chart-label" x={sx(o.mx) + 8} y={sy(o.my) - 8}>{o.name}</text>
            ))}
        </Frame>
      )}
      {mode === 'shift' && (
        versions.length < 2 ? (
          <div className="empty">Для сравнения нужны две версии чек-листа с оценками. Сейчас есть только версия {version ?? 'нет'}.</div>
        ) : (
          <Frame>
            {(pairs?.after ?? []).filter(hasAxes).map((item) => {
              const before = pairs?.before.find((b) => b.id === item.id)
              if (!before || !hasAxes(before)) return null
              const moved = before.x !== item.x || before.y !== item.y
              return moved ? (
                <line
                  key={item.id}
                  x1={sx(before.x)} y1={sy(before.y)} x2={sx(item.x)} y2={sy(item.y)}
                  stroke="#5e655f" markerEnd="url(#shift-arrow)"
                >
                  <title>{item.id}: {score(before.total)} и {score(item.total)}</title>
                </line>
              ) : (
                <circle key={item.id} cx={sx(item.x)} cy={sy(item.y)} r={3} fill="#c9ccd1" />
              )
            })}
          </Frame>
        )
      )}
      {skipped > 0 && mode === 'dialogs' && (
        <div className="small muted">Не показано диалогов: {skipped}, у них нет оценённых критериев на одной из осей.</div>
      )}
    </div>
  )
}
