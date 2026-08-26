import { useRef, useState } from 'react'

interface SplitterProps {
  /** Current width of the pane this splitter sizes, in pixels. */
  value: number
  onChange: (value: number) => void
  /** Called once when a drag finishes, for persisting the result. */
  onCommit?: (value: number) => void
  min: number
  max: number
  /** True when dragging right should shrink the pane, as for a right-hand one. */
  invert?: boolean
  label: string
  /** Width to return to on double-click. */
  reset: number
}

const KEYBOARD_STEP = 16
const KEYBOARD_STEP_FINE = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * A draggable divider between two panes.
 *
 * Pointer events rather than mouse events, and with pointer capture, so a drag
 * survives the cursor outrunning the handle or leaving the window — which it
 * will, because the whole point is to move faster than a 5px target.
 *
 * The start position and start width are both recorded on press and the width
 * derived from the total movement since, rather than accumulated per event. An
 * accumulating splitter drifts out of step with the cursor as soon as it clamps.
 */
export function Splitter({
  value,
  onChange,
  onCommit,
  min,
  max,
  invert = false,
  label,
  reset
}: SplitterProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startValue = useRef(0)

  const step = (amount: number): void => {
    const next = clamp(value + (invert ? -amount : amount), min, max)
    onChange(next)
    onCommit?.(next)
  }

  return (
    <div
      // ic-splitter exception by definition: this file IS the component.
      // The kit's Splitter is a strict subset of it — no pointer capture, no
      // body.is-resizing, no fine keyboard step — so the app keeps its own.
      className={`ic-splitter splitter ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        startX.current = event.clientX
        startValue.current = value
        setDragging(true)
        // Without this, dragging over the editor selects its text.
        document.body.classList.add('is-resizing')
      }}
      onPointerMove={(event) => {
        if (!dragging) return
        const travelled = (event.clientX - startX.current) * (invert ? -1 : 1)
        onChange(clamp(startValue.current + travelled, min, max))
      }}
      onPointerUp={(event) => {
        if (!dragging) return
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        setDragging(false)
        document.body.classList.remove('is-resizing')
        onCommit?.(value)
      }}
      onDoubleClick={() => {
        onChange(reset)
        onCommit?.(reset)
      }}
      onKeyDown={(event) => {
        const fine = event.shiftKey ? KEYBOARD_STEP_FINE : KEYBOARD_STEP
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          step(-fine)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          step(fine)
        }
        if (event.key === 'Home') {
          event.preventDefault()
          onChange(reset)
          onCommit?.(reset)
        }
      }}
    />
  )
}
