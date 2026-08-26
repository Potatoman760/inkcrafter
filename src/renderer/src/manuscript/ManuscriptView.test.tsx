// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ManuscriptNode } from '@shared/manuscript'
import { installApi, junction, manuscript, prose } from '../../../test/harness'
import { ManuscriptView } from './ManuscriptView'
import type { ManuscriptSession } from './useManuscript'

function session(overrides: Partial<ManuscriptSession> = {}): ManuscriptSession {
  return {
    manuscript: manuscript(),
    loading: false,
    error: null,
    choose: vi.fn(),
    edit: vi.fn(),
    traceTo: vi.fn(),
    compose: vi.fn(async () => null),
    setTag: vi.fn(async () => {}),
    clearTag: vi.fn(async () => {}),
    dismissError: vi.fn(),
    traced: null,
    reload: vi.fn(),
    ...overrides
  }
}

function view(
  m = manuscript(),
  overrides: Partial<Parameters<typeof ManuscriptView>[0]> = {}
): {
  onSelectSection: ReturnType<typeof vi.fn>
  onOpenSource: ReturnType<typeof vi.fn>
  container: HTMLElement
} {
  const onSelectSection = vi.fn()
  const onOpenSource = vi.fn()
  installApi()

  const { container } = render(
    <ManuscriptView
      session={session({ manuscript: m })}
      entryLabel="ink/main.ink"
      codexEntries={[]}
      onOpenSource={onOpenSource}
      onOpenEntry={vi.fn()}
      selectedSection={null}
      onSelectSection={onSelectSection}
      {...overrides}
    />
  )

  return { onSelectSection, onOpenSource, container }
}

const twoSections = manuscript([
  prose('The door is shut.', { source: { file: 'ink/main.ink', line: 11 } }),
  junction(['Try the handle', 'Look for another way'], 0),
  prose('It turns.', { source: { file: 'ink/main.ink', line: 31 } })
])

describe('ManuscriptView', () => {
  it('reads as continuous prose with the junction in place', () => {
    view(twoSections)

    expect(screen.getByText('The door is shut.')).toBeInTheDocument()
    expect(screen.getByText('It turns.')).toBeInTheDocument()
    // Every option is listed, not only the one taken.
    expect(screen.getByRole('button', { name: /Try the handle/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Look for another way/ })).toBeInTheDocument()
  })

  it('marks the taken option and leaves the others choosable', () => {
    view(twoSections)

    expect(screen.getByRole('button', { name: /Try the handle/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Look for another way/ })).toBeEnabled()
  })

  it('selects a section when its prose is clicked', async () => {
    const { onSelectSection } = view(twoSections)

    await userEvent.click(screen.getByText('The door is shut.'))
    expect(onSelectSection).toHaveBeenCalledWith(0)

    await userEvent.click(screen.getByText('It turns.'))
    expect(onSelectSection).toHaveBeenLastCalledWith(1)
  })

  it('follows a source line without also selecting the section', async () => {
    // The regression: the line-number button sits inside the paragraph, so its
    // click used to bubble and select a section on the way out of the view.
    const { onOpenSource, onSelectSection } = view(twoSections)

    await userEvent.click(screen.getByRole('button', { name: '31' }))

    expect(onOpenSource).toHaveBeenCalledWith({ file: 'ink/main.ink', line: 31 })
    expect(onSelectSection).not.toHaveBeenCalled()
  })

  it('passes a chosen option to the session', async () => {
    const choose = vi.fn()
    const m = twoSections
    installApi()
    render(
      <ManuscriptView
        session={session({ manuscript: m, choose })}
        entryLabel="ink/main.ink"
        codexEntries={[]}
        onOpenSource={vi.fn()}
        onOpenEntry={vi.fn()}
        selectedSection={null}
        onSelectSection={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Look for another way/ }))
    const junctionNode = m.nodes[1]!
    expect(choose).toHaveBeenCalledWith(junctionNode.id, 1)
  })

  it('shows compiler problems instead of an empty page', () => {
    const broken = manuscript()
    broken.diagnostics = ["ERROR: 'main.ink' line 2: Divert target not found"]
    view(broken)

    expect(screen.getByText(/does not compile/)).toBeInTheDocument()
    expect(screen.getByText(/Divert target not found/)).toBeInTheDocument()
  })

  it('says why a reading stopped looping rather than just ending', () => {
    view(
      manuscript([
        prose('Round and round.'),
        { kind: 'ending', id: 'e1', reason: 'loop', message: 'Stopped after 5000 lines.' }
      ])
    )

    expect(screen.getByText('Stopped after 5000 lines.')).toBeInTheDocument()
    expect(screen.queryByText('The End')).not.toBeInTheDocument()
  })

  it('marks the end of a completed reading', () => {
    view(manuscript([prose('Done.'), { kind: 'ending', id: 'e1', reason: 'end', message: null }]))
    expect(screen.getByText('The End')).toBeInTheDocument()
  })
})

/**
 * The reading is grouped into sections so a rail can sit beside each one, and
 * the grouping has to keep meaning exactly what `sectionsOf` means — that is
 * what the write panel and the staging calls are keyed on.
 */
describe('grouping the reading', () => {
  const ending = (): ManuscriptNode => ({
    kind: 'ending',
    id: 'e1',
    reason: 'end',
    message: null
  })

  it('still draws the ending, which sectionsOf would have dropped', () => {
    view(manuscript([prose('The last line.'), ending()]))

    expect(screen.getByText('The End')).toBeInTheDocument()
  })

  /**
   * An ending closes the run so that "The End" is not drawn inside the block it
   * ends, but it does not open a section. Emitting one anyway put a second
   * block on screen carrying an index already in use, and selecting a section
   * opened two rails.
   */
  it('gives each index one block, even after an ending', () => {
    const { container } = view(manuscript([prose('The last line.'), ending()]))

    expect(container.querySelectorAll('.manuscript-section')).toHaveLength(1)
  })

  it('numbers sections by junction, so an ending does not shift them', () => {
    const { container } = view(
      manuscript([prose('One.'), junction(['On'], 0), prose('Two.'), ending()]),
      { selectedSection: 1 }
    )

    const selected = container.querySelectorAll('.manuscript-section.is-selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toContain('Two.')
  })

  /** Tag-only ink lines: staging with no words, which the rail shows instead. */
  it('does not render a paragraph for a line that was only tags', () => {
    const { container } = view(
      manuscript([prose('', { tags: ['bg: grove'] }), prose('Real words.')])
    )

    expect(container.querySelectorAll('.manuscript-prose')).toHaveLength(1)
  })
})

/**
 * A refusal is the outcome of a command, not part of the manuscript.
 *
 * It used to be printed between the header and the hint as a bare line with no
 * spacing and no way to get rid of it. `App` toasts it now, and clears it, so
 * the reading stays the reading.
 */
describe('what a refusal does not do', () => {
  it('is not printed into the reading', () => {
    const { container } = view(manuscript([prose('The portal opens.')]), {
      session: session({
        manuscript: manuscript([prose('The portal opens.')]),
        error: 'No path reaches "seedblossom". Nothing diverts there.'
      })
    })

    expect(screen.queryByText(/No path reaches/)).not.toBeInTheDocument()
    expect(container.querySelector('.codex-error')).not.toBeInTheDocument()
  })

  /** A story that does not compile is different: it is state, and it stays. */
  it('still says so when the story does not compile', () => {
    const broken = manuscript([])
    broken.diagnostics = ['main.ink(3): expected a divert target']

    view(broken)

    expect(screen.getByText(/expected a divert target/)).toBeInTheDocument()
  })
})
