import { Composition } from 'remotion'
import { TOTAL, Video } from './Video'

export function Root() {
  return <Composition id="CQA30" component={Video} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
}
