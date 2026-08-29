// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CodexLibrary, Project } from '@shared/project'
import { LibraryDialog } from './LibraryDialog'

function library(overrides: Partial<CodexLibrary> = {}): CodexLibrary {
  return {
    id: 'lib_0000000001',
    title: 'Archive world',
    description: 'The shared cast.',
    path: '/w/codex/archive-world',
    entryCount: 12,
    ...overrides
  }
}

const shared = library()
const private_ = library({
  id: 'lib_0000000002',
  title: 'The Archive only',
  description: '',
  entryCount: 3
})

function project(libraries: string[] = [shared.id]): Project {
  return {
    id: 'prj_0000000000',
    title: 'The Archive',
    libraries,
    main: 'ink/main.ink',
    description: '',
    bundleOut: null,
    path: '/w/projects/the-archive'
  }
}

function dialog(overrides: Partial<Parameters<typeof LibraryDialog>[0]> = {}): {
  onToggle: ReturnType<typeof vi.fn>
  onSaveLibrary: ReturnType<typeof vi.fn>
  onCreate: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  const onToggle = vi.fn()
  const onSaveLibrary = vi.fn(async () => {})
  const onCreate = vi.fn(async () => library({ id: 'lib_0000000003', title: 'New one', entryCount: 0 }))
  const onClose = vi.fn()

  render(
    <LibraryDialog
      project={project()}
      libraries={[shared, private_]}
      onToggle={onToggle}
      onSaveLibrary={onSaveLibrary}
      onCreate={onCreate}
      onReveal={vi.fn()}
      onClose={onClose}
      {...overrides}
    />
  )

  return { onToggle, onSaveLibrary, onCreate, onClose }
}

describe('LibraryDialog', () => {
  it('lists every library with what it holds, linked or not', () => {
    dialog()

    expect(screen.getByRole('button', { name: 'Archive world' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The Archive only' })).toBeInTheDocument()
    // Counts are known even for a library the project never links and so never
    // loads the entries of.
    expect(
      screen.getAllByTitle('Entries in this library').map((node) => node.textContent)
    ).toEqual(['12', '3'])
  })

  it('shows which are attached to this project', () => {
    dialog()

    expect(screen.getByRole('checkbox', { name: /Use Archive world/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Use The Archive only/ })).not.toBeChecked()
    expect(screen.getByText(/uses 1 of 2/)).toBeInTheDocument()
  })

  it('attaches a library on toggle, without waiting for a save', async () => {
    const { onToggle } = dialog()

    await userEvent.click(screen.getByRole('checkbox', { name: /Use The Archive only/ }))
    expect(onToggle).toHaveBeenCalledWith(private_.id, true)
  })

  it('detaches one that was attached', async () => {
    const { onToggle } = dialog()

    await userEvent.click(screen.getByRole('checkbox', { name: /Use Archive world/ }))
    expect(onToggle).toHaveBeenCalledWith(shared.id, false)
  })

  it('describes the library that is selected', async () => {
    dialog()

    expect(screen.getByDisplayValue('The shared cast.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'The Archive only' }))
    expect(screen.getByDisplayValue('The Archive only')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('The shared cast.')).not.toBeInTheDocument()
  })

  it('holds a title or description as a draft until saved', async () => {
    const { onSaveLibrary } = dialog()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    const title = screen.getByDisplayValue('Archive world')
    await userEvent.clear(title)
    await userEvent.type(title, 'Archive setting')

    expect(onSaveLibrary).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaveLibrary).toHaveBeenCalledTimes(1))
    expect(onSaveLibrary.mock.calls[0]![0]).toMatchObject({
      id: shared.id,
      title: 'Archive setting'
    })
  })

  it('keeps the library description focused after deleting selected text', async () => {
    dialog()
    const description = screen.getByRole('textbox', { name: /About/ }) as HTMLTextAreaElement
    const start = description.value.indexOf('shared ')
    description.focus()
    description.setSelectionRange(start, start + 'shared '.length)

    await userEvent.keyboard('{Delete}')

    expect(description).toHaveFocus()
    expect(description.selectionStart).toBe(start)
    await userEvent.keyboard('old ')
    expect(description).toHaveValue('The old cast.')
  })

  it('creates a library and attaches it, since that is why it was made here', async () => {
    const { onCreate, onToggle } = dialog()

    await userEvent.type(screen.getByLabelText('New library'), 'Second game')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Second game'))
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith('lib_0000000003', true))
  })

  it('will not create an unnamed library', () => {
    dialog()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('closes on Escape and on the backdrop', async () => {
    const { onClose } = dialog()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('says how to remove a library rather than offering a one-click delete', () => {
    dialog()
    expect(screen.getByText(/done outside the app/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })
})
