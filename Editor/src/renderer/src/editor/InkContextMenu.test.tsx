// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { editorContextAt } from '@shared/inkContext'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import type { TextEdit } from '@shared/inkEdits'
import { emptyNpcs, parseNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import {
  addItem,
  addStat,
  addVariable,
  emptyStats,
  newItem,
  newStat,
  newVariable,
  type StatsDocument
} from '@shared/statsDoc'
import { InkContextMenu } from './InkContextMenu'

const SOURCE = `VAR strength = 0
VAR has_met_wren = false

=== the_door ===
# bg:the_cove/night
The door is shut.
~ strength = strength + 1
    ~ inventory += brass_key
~ trust = trust + roll(6)

* [Try the handle]
    It turns.
    -> END

* {strength >= 1} [Force it]
    -> END

=== after ===
# stat: strength +1
# npc: abeline affection +2
# npc: cordelia affection +2
# music:the_grove/loop
# music:door_slam/heavy
Later.
`

function catalogue(): StatsDocument {
  let doc = emptyStats()
  doc = addStat(doc, newStat('Strength'))
  doc = addStat(doc, newStat('Has met Wren', 'boolean'))
  doc = addVariable(doc, newVariable('Secret count'))
  doc = addItem(doc, newItem('Shovel'))
  doc = addItem(doc, newItem('Brass key'))
  return doc
}

interface Harness {
  onApply: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onManage: ReturnType<typeof vi.fn>
}

/** Opens the menu as if right-clicked on the line containing `on`. */
function mediaCatalogue(): MediaDocument {
  let doc = emptyMedia()

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('day', 'bg/cove-day.png'))
  doc = addVariant(doc, cove.id, newVariant('night', 'bg/cove-night.png'))

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  const grove = newAsset('The grove', 'music')
  doc = addAsset(doc, grove)
  doc = addVariant(doc, grove.id, newVariant('loop', 'music/the_grove/loop.mp3'))

  const door = newAsset('Door slam', 'music')
  doc = addAsset(doc, door)
  doc = addVariant(doc, door.id, newVariant('heavy', 'music/door_slam/heavy.ogg'))

  return doc
}

/** A cast worth right-clicking: a number, a word and a yes/no. */
function castCatalogue(): NpcDocument {
  return parseNpcs(
    JSON.stringify({
      version: 1,
      npcs: [
        {
          id: 'npc_a',
          inkId: 'abeline',
          name: 'Sister Abeline',
          stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 }],
          statuses: [
            { key: 'status', label: 'Status', initial: 'single', values: ['single', 'married'] }
          ],
          flags: [{ key: 'isPregnant', label: 'Pregnant', initial: false }]
        }
      ]
    })
  )
}

function menu(
  on: string,
  doc = catalogue(),
  mediaDoc = mediaCatalogue(),
  castDoc = castCatalogue()
): Harness {
  const offset = SOURCE.indexOf(on)
  const onApply = vi.fn()
  const onClose = vi.fn()
  const onManage = vi.fn()

  render(
    <InkContextMenu
      target={{ offset, x: 100, y: 100 }}
      source={SOURCE}
      context={editorContextAt(SOURCE, offset)}
      stats={doc}
      npcs={castDoc}
      media={mediaDoc}
      onApply={onApply}
      onClose={onClose}
      onManage={onManage}
    />
  )

  return { onApply, onClose, onManage }
}

/** Applies an edit to the source, the way the editor would. */
function applied(edit: TextEdit): string {
  return SOURCE.slice(0, edit.from) + edit.insert + SOURCE.slice(edit.to)
}

/** Follows one of the compact root categories into the requested action. */
async function choose(category: string, action: string): Promise<void> {
  await userEvent.hover(screen.getByRole('menuitem', { name: category }))
  await userEvent.click(screen.getByRole('menuitem', { name: action }))
}

