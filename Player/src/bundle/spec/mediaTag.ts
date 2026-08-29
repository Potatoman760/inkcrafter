// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

import {
  findAsset,
  isSingleFileMediaKind,
  type MediaAsset,
  type MediaDocument,
  type MediaKind,
  type MediaVariant
} from './mediaDoc'
import {
  bareTag,
  isKnownTag,
  mediaRefOf,
  parseTag,
  slotFor,
  tagKeyOf,
  type ActiveRule,
  type StageSlot
} from './bundle/tagSpec'

/**
 * The catalogue half of the tag grammar.
 *
 * `bundle/tagSpec.ts` says what a tag *means* — it is shared verbatim with the
 * player and knows nothing about files. This says what one *points at*: it
 * takes the same commands and resolves them against this project's media
 * catalogue, which is knowledge only the editor has.
 *
 * The split is worth the extra file because the two halves change at different
 * rates. The grammar is a contract with another application and moves rarely;
 * which pictures exist changes every few minutes while somebody is writing.
 */

/** The tag prefix each kind is written with. */
/**
 * The tag that shows each kind — where there is one.
 *
 * A hotspot is not in here on purpose: nothing in the story shows a hotspot,
 * the map does, and it names the asset rather than writing a tag.
 */
export const TAG_PREFIX: Partial<Record<MediaKind, string>> = {
  character: 'char',
  animation: 'anim',
  background: 'bg',
  music: 'music'
}

/** Keys that were trying to name media, whether or not they succeeded. */
const MEDIA_KEYS = [
  'bg',
  'background',
  'char',
  'show',
  'anim',
  'animation',
  'hide',
  'music'
]

export interface MediaTagRef {
  kind: MediaKind
  /** The asset's ink name. */
  name: string
  /** The variant asked for, or null to mean "whichever comes first". */
  variant: string | null
  /** The tag as written, without the leading `#`. */
  raw: string
}

/** Reads a media tag, or returns null for a tag that is not one. */
export function parseMediaTag(tag: string): MediaTagRef | null {
  const raw = bareTag(tag)

  const command = parseTag(raw)
  if (!command) return null

  const ref = mediaRefOf(command)
  if (!ref) return null

  return { kind: ref.kind, name: ref.name, variant: ref.variant, raw }
}

/**
 * Whether a tag is *addressed* to media, however badly.
 *
 * Broader than `parseMediaTag`, which needs the tag to be well formed. This is
 * what separates "you meant a sprite and mistyped it" from "this tag is not
 * mine", and only the first deserves a complaint. It matters because ink
 * carries tags for other purposes and interpolates them before we see them: the
 * seeded project writes `#trust:{archivist_trust}`, which arrives as `trust:-2`.
 */
export function isMediaTag(tag: string): boolean {
  const raw = bareTag(tag)
  return isKnownTag(raw) && MEDIA_KEYS.includes(tagKeyOf(raw))
}

/** The tag that would show this, or null for a kind no tag names. */
export function formatMediaTag(
  asset: MediaAsset,
  variant?: MediaVariant | null
): string | null {
  const prefix = TAG_PREFIX[asset.kind]
  if (!prefix) return null

  const base = `${prefix}:${asset.name}`
  // A track is the asset. Its one file is not a named look, even though the
  // runtime compatibility layer exposes it as one variant to the player.
  if (isSingleFileMediaKind(asset.kind)) return base
  return variant ? `${base}/${variant.name}` : base
}

export interface ResolvedMedia {
  asset: MediaAsset
  variant: MediaVariant
  /** Project-relative, e.g. `media/sprites/wren-happy.png`. */
  path: string
}

/**
 * What a tag actually points at, or null when nothing does.
 *
 * A bare `# char:wren` takes the first variant, which is why variant order is
 * more than presentation. A tag naming a variant that does not exist resolves to
 * nothing rather than falling back to the first — silently showing the wrong
 * expression is worse than showing none, and the preview says which tag failed.
 */
export function resolveMediaTag(doc: MediaDocument, tag: string): ResolvedMedia | null {
  const ref = parseMediaTag(tag)
  return ref ? resolveRef(doc, ref.kind, ref.name, ref.variant) : null
}

function resolveRef(
  doc: MediaDocument,
  kind: MediaKind,
  name: string,
  variant: string | null
): ResolvedMedia | null {
  const asset = findAsset(doc, kind, name)
  if (!asset) return null

  const look =
    variant === null
      ? asset.variants[0]
      : asset.variants.find((candidate) => candidate.name === variant)

  if (!look) return null

  return { asset, variant: look, path: `media/${look.file}` }
}

/**
 * The state a run of tags leaves the stage in.
 *
 * More than pictures, because the vocabulary is more than pictures: who is
 * speaking, and whether the map is reachable from here, are both things a tag
 * sets and a reader would notice. A preview that ignored them would be lying by
 * omission about what the line does.
 */
