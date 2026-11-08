// Сцена 8 (825-900, локальный 0 = глобальный 819). Четыре числа одометром, монеты сцены 1 на заднем плане в расфокусе.
// Постер = глобальный кадр 885.
import { useCurrentFrame } from 'remotion'
import { finals } from '../data'
import { Coins3D } from '../three/Coins3D'
import { Stage } from '../three/Stage'
import { C, DarkBg, DISPLAY, Kappa, MONO, Odometer, progress, UI } from '../lib'
import { titleCam } from './S1Title'

const G = (g: number) => g - 819

export function S8Finale() {
  const f = useCurrentFrame()
  const brand = progress(f, G(846), 14)
  return (
    <>
      <DarkBg />
      {/* те же монеты, кольцо продолжает вращение; расфокус и приглушение */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(14px)', opacity: 0.5, transform: 'scale(1.08)' }}>
        <Stage cam={titleCam(90)} world="dark" floorY={-1.45} floorOpacity={0.3}>
          <Coins3D frame={f + 820} />
        </Stage>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 420px at 50% 46%, rgba(8,37,24,0.55), rgba(8,37,24,0) 70%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 340, display: 'flex', justifyContent: 'center', gap: 88 }}>
        {finals.map((n, i) => {
          const s = G(826) + i * 4
          const p = progress(f, s, 14)
          const kappa = n.prefix.startsWith('κ')
          return (
            <div key={n.label} style={{ textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 104, letterSpacing: '-0.05em', lineHeight: 1.05, color: i === 0 ? '#8be0b2' : '#ffffff', fontVariationSettings: `'wght' ${250 + 450 * progress(f, s, 20)}`, whiteSpace: 'nowrap' }}>
                {kappa && <Kappa gap={0.14} />}
                <Odometer value={n.value} decimals={n.decimals} prefix={kappa ? '' : n.prefix} suffix={n.suffix} start={s} dur={26} />
              </div>
              <div style={{ fontFamily: UI, fontSize: 32, color: C.darkText, marginTop: 16 }}>{n.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 800, textAlign: 'center', opacity: brand, transform: `translateY(${(1 - brand) * 16}px)` }}>
        <div style={{ display: 'inline-block', width: 120, height: 3, borderRadius: 2, background: C.accentGlow, marginBottom: 28, transform: `scaleX(${brand})` }} />
        <div style={{ fontFamily: DISPLAY, fontSize: 52, letterSpacing: '-0.04em', color: '#ffffff', fontVariationSettings: `'wght' ${250 + 450 * progress(f, G(846), 20)}` }}>
          Журнал контроля <span style={{ color: '#8be0b2' }}>· CQA</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 22, color: C.darkText, marginTop: 14, letterSpacing: 1 }}>Freedom Broker · RU KZ EN</div>
      </div>
    </>
  )
}
