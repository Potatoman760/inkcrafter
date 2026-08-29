import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Whether a folder is the player.
 *
 * Checked rather than trusted because the two things that actually happen —
 * pointing at the wrong folder, and pointing at the right one that was never
 * installed — both surface as a page of npm output otherwise, and neither says
 * what to do about it.
 *
 * The spawning itself is not tested here: it is `npm run dev`, and a test that
 * ran it would be testing vite.
 */

vi.mock('electron', () => ({
  // The editor package, as `app.getAppPath()` reports it in development. The
  // player is derived from it as a sibling rather than configured.
  app: { on: () => {}, getPath: () => '', getAppPath: () => join('/repo', 'Editor') },
  shell: { openExternal: async () => {} }
}))

const { checkPlayer, playerDir, playerUrl, previewDir, PREVIEW_GAME } = await import('./player')

let root = ''

async function player(
  over: { name?: string; scripts?: Record<string, string>; game?: boolean; installed?: boolean } = {}
): Promise<string> {
  const dir = join(root, 'player')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: over.name ?? 'inkcrafter-player',
      scripts: over.scripts ?? { dev: 'node scripts/play.mjs dev' }
    }),
    'utf8'
  )
  if (over.game !== false) await mkdir(join(dir, 'game'), { recursive: true })
  if (over.installed !== false) await mkdir(join(dir, 'node_modules'), { recursive: true })
  return dir
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-player-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('checkPlayer', () => {
  it('accepts a player checkout, and says what it found', async () => {
    const check = await checkPlayer(await player())

    expect(check.ok).toBe(true)
    expect(check.problem).toBeNull()
    expect(check.name).toBe('inkcrafter-player')
  })

  it('says so when nothing has been chosen', async () => {
    expect(await checkPlayer('')).toMatchObject({ ok: false })
  })

  it('says so when the folder is not there', async () => {
    const check = await checkPlayer(join(root, 'nowhere'))
    expect(check.ok).toBe(false)
    expect(check.problem).toMatch(/not a folder/)
  })

  it('says so when it is some other project', async () => {
    await mkdir(join(root, 'elsewhere'), { recursive: true })
    const check = await checkPlayer(join(root, 'elsewhere'))

    expect(check.ok).toBe(false)
    expect(check.problem).toMatch(/not the player/)
  })

  it('says so when the package has no dev script', async () => {
    const check = await checkPlayer(await player({ name: 'something-else', scripts: {} }))

    expect(check.ok).toBe(false)
    expect(check.problem).toMatch(/no "dev" script/)
  })

  it('says so when there is no game folder to serve from', async () => {
    const check = await checkPlayer(await player({ game: false }))

    expect(check.ok).toBe(false)
    expect(check.problem).toMatch(/No game\/ folder/)
  })

  // The failure that produces the most confusing output: npm prints a page
  // about a missing script rather than "run npm install".
  it('says to install it rather than letting npm explain', async () => {
    const check = await checkPlayer(await player({ installed: false }))

    expect(check.ok).toBe(false)
    expect(check.problem).toMatch(/npm install/)
  })
})

// The two packages of one repository, so the player is where the editor is not
// — this used to be a folder the author picked in Settings.
describe('playerDir', () => {
  it('is the editor package’s sibling', () => {
    expect(playerDir()).toBe(resolve('/repo', 'Player'))
  })
})

describe('previewDir', () => {
  it('is one game inside the player’s static root', () => {
    // The player serves game/<id>/ at /<id>/ and finds it with ?game=<id>, so
    // the preview is a game like any other rather than a special case.
    expect(previewDir()).toBe(join(resolve('/repo', 'Player'), 'game', PREVIEW_GAME))
  })
})

describe('playerUrl', () => {
  it('opens the exact checkpoint and safely encodes its id', () => {
    expect(playerUrl('http://localhost:5173', 'one two')).toBe(
      'http://localhost:5173/?game=preview&preview=one+two'
    )
  })

  it('keeps an ordinary player launch out of preview mode', () => {
    expect(playerUrl('http://localhost:5173/', null)).toBe(
      'http://localhost:5173/?game=preview'
    )
  })
})
