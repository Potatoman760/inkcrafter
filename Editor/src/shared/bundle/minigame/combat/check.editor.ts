import type { MinigameCheck } from '../check.editor'
import { COMBATANT_STATES } from './data'
import type { TunableNumber } from '../common'

const check: MinigameCheck = ({ game, input, numeric, problems, at }) => {
  if (game.kind !== 'combat') return []
  let tunings: [string, TunableNumber][]
  const opponent = input.media.assets.find(
    (asset) => asset.id === game.opponentAssetId && asset.kind === 'combatant'
  )
  if (!opponent) {
    problems.push(at(`${game.display || game.name} has no combatant selected.`))
  } else {
    for (const state of COMBATANT_STATES) {
      if (!opponent.variants.some((one) => one.name === state)) {
        problems.push(at(`${game.display || game.name}'s combatant has no ${state} look.`))
      }
    }
  }

  if (!numeric.has(game.playerHealthVariable)) {
    problems.push(at(`${game.display || game.name} needs a numeric player health variable.`))
  }
  tunings = [
    ['opponent health', game.opponentHealth],
    ['incoming damage', game.incomingDamage],
    ['counter damage', game.counterDamage],
    ['prep window', game.prepWindowMs],
    ['counter window', game.counterWindowMs],
    ['counter chance', game.counterChancePercent],
    ['idle time', game.idleMs],
    ['strike time', game.strikeMs]
  ]
  return tunings
}

export default check
