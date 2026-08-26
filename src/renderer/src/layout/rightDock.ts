/**
 * The right-hand dock: which tab each view offers, and which one survives a
 * change of view.
 *
 * The app used to keep a separate pane state per view, which is how the
 * assistant ended up behind a modal — there was nowhere to put a tab that
 * belonged to every view at once, so the answer was a dialog, and the most
 * capable feature became the one that covered what you were asking about.
 *
 * One tab, shared. `assistant` is in every view's strip, so choosing it once
 * keeps it chosen everywhere; a tab the next view does not have falls back to
 * that view's own default rather than to the first thing in the list, so moving
 * from the editor's Preview to the manuscript lands on Reading rather than
 * somewhere arbitrary.
 */

export type ViewMode = 'editor' | 'manuscript' | 'plan' | 'game'

export type RightTab = 'assistant' | 'preview' | 'write' | 'reading' | 'structure'

/** In the order they are shown. The assistant leads, in every view. */
export const RIGHT_TABS: Record<ViewMode, readonly RightTab[]> = {
  editor: ['assistant', 'preview', 'write'],
  manuscript: ['assistant', 'reading', 'write'],
  plan: ['assistant', 'structure'],
  game: ['assistant']
}

/** What a view shows when the tab in hand is not one of its own. */
const DEFAULT_TAB: Record<ViewMode, RightTab> = {
  editor: 'preview',
  manuscript: 'reading',
  plan: 'structure',
  game: 'assistant'
}

export const RIGHT_TAB_LABELS: Record<RightTab, string> = {
  assistant: 'Assistant',
  preview: 'Preview',
  write: 'Write',
  reading: 'Reading',
  structure: 'Structure'
}

export const VIEW_LABELS: Record<ViewMode, string> = {
  editor: 'Editor',
  manuscript: 'Manuscript',
  plan: 'Plan',
  game: 'Game'
}

export function hasTab(view: ViewMode, tab: RightTab): boolean {
  return RIGHT_TABS[view].includes(tab)
}

/** The tab a view should show, given the one the author last chose. */
export function tabFor(view: ViewMode, wanted: RightTab): RightTab {
  return hasTab(view, wanted) ? wanted : DEFAULT_TAB[view]
}
