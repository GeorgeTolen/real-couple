// Сцена 1 (0-75). Монеты лежат россыпью, за 40 кадров собираются в кольцо, камера орбитой 10°.
import { useCurrentFrame } from 'remotion'
import { Coins3D } from '../three/Coins3D'
import { Stage, type Cam } from '../three/Stage'
import { C, DarkBg, DISPLAY, EASE_IO, progress, TW, UI } from '../lib'

export const titleCam = (frame: number): Cam => {
  const a = ((-5 + 10 * progress(frame, 0, 90, EASE_IO)) * Math.PI) / 180
  const r = 13.2
  return { pos: [Math.sin(a) * r, 7.4, Math.cos(a) * r], target: [0, -0.55, 0], fov: 28 }
}

function CQA({ frame }: { frame: number }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 418, textAlign: 'center', fontFamily: DISPLAY, fontSize: 196, letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, textShadow: '0 6px 30px rgba(8,37,24,0.55)' }}>
      {[...'CQA'].map((c, i) => {
        const p = progress(frame, 24 + i * 4, TW)
        return (
          <span key={i} style={{ display: 'inline-block', opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * 30}px)`, fontVariationSettings: `'wght' ${250 + 450 * p}` }}>
            {c}
          </span>
        )
      })}
    </div>
  )
}

export function S1Title() {
  const frame = useCurrentFrame()
  const sub = progress(frame, 40, 16)
  const line = progress(frame, 36, 22)
  return (
    <>
      <DarkBg />
      <Stage cam={titleCam(frame)} world="dark" floorY={-1.45}>
        <Coins3D frame={frame} assembleFrom={4} assembleDur={40} />
      </Stage>
      <CQA frame={frame} />
      <div style={{ position: 'absolute', left: 860, width: 200, top: 640, height: 3, borderRadius: 2, background: C.accentGlow, transform: `scaleX(${line})` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', fontFamily: UI, fontSize: 40, fontWeight: 500, color: '#e6f1ea', opacity: sub, transform: `translateY(${(1 - sub) * 14}px)` }}>
        Контроль качества поддержки, которому можно верить
      </div>
    </>
  )
}
