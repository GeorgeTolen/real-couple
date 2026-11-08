// Содержимое слайдов. Цифры подставляются из data.ts (docs/pitch/data/*.json), текстом не дублируются.
// Движение привязано к шагам: data-s="N" появляется на шаге N, хуки step() запускают последовательности.
import { bench, criterion, facts, journey, modelName, node, num, research, researchItem, ROLE, short, step, usd, REPO_URL } from './data'
import type { Model } from './data'
import octagonUrl from './assets/octagon-ru-009.webp'
import callUrl from './assets/call-p4-ru-001.webp'
import demoGross from './assets/demo-gross.webp'
import demoChat from './assets/demo-chat.webp'
import demoChecklists from './assets/demo-checklists.webp'
import demoMap from './assets/demo-map.webp'
import qr from './assets/qr.json'
import { icons, nodeIcons } from './icons'
import { EASE_IO, EASE_OUT, EASE_SNAP, T, drawPath, flip, fmt, odometer, still, wait } from './motion'

export type Ctx = { instant: boolean; print: boolean }

export type Slide = {
  id: string
  label: string
  steps: number
  dark?: boolean
  reserve?: boolean
  /** Глава: перед слайдом проходит шторка с названием */
  chapter?: string
  cls: string
  html: () => string
  notes: string
  enter?: (el: HTMLElement, ctx: Ctx) => void
  step?: (el: HTMLElement, step: number, ctx: Ctx) => void
  leave?: (el: HTMLElement) => void
}

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
type P = [number, number]

/** Заголовок: обычные слова Unbounded, акцентное слово в <em> (Geologica, живые оси). */
const title = (text: string, accent?: string) => {
  const body = accent ? esc(text).replace(esc(accent), `<em>${esc(accent)}</em>`) : esc(text)
  return `<h2 class="title">${body}</h2>`
}

/** Ортогональный путь со скруглёнными углами. */
function rounded(points: P[], r = 14): string {
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const l1 = Math.hypot(x1 - x0, y1 - y0)
    const l2 = Math.hypot(x2 - x1, y2 - y1)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const ax = x1 - ((x1 - x0) / l1) * rr
    const ay = y1 - ((y1 - y0) / l1) * rr
    const bx = x1 + ((x2 - x1) / l2) * rr
    const by = y1 + ((y2 - y1) / l2) * rr
    d += ` L${ax} ${ay} Q${x1} ${y1} ${bx} ${by}`
  }
  const last = points[points.length - 1]
  return d + ` L${last[0]} ${last[1]}`
}
const pathLength = (points: P[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0)

const chevron = (id: string, color = 'context-stroke') =>
  `<marker id="${id}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M3 2 L10 6 L3 10" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></marker>`
const check = (size = 20, color = '#fff') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 6.8" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`

// Бегущая строка: коды и названия критериев из бенчмарка
const marquee = () => {
  const line = bench.criteria_difficulty.map((c) => `${c.id} ${c.name.toLowerCase()}`).join(' · ')
  return `<div class="marquee" aria-hidden="true"><div class="mq-track"><span>${line} · </span><span>${line} · </span></div></div>`
}
function startMarquee(el: HTMLElement): void {
  const track = el.querySelector<HTMLElement>('.mq-track')
  if (!track || track.dataset.on) return
  track.dataset.on = '1'
  const w = (track.firstElementChild as HTMLElement).offsetWidth
  track.style.setProperty('--mq-dur', `${(w / 40).toFixed(1)}s`)
}

// ---------------------------------------------------------------- 1. Титул
type Coins = { dispose: () => void; snapshot: () => string; tilt: (deg: number) => void }
let coinsControls: Coins | null = null

function staticCoins(): string {
  const items = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2
    return { i, x: 240 + Math.sin(angle) * 150, y: 116 + Math.cos(angle) * 44, scale: 0.72 + ((Math.cos(angle) + 1) / 2) * 0.5 }
  }).sort((a, b) => a.y - b.y)
  return `<svg viewBox="0 0 480 240" role="img" aria-label="Кольцо монет со знаком тенге">${items
    .map(
      ({ i, x, y, scale }) => `<g transform="translate(${x} ${y}) scale(${scale})">
      <ellipse rx="34" ry="34" cy="4" fill="#0b2c1d"/>
      <ellipse rx="34" ry="34" fill="${i % 2 ? '#138a4e' : '#106b3d'}" stroke="#a5c9ad" stroke-width="2"/>
      <ellipse rx="28" ry="28" fill="none" stroke="#a5c9ad" stroke-width="1"/>
      <text text-anchor="middle" dy="13" font-size="36" font-weight="700" fill="#d9ecdf">₸</text></g>`,
    )
    .join('')}</svg>`
}

