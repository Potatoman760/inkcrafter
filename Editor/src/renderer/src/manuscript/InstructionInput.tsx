import { Fragment, useMemo, useRef } from 'react'
import type { CodexEntry } from '@shared/codex'
import { findMentionsInProse } from '@shared/mentions'
import { Textarea } from '../design/components'

interface InstructionInputProps {
  value: string
  onChange: (value: string) => void
  entries: CodexEntry[]
  placeholder?: string
  rows?: number
}

/**
 * A textarea that underlines the codex names it recognises.
 *
 * A textarea cannot style its own content, so the text is drawn twice: an
 * invisible copy underneath carries the underlines, and the real textarea sits
 * on top with a transparent background. Both must agree on every property that
 * affects where a glyph lands, which is why the typography is set once in CSS
 * and shared by the two.
 */
export function InstructionInput({
  value,
  onChange,
  entries,
  placeholder,
  rows = 4
}: InstructionInputProps): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null)

  const parts = useMemo(() => {
    const mentions = findMentionsInProse(value, entries)
    const pieces: Array<{ text: string; hit: boolean }> = []
    let cursor = 0

    for (const mention of mentions) {
      // Overlapping hits from different entries: the first wins, the rest are
      // skipped rather than drawn twice.
      if (mention.from < cursor) continue
      if (mention.from > cursor) pieces.push({ text: value.slice(cursor, mention.from), hit: false })
      pieces.push({ text: value.slice(mention.from, mention.to), hit: true })
      cursor = mention.to
    }

    if (cursor < value.length) pieces.push({ text: value.slice(cursor), hit: false })
    return pieces
  }, [value, entries])

  return (
    <div className="highlight-input">
      <div className="highlight-backdrop" ref={backdropRef} aria-hidden="true">
        {parts.map((part, index) =>
          part.hit ? (
            <mark key={index}>{part.text}</mark>
          ) : (
            <Fragment key={index}>{part.text}</Fragment>
          )
        )}
        {/* A trailing newline is not laid out without something after it, which
            would desynchronise the two copies on the last line. */}
        {'​'}
      </div>

      <Textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          const backdrop = backdropRef.current
          if (backdrop) backdrop.scrollTop = event.currentTarget.scrollTop
        }}
      />
    </div>
  )
}
