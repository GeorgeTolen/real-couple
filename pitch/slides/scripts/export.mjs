// PNG каждого слайда в финальном состоянии и PDF 16:9 из режима печати.
// Запуск из pitch/slides после `npm run build`:  npm run export
// Нужен Chromium для Playwright: `npx playwright install chromium` (один раз).
// Свой браузер можно указать переменной CHROMIUM_PATH.
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const pngDir = dist + 'png/'
const url = pathToFileURL(dist + 'index.html').href

mkdirSync(pngDir, { recursive: true })
for (const file of readdirSync(pngDir)) if (file.endsWith('.png')) rmSync(pngDir + file)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(url + '#1.1')
await page.evaluate(() => document.fonts.ready)
await page.waitForFunction(() => document.querySelector('.s-title .coins')?.dataset.ready || document.querySelector('.s-title .coins svg'), null, { timeout: 15000 })
await page.evaluate(() => document.querySelector('.hint')?.remove())
await page.waitForTimeout(800)

const deck = await page.evaluate(() => ({ ids: window.deck.ids, main: window.deck.main, count: window.deck.count }))
for (let i = 0; i < deck.count; i += 1) {
  await page.evaluate((index) => window.deck.goto(index, 'last'), i)
  // финальный кадр снимаем после всех анимаций
  await page.evaluate(() => window.deck.settle())
  await page.waitForTimeout(i === 0 ? 900 : 250)
  const tag = i < deck.main ? String(i + 1).padStart(2, '0') : 'R' + (i - deck.main + 1)
  await page.screenshot({ path: `${pngDir}${tag}-${deck.ids[i]}.png` })
  console.log('png', tag, deck.ids[i])
}

await page.evaluate(() => window.deck.setPrint(true))
await page.waitForFunction(() => document.documentElement.dataset.printReady === '1', null, { timeout: 10000 })
await page.pdf({ path: dist + 'cqa-pitch.pdf', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true })
console.log('pdf', dist + 'cqa-pitch.pdf')

await browser.close()
if (errors.length) {
  console.error('Ошибки в консоли:\n' + errors.join('\n'))
  process.exit(1)
}
