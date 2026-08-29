import type { CodexEntry } from './codex'
import { sectionsOf, type Manuscript } from './manuscript'
import { findMentionsInProse } from './mentions'

/**
 * Choosing which codex entries accompany a draft.
 *
 * Shared rather than main-only so the write panel can show the author exactly
 * what will be sent, computed by the same code that sends it. A preview derived
 * from a second implementation is a preview that will eventually lie.
 */

const MAX_CONTEXT_CHARS = 12_000

/**
 * The story as the reader has it: this exact path, in order, including the
 * choices taken to get here.
 */
export function storyContextFor(manuscript: Manuscript, sectionIndex: number): string {
  const sections = sectionsOf(manuscript)
  const parts: string[] = []

  for (const section of sections) {
    if (section.index >= sectionIndex) break

    for (const node of section.nodes) parts.push(node.text)

    const nextJunctionId = sections[section.index + 1]?.afterJunctionId
    const junction = manuscript.nodes.find((node) => node.id === nextJunctionId)
    if (junction?.kind === 'junction' && junction.chosenIndex !== null) {
      const chosen = junction.choices.find((choice) => choice.index === junction.chosenIndex)
      if (chosen) parts.push(`[The reader chose: ${chosen.text}]`)
    }
  }

  const story = parts.join('\n\n')
  // Keep the most recent context when a long reading would not fit.
  return story.length > MAX_CONTEXT_CHARS
    ? `[…earlier story omitted…]\n\n${story.slice(-MAX_CONTEXT_CHARS)}`
    : story
}

export function sectionTextFor(manuscript: Manuscript, sectionIndex: number): string {
  const section = sectionsOf(manuscript)[sectionIndex]
  return section?.nodes.map((node) => node.text).join('\n\n') ?? ''
}

/**
 * Everything the model will read, which is what gets scanned. A character named
 * in the scene counts even when the instruction does not mention them.
 */
export function scanTextFor(
  manuscript: Manuscript,
  sectionIndex: number,
  instruction: string
): string {
  return [
    storyContextFor(manuscript, sectionIndex),
    sectionTextFor(manuscript, sectionIndex),
    instruction
  ].join('\n\n')
}

export interface CodexSelection {
  entries: CodexEntry[]
  /** Ids named outright, as opposed to pulled in by relation or set to always. */
  detected: Set<string>
}

/**
 * Deduplicated throughout: the working set is keyed by entry id, so an entry
 * that is both `always` and named, or named and also related to something else
 * named, is selected once. Repeated mentions collapse for the same reason.
 */
export function selectCodexEntries(text: string, all: CodexEntry[]): CodexSelection {
  const byId = new Map(all.map((entry) => [entry.id, entry]))
  const eligible = all.filter((entry) => entry.aiContext !== 'never')

  const detected = new Set(findMentionsInProse(text, eligible).map((mention) => mention.entryId))

  const included = new Map<string, CodexEntry>()

  // `always` does not depend on being named, and so does not depend on being
  // tracked by name either.
  for (const entry of all) {
    if (entry.aiContext === 'always') included.set(entry.id, entry)
  }

  for (const id of detected) {
    const entry = byId.get(id)
    if (entry) included.set(entry.id, entry)
  }

  // One hop of relations: a tavern brings its barkeep, but not the barkeep's
  // every acquaintance. `never` still wins.
  for (const entry of [...included.values()]) {
    for (const relatedId of entry.relations) {
      const related = byId.get(relatedId)
      if (related && related.aiContext !== 'never') included.set(related.id, related)
    }
  }

  return {
    entries: [...included.values()].sort((a, b) => a.name.localeCompare(b.name)),
    detected
  }
}
