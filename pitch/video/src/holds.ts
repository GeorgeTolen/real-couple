// Паузы: сюжет (кадры 0-900, как в сценах) растягивается стоп-кадрами в ключевых моментах.
import data from './holds.json'

export const STORY = 900
const HOLDS = data.holds as [number, number][]
export const OUT_TOTAL = STORY + HOLDS.reduce((s, [, n]) => s + n, 0)

/** Выходной кадр → кадр сюжета: на паузе сюжет стоит. */
export function outToStory(out: number) {
  let shift = 0
  for (const [at, n] of HOLDS) {
    const start = at + shift
    if (out < start) break
    if (out < start + n) return at
    shift += n
  }
  return out - shift
}

/** Кадр сюжета → выходной кадр (для постера и звука). */
export function storyToOut(story: number) {
  return story + HOLDS.filter(([at]) => at < story).reduce((s, [, n]) => s + n, 0)
}
