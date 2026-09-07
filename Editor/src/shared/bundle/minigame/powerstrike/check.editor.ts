import type { MinigameCheck } from '../check.editor'
import { isVideoFile } from '../../../mediaDoc'
import { galleryMedia, type GalleryMediaRef } from '../../galleryDoc'
import type { TunableNumber } from '../common'

const check: MinigameCheck = ({ game, input, problems, at }) => {
  if (game.kind !== 'powerstrike') return []
  let tunings: [string, TunableNumber][]
  const arts: [string, GalleryMediaRef][] = [
    ...game.targetArt.map((ref): [string, GalleryMediaRef] => ['target', ref]),
    ...(game.toolArt ? [['tool', game.toolArt] as [string, GalleryMediaRef]] : [])
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
    ['target durability', game.targetDurability],
    ['strike limit', game.strikeLimit],
    ['charge duration', game.chargeDurationMs],
    ['ideal power', game.idealPowerPercent],
    ['perfect window', game.perfectWindowPercent],
    ['good window', game.goodWindowPercent],
    ['perfect damage', game.perfectDamage],
    ['good damage', game.goodDamage],
    ['weak damage', game.weakDamage],
    ['wrong-side damage', game.wrongSideDamagePercent],
    ['recovery time', game.recoveryMs]
  ]
  return tunings
}

export default check
