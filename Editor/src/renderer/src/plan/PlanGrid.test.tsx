// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newEntry, type CodexEntry, type CodexType } from '@shared/codex'
import {
  newPlanNode,
  planFromMarkdown,
  parsePlan,
  serialisePlan,
  type PlanDocument
} from '@shared/planDoc'
import { PlanGrid } from './PlanGrid'
import { PlanMatrix } from './PlanMatrix'

const SOURCE = [
  '# Act One',
  '',
  'The situation.',
  '',
  '## The door',
  'status: drafting',
  'tags: night',
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

function entry(name: string, type: CodexType = 'character'): CodexEntry {
  return {
    ...newEntry('lib_0000000000', name, type, name.toLowerCase()),
    id: `cdx_${name.toLowerCase().replace(/\W/g, '')}`
  }
}

const codex = [entry('Wren'), entry('The Archive', 'location')]
function transfer(): DataTransfer {
  const data = new Map<string, string>()
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    dropEffect: 'none',
    effectAllowed: 'none'
  } as unknown as DataTransfer
}

function grid(source: string | PlanDocument = SOURCE): {
  onChange: ReturnType<typeof vi.fn>
  onOpenEntry: ReturnType<typeof vi.fn>
  onCreateScene: ReturnType<typeof vi.fn>
  plan: PlanDocument
} {
  const onChange = vi.fn()
  const onOpenEntry = vi.fn()
  const onCreateScene = vi.fn()
  const plan = typeof source === 'string' ? planFromMarkdown(source) : source
  render(
    <PlanGrid
      plan={plan}
      entries={codex}
      onChange={onChange}
      onCreateScene={onCreateScene}
      onOpenEntry={onOpenEntry}
      onOpenFile={vi.fn()}
      onExpand={vi.fn()}
      onImport={vi.fn()}
    />
  )
  return { onChange, onOpenEntry, onCreateScene, plan }
}

function planWithScenes(): PlanDocument {
  const plan = planFromMarkdown(SOURCE)
  const door = plan.nodes[0]!.children[0]!
  const inside = plan.nodes[0]!.children[1]!
  const ledger = plan.nodes[1]!.children[0]!
  door.children = [
    { ...newPlanNode('Opening'), files: ['ink/scenes/opening.ink'] },
    { ...newPlanNode('The choice'), files: ['ink/scenes/the-choice.ink'] }
  ]
  inside.children = [{ ...newPlanNode('Aftermath'), files: ['ink/scenes/aftermath.ink'] }]
  ledger.children = []
  return plan
}

