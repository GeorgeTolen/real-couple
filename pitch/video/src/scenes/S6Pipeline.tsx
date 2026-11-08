// Сцена 6, первая половина (555-660, локальный 0 = глобальный 551). 3D-конвейер из facts.json → architecture.
// Узлы это матовые плитки на полу, токен ru-014 едет по ленте. Над «Факты кодом» всплывают пять чипов,
// на развилке токен делится на двух судей, сходится на проверке, при споре уходит к арбитру,
// в «Баллы кодом» падает 38,13. Камера едет вдоль ленты (одна ось x).
import { useMemo } from 'react'
import { useCurrentFrame } from 'remotion'
import { Vector3, type Material } from 'three'
import { arch, chips5, words } from '../data'
import { Stage, project, useMat, type Cam } from '../three/Stage'
import { C, DarkBg, DISPLAY, EASE_IO, EASE_OUT, formatNum, MONO, progress, UI } from '../lib'

const G = (g: number) => g - 551

type P3 = [number, number, number]
// раскладка узлов на полу (x вдоль ленты, z поперёк)
const POS: Record<string, P3> = {
  api: [-7.0, 0, 0],
  norm: [-4.9, 0, 0],
  signals: [-2.5, 0, 0],
  compile: [-0.1, 0, 0],
  judgeA: [2.2, 0, -1.25],
  judgeB: [2.2, 0, 1.25],
  check: [4.5, 0, 0],
  arbiter: [6.4, 0, -1.6],
  score: [8.3, 0, 0],
  ui: [10.4, 0, 0],
  appeal: [10.4, 0, 2.0],
  export: [12.5, 0, 0],
}
const SIZE = (id: string): [number, number] => (id === 'signals' ? [1.9, 1.35] : id === 'score' ? [1.7, 1.15] : [1.45, 0.95])
const TH = 0.16

export const pipeCam = (f: number): Cam => {
  const x = -3.4 + 8.6 * progress(f, G(560), 92, EASE_IO)
  return { pos: [x, 9.2, 11.4], target: [x, 0, 0.35], fov: 27 }
}

// маршрут токена: [кадр прихода (глобальный), узел]
const ROUTE: [number, string][] = [
  [562, 'api'],
  [569, 'norm'],
  [576, 'signals'],
  [594, 'signals'],
  [602, 'compile'],
  [611, 'judge'],
  [620, 'check'],
  [628, 'arbiter'],
  [637, 'score'],
]

function at(f: number, branch: 'A' | 'B'): P3 {
  const node = (id: string) => (id === 'judge' ? POS[branch === 'A' ? 'judgeA' : 'judgeB'] : POS[id])
  let p = node(ROUTE[0][1])
  for (let i = 1; i < ROUTE.length; i += 1) {
    const [t0, a] = ROUTE[i - 1]
    const [t1, b] = ROUTE[i]
    const k = progress(f, G(t0), t1 - t0, EASE_IO)
    if (k <= 0) break
    const A = node(a)
    const B = node(b)
    p = [A[0] + (B[0] - A[0]) * k, 0, A[2] + (B[2] - A[2]) * k]
  }
  return [p[0], TH + 0.1, p[2]]
}

/** Плитки судей «вдыхают» при проходе токена: подъём на 6 px (≈ 0,04 ед. при этом масштабе). */
function lift(f: number, id: string) {
  const t = id === 'judgeA' || id === 'judgeB' ? 611 : id === 'check' ? 620 : id === 'arbiter' ? 628 : id === 'score' ? 637 : id === 'signals' ? 576 : null
  if (t === null) return 0
  const up = progress(f, G(t) - 3, 6, EASE_OUT)
  const down = progress(f, G(t) + 6, 10, EASE_IO)
  return 0.04 * (up - down)
}

function Belt({ a, b, mat }: { a: P3; b: P3; mat: Material }) {
  const { pos, len, rot } = useMemo(() => {
    const A = new Vector3(...a)
    const B = new Vector3(...b)
    const d = B.clone().sub(A)
    return { pos: A.clone().add(B).multiplyScalar(0.5), len: d.length(), rot: Math.atan2(-d.z, d.x) }
  }, [a, b])
  return (
    <mesh position={[pos.x, 0.012, pos.z]} rotation-y={rot} material={mat} receiveShadow>
      <boxGeometry args={[len, 0.024, 0.2]} />
    </mesh>
  )
}

