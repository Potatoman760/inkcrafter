/**
 * Projects and codex libraries.
 *
 * A project is the top level: a title, a tree of ink files it owns, and the
 * codex libraries it draws on. A library is a self-contained collection of
 * codex entries that any number of projects can link — so a cast of characters
 * can be shared across a series without being copied into each game.
 *
 * The dependency runs one way. Projects know their libraries; libraries know
 * nothing about projects, which is what lets one be copied, versioned or handed
 * to someone else on its own.
 */

import type { DesktopRelease } from './desktop'

export interface ProjectProtection {
  mode: 'protected'
  /** Fingerprint selecting the matching private key compiled into the player. */
  keyId: string
  /** Base64 DER SubjectPublicKeyInfo. Public by design: exports need no private key. */
  publicKey: string
}

export interface Project {
  /** `prj_…`. Stable across renames. */
  id: string
  title: string
  /** Ids of the codex libraries this project uses. */
  libraries: string[]
  /** Project-relative path of the story's entry point, e.g. `ink/main.ink`. */
  main: string
  /** Markdown. The premise — the body of `project.md`. */
  description: string
  /**
   * Where `Export bundle` last wrote, absolute. Per project rather than per
   * machine: exporting goes to the game that plays this story, and a author
   * with two projects has two games.
   */
  bundleOut: string | null
  /** Absent means the existing plain export. */
  protection?: ProjectProtection
  /**
   * The desktop release: where it was last written, which platforms, and the
   * Steam App ID. Absent until the project has been exported that way once.
   */
  desktop?: DesktopRelease
  /** Absolute path of the project directory. Derived from location, never persisted. */
  path: string
}

export interface CodexLibrary {
  /** `lib_…`. What projects link to. */
  id: string
  title: string
  /** Markdown. What this library covers, for people rather than the model. */
  description: string
  /** Absolute path of the library directory. Derived from location, never persisted. */
  path: string
  /**
   * How many entries it holds. Derived by counting files, so it is known for
   * libraries the project has not linked and whose entries are never loaded.
   */
  entryCount: number
}

/** A story file inside a project, listed for the file tree. */
export interface ProjectFile {
  /** Project-relative path with `/` separators, e.g. `ink/act-one/opening.ink`. */
  path: string
  /** Absolute path, for opening and compiling. */
  absolutePath: string
}

/**
 * Two linked libraries can both contain a "Wren". Detection would match both
 * and the sidebar would show two entries with one name, so the conflict is
 * surfaced rather than silently resolved — picking one for the author is the
 * kind of thing they discover three months later.
 */
export interface NameConflict {
  /** The name or alias that more than one entry answers to. */
  term: string
  entryIds: string[]
}
