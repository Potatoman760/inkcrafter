import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { open as openZip, type Entry, type ZipFile as ReadZipFile } from 'yauzl'
import { slugify } from '@shared/codex'
import { isIdOf, newId } from '@shared/ids'
import {
  PACKAGE_CODEX_DIR,
  PACKAGE_FORMAT,
  PACKAGE_MANIFEST,
  PACKAGE_PROJECT_DIR,
  packaged,
  refuseEntry,
  type LibraryFate,
  type PackageImportResult,
  type PackageManifest,
  type PackagePreview,
  type PackagePreviewLibrary,
  type PackageResult
} from '@shared/projectPackage'
import type { CodexLibrary, Project } from '@shared/project'
import { exists, isDirectory, walkFiles } from './fs'
import { listLibraries } from './codex/library'
import { listProjects, readProject, saveProject } from './project'

/**
 * Writing a project out as one file, and reading one back into the workspace.
 *
 * The workspace is deliberately not a tree: `projects/` and `codex/` are
 * siblings, because a library belongs to no single project. Everything that is
 * good about that is bad the moment the author wants to move their work, and
 * this is the seam where the two shapes meet — a package is the project *with*
 * the libraries it needs, and opening one puts them back as siblings again.
 *
 * Opening never overwrites. A project folder whose name is taken gets a free
 * one; a project whose id is already here is given a new one, because two
 * projects sharing an id would share the player's save slots. A library whose
 * id is already here is *not* written at all — libraries are shared by design,
 * so the one already in the workspace is the same library, and replacing it
 * with the sender's copy would quietly discard the author's own edits to it.
 */

/**
 * Formats that are already compressed, and gain nothing from being deflated.
 *
 * Nearly everything by weight in a project is one of these: a PNG is deflated
 * already, and a webm or an mp3 more thoroughly than zip could manage. Passing
 * them through stored costs a percent of the package's size and saves most of
 * the time spent writing it — on a project of nine hundred megabytes that is
 * the difference between a wait and a pause.
 */
const ALREADY_COMPRESSED = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
  'mp3', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus',
  'mp4', 'webm', 'mov', 'mkv',
  'woff', 'woff2', 'zip'
])

function compressible(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot < 0 || !ALREADY_COMPRESSED.has(name.slice(dot + 1).toLowerCase())
}

/** Refuse absurd archives before reading them: a package is a story, not a disk image. */
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024 * 1024

/** And refuse one whose entries claim to unpack to far more than they could. */
const MAX_ENTRIES = 200_000

// --- writing -----------------------------------------------------------------

export async function packageProject(
  project: Project,
  libraries: CodexLibrary[],
  file: string
): Promise<PackageResult> {
  const empty = { ok: false, file, files: 0, bytes: 0 }
  const warnings: string[] = []

  if (!(await isDirectory(project.path))) {
    return { ...empty, warnings, problem: `${project.path} is not there any more.` }
  }

  // A linked library left out is not an error — an author may be sending only
  // the story — but it is the one thing about a package that is invisible
  // afterwards and expensive to discover.
  const included = new Set(libraries.map((one) => one.id))
  for (const id of project.libraries) {
    if (!included.has(id)) {
      warnings.push(
        `This project links a codex library that is not in the package (${id}). ` +
          'Opened elsewhere, its entries will be missing.'
      )
    }
  }

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    generatedBy: 'InkCrafter',
    generatedAt: new Date().toISOString(),
    project: { id: project.id, title: project.title, folder: basename(project.path) },
    libraries: libraries.map((one) => ({
      id: one.id,
      title: one.title,
      folder: basename(one.path)
    }))
  }

  // Gathered before the zip exists. yazl reads a file's metadata the moment it
  // is added, so a ZipFile that is abandoned partway leaves reads in flight
  // that fail later, against a caller that has already been answered.
  const contents: { source: string; name: string }[] = []
  for (const relative of await packagedFiles(project.path)) {
    contents.push({
      source: join(project.path, relative.split('/').join(sep)),
      name: `${PACKAGE_PROJECT_DIR}/${relative}`
    })
  }
  for (const library of libraries) {
    const folder = basename(library.path)
    for (const relative of await packagedFiles(library.path)) {
      contents.push({
        source: join(library.path, relative.split('/').join(sep)),
        name: `${PACKAGE_CODEX_DIR}/${folder}/${relative}`
      })
    }
  }

  try {
    await mkdir(dirname(file), { recursive: true })
  } catch (error) {
    return { ...empty, warnings, problem: error instanceof Error ? error.message : String(error) }
  }

  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(`${JSON.stringify(manifest, null, 2)}
`, 'utf8'), PACKAGE_MANIFEST)
  for (const one of contents) {
    zip.addFile(one.source, one.name, { compress: compressible(one.name) })
  }

  // Written beside the destination and renamed in, so an interrupted write
  // never leaves something that looks like a package where one is expected.
  const partial = `${file}.inkcrafter-part`
  try {
    zip.end()
    await pipeline(zip.outputStream, createWriteStream(partial))
    await rm(file, { force: true })
    await rename(partial, file)
  } catch (error) {
    await rm(partial, { force: true })
    return {
      ...empty,
      warnings,
      problem: error instanceof Error ? error.message : String(error)
    }
  }

  const { size } = await stat(file)
  return { ok: true, file, files: contents.length + 1, bytes: size, warnings, problem: null }
}

