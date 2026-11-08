// Сцена 2 (75-195, локальный кадр 0 = глобальный 69). «LLM-судья предвзят»: весы и коробка-судья в 3D.
// Позиционный перекос: одинаковые A и B меняются местами, весы всё равно клонятся к первому месту.
// На длину: длинная колонка текста тяжелее. Нестабильность: одна карточка дважды падает в судью, выходят 85,00 и 80,50.
import { useCurrentFrame } from 'remotion'
import { Stage, project, useMat, type Cam } from '../three/Stage'
import { bias } from '../data'
import { C, Chip, Kappa, DarkBg, DISPLAY, EASE_IO, EASE_OUT, MONO, progress, Title, UI, vis } from '../lib'

const G = (g: number) => g - 69 // глобальный кадр → локальный

export const biasCam = (f: number): Cam => {
  const z = 14.2 - 1.4 * progress(f, 0, 130, EASE_IO) // наезд, одна ось
  return { pos: [-0.9, 3.9, z], target: [-0.9, 1.75, 0], fov: 30 }
}

const PIVOT: [number, number, number] = [-1.3, 2.55, 0]
const HALF = 1.75
const HANG = 1.05

/** Угол балки в радианах по кадру: позиционный → качание при обмене → на длину. */
function beamAngle(f: number) {
  const deg = (d: number) => (d * Math.PI) / 180
  const settleA = progress(f, G(86), 14, EASE_OUT) // A слева, B справа: клонится к первому месту
  let a = deg(-7) * settleA
  // обмен местами G(98..110): стрелка качается через ноль и снова к первому месту
  const sw = progress(f, G(98), 14, EASE_IO)
  if (sw > 0 && sw < 1) a = deg(-7) * Math.cos(sw * Math.PI * 2) * (1 - 0.25 * Math.sin(sw * Math.PI))
  // на длину G(122..): длинная колонка справа тяжелее
  const len = progress(f, G(126), 16, EASE_OUT)
  a = a * (1 - len) + deg(10) * len
  return a
}

function panPos(f: number, side: -1 | 1): [number, number, number] {
  const a = beamAngle(f)
  // балка вращается вокруг оси z: правый конец вниз при положительном угле
  const x = PIVOT[0] + side * HALF * Math.cos(a)
  const y = PIVOT[1] - side * HALF * Math.sin(a)
  return [x, y - HANG, 0]
}

