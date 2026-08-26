// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newPlanNode, planFromMarkdown, type PlanDocument } from '@shared/planDoc'
import { PlanOutline } from './PlanOutline'

const SOURCE = [
  '# Act One',
  '',
  'The situation.',
  '',
  '## The door',
  '',
  'She arrives. Wren does not answer.',
  '',
  '## Inside',
  '',
  'The shelves.',
  '',
  '# Act Two',
  '',
  '## The ledger',
  ''
].join('\n')

function withScenes(): PlanDocument {
  const plan = planFromMarkdown(SOURCE)
  plan.nodes[0]!.children[0]!.children = [
    { ...newPlanNode('Knocking'), summary: 'Three knocks, no answer.', files: ['ink/knocking.ink'] },
    { ...newPlanNode('The key'), summary: 'She finds it under the stone.' }
  ]
  return plan
}

function outline(source: string | PlanDocument = SOURCE): {
  onChange: ReturnType<typeof vi.fn>
  onOpenFile: ReturnType<typeof vi.fn>
  onExpand: ReturnType<typeof vi.fn>
  plan: PlanDocument
} {
  const onChange = vi.fn()
  const onOpenFile = vi.fn()
  const onExpand = vi.fn()
  const plan = typeof source === 'string' ? planFromMarkdown(source) : source
  render(
    <PlanOutline
      plan={plan}
      onChange={onChange}
      onOpenFile={onOpenFile}
      onExpand={onExpand}
      onImport={vi.fn()}
    />
  )
  return { onChange, onOpenFile, onExpand, plan }
}

describe('PlanOutline', () => {
  it('reads the whole story in order, act by act', () => {
    outline()

    const headings = screen.getAllByRole('heading').map((one) => one.textContent)
    expect(headings).toEqual([
      'Act 1Act One',
      'The door',
      'Inside',
      'Act 2Act Two',
      'The ledger'
    ])
  })

  it('shows the summary of every act, chapter and scene', () => {
    outline(withScenes())

    for (const summary of [
      'The situation.',
      'She arrives. Wren does not answer.',
      'The shelves.',
      'Three knocks, no answer.',
      'She finds it under the stone.'
    ]) {
      expect(screen.getByRole('button', { name: summary })).toBeInTheDocument()
    }
  })

  it('numbers chapters across the whole story rather than restarting each act', () => {
    outline()

    expect(screen.getByText('Chapter 3')).toBeInTheDocument()
    expect(screen.queryAllByText('Chapter 1')).toHaveLength(1)
  })

  it('says a summary is missing rather than leaving a blank box', () => {
    outline('# Act One\n\n## Arrival\n')

    expect(screen.getByRole('button', { name: 'What happens in this chapter.' })).toBeInTheDocument()
  })

  it('edits a chapter summary where it stands', async () => {
    const { onChange, plan } = outline()

    await userEvent.click(screen.getByRole('button', { name: 'The shelves.' }))
    const box = screen.getByRole('textbox', { name: 'Summary of Inside' })
    await userEvent.clear(box)
    await userEvent.type(box, 'Dust on every shelf.')
    await userEvent.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0]![0] as PlanDocument
    expect(next.nodes[0]!.children[1]!.summary).toBe('Dust on every shelf.')
    // The tree is rebuilt rather than mutated, so nothing else can have moved.
    expect(plan.nodes[0]!.children[1]!.summary).toBe('The shelves.')
    expect(next.nodes[0]!.children[0]!.summary).toBe('She arrives. Wren does not answer.')
  })

  it('renames a chapter from its heading', async () => {
    const { onChange } = outline()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    const field = screen.getByRole('textbox', { name: 'Chapter 1 title' })
    await userEvent.clear(field)
    await userEvent.type(field, 'The doorway{Enter}')

    const next = onChange.mock.calls[0]![0] as PlanDocument
    expect(next.nodes[0]!.children[0]!.title).toBe('The doorway')
  })

  it('discards an edit on Escape', async () => {
    const { onChange } = outline()

    await userEvent.click(screen.getByRole('button', { name: 'The shelves.' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Summary of Inside' }),
      ' And dust.{Escape}'
    )

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'The shelves.' })).toBeInTheDocument()
  })

  it('opens the ink behind a scene that has a file, and expands one that does not', async () => {
    const { onOpenFile, onExpand, plan } = outline(withScenes())

    await userEvent.click(screen.getByRole('button', { name: 'Open ink/knocking.ink' }))
    expect(onOpenFile).toHaveBeenCalledWith('ink/knocking.ink')

    expect(screen.queryByRole('button', { name: 'Open ink/the-key.ink' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expand The key' }))
    expect(onExpand).toHaveBeenCalledWith(plan.nodes[0]!.children[0]!.children[1]!.id)
  })

  it('offers a way in when nothing is planned yet', async () => {
    const { onChange } = outline({ version: 1, notes: '', globals: [], nodes: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Add an act' }))
    const next = onChange.mock.calls[0]![0] as PlanDocument
    expect(next.nodes).toHaveLength(1)
  })

  it('counts what hangs off each act and chapter', () => {
    outline(withScenes())

    const act = screen.getByRole('region', { name: 'Act One' })
    expect(within(act).getByText('2 chapters')).toBeInTheDocument()
    expect(within(act).getByText('2 scenes')).toBeInTheDocument()
    expect(within(act).getByText('0 scenes')).toBeInTheDocument()
  })
})