/** Every file under a folder that belongs in a package, as `/`-separated paths. */
async function packagedFiles(root: string): Promise<string[]> {
  const files = await walkFiles(root, () => true)
  return files.filter(packaged).sort()
}

// --- reading -----------------------------------------------------------------

/**
 * What is in a package, without writing anything.
 *
 * Every entry name is checked here as well as during extraction. The check
 * costs a pass over the central directory and buys the ability to say "this is
 * not a package I will open" *before* the author has committed to opening it.
 */
export async function previewPackage(file: string, dataDir: string): Promise<PackagePreview> {
  const empty: PackagePreview = {
    ok: false,
    file,
    manifest: null,
    libraries: [],
    folder: '',
    duplicate: false,
    problem: null
  }

  let manifest: PackageManifest
  try {
    const size = (await stat(file)).size
    if (size > MAX_PACKAGE_BYTES) {
      return { ...empty, problem: `${basename(file)} is far too large to be a project package.` }
    }
    manifest = await readManifest(file)
    await checkEntries(file)
  } catch (error) {
    return { ...empty, problem: error instanceof Error ? error.message : String(error) }
  }

  const [projects, libraries] = await Promise.all([
    listProjects(join(dataDir, 'projects')),
    listLibraries(join(dataDir, 'codex'))
  ])
  const here = new Map(libraries.map((one) => [one.id, one]))

  return {
    ok: true,
    file,
    manifest,
    libraries: manifest.libraries.map((one): PackagePreviewLibrary => {
      const existing = here.get(one.id)
      return {
        ...one,
        fate: existing ? 'keep' : 'add',
        existingTitle: existing && existing.title !== one.title ? existing.title : null
      }
    }),
    folder: await freeFolder(join(dataDir, 'projects'), manifest.project.folder),
    duplicate: projects.some((one) => one.id === manifest.project.id),
    problem: null
  }
}

/**
 * Unpacks a package into the workspace, and answers with where the project
 * landed so it can be opened.
 *
 * Extracted into a staging folder beside the workspace and moved in whole, so
 * a package that turns out to be damaged halfway through does not leave a
 * half-project in the list of projects the author can open.
 */
