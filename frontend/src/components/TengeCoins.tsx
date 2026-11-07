import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CoinControls } from './tengeScene'

function canUse3d(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function StaticCoins() {
  // Запасной вид без WebGL и при уменьшенном движении: неподвижное кольцо монет.
  const count = 10
  return (
    <svg viewBox="0 0 480 240" role="img" aria-label="Кольцо монет со знаком тенге">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2
        const x = 240 + Math.sin(angle) * 150
        const y = 116 + Math.cos(angle) * 44
        const scale = 0.72 + ((Math.cos(angle) + 1) / 2) * 0.5
        return { i, x, y, scale }
      })
        .sort((a, b) => a.y - b.y)
        .map(({ i, x, y, scale }) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
            <ellipse rx="34" ry="34" cy="4" fill="#0b2c1d" />
            <ellipse rx="34" ry="34" fill={i % 2 ? '#138a4e' : '#106b3d'} stroke="#a5c9ad" strokeWidth="2" />
            <ellipse rx="28" ry="28" fill="none" stroke="#a5c9ad" strokeWidth="1" />
            <text textAnchor="middle" dy="13" fontSize="36" fontWeight="700" fill="#d9ecdf">₸</text>
          </g>
        ))}
    </svg>
  )
}

export default function TengeCoins({ progress = 0, settled = false, children }: {
  progress?: number
  settled?: boolean
  children?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const controls = useRef<CoinControls | null>(null)
  const latest = useRef({ progress, settled })
  const [threeD, setThreeD] = useState(canUse3d)

  useEffect(() => {
    latest.current = { progress, settled }
    controls.current?.update(latest.current)
  }, [progress, settled])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setThreeD(canUse3d())
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!threeD) return
    let alive = true
    import('./tengeScene')
      .then(({ mountCoins }) => {
        if (!alive || !host.current) return
        controls.current = mountCoins(host.current, latest.current)
      })
      .catch(() => setThreeD(false))
    return () => {
      alive = false
      controls.current?.dispose()
      controls.current = null
    }
  }, [threeD])

  return (
    <div className="coin-stage" data-coins={threeD ? '3d' : 'static'}>
      <div className="coin-host" ref={host} aria-hidden={threeD}>
        {!threeD && <StaticCoins />}
      </div>
      {children && <div className="coin-caption">{children}</div>}
    </div>
  )
}