describe('PlanGrid', () => {
  it('groups chapters under their act', () => {
    grid()

    expect(screen.getByDisplayValue('Act One')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Act Two')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The door' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The ledger' })).toBeInTheDocument()
  })

  it('drags a chapter before the first chapter in its act', () => {
    const { onChange } = grid()
    const dataTransfer = transfer()
    const handle = screen.getByRole('button', { name: 'Drag Inside' })
    const firstCard = screen.getByRole('button', { name: 'The door' }).closest('.plan-card-drop')!

    fireEvent.dragStart(handle, { dataTransfer })
    fireEvent.dragOver(firstCard, { dataTransfer })
    expect(firstCard).toHaveClass('is-drop-target')
    fireEvent.drop(firstCard, { dataTransfer })

    const next = onChange.mock.calls[0]![0] as PlanDocument
    expect(next.nodes[0]!.children.map((chapter) => chapter.title)).toEqual(['Inside', 'The door'])
  })

  it('reorders scenes within a chapter', () => {
    const { onChange } = grid(planWithScenes())
    const dataTransfer = transfer()
    const handle = screen.getByRole('button', { name: 'Drag scene The choice' })
    const firstScene = screen.getByRole('button', { name: /^Opening/ }).closest('.plan-scene')!

    fireEvent.dragStart(handle, { dataTransfer })
    fireEvent.dragOver(firstScene, { dataTransfer })
    expect(firstScene).toHaveClass('is-drop-target')
    fireEvent.drop(firstScene, { dataTransfer })

    const next = onChange.mock.calls[0]![0] as PlanDocument
    expect(next.nodes[0]!.children[0]!.children.map((scene) => scene.title)).toEqual([
      'The choice',
      'Opening'
    ])
  })

  it('moves a scene to another chapter without losing its Ink file', () => {
    const plan = planWithScenes()
    const moved = plan.nodes[0]!.children[0]!.children[0]!
    const { onChange } = grid(plan)
    const dataTransfer = transfer()
    const targetChapter = screen.getByRole('button', { name: 'The ledger' }).closest('.plan-card-drop')!

    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag scene Opening' }), {
      dataTransfer
    })
    fireEvent.dragOver(targetChapter, { dataTransfer })
    expect(screen.getByLabelText('Scenes in The ledger')).toHaveClass('is-drop-target')
    fireEvent.drop(targetChapter, { dataTransfer })

    const next = onChange.mock.calls[0]![0] as PlanDocument
    expect(next.nodes[0]!.children[0]!.children.map((scene) => scene.title)).toEqual([
      'The choice'
    ])
    const destination = next.nodes[1]!.children[0]!.children[0]!
    expect(destination.id).toBe(moved.id)
    expect(destination.files).toEqual(['ink/scenes/opening.ink'])
  })

  it('shows a chapter with its summary, tags and the characters in it', () => {
    grid()

    expect(screen.getByText('She arrives. Wren does not answer.')).toBeInTheDocument()
    expect(screen.getByText('night')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wren' })).toBeInTheDocument()
  })

  it('offers a way in when there is nothing planned', () => {
    grid('')
    expect(screen.getByRole('button', { name: 'Add an act' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paste an outline/ })).toBeInTheDocument()
  })

  it('hands back a whole plan when a status changes', async () => {
    const { onChange } = grid()

    await userEvent.selectOptions(screen.getByLabelText('Status of The door'), 'done')

    const next = onChange.mock.calls[0]![0]
    expect(next.nodes[0].children[0].status).toBe('done')
    // Everything else is untouched — the grid edits a tree, not text.
    expect(next.nodes[0].children[1].title).toBe('Inside')
    expect(next.nodes[1].title).toBe('Act Two')
  })

  it('keeps status on its own row below the title bar', () => {
    grid()
    const status = screen.getByLabelText('Status of The door')

    expect(status.parentElement).toHaveClass('plan-status-row')
    expect(status.closest('.ic-card__head')).toBeNull()
  })

  /**
   * A Scene says how far along it is the same way the chapter holding it does.
   * The colour is CSS, so what is pinned here is the hook it hangs on — and
   * that a Scene nobody has set a status on carries no hook at all, rather than
   * an empty one that would draw a line in the fallback colour.
   */
  it('marks a Scene with its status, and leaves one without alone', () => {
    const plan = planWithScenes()
    const scenes = plan.nodes[0]!.children[0]!.children
    scenes[0]!.status = 'drafting'

    grid(plan)

    const drafting = screen.getByRole('button', { name: /^Opening/ }).closest('.plan-scene')!
    const unset = screen.getByRole('button', { name: /^The choice/ }).closest('.plan-scene')!

    expect(drafting).toHaveAttribute('data-status', 'drafting')
    expect(unset).not.toHaveAttribute('data-status')
  })

  it('edits a chapter title and summary through the card', async () => {
    const { onChange } = grid()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))

    const title = screen.getByLabelText('Chapter title')
    await userEvent.clear(title)
    await userEvent.type(title, 'The gate')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const next = onChange.mock.calls[0]![0]
    expect(next.nodes[0].children[0].title).toBe('The gate')
  })

  it('keeps the rest of the card while an edit is open', async () => {
    grid()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))

    // Editing used to replace the whole card body, so the status, the cast, the
    // Scenes all vanished the moment a title was clicked.
    expect(screen.getByLabelText('Chapter summary')).toBeInTheDocument()
    expect(screen.getByLabelText('Status of The door')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand The door' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wren' })).toBeInTheDocument()
    expect(screen.getByLabelText('Scenes in The door')).toBeInTheDocument()
  })

  it('changes a status without leaving the edit', async () => {
    const { onChange } = grid()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    await userEvent.selectOptions(screen.getByLabelText('Status of The door'), 'done')

    expect(onChange.mock.calls[0]![0].nodes[0].children[0].status).toBe('done')
    // Still editing: the status applies straight through and is not part of the
    // draft the Save button governs.
    expect(screen.getByLabelText('Chapter summary')).toBeInTheDocument()
  })

  it('backs out of an edit without changing anything', async () => {
    const { onChange } = grid()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    const title = screen.getByLabelText('Chapter title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Something else entirely')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onChange).not.toHaveBeenCalled()
    // And the card is back to what the node still says.
    expect(screen.getByRole('button', { name: 'The door' })).toBeInTheDocument()
  })

  it('backs out on Escape too', async () => {
    const { onChange } = grid()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    await userEvent.type(screen.getByLabelText('Chapter summary'), ' and then more{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('She arrives. Wren does not answer.')).toBeInTheDocument()
  })

  it('reopens a cancelled edit with the original text, not the abandoned draft', async () => {
    grid()

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    const title = screen.getByLabelText('Chapter title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Abandoned')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    expect(screen.getByLabelText('Chapter title')).toHaveValue('The door')
  })

  it('expands a chapter, and an act, by id', async () => {
    const onExpand = vi.fn()
    const plan = planFromMarkdown(SOURCE)

    render(
      <PlanGrid
        plan={plan}
        entries={codex}
        onChange={vi.fn()}
        onCreateScene={vi.fn()}
        onOpenEntry={vi.fn()}
        onOpenFile={vi.fn()}
        onExpand={onExpand}
        onImport={vi.fn()}
      />
    )

    await userEvent.click(screen.getByLabelText('Expand The door'))
    expect(onExpand).toHaveBeenCalledWith(plan.nodes[0]!.children[0]!.id)

    await userEvent.click(screen.getByLabelText('Expand Act One'))
    expect(onExpand).toHaveBeenLastCalledWith(plan.nodes[0]!.id)
  })

  it('keeps node ids across an edit, so anything referring to one still resolves', async () => {
    const { onChange, plan } = grid()
    const doorId = plan.nodes[0]!.children[0]!.id
    const insideId = plan.nodes[0]!.children[1]!.id

    await userEvent.click(screen.getByRole('button', { name: 'The door' }))
    const title = screen.getByLabelText('Chapter title')
    await userEvent.clear(title)
    await userEvent.type(title, 'The gate')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const next = onChange.mock.calls[0]![0]
    // Positional ids would have moved with the rename; generated ones do not.
    expect(next.nodes[0].children[0].id).toBe(doorId)
    expect(next.nodes[0].children[1].id).toBe(insideId)
  })

  it('gives a node added later an id of its own', async () => {
    const { onChange, plan } = grid()
    const existing = new Set(plan.nodes[0]!.children.map((node) => node.id))

    await userEvent.click(screen.getAllByRole('button', { name: 'Add chapter' })[0]!)

    const added = onChange.mock.calls[0]![0].nodes[0].children[2]
    expect(added.id).toMatch(/^pln_/)
    expect(existing.has(added.id)).toBe(false)
  })

  it('round-trips an edit through the file format', async () => {
    const { onChange } = grid()

    await userEvent.selectOptions(screen.getByLabelText('Status of Inside'), 'planned')

    const next = onChange.mock.calls[0]![0]
    const reparsed = parsePlan(serialisePlan(next))

    expect(reparsed.nodes[0]!.children[1]!.status).toBe('planned')
    expect(reparsed.nodes[0]!.children[0]!.summary).toBe('She arrives. Wren does not answer.')
    expect(reparsed.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two'])
  })

  it('adds a chapter to the act whose button was pressed', async () => {
    const { onChange } = grid()

    await userEvent.click(screen.getAllByRole('button', { name: 'Add chapter' })[1]!)

    const next = onChange.mock.calls[0]![0]
    expect(next.nodes[1].children.map((node: { title: string }) => node.title)).toEqual([
      'The ledger',
      'New chapter'
    ])
    expect(next.nodes[0].children).toHaveLength(2)
  })

  it('adds an act at the end', async () => {
    const { onChange } = grid()

    await userEvent.type(screen.getByLabelText('New act title'), 'Act Three')
    await userEvent.click(screen.getByRole('button', { name: 'Add act' }))

    const next = onChange.mock.calls[0]![0]
    expect(next.nodes.map((node: { title: string }) => node.title)).toEqual([
      'Act One',
      'Act Two',
      'Act Three'
    ])
  })

  it('asks the app to create a Scene and its mandatory Ink file', async () => {
    const { onCreateScene, plan } = grid()
    const chapter = plan.nodes[0]!.children[0]!

    await userEvent.type(screen.getByLabelText('New scene in The door'), 'First meeting')
    await userEvent.click(screen.getByLabelText('Add scene to The door'))

    expect(onCreateScene).toHaveBeenCalledWith(chapter.id, 'First meeting')
  })

  it('opens a codex entry from a chapter’s cast', async () => {
    const { onOpenEntry } = grid()

    await userEvent.click(screen.getByRole('button', { name: 'Wren' }))
    expect(onOpenEntry).toHaveBeenCalledWith('cdx_wren')
  })
})

