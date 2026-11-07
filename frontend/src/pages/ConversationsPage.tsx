import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Field, Input, Select, Switch,
} from '@fluentui/react-components'
import {
  ArrowDownload20Regular, Call20Regular, Chat20Regular, Play20Regular, ShieldError20Regular,
} from '@fluentui/react-icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type ConversationRow } from '../api'
import { EmptyState, ErrorBox, Loading, Segments } from '../components/common'
import KpiStrip from '../components/KpiStrip'
import { CHANNEL, STATUS, answerLabel, answerTone, clock, dateTime, score } from '../format'

const PAGE_SIZE = 20
const LANGUAGES = ['RU', 'KZ', 'EN']

function AppealStatus({ row }: { row: ConversationRow }) {
  if (row.appeal_status === 'open') return <span className="badge mid">На рассмотрении</span>
  if (row.appeal_status === 'resolved') return <span className="badge yes">Решено</span>
  if (row.status === 'needs_review') return <span className="badge mid">На проверку</span>
  return <span className="muted">—</span>
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [group, setGroup] = useState('DEV')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.importGroup(group.trim())
      onDone()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Импорт из API организаторов</DialogTitle>
          <DialogContent>
            <Field label="group_id">
              <Input value={group} onChange={(_, data) => setGroup(data.value)} />
            </Field>
            <ErrorBox message={error} />
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={busy || !group.trim()} onClick={run}>
              {busy ? 'Импорт...' : 'Импортировать'}
            </Button>
            <Button onClick={onClose}>Отмена</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default function ConversationsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const scoreParam = params.get('score')
  const scoreRange = useMemo(() => {
    const match = scoreParam?.match(/^(\d+)-(\d+)$/)
    return match ? [Number(match[1]), Number(match[2])] : null
  }, [scoreParam])
  const [rows, setRows] = useState<ConversationRow[] | null>(null)
  const [groups, setGroups] = useState<{ group_id: string; total: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [channel, setChannel] = useState('all')
  const [languages, setLanguages] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [group, setGroup] = useState('')
  const [onlyReview, setOnlyReview] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => setQ(params.get('q') ?? ''), [params])

  const load = useCallback(async (text: string, groupId: string, stateFilter: string) => {
    try {
      const data = await api.conversations({
        q: text || undefined, group_id: groupId || undefined, status: stateFilter || undefined,
      })
      setRows(data.items)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
      setRows([])
    }
  }, [])

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => load(q, group, status), q ? 300 : 0)
    return () => window.clearTimeout(timer.current)
  }, [q, group, status, load])

  useEffect(() => {
    api.datasets().then(setGroups).catch(() => setGroups([]))
  }, [importing])

  const visible = useMemo(() => {
    return (rows ?? []).filter((row) => {
      if (channel !== 'all' && row.channel !== channel) return false
      if (languages.length && !languages.includes(row.language)) return false
      if (onlyReview && !row.evaluation?.needs_review) return false
      if (scoreRange) {
        const total = row.evaluation?.final_total
        if (typeof total !== 'number' || total < scoreRange[0]) return false
        if (scoreRange[1] === 100 ? total > 100 : total >= scoreRange[1]) return false
      }
      return true
    })
  }, [rows, channel, languages, onlyReview, scoreRange])

  useEffect(() => setPage(0), [channel, languages, onlyReview, q, group, status, scoreRange])

  const filtersActive = Boolean(
    q || group || status || channel !== 'all' || languages.length || onlyReview || scoreRange,
  )
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const shown = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const toggle = (id: string) =>
    setSelected((items) => (items.includes(id) ? items.filter((i) => i !== id) : [...items, id]))

  return (
    <main className="content">
      <KpiStrip />
      <div className="page-head">
        <h1>Журнал диалогов</h1>
        <div className="row">
          <Button icon={<ArrowDownload20Regular />} onClick={() => setImporting(true)}>Импорт из API</Button>
          <Button
            appearance="primary"
            icon={<Play20Regular />}
            onClick={() => navigate('/run', { state: { selected } })}
          >
            {selected.length ? `Оценить выбранные: ${selected.length}` : 'Запустить оценку'}
          </Button>
        </div>
      </div>

      <div className="filters">
        <Input
          style={{ width: 260 }}
          placeholder="Поиск по ID и тексту"
          value={q}
          onChange={(_, data) => setQ(data.value)}
        />
        <Segments
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'agent chat', label: 'Чат' },
            { value: 'voice call', label: 'Звонок' },
          ]}
        />
        <div className="row">
          {LANGUAGES.map((language) => (
            <button
              key={language}
              className={`chip-toggle ${languages.includes(language) ? 'on' : ''}`}
              onClick={() =>
                setLanguages((items) =>
                  items.includes(language) ? items.filter((l) => l !== language) : [...items, language],
                )
              }
            >
              {language}
            </button>
          ))}
        </div>
        <Select value={status} onChange={(_, data) => setStatus(data.value)} aria-label="Статус">
          <option value="">Любой статус</option>
          {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select value={group} onChange={(_, data) => setGroup(data.value)} aria-label="Набор">
          <option value="">Все наборы</option>
          {groups.map((g) => <option key={g.group_id} value={g.group_id}>{g.group_id} ({g.total})</option>)}
        </Select>
        <Switch label="Только на проверку" checked={onlyReview} onChange={(_, data) => setOnlyReview(data.checked)} />
        {scoreRange && (
          <span className="score-filter" data-testid="score-filter">
            <span className="badge plain mono">баллы {scoreRange[0]}..{scoreRange[1]}</span>
            <Button size="small" appearance="subtle" onClick={() => setParams({})}>Сбросить</Button>
          </span>
        )}
      </div>

      <ErrorBox message={error} />
      {rows === null ? <Loading /> : !visible.length ? (
        filtersActive ? (
          <EmptyState
            title="По этим фильтрам диалогов нет"
            hint="Снимите часть фильтров или измените поиск."
            action={
              <Button
                onClick={() => {
                  setQ('')
                  setChannel('all')
                  setLanguages([])
                  setStatus('')
                  setGroup('')
                  setOnlyReview(false)
                  setParams({})
                }}
              >
                Сбросить фильтры
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Диалогов пока нет"
            hint="Импортируйте набор из API организаторов, затем запустите оценку."
            action={<Button onClick={() => setImporting(true)}>Импорт из API</Button>}
          />
        )
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>ID диалога</th>
                <th>Оператор</th>
                <th>Канал и язык</th>
                <th className="right">Итог</th>
                <th>Критерии</th>
                <th>Флаги</th>
                <th>Апелляция</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const evaluation = row.evaluation
                const total = evaluation?.final_total
                return (
                  <tr
                    key={row.id}
                    className={`link ${evaluation?.gross_violation ? 'gross' : ''}`}
                    onClick={() => navigate(`/conversations/${row.id}`)}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Выбрать ${row.id}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="mono"><b>{row.id}</b></td>
                    <td>
                      {row.operator ?? <span className="muted">Не определён</span>}
                      <div className="mono small muted">
                        {row.started_at ? `${dateTime(row.started_at)} · ` : ''}{clock(row.duration_sec)}
                      </div>
                    </td>
                    <td>
                      <span className="row">
                        {row.channel === 'voice call' ? <Call20Regular aria-hidden /> : <Chat20Regular aria-hidden />}
                        {CHANNEL[row.channel] ?? row.channel} · {row.language}
                      </span>
                    </td>
                    <td className="score-cell">
                      {evaluation?.status === 'error' ? (
                        <span className="badge no" title={evaluation.error ?? ''}>Ошибка</span>
                      ) : score(total)}
                      {typeof total === 'number' && (
                        <div className={`score-bar ${total < 50 ? 'low' : ''}`}><i style={{ width: `${total}%` }} /></div>
                      )}
                    </td>
                    <td>
                      <div className="squares">
                        {evaluation?.criteria?.map((c) => (
                          <i
                            key={c.criterion_id}
                            className={`fill-${answerTone(c, c.answer)}`}
                            title={`${c.title}: ${answerLabel(c.answer)}`}
                            aria-label={`${c.title}: ${answerLabel(c.answer)}`}
                            role="img"
                          />
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="row">
                        {evaluation?.gross_violation && (
                          <span title="Грубое нарушение" style={{ color: 'var(--no)', display: 'flex' }}>
                            <ShieldError20Regular />
                          </span>
                        )}
                        {evaluation?.criteria?.some((c) => c.agreement !== 'full' && c.agreement !== 'single') && (
                          <i className="dot" style={{ background: '#e2a227' }} title="Было расхождение моделей" />
                        )}
                      </span>
                    </td>
                    <td><AppealStatus row={row} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <div className="pager">
          <span>Показано {shown.length} из {visible.length}</span>
          <div className="row">
            <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</Button>
            <span className="mono">{page + 1} / {pages}</span>
            <Button size="small" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Вперёд</Button>
          </div>
        </div>
      )}

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onDone={() => load(q, group, status)}
      />
    </main>
  )
}
