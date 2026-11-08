// Кольцо объёмных монет. Перенесено из frontend/src/components/tengeScene.ts без изменения сцены;
// добавлены preserveDrawingBuffer и snapshot() для режима печати.
import {
  ACESFilmicToneMapping, CanvasTexture, CircleGeometry, Color, DirectionalLight, ExtrudeGeometry, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, Object3D, PerspectiveCamera, PMREMGenerator, Quaternion, Scene, Shape,
  TorusGeometry, Vector2, WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type CoinState = { progress: number; settled: boolean }
export type CoinControls = { update: (state: CoinState) => void; dispose: () => void; snapshot: () => string; tilt: (deg: number) => void }

const COINS = 12
const RING_RADIUS = 2.9
const BASE_SPEED = (Math.PI * 2) / 20
const MAX_PARALLAX = (6 * Math.PI) / 180
const THICKNESS = 0.16
const COIN_COLORS = ['#0e3b27', '#106b3d', '#138a4e']

function reededDisk(radius: number, teeth: number): Shape {
  // Рифлёный гурт настоящей геометрией: контур диска с мелкими насечками.
  const points: Vector2[] = []
  const steps = teeth * 2
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    const r = radius * (i % 2 === 0 ? 1 : 0.982)
    points.push(new Vector2(Math.cos(angle) * r, Math.sin(angle) * r))
  }
  return new Shape(points)
}

function rect(x0: number, x1: number, y0: number, y1: number): Shape {
  return new Shape([new Vector2(x0, y0), new Vector2(x1, y0), new Vector2(x1, y1), new Vector2(x0, y1)])
}

function tengeShapes(): Shape[] {
  // Знак ₸: верхняя планка и вторая планка с вертикальной ножкой.
  const top = rect(-0.42, 0.42, 0.34, 0.47)
  const stem = new Shape([
    new Vector2(-0.42, 0.08), new Vector2(0.42, 0.08), new Vector2(0.42, 0.21), new Vector2(-0.42, 0.21),
  ].reverse())
  const body = new Shape([
    new Vector2(-0.42, 0.21), new Vector2(-0.42, 0.08), new Vector2(-0.07, 0.08), new Vector2(-0.07, -0.52),
    new Vector2(0.07, -0.52), new Vector2(0.07, 0.08), new Vector2(0.42, 0.08), new Vector2(0.42, 0.21),
  ])
  void stem
  return [top, body]
}

function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  const gradient = context.createRadialGradient(128, 128, 16, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  return new CanvasTexture(canvas)
}

