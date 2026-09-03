/**
 * The right-hand dock: which tab each view offers, and which one survives a
 * change of view.
 *
 * The app used to keep a separate pane state per view, which is how the
 * assistant ended up behind a modal — there was nowhere to put a tab that
 * belonged to every view at once, so the answer was a dialog, and the most
 * capable feature became the one that covered what you were asking about.
 *
 * One tab, shared. `assistant` and `debug` are in every view's strip — the
 * compiler's problems belong to the story rather than to whichever view is
 * open — so choosing either once keeps it chosen everywhere; a tab the next view does not have falls back to
 * that view's own default rather than to the first thing in the list, so moving
 * from the editor's Preview to the manuscript lands on Reading rather than
 * somewhere arbitrary.
 */

export type ViewMode = 'editor' | 'manuscript' | 'plan' | 'game'

export type RightTab = 'assistant' | 'preview' | 'reading' | 'structure' | 'debug'

/**
 * Whether the shared tab is the writer rather than the assistant.
 *
 * Writing used to be a tab of its own, in both the editor and the manuscript.
 * It is the same slot as the assistant now, and which of the two it holds is
 * decided by the view rather than chosen: the manuscript has something to write
 * into, and nothing else does.
 */
export function isWriteView(view: ViewMode): boolean {
  return view === 'manuscript'
}

/** What the shared tab is called here, since it is not one thing everywhere. */
export function tabLabel(view: ViewMode, tab: RightTab): string {
  return tab === 'assistant' && isWriteView(view) ? 'Write' : RIGHT_TAB_LABELS[tab]
}

/**
 * In the order they are shown.
 *
 * The assistant leads everywhere except the editor, where the preview does: the
 * editor is the one view whose own work is on the left, and what an author
 * wants beside a line they are writing is that line running.
 */
export const RIGHT_TABS: Record<ViewMode, readonly RightTab[]> = {
  editor: ['preview', 'assistant', 'debug'],
  manuscript: ['assistant', 'reading', 'debug'],
  plan: ['assistant', 'structure', 'debug'],
  game: ['assistant', 'debug']
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
  reading: 'Reading',
  structure: 'Structure',
  debug: 'Debug'
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
