import '@fontsource-variable/unbounded'
import '@fontsource-variable/onest'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import { useEffect, useState, type ComponentType } from 'react'
import { AbsoluteFill, continueRender, delayRender, Easing, Freeze, interpolate, Sequence, useCurrentFrame } from 'remotion'
import { outToStory, STORY } from './holds'
import { S1Title } from './scenes/S1Title'
import { S2Bias } from './scenes/S2Bias'
import { S3Goal } from './scenes/S3Goal'
import { S4Instability } from './scenes/S4Instability'
import { S5Models } from './scenes/S5Models'
import { S6Pipeline } from './scenes/S6Pipeline'
import { S6bExamples } from './scenes/S6bExamples'
import { S7Judges } from './scenes/S7Judges'
import { S8Finale } from './scenes/S8Finale'

/** Длина сюжета в кадрах; выходной ролик длиннее на паузы из holds.json. */
export const TOTAL = STORY
/** Шторка между мирами: 8 кадров, по 4 до и после стыка. */
const WIPE = 8
/** Стык внутри одного мира: короткое растворение содержимого (фон одинаковый). */
const BLEND = 6

type World = 'dark' | 'light'
// Раскадровка docs/pitch/PROMPT_video_v2_3d.md. Сцена 6 делится на 3D-конвейер (тёмный) и скриншоты (светлый, с 660).
const SCENES: { start: number; C: ComponentType; world: World }[] = [
  { start: 0, C: S1Title, world: 'dark' },
  { start: 75, C: S2Bias, world: 'dark' },
  { start: 195, C: S3Goal, world: 'light' },
  { start: 285, C: S4Instability, world: 'light' },
  { start: 405, C: S5Models, world: 'light' },
  { start: 555, C: S6Pipeline, world: 'dark' },
  { start: 660, C: S6bExamples, world: 'light' },
  { start: 735, C: S7Judges, world: 'dark' },
  { start: 825, C: S8Finale, world: 'dark' },
]

export const CUTS = SCENES.slice(1).map((s, i) => ({ at: s.start, wipe: s.world !== SCENES[i].world }))

function useFonts() {
  const [handle] = useState(() => delayRender('fonts'))
  useEffect(() => {
    Promise.all(
      ['250 40px "Unbounded Variable"', '700 40px "Unbounded Variable"', '400 40px "Onest Variable"', '600 40px "Onest Variable"', '500 40px "JetBrains Mono Variable"', 'italic 500 40px "Source Serif 4 Variable"'].map((f) =>
        document.fonts.load(f, 'Каждый диалог CQA κ 0123 ₸'),
      ),
    ).then(() => continueRender(handle))
  }, [handle])
}

const edge = (i: number) => {
  // перекрытие сцен на стыке: шторка ±4 кадра, растворение 6 кадров до стыка
  const cut = i === 0 ? null : CUTS[i - 1]
  return cut ? (cut.wipe ? WIPE / 2 : BLEND) : 0
}

/**
 * Сцена на своём месте. Её локальный кадр 0 это начало перекрытия (стык минус 4 кадра у шторки
 * и минус 6 у растворения). На стыке со шторкой новая сцена видна слева от полосы, старая справа.
 */
function Slot({ index }: { index: number }) {
  const frame = useCurrentFrame()
  const lead = edge(index)
  const cut = index === 0 ? null : CUTS[index - 1]
  const Scene = SCENES[index].C
  let style: React.CSSProperties = {}
  if (cut && cut.wipe) {
    const p = interpolate(frame, [0, WIPE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.65, 0, 0.35, 1) })
    const L = -BAND + p * (1920 + BAND)
    if (p < 1) style = { clipPath: `inset(0 ${Math.max(0, 1920 - L)}px 0 0)` }
  } else if (cut && frame < lead) {
    style = { opacity: interpolate(frame, [0, lead], [0, 1]) }
  }
  return (
    <AbsoluteFill style={style}>
      <Scene />
    </AbsoluteFill>
  )
}

const BAND = 380

function Curtain({ at }: { at: number }) {
  const frame = useCurrentFrame()
  const local = frame - (at - WIPE / 2)
  if (local < 0 || local > WIPE) return null
  const p = interpolate(local, [0, WIPE], [0, 1], { easing: Easing.bezier(0.65, 0, 0.35, 1) })
  const L = -BAND + p * (1920 + BAND)
  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: L, width: BAND, background: 'linear-gradient(90deg, #082518 0%, #0e3b27 70%, #0e3b27 100%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, background: '#138a4e' }} />
    </div>
  )
}

/** Сюжет: 900 кадров по раскадровке. */
function Story() {
  return (
    <AbsoluteFill style={{ background: '#0e3b27' }}>
      {SCENES.map((s, i) => {
        const from = s.start - edge(i)
        const next = CUTS[i]
        const end = next ? (next.wipe ? next.at + WIPE / 2 : next.at) : TOTAL
        return (
          <Sequence key={i} from={from} durationInFrames={end - from}>
            <Slot index={i} />
          </Sequence>
        )
      })}
      {CUTS.filter((c) => c.wipe).map((c) => (
        <Curtain key={c.at} at={c.at} />
      ))}
    </AbsoluteFill>
  )
}

/** Выходной ролик: сюжет с паузами в ключевых моментах (src/holds.json). */
export function Video() {
  useFonts()
  const frame = useCurrentFrame()
  return (
    <Freeze frame={outToStory(frame)}>
      <Story />
    </Freeze>
  )
}
