import { describe, expect, it } from 'vitest'
import { newEntry } from '@shared/codex'
import { parseEntry, serialiseEntry } from './markdown'

describe('codex appearance', () => {
  it('round-trips an explicit appearance field', () => {
    const entry = {
      ...newEntry('lib_0000000000', 'Wren', 'character', 'characters/wren'),
      id: 'cdx_0000000000',
      appearance: 'Amber eyes, silver hair, and a weathered blue coat.'
    }

    const written = serialiseEntry(entry)
    const parsed = parseEntry(entry.libraryId, entry.file, written).entry

    expect(written).toContain('appearance: Amber eyes, silver hair, and a weathered blue coat.')
    expect(parsed.appearance).toBe(entry.appearance)
  })

  it('loads older entries without appearance as empty', () => {
    const parsed = parseEntry(
      'lib_0000000000',
      'characters/wren',
      '---\nid: cdx_0000000000\nname: Wren\ntype: character\n---\n\nKeeper of the light.'
    ).entry

    expect(parsed.appearance).toBe('')
  })
})
