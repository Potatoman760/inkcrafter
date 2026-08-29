import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isDirectory } from './fs'
import { listProjects } from './project'
import { librariesDir, projectsDir } from './workspace'

/**
 * Copies the bundled example project and codex library into an empty workspace.
 *
 * A first launch with nothing in it is a bad way to meet a tool built around
 * projects and libraries, and the example is the clearest documentation of both
 * file formats. It runs only when no project exists, so it can never overwrite
 * the author's work.
 *
 * The copy is done by hand rather than with `fs.cp` because in a packaged build
 * the source lives inside app.asar, which supports reading but not every
 * filesystem operation.
 */
async function copyTree(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true })
  for (const item of await readdir(source, { withFileTypes: true })) {
    const from = join(source, item.name)
    const to = join(target, item.name)
    if (item.isDirectory()) await copyTree(from, to)
    else await writeFile(to, await readFile(from))
  }
}

export async function seedWorkspace(): Promise<void> {
  if ((await listProjects(projectsDir())).length > 0) return

  const examples = join(app.getAppPath(), 'examples')
  if (!(await isDirectory(examples))) return

  await copyTree(join(examples, 'projects'), projectsDir())
  await copyTree(join(examples, 'codex'), librariesDir())
}
