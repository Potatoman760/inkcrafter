// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project, ProjectFile } from '@shared/project'
import { FileTree, type FileTreeProps } from './FileTree'

const files: ProjectFile[] = [
  { path: 'ink/main.ink', absolutePath: '/w/p/ink/main.ink' },
  { path: 'ink/chapters/arrival.ink', absolutePath: '/w/p/ink/chapters/arrival.ink' },
  { path: 'ink/chapters/the-lamp.ink', absolutePath: '/w/p/ink/chapters/the-lamp.ink' }
]

const project: Project = {
  id: 'prj_0000000000',
  title: 'The Lighthouse',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: '/w/projects/the-lighthouse'
}

interface Handlers {
  onSelect: ReturnType<typeof vi.fn>
  onOpen: ReturnType<typeof vi.fn>
  onAdd: ReturnType<typeof vi.fn>
  onAddFolder: ReturnType<typeof vi.fn>
  onMove: ReturnType<typeof vi.fn>
  onReferences: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
  onCopy: ReturnType<typeof vi.fn>
  onSettings: ReturnType<typeof vi.fn>
  onReveal: ReturnType<typeof vi.fn>
}

function tree(overrides: Partial<Parameters<typeof FileTree>[0]> = {}): Handlers {
  const handlers: Handlers = {
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onAdd: vi.fn(),
    onAddFolder: vi.fn(),
    onMove: vi.fn(),
    onReferences: vi.fn(async () => []),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    onSettings: vi.fn(),
    onReveal: vi.fn()
  }

  // Merged before rendering, not after: returning `handlers` while `overrides`
  // was what got rendered hands the test a mock nothing ever called.
  const merged = { ...handlers, ...overrides } as Handlers & Partial<FileTreeProps>

  render(
    <FileTree
      project={project}
      files={files}
      folders={['ink', 'ink/chapters']}
      activePath={null}
      focusNewFile={0}
      {...merged}
    />
  )

  return merged
}

/** The row for a file, which is what a drag and a right-click start from. */
function row(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(name) })
}

/** A drag payload, since jsdom does not give the event one. */
function transfer(): DataTransfer {
  const data = new Map<string, string>()
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    dropEffect: 'none',
    effectAllowed: 'none'
  } as unknown as DataTransfer
}

const arrival = (): HTMLElement => screen.getByTitle(/ink\/chapters\/arrival\.ink/)

