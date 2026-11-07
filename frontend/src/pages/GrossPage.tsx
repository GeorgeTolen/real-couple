import { useEffect, useMemo, useState } from 'react'
import { Button } from '@fluentui/react-components'
import { Link } from 'react-router-dom'
import { api, type ConversationRow, type GrossReason } from '../api'
import { ErrorBox, Loading } from '../components/common'
import { CHANNEL, score } from '../format'

const CATEGORIES = ['Раскрытие данных', 'Платная услуга в обход компании', 'Оскорбление']
const NO_TYPE = 'Тип не указан'

type Row = { conversation: ConversationRow; reason: GrossReason }

export default function GrossPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    api
      .conversations({ gross: true })
      .then((data) =>
        setRows(
          data.items.flatMap((conversation) =>
            (conversation.evaluation?.gross_reasons ?? []).map((reason) => ({ conversation, reason })),
          ),
        ),
      )
      .catch((e: Error) => {
        setError(e.message)
        setRows([])
      })
  }, [])

  const count = (name: string) => (rows ?? []).filter((r) => (r.reason.category ?? NO_TYPE) === name).length
  const visible = useMemo(
    () => (rows ?? []).filter((r) => !category || (r.reason.category ?? NO_TYPE) === category),
    [rows, category],
  )
  const current = visible.find((r) => r.conversation.id === selected) ?? visible[0] ?? null
  const filters = [...CATEGORIES, ...((rows ?? []).some((r) => !r.reason.category) ? [NO_TYPE] : [])]

  return (
    <main className="content">
      <div className="page-head"><h1>Грубые нарушения</h1></div>
      <div className="filters">
        <button className={`chip-toggle ${category === null ? 'on' : ''}`} onClick={() => setCategory(null)}>
          Все <span className="mono">{rows?.length ?? 0}</span>
        </button>
        {filters.map((name) => (
          <button
            key={name}
            className={`chip-toggle ${category === name ? 'on' : ''}`}
            onClick={() => setCategory(category === name ? null : name)}
          >
            {name} <span className="mono">{count(name)}</span>
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {rows === null ? <Loading /> : !visible.length ? (
        <div className="card empty">Грубых нарушений с такими условиями нет.</div>
      ) : (
        <div className="gross-layout">
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Диалог</th><th>Оператор</th><th>Тип нарушения</th><th>Реплика</th><th className="right">Итог</th><th>Апелляция</th></tr>
              </thead>
              <tbody>
                {visible.map(({ conversation, reason }) => (
                  <tr
                    key={`${conversation.id}-${reason.criterion_id}`}
                    className={`link gross ${current?.conversation.id === conversation.id ? 'selected' : ''}`}
                    onClick={() => setSelected(conversation.id)}
                  >
                    <td className="mono"><b>{conversation.id}</b></td>
                    <td>{conversation.operator ?? <span className="muted">Не определён</span>}</td>
                    <td><span className="badge no">{reason.category ?? NO_TYPE}</span></td>
                    <td className="small">
                      {reason.turn !== null && <span className="mono muted">#{reason.turn} </span>}
                      {reason.quote && reason.quote.length > 70 ? `${reason.quote.slice(0, 70)}...` : reason.quote}
                    </td>
                    <td className="mono right">{score(conversation.evaluation?.final_total)}</td>
                    <td>
                      {conversation.appeal_status === 'open' && <span className="badge mid">На рассмотрении</span>}
                      {conversation.appeal_status === 'resolved' && <span className="badge yes">Решено</span>}
                      {!conversation.appeal_status && <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current && (
            <div className="card pad stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="mono">{current.conversation.id}</h2>
                <span className="small muted">
                  {CHANNEL[current.conversation.channel] ?? current.conversation.channel} · {current.conversation.language}
                </span>
              </div>
              <span><span className="badge no">{current.reason.category ?? NO_TYPE}</span></span>
              {current.reason.quote && (
                <div className="judge-note" style={{ background: 'var(--no-bg)' }}>
                  <span className="mono muted">#{current.reason.turn} </span>{current.reason.quote}
                </div>
              )}
              <h3>Почему так классифицировано</h3>
              <div>{current.reason.explanation}</div>
              {current.reason.evidence_ids.length > 0 && (
                <div className="small muted">
                  Доказательства: <span className="mono">{current.reason.evidence_ids.map((n) => `#${n}`).join(' ')}</span>
                </div>
              )}
              <Link to={`/conversations/${current.conversation.id}`}>
                <Button appearance="primary">Открыть диалог</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
