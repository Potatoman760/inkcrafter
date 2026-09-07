// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run `npm run spec:sync`. See scripts/sync-spec.mjs.

/**
 * When a catalogue entry was last touched, and the orders a list can be read in.
 *
 * A catalogue is written in the order things were thought of, which is no
 * order at all once there are sixty of them: the one you added this morning is
 * somewhere in the middle, and finding it means reading the whole list. So the
 * file's own order is not offered as a way of reading it — by name is, which
 * is the order you can search by eye, and by when it changed, which is the
 * order that answers "what was I just doing".
 *
 * Sorting is always a view. The list in the file keeps whatever order it has,
 * because that is the order the ink is generated in.
 */

/** Which way a list is read. */
export type SortField = 'name' | 'modified'

export interface Sort {
  by: SortField
  /** Flips whichever way the field runs naturally: A→Z for a name, newest first for a date. */
  reversed: boolean
}

/** By name, forwards — the order you can find something in without being told where it is. */
export const DEFAULT_SORT: Sort = { by: 'name', reversed: false }

/** Anything the catalogues stamp. Absent on entries written before this existed. */
export interface Stamped {
  modified: string | null
}

/** Now, as an ISO instant — the one format that sorts as a string and reads as a date. */
export function stampNow(): string {
  return new Date().toISOString()
}

/**
 * `after`, stamped — but only if it is really different from `before`.
 *
 * The panels call their update functions on every keystroke, and some call
 * them with what is already there. A stamp moved by a no-op edit would report
 * that an entry changed on a day nobody opened it, which is worse than no
 * stamp: it is a wrong answer rather than a missing one.
 */
export function restamp<T extends Stamped>(before: T, after: T): T {
  const same = { ...after, modified: before.modified }
  return JSON.stringify(same) === JSON.stringify(before) ? before : { ...after, modified: stampNow() }
}

/** One reading of a list, leaving the list itself alone. */
export function sortBy<T>(
  entries: readonly T[],
  sort: Sort,
  read: { label: (one: T) => string; modified: (one: T) => string | null }
): readonly T[] {
  const flip = sort.reversed ? -1 : 1

  if (sort.by === 'name') {
    // Numeric collation, because these are names like `chapter2_day` and
    // `chapter10_day`, and plain string order puts the tenth before the second.
    return [...entries].sort(
      (a, b) =>
        flip *
        read.label(a).localeCompare(read.label(b), undefined, { numeric: true, sensitivity: 'base' })
    )
  }

  return [...entries].sort((a, b) => {
    const left = read.modified(a)
    const right = read.modified(b)
    // Never-stamped entries stay last whichever way the dates run. They are not
    // the oldest — they are the ones this has no answer for, and reversing into
    // "oldest first" should not promote an absence to the top of the list.
    if (!left && !right) return 0
    if (!left) return 1
    if (!right) return -1
    return flip * right.localeCompare(left)
  })
}

/** How long ago, in the words a list row has room for. */
export function agoLabel(modified: string | null, now = Date.now()): string {
  if (!modified) return ''
  const at = Date.parse(modified)
  if (Number.isNaN(at)) return ''

  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(at).toLocaleDateString()
}
