/**
 * The connected player: a checkout of InkCrafter Player that InkCrafter can
 * export a preview into and run.
 *
 * A path and a child process, which is why this is a handful of plain shapes
 * rather than a document — nothing here is the author's work, and none of it
 * travels with the workspace.
 */

/** Whether a folder is a player checkout, and what is wrong when it is not. */
export interface PlayerCheck {
  ok: boolean
  /** What to tell the author. Null when there is nothing to tell them. */
  problem: string | null
  /** The package's own name, when it has one, so the tab can confirm the find. */
  name?: string | null
}

export interface PlayerStatus {
  running: boolean
  /** The folder the running server was started in. */
  dir: string | null
  /** Where vite says it is listening, once it has said so. */
  url: string | null
  /** The tail of its output, which is the only account of why it would not start. */
  lines: string[]
  /** Non-null once it has stopped, so a failure reads differently from "not started". */
  exitCode: number | null
}

/** What "Preview in player" did, or why it could not. */
export interface PreviewResult {
  ok: boolean
  /** Where the bundle was written. */
  outDir: string | null
  /** The address to open, when there is one. */
  url: string | null
  /** Opaque id of the checkpoint written into this preview bundle. */
  previewId: string | null
  problem: string | null
}

/** What the editor wants the connected player to start from. */
