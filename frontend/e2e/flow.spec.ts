import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Сценарии идут по порядку на одной копии базы. Требуются data/cqa.sqlite и ключ OpenRouter:
// замена критерия спрашивает модель об одном критерии одного диалога, это несколько центов.
const SCREENS = path.resolve(import.meta.dirname, '..', '..', 'docs', 'screens')
fs.mkdirSync(SCREENS, { recursive: true })

const API = 'http://127.0.0.1:8001/api'
const api = async (route: string) => (await fetch(`${API}${route}`)).json()

async function screen(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENS, `${name}.png`) })
}

async function openDialog(page: Page, id: string) {
  await page.goto(`/#/conversations/${id}`)
  await expect(page.getByRole('heading', { name: new RegExp(id) })).toBeVisible()
}

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

test.describe.configure({ mode: 'serial' })

test('список: полоса метрик и разгруженная таблица', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('/#/')
  await expect(page.locator('table.grid tbody tr')).toHaveCount(20)
  const kpi = page.getByTestId('kpi')
  await expect(kpi).toContainText('65')
  await expect(kpi).toContainText('60 / 5')
  await expect(page.getByTestId('kpi-accuracy')).toContainText('замер 10 диалогов')
  await expect(page.locator('table.grid th')).toHaveText(['', 'ID диалога', 'Оператор', 'Канал и язык', 'Итог', 'Критерии', 'Флаги', 'Апелляция'])
  await screen(page, '01-list')
  await page.getByRole('button', { name: 'Звонок' }).click()
  await expect(page.locator('table.grid tbody tr')).toHaveCount(5)
  await page.getByRole('button', { name: 'Все', exact: true }).click()
  await page.getByPlaceholder('Поиск по ID и тексту').fill('p1-ru-009')
  await expect(page.locator('table.grid tbody tr')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('пустое состояние: монеты, подсказка и действие', async ({ page }) => {
  await page.goto('/#/')
  await page.getByPlaceholder('Поиск по ID и тексту').fill('такого-диалога-нет')
  const empty = page.getByTestId('empty')
  await expect(empty).toContainText('По этим фильтрам диалогов нет')
  await expect(empty.getByRole('button', { name: 'Сбросить фильтры' })).toBeVisible()
  await expect(empty.locator('[data-coins="3d"]')).toBeVisible()
  await expect(empty.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await expect(empty.locator('.coin-host')).toHaveAttribute('data-coins-running', 'true')
  await page.waitForTimeout(1500)
  await screen(page, '09-empty-coins')
  const frameMs = await empty.locator('.coin-host').getAttribute('data-frame-ms')
  console.log(`Монеты: время кадра в JS ${frameMs} мс (программная отрисовка теста)`)
  // Сцена не считается, когда её не видно.
  await empty.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await expect(page.locator('table.grid tbody tr')).toHaveCount(20)
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('уменьшенное движение: монеты статичны', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, baseURL: 'http://127.0.0.1:8001' })
  const page = await context.newPage()
  await page.goto('/#/нет-такой-страницы')
  const empty = page.getByTestId('empty')
  await expect(empty).toContainText('Такой страницы нет')
  await expect(empty.locator('[data-coins="static"]')).toBeVisible()
  await expect(empty.locator('canvas')).toHaveCount(0)
  await context.close()
})

test('страница 404 с монетами', async ({ page }) => {
  await page.goto('/#/нет-такой-страницы')
  await expect(page.getByTestId('empty').getByRole('link', { name: 'Открыть журнал диалогов' })).toBeVisible()
  await expect(page.getByTestId('empty').locator('canvas')).toBeVisible({ timeout: 30_000 })
})

test('карточка: октагон, паспорт критерия, переход к реплике', async ({ page }) => {
  await openDialog(page, 'p1-ru-009')
  await expect(page.locator('.octagon')).toHaveAttribute('data-vertices', '8')
  await expect(page.getByTestId('head-score')).toBeVisible()
  // Шапка разгружена, служебное ушло во вкладку.
  await expect(page.locator('.card-head')).not.toContainText('gemini')
  await page.locator('.oct-vertex[data-criterion="c3"]').hover()
  const passport = page.getByTestId('passport')
  await expect(passport).toHaveAttribute('data-criterion', 'c3')
  await expect(passport).toContainText('Идентификация: Нет')
  await expect(passport.getByTestId('how-to-improve')).toBeVisible()
  await page.locator('.oct-vertex[data-criterion="c1"]').focus()
  await expect(passport).toHaveAttribute('data-criterion', 'c1')
  await expect(passport.getByTestId('how-to-improve')).toHaveCount(0)
  await page.locator('.oct-vertex[data-criterion="c3"]').hover()
  await screen(page, '02-chat-octagon')
  const chip = passport.locator('.evidence').first()
  const turn = (await chip.innerText()).replace(/\D/g, '')
  await chip.click()
  await page.waitForTimeout(600)
  await expect(page.locator(`#turn-${turn}`)).toBeInViewport()
  await expect(page.locator(`#turn-${turn}`)).toHaveClass(/ev-/)
  // Блок причин не длиннее трёх строк, у каждой переход к фрагменту.
  const drivers = page.locator('.driver')
  expect(await drivers.count()).toBeLessThanOrEqual(3)
  await expect(drivers.first().getByRole('button', { name: 'Перейти к фрагменту' })).toBeVisible()
  await page.getByRole('tab', { name: 'Детали' }).click()
  await expect(page.locator('.result-panel')).toContainText('gemini')
  await page.getByRole('tab', { name: /Чек-лист/ }).click()
  await page.getByRole('button', { name: 'Список' }).click()
  await expect(page.locator('.crit-row')).toHaveCount(8)
})

test('N/A: полая вершина и причина', async ({ page }) => {
  const list = await api('/conversations?language=RU&channel=agent%20chat')
  const row = list.items.find((item: { evaluation?: { criteria?: { answer: string }[] } }) =>
    item.evaluation?.criteria?.some((c) => c.answer === 'NA'))
  const id = row.id
  const na = row.evaluation.criteria.find((c: { answer: string }) => c.answer === 'NA').criterion_id
  await openDialog(page, id)
  const vertex = page.locator(`.oct-vertex[data-criterion="${na}"]`)
  await expect(vertex).toHaveAttribute('stroke-dasharray', '3 3')
  await vertex.hover()
  await expect(page.getByTestId('passport')).toContainText('Причина N/A')
})

test('повторная оценка отдаёт сохранённый результат', async ({ page }) => {
  await openDialog(page, 'p1-ru-002')
  const before = await page.getByTestId('head-score').innerText()
  await page.getByRole('button', { name: 'Переоценить', exact: true }).click()
  await expect(page.getByText('Оценка не изменилась')).toBeVisible({ timeout: 30_000 })
  expect(await page.getByTestId('head-score').innerText()).toBe(before)
  expect((await api('/jobs?limit=1'))[0].cost_usd).toBe(0)
})

test('апелляция и решение: было и стало на октагоне', async ({ page }) => {
  await openDialog(page, 'p1-ru-009')
  const original = await page.getByTestId('head-score').innerText()
  await page.getByRole('button', { name: 'Оспорить критерий' }).click()
  await page.getByRole('radio', { name: /Эмпатия/ }).check()
  await page.getByLabel('Комментарий').fill('Оператор вежливо ответил на вопрос клиента.')
  await page.getByLabel('Автор').fill('Руслан')
  await page.getByRole('button', { name: 'Отправить апелляцию' }).click()
  await expect(page.getByText('Оспорить оценку')).toHaveCount(0)
  await page.getByRole('button', { name: 'Проверяющий', exact: true }).click()
  await page.goto('/#/appeals')
  await page.getByRole('button', { name: 'Проверяющий', exact: true }).click()
  await expect(page.getByTestId('appeal-octagon')).toBeVisible()
  await page.getByRole('combobox').first().selectOption({ label: 'Да' })
  await page.getByLabel('Причина решения').fill('Оператор ответил вежливо, критерий выполнен.')
  const recount = page.getByTestId('recount')
  await expect(recount).toContainText('→')
  await expect(page.locator('[data-testid="appeal-octagon"] polygon[data-layer="before"]')).toHaveCount(1)
  await screen(page, '05-appeals')
  const after = (await recount.innerText()).split('→')[1].trim()
  await page.getByRole('button', { name: 'Сохранить решение' }).click()
  await expect(page.getByRole('button', { name: 'Сохранить решение' })).toHaveCount(0)
  await openDialog(page, 'p1-ru-009')
  await expect(page.getByTestId('head-score')).toHaveText(after)
  expect(after).not.toBe(original)
  await expect(page.getByText('Исходная авто-оценка')).toBeVisible()
})

test('чек-лист: новый критерий даёт девятиугольник, правка применяется', async ({ page }) => {
  await page.goto('/#/checklists')
  const preview = page.getByTestId('checklist-preview').locator('.octagon')
  await expect(preview).toHaveAttribute('data-vertices', '8')
  await page.getByRole('button', { name: 'Добавить критерий' }).click()
  await expect(preview).toHaveAttribute('data-vertices', '9')
  await screen(page, '06-checklist-preview')
  await page.getByRole('button', { name: 'Удалить критерий' }).click()
  await expect(preview).toHaveAttribute('data-vertices', '8')

  await page.locator('table.grid tbody tr', { hasText: 'Эмпатия' }).click()
  await page.getByLabel('Название').fill('Проактивность')
  await page.getByLabel('Описание').first().fill('Да: оператор сам предложил полезный следующий шаг.')
  const before = await api('/checklists/freedom-default')
  await page.getByRole('button', { name: `Сохранить как версию ${before.latest_version + 1}` }).click()
  await expect(page.getByText(/Сохранена версия/)).toBeVisible()
  const after = await api('/checklists/freedom-default')
  expect(after.latest_version).toBe(before.latest_version + 1)
  expect(after.missing_export_ids).toContain('empathy')
  const refused = await fetch(`${API}/export/results-json?set=dev&version=${after.latest_version}`)
  expect(refused.status).toBe(400)
  expect(await refused.text()).toContain('empathy')
  const fallback = await api('/export/results-json?set=dev')
  expect(fallback.problems).toEqual([])
  expect(fallback.document.results).toHaveLength(65)

  await page.getByRole('button', { name: 'Применить к диалогам' }).click()
  await expect(page.getByRole('heading', { name: 'Запуск оценки' })).toBeVisible()
  await page.getByRole('radio', { name: 'Выбранные' }).check()
  await page.getByLabel('ID диалогов через запятую').fill('p1-ru-002')
  await page.getByRole('button', { name: 'Запустить оценку' }).click()
  // Монеты показывают ожидание, по завершении останавливаются.
  await expect(page.locator('[data-coins]').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Завершена')).toBeVisible({ timeout: 180_000 })
  await expect(page.locator('.coin-host').first()).toHaveAttribute('data-coins-state', 'settled', { timeout: 60_000 })
  await screen(page, '07-run')
  const job = (await api('/jobs?limit=1'))[0]
  expect(job.errors).toBe(0)
  expect(job.params.version).toBe(after.latest_version)
  const card = await api('/conversations/p1-ru-002')
  expect(card.evaluation.signals.reused_criteria).toHaveLength(7)
  expect(card.evaluation.original.criteria.some((c: { title: string }) => c.title === 'Проактивность')).toBe(true)
})

test('правка веса не требует модели', async () => {
  const current = await api('/checklists/freedom-default')
  const patched = await (await fetch(`${API}/checklists/freedom-default/criteria/c7`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight: 10 }),
  })).json()
  expect(patched.version).toBe(current.latest_version + 1)
  expect(patched.weight_warning).toBeTruthy()
  const started = await (await fetch(`${API}/evaluations/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_ids: ['p1-ru-002'], version: patched.version, mode: 'ensemble', changed_only: true }),
  })).json()
  await expect.poll(async () => (await api(`/jobs/${started.job_id}`)).status).toBe('finished')
  expect((await api(`/jobs/${started.job_id}`)).cost_usd).toBe(0)
})

test('звонок: дорожки, выноски, дубли, маски Whisper', async ({ page }) => {
  await openDialog(page, 'p4-ru-003')
  await expect(page.locator('audio')).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('audio') as HTMLAudioElement)?.duration > 0, null, { timeout: 60_000 })
  await expect(page.locator('.lane')).toHaveCount(2)
  await expect(page.locator('.octagon.compact')).toBeVisible()
  await expect(page.getByTestId('lane-callout').first()).toBeVisible()
  await page.locator('.speech').waitFor()
  await screen(page, '03-call')
  await page.locator('.lane .mark').nth(3).click()
  await page.waitForTimeout(800)
  expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(5)
  await expect(page.locator('.turn.playing')).toHaveCount(1)
  await page.locator('audio').evaluate((a: HTMLAudioElement) => a.pause())

  await openDialog(page, 'p4-ru-001')
  await expect(page.locator('#turn-21 .dup')).toContainText('дубль распознавания #20')
  await expect(page.getByText('Расшифровка предоставлена организаторами')).toBeVisible()
  const whisper = await api('/conversations/p4-ru-001/whisper')
  if (whisper.status === 'ready') {
    await expect(page.locator('.whisper-line')).toHaveCount(0)
    await page.getByText('Показать текст Whisper').click()
    await expect(page.locator('#turn-19 .whisper-line')).toContainText('[')
  }
})

test('грубые нарушения', async ({ page }) => {
  await page.goto('/#/gross')
  await expect(page.locator('table.grid tbody tr').first()).toBeVisible()
  const data = await api('/conversations?gross=true')
  expect(await page.locator('table.grid tbody tr').count()).toBeGreaterThanOrEqual(data.total)
  await screen(page, '04-gross')
  await page.getByRole('button', { name: 'Открыть диалог' }).click()
  await expect(page).toHaveURL(/conversations/)
})

test('аналитика: плотность, карта, сдвиг версий', async ({ page }) => {
  await page.goto('/#/analytics')
  const density = page.getByTestId('density')
  await expect(density).toBeVisible({ timeout: 30_000 })
  await expect(density.locator('.chart-label', { hasText: 'медиана' })).toBeVisible()
  const map = page.getByTestId('dialog-map')
  await expect(map.locator('.map-point').first()).toBeVisible()
  await expect(map.getByTestId('etalon')).toHaveCount(1)
  await expect(page.getByTestId('kpi')).toContainText('65')
  await screen(page, '08-analytics')

  await map.getByRole('button', { name: 'Центры операторов' }).click()
  await expect(map.locator('ellipse').first()).toBeVisible()
  await map.getByRole('button', { name: 'Сдвиг версий' }).click()
  await expect(map.locator('line[marker-end], circle').first()).toBeVisible({ timeout: 30_000 })
  await map.getByRole('button', { name: 'Диалоги' }).click()

  const point = map.locator('.map-point').first()
  const id = await point.getAttribute('data-id')
  await point.dispatchEvent('click')
  await expect(page).toHaveURL(new RegExp(`conversations/${id}`))

  await page.goto('/#/analytics')
  // Полоса с данными: после правок чек-листа последняя версия содержит мало оценок.
  const band = density.locator('.band[tabindex="0"]').first()
  const from = Number(await band.getAttribute('data-from'))
  await band.hover()
  await expect(density.getByTestId('density-tip')).toContainText(`баллы ${from}..${from + 5}`)
  await band.click()
  await expect(page.getByTestId('score-filter')).toContainText(`баллы ${from}..${from + 5}`)
  await expect(page).toHaveURL(new RegExp(`score=${from}-${from + 5}`))
  await expect(page.locator('table.grid tbody tr').first()).toBeVisible()
})

test('правила дизайна: один акцент, радиусы вложенных, сетка отступов', async ({ page }) => {
  const accent = 'rgb(14, 107, 60)'
  for (const route of ['/#/', '/#/conversations/p1-ru-009', '/#/run', '/#/checklists', '/#/gross', '/#/analytics']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const primary = await page.locator('main button:visible').evaluateAll(
      (nodes, color) => nodes.filter((n) => getComputedStyle(n).backgroundColor === color && !n.closest('.segments')).length,
      accent,
    )
    expect(primary, `акцентных кнопок на ${route}`).toBeLessThanOrEqual(1)
  }
  await page.goto('/#/analytics')
  await page.getByTestId('dialog-map').waitFor()
  const radii = await page.evaluate(() => {
    const px = (v: string) => parseFloat(v) || 0
    const bad: string[] = []
    for (const card of document.querySelectorAll('.card.pad')) {
      const style = getComputedStyle(card)
      const outer = px(style.borderTopLeftRadius)
      const pad = px(style.paddingTop)
      for (const inner of card.querySelectorAll(':scope > .table-wrap, :scope > .stack > .table-wrap, :scope > .notice')) {
        const r = px(getComputedStyle(inner).borderTopLeftRadius)
        if (outer !== r + pad) bad.push(`${outer} != ${r} + ${pad}`)
      }
    }
    return bad
  })
  expect(radii).toEqual([])

  const css = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'app.css'), 'utf8')
  const allowed = new Set([0, 4, 8, 12, 16, 24, 32])
  const offenders = [...css.matchAll(/(?:^|[;{ ])(?:padding|margin|gap)(?:-[a-z-]+)?:\s*([^;}]+)/gm)]
    .flatMap((m) => [...m[1].matchAll(/(-?\d+)px/g)].map((n) => Math.abs(Number(n[1]))))
    .filter((value) => !allowed.has(value) && value > 2)
  expect(offenders).toEqual([])
})

const ROUTES = ['/#/', '/#/conversations/p1-ru-009', '/#/conversations/p4-ru-003', '/#/gross', '/#/run', '/#/checklists', '/#/appeals', '/#/analytics']

test('доступность: контраст AA и подписи на всех экранах', async ({ page }) => {
  const problems: string[] = []
  for (const route of ROUTES) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('canvas')
      // Служебные элементы фокуса Fluent UI, это не содержимое интерфейса.
      .exclude('[data-tabster-dummy]')
      .analyze()
    for (const violation of results.violations) {
      const samples = violation.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')
      problems.push(`${route} ${violation.id} (${violation.nodes.length}): ${samples}`)
    }
  }
  expect(problems).toEqual([])
})

test('ширина 1280: страница не ломается', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:8001' })
  const page = await context.newPage()
  for (const route of ROUTES) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `горизонтальная прокрутка на ${route}`).toBeLessThanOrEqual(0)
  }
  await context.close()
})
