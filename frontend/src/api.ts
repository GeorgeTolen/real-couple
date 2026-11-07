export type Turn = {
  idx: number
  n: number
  speaker: string
  timestamp: string
  t_sec: number | null
  t_audio?: number | null
  text: string
}

export type ScaleStep = { value: number; label: string }

export type CriterionResult = {
  criterion_id: string
  title: string
  section: string
  type: 'binary' | 'scale' | 'flag'
  scale: ScaleStep[]
  allow_na: boolean
  allowed_answers: string[]
  weight: number
  answer: string
  earned_points: number | null
  max_points: number | null
  weighted_points: number | null
  normalized_weight: number | null
  reasoning: string
  evidence_ids: number[]
  checked_range: number[] | null
  na_reason: string | null
  agreement: string
  judge_answers: Record<string, { answer: string; reasoning: string; evidence_ids: number[] }>
  source: string
  decision_reason?: string | null
  original_answer?: string
}

export type SectionScore = { id: string; title: string; score: number | null; earned: number; max: number }

export type ScoreLayer = {
  total: number | null
  sections: SectionScore[]
  gross_violation: boolean
  gross_items: string[]
  criteria: CriterionResult[]
}

export type Decision = {
  id: number
  appeal_id: number
  reviewer: string
  action: 'confirm' | 'change'
  new_answer: string | null
  reason: string
  created_at: string
}

export type AppealBrief = {
  id: number
  evaluation_id: number
  criterion_id: string
  comment: string
  author: string
  status: string
  created_at: string
  decision: Decision | null
}

export type Evaluation = {
  id: number
  conversation_id: string
  checklist_id: string
  checklist_version: number
  checklist_name: string
  mode: string
  models: Record<string, string>
  prompt_version: string | null
  status: string
  error: string | null
  created_at: string
  needs_review: boolean
  cost_usd: number
  tokens_in: number
  tokens_out: number
  latency_ms: number
  signals: Record<string, unknown>
  appeals: AppealBrief[]
  decisions: Decision[]
  original: ScoreLayer | null
  final: ScoreLayer | null
}

export type ConversationCard = {
  id: string
  channel: string
  language: string
  operator: string | null
  started_at: string | null
  turns: Turn[]
  has_audio: boolean
  evaluation: Evaluation | null
  evaluations: {
    id: number
    checklist_id: string
    checklist_version: number
    status: string
    total_score: number | null
    created_at: string
    mode: string
  }[]
}

export type ConversationRow = {
  id: string
  channel: string
  language: string
  operator: string | null
  started_at: string | null
  n_turns: number
  duration_sec: number | null
  status: string
  appeal_status: string | null
  evaluation: {
    id: number
    status: string
    error: string | null
    checklist_name: string
    checklist_version: number
    needs_review: boolean
    total?: number | null
    final_total?: number | null
    gross_violation?: boolean
    criteria?: Pick<CriterionResult, 'criterion_id' | 'title' | 'type' | 'answer' | 'agreement' | 'scale'>[]
  } | null
}

export type ChecklistCriterion = {
  id: string
  section: string
  title: string
  type: 'binary' | 'scale' | 'flag'
  allow_na: boolean
  weight: number
  description: string
  na_condition: string | null
  scale: ScaleStep[] | null
  channels: string[] | null
  channel_overrides: Record<string, { description?: string; guidance?: string }>
  guidance: string | null
  export_id: string | null
}

export type Checklist = {
  id: string
  version: number
  name: string
  sections: { id: string; title: string }[]
  criteria: ChecklistCriterion[]
  general_rules: string[]
  review_rules: { when_criterion: string; when_answer: string; dispute: string }[]
  weight_sum?: number
  missing_export_ids?: string[]
  versions?: { version: number; name: string; created_at: string }[]
  latest_version?: number
}

export type ChecklistListItem = {
  id: string
  name: string
  latest_version: number
  versions: { version: number; name: string; created_at: string }[]
}

export type Appeal = AppealBrief & {
  conversation_id: string
  channel: string
  language: string
  operator: string | null
  checklist_name: string
  checklist_version: number
  models: Record<string, string>
  evaluation_created_at: string
  original_criterion: CriterionResult
  original_total: number | null
  final_total: number | null
  fragment: Turn[]
}

export type JobResult = {
  conversation_id: string
  status: string
  score: number | null
  gross: boolean
  needs_review: boolean
  spent_usd: number
  latency_ms: number
  operator: string | null
  channel: string
  language: string
  error?: string
}

export type Job = {
  id: number
  status: string
  total: number
  done: number
  errors: number
  in_progress: number
  cost_usd: number
  params: { checklist_id: string; version: number; mode: string; group_id?: string | null }
  recent: JobResult[]
  cancel_requested: boolean
  created_at: string
  finished_at: string | null
}

