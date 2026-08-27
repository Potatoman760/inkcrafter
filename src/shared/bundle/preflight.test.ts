import { describe, expect, it } from 'vitest'
import { addAsset, addVariant, emptyMedia, newAsset, newVariant } from '../mediaDoc'
import { emptyStats, newStat, newVariable, type StatsDocument } from '../statsDoc'
import { emptyNpcs, parseNpcs } from './npcDoc'
import {
  emptyMap,
  newMapArea,
  type MapArea,
  type MapDocument,
  type MapLocation
} from './mapDoc'
import type { GalleryDocument } from './galleryDoc'
import { COMBATANT_STATES, newCombatMinigame, newQuickhandsMinigame } from './minigameDoc'
import { preflight, type PreflightInput } from './preflight'

/**
 * The pass that reads the ink and the catalogues together, for the mistakes the
 * compiler is happy with. Everything here is a warning, so what matters is that
 * each one fires on the thing it names and stays quiet otherwise — a check that
 * cries wolf is worse than no check, because it teaches an author to skim.
 */

const STATS: StatsDocument = {
  ...emptyStats(),
  stats: [{ ...newStat('Courage') }, { ...newStat('Has met Wren', 'boolean') }],
  variables: [newVariable('Secret count')]
}

const NPCS = parseNpcs(
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

const MEDIA = (() => {
  let doc = emptyMedia()
  const abeline = newAsset('Abeline', 'character')
  doc = addAsset(doc, abeline)
  doc = addVariant(doc, abeline.id, newVariant('neutral', 'sprites/abeline.png'))
  return doc
})()

function check(ink: string, overrides: Partial<PreflightInput> = {}): string[] {
  return preflight({
    sources: new Map([['ink/main.ink', ink]]),
    media: emptyMedia(),
    stats: STATS,
    npcs: NPCS,
    map: emptyMap(),
    knots: [],
    ...overrides
  }).map((problem) => problem.message)
}

describe('a change that lands after the branch reading it', () => {
  const GATED = `-> start
=== start ===
* [Go]
    # npc: abeline affection +2
    -> the_vow
=== the_vow ===
{ abeline_affection >= 2:
    -> propose
- else:
    -> too_distant
}
`

  it('is reported, with the line the tag is on', () => {
    const problems = preflight({
      sources: new Map([['ink/main.ink', GATED]]),
      media: emptyMedia(),
      stats: STATS,
      npcs: NPCS,
      map: emptyMap(),
      knots: []
    })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ file: 'ink/main.ink', line: 4 })
    expect(problems[0]!.message).toContain('branches on abeline_affection')
  })

  // One line of prose is the whole fix, and the check has to agree.
  it('is not reported once a line of prose separates them', () => {
    expect(
      check(GATED.replace('    -> the_vow', '    She smiles.\n    -> the_vow'))
    ).toEqual([])
  })

  it('catches the same thing without a divert in between', () => {
    expect(
      check(`-> start
=== start ===
# stat: courage +1
{ courage >= 1: BRAVE | NOT }
-> END
`)
    ).toHaveLength(1)
  })

  /**
   * The common, correct arrangement: a tag then a divert to somewhere that
   * opens with prose. The tag lands on that prose, well before any later
   * branch, and warning about it would bury the case that is actually wrong.
   */
  it('stays quiet when the divert leads to prose', () => {
    expect(
      check(`-> start
=== start ===
* [Go]
    # npc: abeline affection +2
    -> the_vision
=== the_vision ===
The light fades.
{ abeline_affection >= 2: SHE PROPOSES | SHE IS DISTANT }
-> END
`)
    ).toEqual([])
  })

  it('stays quiet when the branch reads something else entirely', () => {
    expect(
      check(`-> start
=== start ===
# npc: abeline affection +2
{ courage >= 1: BRAVE | NOT }
-> END
`)
    ).toEqual([])
  })

  it('has no opinion about somebody who is not in the cast', () => {
    expect(
      check(`-> start
=== start ===
# npc: cordelia affection +2
{ cordelia_affection >= 2: YES | NO }
-> END
`)
    ).toHaveLength(1) // only the "nobody called cordelia" warning
  })
})

describe('a tag pointed at the wrong kind of stat', () => {
  it('is reported, since no # stat: tag can set a yes/no', () => {
    const [message] = check('# stat: has_met_wren = 1\nDone.\n')
    expect(message).toContain('which no # stat: tag can set')
  })

  it('leaves a number stat alone', () => {
    expect(check('# stat: courage +1\nDone.\n')).toEqual([])
  })

  it('also accepts a numeric hidden var', () => {
    expect(check('# stat: secret_count +1\nDone.\n')).toEqual([])
  })

  it('says when the stat is not in the catalogue at all', () => {
    expect(check('# stat: nerve +1\nDone.\n')[0]).toContain('not a variable in the catalogue')
  })

  // An empty catalogue means no opinion: a story still declaring its stats by
  // hand in the ink is not making a mistake.
  it('says nothing when there is no catalogue to check against', () => {
    expect(
      check('# stat: nerve +1\nDone.\n', { stats: emptyStats(), npcs: emptyNpcs() })
    ).toEqual([])
  })
})

