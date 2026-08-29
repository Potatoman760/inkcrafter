// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { TagCommand } from '@shared/bundle/tagSpec'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import { sectionScenes } from '@shared/sectionScene'
import type { MediaFile } from '@shared/types'
import { manuscript, prose, junction } from '../../../test/harness'
import { SectionRail, railRows } from './SectionRail'

/**
 * The rail's one idea, asserted twice: what a section *set* reads differently
 * from what it inherited, and closed it shows only the former — which is what
 * makes a long manuscript scannable instead of a wall of identical strips.
 */

function seeded(): MediaDocument {
  let doc = emptyMedia()

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('neutral', 'sprites/wren.png'))
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  // In the cast but not staged, so a row for one character can be shown not to
  // be about the other.
  const kael = newAsset('Kael', 'character')
  doc = addAsset(doc, kael)
  doc = addVariant(doc, kael.id, newVariant('neutral', 'sprites/kael.png'))

  const rain = newAsset('Rain', 'animation')
  doc = addAsset(doc, rain)
  doc = addVariant(doc, rain.id, newVariant('heavy', 'animations/rain/heavy.gif'))
  doc = addVariant(doc, rain.id, newVariant('light', 'animations/rain/light.gif'))

  const embers = newAsset('Embers', 'animation')
  doc = addAsset(doc, embers)
  doc = addVariant(doc, embers.id, newVariant('idle', 'animations/embers/idle.gif'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('day', 'bg/cove.png'))

  const harbour = newAsset('Harbour', 'background')
  doc = addAsset(doc, harbour)
  doc = addVariant(doc, harbour.id, newVariant('day', 'bg/harbour.png'))

  const theme = newAsset('Theme', 'music')
  doc = addAsset(doc, theme)
  doc = addVariant(doc, theme.id, newVariant('loop', 'music/theme.mp3'))

  return doc
}

const FILES: MediaFile[] = [
  { path: 'bg/cove.png', bytes: 1, url: 'app://media/p/media/bg/cove.png' },
  { path: 'sprites/wren.png', bytes: 1, url: 'app://media/p/media/sprites/wren.png' }
]

/** Two sections: the first stages the scene, the second inherits all of it. */
function twoSections(second: string[] = []) {
  return sectionScenes(
    seeded(),
    manuscript([
      prose('The cove.', { tags: ['bg: the_cove', 'show: wren at left', 'music: theme loop'] }),
      junction(['On'], 0),
      prose('Still there.', { tags: second })
    ])
  )
}

const rail = (
  index: number,
  open: boolean,
  scenes = twoSections(),
  handlers: { onSet?: (command: TagCommand) => void; onClear?: (raw: string) => void } = {}
) =>
  render(
    <SectionRail
      scene={scenes[index]!}
      media={seeded()}
      files={FILES}
      open={open}
      onSet={handlers.onSet ?? (() => {})}
      onClear={handlers.onClear ?? (() => {})}
    />
  )

