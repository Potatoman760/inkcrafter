import { describe, expect, it } from 'vitest'
import { emptyNpcs, parseNpcs } from './bundle/npcDoc'
import { addAsset, addVariant, emptyMedia, newAsset, newVariant } from './mediaDoc'
import { emptyStats, parseStats } from './statsDoc'
import { suggestTag, type TagCatalogues } from './tagSuggest'

/**
 * The walk an author actually makes: `#`, then `char`, then who, then which
 * look, then where they stand. Each step is asserted as its own case, because
 * the point of the feature is that no step requires knowing the next one.
 */

function catalogues(): TagCatalogues {
  let media = emptyMedia()

  const wren = newAsset('Wren', 'character')
  media = addAsset(media, wren)
  media = addVariant(media, wren.id, newVariant('happy', 'sprites/wren-happy.png'))
  media = addVariant(media, wren.id, newVariant('neutral', 'sprites/wren-neutral.png'))

  const cove = newAsset('The Cove', 'background')
  media = addAsset(media, cove)
  media = addVariant(media, cove.id, newVariant('night', 'bg/cove-night.png'))

  const rain = newAsset('Rain', 'animation')
  media = addAsset(media, rain)
  media = addVariant(media, rain.id, newVariant('heavy', 'anim/rain.webm'))

  const door = newAsset('Door slam', 'music')
  media = addAsset(media, door)
  media = addVariant(media, door.id, newVariant('heavy', 'music/door-slam.ogg'))

  return {
    media,
    stats: parseStats(
      JSON.stringify({
        version: 1,
        stats: [{ id: 'stt_1', name: 'courage', kind: 'number', initial: 0, display: 'Courage' }],
        items: []
      })
    ),
    npcs: parseNpcs(
      JSON.stringify({
        version: 1,
        npcs: [
          {
            id: 'npc_1',
            inkId: 'abeline',
            name: 'Sister Abeline',
            stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 }]
          }
        ]
      })
    )
  }
}

const CAT = catalogues()

/** What the menu would show for a line, with the cursor at its end. */
function labels(line: string): string[] {
  return (suggestTag(line, line.length, CAT)?.options ?? []).map((one) => one.label)
}

/** What picking a named option would type, and whether the menu reopens. */
function pick(line: string, label: string): { insert: string; from: number; more: boolean } | null {
  const result = suggestTag(line, line.length, CAT)
  const option = result?.options.find((one) => one.label === label)
  if (!result || !option) return null
  return {
    insert: option.insert,
    from: option.replaceFrom ?? result.from,
    more: option.more
  }
}

/** Picking an option, as the editor would apply it. */
function apply(line: string, label: string): string {
  const chosen = pick(line, label)
  if (!chosen) throw new Error(`no option called ${label} for ${JSON.stringify(line)}`)
  return line.slice(0, chosen.from) + chosen.insert
}

