import { useEffect, useState } from 'react'
import { Field, Select } from '@fluentui/react-components'
import { api, type ChecklistListItem, type Stats } from '../api'
import { ErrorBox, Loading } from '../components/common'
import { money, points, score, seconds } from '../format'

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [checklists, setChecklists] = useState<ChecklistListItem[]>([])
  const [channel, setChannel] = useState('')
  const [language, setLanguage] = useState('')
  const [version, setVersion] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.checklists().then(setChecklists).catch(() => setChecklists([]))
  }, [])

  useEffect(() => {
    api
      .stats({ channel: channel || undefined, language: language || undefined, version: version || undefined })
      .then((data) => { setStats(data); setError(null) })
      .catch((e: Error) => setError(e.message))
  }, [channel, language, version])

  if (error && !stats) return <main className="content"><ErrorBox message={error} /></main>
  if (!stats) return <main className="content"><Loading /></main>

  const agreeTotal = stats.criteria.reduce((sum, c) => sum + c.agree, 0)
  const disagreeTotal = stats.criteria.reduce((sum, c) => sum + c.disagree, 0)
  const versions = checklists.find((c) => c.id === 'freedom-default')?.versions ?? []

  return (
    <main className="content">
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
            <option value="">Последняя с оценками</option>
            {versions.map((v) => <option key={v.version} value={v.version}>Версия {v.version}</option>)}
          </Select>
        </Field>
        <div className="metrics" style={{ marginLeft: 'auto' }}>
          <div>Оценено<b>{stats.evaluated} из {stats.total_conversations}</b></div>
          <div>Средний балл<b>{score(stats.avg_score)}</b></div>
        </div>
      </div>
      {!stats.evaluated ? <div className="card empty">Для этих фильтров оценок нет.</div> : (
        <div className="stack lg">
          <div className="analytics">
            <div className="card pad">
              <h2>Выполнение критериев</h2>
              <div className="legend">
                <span><i className="fill-yes" />Да или высшая ступень</span>
                <span><i className="fill-mid" />Промежуточная ступень</span>
                <span><i className="fill-no" />Нет или ноль</span>
                <span><i className="fill-na" />N/A</span>
              </div>
              {stats.criteria.map((c) => {
                const total = c.yes + c.no + c.partial + c.na
                // Для флага грубой ошибки «Да» означает нарушение, поэтому цвета меняются местами.
                const good = c.type === 'flag' ? c.no : c.yes
                const bad = c.type === 'flag' ? c.yes : c.no
                return (
                  <div key={c.criterion_id} className="stack-row">
                    <span>{c.title} {c.type !== 'flag' && <span className="muted small">вес {points(c.weight)}</span>}</span>
                    <div className="stack-bar" role="img" aria-label={`${c.title}: успешно ${pct(good, total)}%`}>
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
                        <td>{row.worst_criterion ? <span className="badge mid">{row.worst_criterion}</span> : '—'}</td>
                        <td className="mono right">{row.gross}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="card pad analytics">
            <div className="stack">
              <h2>Надёжность оценки</h2>
              <div className="caps">Совпадение моделей по критериям</div>
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
            </div>
            <div className="stack">
              <div className="notice">
                Ручная проверка изменила <b className="mono">{stats.decisions_changed}</b> из <b className="mono">{stats.evaluated}</b> оценок.
              </div>
              <div className="caps">Модели оценки</div>
              {Object.entries(stats.models).map(([role, model]) => (
                <div key={role} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">{{ judge_a: 'Судья A', judge_b: 'Судья B', arbiter: 'Арбитр', single: 'Модель' }[role] ?? role}</span>
                  <span className="mono small">{model}</span>
                </div>
              ))}
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Средняя стоимость оценки</span><span className="mono">{money(stats.avg_cost_usd, 4)}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Среднее время оценки</span>
                <span className="mono">{stats.avg_latency_ms !== null ? seconds(stats.avg_latency_ms) : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
