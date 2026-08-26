import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileStory } from './compiler'

/**
 * `INCLUDE chapter1` instead of `INCLUDE chapter1.ink` is an easy thing to
 * write and produces four lines of ENOENT that say what could not be opened
 * and nothing about why. The assistant wrote exactly this into a real project.
 */

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-include-'))
  await mkdir(join(root, 'ink', 'chapters'), { recursive: true })
  await writeFile(
    join(root, 'ink', 'chapter1.ink'),
    '=== chapter1 ===\nThe portal spat him out.\n-> END\n',
    'utf8'
  )
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function entry(contents: string): Promise<string> {
  const path = join(root, 'ink', 'main.ink')
  await writeFile(path, contents, 'utf8')
  return path
}

const errorsOf = (filePath: string): string[] =>
  compileStory({ filePath })
    .diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => diagnostic.message)

describe('a missing INCLUDE', () => {
  it('says the extension is missing when the file is right there', async () => {
    const path = await entry('INCLUDE chapter1\n\n-> chapter1\n')
    const errors = errorsOf(path)

    expect(errors.join('\n')).toMatch(/'chapter1\.ink' is beside it/)
    expect(errors.join('\n')).toMatch(/needs the whole filename/)
  })

  /**
   * Deliberately not repaired by falling back to `${name}.ink`. inklecate
   * resolves the name literally too, so accepting it would compile a story here
   * that fails everywhere else — and the ink being portable is the point.
   */
  it('still refuses to compile it', async () => {
    const path = await entry('INCLUDE chapter1\n\n-> chapter1\n')
    expect(compileStory({ filePath: path }).story).toBeNull()
  })

  it('compiles once the extension is there', async () => {
    const path = await entry('INCLUDE chapter1.ink\n\n-> chapter1\n')

    expect(errorsOf(path)).toEqual([])
    expect(compileStory({ filePath: path }).story).not.toBeNull()
  })

  it('leaves an ordinary missing file to report itself', async () => {
    // Nothing to suggest: there is no `nowhere.ink` either.
    const path = await entry('INCLUDE nowhere\n\n-> END\n')

    expect(errorsOf(path).join('\n')).toMatch(/ENOENT|no such file/i)
    expect(errorsOf(path).join('\n')).not.toMatch(/right beside it/)
  })

  it('says nothing extra when the name already ends in .ink', async () => {
    const path = await entry('INCLUDE gone.ink\n\n-> END\n')
    expect(errorsOf(path).join('\n')).not.toMatch(/right beside it/)
  })

  it('works for a file in a subfolder', async () => {
    await writeFile(
      join(root, 'ink', 'chapters', 'arrival.ink'),
      '=== arrival ===\nShe lands.\n-> END\n',
      'utf8'
    )
    const path = await entry('INCLUDE chapters/arrival\n\n-> arrival\n')

    expect(errorsOf(path).join('\n')).toMatch(/'chapters\/arrival\.ink' is beside it/)
  })
})