function webglOk(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const sTitle: Slide = {
  id: 'title',
  label: 'Журнал контроля',
  steps: 2,
  dark: true,
  cls: 's-title',
  html: () => `
    <div class="coins" aria-hidden="true"></div>
    <div class="name">
      <h1 class="mega" data-sweep>Журнал контроля</h1>
      <span class="name-line"></span>
      <p class="lede mask" data-s="1">Контроль качества чатов и звонков Freedom Broker</p>
    </div>
    ${marquee()}`,
  notes:
    'Мы команда «Журнала контроля». Это система, которая оценивает каждый чат и звонок поддержки Freedom Broker по чек-листу и показывает, откуда взялась каждая оценка.',
  enter(el, ctx) {
    startMarquee(el)
    const host = el.querySelector<HTMLElement>('.coins')!
    if (host.dataset.mounted) return
    host.dataset.mounted = '1'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if ((reduced && !ctx.print) || !webglOk()) {
      host.innerHTML = staticCoins()
      host.dataset.ready = '1'
      return
    }
    import('./coins')
      .then(({ mountCoins }) => {
        coinsControls = mountCoins(host, { progress: 0, settled: false })
        host.dataset.ready = '1'
      })
      .catch(() => {
        host.innerHTML = staticCoins()
        host.dataset.ready = '1'
      })
  },
  step(el, n) {
    coinsControls?.tilt((n - 1) * 2.5)
    el.querySelector('.name')?.classList.toggle('lined', n >= 2)
  },
}

export function coinsPicture(): string {
  if (coinsControls) return `<img alt="" src="${coinsControls.snapshot()}">`
  return document.querySelector('.stage .s-title .coins img')?.outerHTML ?? staticCoins()
}

export function freezeCoins(): void {
  const host = document.querySelector<HTMLElement>('.stage .s-title .coins')
  if (!host || !coinsControls) return
  const url = coinsControls.snapshot()
  coinsControls.dispose()
  coinsControls = null
  host.innerHTML = `<img alt="" src="${url}">`
}

// ---------------------------------------------------------------- 2. Покрытие
const coverage = researchItem('coverage')
const HITS = [13, 46, 82]
const sCover: Slide = {
  id: 'cover',
  label: 'Каждый диалог, а не 3%',
  steps: 3,
  cls: 's-cover',
  html: () => {
    const tiles = Array.from({ length: 100 }, (_, i) => {
      const r = Math.floor(i / 10)
      const c = i % 10
      const x = 4 + c * 52
      const y = 4 + r * 52
      return `<g class="${HITS.includes(i) ? 'hit' : ''}" style="--d:${r + c}"><rect x="${x}" y="${y}" width="42" height="42" rx="11"/><path d="M${x + 12} ${y + 22} l6 6 l12 -13"/></g>`
    }).join('')
    return `
    ${title('Каждый диалог, а не 3%', 'Каждый')}
    <div class="body">
      <div class="cover-left">
        <svg class="tiles" viewBox="0 0 524 524" role="img" aria-label="100 диалогов, вручную проверяют 3">${tiles}</svg>
        <div class="swap">
          <div data-until="2"><div class="hero-n">2–3%</div><div class="hero-l">проверяют вручную</div><div class="src">${esc(coverage.source)}</div></div>
          <div data-s="2"><div class="hero-n" data-odo="100%" data-from="003%">100%</div><div class="hero-l">оцениваем мы</div><div class="src">${esc(coverage.applied)}</div></div>
        </div>
      </div>
      <div>
        <div class="card octa-card" data-s="2" style="transition-delay:.25s"><img src="${octagonUrl}" alt="Октагон качества диалога p1-ru-009: 8 критериев и итог 46,00"></div>
        <div class="octa-cap mask" data-s="3"><span class="ev">${check(22, '#0e6b3c')}</span>8 критериев, каждый с доказательством</div>
      </div>
    </div>`
  },
  notes:
    'Сегодня вручную успевают проверить два-три процента диалогов. Мы оцениваем все, по восьми критериям, и у каждого вывода есть номер реплики как доказательство.',
}

// ---------------------------------------------------------------- 3. Исследования: колода вырезок
type Clip = { site: string; title: string; by: string; where: string }
const QUOTES: { id: string; decision: string }[] = [
  { id: 'cot', decision: 'Сначала реплики и рассуждение, потом ответ' },
  { id: 'panel', decision: 'Судьи Gemini и GPT: два разных вендора' },
  { id: 'consistent_wrong', decision: 'Точность и стабильность меряем отдельно' },
  { id: 'facts', decision: 'Не выдумывать факты о продуктах Freedom' },
]
export const quoteSources = QUOTES
// Стопка в центре: смещение карточки из своей ячейки к центру сетки 2×2
const STACK = [
  { dx: 424, dy: 180, r: -2 },
  { dx: -424, dy: 180, r: 1.5 },
  { dx: 424, dy: -180, r: -1 },
  { dx: -424, dy: -180, r: 2 },
]

const sResearch: Slide = {
  id: 'research',
  label: 'На чём мы стоим',
  steps: 4,
  chapter: '01 Исследования',
  cls: 's-research',
  html: () => `
    ${title('На чём мы стоим', 'стоим')}
    <div class="body">
      ${QUOTES.map((entry, i) => {
        const item = researchItem(entry.id)
        const clip = (item as { clip?: Clip }).clip!
        const s = STACK[i]
        return `<div class="card quote-card custom" data-s="${i + 1}" style="--dx:${s.dx + i * 6}px;--dy:${s.dy + i * 6}px;--r:${s.r}deg;--z:${10 - i}">
          <figure class="clip">
            <div class="clip-meta"><span class="mono">${esc(clip.site)}</span><span>${esc(clip.where)}</span></div>
            <div class="clip-title">${esc(clip.title)}</div>
            <div class="clip-by">${esc(clip.by)}</div>
            <blockquote lang="en"><mark>${esc(item.quote ?? '')}</mark></blockquote>
          </figure>
          <div class="decision"><span class="ok">${check(20)}</span><span>${esc(entry.decision)}</span></div>
        </div>`
      }).join('')}
    </div>`,
  notes:
    'Мы не угадывали методику, а взяли приёмы из исследований про LLM-судей. Сначала рассуждение, потом вердикт; второй судья другого вендора; точность и стабильность меряем отдельно; с фактами о продуктах осторожно.',
}

// ---------------------------------------------------------------- 4. Турнир моделей
const SC = { W: 1120, H: 600, x0: 88, x1: 1100, y0: 56, y1: 520 }
const lmin = Math.log10(0.00015)
const lmax = Math.log10(0.05)
const SX = (v: number) => SC.x0 + ((Math.log10(v) - lmin) / (lmax - lmin)) * (SC.x1 - SC.x0)
const SY = (acc: number) => SC.y1 - ((acc - 55) / 45) * (SC.y1 - SC.y0)

function paretoFront(): Model[] {
  const sorted = [...bench.models].sort((a, b) => a.usd_per_dialog - b.usd_per_dialog || b.accuracy - a.accuracy)
  const front: Model[] = []
  let best = -1
  for (const model of sorted) {
    if (model.accuracy > best) {
      front.push(model)
      best = model.accuracy
    }
  }
  return front
}

type Tag = { model: Model; role: string; muted?: boolean; lift?: boolean; extra?: string; leader: (cx: number, cy: number) => P[]; at: (cx: number, cy: number) => { x: number; y: number; align: 'left' | 'right' | 'center' } }
const byRole = (role: string) => bench.models.find((m) => m.chosen === role)!
const opusModel = bench.models.find((m) => m.model === 'anthropic/claude-opus-5.5')!
const TAGS: Tag[] = [
  { model: byRole('judge_B'), role: ROLE.judge_B, lift: true, leader: (x, y) => [[x - 12, y - 12], [x - 40, y - 40], [x - 40, y - 64]], at: (x, y) => ({ x: x - 40, y: y - 64, align: 'right' }) },
  { model: byRole('judge_A'), role: ROLE.judge_A, lift: true, leader: (x, y) => [[x + 12, y - 12], [x + 30, y - 30], [x + 30, y - 72]], at: (x, y) => ({ x: x + 30, y: y - 72, align: 'left' }) },
  { model: byRole('arbiter'), role: ROLE.arbiter, lift: true, leader: (x, y) => [[x - 6, y + 16], [x - 24, y + 64]], at: (x, y) => ({ x: x - 24, y: y + 64, align: 'right' }) },
  { model: byRole('local_mode'), role: ROLE.local_mode, leader: (x, y) => [[x, y - 17], [x, y - 64]], at: (x, y) => ({ x: x - 36, y: y - 64, align: 'left' }) },
  { model: opusModel, role: 'Дороже всех', muted: true, extra: usd(opusModel.usd_per_dialog), leader: (x, y) => [[x, y + 17], [x, y + 140]], at: (x, y) => ({ x: x + 14, y: y + 140, align: 'right' }) },
]

function scatter(): string {
  const { x0, x1, y0, y1 } = SC
  const front = paretoFront()
  const frontIds = new Set(front.map((m) => m.model))
  const yTicks = [60, 70, 80, 90, 100]
  const xTicks = [0.0002, 0.001, 0.005, 0.02]
  const grid =
    yTicks.map((t, i) => `<line class="gl draw" data-s="1" pathLength="1" style="transition-delay:${i * 60}ms" x1="${x0}" x2="${x1}" y1="${SY(t)}" y2="${SY(t)}"/>`).join('') +
    xTicks.map((t, i) => `<line class="gl draw" data-s="1" pathLength="1" style="transition-delay:${200 + i * 60}ms" x1="${SX(t)}" x2="${SX(t)}" y1="${y1}" y2="${y0 - 8}"/>`).join('')
  const yLabels = yTicks.map((t) => `<text class="tick num" x="${x0 - 16}" y="${SY(t) + 6}" text-anchor="end">${t}</text>`).join('')
  const xLabels = xTicks.map((t) => `<text class="tick num" x="${SX(t)}" y="${y1 + 34}" text-anchor="middle">${usd(t)}</text>`).join('')

  const pts: P[] = []
  front.forEach((m, i) => {
    const x = SX(m.usd_per_dialog)
    const y = SY(m.accuracy)
    if (i > 0) pts.push([x, pts[pts.length - 1][1]])
    pts.push([x, y])
  })
  pts.push([x1, pts[pts.length - 1][1]])
  const stairs = 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')
  const area = stairs + ` L${x1} ${y1} L${pts[0][0].toFixed(1)} ${y1} Z`

  const byPrice = [...bench.models].sort((a, b) => a.usd_per_dialog - b.usd_per_dialog).map((m) => m.model)
  const lifted = new Set(TAGS.filter((t) => t.lift).map((t) => t.model.model))
  const dots = bench.models
    .map((m) => {
      const cx = SX(m.usd_per_dialog).toFixed(1)
      const cy = SY(m.accuracy).toFixed(1)
      const cls = `pt${frontIds.has(m.model) ? ' front-c' : ''}${lifted.has(m.model) ? ' lift' : ''}`
      return `<g class="pt-g" data-m="${m.model}" data-cx="${cx}" data-cy="${cy}"><circle class="${cls}" style="--i:${byPrice.indexOf(m.model)}" cx="${cx}" cy="${cy}" r="9"/></g>`
    })
    .join('')

  const rings = TAGS.map((t) => {
    const cx = SX(t.model.usd_per_dialog)
    const cy = SY(t.model.accuracy)
    const muted = t.muted ? ' muted' : ''
    return `<circle class="ring${muted}" cx="${cx}" cy="${cy}" r="17"/>${t.lift ? `<circle class="pulse" cx="${cx}" cy="${cy}" r="17"/>` : ''}<path class="leader${muted}" d="${rounded(t.leader(cx, cy), 10)}"/>`
  }).join('')

  return `<svg class="scatter" viewBox="0 0 ${SC.W} ${SC.H}" role="img" aria-label="Точность и цена 16 моделей">
    <defs><linearGradient id="paretoFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#138a4e" stop-opacity=".16"/><stop offset="1" stop-color="#138a4e" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${grid}</g>${yLabels}${xLabels}
    <text class="axis-t" x="${x0 - 16}" y="${y0 - 28}" text-anchor="end">точность, %</text>
    <text class="axis-t" x="${x1}" y="${y1 + 70}" text-anchor="end">цена за диалог, логарифмическая шкала</text>
    <path class="area custom" data-s="2" d="${area}" fill="url(#paretoFill)"/>
    <path class="stairs draw" data-s="2" pathLength="1" d="${stairs}"/>
    <g class="pts custom" data-s="1">${dots}</g>
    <g class="rings custom" data-s="3">${rings}</g>
  </svg>`
}

function tagsHtml(): string {
  return TAGS.map((t, i) => {
    const cx = SX(t.model.usd_per_dialog)
    const cy = SY(t.model.accuracy)
    const p = t.at(cx, cy)
    const shift = p.align === 'right' ? '-100%' : p.align === 'center' ? '-50%' : '0'
    const yShift = p.y < cy ? '-100%' : '0'
    return `<div class="tag${t.muted ? ' muted' : ''}" style="left:${p.x}px;top:${p.y}px;--tx:${shift};--ty:${yShift};--fx:${(cx - p.x) * 0.4}px;--fy:${(cy - p.y) * 0.4}px;transition-delay:${200 + i * 70}ms">
      <b>${esc(t.role)}</b><span>${modelName(t.model.model)}${t.extra ? ', ' + t.extra : ''}</span><em data-odo="${num(t.model.accuracy)}">${num(t.model.accuracy)}</em></div>`
  }).join('')
}

function magnet(el: HTMLElement): void {
  const chart = el.querySelector<HTMLElement>('.chart')
  if (!chart || chart.dataset.magnet) return
  chart.dataset.magnet = '1'
  const tip = document.createElement('div')
  tip.className = 'tip'
  chart.append(tip)
  const groups = [...chart.querySelectorAll<SVGGElement>('.pt-g')]
  let active: SVGGElement | null = null
  chart.addEventListener('pointermove', (ev) => {
    const box = chart.getBoundingClientRect()
    const k = box.width / SC.W
    const mx = (ev.clientX - box.left) / k
    const my = (ev.clientY - box.top) / k
    let best: SVGGElement | null = null
    let bd = 40
    for (const g of groups) {
      const d = Math.hypot(Number(g.dataset.cx) - mx, Number(g.dataset.cy) - my)
      if (d < bd) {
        bd = d
        best = g
      }
    }
    if (active && active !== best) active.style.transform = ''
    active = best
    if (!best) {
      tip.classList.remove('on')
      return
    }
    const cx = Number(best.dataset.cx)
    const cy = Number(best.dataset.cy)
    const pull = Math.min(6, bd) / (bd || 1)
    best.style.transform = `translate(${(mx - cx) * pull}px, ${(my - cy) * pull}px)`
    const m = bench.models.find((x) => x.model === best!.dataset.m)!
    tip.innerHTML = `<b>${modelName(m.model)}</b><span class="mono">${num(m.accuracy)}%</span><span class="mono">${usd(m.usd_per_dialog)}</span>`
    tip.style.left = `${cx}px`
    tip.style.top = `${cy - 24}px`
    tip.classList.add('on')
  })
  chart.addEventListener('pointerleave', () => {
    if (active) active.style.transform = ''
    tip.classList.remove('on')
  })
}

const sTour: Slide = {
  id: 'tournament',
  label: 'Модель выбрали турниром',
  steps: 3,
  chapter: '02 Турнир моделей',
  cls: 's-tour',
  html: () => {
    const top = [...bench.models].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5)
    return `
    ${title('Модель выбрали турниром', 'турниром')}
    <div class="body">
      <div class="chart">
        ${scatter()}
        <div class="tags custom" data-s="3">${tagsHtml()}</div>
        <div class="legend-row">
          <span><i style="width:14px;height:14px;border-radius:50%;background:var(--neutral)"></i>модель</span>
          <span data-s="2"><i style="width:28px;height:3px;background:var(--accent)"></i>граница Парето</span>
          <span data-s="3"><i style="width:22px;height:22px;border-radius:50%;border:2.5px solid var(--chrome)"></i>выбрана</span>
        </div>
        <div class="cap tour-cap">${bench.models.length} моделей на 12 DEV-чатах: 6 RU, 3 KZ, 3 EN, ручной эталон</div>
      </div>
      <div class="top5" data-s="1" style="transition-delay:.3s">
        <h3>Топ-5 по точности</h3>
        <div class="head"><span>Модель</span><span>Всего</span><span>KZ</span></div>
        <div class="rows">${top
          .map(
            (m) => `<div class="r${m.chosen ? ' chosen' : ''}"><div class="m">${modelName(m.model)}${m.chosen ? `<span class="role">${ROLE[m.chosen]}</span>` : ''}</div>
            <div class="v">${num(m.accuracy)}</div><div class="kz${m.kz === 100 ? ' full' : ''}">${m.kz}</div></div>`,
          )
          .join('')}</div>
      </div>
    </div>`
  },
  notes:
    'Модель выбирали на своём эталоне: двенадцать диалогов на трёх языках, шестнадцать моделей. Самая дорогая, Claude Opus, не самая точная: GPT-6.1 Sol и Gemini 3.8 Flash точнее и дешевле.',
  enter(el) {
    magnet(el)
  },
  step(el, n, ctx) {
    if (n === 3 && !ctx.instant) {
      el.querySelectorAll<SVGCircleElement>('.pulse').forEach((c, i) =>
        c.animate([{ opacity: 0.6, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.6)' }], { duration: T[4], delay: 150 + i * 90, easing: EASE_OUT }),
      )
    }
  },
}

// ---------------------------------------------------------------- 5. Архитектура
const NODE_W = 200
const NODE_H = 160
const COL = [124, 360, 596, 832, 1068, 1304, 1540]
const ROW = [130, 360, 590]
const POS: Record<string, P> = {
  api: [COL[0], ROW[0]], norm: [COL[0], ROW[1]], signals: [COL[0], ROW[2]],
  compile: [COL[1], ROW[1]],
  judgeA: [COL[2], ROW[0]], judgeB: [COL[2], ROW[2]],
  check: [COL[3], ROW[1]],
  arbiter: [COL[4], ROW[0]],
  score: [COL[5], ROW[1]],
  ui: [COL[6], ROW[0]], appeal: [COL[6], ROW[1]], export: [COL[6], ROW[2]],
}
const COLUMN_OF: Record<string, number> = { api: 0, norm: 0, signals: 0, compile: 1, judgeA: 2, judgeB: 2, check: 3, arbiter: 4, score: 5, ui: 6, appeal: 6, export: 6 }
const hw = NODE_W / 2
const hh = NODE_H / 2
const AI = new Set(['judgeA', 'judgeB', 'arbiter'])

function route(from: string, to: string): P[] {
  const [ax, ay] = POS[from]
  const [bx, by] = POS[to]
  const end = 3
  if (ax === bx) return ay < by ? [[ax, ay + hh], [bx, by - hh - end]] : [[ax, ay - hh], [bx, by + hh + end]]
  if (from === 'score' && to === 'ui') return [[ax, ay - hh], [ax, by], [bx - hw - end, by]]
  if (from === 'score' && to === 'export') return [[ax, ay + hh], [ax, by], [bx - hw - end, by]]
  if (from === 'appeal' && to === 'score') return [[ax - hw, ay], [bx + hw + end, by]]
  if (ay === by) return [[ax + hw, ay], [bx - hw - end, by]]
  const mid = (ax + hw + bx - hw) / 2
  return [[ax + hw, ay], [mid, ay], [mid, by], [bx - hw - end, by]]
}
/** Маршрут токена: тот же путь, но от центра узла к центру узла. */
function tokenPath(from: string, to: string): string {
  const pts = route(from, to)
  return rounded([POS[from], ...pts.slice(0, -1), POS[to]].filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]), 14)
}

