import { minigameChecks } from './minigame/checks.editor'
import { findAsset, isVideoFile, type MediaDocument } from '../mediaDoc'
import { scanTags, type TagUse } from '../inkTags'
import { isKnownTag, mediaRefOf, parseTag } from './tagSpec'
import { INVENTORY, type StatsDocument } from '../statsDoc'
import { attrKind, findNpc, npcVar, npcVariable, npcVarNames, type NpcDocument } from './npcDoc'
import { referencedPaths } from './condition'
import { findMap, mapsLinkingTo, type MapArea, type MapDocument } from './mapDoc'
import { galleryMedia, type GalleryDocument } from './galleryDoc'
import type { GameDocument } from './gameDoc'
import {
  emptyMinigames,
  type MinigameDocument
} from './minigameDoc'

/**
 * Everything wrong with a story that the compiler has no opinion about.
 *
 * ink compiles `# bg: cortyard` perfectly happily — a tag is just text to it —
 * and the mistake surfaces as a background that silently does not change, three
 * scenes into a play-test. The compiler cannot help because the catalogue is
 * not part of the language, so this is the pass that reads them together.
 *
 * Everything here is a *warning*. Nothing found is a reason to refuse an export:
 * a story with one misspelled sprite is still a story worth playing, and half of
 * these are things an author is in the middle of doing.
 */

export interface Preflight {
  /** Project-relative path, when the check knows which file. */
  file: string | null
  line: number | null
  message: string
}

export interface PreflightInput {
  /** Ink source by project-relative path. */
  sources: Map<string, string>
  media: MediaDocument
  stats: StatsDocument
  npcs: NpcDocument
  map: MapDocument
  gallery?: GalleryDocument
  minigames?: MinigameDocument
  game?: GameDocument
  /**
   * The pixel size of each media file, by its path under `media/`.
   *
   * Passed in rather than read here: this module is pure so it can run against
   * a document in a test, and only the export has a disk to measure with.
   */
  sizes?: Record<string, { width: number; height: number }>
  /** Every knot the story declares, for checking travel targets later. */
  knots: string[]
}

export function preflight(input: PreflightInput): Preflight[] {
  const problems: Preflight[] = []

  for (const [file, source] of input.sources) {
    for (const use of scanTags(source)) {
      const problem = checkTag(use, input)
      if (problem) problems.push({ file, line: use.line, message: problem })
    }
  }

  problems.push(...checkTiming(input))
  problems.push(...checkMap(input))
  problems.push(...checkGallery(input))
  problems.push(...checkGame(input))
  problems.push(...checkMinigames(input))

  return problems
}

function checkMinigames(input: PreflightInput): Preflight[] {
  const doc = input.minigames ?? emptyMinigames()
  const problems: Preflight[] = []
  const at = (message: string): Preflight => ({ file: 'minigames.json', line: null, message })
  const variables = [...input.stats.stats, ...input.stats.variables]
  const numeric = new Set(variables.filter((one) => one.kind === 'number').map((one) => one.name))

  const names = new Set<string>()
  for (const game of doc.minigames) {
    if (names.has(game.name)) problems.push(at(`More than one minigame is called ${game.name}.`))
    names.add(game.name)

    if (game.background) {
      const background = galleryMedia(input.media, game.background)
      if (!background) {
        problems.push(at(`${game.display || game.name}'s background picture is no longer in the media catalogue.`))
      } else if (background.kind !== 'background') {
        problems.push(at(`${game.display || game.name}'s background picture is not a background.`))
      } else if (isVideoFile(background.file)) {
        problems.push(at(`${game.display || game.name}'s background must be an image, not a video.`))
      }
    }

    const tunings = minigameChecks.get(game.kind)?.({ game, input, variables, numeric, problems, at }) ?? []

    const result = variables.find((one) => one.name === game.resultVariable)
    if (!result || result.kind !== 'text') {
      problems.push(at(`${game.display || game.name} needs a text result variable.`))
    }

    for (const [label, tuning] of tunings) {
      for (const modifier of tuning.modifiers) {
        if (!numeric.has(modifier.stat)) {
          problems.push(at(`${game.display || game.name}'s ${label} uses ${modifier.stat}, which is not a numeric variable.`))
        }
      }
    }
  }
  return problems
}

