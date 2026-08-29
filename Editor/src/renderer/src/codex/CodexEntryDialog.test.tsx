// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newEntry, type CodexEntry } from '@shared/codex'
import { installApi } from '../../../test/harness'
import { CodexEntryDialog } from './CodexEntryDialog'

function entry(overrides: Partial<CodexEntry> = {}): CodexEntry {
  return {
    ...newEntry('lib_0000000000', 'Wren', 'character', 'characters/wren'),
    id: 'cdx_0000000000',
    aliases: ['The Archivist'],
    description: 'She has kept the archive for thirty years.',
    ...overrides
  }
}

function dialog(overrides: Partial<Parameters<typeof CodexEntryDialog>[0]> = {}): {
  onSave: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
  onMove: ReturnType<typeof vi.fn>
  subject: CodexEntry
} {
  installApi()
  const onSave = vi.fn(async () => null)
  const onClose = vi.fn()
  const onDelete = vi.fn(async () => undefined)
  const onMove = vi.fn()
  const subject = (overrides.entry as CodexEntry | undefined) ?? entry()

  render(
    <CodexEntryDialog
      entry={subject}
      entries={[subject]}
      libraryTitle="Archive world"
      mentionCount={3}
      onSave={onSave}
      onDelete={onDelete}
      onMove={onMove}
      onClose={onClose}
      {...overrides}
    />
  )

  return { onSave, onClose, onDelete, onMove, subject }
}

const nameField = (): HTMLInputElement => screen.getByDisplayValue('Wren') as HTMLInputElement

describe('CodexEntryDialog', () => {
  it('shows the entry with its fields ready to edit', () => {
    dialog({ entry: entry({ appearance: 'Tall, silver-haired, with a weathered blue coat.' }) })

    expect(screen.getByRole('dialog', { name: /Wren/ })).toBeInTheDocument()
    expect(nameField()).toBeInTheDocument()
    expect(screen.getByDisplayValue('The Archivist')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('She has kept the archive for thirty years.')
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Appearance/ })).toHaveValue(
      'Tall, silver-haired, with a weathered blue coat.'
    )
    expect(screen.getByText(/Archive world/)).toBeInTheDocument()
  })

  it('shows the entry type without allowing it to be changed', () => {
    dialog()

    expect(screen.getByLabelText('Entry type')).toHaveTextContent('Characters')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows appearance only for character entries', () => {
    dialog({ entry: entry({ type: 'location', appearance: 'A slate tower.' }) })
    expect(screen.queryByRole('textbox', { name: /Appearance/ })).not.toBeInTheDocument()
  })

  it('reaches every field group', async () => {
    dialog()

    await userEvent.click(screen.getByRole('tab', { name: 'Relations' }))
    expect(screen.getByText(/Related entries are pulled in/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Tracking' }))
    expect(screen.getByText(/Track this entry by name and aliases/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    // By the field rather than by its small print: the explanation lives behind
    // an info mark now, and a tab test should not fail because the writing was
    // reworded.
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeInTheDocument()
  })

  it('has nothing to save until something changes', () => {
    dialog()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('holds edits as a draft and writes them on Save', async () => {
    const { onSave, onClose } = dialog()

    const field = nameField()
    await userEvent.clear(field)
    await userEvent.type(field, 'Corvid')

    // Nothing is written while typing — this is the one surface in the app that
    // does not autosave.
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ id: 'cdx_0000000000', name: 'Corvid' })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the description focused after deleting selected text', async () => {
    dialog()
    const description = screen.getByRole('textbox', { name: /Description/ }) as HTMLTextAreaElement
    const start = description.value.indexOf('kept ')
    description.focus()
    description.setSelectionRange(start, start + 'kept '.length)

    await userEvent.keyboard('{Delete}')

    expect(description).toHaveFocus()
    expect(description.selectionStart).toBe(start)
    expect(description.selectionEnd).toBe(start)
    await userEvent.keyboard('quietly ')
    expect(description).toHaveValue('She has quietly the archive for thirty years.')
  })

  it('finds and selects text inside a long codex description', async () => {
    const { onClose } = dialog({
      entry: entry({ description: 'The archive is quiet. Another archive waits below.' })
    })
    const description = screen.getByRole('textbox', { name: /Description/ }) as HTMLTextAreaElement
    description.focus()

    await userEvent.keyboard('{Control>}f{/Control}')
    const find = await screen.findByRole('textbox', { name: 'Find' })
    await userEvent.type(find, 'archive')

    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(description.value.slice(description.selectionStart, description.selectionEnd)).toBe(
      'archive'
    )

    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    expect(description.selectionStart).toBe(description.value.lastIndexOf('archive'))

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('search', { name: 'Find in codex field' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not steal focus when the codex is edited while Find remains open', async () => {
    dialog()
    const description = screen.getByRole('textbox', { name: /Description/ }) as HTMLTextAreaElement
    description.focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Find' }), 'archive')

    await userEvent.click(description)
    await userEvent.type(description, ' More.')

    expect(description).toHaveFocus()
    expect(description).toHaveValue('She has kept the archive for thirty years. More.')
    expect(screen.getByRole('search', { name: 'Find in codex field' })).toBeInTheDocument()
  })

  it('keeps the dialog open and reports a failed save', async () => {
    const onSave = vi.fn(async () => 'Unsafe codex entry id')
    const { onClose } = dialog({ onSave })

    await userEvent.type(nameField(), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Unsafe codex entry id')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without saving when nothing was changed', async () => {
    const { onSave, onClose } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before discarding unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = dialog()

    await userEvent.type(nameField(), ' the Archivist')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()

    confirm.mockRestore()
  })

  it('confirms before deleting, and does not delete when refused', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onDelete } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Delete entry' }))

    expect(confirm).toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('keeps delete visible on every tab and closes after deletion', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onDelete, onClose, subject } = dialog()

    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Relations' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete entry' }))

    expect(onDelete).toHaveBeenCalledWith(subject)
    expect(onClose).toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('saves the draft before moving, so an unsaved edit is not written to the old name', async () => {
    const order: string[] = []
    const onSave = vi.fn(async () => {
      order.push('save')
      return null
    })
    const onMove = vi.fn(() => order.push('move'))
    dialog({ onSave, onMove })

    const field = nameField()
    await userEvent.clear(field)
    await userEvent.type(field, 'Corvid')

    await userEvent.click(screen.getByRole('tab', { name: 'Tracking' }))
    const file = screen.getByDisplayValue('characters/wren')
    await userEvent.clear(file)
    await userEvent.type(file, 'characters/corvid')
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))

    await waitFor(() => expect(onMove).toHaveBeenCalled())
    expect(order).toEqual(['save', 'move'])
  })
})
