// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WriteInkResult } from '@shared/ai'
import { newEntry, type CodexEntry } from '@shared/codex'
import { emptyPlan, planFromMarkdown, type PlanDocument } from '@shared/planDoc'
import type { Project } from '@shared/project'
import { installApi } from '../../../test/harness'
import { InkWritePanel } from './InkWritePanel'

const FILE = `=== the_winch ===
The winch complains. Idris does not look at the boat.
-> END
`

const PROJECT: Project = {
  id: 'prj_0000000000',
  title: 'The Lighthouse',
  libraries: [],
  main: 'ink/main.ink',
  description: '',
  bundleOut: null,
  path: '/w/data/projects/the-lighthouse'
}

function entry(name: string): CodexEntry {
  return { ...newEntry('lib_0000000000', name, 'character', name.toLowerCase()), id: `cdx_${name}` }
}

function planFor(file: string): PlanDocument {
  const plan = planFromMarkdown(
    '# The Island\n\nThe cove and the lantern room.\n\n' +
      '## Arrival\n\nVance lands with papers.\n\n' +
      '### The winch\n\nThe cable.\n\n### Papers\n\nThe folder.\n'
  )
  const act = plan.nodes[0]!
  const chapter = act.children[0]!
  const scene = chapter.children[0]!
  return {
    ...plan,
    nodes: [
      {
        ...act,
        children: [{ ...chapter, children: [{ ...scene, files: [file] }, ...chapter.children.slice(1)] }]
      }
    ]
  }
}

function result(overrides: Partial<WriteInkResult> = {}): WriteInkResult {
  return {
    ok: true,
    text: '* [Refuse]\n    -> END',
    message: null,
    prompt: 'p',
    compiles: true,
    compileError: null,
    ...overrides
  }
}

function panel(
  options: {
    writeInk?: ReturnType<typeof vi.fn>
    selection?: string
    plan?: PlanDocument
    entries?: CodexEntry[]
    filePath?: string | null
  } = {}
): { writeInk: ReturnType<typeof vi.fn>; onInsert: ReturnType<typeof vi.fn> } {
  const writeInk = options.writeInk ?? vi.fn(async () => result())
  installApi({ ai: { writeInk } })
  const onInsert = vi.fn()

  render(
    <InkWritePanel
      project={PROJECT}
      filePath={options.filePath === undefined ? 'ink/chapters/arrival.ink' : options.filePath}
      source={FILE}
      selection={options.selection ?? ''}
      codexEntries={options.entries ?? [entry('Idris'), entry('Mara')]}
      plan={options.plan ?? emptyPlan()}
      onInsert={onInsert}
    />
  )

  return { writeInk, onInsert }
}

async function write(instruction = 'Add a refusal.'): Promise<void> {
  const button = screen.getByRole('button', { name: 'Write ink' })
  await waitFor(() => expect(button).toBeEnabled())

  await userEvent.type(screen.getByRole('textbox', { name: /Instruction/ }), instruction)
  await userEvent.click(button)
}

describe('InkWritePanel', () => {
  it('says what it will send before sending it', () => {
    panel({ plan: planFor('ink/chapters/arrival.ink') })

    expect(screen.getByText('ink/chapters/arrival.ink')).toBeInTheDocument()
    expect(screen.getByText('The Island › Arrival › The winch')).toBeInTheDocument()
  })

  // The context list is the "builder" part: it has to agree with what the main
  // process will actually assemble, which is why both use selectCodexEntries.
  it('lists only the codex entries actually named in the file', () => {
    panel()

    expect(screen.getByText('Idris')).toBeInTheDocument()
    expect(screen.queryByText('Mara')).not.toBeInTheDocument()
  })

  it('says plainly when the file is attached to nothing in the plan', () => {
    panel()
    expect(screen.getByText(/Not attached to anything in the plan/)).toBeInTheDocument()
  })

  it('says the draft goes in at the cursor when nothing is selected', () => {
    panel()
    expect(screen.getByText(/Nothing selected/)).toBeInTheDocument()
  })

  it('says the draft would replace the selection when there is one', () => {
    panel({ selection: 'The winch complains.' })
    expect(screen.getByText(/which the draft would replace/)).toBeInTheDocument()
  })

  it('sends the file, the selection and the instruction', async () => {
    const { writeInk } = panel({ selection: 'The winch complains.' })

    await write('Add a refusal.')

    expect(writeInk).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'ink/chapters/arrival.ink',
        source: FILE,
        selection: 'The winch complains.',
        instruction: 'Add a refusal.'
      }),
      PROJECT
    )
  })

  it('shows the draft and confirms it compiles', async () => {
    panel()
    await write()

    expect(await screen.findByLabelText('Drafted ink')).toHaveValue('* [Refuse]\n    -> END')
    expect(screen.getByText('compiles where it would go')).toBeInTheDocument()
  })

  // Reported, not enforced: a draft that does not compile is usually still most
  // of what was wanted, and refusing to show it would be worse.
  it('offers a draft that does not compile, with the reason', async () => {
    panel({
      writeInk: vi.fn(async () =>
        result({ compiles: false, compileError: "Divert target not found: '-> nowhere'" })
      )
    })
    await write()

    expect(await screen.findByText('does not compile')).toBeInTheDocument()
    expect(screen.getByText(/Divert target not found/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert at cursor' })).toBeEnabled()
  })

  it('inserts the draft, including edits made to it first', async () => {
    const { onInsert } = panel()
    await write()

    const box = await screen.findByLabelText('Drafted ink')
    await userEvent.clear(box)
    // `[[` is how user-event types a literal bracket; a bare `[` opens a key
    // descriptor, which is unfortunate when the text being typed is ink.
    await userEvent.type(box, '+ [[Wait]')
    await userEvent.click(screen.getByRole('button', { name: 'Insert at cursor' }))

    expect(onInsert).toHaveBeenCalledWith('+ [Wait]')
  })

  it('names the button for what it will do to a selection', async () => {
    panel({ selection: 'The winch complains.' })
    await write()

    expect(await screen.findByRole('button', { name: 'Replace selection' })).toBeInTheDocument()
  })

  it('discards a draft without inserting it', async () => {
    const { onInsert } = panel()
    await write()

    await userEvent.click(await screen.findByRole('button', { name: 'discard' }))

    expect(screen.queryByLabelText('Drafted ink')).not.toBeInTheDocument()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('reports a failure instead of an empty draft', async () => {
    panel({ writeInk: vi.fn(async () => result({ ok: false, text: '', message: '401 bad key' })) })
    await write()

    expect(await screen.findByText('401 bad key')).toBeInTheDocument()
    expect(screen.queryByLabelText('Drafted ink')).not.toBeInTheDocument()
  })

  it('has nothing to offer without a file open, and says so', () => {
    panel({ filePath: null })

    expect(screen.getByText(/Open an ink file to draft into it/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Write ink' })).not.toBeInTheDocument()
  })
})
