import type { MinigameCheck } from '../check.editor'
import { isVideoFile } from '../../../mediaDoc'
import { galleryMedia } from '../../galleryDoc'
import type { TunableNumber } from '../common'

const check: MinigameCheck = ({ game, input, problems, at }) => {
  if (game.kind !== 'carry') return []
  let tunings: [string, TunableNumber][]
  if (game.loadArt) {
    const art = galleryMedia(input.media, game.loadArt)
    if (!art) {
      problems.push(at(`${game.display || game.name}'s load picture is no longer in the media catalogue.`))
    } else if (art.kind !== 'animation') {
      problems.push(at(`${game.display || game.name}'s load picture is not an animation look.`))
    } else if (isVideoFile(art.file)) {
      problems.push(at(`${game.display || game.name}'s load picture must be an image, not a video.`))
    }
  }
  tunings = [
    ['distance', game.distanceMs],
    ['stamina', game.staminaMax],
    ['stamina drain', game.staminaDrainPerSecond],
    ['wobble drift', game.wobbleDriftPerSecond],
    ['wobble limit', game.wobbleLimit],
    ['correction strength', game.correctionStrength],
    ['tilt drain', game.tiltDrainMultiplier]
  ]
  return tunings
}

export default check
