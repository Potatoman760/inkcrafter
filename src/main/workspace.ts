import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * The workspace: where everything the author creates lives.
 *
 * In development that is `data/` at the repo root, which is convenient to
 * inspect while working on the app. In a packaged build the repo is not around
 * (and would not be writable if it were), so it lives beside the app's other
 * per-user state.
 *
 *     data/
 *       projects/<project>/project.md      title, linked libraries, premise
 *       projects/<project>/ink/…           the stories it owns
 *       codex/<library>/library.md         a shareable collection of entries
 *       codex/<library>/…                  the entries
 *
 * Projects and libraries are siblings rather than nested, because a library
 * belongs to no single project — that is the whole point of it.
 */
export function dataDir(): string {
  return app.isPackaged ? join(app.getPath('userData'), 'data') : join(app.getAppPath(), 'data')
}

export function projectsDir(): string {
  return join(dataDir(), 'projects')
}

export function librariesDir(): string {
  return join(dataDir(), 'codex')
}

export async function ensureWorkspace(): Promise<void> {
  await Promise.all([
    mkdir(projectsDir(), { recursive: true }),
    mkdir(librariesDir(), { recursive: true })
  ])
}