/**
 * The startup background, which nothing else would notice was missing.
 *
 * It is not named by any tag, so the tag checks never see it, and the reader
 * meets it before the story begins — a broken one is the first thing they see.
 */
function checkGame(input: PreflightInput): Preflight[] {
  const game = input.game
  if (!game) return []

  const at = (message: string): Preflight => ({ file: 'game.json', line: null, message })
  const problems: Preflight[] = []

  if (game.startupBackground) {
    const art = galleryMedia(input.media, game.startupBackground)
    if (!art) {
      problems.push(at('The startup background is no longer in the media catalogue.'))
    } else if (art.kind !== 'background') {
      problems.push(at(`The startup background is ${art.assetDisplay}, which is not a background.`))
    } else if (isVideoFile(art.file)) {
      problems.push(at('The startup background must be an image, not a video.'))
    }
  }

  // The wordmark replaces the title text, so a broken one leaves the menu with
  // no name on it at all rather than falling back to the words.
  if (game.title.art) {
    const art = galleryMedia(input.media, game.title.art)
    if (!art) {
      problems.push(at('The title graphic is no longer in the media catalogue.'))
    } else if (isVideoFile(art.file)) {
      problems.push(at('The title graphic must be an image, not a video.'))
    }
  }

  return problems
}

function checkGallery(input: PreflightInput): Preflight[] {
  if (!input.gallery) return []
  const problems: Preflight[] = []
  const at = (message: string): Preflight => ({ file: 'gallery.json', line: null, message })

  for (const group of input.gallery.groups) {
    if (group.cover && !galleryMedia(input.media, group.cover)) {
      problems.push(at(`${group.name} names a selector picture that is no longer in the media catalogue.`))
    }
    for (const item of group.items) {
      const resolved = galleryMedia(input.media, item)
      if (!resolved) {
        problems.push(at(`${group.name} contains a scene that is no longer in the media catalogue.`))
      } else if (resolved.kind !== 'background' && resolved.kind !== 'animation') {
        problems.push(at(`${group.name} contains ${resolved.assetDisplay}, which is not a background or animation.`))
      }
    }
  }
  return problems
}

/* Timing ------------------------------------------------------------------- */

/**
 * Changes that arrive after the branch that reads them.
 *
 * ink attaches a standalone tag to the *next text line*, and a `# stat:` or
 * `# npc:` tag is applied by whoever reads that line. So when the next thing a
 * reader sees is itself a `{…}` branch on the same variable, ink has already
 * evaluated the branch by the time the tag is handed over: the choice that was
 * supposed to raise Abeline's affection to the point of a proposal gets the
 * distant reply, and the value is right immediately afterwards.
 *
 * Silent, plausible-looking, and impossible to see by reading the file — one
 * line of prose between the tag and the divert fixes it. Proved against the
 * compiler in [stateTags.compile.test.ts](../../main/stateTags.compile.test.ts).
 */
function checkTiming(input: PreflightInput): Preflight[] {
  const problems: Preflight[] = []
  const knots = knotBodies(input.sources)

  for (const [file, source] of input.sources) {
    const lines = source.split(/\r?\n/)

    for (const [index, text] of lines.entries()) {
      const variable = standaloneStateTag(text, input)
      if (!variable) continue

      const next = nextSignificant(lines, index + 1)
      const landing = next && divertTarget(next.text) ? knots.get(divertTarget(next.text)!) : next

      if (landing && readsIn(landing.text, variable)) {
        problems.push({
          file,
          line: index + 1,
          message: `${text.trim()} — the next thing the reader sees branches on ${variable}, which ink works out before this tag reaches anyone. Put a line of prose between them.`
        })
      }
    }
  }

  return problems
}

interface Landing {
  text: string
}

/** The ink variable a standalone state tag moves, or null if it is not one. */
function standaloneStateTag(text: string, input: PreflightInput): string | null {
  const body = text.trim()
  if (!body.startsWith('#')) return null

  const command = parseTag(body.slice(1))
  if (!command) return null

  if (command.kind === 'stat') return command.stat
  if (command.kind === 'npc') {
    return findNpc(input.npcs, command.id) ? npcVar(command.id, command.attr) : null
  }
  return null
}

