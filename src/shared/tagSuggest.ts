import { STAGE_SLOTS } from './bundle/tagSpec'
import type { MediaDocument, MediaKind } from './mediaDoc'
import type { NpcDocument } from './bundle/npcDoc'
import type { StatsDocument } from './statsDoc'
import type { MinigameDocument } from './bundle/minigameDoc'

/**
 * What may legally come next in a `#` tag, given what has been typed so far.
 *
 * The vocabulary is large and none of it is guessable. `# clear` empties the
 * stage, `# anim: none` stops an effect, a character carries her slot from the
 * last tag that named one — an author who does not already know that writes a
 * tag that silently does nothing, and then the story looks broken rather than
 * the tag. Everything here exists so that none of it has to be remembered.
 *
 * One segment at a time, on purpose. Offering `char: wren/happy at left` whole
 * would mean reading a sentence to find the one word being chosen; offering
 * `wren`, then `happy`, then `left` is three glances at three short lists, and
 * every list is drawn from the catalogue so it cannot name a picture that is
 * not there.
 *
 * Pure, and in `shared/` rather than beside the editor, because the hard part
 * is the grammar rather than the menu: this is what the tests exercise, and the
 * CodeMirror side is a thin wrapper that turns these into completions.
 */

export interface Suggestion {
  /**
   * Shown in the menu, and what the typed text is matched against.
   *
   * So a label has to start the way the segment being typed starts, or the
   * menu filters it out the moment the author types a letter.
   */
  label: string
  /** What replaces the text from this option's start to the cursor. */
  insert: string
  /** The dimmer half of the row: a display name, a kind, a reminder. */
  detail?: string
  /**
   * Where this option's replacement starts, when that is not where the segment
   * does.
   *
   * A look is written onto the name — `wren ` becomes `wren/happy ` — so it has
   * to reach back over text that `at left`, sitting in the same menu, appends
   * to instead. One `from` for the whole menu cannot do both.
   */
  replaceFrom?: number
  /**
   * Whether picking this should open the next menu straight away.
   *
   * True for anything that leaves the tag unfinished — a key still needs its
   * value, a name may still want a look. False for a last word, so the menu
   * does not reopen on a tag that is already complete.
   */
  more: boolean
}

export interface Suggestions {
  /** Where the segment being typed starts, as an offset within the line. */
  from: number
  options: Suggestion[]
}

/** Everything the catalogues can offer a tag. */
export interface TagCatalogues {
  media: MediaDocument
  stats: StatsDocument
  npcs: NpcDocument
  minigames?: MinigameDocument
}

/**
 * The keys worth offering, in the order an author reaches for them.
 *
 * Staging first, because that is what most tags do. The aliases ink also
 * accepts — `show`, `background`, `who` — are left out: offering two spellings
 * of one thing makes the list longer and the choice harder for no gain.
 */
const KEYS: { key: string; detail: string; takesValue: boolean }[] = [
  { key: 'bg', detail: 'the scene behind everything', takesValue: true },
  { key: 'char', detail: 'somebody on stage', takesValue: true },
  { key: 'hide', detail: 'take somebody off', takesValue: true },
  { key: 'clear', detail: 'background gone, everyone off, every effect stopped', takesValue: false },
  { key: 'anim', detail: 'an effect over the whole scene', takesValue: true },
  { key: 'music', detail: 'the track under the scene', takesValue: true },
  { key: 'sound', detail: 'a one-shot cue when this line begins', takesValue: true },
  { key: 'speaker', detail: 'who is talking', takesValue: true },
  { key: 'stat', detail: 'change something tracked', takesValue: true },
  { key: 'npc', detail: 'change something about somebody', takesValue: true },
  { key: 'minigame', detail: 'pause the story for a playable encounter', takesValue: true },
  { key: 'map', detail: 'whether the map is reachable', takesValue: true }
]

/** The catalogue kind each key names, for the keys that name one. */
const KIND_OF: Record<string, MediaKind> = {
  bg: 'background',
  char: 'character',
  show: 'character',
  hide: 'character',
  anim: 'animation',
  music: 'music',
  sound: 'sound'
}

/** The word that means "stop", where the key has one. */
const NOTHING: Record<string, string> = {
  bg: 'none',
  char: 'none',
  anim: 'none',
  music: 'stop'
}

/** Whether this key names somebody who stands in a slot. */
const stands = (key: string): boolean => key === 'char' || key === 'show'

/**
 * Whether anything at all may follow the name in this kind of tag.
 *
 * A background belongs here for the flip, which is the one word it shares with
 * the cast. `once` is the other word it takes and is not offered: it is about
 * a clip rather than a picture, and nothing here knows which of the two a
 * catalogued background turned out to be.
 */
