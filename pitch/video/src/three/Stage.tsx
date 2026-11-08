// Общая 3D-сцена ролика: один мягкий ключевой свет сверху-слева, один контровой, ровное окружение
// без бликов-«шаров», пол только с тенью (фон рисует HTML). Камера задаётся функцией от кадра,
// поэтому кадр зависит только от номера кадра.
import { ThreeCanvas } from '@remotion/three'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { useCurrentFrame } from 'remotion'
import {
  BackSide, BufferAttribute, Color, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator,
  Scene, SphereGeometry, Vector3, type DirectionalLight,
} from 'three'

export type Cam = { pos: [number, number, number]; target: [number, number, number]; fov: number }
export type World = 'dark' | 'light'

export const W = 1920
export const H = 1080

/** Матовые материалы из брифа: зелёный с лёгким металлом, тёмно-зелёный, белый матовый. */
export const MAT = {
  green: () => new MeshStandardMaterial({ color: '#138a4e', metalness: 0.6, roughness: 0.35 }),
  greenSoft: () => new MeshStandardMaterial({ color: '#2a9d63', metalness: 0.45, roughness: 0.45 }),
  dark: () => new MeshStandardMaterial({ color: '#0e3b27', metalness: 0.5, roughness: 0.42 }),
  darkLift: () => new MeshStandardMaterial({ color: '#17533a', metalness: 0.45, roughness: 0.45 }),
  white: () => new MeshStandardMaterial({ color: '#f3f2ec', metalness: 0, roughness: 0.82 }),
  grey: () => new MeshStandardMaterial({ color: '#c9cbc4', metalness: 0, roughness: 0.85 }),
  tile: () => new MeshStandardMaterial({ color: '#17533a', metalness: 0.25, roughness: 0.7 }),
  tileGreen: () => new MeshStandardMaterial({ color: '#138a4e', metalness: 0.4, roughness: 0.55 }),
  red: () => new MeshStandardMaterial({ color: '#b4232c', metalness: 0.2, roughness: 0.5 }),
}

/** Окружение: сфера с вертикальным градиентом, без источников-точек, поэтому без круглых бликов. */
function useGradientEnvironment(world: World) {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    const env = new Scene()
    const geo = new SphereGeometry(10, 32, 16)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const top = new Color(world === 'dark' ? '#86a897' : '#ffffff')
    const mid = new Color(world === 'dark' ? '#5f7d6d' : '#b9bcb4')
    const bottom = new Color(world === 'dark' ? '#0b2a1c' : '#7d8079')
    const c = new Color()
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) / 10
      if (y > 0) c.copy(mid).lerp(top, y ** 0.7)
      else c.copy(mid).lerp(bottom, Math.min(1, -y * 1.6))
      colors.set([c.r, c.g, c.b], i * 3)
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    env.add(new Mesh(geo, new MeshBasicMaterial({ side: BackSide, vertexColors: true })))
    const pmrem = new PMREMGenerator(gl)
    const rt = pmrem.fromScene(env, 0.08)
    scene.environment = rt.texture
    scene.environmentIntensity = world === 'dark' ? 0.42 : 0.7
    return () => {
      rt.dispose()
      pmrem.dispose()
      geo.dispose()
    }
  }, [gl, scene, world])
}

function CameraRig({ cam }: { cam: Cam }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  camera.fov = cam.fov
  camera.aspect = W / H
  camera.position.set(...cam.pos)
  camera.lookAt(...cam.target)
  camera.updateProjectionMatrix()
  return null
}

function Lights({ world, shadowSize }: { world: World; shadowSize: number }) {
  const setup = (light: DirectionalLight | null) => {
    if (!light) return
    light.shadow.mapSize.set(2048, 2048)
    const s = shadowSize
    Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 })
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.radius = 5
    light.shadow.bias = -0.0004
    light.shadow.normalBias = 0.02
  }
  return (
    <>
      <hemisphereLight args={[world === 'dark' ? '#cfe3d8' : '#ffffff', world === 'dark' ? '#082518' : '#c9c6bb', world === 'dark' ? 0.5 : 0.9]} />
      {/* ключевой свет сверху-слева */}
      <directionalLight ref={setup} castShadow position={[-6, 11, 7]} intensity={world === 'dark' ? 2.3 : 2.0} color="#fffaf0" />
      {/* контровой */}
      <directionalLight position={[5, 4, -9]} intensity={world === 'dark' ? 1.6 : 0.9} color="#bfe8cf" />
    </>
  )
}

/** Пол: только тень, мягкая. Фон под ним рисует HTML. */
export function ShadowFloor({ y = 0, opacity = 0.32, size = 80 }: { y?: number; opacity?: number; size?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y} receiveShadow>
      <planeGeometry args={[size, size]} />
      <shadowMaterial opacity={opacity} transparent />
    </mesh>
  )
}

function Env({ world }: { world: World }) {
  useGradientEnvironment(world)
  return null
}

export function Stage({ cam, world, children, shadowSize = 12, floorY = 0, floorOpacity, style }: {
  cam: Cam
  world: World
  children: ReactNode
  shadowSize?: number
  floorY?: number
  floorOpacity?: number
  style?: React.CSSProperties
}) {
  return (
    <ThreeCanvas
      width={W}
      height={H}
      shadows="percentage"
      dpr={1}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: cam.fov, position: cam.pos, near: 0.1, far: 120 }}
      style={{ position: 'absolute', left: 0, top: 0, ...style }}
    >
      <CameraRig cam={cam} />
      <Env world={world} />
      <Lights world={world} shadowSize={shadowSize} />
      <ShadowFloor y={floorY} opacity={floorOpacity ?? (world === 'dark' ? 0.42 : 0.2)} />
      {children}
    </ThreeCanvas>
  )
}

/** Проекция 3D-точки в пиксели кадра той же камерой: подписи HTML привязаны к объектам. */
const scratch = new PerspectiveCamera()
const v = new Vector3()
export function project(cam: Cam, p: [number, number, number]): [number, number] {
  scratch.fov = cam.fov
  scratch.aspect = W / H
  scratch.near = 0.1
  scratch.far = 120
  scratch.position.set(...cam.pos)
  scratch.lookAt(...cam.target)
  scratch.updateProjectionMatrix()
  scratch.updateMatrixWorld()
  v.set(...p).project(scratch)
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]
}

/** Материал, созданный один раз на компонент. */
export function useMat(kind: keyof typeof MAT) {
  return useMemo(() => MAT[kind](), [kind])
}

/** Кадр внутри Sequence; удобно для 3D-детей. */
export const useF = useCurrentFrame
