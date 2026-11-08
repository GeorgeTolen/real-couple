// Проверки после сборки: один файл без сети, цитаты дословно и до 15 слов,
// нет длинных тире и запрещённых формулировок, скриншоты примеров целые и крупные, тайминг заметок.  npm run check
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const html = readFileSync(dist + 'index.html', 'utf8')
const research = JSON.parse(readFileSync(new URL('../../../docs/pitch/data/research.json', import.meta.url), 'utf8'))
const WPM = Number(process.env.WPM || 140) // темп речи, слов в минуту
let failed = 0
const ok = (cond, text) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${text}`)
  if (!cond) failed += 1
}

// 1. Самодостаточность
// ссылка «Живое демо» на локальное приложение (слайд 10, DEMO_URL в data.ts) ресурсом не считается
const external = (html.match(/(?:src|href)=["']https?:[^"']+|url\(["']?https?:[^)]+|<script[^>]+src=|<link[^>]+href=/g) ?? []).filter((m) => !/^href=["']http:\/\/localhost:\d+/.test(m))
ok(external.length === 0, `один HTML без внешних ресурсов (${(html.length / 1024).toFixed(0)} КБ)` + (external.length ? ': ' + external.join(', ') : ''))

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(pathToFileURL(dist + 'index.html').href + '?print')
await page.waitForFunction(() => document.documentElement.dataset.printReady === '1', null, { timeout: 10000 })

// 2. Цитаты
const quotes = await page.$$eval('blockquote', (els) => els.map((el) => el.textContent.trim()))
for (const q of quotes) {
  const text = q.replace(/^“|”$/g, '')
  const item = research.items.find((i) => i.quote === text)
  const words = text.split(/\s+/).length
  ok(Boolean(item) && words <= 15, `цитата дословно из research.json, ${words} слов: “${text}”`)
}

// 3. Длинные тире в тексте слайдов
const slideText = await page.$eval('.stage', (el) => el.innerText)
ok(!slideText.includes('—'), 'нет длинных тире в тексте слайдов')

// 4. Запрещённые формулировки (PITCH_analysis.md, раздел 8; PROMPT_slides_v4_script.md, проверка 2)
const notesAll = await page.evaluate(() => window.deck.notes.join(' '))
for (const bad of ['сотни прогонов', 'без предвзятости', 'два арбитра', '3%']) {
  const hit = (slideText + ' ' + notesAll).toLowerCase().includes(bad)
  ok(!hit, `нет формулировки «${bad}»`)
}

// 5. Блок trust в facts.json совпадает с отчётами bench (если они рядом)
const facts = JSON.parse(readFileSync(new URL('../../../docs/pitch/data/facts.json', import.meta.url), 'utf8'))
try {
  const h = JSON.parse(readFileSync(new URL('../../../bench/holdout/holdout_report.json', import.meta.url), 'utf8'))
  const e = JSON.parse(readFileSync(new URL('../../../bench/results_ensemble.json', import.meta.url), 'utf8'))
  const pairs = h.answers.flatMap((a) => Object.values(a.criteria)).filter((v) => !String(v.expected).endsWith('?')).map((v) => [String(v.expected), String(v.answer)])
  const n = pairs.length
  const po = pairs.filter(([x, y]) => x === y).length / n
  const cnt = (i) => pairs.reduce((m, p) => ((m[p[i]] = (m[p[i]] || 0) + 1), m), {})
  const ce = cnt(0), cm = cnt(1)
  const pe = Object.keys(ce).reduce((s, k) => s + ce[k] * (cm[k] || 0), 0) / n / n
  const kappa = Math.round(((po - pe) / (1 - pe)) * 1000) / 1000
  const all = h.answers.flatMap((a) => Object.values(a.criteria))
  const full = all.filter((v) => v.agreement === 'full').length
  ok(kappa === facts.trust.kappa_holdout, `каппа ${kappa} совпадает с facts.trust`)
  ok(n === facts.trust.confident_items && all.length - n === facts.trust.disputed_items, `уверенных ${n}, спорных ${all.length - n}`)
  ok(`${full} из ${all.length}` === facts.trust.judge_agreement, `согласие судей ${full} из ${all.length}`)
  ok(`${e.stability.same} из ${e.stability.total}` === facts.trust.stability, `стабильность ${e.stability.same} из ${e.stability.total}`)
  ok(h.report.per_criterion.c4.includes(`(${facts.trust.c4_holdout.replace(' из ', '/')})`), `c4 на контроле ${facts.trust.c4_holdout}`)
  ok(h.report.per_language.kz.includes(`(${facts.trust.kz_holdout.replace(' из ', '/')})`), `KZ на контроле ${facts.trust.kz_holdout}`)
} catch (err) {
  console.log('SKIP сверка trust: нет файлов bench рядом (' + err.message.split('\n')[0] + ')')
}

// 6. Скриншоты примеров (слайды 08 и 09): не обрезаны и не уже 1600 px на холсте 1920
const shots = await page.$$eval('.shot-win', (wins) =>
  wins.map((win) => {
    const img = win.querySelector('img')
    const zoom = win.querySelector('.shot-zoom')
    const r = img.getBoundingClientRect()
    const z = zoom.getBoundingClientRect()
    const slide = win.closest('.slide').getBoundingClientRect()
    return {
      id: win.closest('.slide').dataset.id,
      width: r.width,
      ratio: Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight),
      inside: r.left >= z.left - 0.5 && r.right <= z.right + 0.5 && r.top >= z.top - 0.5 && r.bottom <= z.bottom + 0.5 && z.left >= slide.left && z.right <= slide.right && z.bottom <= slide.bottom,
      natural: img.naturalWidth,
    }
  }),
)
ok(shots.length === 2, `два скриншота с выносками (${shots.map((x) => x.id).join(', ')})`)
for (const x of shots) ok(x.width >= 1600 && x.ratio < 0.01 && x.inside && x.natural >= x.width, `${x.id}: ширина ${x.width.toFixed(0)} px, пропорции и края целые, исходник ${x.natural} px`)

// 7. Шаги и тайминг заметок (сценарий на 6 минут до демо, PROMPT_slides_v4_script.md)
const deck = await page.evaluate(() => ({ ids: window.deck.ids, steps: window.deck.steps, notes: window.deck.notes, main: window.deck.main }))
const words = (t) => t.split(/\s+/).filter(Boolean).length
const sec = (from, to) => deck.notes.slice(from, to).reduce((s, t) => s + (words(t) / WPM) * 60, 0)
console.log(`\nЗаметки, темп ${WPM} слов/мин:`)
deck.ids.forEach((id, i) => console.log(`  ${(i < deck.main ? String(i + 1) : 'R' + (i - deck.main + 1)).padStart(3)} ${id.padEnd(14)} шагов ${deck.steps[i]}  слов ${String(words(deck.notes[i])).padStart(3)}  ~${((words(deck.notes[i]) / WPM) * 60).toFixed(0)} с`))
// лимиты из раздела «Тайминг»: 02: 40 с · 03: 30 · 04: 60 · 05: 30 · 06: 50 · 07: 50 · 08: 50 · 09: 40 · 10: 30
const LIMITS = { 2: 40, 3: 30, 4: 60, 5: 30, 6: 50, 7: 50, 8: 50, 9: 40, 10: 30 }
for (const [n, lim] of Object.entries(LIMITS)) {
  const i = Number(n) - 1
  ok(sec(i, i + 1) <= lim, `слайд ${n.padStart(2, '0')} ${deck.ids[i]}: ~${sec(i, i + 1).toFixed(0)} с (лимит ${lim})`)
}
const budget = Object.values(LIMITS).reduce((a, b) => a + b, 0)
ok(sec(1, 10) <= budget, `слайды 02–10: ~${sec(1, 10).toFixed(0)} с (сумма лимитов ${budget} с)`)
ok(deck.main === 10, `основных слайдов ${deck.main}, резервных ${deck.ids.length - deck.main}`)

await browser.close()
process.exit(failed ? 1 : 0)
