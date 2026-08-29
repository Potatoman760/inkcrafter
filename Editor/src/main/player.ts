import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app, shell } from 'electron'
import type { PlayerCheck, PlayerStatus } from '@shared/player'
import { exists, isDirectory } from './fs'

/**
 * The connected player: the `Player` package, run as a dev server.
 *
 * Previewing in the real player is the only way to see what a reader will see —
 * the app's own preview runs the ink, but it is not the game. So the bundle is
 * exported into the player's `game/preview/` and vite is pointed at it, which
 * is exactly what `npm run dev -- --game preview` does there.
 *
 * One server, kept running. Vite takes seconds to boot and rebuilding it for
 * every preview would make the feature feel worse than a terminal; a second
 * preview only re-exports, and the bundle is staged and swapped so the running
 * server never sees half of one.
 */

/** The folder inside the player's static root that a preview is written to. */
export const PREVIEW_GAME = 'preview'

/**
 * Where the player is, which is no longer a question.
 *
 * The editor and the player are two packages of one repository, so the path is
 * derived rather than stored: `app.getAppPath()` is the editor package in
 * development, and the player is its sibling. This used to be a folder the
 * author picked in Settings, from when the two were separate checkouts that
 * could be anywhere.
 *
 * Packaged, the sibling does not exist — and could not be used if it did, since
 * previewing runs `npm run dev` in it. `checkPlayer` reports that as the plain
 * "not a folder" it is, which is the same answer the setting gave when it
 * pointed somewhere stale.
 */
export function playerDir(): string {
  return resolve(app.getAppPath(), '..', 'Player')
}

/** How much of the server's output is kept, for when it will not start. */
const KEPT_LINES = 40

interface Running {
  child: ChildProcess
  dir: string
  lines: string[]
  url: string | null
  exitCode: number | null
}

let running: Running | null = null

/** Told to the renderer whenever any of it changes. */
let announce: ((status: PlayerStatus) => void) | null = null

export function onPlayerStatus(listener: (status: PlayerStatus) => void): void {
  announce = listener
}

export function playerStatus(): PlayerStatus {
  if (!running) return { running: false, dir: null, url: null, lines: [], exitCode: null }
  return {
    running: running.child.exitCode === null && running.exitCode === null,
    dir: running.dir,
    url: running.url,
    lines: [...running.lines],
    exitCode: running.exitCode
  }
}

function changed(): void {
  announce?.(playerStatus())
}

/**
 * Whether a folder is a player checkout, and what is wrong if not.
 *
 * Checked rather than assumed because the failure is otherwise a wall of npm
 * output: pointing at the wrong folder, or at a right one that was never
 * installed, are the two things that actually happen.
 */
export async function checkPlayer(dir: string): Promise<PlayerCheck> {
  if (dir.trim().length === 0) return { ok: false, problem: 'No folder chosen yet.' }
  if (!(await isDirectory(dir))) return { ok: false, problem: `${dir} is not a folder.` }

  let manifest: { name?: string; scripts?: Record<string, string> }
  try {
    manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as typeof manifest
  } catch {
    return { ok: false, problem: 'No package.json here — this is not the player.' }
  }

  if (!manifest.scripts?.['dev']) {
    return { ok: false, problem: `${manifest.name ?? 'That package'} has no "dev" script.` }
  }

  if (!(await isDirectory(join(dir, 'game')))) {
    return {
      ok: false,
      problem: 'No game/ folder here — the player serves its games from one, so this is not it.'
    }
  }

  // Not fatal, but it is the failure that produces the most confusing output:
  // npm prints a page about a missing script rather than "run npm install".
  if (!(await exists(join(dir, 'node_modules')))) {
    return {
      ok: false,
      problem: 'The player is not installed — run npm install in it first.',
      name: manifest.name ?? null
    }
  }

  return { ok: true, problem: null, name: manifest.name ?? null }
}

/** Where a preview bundle goes inside the player. */
export function previewDir(): string {
  return join(playerDir(), 'game', PREVIEW_GAME)
}

/**
 * `npm` as this platform spells it.
 *
 * On Windows npm is a `.cmd`, which Node refuses to spawn directly — so the
 * shell runs it. The arguments are fixed and the folder travels as an option
 * rather than inside the command line, so nothing the author typed is
 * interpolated into a shell string.
 */
function npmSpawn(dir: string): ChildProcess {
  const windows = process.platform === 'win32'
  return spawn('npm', ['run', 'dev', '--', '--game', PREVIEW_GAME], {
    cwd: dir,
    shell: windows,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none' }
  })
}

