// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './overlays'

describe('Dialog resizing', () => {
  it('gives every shared dialog a resize grip', () => {
    render(<Dialog title="Settings">Contents</Dialog>)
    expect(screen.getByRole('button', { name: 'Resize dialog' })).toBeInTheDocument()
  })

  it('can be resized with the keyboard as well as a pointer', () => {
    render(<Dialog title="Settings">Contents</Dialog>)
    const dialog = screen.getByRole('dialog')
    const scrim = dialog.parentElement!
    Object.defineProperty(scrim, 'clientWidth', { configurable: true, value: 1200 })
    Object.defineProperty(scrim, 'clientHeight', { configurable: true, value: 900 })
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      width: 800,
      height: 600,
      toJSON: () => ({})
    })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize dialog' }), {
      key: 'ArrowRight'
    })

    expect(dialog.style.width).toBe('816px')
    expect(dialog.style.height).toBe('600px')
  })
})