describe('FileTree', () => {
  it('shows compact project actions with labels on hover', async () => {
    const { onSettings, onReveal } = tree()
    const newFolder = screen.getByRole('button', { name: 'New folder' })
    const settings = screen.getByRole('button', { name: 'Project settings' })
    const reveal = screen.getByRole('button', { name: 'Open project folder' })

    expect(newFolder).toHaveAttribute('title', 'New folder')
    expect(settings).toHaveAttribute('title', 'Project settings')
    expect(reveal).toHaveAttribute('title', 'Open project folder')
    expect(newFolder).toHaveTextContent('')
    expect(settings).toHaveTextContent('')
    expect(reveal).toHaveTextContent('')

    await userEvent.click(settings)
    await userEvent.click(reveal)
    expect(onSettings).toHaveBeenCalledOnce()
    expect(onReveal).toHaveBeenCalledOnce()
  })

  it('groups files by folder', () => {
    tree()
    expect(screen.getByRole('heading', { name: 'ink' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ink/chapters' })).toBeInTheDocument()
  })

  it('marks the entry point', () => {
    tree()
    expect(screen.getByTitle('Entry point')).toBeInTheDocument()
  })

  it('selects on a single click without opening', async () => {
    const { onSelect, onOpen } = tree()

    await userEvent.click(arrival())

    expect(onSelect).toHaveBeenCalledWith(files[1])
    expect(onOpen).not.toHaveBeenCalled()
  })

  // A single click loads the buffer but leaves you wherever you were, so from
  // the plan or the manuscript it looks like nothing happened at all.
  it('opens in the editor on a double click', async () => {
    const { onOpen } = tree()

    await userEvent.dblClick(arrival())

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(files[1])
  })

  it('opens on Enter, which is the keyboard double-click', async () => {
    const { onOpen } = tree()

    arrival().focus()
    await userEvent.keyboard('{Enter}')

    expect(onOpen).toHaveBeenCalledWith(files[1])
  })

  it('adds a file, slugified and without the extension typed twice', async () => {
    const { onAdd } = tree()

    await userEvent.type(screen.getByPlaceholderText(/New file/), 'ink/Act Two.ink')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledWith('ink/act-two')
  })

  it('says so when there are no files rather than showing an empty pane', () => {
    tree({ files: [], folders: [] })
    expect(screen.getByText('No ink files yet.')).toBeInTheDocument()
  })
})

/**
 * Renaming, moving, deleting and making folders.
 *
 * The tree is the only place a project's ink can be reorganised, and each of
 * these hands a path to something that will rewrite every INCLUDE naming it —
 * so what the tree sends matters more than what it draws.
 */
describe('FileTree - reorganising', () => {
  it('renames in place, keeping the folder the file was in', async () => {
    const { onMove } = tree()

    row('arrival.ink').focus()
    fireEvent.keyDown(row('arrival.ink'), { key: 'F2' })

    const box = screen.getByLabelText('Rename arrival.ink')
    await userEvent.clear(box)
    await userEvent.type(box, 'the-door{Enter}')

    expect(onMove).toHaveBeenCalledWith('ink/chapters/arrival.ink', 'ink/chapters/the-door.ink')
  })

  it('takes a slash in a rename as a move, because it is the same operation', async () => {
    const { onMove } = tree()

    fireEvent.keyDown(row('arrival.ink'), { key: 'F2' })
    const box = screen.getByLabelText('Rename arrival.ink')
    await userEvent.clear(box)
    await userEvent.type(box, 'ink/opening{Enter}')

    expect(onMove).toHaveBeenCalledWith('ink/chapters/arrival.ink', 'ink/opening.ink')
  })

  it('backs out of a rename on Escape', async () => {
    const { onMove } = tree()

    fireEvent.keyDown(row('arrival.ink'), { key: 'F2' })
    const box = screen.getByLabelText('Rename arrival.ink')
    await userEvent.clear(box)
    await userEvent.type(box, 'something-else{Escape}')

    expect(onMove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /arrival.ink/ })).toBeInTheDocument()
  })

  it('does not move a file onto its own name', async () => {
    const { onMove } = tree()

    fireEvent.keyDown(row('arrival.ink'), { key: 'F2' })
    fireEvent.blur(screen.getByLabelText('Rename arrival.ink'))

    expect(onMove).not.toHaveBeenCalled()
  })

  it('moves a file into the folder it was dropped on', () => {
    const { onMove } = tree()
    const dataTransfer = transfer()

    fireEvent.dragStart(row('main.ink'), { dataTransfer })
    const target = screen.getByText('ink/chapters').closest('section')!
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    expect(onMove).toHaveBeenCalledWith('ink/main.ink', 'ink/chapters/main.ink')
  })

  it('ignores a drop back into the folder the file came from', () => {
    const { onMove } = tree()
    const dataTransfer = transfer()

    fireEvent.dragStart(row('main.ink'), { dataTransfer })
    const target = screen.getByText('ink').closest('section')!
    fireEvent.drop(target, { dataTransfer })

    expect(onMove).not.toHaveBeenCalled()
  })

  it('shows an empty folder, which a list of file paths could not', () => {
    tree({ folders: ['ink', 'ink/act-two'] })

    expect(screen.getByText('ink/act-two')).toBeInTheDocument()
    expect(screen.getByText(/drag a file here/i)).toBeInTheDocument()
  })
})

describe('FileTree - the context menu', () => {
  it('offers rename and delete on a file', () => {
    tree()
    fireEvent.contextMenu(row('arrival.ink'))

    expect(screen.getByRole('menuitem', { name: /Rename/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /New folder/ })).toBeInTheDocument()
  })

  it('offers no rename on a folder, which has none to give', () => {
    tree()
    fireEvent.contextMenu(screen.getByText('ink/chapters'))

    expect(screen.queryByRole('menuitem', { name: /Rename/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete folder/ })).toBeInTheDocument()
  })

  it('asks before deleting, and says what still points at the file', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onDelete, onReferences } = tree({
      onReferences: vi.fn(async () => [
        { kind: 'include' as const, file: 'ink/main.ink', line: 2, detail: 'INCLUDE arrival.ink' }
      ])
    })

    fireEvent.contextMenu(row('arrival.ink'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))

    await waitFor(() => expect(onReferences).toHaveBeenCalledWith('ink/chapters/arrival.ink'))
    expect(confirm.mock.calls[0]![0]).toMatch(/ink\/main\.ink:2/)
    expect(onDelete).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('deletes when the question is answered yes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onDelete } = tree()

    fireEvent.contextMenu(row('arrival.ink'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('ink/chapters/arrival.ink'))
    confirm.mockRestore()
  })

  it('closes without doing anything when the pointer goes elsewhere', () => {
    tree()
    fireEvent.contextMenu(row('arrival.ink'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(window)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('FileTree - folders', () => {
  // Not window.prompt: Electron throws on it — "prompt() is and will not be
  // supported" — so the menu item did nothing at all, silently.
  it('names a new folder in a dialog rather than a prompt', async () => {
    const { onAddFolder } = tree()

    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/^Name/), 'Act Two')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onAddFolder).toHaveBeenCalledWith('act-two')
  })

  it('makes one inside the folder that was right-clicked', async () => {
    const { onAddFolder } = tree()

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    await userEvent.click(screen.getByRole('menuitem', { name: /New folder/ }))

    // The dialog says where it will land, so the name is one word rather than
    // a path that has to be retyped correctly.
    expect(screen.getByText(/inside ink\/chapters/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^Name/), 'two')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onAddFolder).toHaveBeenCalledWith('ink/chapters/two')
  })

  it('does nothing when the dialog is cancelled', async () => {
    const { onAddFolder } = tree()

    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/^Name/), 'act-two')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onAddFolder).not.toHaveBeenCalled()
  })

  it('will not create an unnamed folder', async () => {
    tree()
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })
})