function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word
    if (next.length > max && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

const HIGHLIGHT: Record<number, { nodes: string[]; edges: string[]; text: string }> = {
  2: { nodes: ['check', 'arbiter'], edges: ['check>arbiter', 'arbiter>score'], text: 'Арбитр только по спорным критериям' },
  3: { nodes: ['score', 'signals', 'norm'], edges: [], text: 'Факты и баллы считает код, а не модель' },
  4: { nodes: ['compile'], edges: ['compile>judgeA', 'compile>judgeB'], text: 'Чек-лист → промпт: новый критерий без кода' },
}

const BANDS = [
  { x: 8, w: 466, label: 'Готовит код', k: 'без LLM', ai: false },
  { x: 482, w: 700, label: 'Оценивают модели', k: 'LLM', ai: true },
  { x: 1190, w: 466, label: 'Итог считает код', k: 'без LLM', ai: false },
]
const NA = facts.na_example

function arch(): string {
  const bands = BANDS.map(
    (b) => `<g class="band-g"><rect class="band${b.ai ? ' ai' : ''}" x="${b.x}" y="0" width="${b.w}" height="690" rx="28"/>
      <text class="band-l${b.ai ? ' ai' : ''}" x="${b.x + 24}" y="34">${b.label}</text><text class="band-k" x="${b.x + b.w - 24}" y="34" text-anchor="end">${b.k}</text></g>`,
  ).join('')

  const edges = facts.architecture.edges
    .map(([from, to]) => {
      const pts = route(from, to)
      const col = from === 'appeal' ? 7 : Math.max(COLUMN_OF[from], COLUMN_OF[to])
      const id = `e-${from}-${to}`
      const len = pathLength(pts)
      const dur = Math.max(0.9, len / 160).toFixed(2)
      const packet = from === 'appeal' ? '' : `<circle class="packet" r="4"><animateMotion dur="${dur}s" begin="${(col * 0.35).toFixed(2)}s" repeatCount="indefinite" calcMode="linear"><mpath href="#${id}"/></animateMotion></circle>`
      return `<g class="edge-g" data-e="${from}>${to}"><path id="${id}" class="edge draw" data-s="1" pathLength="1" style="transition-delay:${col * 130 + 120}ms" marker-end="url(#ah)" d="${rounded(pts, 14)}"/><g class="packets">${packet}</g></g>`
    })
    .join('')

  const nodes = facts.architecture.nodes
    .map((entry) => {
      const [x, y] = POS[entry.id]
      const left = x - hw
      const top = y - hh
      const label = wrap(entry.label, 14)
      const sub = wrap(entry.sub, 20)
      const isAi = AI.has(entry.id)
      const letter = entry.id === 'judgeA' ? 'A' : entry.id === 'judgeB' ? 'B' : ''
      const glyph = letter
        ? `<text class="letter" x="${left + 36}" y="${top + 42}" text-anchor="middle">${letter}</text>`
        : `<g class="ico" transform="translate(${left + 24} ${top + 24})">${nodeIcons[entry.id]}</g>`
      const ly = top + 86
      return `<g class="node${isAi ? ' ai' : ''}" data-n="${entry.id}" data-s="1" style="transition-delay:${COLUMN_OF[entry.id] * 130}ms">
        <rect class="box" x="${left}" y="${top}" width="${NODE_W}" height="${NODE_H}" rx="18" filter="url(#soft)"/>
        <rect class="chipbg" x="${left + 16}" y="${top + 16}" width="40" height="40" rx="12"/>
        ${glyph}
        ${label.map((line, i) => `<text class="l" x="${left + 18}" y="${ly + i * 23}">${esc(line)}</text>`).join('')}
        ${sub.map((line, i) => `<text class="sub" x="${left + 18}" y="${ly + label.length * 23 + 2 + i * 19}">${esc(line)}</text>`).join('')}
      </g>`
    })
    .join('')

  const pill = (cls: string, text: string, x: number, y: number, el: string) => {
    const w = text.length * 8.6 + 28
    return `<g class="pill ${cls}" data-el="${el}" data-s="1" style="transition-delay:900ms"><rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="30" rx="15"/><text x="${x}" y="${y + 5}" text-anchor="middle">${text}</text></g>`
  }
  const midCheckArb = (POS.check[0] + hw + POS.arbiter[0] - hw) / 2

  return `<svg class="arch custom" viewBox="0 0 1664 690" role="img" aria-label="Схема: подготовка кодом, два судьи и арбитр, итог кодом, карточка, апелляция, экспорт">
    <defs>${chevron('ah')}
      <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0e3b27" flood-opacity=".09"/></filter>
    </defs>
    ${bands}${edges}${nodes}
    ${pill('warn', 'спор', midCheckArb, (ROW[0] + ROW[1]) / 2 + 10, 'check>arbiter')}
    ${pill('good', 'судьи согласны', COL[4], ROW[1] + 44, 'check>score')}
  </svg>`
}

// Токен диалога по конвейеру
let tokenRun = 0
function clearTokens(el: HTMLElement): void {
  tokenRun += 1
  el.querySelectorAll('.token').forEach((t) => {
    t.getAnimations().forEach((a) => a.cancel())
    t.remove()
  })
}
function makeToken(layer: HTMLElement, text: string, red = false): HTMLElement {
  const t = document.createElement('div')
  t.className = 'token' + (red ? ' red' : '')
  t.textContent = text
  layer.append(t)
  return t
}
function ride(t: HTMLElement, from: string, to: string, ms?: number): Promise<void> {
  const d = tokenPath(from, to)
  t.style.offsetPath = `path('${d}')`
  const dur = ms ?? 420
  const a = t.animate([{ offsetDistance: '0%' }, { offsetDistance: '100%' }], { duration: dur, easing: EASE_IO, fill: 'forwards' })
  return a.finished.then(() => undefined).catch(() => undefined)
}
function breathe(el: HTMLElement, id: string): void {
  const box = el.querySelector<SVGRectElement>(`[data-n="${id}"] .box`)
  box?.animate([{ strokeWidth: 1.5, stroke: 'var(--accent-glow)' }, { strokeWidth: 3, stroke: 'var(--accent-glow)' }, { strokeWidth: 1.5 }], { duration: 300, easing: EASE_IO })
}
function showScore(el: HTMLElement, instant: boolean): void {
  const badge = el.querySelector<HTMLElement>('.score-badge')!
  const v = badge.querySelector<HTMLElement>('em')!
  if (badge.classList.contains('on')) return
  badge.classList.add('on')
  if (instant) v.textContent = num(NA.total, 2)
  else void odometer(v, num(NA.total, 2), { from: '00,00' })
}
async function runToken(el: HTMLElement, dispute: boolean): Promise<void> {
  clearTokens(el)
  const run = tokenRun
  const layer = el.querySelector<HTMLElement>('.tokens')!
  const alive = () => run === tokenRun
  const id = NA.dialog.replace(/^p\d-/, '')
  const a = makeToken(layer, id)
  if (!dispute) {
    for (const [f, t] of [['api', 'norm'], ['norm', 'signals'], ['signals', 'compile']] as const) {
      await ride(a, f, t, 360)
      if (!alive()) return
    }
  } else {
    a.style.offsetPath = `path('${tokenPath('compile', 'judgeA')}')`
  }
  const b = makeToken(layer, id)
  await Promise.all([ride(a, 'compile', 'judgeA', 460), ride(b, 'compile', 'judgeB', 460)])
  if (!alive()) return
  breathe(el, 'judgeA')
  breathe(el, 'judgeB')
  await wait(220)
  await Promise.all([ride(a, 'judgeA', 'check', 460), ride(b, 'judgeB', 'check', 460)])
  if (!alive()) return
  b.remove()
  if (dispute) {
    const r = makeToken(layer, id, true)
    await Promise.all([ride(a, 'check', 'score', 700), (async () => {
      await ride(r, 'check', 'arbiter', 420)
      breathe(el, 'arbiter')
      await wait(200)
      await ride(r, 'arbiter', 'score', 420)
    })()])
    if (!alive()) return
    r.remove()
  } else {
    await ride(a, 'check', 'score', 640)
    if (!alive()) return
  }
  a.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.8)' }], { duration: T[1], fill: 'forwards' })
  showScore(el, false)
}

