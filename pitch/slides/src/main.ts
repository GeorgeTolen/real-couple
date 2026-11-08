import './style.css'
import { coinsPicture, freezeCoins, slides, type Ctx, type Slide } from './slides'
import { EASE_IO, EASE_OUT, T, odometer, reveal, settled, still } from './motion'

const CHANNEL = 'cqa-pitch-v1'
const MAIN = slides.filter((s) => !s.reserve).length
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const params = new URLSearchParams(location.search)

type State = { i: number; step: number }
type Msg =
  | { type: 'state'; i: number; step: number; at: number }
  | { type: 'nav'; dir: 'next' | 'prev' }
  | { type: 'goto'; i: number }
  | { type: 'hello' }

const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null

function slideNo(index: number): string {
  const s = slides[index]
  if (s.reserve) return 'R' + (index - MAIN + 1)
  return String(index + 1).padStart(2, '0')
}

/** Подвал: полоса прогресса с делениями по главам и номер слайда. */
function footer(index: number): string {
  const s = slides[index]
  const ticks = slides
    .slice(0, MAIN)
    .map((x, k) => (x.chapter ? `<i style="left:${(k / MAIN) * 100}%"></i>` : ''))
    .join('')
  const bar = s.reserve ? '' : `<div class="track">${ticks}<div class="bar" style="transform:scaleX(${(index + 1) / MAIN})"></div></div>`
  const total = s.reserve ? '' : ` / ${String(MAIN).padStart(2, '0')}`
  return `<footer class="foot${s.reserve ? ' reserve' : ''}">${bar}<span class="no"><span class="noc">${slideNo(index)}</span>${total}</span></footer>`
}

