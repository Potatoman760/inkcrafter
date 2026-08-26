import { useEffect, useState } from 'react'
import { copy } from '@shared/copy'
import { isOverridden, type PromptDefaults, type PromptKind } from '@shared/prompts'
import type { Settings } from './useSettings'
import { Button, Field, Hint, Textarea } from '../design/components'

/**
 * The instructions the app gives the model, open for changing.
 *
 * Two of the three are replaced outright and the third is only added to, and
 * that is not an inconsistency to tidy away. Prose and ink are single strings
 * describing a voice, so the worst a replacement can do is produce writing the
 * author did not want — which they will read, and can undo. The assistant's
 * carries the tool routing table and a worked example of every file format; a
 * prompt with those edited out still reads like a prompt and quietly cannot
 * call anything, and the author would have no way to tell that from a bad day.
 *
 * "Reset to default" clears the override rather than pasting the app's text
 * back in. The difference shows up a version later, when a prompt is improved:
 * an author who reset gets the better one, and an author holding a copy does
 * not.
 */

interface Editable {
  kind: PromptKind
  title: string
  about: string
  /** What the box says when it is empty. */
  placeholder: string
}

const EDITABLE: readonly Editable[] = [
  {
    kind: 'prose',
    title: 'Drafting prose',
    about: copy('prompts.prose'),
    placeholder: 'Loading…'
  },
  {
    kind: 'ink',
    title: 'Drafting ink',
    about: copy('prompts.ink'),
    placeholder: 'Loading…'
  },
  {
    kind: 'assistant',
    title: 'The assistant',
    about: copy('prompts.assistant'),
    placeholder: 'Always write in present tense. This story is second person.'
  }
]

export function PromptsTab({ settings }: { settings: Settings }): React.JSX.Element {
  const [defaults, setDefaults] = useState<PromptDefaults | null>(null)
  /** Which prompt's built-in text is open for reading. */
  const [reading, setReading] = useState<PromptKind | null>(null)
  /**
   * What is in each box.
   *
   * Held here rather than read from settings on every keystroke: a prompt is
   * paragraphs, and writing to disk per character would be a debounce fighting
   * a text field. They are saved when the box loses focus.
   */
  const [drafts, setDrafts] = useState<Partial<Record<PromptKind, string>>>({})

  useEffect(() => {
    let live = true
    void window.inkcrafter.settings.promptDefaults().then((shipped) => {
      if (live) setDefaults(shipped)
    })
    return () => {
      live = false
    }
  }, [])

  const overrides = settings.settings.prompts

  /**
   * The text to show for one prompt.
   *
   * The author's if they have written one; otherwise the app's own, so the box
   * opens on what is actually being sent and editing is a change to that
   * rather than a blank page. The assistant is the exception: its box is only
   * ever the author's addition, because the rest is not theirs to hold.
   */
  const shown = (kind: PromptKind): string => {
    const draft = drafts[kind]
    if (draft !== undefined) return draft
    if (kind === 'assistant') return overrides.assistant
    return overrides[kind] ?? defaults?.[kind] ?? ''
  }

  const save = async (kind: PromptKind): Promise<void> => {
    const text = drafts[kind]
    if (text === undefined) return

    // Typing the default back is the same request as pressing reset, and
    // storing it would freeze a copy that stops improving.
    const same = kind !== 'assistant' && text.trim() === (defaults?.[kind] ?? '').trim()
    await settings.setPrompt(kind, same ? null : text)
    setDrafts((current) => ({ ...current, [kind]: undefined }))
  }

  const reset = async (kind: PromptKind): Promise<void> => {
    setDrafts((current) => ({ ...current, [kind]: undefined }))
    await settings.setPrompt(kind, null)
  }

  return (
    <div className="prompts-tab">
      <Hint>
        These are the instructions sent with every request, before anything about
        your story. The app&apos;s own are written against the ink compiler and its
        own tool list, so a change here is worth reading back.
      </Hint>

      {EDITABLE.map((one) => {
        const changed = isOverridden(overrides, one.kind)

        return (
          <Field
            key={one.kind}
            as="div"
            label={one.title}
            about={one.about}
            className="prompt-field"
          >
            <Textarea
              className="prompt-box"
              rows={one.kind === 'assistant' ? 4 : 14}
              value={shown(one.kind)}
              placeholder={one.placeholder}
              aria-label={one.title}
              disabled={defaults === null}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [one.kind]: event.target.value }))
              }
              onBlur={() => void save(one.kind)}
            />

            <div className="detail-row">
              {changed ? (
                <Hint tight>Changed from the app&apos;s own.</Hint>
              ) : (
                <Hint tight>Unchanged.</Hint>
              )}

              {one.kind === 'assistant' && (
                <Button
                  icon="book-open"
                  onClick={() => setReading(reading === 'assistant' ? null : 'assistant')}
                >
                  {reading === 'assistant' ? 'Hide what it says' : 'Read what it says'}
                </Button>
              )}

              <Button icon="rotate-ccw" disabled={!changed} onClick={() => void reset(one.kind)}>
                Reset to default
              </Button>
            </div>

            {reading === one.kind && defaults && (
              <pre className="prompt-read">{defaults[one.kind]}</pre>
            )}
          </Field>
        )
      })}
    </div>
  )
}
