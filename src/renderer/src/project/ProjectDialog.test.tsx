// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CodexLibrary, Project, ProjectFile } from '@shared/project'
import { ProjectDialog } from './ProjectDialog'
import { installApi } from '../../../test/harness'

beforeEach(() => installApi())

const library: CodexLibrary = {
  id: 'lib_0000000001',
  title: 'Archive world',
  description: '',
  path: '/w/codex/archive-world',
  entryCount: 12
}

const files: ProjectFile[] = [
  { path: 'ink/main.ink', absolutePath: '/w/p/ink/main.ink' },
  { path: 'ink/act-two.ink', absolutePath: '/w/p/ink/act-two.ink' }
]

const project: Project = {
  id: 'prj_0000000000',
  title: 'The Archive',
  libraries: [library.id],
  main: 'ink/main.ink',
  description: 'A night archivist.',
  bundleOut: null,
  path: '/w/projects/the-archive'
}

function dialog(overrides: Partial<Parameters<typeof ProjectDialog>[0]> = {}): {
  onSave: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onManageLibraries: ReturnType<typeof vi.fn>
} {
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onManageLibraries = vi.fn()

  render(
    <ProjectDialog
      project={project}
      files={files}
      libraries={[library]}
      onSave={onSave}
      onManageLibraries={onManageLibraries}
      onReveal={vi.fn()}
      onClose={onClose}
      {...overrides}
    />
  )

  return { onSave, onClose, onManageLibraries }
}

describe('ProjectDialog', () => {
  it('shows the manifest as editable fields', () => {
    dialog()

    expect(screen.getByRole('dialog', { name: 'Project settings' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('The Archive')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A night archivist.')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('ink/main.ink')
  })

  it('offers every file in the project as the entry point', () => {
    dialog()
    expect(
      screen.getAllByRole('option').map((option) => option.textContent)
    ).toEqual(['ink/main.ink', 'ink/act-two.ink'])
  })

  it('lists what the project draws on, with entry counts', () => {
    dialog()
    expect(screen.getByText('Archive world')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('holds edits as a draft and saves on demand', async () => {
    const { onSave, onClose } = dialog()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    const title = screen.getByDisplayValue('The Archive')
    await userEvent.clear(title)
    await userEvent.type(title, 'The Vault')

    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Vault' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('changes the entry point through the same draft', async () => {
    const { onSave } = dialog()

    await userEvent.selectOptions(screen.getByRole('combobox'), 'ink/act-two.ink')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ main: 'ink/act-two.ink' }))
  })

  it('asks before discarding unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = dialog()

    await userEvent.type(screen.getByDisplayValue('The Archive'), ' II')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('hands off to the library dialog rather than duplicating its controls', async () => {
    const { onManageLibraries } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Manage libraries…' }))

    expect(onManageLibraries).toHaveBeenCalled()
    // No second set of link/unlink controls to disagree with the real ones.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('generates, installs and saves a protected release profile without exposing its private key', async () => {
    const { onSave } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Enable protected exports' }))

    expect(window.inkcrafter.bundle.generateProtection).toHaveBeenCalled()
    expect(window.inkcrafter.bundle.installProtection).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: '0123456789abcdef01234567' })
    )
    expect(screen.getByText('0123456789abcdef01234567')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      protection: expect.objectContaining({ mode: 'protected', keyId: '0123456789abcdef01234567' })
    }))
  })
})