/** The first line after `from` that a reader would actually reach. */
function nextSignificant(lines: readonly string[], from: number): Landing | null {
  for (let at = from; at < lines.length; at++) {
    const text = (lines[at] ?? '').trim()
    // Blank lines, comments, more tags and logic all emit nothing, so the
    // reader's next line is still ahead of us.
    if (text.length === 0) continue
    if (text.startsWith('//')) continue
    if (text.startsWith('#')) continue
    if (text.startsWith('~')) continue
    return { text }
  }
  return null
}

const divertTarget = (text: string): string | null => {
  const match = /^->\s*([A-Za-z_]\w*)\s*$/.exec(text)
  return match ? match[1]! : null
}

/** Whether a line is a branch that reads the variable before anything is shown. */
function readsIn(text: string, variable: string): boolean {
  if (!text.startsWith('{')) return false
  return new RegExp(`\\b${variable}\\b`).test(text)
}

/** The first line a reader reaches inside each knot, by knot name. */
function knotBodies(sources: ReadonlyMap<string, string>): Map<string, Landing> {
  const bodies = new Map<string, Landing>()

  for (const source of sources.values()) {
    const lines = source.split(/\r?\n/)
    for (const [index, text] of lines.entries()) {
      const match = /^\s*={2,}\s*([A-Za-z_]\w*)/.exec(text)
      if (!match) continue

      const first = nextSignificant(lines, index + 1)
      if (first) bodies.set(match[1]!, first)
    }
  }

  return bodies
}

/**
 * Art a place names but the bundle does not carry.
 *
 * A hotspot is drawn by name, and a name nothing answers to is a place that
 * draws as nothing — clickable, invisible, and silent about it. Its states are
 * looks of one asset, so a missing `hover` is a refinement the player falls
 * back from, while a missing `idle` is the picture itself.
 */
function checkHotspotArt(
  area: MapArea,
  input: PreflightInput,
  at: (message: string) => Preflight
): Preflight[] {
  const problems: Preflight[] = []

  for (const location of area.locations) {
    if (location.art.length === 0) continue

    const asset = findAsset(input.media, 'hotspot', location.art)
    if (!asset) {
      problems.push(
        at(`${location.label} is drawn with ${location.art}, which is not a hotspot in the catalogue.`)
      )
      continue
    }

    if (!asset.variants.some((one) => one.name === 'idle')) {
      problems.push(
        at(`The hotspot ${location.art} has no idle look, so ${location.label} draws as nothing.`)
      )
    }

    // One picture at four moments. A look of another size is drawn into a box
    // shaped for its siblings, so it is the one that comes out stretched.
    const sizes = input.sizes ?? {}
    const measured = asset.variants
      .map((one) => ({ name: one.name, size: sizes[one.file] }))
      .filter((one): one is { name: string; size: { width: number; height: number } } =>
        one.size !== undefined
      )

    const first = measured[0]
    const odd = first
      ? measured.filter(
          (one) => one.size.width !== first.size.width || one.size.height !== first.size.height
        )
      : []

    if (first && odd.length > 0) {
      problems.push(
        at(
          `The looks of ${location.art} are not all the same size — ${first.name} is ` +
            `${first.size.width}×${first.size.height} and ${odd
              .map((one) => `${one.name} is ${one.size.width}×${one.size.height}`)
              .join(', ')}. The box is one shape, so the others are stretched into it.`
        )
      )
    }
  }

  return problems
}

/**
 * Places the maps cannot actually reach, and maps nothing can reach.
 *
 * `ChoosePathString` throws on a name that is not there, from inside a click
 * handler, with the map already closed — about the worst place a game can fail.
 * The knot list is right here at export time, so the mistake never has to get
 * that far.
 *
 * The second half is the newer worry. A map the reader can never arrive at is
 * not an error anywhere — it parses, it exports, it draws perfectly in the
 * editor — and the only symptom is a picture the author drew that nobody ever
 * sees. Nothing but this will say so.
 */
