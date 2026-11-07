import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Field, OverlayDrawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Input, Radio,
  RadioGroup, Tab, TabList, Textarea,
} from '@fluentui/react-components'
import {
  ArrowClockwise20Regular, ChevronDown16Regular, ChevronRight16Regular, Dismiss24Regular, Flag20Regular,
  ShieldError20Regular,
} from '@fluentui/react-icons'
import { Link, useParams } from 'react-router-dom'
import {
  api, waitForJob, type ConversationCard, type CriterionResult, type Evaluation, type SpeechMetrics, type Turn,
} from '../api'
import { AgreementDots, AnswerBadge, ErrorBox, Loading, ScaleBar } from '../components/common'
import {
  AGREEMENT, CHANNEL, MODE, SPEAKER, answerLabel, answerTone, clock, dateTime, money, points, score, seconds,
  type Tone,
} from '../format'
import { useRole } from '../App'

const TONE_COLOR: Record<Tone, string> = { yes: '#138a4e', no: '#d13b45', mid: '#e2a227', na: '#9aa09b' }

function pointsLabel(item: CriterionResult): string {
  if (item.answer === 'NA') return 'N/A'
  if (item.type === 'flag') return ''
  return `${points(item.weighted_points)} / ${points(item.weight)}`
}

function stepLabel(item: CriterionResult): string | null {
  if (item.type !== 'scale' || item.answer === 'NA') return null
  return `${item.answer} из ${Math.max(...item.scale.map((s) => s.value))}`
}

function ScoreRing({ value }: { value: number | null }) {
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const share = Math.max(0, Math.min(100, value ?? 0)) / 100
  return (
    <div className="ring" role="img" aria-label={`Итог ${score(value)} из 100`}>
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--na-bg)" strokeWidth="5" />
        <circle
          cx="38" cy="38" r={radius} fill="none" stroke={(value ?? 0) < 50 ? '#d13b45' : 'var(--accent)'}
          strokeWidth="5" strokeLinecap="round" transform="rotate(-90 38 38)"
          strokeDasharray={`${share * circumference} ${circumference}`}
        />
      </svg>
      <span className="mono big-score">{score(value)}</span>
    </div>
  )
}

