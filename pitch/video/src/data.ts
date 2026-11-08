// Все числа ролика берутся из docs/pitch/data/*.json, bench/*.json и docs/pitch/PITCH_analysis.md.
// Таблица «число → файл и поле» в out/numbers-check.md.
import bench from '../../../docs/pitch/data/model_benchmark.json'
import research from '../../../docs/pitch/data/research.json'
import facts from '../../../docs/pitch/data/facts.json'
import ensemble from '../../../bench/results_ensemble.json'
import { formatNum } from './lib'

const item = (id: string) => research.items.find((i) => i.id === id)!
const T = facts.trust
const R = facts.instability.runs

/** Сцена 2. facts.instability.runs[].total, facts.trust.human_ceiling_kappa; чипы из research.json. */
export const bias = {
  runs: R.map((r) => formatNum(r.total, 2)), // 85,00 · 80,50
  ceiling: formatNum(T.human_ceiling_kappa, 2), // 0,80
  chips: {
    position: 'arXiv 2305.17926', // research.json → wang.source
    length: 'MT-Bench 2306.05685', // research.json → zheng.source
    instability: 'Kili 2026', // research.json → consistent_wrong.bias.chips
    ceiling: 'NVIDIA 2510.09738', // research.json → ceiling.source
  },
}
// проверка, что чипы действительно есть в research.json
for (const [id, needle] of [['wang', '2305.17926'], ['zheng', '2306.05685'], ['consistent_wrong', 'Kili'], ['ceiling', '2510.09738']] as const)
  if (!JSON.stringify(item(id)).includes(needle)) throw new Error(`research.json: ${id} без ${needle}`)

/** Сцена 3. Веса 7 критериев из facts.na_example.weights, c8 «Грубые» флаг без веса. */
const W = facts.na_example.weights as Record<string, number>
export const rubric = [
  ...Object.entries(W).map(([name, w], i) => ({ id: `c${i + 1}`, name, w })),
  { id: 'c8', name: 'Грубые', w: 0 },
]
/** Ступени: c4 из PITCH_analysis.md (20 / 15 / 10 / 5 / 0), c6 из facts.instability.scale. */
export const steps: Record<string, number[]> = {
  c4: [0, 5, 10, 15, 20],
  c6: [...facts.instability.scale].sort((a, b) => a - b),
}

/** Сцена 4. Диалог en-006: судьи и арбитр по прогонам, слой согласованности, повтор и каппа. */
export const instability = {
  dialog: facts.instability.dialog.replace(/^p1-/, ''),
  criterion: facts.instability.criterion,
  runs: R,
  fixes: ['Кеш результата', 'Арбитр обязателен при споре', 'Нет сбоя с номером реплики, нет снижения'],
  same: ensemble.stability.same, // 95
  total: ensemble.stability.total, // 96
  kappa: Math.round(T.kappa_holdout * 100) / 100, // 0,96
  ceiling: T.human_ceiling_kappa,
}
if (facts.instability.fixes.length !== 3) throw new Error('facts.instability.fixes: ожидалось 3 пункта')

/** Сцена 5. model_benchmark.json. */
const SHORT: Record<string, string> = {
  'google/gemma-4-26b-a4b-it': 'Gemma 4 26B',
  'openai/gpt-oss-20b': 'gpt-oss-20b',
  'ibm-granite/granite-4.2-8b': 'Granite 4.2 8B',
  'mistralai/ministral-8b-2512': 'Ministral 8B',
  'qwen/qwen3.5-9b': 'Qwen 3.5 9B',
  'openai/gpt-6.1-sol': 'Sol',
  'google/gemini-3.8-flash': 'Flash',
  'google/gemini-4-argon': 'Argon',
  'anthropic/claude-opus-5.5': 'Opus',
  'openai/gpt-6.1-terra': 'Terra',
}
const ROLE: Record<string, string> = { judge_A: 'судья A', judge_B: 'судья B', arbiter: 'арбитр' }
export type Model = { id: string; name: string; acc: number; cost: number; role?: string }
const all = bench.models.map((m) => ({
  id: m.model,
  name: SHORT[m.model] ?? m.model.split('/')[1],
  acc: m.accuracy,
  cost: m.usd_per_dialog,
  role: m.chosen ? ROLE[m.chosen] : undefined,
  local: Boolean(m.fits_8gb_laptop),
}))
export const local = all.filter((m) => m.local).sort((a, b) => b.acc - a.acc) // 5 баров
export const cloud = all.filter((m) => !m.local) // 11 точек
export const opus = cloud.find((m) => m.id === 'anthropic/claude-opus-5.5')!
export const sol = cloud.find((m) => m.id === 'openai/gpt-6.1-sol')!
export const opusTimes = Math.round(opus.cost / sol.cost) // ×4
/** Граница Парето среди облачных: от дешёвых к дорогим, точность только растёт. */
export const pareto = (() => {
  const sorted = [...cloud].sort((a, b) => a.cost - b.cost || b.acc - a.acc)
  const front: typeof cloud = []
  let best = -1
  for (const m of sorted) if (m.acc > best) front.push(m), (best = m.acc)
  return front
})()
export const price = facts.headline.usd_per_dialog // 0,021
export const seconds10 = Number(facts.headline.seconds_10_chats.match(/^\d+/)![0]) // 83

/** Сцена 6. facts.architecture и facts.word_example. */
export const arch = facts.architecture
export const words = facts.word_example
export const chips5 = ['первая реплика', 'пауза > 180 с', 'приветствие', 'эскалация', 'личность']
export const judges = {
  A: arch.nodes.find((n) => n.id === 'judgeA')!.sub,
  B: arch.nodes.find((n) => n.id === 'judgeB')!.sub,
  arbiter: arch.nodes.find((n) => n.id === 'arbiter')!.sub.split(',')[0],
}

/** Сцена 8. */
export const finals = [
  { value: facts.headline.holdout_accuracy_pct, decimals: 1, prefix: '', suffix: '%', label: 'на новых чатах' },
  { value: instability.kappa, decimals: 2, prefix: 'κ ', suffix: '', label: 'согласие с эталоном' },
  { value: facts.headline.stability_pct, decimals: 0, prefix: '', suffix: '%', label: 'стабильность' },
  { value: facts.headline.usd_per_dialog, decimals: 3, prefix: '$', suffix: '', label: 'за диалог' },
]
