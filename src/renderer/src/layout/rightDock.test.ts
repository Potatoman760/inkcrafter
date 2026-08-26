import { describe, expect, it } from 'vitest'
import { RIGHT_TABS, hasTab, tabFor, type RightTab, type ViewMode } from './rightDock'

const VIEWS = Object.keys(RIGHT_TABS) as ViewMode[]

/**
 * The claim this makes is "the assistant is available everywhere", and a tab
 * strip is exactly the sort of thing that can quietly stop being true for one
 * view. So it is asserted over the whole table rather than for the cases
 * somebody remembered.
 */
describe('the right-hand dock', () => {
  it('offers the assistant in every view', () => {
    for (const view of VIEWS) {
      expect(hasTab(view, 'assistant'), view).toBe(true)
    }
  })

  it('leads with the assistant, wherever you are', () => {
    for (const view of VIEWS) {
      expect(RIGHT_TABS[view][0], view).toBe('assistant')
    }
  })

  it('keeps the assistant selected across every change of view', () => {
    for (const view of VIEWS) {
      expect(tabFor(view, 'assistant'), view).toBe('assistant')
    }
  })

  it('keeps a tab the next view also has', () => {
    // Write is in both, so moving between them should not disturb it.
    expect(tabFor('manuscript', 'write')).toBe('write')
    expect(tabFor('editor', 'write')).toBe('write')
  })

  /**
   * Falling back to the view's own default rather than to the first tab in the
   * list: the editor's Preview has no counterpart in the manuscript, and
   * Reading is the answer there — not the assistant, which would make every
   * view change feel like being interrupted.
   */
  it('falls back to what the view is for, and comes back unchanged', () => {
    expect(tabFor('manuscript', 'preview')).toBe('reading')
    expect(tabFor('editor', 'reading')).toBe('preview')
    expect(tabFor('plan', 'preview')).toBe('structure')
    expect(tabFor('game', 'preview')).toBe('assistant')
  })

  it('never lands on a tab the view does not have', () => {
    const all: RightTab[] = ['assistant', 'preview', 'write', 'reading', 'structure']

    for (const view of VIEWS) {
      for (const tab of all) {
        expect(hasTab(view, tabFor(view, tab)), `${view} ${tab}`).toBe(true)
      }
    }
  })
})
