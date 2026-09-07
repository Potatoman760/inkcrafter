#!/usr/bin/env node
/**
 * Runs the bundle exporter outside Electron.
 *
 * There is no TypeScript runner in this project's dependencies and adding one
 * for a single script would be a poor trade, so esbuild — already here behind
 * Vite — bundles the exporter to an ESM file and node runs it. The `@shared`
 * alias is spelled out because esbuild does not read tsconfig paths when
 * invoked this way.
 *
 * Built inside `node_modules/` rather than a temp directory: the bundle leaves
 * `inkjs` and `yaml` for node to resolve, and node resolves them relative to
 * the importing file, which therefore has to sit inside this project.
 *
 *   npm run export -- --project data/projects/x --out ../game/public/bundle
 */

import { build } from 'esbuild'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratch = join(ROOT, 'node_modules', '.inkcrafter-export')
const entry = join(scratch, 'export.mjs')

try {
  await mkdir(scratch, { recursive: true })

  await build({
    entryPoints: [join(ROOT, 'src', 'main', 'cli', 'export.ts')],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // Left for node to resolve: bundling them buys nothing, and inkjs is large.
    // The two behind the desktop export as well: one carries a native
    // binding, and neither gains anything from being inlined.
    external: ['inkjs', 'yaml', 'electron', '@electron/get', '@electron-internal/extract-zip'],
    alias: { '@shared': join(ROOT, 'src', 'shared') },
    logLevel: 'warning'
  })

  const { run } = await import(pathToFileURL(entry).href)
  process.exitCode = await run(process.argv.slice(2))
} finally {
  await rm(scratch, { recursive: true, force: true })
}