describe('PlanMatrix', () => {
  function matrix(source = SOURCE): ReturnType<typeof vi.fn> {
    const onOpenEntry = vi.fn()
    render(<PlanMatrix plan={planFromMarkdown(source)} entries={codex} onOpenEntry={onOpenEntry} />)
    return onOpenEntry
  }

  it('lists every chapter across every act as a column', () => {
    matrix()

    for (const title of ['The door', 'Inside', 'The ledger']) {
      expect(screen.getByRole('columnheader', { name: title })).toBeInTheDocument()
    }
  })

  it('marks only the chapters a character appears in', () => {
    matrix()

    expect(
      screen.getByLabelText('Wren appears in The door')
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Wren does not appear in The ledger')
    ).toBeInTheDocument()
  })

  it('does not add non-character codex entries as Matrix rows', () => {
    matrix('# Act One\n\n## Arrival\n\nWren enters The Archive.\n')

    expect(screen.getByRole('button', { name: 'Wren' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'The Archive' })).not.toBeInTheDocument()
  })

  it('says so when no entry is named anywhere, rather than showing an empty grid', () => {
    matrix('# Act One\n\n## Nothing\n\nAn empty corridor.\n')
    expect(screen.getByText(/No characters are named/)).toBeInTheDocument()
  })
})
