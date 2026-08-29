// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newEntry, type CodexEntry } from '@shared/codex'
import { emptyManuscript } from '@shared/manuscript'
import { installApi, junction, manuscript, prose, settings } from '../../../test/harness'
import { WritePanel } from './WritePanel'
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

/** Opening, a choice, then a second section — the example's shape. */
const twoSections = manuscript([
  prose('The door is shut.'),
  junction(['Try the handle', 'Look for another way'], 0),
  prose('It turns.'),
  prose('Wren does not look up from the ledger.')
])

function codexEntry(name: string, overrides: Partial<CodexEntry> = {}): CodexEntry {
  return {
    ...newEntry('lib_0000000000', name, 'character', name.toLowerCase()),
    id: `cdx_${name.toLowerCase().replace(/\W/g, '')}`,
    ...overrides
  }
}

const wren = codexEntry('Wren')
const archive = codexEntry('The Archive', { type: 'location' })
const codex = [wren, archive]

describe('WritePanel', () => {
  it('survives a section index that outlives its manuscript', async () => {
    installApi()

    // This is the shipped bug: following a source line selected section 1, and
    // leaving the view emptied the reading down to a single section. Indexing
    // past the end yields undefined, which a `=== null` guard does not catch,
    // and rendering it took down the whole tree.
    const stale = emptyManuscript('/p/ink/main.ink', 'ink/main.ink')
    expect(stale.nodes).toHaveLength(0)

    render(<WritePanel manuscript={stale} session={session()} sectionIndex={1} codexEntries={codex} />)

    expect(
      await screen.findByText(/Click a paragraph in the manuscript/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Section 2 of/)).not.toBeInTheDocument()
  })

  it('does not offer to draft when the section does not exist', async () => {
    installApi()
    render(<WritePanel manuscript={emptyManuscript('/p/a.ink', 'a.ink')} session={session()} sectionIndex={4} codexEntries={codex} />)

    expect(await screen.findByRole('button', { name: 'Draft this section' })).toBeDisabled()
  })

  it('describes the selected section', async () => {
    installApi()
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    expect(await screen.findByText(/Section 2 of 2/)).toBeInTheDocument()
    // "It turns." (2) + "Wren does not look up from the ledger." (8)
    expect(screen.getByText(/10 words/)).toBeInTheDocument()
  })

  it('shows which codex entries will be sent, found in the scene', async () => {
    installApi()
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)

    // Named in the section's own prose, not in any instruction.
    const chips = screen.getAllByRole('listitem').map((node) => node.textContent)
    expect(chips).toContain('Wren')
    expect(chips).not.toContain('The Archive')
  })

  it('picks up an entry named only in the instruction, as it is typed', async () => {
    installApi()
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)
    await userEvent.type(
      screen.getByRole('textbox', { name: /Instruction/ }),
      'Describe The Archive in winter.'
    )

    await waitFor(() =>
      expect(screen.getAllByRole('listitem').map((node) => node.textContent)).toContain(
        'The Archive'
      )
    )
  })

  it('underlines a recognised name in the instruction box', async () => {
    installApi()
    const { container } = render(
      <WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />
    )

    await screen.findByText(/Section 2 of 2/)
    await userEvent.type(
      screen.getByRole('textbox', { name: /Instruction/ }),
      'Have The Archive feel colder.'
    )

    await waitFor(() => {
      const marked = [...container.querySelectorAll('.highlight-backdrop mark')].map(
        (node) => node.textContent
      )
      expect(marked).toEqual(['The Archive'])
    })
  })

  it('says when nothing is recognised, rather than showing an empty strip', async () => {
    installApi()
    render(
      <WritePanel
        manuscript={manuscript([prose('An empty corridor.')])}
        session={session()}
        sectionIndex={0}
        codexEntries={codex}
      />
    )

    expect(await screen.findByText(/Nothing recognised/)).toBeInTheDocument()
  })

  it('says so when no provider is configured, rather than offering a dead button', async () => {
    installApi({ settings: { load: vi.fn(async () => settings({ providers: [], activeProviderId: null })) } })
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    expect(await screen.findByText(/No AI provider is configured/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Draft this section' })).not.toBeInTheDocument()
  })

  it('sends the section, instruction, length and model to the provider', async () => {
    const api = installApi()
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)
    await userEvent.type(
      screen.getByRole('textbox', { name: /Instruction/ }),
      'She finds the ledger open.'
    )
    await userEvent.click(screen.getByRole('radio', { name: '600' }))
    await userEvent.click(screen.getByRole('button', { name: 'Draft this section' }))

    await waitFor(() =>
      expect(api.ai.writeSection).toHaveBeenCalledWith({
        sectionIndex: 1,
        instruction: 'She finds the ledger open.',
        maxWords: 600,
        providerId: 'prv_0000000000',
        model: 'test-model'
      })
    )
  })

  it('shows a draft for review instead of applying it', async () => {
    const api = installApi()
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)
    await userEvent.click(screen.getByRole('button', { name: 'Draft this section' }))

    expect(await screen.findByDisplayValue('Drafted.')).toBeInTheDocument()
    expect(api.manuscript.compose).not.toHaveBeenCalled()
  })

  it('reports a provider failure and offers nothing to apply', async () => {
    installApi({
      ai: {
        writeSection: vi.fn(async () => ({ ok: false, text: '', message: '401 bad key', prompt: null }))
      }
    })
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)
    await userEvent.click(screen.getByRole('button', { name: 'Draft this section' }))

    expect(await screen.findByText('401 bad key')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Insert after' })).not.toBeInTheDocument()
  })

  it('disables replacing when the section cannot be overwritten, and says why', async () => {
    installApi({
      manuscript: {
        sectionReplaceable: vi.fn(async () => ({
          safe: false,
          reason: 'Line 15 is not plain prose — -> inside'
        }))
      }
    })
    render(<WritePanel manuscript={twoSections} session={session()} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)
    await userEvent.click(screen.getByRole('button', { name: 'Draft this section' }))
    await screen.findByDisplayValue('Drafted.')

    expect(screen.getByRole('button', { name: 'Replace section' })).toBeDisabled()
    // Inserting is additive, so it stays available whatever is in the span.
    expect(screen.getByRole('button', { name: 'Insert after' })).toBeEnabled()
    expect(screen.getByText(/Line 15 is not plain prose/)).toBeInTheDocument()
  })

  it('applies an edited draft rather than the original', async () => {
    const compose = vi.fn(async () => null)
    installApi()
    render(<WritePanel manuscript={twoSections} session={session({ compose })} sectionIndex={1} codexEntries={codex} />)

    await screen.findByText(/Section 2 of 2/)
    await userEvent.click(screen.getByRole('button', { name: 'Draft this section' }))

    const draft = await screen.findByDisplayValue('Drafted.')
    await userEvent.clear(draft)
    await userEvent.type(draft, 'Revised by hand.')
    await userEvent.click(screen.getByRole('button', { name: 'Insert after' }))

    await waitFor(() => expect(compose).toHaveBeenCalledWith(1, 'insert', 'Revised by hand.'))
  })
})
