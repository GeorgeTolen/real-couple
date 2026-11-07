import { useEffect, useState } from 'react'
import { api, type Benchmark, type Stats } from '../api'
import { money, score } from '../format'

function accuracyText(value: number | null | undefined): string {
  return value === null || value === undefined ? 'нет замера' : `${value.toFixed(1).replace('.', ',')}%`
}

export default function KpiStrip({ params }: { params?: Record<string, string | number | undefined> }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null)
  const key = JSON.stringify(params ?? {})

  useEffect(() => {
    let live = true
    api.stats(JSON.parse(key)).then((data) => { if (live) setStats(data) }).catch(() => undefined)
    api.benchmark().then((data) => { if (live) setBenchmark(data) }).catch(() => undefined)
    return () => {
      live = false
    }
  }, [key])

  const test = benchmark?.holdout ?? benchmark?.modes.ensemble ?? null
  const cost = benchmark?.modes.ensemble?.cost_per_dialog
  const channels = stats?.channels ?? {}
  const languages = stats?.languages ?? {}

  return (
    <section className="kpi" aria-label="Сводка" data-testid="kpi">
      <div><span className="kpi-label">Всего диалогов</span><span className="kpi-value">{stats?.total_conversations ?? '—'}</span></div>
      <div>
        <span className="kpi-label">Чаты / звонки</span>
        <span className="kpi-value">{channels['agent chat'] ?? 0} / {channels['voice call'] ?? 0}</span>
      </div>
      <div>
        <span className="kpi-label">RU / KZ / EN</span>
        <span className="kpi-value">{languages.RU ?? 0} / {languages.KZ ?? 0} / {languages.EN ?? 0}</span>
      </div>
      <div><span className="kpi-label">Средний балл</span><span className="kpi-value">{score(stats?.avg_score)}</span></div>
      <div><span className="kpi-label">На проверку</span><span className="kpi-value warn">{stats?.needs_review ?? '—'}</span></div>
      <div><span className="kpi-label">Грубые нарушения</span><span className="kpi-value bad">{stats?.gross ?? '—'}</span></div>
      <div data-testid="kpi-accuracy">
        <span className="kpi-label">Точность{benchmark?.holdout ? ', контрольный набор' : ''}</span>
        <span className="kpi-value">{accuracyText(test?.accuracy)}</span>
        {test?.dialogs && <span className="kpi-note">замер {test.dialogs} диалогов, {test.measured_at}</span>}
      </div>
      <div>
        <span className="kpi-label">Цена оценки</span>
        <span className="kpi-value">{cost != null ? money(cost, 3) : 'нет замера'}</span>
        {benchmark?.modes.ensemble?.dialogs && (
          <span className="kpi-note">замер {benchmark.modes.ensemble.dialogs} диалогов, {benchmark.modes.ensemble.measured_at}</span>
        )}
      </div>
    </section>
  )
}
