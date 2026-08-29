import { describe, expect, it } from 'vitest'
import { canApplyGuardedEdit, type GuardedTextEdit } from './guardedEdit'

const SOURCE = '# bg:old\nA paragraph.\n'

function replacement(): GuardedTextEdit {
  return {
    from: 2,
    to: 8,
    insert: 'bg:slimegirl/missionary',
    nonce: 1,
    source: SOURCE,
    filePath: 'ink/chapter1.ink'
  }
}

describe('canApplyGuardedEdit', () => {
  it('accepts the document and file the range was calculated from', () => {
    expect(canApplyGuardedEdit(replacement(), SOURCE, 'ink/chapter1.ink')).toBe(true)
  })

  it('refuses to replay an edit after its first application changed the document', () => {
    const edit = replacement()
    const changed = SOURCE.slice(0, edit.from) + edit.insert + SOURCE.slice(edit.to)

    expect(canApplyGuardedEdit(edit, changed, 'ink/chapter1.ink')).toBe(false)
  })

  it('refuses a stale range even when the new file happens to have identical text', () => {
    expect(canApplyGuardedEdit(replacement(), SOURCE, 'ink/chapter2.ink')).toBe(false)
  })

  it('refuses invalid and reversed ranges', () => {
    expect(
      canApplyGuardedEdit(
        { ...replacement(), from: SOURCE.length + 1, to: SOURCE.length + 1 },
        SOURCE,
        'ink/chapter1.ink'
      )
    ).toBe(false)
    expect(
      canApplyGuardedEdit({ ...replacement(), from: 8, to: 2 }, SOURCE, 'ink/chapter1.ink')
    ).toBe(false)
  })
})
