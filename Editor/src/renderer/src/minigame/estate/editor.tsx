import type { EstateMinigame } from '@shared/bundle/minigameDoc'
import { newEstateMinigame } from '@shared/bundle/minigameDoc'
import type { MinigameEditor, MinigameFieldsProps } from '../module'
import { EstateFields } from './EstateFields'

function Fields({ selected, patch, numeric, backgrounds, homeOf, characterArt, textual, flags, portraits }: MinigameFieldsProps<EstateMinigame>): React.JSX.Element {
  return (
    <EstateFields
      key={selected.id}
      game={selected}
      options={backgrounds}
      home={homeOf(selected)}
      characterArt={characterArt}
      textVariables={textual.map((one) => one.name)}
      stats={numeric.map((one) => one.name)}
      flags={flags}
      portraits={portraits}
      onChange={patch}
    />
  )
}

export default {
  kind: 'estate', label: 'Villa', order: 4,
  countAll: true,
  customBackground: true,
  customTutorial: true,
  resultNote: 'Returns a scene token or return to Ink.',
  create: (count) => newEstateMinigame(`New villa ${count}`),
  Fields: (props) => props.selected.kind === 'estate' ? <Fields {...props} selected={props.selected} /> : null,
} satisfies MinigameEditor
