import React, { useRef, useState } from 'react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Draggable divider between panes. 5px of hit area, 1px of ink, accent
 * on hover so the author can find it without hunting.
 */
export function Splitter({ value, onChange, onCommit, min, max, invert = false, reset, label }) {
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startValue = useRef(0)

  return (
    <div
      className={`ic-splitter${dragging ? ' is-dragging' : ''}`}
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
        onCommit?.(value)
      }}
      onDoubleClick={() => { onChange(reset); onCommit?.(reset) }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 2 : 16
        if (event.key === 'ArrowLeft') { event.preventDefault(); onChange(clamp(value + (invert ? step : -step), min, max)) }
        if (event.key === 'ArrowRight') { event.preventDefault(); onChange(clamp(value + (invert ? -step : step), min, max)) }
        if (event.key === 'Home') { event.preventDefault(); onChange(reset) }
      }}
    />
  )
}