const sArch: Slide = {
  id: 'architecture',
  label: 'Два судьи и арбитр',
  steps: 4,
  chapter: '03 Конвейер оценки',
  cls: 's-arch',
  html: () => `
    ${title('Два судьи и арбитр', 'арбитр')}
    <div class="callouts">${[2, 3, 4].map((n) => `<div data-s="${n}" ${n < 4 ? `data-until="${n + 1}"` : ''}><span class="dot">${n - 1}</span>${esc(HIGHLIGHT[n].text)}</div>`).join('')}</div>
    <div class="body">
      ${arch()}
      <div class="tokens" aria-hidden="true"></div>
      <div class="score-badge" style="left:${POS.score[0] - hw}px;top:${POS.score[1] - hh - 52}px"><span class="mono">${esc(NA.dialog)}</span><em class="mono">${num(NA.total, 2)}</em></div>
    </div>`,
  notes:
    'Два судьи разных вендоров оценивают диалог независимо. Арбитр подключается только там, где они разошлись, поэтому это дешевле. Итоговые баллы считает код, а новый критерий из чек-листа сразу попадает в промпт, без программиста.',
  leave(el) {
    clearTokens(el)
    el.querySelector('.score-badge')?.classList.remove('on')
  },
  step(el, n, ctx) {
    const svg = el.querySelector('.arch')!
    const h = HIGHLIGHT[n]
    svg.classList.toggle('focus', Boolean(h))
    svg.querySelectorAll('.hl').forEach((item) => item.classList.remove('hl'))
    if (h) {
      h.nodes.forEach((id) => svg.querySelector(`[data-n="${id}"]`)?.classList.add('hl'))
      h.edges.forEach((id) => {
        svg.querySelector(`[data-e="${id}"]`)?.classList.add('hl')
        svg.querySelector(`[data-el="${id}"]`)?.classList.add('hl')
      })
    }
    if (ctx.instant) {
      clearTokens(el)
      showScore(el, true)
      return
    }
    if (n === 1) {
      el.querySelector('.score-badge')?.classList.remove('on')
      void wait(1300).then(() => runToken(el, false))
    } else if (n === 2) {
      el.querySelector('.score-badge')?.classList.remove('on')
      void runToken(el, true)
    } else {
      clearTokens(el)
      showScore(el, true)
    }
  },
}

