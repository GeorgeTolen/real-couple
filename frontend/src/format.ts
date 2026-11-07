import type { CriterionResult } from './api'

export type Tone = 'yes' | 'no' | 'na' | 'mid'

type Answerable = Pick<CriterionResult, 'type' | 'scale'>

export function score(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(2).replace('.', ',')
}

export function points(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',')
}

export function money(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? '—' : `$${value.toFixed(digits).replace('.', ',')}`
}

export function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} с`
}

export function clock(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--:--'
  const total = Math.max(0, Math.floor(value))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function answerLabel(answer: string): string {
  if (answer === 'Y') return 'Да'
  if (answer === 'N') return 'Нет'
  if (answer === 'NA') return 'N/A'
  return answer
}

export function answerTone(item: Answerable, answer: string): Tone {
  if (answer === 'NA') return 'na'
  if (item.type === 'flag') return answer === 'Y' ? 'no' : 'yes'
  if (item.type === 'binary') return answer === 'Y' ? 'yes' : 'no'
  const value = Number(answer)
  const top = Math.max(...item.scale.map((s) => s.value))
  if (value >= top) return 'yes'
  return value <= 0 ? 'no' : 'mid'
}

export const SPEAKER: Record<string, string> = {
  client: 'Клиент',
  operator: 'Оператор',
  bot: 'Бот',
  system: 'Система',
}

export const CHANNEL: Record<string, string> = { 'agent chat': 'Чат', 'voice call': 'Звонок' }

export const STATUS: Record<string, string> = {
  not_evaluated: 'Не оценён',
  evaluated: 'Оценён',
  needs_review: 'На проверку',
  appealed: 'Апелляция',
  resolved: 'Решено',
}

export const AGREEMENT: Record<string, string> = {
  full: 'Модели согласны',
  arbitrated: 'Было расхождение, решал арбитр',
  unresolved: 'Расхождение без арбитра',
  single: 'Оценка одной моделью',
}

export const MODE: Record<string, string> = {
  ensemble: 'Ансамбль',
  single: 'Одна модель',
  local: 'Локальная модель',
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Настройка роли просто не сохранится между сессиями.
  }
}