describe('railRows', () => {
  it('lists the whole standing scene, inherited or not', () => {
    const rows = railRows(twoSections()[1]!, FILES)

    expect(rows.map((row) => row.label)).toEqual(['the_cove/day', 'wren/neutral', 'theme/loop'])
  })

  it('marks what this section set and what it merely stands in', () => {
    const [first, second] = twoSections()

    expect(railRows(first!, FILES).map((row) => row.here)).toEqual([true, true, true])
    expect(railRows(second!, FILES).map((row) => row.here)).toEqual([false, false, false])
  })

  it('marks only the one a section changed', () => {
    const rows = railRows(twoSections(['show: wren/happy'])[1]!, FILES)

    expect(rows.map((row) => [row.label, row.here])).toEqual([
      ['the_cove/day', false],
      ['wren/happy', true],
      ['theme/loop', false]
    ])
  })

  it('says where a character is standing', () => {
    expect(railRows(twoSections()[0]!, FILES)[1]?.detail).toBe('left')
  })

  /** The two settings a background carries, said together when both are on. */
  it('says what the background was told to do', () => {
    const bgRow = (tag: string): string | undefined =>
      railRows(
        sectionScenes(seeded(), manuscript([prose('The cove.', { tags: [tag] })]))[0]!,
        FILES
      ).find((row) => row.key === 'bg')?.detail

    expect(bgRow('bg: the_cove')).toBeUndefined()
    expect(bgRow('bg: the_cove flipped')).toBe('flipped')
    expect(bgRow('bg: the_cove once')).toBe('plays once')
    expect(bgRow('bg: the_cove once flipped')).toBe('plays once · flipped')
  })

  it('gives a look its thumbnail when the file is in the folder', () => {
    const rows = railRows(twoSections()[0]!, FILES)

    expect(rows[0]?.thumb).toBe('app://media/p/media/bg/cove.png')
    // Catalogued but not on disk: no thumbnail, and still a row.
    expect(rows[2]?.thumb).toBeUndefined()
  })

  it('says nothing about the map until it is turned off', () => {
    const on = railRows(twoSections()[0]!, FILES)
    expect(on.some((row) => row.key === 'map')).toBe(false)

    const off = railRows(twoSections(['map: off'])[1]!, FILES)
    expect(off.find((row) => row.key === 'map')?.here).toBe(true)
  })
})

describe('the open rail', () => {
  it('names everything standing in the scene', () => {
    rail(1, true)

    expect(screen.getByText('the_cove/day')).toBeInTheDocument()
    expect(screen.getByText('wren/neutral')).toBeInTheDocument()
    expect(screen.getByText('theme/loop')).toBeInTheDocument()
  })

  it('draws an inherited row apart from one set here', () => {
    const { container } = rail(1, true, twoSections(['show: wren/happy']))
    const rows = [...container.querySelectorAll('.rail-row')]

    expect(rows.map((row) => row.className)).toEqual([
      'rail-row is-inherited',
      'rail-row is-here',
      'rail-row is-inherited'
    ])
  })

  /** Events, not state: they belong only to the section that wrote them. */
  it('shows a stat change on the section that made it', () => {
    const scenes = twoSections(['stat: courage +1'])

    rail(1, true, scenes)
    expect(screen.getByText('stat: courage +1')).toBeInTheDocument()
  })

  it('says when a tag names nothing in the catalogue', () => {
    const scenes = sectionScenes(seeded(), manuscript([prose('Where?', { tags: ['bg: nowhere'] })]))

    rail(0, true, scenes)
    expect(screen.getByText(/names nothing in the catalogue/)).toBeInTheDocument()
  })

  it('says so when a section stages nothing at all', () => {
    const scenes = sectionScenes(seeded(), manuscript([prose('Plain.')]))

    rail(0, true, scenes)
    expect(screen.getByText('Nothing staged yet.')).toBeInTheDocument()
  })
})

describe('the closed rail', () => {
  /**
   * The reason it shows changes rather than the whole scene: a section that
   * inherits everything has to look quiet, or every strip down the page reads
   * the same and none of them tell you anything.
   */
  it('is empty on a section that changed nothing', () => {
    const { container } = rail(1, false)

    expect(container.querySelector('.section-rail')?.children).toHaveLength(0)
  })

  /**
   * By name, not as a glyph. A column of grey icons says a change happened here
   * without saying what to, which is most of the question — read down a chapter
   * the rail should say "and here it moves to the harbour".
   */
  it('names each thing this section changed', () => {
    const { container } = rail(0, false)

    expect([...container.querySelectorAll('.rail-brief .rail-name')].map((one) => one.textContent)).toEqual([
      'the_cove/day',
      'wren/neutral',
      'theme/loop'
    ])
  })

  it('names a change to something tracked as it is written', () => {
    const { container } = rail(1, false, twoSections(['stat: courage +1']))

    expect([...container.querySelectorAll('.rail-brief .rail-name')].map((one) => one.textContent)).toEqual([
      'stat: courage +1'
    ])
  })

  it('says how many tags named nothing', () => {
    const scenes = sectionScenes(seeded(), manuscript([prose('Where?', { tags: ['bg: nowhere'] })]))
    const { container } = rail(0, false, scenes)

    expect(container.querySelector('.rail-brief.is-wrong .rail-name')?.textContent).toBe(
      '1 not found'
    )
  })

  /** Where a look has art, the art says it faster than the name does. */
  it('shows the thumbnail beside the name', () => {
    const { container } = rail(0, false)

    expect(container.querySelector('.rail-brief .ic-thumb')).toBeInTheDocument()
  })
})

