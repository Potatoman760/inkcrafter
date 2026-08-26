/**
 * The codex: a story bible of characters, locations, items and lore that sits
 * alongside the ink source.
 *
 * Modelled on novelcrafter's codex, adapted for visual novels. Entries are
 * stored as one markdown file each inside a codex library, so they stay
 * readable, greppable and diffable outside this app.
 */

import { newId } from './ids'

/**
 * `route` replaces novelcrafter's `subplot`: a visual novel's branches are the
 * structural unit that a prose novel's subplots occupy.
 */
export type CodexType = 'character' | 'location' | 'item' | 'lore' | 'route' | 'other'

export const CODEX_TYPES: readonly CodexType[] = [
  'character',
  'location',
  'item',
  'lore',
  'route',
  'other'
]

export const CODEX_TYPE_LABELS: Record<CodexType, string> = {
  character: 'Characters',
  location: 'Locations',
  item: 'Items',
  lore: 'Lore',
  route: 'Routes',
  other: 'Other'
}

/**
 * Whether an entry (or one detail of it) is sent to the model.
 * `detected` — the default — sends it only when its name is mentioned nearby.
 */
export type AiContext = 'always' | 'detected' | 'never'

export interface CodexDetail {
  label: string
  value: string
  ai: AiContext
}

export interface CodexTracking {
  /** When false the entry is never matched against the manuscript. */
  byName: boolean
  /** Useful for entries whose name is also a common word: "Red", "Storm". */
  caseSensitive: boolean
  /**
   * Phrases that must not count as a mention even though they match the name
   * or an alias — the classic case being a character called "Will" against the
   * auxiliary verb.
   */
  exclusions: string[]
}

export interface CodexEntry {
  /**
   * `cdx_…`. Generated once and written into the file, so links survive the
   * file being renamed or reorganised — including from outside the app.
   */
  id: string
  /** Id of the library holding this entry. Derived from location, never persisted. */
  libraryId: string
  /**
   * Path within the library, with `/` separators and no extension, e.g.
   * `characters/villains/wren`. Derived from location, never persisted; this is
   * filing, not identity.
   */
  file: string
  name: string
  type: CodexType
  aliases: string[]
  tags: string[]
  aiContext: AiContext
  tracking: CodexTracking
  /** Ids of entries pulled in alongside this one. */
  relations: string[]
  details: CodexDetail[]
  /** Visual description used as authoritative context when prompting character art. */
  appearance: string
  /** Markdown. The main body of the entry, and what the model reads. */
  description: string
  /** Markdown. Author scratch space — never sent to the model. */
  notes: string
}

export function newEntry(
  libraryId: string,
  name: string,
  type: CodexType = 'character',
  file = slugify(name)
): CodexEntry {
  return {
    id: newId('cdx'),
    libraryId,
    file,
    name,
    type,
    aliases: [],
    tags: [],
    aiContext: 'detected',
    tracking: { byName: true, caseSensitive: false, exclusions: [] },
    relations: [],
    details: [],
    appearance: '',
    description: '',
    notes: ''
  }
}

/**
 * Derives a filename-safe id from a display name. Falls back to `entry` so an
 * entry named only with punctuation still gets a usable filename.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    // Strip combining marks so "Rén" and "Ren" produce the same id.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'entry'
}

/**
 * Slugifies a `folder/sub/name` path one segment at a time.
 *
 * Entry ids are paths relative to the codex root, so entries can be filed into
 * folders — `characters/villains/wren` — the same way any other project tree
 * works. Empty segments are dropped so a stray slash cannot produce `a//b`.
 */
export function slugifyPath(path: string): string {
  return path
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map(slugify)
    .join('/')
}

/** The folder part of an entry's file path, or '' when it sits at the library root. */
export function entryFolder(file: string): string {
  const cut = file.lastIndexOf('/')
  return cut === -1 ? '' : file.slice(0, cut)
}