/** prefix делает id уникальными в копиях слайдов (сетка, окно заметок). */
function build(s: Slide, index: number, prefix = ''): HTMLElement {
  const el = document.createElement('section')
  el.className = `slide ${s.cls}${s.dark ? ' dark' : ''}`
  el.dataset.id = s.id
  el.setAttribute('aria-label', s.label)
  let html = s.html() + footer(index)
  if (prefix)
    html = html
      .replace(/id="([^"]+)"/g, `id="${prefix}$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
      .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`)
  el.innerHTML = html
  return el
}

/** Показывает элементы с data-s ≤ step, скрывает те, у которых data-until ≤ step. Возвращает только что показанные. */
function applyStep(el: HTMLElement, s: Slide, step: number): HTMLElement[] {
  for (let k = 1; k <= Math.max(s.steps, 6); k += 1) el.classList.toggle('s' + k, k <= step)
  const shown: HTMLElement[] = []
  el.querySelectorAll<HTMLElement>('[data-s], [data-until]').forEach((item) => {
    const from = Number(item.dataset.s ?? 1)
    const until = item.dataset.until ? Number(item.dataset.until) : Infinity
    const on = step >= from && step < until
    const was = item.classList.contains('on')
    item.classList.toggle('on', on)
    // уход вверх быстрее входа; при повторном входе снова снизу
    item.classList.toggle('gone', was && !on && step >= until)
    if (on && !was) shown.push(item)
  })
  return shown
}

/** Одометры и налив веса для того, что только что появилось. */
function animateShown(shown: HTMLElement[], instant: boolean): void {
  for (const item of shown) {
    const odos = item.matches('[data-odo]') ? [item] : [...item.querySelectorAll<HTMLElement>('[data-odo]')]
    odos.forEach((o, k) => {
      if (instant) o.textContent = o.dataset.odo!
      else void odometer(o, o.dataset.odo!, { from: o.dataset.from, delay: 180 + k * 60 })
    })
    if (instant) continue
    const sweeps = item.matches('[data-sweep]') ? [item] : [...item.querySelectorAll<HTMLElement>('[data-sweep]')]
    sweeps.forEach((w) => reveal(w, { mode: 'weight', to: 600, delay: 120 }))
  }
}

/** Заголовок слайда: буквы наливаются весом, акцентное слово ловит фокус, линия под ним прорисовывается. */
function titleIn(el: HTMLElement): void {
  const t = el.querySelector<HTMLElement>('.title, .mega')
  if (!t) return
  const anims = reveal(t, { mode: 'weight', to: t.classList.contains('mega') ? 650 : 700, duration: T[3] })
  const em = t.querySelector<HTMLElement>('em')
  if (!em) return
  const after = 250 + anims.length * 18
  em.animate([{ fontVariationSettings: '"slnt" 0, "SHRP" 0' }, { fontVariationSettings: '"slnt" -8, "SHRP" 100' }], { duration: T[3], delay: after - 150, easing: EASE_OUT, fill: 'backwards' })
  em.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { pseudoElement: '::after', duration: 500, delay: after, easing: EASE_OUT, fill: 'backwards' })
}

/** Закончить всё незацикленное движение на слайде (возврат назад, печать, экспорт). */
function finishAll(el: HTMLElement): void {
  el.getAnimations({ subtree: true }).forEach((a) => {
    const t = a.effect?.getComputedTiming()
    if (t && t.iterations !== Infinity) {
      try {
        a.finish()
      } catch {
        a.cancel()
      }
    }
  })
}

// ------------------------------------------------------------------ окно заметок
if (location.hash === '#notes') {
  startNotes()
} else {
  startDeck()
}

function startDeck(): void {
  const app = document.getElementById('app')!
  const stage = document.createElement('div')
  stage.className = 'stage'
  app.appendChild(stage)
  const els = slides.map((s, index) => {
    const el = build(s, index)
    stage.appendChild(el)
    return el
  })
  const curtain = document.createElement('div')
  curtain.className = 'curtain'
  curtain.innerHTML = '<span></span>'
  stage.appendChild(curtain)

  const grid = document.createElement('div')
  grid.className = 'grid-view'
  grid.setAttribute('role', 'dialog')
  grid.setAttribute('aria-label', 'Все слайды')
  document.body.appendChild(grid)

  const hint = document.createElement('div')
  hint.className = 'hint'
  hint.textContent = '→ или пробел: дальше   N: заметки   G: все слайды   F: полный экран   P: печать'
  document.body.appendChild(hint)

  let state: State = { i: 0, step: 1 }
  let print = false
  let busy = false
  let notesWin: Window | null = null
  const ctx = (): Ctx => ({ instant: print || reducedQuery.matches, print })

  function fromHash(): State | null {
    const m = location.hash.match(/^#(\d+)(?:\.(\d+))?$/)
    if (!m) return null
    const i = Math.min(Math.max(Number(m[1]) - 1, 0), slides.length - 1)
    const step = Math.min(Math.max(Number(m[2] ?? 1), 1), slides[i].steps)
    return { i, step }
  }

  function fit(): void {
    if (print) {
      stage.style.transform = ''
      return
    }
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`
  }

  function broadcast(): void {
    const msg: Msg = { type: 'state', i: state.i, step: state.step, at: Date.now() }
    channel?.postMessage(msg)
    try {
      notesWin?.postMessage(msg, '*')
    } catch {
      /* окно закрыто */
    }
  }

  /** Перерисовать состояние. gate задерживает шаговые анимации (шторка главы). */
  function apply(next: State, instant: boolean, gate?: Promise<void>): void {
    const prev = state
    const changed = next.i !== prev.i
    state = next
    const s = slides[state.i]
    const el = els[state.i]
    const c = ctx()
    if (changed) {
      slides[prev.i].leave?.(els[prev.i])
      els[prev.i].classList.remove('active')
      els[prev.i].querySelectorAll('.on, .gone').forEach((x) => x.classList.remove('on', 'gone'))
    }
    document.body.classList.toggle('instant', instant)
    el.classList.add('active')
    document.body.classList.toggle('on-dark', Boolean(s.dark))
    const fresh = changed || !el.dataset.entered
    if (fresh) {
      el.dataset.entered = '1'
      s.enter?.(el, { ...c, instant })
    }
    if (instant) finishAll(el)
    const run = () => {
      if (fresh && !instant) {
        titleIn(el)
        const noc = el.querySelector<HTMLElement>('.noc')
        if (noc && changed) void odometer(noc, noc.textContent!, { from: slideNo(prev.i).replace('R', '0'), duration: T[3] })
      }
      const shown = applyStep(el, s, state.step)
      animateShown(shown, instant)
      s.step?.(el, state.step, { ...c, instant })
      if (instant) {
        finishAll(el)
        requestAnimationFrame(() => document.body.classList.toggle('instant', c.instant))
      }
    }
    if (fresh && !instant) {
      applyStep(el, s, 0)
      const later = () => requestAnimationFrame(() => requestAnimationFrame(run))
      if (gate) void gate.then(later)
      else later()
    } else run()
    const hash = `#${state.i + 1}.${state.step}`
    if (location.hash !== hash) history.replaceState(null, '', hash)
    broadcast()
    markGrid()
  }

  /** Шторка главы: заезжает слева, держит название 400 мс, уходит вправо. */
  async function chapterCurtain(label: string, next: State): Promise<void> {
    busy = true
    const span = curtain.querySelector('span')!
    span.textContent = label
    curtain.classList.add('run')
    await curtain.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 300, easing: EASE_IO, fill: 'forwards' }).finished
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    apply(next, false, gate)
    await span.animate([{ opacity: 0, transform: 'translateY(16px)', fontWeight: 200 }, { opacity: 1, transform: 'none', fontWeight: 300 }], { duration: 260, easing: EASE_OUT, fill: 'both' }).finished
    await new Promise((r) => setTimeout(r, 400))
    const out = curtain.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }], { duration: 300, easing: EASE_IO, fill: 'forwards' })
    setTimeout(release, 120)
    await out.finished
    curtain.getAnimations().forEach((a) => a.cancel())
    span.getAnimations().forEach((a) => a.cancel())
    curtain.classList.remove('run')
    busy = false
  }

  function show(next: State, opts: { instant?: boolean } = {}): void {
    if (busy) return
    const prev = state
    const changed = next.i !== prev.i
    const back = next.i < prev.i || (!changed && next.step < prev.step)
    const instant = Boolean(opts.instant) || back || ctx().instant
    const target = slides[next.i]
    if (changed && !instant) {
      if (target.chapter && !target.reserve) {
        void chapterCurtain(target.chapter, next)
        return
      }
      const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition
      if (vt) {
        vt.call(document, () => apply(next, false))
        return
      }
    }
    apply(next, instant)
  }

  function next(): void {
    const s = slides[state.i]
    if (state.step < s.steps && !reducedQuery.matches) return show({ i: state.i, step: state.step + 1 })
    if (state.i < slides.length - 1) {
      const target = slides[state.i + 1]
      show({ i: state.i + 1, step: reducedQuery.matches ? target.steps : 1 })
    }
  }

  function prev(): void {
    if (state.step > 1 && !reducedQuery.matches) return show({ i: state.i, step: state.step - 1 })
    if (state.i > 0) show({ i: state.i - 1, step: slides[state.i - 1].steps }, { instant: true })
  }

  function goto(i: number, step?: number | 'last'): void {
    busy = false
    const s = slides[i]
    const st = step === 'last' || reducedQuery.matches ? s.steps : (step ?? 1)
    if (step === 'last') apply({ i, step: st }, true)
    else show({ i, step: st })
  }

  // ---------------------------------------------------------------- сетка
  function buildGrid(): void {
    grid.innerHTML = ''
    slides.forEach((s, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.i = String(index)
      const thumb = document.createElement('div')
      thumb.className = 'thumb'
      const clone = build(s, index, `g${index}-`)
      applyStep(clone, s, s.steps)
      s.step?.(clone, s.steps, { instant: true, print: false })
      const coins = clone.querySelector('.coins')
      if (coins) coins.innerHTML = coinsPicture()
      thumb.appendChild(clone)
      const cap = document.createElement('div')
      cap.className = 'cap'
      cap.innerHTML = `<span class="mono">${s.reserve ? 'R' + (index - MAIN + 1) : index + 1}</span>${s.label}`
      button.append(thumb, cap)
      button.addEventListener('click', () => {
        closeGrid()
        goto(index, 1)
      })
      grid.appendChild(button)
    })
    requestAnimationFrame(sizeThumbs)
  }
  function sizeThumbs(): void {
    grid.querySelectorAll<HTMLElement>('.thumb').forEach((thumb) => {
      const slide = thumb.querySelector<HTMLElement>('.slide')!
      slide.style.transform = `scale(${thumb.clientWidth / 1920})`
    })
  }
  function markGrid(): void {
    grid.querySelectorAll('button').forEach((b) => b.classList.toggle('cur', Number(b.dataset.i) === state.i))
  }
  function openGrid(): void {
    document.body.classList.add('instant')
    buildGrid()
    grid.classList.add('open')
    markGrid()
    grid.querySelector<HTMLElement>('button.cur')?.focus()
    requestAnimationFrame(() => document.body.classList.toggle('instant', ctx().instant))
  }
  function closeGrid(): void {
    grid.classList.remove('open')
  }

  // ---------------------------------------------------------------- печать
  function setPrint(on: boolean): void {
    print = on
    document.body.classList.toggle('print', on)
    document.body.classList.toggle('instant', on)
    if (on) {
      closeGrid()
      els.forEach((el, index) => {
        const s = slides[index]
        if (!el.dataset.entered) {
          el.dataset.entered = '1'
          s.enter?.(el, ctx())
        }
        finishAll(el)
        applyStep(el, s, s.steps)
        s.step?.(el, s.steps, ctx())
        finishAll(el)
      })
      document.documentElement.dataset.printReady = ''
      window.setTimeout(() => {
        freezeCoins()
        document.documentElement.dataset.printReady = '1'
      }, 400)
    } else {
      els.forEach((el, index) => index !== state.i && el.classList.remove('active'))
      apply(state, true)
    }
    fit()
  }

  // ---------------------------------------------------------------- заметки
  function openNotes(): void {
    const url = location.href.split('#')[0] + '#notes'
    notesWin = window.open(url, 'cqa-notes', 'width=1100,height=760')
    window.setTimeout(broadcast, 600)
  }

  function onMsg(msg: Msg): void {
    if (msg.type === 'nav') (msg.dir === 'next' ? next : prev)()
    else if (msg.type === 'goto') goto(msg.i, 1)
    else if (msg.type === 'hello') broadcast()
  }
  channel?.addEventListener('message', (e) => onMsg(e.data as Msg))
  window.addEventListener('message', (e) => {
    if (e.data && typeof e.data === 'object' && 'type' in e.data) onMsg(e.data as Msg)
  })

  // ---------------------------------------------------------------- клавиши и курсор
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const gridOpen = grid.classList.contains('open')
    const key = e.key
    if (gridOpen) {
      if (key === 'Escape' || e.code === 'KeyG') {
        e.preventDefault()
        closeGrid()
      }
      return
    }
    switch (key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
      case 'Enter':
        e.preventDefault()
        next()
        break
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        e.preventDefault()
        prev()
        break
      case 'Home':
        goto(0, 1)
        break
      case 'End':
        goto(MAIN - 1, 'last')
        break
      default: {
        // буквы работают и в русской раскладке: N=Т, G=П, F=А, P=З
        const k = e.code
        if (k === 'KeyN') openNotes()
        else if (k === 'KeyG') openGrid()
        else if (k === 'KeyF') {
          if (document.fullscreenElement) void document.exitFullscreen()
          else void document.documentElement.requestFullscreen?.()
        } else if (k === 'KeyP') setPrint(!print)
      }
    }
  })

  let idle = 0
  window.addEventListener('mousemove', () => {
    document.body.classList.remove('idle')
    clearTimeout(idle)
    idle = window.setTimeout(() => document.body.classList.add('idle'), 2000)
  })

  window.addEventListener('resize', () => {
    fit()
    if (grid.classList.contains('open')) sizeThumbs()
  })
  window.addEventListener('hashchange', () => {
    const h = fromHash()
    if (h && (h.i !== state.i || h.step !== state.step)) show(h)
  })
  reducedQuery.addEventListener('change', () => apply({ i: state.i, step: reducedQuery.matches ? slides[state.i].steps : state.step }, true))

  // API для скриптов экспорта
  ;(window as unknown as { deck: unknown }).deck = {
    count: slides.length,
    main: MAIN,
    ids: slides.map((s) => s.id),
    steps: slides.map((s) => s.steps),
    goto,
    setPrint,
    settle: () => settled(),
    still,
    notes: slides.map((s) => s.notes),
  }

  fit()
  const start = fromHash() ?? { i: 0, step: 1 }
  state = { i: start.i, step: 0 }
  apply(reducedQuery.matches ? { i: start.i, step: slides[start.i].steps } : start, start.step > 1 || reducedQuery.matches)
  if (params.has('print')) setPrint(true)
  else {
    hint.classList.add('show')
    window.setTimeout(() => hint.classList.remove('show'), 3500)
  }
}