describe('suggestTag', () => {
  it('says nothing while writing prose', () => {
    expect(suggestTag('She turns away.', 15, CAT)).toBeNull()
    expect(suggestTag('', 0, CAT)).toBeNull()
  })

  it('offers the vocabulary the moment a hash is typed', () => {
    expect(labels('#')).toContain('char')
    expect(labels('#')).toContain('clear')
    expect(labels('#')).toContain('bg')
  })

  it('narrows to what was typed, the way the menu filters', () => {
    // The editor does the filtering; what matters here is that the labels are
    // spelled so filtering can work at all.
    expect(labels('# ch')).toContain('char')
  })

  /** A tag with no value is finished as soon as it is picked. */
  it('finishes clear without asking for more', () => {
    expect(pick('#', 'clear')?.more).toBe(false)
    expect(apply('#', 'clear')).toBe('# clear')
  })

  it('leads from a key straight into its value', () => {
    expect(pick('#', 'char')?.more).toBe(true)
    expect(apply('#', 'char')).toBe('# char: ')
  })

  /**
   * The space is the app's, not the author's. Every other thing here that
   * writes a tag writes `# key`, so a menu that produced `#key` would leave one
   * file with its tags spelled two ways.
   */
  it('writes the space after the hash, and does not double it', () => {
    expect(apply('#', 'bg')).toBe('# bg: ')
    expect(apply('# ', 'bg')).toBe('# bg: ')
    expect(apply('#b', 'bg')).toBe('# bg: ')
    expect(apply('#  ', 'bg')).toBe('#  bg: ')
  })

  describe('the walk from a key to a staged character', () => {
    it('offers the cast, by catalogue name', () => {
      expect(labels('# char: ')).toEqual(['wren', 'none'])
    })

    it('offers only backgrounds to a bg tag', () => {
      expect(labels('# bg: ')).toEqual(['the_cove', 'none'])
    })

    it('leaves a space after the name, so a look or a slot can follow', () => {
      expect(apply('# char: ', 'wren')).toBe('# char: wren ')
      expect(pick('# char: ', 'wren')?.more).toBe(true)
    })

    it('offers that character her looks, and somewhere to stand', () => {
      expect(labels('# char: wren ')).toEqual([
        '/happy',
        '/neutral',
        'at left',
        'at middle',
        'at right',
        'flipped'
      ])
    })

    /**
     * The one option in that menu that does not append. It is written onto the
     * name, so it has to reach back over it — everything beside it appends.
     */
    it('writes a look onto the name rather than after it', () => {
      expect(apply('# char: wren ', '/happy')).toBe('# char: wren/happy ')
    })

    it('appends a slot without disturbing the name', () => {
      expect(apply('# char: wren ', 'at left')).toBe('# char: wren at left')
    })

    it('appends a slot after a look, over the space the look left', () => {
      expect(apply('# char: wren/neutral ', 'at left')).toBe('# char: wren/neutral at left')
    })

    it('still offers a slot once a look has been chosen', () => {
      expect(labels('# char: wren/happy ')).toEqual([
        'at left',
        'at middle',
        'at right',
        'flipped'
      ])
    })

    it('offers the three slots while one is being typed', () => {
      expect(labels('# char: wren at ')).toEqual(['left', 'middle', 'right'])
      expect(apply('# char: wren at l', 'left')).toBe('# char: wren at left')
    })

    it('does not offer a second slot, or a second flip', () => {
      expect(labels('# char: wren at left ')).toEqual(['flipped'])
      expect(labels('# char: wren at left flipped ')).toEqual([])
    })

    it('completes a look through the slash an author typed', () => {
      expect(labels('# char: wren/')).toEqual(['happy', 'neutral'])
      expect(apply('# char: wren/ne', 'neutral')).toBe('# char: wren/neutral ')
    })
  })

  describe('the tags with a shorter walk', () => {
    /** Nothing stands anywhere, so a background is offered a look and a flip. */
    it('offers a background no slot', () => {
      expect(labels('# bg: the_cove ')).toEqual(['/night', 'flipped'])
      expect(apply('# bg: the_cove ', '/night')).toBe('# bg: the_cove/night ')
    })

    it('lets an animation be turned round but not placed', () => {
      expect(labels('# anim: rain ')).toEqual(['/heavy', 'flipped'])
    })

    it('offers the word that takes a thing away', () => {
      expect(labels('# anim: ')).toContain('none')
      expect(labels('# music: ')).toContain('stop')
    })

    it('offers audio assets and their variants', () => {
      expect(labels('# music: ')).toEqual(['door_slam', 'stop'])
      expect(labels('# music: door_slam ')).toEqual(['/heavy'])
      expect(apply('# music: door_slam ', '/heavy')).toBe('# music: door_slam/heavy ')
    })

    it('offers on and off to a map tag', () => {
      expect(labels('# map: ')).toEqual(['on', 'off'])
    })
  })

  describe('the things a story tracks', () => {
    it('offers the stats by their ink name', () => {
      expect(labels('# stat: ')).toEqual(['courage'])
    })

    it('says nothing about the operator or the number', () => {
      expect(suggestTag('# stat: courage + ', 18, CAT)).toBeNull()
    })

    it('offers the cast, then that person own attributes', () => {
      expect(labels('# npc: ')).toEqual(['abeline'])
      expect(labels('# npc: abeline ')).toEqual(['affection'])
    })

    it('says nothing about somebody it has never heard of', () => {
      expect(suggestTag('# npc: nobody ', 14, CAT)).toBeNull()
    })
  })

  describe('when it should keep out of the way', () => {
    it('says nothing once the hash is part of a sentence', () => {
      expect(suggestTag('# not a tag at all', 18, CAT)).toBeNull()
    })

    it('reads only the tag the cursor is in', () => {
      expect(labels('# bg: the_cove # char: ')).toEqual(['wren', 'none'])
    })

    it('says nothing for a key it does not know', () => {
      expect(suggestTag('# trust: 4', 10, CAT)).toBeNull()
    })

    it('offers nothing rather than guessing when the catalogue is empty', () => {
      const bare = { media: emptyMedia(), stats: emptyStats(), npcs: emptyNpcs() }
      expect(suggestTag('# char: ', 8, bare)?.options.map((one) => one.label)).toEqual(['none'])
    })
  })
})
