// Все цифры берутся только отсюда: файлы docs/pitch/data/*.json.
import bench from '../../../docs/pitch/data/model_benchmark.json'
import research from '../../../docs/pitch/data/research.json'
import journey from '../../../docs/pitch/data/journey.json'
import facts from '../../../docs/pitch/data/facts.json'

export { bench, research, journey, facts }

export type Model = (typeof bench.models)[number]

/** Число по-русски: запятая, заданное число знаков. */
export function num(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}

/** Число без лишних нулей: 99.0 -> "99", 72.4 -> "72,4". */
export function short(value: number): string {
  return String(value).replace('.', ',')
}

/** Цена: 0.021 -> "$0,021". */
export function usd(value: number): string {
  return '$' + String(value).replace('.', ',')
}

const NAMES: Record<string, string> = {
  'openai/gpt-6.1-sol': 'GPT-6.1 Sol',
  'google/gemini-3.8-flash': 'Gemini 3.8 Flash',
  'openai/gpt-6.1-terra': 'GPT-6.1 Terra',
  'google/gemini-4-argon': 'Gemini 4 Argon',
  'anthropic/claude-opus-5.5': 'Claude Opus 5.5',
  'deepseek/deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'openai/gpt-6-luna': 'GPT-6 Luna',
  'z-ai/glm-5.3-flash': 'GLM-5.3 Flash',
  'google/gemma-4-26b-a4b-it': 'Gemma 4 26B-A4B',
  'anthropic/claude-sonnet-5.5': 'Claude Sonnet 5.5',
  'qwen/qwen3.8-27b': 'Qwen3.8 27B',
  'anthropic/claude-haiku-5.5': 'Claude Haiku 5.5',
  'openai/gpt-oss-20b': 'gpt-oss-20b',
  'ibm-granite/granite-4.2-8b': 'Granite 4.2 8B',
  'mistralai/ministral-8b-2512': 'Ministral 8B',
  'qwen/qwen3.5-9b': 'Qwen 3.5 9B',
}

export function modelName(id: string): string {
  return NAMES[id] ?? id.split('/')[1]
}

export const ROLE: Record<string, string> = {
  judge_A: 'Судья A',
  judge_B: 'Судья B',
  arbiter: 'Арбитр',
  local_mode: 'Локально',
}

export function researchItem(id: string) {
  const item = research.items.find((entry) => entry.id === id)
  if (!item) throw new Error('нет источника ' + id)
  return item
}

export type JourneyStep = { t: string; title: string; what: string; metric?: Record<string, number> }

export function step(title: string): JourneyStep {
  const item = (journey.steps as JourneyStep[]).find((entry) => entry.title === title)
  if (!item) throw new Error('нет шага ' + title)
  return item
}

export function criterion(id: string) {
  const item = bench.criteria_difficulty.find((entry) => entry.id === id)
  if (!item) throw new Error('нет критерия ' + id)
  return item
}

export function node(id: string) {
  const item = facts.architecture.nodes.find((entry) => entry.id === id)
  if (!item) throw new Error('нет узла ' + id)
  return item
}

export const REPO_URL = 'https://github.com/GeorgeTolen/real-couple'

/** Кнопка «Живое демо» на слайде 10: главная страница приложения (`#/`). Поменяйте адрес, если демо поднято не на localhost:8000. */
export const DEMO_URL = 'http://localhost:8000/#/'

/** Крупное моноширинное число: запятая без широких полей знакоместа. */
export function tight(text: string): string {
  return text.replace(/,/g, '<span class="cm">,</span>')
}
