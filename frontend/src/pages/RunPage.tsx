import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Checkbox, Field, Input, ProgressBar, Radio, RadioGroup, Select, Spinner,
} from '@fluentui/react-components'
import {
  CheckmarkCircle20Regular, DismissCircle20Regular, Play20Regular, Stop20Regular,
} from '@fluentui/react-icons'
import { Link, useLocation } from 'react-router-dom'
import { api, type ChecklistListItem, type Job, type ModelsInfo, type ResultsPreview } from '../api'
import { ErrorBox, Segments } from '../components/common'
import { CHANNEL, MODE, clock, money, score } from '../format'

const ACTIVE = ['queued', 'running']
const JOB_STATUS: Record<string, string> = {
  queued: 'В очереди', running: 'Оценка в процессе', finished: 'Завершена', cancelled: 'Остановлена',
  failed: 'Сбой', interrupted: 'Прервана перезапуском',
}
const MODES = ['ensemble', 'single', 'local'] as const
type Mode = (typeof MODES)[number]

function ExportPanel({ checklistId, version, group }: { checklistId: string; version?: number; group: string }) {
  const [target, setTarget] = useState<'dev' | 'prod'>('dev')
  const [preview, setPreview] = useState<ResultsPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const params = { set: target, group_id: group, checklist_id: checklistId, version }

  const check = async () => {
    setBusy(true); setError(null); setMessage(null); setPreview(null)
    try {
      setPreview(await api.previewResults(params))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const write = async () => {
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await api.writeResults(params)
      setMessage(`Файл записан: ${result.path}, записей ${result.records}. Его нужно закоммитить и отправить в репозиторий.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const errors = preview?.document.results.filter((r) => r.status === 'error').length ?? 0
  return (
    <div className="card pad stack">
      <h2>Файл для сдачи results.json</h2>
      <div className="small muted">
        Набор <span className="mono">{group}</span>, чек-лист <span className="mono">{checklistId}</span>,
        {version ? ` версия ${version}` : ' последняя полная версия'}.
      </div>
      <div className="row wrap">
        <Segments
          value={target}
          onChange={setTarget}
          options={[{ value: 'dev', label: 'results/dev' }, { value: 'prod', label: 'results/prod' }]}
        />
        <Button disabled={busy} onClick={check}>Проверить</Button>
        <Button appearance="primary" disabled={busy} onClick={write}>Записать файл</Button>
      </div>
      <ErrorBox message={error} />
      {message && <div className="success">{message}</div>}
      {preview && (preview.problems.length ? (
        <div className="error">
          Нарушения формата: {preview.problems.slice(0, 5).join('; ')}
        </div>
      ) : (
        <div className="success">
          Формат верный. Записей {preview.document.results.length}, с ошибкой {errors}. Модели: {preview.document.model.name}.
        </div>
      ))}
    </div>
  )
}

export default function RunPage() {
  const location = useLocation()
  const state = (location.state ?? {}) as { selected?: string[]; checklistId?: string; version?: number }
  const preselected = state.selected ?? []
  const [source, setSource] = useState<'api' | 'file'>('api')
  const [group, setGroup] = useState('DEV')
  const [file, setFile] = useState<File | null>(null)
  const [scope, setScope] = useState<'all' | 'selected'>(preselected.length ? 'selected' : 'all')
  const [selectedText, setSelectedText] = useState(preselected.join(', '))
  const [checklists, setChecklists] = useState<ChecklistListItem[]>([])
  const [checklistId, setChecklistId] = useState(state.checklistId ?? 'freedom-default')
  const [version, setVersion] = useState<number | undefined>(state.version)
  const [mode, setMode] = useState<Mode>('ensemble')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [changedOnly, setChangedOnly] = useState(true)
  const [models, setModels] = useState<ModelsInfo | null>(null)
  const [groups, setGroups] = useState<{ group_id: string; total: number }[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pollTimer = useRef<number | undefined>(undefined)

  const refreshGroups = useCallback(() => api.datasets().then(setGroups).catch(() => setGroups([])), [])

  const poll = useCallback((id: number) => {
    window.clearTimeout(pollTimer.current)
    const tick = async () => {
      try {
        const data = await api.job(id)
        setJob(data)
        if (ACTIVE.includes(data.status)) pollTimer.current = window.setTimeout(tick, 1200)
      } catch (e) {
        setError((e as Error).message)
      }
    }
    void tick()
  }, [])

  useEffect(() => {
    api.checklists().then(setChecklists).catch((e: Error) => setError(e.message))
    api.models().then(setModels).catch(() => setModels(null))
    void refreshGroups()
    api.jobs(1).then((items) => { if (items[0]) poll(items[0].id) }).catch(() => undefined)
    return () => window.clearTimeout(pollTimer.current)
  }, [poll, refreshGroups])

  const count = groups.find((g) => g.group_id === group)?.total ?? 0
  const selectedIds = selectedText.split(/[\s,;]+/).filter(Boolean)
  const planned = scope === 'all' ? count : selectedIds.length
  const price = models?.modes[mode]?.cost_per_dialog
  const entry = checklists.find((c) => c.id === checklistId)
  const running = job !== null && ACTIVE.includes(job.status)

  const importData = async () => {
    setBusy(true); setError(null); setNotice(null)
    try {
      if (source === 'api') {
        const result = await api.importGroup(group.trim())
        setNotice(`Импортировано записей: ${result.imported}`)
      } else if (file) {
        const result = await api.upload(file, group.trim() || 'UPLOAD')
        setNotice(`Загружено записей: ${result.imported}`)
      }
      await refreshGroups()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    setBusy(true); setError(null); setNotice(null)
    try {
      const { job_id } = await api.run({
        conversation_ids: scope === 'all' ? 'all' : selectedIds,
        group_id: scope === 'all' ? group.trim() : null,
        checklist_id: checklistId,
        version,
        mode,
        only_missing: onlyMissing,
        changed_only: changedOnly,
      })
      poll(job_id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    if (!job) return
    try {
      setJob(await api.cancelJob(job.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const localAvailable = Boolean(models?.local.model && models.local_server_up)

  return (
    <main className="content">
      <div className="page-head"><h1>Запуск оценки</h1></div>
      <div className="run">
        <div className="card pad stack lg">
          <div className="stack">
            <h3>Источник данных</h3>
            <Segments
              value={source}
              onChange={setSource}
              options={[{ value: 'api', label: 'API организаторов' }, { value: 'file', label: 'Файл' }]}
            />
            <Field label="group_id">
              <Input value={group} onChange={(_, data) => setGroup(data.value)} />
            </Field>
            {source === 'file' && (
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Файл с диалогами"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            )}
            <div className="row">
              <Button disabled={busy || !group.trim() || (source === 'file' && !file)} onClick={importData}>
                {source === 'api' ? 'Импортировать набор' : 'Загрузить файл'}
              </Button>
              <span className="small muted">В наборе {group}: {count}</span>
            </div>
          </div>

          <div className="stack">
            <h3>Диалоги</h3>
            <RadioGroup value={scope} onChange={(_, data) => setScope(data.value as 'all' | 'selected')}>
              <Radio value="all" label={`Все ${count}`} />
              <Radio value="selected" label="Выбранные" />
            </RadioGroup>
            {scope === 'selected' && (
              <Input
                aria-label="ID диалогов через запятую"
                placeholder="p1-ru-009, p1-kz-013"
                value={selectedText}
                onChange={(_, data) => setSelectedText(data.value)}
              />
            )}
            <Checkbox
              label="Пропускать уже оценённые этой версией"
              checked={onlyMissing}
              onChange={(_, data) => setOnlyMissing(Boolean(data.checked))}
            />
            <Checkbox
              label="Спрашивать модель только об изменённых критериях (быстрее и дешевле)"
              checked={changedOnly}
              onChange={(_, data) => setChangedOnly(Boolean(data.checked))}
            />
          </div>

          <div className="row">
            <Field label="Чек-лист" className="grow">
              <Select
                value={checklistId}
                onChange={(_, data) => { setChecklistId(data.value); setVersion(undefined) }}
              >
                {checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Версия" style={{ width: 150 }}>
              <Select
                value={String(version ?? '')}
                onChange={(_, data) => setVersion(data.value ? Number(data.value) : undefined)}
              >
                <option value="">Последняя</option>
                {entry?.versions.map((v) => <option key={v.version} value={v.version}>Версия {v.version}</option>)}
              </Select>
            </Field>
          </div>

          <div className="stack">
            <h3>Режим оценки</h3>
            <div className="modes">
              {MODES.map((value) => {
                const info = models?.modes[value]
                const disabled = value === 'local' && !localAvailable
                return (
                  <button key={value} className={`mode ${mode === value ? 'on' : ''}`} disabled={disabled} onClick={() => setMode(value)}>
                    <b>{info?.label ?? MODE[value]}</b>
                    <div className="small muted">
                      {value === 'local' && !localAvailable
                        ? 'Локальный сервер не запущен'
                        : `Цена: ${info ? money(info.cost_per_dialog) : '—'} за диалог`}
                    </div>
                    <div className="small muted">
                      Точность: {info?.accuracy ? `${info.accuracy}% на тестовом наборе` : 'см. README'}
                    </div>
                  </button>
                )
              })}
            </div>
            {models && (
              <div className="small muted">
                Модели: <span className="mono">{models.judge_a.model}, {models.judge_b.model}, арбитр {models.arbiter.model}</span>
              </div>
            )}
          </div>

          <div className="success">
            Оценка стоимости: {planned} диалогов ≈ {price !== undefined ? money(planned * price, 2) : '—'}
          </div>
          <ErrorBox message={error} />
          {notice && <div className="success">{notice}</div>}
          <div>
            <Button
              appearance="primary"
              icon={<Play20Regular />}
              disabled={busy || running || (scope === 'selected' && !selectedIds.length)}
              onClick={start}
            >
              Запустить оценку
            </Button>
          </div>
        </div>

        <div className="stack lg">
          <div className="card pad">
            {!job ? <div className="empty">Задач ещё не было.</div> : (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row">
                    <h2>Задача {job.id}</h2>
                    <span className={`badge ${job.status === 'finished' ? 'yes' : running ? 'mid' : 'plain'}`}>
                      {JOB_STATUS[job.status] ?? job.status}
                    </span>
                  </div>
                  {running && (
                    <Button icon={<Stop20Regular />} disabled={job.cancel_requested} onClick={stop}>
                      {job.cancel_requested ? 'Останавливается' : 'Остановить'}
                    </Button>
                  )}
                </div>
                <div className="small muted">
                  Чек-лист {job.params.checklist_id}, версия {job.params.version} · {MODE[job.params.mode] ?? job.params.mode}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <ProgressBar className="grow" value={job.total ? job.done / job.total : 0} thickness="large" />
                  <span className="mono">{job.done} из {job.total}</span>
                </div>
                <div className="counters">
                  <div>Готово<b>{job.done - job.errors}</b></div>
                  <div>В работе<b>{job.in_progress}</b></div>
                  <div>Ошибки<b style={{ color: job.errors ? 'var(--no)' : undefined }}>{job.errors}</b></div>
                  <div>Потрачено<b>{money(job.cost_usd, 2)}</b></div>
                </div>
                <div className="table-wrap">
                  <table className="grid">
                    <thead>
                      <tr><th /><th>Диалог</th><th>Оператор</th><th>Канал</th><th className="right">Балл</th><th className="right">Время</th></tr>
                    </thead>
                    <tbody>
                      {job.recent.map((row) => (
                        <tr key={row.conversation_id}>
                          <td title={row.error}>
                            {row.status === 'ok'
                              ? <CheckmarkCircle20Regular style={{ color: 'var(--accent)' }} />
                              : <DismissCircle20Regular style={{ color: 'var(--no)' }} />}
                          </td>
                          <td className="mono"><Link to={`/conversations/${row.conversation_id}`}>{row.conversation_id}</Link></td>
                          <td>{row.operator ?? <span className="muted">Не определён</span>}</td>
                          <td className="small">{CHANNEL[row.channel] ?? row.channel} · {row.language}</td>
                          <td className="mono right"><span className={`badge ${row.status !== 'ok' ? 'no' : (row.score ?? 0) < 50 ? 'no' : 'yes'}`}>{row.status === 'ok' ? score(row.score) : 'Ошибка'}</span></td>
                          <td className="mono right">{row.unchanged ? 'готово ранее' : clock(row.latency_ms / 1000)}</td>
                        </tr>
                      ))}
                      {running && !job.recent.length && (
                        <tr><td colSpan={6}><Spinner size="tiny" label="Модели отвечают" /></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <ExportPanel checklistId={checklistId} version={version} group={group.trim() || 'DEV'} />
        </div>
      </div>
    </main>
  )
}