// ---------------------------------------------------------------- 6. Сложность критериев: гонка-сортировка
const rulings = step('Официальные трактовки').what
const factsGist = researchItem('facts').gist_ru
const pick = (text: string, phrase: string) => {
  if (!text.includes(phrase)) throw new Error('нет фразы в данных: ' + phrase)
  return phrase
}
// Причины трудности: только формулировки из journey.json и research.json
const REASONS: Record<string, { text: string; src: string }> = {
  c7: { text: pick(rulings, 'только прощание = Нет'), src: 'трактовка Freedom' },
  c2: { text: pick(rulings, 'клиент сразу всё сказал = N/A'), src: 'трактовка Freedom' },
  c4: { text: pick(factsGist, 'Хуже всего модели оценивают фактическую правильность'), src: 'GER-Eval' },
}
const ranked = [...bench.criteria_difficulty].sort((a, b) => b.accuracy_all_models - a.accuracy_all_models)
const hardest = new Set(ranked.slice(-3).map((c) => c.id))

function setOrder(el: HTMLElement, sorted: boolean): void {
  el.querySelectorAll<HTMLElement>('.crow').forEach((row) => {
    row.style.order = sorted ? String(ranked.findIndex((c) => c.id === row.dataset.c)) : String(Number(row.dataset.c!.slice(1)) - 1)
  })
}

const sDiff: Slide = {
  id: 'difficulty',
  label: 'Где решается точность',
  steps: 3,
  cls: 's-diff',
  html: () => `
    ${title('Где решается точность', 'точность')}
    <div class="body">
      <div class="crows">
        ${bench.criteria_difficulty
          .map((c, i) => {
            const r = REASONS[c.id]
            return `<div class="crow${hardest.has(c.id) ? ' hard' : ''}" data-c="${c.id}" style="order:${i}">
              <span class="code mono">${c.id}</span><span class="cname">${c.name}</span>
              <span class="ctrack"><i class="cbar custom" data-s="1" style="--w:${c.accuracy_all_models / 100};transition-delay:${i * 60}ms"></i></span>
              <span class="cval mono">${num(c.accuracy_all_models)}</span>
              ${r ? `<span class="reason" data-s="3"><b>трудно</b><span>${esc(r.text)}<i class="mono">${esc(r.src)}</i></span></span>` : '<span></span>'}
            </div>`
          })
          .join('')}
      </div>
      <div class="cap diff-cap">Совпадение с эталоном по критерию, все ${bench.models.length} моделей, %</div>
    </div>`,
  notes:
    'Труднее всего моделям даются «Завершение», «Консультация» и «Потребность», около семидесяти процентов у всех моделей. Именно там помогли официальные трактовки Freedom и осторожность с фактами о продуктах.',
  step(el, n, ctx) {
    const rows = [...el.querySelectorAll<HTMLElement>('.crow')]
    const want = n >= 2
    const sorted = el.dataset.sorted === '1'
    if (want === sorted) return
    el.dataset.sorted = want ? '1' : ''
    if (ctx.instant) setOrder(el, want)
    else flip(rows, () => setOrder(el, want), { duration: T[3], easing: EASE_IO, stagger: 20 })
  },
  leave(el) {
    el.dataset.sorted = ''
    setOrder(el, false)
  },
}

// ---------------------------------------------------------------- 7. Что подкрутили (шкала времени)
const pilot = step('Пилот нашёл нестабильность')
const fix = step('Исправление стабильности')
const calib = step('Калибровка подсказок')
const flags = step('Тише флаги, чище данные')
const minutes = (t: string) => {
  const [h, m] = t.slice(6).split(':').map(Number)
  return h * 60 + m
}
const SPAN = 100
type TL = { t: string; point: number; bad: boolean; metric: string; chip: [string, string]; h: string; p: string }
const strike = (oldV: string, newV: string, cls: string) =>
  `<span class="metric ${cls}"><span class="old">${oldV}</span><span class="new" data-odo="${newV}" data-from="${oldV.padStart(newV.length, '0').slice(-newV.length)}">${newV}</span></span>`
const TLS: TL[] = [
  { t: pilot.t, point: 0, bad: true, metric: strike(num(pilot.metric!.before!, 2), num(pilot.metric!.after!, 2), 'bad'), chip: ['bad', 'сбой'], h: 'Повтор дал другой итог', p: 'p1-en-006: одна ступень «Ведения диалога», арбитр выбирал по-разному.' },
  { t: fix.t, point: 1, bad: false, metric: '<span class="metric small good" data-sweep>нет сбоя, нет снижения</span>', chip: ['good', 'правило'], h: 'Снижение только с номером реплики', p: 'Кеш результата и сравнение при пересчёте: повтор даёт ту же оценку.' },
  { t: calib.t, point: 2, bad: true, metric: `<span class="metric bad"><span class="new" data-odo="${num(calib.metric!.v4_mae!, 2)}">${num(calib.metric!.v4_mae!, 2)}</span></span>`, chip: ['bad', 'не прошла'], h: 'Версия 4: ошибка итога выше порога', p: 'Подсказки этой версии в работу не пошли.' },
  { t: calib.t, point: 2, bad: false, metric: `<span class="metric good"><span class="new" data-odo="${num(calib.metric!.v5_accuracy!, 2)}%">${num(calib.metric!.v5_accuracy!, 2)}%</span></span>`, chip: ['good', 'прошла'], h: 'Версия 5: три правила для «Консультации»', p: `Ошибка итога ${num(calib.metric!.v5_mae!, 2)}.` },
  { t: flags.t, point: 3, bad: false, metric: strike(String(flags.metric!.review_before), String(flags.metric!.review_after), 'good'), chip: ['good', 'тише'], h: 'Флаг «На проверку» только при реальном споре', p: `Из ${facts.headline.dialogs_dev} диалогов DEV.` },
]
const POINTS = [
  { t: pilot.t, n: 'Пилот' },
  { t: fix.t, n: 'Правило и кеш' },
  { t: calib.t, n: 'Версии 4 и 5' },
  { t: flags.t, n: 'Флаги' },
]
const pos = (t: string) => `calc(64px + (100% - 128px) * ${minutes(t) / SPAN})`

