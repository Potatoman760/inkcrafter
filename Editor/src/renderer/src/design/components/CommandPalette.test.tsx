// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette'

/**
 * The palette is the reason the toolbars are allowed to stay short, so what
 * matters is that it finds things: a command an author half-remembers, by any
 * word in it, from the keyboard alone.
 */

function palette(): { onRun: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onRun = vi.fn()
  const onClose = vi.fn()
  render(<CommandPalette onRun={onRun} onClose={onClose} platform="win32" />)
  return { onRun, onClose }
}

describe('CommandPalette', () => {
  it('opens with everything, sectioned by the menus it mirrors', () => {
    palette()
    expect(screen.getByText('File')).toBeInTheDocument()
    expect(screen.getByText('View')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resize dialog' })).toBeInTheDocument()
  })

  it('shows the shortcut the way this platform writes it', () => {
    palette()
    expect(screen.getByRole('button', { name: /Save/ })).toHaveTextContent('Ctrl+S')
  })

  it('narrows on every word, in any order', async () => {
    palette()

    await userEvent.type(screen.getByRole('textbox'), 'game cast')

    expect(screen.getByRole('button', { name: /Game: cast/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Manuscript/ })).not.toBeInTheDocument()
  })

  it('finds a command by its section as well as its name', async () => {
    palette()
    await userEvent.type(screen.getByRole('textbox'), 'file')
    expect(screen.getByRole('button', { name: /New file/ })).toBeInTheDocument()
  })

  it('runs the highlighted command on Enter', async () => {
    const { onRun } = palette()

    await userEvent.type(screen.getByRole('textbox'), 'export{Enter}')

    expect(onRun).toHaveBeenCalledOnce()
    expect(onRun.mock.calls[0]![0].action).toBe('project:export')
  })

  it('moves the highlight with the arrow keys', async () => {
    const { onRun } = palette()

    await userEvent.type(screen.getByRole('textbox'), 'game')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    // media, stats, cast — the third.
    expect(onRun.mock.calls[0]![0].action).toBe('project:cast')
  })

  it('says so when nothing matches, quoting what was asked for', async () => {
    palette()
    await userEvent.type(screen.getByRole('textbox'), 'xyzzy')
    expect(screen.getByText(/Nothing matches/)).toHaveTextContent('xyzzy')
  })

  it('closes on Escape', async () => {
    const { onClose } = palette()
    await userEvent.type(screen.getByRole('textbox'), '{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('runs a command when it is clicked', async () => {
    const { onRun } = palette()
    await userEvent.click(screen.getByRole('button', { name: /Project settings/ }))
    expect(onRun.mock.calls[0]![0].action).toBe('project:settings')
  })
})