/**
 * Staging from the rail.
 *
 * The case worth being careful about is the last one: taking away something a
 * section merely inherited cannot delete a tag, because there is no tag here to
 * delete. It has to write the one that says "not any more" instead.
 */
describe('changing the scene', () => {
  const clickAway = async (name: string | RegExp) =>
    userEvent.click(screen.getByRole('button', { name }))

  const clickItem = async (name: string | RegExp) =>
    userEvent.click(screen.getByRole('menuitem', { name }))

  it('sets a background chosen from the catalogue', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await clickAway('Set the background')
    await clickItem('the_cove')

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'bg', name: 'the_cove', variant: 'day', once: false, flipped: false },
      undefined
    )
  })

  it('asks where a character stands before asking who', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await clickAway('Show a character')
    // The slot is on the first step, because picking somebody ends the menu.
    await userEvent.click(screen.getByRole('radio', { name: 'right' }))
    await clickItem('wren')
    await clickItem('happy')

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'happy', slot: 'right', flipped: false },
      undefined
    )
  })

  it('offers stopping the music as well as choosing a track', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await clickAway('Set the music')
    await clickItem('Stop the music')

    expect(onSet).toHaveBeenCalledWith({ kind: 'music', name: null, variant: null }, undefined)
  })

  /**
   * A stop can be told to take its time. The rail says so, because a section
   * that fades out reads exactly like one that cuts otherwise.
   */
  it('says how long a music stop takes, when it was given a fade', () => {
    const detail = (tag: string): string | undefined =>
      railRows(
        sectionScenes(seeded(), manuscript([prose('Quiet.', { tags: [tag] })]))[0]!,
        FILES
      ).find((row) => row.key === 'music')?.detail

    expect(detail('music: stop 5')).toBe('over 5s')
    expect(detail('music: stop')).toBeUndefined()
  })

  it('sets music by track name without writing its internal file variant', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await clickAway('Set the music')
    await clickItem('theme')

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'music', name: 'theme', variant: null },
      undefined
    )
  })

  it('deletes the tag when the section is the one that wrote it', async () => {
    const onClear = vi.fn()
    const onSet = vi.fn()
    rail(0, true, twoSections(), { onClear, onSet })

    await clickAway(/^Remove the_cove/)

    expect(onClear).toHaveBeenCalledWith('bg: the_cove')
    expect(onSet).not.toHaveBeenCalled()
  })

  /** The one that would look broken if it were left as a no-op. */
  it('writes a clearing tag when the section only inherited it', async () => {
    const onClear = vi.fn()
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onClear, onSet })

    await clickAway(/^Take the_cove\/day out from here/)

    expect(onSet).toHaveBeenCalledWith({
      kind: 'bg',
      name: null,
      variant: null,
      once: false,
      flipped: false
    })
    expect(onClear).not.toHaveBeenCalled()
  })

  it('hides an inherited character rather than deleting somebody else’s tag', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await clickAway(/^Take wren\/neutral out from here/)

    expect(onSet).toHaveBeenCalledWith({ kind: 'hide', name: 'wren' })
  })

  it('adds a change to something the story tracks', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await clickAway('Change something tracked')
    await userEvent.clear(screen.getByLabelText('What to change'))
    await userEvent.type(screen.getByLabelText('What to change'), 'courage')
    await clickAway('Add')

    expect(onSet).toHaveBeenCalledWith({ kind: 'stat', stat: 'courage', op: '+', value: 1 }, undefined)
  })

  it('will not add a change it cannot write as a tag', async () => {
    rail(1, true, twoSections(), {})

    await clickAway('Change something tracked')
    await userEvent.type(screen.getByLabelText('What to change'), 'not a name')

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})

