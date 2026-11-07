import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Field, Input, Select, Switch, Tab, TabList, Textarea } from '@fluentui/react-components'
import {
  Add20Regular, ArrowDown16Regular, ArrowUp16Regular, Checkmark20Regular, Delete16Regular, Dismiss16Regular,
  Warning20Regular,
} from '@fluentui/react-icons'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Checklist, type ChecklistCriterion, type ChecklistListItem } from '../api'
import { ErrorBox, Loading } from '../components/common'
import QualityOctagon from '../components/QualityOctagon'
import { dateTime, points, score } from '../format'

const VOICE = 'voice call'
const EXPORT_CODES = ['contact', 'discovery', 'identification', 'consultation', 'empathy', 'dialogue', 'closure', 'critical']
const TYPE_LABEL = { binary: 'Да / Нет', scale: 'Шкала', flag: 'Флаг' }

function typeLabel(criterion: ChecklistCriterion): string {
  if (criterion.type === 'binary' && criterion.allow_na) return 'Да / Нет / N/A'
  return TYPE_LABEL[criterion.type]
}

function channelValue(criterion: ChecklistCriterion): string {
  if (!criterion.channels?.length) return 'all'
  return criterion.channels[0]
}

function nextId(checklist: Checklist): string {
  let index = checklist.criteria.length + 1
  while (checklist.criteria.some((c) => c.id === `c${index}`)) index += 1
  return `c${index}`
}