export async function importPackage(file: string, dataDir: string): Promise<PackageImportResult> {
  const empty: PackageImportResult = {
    ok: false,
    projectPath: null,
    libraries: [],
    warnings: [],
    problem: null
  }

  const preview = await previewPackage(file, dataDir)
  if (!preview.ok || !preview.manifest) return { ...empty, problem: preview.problem }
  const manifest = preview.manifest

  const staging = join(dataDir, '.inkcrafter-opening')
  await rm(staging, { recursive: true, force: true })

  try {
    await extractAll(file, staging)

    const projectSource = join(staging, PACKAGE_PROJECT_DIR)
    if (!(await exists(join(projectSource, 'project.md')))) {
      return { ...empty, problem: 'This package has no project.md in it, so it holds no project.' }
    }

    const warnings: string[] = []
    const landed: { title: string; fate: LibraryFate }[] = []

    // Libraries first: a project whose libraries failed to land would open
    // with its mentions silently unresolved, which is worse than not opening.
    await mkdir(join(dataDir, 'codex'), { recursive: true })
    for (const library of preview.libraries) {
      landed.push({ title: library.title, fate: library.fate })
      if (library.fate === 'keep') {
        warnings.push(
          `Kept the codex library you already have for ${library.title}; the package's copy was not used.`
        )
        continue
      }
      const source = join(staging, PACKAGE_CODEX_DIR, library.folder)
      if (!(await isDirectory(source))) {
        warnings.push(`${library.title} is named in the package but its folder is missing.`)
        continue
      }
      await rename(source, join(dataDir, 'codex', await freeFolder(join(dataDir, 'codex'), library.folder)))
    }

    const projectsRoot = join(dataDir, 'projects')
    await mkdir(projectsRoot, { recursive: true })
    const folder = await freeFolder(projectsRoot, manifest.project.folder)
    const projectPath = join(projectsRoot, folder)
    await rename(projectSource, projectPath)

    if (folder !== manifest.project.folder) {
      warnings.push(
        `Opened as "${folder}" — the workspace already had a folder called "${manifest.project.folder}".`
      )
    }

    // A second project under one id would share the player's save slots with
    // the first, since a save names the story it belongs to by that id.
    if (preview.duplicate) {
      const project = await readProject(projectPath)
      if (project) {
        await saveProject({ ...project, id: newId('prj') })
        warnings.push('This project is already in the workspace, so the copy was given a new identity.')
      }
    }

    return { ok: true, projectPath, libraries: landed, warnings, problem: null }
  } catch (error) {
    return { ...empty, problem: error instanceof Error ? error.message : String(error) }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/** The given name, or the first free `name-2`, `name-3` beside it. */
async function freeFolder(root: string, wanted: string): Promise<string> {
  const base = slugify(wanted) || 'project'
  let folder = base
  for (let suffix = 2; await exists(join(root, folder)); suffix += 1) folder = `${base}-${suffix}`
  return folder
}

// --- the zip itself ----------------------------------------------------------

/** Opens a zip with the checks that make an unknown file safe to walk. */
async function withZip<T>(file: string, use: (zip: ReadZipFile) => Promise<T>): Promise<T> {
  const zip = await new Promise<ReadZipFile>((resolve, reject) => {
    openZip(file, { lazyEntries: true }, (error, opened) => {
      if (error || !opened) reject(error ?? new Error(`${basename(file)} could not be opened.`))
      else resolve(opened)
    })
  })
  if (zip.entryCount > MAX_ENTRIES) {
    zip.close()
    throw new Error(`${basename(file)} holds far too many files to be a project package.`)
  }
  try {
    return await use(zip)
  } finally {
    zip.close()
  }
}

/**
 * Walks a zip's entries in order, checking each name before handing it over.
 *
 * `lazyEntries` is what makes this a walk rather than a firehose: the next
 * entry is only read once this one has been dealt with, so an entry can be
 * written to disk before the next arrives.
 */
async function eachEntry(
  zip: ReadZipFile,
  visit: (entry: Entry) => Promise<'next' | 'stop'>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', resolve)
    zip.on('entry', (entry: Entry) => {
      visit(entry).then((next) => (next === 'stop' ? resolve() : zip.readEntry()), reject)
    })
    zip.readEntry()
  })
}

/**
 * Every entry name, checked, before anything is written.
 *
 * A separate pass rather than a check inside the walk, so that the questions
 * are asked in the order somebody would ask them: a zip that is not a package
 * at all is reported as that, and only a zip that *claims* to be a package is
 * held to what a package may contain.
 */
function checkEntry(entry: Entry, file: string): void {
  const name = entry.fileName
  const refusal = refuseEntry(name.replace(/\/+$/, ''))
  if (refusal !== null) {
    throw new Error(`${basename(file)} is not a package this will open: ${refusal}.`)
  }
  // A zip can carry a symlink as an entry whose target is its contents.
  // Written out, it is a link into wherever the sender chose.
  if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) {
    throw new Error(
      `${basename(file)} holds a symbolic link (${name}), which a project package may not.`
    )
  }
}

/**
 * Walks the whole package once, refusing it if any entry is one to refuse.
 *
 * yauzl turns some of these away before this does — it will not hand over an
 * entry named `../x` at all — so the refusal can arrive as its message rather
 * than as one of ours. Either way it is the same answer, and it is said in the
 * same words: this is not a package this will open, and here is the entry.
 */
