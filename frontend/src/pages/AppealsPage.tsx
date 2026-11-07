import { useCallback, useEffect, useState } from 'react'
import { Button, Field, Input, Select, Tab, TabList, Textarea } from '@fluentui/react-components'
import { Link } from 'react-router-dom'
import { api, type Appeal, type Evaluation } from '../api'
import { useRole } from '../App'
import { AgreementDots, AnswerBadge, EmptyState, ErrorBox, Loading, Segments } from '../components/common'
import QualityOctagon from '../components/QualityOctagon'
import { CHANNEL, SPEAKER, answerLabel, dateTime, points, score } from '../format'

const REASON_LIMIT = 300

function DecisionForm({ appeal, evaluation, onSaved }: { appeal: Appeal; evaluation: Evaluation | null; onSaved: () => void }) {
  const criterion = appeal.original_criterion
  const options = criterion.allowed_answers.filter((a) => a !== criterion.answer)
  const [action, setAction] = useState<'confirm' | 'change'>('change')
  const [answer, setAnswer] = useState(options[0] ?? '')
  const [reason, setReason] = useState('')
  const [reviewer, setReviewer] = useState('Проверяющий')
  const [preview, setPreview] = useState<{ before: number | null; after: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (action !== 'change' || !answer) {
      setPreview(null)
      return
    }
    let live = true
    api.preview(appeal.evaluation_id, appeal.criterion_id, answer)
      .then((data) => { if (live) setPreview(data) })
      .catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [action, answer, appeal.evaluation_id, appeal.criterion_id])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.decide(appeal.id, {
        reviewer: reviewer.trim(), action, new_answer: action === 'change' ? answer : null, reason: reason.trim(),
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="card pad">
      <h2>Решение</h2>
      <div className="decision-grid pad-text">
      <div className="stack">
      <div className="row wrap">
        <Segments
          value={action}
          onChange={setAction}
          options={[{ value: 'confirm', label: 'Подтвердить' }, { value: 'change', label: 'Изменить' }]}
        />
        {action === 'change' && (
          <>
            <span>Новый ответ по критерию</span>
            <Select value={answer} onChange={(_, data) => setAnswer(data.value)}>
              {options.map((option) => <option key={option} value={option}>{answerLabel(option)}</option>)}
            </Select>
          </>
        )}
      </div>
      <Field label="Причина решения" required>
        <Textarea
          rows={3}
          maxLength={REASON_LIMIT}
          value={reason}
          onChange={(_, data) => setReason(data.value)}
        />
      </Field>
      <div className="small muted right mono">{reason.length} / {REASON_LIMIT}</div>
      <Field label="Проверяющий" required>
        <Input value={reviewer} onChange={(_, data) => setReviewer(data.value)} />
      </Field>
      <ErrorBox message={error} />
      <div className="row between">
        <div>
          <span className="muted">Итог: </span>
          <b className="mono" style={{ fontSize: 20 }} data-testid="recount">
            {action === 'confirm' || !preview
              ? score(appeal.final_total)
              : `${score(preview.before)} → ${score(preview.after)}`}
          </b>
        </div>
        <Button appearance="primary" disabled={busy || !reason.trim() || !reviewer.trim()} onClick={save}>
          Сохранить решение
        </Button>
      </div>
      </div>
      {evaluation?.final && (
        <div data-testid="appeal-octagon">
          <QualityOctagon
            compact
            items={evaluation.final.criteria}
            total={action === 'change' && preview ? preview.after : appeal.final_total}
            overlay={action === 'change' ? { [appeal.criterion_id]: answer } : {}}
            label={`Было пунктиром, стало заливкой: ${appeal.original_criterion.title}`}
          />
          <div className="small muted right">Пунктир: было. Заливка: станет.</div>
        </div>
      )}
      </div>
    </div>
  )
}

function Detail({ appeal, onSaved }: { appeal: Appeal; onSaved: () => void }) {
  const role = useRole()
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  useEffect(() => {
    let live = true
    api.evaluation(appeal.evaluation_id)
      .then((data) => { if (live) setEvaluation(data) })
      .catch(() => { if (live) setEvaluation(null) })
    return () => { live = false }
  }, [appeal.evaluation_id, appeal.status])
  const finalAnswers = evaluation?.final
    ? Object.fromEntries(evaluation.final.criteria.map((c) => [c.criterion_id, c.answer]))
    : {}
  const criterion = appeal.original_criterion
  const evidence = new Set(criterion.evidence_ids)
  return (
    <div className="stack lg">
      <div className="row wrap">
        <h1>Апелляция: <Link className="mono" to={`/conversations/${appeal.conversation_id}`}>{appeal.conversation_id}</Link></h1>
        <span className="badge plain">{CHANNEL[appeal.channel] ?? appeal.channel}</span>
        <span className="badge plain">{appeal.language}</span>
        <span className="muted">Оператор: {appeal.operator ?? 'Не определён'}</span>
        <span className="muted">Чек-лист: {appeal.checklist_name}, версия {appeal.checklist_version}</span>
      </div>

      <div className="card compare">
        <div className="stack">
          <h3>Исходная оценка: {criterion.title}</h3>
          <div className="row">
            <AnswerBadge item={criterion} answer={criterion.answer} />
            <AgreementDots agreement={criterion.agreement} />
            <span className="mono">{points(criterion.weighted_points)} / {points(criterion.weight)}</span>
          </div>
          <div className="small muted">Модели: {Object.values(appeal.models).join(', ')}</div>
          <div>{criterion.reasoning}</div>
          {criterion.checked_range && (
            <div className="small muted">Проверенный участок: #{criterion.checked_range[0]} до #{criterion.checked_range[1]}</div>
          )}
        </div>
        <div className="stack">
          <h3>Комментарий</h3>
          <div>{appeal.comment}</div>
          <div className="small muted">{appeal.author}</div>
        </div>
        <div className="stack">
          <h3>Фрагмент диалога</h3>
          <div>
            {appeal.fragment.map((turn) => (
              <div key={turn.n} className={`frag ${evidence.has(turn.n) ? 'hit' : ''}`}>
                <span className="mono muted">#{turn.n}</span>
                <span><b>{SPEAKER[turn.speaker] ?? turn.speaker}:</b> {turn.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {appeal.status === 'open' && role === 'reviewer' && <DecisionForm key={appeal.id} appeal={appeal} evaluation={evaluation} onSaved={onSaved} />}
      {appeal.status === 'open' && role !== 'reviewer' && (
        <div className="notice">Решение принимает проверяющий. Переключите роль в верхней панели.</div>
      )}

      {appeal.status !== 'open' && evaluation?.original && (
        <div className="card pad">
          <h2>Было и стало: итог {score(appeal.original_total)} → {score(appeal.final_total)}</h2>
          <div className="pad-text" data-testid="appeal-octagon" style={{ maxWidth: 320 }}>
            <QualityOctagon compact items={evaluation.original.criteria} total={appeal.final_total} overlay={finalAnswers} />
            <div className="small muted">Пунктир: было. Заливка: стало.</div>
          </div>
        </div>
      )}

      <div className="card pad stack">
        <h2>История</h2>
        <div className="timeline-log pad-text">
          <div>
            <i className="dot" style={{ background: 'var(--accent)' }} />
            <span className="badge yes">Оценка</span>
            <span className="small muted">{dateTime(appeal.evaluation_created_at)}</span>
            <span>Критерий «{criterion.title}»: <b>{answerLabel(criterion.answer)}</b>. Итог <span className="mono">{score(appeal.original_total)}</span>.</span>
          </div>
          <div>
            <i className="dot" style={{ background: 'var(--accent)' }} />
            <span className="badge yes">Апелляция</span>
            <span className="small muted">{dateTime(appeal.created_at)}</span>
            <span>{appeal.author}: {appeal.comment}</span>
          </div>
          <div>
            <i className="dot" style={{ background: appeal.decision ? 'var(--accent)' : 'var(--text-3)' }} />
            <span className={`badge ${appeal.decision ? 'yes' : 'plain'}`}>Решение</span>
            <span className="small muted">{appeal.decision ? dateTime(appeal.decision.created_at) : 'Ожидает'}</span>
            <span>
              {appeal.decision
                ? <>{appeal.decision.reviewer}: {appeal.decision.action === 'change'
                    ? <>ответ изменён на <b>{answerLabel(appeal.decision.new_answer ?? '')}</b></>
                    : 'оценка подтверждена'}. {appeal.decision.reason} Финальный итог <span className="mono">{score(appeal.final_total)}</span>.</>
                : 'Решение проверяющего.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AppealsPage() {
  const [tab, setTab] = useState('open')
  const [items, setItems] = useState<Appeal[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [listed, open] = await Promise.all([
        api.appeals(tab === 'open' ? 'open' : 'resolved'),
        api.appeals('open'),
      ])
      setItems(listed)
      setOpenCount(open.length)
      setSelectedId((id) => (listed.some((a) => a.id === id) ? id : listed[0]?.id ?? null))
    } catch (e) {
      setError((e as Error).message)
      setItems([])
    }
  }, [tab])

  useEffect(() => { void load() }, [load])

  const selected = items?.find((a) => a.id === selectedId) ?? null

  return (
    <main className="content fill">
      <ErrorBox message={error} />
      <div className="split">
        <div className="stack" style={{ overflow: 'auto', minHeight: 0 }}>
          <div className="row"><h1>Апелляции</h1><span className="badge mid mono">{openCount}</span></div>
          <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))} size="small">
            <Tab value="open">Открытые</Tab>
            <Tab value="resolved">Закрытые</Tab>
          </TabList>
          {items === null ? <Loading /> : !items.length ? (
            <EmptyState
              coins={false}
              title={tab === 'open' ? 'Открытых апелляций нет' : 'Закрытых апелляций нет'}
              hint="Апелляция подаётся из карточки диалога кнопкой «Оспорить критерий»."
              action={<Link to="/">Открыть журнал диалогов</Link>}
            />
          ) : items.map((appeal) => (
            <button
              key={appeal.id}
              className={`queue-item ${appeal.id === selectedId ? 'on' : ''}`}
              onClick={() => setSelectedId(appeal.id)}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b className="mono">{appeal.conversation_id}</b>
                <span className="small muted">{dateTime(appeal.created_at)}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{appeal.original_criterion.title}</b>
                <span className="mono">{score(appeal.final_total)}</span>
              </div>
              <div className="small muted">{appeal.author}</div>
              <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {appeal.comment}
              </div>
            </button>
          ))}
        </div>
        <div style={{ overflow: 'auto', minHeight: 0 }}>
          {selected
            ? <Detail appeal={selected} onSaved={() => { void load() }} />
            : <div className="card empty">Выберите апелляцию в списке слева.</div>}
        </div>
      </div>
    </main>
  )
}
