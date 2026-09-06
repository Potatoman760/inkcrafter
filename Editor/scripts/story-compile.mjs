// Compile the whole of Breedhaven with the real compiler and list what it rejects.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { Compiler } from 'inkjs/full'
const main = resolve('data/projects/breedhaven/ink/main.ink')
const errors = [], warnings = []
const compiler = new Compiler(readFileSync(main, 'utf8'), {
  sourceFilename: main, countAllVisits: true,
  fileHandler: { ResolveInkFilename: (name) => resolve(dirname(main), name), LoadInkFileContents: (name) => readFileSync(name, 'utf8') },
  errorHandler: (message, severity) => { (severity === 2 ? errors : warnings).push(message) }
})
const story = compiler.Compile()
console.log(story ? 'COMPILED' : 'FAILED')
for (const e of errors) console.log('ERROR ' + e)
for (const w of warnings.filter((w) => /villa|tamsin|isolde|shared_court|shared_bond/.test(w))) console.log('WARN ' + w)