describe('InkContextMenu', () => {
  it('offers gating only where there is a choice to gate', async () => {
    menu('* [Try the handle]')
    expect(screen.getByRole('menuitem', { name: 'Require…' })).toBeInTheDocument()
  })

  it('offers only effects when the click was not on a choice', () => {
    menu('The door is shut.')

    expect(screen.queryByRole('menuitem', { name: 'Require…' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Item' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Variable' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Stage' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Audio' })).toBeInTheDocument()
  })

  it('opens item operations in a compact hover flyout', async () => {
    menu('The door is shut.')

    expect(screen.queryByRole('menuitem', { name: 'Give…' })).not.toBeInTheDocument()
    await userEvent.hover(screen.getByRole('menuitem', { name: 'Item' }))

    expect(screen.getByRole('menuitem', { name: 'Give…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Take…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Stage' })).toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'Item actions' })).toBeInTheDocument()
  })

  it('keeps an already-gated choice compact while still offering removal', () => {
    menu('* {strength >= 1} [Force it]')
    expect(screen.queryByText(/already gated/)).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Remove the gate/ })).toBeInTheDocument()
  })

  /* Gating ---------------------------------------------------------------- */

  it('gates a choice on carrying an item', async () => {
    const { onApply } = menu('* [Try the handle]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /shovel/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain(
      '* {inventory ? shovel} [Try the handle]'
    )
  })

  it('gates on not carrying it', async () => {
    const { onApply } = menu('* [Try the handle]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /shovel/ }))
    await userEvent.selectOptions(screen.getByLabelText('Held or not'), 'hasnt')
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('{not (inventory ? shovel)}')
  })

  it('gates on a number stat with a comparison', async () => {
    const { onApply } = menu('* [Try the handle]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /strength/ }))
    await userEvent.selectOptions(screen.getByLabelText('Comparison'), '>')
    await userEvent.clear(screen.getByLabelText('Amount'))
    await userEvent.type(screen.getByLabelText('Amount'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('{strength > 3}')
  })

  it('gates on a yes/no stat as the bare name, not == true', async () => {
    const { onApply } = menu('* [Try the handle]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /has_met_wren/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('{has_met_wren}')
  })

  // The condition already there is carried across as a substring, never parsed.
  it('widens a gate that already exists rather than replacing it', async () => {
    const { onApply } = menu('* {strength >= 1} [Force it]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /has_met_wren/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('{strength >= 1 and has_met_wren}')
  })

  it('can combine with or instead', async () => {
    const { onApply } = menu('* {strength >= 1} [Force it]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /has_met_wren/ }))
    await userEvent.selectOptions(screen.getByLabelText(/Combine with/), 'or')
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('{strength >= 1 or has_met_wren}')
  })

  it('removes a gate', async () => {
    const { onApply } = menu('* {strength >= 1} [Force it]')

    await userEvent.click(screen.getByRole('menuitem', { name: /Remove the gate/ }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('* [Force it]')
  })

  /* Effects --------------------------------------------------------------- */

  it('gives an item inside the choice body, where it will run', async () => {
    const { onApply } = menu('* [Try the handle]')

    await choose('Item', 'Give…')
    await userEvent.click(screen.getByRole('button', { name: /shovel/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain(
      '* [Try the handle]\n    ~ inventory += shovel\n    It turns.'
    )
  })

  it('takes an item away', async () => {
    const { onApply } = menu('* [Try the handle]')

    await choose('Item', 'Take…')
    await userEvent.click(screen.getByRole('button', { name: /brass_key/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('~ inventory -= brass_key')
  })

  /**
   * A number stat goes out as a tag, not as `~ strength = strength + 1`. The
   * tag is the channel the game reads: it clamps to the catalogue's range and
   * tells the HUD, and ink can do neither.
   */
  it('adds to a stat, as the tag the game applies', async () => {
    const { onApply } = menu('* [Try the handle]')

    await choose('Variable', 'Change…')
    await userEvent.click(screen.getByRole('button', { name: /strength/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('# stat: strength +1')
  })

  it('sets a stat outright when asked', async () => {
    const { onApply } = menu('* [Try the handle]')

    await choose('Variable', 'Change…')
    await userEvent.click(screen.getByRole('button', { name: /strength/ }))
    await userEvent.selectOptions(screen.getByLabelText('Change'), 'set')
    await userEvent.clear(screen.getByLabelText('Amount'))
    await userEvent.type(screen.getByLabelText('Amount'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('# stat: strength = 5')
  })

  /**
   * A yes/no stat has no tag to be written as — `# stat:` carries an integer,
   * and there is no range to clamp or bar to fill. So it stays ink, which is
   * the honest thing rather than a tag nothing would read.
   */
  it('writes a yes/no stat as ink, since no tag can carry one', async () => {
    const { onApply } = menu('* [Try the handle]')

    await choose('Variable', 'Change…')
    await userEvent.click(screen.getByRole('button', { name: /has_met_wren/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain('~ has_met_wren = true')
  })

  it('puts an effect on its own line when there is no choice', async () => {
    const { onApply } = menu('The door is shut.')

    await choose('Item', 'Give…')
    await userEvent.click(screen.getByRole('button', { name: /shovel/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(applied(onApply.mock.calls[0]![0])).toContain(
      'The door is shut.\n~ inventory += shovel\n'
    )
  })

  /* Choosing from a large catalogue --------------------------------------- */

  it('offers only items for giving, and only stats for changing', async () => {
    menu('* [Try the handle]')

    await choose('Item', 'Give…')
    expect(screen.queryByRole('button', { name: /strength/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shovel/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    await choose('Variable', 'Change…')
    expect(screen.getByRole('button', { name: /strength/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /shovel/ })).not.toBeInTheDocument()
  })

  it('offers both when gating, since either can be a condition', async () => {
    menu('* [Try the handle]')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))

    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.getByText('Vars')).toBeInTheDocument()
    expect(screen.getByText('Items')).toBeInTheDocument()
  })

  it('filters, which is the only way through a hundred items', async () => {
    menu('* [Try the handle]')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))

    await userEvent.type(screen.getByLabelText('Filter'), 'brass')

    expect(screen.getByRole('button', { name: /brass_key/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /shovel/ })).not.toBeInTheDocument()
  })

  it('shows what it will write before writing it', async () => {
    menu('* [Try the handle]')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: /shovel/ }))

    expect(screen.getByText('{inventory ? shovel}')).toBeInTheDocument()
  })

  it('sends you to the catalogue when there is nothing in it', async () => {
    const { onManage } = menu('* [Try the handle]', emptyStats(), mediaCatalogue(), emptyNpcs())

    await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add some' }))

    expect(onManage).toHaveBeenCalled()
  })

  /* Knowing where it was clicked ------------------------------------------ */

  describe('on a media tag line', () => {
    // "Change stat" here is not a near miss — it is an option that cannot mean
    // anything at all on this line.
    it('offers only what can be done to a tag', () => {
      menu('# bg:the_cove/night')

      expect(screen.getByRole('menuitem', { name: 'Change which…' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Change the look…' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Remove this tag line' })).toBeInTheDocument()

      for (const gone of ['Change variable…', 'Give item…', 'Take item…', 'Require…', 'Set background…']) {
        expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument()
      }
    })

    it('changes the look, replacing the tag in place', async () => {
      const { onApply } = menu('# bg:the_cove/night')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change the look…' }))
      await userEvent.click(screen.getByRole('button', { name: /day/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      const next = applied(onApply.mock.calls[0]![0])
      expect(next).toContain('# bg:the_cove/day')
      expect(next).not.toContain('night')
    })

    it('offers only looks of the asset the tag already names', async () => {
      menu('# bg:the_cove/night')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change the look…' }))

      expect(screen.getByRole('button', { name: /day/ })).toBeInTheDocument()
      // The character's looks belong to a different asset entirely.
      expect(screen.queryByRole('button', { name: /happy/ })).not.toBeInTheDocument()
    })

    it('changes which background, keeping it a background', async () => {
      menu('# bg:the_cove/night')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change which…' }))

      expect(screen.getByRole('button', { name: /the_cove/ })).toBeInTheDocument()
      // A character is not a candidate for a bg: tag.
      expect(screen.queryByRole('button', { name: /wren/ })).not.toBeInTheDocument()
    })

    it('removes the whole line, not just the tag', async () => {
      const { onApply } = menu('# bg:the_cove/night')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Remove this tag line' }))

      const next = applied(onApply.mock.calls[0]![0])
      expect(next).not.toContain('bg:the_cove')
      // The line it governed is untouched, and no blank line is left behind.
      expect(next).toContain('=== the_door ===\nThe door is shut.')
    })

    it('does not offer a look operation for music', () => {
      menu('# music:the_grove/loop')

      expect(screen.getByRole('menuitem', { name: 'Change which…' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Change the look…' })).not.toBeInTheDocument()
    })

  })

  /* Writing media tags ----------------------------------------------------- */

  describe('media on an ordinary line', () => {
    it('sets a background above the line it governs', async () => {
      // Above, because ink attaches a standalone tag to the line that follows.
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Set background…')
      await userEvent.click(screen.getByRole('button', { name: /the_cove/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain(
        '# bg:the_cove/day\nThe door is shut.'
      )
    })

    it('takes the first look, and lets it be changed before inserting', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Set background…')
      await userEvent.click(screen.getByRole('button', { name: /the_cove/ }))
      expect(screen.getByText('# bg:the_cove/day')).toBeInTheDocument()

      await userEvent.selectOptions(screen.getByLabelText('Which look'), 'night')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# bg:the_cove/night')
    })

    it('clears the whole stage with the explicit clear command', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Clear everything')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# clear')
    })

    it('adds an autosave checkpoint', async () => {
      const { onApply } = menu('The door is shut.')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Add autosave checkpoint…' }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# autosave')
    })

    it('offers only characters when showing one', async () => {
      menu('The door is shut.')
      await choose('Stage', 'Show character…')

      expect(screen.getByRole('button', { name: /wren/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /the_cove/ })).not.toBeInTheDocument()
    })


    /**
     * Where somebody walks on.
     *
     * Asked before the person, because picking one closes that step — a
     * question put afterwards would be put too late. Written even for the
     * middle: a bare tag already means centre, and saying it makes a scene's
     * staging read off the page without knowing that.
     */

    /**
     * Music, set the way a background is.
     *
     * Stopping needs its own item because silence is not what a scene falls
     * back to — a track holds until something ends it, so ending it is
     * something an author has to be able to say.
     */
    it('sets a track', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Audio', 'Set music…')
      await userEvent.click(screen.getByRole('button', { name: /the_grove/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# music:the_grove')
    })

    it('stops it', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Audio', 'Stop music')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# music:stop')
    })

    /**
     * How long the stop takes. Left empty it cuts, which is what stopping meant
     * before it could be told otherwise — so the field has to be able to say
     * nothing, not just zero.
     */
    it('fades it out over the seconds asked for', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Audio', 'Stop music')
      await userEvent.type(screen.getByLabelText('Fade out over'), '5')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# music:stop 5')
    })

    it('writes a plain stop when the fade is empty or zero', async () => {
      for (const seconds of ['', '0']) {
        const { onApply } = menu('The door is shut.')

        await choose('Audio', 'Stop music')
        if (seconds) await userEvent.type(screen.getByLabelText('Fade out over'), seconds)
        await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

        expect(applied(onApply.mock.calls[0]![0])).toContain('# music:stop\n')
        cleanup()
      }
    })

    it('asks for a fade only when stopping, not when choosing a track', async () => {
      menu('The door is shut.')

      await choose('Audio', 'Set music…')
      expect(screen.queryByLabelText('Fade out over')).toBeNull()
    })

    it('offers only tracks when setting music', async () => {
      menu('The door is shut.')
      await choose('Audio', 'Set music…')

      expect(screen.getByRole('button', { name: /the_grove/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /the_cove/ })).not.toBeInTheDocument()
    })

    // A cue is `# music:` without `loop` now; there was a Play sound effect
    // item and a separate media kind behind it.
    it('attaches audio to the clicked paragraph', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Audio', 'Set music…')
      await userEvent.click(screen.getByRole('button', { name: /door_slam/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      const result = applied(onApply.mock.calls[0]![0])
      expect(result).toContain('# music:door_slam\nThe door is shut.')
    })

    it('writes the middle by default, said out loud', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Show character…')
      await userEvent.click(screen.getByRole('button', { name: /wren/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# char:wren/happy at middle')
    })

    it('writes where the toggle was set before the person was picked', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Show character…')
      await userEvent.click(screen.getByRole('radio', { name: 'left' }))
      await userEvent.click(screen.getByRole('button', { name: /wren/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# char:wren/happy at left')
    })

    /**
     * Which way a sprite faces, for art drawn looking the wrong way for the
     * side it is standing on. Written on the tag, so it is asked beside where
     * they stand and for the same reason: picking somebody ends the step.
     */
    it('writes a flip beside where they stand', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Show character…')
      await userEvent.click(screen.getByRole('radio', { name: 'right' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Facing the other way' }))
      await userEvent.click(screen.getByRole('button', { name: /wren/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# char:wren/happy at right flipped')
    })

    it('says nothing about facing when it was not asked for', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Show character…')
      await userEvent.click(screen.getByRole('button', { name: /wren/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).not.toContain('flipped')
    })

    /**
     * A place can be drawn the wrong way round as readily as a sprite can, so
     * it takes the same word — but a place does not face anywhere, which is why
     * the label is about the artwork rather than about which way it is looking.
     */
    it('turns a background round with the same word', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Set background…')
      expect(screen.queryByRole('checkbox', { name: 'Facing the other way' })).toBeNull()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Mirrored left to right' }))
      await userEvent.click(screen.getByRole('button', { name: /the_cove/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# bg:the_cove/day flipped')
    })

    it('says nothing about a background it was not asked to turn', async () => {
      const { onApply } = menu('The door is shut.')

      await choose('Stage', 'Set background…')
      await userEvent.click(screen.getByRole('button', { name: /the_cove/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).not.toContain('flipped')
    })

    it('offers no mirror for music, which is not a picture', async () => {
      menu('The door is shut.')

      await choose('Audio', 'Set music…')
      expect(screen.queryByRole('checkbox', { name: 'Mirrored left to right' })).toBeNull()
      expect(screen.queryByRole('checkbox', { name: 'Facing the other way' })).toBeNull()
    })

    it('offers where only for a character', async () => {
      menu('The door is shut.')

      // A background has nowhere to stand.
      await choose('Stage', 'Set background…')
      expect(screen.queryByRole('radiogroup', { name: 'Where they stand' })).toBeNull()
    })

    it('puts a tag inside the choice body when clicked on a choice', async () => {
      const { onApply } = menu('* [Try the handle]')

      await choose('Stage', 'Show character…')
      await userEvent.click(screen.getByRole('button', { name: /wren/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain(
        '* [Try the handle]\n    # char:wren/happy at middle\n    It turns.'
      )
    })

    it('puts a tag below a knot header, where above would be outside it', async () => {
      const { onApply } = menu('=== the_door ===')

      await choose('Stage', 'Set background…')
      await userEvent.click(screen.getByRole('button', { name: /the_cove/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('=== the_door ===\n# bg:the_cove/day')
    })

    it('sends you to the media catalogue when it is empty', async () => {
      const { onManage } = menu('The door is shut.', catalogue(), emptyMedia())

      await choose('Stage', 'Set background…')
      await userEvent.click(screen.getByRole('button', { name: 'Add some' }))

      expect(onManage).toHaveBeenCalledWith('media')
    })
  })

  /* Editing a stat change or an item action -------------------------------- */

  describe('on a stat change it recognises', () => {
    it('offers only what can be done to that line', () => {
      menu('~ strength = strength + 1')

      expect(screen.getByRole('menuitem', { name: 'Change which…' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Change what it does…' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Remove this line' })).toBeInTheDocument()

      for (const gone of ['Require…', 'Set background…', 'Show character…', 'Give item…']) {
        expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument()
      }
    })

    it('starts from what is there rather than from defaults', async () => {
      menu('~ strength = strength + 1')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))

      expect(screen.getByLabelText('Change')).toHaveValue('add')
      expect(screen.getByLabelText('Amount')).toHaveValue('1')
    })

    it('changes the operation, keeping the stat', async () => {
      const { onApply } = menu('~ strength = strength + 1')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))
      await userEvent.selectOptions(screen.getByLabelText('Change'), 'subtract')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('~ strength = strength - 1')
    })

    it('changes the amount', async () => {
      const { onApply } = menu('~ strength = strength + 1')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))
      await userEvent.clear(screen.getByLabelText('Amount'))
      await userEvent.type(screen.getByLabelText('Amount'), '3')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('~ strength = strength + 3')
    })

    it('changes which stat, keeping the operation', async () => {
      const { onApply } = menu('~ strength = strength + 1')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change which…' }))
      await userEvent.click(screen.getByRole('button', { name: /has_met_wren/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      // A yes/no stat cannot be added to, so it becomes an assignment.
      expect(applied(onApply.mock.calls[0]![0])).toContain('~ has_met_wren = true')
    })

    it('offers stats and not items when changing which', async () => {
      menu('~ strength = strength + 1')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change which…' }))

      expect(screen.getByRole('button', { name: /strength/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /brass_key/ })).not.toBeInTheDocument()
    })

    it('replaces the logic in place, keeping the tilde and indentation', async () => {
      const { onApply } = menu('    ~ inventory += brass_key')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))
      await userEvent.selectOptions(screen.getByLabelText('Give or take'), 'take')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('    ~ inventory -= brass_key')
    })

    it('offers items and not stats for an item line', async () => {
      menu('    ~ inventory += brass_key')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change which…' }))

      expect(screen.getByRole('button', { name: /brass_key/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /strength/ })).not.toBeInTheDocument()
    })

    it('removes the whole line', async () => {
      const { onApply } = menu('~ strength = strength + 1')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Remove this line' }))

      expect(applied(onApply.mock.calls[0]![0])).not.toContain('strength = strength + 1')
    })
  })

  /**
   * A `~` line the menu did not write is left alone. Offering to reshape
   * someone's `~ archivist("You're late.")` through two dropdowns is how you
   * mangle a file.
   */
  it('does not claim a logic line it cannot read back', () => {
    menu('~ trust = trust + roll(6)')

    expect(screen.queryByRole('menuitem', { name: 'Change what it does…' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Variable' })).toBeInTheDocument()
  })

  /* The cast ---------------------------------------------------------------- */

  describe('the cast, which is stats like any other from here', () => {
    it('lists the attributes under the character they belong to', async () => {
      menu('* [Try the handle]')
      await choose('Variable', 'Change…')

      expect(screen.getByText('Stats')).toBeInTheDocument()
      expect(screen.getByText('Vars')).toBeInTheDocument()
      expect(screen.getByText('Sister Abeline')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /abeline_affection/ })).toBeInTheDocument()
    })

    it('changes an attribute as the tag the game applies', async () => {
      const { onApply } = menu('* [Try the handle]')

      await choose('Variable', 'Change…')
      await userEvent.click(screen.getByRole('button', { name: /abeline_affection/ }))
      await userEvent.clear(screen.getByLabelText('Amount'))
      await userEvent.type(screen.getByLabelText('Amount'), '2')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# npc: abeline affection +2')
    })

    it('sets a status from the words it is allowed to hold', async () => {
      const { onApply } = menu('* [Try the handle]')

      await choose('Variable', 'Change…')
      await userEvent.click(screen.getByRole('button', { name: /abeline_status/ }))
      await userEvent.selectOptions(screen.getByLabelText('Which'), 'married')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# npc: abeline status = married')
    })

    it('sets a yes/no attribute', async () => {
      const { onApply } = menu('* [Try the handle]')

      await choose('Variable', 'Change…')
      await userEvent.click(screen.getByRole('button', { name: /abeline_isPregnant/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# npc: abeline isPregnant = true')
    })

    /**
     * Gates stay ink whatever the change was written as. Only ink can branch,
     * and the game has already written the value back by the time one is read.
     */
    it('gates a choice on an attribute, in ink', async () => {
      const { onApply } = menu('* [Try the handle]')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
      await userEvent.click(screen.getByRole('button', { name: /abeline_affection/ }))
      await userEvent.clear(screen.getByLabelText('Amount'))
      await userEvent.type(screen.getByLabelText('Amount'), '2')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('* {abeline_affection >= 2} [Try the handle]')
    })

    // The tag sets it bare and the gate reads it quoted, because ink holds it
    // as a string. Getting that right unprompted is what the catalogue is for.
    it('quotes a status in a gate, though the tag that set it was bare', async () => {
      const { onApply } = menu('* [Try the handle]')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Require…' }))
      await userEvent.click(screen.getByRole('button', { name: /abeline_status/ }))
      await userEvent.selectOptions(screen.getByLabelText('Which'), 'married')
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('{abeline_status == "married"}')
    })
  })

  describe('on a cast change it recognises', () => {
    it('offers only what can be done to that line', () => {
      menu('# npc: abeline affection +2')

      expect(screen.getByRole('menuitem', { name: 'Change which…' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Change what it does…' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Remove this line' })).toBeInTheDocument()

      for (const gone of ['Require…', 'Set background…', 'Change variable…', 'Give item…']) {
        expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument()
      }
    })

    it('starts from what the line already says', async () => {
      menu('# npc: abeline affection +2')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))

      expect(screen.getByLabelText('Change')).toHaveValue('add')
      expect(screen.getByLabelText('Amount')).toHaveValue('2')
    })

    it('changes the amount, keeping the attribute', async () => {
      const { onApply } = menu('# npc: abeline affection +2')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))
      await userEvent.clear(screen.getByLabelText('Amount'))
      await userEvent.type(screen.getByLabelText('Amount'), '5')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# npc: abeline affection +5')
    })

    it('turns a reward into a cost', async () => {
      const { onApply } = menu('# npc: abeline affection +2')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))
      await userEvent.selectOptions(screen.getByLabelText('Change'), 'subtract')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# npc: abeline affection -2')
    })

    it('retargets onto another attribute of the same character', async () => {
      const { onApply } = menu('# npc: abeline affection +2')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change which…' }))
      await userEvent.click(screen.getByRole('button', { name: /abeline_status/ }))
      await userEvent.selectOptions(screen.getByLabelText('Which'), 'married')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# npc: abeline status = married')
    })

    // Retargeting stays inside the channel the line is written in. A cast line
    // moved onto a player stat would change which machinery applies it.
    it('offers the cast and not the player stats', async () => {
      menu('# npc: abeline affection +2')
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change which…' }))

      expect(screen.getByRole('button', { name: /abeline_affection/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^strength/ })).not.toBeInTheDocument()
    })

    it('reads a player stat tag too', async () => {
      const { onApply } = menu('# stat: strength +1')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change what it does…' }))
      await userEvent.selectOptions(screen.getByLabelText('Change'), 'set')
      await userEvent.click(screen.getByRole('button', { name: 'Change' }))

      expect(applied(onApply.mock.calls[0]![0])).toContain('# stat: strength = 1')
    })

    /**
     * A line naming somebody the catalogue has never heard of changes nothing
     * at runtime, and saying so is more use than a menu that quietly offers to
     * edit it into a different tag that also does nothing.
     */
    it('says when the line names nobody in the cast', () => {
      menu('# npc: cordelia affection +2')
      expect(screen.getByText(/changes nothing at runtime/)).toBeInTheDocument()
    })

    it('removes the whole line', async () => {
      const { onApply } = menu('# npc: abeline affection +2')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Remove this line' }))

      expect(applied(onApply.mock.calls[0]![0])).not.toContain('abeline affection +2')
    })
  })
})

/**
 * An animation is shown over the whole scene rather than standing in it, so it
 * is never asked where to stand — only which way round its artwork goes.
 */
describe('the ink context menu: animations', () => {
  it('does not ask where an animation stands', async () => {
    menu('The door is shut.')

    await choose('Stage', 'Show animation…')

    expect(screen.queryByRole('radiogroup', { name: 'Where they stand' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Facing the other way' })).toBeInTheDocument()
  })
})