function checkMap(input: PreflightInput): Preflight[] {
  const known = new Set(input.knots)
  const problems: Preflight[] = []
  const maps = input.map.maps
  const bare = (message: string): Preflight => ({ file: 'map.json', line: null, message })

  const claimed = new Map<string, string>()
  const seenNames = new Set<string>()

  for (const area of maps) {
    const title = area.display || area.name
    // Which picture to open. Only worth saying when there is more than one.
    const at = (message: string): Preflight =>
      bare(maps.length > 1 ? `${title} — ${message}` : message)

    if (seenNames.has(area.name)) {
      problems.push(
        bare(
          `Two maps are called ${area.name}. Every hotspot opening it reaches whichever comes first.`
        )
      )
    }
    seenNames.add(area.name)

    for (const location of area.locations) {
      const { to, name } = location.destination

      if (to === 'knot' && !known.has(name)) {
        problems.push(at(`${location.label} travels to ${name}, which is not a knot in the story.`))
      }

      if (to === 'map' && !findMap(input.map, name)) {
        problems.push(at(`${location.label} opens the map ${name}, which is not a map here.`))
      }

      if (to === 'map' && name === area.name) {
        problems.push(
          at(`${location.label} opens the map it is already on, so clicking it does nothing.`)
        )
      }

      for (const path of referencedPaths(location.available)) {
        if (!known.has(path)) {
          problems.push(
            at(`${location.label} unlocks after ${path}, which is not a knot in the story.`)
          )
        }
      }

      if (location.available !== null && location.lockedHint.trim().length === 0) {
        problems.push(at(`${location.label} is gated but has no hint, so it reads as broken.`))
      }
    }

    for (const knot of area.knots) {
      if (!known.has(knot)) {
        problems.push(at(`It is the map for ${knot}, which is not a knot in the story.`))
      }

      const other = claimed.get(knot)
      if (other !== undefined) {
        problems.push(bare(`${knot} is the map for both ${other} and ${title}. The first wins.`))
      } else {
        claimed.set(knot, title)
      }
    }

    if (area.image.length > 0 && !findAsset(input.media, 'background', area.image)) {
      problems.push(at(`The picture ${area.image} is not a background in the catalogue.`))
    }

    problems.push(...checkHotspotArt(area, input, at))
  }

  // Both of these are only wrong once there is more than one map to choose
  // between: a single map is always the one showing, however it was reached.
  if (maps.length > 1) {
    for (const area of maps) {
      const reached =
        area.knots.length > 0 || mapsLinkingTo(input.map, area.name).length > 0
      if (!reached) {
        problems.push(
          bare(
            `Nothing reaches ${area.display || area.name} — no hotspot opens it and it is the ` +
              `map for no knot, so a reader can never see it.`
          )
        )
      }
    }

    if (claimed.size === 0) {
      problems.push(
        bare(
          `There are ${maps.length} maps but none of them says which knots it is the map for, ` +
            `so the game can only ever show the first.`
        )
      )
    }
  }

  return problems
}

