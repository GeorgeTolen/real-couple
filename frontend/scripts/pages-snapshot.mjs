// Снимок GET-ответов API для статической демо-версии на GitHub Pages.
// Обходит интерфейс в браузере, все запросы кроме GET блокируются: модели не вызываются.
// Запуск: node scripts/pages-snapshot.mjs http://localhost:8001 out/snapshot.json
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:8001'
const out = process.argv[3] ?? 'snapshot.json'
const snapshot = {}
const SECRET = /sig=|powerplatform|dynamics\.com|filedownload|sk-or-v1/i

function clean(value) {
  if (typeof value === 'string') return SECRET.test(value) ? null : value
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'audio_url' ? null : clean(v)]))
  }
  return value
}

function keyOf(url) {
  const u = new URL(url)
  const path = u.pathname.replace(/^.*?\/api/, '')
  u.searchParams.sort()
  const search = u.searchParams.toString()
  return search ? `${path}?${search}` : path
}

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.route('**/api/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()))
page.on('response', async (response) => {
  const url = response.url()
  if (!url.includes('/api/') || response.request().method() !== 'GET' || !response.ok()) return
  if (url.includes('/audio') && !url.includes('audio-metrics')) return
  try {
    snapshot[keyOf(url)] = clean(await response.json())
  } catch {
    /* не JSON */
  }
})

async function visit(hash) {
  await page.goto(`${base}/#${hash}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

async function get(path) {
  const response = await page.request.get(`${base}/api${path}`)
  if (response.ok()) snapshot[keyOf(`${base}/api${path}`)] = clean(await response.json())
}

for (const hash of ['/', '/analytics', '/appeals', '/checklists', '/run']) await visit(hash)
const list = await (await page.request.get(`${base}/api/conversations`)).json()
for (const row of list.items) {
  await visit(`/conversations/${row.id}`)
  const tab = page.getByRole('tab', { name: 'Детали' })
  if (await tab.count()) {
    await tab.first().click()
    await page.waitForLoadState('networkidle')
  }
}
await get('/conversations')
await get('/appeals?status=open')
await get('/appeals?status=resolved')
for (const item of await (await page.request.get(`${base}/api/checklists`)).json()) {
  for (const version of item.versions ?? []) await get(`/checklists/${item.id}?version=${version.version ?? version}`)
  await get(`/checklists/${item.id}`)
}
const ids = new Set()
for (const body of Object.values(snapshot)) {
  for (const m of JSON.stringify(body).matchAll(/"evaluation_id":(\d+)/g)) ids.add(m[1])
}
for (const id of ids) if (!snapshot[`/evaluations/${id}`]) await get(`/evaluations/${id}`)

await browser.close()
const text = JSON.stringify(snapshot)
if (SECRET.test(text)) throw new Error('В снимке осталась подписанная ссылка')
fs.writeFileSync(out, text)
console.log(`ответов: ${Object.keys(snapshot).length}, ${(text.length / 1e6).toFixed(2)} МБ -> ${out}`)
