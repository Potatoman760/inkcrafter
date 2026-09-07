/**
 * A project and its codex libraries, as one file.
 *
 * The workspace is a folder of folders, and a project is not self-contained
 * within it: the codex libraries it draws on are siblings, deliberately, so a
 * cast can be shared across a series. That is right for working and wrong for
 * moving — copying `projects/the-archive/` to another machine leaves the codex
 * behind, and the author finds out when every mention stops resolving.
 *
 * A package is the two put together, with a manifest saying which is which:
 *
 *     inkcrafter-package.json   what this is, and what is in it
 *     project/…                 the project folder
 *     codex/<folder>/…          one folder per library that came along
 *
 * Plain zip, because it has to be openable by somebody who does not have this
 * app — to check what they were sent, or to recover a story from a package
 * when nothing else survives.
 */

export const PACKAGE_FORMAT = 'inkcrafter-package/1'

/** The manifest's name inside the zip, and the thing that makes a zip a package. */
export const PACKAGE_MANIFEST = 'inkcrafter-package.json'

/** Where the project's own files sit inside the zip. */
export const PACKAGE_PROJECT_DIR = 'project'

/** Where the libraries sit, one folder each. */
export const PACKAGE_CODEX_DIR = 'codex'

/** Named in the package so the workspace can put it back where it came from. */
export interface PackagedLibrary {
  id: string
  title: string
  /** The folder it had in `codex/`, which is where it goes back unless taken. */
  folder: string
}

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT
  generatedBy: 'InkCrafter'
  generatedAt: string
  project: {
    id: string
    title: string
    /** The folder it had in `projects/`. */
    folder: string
  }
  libraries: PackagedLibrary[]
}

export interface PackageResult {
  ok: boolean
  /** Absolute path of the zip written, whether or not it succeeded. */
  file: string
  /** How many files went in, and how large the package came out. */
  files: number
  bytes: number
  /** A library that was linked but left out, and anything else worth saying. */
  warnings: string[]
  /** Set when nothing was written. */
  problem: string | null
}

/** What a library in a package would do to the workspace if it were opened. */
export type LibraryFate =
  /** Not here yet: it will be written. */
  | 'add'
  /** Already here under this id: yours is kept and the package's is skipped. */
  | 'keep'

export interface PackagePreviewLibrary extends PackagedLibrary {
  fate: LibraryFate
  /** The title the workspace already has for it, when that differs. */
  existingTitle: string | null
}

/**
 * What is in a package, and what opening it would do — read before anything is
 * written, because "it will not touch the library you already have" is the
 * kind of thing to say beforehand rather than report afterwards.
 */
export interface PackagePreview {
  ok: boolean
  file: string
  manifest: PackageManifest | null
  libraries: PackagePreviewLibrary[]
  /** The folder the project will land in, which is not always the one it had. */
  folder: string
  /** True when a project with this id is already in the workspace. */
  duplicate: boolean
  problem: string | null
}

export interface PackageImportResult {
  ok: boolean
  /** The project as the workspace now holds it, ready to open. */
  projectPath: string | null
  /** Named as they landed, so the dialog can say what it did. */
  libraries: { title: string; fate: LibraryFate }[]
  warnings: string[]
  problem: string | null
}

/**
 * Whether a name in a zip is one this is willing to write, and why not.
 *
 * A package can arrive from anywhere, and a zip may name its entries anything
 * at all — `../../.ssh/authorized_keys` is a valid entry name, and an unpacker
 * that joins entry names onto a destination without looking will write it.
 * Everything is checked against this before a single byte is extracted, and one
 * bad name refuses the whole package rather than being skipped: an archive
 * carrying such a name is not a damaged package, it is a hostile one.
 */
export function refuseEntry(name: string): string | null {
  if (name.length === 0) return 'an entry with no name'
  // Zip stores `/` and nothing else; a backslash is either a Windows tool
  // getting it wrong or someone hoping this splits on the wrong separator.
  if (name.includes('\\')) return `"${name}" uses backslashes, which a zip entry may not`
  if (name.startsWith('/')) return `"${name}" is an absolute path`
  if (/^[A-Za-z]:/.test(name)) return `"${name}" names a drive`
  if (name.split('/').some((part) => part === '..')) return `"${name}" climbs out of the package`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return `"${name}" holds a control character`

  const top = name.split('/')[0]
  if (name === PACKAGE_MANIFEST) return null
  if (top === PACKAGE_PROJECT_DIR || top === PACKAGE_CODEX_DIR) return null
  return `"${name}" is not part of a project package`
}

/**
 * What a package leaves behind.
 *
 * `export/` is regenerated from `stats.json` on every save and by every export,
 * so it is a build output that happens to live in the source folder. Dotfiles
 * are whatever the author's other tools left; none of them is the story.
 */
export function packaged(relativePath: string): boolean {
  const parts = relativePath.split('/')
  if (parts.some((part) => part.startsWith('.'))) return false
  return parts[0] !== 'export'
}
