// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PACKAGE_FORMAT, type PackagePreview } from '@shared/projectPackage'
import { OpenPackageDialog } from './OpenPackageDialog'
import { installApi } from '../../../test/harness'

const preview: PackagePreview = {
  ok: true,
  file: '/downloads/the-archive.zip',
  manifest: {
    format: PACKAGE_FORMAT,
    generatedBy: 'InkCrafter',
    generatedAt: '2026-09-07T09:00:00.000Z',
    project: { id: 'prj_0000000001', title: 'The Archive', folder: 'the-archive' },
    libraries: [{ id: 'lib_0000000001', title: 'Archive world', folder: 'archive-world' }]
  },
  libraries: [
    {
      id: 'lib_0000000001',
      title: 'Archive world',
      folder: 'archive-world',
      fate: 'add',
      existingTitle: null
    }
  ],
  folder: 'the-archive',
  duplicate: false,
  problem: null
}

beforeEach(() => installApi())

/**
 * Opening a package writes into the workspace, so the dialog's real job is the
 * sentence before that happens: which folder it will land in, and which codex
 * libraries it will and will not touch.
 */
describe('OpenPackageDialog', () => {
  it('says what is inside before it writes anything', async () => {
    installApi({ packages: { preview: vi.fn(async () => preview) } })
    render(<OpenPackageDialog onOpened={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('The Archive')).toBeInTheDocument()
    expect(screen.getByText(/Lands in the workspace as/)).toBeInTheDocument()
    expect(screen.getByText(/Archive world — added to the workspace/)).toBeInTheDocument()
    expect(window.inkcrafter.packages.open).not.toHaveBeenCalled()
  })

  it('unpacks and opens the project it wrote', async () => {
    const onOpened = vi.fn()
    installApi({ packages: { preview: vi.fn(async () => preview) } })
    render(<OpenPackageDialog onOpened={onOpened} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Put it in the workspace' }))

    expect(window.inkcrafter.packages.open).toHaveBeenCalledWith('/downloads/the-archive.zip')
    expect(onOpened).toHaveBeenCalledWith('/w/projects/the-lighthouse')
  })

  // Anything the author should read is worth stopping for; a clean import is
  // not, and going straight into the project is what they asked for.
  it('stays open to report what it did when there was something to say', async () => {
    const onOpened = vi.fn()
    installApi({
      packages: {
        preview: vi.fn(async () => preview),
        open: vi.fn(async () => ({
          ok: true,
          projectPath: '/w/projects/the-archive-2',
          libraries: [{ title: 'Archive world', fate: 'keep' as const }],
          warnings: ['Kept the codex library you already have for Archive world.'],
          problem: null
        }))
      }
    })
    render(<OpenPackageDialog onOpened={onOpened} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Put it in the workspace' }))

    expect(await screen.findByText(/Kept the codex library you already have/)).toBeInTheDocument()
    expect(onOpened).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Open the project' }))
    expect(onOpened).toHaveBeenCalledWith('/w/projects/the-archive-2')
  })

  it('warns that a project already here will be opened as a second copy', async () => {
    installApi({
      packages: {
        preview: vi.fn(async () => ({
          ...preview,
          folder: 'the-archive-2',
          duplicate: true,
          libraries: [
            {
              id: 'lib_0000000001',
              title: 'Archive world',
              folder: 'archive-world',
              fate: 'keep' as const,
              existingTitle: 'My archive world'
            }
          ]
        }))
      }
    })
    render(<OpenPackageDialog onOpened={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText(/because "the-archive" is taken/)).toBeInTheDocument()
    expect(screen.getByText(/given its own identity/)).toBeInTheDocument()
    expect(screen.getByText(/already here as "My archive world", so yours is kept/)).toBeInTheDocument()
  })

  it('reports a file that is not a package, and will not unpack it', async () => {
    installApi({
      packages: {
        preview: vi.fn(async () => ({
          ...preview,
          ok: false,
          manifest: null,
          libraries: [],
          problem: 'holiday.zip has no inkcrafter-package.json in it.'
        }))
      }
    })
    render(<OpenPackageDialog onOpened={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText(/no inkcrafter-package.json/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Put it in the workspace' })).toBeDisabled()
  })

  it('closes itself when the file dialog is cancelled', async () => {
    const onClose = vi.fn()
    installApi({ packages: { choose: vi.fn(async () => null) } })
    render(<OpenPackageDialog onOpened={vi.fn()} onClose={onClose} />)

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(window.inkcrafter.packages.preview).not.toHaveBeenCalled()
  })
})
