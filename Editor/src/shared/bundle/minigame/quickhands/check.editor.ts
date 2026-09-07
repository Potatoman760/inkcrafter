import type { MinigameCheck } from '../check.editor'
import { isVideoFile } from '../../../mediaDoc'
import { galleryMedia, type GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

const check: MinigameCheck = ({ game, input, problems, at }) => {
  if (game.kind !== 'quickhands') return []
  let tunings: [string, TunableNumber][]
  // The falling objects are a set and the catcher is one picture, so they
  // are flattened to the same shape here rather than checked twice.
  const arts: [string, GalleryMediaRef][] = [
    ...game.targetArt.map((ref): [string, GalleryMediaRef] => ['target', ref]),
    ...game.hazardArt.map((ref): [string, GalleryMediaRef] => ['hazard', ref]),
    ...(game.catcherArt ? [['catcher', game.catcherArt] as [string, GalleryMediaRef]] : [])
  ]
  for (const [label, ref] of arts) {
    const art = galleryMedia(input.media, ref)
    if (!art) {
      problems.push(at(`${game.display || game.name}'s ${label} picture is no longer in the media catalogue.`))
    } else if (art.kind !== 'animation') {
      problems.push(at(`${game.display || game.name}'s ${label} picture is not an animation look.`))
    } else if (isVideoFile(art.file)) {
      problems.push(at(`${game.display || game.name}'s ${label} picture must be an image, not a video.`))
    }
  }
  tunings = [
    ['lane count', game.laneCount],
    ['round duration', game.roundDurationMs],
    ['spawn interval', game.spawnIntervalMs],
    ['fall duration', game.fallDurationMs],
    ['catch window', game.catchWindowMs],
    ['target chance', game.targetChancePercent],
    ['goal score', game.goalScore],
    ['target points', game.targetPoints],
    ['hazard penalty', game.hazardPenalty],
    ['missed target penalty', game.missedTargetPenalty]
  ]
  return tunings
}

export default check
