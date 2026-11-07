import { useEffect, useMemo, useState } from 'react'
import { Field, Select } from '@fluentui/react-components'
import { useNavigate } from 'react-router-dom'
import { api, type ChecklistListItem, type MapItem, type Stats } from '../api'
import { EmptyState, ErrorBox, Loading } from '../components/common'
import DialogMap from '../components/DialogMap'
import KpiStrip from '../components/KpiStrip'
import ScoreDensity from '../components/ScoreDensity'
import { money, points, score, seconds } from '../format'

const ROLE: Record<string, string> = { judge_a: 'Судья A', judge_b: 'Судья B', arbiter: 'Арбитр', single: 'Модель' }

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [mapItems, setMapItems] = useState<MapItem[]>([])
  const [scores, setScores] = useState<number[]>([])
  const [median, setMedian] = useState<number | null>(null)
  const [mapVersion, setMapVersion] = useState<number | null>(null)
  const [checklists, setChecklists] = useState<ChecklistListItem[]>([])
  const [evaluatedVersions, setEvaluatedVersions] = useState<number[]>([])
  const [channel, setChannel] = useState('')
  const [language, setLanguage] = useState('')
  const [version, setVersion] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.checklists().then(setChecklists).catch(() => setChecklists([]))
  }, [])

  const versions = useMemo(
    () => checklists.find((c) => c.id === 'freedom-default')?.versions.map((v) => v.version) ?? [],
    [checklists],
  )

  const params = useMemo(
    () => ({ channel: channel || undefined, language: language || undefined, version: version || undefined }),
    [channel, language, version],
  )

  useEffect(() => {
    let live = true
    Promise.all([api.stats(params), api.analyticsMap(params), api.distribution(params)])
      .then(([statsData, mapData, distribution]) => {
        if (!live) return
        setStats(statsData)
        setMapItems(mapData.items)
        setMapVersion(mapData.version)
        setScores(distribution.scores.map((row) => row.total))
        setMedian(distribution.median)
        setError(null)
      })
      .catch((e: Error) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [params])

  useEffect(() => {
    if (!versions.length) return
    let live = true
    // Сравнивать на карте можно только версии, которыми реально оценивали диалоги.
    Promise.all(versions.map((v) => api.analyticsMap({ version: v, channel: params.channel, language: params.language })))
      .then((maps) => {
        if (live) setEvaluatedVersions(versions.filter((_, i) => maps[i].items.length > 0))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [versions, params.channel, params.language])

  if (error && !stats) return <main className="content"><ErrorBox message={error} /></main>
  if (!stats) return <main className="content"><Loading /></main>

  const agreeTotal = stats.criteria.reduce((sum, c) => sum + c.agree, 0)
  const disagreeTotal = stats.criteria.reduce((sum, c) => sum + c.disagree, 0)

  return (
    <main className="content">
      <KpiStrip params={params} />
      <div className="page-head"><h1>Аналитика качества</h1></div>
      <div className="filters">
        <Field label="Канал">
          <Select value={channel} onChange={(_, data) => setChannel(data.value)}>
            <option value="">Все каналы</option>
            <option value="agent chat">Чат</option>
            <option value="voice call">Звонок</option>
          </Select>
        </Field>
        <Field label="Язык">
          <Select value={language} onChange={(_, data) => setLanguage(data.value)}>
            <option value="">Все языки</option>
            <option value="RU">RU</option>
            <option value="KZ">KZ</option>
            <option value="EN">EN</option>
          </Select>
        </Field>
        <Field label="Версия чек-листа">
          <Select value={version} onChange={(_, data) => setVersion(data.value)}>
            <option value="">Самая полная версия</option>
            {versions.map((v) => <option key={v} value={v}>Версия {v}</option>)}
          </Select>
        </Field>
      </div>
      {!stats.evaluated ? (
        <EmptyState
          title="Оценок пока нет"
          hint="Запустите оценку диалогов, и здесь появятся распределение баллов и карта."
          action={<button type="button" className="chip-toggle" onClick={() => navigate('/run')}>Перейти к запуску оценки</button>}
        />
      ) : (
        <div className="stack lg">
          <div className="legend" aria-label="Обозначения">
            <span><i className="fill-yes" />Да, норма</span>
            <span><i className="fill-mid" />Частично, на проверку</span>
            <span><i className="fill-no" />Нет, итог ниже 70</span>
            <span><i className="fill-na" />N/A</span>
            <span>Кольцо: грубое нарушение</span>
            <span>Ромб: эталон чек-листа</span>
            <span>Рамка: норма от 85 по обеим осям</span>
          </div>
          <div className="analytics">
            <div className="card pad">
              <h2>Плотность распределения, диалогов {scores.length}</h2>
              <ScoreDensity
                scores={scores}
                median={median}
                onPick={(from, to) => navigate(`/?score=${from}-${to}`)}
              />
            </div>
            <div className="card pad">
              <h2>Карта диалогов: решение вопроса и сервис</h2>
              <DialogMap
                items={mapItems}
                version={mapVersion}
                versions={evaluatedVersions}
                channel={params.channel}
                language={params.language}
              />
            </div>
          </div>
          <div className="analytics">
            <div className="card pad">
              <h2>Выполнение критериев</h2>
              {stats.criteria.map((c) => {
                const total = c.yes + c.no + c.partial + c.na
                // Для флага грубой ошибки «Да» означает нарушение, поэтому цвета меняются местами.
                const good = c.type === 'flag' ? c.no : c.yes
                const bad = c.type === 'flag' ? c.yes : c.no
                return (
                  <div key={c.criterion_id} className="stack-row pad-text">
                    <span>{c.title} {c.type !== 'flag' && <span className="muted small">вес {points(c.weight)}</span>}</span>
                    <div className="stack-bar" role="img" aria-label={`${c.title}: норма ${pct(good, total)}%`}>
                      <i className="fill-yes" style={{ width: `${pct(good, total)}%` }} />
                      <i className="fill-mid" style={{ width: `${pct(c.partial, total)}%` }} />
                      <i className="fill-no" style={{ width: `${pct(bad, total)}%` }} />
                      <i className="fill-na" style={{ width: `${pct(c.na, total)}%` }} />
                    </div>
                    <span className="mono small right">
                      {pct(good, total)} / {pct(c.partial, total)} / {pct(bad, total)} / {pct(c.na, total)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="card pad stack">
              <h2>Операторы</h2>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr><th>Оператор</th><th className="right">Диалогов</th><th className="right">Средний балл</th><th>Худший критерий</th><th className="right">Грубые</th></tr>
                  </thead>
                  <tbody>
                    {stats.operators.map((row) => (
                      <tr key={row.operator}>
                        <td>{row.operator}</td>
                        <td className="mono right">{row.dialogs}</td>
                        <td className="mono right">{score(row.avg_score)}</td>
                        <td>{row.worst_criterion ? <span className="badge plain">{row.worst_criterion}</span> : '—'}</td>
                        <td className="mono right">{row.gross}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="card pad">
            <h2>Надёжность оценки</h2>
            <div className="analytics pad-text">
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr><th>Критерий</th><th className="right">Совпадение</th><th className="right">Расхождение</th><th className="right">Доля совпадения</th></tr>
                  </thead>
                  <tbody>
                    {stats.criteria.map((c) => (
                      <tr key={c.criterion_id}>
                        <td>{c.title}</td>
                        <td className="mono right">{c.agree}</td>
                        <td className="mono right">{c.disagree}</td>
                        <td className="mono right">{c.agree + c.disagree ? `${pct(c.agree, c.agree + c.disagree)}%` : '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td><b>Итого</b></td>
                      <td className="mono right"><b>{agreeTotal}</b></td>
                      <td className="mono right"><b>{disagreeTotal}</b></td>
                      <td className="mono right"><b>{agreeTotal + disagreeTotal ? `${pct(agreeTotal, agreeTotal + disagreeTotal)}%` : '—'}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="stack">
                <div className="notice">
                  Ручная проверка изменила <b className="mono">{stats.decisions_changed}</b> из <b className="mono">{stats.evaluated}</b> оценок.
                </div>
                {Object.entries(stats.models).map(([role, model]) => (
                  <div key={role} className="row between">
                    <span className="muted">{ROLE[role] ?? role}</span>
                    <span className="mono small">{model}</span>
                  </div>
                ))}
                <div className="row between">
                  <span className="muted">Средняя стоимость оценки</span><span className="mono">{money(stats.avg_cost_usd, 4)}</span>
                </div>
                <div className="row between">
                  <span className="muted">Среднее время оценки</span>
                  <span className="mono">{stats.avg_latency_ms !== null ? seconds(stats.avg_latency_ms) : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
