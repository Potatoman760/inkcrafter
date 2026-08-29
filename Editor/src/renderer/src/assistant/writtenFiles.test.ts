import { describe, expect, it } from 'vitest'
import { wroteOpenProjectFile } from './writtenFiles'

describe('wroteOpenProjectFile', () => {
  it('matches the assistant workspace path to the open project-relative file', () => {
    expect(
      wroteOpenProjectFile(
        ['projects/breedhaven/ink/chapter1.ink'],
        'C:\\work\\data\\projects\\breedhaven',
        'ink/chapter1.ink'
      )
    ).toBe(true)
  })

  it('does not confuse the same chapter in another project', () => {
    expect(
      wroteOpenProjectFile(
        ['projects/another-story/ink/chapter1.ink'],
        '/work/data/projects/breedhaven',
        'ink/chapter1.ink'
      )
    ).toBe(false)
  })

  it('accepts a project-relative result from a narrower writer', () => {
    expect(
      wroteOpenProjectFile(['ink/chapter1.ink'], '/work/projects/breedhaven', 'ink/chapter1.ink')
    ).toBe(true)
  })

  it('matches a generated state file reported by a catalogue save', () => {
    expect(
      wroteOpenProjectFile(
        ['stats.json', 'ink/state.ink', 'export/catalogue.json'],
        'C:\\work\\data\\projects\\breedhaven',
        'ink/state.ink'
      )
    ).toBe(true)
  })
})