const sJourney: Slide = {
  id: 'journey',
  label: 'Что мы подкрутили',
  steps: TLS.length,
  cls: 's-journey',
  html: () => {
    const ticks = Array.from({ length: SPAN / 5 + 1 }, (_, i) => i * 5)
      .map((m) => `<i class="tk${m % 30 === 0 ? ' big' : ''}" style="left:calc(64px + (100% - 128px) * ${m / SPAN})"></i>${m % 30 === 0 ? `<span class="tl" style="left:calc(64px + (100% - 128px) * ${m / SPAN})">${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}</span>` : ''}`)
      .join('')
    return `
    ${title('Что мы подкрутили', 'подкрутили')}
    <div class="body">
      <div class="panel-area">${TLS.map(
        (item, i) => `<div class="tl-panel" data-s="${i + 1}" ${i < TLS.length - 1 ? `data-until="${i + 2}"` : ''}>
          <div class="mwrap">${item.metric}</div>
          <div class="txt"><span class="chip ${item.chip[0]}">${item.chip[1]}</span><h3>${esc(item.h)}</h3><p>${esc(item.p)}</p></div>
        </div>`,
      ).join('')}</div>
      <div class="ruler">
        <span class="day mono">${pilot.t.slice(0, 5)}, ночь</span>
        <div class="track"><div class="fill"></div></div>
        ${ticks}
        ${POINTS.map((p, k) => `<div class="pt" data-k="${k}" style="left:${pos(p.t)}"><div class="t">${p.t.slice(6)}</div><div class="dot"></div><div class="n">${esc(p.n)}</div></div>`).join('')}
        <div class="knob"></div>
      </div>
    </div>`
  },
  notes:
    'Пилот показал, что повтор даёт другой итог: 85 и 80,5. Мы добавили кеш и правило: нет сбоя, нет снижения. Четвёртая версия подсказок не прошла порог, пятая дала 98,85 процента, а флагов на проверку стало 1 вместо 28.',
  step(el, n) {
    const cur = TLS[n - 1]
    const knob = el.querySelector<HTMLElement>('.knob')!
    knob.style.left = pos(cur.t)
    knob.classList.toggle('bad', cur.bad)
    el.querySelector<HTMLElement>('.fill')!.style.transform = `scaleX(${minutes(cur.t) / SPAN})`
    el.querySelectorAll<HTMLElement>('.ruler .pt').forEach((pt) => {
      const k = Number(pt.dataset.k)
      pt.classList.toggle('done', k <= cur.point)
      pt.classList.toggle('cur', k === cur.point)
      const last = TLS.filter((item, i) => i < n && item.point === k).pop()
      pt.classList.toggle('bad', Boolean(last?.bad))
    })
  },
}

// ---------------------------------------------------------------- 8. Демо
// Фокус: доля ширины и высоты кадра; курсор едет к точке клика
const DEMO = [
  { text: 'Грубые нарушения', img: demoGross, url: '/gross', focus: [0.62, 0.16, 0.365, 0.32], click: [0.675, 0.452] },
  { text: 'Карточка <span class="mono">p1-ru-009</span>', img: demoChat, url: '/dialogs/p1-ru-009', focus: [0.585, 0.295, 0.395, 0.27], click: [0.926, 0.43] },
  { text: 'Апелляция', img: demoChat, url: '/dialogs/p1-ru-009', focus: [0.612, 0.085, 0.137, 0.048], click: [0.68, 0.108] },
  { text: 'Новый критерий и вес', img: demoChecklists, url: '/checklists', focus: [0.212, 0.13, 0.538, 0.505], click: [0.68, 0.615] },
  { text: 'Карта диалогов', img: demoMap, url: '/analytics', focus: [0.598, 0.35, 0.385, 0.52], click: [0.965, 0.453] },
]
const sDemo: Slide = {
  id: 'demo',
  label: 'Демо',
  steps: DEMO.length,
  dark: true,
  cls: 's-demo',
  html: () => `
    <h2 class="title">Демо</h2>
    <ol class="demo-list">${DEMO.map((item, i) => `<li data-s="${i + 1}"><span class="i">${i + 1}</span><span>${item.text}</span></li>`).join('')}</ol>
    <div class="window">
      <div class="wbar"><span class="mono url">localhost:8000<b>${DEMO[0].url}</b></span></div>
      <div class="wview">
        ${DEMO.map((d, i) => `<div class="shot" data-k="${i}"><img src="${d.img}" alt=""><svg class="focus" viewBox="0 0 1000 625" preserveAspectRatio="none"><rect x="${d.focus[0] * 1000}" y="${d.focus[1] * 625}" width="${d.focus[2] * 1000}" height="${d.focus[3] * 625}" rx="10" pathLength="1"/></svg></div>`).join('')}
        <svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.6L10 19z" fill="#1c1f1d" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      </div>
    </div>`,
  notes: 'Переключаемся в приложение. Идём по порядку на экране, сверху вниз.',
  step(el, n, ctx) {
    const d = DEMO[n - 1]
    el.querySelector<HTMLElement>('.url b')!.textContent = d.url
    el.querySelectorAll<HTMLElement>('.demo-list li').forEach((li, i) => li.classList.toggle('cur', i === n - 1))
    const shots = [...el.querySelectorAll<HTMLElement>('.shot')]
    shots.forEach((s, i) => s.classList.toggle('show', i === n - 1))
    const shot = shots[n - 1]
    const img = shot.querySelector('img')!
    const rect = shot.querySelector<SVGRectElement>('.focus rect')!
    const cursor = el.querySelector<SVGElement>('.cursor')!
    const view = el.querySelector<HTMLElement>('.wview')!
    const cx = d.click[0] * view.offsetWidth
    const cy = d.click[1] * view.offsetHeight
    img.style.transformOrigin = `${(d.focus[0] + d.focus[2] / 2) * 100}% ${(d.focus[1] + d.focus[3] / 2) * 100}%`
    img.getAnimations().forEach((a) => a.cancel())
    if (ctx.instant) {
      cursor.style.transform = `translate(${cx}px, ${cy}px)`
      rect.style.strokeDashoffset = '0'
      img.style.transform = 'scale(1.03)'
      return
    }
    img.style.transform = ''
    img.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }], { duration: 5000, easing: 'linear', fill: 'forwards' })
    rect.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: T[3], delay: 350, easing: EASE_IO, fill: 'both' })
    const from = cursor.style.transform || `translate(${view.offsetWidth * 0.5}px, ${view.offsetHeight * 0.9}px)`
    cursor.style.transform = `translate(${cx}px, ${cy}px)`
    cursor.animate([{ transform: from }, { transform: `translate(${cx}px, ${cy}px)` }], { duration: T[3] + 200, delay: 200, easing: EASE_IO, fill: 'backwards' })
  },
}

// ---------------------------------------------------------------- 9. Результат и роза весов N/A
const H = facts.headline
const holdout = H.holdout_note.match(/(\d+) из (\d+)/)!
const hitN = Number(holdout[1])
const allN = Number(holdout[2])

type Sector = { name: string; w: number; answer: string; earned: number }
const SECTORS: Sector[] = (Object.keys(NA.weights) as (keyof typeof NA.weights)[]).map((name) => {
  const answer = NA.answers[name]
  const w = NA.weights[name]
  const earned = answer === 'Да' ? w : answer === 'Нет' || answer === 'N/A' ? 0 : w * (Number(answer.split(' из ')[0]) / Number(answer.split(' из ')[1]))
  return { name, w, answer, earned }
})

const RC = 290 // центр розы
const RR = 230 // радиус
function sectorPath(a0: number, a1: number, r: number): string {
  if (a1 - a0 < 0.0005) return ''
  const p = (a: number, rr: number) => `${(RC + Math.sin(a) * rr).toFixed(2)} ${(RC - Math.cos(a) * rr).toFixed(2)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${RC} ${RC} L${p(a0, r)} A${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`
}
/** t = 0: веса из 100, t = 1: N/A исключены, остальные делят 360°. */
function roseFrame(svg: SVGSVGElement, t: number, grow = 1): void {
  const total = SECTORS.reduce((s, x) => s + (x.answer === 'N/A' ? x.w * (1 - t) : x.w), 0)
  let a = 0
  const gap = 0.012
  SECTORS.forEach((s, i) => {
    const w = s.answer === 'N/A' ? s.w * (1 - t) : s.w
    const span = (w / total) * Math.PI * 2
    const a0 = a + gap / 2
    const a1 = a + span - gap / 2
    const g = svg.querySelector<SVGGElement>(`[data-sec="${i}"]`)!
    const base = g.querySelector<SVGPathElement>('.sb')!
    const fill = g.querySelector<SVGPathElement>('.sf')!
    base.setAttribute('d', sectorPath(a0, a1, RR * grow))
    fill.setAttribute('d', sectorPath(a0, a1, RR * grow * (s.w ? s.earned / s.w : 0)))
    const mid = a + span / 2
    const lab = g.querySelector<SVGTextElement>('text')!
    lab.setAttribute('x', (RC + Math.sin(mid) * (RR + 34)).toFixed(1))
    lab.setAttribute('y', (RC - Math.cos(mid) * (RR + 34) + 6).toFixed(1))
    lab.setAttribute('text-anchor', Math.abs(Math.sin(mid)) < 0.2 ? 'middle' : Math.sin(mid) > 0 ? 'start' : 'end')
    lab.style.opacity = String(s.answer === 'N/A' ? Math.max(0, 1 - t * 2) : 1)
    a += span
  })
}
function tween(ms: number, fn: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 // ease-in-out cubic
      fn(e)
      if (t < 1) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
}
let roseRun = 0
async function playRose(el: HTMLElement, instant: boolean): Promise<void> {
  roseRun += 1
  const run = roseRun
  const svg = el.querySelector<SVGSVGElement>('.rose')!
  const total = el.querySelector<HTMLElement>('.rose-total')!
  const note = el.querySelector<HTMLElement>('.rose-note')!
  if (instant) {
    roseFrame(svg, 1)
    svg.classList.add('na-done')
    total.textContent = num(NA.total, 2)
    note.classList.add('on')
    return
  }
  svg.classList.remove('na-done')
  note.classList.remove('on')
  total.textContent = fmt(NA.if_na_were_zero, 2)
  roseFrame(svg, 0, 0)
  await tween(T[4], (t) => roseFrame(svg, 0, t))
  if (run !== roseRun) return
  svg.classList.add('na-grey')
  await wait(500)
  if (run !== roseRun) return
  svg.classList.add('na-done')
  void odometer(total, num(NA.total, 2), { from: fmt(NA.if_na_were_zero, 2), duration: T[4] + 200 })
  await tween(T[4] + 200, (t) => roseFrame(svg, t))
  note.classList.add('on')
}

