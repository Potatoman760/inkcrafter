import { useState } from 'react'
import { parseEstateTutorial, type EstateMinigame } from '@shared/bundle/estate'
import { Button, Field, Textarea } from '../design/components'

/** Intentionally raw JSON: the script is one authored document, not a form builder. */
export function EstateTutorialFields({ game, portraits, onChange }: {
  game: EstateMinigame
  portraits: string[]
  onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const saved = JSON.stringify(game.tutorial ?? null, null, 2)
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const apply = (): void => {
    try {
      const tutorial = parseEstateTutorial(JSON.parse(draft))
      if (tutorial && !portraits.includes(tutorial.speaker.sprite)) throw new Error('Speaker sprite is not in the character catalogue.')
      const missing = tutorial?.steps.find(step => step.room && !game.rooms.some(room => room.key === step.room))
      if (missing) throw new Error('Unknown room: ' + missing.room)
      onChange({ tutorial })
      setDraft(JSON.stringify(tutorial, null, 2)); setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <>
    <Field label="Script JSON" error={error}
      about={'Stored as tutorial in minigames.json. Use null to remove it. Fields: version (positive revision), autoStart (boolean), speaker {name, sprite, expression?}, steps [{title, text, testText?, page, target, room?}]. Pages: villa, room, commissions. Targets: overview, funds, noticeboard, notices, crews, income, room, restore, invitation, visits, return. Room pages and room targets need a room key. Text is limited to 360 characters per step. A higher revision offers the guide again.'}
      hint="Apply validates the script. Invalid JSON leaves the saved tutorial unchanged.">
      <Textarea aria-label="Tutorial JSON" value={draft} spellCheck={false} rows={24}
        style={{ fontFamily: 'monospace', tabSize: 2, resize: 'vertical' }}
        onChange={event => { setDraft(event.target.value); setError(null) }} />
    </Field>
    <div className="estate-list__actions">
      <Button onClick={apply} disabled={draft === saved}>Apply JSON</Button>
      <Button onClick={() => { setDraft(saved); setError(null) }} disabled={draft === saved}>Revert</Button>
    </div>
  </>
}
