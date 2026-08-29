// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project } from '@shared/project'
import type { SearchHit } from '@shared/types'
import { installApi } from '../../../test/harness'
import { SearchDialog } from './SearchDialog'

/**
 * Finding text across the project's ink.
 *
 * The behaviour worth pinning is the one that is easy to get backwards: a
 * single click selects and only a double-click opens. A row that opened on the
 * first click would jump the author out of the dialog every time they went to
 * read the line under the cursor.
 */

const project: Project = {
  id: 'prj_2n8v5h1t6w',
  title: 'Breedhaven',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  path: 'C:/projects/breedhaven',
  bundleOut: null
}

const hit = (overrides: Partial<SearchHit> = {}): SearchHit => ({
  file: 'chapter2/maren.ink',
  line: 141,
  column: 4,
  length: 14,
  preview: '=== maren_intimacy ===',
  ...overrides
})

function open(hits: SearchHit[], problem: string | null = null) {
  const api = installApi({
    search: { ink: vi.fn(async () => ({ hits, capped: false, problem })) }
  })
  const onOpen = vi.fn()
  const onClose = vi.fn()

  const view = render(<SearchDialog project={project} onOpen={onOpen} onClose={onClose} />)

  return { api, onOpen, onClose, ...view }
}

const type = async (query: string): Promise<void> => {
  await userEvent.type(screen.getByLabelText('Find in ink files'), query)
}

describe('SearchDialog', () => {
  it('shows what came back, under the file it came from', async () => {
    open([hit(), hit({ line: 121, preview: '-> maren_intimacy', column: 3 })])
    await type('maren_intimacy')

    expect(await screen.findByText('chapter2/maren.ink')).toBeInTheDocument()
    expect(await screen.findByText('141')).toBeInTheDocument()
    expect(await screen.findByText('121')).toBeInTheDocument()
  })

  it('marks the matched text inside the line', async () => {
    open([hit()])
    await type('maren_intimacy')

    await screen.findByText('141')

    expect(document.querySelector('.search-find__text mark')).toHaveTextContent('maren_intimacy')
  })

  it('opens on a double-click, and closes on the way through', async () => {
    const { onOpen, onClose } = open([hit()])
    await type('maren_intimacy')

    await userEvent.dblClick(await screen.findByText('141'))

    expect(onOpen).toHaveBeenCalledWith('chapter2/maren.ink', 141)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not open on a single click', async () => {
    const { onOpen, onClose } = open([hit()])
    await type('maren_intimacy')

    await userEvent.click(await screen.findByText('141'))

    expect(onOpen).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  // The reported crash: select the row, then open it. A double-click delivers
  // two clicks before the dblclick, so the row is always in this state by the
  // time it opens — the first click just makes it explicit.
  it('opens a row that was clicked before it was double-clicked', async () => {
    const { onOpen, onClose } = open([hit()])
    await type('maren_intimacy')

    const row = await screen.findByText('141')
    await userEvent.click(row)
    await userEvent.dblClick(row)

    expect(onOpen).toHaveBeenCalledWith('chapter2/maren.ink', 141)
    expect(onClose).toHaveBeenCalled()
  })

  // Double-click is not a keystroke, so the field has to be able to do it too.
  it('opens the current hit on Enter in the search field', async () => {
    const { onOpen } = open([hit(), hit({ line: 121 })])
    await type('maren_intimacy')
    await screen.findByText('141')

    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onOpen).toHaveBeenCalledWith('chapter2/maren.ink', 121)
  })

  /*
   * The crash: selecting a row, then closing the dialog.
   *
   * `scrollIntoView` returns a value in a real browser, and an effect with a
   * concise body passes it straight back to React, which keeps it as the
   * clean-up and calls it on unmount. It only ever bit the second time, because
   * the effect does not re-run until `index` changes — which takes a click on a
   * row that is not already the current one.
   *
   * The setup file stubs `scrollIntoView` as returning nothing, which is what
   * made every earlier test blind to it, so the browser's behaviour goes back
   * for the length of this one.
   */
  it('leaves React no clean-up to call after a row has been selected', async () => {
    const stub = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView() {
      return 'what a browser really returns' as unknown as void
    }

    try {
      const { unmount } = open([hit(), hit({ line: 121 })])
      await type('maren_intimacy')

      // The second row: clicking the first would set the index to what it
      // already is, and the effect would never run again.
      await userEvent.click(await screen.findByText('121'))

      expect(() => unmount()).not.toThrow()
    } finally {
      Element.prototype.scrollIntoView = stub
    }
  })

  it('passes the match options through', async () => {
    const { api } = open([])
    await userEvent.click(screen.getByLabelText('Match case'))
    await type('Maren')

    await waitFor(() =>
      expect(api.search.ink).toHaveBeenCalledWith(
        project,
        expect.objectContaining({ query: 'Maren', caseSensitive: true, regex: false })
      )
    )
  })

  it('reports a half-typed regular expression', async () => {
    open([], 'Unterminated group')
    await userEvent.click(screen.getByLabelText('Regular expression'))
    await type('(maren')

    expect(await screen.findByText('Unterminated group')).toBeInTheDocument()
  })
})