function checkTag(use: TagUse, input: PreflightInput): string | null {
  // Not our tag at all. Ink carries tags for other purposes and interpolates
  // them before anyone sees them, so silence here is the whole point.
  if (!isKnownTag(use.raw)) return null

  if (use.command === null) {
    return `#${use.raw} — the tag is one of ours but the value cannot be read.`
  }

  const media = mediaRefOf(use.command)
  if (media) {
    const asset = findAsset(input.media, media.kind, media.name)
    if (!asset) {
      return `#${use.raw} — there is no ${media.kind} called ${media.name} in the catalogue.`
    }
    if (media.variant !== null && !asset.variants.some((one) => one.name === media.variant)) {
      const looks = asset.variants.map((one) => one.name).join(', ')
      return `#${use.raw} — ${media.name} has no look called ${media.variant}${
        looks.length > 0 ? ` (it has ${looks}).` : '.'
      }`
    }
    if (asset.variants.length === 0) {
      return `#${use.raw} — ${media.name} is in the catalogue but has no looks, so nothing loads.`
    }
    return null
  }

  if (use.command.kind === 'hide') {
    return findAsset(input.media, 'character', use.command.name) === null
      ? `#${use.raw} — there is no character called ${use.command.name} to hide.`
      : null
  }

  // `# active: auto` and `# active: none` name nobody, so there is nobody to
  // fail to find. Nothing checks `# speaker:` the same way on purpose: it is
  // prose, and every line of narration in the story would fire.
  if (use.command.kind === 'active') {
    const { active } = use.command
    if (active.rule !== 'character') return null
    return findAsset(input.media, 'character', active.name) === null
      ? `#${use.raw} — there is no character called ${active.name} to emphasise.`
      : null
  }

  if (use.command.kind === 'stat') {
    // No catalogue means no opinion. A project whose stats are still declared by
    // hand in the ink is not making a mistake, and complaining about every one
    // of them would bury the warnings that matter.
    if (input.stats.stats.length === 0 && input.stats.variables.length === 0) return null

    const stat = use.command.stat
    const declared = [...input.stats.stats, ...input.stats.variables].find((one) => one.name === stat)
    if (!declared) {
      return `#${use.raw} — ${stat} is not a variable in the catalogue, so nothing will change.`
    }

    // `# stat:` carries an integer and the game sets one, so pointing it at a
    // yes/no or a piece of text would put the wrong type in the variable.
    if (declared.kind !== 'number') {
      return `#${use.raw} — ${stat} is ${
        declared.kind === 'boolean' ? 'a yes/no' : 'text'
      }, which no # stat: tag can set. Write it as a ~ line instead.`
    }

    return null
  }

  if (use.command.kind === 'display') {
    // These catalogues generate the globals in the compiled story. Inventory
    // is a fixed list variable, and NPC attributes use their generated backing
    // names so the tag can display those as readily as an ordinary stat.
    const known = new Set([
      INVENTORY,
      ...input.stats.stats.map((one) => one.name),
      ...input.stats.variables.map((one) => one.name),
      ...npcVarNames(input.npcs)
    ])
    if (known.size === 1 && input.npcs.npcs.length === 0) return null

    return known.has(use.command.variable)
      ? null
      : `#${use.raw} — ${use.command.variable} is not a variable in the catalogue, so there is nothing to display.`
  }

  if (use.command.kind === 'word') {
    // The reader types into this one, so it has to be somewhere a word fits.
    // A number or a yes/no would take the answer and render it as nonsense.
    const { variable } = use.command
    const all = [...input.stats.stats, ...input.stats.variables]
    if (all.length === 0) return null

    const declared = all.find((one) => one.name === variable)
    if (!declared) {
      return `#${use.raw} — ${variable} is not a variable in the catalogue, so the reader's word would have nowhere to go.`
    }
    if (declared.kind !== 'text') {
      return `#${use.raw} — ${variable} holds ${
        declared.kind === 'boolean' ? 'a yes/no' : 'a number'
      }, and a word the reader types is text.`
    }

    return null
  }

  if (use.command.kind === 'npc') {
    // Same rule as stats: an empty catalogue means no opinion.
    if (input.npcs.npcs.length === 0) return null

    const { id, attr, value } = use.command
    const npc = findNpc(input.npcs, id)
    if (!npc) return `#${use.raw} — there is nobody called ${id} in the cast.`

    const kind = attrKind(npc, attr)
    if (!kind) return `#${use.raw} — ${npc.name} has nothing called ${attr}.`

    if (kind === 'number' && !Number.isFinite(Number(value))) {
      return `#${use.raw} — ${attr} is a number, and ${value} is not one.`
    }

    if (kind === 'text') {
      const words = npcVariable(npc, attr)?.values ?? []
      if (words.length > 0 && !words.includes(value)) {
        return `#${use.raw} — ${attr} cannot be ${value} (it can be ${words.join(', ')}).`
      }
    }

    // A yes/no reads as true only for exactly `true` or `1`, so anything else
    // quietly means false — which is never what was meant.
    if (kind === 'boolean' && !['true', 'false', '1', '0'].includes(value)) {
      return `#${use.raw} — ${attr} is true or false, and ${value} reads as false.`
    }

    return null
  }

  if (use.command.kind === 'minigame') {
    const doc = input.minigames ?? emptyMinigames()
    const name = use.command.name
    return doc.minigames.some((game) => game.name === name)
      ? null
      : `#${use.raw} — there is no minigame called ${name}.`
  }

  return null
}