export type SpeechMetrics = {
  tempo_wpm: number | null
  tempo_in_norm: boolean | null
  operator_share_pct: number | null
  long_pauses: number
  interruptions: number
  audio_available: boolean
  audio_pauses_over_3s?: number
  duration_sec?: number
  audio_error?: string
  summary: string
}

export type Stats = {
  checklist_version: number | null
  evaluated: number
  total_conversations: number
  avg_score: number | null
  needs_review: number
  gross: number
  criteria: {
    criterion_id: string
    title: string
    weight: number
    type: string
    yes: number
    no: number
    partial: number
    na: number
    agree: number
    disagree: number
  }[]
  operators: {
    operator: string
    dialogs: number
    avg_score: number | null
    worst_criterion: string | null
    gross: number
  }[]
  decisions: number
  decisions_changed: number
  models: Record<string, string>
  avg_cost_usd: number | null
  total_cost_usd: number
  avg_latency_ms: number | null
}

export type ModelsInfo = {
  judge_a: { model: string; available: boolean | null }
  judge_b: { model: string; available: boolean | null }
  arbiter: { model: string; available: boolean | null }
  local: { model: string | null; available: boolean | null }
  local_server_up: boolean
  api_key_configured: boolean
  modes: Record<string, { label: string; cost_per_dialog: number; accuracy: number | null }>
}

export type ResultsPreview = {
  problems: string[]
  document: { results: { status: string }[]; model: { name: string; mode: string } }
}

function errorText(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
      .join('; ')
  }
  return `Ошибка запроса, HTTP ${status}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`api${path}`, init)
  if (!response.ok) {
    let detail: unknown = null
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail
    } catch {
      detail = null
    }
    throw new Error(errorText(detail, response.status))
  }
  return (await response.json()) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  conversations: (params: Record<string, string | boolean | undefined>) =>
    request<{ total: number; items: ConversationRow[] }>(`/conversations${query(params)}`),
  conversation: (id: string) => request<ConversationCard>(`/conversations/${id}`),
  audioUrl: (id: string) => `api/conversations/${id}/audio`,
  audioMetrics: (id: string) => request<SpeechMetrics>(`/conversations/${id}/audio-metrics`),
  datasets: () => request<{ group_id: string; total: number }[]>('/datasets'),
  importGroup: (group_id: string) => post<{ imported: number }>('/datasets/import', { group_id }),
  upload: (file: File, group_id: string) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ imported: number; conversation_ids: string[] }>(
      `/conversations/upload${query({ group_id })}`,
      { method: 'POST', body: form },
    )
  },
  checklists: () => request<ChecklistListItem[]>('/checklists'),
  checklist: (id: string, version?: number) => request<Checklist>(`/checklists/${id}${query({ version })}`),
  createChecklist: (config: Checklist) => post<Checklist>('/checklists', config),
  saveVersion: (config: Checklist) => post<Checklist>(`/checklists/${config.id}/versions`, config),
  run: (body: {
    conversation_ids: string[] | 'all'
    group_id?: string | null
    checklist_id: string
    version?: number
    mode: string
    only_missing?: boolean
    no_cache?: boolean
  }) => post<{ job_id: number; total: number }>('/evaluations/run', body),
  evaluation: (id: number) => request<Evaluation>(`/evaluations/${id}`),
  evaluations: (params: Record<string, string | number | undefined>) =>
    request<{ id: number; conversation_id: string; total_score: number | null; status: string }[]>(
      `/evaluations${query(params)}`,
    ),
  preview: (id: number, criterion: string, answer: string) =>
    request<{ before: number | null; after: number | null }>(
      `/evaluations/${id}/preview${query({ criterion, answer })}`,
    ),
  createAppeal: (id: number, body: { criterion_id: string; comment: string; author: string }) =>
    post<Appeal>(`/evaluations/${id}/appeals`, body),
  appeals: (status?: string) => request<Appeal[]>(`/appeals${query({ status })}`),
  decide: (
    id: number,
    body: { reviewer: string; action: 'confirm' | 'change'; new_answer: string | null; reason: string },
  ) => post<{ appeal: Appeal; evaluation: Evaluation }>(`/appeals/${id}/decision`, body),
  job: (id: number) => request<Job>(`/jobs/${id}`),
  jobs: (limit = 1) => request<Job[]>(`/jobs${query({ limit })}`),
  cancelJob: (id: number) => post<Job>(`/jobs/${id}/cancel`),
  models: () => request<ModelsInfo>('/models'),
  stats: (params: Record<string, string | number | undefined>) => request<Stats>(`/stats${query(params)}`),
  previewResults: (params: Record<string, string | number | boolean | undefined>) =>
    request<ResultsPreview>(`/export/results-json${query(params)}`),
  writeResults: (params: Record<string, string | number | undefined>) =>
    post<{ path: string; records: number }>(`/export/results-json${query(params)}`),
}

export async function waitForJob(id: number, onTick?: (job: Job) => void): Promise<Job> {
  for (;;) {
    const job = await api.job(id)
    onTick?.(job)
    if (!['queued', 'running'].includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
}