function roseSvg(): string {
  const secs = SECTORS.map(
    (s, i) => `<g data-sec="${i}" class="sec ${s.answer === 'N/A' ? 'na' : s.answer === 'Нет' ? 'no' : 'yes'}"><path class="sb"/><path class="sf"/><text>${esc(s.name)} <tspan class="num">${s.w}</tspan></text></g>`,
  ).join('')
  return `<svg class="rose" viewBox="-60 -20 700 620" role="img" aria-label="Веса критериев диалога ${NA.dialog}: N/A исключены, итог ${num(NA.total, 2)}">
    <circle cx="${RC}" cy="${RC}" r="${RR}" class="rose-ring"/>${secs}<circle cx="${RC}" cy="${RC}" r="122" class="rose-hole"/></svg>`
}

const sResult: Slide = {
  id: 'result',
  label: 'Результат на новых данных',
  steps: 5,
  chapter: '04 Результат',
  cls: 's-result',
  html: () => {
    const oursW = (H.usd_per_dialog / opusModel.usd_per_dialog) * 100
    return `
    ${title('Результат на новых данных', 'новых')}
    <div class="body">
      <div class="hero-grid">
        <div class="card hc" data-s="1"><div class="hl">точность на 10 новых чатах</div><div class="hv" data-odo="${num(H.holdout_accuracy_pct)}%">${num(H.holdout_accuracy_pct)}%</div>
          <div class="waffle">${Array.from({ length: allN }, (_, i) => `<i class="${i >= hitN ? 'no' : ''}" style="--i:${i}"></i>`).join('')}</div>
          <div class="hn">${hitN} из ${allN} ответов, эталон до прогона</div></div>
        <div class="card hc" data-s="2"><div class="hl">ошибка итога на них же</div><div class="hv" data-odo="${num(H.holdout_mae_points, 2)}">${num(H.holdout_mae_points, 2)}</div>
          <div class="scale"><i style="left:${H.holdout_mae_points * 10}%"></i><span>0</span><span>10 баллов</span></div>
          <div class="hn">средняя разница с эталоном, из 100</div></div>
        <div class="card hc" data-s="3"><div class="hl">стабильность повтора</div><div class="hv" data-odo="${short(H.stability_pct).replace(',0', '')}%">${H.stability_pct}%</div>
          <div class="meter"><i style="--w:${H.stability_pct / 100}"></i></div>
          <div class="hn">повтор даёт тот же ответ</div></div>
        <div class="card hc" data-s="4"><div class="hl">цена за диалог</div><div class="hv" data-odo="${usd(H.usd_per_dialog)}">${usd(H.usd_per_dialog)}</div>
          <div class="cmp"><span>наш ансамбль</span><span class="bt"><i class="b" style="--w:${oursW / 100}"></i></span>
          <span>${modelName(opusModel.model)}</span><span class="bt"><i class="b other" style="--w:1"></i></span></div>
          <div class="hn">${modelName(opusModel.model)}: ${usd(opusModel.usd_per_dialog)}</div></div>
      </div>
      <div class="rose-wrap custom" data-s="5">
        <div class="rose-head"><b>Почему N/A не ноль</b><span class="chip src-chip">${esc(NA.dialog)}</span></div>
        ${roseSvg()}
        <div class="rose-center"><div class="rose-total">${num(NA.total, 2)}</div><div class="rose-sub">итог</div></div>
        <div class="rose-note"><s class="mono">${short(NA.if_na_were_zero)}</s> если считать N/A нулём. Вес ${SECTORS.filter((s) => s.answer === 'N/A').map((s) => `«${s.name}»`).join(' и ')} делят остальные</div>
      </div>
      <div class="facts-row" data-s="5" style="transition-delay:.2s">
        <div><b>${H.dialogs_dev}</b> диалогов DEV</div>
        <div><b>${H.languages.join(' ')}</b></div>
        <div><b>${H.tests_backend}</b> тестов</div>
      </div>
    </div>`
  },
  notes:
    'На десяти новых чатах 97,2 процента, эталон зафиксировали до прогона; честно, чаты писали мы сами. Повтор совпадает на 99 процентов, диалог стоит два цента. И главное: N/A не ноль, вес делят остальные критерии, поэтому 92,31, а не 60.',
  step(el, n, ctx) {
    if (n === 5) void playRose(el, ctx.instant)
    else roseRun += 1
  },
  leave() {
    roseRun += 1
  },
}

// ---------------------------------------------------------------- 10. Что сделали сами: плитки-перевёртыши
const OURS = [
  { i: 0, icon: 'bench', text: 'Свой бенчмарк на 16 моделях' },
  { i: 1, icon: 'judges', text: 'Два судьи и арбитр' },
  { i: 2, icon: 'checklist', text: 'Новый критерий без кода' },
  { i: 3, icon: 'shield', text: 'Нет сбоя, нет снижения' },
  { i: 5, icon: 'lock', text: 'Эталон размечен до прогона' },
  { i: 7, icon: 'wave', text: 'Звонки: маски и локальный Whisper' },
]
export const oursCaptions = OURS

const sOurs: Slide = {
  id: 'ours',
  label: 'Что сделали сами',
  steps: OURS.length,
  chapter: '05 Что сделали сами',
  cls: 's-ours',
  html: () => `
    ${title('Что сделали сами', 'сами')}
    <div class="body"><div class="ours">${OURS.map(
      (item, k) => `<div class="flip custom" data-s="${k + 1}"><div class="fi">
        <div class="ff"><div class="ic">${icons[item.icon]}</div><p>${esc(item.text)}</p></div>
        <div class="fb"><div class="ic sm">${icons[item.icon]}</div><b>${esc(item.text)}</b><span>${esc(facts.ours[item.i])}</span></div>
      </div></div>`,
    ).join('')}</div></div>`,
  notes:
    'Отличие от «просто GPT с чек-листом» в инженерии вокруг модели: свой бенчмарк, два судьи и арбитр, правило против случайных снижений, честная контрольная выборка и звонки с масками данных.',
  enter(el, ctx) {
    if (ctx.instant) return
    el.querySelectorAll<SVGGeometryElement>('.ff .ic svg path, .ff .ic svg rect, .ff .ic svg circle').forEach((p, i) => {
      if (p.getAttribute('stroke') === 'none') return
      drawPath(p, T[3], 200 + i * 25)
    })
  },
}

// ---------------------------------------------------------------- 11. Что дальше
function qrSvg(): string {
  const n = qr.size
  let cells = ''
  for (let r = 0; r < n; r += 1)
    for (let c = 0; c < n; c += 1) if (qr.bits[r * n + c] === '1') cells += `<rect x="${c}" y="${r}" width="1.04" height="1.04" style="--d:${r + c}"/>`
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR: ${REPO_URL}">${cells}</svg>`
}

