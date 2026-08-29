import { describe, expect, it } from 'vitest'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from './mediaDoc'
import { EDITABLE, type Manuscript, type ManuscriptNode, type ProseNode } from './manuscript'
import { declaresCharacter, declaresKind, eventsOf, sectionScenes } from './sectionScene'

/**
 * The rail reads the story as a reader does, not as the file does.
 *
 * Nearly every case here is about inheritance, because that is the whole reason
 * this exists: a section that mentions no background is still standing in one,
 * and a rail that could not say so would be blank on most of the manuscript.
 */

function seeded(): MediaDocument {
  let doc = emptyMedia()

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('neutral', 'sprites/wren-neutral.png'))
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  const kael = newAsset('Kael', 'character')
  doc = addAsset(doc, kael)
  doc = addVariant(doc, kael.id, newVariant('neutral', 'sprites/kael.png'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('day', 'bg/cove-day.png'))

  const harbour = newAsset('The Harbour', 'background')
  doc = addAsset(doc, harbour)
  doc = addVariant(doc, harbour.id, newVariant('day', 'bg/harbour.png'))

  const theme = newAsset('Theme', 'music')
  doc = addAsset(doc, theme)
  doc = addVariant(doc, theme.id, newVariant('loop', 'music/theme.mp3'))

  const door = newAsset('Door slam', 'music')
  doc = addAsset(doc, door)
  doc = addVariant(doc, door.id, newVariant('heavy', 'music/door_slam/heavy.ogg'))

  return doc
}

let counter = 0

function prose(text: string, tags: string[] = []): ProseNode {
  counter += 1
  return {
    kind: 'prose',
    id: `n${counter}`,
    text,
    tags,
    knot: null,
    source: { file: 'ink/main.ink', line: counter },
    edit: EDITABLE
  }
}

function junction(): ManuscriptNode {
  counter += 1
  return { kind: 'junction', id: `j${counter}`, choices: [], chosenIndex: 0, source: null }
}

/** A manuscript from runs of prose, one array per section. */
function reading(...sections: ProseNode[][]): Manuscript {
  const nodes: ManuscriptNode[] = []
  sections.forEach((section, index) => {
    if (index > 0) nodes.push(junction())
    nodes.push(...section)
  })

  return {
    entryPath: '/w/ink/main.ink',
    entryLabel: 'ink/main.ink',
    nodes,
    path: [],
    wordCount: 0,
    complete: true,
    diagnostics: []
  }
}

