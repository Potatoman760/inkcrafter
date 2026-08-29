import { useEffect, useRef, useState } from 'react'
import type { Editability } from '@shared/manuscript'
import { Textarea } from '../design/components'

interface EditableLineProps {
  text: string
  edit: Editability
  className: string
  /** Rendered instead of the raw text while not editing, for mention links. */
  children: React.ReactNode
  onSave: (text: string) => void
}

/**
 * A line that can be rewritten in place.
 *
 * Editing here writes to the ink file — it is the save format for both views —
 * so a line the runtime assembled rather than read has nothing to write to and
 * says so instead of pretending.
 */
export function EditableLine({
  text,
  edit,
  className,
  children,
  onSave
}: EditableLineProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setDraft(text), [text])

  // Grow to fit, so a long paragraph does not edit through a letterbox.
  useEffect(() => {
    const area = areaRef.current
    if (!editing || !area) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
  }, [editing])

  const commit = (): void => {
    setEditing(false)
    if (draft.trim() !== text.trim() && draft.trim().length > 0) onSave(draft.trim())
    else setDraft(text)
  }

  if (!editing) {
    return (
      <span
        className={`${className} ${edit.editable ? 'is-editable' : 'is-locked'}`}
        title={edit.reason ?? 'Click to edit'}
        onDoubleClick={() => {
          if (edit.editable) setEditing(true)
        }}
      >
        {children}
      </span>
    )
  }

  return (
    <Textarea
      ref={areaRef}
      className={`${className} line-editor`}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        event.target.style.height = 'auto'
        event.target.style.height = `${event.target.scrollHeight}px`
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setDraft(text)
          setEditing(false)
        }
      }}
    />
  )
}