function CriterionRow({ item, open, onToggle, onJump }: {
  item: CriterionResult
  open: boolean
  onToggle: () => void
  onJump: (n: number) => void
}) {
  return (
    <div className="crit">
      <div className="crit-row" onClick={onToggle} role="button" aria-expanded={open}>
        {open ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
        <span>
          <b>{item.title}</b>{' '}
          {item.type !== 'flag' && <span className="muted small">вес {points(item.weight)}</span>}
          {item.source === 'reviewer' && <span className="badge plain" style={{ marginLeft: 6 }}>решение</span>}
        </span>
        <AnswerBadge item={item} answer={item.answer} />
        <ScaleBar item={item} answer={item.answer} />
        <AgreementDots agreement={item.agreement} />
        <span className="pts">
          {pointsLabel(item)}
          {stepLabel(item) && <span className="step">{stepLabel(item)}</span>}
        </span>
      </div>
      {open && (
        <div className="crit-body">
          {item.source === 'reviewer' && (
            <>
              <span className="k">Решение</span>
              <span>
                Исходный ответ <b>{answerLabel(item.original_answer ?? '')}</b>, финальный <b>{answerLabel(item.answer)}</b>.
                {' '}{item.decision_reason}
              </span>
            </>
          )}
          <span className="k">{item.answer === 'NA' ? 'Причина N/A' : 'Объяснение'}</span>
          <span>{item.reasoning || '—'}</span>
          {item.evidence_ids.length > 0 && (
            <>
              <span className="k">Доказательства</span>
              <span className="row wrap">
                {item.evidence_ids.map((n) => (
                  <button key={n} className="evidence" onClick={() => onJump(n)}>#{n}</button>
                ))}
              </span>
            </>
          )}
          {item.checked_range && (
            <>
              <span className="k">Проверенный участок</span>
              <span>
                <button className="evidence" onClick={() => onJump(item.checked_range![0])}>
                  #{item.checked_range[0]} до #{item.checked_range[1]}
                </button>
              </span>
            </>
          )}
          {item.max_points !== null && (
            <>
              <span className="k">Баллы в итоге</span>
              <span className="mono">{points(item.earned_points)} из {points(item.max_points)}</span>
            </>
          )}
          {item.agreement !== 'single' && (
            <>
              <span className="k">{AGREEMENT[item.agreement] ?? 'Модели'}</span>
              <span className="small">
                {Object.entries(item.judge_answers).map(([model, opinion]) => (
                  <div key={model} className="muted">
                    <span className="mono">{model}</span>: {answerLabel(opinion.answer)}
                  </div>
                ))}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AppealDrawer({ evaluation, operator, initial, onClose, onSaved }: {
  evaluation: Evaluation
  operator: string | null
  initial: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const criteria = evaluation.final?.criteria ?? []
  const [selected, setSelected] = useState(initial ?? criteria[0]?.criterion_id ?? '')
  const [comment, setComment] = useState('')
  const [author, setAuthor] = useState(operator ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = criteria.find((c) => c.criterion_id === selected)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.createAppeal(evaluation.id, { criterion_id: selected, comment: comment.trim(), author: author.trim() })
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <OverlayDrawer open position="end" size="medium" onOpenChange={(_, data) => !data.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" aria-label="Закрыть" icon={<Dismiss24Regular />} onClick={onClose} />}
        >
          Оспорить оценку
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className="stack lg">
          <div>
            <h3>Критерий</h3>
            <RadioGroup value={selected} onChange={(_, data) => setSelected(data.value)}>
              {criteria.map((c) => (
                <Radio
                  key={c.criterion_id}
                  value={c.criterion_id}
                  label={<span className="row">{c.title} <AnswerBadge item={c} answer={c.answer} /></span>}
                />
              ))}
            </RadioGroup>
          </div>
          {current && (
            <div className="stack">
              <h3>Текущая оценка</h3>
              <div className="row">
                <AnswerBadge item={current} answer={current.answer} />
                <span className="mono">{pointsLabel(current)}</span>
                {current.type !== 'flag' && <span className="muted small">вес {points(current.weight)}</span>}
                <AgreementDots agreement={current.agreement} />
              </div>
              <div className="judge-note">{current.reasoning}</div>
              <div className="row wrap">
                {current.evidence_ids.map((n) => <span key={n} className="evidence">#{n}</span>)}
              </div>
            </div>
          )}
          <Field label="Комментарий" required>
            <Textarea rows={4} value={comment} onChange={(_, data) => setComment(data.value)} />
          </Field>
          <Field label="Автор" required>
            <Input value={author} onChange={(_, data) => setAuthor(data.value)} />
          </Field>
          <ErrorBox message={error} />
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button appearance="primary" disabled={busy || !comment.trim() || !author.trim()} onClick={submit}>
          Отправить апелляцию
        </Button>
        <Button onClick={onClose}>Отмена</Button>
      </DrawerFooter>
    </OverlayDrawer>
  )
}

type Mark = { n: number; title: string; tone: Tone }

const LANES = [
  { speaker: 'client', label: 'Клиент' },
  { speaker: 'operator', label: 'Оператор' },
]

function AudioPanel({ id, turns, marks, duration, seekRef, onTime, playing }: {
  id: string
  turns: Turn[]
  marks: Mark[]
  duration: number
  seekRef: React.MutableRefObject<((t: number) => void) | null>
  onTime: (t: number) => void
  playing: number | null
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [time, setTime] = useState(0)
  const [length, setLength] = useState(duration)
  const [metrics, setMetrics] = useState<SpeechMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.audioMetrics(id).then(setMetrics).catch(() => setMetrics(null))
  }, [id])

  const seek = useCallback((t: number) => {
    const element = audio.current
    if (!element) return
    element.currentTime = t
    void element.play().catch(() => undefined)
  }, [])
  useEffect(() => {
    seekRef.current = seek
    return () => { seekRef.current = null }
  }, [seek, seekRef])

  const at = (n: number) => turns.find((t) => t.n === n)?.t_audio ?? 0
  const pct = (t: number) => (length ? Math.min(100, (t / length) * 100) : 0)
  const laneOf = (n: number) => (turns.find((t) => t.n === n)?.speaker === 'client' ? 'client' : 'operator')
  const spoken = turns.filter((t) => ['client', 'operator'].includes(t.speaker) && t.t_audio !== null && t.t_audio !== undefined)
  // Конец реплики неизвестен: берём следующую реплику, но не больше времени на произнесение слов.
  const segments = spoken.map((turn, index) => {
    const start = turn.t_audio as number
    const next = spoken[index + 1]?.t_audio ?? length
    return {
      n: turn.n,
      speaker: turn.speaker,
      start,
      end: Math.min(next as number, start + 1 + turn.text.split(/\s+/).length * 0.5),
    }
  })

  return (
    <div className="card player">
      {error && <ErrorBox message={error} />}
      <audio
        ref={audio}
        controls
        preload="metadata"
        src={api.audioUrl(id)}
        style={{ width: '100%', height: 36 }}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration || duration)}
        onError={() => setError('Запись недоступна. Ссылка организаторов могла истечь, повторите позже.')}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime)
          onTime(e.currentTarget.currentTime)
        }}
      />
      <div className="tracks">
        {LANES.map((lane) => (
          <div key={lane.speaker} className="lane-row">
            <span className="lane-label small muted">{lane.label}</span>
            <div
              className="lane"
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect()
                seek(((e.clientX - box.left) / box.width) * length)
              }}
            >
              {segments.filter((s) => s.speaker === lane.speaker).map((s) => (
                <i
                  key={s.n}
                  className={`segment ${lane.speaker} ${playing === s.n ? 'on' : ''}`}
                  style={{ left: `${pct(s.start)}%`, width: `${Math.max(0.3, pct(s.end) - pct(s.start))}%` }}
                />
              ))}
              {marks.filter((m) => laneOf(m.n) === lane.speaker).map((mark, index) => (
                <button
                  key={`${mark.n}-${index}`}
                  className="mark"
                  title={`#${mark.n} ${mark.title}`}
                  style={{ left: `${pct(at(mark.n))}%`, background: TONE_COLOR[mark.tone] }}
                  onClick={(e) => { e.stopPropagation(); seek(at(mark.n)) }}
                />
              ))}
              <span className="playhead" style={{ left: `${pct(time)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span className="mono">{clock(time)}</span>
        <span>Запись одноканальная, дорожки построены по транскрипту</span>
        <span className="mono">{clock(length)}</span>
      </div>
      {metrics && (
        <div className="speech">
          <span className="caps" style={{ width: '100%' }}>Речь оператора, оценка по меткам времени</span>
          <div>Темп <b>{metrics.tempo_wpm ?? '—'} сл/мин</b>{' '}
            {metrics.tempo_in_norm !== null && (
              <span className={`badge ${metrics.tempo_in_norm ? 'yes' : 'mid'}`}>
                {metrics.tempo_in_norm ? 'в норме' : 'вне нормы'}
              </span>
            )}
          </div>
          <div>Паузы &gt; 3 с <b>{metrics.audio_pauses_over_3s ?? metrics.long_pauses}</b></div>
          <div>Перебивания <b>{metrics.interruptions}</b></div>
          <div>Доля речи <b>{metrics.operator_share_pct ?? '—'}%</b></div>
        </div>
      )}
    </div>
  )
}

function Details({ evaluation, history, onOpen }: {
  evaluation: Evaluation
  history: ConversationCard['evaluations']
  onOpen: (id: number) => void
}) {
  return (
    <div className="stack lg" style={{ padding: 16 }}>
      <div className="stack">
        <h3>Оценка</h3>
        <div className="small">
          Режим: {MODE[evaluation.mode] ?? evaluation.mode}. Модели:{' '}
          <span className="mono">{Object.values(evaluation.models).join(', ')}</span>.
        </div>
        <div className="small mono">
          Токены {evaluation.tokens_in} / {evaluation.tokens_out} · {money(evaluation.cost_usd, 4)} ·{' '}
          {seconds(evaluation.latency_ms)} · промпт {evaluation.prompt_version}
        </div>
      </div>
      <div className="stack">
        <h3>Факты, посчитанные системой</h3>
        <pre className="small judge-note pre" style={{ margin: 0 }}>
          {JSON.stringify(evaluation.signals, null, 2)}
        </pre>
      </div>
      <div className="stack">
        <h3>История оценок</h3>
        {history.map((item) => (
          <button
            key={item.id}
            className={`queue-item ${item.id === evaluation.id ? 'on' : ''}`}
            onClick={() => onOpen(item.id)}
          >
            <span className="mono">{item.status === 'ok' ? score(item.total_score) : 'Ошибка'}</span>{' '}
            · версия {item.checklist_version} · {MODE[item.mode] ?? item.mode} ·{' '}
            <span className="muted">{dateTime(item.created_at)}</span>
          </button>
        ))}
      </div>
      <div className="stack">
        <h3>Сырые ответы судей</h3>
        {(evaluation.original?.criteria ?? []).map((item) => (
          <details key={item.criterion_id}>
            <summary>{item.title}</summary>
            {Object.entries(item.judge_answers).map(([model, opinion]) => (
              <div key={model} className="judge-note small">
                <b className="mono">{model}</b>: {answerLabel(opinion.answer)}
                {opinion.evidence_ids.length > 0 && ` · ${opinion.evidence_ids.map((n) => `#${n}`).join(' ')}`}
                <div>{opinion.reasoning}</div>
              </div>
            ))}
          </details>
        ))}
      </div>
    </div>
  )
}

function AppealsTab({ evaluation }: { evaluation: Evaluation }) {
  const titles = new Map((evaluation.original?.criteria ?? []).map((c) => [c.criterion_id, c.title]))
  if (!evaluation.appeals.length) return <div className="empty">Апелляций по этой оценке нет.</div>
  return (
    <div className="stack" style={{ padding: 16 }}>
      {evaluation.appeals.map((appeal) => (
        <div key={appeal.id} className="card pad stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{titles.get(appeal.criterion_id) ?? appeal.criterion_id}</b>
            <span className={`badge ${appeal.status === 'open' ? 'mid' : 'yes'}`}>
              {appeal.status === 'open' ? 'На рассмотрении' : 'Решено'}
            </span>
          </div>
          <div>{appeal.comment}</div>
          <div className="small muted">{appeal.author} · {dateTime(appeal.created_at)}</div>
          {appeal.decision && (
            <div className="judge-note">
              <b>{appeal.decision.action === 'change'
                ? `Оценка изменена на «${answerLabel(appeal.decision.new_answer ?? '')}»`
                : 'Оценка подтверждена'}</b>
              <div>{appeal.decision.reason}</div>
              <div className="small muted">{appeal.decision.reviewer} · {dateTime(appeal.decision.created_at)}</div>
            </div>
          )}
        </div>
      ))}
      <Link to="/appeals">Открыть очередь апелляций</Link>
    </div>
  )
}

export default function ConversationPage() {
  const { id = '' } = useParams()
  const role = useRole()
  const [card, setCard] = useState<ConversationCard | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState('checklist')
  const [appealFor, setAppealFor] = useState<string | null | undefined>(undefined)
  const [activeTurn, setActiveTurn] = useState<number | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const seekRef = useRef<((t: number) => void) | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.conversation(id)
      setCard(data)
      setEvaluation(data.evaluation)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const final = evaluation?.final ?? null
  const criteria = useMemo(() => final?.criteria ?? [], [final])
  const isCall = card?.channel === 'voice call'

  const highlight = useMemo(() => {
    const map = new Map<number, Tone>()
    const source = open ? criteria.filter((c) => c.criterion_id === open) : criteria
    if (!open) return map
    for (const item of source) {
      const tone = answerTone(item, item.answer)
      for (const n of item.evidence_ids) map.set(n, tone)
    }
    return map
  }, [criteria, open])

  const marks = useMemo<Mark[]>(() => {
    const result: Mark[] = []
    for (const item of criteria) {
      const tone = answerTone(item, item.answer)
      for (const n of item.evidence_ids) result.push({ n, title: item.title, tone })
    }
    return result
  }, [criteria])

  const jump = useCallback((n: number) => {
    setActiveTurn(n)
    document.getElementById(`turn-${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const turn = card?.turns.find((t) => t.n === n)
    if (isCall && turn?.t_audio !== null && turn?.t_audio !== undefined) seekRef.current?.(turn.t_audio)
  }, [card, isCall])

  const onAudioTime = useCallback((time: number) => {
    if (!card) return
    let current: number | null = null
    for (const turn of card.turns) {
      if (turn.t_audio !== null && turn.t_audio !== undefined && turn.t_audio <= time) current = turn.n
    }
    setPlaying(current)
  }, [card])

  const reevaluate = async () => {
    if (!card) return
    setError(null)
    setProgress('Идёт оценка...')
    try {
      const { job_id } = await api.run({
        conversation_ids: [card.id],
        checklist_id: evaluation?.checklist_id ?? 'freedom-default',
        mode: evaluation?.mode ?? 'ensemble',
        no_cache: Boolean(evaluation),
      })
      await waitForJob(job_id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  if (error && !card) return <main className="content"><ErrorBox message={error} /></main>
  if (!card) return <main className="content"><Loading /></main>

  const sections = final?.sections.filter((s) => s.max > 0) ?? []
  const lastTime = card.turns[card.turns.length - 1]?.t_audio ?? card.turns[card.turns.length - 1]?.t_sec ?? 0
  const openAppeals = new Set(evaluation?.appeals.filter((a) => a.status === 'open').map((a) => a.criterion_id))
  const grossItems = criteria.filter((c) => final?.gross_items.includes(c.criterion_id))
  const changed = evaluation?.original && final && evaluation.original.total !== final.total

  return (
    <main className="content fill">
      <div className="card card-head">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="row wrap">
            <h1>{isCall ? 'Звонок' : 'Диалог'} <span className="mono">{card.id}</span></h1>
            {final?.gross_violation && (
              <span className="badge no row"><ShieldError20Regular /> Грубое нарушение</span>
            )}
            {evaluation?.needs_review && <span className="badge mid">На проверку</span>}
          </div>
          <div className="row">
            {progress && <span className="muted">{progress}</span>}
            {evaluation?.status === 'ok' && (
              <Button icon={<Flag20Regular />} onClick={() => setAppealFor(open)}>Оспорить критерий</Button>
            )}
            <Button
              appearance="primary"
              icon={<ArrowClockwise20Regular />}
              disabled={Boolean(progress)}
              onClick={reevaluate}
            >
              {evaluation ? 'Переоценить' : 'Оценить'}
            </Button>
          </div>
        </div>
        <div className="facts">
          <div><span className="label">Канал</span>{CHANNEL[card.channel] ?? card.channel}</div>
          <div><span className="label">Язык</span>{card.language}</div>
          <div><span className="label">Оператор</span>{card.operator ?? 'Не определён'}</div>
          {card.started_at && <div><span className="label">Начало</span>{dateTime(card.started_at)}</div>}
          {evaluation && (
            <>
              <div><span className="label">Чек-лист</span>{evaluation.checklist_name}, версия {evaluation.checklist_version}</div>
              <div className="grow"><span className="label">Модели оценки</span>
                <span className="small">{Object.values(evaluation.models).join(', ') || '—'}</span>
              </div>
              <div><span className="label">Стоимость</span><span className="mono">{money(evaluation.cost_usd)}</span></div>
              <div><span className="label">Время</span><span className="mono">{seconds(evaluation.latency_ms)}</span></div>
            </>
          )}
        </div>
      </div>

      <ErrorBox message={error} />

      <div className="columns">
        <div className="column">
          {isCall && card.has_audio && (
            <AudioPanel
              id={card.id}
              turns={card.turns}
              marks={marks}
              duration={lastTime}
              seekRef={seekRef}
              onTime={onAudioTime}
              playing={playing}
            />
          )}
          <div className="card panel">
            <div className="panel-head">
              <h2>Транскрипт</h2>
              <span className="muted small">реплик: {card.turns.length}</span>
            </div>
            <div className="transcript-wrap">
              <div className="scroll" ref={scroller}>
                {card.turns.map((turn) => {
                  const tone = highlight.get(turn.n)
                  const classes = ['turn', turn.speaker]
                  if (tone) classes.push(`ev-${tone}`)
                  if (playing === turn.n) classes.push('playing')
                  if (activeTurn === turn.n && !tone) classes.push('ev-mid')
                  if (isCall) classes.push('seekable')
                  return (
                    <div
                      key={turn.n}
                      id={`turn-${turn.n}`}
                      className={classes.join(' ')}
                      onClick={() => {
                        if (isCall && turn.t_audio !== null && turn.t_audio !== undefined) seekRef.current?.(turn.t_audio)
                      }}
                    >
                      <span className="num">#{turn.n}</span>
                      <span className="time" title={turn.timestamp}>
                        {isCall ? clock(turn.t_sec) : turn.timestamp}
                      </span>
                      <span className="who">
                        {turn.speaker === 'operator' ? card.operator ?? SPEAKER.operator : SPEAKER[turn.speaker] ?? turn.speaker}
                      </span>
                      <span className="text">{turn.text}</span>
                    </div>
                  )
                })}
              </div>
              <div className="minimap" aria-hidden="true">
                {marks.map((mark, index) => (
                  <button
                    key={`${mark.n}-${index}`}
                    tabIndex={-1}
                    title={`#${mark.n} ${mark.title}`}
                    style={{ top: `${((mark.n - 1) / Math.max(1, card.turns.length)) * 100}%`, background: TONE_COLOR[mark.tone] }}
                    onClick={() => jump(mark.n)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="column">
          <div className="card panel result-panel">
            {!evaluation ? (
              <div className="empty">Диалог ещё не оценён. Нажмите «Оценить».</div>
            ) : evaluation.status !== 'ok' || !final ? (
              <div style={{ padding: 16 }}>
                <ErrorBox message={`Оценка не удалась: ${evaluation.error ?? 'неизвестная ошибка'}`} />
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                  <div className="row top" style={{ justifyContent: 'space-between', gap: 16 }}>
                    <div className="row">
                      <ScoreRing value={final.total} />
                      <div>
                        <div className="muted small">Итог<br />из 100</div>
                        {changed && (
                          <div className="small muted">Исходная авто-оценка: <span className="mono">{score(evaluation.original?.total)}</span></div>
                        )}
                      </div>
                    </div>
                    <div className="grow">
                      <div className="row small" style={{ gap: 2 }}>
                        {sections.map((s) => (
                          <div key={s.id} style={{ flex: s.max }} className="muted">
                            {s.title}<br /><span className="mono">{points(s.earned)} / {points(s.max)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="section-bar">
                        {sections.map((s) => (
                          <div key={s.id} style={{ flex: s.max }}><i style={{ width: `${s.score ?? 0}%` }} /></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {final.gross_violation && (
                    <div className="gross-banner" style={{ marginTop: 8 }}>
                      <ShieldError20Regular />
                      <span>
                        {evaluation.gross_reasons?.[0]?.category ?? 'Грубое нарушение'}: {grossItems[0]?.reasoning ?? grossItems[0]?.title}
                      </span>
                    </div>
                  )}
                  {Boolean(evaluation.score_drivers?.length) && (
                    <div className="drivers">
                      <h3>Почему снижена оценка</h3>
                      {evaluation.score_drivers?.map((driver) => (
                        <div key={driver.criterion_id} className="driver">
                          <span className="mono driver-loss">−{points(driver.lost_points)}</span>
                          <span className="grow"><b>{driver.title}.</b> {driver.reason}</span>
                          {driver.turn !== null && (
                            <Button
                              size="small"
                              onClick={() => {
                                setTab('checklist')
                                setOpen(driver.criterion_id)
                                jump(driver.turn as number)
                              }}
                            >
                              Перейти к фрагменту
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))} size="small">
                  <Tab value="checklist">Чек-лист ({criteria.length})</Tab>
                  <Tab value="details">Детали</Tab>
                  <Tab value="appeals">Апелляции ({evaluation.appeals.length})</Tab>
                </TabList>
                <div className="scroll">
                  {tab === 'checklist' && final.sections.map((section) => {
                    const items = criteria.filter((c) => c.section === section.id)
                    if (!items.length) return null
                    return (
                      <div key={section.id}>
                        <div className="caps" style={{ padding: '10px 12px 4px' }}>{section.title}</div>
                        {items.map((item) => (
                          <div key={item.criterion_id}>
                            <CriterionRow
                              item={item}
                              open={open === item.criterion_id}
                              onToggle={() => setOpen(open === item.criterion_id ? null : item.criterion_id)}
                              onJump={jump}
                            />
                            {open === item.criterion_id && (
                              <div className="row" style={{ padding: '0 14px 10px 38px' }}>
                                {openAppeals.has(item.criterion_id)
                                  ? <span className="badge mid">Апелляция на рассмотрении</span>
                                  : <Button size="small" onClick={() => setAppealFor(item.criterion_id)}>Оспорить этот критерий</Button>}
                                {role === 'reviewer' && openAppeals.has(item.criterion_id) && (
                                  <Link to="/appeals">Перейти к решению</Link>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {tab === 'details' && (
                    <Details
                      evaluation={evaluation}
                      history={card.evaluations}
                      onOpen={(evaluationId) => { api.evaluation(evaluationId).then(setEvaluation).catch((e: Error) => setError(e.message)) }}
                    />
                  )}
                  {tab === 'appeals' && <AppealsTab evaluation={evaluation} />}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {appealFor !== undefined && evaluation && (
        <AppealDrawer
          evaluation={evaluation}
          operator={card.operator}
          initial={appealFor}
          onClose={() => setAppealFor(undefined)}
          onSaved={() => { void load() }}
        />
      )}
    </main>
  )
}

