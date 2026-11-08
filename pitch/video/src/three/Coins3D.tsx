// Монеты ₸ ролика. Геометрия (рифлёный гурт, знак ₸, кант) импортируется из pitch/slides/src/coins.ts,
// той же, что на титуле презентации и в frontend/src/components/tengeScene.ts. Здесь только постановка:
// россыпь на полу → кольцо, всё как функция номера кадра (без Math.random).
import { useMemo } from 'react'
import { ExtrudeGeometry, Euler, Matrix4, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3 } from 'three'
import { COINS, COIN_COLORS, reededDisk, RING_RADIUS, tengeShapes, THICKNESS } from '../../../slides/src/coins'
import { EASE_IO, progress } from '../lib'

export const FLOOR_Y = -1.45

/** Детерминированный генератор (mulberry32) с фиксированным seed. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function useCoinKit() {
  return useMemo(() => {
    const body = new ExtrudeGeometry(reededDisk(1, 72), {
      depth: THICKNESS, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1,
    })
    body.translate(0, 0, -THICKNESS / 2)
    const glyph = new ExtrudeGeometry(tengeShapes(), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 })
    const rim = new TorusGeometry(0.84, 0.022, 8, 72)
    // Материалы по брифу ролика: матовый металл 0.6 / 0.35, без clearcoat.
    const bodies = COIN_COLORS.map((color) => new MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 }))
    const relief = new MeshStandardMaterial({ color: '#cfe3d8', metalness: 0.55, roughness: 0.4 })
    return { body, glyph, rim, bodies, relief }
  }, [])
}

type Pose = { pos: Vector3; quat: Quaternion }

const TILT = 0.22
const tmp = new Matrix4()

function ringPose(i: number, ringAngle: number, bob: number): Pose {
  const angle = (i / COINS) * Math.PI * 2
  const local = new Matrix4().compose(
    new Vector3(Math.sin(angle) * RING_RADIUS, bob, Math.cos(angle) * RING_RADIUS),
    new Quaternion().setFromEuler(new Euler(0.12, angle + 0.7, 0.18)),
    new Vector3(1, 1, 1),
  )
  tmp.makeRotationX(TILT).multiply(new Matrix4().makeRotationY(ringAngle)).multiply(local)
  const pos = new Vector3()
  const quat = new Quaternion()
  tmp.decompose(pos, quat, new Vector3())
  return { pos, quat }
}

const scatter: Pose[] = (() => {
  const rnd = seeded(20261108)
  const out: Pose[] = []
  for (let i = 0; out.length < COINS && i < 400; i += 1) {
    const a = (out.length / COINS) * Math.PI * 2 + rnd() * 0.5
    const r = 2.4 + rnd() * 3.0
    const pos = new Vector3(Math.cos(a) * r * 1.3, FLOOR_Y + THICKNESS / 2 + 0.03, Math.sin(a) * r * 0.8 + 0.4)
    // монеты не лежат друг на друге: минимальное расстояние 2,1 радиуса
    if (out.some((o) => o.pos.distanceTo(pos) < 2.1)) continue
    const quat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + (rnd() - 0.5) * 0.12, 0, rnd() * Math.PI * 2))
    out.push({ pos, quat })
  }
  return out
})()

/**
 * assemble: 0 россыпь на полу, 1 кольцо. Монеты поднимаются по очереди, без отскока.
 * t: секунды для вращения кольца и покачивания.
 */
export function Coins3D({ frame, assembleFrom = -1, assembleDur = 40, spinSeconds = 14, startAngle = 0.4 }: {
  frame: number
  assembleFrom?: number
  assembleDur?: number
  spinSeconds?: number
  startAngle?: number
}) {
  const kit = useCoinKit()
  const t = frame / 30
  const ringAngle = startAngle + (t * Math.PI * 2) / spinSeconds
  const face = THICKNESS / 2 + 0.03
  return (
    <group>
      {Array.from({ length: COINS }, (_, i) => {
        const p = assembleFrom < 0 ? 1 : progress(frame, assembleFrom + i * 1.6, assembleDur - 12, EASE_IO)
        const ring = ringPose(i, ringAngle, Math.sin(t * 0.9 + i * 0.7) * 0.09 * p)
        const from = scatter[i]
        const pos = from.pos.clone().lerp(ring.pos, p)
        // дуга подъёма: монета не скользит по полу, а поднимается
        pos.y += Math.sin(Math.PI * p) * 0.6
        const quat = from.quat.clone().slerp(ring.quat, p)
        return (
          <group key={i} position={pos} quaternion={quat}>
            <mesh geometry={kit.body} material={kit.bodies[i % kit.bodies.length]} castShadow receiveShadow />
            {[1, -1].map((side) => (
              <group key={side}>
                <mesh geometry={kit.glyph} material={kit.relief} position-z={side * face} rotation-y={side === -1 ? Math.PI : 0} castShadow />
                <mesh geometry={kit.rim} material={kit.relief} position-z={side * face} />
              </group>
            ))}
          </group>
        )
      })}
    </group>
  )
}