/**
 * Turning something off is a change like any other, and the rail is the only
 * place it shows. Without these rows an author who stopped the music would see
 * no sign of having done it and no way back.
 */
describe('showing what a section turned off', () => {
  it('says the music was stopped here', () => {
    const rows = railRows(twoSections(['music: stop'])[1]!, FILES)
    const music = rows.find((row) => row.key === 'music')

    expect(music).toEqual({ key: 'music', icon: 'music', label: 'music stopped', here: true })
  })

  it('says the background was taken out here', () => {
    const rows = railRows(twoSections(['bg: none'])[1]!, FILES)

    expect(rows.find((row) => row.key === 'bg')?.label).toBe('no background')
  })

  it('says the stage was cleared here', () => {
    const rows = railRows(twoSections(['clear'])[1]!, FILES)

    expect(rows.find((row) => row.key === 'clear')?.label).toBe('stage cleared')
  })

  /** Carried forward it would sit on every later section saying nothing. */
  it('says none of it on the sections that merely inherit the silence', () => {
    const scenes = sectionScenes(
      seeded(),
      manuscript([
        prose('Quiet.', { tags: ['music: stop', 'bg: none'] }),
        junction(['On'], 0),
        prose('Still quiet.')
      ])
    )

    expect(railRows(scenes[0]!, FILES).map((row) => row.key)).toEqual(['bg', 'music'])
    expect(railRows(scenes[1]!, FILES)).toEqual([])
  })

  it('deletes the tag when that row is taken away', async () => {
    const onClear = vi.fn()
    rail(1, true, twoSections(['music: stop']), { onClear })

    await userEvent.click(screen.getByRole('button', { name: /^Remove music stopped/ }))

    expect(onClear).toHaveBeenCalledWith('music: stop')
  })
})

/**
 * Changing a row rather than adding one.
 *
 * The same menu either way, opened on what is there — so the question is "what
 * instead?" and not "what, from nothing?". The tag being changed is named, so
 * that swapping one character for another rewrites their line instead of
 * leaving them standing and adding somebody beside them.
 */
