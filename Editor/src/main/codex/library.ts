import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { slugify, type CodexEntry } from '@shared/codex'
import { isIdOf, newId } from '@shared/ids'
import type { CodexLibrary } from '@shared/project'
import { exists, pruneEmptyFolders, safePath, walkFiles } from '../fs'
import { parseDocument, serialiseDocument } from '../markdown'
import { stripBom } from '../text'
import { parseEntry, serialiseEntry } from './markdown'

/** The library's own manifest, excluded from the entry scan. */
const MANIFEST = 'library.md'

function manifestPath(libraryPath: string): string {
  return join(libraryPath, MANIFEST)
}

function toDiskPath(libraryPath: string, file: string): string {
  return safePath(libraryPath, file, '.md')
}

/** Entry files, as library-relative paths without the extension. */
async function entryFiles(libraryPath: string): Promise<string[]> {
  const files = await walkFiles(libraryPath, (name) => name.toLowerCase().endsWith('.md'))
  return files.filter((file) => file !== MANIFEST).map((file) => file.slice(0, -3))
}

export async function listLibraries(librariesRoot: string): Promise<CodexLibrary[]> {
  let contents
  try {
    contents = await readdir(librariesRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const libraries = await Promise.all(
    contents
      .filter((item) => item.isDirectory())
      .map((item) => readLibrary(join(librariesRoot, item.name)))
  )

  return libraries
    .filter((library): library is CodexLibrary => library !== null)
    .sort((a, b) => a.title.localeCompare(b.title))
}

async function readLibrary(libraryPath: string): Promise<CodexLibrary | null> {
  let contents: string
  try {
    contents = stripBom(await readFile(manifestPath(libraryPath), 'utf8'))
  } catch {
    // A directory without a manifest is not a library.
    return null
  }

  const { data, body } = parseDocument(contents)
  const stored = typeof data['id'] === 'string' ? data['id'] : ''
  const id = isIdOf(stored, 'lib') ? stored : newId('lib')
  const title = typeof data['title'] === 'string' ? data['title'] : libraryPath.split(sep).pop()!

  const library: CodexLibrary = {
    id,
    title,
    description: body,
    path: libraryPath,
    entryCount: (await entryFiles(libraryPath)).length
  }

  // An id that had to be generated must be written back, or every load would
  // mint a new one and the projects linking this library would lose it.
  if (!isIdOf(stored, 'lib')) await saveLibrary(library)

  return library
}

export async function saveLibrary(library: CodexLibrary): Promise<void> {
  await mkdir(library.path, { recursive: true })
  await writeFile(
    manifestPath(library.path),
    serialiseDocument({ id: library.id, title: library.title }, library.description),
    'utf8'
  )
}

export async function createLibrary(librariesRoot: string, title: string): Promise<CodexLibrary> {
  const trimmed = title.trim() || 'Untitled library'
  const base = slugify(trimmed)

  let folder = base
  for (let suffix = 2; await exists(join(librariesRoot, folder)); suffix++) folder = `${base}-${suffix}`

  const library: CodexLibrary = {
    id: newId('lib'),
    title: trimmed,
    description: '',
    path: join(librariesRoot, folder),
    entryCount: 0
  }

  await saveLibrary(library)
  return library
}

/**
 * Loads every entry in a library, repairing what needs repairing.
 *
 * Two migrations run here, both idempotent and both written back so they only
 * happen once. Entries with no `id` get one — otherwise a link to them could
 * never be stable. And relations still written as file paths, from before ids
 * existed, are rewritten to the ids those paths now resolve to.
 */
export async function loadEntries(library: CodexLibrary): Promise<CodexEntry[]> {
  const files = await entryFiles(library.path)

  const parsed = await Promise.all(
    files.map(async (file) => {
      const diskPath = join(library.path, `${file.split('/').join(sep)}.md`)
      return parseEntry(library.id, file, stripBom(await readFile(diskPath, 'utf8')))
    })
  )

  const entries = parsed.map((item) => item.entry)
  const byFile = new Map(entries.map((entry) => [entry.file, entry.id]))
  const knownIds = new Set(entries.map((entry) => entry.id))

  const needsWrite = new Set(
    parsed.filter((item) => item.generatedId).map((item) => item.entry.id)
  )

  for (const entry of entries) {
    const migrated = entry.relations.map((relation) => {
      if (knownIds.has(relation)) return relation
      // Legacy: relations used to be file paths within the codex directory.
      return byFile.get(relation) ?? relation
    })

    if (migrated.some((value, index) => value !== entry.relations[index])) {
      entry.relations = migrated
      needsWrite.add(entry.id)
    }
  }

  if (needsWrite.size > 0) {
    const names = new Map(entries.map((entry) => [entry.id, entry.name]))
    await Promise.all(
      entries
        .filter((entry) => needsWrite.has(entry.id))
        .map((entry) => writeEntry(library, entry, (id) => names.get(id)))
    )
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

async function writeEntry(
  library: CodexLibrary,
  entry: CodexEntry,
  resolveName: (id: string) => string | undefined
): Promise<void> {
  const path = toDiskPath(library.path, entry.file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, serialiseEntry(entry, resolveName), 'utf8')
}

export async function saveEntry(
  library: CodexLibrary,
  entry: CodexEntry,
  names: Record<string, string>
): Promise<void> {
  await writeEntry(library, entry, (id) => names[id])
}

export async function deleteEntry(library: CodexLibrary, file: string): Promise<void> {
  const path = toDiskPath(library.path, file)
  await unlink(path)
  await pruneEmptyFolders(library.path, dirname(path))
}

/**
 * Moves an entry's file within its library. Nothing else has to change: links
 * point at the entry's id, which the move does not touch. This is exactly what
 * stable ids buy — the same operation used to require rewriting every relation
 * that referred to the old path, and could not have worked across projects.
 */
export async function moveEntry(
  library: CodexLibrary,
  fromFile: string,
  toFile: string
): Promise<void> {
  if (fromFile === toFile) return

  const source = toDiskPath(library.path, fromFile)
  const target = toDiskPath(library.path, toFile)

  // fs.rename replaces an existing destination on both Windows and POSIX, which
  // would silently destroy the entry already sitting there.
  if (await exists(target)) throw new Error(`A codex file named "${toFile}.md" already exists`)

  await mkdir(dirname(target), { recursive: true })
  await rename(source, target)
  await pruneEmptyFolders(library.path, dirname(source))
}
