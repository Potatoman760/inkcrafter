import { describe, expect, it } from 'vitest'
import { isAbsolute, join, sep } from 'node:path'
import {
  assertWritableExtension,
  resolveInWorkspace,
  workspaceRelative,
  WorkspacePathError
} from './workspacePath'

const ROOT = join(sep === '\\' ? 'C:\\w' : '/w', 'data')

/**
 * The model names the file; this decides whether the name is allowed to become
 * one. Everything below is a string a remote service could return, so the tests
 * are written as attacks rather than as typos.
 */
describe('resolveInWorkspace', () => {
  it('resolves an ordinary path inside the workspace', () => {
    const resolved = resolveInWorkspace(ROOT, 'projects/the-lighthouse/ink/main.ink')
    expect(resolved).toBe(join(ROOT, 'projects', 'the-lighthouse', 'ink', 'main.ink'))
    expect(isAbsolute(resolved)).toBe(true)
  })

  it('accepts the punctuation filenames actually use', () => {
    expect(() => resolveInWorkspace(ROOT, 'projects/a-b_c/the dark hour.ink')).not.toThrow()
    expect(() => resolveInWorkspace(ROOT, 'codex/world/characters/mara.md')).not.toThrow()
  })

  it('ignores empty segments from a doubled slash', () => {
    expect(resolveInWorkspace(ROOT, 'projects//main.ink')).toBe(join(ROOT, 'projects', 'main.ink'))
  })

  describe('refuses anything that could leave the workspace', () => {
    const attacks: [string, string][] = [
      ['..', 'the parent directory'],
      ['../secrets.md', 'a relative climb'],
      ['projects/../../secrets.md', 'a climb in the middle'],
      ['projects/./main.ink', 'a dot segment'],
      ['/etc/passwd', 'an absolute posix path'],
      ['C:/Windows/system32/config.md', 'a Windows drive'],
      ['C:secrets.md', 'a drive-relative path'],
      ['\\\\server\\share\\x.md', 'a UNC share'],
      ['projects\\..\\..\\x.md', 'backslash separators'],
      ['projects/main.ink\0.png', 'a null byte'],
      ['~/secrets.md', 'a home shortcut'],
      ['.ssh/id_rsa', 'a leading dot'],
      ['projects/.git/config', 'a dot directory'],
      ['projects/main.ink:stream', 'an alternate data stream'],
      ['', 'nothing at all'],
      ['   ', 'whitespace'],
      ['%2e%2e/secrets.md', 'a percent-encoded climb']
    ]

    for (const [path, why] of attacks) {
      it(`refuses ${why}: ${JSON.stringify(path)}`, () => {
        expect(() => resolveInWorkspace(ROOT, path)).toThrow(WorkspacePathError)
      })
    }
  })

  it('refuses a path nested absurdly deep', () => {
    const deep = Array.from({ length: 20 }, (_, index) => `d${index}`).join('/')
    expect(() => resolveInWorkspace(ROOT, `${deep}/x.ink`)).toThrow(/nested too deeply/)
  })

  it('refuses a single name long enough to be an attack on the filesystem', () => {
    expect(() => resolveInWorkspace(ROOT, `${'a'.repeat(200)}.ink`)).toThrow(/too long/)
  })

  it('explains itself, since the model reads the refusal and tries again', () => {
    expect(() => resolveInWorkspace(ROOT, '../x.md')).toThrow(/leave the workspace/)
    expect(() => resolveInWorkspace(ROOT, 'a\\b.md')).toThrow(/not a backslash/)
  })
})

describe('workspaceRelative', () => {
  it('round-trips a resolved path back to / separators', () => {
    const path = 'projects/the-lighthouse/ink/main.ink'
    expect(workspaceRelative(ROOT, resolveInWorkspace(ROOT, path))).toBe(path)
  })
})

describe('assertWritableExtension', () => {
  for (const path of ['a/b.ink', 'a/b.md', 'a/b.json', 'a/b.txt', 'a/B.INK']) {
    it(`allows ${path}`, () => {
      expect(() => assertWritableExtension(path)).not.toThrow()
    })
  }

  for (const path of ['a/b.js', 'a/b.exe', 'a/b.sh', 'a/b.html', 'a/b']) {
    it(`refuses ${path}`, () => {
      expect(() => assertWritableExtension(path)).toThrow(WorkspacePathError)
    })
  }
})