async function checkEntries(file: string): Promise<void> {
  try {
    await withZip(file, async (zip) => {
      await eachEntry(zip, async (entry) => {
        checkEntry(entry, file)
        return 'next'
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith(basename(file))) throw error
    throw new Error(`${basename(file)} is not a package this will open: ${message}.`)
  }
}

/** The manifest, which is also what makes a zip a package rather than a zip. */
async function readManifest(file: string): Promise<PackageManifest> {
  const body = await withZip(file, async (zip) => {
    let found: string | null = null
    await eachEntry(zip, async (entry) => {
      if (entry.fileName !== PACKAGE_MANIFEST) return 'next'
      found = await readEntry(zip, entry)
      return 'stop'
    })
    return found
  })

  if (body === null) {
    throw new Error(
      `${basename(file)} has no ${PACKAGE_MANIFEST} in it, so it is a zip rather than a project package.`
    )
  }
  return parseManifest(body, file)
}

export function parseManifest(body: string, file: string): PackageManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error(`The manifest in ${basename(file)} is not readable.`)
  }
  const one = parsed as Record<string, unknown>
  if (one?.['format'] !== PACKAGE_FORMAT) {
    throw new Error(
      `${basename(file)} is a ${String(one?.['format'] ?? 'different')} package, which this version does not open.`
    )
  }

  const project = one['project'] as Record<string, unknown> | undefined
  const id = typeof project?.['id'] === 'string' ? project['id'] : ''
  const title = typeof project?.['title'] === 'string' ? project['title'] : ''
  const folder = typeof project?.['folder'] === 'string' ? project['folder'] : ''
  if (!isIdOf(id, 'prj') || title.length === 0 || folder.length === 0) {
    throw new Error(`The manifest in ${basename(file)} does not name a project.`)
  }

  const libraries = Array.isArray(one['libraries']) ? one['libraries'] : []
  return {
    format: PACKAGE_FORMAT,
    generatedBy: 'InkCrafter',
    generatedAt: typeof one['generatedAt'] === 'string' ? one['generatedAt'] : '',
    project: { id, title, folder },
    libraries: libraries
      .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
      .map((value) => ({
        id: typeof value['id'] === 'string' ? value['id'] : '',
        title: typeof value['title'] === 'string' ? value['title'] : 'Untitled library',
        folder: typeof value['folder'] === 'string' ? value['folder'] : ''
      }))
      .filter((value) => isIdOf(value.id, 'lib') && value.folder.length > 0)
  }
}

async function readEntry(zip: ReadZipFile, entry: Entry): Promise<string> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(entry, (error, opened) => {
      if (error || !opened) reject(error ?? new Error('An entry could not be read.'))
      else resolve(opened)
    })
  })
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

/** Every entry, written under `dir`, with the folders they need made as they go. */
async function extractAll(file: string, dir: string): Promise<void> {
  await withZip(file, async (zip) => {
    await eachEntry(zip, async (entry) => {
      checkEntry(entry, file)
      const name = entry.fileName
      if (name.endsWith('/')) {
        await mkdir(join(dir, name.split('/').join(sep)), { recursive: true })
        return 'next'
      }

      const target = join(dir, name.split('/').join(sep))
      await mkdir(dirname(target), { recursive: true })
      const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        zip.openReadStream(entry, (error, opened) => {
          if (error || !opened) reject(error ?? new Error(`${name} could not be read.`))
          else resolve(opened)
        })
      })
      await pipeline(stream, createWriteStream(target))
      return 'next'
    })
  })
}

/** The default name to offer for a package of this project. */
export function packageFileName(project: Project): string {
  return `${slugify(project.title) || basename(project.path) || 'project'}.zip`
}

/** Exported for tests: what a package holds, as entry names. */
export async function entryNames(file: string): Promise<string[]> {
  const names: string[] = []
  await withZip(file, async (zip) => {
    await eachEntry(zip, async (entry) => {
      names.push(entry.fileName)
      return 'next'
    })
  })
  return names.sort()
}

/** Exported for tests: one file's contents out of a package. */
export async function entryText(file: string, name: string): Promise<string | null> {
  return withZip(file, async (zip) => {
    let found: string | null = null
    await eachEntry(zip, async (entry) => {
      if (entry.fileName !== name) return 'next'
      found = await readEntry(zip, entry)
      return 'stop'
    })
    return found
  })
}
