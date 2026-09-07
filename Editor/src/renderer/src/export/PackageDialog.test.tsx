// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CodexLibrary, Project } from '@shared/project'
import { PackageDialog } from './PackageDialog'
import { installApi } from '../../../test/harness'

const linked: CodexLibrary = {
  id: 'lib_0000000001',
  title: 'Archive world',
  description: '',
  path: '/w/codex/archive-world',
  entryCount: 12
}

const other: CodexLibrary = {
  id: 'lib_0000000002',
  title: 'Shared cast',
  description: '',
  path: '/w/codex/shared-cast',
  entryCount: 4
}

const project: Project = {
  id: 'prj_0000000000',
  title: 'The Archive',
  libraries: [linked.id],
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: '/w/projects/the-archive'
}

beforeEach(() => {
  installApi({ libraries: { list: vi.fn(async () => [linked, other]) } })
})

/**
 * The dialog's job is the libraries. Which ones go in is the decision a
 * package exists to make, and an unticked linked library is the one mistake
 * that cannot be seen once the zip has been sent.
 */
describe('PackageDialog', () => {
  it('ticks the libraries the project links and packages those', async () => {
    render(<PackageDialog project={project} onClose={vi.fn()} />)

    expect(await screen.findByRole('checkbox', { name: /Archive world/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Shared cast/ })).not.toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Choose a file and package' }))

    expect(window.inkcrafter.packages.choosePath).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id })
    )
    expect(window.inkcrafter.packages.write).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id }),
      [linked.id],
      '/w/packages/the-archive.zip'
    )
    expect(await screen.findByText('/w/packages/the-archive.zip')).toBeInTheDocument()
  })

  it('takes a library the project does not link', async () => {
    render(<PackageDialog project={project} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /Shared cast/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Choose a file and package' }))

    expect(window.inkcrafter.packages.write).toHaveBeenCalledWith(
      expect.anything(),
      [linked.id, other.id],
      expect.any(String)
    )
  })

  it('says when a linked library is being left out', async () => {
    render(<PackageDialog project={project} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /Archive world/ }))

    expect(
      screen.getByText('1 library this project links will not be in the package.')
    ).toBeInTheDocument()
  })

  // A link to a library this workspace does not have is a fact about the
  // project, not a box the author forgot to tick — there is no such box.
  it('separates a library it cannot offer from one that was unticked', async () => {
    render(
      <PackageDialog
        project={{ ...project, libraries: [linked.id, 'lib_0000000009'] }}
        onClose={vi.fn()}
      />
    )

    expect(
      await screen.findByText(/links 1 library that this workspace does not have/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/will not be in the package/)).not.toBeInTheDocument()
  })

  it('writes nothing when the save dialog is cancelled', async () => {
    installApi({
      libraries: { list: vi.fn(async () => [linked]) },
      packages: { choosePath: vi.fn(async () => null) }
    })
    render(<PackageDialog project={project} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Choose a file and package' }))

    expect(window.inkcrafter.packages.write).not.toHaveBeenCalled()
  })

  it('reports a package that could not be written', async () => {
    installApi({
      libraries: { list: vi.fn(async () => [linked]) },
      packages: {
        write: vi.fn(async () => ({
          ok: false,
          file: '/w/packages/the-archive.zip',
          files: 0,
          bytes: 0,
          warnings: [],
          problem: 'The disk is full.'
        }))
      }
    })
    render(<PackageDialog project={project} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Choose a file and package' }))

    expect(await screen.findByText('The disk is full.')).toBeInTheDocument()
  })
})