describe('changing what is already staged', () => {
  const open = async (name: string | RegExp) =>
    userEvent.click(screen.getByRole('button', { name }))

  it('opens the background menu on the background already there', async () => {
    rail(0, true, twoSections())

    await open('Change the_cove/day')

    const current = screen.getByRole('menuitem', { name: 'the_cove' })
    expect(current).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitem', { name: 'harbour' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('can play a background once and hold its final frame', async () => {
    const onSet = vi.fn()
    rail(0, true, twoSections(), { onSet })

    await open('Change the_cove/day')
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Play once and hold the last frame' })
    )

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'bg', name: 'the_cove', variant: 'day', once: true, flipped: false },
      'bg: the_cove'
    )
  })

  /**
   * The other setting a background carries. Offered in the same place as the
   * play-once, because both are about this background rather than about which
   * one it is.
   */
  it('can turn a background round', async () => {
    const onSet = vi.fn()
    rail(0, true, twoSections(), { onSet })

    await open('Change the_cove/day')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mirrored left to right' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'bg', name: 'the_cove', variant: 'day', once: false, flipped: true },
      'bg: the_cove'
    )
  })

  it('opens the background menu on the flip already written', async () => {
    rail(
      0,
      true,
      sectionScenes(
        seeded(),
        manuscript([prose('The cove.', { tags: ['bg: the_cove flipped'] })])
      ),
      {}
    )

    await open('Change the_cove/day')

    expect(screen.getByRole('checkbox', { name: 'Mirrored left to right' })).toBeChecked()
  })

  it('names the tag being changed, so the old one is rewritten', async () => {
    const onSet = vi.fn()
    rail(0, true, twoSections(), { onSet })

    await open('Change the_cove/day')
    await userEvent.click(screen.getByRole('menuitem', { name: 'harbour' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'bg', name: 'harbour', variant: 'day', once: false, flipped: false },
      'bg: the_cove'
    )
  })

  /** No tag here to rewrite — the choice is written into this section instead. */
  it('names nothing when the row was inherited', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(), { onSet })

    await open('Change the_cove/day')
    await userEvent.click(screen.getByRole('menuitem', { name: 'harbour' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'bg', name: 'harbour', variant: 'day', once: false, flipped: false },
      undefined
    )
  })

  /**
   * The reason the slot is preselected: changing only somebody's look must not
   * quietly walk them back to the middle of the stage.
   */
  it('keeps a character where they were standing', async () => {
    const onSet = vi.fn()
    rail(0, true, twoSections(), { onSet })

    await open('Change wren/neutral')
    await userEvent.click(screen.getByRole('menuitem', { name: 'happy' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'happy', slot: 'left', flipped: false },
      'show: wren at left'
    )
  })

  it('opens the character menu with where they stand already chosen', async () => {
    rail(0, true, twoSections())

    await open('Change wren/neutral')

    expect(screen.getByRole('radio', { name: 'left' })).toBeChecked()
  })

  it('opens a change on its own numbers', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(['stat: courage +2']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'stat: courage +2' }))
    expect(screen.getByLabelText('What to change')).toHaveValue('courage')
    expect(screen.getByLabelText('By how much')).toHaveValue('2')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSet).toHaveBeenCalledWith(
      { kind: 'stat', stat: 'courage', op: '+', value: 2 },
      'stat: courage +2'
    )
  })

  it('opens a cast change with both of its names', async () => {
    rail(1, true, twoSections(['npc: abeline affection +2']))

    await userEvent.click(screen.getByRole('button', { name: 'npc: abeline affection +2' }))

    expect(screen.getByLabelText('Who')).toHaveValue('abeline')
    expect(screen.getByLabelText('What about them')).toHaveValue('affection')
  })

  it('changes the speaker from the name already there', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(['speaker: Wren']), { onSet })

    await open('Change Wren')
    expect(screen.getByLabelText('Speaker')).toHaveValue('Wren')

    await userEvent.clear(screen.getByLabelText('Speaker'))
    await userEvent.type(screen.getByLabelText('Speaker'), 'Kael')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSet).toHaveBeenCalledWith({ kind: 'speaker', name: 'Kael' }, 'speaker: Wren')
  })

  it('changes who the frame leans on, marking the current rule', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(['active: none']), { onSet })

    await open('Change nobody')
    expect(screen.getByRole('menuitem', { name: 'nobody' })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('menuitem', { name: 'whoever is speaking' }))
    expect(onSet).toHaveBeenCalledWith(
      { kind: 'active', active: { rule: 'speaker' } },
      'active: none'
    )
  })

  /** Two states: a menu of two items would say less than the click itself. */
  it('toggles the map rather than opening a menu', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(['map: off']), { onSet })

    await open('Change map off')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onSet).toHaveBeenCalledWith({ kind: 'map', enabled: true }, 'map: off')
  })
})

/**
 * Taking somebody off stage leaves nothing to draw, so without a row of its own
 * a section that hides a character shows no sign of having done it — the same
 * gap "music stopped" and "no background" already close.
 */