const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\/?\S*/

function record(line: string): void {
  if (!running) return
  const text = line.replace(/\[[0-9;]*m/g, '').trimEnd()
  if (text.length === 0) return

  running.lines.push(text)
  if (running.lines.length > KEPT_LINES) running.lines.splice(0, running.lines.length - KEPT_LINES)

  // Vite announces its address once it is listening, which is the only way to
  // know both that it started and where it is.
  const found = URL_PATTERN.exec(text)
  if (found && !running.url) running.url = found[0].replace(/\/$/, '')

  changed()
}

/**
 * Starts the dev server if it is not already up.
 *
 * Resolves when the address is known or the process has given up, rather than
 * when it has been spawned — "started" is a thing an author can act on, and a
 * pid is not.
 */
export async function startPlayer(dir: string): Promise<PlayerStatus> {
  if (running && running.child.exitCode === null && running.exitCode === null) {
    return playerStatus()
  }

  const check = await checkPlayer(dir)
  if (!check.ok) {
    running = { child: null as unknown as ChildProcess, dir, lines: [check.problem!], url: null, exitCode: 1 }
    changed()
    return playerStatus()
  }

  const child = npmSpawn(dir)
  running = { child, dir, lines: [], url: null, exitCode: null }
  changed()

  child.stdout?.on('data', (chunk: Buffer) => String(chunk).split('\n').forEach(record))
  child.stderr?.on('data', (chunk: Buffer) => String(chunk).split('\n').forEach(record))

  child.on('error', (cause) => {
    record(`Could not run npm: ${cause.message}`)
    if (running) running.exitCode = 1
    changed()
  })

  child.on('exit', (code) => {
    if (!running) return
    running.exitCode = code ?? 0
    if (code !== 0 && code !== null) record(`The dev server stopped (exit ${code}).`)
    changed()
  })

  await waitForAddress()
  return playerStatus()
}

/** Up to half a minute for vite to say where it is. Long, and it is a cold boot. */
async function waitForAddress(): Promise<void> {
  for (let waited = 0; waited < 30_000; waited += 200) {
    if (!running) return
    if (running.url !== null || running.exitCode !== null) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/**
 * Stops the server, and everything it started.
 *
 * On Windows the child is a shell that ran npm that ran vite, and killing the
 * shell orphans the rest — which holds the port and looks, next time, like
 * "port already in use" from nowhere. `taskkill /T` takes the tree.
 */
export async function stopPlayer(): Promise<PlayerStatus> {
  const current = running
  running = null

  if (current?.child?.pid && current.child.exitCode === null) {
    await killTree(current.child.pid, current.child)
  }

  changed()
  return playerStatus()
}

/**
 * Kills the server and everything under it, and waits for it to be gone.
 *
 * Awaited rather than fired off: the first version spawned `taskkill` and
 * returned, so quitting the app raced it — and lost. The vite process outlived
 * InkCrafter, kept the port, and the next run said "port in use" about a server
 * nobody could see.
 *
 * On Windows the child is a shell that ran npm that ran vite, so killing the
 * child alone orphans the rest; `/T` takes the tree. Elsewhere the process
 * group does the same job.
 */
async function killTree(pid: number, child: ChildProcess): Promise<void> {
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
    return
  }

  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    killer.on('exit', () => resolve())
    killer.on('error', () => resolve())
    // Never hang a quit on it. A kill that has not finished in two seconds is
    // not going to.
    setTimeout(resolve, 2000)
  })
}

/** The exact page for a normal or checkpoint-backed connected-player launch. */
export function playerUrl(
  base: string,
  previewId: string | null = null,
  minigame: string | null = null
): string {
  const url = new URL(base)
  url.searchParams.set('game', PREVIEW_GAME)
  if (previewId) url.searchParams.set('preview', previewId)
  if (minigame) url.searchParams.set('minigame', minigame)
  return url.href
}

export async function openPlayer(
  previewId: string | null = null,
  minigame: string | null = null
): Promise<void> {
  const url = running?.url
  if (url) await shell.openExternal(playerUrl(url, previewId, minigame))
}

/**
 * Nothing the app started outlives it.
 *
 * The quit is held open until the tree is gone, because killing a process on
 * Windows is a spawn of its own and quitting does not wait for one. Guarded so
 * the second quit — the one this asks for — goes straight through.
 */
let quitting = false

app.on('before-quit', (event) => {
  if (quitting || !running) return
  quitting = true
  event.preventDefault()
  void stopPlayer().finally(() => app.quit())
})
