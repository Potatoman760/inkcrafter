import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Project } from '@shared/project'
import type { WorkspaceChange } from '@shared/types'
import { inProject, watchProject, writeWatched } from './watch'

/**
 * Telling somebody else's write from our own.
 *
 * Noticing a change is the easy half and the filesystem does it. The half that
 * decides whether this feature is usable or maddening is the echo: this app
 * saves into the same folder it watches, and a watcher that reported its own
 * saves would reload the file the author is typing into.
 */

let root = ''
let project: Project
let watcher: { close: () => void } | null = null

/** Waits for the watcher to settle and report, or gives up. */
async function reported(seen: WorkspaceChange[], within = 2500): Promise<WorkspaceChange | null> {
  const until = Date.now() + within
  while (Date.now() < until) {
    if (seen.length > 0) return seen[0]!
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return null
}

/** Waits out the settle window to show that nothing was reported. */
async function quiet(seen: WorkspaceChange[]): Promise<WorkspaceChange[]> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  return seen
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-watch-'))
  await mkdir(join(root, 'ink'), { recursive: true })
  await writeFile(join(root, 'ink', 'main.ink'), 'Once.\n', 'utf8')
  await writeFile(join(root, 'media.json'), '{}', 'utf8')
  project = { id: 'prj_1', title: 'Watched', path: root } as Project
})

afterEach(async () => {
  watcher?.close()
  watcher = null
  await rm(root, { recursive: true, force: true })
})

describe('watchProject', () => {
  it('reports an ink file somebody else changed, by its project-relative path', async () => {
    const seen: WorkspaceChange[] = []
    watcher = watchProject(project, (change) => seen.push(change))

    await writeFile(join(root, 'ink', 'main.ink'), 'Twice.\n', 'utf8')

    expect((await reported(seen))?.ink).toContain('ink/main.ink')
  })

  it('sorts a catalogue apart from ink and from everything else', async () => {
    const seen: WorkspaceChange[] = []
    watcher = watchProject(project, (change) => seen.push(change))

    await writeFile(join(root, 'media.json'), '{"version":1}', 'utf8')

    const change = await reported(seen)
    expect(change?.catalogues).toEqual(['media.json'])
    expect(change?.ink).toEqual([])
  })

  // The whole point: this app writes into the folder it is watching.
  it('says nothing about a write this app made itself', async () => {
    const seen: WorkspaceChange[] = []
    watcher = watchProject(project, (change) => seen.push(change))

    await writeWatched(join(root, 'ink', 'main.ink'), 'Ours.\n')

    expect(await quiet(seen)).toEqual([])
  })

  it('reports a later change to a file this app wrote earlier', async () => {
    const seen: WorkspaceChange[] = []
    await writeWatched(join(root, 'media.json'), '{"ours":true}')
    watcher = watchProject(project, (change) => seen.push(change))

    // Far enough after ours that the echo window has closed.
    await new Promise((resolve) => setTimeout(resolve, 1600))
    await writeFile(join(root, 'media.json'), '{"theirs":true}', 'utf8')

    expect((await reported(seen))?.catalogues).toEqual(['media.json'])
  })

  it('ignores the half-written files an editor leaves beside a save', async () => {
    const seen: WorkspaceChange[] = []
    watcher = watchProject(project, (change) => seen.push(change))

    await writeFile(join(root, '.main.ink.swp'), 'x', 'utf8')
    await writeFile(join(root, 'ink', 'main.ink~'), 'x', 'utf8')
    await writeFile(join(root, 'notes.tmp'), 'x', 'utf8')

    expect(await quiet(seen)).toEqual([])
  })

  it('collects a burst of writes into one report', async () => {
    const seen: WorkspaceChange[] = []
    watcher = watchProject(project, (change) => seen.push(change))

    await writeFile(join(root, 'media.json'), '{"a":1}', 'utf8')
    await writeFile(join(root, 'map.json'), '{"b":2}', 'utf8')
    await writeFile(join(root, 'ink', 'main.ink'), 'Both.\n', 'utf8')

    const change = await reported(seen)
    expect(change?.catalogues.sort()).toEqual(['map.json', 'media.json'])
    expect(change?.ink).toEqual(['ink/main.ink'])
    expect(seen).toHaveLength(1)
  })

  it('says nothing once closed', async () => {
    const seen: WorkspaceChange[] = []
    watcher = watchProject(project, (change) => seen.push(change))
    watcher.close()

    await writeFile(join(root, 'media.json'), '{"after":true}', 'utf8')

    expect(await quiet(seen)).toEqual([])
  })

  // A folder that cannot be watched is still a folder worth editing.
  it('survives a project path that is not there', () => {
    const missing = { ...project, path: join(root, 'gone') }
    const onChange = vi.fn()

    expect(() => {
      watchProject(missing, onChange).close()
    }).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('inProject', () => {
  it('names a file inside the project and refuses one outside it', () => {
    expect(inProject(project, join(root, 'ink', 'main.ink'))).toBe('ink/main.ink')
    expect(inProject(project, join(root, '..', 'elsewhere.ink'))).toBeNull()
  })
})
