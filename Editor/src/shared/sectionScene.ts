import { parseTag, parseTags, type TagCommand } from './bundle/tagSpec'
import { sectionsOf, type Manuscript } from './manuscript'
import { applyTags, EMPTY_SCENE, type Scene } from './mediaTag'
import type { MediaDocument } from './mediaDoc'

/**
 * What the reader is looking at, section by section.
 *
 * The manuscript reads a branching story as one novel, and until now the `#`
 * lines that stage it — the background, who is standing where, the music — were
 * invisible in that reading. They are on every node already (`ProseNode.tags`);
 * nothing had folded them.
 *
 * The fold is the whole point. A tag holds until something replaces it, so a
 * section that says nothing about the background is still *in* one, and a rail
 * that showed only each section's own tags would leave most sections blank and
 * tell the author nothing. Every section therefore carries the stage as it
 * stands there, plus the separate question of what this section itself changed.
 *
 * `applyTags` does the folding, which matters more than it looks: the preview
 * player folds the same function over the same tags. Two implementations of
 * "what does this scene look like" would eventually disagree about the same
 * story, and the one the author trusts is whichever they happened to open.
 */

/**
 * The kinds that describe a standing state, as against the kinds that describe
 * something happening.
 *
 * The split is the rail's organising idea, and it is not arbitrary — it is
 * already in `applyTags`, which folds these into the `Scene` and leaves the
 * others alone. A background is inherited; a stat change is not, because
 * "courage went up" is not a thing that can still be true three scenes later.
 */
const STANDING = ['bg', 'show', 'hide', 'clear', 'music', 'speaker', 'active', 'map'] as const

export function isStanding(command: TagCommand): boolean {
  return (STANDING as readonly string[]).includes(command.kind)
}

export interface SectionScene {
  index: number
  /** The stage as this section begins — everything inherited from before it. */
  before: Scene
  /** The stage as this section leaves it. This is what the rail draws. */
  after: Scene
  /**
   * What this section itself says, in the order written.
   *
   * The difference between `before` and `after` would find most of it, but not
   * a tag that set something to what it already was, and not the order. This is
   * also what decides whether a row reads as set here or carried in.
   */
  declared: TagCommand[]
  /**
   * The same tags as written, unparsed.
   *
   * Kept because removing a tag names it by its exact text — the source is the
   * save format, and a tag round-tripped through `formatTag` may not match the
   * characters actually in the file.
   */
  raw: string[]
}

/**
 * Every section's stage, in order.
 *
 * One pass, carrying a `Scene` forward. Cheap enough to run on every render of
 * the reading — it is O(total tags), and a long manuscript has fewer tags than
 * paragraphs — but memoise it anyway on the manuscript and the catalogue, since
 * both are stable between edits.
 */
export function sectionScenes(doc: MediaDocument, manuscript: Manuscript): SectionScene[] {
  let scene = EMPTY_SCENE

  return sectionsOf(manuscript).map((section) => {
    const raw = section.nodes.flatMap((node) => node.tags)
    const before = scene
    scene = applyTags(doc, scene, raw)

    // `applyTags` accumulates complaints along with the scene, which is right
    // for a preview reporting on a whole run and wrong here: a typo in the
    // first section would then be reported against every section after it, and
    // the author would go looking for a tag those sections do not contain.
    // Trimmed to this section's own, because a complaint is about the tag that
    // caused it and not about the stage it failed to change.
    const mine = scene.unresolved.filter((one) => !before.unresolved.includes(one))
    const after = mine.length === scene.unresolved.length ? scene : { ...scene, unresolved: mine }

    return { index: section.index, before, after, declared: parseTags(raw), raw }
  })
}

/**
 * Whether this section is what put a character on stage, or merely inherited
 * them.
 *
 * By name rather than by identity: `# show: wren/happy` on a character already
 * standing there swaps their look without moving them, and that is still this
 * section speaking about them.
 */
export function declaresCharacter(scene: SectionScene, name: string): boolean {
  return scene.declared.some(
    (command) =>
      (command.kind === 'show' && command.name === name) ||
      (command.kind === 'hide' && command.name === name) ||
      command.kind === 'clear'
  )
}

/**
 * Whether this section started or changed this animation, or merely inherited
 * it. The mirror of `declaresCharacter`, and separate for the same reason the
 * scene keeps two lists: the two are different namespaces.
 */
export function declaresAnimation(scene: SectionScene, name: string): boolean {
  return scene.declared.some(
    (command) =>
      (command.kind === 'anim' && (command.name === name || command.name === null)) ||
      (command.kind === 'hide' && command.name === name) ||
      command.kind === 'clear'
  )
}

/** Whether this section set one of the single-valued kinds itself. */
export function declaresKind(scene: SectionScene, kind: TagCommand['kind']): boolean {
  return scene.declared.some((command) => command.kind === kind)
}

/**
 * The tag as written that a row in the rail came from, or null.
 *
 * Needed because removing a tag names it by its exact text, and `declared`
 * cannot answer that: `parseTags` drops the ones it could not read, so its
 * indices do not line up with `raw`. Re-parsing is cheaper than carrying a
 * second list that could fall out of step with the first.
 */
export function rawOf(
  scene: SectionScene,
  matches: (command: TagCommand) => boolean
): string | null {
  for (const raw of scene.raw) {
    const command = parseTag(raw)
    if (command && matches(command)) return raw
  }

  return null
}

/**
 * The things that happen here rather than the things that are true here.
 *
 * These never appear on a section that did not write them, so they need no
 * inherited/declared distinction — being in the list is the distinction.
 */
export function eventsOf(scene: SectionScene): TagCommand[] {
  return scene.declared.filter((command) => !isStanding(command))
}