function startNotes(): void {
  document.title = 'Заметки докладчика'
  document.body.style.overflow = 'auto'
  document.body.style.background = '#1c1f1d'
  const app = document.getElementById('app')!
  app.innerHTML = `
  <div style="font:16px/1.5 var(--ui);color:#e8ebe8;padding:24px 32px;display:grid;grid-template-columns:1fr 360px;gap:32px;min-height:100vh;box-sizing:border-box">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">
        <div id="cur" style="font:600 28px/1.2 var(--display)"></div>
        <div id="pos" class="mono" style="color:#9aa09b;font-size:18px"></div>
      </div>
      <div id="text" style="margin-top:24px;font:400 30px/1.5 var(--ui);max-width:62ch"></div>
      <div style="margin-top:32px;display:flex;gap:12px">
        <button id="b-prev" type="button" style="font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #3a403c;background:#262b28;color:#fff;cursor:pointer">Назад</button>
        <button id="b-next" type="button" style="font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#138a4e;color:#fff;cursor:pointer">Дальше</button>
      </div>
    </div>
    <div>
      <div style="color:#9aa09b;font-size:14px">Таймер</div>
      <div id="timer" class="mono" style="font-size:64px;font-weight:600;line-height:1.1">0:00</div>
      <button id="b-reset" type="button" style="font:inherit;font-size:14px;margin-top:8px;padding:4px 12px;border-radius:6px;border:1px solid #3a403c;background:transparent;color:#cfd3cf;cursor:pointer">Сбросить</button>
      <div style="margin-top:32px;color:#9aa09b;font-size:14px">Следующий</div>
      <div id="nextLabel" style="font:600 20px/1.3 var(--display);margin:4px 0 12px"></div>
      <div id="nextThumb" style="position:relative;width:360px;height:202px;overflow:hidden;border-radius:8px;background:#f6f5f1"></div>
    </div>
  </div>`
  const $ = (id: string) => document.getElementById(id)!
  let started = 0
  const send = (msg: Msg) => {
    channel?.postMessage(msg)
    try {
      window.opener?.postMessage(msg, '*')
    } catch {
      /* нет окна-владельца */
    }
  }
  const render = (i: number, step: number) => {
    const s = slides[i]
    $('cur').textContent = s.label
    $('pos').textContent = `${slideNo(i)}   шаг ${step} из ${s.steps}`
    $('text').textContent = s.notes
    const n = slides[i + 1]
    $('nextLabel').textContent = n ? n.label : 'Конец'
    const holder = $('nextThumb')
    holder.innerHTML = ''
    if (n) {
      const el = build(n, i + 1, 'n-')
      const coins = el.querySelector('.coins')
      if (coins) coins.innerHTML = coinsPicture()
      el.style.display = 'block'
      el.style.transform = 'scale(0.1875)'
      el.style.transformOrigin = '0 0'
      applyStep(el, n, n.steps)
      n.step?.(el, n.steps, { instant: true, print: false })
      holder.appendChild(el)
    }
    if (!started && (i > 0 || step > 1)) started = Date.now()
  }
  const onMsg = (msg: Msg) => {
    if (msg.type === 'state') render(msg.i, msg.step)
  }
  channel?.addEventListener('message', (e) => onMsg(e.data as Msg))
  window.addEventListener('message', (e) => e.data && typeof e.data === 'object' && onMsg(e.data as Msg))
  $('b-next').addEventListener('click', () => send({ type: 'nav', dir: 'next' }))
  $('b-prev').addEventListener('click', () => send({ type: 'nav', dir: 'prev' }))
  $('b-reset').addEventListener('click', () => (started = Date.now()))
  window.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
      e.preventDefault()
      send({ type: 'nav', dir: 'next' })
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault()
      send({ type: 'nav', dir: 'prev' })
    }
  })
  window.setInterval(() => {
    const sec = started ? Math.floor((Date.now() - started) / 1000) : 0
    $('timer').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }, 500)
  render(0, 1)
  send({ type: 'hello' })
}
