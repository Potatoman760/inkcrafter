// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newEntry, type CodexEntry } from '@shared/codex'
import type { CodexLibrary } from '@shared/project'
import { CodexPanel } from './CodexPanel'

const library: CodexLibrary = {
  id: 'lib_0000000000',
  title: 'Archive world',
  description: '',
  path: '/p/codex/archive-world',
  entryCount: 2
}

function entry(name: string, id: string, overrides: Partial<CodexEntry> = {}): CodexEntry {
  return { ...newEntry(library.id, name, 'character', name.toLowerCase()), id, ...overrides }
}

const wren = entry('Wren', 'cdx_0000000001')
const archive = entry('The Archive', 'cdx_0000000002', { type: 'location' })

function panel(
  overrides: Partial<Parameters<typeof CodexPanel>[0]> = {}
): { onSelect: ReturnType<typeof vi.fn>; onEdit: ReturnType<typeof vi.fn> } {
  const onSelect = vi.fn()
  const onEdit = vi.fn()

  render(
    <CodexPanel
      entries={[wren, archive]}
      linkedLibraries={[library]}
      conflicts={[]}
      mentionCounts={{ [wren.id]: 4 }}
      selectedId={null}
      loading={false}
      error={null}
      onSelect={onSelect}
      onEdit={onEdit}
      onCreate={vi.fn()}
      onOpenSettings={vi.fn()}
      {...overrides}
    />
  )

  return { onSelect, onEdit }
}

describe('CodexPanel', () => {
  it('groups entries by type and shows their mention counts', () => {
    panel()

    // Queried as headings: the new-entry type picker also lists these names.
    expect(screen.getByRole('heading', { name: 'Characters' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Locations' })).toBeInTheDocument()
    expect(screen.getByTitle('4 mentions in this file')).toHaveTextContent('4')
    expect(screen.getByTitle('0 mentions in this file')).toHaveTextContent('0')
  })

  it('selects on a single click and opens the editor on a double click', async () => {
    const { onSelect, onEdit } = panel()

    await userEvent.click(screen.getByText('Wren'))
    expect(onSelect).toHaveBeenCalledWith(wren.id)
    expect(onEdit).not.toHaveBeenCalled()

    await userEvent.dblClick(screen.getByText('Wren'))
    expect(onEdit).toHaveBeenCalledWith(wren.id)
  })

  it('filters by name, alias, tag and file', async () => {
    const tagged = entry('Lantern', 'cdx_0000000003', { tags: ['prop'], aliases: ['the lamp'] })
    panel({ entries: [wren, archive, tagged] })

    const filter = screen.getByPlaceholderText('Filter…')
    await userEvent.type(filter, 'lamp')
    expect(screen.getByText('Lantern')).toBeInTheDocument()
    expect(screen.queryByText('Wren')).not.toBeInTheDocument()

    await userEvent.clear(filter)
    await userEvent.type(filter, 'prop')
    expect(screen.getByText('Lantern')).toBeInTheDocument()
  })

  it('warns when two entries answer to the same name, rather than picking one', () => {
    panel({ conflicts: [{ term: 'Wren', entryIds: [wren.id, 'cdx_0000000009'] }] })

    expect(screen.getByText(/claimed by more than one entry/)).toBeInTheDocument()
    expect(screen.getByTitle(/claimed by another entry/)).toBeInTheDocument()
  })

  it('explains itself when the project links no libraries', () => {
    panel({ linkedLibraries: [] })

    expect(screen.getByText(/links no codex libraries yet/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('New entry…')).not.toBeInTheDocument()
  })

  /**
   * The selected entry reads here rather than in a tab of its own on the right.
   * That tab was what left the dock no room for the assistant, and the codex
   * already owns this column — so nothing was lost, it only moved.
   */
  describe('the selected entry', () => {
    it('reads in place, under the row it belongs to', () => {
      panel({
        selectedId: wren.id,
        entries: [{ ...wren, aliases: ['The Archivist'], tags: ['archive', 'staff'] }, archive]
      })

      expect(screen.getByText('The Archivist')).toBeInTheDocument()
      expect(screen.getByText('archive, staff')).toBeInTheDocument()
    })

    it('says how often it is named in the open file', () => {
      panel({ selectedId: wren.id })
      expect(screen.getByText(/4 mentions in the open file/)).toBeInTheDocument()
    })

    /**
     * The names, not the prose. This is a narrow column beside a list you are
     * still using: a character's description belongs in the editor, where there
     * is room to read it, rather than pushing the rest of the list off the
     * bottom of the sidebar.
     */
    it('leaves the description and the details to the editor', () => {
      panel({
        selectedId: wren.id,
        entries: [
          {
            ...wren,
            description: 'A lamp-keeper who has stopped keeping the lamp.',
            details: [{ label: 'Voice', value: 'Dry and unhurried.', ai: 'detected' }]
          },
          archive
        ]
      })

      expect(
        screen.queryByText('A lamp-keeper who has stopped keeping the lamp.')
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Dry and unhurried.')).not.toBeInTheDocument()
    })

    it('shows nothing at all until something is selected', () => {
      panel({ entries: [{ ...wren, aliases: ['The Archivist'] }, archive] })
      expect(screen.queryByText('The Archivist')).not.toBeInTheDocument()
    })

    it('shows one at a time', () => {
      panel({
        selectedId: archive.id,
        entries: [
          { ...wren, aliases: ['The Archivist'] },
          { ...archive, aliases: ['The Stacks'] }
        ]
      })

      expect(screen.getByText('The Stacks')).toBeInTheDocument()
      expect(screen.queryByText('The Archivist')).not.toBeInTheDocument()
    })

    // Editing is still the dialog it was, so there is exactly one place an
    // entry can be changed and no question about which copy is current.
    it('opens the editor from the summary', async () => {
      const { onEdit } = panel({ selectedId: wren.id })

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

      expect(onEdit).toHaveBeenCalledWith(wren.id)
    })
  })
})