describe('a tag that puts somebody somewhere', () => {
  it('says nothing about a slot it understands', () => {
    expect(check('# char: abeline at left\nDone.\n', { media: MEDIA })).toEqual([])
  })

  /**
   * A misspelt slot fails the whole tag in the grammar, so it arrives here as a
   * tag that cannot be read — which is already reported, and reads correctly: a
   * character who will not appear at all is exactly what the author gets.
   */
  it('reports a slot that is not one of the three', () => {
    const [message] = check('# char: abeline at lft\nDone.\n', { media: MEDIA })
    expect(message).toContain('the value cannot be read')
  })
})

describe('a tag naming who the frame leans on', () => {
  it('reports a character who is not in the catalogue', () => {
    const [message] = check('# active: nobody_here\nDone.\n', { media: MEDIA })
    expect(message).toContain('there is no character called nobody_here to emphasise')
  })

  it('leaves a real character, and the wordings that name nobody, alone', () => {
    expect(check('# active: abeline\nDone.\n', { media: MEDIA })).toEqual([])
    expect(check('# active: none\nDone.\n', { media: MEDIA })).toEqual([])
    expect(check('# active: auto\nDone.\n', { media: MEDIA })).toEqual([])
  })

  // Speakers are prose, and every line of narration would fire.
  it('has no opinion about a speaker naming nobody', () => {
    expect(check('# speaker: Narrator\nDone.\n', { media: MEDIA })).toEqual([])
  })
})

describe('a sound cue', () => {
  const SOUNDS = (() => {
    let doc = emptyMedia()
    const door = newAsset('Door slam', 'sound')
    doc = addAsset(doc, door)
    return addVariant(doc, door.id, newVariant('heavy', 'sounds/door_slam/heavy.ogg'))
  })()

  it('accepts a catalogued sound and variant anywhere in the ink', () => {
    expect(check('# sound: door_slam/heavy\nThe door slams.\n', { media: SOUNDS })).toEqual([])
  })

  it('reports an unknown sound by its media kind', () => {
    expect(check('# sound: glass_break\nGlass breaks.\n', { media: SOUNDS })[0]).toContain(
      'there is no sound called glass_break'
    )
  })
})

describe('gallery references', () => {
  it('reports missing media and media that cannot unlock from a background or animation tag', () => {
    const character = MEDIA.assets[0]!
    const look = character.variants[0]!
    const gallery: GalleryDocument = {
      version: 1,
      groups: [
        {
          id: 'med_group',
          name: 'Abeline',
          aspect: '9:16',
          cover: null,
          items: [
            { id: 'med_one', assetId: character.id, variantId: look.id },
            { id: 'med_two', assetId: 'missing', variantId: 'missing' }
          ]
        }
      ]
    }

    const messages = check('', { media: MEDIA, gallery })
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('not a background or animation'),
      expect.stringContaining('no longer in the media catalogue')
    ]))
  })
})

describe('combat backgrounds', () => {
  it('accepts a concrete background look and reports a stale reference', () => {
    let media = emptyMedia()
    const background = newAsset('Courtyard', 'background')
    const courtyard = newVariant('night', 'backgrounds/courtyard/night.png')
    media = addAsset(media, background)
    media = addVariant(media, background.id, courtyard)

    const opponent = newAsset('Guard', 'combatant')
    media = addAsset(media, opponent)
    for (const state of COMBATANT_STATES) {
      media = addVariant(media, opponent.id, newVariant(state, `combatants/guard/${state}.png`))
    }

    const combat = newCombatMinigame('Courtyard guard')
    combat.opponentAssetId = opponent.id
    combat.playerHealthVariable = 'health'
    combat.resultVariable = 'combat_result'
    combat.background = { assetId: background.id, variantId: courtyard.id }
    const stats: StatsDocument = {
      ...emptyStats(),
      variables: [newVariable('Health'), newVariable('Combat result', 'text')]
    }

    expect(check('', { media, stats, minigames: { version: 1, minigames: [combat] } })).toEqual([])

    combat.background = { assetId: background.id, variantId: 'missing' }
    expect(check('', { media, stats, minigames: { version: 1, minigames: [combat] } })).toContain(
      "Courtyard guard's background picture is no longer in the media catalogue."
    )
  })
})

describe('quick-hands configuration', () => {
  it('accepts optional animation art and reports a stale or unsuitable look', () => {
    let media = emptyMedia()
    const token = newAsset('Guild token', 'animation')
    const gold = newVariant('gold', 'animations/guild_token/gold.png')
    media = addAsset(media, token)
    media = addVariant(media, token.id, gold)

    const quickhands = newQuickhandsMinigame('Quick hands')
    quickhands.resultVariable = 'quickhands_result'
    quickhands.targetArt = { assetId: token.id, variantId: gold.id }
    const stats: StatsDocument = {
      ...emptyStats(),
      variables: [newVariable('Quickhands result', 'text')]
    }

    expect(check('', { media, stats, minigames: { version: 1, minigames: [quickhands] } })).toEqual([])

    quickhands.targetArt = { assetId: token.id, variantId: 'missing' }
    expect(check('', { media, stats, minigames: { version: 1, minigames: [quickhands] } })).toContain(
      "Quick hands's target picture is no longer in the media catalogue."
    )
  })
})

