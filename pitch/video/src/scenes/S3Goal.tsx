// Сцена 3 (195-285, локальный 0 = глобальный 191). «Стабильно. Честно.»
// Слева парное сравнение исследователей (A · B · ничья), справа наша рубрика: 8 брусков, высота по весу,
// c8 плоский флаг. На c4 и c6 бруски делятся на ступени шкалы. Камера проезжает слева направо.
import { useCurrentFrame } from 'remotion'
import { rubric, steps } from '../data'
import { Stage, project, useMat, type Cam } from '../three/Stage'
import { Appear, C, Caption, EASE_IO, EASE_OUT, LightBg, MONO, progress, Title, UI } from '../lib'

const G = (g: number) => g - 191
const GAP = 0.86
const BW = 0.62
const K = 0.13 // высота на единицу веса
const X0 = 0

export const goalCam = (f: number): Cam => {
  const x = 0.1 + 1.0 * progress(f, 0, 94, EASE_IO) // проезд по x
  return { pos: [x, 5.0, 14.2], target: [x, 1.05, 0], fov: 30 }
}

// после шкальных c4 и c6 лишний зазор под подписи ступеней
const barX = (i: number) => X0 + i * GAP + (i > 3 ? 0.42 : 0) + (i > 5 ? 0.42 : 0)
const grow = (f: number, i: number) => progress(f, G(214) + i * 3.5, 16, EASE_OUT)
const split = (f: number) => progress(f, G(246), 12, EASE_IO)

function Bars({ f }: { f: number }) {
  const green = useMat('green')
  const dark = useMat('darkLift')
  const white = useMat('white')
  const red = useMat('red')
  const s = split(f)
  return (
    <>
      {rubric.map((c, i) => {
        const g = grow(f, i)
        if (g <= 0) return null
        const x = barX(i)
        if (c.w === 0) {
          // c8: плоский флаг на полу
          return (
            <group key={c.id} position={[x, 0, 0]} scale={[1, g, 1]}>
              <mesh position-y={0.05} material={dark} castShadow receiveShadow>
                <boxGeometry args={[BW, 0.1, BW]} />
              </mesh>
              <mesh position={[-0.18, 0.5, 0]} material={white} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 0.8, 8]} />
              </mesh>
              <mesh position={[0.02, 0.76, 0]} material={red} castShadow>
                <boxGeometry args={[0.38, 0.24, 0.03]} />
              </mesh>
            </group>
          )
        }
        const h = c.w * K * g
        const st = steps[c.id]
        if (!st) {
          return (
            <mesh key={c.id} position={[x, h / 2, 0]} material={green} castShadow receiveShadow>
              <boxGeometry args={[BW, Math.max(h, 0.001), BW]} />
            </mesh>
          )
        }
        // шкальный критерий: брусок делится на ступени с зазорами
        const top = st[st.length - 1]
        return (
          <group key={c.id} position-x={x}>
            {st.slice(1).map((v, k) => {
              const lo = (st[k] / top) * h
              const hi = (v / top) * h
              const gap = 0.07 * s
              const y0 = lo + (k === 0 ? 0 : gap / 2)
              const y1 = hi - (k === st.length - 2 ? 0 : gap / 2)
              return (
                <mesh key={v} position-y={(y0 + y1) / 2 + k * 0.05 * s} material={k % 2 ? green : dark} castShadow receiveShadow>
                  <boxGeometry args={[BW + 0.04 * s, Math.max(y1 - y0, 0.001), BW + 0.04 * s]} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </>
  )
}

function Pair({ f }: { f: number }) {
  const items = ['A', 'B', 'ничья']
  return (
    <div style={{ position: 'absolute', left: 120, top: 330 }}>
      <Appear delay={G(202)} dy={12}>
        <div style={{ fontFamily: MONO, fontSize: 24, color: C.text2 }}>парное сравнение</div>
      </Appear>
      <div style={{ display: 'flex', gap: 14, marginTop: 20 }}>
        {items.map((t, i) => {
          const p = progress(f, G(206) + i * 3, 13)
          return (
            // радиусы: карточка 16 = текст-плашка 8 + отступ 8
            <div key={t} style={{ padding: 8, borderRadius: 16, background: C.card, border: `1px solid ${C.line}`, boxShadow: '0 6px 16px rgba(14,59,39,0.08)', opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
              <div style={{ minWidth: t.length > 1 ? 120 : 76, height: 76, borderRadius: 8, background: C.bg2, display: 'grid', placeItems: 'center', fontFamily: UI, fontWeight: 600, fontSize: t.length > 1 ? 32 : 40, color: C.text }}>
                {t}
              </div>
            </div>
          )
        })}
      </div>
      <Appear delay={G(222)} dy={10} style={{ marginTop: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 24, color: C.text2 }}>у нас</div>
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 40, color: C.text, marginTop: 8 }}>8 критериев с весами</div>
      </Appear>
      {/* стрелка к рубрике рисуется штрихом */}
      <svg width={300} height={40} style={{ position: 'absolute', left: 450, top: 252, overflow: 'visible' }}>
        <path d="M0 20 H260 M244 8 L262 20 L244 32" fill="none" stroke={C.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress(f, G(226), 14)} />
      </svg>
    </div>
  )
}

export function S3Goal() {
  const f = useCurrentFrame()
  const cam = goalCam(f)
  const s = split(f)
  return (
    <>
      <LightBg />
      <Stage cam={cam} world="light" shadowSize={8}>
        <group position-x={0}>
          <Bars f={f} />
        </group>
      </Stage>
      <Title text="Стабильно. Честно." delay={G(198)} />
      <Pair f={f} />
      {/* подписи брусков: id снизу, вес сверху */}
      {rubric.map((c, i) => {
        const g = grow(f, i)
        if (g <= 0) return null
        const [bx, by] = project(cam, [barX(i), 0, BW / 2 + 0.25])
        const [tx, ty] = project(cam, [barX(i), (c.w ? c.w * K * g : 0.95) + 0.12, 0])
        return (
          <div key={c.id} style={{ opacity: Math.min(1, g * 1.4) }}>
            <div style={{ position: 'absolute', left: bx - 40, top: by + 6, width: 80, textAlign: 'center', fontFamily: MONO, fontSize: 22, color: C.text2 }}>{c.id}</div>
            <div style={{ position: 'absolute', left: tx - 50, top: ty - 44, width: 100, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 28, color: c.w ? C.text : C.no, fontVariantNumeric: 'tabular-nums' }}>
              {c.w ? c.w : 'флаг'}
            </div>
          </div>
        )
      })}
      {/* ступени шкалы на c4 и c6 */}
      {Object.entries(steps).map(([id, st]) => {
        const i = rubric.findIndex((c) => c.id === id)
        const h = rubric[i].w * K
        const top = st[st.length - 1]
        return st.map((v, k) => {
          const [x, y] = project(cam, [barX(i) + BW / 2 + 0.06, (v / top) * h + k * 0.05 * s - (k ? 0.03 : 0), BW / 2])
          return (
            <div key={`${id}-${v}`} style={{ position: 'absolute', left: x + 8, top: y - 14, fontFamily: MONO, fontWeight: 600, fontSize: 22, color: C.accentDark, opacity: progress(f, G(250) + k * 2, 10) }}>
              {v}
            </div>
          )
        })
      })}
      <Caption delay={G(252)} color={C.text} top={940}>
        <span style={{ fontFamily: UI, fontSize: 34 }}>перекос переезжает в ступени шкалы</span>
      </Caption>
    </>
  )
}
