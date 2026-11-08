// Сцена 7 (735-825, локальный 0 = глобальный 731). Два судьи разных вендоров и арбитр.
// Плитки по очереди поворачиваются лицом к камере, линия «только спорное» рисуется штрихом.
import { useCurrentFrame } from 'remotion'
import { judges } from '../data'
import { Stage, project, useMat, type Cam } from '../three/Stage'
import { C, DarkBg, EASE_IO, MONO, progress, Title, UI } from '../lib'

const G = (g: number) => g - 731
const TW = 2.7
const TH = 1.8
const TILES = [
  { id: 'A', x: -4.3, role: 'Судья A', model: judges.A, at: 742 },
  { id: 'B', x: -1.2, role: 'Судья B', model: judges.B, at: 750 },
  { id: 'R', x: 3.9, role: 'Арбитр', model: judges.arbiter, at: 758 },
]

export const judgeCam = (f: number): Cam => {
  const z = 13.6 - 1.2 * progress(f, 0, 94, EASE_IO) // наезд
  return { pos: [-0.2, 2.6, z], target: [-0.2, 1.05, 0], fov: 30 }
}
const turn = (f: number, at: number) => progress(f, G(at), 16, EASE_IO)

function Tiles({ f }: { f: number }) {
  const judge = useMat('tileGreen')
  const arb = useMat('white')
  const base = useMat('dark')
  return (
    <>
      {TILES.map((t) => {
        const k = turn(f, t.at)
        const appear = progress(f, G(736) + (t.id === 'R' ? 6 : 0), 12, EASE_IO)
        return (
          <group key={t.id} position={[t.x, 0, 0]}>
            <mesh position={[0, 0.04, 0]} material={base} receiveShadow castShadow>
              <boxGeometry args={[TW * 0.6, 0.08, 0.7]} />
            </mesh>
            <mesh position={[0, 0.08 + TH / 2 - (1 - appear) * 0.6, 0]} rotation-y={(1 - k) * 1.25} scale={[1, Math.max(appear, 0.001), 1]} material={t.id === 'R' ? arb : judge} castShadow receiveShadow>
              <boxGeometry args={[TW, TH, 0.16]} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

export function S7Judges() {
  const f = useCurrentFrame()
  const cam = judgeCam(f)
  // точки для линии: под судьями скобка, от неё к арбитру
  const a = project(cam, [TILES[0].x, 0.02, 0.6])
  const b = project(cam, [TILES[1].x, 0.02, 0.6])
  const r = project(cam, [TILES[2].x - TW / 2 - 0.1, 0.9, 0.1])
  const mid = (a[0] + b[0]) / 2
  const bracketY = Math.max(a[1], b[1]) + 34
  const line = progress(f, G(766), 18, EASE_IO)
  const d = `M${a[0]} ${a[1] + 8} V${bracketY} H${b[0]} V${b[1] + 8} M${mid} ${bracketY} V${bracketY + 40} H${r[0] - 120} L${r[0]} ${r[1]}`
  return (
    <>
      <DarkBg />
      <Stage cam={cam} world="dark" shadowSize={9}>
        <Tiles f={f} />
      </Stage>
      <Title text="Два судьи и арбитр" delay={G(736)} color="#ffffff" />
      {TILES.map((t) => {
        const k = turn(f, t.at)
        const [x, y] = project(cam, [t.x, 0.08 + TH / 2, 0.1])
        const dark = t.id === 'R'
        return (
          <div key={t.id} style={{ position: 'absolute', left: x - 200, top: y - 52, width: 400, textAlign: 'center', opacity: progress(f, G(t.at) + 10, 10) * k }}>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 44, color: dark ? C.text : '#ffffff' }}>{t.role}</div>
            <div style={{ fontFamily: MONO, fontSize: 26, color: dark ? C.accentDark : '#e6f1ea', marginTop: 6 }}>{t.model}</div>
          </div>
        )
      })}
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={d} fill="none" stroke={C.accentGlow} strokeWidth={2} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - line} />
      </svg>
      <div style={{ position: 'absolute', left: (mid + r[0]) / 2 - 140, top: bracketY + 50, width: 280, textAlign: 'center', fontFamily: MONO, fontSize: 26, color: C.accentGlow, opacity: progress(f, G(776), 10) }}>
        только спорное
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', fontFamily: UI, fontSize: 44, fontWeight: 500, color: '#ffffff', opacity: progress(f, G(784), 12), transform: `translateY(${(1 - progress(f, G(784), 12)) * 14}px)` }}>
        баллы считает <span style={{ color: C.accentGlow, fontWeight: 700 }}>код</span>
      </div>
    </>
  )
}
