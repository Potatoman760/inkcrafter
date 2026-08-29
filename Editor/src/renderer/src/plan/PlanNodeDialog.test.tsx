// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newEntry, type CodexEntry } from '@shared/codex'
import { planFromMarkdown, type PlanNode } from '@shared/planDoc'
import type { ProjectFile } from '@shared/project'
import { installApi } from '../../../test/harness'
import { PlanNodeDialog } from './PlanNodeDialog'

const ARRIVAL_INK = [
  '// Arrival',
  '',
  '=== the_door ===',
  'She arrives.',
  '= after_knocking',
  'Nobody answers.',
  '',
  '=== function place_name(id) ===',
  '~ return "somewhere"',
  '',
  '=== inside ===',
  'The shelves.'
].join('\n')

const PROJECT_FILES: ProjectFile[] = [
  { path: 'ink/arrival.ink', absolutePath: '/p/ink/arrival.ink' },
  { path: 'ink/overworld.ink', absolutePath: '/p/ink/overworld.ink' }
]

function entry(name: string): CodexEntry {
  return {
    ...newEntry('lib_0000000000', name, 'character', name.toLowerCase()),
    id: `cdx_${name.toLowerCase()}`
  }
}

// Parsed once: every call to planFromMarkdown mints fresh ids, so re-parsing per
// test would compare an id against a different document's.
const DOOR: PlanNode = {
  ...planFromMarkdown('# The door\n\nShe arrives at the archive. Wren waits.\n').nodes[0]!,
  files: ['ink/arrival.ink']
}

function node(overrides: Partial<PlanNode> = {}): PlanNode {
  return { ...DOOR, ...overrides }
}

function dialog(
  overrides: Partial<Parameters<typeof PlanNodeDialog>[0]> = {}
): {
  onSave: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onOpenFile: ReturnType<typeof vi.fn>
} {
  installApi({ readFile: vi.fn(async () => ARRIVAL_INK) })
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onOpenFile = vi.fn()

  render(
    <PlanNodeDialog
      node={node()}
      depth={2}
      entries={[entry('Wren')]}
      projectFiles={PROJECT_FILES}
      projectFolders={['ink', 'chapter1']}
      onSave={onSave}
      onOpenFile={onOpenFile}
      onOpenEntry={vi.fn()}
      onClose={onClose}
      {...overrides}
    />
  )

  return { onSave, onClose, onOpenFile }
}

describe('PlanNodeDialog', () => {
  it('names the section by its depth', () => {
    dialog()
    expect(screen.getByRole('heading', { name: /Scene/ })).toBeInTheDocument()
  })

  it('shows only the ink attached to this section', async () => {
    dialog()

    expect(await screen.findByRole('button', { name: 'ink/arrival.ink' })).toBeInTheDocument()
    // The project has another file; this section is not written in it.
    expect(screen.queryByRole('button', { name: 'ink/overworld.ink' })).not.toBeInTheDocument()
  })

  it('lists the knots inside an attached file, and not its functions', async () => {
    dialog()

    expect(await screen.findByRole('button', { name: '=== the_door' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '= after_knocking' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '=== inside' })).toBeInTheDocument()
    // A function is called, never travelled to.
    expect(screen.queryByRole('button', { name: /place_name/ })).not.toBeInTheDocument()
  })

  it('opens a knot at its line', async () => {
    const { onOpenFile } = dialog()

    await userEvent.click(await screen.findByRole('button', { name: '=== inside' }))
    expect(onOpenFile).toHaveBeenCalledWith('ink/arrival.ink', 11)
  })

  it('confirms the section’s knot is declared in its ink, and where', async () => {
    dialog()
    expect(await screen.findByText(/is declared in ink\/arrival.ink, line 3/)).toBeInTheDocument()
  })

  it('says when the knot is nowhere in the attached ink', async () => {
    // The loop this closes: the plan claims a knot the ink does not have.
    dialog({ node: node({ title: 'Somewhere else' }) })
    expect(await screen.findByText(/is not declared in this Scene's Ink file/)).toBeInTheDocument()
  })

  it('holds edits as a draft until saved', async () => {
    const { onSave, onClose } = dialog()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    const summary = screen.getByLabelText('Description')
    await userEvent.clear(summary)
    await userEvent.type(summary, 'Rewritten.')

    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave.mock.calls[0]![1]).toMatchObject({ summary: 'Rewritten.' })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the existing Ink knot stable when a Scene is renamed', async () => {
    const { onSave } = dialog()
    const title = screen.getByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'A different door')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave.mock.calls[0]![1]).toMatchObject({
      title: 'A different door',
      knot: 'the_door'
    })
  })

  it('cancels without saving when nothing changed', async () => {
    const { onSave, onClose } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before discarding an edit', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = dialog()

    await userEvent.type(screen.getByLabelText('Title'), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('reports a file it cannot read rather than showing an empty section', async () => {
    installApi({
      readFile: vi.fn(async () => {
        throw new Error('ENOENT: no such file')
      })
    })
    render(
      <PlanNodeDialog
        node={node()}
        depth={2}
        entries={[]}
        projectFiles={PROJECT_FILES}
        projectFolders={[]}
        onSave={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenEntry={vi.fn()}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => expect(screen.getByText(/ENOENT/)).toBeInTheDocument())
  })

  it('shows the characters this section names', async () => {
    dialog()
    expect(await screen.findByRole('button', { name: 'Wren' })).toBeInTheDocument()
  })

  it('does not offer attachment controls for the app-managed Scene file', async () => {
    dialog()
    await screen.findByRole('button', { name: 'ink/arrival.ink' })
    expect(screen.queryByRole('button', { name: 'detach' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Attach an ink file')).not.toBeInTheDocument()
  })

  it('shows a chapter as a container whose Scenes link to their files', async () => {
    const scene = node({ id: 'pln_scene0001', title: 'Inside', files: ['ink/arrival.ink'] })
    const { onOpenFile } = dialog({
      node: node({ title: 'Arrival', folder: 'chapter1', files: [], children: [scene] }),
      depth: 1
    })

    expect(screen.getByRole('heading', { name: /Chapter/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Chapter folder')).toHaveValue('chapter1')
    expect(screen.queryByText('Scene Ink file')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'arrival.ink' }))
    expect(onOpenFile).toHaveBeenCalledWith('ink/arrival.ink')
  })

  it('saves a Chapter folder reference', async () => {
    const { onSave } = dialog({
      node: node({ title: 'Arrival', folder: 'chapter1', files: [] }),
      depth: 1,
      projectFolders: ['chapter1', 'chapter2']
    })

    await userEvent.clear(screen.getByLabelText('Chapter folder'))
    await userEvent.type(screen.getByLabelText('Chapter folder'), 'chapter2')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave.mock.calls[0]![1]).toMatchObject({ folder: 'chapter2' })
  })
})
