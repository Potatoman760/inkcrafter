import type { Preflight, PreflightInput } from '../preflight'
import type { MinigameDefinition, TunableNumber } from '../minigameDoc'

export type MinigameCheck = (context: {
  game: MinigameDefinition
  input: PreflightInput
  variables: (PreflightInput['stats']['stats'][number] | PreflightInput['stats']['variables'][number])[]
  numeric: Set<string>
  problems: Preflight[]
  at: (message: string) => Preflight
}) => [string, TunableNumber][]