export function mountCoins(host: HTMLElement, initial: CoinState): CoinControls {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture

  const camera = new PerspectiveCamera(30, 2, 0.1, 50)
  camera.position.set(0, 2.1, 11)
  camera.lookAt(0, 0, 0)
  const light = new DirectionalLight(new Color('#d7f0e0'), 2.4)
  light.position.set(3, 6, 5)
  scene.add(light)

  // Общая геометрия на все монеты: несколько мешей, но один набор вершин.
  const body = new ExtrudeGeometry(reededDisk(1, 72), {
    depth: THICKNESS, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1,
  })
  body.translate(0, 0, -THICKNESS / 2)
  const glyph = new ExtrudeGeometry(tengeShapes(), {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2,
  })
  const rim = new TorusGeometry(0.84, 0.022, 8, 72)

  const bodyMaterials = COIN_COLORS.map(
    (color) => new MeshPhysicalMaterial({ color, metalness: 0.92, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  )
  const reliefMaterial = new MeshPhysicalMaterial({ color: '#a5c9ad', metalness: 0.9, roughness: 0.3 })

  const rig = new Group()
  rig.rotation.x = 0.22
  const ring = new Group()
  rig.add(ring)
  scene.add(rig)

  const coins: { node: Object3D; phase: number; base: Quaternion; baseY: number }[] = []
  const face = THICKNESS / 2 + 0.03
  for (let i = 0; i < COINS; i += 1) {
    const coin = new Group()
    coin.add(new Mesh(body, bodyMaterials[i % bodyMaterials.length]))
    for (const side of [1, -1]) {
      const sign = new Mesh(glyph, reliefMaterial)
      const ringMesh = new Mesh(rim, reliefMaterial)
      if (side === 1) {
        sign.position.z = face
        ringMesh.position.z = face
      } else {
        sign.rotation.y = Math.PI
        sign.position.z = -face
        ringMesh.position.z = -face
      }
      coin.add(sign, ringMesh)
    }
    const angle = (i / COINS) * Math.PI * 2
    coin.position.set(Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS)
    // Монета смотрит наружу кольца, с разворотом, как у катящейся по кругу.
    coin.rotation.set(0.12, angle + 0.7, 0.18)
    ring.add(coin)
    coins.push({ node: coin, phase: i * 0.7, base: coin.quaternion.clone(), baseY: 0 })
  }

  const shadowMap = shadowTexture()
  const shadowMaterial = new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false })
  const shadow = new Mesh(new CircleGeometry(4.6, 48), shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -1.45
  scene.add(shadow)

  let state = initial
  let frame = 0
  let running = false
  let last = 0
  let visible = true
  let settledDone = false
  let targetX = 0
  let targetY = 0
  let baseTilt = 0 // параллакс по шагам презентации, радианы
  let frameAverage = 0
  const facing = new Quaternion()

  const resize = () => {
    const width = host.clientWidth || 1
    const height = host.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const renderOnce = (now: number) => {
    const started = performance.now()
    const dt = Math.min((now - last) / 1000 || 0, 0.05)
    last = now
    rig.rotation.y += (targetY + baseTilt - rig.rotation.y) * 0.05
    rig.rotation.x += (0.22 + targetX - rig.rotation.x) * 0.08
    let moved = false
    if (state.settled) {
      // Кольцо останавливается, монеты разворачиваются лицевой стороной к камере.
      ring.getWorldQuaternion(facing).invert()
      for (const coin of coins) {
        coin.node.quaternion.slerp(facing, 0.06)
        coin.node.position.y += (0 - coin.node.position.y) * 0.06
        if (coin.node.quaternion.angleTo(facing) > 0.01) moved = true
      }
    } else {
      ring.rotation.y += BASE_SPEED * (1 + 3 * state.progress) * dt
      for (const coin of coins) {
        coin.node.position.y = Math.sin(now / 1100 + coin.phase) * 0.09
      }
    }
    renderer.render(scene, camera)
    frameAverage = frameAverage * 0.95 + (performance.now() - started) * 0.05
    host.dataset.frameMs = frameAverage.toFixed(2)
    settledDone = state.settled && !moved
  }

  const loop = (now: number) => {
    if (!running) return
    renderOnce(now)
    if (settledDone) {
      running = false
      host.dataset.coinsState = 'settled'
      return
    }
    frame = requestAnimationFrame(loop)
  }

  const refresh = () => {
    const shouldRun = visible && !document.hidden && !settledDone
    if (shouldRun && !running) {
      running = true
      last = performance.now()
      frame = requestAnimationFrame(loop)
    } else if (!shouldRun && running) {
      running = false
      cancelAnimationFrame(frame)
    }
    host.dataset.coinsRunning = String(running)
  }

  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting)
    refresh()
  })
  intersection.observe(host)
  const resizer = new ResizeObserver(resize)
  resizer.observe(host)
  const onVisibility = () => refresh()
  document.addEventListener('visibilitychange', onVisibility)
  const onPointer = (event: PointerEvent) => {
    const box = host.getBoundingClientRect()
    targetY = (((event.clientX - box.left) / box.width) * 2 - 1) * MAX_PARALLAX
    targetX = (((event.clientY - box.top) / box.height) * 2 - 1) * MAX_PARALLAX
  }
  const onLeave = () => {
    targetX = 0
    targetY = 0
  }
  host.addEventListener('pointermove', onPointer)
  host.addEventListener('pointerleave', onLeave)

  resize()
  renderOnce(performance.now())
  refresh()

  return {
    tilt(deg) {
      baseTilt = (deg * Math.PI) / 180
      refresh()
    },
    snapshot() {
      renderOnce(performance.now())
      return renderer.domElement.toDataURL('image/png')
    },
    update(next) {
      if (state.settled && !next.settled) settledDone = false
      state = next
      if (next.settled) delete host.dataset.coinsState
      refresh()
    },
    dispose() {
      running = false
      cancelAnimationFrame(frame)
      intersection.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onPointer)
      host.removeEventListener('pointerleave', onLeave)
      body.dispose()
      glyph.dispose()
      rim.dispose()
      shadow.geometry.dispose()
      shadowMaterial.dispose()
      shadowMap.dispose()
      bodyMaterials.forEach((material) => material.dispose())
      reliefMaterial.dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
