#!/usr/bin/env node
/**
 * The interchange spec, kept in step with the editor that defines it.
 *
 * The bundle format is InkCrafter's to define — it is the side that writes one
 * — so the modules below are authored there, in its pure `src/shared` layer
 * where they are covered by its test suite. They are *copied* here rather than
 * imported across the two checkouts, because this repo has to build on its own:
 * it ships as a web game, and requiring an Electron app to be sitting next to it
 * would be a strange thing to put in a build.
 *
 *   npm run spec:sync    copy the editor's spec over this one
 *   npm run spec:check   fail if the two have drifted
 *
 * `spec:check` is deliberately a no-op when the editor is not checked out
 * beside this repo. Drift is worth failing a build over; not having the editor
 * to hand is the normal state of building the game.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYER = resolve(HERE, '..')

const EDITOR = resolve(PLAYER, process.env['INKCRAFTER_DIR'] ?? '../Editor')
const FROM = join(EDITOR, 'src', 'shared')
const TO = join(PLAYER, 'src', 'bundle', 'spec')

/**
 * Paths relative to the editor's `src/shared`, mirrored exactly under
 * `src/bundle/spec`. The layout is preserved rather than flattened so the
 * relative imports inside these files keep resolving without being rewritten.
 */
const FILES = [
  'ids.ts',
  'mediaDoc.ts',
  // mediaDoc stamps its assets through this; the player never sorts by it,
  // but the module has to be here for the vendored copy to compile.
  'modified.ts',
  'mediaTag.ts',
  'bundle/manifest.ts',
  'bundle/protection.ts',
  'bundle/preview.ts',
  'bundle/tagSpec.ts',
  'bundle/npcDoc.ts',
  'bundle/catalogue.ts',
  'bundle/condition.ts',
  'bundle/mapDoc.ts',
  'bundle/galleryDoc.ts',
  'bundle/gameDoc.ts',
  'bundle/achievementDoc.ts',
  'bundle/minigameDoc.ts',
  'bundle/estate.ts'
]

const BANNER = `// Vendored from InkCrafter/src/shared — do not edit.
// Change it there, then run \`npm run spec:sync\`. See scripts/sync-spec.mjs.

`

const check = process.argv.includes('--check')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

if (!(await exists(FROM))) {
  const message = `InkCrafter not found at ${EDITOR} — skipping spec ${check ? 'check' : 'sync'}.`
  if (check) {
    console.log(message)
    process.exit(0)
  }
  console.error(`${message}\nSet INKCRAFTER_DIR to point at it.`)
  process.exit(1)
}

const drifted = []

for (const file of FILES) {
  const source = await readFile(join(FROM, file), 'utf8')
  const target = join(TO, file)
  const wanted = BANNER + source

  if (check) {
    const current = (await exists(target)) ? await readFile(target, 'utf8') : null
    if (current !== wanted) drifted.push(file)
    continue
  }

  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, wanted, 'utf8')
  console.log(`synced ${file}`)
}

if (check && drifted.length > 0) {
  console.error(
    `The vendored spec has drifted from ${FROM}:\n` +
      drifted.map((file) => `  ${file}`).join('\n') +
      '\n\nRun `npm run spec:sync` and commit the result.'
  )
  process.exit(1)
}

if (check) console.log(`spec is in step with ${FROM}`)
