import { describe, expect, it } from 'vitest'
import { Compiler } from 'inkjs/compiler/Compiler'
import { parseNpcs } from '@shared/bundle/npcDoc'
import { parseTag } from '@shared/bundle/tagSpec'
import { renderStateInk } from '@shared/statsInk'
import { emptyStats, newStat, type StatsDocument } from '@shared/statsDoc'
import { applyChange, trackablesOf } from '@shared/trackables'

/**
 * The tag channel, run rather than reasoned about.
 *
 * A `# npc:` tag changes nothing in ink — it is an opaque string to the
 * compiler — so everything about it is a claim about what happens *between*
 * `Continue()` calls, and none of it is visible by reading a file. This runs the
 * story the way the game and the preview both do, and asserts what the reader
 * ends up seeing.
 */

const STATS: StatsDocument = {
  ...emptyStats(),
  stats: [{ ...newStat('Courage'), min: 0, max: 3 }]
}

const NPCS = parseNpcs(
  JSON.stringify({
    version: 1,
    npcs: [
      {
        id: 'npc_a',
        inkId: 'abeline',
        name: 'Sister Abeline',
        stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 4 }],
        statuses: [
          { key: 'status', label: 'Status', initial: 'single', values: ['single', 'married'] }
        ],
        flags: [{ key: 'isPregnant', label: 'Pregnant', initial: false }]
      }
    ]
  })
)

const TRACKABLES = trackablesOf(STATS, NPCS)

interface Run {
  output: string
  values: Record<string, unknown>
}

/**
 * Plays a story, applying state tags between lines exactly as
 * [StoryPlayer](../renderer/src/player/StoryPlayer.tsx) does. Keeping the two in
 * step is the point: a gate that opens here and not there would be a preview
 * lying about the game.
 */
function play(body: string, pick = 0): Run {
  const story = new Compiler(`${renderStateInk(STATS, NPCS)}\n${body}`).Compile()

  const store = {
    get: (name: string): unknown => story.variablesState[name],
    set: (name: string, value: number | string | boolean): void => {
      story.variablesState[name] = value
    }
  }

  let output = ''
  const step = (): void => {
    while (story.canContinue) {
      output += story.Continue()
      for (const raw of story.currentTags ?? []) {
        const command = parseTag(raw)
        if (command && (command.kind === 'stat' || command.kind === 'npc')) {
          applyChange(store, TRACKABLES, command)
        }
      }
    }
  }

  step()
  if (story.currentChoices.length > pick) {
    story.ChooseChoiceIndex(pick)
    step()
  }

  const values: Record<string, unknown> = {}
  for (const one of TRACKABLES) values[one.variable] = story.variablesState[one.variable]

  return { output, values }
}

describe('state tags, applied', () => {
  it('moves the variable the generated ink declared', () => {
    const { values } = play(`-> start
=== start ===
* [Go]
    # npc: abeline affection +2
    # stat: courage +1
    She smiles.
    -> END
`)

    expect(values['abeline_affection']).toBe(2)
    expect(values['courage']).toBe(1)
  })

  it('opens a gate that reads the variable, which is the whole point', () => {
    const { output } = play(`-> start
=== start ===
* [Go]
    # npc: abeline affection +2
    She smiles.
    -> gate
=== gate ===
{ abeline_affection >= 2: SHE PROPOSES | SHE IS DISTANT }
-> END
`)

    expect(output).toContain('SHE PROPOSES')
  })

  /**
   * The hazard the preflight check exists for, pinned down here so the check
   * has something true to be checked against.
   *
   * ink attaches a standalone tag to the *next text line*. With nothing between
   * the tag and the divert, that next line is the gate's own output — so the
   * gate has already been evaluated by the time the tag reaches anyone. One line
   * of prose in between and it is correct, which is what makes this so easy to
   * write by accident and impossible to see by reading.
   */
  it('applies too late when no prose separates the tag from the divert', () => {
    const bare = play(`-> start
=== start ===
* [Go]
    # npc: abeline affection +2
    -> gate
=== gate ===
{ abeline_affection >= 2: SHE PROPOSES | SHE IS DISTANT }
-> END
`)

    expect(bare.output).toContain('SHE IS DISTANT')
    // It still lands — just after the branch that wanted it.
    expect(bare.values['abeline_affection']).toBe(2)
  })

  it('clamps to the range in the catalogue, which ink cannot express', () => {
    const { values } = play(`-> start
=== start ===
* [Go]
    # npc: abeline affection +9
    # stat: courage +9
    She smiles.
    -> END
`)

    expect(values['abeline_affection']).toBe(4)
    expect(values['courage']).toBe(3)
  })

  it('sets a status, and gates on it as the string ink holds', () => {
    const { output, values } = play(`-> start
=== start ===
* [Go]
    # npc: abeline status = married
    She says yes.
    -> gate
=== gate ===
{ abeline_status == "married": A WIFE | NOT YET }
-> END
`)

    expect(values['abeline_status']).toBe('married')
    expect(output).toContain('A WIFE')
  })

  it('sets a yes/no attribute, and gates on the bare name', () => {
    const { output } = play(`-> start
=== start ===
* [Go]
    # npc: abeline isPregnant = true
    Something changes.
    -> gate
=== gate ===
{ abeline_isPregnant: EXPECTING | NOT }
-> END
`)

    expect(output).toContain('EXPECTING')
  })

  /**
   * A word outside the permitted set is refused rather than stored. The game
   * does the same; a status quietly holding something no branch tests for is a
   * worse outcome than one that visibly did not change.
   */
  it('refuses a status the catalogue does not permit', () => {
    const { values } = play(`-> start
=== start ===
* [Go]
    # npc: abeline status = betrothed
    She hesitates.
    -> END
`)

    expect(values['abeline_status']).toBe('single')
  })

  it('leaves a tag naming nobody in the cast alone', () => {
    const { values } = play(`-> start
=== start ===
* [Go]
    # npc: cordelia affection +2
    # stat: nerve +1
    Nothing happens.
    -> END
`)

    expect(values['abeline_affection']).toBe(0)
    expect(values['courage']).toBe(0)
  })
})