/**
 * Several maps that link to each other.
 *
 * A map nobody can reach is not an error anywhere else: it parses, it exports,
 * and it draws perfectly in the editor. The only symptom is a picture the
 * author drew that no reader ever sees, so this is the only thing that says so.
 */
describe('the maps', () => {
  const HOTSPOT = (over: Partial<MapLocation> = {}): MapLocation => ({
    id: 'loc_1',
    label: 'The Gate',
    x: 100,
    y: 100,
    width: 200,
    height: 60,
    destination: { to: 'knot', name: 'start' },
    available: null,
    lockedHint: '',
    art: '',
    ...over
  })

  const world = (over: Partial<MapArea> = {}): MapArea => ({
    ...newMapArea('World'),
    ...over
  })

  const maps = (...areas: MapArea[]): MapDocument => ({ version: 2, maps: areas })
  const checkMaps = (map: MapDocument, knots = ['start']): string[] => check('', { map, knots })

  it('says nothing about a map that hangs together', () => {
    expect(
      checkMaps(maps(world({ knots: ['start'], locations: [HOTSPOT()] })))
    ).toEqual([])
  })

  it('names the map a problem is on, once there is more than one', () => {
    const [only] = checkMaps(
      maps(
        world({ knots: ['start'], locations: [HOTSPOT({ destination: { to: 'knot', name: 'gone' } })] })
      )
    )
    // One map needs no prefix: there is only one picture to open.
    expect(only).toBe('The Gate travels to gone, which is not a knot in the story.')

    expect(
      checkMaps(
        maps(
          world({
            knots: ['start'],
            locations: [HOTSPOT({ destination: { to: 'knot', name: 'gone' } })]
          }),
          { ...newMapArea('City'), knots: ['start'] }
        )
      )
    ).toContain('World — The Gate travels to gone, which is not a knot in the story.')
  })

  it('reports a hotspot that opens a map nothing answers to', () => {
    expect(
      checkMaps(
        maps(world({ knots: ['start'], locations: [HOTSPOT({ destination: { to: 'map', name: 'city' } })] }))
      )
    ).toContain('The Gate opens the map city, which is not a map here.')
  })

  it('reports a hotspot that opens the map it is already on', () => {
    expect(
      checkMaps(
        maps(
          world({
            knots: ['start'],
            locations: [HOTSPOT({ destination: { to: 'map', name: 'world' } })]
          })
        )
      )
    ).toContain('The Gate opens the map it is already on, so clicking it does nothing.')
  })

  it('reports two maps sharing a name', () => {
    expect(
      checkMaps(maps(world({ knots: ['start'] }), world({ knots: ['start'] })))
    ).toContain('Two maps are called world. Every hotspot opening it reaches whichever comes first.')
  })

  it('reports a claimed knot the story does not have', () => {
    expect(checkMaps(maps(world({ knots: ['nowhere'] })))).toContain(
      'It is the map for nowhere, which is not a knot in the story.'
    )
  })

  it('reports a knot two maps both claim', () => {
    expect(
      checkMaps(
        maps(world({ knots: ['start'] }), { ...newMapArea('City'), knots: ['start'] })
      )
    ).toContain('start is the map for both World and City. The first wins.')
  })

  it('reports a map nothing can reach', () => {
    expect(
      checkMaps(maps(world({ knots: ['start'] }), newMapArea('City')))
    ).toContain(
      'Nothing reaches City — no hotspot opens it and it is the map for no knot, so a reader can never see it.'
    )
  })

  it('counts being opened by a hotspot as reaching it', () => {
    expect(
      checkMaps(
        maps(
          world({
            knots: ['start'],
            locations: [HOTSPOT({ destination: { to: 'map', name: 'city' } })]
          }),
          newMapArea('City')
        )
      )
    ).toEqual([])
  })

  /** The one that catches "I built three maps and only ever see one". */
  it('reports several maps where no knot says which is showing', () => {
    expect(
      checkMaps(
        maps(
          world({ locations: [HOTSPOT({ destination: { to: 'map', name: 'city' } })] }),
          { ...newMapArea('City'), locations: [HOTSPOT({ destination: { to: 'map', name: 'world' } })] }
        )
      )
    ).toContain(
      'There are 2 maps but none of them says which knots it is the map for, so the game can only ever show the first.'
    )
  })

  it('says none of that about a single map, which is always the one showing', () => {
    expect(checkMaps(maps(world({ locations: [HOTSPOT()] })))).toEqual([])
  })
})