describe('showing who a section took off stage', () => {
  it('names the character it hid', () => {
    const rows = railRows(twoSections(['hide: wren'])[1]!, FILES)
    const hidden = rows.find((row) => row.key === 'hide:wren')

    expect(hidden).toMatchObject({ label: 'wren', detail: 'hidden', here: true })
  })

  it('says nothing on the sections that merely inherit the absence', () => {
    const scenes = sectionScenes(
      seeded(),
      manuscript([
        prose('She arrives.', { tags: ['show: wren at left'] }),
        junction(['On'], 0),
        prose('She goes.', { tags: ['hide: wren'] }),
        junction(['On'], 0),
        prose('Later.')
      ])
    )

    expect(railRows(scenes[1]!, FILES).map((row) => row.key)).toEqual(['hide:wren'])
    expect(railRows(scenes[2]!, FILES)).toEqual([])
  })

  /**
   * Not both at once. A section that hides somebody and then shows them again
   * ends with them on stage, and the row that says where they are standing is
   * the truthful one.
   */
  it('says nothing when the section put them back', () => {
    const rows = railRows(twoSections(['hide: wren', 'show: wren at right'])[1]!, FILES)

    expect(rows.some((row) => row.key === 'hide:wren')).toBe(false)
    expect(rows.find((row) => row.key === 'char:wren')?.detail).toBe('right')
  })

  /** Hiding somebody who was never there is still what the author wrote. */
  it('names one hidden who was not on stage, because the tag is real', () => {
    const rows = railRows(twoSections(['hide: kael'])[1]!, FILES)

    expect(rows.find((row) => row.key === 'hide:kael')?.detail).toBe('hidden')
  })

  it('deletes the tag that hid them', async () => {
    const onClear = vi.fn()
    rail(1, true, twoSections(['hide: wren']), { onClear })

    await userEvent.click(screen.getByRole('button', { name: /^Remove wren/ }))

    expect(onClear).toHaveBeenCalledWith('hide: wren')
  })

  /** Showing them again rewrites the line that hid them, rather than following it. */
  it('brings them back through the same menu', async () => {
    const onSet = vi.fn()
    rail(1, true, twoSections(['hide: wren']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'neutral' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'neutral', slot: 'middle', flipped: false },
      'hide: wren'
    )
  })
})

/**
 * A row edits its own line, and nothing else.
 *
 * Clicking Kael used to open the whole cast, which is the question adding asks
 * — "who?" — and not the one the row asks, which is "what about Kael?". The
 * menu now opens on him: his looks, and the side he is standing on. Swapping
 * him out is still there, one item down, because it is a different act.
 */