/**
 * Copy, cut and paste.
 *
 * The app's own clipboard, holding a project-relative path: a cut is not a cut
 * until it is pasted, so nothing moves when Ctrl+X is pressed.
 */
describe('FileTree - copy and paste', () => {
  const copy = async (name: string): Promise<void> => {
    fireEvent.contextMenu(row(name))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }))
  }

  const cut = async (name: string): Promise<void> => {
    fireEvent.contextMenu(row(name))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Cut/ }))
  }

  it('offers no paste until something is held', () => {
    tree()
    fireEvent.contextMenu(row('main.ink'))

    // Absent rather than disabled: a permanently greyed item is furniture.
    expect(screen.queryByRole('menuitem', { name: /Paste/ })).not.toBeInTheDocument()
  })

  it('copies into the folder that was right-clicked', async () => {
    const { onCopy } = tree()
    await copy('main.ink')

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))

    expect(onCopy).toHaveBeenCalledWith('ink/main.ink', 'ink/chapters')
  })

  it('copies beside a file when a file was right-clicked', async () => {
    const { onCopy } = tree()
    await copy('main.ink')

    fireEvent.contextMenu(row('arrival.ink'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))

    expect(onCopy).toHaveBeenCalledWith('ink/main.ink', 'ink/chapters')
  })

  it('names what it is holding, so a stale clipboard is visible', async () => {
    tree()
    await copy('main.ink')

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    expect(screen.getByRole('menuitem', { name: /Paste main\.ink/ })).toBeInTheDocument()
  })

  it('moves rather than copies when the file was cut', async () => {
    const { onMove, onCopy } = tree()
    await cut('main.ink')

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))

    expect(onMove).toHaveBeenCalledWith('ink/main.ink', 'ink/chapters/main.ink')
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('moves nothing when Cut is pressed, only when it is pasted', async () => {
    const { onMove } = tree()
    await cut('main.ink')

    expect(onMove).not.toHaveBeenCalled()
    // And says which file is being carried.
    expect(row('main.ink').className).toContain('is-held')
  })

  it('does not move a cut file back into the folder it is already in', async () => {
    const { onMove } = tree()
    await cut('arrival.ink')

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))

    expect(onMove).not.toHaveBeenCalled()
  })

  it('forgets a cut once it has been pasted, so it cannot be pasted twice', async () => {
    const { onMove } = tree()
    await cut('main.ink')

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))
    expect(onMove).toHaveBeenCalledTimes(1)

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    expect(screen.queryByRole('menuitem', { name: /Paste/ })).not.toBeInTheDocument()
  })

  it('keeps a copy on the clipboard, which is what makes it a copy', async () => {
    const { onCopy } = tree()
    await copy('main.ink')

    fireEvent.contextMenu(screen.getByText('ink/chapters'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))
    fireEvent.contextMenu(screen.getByText('ink'))
    await userEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))

    expect(onCopy).toHaveBeenCalledTimes(2)
  })

  it('takes the keyboard the way every other file list does', async () => {
    const { onCopy } = tree()

    fireEvent.keyDown(row('main.ink'), { key: 'c', ctrlKey: true })
    fireEvent.keyDown(row('arrival.ink'), { key: 'v', ctrlKey: true })

    expect(onCopy).toHaveBeenCalledWith('ink/main.ink', 'ink/chapters')
  })
})
