// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Splitter } from './Splitter'

function splitter(overrides: Partial<Parameters<typeof Splitter>[0]> = {}): {
  onChange: ReturnType<typeof vi.fn>
  onCommit: ReturnType<typeof vi.fn>
  handle: HTMLElement
} {
  const onChange = vi.fn()
  const onCommit = vi.fn()

  render(
    <Splitter
      value={240}
      onChange={onChange}
      onCommit={onCommit}
      min={160}
      max={480}
      reset={232}
      label="Resize the sidebar"
      {...overrides}
    />
  )

  return { onChange, onCommit, handle: screen.getByRole('separator') }
}

/** jsdom builds PointerEvents without clientX unless it is supplied. */
function drag(handle: HTMLElement, from: number, to: number): void {
  fireEvent.pointerDown(handle, { clientX: from, pointerId: 1 })
  fireEvent.pointerMove(handle, { clientX: to, pointerId: 1 })
  fireEvent.pointerUp(handle, { clientX: to, pointerId: 1 })
}

describe('Splitter', () => {
  it('describes itself to assistive technology', () => {
    const { handle } = splitter()

    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '240')
    expect(handle).toHaveAttribute('aria-valuemin', '160')
    expect(handle).toHaveAttribute('aria-valuemax', '480')
  })

  it('widens the pane when dragged right', () => {
    const { onChange, handle } = splitter()

    drag(handle, 300, 360)
    expect(onChange).toHaveBeenLastCalledWith(300)
  })

  it('narrows it when dragged left', () => {
    const { onChange, handle } = splitter()

    drag(handle, 300, 240)
    expect(onChange).toHaveBeenLastCalledWith(180)
  })

  it('reverses for a right-hand pane, where dragging right shrinks it', () => {
    const { onChange, handle } = splitter({ invert: true })

    drag(handle, 300, 360)
    expect(onChange).toHaveBeenLastCalledWith(180)
  })

  it('measures from where the drag began, so clamping does not desynchronise it', () => {
    // Pushed far past the minimum and brought back: an implementation that
    // accumulated per-event deltas would still be pinned at the minimum here.
    const { onChange, handle } = splitter()

    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(160)

    fireEvent.pointerMove(handle, { clientX: 320, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(260)
  })

  it('will not drag past its bounds', () => {
    const { onChange, handle } = splitter()

    drag(handle, 300, 2000)
    expect(onChange).toHaveBeenLastCalledWith(480)

    drag(handle, 300, -2000)
    expect(onChange).toHaveBeenLastCalledWith(160)
  })

  it('ignores movement when no drag is under way', () => {
    const { onChange, handle } = splitter()

    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('persists once at the end of a drag, not on every frame', () => {
    const { onCommit, handle } = splitter()

    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 320, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 340, pointerId: 1 })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.pointerUp(handle, { clientX: 340, pointerId: 1 })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('resizes with the arrow keys, finely with shift', () => {
    const { onChange, handle } = splitter()

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(256)

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(224)

    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(242)
  })

  it('reverses the arrow keys for a right-hand pane too', () => {
    const { onChange, handle } = splitter({ invert: true })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(224)
  })

  it('returns to the default on double-click or Home', () => {
    const { onChange, onCommit, handle } = splitter()

    fireEvent.doubleClick(handle)
    expect(onChange).toHaveBeenLastCalledWith(232)
    expect(onCommit).toHaveBeenLastCalledWith(232)

    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(232)
  })

  it('suppresses text selection only while dragging', () => {
    const { handle } = splitter()

    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 })
    expect(document.body).toHaveClass('is-resizing')

    fireEvent.pointerUp(handle, { clientX: 300, pointerId: 1 })
    expect(document.body).not.toHaveClass('is-resizing')
  })
})
