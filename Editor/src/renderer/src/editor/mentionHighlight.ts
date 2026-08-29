import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { Mention } from '@shared/mentions'

/** Dispatched from React whenever the codex or the detected mentions change. */
export const setMentions = StateEffect.define<Mention[]>()

function decorationsFor(mentions: Mention[], docLength: number): DecorationSet {
  const ranges = mentions
    // Mention detection is debounced, so a burst of typing can leave a mention
    // pointing past the end of the document for a frame.
    .filter((mention) => mention.from < mention.to && mention.to <= docLength)
    .map((mention) =>
      Decoration.mark({
        class: 'cm-codex-mention',
        attributes: { 'data-codex-id': mention.entryId }
      }).range(mention.from, mention.to)
    )

  return Decoration.set(ranges, true)
}

const mentionField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setMentions)) next = decorationsFor(effect.value, transaction.state.doc.length)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field)
})

const mentionTheme = EditorView.baseTheme({
  '.cm-codex-mention': {
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'var(--syntax-mention)',
    textUnderlineOffset: '3px',
    cursor: 'pointer'
  },
  '.cm-codex-mention:hover': {
    backgroundColor: 'var(--state-info-bg)'
  }
})

/**
 * Underlines codex mentions and opens the entry when one is clicked.
 *
 * `onOpen` is read through a callback rather than captured directly because the
 * editor is constructed once and must not be torn down when React re-renders.
 */
export function codexMentions(onOpen: (entryId: string) => void): Extension {
  return [
    mentionField,
    mentionTheme,
    EditorView.domEventHandlers({
      mousedown(event) {
        const target = event.target as HTMLElement | null
        const mention = target?.closest?.('.cm-codex-mention')
        const entryId = mention?.getAttribute('data-codex-id')
        // Plain click still places the cursor; only a modified click navigates,
        // so clicking into a name to edit it keeps working.
        if (!entryId || !(event.ctrlKey || event.metaKey)) return false
        event.preventDefault()
        onOpen(entryId)
        return true
      }
    })
  ]
}
