#!/usr/bin/env node
/**
 * Run vite against one of the games in `game/`.
 *
 * The player already accepts `?game=<id>` at runtime and `VITE_GAME` at build
 * time, but neither is convenient from an npm script: a query string has to be
 * typed into the browser after the fact, and `VITE_GAME=x npm run dev` is a
 * bourne-shell idiom that does nothing in PowerShell — which is where this
 * repo is developed. This wrapper takes the game as an ordinary argument and
 * sets up whichever mechanism the command in question actually reads.
 *
 *   npm run dev -- --game breedhaven     dev server, that game
 *   npm run dev -- breedhaven            the same; a bare id also works
 *   npm run build -- --game breedhaven   bake it in as the built player's default
 *   npm run preview -- --game breedhaven serve dist/ and open it on that game
 *   npm run games                        list what is in game/
 *
 * With no game named, the player falls back to `GAME.default` in
 * `src/config/gameConfig.ts` exactly as before, so the bare commands are
 * unchanged. Anything this does not recognise is passed through to vite, so
 * `npm run dev -- breedhaven --port 5000 --host` works.
 *
 * `dev` and `build` get `VITE_GAME`, which `gameBaseUrl()` reads through
 * `import.meta.env`. `preview` cannot: it serves an already-built player, in
 * which that value is long since baked, so the game is selected the only way
 * still open at that point — the `?game=` the browser is opened on.
 */

import { access, readdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const GAMES = join(ROOT, 'game')
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

/** `game/` is the static root, and vite writes the engine's own JS here. */
const RESERVED = new Set(['assets'])

/** The same shape `loadBundle.gameId` accepts: one folder, and no way out of it. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const [command, ...argv] = process.argv.slice(2)

if (!command || command === 'list') {
  await list()
  process.exit(0)
}

const { game, rest } = await parse(argv)
if (game) await requireGame(game)

const env = { ...process.env }
if (game && command !== 'preview') env['VITE_GAME'] = game

// A finished build has its default baked in; the query string is all that is
// left to override it with, and vite's own --open is what puts it in the URL.
const args = [command, ...rest]
if (game && command === 'preview' && !rest.some((arg) => arg.startsWith('--open'))) {
  args.push(`--open=/?game=${game}`)
}

if (!(await exists(VITE))) {
  console.error(`vite is not installed at ${VITE} — run \`npm install\`.`)
  process.exit(1)
}

const child = spawn(process.execPath, [VITE, ...args], { stdio: 'inherit', cwd: ROOT, env })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})

/**
 * `--game <id>`, `--game=<id>`, `-g <id>`, or a bare leading id.
 *
 * The bare form is only taken when it names a folder that is really there:
 * vite's own commands take a root as their first positional, so an argument
 * that is not a game has to keep meaning what vite thinks it means.
 */
async function parse(args) {
  const rest = []
  let game = null

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '--game' || arg === '-g') {
      game = args[i + 1] ?? null
      i += 1
      continue
    }
    if (arg.startsWith('--game=')) {
      game = arg.slice('--game='.length)
      continue
    }
    if (game === null && rest.length === 0 && !arg.startsWith('-') && (await isGame(arg))) {
      game = arg
      continue
    }
    rest.push(arg)
  }

  if (game !== null && !ID.test(game)) {
    console.error(
      `"${game}" is not a game id — one folder under game/, no slashes.\n` +
        'A bundle served from somewhere else is played with ?bundle=<url> instead.'
    )
    process.exit(1)
  }

  return { game, rest }
}

/** A game is a folder under `game/` with a manifest in it; the rest follows. */
async function isGame(name) {
  return ID.test(name) && (await exists(join(GAMES, name, 'manifest.json')))
}

async function requireGame(name) {
  if (await isGame(name)) return

  const playable = (await folders()).filter((it) => it.ok)
  const known = playable.length > 0 ? playable.map((it) => `  ${it.name}`).join('\n') : '  (none)'
  console.error(
    `No game "${name}" in game/ — nothing at game/${name}/manifest.json.\n\n` +
      `Games here:\n${known}\n\n` +
      'Export one from InkCrafter with `npm run export -- --project <dir> --out ' +
      `../InkCrafterPlayer/game/${name}\`.`
  )
  process.exit(1)
}

/**
 * Every folder under `game/`, playable or not.
 *
 * A half-finished export is worth showing rather than hiding: an export that
 * died before writing its manifest looks exactly like a game that is not there
 * at all, and the difference is the whole diagnosis.
 */
async function folders() {
  const entries = await readdir(GAMES, { withFileTypes: true }).catch(() => [])
  const names = entries
    .filter((entry) => entry.isDirectory() && !RESERVED.has(entry.name))
    .map((entry) => entry.name)
    .sort()

  const out = []
  for (const name of names) out.push({ name, ok: await isGame(name) })
  return out
}

async function list() {
  const all = await folders()
  if (all.length === 0) {
    console.log('No games in game/. Export one from InkCrafter into game/<id>/.')
    return
  }

  const fallback = await defaultGame()
  for (const { name, ok } of all) {
    const marks = []
    if (name === fallback) marks.push('default')
    if (!ok) marks.push('no manifest.json')
    console.log(`  ${name}${marks.length > 0 ? `  (${marks.join(', ')})` : ''}`)
  }
  console.log('\nPlay one with `npm run dev -- --game <id>`.')
}

/**
 * The fallback game, read out of the config that owns it.
 *
 * Only ever used to annotate the listing, so if the shape of that file changes
 * this stops marking a default rather than reporting a wrong one. The engine's
 * actual fallback is `GAME.default` and nothing here participates in choosing
 * it.
 */
async function defaultGame() {
  const config = join(ROOT, 'src', 'config', 'gameConfig.ts')
  const source = await readFile(config, 'utf8').catch(() => null)
  return source?.match(/default:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