function Scale({ f }: { f: number }) {
  const green = useMat('green')
  const dark = useMat('darkLift')
  const white = useMat('white')
  const a = beamAngle(f)
  const appear = progress(f, G(78), 16, EASE_OUT)
  return (
    <group position-y={(1 - appear) * -0.4} scale={0.6 + 0.4 * appear}>
      {/* основание и стойка */}
      <mesh position={[PIVOT[0], 0.09, 0]} material={dark} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.18, 0.9]} />
      </mesh>
      <mesh position={[PIVOT[0], PIVOT[1] / 2, 0]} material={dark} castShadow>
        <cylinderGeometry args={[0.08, 0.11, PIVOT[1], 24]} />
      </mesh>
      {/* балка на оси со стрелкой */}
      <group position={PIVOT} rotation-z={-a}>
        <mesh material={green} castShadow>
          <boxGeometry args={[HALF * 2 + 0.2, 0.12, 0.22]} />
        </mesh>
        <mesh position={[0, 0.42, 0]} material={white} castShadow>
          <coneGeometry args={[0.07, 0.7, 16]} />
        </mesh>
      </group>
      <mesh position={PIVOT} rotation-x={Math.PI / 2} material={white}>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 24]} />
      </mesh>
      {/* чаши на нитях, всегда горизонтальны */}
      {([-1, 1] as const).map((side) => {
        const p = panPos(f, side)
        return (
          <group key={side} position={p}>
            <mesh position-y={HANG / 2} material={white}>
              <cylinderGeometry args={[0.012, 0.012, HANG, 6]} />
            </mesh>
            <mesh material={white} castShadow receiveShadow>
              <cylinderGeometry args={[0.72, 0.6, 0.08, 40]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Плашки A и B: одинаковые, меняются местами по дуге. */
function plateA(f: number, which: 0 | 1): [number, number, number] {
  const sw = progress(f, G(98), 14, EASE_IO)
  const fromSide = which === 0 ? -1 : 1
  const L = panPos(f, fromSide as -1 | 1)
  const R = panPos(f, (-fromSide) as -1 | 1)
  const x = L[0] + (R[0] - L[0]) * sw
  const y = L[1] + (R[1] - L[1]) * sw + Math.sin(Math.PI * sw) * 1.3 * (which === 0 ? 1 : 0.7)
  const z = Math.sin(Math.PI * sw) * (which === 0 ? 0.6 : -0.6)
  const drop = 1 - progress(f, G(84) + which * 3, 12, EASE_OUT)
  return [x, y + 0.31 + drop * 2.4, z]
}

function Plates({ f }: { f: number }) {
  const white = useMat('white')
  const out = progress(f, G(116), 10, EASE_IO)
  if (f < G(82) || out >= 1) return null
  return (
    <>
      {([0, 1] as const).map((w) => {
        const p = plateA(f, w)
        return (
          <mesh key={w} position={[p[0], p[1] + out * 3, p[2]]} scale={1 - out} material={white} castShadow>
            <boxGeometry args={[0.95, 0.5, 0.5]} />
          </mesh>
        )
      })}
    </>
  )
}

/** Колонки текста: короткая слева (3 строки), длинная справа (8 строк). Строки падают стопкой. */
function Columns({ f }: { f: number }) {
  const white = useMat('white')
  const green = useMat('greenSoft')
  if (f < G(116)) return null
  return (
    <>
      {([-1, 1] as const).map((side) => {
        const n = side === -1 ? 3 : 8
        const p = panPos(f, side)
        return Array.from({ length: n }, (_, k) => {
          const d = 1 - progress(f, G(118) + k * 1.2 + (side === 1 ? 2 : 0), 10, EASE_OUT)
          return (
            <mesh key={`${side}-${k}`} position={[p[0], p[1] + 0.1 + k * 0.11 + d * 2.2, 0]} material={k % 2 ? green : white} castShadow>
              <boxGeometry args={[0.9 - (k % 3) * 0.12, 0.08, 0.6]} />
            </mesh>
          )
        })
      })}
    </>
  )
}

const BOX: [number, number, number] = [2.75, 0, 0.2]

/** Коробка-судья и две одинаковые карточки, падающие в прорезь. */
function JudgeBox({ f }: { f: number }) {
  const dark = useMat('dark')
  const green = useMat('green')
  const white = useMat('white')
  const drop = 1 - progress(f, G(140), 14, EASE_OUT)
  if (f < G(138)) return null
  const card = (start: number) => {
    const p = progress(f, start, 10, EASE_IO)
    if (p <= 0 || p >= 1) return null
    return (
      <mesh position={[BOX[0], 1.4 + (1 - p) * 2.2 - p * 0.8, BOX[2]]} rotation-z={(1 - p) * 0.3} material={white} castShadow>
        <boxGeometry args={[0.85, 0.06, 0.55]} />
      </mesh>
    )
  }
  return (
    <>
      <group position={[BOX[0], drop * 2.6, BOX[2]]}>
        <mesh position-y={0.65} material={dark} castShadow receiveShadow>
          <boxGeometry args={[1.5, 1.3, 1.2]} />
        </mesh>
        <mesh position={[0, 1.31, 0]} material={green}>
          <boxGeometry args={[1.0, 0.02, 0.14]} />
        </mesh>
        <mesh position={[0, 0.42, 0.61]} material={green}>
          <boxGeometry args={[1.0, 0.1, 0.02]} />
        </mesh>
      </group>
      {card(G(148))}
      {card(G(160))}
    </>
  )
}

/** Чек с числом, выезжающий из щели коробки. */
function Receipt({ f, at, value, cam, idx, struck }: { f: number; at: number; value: string; cam: Cam; idx: number; struck?: boolean }) {
  const p = progress(f, at, 12, EASE_OUT)
  if (p <= 0) return null
  const [x, y] = project(cam, [BOX[0], 0.42, BOX[2] + 0.62])
  const slide = 30 + p * 70 + idx * 92
  return (
    <div style={{ position: 'absolute', left: x - 92, top: y + 8, width: 184, height: slide, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: 184, padding: '14px 0 12px', borderRadius: '0 0 6px 6px', background: '#fbfaf6', boxShadow: '0 10px 18px rgba(0,0,0,0.35)', textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 40, color: struck ? C.no : C.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

const ROWS = [
  { at: 86, name: 'Позиционный', chips: ['arXiv 2305.17926'] },
  { at: 118, name: 'На длину', chips: ['MT-Bench 2306.05685'] },
  { at: 146, name: 'Нестабильность', chips: ['Kili 2026'] },
]

export function S2Bias() {
  const f = useCurrentFrame()
  const cam = biasCam(f)
  const kap = progress(f, G(160), 14)
  return (
    <>
      <DarkBg />
      <Stage cam={cam} world="dark" shadowSize={9}>
        <Scale f={f} />
        <Plates f={f} />
        <Columns f={f} />
        <JudgeBox f={f} />
      </Stage>
      {/* подписи A и B на плашках */}
      {f >= G(84) && f < G(118) &&
        ([0, 1] as const).map((w) => {
          const [x, y] = project(cam, plateA(f, w))
          return (
            <div key={w} style={{ position: 'absolute', left: x - 30, top: y - 32, width: 60, textAlign: 'center', fontFamily: DISPLAY, fontVariationSettings: "'wght' 700", fontSize: 44, color: C.dark, opacity: vis(f, G(88), G(112)) }}>
              {w === 0 ? 'A' : 'B'}
            </div>
          )
        })}
      <Receipt f={f} at={G(154)} value={`${bias.runs[0]}`} cam={cam} idx={0} />
      <Receipt f={f} at={G(166)} value={`${bias.runs[1]}`} cam={cam} idx={1} struck />
      <Title text="LLM-судья предвзят" delay={G(78)} color="#ffffff" />
      {/* список перекосов слева: каждый остаётся до конца сцены */}
      {ROWS.map((r, i) => {
        const p = progress(f, G(r.at), 14)
        const active = i === ROWS.length - 1 ? 1 : 1 - 0.5 * progress(f, G(ROWS[i + 1].at), 10)
        return (
          <div key={r.name} style={{ position: 'absolute', left: 120, top: 330 + i * 150, opacity: p * active, transform: `translateX(${(1 - p) * -24}px)` }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 44, color: '#fff' }}>{r.name}</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              {r.chips.map((c) => (
                <Chip key={c} dark>{c}</Chip>
              ))}
            </div>
          </div>
        )
      })}
      {/* потолок людей справа */}
      <div style={{ position: 'absolute', left: 1440, top: 236, width: 440, whiteSpace: 'nowrap', opacity: kap, transform: `translateY(${(1 - kap) * 20}px)` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 108, letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(160), 20)}` }}>
          <Kappa size={112} gap={0.18} />
          {bias.ceiling}
        </div>
        <div style={{ fontFamily: UI, fontSize: 32, color: C.darkText, marginTop: 14 }}>эксперты между собой</div>
        <div style={{ marginTop: 14 }}>
          <Chip dark>NVIDIA 2510.09738</Chip>
        </div>
      </div>
    </>
  )
}