describe('sectionScenes', () => {
  it('carries a background into every section after the one that set it', () => {
    const scenes = sectionScenes(
      seeded(),
      reading(
        [prose('The cove.', ['bg: the_cove'])],
        [prose('Still the cove.')],
        [prose('And still.')]
      )
    )

    expect(scenes.map((one) => one.after.background?.asset.name)).toEqual([
      'the_cove',
      'the_cove',
      'the_cove'
    ])
  })

  /**
   * The distinction the rail draws solid or faint. Both sections are *in* the
   * cove; only one of them says so.
   */
  it('separates what a section says from what it inherited', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('The cove.', ['bg: the_cove'])], [prose('Still the cove.')])
    )

    expect(declaresKind(scenes[0]!, 'bg')).toBe(true)
    expect(declaresKind(scenes[1]!, 'bg')).toBe(false)
    expect(scenes[1]!.after.background?.asset.name).toBe('the_cove')
  })

  it('reports the stage as the section began as well as how it left it', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('The cove.', ['bg: the_cove'])], [prose('Elsewhere.', ['bg: the_harbour'])])
    )

    expect(scenes[1]!.before.background?.asset.name).toBe('the_cove')
    expect(scenes[1]!.after.background?.asset.name).toBe('the_harbour')
  })

  it('lets a section put the frame back to nothing', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('The cove.', ['bg: the_cove'])], [prose('Dark.', ['bg: none'])])
    )

    expect(scenes[1]!.after.background).toBeNull()
    expect(declaresKind(scenes[1]!, 'bg')).toBe(true)
  })

  it('keeps the cast and where they stand across a section that says nothing', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('Wren arrives.', ['show: wren at left'])], [prose('She waits.')])
    )

    expect(scenes[1]!.after.characters.map((one) => one.asset.name)).toEqual(['wren'])
    expect(scenes[1]!.after.slots['wren']).toBe('left')
    expect(declaresCharacter(scenes[1]!, 'wren')).toBe(false)
  })

  it('counts a look change as this section speaking about that character', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('Wren arrives.', ['show: wren at left'])], [prose('She grins.', ['show: wren/happy'])])
    )

    expect(declaresCharacter(scenes[1]!, 'wren')).toBe(true)
    expect(scenes[1]!.after.characters[0]?.variant.name).toBe('happy')
    // Swapping a look must not move them; only `at …` does that.
    expect(scenes[1]!.after.slots['wren']).toBe('left')
  })

  it('empties the stage on a clear, and says the clearing section spoke for everyone', () => {
    const scenes = sectionScenes(
      seeded(),
      reading(
        [prose('Both arrive.', ['bg: the_cove', 'show: wren at left', 'show: kael at right'])],
        [prose('Alone.', ['clear'])]
      )
    )

    expect(scenes[1]!.after.characters).toEqual([])
    expect(scenes[1]!.after.background).toBeNull()
    expect(declaresCharacter(scenes[1]!, 'wren')).toBe(true)
    expect(declaresCharacter(scenes[1]!, 'kael')).toBe(true)
  })

  it('holds music across sections until a section stops it', () => {
    const scenes = sectionScenes(
      seeded(),
      reading(
        [prose('It begins.', ['music: theme loop'])],
        [prose('It goes on.')],
        [prose('Silence.', ['music: stop'])]
      )
    )

    expect(scenes[0]!.after.music?.asset.name).toBe('theme')
    expect(scenes[1]!.after.music?.asset.name).toBe('theme')
    expect(scenes[2]!.after.music).toBeNull()
  })

  /**
   * The other half of the split. "Courage went up" is not a thing that is still
   * true two scenes later, so it must never appear on a section that did not
   * write it — otherwise the rail would read as though the stat rose again.
   */
  it('leaves a stat change on the section that made it and nowhere else', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('Brave.', ['stat: courage +1'])], [prose('Later.')])
    )

    expect(eventsOf(scenes[0]!)).toEqual([{ kind: 'stat', stat: 'courage', op: '+', value: 1 }])
    expect(eventsOf(scenes[1]!)).toEqual([])
  })

  it('keeps every kind of change together, and to its own section', () => {
    const scenes = sectionScenes(
      seeded(),
      reading(
        [prose('A wedding.', ['npc: abeline status = married', 'stat: courage + 1'])],
        [prose('After.')]
      )
    )

    expect(eventsOf(scenes[0]!).map((one) => one.kind)).toEqual(['npc', 'stat'])
    expect(eventsOf(scenes[1]!)).toEqual([])
  })

  it('keeps a sound cue as an event only in the section that fires it', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('The door slams.', ['music: door_slam'])], [prose('After.')])
    )

    expect(eventsOf(scenes[0]!)).toEqual([
      { kind: 'music', name: 'door_slam', variant: null }
    ])
    expect(eventsOf(scenes[1]!)).toEqual([])
  })

  it('reports a tag that named nothing, rather than showing an empty stage', () => {
    const scenes = sectionScenes(seeded(), reading([prose('Where?', ['bg: the_atrium'])]))

    expect(scenes[0]!.after.unresolved).toEqual(['bg: the_atrium'])
    expect(scenes[0]!.after.background).toBeNull()
  })

  /**
   * `applyTags` accumulates complaints along with the scene, which would put a
   * typo from the opening on the rail of every section after it — sending the
   * author looking for a tag those sections do not contain.
   */
  it('reports a bad tag against the section that wrote it, and no other', () => {
    const scenes = sectionScenes(
      seeded(),
      reading([prose('Where?', ['bg: the_atrium'])], [prose('Later.')], [prose('Later still.', ['bg: the_cove'])])
    )

    expect(scenes[0]!.after.unresolved).toEqual(['bg: the_atrium'])
    expect(scenes[1]!.after.unresolved).toEqual([])
    expect(scenes[2]!.after.unresolved).toEqual([])
  })

  it('keeps the tags as written, for naming one to remove', () => {
    const scenes = sectionScenes(seeded(), reading([prose('The cove.', ['bg:the_cove', 'stat: courage +1'])]))

    expect(scenes[0]!.raw).toEqual(['bg:the_cove', 'stat: courage +1'])
  })

  it('gives every section an index matching its position', () => {
    const scenes = sectionScenes(seeded(), reading([prose('One.')], [prose('Two.')], [prose('Three.')]))

    expect(scenes.map((one) => one.index)).toEqual([0, 1, 2])
  })

  it('reads an empty manuscript as one empty section', () => {
    const scenes = sectionScenes(seeded(), reading([]))

    expect(scenes).toHaveLength(1)
    expect(scenes[0]!.after.background).toBeNull()
    expect(scenes[0]!.declared).toEqual([])
  })
})
