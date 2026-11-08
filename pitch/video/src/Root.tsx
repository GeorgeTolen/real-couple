import { Composition } from 'remotion'
import { OUT_TOTAL } from './holds'
import { Video } from './Video'

export function Root() {
  return <Composition id="CQA30" component={Video} durationInFrames={OUT_TOTAL} fps={30} width={1920} height={1080} />
}
