// Run the export's own preflight over Breedhaven from the command line.
import { build } from 'esbuild'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const root = resolve('data/projects/breedhaven')
const compiled = await build({
  stdin: {
    contents: [
      "export { preflight } from './src/shared/bundle/preflight';",
      "export { parseMedia } from './src/shared/mediaDoc';",
      "export { parseStats } from './src/shared/statsDoc';",
      "export { parseNpcs } from './src/shared/bundle/npcDoc';",
      "export { parseMap } from './src/shared/bundle/mapDoc';",
      "export { parseGallery } from './src/shared/bundle/galleryDoc';",
      "export { parseGame } from './src/shared/bundle/gameDoc';",
      "export { parseMinigames } from './src/shared/bundle/minigameDoc';"
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts'
  },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const lib = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const text = (name) => readFileSync(resolve(root, name), 'utf8')
const sources = new Map()
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) { if (entry !== 'media' && entry !== 'node_modules') walk(path) }
    else if (entry.endsWith('.ink')) sources.set(relative(root, path).split(sep).join('/'), readFileSync(path, 'utf8'))
  }
}
walk(root)
const problems = lib.preflight({
  sources,
  media: lib.parseMedia(text('media.json')),
  stats: lib.parseStats(text('stats.json')),
  npcs: lib.parseNpcs(text('npcs.json')),
  map: lib.parseMap(text('map.json')),
  gallery: lib.parseGallery(text('gallery.json')),
  minigames: lib.parseMinigames(text('minigames.json')),
  game: lib.parseGame(text('game.json'))
})
const only = process.argv.includes('--villa')
const shown = only ? problems.filter((p) => /villa|tamsin|isolde|consort/i.test(JSON.stringify(p))) : problems
for (const p of shown) console.log(JSON.stringify(p))
console.log(`${problems.length} preflight problem(s) in all${only ? `, ${shown.length} villa-related shown` : ''}.`)