const hasTail = (key: string): boolean => stands(key) || key === 'anim' || key === 'bg'

function named(doc: MediaDocument, kind: MediaKind): { name: string; display: string }[] {
  return doc.assets
    .filter((asset) => asset.kind === kind)
    .map((asset) => ({ name: asset.name, display: asset.display }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function looksOf(doc: MediaDocument, kind: MediaKind, name: string): string[] {
  const asset = doc.assets.find((one) => one.kind === kind && one.name === name)
  return (asset?.variants ?? []).map((variant) => variant.name).filter((one) => one.length > 0)
}

/**
 * What to offer, given the whole line and where the cursor is in it.
 *
 * Returns null when the cursor is not inside a tag, which is most of the time —
 * a menu that opened while writing prose would be in the way.
 */
export function suggestTag(line: string, cursor: number, cat: TagCatalogues): Suggestions | null {
  const hash = line.lastIndexOf('#', Math.max(0, cursor - 1))
  if (hash === -1) return null

  // Only the tag the cursor is in. A second `#` further along starts another.
  const typed = line.slice(hash + 1, cursor)
  if (typed.includes('#')) return null

  const colon = typed.indexOf(':')
  if (colon === -1) return keySuggestions(typed, hash + 1)

  const key = typed.slice(0, colon).trim().toLowerCase()
  return valueSuggestions(key, typed.slice(colon + 1), hash + 1 + colon + 1, cat)
}

/** The first segment: which kind of tag this is. */
function keySuggestions(typed: string, at: number): Suggestions | null {
  // A key is one word. Once there is a space in it and still no colon, this is
  // prose with a `#` in it rather than a tag being written.
  const word = typed.trimStart()
  if (/\s/.test(word)) return null

  // `# clear`, not `#clear`. Both parse, but every other thing in the app that
  // writes a tag writes the space — the manuscript rail, the right-click menu,
  // the choice editor — and a menu that quietly disagreed with all three would
  // leave a file whose tags were written two ways.
  const gap = typed.length > word.length ? '' : ' '

  return {
    from: at + (typed.length - word.length),
    options: KEYS.map(({ key, detail, takesValue }) => ({
      label: key,
      // The space after the colon is what the author would have typed anyway,
      // and having it there already is what makes the next menu land right.
      insert: takesValue ? `${gap}${key}: ` : `${gap}${key}`,
      detail,
      more: takesValue
    }))
  }
}

function valueSuggestions(
  key: string,
  value: string,
  at: number,
  cat: TagCatalogues
): Suggestions | null {
  if (key === 'map') return plainWords(at + value.length, value, ['on', 'off'])
  if (key === 'stat') return statSuggestions(value, at, cat)
  if (key === 'npc') return npcSuggestions(value, at, cat)
  if (key === 'minigame') return minigameSuggestions(value, at, cat)

  const kind = KIND_OF[key]
  if (!kind) return null

  const cursor = at + value.length
  /** What is being typed right now: the run since the last space. */
  const tail = /(\S*)$/.exec(value)![1]!
  const words = value.trim().length > 0 ? value.trim().split(/\s+/) : []

  // `at le` — the slot, which only somebody standing somewhere has.
  if (stands(key) && /(^|\s)at\s+\S*$/.test(value)) {
    return plainWords(cursor, tail, [...STAGE_SLOTS])
  }

  // `wren/ha` — a look for the asset named before the slash.
  const look = /(\S*)\/(\S*)$/.exec(value)
  if (look && words.length === 1) {
    const looks = looksOf(cat.media, kind, look[1]!)
    if (looks.length === 0) return null

    return {
      from: cursor - look[2]!.length,
      options: looks.map((one) => ({
        label: one,
        // A trailing space only where something may follow it, so a finished
        // `# bg: cove/night` is not left with one hanging off the end.
        insert: hasTail(key) ? `${one} ` : one,
        detail: 'a look',
        more: hasTail(key)
      }))
    }
  }

  // Nothing being typed, and a name already settled: what can follow it.
  if (tail.length === 0 && words.length > 0) return followOn(key, words, cursor, cat)

  // Anything past the first word is a slot or a flip being spelled out.
  if (words.length > 1) return followOn(key, words.slice(0, -1), cursor, cat, tail)

  // Otherwise the asset itself.
  const options: Suggestion[] = named(cat.media, kind).map(({ name, display }) => ({
    label: name,
    // A space, so the next menu opens on an empty segment and can offer both
    // a look — which reaches back over this — and a slot, which appends.
    insert: hasTail(key) || looksOf(cat.media, kind, name).length > 0 ? `${name} ` : name,
    detail: display || undefined,
    more: hasTail(key) || looksOf(cat.media, kind, name).length > 0
  }))

  const stop = NOTHING[key]
  if (stop) {
    options.push({
      label: stop,
      insert: stop,
      detail: key === 'music' ? 'silence' : 'take it away',
      more: false
    })
  }

  return { from: cursor - tail.length, options }
}

function minigameSuggestions(value: string, at: number, cat: TagCatalogues): Suggestions | null {
  if (/\s/.test(value.trim())) return null
  const word = /(\S*)$/.exec(value)![1]!
  return {
    from: at + value.length - word.length,
    options: (cat.minigames?.minigames ?? []).map((game) => ({
      label: game.name,
      insert: game.name,
      detail: game.display || 'a minigame',
      more: false
    }))
  }
}

/**
 * After a name that is settled: a look, a slot, or the art turned round.
 *
 * `words` is what has been written so far, and `tail` what is being typed on
 * the end of it. Looks reach back over the name; everything else appends,
 * which is what `replaceFrom` is for.
 */
function followOn(
  key: string,
  words: string[],
  cursor: number,
  cat: TagCatalogues,
  tail = ''
): Suggestions | null {
  const kind = KIND_OF[key]
  if (!kind) return null

  const name = words[0]!
  const bare = name.split('/')[0]!
  const options: Suggestion[] = []
  const already = new Set(words.slice(1))

  // Only when the name is all there is, and has no look on it yet. Re-offering
  // looks after one is chosen would put them above the slots in the menu, and
  // the slot is what the author came back for. Changing a look means editing
  // the name, which the slash offers again anyway.
  if (words.length === 1 && !name.includes('/')) {
    for (const look of looksOf(cat.media, kind, bare)) {
      options.push({
        label: `/${look}`,
        insert: `${bare}/${look} `,
        detail: 'a look',
        // Reaches back over the name and the space after it.
        replaceFrom: cursor - tail.length - (name.length + 1),
        more: hasTail(key)
      })
    }
  }

  if (stands(key) && !already.has('at')) {
    for (const slot of STAGE_SLOTS) {
      options.push({
        label: `at ${slot}`,
        insert: `at ${slot}`,
        detail: 'where they stand',
        more: false
      })
    }
  }
  if (hasTail(key) && !already.has('flipped')) {
    options.push({
      label: 'flipped',
      insert: 'flipped',
      detail: 'the art turned round',
      more: false
    })
  }

  return options.length === 0 ? null : { from: cursor - tail.length, options }
}

function statSuggestions(value: string, at: number, cat: TagCatalogues): Suggestions | null {
  // Past the name, the rest is an operator and a number, which no catalogue
  // knows better than the author does.
  if (/\s/.test(value.trim())) return null

  const word = /(\S*)$/.exec(value)![1]!
  return {
    from: at + value.length - word.length,
    options: cat.stats.stats.map((stat) => ({
      label: stat.name,
      insert: `${stat.name} `,
      detail: stat.display || 'a tracked number',
      more: false
    }))
  }
}

function npcSuggestions(value: string, at: number, cat: TagCatalogues): Suggestions | null {
  const word = /(\S*)$/.exec(value)![1]!
  const before = value.slice(0, value.length - word.length).trim()

  // The second word is one of that character's own attributes, so it cannot be
  // offered until there is a character to ask.
  if (before.length > 0) {
    const npc = cat.npcs.npcs.find((one) => one.inkId === before)
    if (!npc) return null

    const attrs = [
      ...npc.stats.map((one) => ({ key: one.key, detail: 'a number' })),
      ...npc.statuses.map((one) => ({ key: one.key, detail: 'a word' })),
      ...npc.flags.map((one) => ({ key: one.key, detail: 'yes or no' }))
    ]
    if (attrs.length === 0) return null

    return {
      from: at + value.length - word.length,
      options: attrs.map(({ key, detail }) => ({
        label: key,
        insert: `${key} `,
        detail,
        more: false
      }))
    }
  }

  return {
    from: at + value.length - word.length,
    options: cat.npcs.npcs.map((npc) => ({
      label: npc.inkId,
      insert: `${npc.inkId} `,
      detail: npc.name,
      more: true
    }))
  }
}

/** A fixed little list, like the slots or `on`/`off`. */
function plainWords(cursor: number, tail: string, choices: readonly string[]): Suggestions {
  return {
    from: cursor - tail.length,
    options: choices.map((one) => ({ label: one, insert: one, more: false }))
  }
}
