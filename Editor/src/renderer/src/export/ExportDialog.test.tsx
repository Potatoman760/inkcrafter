// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project } from '@shared/project'
import { ExportDialog } from './ExportDialog'
import { installApi } from '../../../test/harness'

beforeEach(() => installApi())

const project: Project = {
  id: 'prj_0000000000',
  title: 'The Archive',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  bundleOut: '/w/game/the-archive',
  path: '/w/projects/the-archive'
}

function dialog(overrides: Partial<Project> = {}): {
  onRemember: ReturnType<typeof vi.fn>
  onRememberDesktop: ReturnType<typeof vi.fn>
} {
  const onRemember = vi.fn()
  const onRememberDesktop = vi.fn()
  render(
    <ExportDialog
      project={{ ...project, ...overrides }}
      onRemember={onRemember}
      onRememberDesktop={onRememberDesktop}
      onClose={vi.fn()}
    />
  )
  return { onRemember, onRememberDesktop }
}

/**
 * The dialog's two halves share a destination control and an Export button,
 * so what matters is that each half drives its own export with its own folder
 * and remembers its own settings — and that the desktop half will not run
 * with nothing to build.
 */
describe('ExportDialog', () => {
  it('exports a web bundle to the remembered folder', async () => {
    const { onRemember } = dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(window.inkcrafter.bundle.export).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id }),
      '/w/game/the-archive'
    )
    expect(window.inkcrafter.bundle.exportDesktop).not.toHaveBeenCalled()
    expect(onRemember).toHaveBeenCalledWith('/w/game/the-archive')
  })

  it('needs a folder of its own before a desktop export can run', async () => {
    dialog()

    await userEvent.click(screen.getByRole('radio', { name: 'Desktop game' }))

    // The web folder is not offered for the desktop build: it is a different
    // kind of thing and would refuse to hold one anyway.
    expect(screen.getByText('No folder chosen yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('exports the chosen platforms with the Steam App ID and remembers them', async () => {
    const { onRememberDesktop } = dialog({
      desktop: { outDir: '/w/release', steamAppId: null, platforms: ['win32-x64', 'linux-x64'] }
    })

    await userEvent.click(screen.getByRole('radio', { name: 'Desktop game' }))
    expect(screen.getByRole('checkbox', { name: 'Windows' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Linux' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'macOS (Intel)' })).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Linux' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'macOS (Apple silicon)' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Steam App ID' }), '480')
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(window.inkcrafter.bundle.exportDesktop).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id }),
      '/w/release',
      { platforms: ['win32-x64', 'darwin-arm64'], steamAppId: 480 }
    )
    expect(onRememberDesktop).toHaveBeenCalledWith({
      outDir: '/w/release',
      steamAppId: 480,
      platforms: ['win32-x64', 'darwin-arm64']
    })
    expect(await screen.findByText(/2 of 2 platform/)).toBeInTheDocument()
  })

  it('refuses a Steam App ID that is not a number, and no platforms at all', async () => {
    dialog({ desktop: { outDir: '/w/release', steamAppId: 480, platforms: ['win32-x64'] } })

    await userEvent.click(screen.getByRole('radio', { name: 'Desktop game' }))
    const appId = screen.getByRole('textbox', { name: 'Steam App ID' })
    expect(appId).toHaveValue('480')

    await userEvent.clear(appId)
    await userEvent.type(appId, 'spacewar')
    expect(screen.getByText('A Steam App ID is a whole number.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()

    await userEvent.clear(appId)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Windows' }))
    expect(screen.getByText('Choose at least one platform.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('reports a platform that could not be assembled beside the ones that were', async () => {
    vi.mocked(window.inkcrafter.bundle.exportDesktop).mockResolvedValueOnce({
      ok: true,
      outDir: '/w/release',
      builds: [
        { platform: 'win32-x64', outDir: '/w/release/windows', problem: null },
        { platform: 'darwin-arm64', outDir: null, problem: 'the download was cut short' }
      ],
      diagnostics: [],
      warnings: []
    })
    dialog({
      desktop: { outDir: '/w/release', steamAppId: null, platforms: ['win32-x64', 'darwin-arm64'] }
    })

    await userEvent.click(screen.getByRole('radio', { name: 'Desktop game' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(await screen.findByText(/1 of 2 platform/)).toBeInTheDocument()
    expect(screen.getByText(/Windows — \/w\/release\/windows/)).toBeInTheDocument()
    expect(screen.getByText(/not written: the download was cut short/)).toBeInTheDocument()
  })
})
