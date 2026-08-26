import {
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { emptyMedia } from '@shared/mediaDoc'
import { emptyNpcs } from '@shared/bundle/npcDoc'
import { emptyStats } from '@shared/statsDoc'
import { suggestTag, type Suggestion, type TagCatalogues } from '@shared/tagSuggest'
import { inkStreamLanguage } from './inkLanguage'

/**
 * The `#` tag menu, wired into CodeMirror.
 *
 * Thin on purpose: `suggestTag` decides what may follow what, and everything
 * here is about turning that into completions and keeping the catalogues where
 * a completion source can reach them. A completion source is called by the
 * editor rather than by React, so it cannot close over a prop — hence the
 * state field, which is the same shape the mention highlighter uses.
 */

/** Dispatched from React whenever a catalogue is loaded or edited. */
export const setTagCatalogues = StateEffect.define<TagCatalogues>()

const EMPTY: TagCatalogues = { media: emptyMedia(), stats: emptyStats(), npcs: emptyNpcs() }

const catalogueField = StateField.define<TagCatalogues>({
  create: () => EMPTY,
  update(catalogues, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTagCatalogues)) return effect.value
    }
    return catalogues
  }
})

/**
 * Turns one suggestion into a completion.
 *
 * `apply` rather than a plain string for two reasons, and both are why the walk
 * works at all: an option may replace text the menu is not filtering on — a
 * look reaches back over the name — and picking one has to be able to open the
 * next menu.
 */
function completionFor(
  suggestion: Suggestion,
  rank: number,
  lineStart: number,
  from: number
): Completion {
  return {
    label: suggestion.label,
    detail: suggestion.detail,
    // Ranked, because otherwise the menu sorts alphabetically and `anim` leads
    // a list whose first two entries should be `bg` and `char`. The order
    // `suggestTag` gives them is the order an author reaches for them.
    boost: 50 - rank,
    apply: (view: EditorView, _completion: Completion, _from: number, to: number) => {
      const start = lineStart + (suggestion.replaceFrom ?? from)
      view.dispatch({
        changes: { from: start, to, insert: suggestion.insert },
        selection: { anchor: start + suggestion.insert.length }
      })

      // The next segment, without the author having to ask for it. Queued
      // rather than called straight away: the dispatch above has not been
      // through the DOM yet, and a menu opened inside it reads the old state.
      if (suggestion.more) window.setTimeout(() => startCompletion(view), 0)
    }
  }
}

function tagSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const catalogues = context.state.field(catalogueField, false) ?? EMPTY

  const found = suggestTag(line.text, context.pos - line.from, catalogues)
  if (!found || found.options.length === 0) return null

  return {
    from: line.from + found.from,
    options: found.options.map((one, rank) => completionFor(one, rank, line.from, found.from)),
    // The menu stays open and refilters as the author types, rather than
    // closing and being reopened per keystroke — which is what makes typing
    // `ch` narrow to `char` instead of dismissing everything.
    validFor: /^\S*$/
  }
}

/**
 * Opened by typing `#`, as well as on the usual explicit request.
 *
 * Without this the menu only appears for a word character, and `#` is not one —
 * the author would have to know to press Ctrl-Space, which is exactly the
 * knowledge this feature exists to not require.
 */
const openOnHash = EditorView.inputHandler.of((view, _from, _to, text) => {
  if (text !== '#') return false
  window.setTimeout(() => startCompletion(view), 0)
  // False: the `#` itself is still inserted the ordinary way.
  return false
})

export function tagComplete(): Extension {
  return [catalogueField, inkStreamLanguage.data.of({ autocomplete: tagSource }), openOnHash]
}
