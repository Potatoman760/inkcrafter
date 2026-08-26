import { useLayoutEffect, useRef } from 'react'
import { Textarea, type TextareaProps } from '../design/components'

/**
 * A codex textarea that keeps its caret through a controlled draft update.
 *
 * Codex forms redraw several pieces of surrounding UI when they first become
 * dirty. Chromium can drop the textarea selection during that commit after a
 * selected range is deleted, leaving a field that still looks present but no
 * longer accepts typing where the author was working. Remembering the
 * browser's post-edit selection and restoring it before paint makes the
 * controlled update indistinguishable from editing a plain textarea.
 */
export function CodexTextarea({
  value,
  onChange,
  ...props
}: Omit<TextareaProps, 'ref'>): React.JSX.Element {
  const field = useRef<HTMLTextAreaElement | null>(null)
  const caret = useRef<{
    start: number
    end: number
    direction: 'forward' | 'backward' | 'none'
  } | null>(null)

  useLayoutEffect(() => {
    const pending = caret.current
    const textarea = field.current
    caret.current = null
    if (!pending || !textarea) return

    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(pending.start, pending.end, pending.direction)
  }, [value])

  return (
    <Textarea
      {...props}
      ref={field}
      value={value}
      onChange={(event) => {
        caret.current = {
          start: event.currentTarget.selectionStart,
          end: event.currentTarget.selectionEnd,
          direction: event.currentTarget.selectionDirection
        }
        onChange?.(event)
      }}
    />
  )
}
