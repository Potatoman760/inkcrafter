import type { CodexEntry } from '@shared/codex'
import type { CodexSelection } from '@shared/codexContext'

/** Keeps a large codex from crowding out the story it describes. */
const MAX_CODEX_CHARS = 6_000

/**
 * Renders one entry.
 *
 * Notes are never included — that is the entire promise of the notes field.
 * A detail marked `detected` is only shown when the entry was named outright,
 * so a passing mention pulled in by relation does not drag in the specifics.
 */
function renderEntry(entry: CodexEntry, wasDetected: boolean, qualifier: string | null): string {
  const heading = qualifier ? `${entry.name} (${qualifier})` : entry.name
  const lines = [`## ${heading} — ${entry.type}`]

  if (entry.aliases.length > 0) lines.push(`Also known as: ${entry.aliases.join(', ')}`)

  const appearance = entry.appearance.trim()
  if (entry.type === 'character' && appearance.length > 0) {
    lines.push(`Appearance: ${appearance}`)
  }

  const description = entry.description.trim()
  if (description.length > 0) lines.push(description)

  for (const detail of entry.details) {
    const visible = detail.ai === 'always' || (detail.ai === 'detected' && wasDetected)
    if (!visible) continue
    const value = detail.value.trim()
    if (value.length > 0) lines.push(`${detail.label}: ${value}`)
  }

  return lines.join('\n')
}

/**
 * The codex block for the prompt, or '' when nothing was selected.
 *
 * Entries are unique by id, but two libraries can each hold a "Wren" — the
 * codex panel warns about that, and here the two would otherwise arrive as
 * indistinguishable, contradictory headings. Where a name is shared, the
 * library is added so the model can at least tell them apart.
 */
export function renderCodexContext(
  selection: CodexSelection,
  libraryTitles: Record<string, string> = {}
): string {
  if (selection.entries.length === 0) return ''

  const nameCounts = new Map<string, number>()
  for (const entry of selection.entries) {
    nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1)
  }

  const rendered: string[] = []
  let used = 0

  for (const entry of selection.entries) {
    const qualifier =
      (nameCounts.get(entry.name) ?? 0) > 1 ? (libraryTitles[entry.libraryId] ?? entry.libraryId) : null

    const block = renderEntry(entry, selection.detected.has(entry.id), qualifier)
    if (used + block.length > MAX_CODEX_CHARS) break
    rendered.push(block)
    used += block.length
  }

  if (rendered.length === 0) return ''

  return [
    'CODEX — established facts about the people, places and things below.',
    'Treat these as authoritative and do not contradict them. Do not restate them; write the scene.',
    '',
    rendered.join('\n\n')
  ].join('\n')
}
