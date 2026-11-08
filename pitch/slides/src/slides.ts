// Содержимое слайдов. Цифры подставляются из data.ts (docs/pitch/data/*.json), текстом не дублируются.
// Движение привязано к шагам: data-s="N" появляется на шаге N, хуки step() запускают последовательности.
import { bench, facts, modelName, num, researchItem, ROLE, short, usd, REPO_URL, DEMO_URL } from './data'
import type { Model } from './data'
import shot014 from './assets/shot-ru-014.webp'
import shot015 from './assets/shot-ru-015.webp'
import callUrl from './assets/call-p4-ru-001.webp'
import octagon020 from './assets/octagon-ru-020.webp'
import demoAppeals from './assets/demo-appeals.webp'
import demoChecklists from './assets/demo-checklists.webp'
import qr from './assets/qr.json'
import { nodeIcons } from './icons'
import { EASE_IO, EASE_OUT, T, drawPath, fmt, odometer, still, wait } from './motion'

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
function rounded(input: P[], r = 14): string {
  // совпадающие соседние точки дают отрезок нулевой длины и NaN в пути
  const points = input.filter((p, i) => i === 0 || Math.hypot(p[0] - input[i - 1][0], p[1] - input[i - 1][1]) > 0.5)
  if (points.length < 2) return `M${input[0][0]} ${input[0][1]}`
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
  label: 'CQA',
  steps: 2,
  dark: true,
  cls: 's-title',
  html: () => `
    <div class="coins" aria-hidden="true"></div>
    <div class="name">
      <h1 class="mega" data-sweep>CQA</h1>
      <span class="name-line"></span>
      <p class="lede mask" data-s="1">Контроль качества поддержки, которому можно верить</p>
      <p class="team mask" data-s="2">Журнал контроля для Freedom Broker</p>
    </div>
    ${marquee()}`,
  notes:
    'Мы команда «Журнала контроля». Наш продукт оценивает каждый чат и звонок поддержки Freedom Broker по чек-листу. Сегодня покажем не только оценки, но и почему им можно верить.',
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

// ================================================================ v4: деку ведёт текст выступления
// Слайды 02–10 идут за сценарием из docs/pitch/PROMPT_slides_v4_script.md. Заметки ведущего = текст сценария.

const TR = facts.trust
const H = facts.headline
const NA = facts.na_example
const INS = facts.instability
const WE = facts.word_example
const kappaHuman = fmt(TR.human_ceiling_kappa, 2)
const kappaOurs = fmt(TR.kappa_holdout, 2)
const byRole = (role: string) => bench.models.find((m) => m.chosen === role)!
const judgeA = byRole('judge_A')
const judgeB = byRole('judge_B')
const arbiter = byRole('arbiter')
const gemma = byRole('local_mode')
const opusModel = bench.models.find((m) => m.model === 'anthropic/claude-opus-5.5')!
const terraModel = bench.models.find((m) => m.model === 'openai/gpt-6.1-terra')!
// норматив первой реакции: «SLA 3 мин» в узле signals (backend/app/signals.py, FIRST_REACTION_SEC)
const FIRST_REACTION = Number((facts.architecture.nodes.find((n) => n.id === 'signals')!.sub.match(/SLA (\d+) мин/) ?? ['', '3'])[1]) * 60
const okIcon = check

// ---------------------------------------------------------------- 02. Судья предвзят
type Bias = { name: string; line: string; chips: string[] }
const biasOf = (id: string) => (researchItem(id) as { bias?: Bias }).bias!
const BIAS: Bias[] = [
  { name: 'Позиционный', line: biasOf('position').line, chips: ['Wang, arXiv 2305.17926', 'EMNLP 2026'] },
  { name: 'На длину', line: biasOf('zheng').line, chips: ['MT-Bench', 'arXiv 2306.05685'] },
  { name: 'Нестабильность', line: 'Один и тот же вход, разные решения. А повтор бывает «стабильно, но неверно»', chips: ['Kili 2026'] },
  { name: 'Потолок людей', line: biasOf('ceiling').line, chips: ['NVIDIA', 'arXiv 2510.09738'] },
]
const sBias: Slide = {
  id: 'bias',
  label: 'LLM-судья предвзят',
  steps: BIAS.length,
  chapter: '01 Проблема',
  cls: 's-bias4',
  html: () => `
    ${title('LLM-судья предвзят. Это измерено', 'измерено')}
    <div class="body">
      <div class="bias-row">${BIAS.map(
        (b, i) => `<div class="card bias-card" data-s="${i + 1}">
          <span class="bn mono">${String(i + 1).padStart(2, '0')}</span>
          <b>${esc(b.name)}</b><p>${esc(b.line)}</p>
          <div class="chips">${b.chips.map((c) => `<span class="chip src-chip">${esc(c)}</span>`).join('')}</div>
        </div>`,
      ).join('')}</div>
      <div class="kappa-hero" data-s="${BIAS.length}" style="transition-delay:.35s">
        <span class="kk">κ</span>
        <b data-odo="${kappaHuman}">${kappaHuman}</b>
        <i>эксперты между собой</i>
        <span class="chip src-chip">NVIDIA, arXiv 2510.09738</span>
      </div>
    </div>`,
  notes:
    'LLM-as-a-Judge стал доминирующей парадигмой для оценки результатов языковых моделей, но судьи LLM демонстрируют систематические предубеждения, которые ставят под угрозу надёжность оценки. Ссылаясь на исследования arXiv, NVIDIA и другие источники: позиционный перекос, когда порядок вариантов меняет ответ; перекос на длину, когда судья предпочитает длинный и гладкий ответ; нестабильность, когда при одних и тех же входных данных модель выдаёт разные решения. NVIDIA показала, что потолок задачи это согласие людей между собой, каппа около 0,80.',
}

// ---------------------------------------------------------------- 03. Цель: стабильность и честность
type Rub = { id: string; name: string; w?: number }
const W = NA.weights as Record<string, number>
const RUBRIC: Rub[] = bench.criteria_difficulty.map((c) => ({ id: c.id, name: c.name, w: W[c.name] }))
const RUB_PX = 8 // ширина плашки на 1 балл веса
const sGoal: Slide = {
  id: 'goal',
  label: 'Цель: стабильность и честность',
  steps: 3,
  cls: 's-goal4',
  html: () => `
    <div class="goal-left">
      <span class="eyebrow">Цель архитектуры</span>
      <h2 class="title goal-t">Стабильно.<br><em>Честно.</em></h2>
      <div class="goal-sub" data-s="1">
        <p><b>Стабильно:</b> тот же диалог, тот же балл</p>
        <p><b>Честно:</b> каждое снижение доказано репликой</p>
      </div>
    </div>
    <div class="goal-right">
      <div class="scheme pair" data-s="2">
        <span class="sl">парное сравнение</span>
        <div class="plates">${['A', 'B', 'ничья'].map((p) => `<span class="plate p3">${p}</span>`).join('')}</div>
      </div>
      <div class="shift" data-s="3">
        <svg width="40" height="120" viewBox="0 0 40 120" aria-hidden="true"><path class="ar" d="M20 4v106m-12-12 12 12 12-12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>
        <span>перекос переезжает в ступени шкалы</span>
      </div>
      <div class="scheme rub" data-s="3" style="transition-delay:.25s">
        <span class="sl">наша рубрика: ${RUBRIC.length} критериев с весами</span>
        <div class="plates">${RUBRIC.map(
          (r, i) => `<span class="plate${r.w ? '' : ' gross'}" style="width:${r.w ? r.w * RUB_PX : 96}px;--i:${i}"><i class="mono">${r.id}</i><b class="mono">${r.w ?? 'флаг'}</b></span>`,
        ).join('')}</div>
        <div class="rub-names">${RUBRIC.map((r) => `<span style="width:${r.w ? r.w * RUB_PX : 96}px">${esc(r.name)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="goal-rule" data-s="3" style="transition-delay:.6s"><span class="chip src-chip">#12</span>подсказка критерия: снижение только с номером реплики</div>`,
  notes:
    'Нашей главной архитектурной целью были стабильность и честность. Исследователи работали с парным сравнением: A лучше, B лучше, ничья. У нас рубрика из 8 критериев с весами, поэтому наш аналог их перекоса это ступени шкалы и формулировки подсказок. Мы прописали в чек-листе такие подсказки, чтобы каждое снижение опиралось на конкретную реплику.',
}

// ---------------------------------------------------------------- 04. Как мы поймали смещение
const [run1, run2] = INS.runs
const sCatch: Slide = {
  id: 'catch',
  label: 'Как мы поймали смещение',
  steps: 3,
  cls: 's-catch',
  html: () => `
    <h2 class="title"><span class="mono-t">${num(run1.total, 2)} → ${num(run2.total, 2)}</span> на <em>одном</em> и том же чате</h2>
    <div class="body catch">
      <div class="c-left">
        <div class="runs-h" data-s="1"><span class="chip src-chip">${esc(INS.dialog)}</span><span>«${esc(INS.criterion)}», шкала ${INS.scale.join(' / ')}</span></div>
        <div class="rt2 custom" data-s="1">
          <div class="rr2 rh"><span></span><span>прогон 1</span><span class="c2">прогон 2</span></div>
          <div class="rr2"><span>Судья A</span><b>${run1.judge_a}</b><b class="c2">${run2.judge_a}</b></div>
          <div class="rr2"><span>Судья B</span><b>${run1.judge_b}</b><b class="c2">${run2.judge_b}</b></div>
          <div class="rr2 arb"><span>Арбитр</span><b class="hot">${run1.arbiter}</b><b class="c2 hot bad">${run2.arbiter}</b></div>
          <div class="rr2 tot"><span>Итог</span><b class="old"><span>${num(run1.total, 2)}</span></b><b class="c2 bad">${num(run2.total, 2)}</b></div>
        </div>
        <div class="after2">
          <div data-s="3"><b data-odo="${esc(TR.stability)}">${esc(TR.stability)}</b><span>ответов совпали на повторном прогоне</span></div>
          <div data-s="3" style="transition-delay:.2s"><b><span class="kk">κ</span><span data-odo="${kappaOurs}">${kappaOurs}</span></b><span>согласие с эталоном на ${TR.holdout_dialogs} новых чатах</span>
            <div class="kbar"><i class="kfill" style="--w:${TR.kappa_holdout}"></i><em class="kmark" style="left:${TR.human_ceiling_kappa * 100}%"><s></s><span><b class="mono">${kappaHuman}</b> люди между собой</span></em></div>
          </div>
        </div>
      </div>
      <div class="layer card" data-s="2">
        <span class="chip good">новый слой</span>
        <h3>Проверка согласованности</h3>
        ${INS.fixes.map((f, i) => `<div class="fx" style="transition-delay:${200 + i * 140}ms"><span class="ok">${okIcon(18)}</span><span>${esc(f)}</span></div>`).join('')}
      </div>
    </div>`,
  notes:
    'Первые попытки приводили к смещению. Диалог en-006: при первом прогоне 85,00, при втором 80,50. Разброс в 4,5 балла на одном и том же чате нас не устраивал. Оба судьи отвечали одинаково, 10 и 7, а арбитр выбирал то одно, то другое. Мы поставили ещё один слой, проверку согласованности: кеш результата, обязательный арбитр при споре и правило «нет сбоя с номером реплики, нет снижения». После этого на повторном прогоне совпали 95 ответов из 96. На 10 новых чатах согласие с эталоном каппа 0,96 при потолке людей 0,80.',
}

// ---------------------------------------------------------------- 05. Сценарий 1: локально
const LOCAL = bench.models.filter((m) => m.fits_8gb_laptop).sort((a, b) => b.accuracy - a.accuracy)
const gpuIcon = `<svg class="gpu" viewBox="0 0 200 112" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 16h176a8 8 0 0 1 8 8v56a8 8 0 0 1-8 8H8z"/><path d="M8 8v96"/>
  <circle cx="64" cy="52" r="24"/><circle cx="64" cy="52" r="6"/><circle cx="136" cy="52" r="24"/><circle cx="136" cy="52" r="6"/>
  <path d="M36 88v14M52 88v14M68 88v14M84 88v14M100 88v14M116 88v14M132 88v14"/></svg>`
const sLocal: Slide = {
  id: 'local',
  label: 'Сценарий 1: локально',
  steps: LOCAL.length,
  chapter: '02 Выбор модели',
  cls: 's-local4',
  html: () => `
    ${title('RTX 5070 Ti, 8 ГБ, бесплатно', 'бесплатно')}
    <div class="gpu-wrap"><span class="chip good">сценарий 1</span>${gpuIcon}</div>
    <div class="body">
      <div class="lhead"><span>модель, помещается в 8 ГБ</span><span>точность против эталона, %</span><span></span><span>RU / KZ / EN</span></div>
      ${LOCAL.map(
        (m, i) => `<div class="lrow${m.chosen ? ' pick' : ''}" data-s="${i + 1}">
          <span class="lname">${modelName(m.model)}</span>
          <span class="ltrack"><i class="lbar" style="--w:${m.accuracy / 100}"></i></span>
          <b class="lval mono" data-odo="${num(m.accuracy)}">${num(m.accuracy)}</b>
          <span class="llang mono">${m.ru} / ${m.kz} / ${m.en}</span>
        </div>`,
      ).join('')}
      <p class="lcap" data-s="${LOCAL.length}" style="transition-delay:.5s"><b>данные не выходят из контура,</b> <span class="mono">${fmt(gemma.accuracy, 0)}%</span> для режима без интернета</p>
    </div>`,
  notes:
    'Выбор модели не случаен, мы исследовали 2 сценария. Локальные LLM развернули на RTX 5070 Ti с 8 ГБ, каждый прогон бесплатно. Топ-5 локально: Gemma 4 26B 83,9%, gpt-oss-20b 70,1%, Granite 66,7%, Ministral 62,1%, Qwen 9B 61,6%. Рабочий режим, когда данные не должны уходить наружу, но для эталонной точности мало.',
  enter(el, ctx) {
    if (ctx.instant) return
    el.querySelectorAll<SVGGeometryElement>('.gpu path, .gpu circle').forEach((p, i) => drawPath(p, T[3], 250 + i * 40))
  },
}

// ---------------------------------------------------------------- 06. Сценарий 2: облако
const CLOUD = bench.models.filter((m) => !m.fits_8gb_laptop)
const SC = { W: 1664, H: 500, x0: 96, x1: 1640, y0: 40, y1: 440 }
const lmin = Math.log10(0.0004)
const lmax = Math.log10(0.05)
const SX = (v: number) => SC.x0 + ((Math.log10(v) - lmin) / (lmax - lmin)) * (SC.x1 - SC.x0)
const SY = (acc: number) => SC.y1 - ((acc - 75) / 25) * (SC.y1 - SC.y0)
const priceRatio = Math.round(opusModel.usd_per_dialog / judgeB.usd_per_dialog)

function paretoFront(models: Model[]): Model[] {
  const sorted = [...models].sort((a, b) => a.usd_per_dialog - b.usd_per_dialog || b.accuracy - a.accuracy)
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

type Tag = { model: Model; role: string; muted?: boolean; lift?: boolean; leader: (cx: number, cy: number) => P[]; at: (cx: number, cy: number) => { x: number; y: number; align: 'left' | 'right' } }
const TAGS: Tag[] = [
  { model: judgeB, role: ROLE.judge_B, lift: true, leader: (x, y) => [[x - 12, y - 10], [x - 40, y - 38], [x - 60, y - 38]], at: (x, y) => ({ x: x - 60, y: y - 38, align: 'right' }) },
  { model: judgeA, role: ROLE.judge_A, lift: true, leader: (x, y) => [[x + 12, y - 10], [x + 40, y - 38], [x + 60, y - 38]], at: (x, y) => ({ x: x + 60, y: y - 38, align: 'left' }) },
  { model: arbiter, role: ROLE.arbiter, lift: true, leader: (x, y) => [[x + 12, y + 10], [x + 40, y + 34], [x + 60, y + 34]], at: (x, y) => ({ x: x + 60, y: y + 34, align: 'left' }) },
  { model: opusModel, role: `×${priceRatio} по цене`, muted: true, leader: (x, y) => [[x, y + 14], [x, y + 96]], at: (x, y) => ({ x: x + 16, y: y + 116, align: 'right' }) },
  { model: terraModel, role: 'та же семья, что Sol', muted: true, leader: (x, y) => [[x - 12, y - 8], [x - 40, y - 30], [x - 52, y - 30]], at: (x, y) => ({ x: x - 52, y: y - 30, align: 'right' }) },
]

function scatter(): string {
  const { x0, x1, y0, y1 } = SC
  const front = paretoFront(CLOUD)
  const frontIds = new Set(front.map((m) => m.model))
  const yTicks = [75, 80, 85, 90, 95, 100]
  const xTicks = [0.0005, 0.001, 0.005, 0.01, 0.03]
  const grid =
    yTicks.map((t) => `<line class="gl" x1="${x0}" x2="${x1}" y1="${SY(t)}" y2="${SY(t)}"/>`).join('') +
    xTicks.map((t) => `<line class="gl" x1="${SX(t)}" x2="${SX(t)}" y1="${y1}" y2="${y0 - 8}"/>`).join('')
  const yLabels = yTicks.map((t) => `<text class="tick num" x="${x0 - 16}" y="${SY(t) + 6}" text-anchor="end">${t}</text>`).join('')
  const xLabels = xTicks.map((t) => `<text class="tick num" x="${SX(t)}" y="${y1 + 32}" text-anchor="middle">${usd(t)}</text>`).join('')
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
  const byPrice = [...CLOUD].sort((a, b) => a.usd_per_dialog - b.usd_per_dialog).map((m) => m.model)
  const lifted = new Set(TAGS.filter((t) => t.lift).map((t) => t.model.model))
  const dots = CLOUD.map((m) => {
    const cx = SX(m.usd_per_dialog).toFixed(1)
    const cy = SY(m.accuracy).toFixed(1)
    const cls = `pt${frontIds.has(m.model) ? ' front-c' : ''}${lifted.has(m.model) ? ' lift' : ''}`
    return `<g class="pt-g" data-m="${m.model}" data-cx="${cx}" data-cy="${cy}"><circle class="${cls}" style="--i:${byPrice.indexOf(m.model)}" cx="${cx}" cy="${cy}" r="9"/></g>`
  }).join('')
  const rings = TAGS.map((t) => {
    const cx = SX(t.model.usd_per_dialog)
    const cy = SY(t.model.accuracy)
    const muted = t.muted ? ' muted' : ''
    return `<circle class="ring${muted}" cx="${cx}" cy="${cy}" r="16"/>${t.lift ? `<circle class="pulse" cx="${cx}" cy="${cy}" r="16"/>` : ''}<path class="leader${muted}" d="${rounded(t.leader(cx, cy), 8)}"/>`
  }).join('')
  return `<svg class="scatter" viewBox="0 0 ${SC.W} ${SC.H}" role="img" aria-label="Точность и цена ${CLOUD.length} облачных моделей">
    <defs><linearGradient id="paretoFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#138a4e" stop-opacity=".14"/><stop offset="1" stop-color="#138a4e" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${grid}</g>${yLabels}${xLabels}
    <text class="axis-t" x="${x0 - 16}" y="${y0 - 16}" text-anchor="end">точность, %</text>
    <text class="axis-t" x="${x1}" y="${y1 + 64}" text-anchor="end">цена за диалог, логарифмическая шкала</text>
    <path class="area custom" data-s="2" d="${area}" fill="url(#paretoFill)"/>
    <path class="stairs draw" data-s="2" pathLength="1" style="transition-delay:300ms" d="${stairs}"/>
    <g class="pts custom" data-s="1">${dots}</g>
    <g class="rings custom" data-s="3">${rings}</g>
  </svg>`
}

function tagsHtml(): string {
  return TAGS.map((t, i) => {
    const cx = SX(t.model.usd_per_dialog)
    const cy = SY(t.model.accuracy)
    const p = t.at(cx, cy)
    const shift = p.align === 'right' ? '-100%' : '0'
    return `<div class="tag${t.muted ? ' muted' : ''}" style="left:${p.x}px;top:${p.y}px;--tx:${shift};--ty:-50%;--fx:${(cx - p.x) * 0.4}px;--fy:${(cy - p.y) * 0.4}px;transition-delay:${200 + i * 90}ms">
      <b>${esc(t.role)}</b><span>${modelName(t.model.model)}</span><em data-odo="${num(t.model.accuracy)}">${num(t.model.accuracy)}</em></div>`
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

const sec10 = H.seconds_10_chats.split(' ')[0]
const sCloud: Slide = {
  id: 'cloud',
  label: 'Сценарий 2: облако',
  steps: 4,
  cls: 's-cloud4',
  html: () => `
    ${title('Облако: цена и точность', 'цена')}
    <div class="cloud-meta"><span class="chip good">сценарий 2</span><span class="chip src-chip">${bench.models.length} моделей · 12 размеченных чатов · на графике ${CLOUD.length} облачных</span></div>
    <div class="body">
      <div class="chart">
        ${scatter()}
        <div class="tags custom" data-s="3">${tagsHtml()}</div>
        <div class="legend-row">
          <span><i style="width:14px;height:14px;border-radius:50%;background:var(--neutral)"></i>модель</span>
          <span><i style="width:28px;height:3px;background:var(--accent)"></i>граница Парето</span>
          <span><i style="width:20px;height:20px;border-radius:50%;border:2.5px solid var(--chrome)"></i>выбрана</span>
        </div>
      </div>
      <div class="cloud-foot">
        <div data-s="4"><b data-odo="${usd(H.usd_per_dialog)}">${usd(H.usd_per_dialog)}</b><span>за диалог: два судьи и арбитр</span></div>
        <div data-s="4" style="transition-delay:.15s"><b data-odo="${sec10} с">${sec10} с</b><span>на ${H.seconds_10_chats.includes('до') ? '10 чатов, лучший прогон' : '10 чатов'}</span></div>
      </div>
    </div>`,
  notes:
    'Облачные модели: 16 моделей на 12 размеченных чатах, точность и цена одного запроса. Первая тройка показала схожие результаты: GPT-6.1 Sol 97,7%, Gemini 3.8 Flash 96,2%, Gemini 4 Argon 95,4%. Claude Opus 94%, но в 4 раза дороже. По соотношению цена и качество выиграли эти модели. Итог: $0,021 за диалог, 10 чатов за 83 секунды.',
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

// ---------------------------------------------------------------- 07. Архитектура: токен ru-014 по конвейеру
const NW = 176
const NH = 150
const BIG = { w: 300, h: 200 }
const POS: Record<string, P> = {
  api: [88, 105], norm: [88, 330], signals: [374, 330], compile: [660, 330],
  judgeA: [884, 105], judgeB: [884, 555], check: [1108, 330],
  arbiter: [1332, 105], score: [1332, 330],
  ui: [1556, 105], appeal: [1556, 330], export: [1556, 555],
}
const COLUMN_OF: Record<string, number> = { api: 0, norm: 0, signals: 1, compile: 2, judgeA: 3, judgeB: 3, check: 4, arbiter: 5, score: 5, ui: 6, appeal: 6, export: 6 }
const AI = new Set(['judgeA', 'judgeB', 'arbiter'])
const size = (id: string) => (id === 'signals' ? BIG : { w: NW, h: NH })
const R = (id: string) => POS[id][0] + size(id).w / 2
const L = (id: string) => POS[id][0] - size(id).w / 2
const T0 = (id: string) => POS[id][1] - size(id).h / 2
const B = (id: string) => POS[id][1] + size(id).h / 2
const END = 3 // зазор под наконечник

/** Маршрут ребра: от края узла к краю узла, ортогонально. */
function route(from: string, to: string): P[] {
  const [ax, ay] = POS[from]
  const [bx, by] = POS[to]
  if (from === 'score' && to === 'ui') return [[R(from), ay - 20], [R(from) + 24, ay - 20], [R(from) + 24, by], [L(to) - END, by]]
  if (from === 'score' && to === 'export') return [[R(from), ay + 20], [R(from) + 24, ay + 20], [R(from) + 24, by], [L(to) - END, by]]
  if (from === 'appeal' && to === 'score') return [[L(from), ay], [R(to) + END, by]]
  if (ax === bx) return ay < by ? [[ax, B(from)], [bx, T0(to) - END]] : [[ax, T0(from)], [bx, B(to) + END]]
  if (ay === by) return [[R(from), ay], [L(to) - END, by]]
  const mid = (R(from) + L(to)) / 2
  return [[R(from), ay], [mid, ay], [mid, by], [L(to) - END, by]]
}
/** Где стоит токен внутри узла: в «Фактах кодом» ниже текста, в остальных по центру. */
const anchor = (id: string): P => (id === 'signals' ? [POS[id][0], POS[id][1] + 42] : POS[id])
/** Маршрут токена: тот же путь, но от точки узла к точке узла. */
function tokenPath(from: string, to: string): string {
  const pts = route(from, to)
  return rounded([anchor(from), ...pts.slice(0, -1), anchor(to)].filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]), 14)
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

const FLAGS = ['первая реплика оператора и кто до него', `пауза > ${FIRST_REACTION} с`, 'приветствие: формальное / неформальное', 'эскалация', 'личность подтверждена']
const TOKEN_ID = WE.left.dialog.replace(/^p\d-/, '')

function arch(): string {
  const edges = facts.architecture.edges
    .map(([from, to]) => {
      const pts = route(from, to)
      const col = from === 'appeal' ? 7 : Math.max(COLUMN_OF[from], COLUMN_OF[to])
      const back = from === 'appeal' ? ' back' : ''
      return `<g class="edge-g" data-e="${from}>${to}"><path class="edge draw${back}" data-s="1" pathLength="1" style="transition-delay:${col * 120 + 120}ms" marker-end="url(#ah)" d="${rounded(pts, 12)}"/></g>`
    })
    .join('')
  const nodes = facts.architecture.nodes
    .map((entry) => {
      const big = entry.id === 'signals'
      const { w, h } = size(entry.id)
      const left = L(entry.id)
      const top = T0(entry.id)
      const isAi = AI.has(entry.id)
      const letter = entry.id === 'judgeA' ? 'A' : entry.id === 'judgeB' ? 'B' : ''
      const glyph = letter
        ? `<text class="letter" x="${left + 34}" y="${top + 40}" text-anchor="middle">${letter}</text>`
        : `<g class="ico" transform="translate(${left + 22} ${top + 22})">${nodeIcons[entry.id]}</g>`
      if (big)
        return `<g class="node big" data-n="${entry.id}" data-s="1" style="transition-delay:${COLUMN_OF[entry.id] * 120}ms">
          <rect class="box" x="${left}" y="${top}" width="${w}" height="${h}" rx="22" filter="url(#soft)"/>
          <rect class="chipbg" x="${left + 16}" y="${top + 16}" width="40" height="40" rx="12"/>${glyph}
          <text class="lb" x="${left + 72}" y="${top + 46}">${esc(entry.label)}</text>
          ${wrap(entry.sub, 30).map((line, i) => `<text class="sub" x="${left + 20}" y="${top + 90 + i * 22}">${esc(line)}</text>`).join('')}
          <text class="sub k" x="${left + 20}" y="${top + h - 20}">без LLM, до вызова моделей</text>
        </g>`
      const label = wrap(entry.label, 13)
      const sub = wrap(entry.sub, 19)
      const ly = top + 82
      return `<g class="node${isAi ? ' ai' : ''}" data-n="${entry.id}" data-s="1" style="transition-delay:${COLUMN_OF[entry.id] * 120}ms">
        <rect class="box" x="${left}" y="${top}" width="${w}" height="${h}" rx="18" filter="url(#soft)"/>
        <rect class="chipbg" x="${left + 14}" y="${top + 14}" width="40" height="40" rx="12"/>
        ${glyph}
        ${label.map((line, i) => `<text class="l" x="${left + 16}" y="${ly + i * 21}">${esc(line)}</text>`).join('')}
        ${sub.map((line, i) => `<text class="sub" x="${left + 16}" y="${ly + label.length * 21 + 2 + i * 18}">${esc(line)}</text>`).join('')}
      </g>`
    })
    .join('')
  const pill = (cls: string, text: string, x: number, y: number) => {
    const w = text.length * 8.4 + 26
    return `<g class="pill ${cls}" data-s="1" style="transition-delay:1000ms"><rect x="${x - w / 2}" y="${y - 14}" width="${w}" height="28" rx="14"/><text x="${x}" y="${y + 5}" text-anchor="middle">${text}</text></g>`
  }
  const midArb = R('check') + 24
  return `<svg class="arch4 custom" viewBox="0 0 1664 700" role="img" aria-label="Конвейер: нормализация, факты кодом, два судьи, проверка, арбитр при споре, баллы кодом">
    <defs>${chevron('ah')}
      <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0e3b27" flood-opacity=".09"/></filter>
    </defs>
    ${edges}${nodes}
    ${pill('warn', 'при споре', midArb, 218)}
    <g class="legend4" data-s="1" style="transition-delay:1100ms"><g transform="translate(1468 684)">
      <rect x="0" y="-14" width="18" height="18" rx="5" class="lg-ai"/><text x="28" y="0">LLM</text>
      <rect x="92" y="-14" width="18" height="18" rx="5" class="lg-code"/><text x="120" y="0">код</text>
    </g></g>
  </svg>`
}

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
function ride(t: HTMLElement, from: string, to: string, ms = 420): Promise<void> {
  t.style.offsetPath = `path('${tokenPath(from, to)}')`
  const a = t.animate([{ offsetDistance: '0%' }, { offsetDistance: '100%' }], { duration: ms, easing: EASE_IO, fill: 'forwards' })
  return a.finished.then(() => undefined).catch(() => undefined)
}
function park(t: HTMLElement, at: string): void {
  const [x, y] = anchor(at)
  t.style.offsetPath = `path('M${x} ${y} L${x + 0.01} ${y}')`
  t.style.offsetDistance = '0%'
}
/** Узел «вдыхает» при проходе токена: обводка 1,5 → 3 px и обратно. Без свечения. */
function breathe(el: HTMLElement, id: string): void {
  const box = el.querySelector<SVGRectElement>(`[data-n="${id}"] .box`)
  box?.animate([{ strokeWidth: 1.5 }, { strokeWidth: 3, stroke: 'var(--accent)' }, { strokeWidth: 1.5 }], { duration: 300, easing: EASE_IO })
}
function showScore(el: HTMLElement, instant: boolean): void {
  const badge = el.querySelector<HTMLElement>('.score-badge')!
  const v = badge.querySelector<HTMLElement>('em')!
  if (badge.classList.contains('on')) return
  badge.classList.add('on')
  if (instant) v.textContent = num(WE.left.total, 2)
  else void odometer(v, num(WE.left.total, 2), { from: '00,00' })
}
/** Шаг 1: токен доезжает до «Фактов кодом». Последний шаг: раздваивается на судей, спор уходит к арбитру, балл кодом. */
async function tokenIn(el: HTMLElement): Promise<void> {
  clearTokens(el)
  const run = tokenRun
  const layer = el.querySelector<HTMLElement>('.tokens')!
  const a = makeToken(layer, TOKEN_ID)
  park(a, 'api')
  await wait(1100)
  for (const [f, t] of [['api', 'norm'], ['norm', 'signals']] as const) {
    if (run !== tokenRun) return
    await ride(a, f, t, 420)
    breathe(el, t)
  }
}
async function tokenOut(el: HTMLElement): Promise<void> {
  clearTokens(el)
  const run = tokenRun
  const alive = () => run === tokenRun
  const layer = el.querySelector<HTMLElement>('.tokens')!
  el.querySelector('.score-badge')?.classList.remove('on')
  const a = makeToken(layer, TOKEN_ID)
  park(a, 'signals')
  await ride(a, 'signals', 'compile', 380)
  if (!alive()) return
  const b = makeToken(layer, TOKEN_ID)
  await Promise.all([ride(a, 'compile', 'judgeA', 460), ride(b, 'compile', 'judgeB', 460)])
  if (!alive()) return
  breathe(el, 'judgeA')
  breathe(el, 'judgeB')
  await wait(200)
  await Promise.all([ride(a, 'judgeA', 'check', 460), ride(b, 'judgeB', 'check', 460)])
  if (!alive()) return
  breathe(el, 'check')
  b.remove()
  const r = makeToken(layer, TOKEN_ID, true)
  await Promise.all([
    ride(a, 'check', 'score', 760),
    (async () => {
      await ride(r, 'check', 'arbiter', 400)
      breathe(el, 'arbiter')
      await wait(160)
      await ride(r, 'arbiter', 'score', 360)
    })(),
  ])
  if (!alive()) return
  r.remove()
  breathe(el, 'score')
  a.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.8)' }], { duration: T[1], fill: 'forwards' })
  showScore(el, false)
}

const ARCH_STEPS = 2 + FLAGS.length
const sArch: Slide = {
  id: 'architecture',
  label: 'Архитектура',
  steps: ARCH_STEPS,
  chapter: '03 Архитектура',
  cls: 's-arch4',
  html: () => `
    ${title('Не «скормили LLM»: конвейер', 'конвейер')}
    <div class="body">
      ${arch()}
      <div class="flags">${FLAGS.map((f, i) => `<span class="flag custom" data-s="${i + 2}" style="--k:${i}"><i></i>${esc(f)}</span>`).join('')}</div>
      <div class="tokens" aria-hidden="true"></div>
      <div class="score-badge" style="left:${L('score')}px;top:${B('score') + 14}px"><span class="mono">${esc(WE.left.dialog)}</span><em class="mono">${num(WE.left.total, 2)}</em></div>
    </div>`,
  notes:
    'Архитектура. Мы не просто кормим LLM и просим оценить. Каждый диалог проходит через фильтрацию кодом, ставим флаги: кто ответил первым, паузы больше 180 секунд, формальное или неформальное приветствие, эскалация, подтверждение личности. Не просто слова, а соотношение слов и фактов двигает веса.',
  leave(el) {
    clearTokens(el)
    el.querySelector('.score-badge')?.classList.remove('on')
  },
  step(el, n, ctx) {
    el.querySelector('.node.big')?.classList.toggle('lit', n >= 2 && n < ARCH_STEPS)
    if (ctx.instant) {
      clearTokens(el)
      const layer = el.querySelector<HTMLElement>('.tokens')!
      if (n < ARCH_STEPS) park(makeToken(layer, TOKEN_ID), 'signals')
      else showScore(el, true)
      if (n < ARCH_STEPS) el.querySelector('.score-badge')?.classList.remove('on')
      return
    }
    if (n === 1) void tokenIn(el)
    else if (n < ARCH_STEPS) {
      if (!el.querySelector('.token')) park(makeToken(el.querySelector<HTMLElement>('.tokens')!, TOKEN_ID), 'signals')
      el.querySelector('.score-badge')?.classList.remove('on')
    } else void tokenOut(el)
  },
}

// ---------------------------------------------------------------- 08–09. Примеры: скриншот и выноски
type Box = [number, number, number, number] // x0 y0 x1 y1 в пикселях скриншота
type Callout = { kind: 'no' | 'yes' | 'mid'; from: Box[]; to: Box[]; head: string; why: string; turns: string; h: number }
type Shot = { img: string; w: number; h: number; dialog: string; total: number; callouts: Callout[] }
const SHOT_W = 1600 // ширина скриншота на холсте 1920
const PADB = 5 // отступ рамки выноски вокруг фразы, px скриншота
const FRAME = { left: 40, pad: 12, bottom: 992 }
const LABEL_X = FRAME.left + SHOT_W + FRAME.pad * 2 + 22
function shotGeom(s: Shot) {
  const k = SHOT_W / s.w
  const hh = s.h * k
  const top = FRAME.bottom - hh - FRAME.pad * 2
  return { k, hh, top, imgX: FRAME.left + FRAME.pad, imgY: top + FRAME.pad }
}
/** Подписи справа от скриншота: по высоте своей строки критерия, без наложений. */
function labelTops(s: Shot): number[] {
  const g = shotGeom(s)
  const want = s.callouts.map((c) => Math.min(...c.to.map((b) => g.imgY + ((b[1] + b[3]) / 2) * g.k)) - 22)
  const order = want.map((_, i) => i).sort((a, b) => want[a] - want[b])
  const tops: number[] = []
  let floor = 128
  for (const i of order) {
    tops[i] = Math.max(want[i], floor)
    floor = tops[i] + s.callouts[i].h + 14
  }
  return tops
}
function shotHtml(s: Shot, step0: number): string {
  const g = shotGeom(s)
  const tops = labelTops(s)
  const boxes = s.callouts
    .map((c, i) => {
      const st = step0 + i
      const rect = (b: Box, cls: string, d: number) =>
        `<rect class="cb ${cls} ${c.kind} draw" data-s="${st}" pathLength="1" style="transition-delay:${d}ms" x="${b[0] - PADB}" y="${b[1] - PADB}" width="${b[2] - b[0] + PADB * 2}" height="${b[3] - b[1] + PADB * 2}" rx="7"/>`
      const src = c.from[c.from.length - 1]
      const links = c.to
        .map((b, j) => {
          const x0 = src[2] + PADB
          const y0 = (src[1] + src[3]) / 2
          const x1 = b[0] - PADB
          const y1 = (b[1] + b[3]) / 2
          const dx = (x1 - x0) * 0.45
          return `<path class="cl ${c.kind} draw" data-s="${st}" pathLength="1" style="transition-delay:${260 + j * 120}ms" d="M${x0} ${y0} C${x0 + dx} ${y0} ${x1 - dx} ${y1} ${x1} ${y1}"/>`
        })
        .join('')
      return c.from.map((b, j) => rect(b, j < c.from.length - 1 ? 'pre' : '', j * 90)).join('') + links + c.to.map((b, j) => rect(b, 'row', 480 + j * 120)).join('')
    })
    .join('')
  const leaders = s.callouts
    .map((c, i) =>
      c.to
        .map((b, j) => {
          const x0 = g.imgX + (b[2] + PADB) * g.k
          const y0 = g.imgY + ((b[1] + b[3]) / 2) * g.k
          const ly = tops[i] + 22
          const xm = LABEL_X - 12
          return `<path class="lead ${c.kind} draw" data-s="${step0 + i}" pathLength="1" style="transition-delay:${640 + j * 100}ms" d="${rounded([[x0, y0], [xm, y0], [xm, ly], [LABEL_X - 2, ly]], 6)}"/>`
        })
        .join(''),
    )
    .join('')
  const labels = s.callouts
    .map(
      (c, i) => `<div class="clab ${c.kind}" data-s="${step0 + i}" style="top:${tops[i]}px;left:${LABEL_X}px;transition-delay:760ms">
      <b>${esc(c.head)}</b><span>${esc(c.why)}</span><i class="mono">${esc(c.turns)}</i></div>`,
    )
    .join('')
  return `
    <div class="shot-win" style="left:${FRAME.left}px;top:${g.top}px;width:${SHOT_W + FRAME.pad * 2}px">
      <div class="shot-zoom">
        <img src="${s.img}" width="${SHOT_W}" height="${g.hh.toFixed(1)}" alt="Карточка диалога ${esc(s.dialog)} в приложении: транскрипт и оценки по критериям">
        <svg class="callouts-svg" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none" aria-hidden="true">${boxes}</svg>
      </div>
    </div>
    <svg class="leaders-svg" viewBox="0 0 1920 1080" aria-hidden="true">${leaders}</svg>
    ${labels}`
}
function kenBurns(el: HTMLElement, ctx: Ctx): void {
  const z = el.querySelector<HTMLElement>('.shot-zoom')
  if (!z || ctx.instant || still()) return
  z.animate([{ transform: 'scale(1.03)' }, { transform: 'none' }], { duration: 4200, easing: EASE_OUT })
}

// Координаты фраз и строк критериев измерены по пикселям docs/screens/2x/14-chat-ru-014-words.png (1810×912)
const ROW014 = (cy: number): Box => [1008, cy - 19, 1786, cy + 19]
const SHOT014: Shot = {
  img: shot014,
  w: 1810,
  h: 912,
  dialog: WE.left.dialog,
  total: WE.left.total,
  callouts: [
    { kind: 'no', from: [[273, 664, 491, 680]], to: [ROW014(154)], head: 'Контакт: Нет', why: '«Привет», имени нет; флаг неформального приветствия', turns: '#10', h: 116 },
    { kind: 'no', from: [[273, 434, 779, 450], [273, 664, 491, 680]], to: [ROW014(201), [1008, 487, 1786, 547]], head: 'Потребность: Нет, Ведение: 7', why: 'переспросил то, что клиент уже сказал', turns: '#5 → #10', h: 116 },
    { kind: 'no', from: [[272, 710, 369, 726], [273, 756, 324, 772]], to: [ROW014(457)], head: 'Эмпатия: Нет', why: '«Понял» в ответ на «Я уже писал»', turns: '#11 → #12', h: 116 },
    { kind: 'no', from: [[272, 873, 387, 889]], to: [ROW014(576)], head: 'Завершение: Нет', why: '«Хорошего дня» без итога', turns: '#14', h: 92 },
  ],
}
// docs/screens/2x/15-chat-ru-015-words.png (1905×990)
const ROW015 = (cy: number, h = 19): Box => [1110, cy - h, 1886, cy + h]
const SHOT015: Shot = {
  img: shot015,
  w: 1905,
  h: 990,
  dialog: WE.right.dialog,
  total: WE.right.total,
  callouts: [
    { kind: 'yes', from: [[373, 776, 623, 794]], to: [ROW015(231)], head: 'Контакт: Да', why: '«Здравствуйте, меня зовут Дина»', turns: '#10', h: 92 },
    { kind: 'yes', from: [[772, 893, 983, 909], [373, 918, 449, 932]], to: [ROW015(653)], head: 'Завершение: Да', why: 'благодарность и прощание', turns: '#12', h: 92 },
    { kind: 'mid', from: [[372, 847, 712, 861], [372, 893, 761, 909]], to: [ROW015(430, 30)], head: 'Консультация: 15 из 20', why: 'на «ждать не надо?» нет прямого ответа', turns: '#11 → #12', h: 116 },
  ],
}
const diff = Math.round(WE.right.total - WE.left.total)

const sRu014: Slide = {
  id: 'ru-014',
  label: 'Пример ru-014: 38,13',
  steps: SHOT014.callouts.length,
  chapter: '04 Примеры',
  cls: 's-shot',
  html: () => `
    <div class="shot-head">${title('Пример ru-014', 'ru-014')}<span class="shot-sub">поддержка решила вопрос клиента</span></div>
    <div class="shot-hero no" data-s="${SHOT014.callouts.length}" style="transition-delay:1s"><b data-odo="${num(SHOT014.total, 2)}">${num(SHOT014.total, 2)}</b><span>из 100</span></div>
    ${shotHtml(SHOT014, 1)}`,
  notes:
    'Пример ru-014. Поддержка решила вопрос клиента, оценка 38,13. «Привет» вместо «Здравствуйте, меня зовут» снимает контакт. Повторный вопрос о том, что клиент уже сказал боту, снимает потребность и ступень ведения диалога. «Понял» в ответ на «я уже писал» снимает эмпатию. «Хорошего дня» без итога снимает завершение.',
  enter: kenBurns,
}

const sRu015: Slide = {
  id: 'ru-015',
  label: 'Пример ru-015: 92,31',
  steps: SHOT015.callouts.length + 1,
  cls: 's-shot',
  html: () => `
    <div class="shot-head">${title('Пример ru-015', 'ru-015')}<span class="shot-sub">тот же тип вопроса</span></div>
    <div class="shot-hero yes">
      <div class="cmp-old" data-s="${SHOT015.callouts.length + 1}"><b data-odo="${num(WE.left.total, 2)}">${num(WE.left.total, 2)}</b><span>${esc(WE.left.dialog)}</span></div>
      <div class="cmp-new" data-s="${SHOT015.callouts.length}" style="transition-delay:1s"><b data-odo="${num(SHOT015.total, 2)}">${num(SHOT015.total, 2)}</b><span>${esc(WE.right.dialog)}</span></div>
      <p class="cmp-cap" data-s="${SHOT015.callouts.length + 1}" style="transition-delay:.4s">разница <span class="mono">${diff}</span> балла, каждое снижение со ссылкой на реплику</p>
    </div>
    ${shotHtml(SHOT015, 1)}`,
  notes:
    'Пример ru-015. Тот же тип вопроса, оценка 92,31. «Здравствуйте, меня зовут Дина», вопрос закрыт, прощание с благодарностью. Снята одна ступень консультации: на уточнение «ждать не надо?» оператор не ответил прямо. Каждое снижение со ссылкой на номер реплики.',
  enter: kenBurns,
}

// ---------------------------------------------------------------- 10. Два судьи и арбитр → демо
const holdout = H.holdout_note.match(/(\d+) из (\d+)/)!
const pointsTotal = TR.judge_agreement.split(' из ')[1]
const ROLES = [
  { m: judgeA, role: ROLE.judge_A, chip: 'good', vendor: 'Google', stats: [['KZ', `${judgeA.kz}%`]] },
  { m: judgeB, role: ROLE.judge_B, chip: 'good', vendor: 'OpenAI', stats: [['EN', `${judgeB.en}%`], ['грубые', judgeB.gross_found]] },
  { m: arbiter, role: ROLE.arbiter, chip: 'warn', vendor: 'только спорные критерии', stats: [['на контроле', `${TR.arbitrated} из ${pointsTotal}`]] },
]
function qrSvg(): string {
  const n = qr.size
  let cells = ''
  for (let r = 0; r < n; r += 1)
    for (let c = 0; c < n; c += 1) if (qr.bits[r * n + c] === '1') cells += `<rect x="${c}" y="${r}" width="1.04" height="1.04" style="--d:${r + c}"/>`
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR: ${REPO_URL}">${cells}</svg>`
}
const RESULT = [
  { v: `${num(H.holdout_accuracy_pct)}%`, l: 'точность на 10 новых чатах', n: `${holdout[1]} из ${holdout[2]}` },
  { v: num(H.holdout_mae_points, 2), l: 'ошибка итога', n: 'баллов из 100' },
  { v: `${short(H.stability_pct).replace(/,0$/, '')}%`, l: 'стабильность повтора', n: `${TR.stability}` },
  { v: usd(H.usd_per_dialog), l: 'за диалог', n: 'два судьи и арбитр' },
]
const sJudges: Slide = {
  id: 'judges',
  label: 'Два судьи и арбитр → демо',
  steps: 3,
  cls: 's-judges',
  html: () => `
    ${title('Два судьи и арбитр', 'арбитр')}
    <div class="body">
      <div class="jcards">${ROLES.map(
        (r, i) => `<div class="card jcard${r.m.chosen === 'arbiter' ? ' arb' : ''}" data-s="1" style="transition-delay:${i * 140}ms">
          <div class="jtop"><span class="chip ${r.chip}">${esc(r.role)}</span><span class="jv">${esc(r.vendor)}</span></div>
          <div class="jn">${modelName(r.m.model)}</div>
          <dl>${r.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd></div>`).join('')}</dl>
        </div>`,
      ).join('')}</div>
      <div class="jcode" data-s="2"><span class="chip src-chip">код</span>баллы считает код: N/A перераспределяет вес, округление half-up</div>
      <div class="jnums">${RESULT.map(
        (r, i) => `<div data-s="2" style="transition-delay:${200 + i * 120}ms"><span class="hl">${esc(r.l)}</span><b data-odo="${esc(r.v)}">${esc(r.v)}</b><i>${esc(r.n)}</i></div>`,
      ).join('')}</div>
      <a class="go-demo" data-s="3" href="${DEMO_URL}" target="_blank" rel="noopener">Живое демо</a>
      <div class="qr4 custom" data-s="3"><div class="tile">${qrSvg()}</div><span class="mono">${REPO_URL.replace('https://', '')}</span></div>
    </div>`,
  notes:
    'Ссылаясь на проверенную схему LLM-as-a-Judge: два судьи от разных вендоров, Gemini и GPT, строят мнения независимо, арбитр решает только спорные критерии, баллы считает код, а не модель. Дальше живое демо.',
}

// ---------------------------------------------------------------- Резерв
const reserveTag = '<div class="reserve-tag"><span class="chip">резерв</span></div>'

const rTable: Slide = {
  id: 'r1-table',
  label: 'R1 Все 16 моделей',
  steps: 2,
  reserve: true,
  cls: 'r-table',
  html: () => `
    ${reserveTag}
    ${title(`Все ${bench.models.length} моделей`)}
    <div class="body" style="top:232px;bottom:104px" data-s="1">
      <table class="full">
        <thead><tr><th>Модель</th><th class="n">Точность</th><th class="n">RU</th><th class="n">KZ</th><th class="n">EN</th><th class="n">Грубые</th><th class="n">Ошибка итога</th><th class="n">$ за диалог</th><th class="n">с на диалог</th><th class="n">8 ГБ</th><th>Роль</th></tr></thead>
        <tbody>${bench.models
          .map(
            (m) => `<tr class="${m.chosen ? 'chosen' : ''}"><td>${modelName(m.model)}</td><td class="n">${num(m.accuracy)}</td><td class="n">${m.ru}</td><td class="n">${m.kz}</td><td class="n">${m.en}</td><td class="n">${m.gross_found}</td><td class="n">${num(m.mae_total, 2)}</td><td class="n">${short(m.usd_per_dialog)}</td><td class="n">${short(m.sec_per_dialog)}</td><td class="n">${m.fits_8gb_laptop ? 'да' : ''}</td><td class="role">${m.chosen ? ROLE[m.chosen] : ''}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>`,
  notes: 'Полная таблица бенчмарка: шестнадцать моделей на двенадцати размеченных чатах, точность по языкам, найденные грубые нарушения, ошибка итога, цена и время на диалог.',
}

const rCall: Slide = {
  id: 'r2-call',
  label: 'R2 Звонок и Whisper',
  steps: 2,
  reserve: true,
  cls: 'r-call',
  html: () => `
    ${reserveTag}
    ${title('Звонок и Whisper')}
    <div class="body">
      <div class="card shot-r" data-s="1"><img src="${callUrl}" alt="Карточка звонка p4-ru-001: расшифровка, плеер, оценка по чек-листу"></div>
      <div class="stack3">
        <div data-s="2"><b>Дубли ASR</b><span>повторы распознавания убираются при нормализации</span></div>
        <div data-s="2" style="transition-delay:.15s"><b>Маски данных</b><span>персональные данные скрыты до оценки</span></div>
        <div data-s="2" style="transition-delay:.3s"><b>Локальный Whisper</b><span>запись не уходит наружу</span></div>
      </div>
    </div>`,
  notes: 'Звонки идут тем же конвейером. Нормализация убирает дубли распознавания, персональные данные маскируются, Whisper работает локально.',
}

const naRows = Object.entries(NA.answers as Record<string, string>)
const rNA: Slide = {
  id: 'r3-na',
  label: 'R3 N/A на ru-020',
  steps: 2,
  reserve: true,
  cls: 'r-na',
  html: () => `
    ${reserveTag}
    ${title('N/A не равно нулю: ru-020')}
    <div class="body">
      <div class="card oct" data-s="1"><img src="${octagon020}" alt="Октагон качества диалога ${esc(NA.dialog)}: два критерия N/A"></div>
      <div class="na4">
        <div class="na-num" data-s="1"><s class="mono">${short(NA.if_na_were_zero)}</s><span>→</span><b data-odo="${num(NA.total, 2)}" data-from="${fmt(NA.if_na_were_zero, 2)}">${num(NA.total, 2)}</b></div>
        <p data-s="1">если N/A считать нулём, было бы ${short(NA.if_na_were_zero)}; вес N/A делят остальные критерии</p>
        <div class="na-rows" data-s="2">${naRows.map(([k, v]) => `<div class="${v === 'N/A' ? 'na' : v === 'Нет' ? 'no' : ''}"><span>${esc(k)}</span><span class="mono">${W[k]}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <p class="na-sum" data-s="2">применимо <b class="mono">${NA.applicable_weight}</b>, набрано <b class="mono">${NA.earned}</b>: ${NA.earned} / ${NA.applicable_weight} = <b class="mono">${num(NA.total, 2)}</b></p>
      </div>
    </div>`,
  notes: 'Диалог ru-020: клиент сразу всё сказал, данных счёта не было, поэтому Потребность и Идентификация неприменимы. Применимый вес 65, набрано 60, итог 92,31. Если бы N/A считался нулём, было бы 60. Это официальная трактовка Freedom.',
}

const LIM = facts.limits as Record<string, string>
const rLimits: Slide = {
  id: 'r4-limits',
  label: 'R4 Ограничения',
  steps: 4,
  reserve: true,
  cls: 'r-limits',
  html: () => `
    ${reserveTag}
    ${title('Ограничения, честно')}
    <div class="body">
      <div class="limits four">
        <div data-s="1"><span class="chip warn">эталон</span><b>Эталон наш, а не Freedom</b><span>размечен нашей командой по чек-листу и трактовкам Freedom до запуска модели</span></div>
        <div data-s="2"><span class="chip warn">контроль</span><b>Контроль: ${TR.holdout_dialogs} чатов</b><span><span class="mono">${TR.confident_items}</span> уверенный пункт, <span class="mono">${TR.disputed_items}</span> спорных исключены</span></div>
        <div data-s="3"><span class="chip bad">c2</span><b>Потребность: <span class="mono">${TR.c2_holdout_pct}%</span></b><span><span class="mono">${esc(TR.c2_holdout)}</span> на контроле: граница между «уточнил» и N/A</span></div>
        <div data-s="4"><span class="chip warn">c7</span><b>Правило про прощание</b><span>Freedom: «${esc(LIM.closure_freedom_answer)}». Мы ${esc(LIM.closure_our_reading)}. От правила зависят <span class="mono">${esc(LIM.closure_rule_dependent)}</span> чатов</span></div>
      </div>
    </div>`,
  notes: 'Ограничения: эталон размечен нами, а не Freedom; контроль это десять чатов; Потребность на контроле 75 процентов. Правило про прощание: Freedom ответил «на ваше усмотрение», мы читаем чек-лист буквально, и от этого правила зависят 44 чата из 65.',
}

const rAppeals: Slide = {
  id: 'r5-appeals',
  label: 'R5 Апелляции и чек-лист',
  steps: 2,
  reserve: true,
  cls: 'r-appeals',
  html: () => `
    ${reserveTag}
    ${title('Апелляции и редактор чек-листа')}
    <div class="body two-shots">
      <figure data-s="1"><div class="card"><img src="${demoAppeals}" alt="Экран апелляций"></div><figcaption>Апелляция: ${esc(facts.architecture.nodes.find((n) => n.id === 'appeal')!.sub)}</figcaption></figure>
      <figure data-s="2"><div class="card"><img src="${demoChecklists}" alt="Редактор чек-листа с весами"></div><figcaption>${esc(facts.ours[2])}</figcaption></figure>
    </div>`,
  notes: 'Апелляция проходит три слоя: модель, решение, финал. Чек-лист редактируется в интерфейсе и компилируется в промпт и JSON-схему, новый критерий добавляется без кода.',
}

export const slides: Slide[] = [sTitle, sBias, sGoal, sCatch, sLocal, sCloud, sArch, sRu014, sRu015, sJudges, rTable, rCall, rNA, rLimits, rAppeals]

export const meta = { EASE_IO }