describe('a row opens on itself', () => {
  it('opens a character on their own looks, not on the cast', async () => {
    rail(0, true, twoSections())

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))

    expect(screen.getByRole('menuitem', { name: 'neutral' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'happy' })).toBeInTheDocument()
    // Kael is in the cast, and is none of this row's business.
    expect(screen.queryByRole('menuitem', { name: 'kael' })).not.toBeInTheDocument()
  })

  it('says whose looks these are', async () => {
    const { container } = rail(0, true, twoSections())

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))

    expect(container.querySelector('.ic-menu__label')?.textContent).toBe('wren')
  })

  it('keeps where they stand on the same step as their looks', async () => {
    rail(0, true, twoSections())

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))

    expect(screen.getByRole('radio', { name: 'left' })).toBeChecked()
    expect(screen.getByRole('menuitem', { name: 'happy' })).toBeInTheDocument()
  })

  it('offers somebody else, one step down', async () => {
    const onSet = vi.fn()
    rail(0, true, twoSections(), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Somebody else…' }))

    expect(screen.getByRole('menuitem', { name: 'kael' })).toBeInTheDocument()
  })

  /**
   * Nothing to change but which one it is, so the list is the answer rather
   * than a menu whose only item is "another background".
   */
  it('opens a one-look background straight on the list', async () => {
    const scenes = sectionScenes(
      seeded(),
      manuscript([prose('The harbour.', { tags: ['bg: harbour'] })])
    )
    rail(0, true, scenes)

    await userEvent.click(screen.getByRole('button', { name: 'Change harbour/day' }))

    expect(screen.getByRole('menuitem', { name: 'the_cove' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'harbour' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  /** Adding still asks the question adding asks. */
  it('still opens the whole cast when adding somebody', async () => {
    rail(0, true, twoSections())

    await userEvent.click(screen.getByRole('button', { name: 'Show a character' }))

    expect(screen.getByRole('menuitem', { name: 'wren' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'kael' })).toBeInTheDocument()
  })
})

/**
 * Moving somebody who was staged in an earlier section.
 *
 * The commonest staging change there is — she moves left, somebody new comes in
 * on the right — and it did nothing at all: the side was a setting waiting for
 * a look to be clicked afterwards, which is not a step anybody would guess at.
 */
describe('moving a character', () => {
  const staged = (second: string[] = []) =>
    sectionScenes(
      seeded(),
      manuscript([
        prose('She is here.', { tags: ['bg: the_cove', 'show: wren at left'] }),
        junction(['On'], 0),
        prose('Time passes.', { tags: second })
      ])
    )

  it('writes the move as soon as a side is chosen', async () => {
    const onSet = vi.fn()
    rail(1, true, staged(), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))
    await userEvent.click(screen.getByRole('radio', { name: 'right' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'neutral', slot: 'right', flipped: false },
      undefined
    )
  })

  it('keeps the look she is already wearing', async () => {
    const onSet = vi.fn()
    rail(1, true, staged(['show: wren/happy']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/happy' }))
    await userEvent.click(screen.getByRole('radio', { name: 'middle' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'happy', slot: 'middle', flipped: false },
      'show: wren/happy'
    )
  })

  it('names the tag when this section is the one that staged her', async () => {
    const onSet = vi.fn()
    rail(0, true, staged(), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))
    await userEvent.click(screen.getByRole('radio', { name: 'right' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'neutral', slot: 'right', flipped: false },
      'show: wren at left'
    )
  })

  /** Adding has nobody to move yet, so the side stays a choice made ahead. */
  it('does not write when a side is chosen while adding somebody', async () => {
    const onSet = vi.fn()
    rail(1, true, staged(), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Show a character' }))
    await userEvent.click(screen.getByRole('radio', { name: 'right' }))

    expect(onSet).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('menuitem', { name: 'kael' }))
    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'kael', variant: 'neutral', slot: 'right', flipped: false },
      undefined
    )
  })

  /** She is off stage, so a side is how she comes back. */
  it('brings a hidden character back on the side chosen', async () => {
    const onSet = vi.fn()
    rail(1, true, staged(['hide: wren']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren' }))
    await userEvent.click(screen.getByRole('radio', { name: 'right' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'neutral', slot: 'right', flipped: false },
      'hide: wren'
    )
  })
})

/**
 * Which way a character faces.
 *
 * Written on the tag rather than remembered, so the box is part of the line
 * being edited: opening a flipped character shows her flipped, and turning her
 * round is the whole edit when it is the only thing asked for.
 */
describe('facing the other way', () => {
  const staged = (tags: string[]) =>
    sectionScenes(
      seeded(),
      manuscript([prose('She is here.', { tags: ['bg: the_cove', ...tags] })])
    )

  it('says so in the row', () => {
    const rows = railRows(staged(['show: wren at left flipped'])[0]!, FILES)

    expect(rows.find((row) => row.key === 'char:wren')?.detail).toBe('left · flipped')
  })

  it('says only the side when she is as drawn', () => {
    const rows = railRows(staged(['show: wren at left'])[0]!, FILES)

    expect(rows.find((row) => row.key === 'char:wren')?.detail).toBe('left')
  })

  it('opens on how she is drawn now', async () => {
    rail(0, true, staged(['show: wren at left flipped']))

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))

    expect(screen.getByRole('checkbox', { name: 'Facing the other way' })).toBeChecked()
  })

  it('turns her round on the spot', async () => {
    const onSet = vi.fn()
    rail(0, true, staged(['show: wren at left']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Facing the other way' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'neutral', slot: 'left', flipped: true },
      'show: wren at left'
    )
  })

  /** Changing her look must not turn her back, which is a change nobody asked for. */
  it('keeps her turned when only her look changes', async () => {
    const onSet = vi.fn()
    rail(0, true, staged(['show: wren at left flipped']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'happy' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'happy', slot: 'left', flipped: true },
      'show: wren at left flipped'
    )
  })

  it('keeps her turned when she only moves', async () => {
    const onSet = vi.fn()
    rail(0, true, staged(['show: wren at left flipped']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change wren/neutral' }))
    await userEvent.click(screen.getByRole('radio', { name: 'right' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'wren', variant: 'neutral', slot: 'right', flipped: true },
      'show: wren at left flipped'
    )
  })

  it('brings somebody new on facing the other way', async () => {
    const onSet = vi.fn()
    rail(0, true, staged([]), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Show a character' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Facing the other way' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'kael' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'show', name: 'kael', variant: 'neutral', slot: 'middle', flipped: true },
      undefined
    )
  })
})

/**
 * Animations in the rail.
 *
 * A row like a character's, and edited like one — they take the same slots and
 * the same flip. Kept apart from the cast because they are a different
 * catalogue: a story may have a character called `rain` and an effect called
 * `rain`, and one list could not hold both.
 */
describe('animations', () => {
  const running = (tags: string[]) =>
    sectionScenes(seeded(), manuscript([prose('It rains.', { tags: ['bg: the_cove', ...tags] })]))

  it('gets a row of its own, after the cast', () => {
    const rows = railRows(running(['show: wren at left', 'anim: rain'])[0]!, FILES)

    expect(rows.map((row) => row.key)).toEqual(['bg', 'char:wren', 'anim:rain'])
  })

  it('says which way round, and nothing about where', () => {
    expect(
      railRows(running(['anim: rain flipped'])[0]!, FILES).find((r) => r.key === 'anim:rain')?.detail
    ).toBe('flipped')
    expect(
      railRows(running(['anim: rain'])[0]!, FILES).find((r) => r.key === 'anim:rain')?.detail
    ).toBeUndefined()
  })

  it('reads as set here when this section started it', () => {
    expect(railRows(running(['anim: rain'])[0]!, FILES).find((r) => r.key === 'anim:rain')?.here).toBe(
      true
    )
  })

  it('says when a section stopped them all', () => {
    const scenes = sectionScenes(
      seeded(),
      manuscript([
        prose('It rains.', { tags: ['anim: rain'] }),
        junction(['On'], 0),
        prose('It stops.', { tags: ['anim: none'] })
      ])
    )

    expect(railRows(scenes[1]!, FILES).map((row) => row.key)).toEqual(['anim'])
    expect(railRows(scenes[1]!, FILES)[0]?.label).toBe('animations stopped')
  })

  it('opens on its own looks, not on the whole catalogue', async () => {
    rail(0, true, running(['anim: rain']))

    await userEvent.click(screen.getByRole('button', { name: 'Change rain/heavy' }))

    expect(screen.getByRole('menuitem', { name: 'light' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'embers' })).not.toBeInTheDocument()
    // It fills the frame, so it is never asked where to stand.
    expect(screen.queryByRole('radiogroup', { name: 'Where they stand' })).not.toBeInTheDocument()
  })

  it('changes the one it opened on', async () => {
    const onSet = vi.fn()
    rail(0, true, running(['anim: rain']), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Change rain/heavy' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'light' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'anim', name: 'rain', variant: 'light', flipped: false },
      'anim: rain'
    )
  })

  it('starts one from the add row', async () => {
    const onSet = vi.fn()
    rail(0, true, running([]), { onSet })

    await userEvent.click(screen.getByRole('button', { name: 'Show an animation' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'embers' }))

    expect(onSet).toHaveBeenCalledWith(
      { kind: 'anim', name: 'embers', variant: 'idle', flipped: false },
      undefined
    )
  })

  /** `hide` names a thing on the stage, not a kind of thing. */
  it('is taken off with hide, like a character', async () => {
    const onSet = vi.fn()
    const onClear = vi.fn()
    rail(0, true, running(['anim: rain']), { onSet, onClear })

    await userEvent.click(screen.getByRole('button', { name: /^Remove rain/ }))

    expect(onClear).toHaveBeenCalledWith('anim: rain')
  })
})
