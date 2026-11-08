// Проверка статической демо-версии: страницы открываются без API, ошибок нет.
// Запуск: node scripts/pages-smoke.mjs http://127.0.0.1:8002 shots-dir
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://127.0.0.1:8002'
const shots = process.argv[3] ?? '.'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`))
for (const [name, hash] of [
  ['list', '/'],
  ['fbroker', '/?group=FBroker'],
  ['card', '/conversations/p2-kz-003'],
  ['call', '/conversations/p4-ru-001'],
  ['analytics', '/analytics'],
  ['appeals', '/appeals'],
  ['checklists', '/checklists'],
  ['run', '/run'],
]) {
  await page.goto(`${base}/#${hash}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  const alert = await page.locator('[role=alert], .error').allInnerTexts()
  console.log(name, '| alerts:', alert.join(' / ').slice(0, 200) || 'нет')
  await page.screenshot({ path: `${shots}/${name}.png` })
}
console.log('errors:', errors.length ? errors : 'нет')
await browser.close()