const sNext: Slide = {
  id: 'next',
  label: 'Что дальше',
  steps: 4,
  dark: true,
  cls: 's-next',
  html: () => `
    ${title('Что дальше', 'дальше')}
    <div class="next">
      <div class="mask" data-s="1"><span class="ic">${icons.book}</span><div><b>Справочник продуктов Freedom</b><span>чтобы «Консультация» проверяла факты, а не только логику</span></div></div>
      <div class="mask" data-s="2"><span class="ic">${icons.tracks}</span><div><b>ASR и диаризация для звонков</b><span>две настоящие дорожки вместо восстановленных по транскрипту</span></div></div>
      <div class="mask" data-s="3"><span class="ic">${icons.crm}</span><div><b>Компонент Dynamics 365</b><span>оценка прямо в карточке обращения</span></div></div>
    </div>
    <div class="qr custom" data-s="4"><div class="tile">${qrSvg()}</div><div class="url">${REPO_URL.replace('https://', '')}</div></div>
    <div class="thanks" data-s="4" style="transition-delay:.4s">Спасибо</div>
    ${marquee()}`,
  notes:
    'Дальше: справочник продуктов Freedom, чтобы проверять факты в консультациях, распознавание и разделение дорожек для звонков и встраивание в Dynamics 365. Код открыт, QR на экране. Спасибо!',
  enter(el) {
    startMarquee(el)
  },
}

// ---------------------------------------------------------------- Резерв
const reserveTag = '<div class="reserve-tag"><span class="chip">резерв</span></div>'

const rCall: Slide = {
  id: 'r1-calls',
  label: 'R1 Звонки',
  steps: 2,
  reserve: true,
  cls: 'r-call',
  html: () => `
    ${reserveTag}
    ${title('Звонки: две дорожки и маски')}
    <div class="body">
      <div class="card shot-r" data-s="1"><img src="${callUrl}" alt="Карточка звонка p4-ru-001: дорожки клиента и оператора, метрики речи, октагон"></div>
      <div class="stack3">
        <div data-s="2"><b>Две дорожки</b><span>запись одноканальная, дорожки построены по транскрипту</span></div>
        <div data-s="2" style="transition-delay:.15s"><b>Метрики речи</b><span>темп, паузы, перебивания, доля речи по меткам времени</span></div>
        <div data-s="2" style="transition-delay:.3s"><b>Маски данных</b><span>дубли ASR убраны, персональные данные скрыты, Whisper локально</span></div>
      </div>
    </div>`,
  notes:
    'Звонки: запись одноканальная, поэтому дорожки строим по транскрипту. Метрики речи считаем по меткам времени, персональные данные маскируем, Whisper работает локально.',
}

function localBars(): string {
  const rows = bench.models.filter((m) => m.fits_8gb_laptop).sort((a, b) => b.accuracy - a.accuracy)
  const leader = [...bench.models].sort((a, b) => b.accuracy - a.accuracy)[0]
  const x0 = 260
  const x1 = 940
  const X = (v: number) => x0 + (v / 100) * (x1 - x0)
  const rowH = 84
  const body = rows
    .map((m, i) => {
      const y = 24 + i * rowH
      const pick = m.chosen === 'local_mode'
      return `<text x="${x0 - 24}" y="${y + 27}" text-anchor="end" font-size="23" fill="var(--text)" ${pick ? 'font-weight="700"' : 'font-weight="500"'}>${modelName(m.model)}</text>
        <rect x="${x0}" y="${y}" width="${x1 - x0}" height="38" rx="19" fill="var(--bg-2)"/>
        <rect x="${x0}" y="${y}" width="${X(m.accuracy) - x0}" height="38" rx="19" fill="${pick ? 'var(--accent)' : 'var(--neutral)'}"/>
        <text class="num" x="${x1 + 20}" y="${y + 27}" font-size="22" font-weight="600" fill="var(--text)">${num(m.accuracy)}</text>`
    })
    .join('')
  const h = 24 + rows.length * rowH
  return `<svg viewBox="0 0 1060 ${h + 64}" style="width:100%;display:block;overflow:visible" role="img" aria-label="Точность локальных моделей">
    ${body}
    <line class="ref" x1="${X(leader.accuracy)}" x2="${X(leader.accuracy)}" y1="8" y2="${h}"/>
    <text x="${X(leader.accuracy)}" y="${h + 32}" text-anchor="middle" font-size="19" font-weight="600" fill="var(--accent-dark)">облачный лидер <tspan class="num">${num(leader.accuracy)}</tspan></text>
  </svg>`
}

const gemma = bench.models.find((m) => m.chosen === 'local_mode')!
const rLocal: Slide = {
  id: 'r2-local',
  label: 'R2 Локальный режим',
  steps: 2,
  reserve: true,
  cls: 'r-local',
  html: () => `
    ${reserveTag}
    ${title('Локальный режим')}
    <div class="body local">
      <div data-s="1">${localBars()}<div class="cap">Модели, которые помещаются в ноутбук с 8 ГБ видеопамяти, точность на тех же 12 DEV-чатах, %</div></div>
      <div class="stack3">
        <div data-s="2"><b>${esc(facts.architecture.local_mode)}</b><span>Данные не покидают компьютер</span></div>
        <div data-s="2" style="transition-delay:.15s"><b>Честная точность: <span class="mono">${num(gemma.accuracy)}%</span></b><span>Грубые нарушения: найдено ${gemma.gross_found.replace('/', ' из ')}, <span class="mono">${usd(gemma.usd_per_dialog)}</span> за диалог через OpenRouter</span></div>
      </div>
    </div>`,
  notes:
    'Локальный режим: тот же код, судья Gemma 4 26B-A4B через Ollama. Помещается в ноутбук с 8 ГБ видеопамяти, но точность 83,9 против 97,7 у облачного лидера, это честная цена приватности.',
}

const rTable: Slide = {
  id: 'r3-table',
  label: 'R3 Все 16 моделей',
  steps: 2,
  reserve: true,
  cls: 'r-table',
  html: () => `
    ${reserveTag}
    ${title(`Все ${bench.models.length} моделей`)}
    <div class="body" style="top:232px;bottom:104px" data-s="1">
      <table class="full">
        <thead><tr><th>Модель</th><th class="n">Точность</th><th class="n">RU</th><th class="n">KZ</th><th class="n">EN</th><th class="n">Грубые</th><th class="n">Ошибка итога</th><th class="n">$ за диалог</th><th class="n">с на диалог</th><th class="n">Открытые веса</th><th>Роль</th></tr></thead>
        <tbody>${bench.models
          .map(
            (m) => `<tr class="${m.chosen ? 'chosen' : ''}"><td>${modelName(m.model)}</td><td class="n">${num(m.accuracy)}</td><td class="n">${m.ru}</td><td class="n">${m.kz}</td><td class="n">${m.en}</td><td class="n">${m.gross_found}</td><td class="n">${num(m.mae_total, 2)}</td><td class="n">${short(m.usd_per_dialog)}</td><td class="n">${short(m.sec_per_dialog)}</td><td class="n">${m.open_weights ? 'да' : 'нет'}</td><td class="role">${m.chosen ? ROLE[m.chosen] : ''}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>`,
  notes: 'Полная таблица бенчмарка: шестнадцать моделей, точность по языкам, найденные грубые нарушения, ошибка итога, цена и время.',
}

const rLimits: Slide = {
  id: 'r4-limits',
  label: 'R4 Ограничения',
  steps: 3,
  reserve: true,
  cls: 'r-limits',
  html: () => `
    ${reserveTag}
    ${title('Что пока не проверено')}
    <div class="body">
      <div class="limits">
        <div data-s="1"><span class="chip warn">контроль</span><b style="margin-top:20px">Контрольные чаты наши</b><span>Эталон зафиксирован до прогона, но чаты писал автор системы, и они чище реальных</span></div>
        <div data-s="2"><span class="chip warn">калибровка</span><b style="margin-top:20px">Цифра завышена</b><span><span class="mono">${num(H.calibration_accuracy_pct)}%</span> на 12 диалогах, на которых настраивались подсказки</span></div>
        <div data-s="3"><span class="chip bad">не запускали</span><b style="margin-top:20px">Окружения</b><span>Docker, локальную модель и запуск на Linux</span></div>
      </div>
      <p class="cap" data-s="3" style="position:absolute;left:0;bottom:0;margin:0;font-size:28px;color:var(--text)">Настоящей проверкой будет эталон организаторов.</p>
    </div>`,
  notes:
    'Что не проверено: Docker, локальная модель, запуск на Linux. Калибровочные 98,9 процента завышены, на них настраивались подсказки, а контрольные чаты писали мы сами.',
}

export const slides: Slide[] = [sTitle, sCover, sResearch, sTour, sArch, sDiff, sJourney, sDemo, sResult, sOurs, sNext, rCall, rLocal, rTable, rLimits]

export const meta = { research, criterion, node, journey, EASE_SNAP }