function Scene3D({ f }: { f: number }) {
  const tile = useMat('tile')
  const big = useMat('tileGreen')
  const belt = useMat('dark')
  const white = useMat('white')
  const split = f >= G(602)
  const merged = f >= G(620)
  return (
    <>
      {arch.edges.map(([a, b]) =>
        a === 'appeal' ? null : <Belt key={`${a}-${b}`} a={POS[a]} b={POS[b]} mat={belt} />,
      )}
      {arch.nodes.map((n) => {
        const [w, d] = SIZE(n.id)
        const p = POS[n.id]
        const key = n.id === 'signals' || n.id === 'score'
        return (
          <mesh key={n.id} position={[p[0], TH / 2 + lift(f, n.id), p[2]]} material={key ? big : tile} castShadow receiveShadow>
            <boxGeometry args={[w, TH, d]} />
          </mesh>
        )
      })}
      {/* токен-карточка, на развилке две */}
      {f >= G(560) &&
        (split && !merged ? (['A', 'B'] as const) : (['A'] as const)).map((br) => {
          const p = at(f, br)
          const drop = 1 - progress(f, G(558), 8, EASE_OUT)
          return (
            <mesh key={br} position={[p[0], p[1] + 0.06 + drop * 1.5, p[2]]} material={white} castShadow>
              <boxGeometry args={[0.72, 0.07, 0.48]} />
            </mesh>
          )
        })}
    </>
  )
}

export function S6Pipeline() {
  const f = useCurrentFrame()
  const cam = pipeCam(f)
  const sig = project(cam, [POS.signals[0] - 0.95, TH, POS.signals[2] - 0.7])
  const scoreTop = project(cam, [POS.score[0], TH, POS.score[2]])
  const fall = progress(f, G(638), 12, EASE_OUT)
  const tok = at(f, 'A')
  const tokS = project(cam, [tok[0], tok[1] + 0.2, tok[2]])
  const split = f >= G(602) && f < G(620)
  const tokB = project(cam, [at(f, 'B')[0], 0.4, at(f, 'B')[2]])
  return (
    <>
      <DarkBg />
      <Stage cam={cam} world="dark" shadowSize={14}>
        <Scene3D f={f} />
      </Stage>
      {/* подписи узлов у переднего края плитки */}
      {arch.nodes.map((n) => {
        const p = POS[n.id]
        const [, d] = SIZE(n.id)
        const [x, y] = project(cam, [p[0], 0, p[2] + d / 2 + 0.08])
        if (x < -200 || x > 2120) return null
        const key = n.id === 'signals' || n.id === 'score'
        return (
          <div key={n.id} style={{ position: 'absolute', left: x - 150, top: y + 4, width: 300, textAlign: 'center', opacity: progress(f, G(556), 10) }}>
            <div style={{ fontFamily: UI, fontWeight: key ? 700 : 500, fontSize: key ? 34 : 26, color: key ? '#ffffff' : '#e6f1ea', lineHeight: 1.15 }}>{n.label}</div>
            {!key && <div style={{ fontFamily: MONO, fontSize: 17, color: 'rgba(207,227,216,0.7)', marginTop: 4 }}>{n.sub.split(',')[0]}</div>}
          </div>
        )
      })}
      {/* пять фактов кодом всплывают над узлом */}
      {chips5.map((c, k) => {
        const p = progress(f, G(577) + k * 3.5, 12, EASE_OUT)
        if (p <= 0) return null
        return (
          <div key={c} style={{ position: 'absolute', left: sig[0] - 20, top: sig[1] - 60 - (4 - k) * 50 + (1 - p) * 40, opacity: p, fontFamily: MONO, fontSize: 24, padding: '6px 14px', borderRadius: 10, background: 'rgba(8,37,24,0.82)', border: '1px solid rgba(63,191,127,0.55)', color: '#e6f1ea', whiteSpace: 'nowrap' }}>
            <span style={{ color: C.accentGlow, marginRight: 10 }}>✓</span>
            {c}
          </div>
        )
      })}
      {/* ярлык токена */}
      {f >= G(560) && f < G(640) && (
        <>
          <div style={{ position: 'absolute', left: tokS[0] - 50, top: tokS[1] - 46, width: 100, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 22, color: '#fff' }}>{words.left.dialog.replace(/^p1-/, '')}</div>
          {split && <div style={{ position: 'absolute', left: tokB[0] - 50, top: tokB[1] - 46, width: 100, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 22, color: '#fff' }}>{words.left.dialog.replace(/^p1-/, '')}</div>}
        </>
      )}
      {/* спор уходит к арбитру */}
      {(() => {
        const p = Math.min(progress(f, G(620), 8), 1 - progress(f, G(642), 8))
        const [x, y] = project(cam, [(POS.check[0] + POS.arbiter[0]) / 2, 0.3, (POS.check[2] + POS.arbiter[2]) / 2])
        return p > 0 ? <div style={{ position: 'absolute', left: x - 30, top: y - 70, opacity: p, fontFamily: MONO, fontSize: 22, color: C.midMark }}>спор</div> : null
      })()}
      {/* 38,13 падает в «Баллы кодом» */}
      {fall > 0 && (
        <div style={{ position: 'absolute', left: scoreTop[0] - 200, top: scoreTop[1] - 205 - (1 - fall) * 220, width: 400, textAlign: 'center', opacity: Math.min(1, fall * 2), fontFamily: DISPLAY, fontSize: 112, letterSpacing: '-0.05em', color: '#fff', fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(638), 20)}`, textShadow: '0 8px 24px rgba(8,37,24,0.6)' }}>
          {formatNum(words.left.total, 2)}
        </div>
      )}
    </>
  )
}
