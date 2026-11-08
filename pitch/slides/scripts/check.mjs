// Проверки после сборки: один файл без сети, цитаты дословно и до 15 слов,
// нет длинных тире на слайдах, тайминг заметок.  npm run check
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
const external = html.match(/(?:src|href)=["']https?:[^"']+|url\(["']?https?:[^)]+|<script[^>]+src=|<link[^>]+href=/g) ?? []
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

// 4. Шаги и тайминг заметок
const deck = await page.evaluate(() => ({ ids: window.deck.ids, steps: window.deck.steps, notes: window.deck.notes, main: window.deck.main }))
const words = (t) => t.split(/\s+/).filter(Boolean).length
const sec = (from, to) => deck.notes.slice(from, to).reduce((s, t) => s + (words(t) / WPM) * 60, 0)
console.log(`\nЗаметки, темп ${WPM} слов/мин:`)
deck.ids.forEach((id, i) => console.log(`  ${(i < deck.main ? String(i + 1) : 'R' + (i - deck.main + 1)).padStart(3)} ${id.padEnd(14)} шагов ${deck.steps[i]}  слов ${String(words(deck.notes[i])).padStart(3)}  ~${((words(deck.notes[i]) / WPM) * 60).toFixed(0)} с`))
const before = sec(0, 7)
const after = sec(8, 11)
ok(before <= 90, `слайды 1–7: ~${before.toFixed(0)} с (лимит 90)`)
ok(after <= 60, `слайды 9–11: ~${after.toFixed(0)} с (лимит 60)`)
ok(before + after + sec(7, 8) <= 150, `всё без демо: ~${(before + after + sec(7, 8)).toFixed(0)} с (лимит 150)`)

await browser.close()
process.exit(failed ? 1 : 0)