export interface Scene {
  background: ResolvedMedia | null
  /** Whether a video background stops on its final frame instead of looping. */
  backgroundOnce: boolean
  /**
   * Whether the background is drawn mirrored left to right.
   *
   * A setting on the background rather than a record keyed by name, because
   * there is only ever one — and it goes when the background does, so a corridor
   * turned round cannot leave its flip behind for whatever is set next.
   */
  backgroundFlipped: boolean
  /**
   * The track under the scene, or null for silence.
   *
   * A setting rather than an event, like the background: it holds across lines
   * and knots until a tag says otherwise. Which is why `# music: stop` exists
   * at all — nothing else in a scene has to be told to end.
   */
  music: ResolvedMedia | null
  /**
   * Seconds the music took to fade out, when this line is what stopped it.
   *
   * Zero is a cut, which is what a stop was before it could be told otherwise.
   * Reset by anything that puts a track on, because it describes how the music
   * *ended* and there is nothing ended once something is playing again.
   */
  musicFade: number
  /**
   * Every character on screen, in the order they were shown.
   *
   * A list rather than one slot: the game has always drawn several sprites at
   * once, and a preview that showed one would disagree with it about what a
   * scene looks like.
   */
  characters: ResolvedMedia[]
  /**
   * Where each character on screen is standing, by asset name.
   *
   * Beside `characters` rather than inside it, because that list is the *cast*
   * — where they stand is the game's staging of it, and a preview that does not
   * draw slots should not have to carry them through every entry.
   */
  slots: Record<string, StageSlot>
  /**
   * Who is drawn mirrored, by asset name. Absent means facing as drawn.
   *
   * Beside `slots` for the same reason, and behaving differently on purpose:
   * a slot is inherited from the last tag that named one, while a flip is
   * restated by every `# show:`. Showing a mirrored character again without
   * saying `flipped` turns her back, which is what "only for that line" means
   * once the line is over.
   */
  flipped: Record<string, boolean>
  /**
   * Looping things shown over the whole scene, behind a pale cover.
   *
   * A separate list rather than more entries in `characters`, because the two
   * are separate namespaces: a story may perfectly well have a character called
   * `rain` and an effect called `rain`, and one list keyed by name could not
   * hold both. The flips are separate for the same reason.
   *
   * No slots: an animation fills what it can rather than taking a third of the
   * frame. Several may run at once and they stack in the order the tags came,
   * which is what makes a transparent effect over another one work.
   */
  animations: ResolvedMedia[]
  animFlipped: Record<string, boolean>
  /** Empty when nobody in particular is speaking. */
  speaker: string
  /**
   * Who the frame leans on. Tracked but not drawn: the preview does not claim
   * to be the game, but the model of what a line *did* should not quietly
   * disagree with it either.
   */
  activeRule: ActiveRule
  mapEnabled: boolean
  /** Media tags that named nothing, so the preview can say so rather than sit blank. */
  unresolved: string[]
}

export const EMPTY_SCENE: Scene = {
  background: null,
  backgroundOnce: false,
  backgroundFlipped: false,
  music: null,
  musicFade: 0,
  characters: [],
  slots: {},
  flipped: {},
  animations: [],
  animFlipped: {},
  speaker: '',
  activeRule: { rule: 'speaker' },
  mapEnabled: true,
  unresolved: []
}

/**
 * Applied cumulatively, because that is how a visual novel reads: a background
 * set on one line stays until another replaces it, rather than vanishing when
 * the next paragraph carries no tags. Later tags win.
 *
 * `# bg: none`, `# char: none`, and `# clear` explicitly say that something is
 * gone — an empty tag set means "unchanged", so it cannot also mean "empty".
 */
