// Turn Piri's name for Kael into a word the reader chooses.
//
// Editor mode has no write_variables, so this does what that tool would: mints
// the id, declares the variable, and regenerates ink/state.ink. Idempotent.
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('data/projects/breedhaven')
const compiled = await build({
  stdin: {
    contents: [
      "export { newVariable, addVariable } from './src/shared/statsDoc';",
      "export { renderStateInk } from './src/shared/statsInk';"
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const lib = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

const changes = []
let stats = JSON.parse(readFileSync(resolve(root, 'stats.json'), 'utf8'))
const npcs = JSON.parse(readFileSync(resolve(root, 'npcs.json'), 'utf8'))

const NAME = 'piri_word'
if (!stats.variables.some((one) => one.name === NAME)) {
  stats = lib.addVariable(stats, {
    ...lib.newVariable('Piri word', 'text'),
    name: NAME,
    initial: 'Daddy',
    description:
      "What Piri calls Kael. Offered to the reader by a # word: tag the first time she says it, and used exactly as they type it — so it is written where a capitalised word reads naturally."
  })
  changes.push(`variable ${NAME}`)
  writeFileSync(resolve(root, 'stats.json'), JSON.stringify(stats, null, 2) + '\n')
  writeFileSync(resolve(root, 'ink/state.ink'), lib.renderStateInk(stats, npcs))
  changes.push('state.ink')
}

// --- the scene itself --------------------------------------------------------
const file = resolve(root, 'chapter4/whispering-woods.ink')
const source = readFileSync(file, 'utf8')
const lines = source.split(/\r?\n/)
const TAG = `# word: ${NAME} What Piri calls Kael`
let tagged = source.includes(TAG)
let replaced = 0

const next = lines.map((line) => {
  // Author notes keep the plain word: they explain the roleplay to whoever
  // reads the file, and are never shown to anybody.
  if (line.trimStart().startsWith('//')) return line
  if (!/daddy/i.test(line)) return line

  const swapped = line.replace(/\bDaddy\b/g, `{${NAME}}`).replace(/\bdaddy\b/g, `{${NAME}}`)
  if (swapped !== line) replaced += 1

  // The tag rides the line where the word is first heard, so the reader sees
  // it used before being asked whether to keep it.
  if (!tagged) {
    tagged = true
    return `${swapped} ${TAG}`
  }
  return swapped
})

if (replaced > 0) {
  writeFileSync(file, next.join('\n'))
  changes.push(`${replaced} line(s) in whispering-woods.ink`)
}

console.log(changes.length ? 'Changed: ' + changes.join(', ') : 'Nothing to change.')