function CriterionEditor({ draft, criterion, onChange, onClose, onDelete }: {
  draft: Checklist
  criterion: ChecklistCriterion
  onChange: (next: ChecklistCriterion) => void
  onClose: () => void
  onDelete: () => void
}) {
  const [tab, setTab] = useState('all')
  const update = (patch: Partial<ChecklistCriterion>) => onChange({ ...criterion, ...patch })
  const override = criterion.channel_overrides?.[VOICE] ?? {}
  const updateOverride = (patch: { description?: string; guidance?: string }) => {
    const merged = { ...override, ...patch }
    const cleaned = Object.fromEntries(Object.entries(merged).filter(([, value]) => value))
    const overrides = { ...criterion.channel_overrides }
    if (Object.keys(cleaned).length) overrides[VOICE] = cleaned
    else delete overrides[VOICE]
    update({ channel_overrides: overrides })
  }
  const steps = criterion.scale ?? []
  const setType = (type: ChecklistCriterion['type']) => {
    if (type === 'scale') {
      update({ type, scale: steps.length ? steps : [{ value: 10, label: '' }, { value: 0, label: '' }] })
    } else if (type === 'flag') {
      update({ type, scale: null, weight: 0, allow_na: false, na_condition: null })
    } else {
      update({ type, scale: null })
    }
  }
  return (
    <div className="card pad stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Редактирование критерия</h2>
        <Button appearance="subtle" icon={<Dismiss16Regular />} aria-label="Закрыть" onClick={onClose} />
      </div>
      <Field label="Название" required>
        <Input
          value={criterion.title}
          onChange={(_, data) => {
            // Новое название значит другой критерий: старый код сдачи к нему не относится.
            update({ title: data.value, export_id: null })
          }}
        />
      </Field>
      {!criterion.export_id && (
        <div className="small muted">
          Код для results.json не задан. Если это тот же критерий организаторов, выберите код ниже.
        </div>
      )}
      <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))} size="small">
        <Tab value="all">Для всех каналов</Tab>
        <Tab value="voice">Для звонков</Tab>
      </TabList>
      {tab === 'all' ? (
        <>
          <Field label="Описание">
            <Textarea rows={3} value={criterion.description} onChange={(_, data) => update({ description: data.value })} />
          </Field>
          <Field label="Подсказка судье">
            <Textarea rows={3} value={criterion.guidance ?? ''} onChange={(_, data) => update({ guidance: data.value || null })} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Формулировка для звонков" hint="Пусто: используется общая формулировка">
            <Textarea rows={3} value={override.description ?? ''} onChange={(_, data) => updateOverride({ description: data.value })} />
          </Field>
          <Field label="Подсказка судье для звонков">
            <Textarea rows={3} value={override.guidance ?? ''} onChange={(_, data) => updateOverride({ guidance: data.value })} />
          </Field>
        </>
      )}
      <div className="field-row weight">
        <Field label="Тип ответа">
          <Select
            value={criterion.type}
            onChange={(_, data) => setType(data.value as ChecklistCriterion['type'])}
          >
            <option value="binary">Да / Нет</option>
            <option value="scale">Шкала</option>
            <option value="flag">Флаг без баллов</option>
          </Select>
        </Field>
        <Field label="Вес">
          <Input
            type="number"
            min={0}
            disabled={criterion.type === 'flag'}
            value={String(criterion.weight)}
            onChange={(_, data) => update({ weight: Number(data.value) || 0 })}
          />
        </Field>
      </div>
      {criterion.type === 'scale' && (
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Ступени шкалы</div>
          {steps.map((step, index) => (
            <div key={index} className="step-row">
              <Input
                type="number"
                min={0}
                aria-label="Значение ступени"
                value={String(step.value)}
                onChange={(_, data) => update({
                  scale: steps.map((s, i) => (i === index ? { ...s, value: Number(data.value) || 0 } : s)),
                })}
              />
              <Input
                aria-label="Описание ступени"
                value={step.label}
                onChange={(_, data) => update({
                  scale: steps.map((s, i) => (i === index ? { ...s, label: data.value } : s)),
                })}
              />
              <Button
                appearance="subtle"
                size="small"
                aria-label="Удалить ступень"
                icon={<Delete16Regular />}
                onClick={() => update({ scale: steps.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
          <Button size="small" icon={<Add20Regular />} onClick={() => update({ scale: [...steps, { value: 0, label: '' }] })}>
            Добавить ступень
          </Button>
        </div>
      )}
      {criterion.type !== 'flag' && (
        <>
          <Switch
            label="Разрешить N/A"
            checked={criterion.allow_na}
            onChange={(_, data) => update({ allow_na: data.checked, na_condition: data.checked ? criterion.na_condition : null })}
          />
          {criterion.allow_na && (
            <Field label="Условие N/A">
              <Textarea rows={2} value={criterion.na_condition ?? ''} onChange={(_, data) => update({ na_condition: data.value || null })} />
            </Field>
          )}
        </>
      )}
      <div className="field-row">
        <Field label="Секция">
          <Select value={criterion.section} onChange={(_, data) => update({ section: data.value })}>
            {draft.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </Field>
        <Field label="Канал">
          <Select
            value={channelValue(criterion)}
            onChange={(_, data) => update({ channels: data.value === 'all' ? null : [data.value] })}
          >
            <option value="all">Все</option>
            <option value="agent chat">Только чаты</option>
            <option value={VOICE}>Только звонки</option>
          </Select>
        </Field>
      </div>
      <Field label="Ось карты диалогов" hint="Пусто: по коду критерия. На оценку модели не влияет">
        <Select
          value={criterion.map_axis ?? ''}
          onChange={(_, data) => update({ map_axis: (data.value || null) as ChecklistCriterion['map_axis'] })}
        >
          <option value="">По умолчанию</option>
          <option value="resolution">Решение вопроса</option>
          <option value="service">Сервис</option>
        </Select>
      </Field>
      <Field label="Код для results.json" hint="Нужен, чтобы версию можно было сдать организаторам">
        <Select
          value={criterion.export_id ?? ''}
          onChange={(_, data) => update({ export_id: data.value || null })}
        >
          <option value="">Нет</option>
          {EXPORT_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
      </Field>
      <Button appearance="subtle" icon={<Delete16Regular />} onClick={onDelete}>Удалить критерий</Button>
    </div>
  )
}

export default function ChecklistsPage() {
  const navigate = useNavigate()
  const [list, setList] = useState<ChecklistListItem[] | null>(null)
  const [active, setActive] = useState<{ id: string; version: number } | null>(null)
  const [draft, setDraft] = useState<Checklist | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [examples, setExamples] = useState<{ id: number; conversation_id: string; total_score: number | null; status: string }[]>([])
  const [creating, setCreating] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [copyCurrent, setCopyCurrent] = useState(true)

  const loadList = useCallback(async () => {
    const items = await api.checklists()
    setList(items)
    return items
  }, [])

  const open = useCallback(async (id: string, version: number) => {
    try {
      const data = await api.checklist(id, version)
      setActive({ id, version })
      setDraft(data)
      setSaved(JSON.stringify(data.criteria) + JSON.stringify(data.sections) + data.name)
      setSelected(null)
      setError(null)
      const rows = await api.evaluations({ checklist_id: id, checklist_version: version, limit: 5 })
      setExamples(rows.filter((r) => r.status === 'ok'))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    loadList()
      .then((items) => { if (items[0]) void open(items[0].id, items[0].latest_version) })
      .catch((e: Error) => setError(e.message))
  }, [loadList, open])

  if (error && !draft) return <main className="content"><ErrorBox message={error} /></main>
  if (!list || !draft || !active) return <main className="content"><Loading /></main>

  const entry = list.find((c) => c.id === active.id)
  const latest = entry?.latest_version ?? active.version
  const dirty = saved !== JSON.stringify(draft.criteria) + JSON.stringify(draft.sections) + draft.name
  const weightSum = draft.criteria.reduce((sum, c) => sum + c.weight, 0)
  const missing = EXPORT_CODES.filter((code) => !draft.criteria.some((c) => c.export_id === code))
  const current = draft.criteria.find((c) => c.id === selected) ?? null

  const updateCriterion = (next: ChecklistCriterion) =>
    setDraft({ ...draft, criteria: draft.criteria.map((c) => (c.id === next.id ? next : c)) })

  const move = (index: number, delta: number) => {
    const criteria = [...draft.criteria]
    const [item] = criteria.splice(index, 1)
    criteria.splice(index + delta, 0, item)
    setDraft({ ...draft, criteria })
  }

  const addCriterion = () => {
    const id = nextId(draft)
    setDraft({
      ...draft,
      criteria: [...draft.criteria, {
        id, section: draft.sections[0].id, title: 'Новый критерий', type: 'binary', allow_na: false, weight: 10,
        description: '', na_condition: null, scale: null, channels: null, channel_overrides: {}, guidance: null,
        export_id: null, map_axis: null,
      }],
    })
    setSelected(id)
  }

  const deleteCriterion = (id: string) => {
    setDraft({ ...draft, criteria: draft.criteria.filter((c) => c.id !== id) })
    setSelected(null)
  }

  const saveVersion = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.saveVersion(draft)
      await loadList()
      await open(result.id, result.version)
      setMessage(`Сохранена версия ${result.version}. Исходные версии не изменились.`)
      return result
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    const version = dirty ? (await saveVersion())?.version : active.version
    if (version) navigate('/run', { state: { checklistId: active.id, version } })
  }

  const createChecklist = async () => {
    setBusy(true)
    setError(null)
    try {
      const base = copyCurrent ? draft : {
        ...draft,
        sections: [{ id: 'main', title: 'Основная' }],
        criteria: [{
          id: 'c1', section: 'main', title: 'Первый критерий', type: 'binary' as const, allow_na: false, weight: 100,
          description: '', na_condition: null, scale: null, channels: null, channel_overrides: {}, guidance: null,
          export_id: null,
        }],
        review_rules: [],
      }
      const result = await api.createChecklist({ ...base, id: newId.trim(), name: newName.trim() })
      await loadList()
      await open(result.id, result.version)
      setCreating(false)
      setNewId('')
      setNewName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="content fill">
      <div className="editor">
        <div className="card pad stack">
          <h2>Чек-листы</h2>
          <Button icon={<Add20Regular />} onClick={() => setCreating(!creating)}>Новый чек-лист</Button>
          {creating && (
            <div className="stack">
              <Field label="Идентификатор" hint="Латиница, например my-list">
                <Input value={newId} onChange={(_, data) => setNewId(data.value)} />
              </Field>
              <Field label="Название"><Input value={newName} onChange={(_, data) => setNewName(data.value)} /></Field>
              <Checkbox label="Скопировать текущий" checked={copyCurrent} onChange={(_, data) => setCopyCurrent(Boolean(data.checked))} />
              <Button disabled={busy || !newId.trim() || !newName.trim()} onClick={createChecklist}>Создать</Button>
            </div>
          )}
          {list.map((item) => (
            <div key={item.id} className="stack">
              <b>{item.name}</b>
              {item.versions.map((version) => (
                <div
                  key={version.version}
                  role="button"
                  className={`version-item ${item.id === active.id && version.version === active.version ? 'on' : ''}`}
                  onClick={() => open(item.id, version.version)}
                >
                  <span>Версия {version.version}</span>
                  {version.version === item.latest_version && <span className="badge yes">Активна</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="stack">
          <div className="card pad stack">
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <h1>{draft.name}, версия {active.version}{dirty && <span className="badge mid" style={{ marginLeft: 8 }}>Есть правки</span>}</h1>
              <div className="row">
                <Button disabled={busy || !dirty} onClick={saveVersion}>Сохранить как версию {latest + 1}</Button>
                <Button appearance="primary" disabled={busy} onClick={apply}>Применить к диалогам</Button>
              </div>
            </div>
            <ErrorBox message={error} />
            {message && <div className="success">{message}</div>}
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th />
                    <th>ID</th>
                    <th>Название</th>
                    <th>Секция</th>
                    <th>Тип ответа</th>
                    <th className="right">Вес</th>
                    <th>N/A</th>
                    <th>Канал</th>
                    <th>Код</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.criteria.map((criterion, index) => (
                    <tr
                      key={criterion.id}
                      className={`link ${criterion.id === selected ? 'selected' : ''}`}
                      onClick={() => setSelected(criterion.id)}
                    >
                      <td onClick={(event) => event.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" appearance="subtle" aria-label="Выше" disabled={index === 0} icon={<ArrowUp16Regular />} onClick={() => move(index, -1)} />
                        <Button size="small" appearance="subtle" aria-label="Ниже" disabled={index === draft.criteria.length - 1} icon={<ArrowDown16Regular />} onClick={() => move(index, 1)} />
                      </td>
                      <td className="mono">{criterion.id}</td>
                      <td><b>{criterion.title}</b></td>
                      <td className="small">{draft.sections.find((s) => s.id === criterion.section)?.title}</td>
                      <td><span className={`badge ${criterion.type === 'scale' ? 'yes' : 'plain'}`}>{typeLabel(criterion)}</span></td>
                      <td className="mono right">{criterion.type === 'flag' ? '—' : points(criterion.weight)}</td>
                      <td>{criterion.allow_na ? <span className="badge yes">Да</span> : <span className="muted">Нет</span>}</td>
                      <td className="small">
                        {channelValue(criterion) === 'all' ? 'Все' : channelValue(criterion) === VOICE ? 'Только звонки' : 'Только чаты'}
                      </td>
                      <td className="mono small">{criterion.export_id ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ color: weightSum === 100 ? 'var(--yes)' : 'var(--mid)' }}>
                {weightSum === 100 ? <Checkmark20Regular /> : <Warning20Regular />}
                Сумма весов <b className="mono">{points(weightSum)}</b>
                {weightSum !== 100 && <span className="small">итог всё равно приводится к 100</span>}
              </div>
              <Button icon={<Add20Regular />} onClick={addCriterion}>Добавить критерий</Button>
            </div>
            {missing.length > 0 && (
              <div className="notice">
                Для results.json не хватает кодов: <span className="mono">{missing.join(', ')}</span>.
                Оценка этой версией работает, но сдать её организаторам нельзя, пока коды не указаны.
              </div>
            )}
            {!dirty && missing.length === 0 && draft.official === false && (
              <div className="notice">
                Веса или шкалы этой версии отличаются от таблицы организаторов. Файл для сдачи по умолчанию
                будет собран по последней версии, которая с ней совпадает.
              </div>
            )}
          </div>
          <div className="card pad">
            <h3>Предпросмотр профиля</h3>
            <div className="preview-grid pad-text" data-testid="checklist-preview">
              <QualityOctagon
                compact
                items={draft.criteria.map((c) => ({
                  criterion_id: c.id, title: c.title, type: c.type, scale: c.scale ?? [], weight: c.weight,
                }))}
                center={<text className="oct-center" x={320} y={332} textAnchor="middle">{draft.criteria.length}</text>}
                label={`Схема чек-листа: критериев ${draft.criteria.length}`}
              />
              <div className="stack small muted">
                <span>Вершин столько же, сколько критериев. Схема перестраивается при добавлении критерия.</span>
                <span>В карточке диалога вершины покажут ответ модели по каждому критерию.</span>
              </div>
            </div>
          </div>
          <div className="card pad stack">
            <h3>Примеры оценок по этой версии</h3>
            {examples.length ? examples.map((row) => (
              <div key={row.id} className="row" style={{ justifyContent: 'space-between' }}>
                <Link className="mono" to={`/conversations/${row.conversation_id}`}>{row.conversation_id}</Link>
                <span className="mono"><b>{score(row.total_score)}</b></span>
              </div>
            )) : <span className="muted pad-text">Этой версией диалоги ещё не оценивались.</span>}
            <div className="small muted pad-text">
              Создана: {dateTime(entry?.versions.find((v) => v.version === active.version)?.created_at)}
            </div>
          </div>
        </div>

        <div>
          {current ? (
            <CriterionEditor
              key={current.id}
              draft={draft}
              criterion={current}
              onChange={updateCriterion}
              onClose={() => setSelected(null)}
              onDelete={() => deleteCriterion(current.id)}
            />
          ) : (
            <div className="card empty">Выберите критерий в таблице, чтобы изменить его.</div>
          )}
        </div>
      </div>
    </main>
  )
}