export function applyTags(doc: MediaDocument, scene: Scene, tags: string[]): Scene {
  let next = scene

  for (const tag of tags) {
    const raw = bareTag(tag)
    const command = parseTag(raw)

    if (!command) {
      if (isMediaTag(raw)) next = withUnresolved(next, raw)
      continue
    }

    switch (command.kind) {
      case 'bg':
        if (command.name === null) {
          next = { ...next, background: null, backgroundOnce: false, backgroundFlipped: false }
          break
        }
        next = place(next, resolveRef(doc, 'background', command.name, command.variant), raw, (m) => ({
          ...next,
          background: m,
          backgroundOnce: command.once ?? false,
          backgroundFlipped: command.flipped ?? false
        }))
        break

      case 'show':
        next = place(next, resolveRef(doc, 'character', command.name, command.variant), raw, (m) =>
          showing(next, m, command.slot, command.flipped)
        )
        break

      case 'anim':
        next =
          command.name === null
            ? { ...next, animations: [], animFlipped: {} }
            : place(next, resolveRef(doc, 'animation', command.name, command.variant), raw, (m) =>
                animating(next, m, command.flipped)
              )
        break

      case 'music':
        if (command.name === null) {
          next = { ...next, music: null, musicFade: command.fade ?? 0 }
        } else if (command.loop === true) {
          next = place(next, resolveRef(doc, 'music', command.name, command.variant), raw, (m) => ({
            ...next,
            music: m,
            musicFade: 0
          }))
        } else {
          // A cue is an event, not standing scene state: it plays once and is
          // over, so it must not become the track the scene is carrying.
          // Resolved anyway, so the editor can still report a misspelt or
          // unfiled one on the line that wrote it.
          if (!resolveRef(doc, 'music', command.name, command.variant)) {
            next = withUnresolved(next, raw)
          }
        }
        break

      case 'hide':
        next = {
          ...next,
          // Both lists, because `hide` names a thing on the stage rather than
          // a kind of thing, and an author asking for the rain to stop should
          // not have to know which catalogue it came out of.
          characters: next.characters.filter((one) => one.asset.name !== command.name),
          slots: without(next.slots, command.name),
          flipped: without(next.flipped, command.name),
          animations: next.animations.filter((one) => one.asset.name !== command.name),
          animFlipped: without(next.animFlipped, command.name)
        }
        break

      // An empty stage has no setting, nobody standing anywhere, and nobody to lean on.
      case 'clear':
        // Music is not part of the visible stage and continues until stopped.
        next = {
          ...next,
          background: null,
          backgroundOnce: false,
          backgroundFlipped: false,
          characters: [],
          slots: {},
          flipped: {},
          animations: [],
          animFlipped: {},
          activeRule: { rule: 'speaker' }
        }
        break

      case 'active':
        next = { ...next, activeRule: command.active }
        break

      case 'speaker':
        next = { ...next, speaker: command.name }
        break

      case 'map':
        next = { ...next, mapEnabled: command.enabled }
        break

      case 'stat':
      case 'npc':
      case 'autosave':
        break
    }
  }

  return next
}

/** Applies a resolved asset, or records the tag as unresolved. */
function place(
  scene: Scene,
  resolved: ResolvedMedia | null,
  raw: string,
  onto: (media: ResolvedMedia) => Scene
): Scene {
  return resolved ? onto(resolved) : withUnresolved(scene, raw)
}

/**
 * Showing a character already on screen changes their look rather than drawing
 * them twice, which is how `# char:wren/happy` after `# char:wren` reads. The
 * same goes for where they are standing: `slotFor` moves them only when the tag
 * asked, so a change of expression is not also a walk across the stage.
 */
/**
 * One thing put in a slot, replacing itself if it is already there.
 *
 * Shared by the cast and the animations because staging one is staging the
 * other: the slot carries over from the last tag that named one, and the flip
 * is taken from this tag outright. Only the three fields it writes to differ,
 * which is why they are arguments.
 */
function staged(
  list: ResolvedMedia[],
  slots: Record<string, StageSlot>,
  flips: Record<string, boolean>,
  media: ResolvedMedia,
  asked: StageSlot | null,
  flipped: boolean
): {
  list: ResolvedMedia[]
  slots: Record<string, StageSlot>
  flips: Record<string, boolean>
} {
  const name = media.asset.name
  const at = list.findIndex((one) => one.asset.name === name)

  return {
    list: at === -1 ? [...list, media] : list.map((one, index) => (index === at ? media : one)),
    slots: { ...slots, [name]: slotFor(slots[name], asked) },
    // Taken from the tag rather than folded with what was there: `slotFor`
    // exists because a slot is remembered, and a flip is not.
    flips: { ...flips, [name]: flipped }
  }
}

function showing(
  scene: Scene,
  media: ResolvedMedia,
  asked: StageSlot | null,
  flipped: boolean
): Scene {
  const put = staged(scene.characters, scene.slots, scene.flipped, media, asked, flipped)
  return { ...scene, characters: put.list, slots: put.slots, flipped: put.flips }
}

/**
 * One animation over the scene, replacing itself if it is already running.
 *
 * Not `staged`: that folds a slot forward, and an animation has none. What is
 * left is a list and a flip, which is little enough to say outright.
 */
function animating(scene: Scene, media: ResolvedMedia, flipped: boolean): Scene {
  const name = media.asset.name
  const at = scene.animations.findIndex((one) => one.asset.name === name)

  return {
    ...scene,
    animations:
      at === -1
        ? [...scene.animations, media]
        : scene.animations.map((one, index) => (index === at ? media : one)),
    animFlipped: { ...scene.animFlipped, [name]: flipped }
  }
}

/** One character's staging forgotten, because they have left the stage. */
function without<T>(staged: Record<string, T>, name: string): Record<string, T> {
  if (!(name in staged)) return staged
  const rest = { ...staged }
  delete rest[name]
  return rest
}

function withUnresolved(scene: Scene, raw: string): Scene {
  return { ...scene, unresolved: [...new Set([...scene.unresolved, raw])] }
}

/** The scene after a whole run of lines, each with its own tags. */
export function sceneFrom(doc: MediaDocument, lines: string[][]): Scene {
  return lines.reduce((scene, tags) => applyTags(doc, scene, tags), EMPTY_SCENE)
}
