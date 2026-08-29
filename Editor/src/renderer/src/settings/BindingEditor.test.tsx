// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkflowSummary } from '@shared/comfy'
import { BindingEditor } from './BindingEditor'

/**
 * Correcting what the app read out of a workflow.
 *
 * Driven straight through its props, the way `ModelPicker` is tested: the
 * editor never reaches for `window.inkcrafter`, so none of this needs a stubbed
 * bridge or a running ComfyUI.
 */

function summary(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    file: 'portrait.json',
    name: 'portrait',
    problem: null,
    override: {},
    role: 'creates',
    roleByHand: false,
    isDefault: false,
    bindings: {
      positive: { node: '6', field: 'text' },
      negative: { node: '7', field: 'text' },
      image: null,
      width: { node: '5', field: 'width' },
      height: { node: '5', field: 'height' },
      seed: { node: '3', field: 'seed' },
      checkpoint: null,
      batch: null,
      output: { node: '9', field: 'images' }
    },
    analysis: {
      sampler: '3',
      role: 'creates',
      roleNote: 'nothing loads a picture, so it makes one from nothing',
      problems: [],
      candidates: {},
      notes: { positive: 'followed KSampler #3 positive → CLIPTextEncode #6 text' },
      detected: {
        positive: { node: '6', field: 'text' },
        negative: { node: '7', field: 'text' },
        image: null,
        width: { node: '5', field: 'width' },
        height: { node: '5', field: 'height' },
        seed: { node: '3', field: 'seed' },
        checkpoint: null,
        batch: null,
        output: { node: '9', field: 'images' }
      },
      nodes: [
        { id: '3', classType: 'KSampler', title: null, fields: [{ name: 'seed', value: 1 }] },
        { id: '5', classType: 'EmptyLatentImage', title: null, fields: [{ name: 'width', value: 512 }, { name: 'height', value: 512 }] },
        { id: '6', classType: 'CLIPTextEncode', title: 'Positive', fields: [{ name: 'text', value: 'a harbour' }] },
        { id: '7', classType: 'CLIPTextEncode', title: null, fields: [{ name: 'text', value: 'blurry' }] },
        { id: '9', classType: 'SaveImage', title: null, fields: [] }
      ]
    },
    ...overrides
  }
}

function editor(workflow = summary(), promptPrefix = '') {
  const onSet = vi.fn()
  const onClear = vi.fn()
  const onRole = vi.fn()
  const onDefault = vi.fn()
  const onPromptPrefix = vi.fn()
  render(
    <BindingEditor
      workflow={workflow}
      promptPrefix={promptPrefix}
      onSet={onSet}
      onClear={onClear}
      onRole={onRole}
      onDefault={onDefault}
      onPromptPrefix={onPromptPrefix}
      siblings={2}
    />
  )
  return { onSet, onClear, onRole, onDefault, onPromptPrefix }
}

describe('BindingEditor', () => {
  it('shows how each binding was arrived at, not just what it is', () => {
    editor()
    // Checkable at a glance against the graph they built.
    expect(screen.getByText(/followed KSampler #3 positive → CLIPTextEncode #6 text/)).toBeTruthy()
  })

  it('names the node by its class and the title the author gave it', () => {
    editor()
    const picker = screen.getByLabelText('Prompt node') as HTMLSelectElement
    expect(picker.value).toBe('6')
    expect(screen.getAllByRole('option', { name: '#6 CLIPTextEncode — Positive' }).length).toBeGreaterThan(0)
  })

  it('sets text to prepend to this workflow prompt, and clears it with an empty field', async () => {
    const added = editor()
    await userEvent.type(screen.getByLabelText('Prompt prefix'), '<lora:wren:0.8>,')
    await userEvent.tab()
    expect(added.onPromptPrefix).toHaveBeenCalledWith('<lora:wren:0.8>,')

    const cleared = editor(summary(), '<lora:wren:0.8>,')
    const fields = screen.getAllByLabelText('Prompt prefix')
    await userEvent.clear(fields.at(-1)!)
    await userEvent.tab()
    expect(cleared.onPromptPrefix).toHaveBeenCalledWith(null)
  })

  it('repoints a slot, keeping the input name where the new node has it', async () => {
    const { onSet } = editor()
    await userEvent.selectOptions(screen.getByLabelText('Prompt node'), '7')

    // Both are CLIPTextEncode, so `text` carries across rather than resetting.
    expect(onSet).toHaveBeenCalledWith('positive', { node: '7', field: 'text' })
  })

  it('falls back to the new node’s first input when the old name is gone', async () => {
    const { onSet } = editor()
    await userEvent.selectOptions(screen.getByLabelText('Prompt node'), '5')

    expect(onSet).toHaveBeenCalledWith('positive', { node: '5', field: 'width' })
  })

  it('unbinds a slot deliberately rather than forgetting the correction', async () => {
    const { onSet } = editor()
    await userEvent.selectOptions(screen.getByLabelText('Negative prompt node'), '')

    // Null, not a cleared override: "leave this alone" is an instruction.
    expect(onSet).toHaveBeenCalledWith('negative', null)
  })

  it('offers auto only where the author has taken over, and hands the slot back', async () => {
    expect(screen.queryByRole('button', { name: 'auto' })).toBeNull()

    const { onClear } = editor(summary({ override: { positive: { node: '7', field: 'text' } } }))
    await userEvent.click(screen.getByRole('button', { name: 'auto' }))

    expect(onClear).toHaveBeenCalledWith('positive')
  })

  it('says a hand-set slot is hand-set instead of showing a stale note', () => {
    editor(summary({ override: { positive: { node: '7', field: 'text' } } }))

    expect(screen.getByText('Set by hand.')).toBeTruthy()
    expect(screen.queryByText(/followed KSampler/)).toBeNull()
  })

  it('has no input picker for the output, since nothing is written to it', () => {
    editor()
    expect(screen.getByLabelText('Saved image node')).toBeTruthy()
    expect(screen.queryByLabelText('Saved image input')).toBeNull()
  })

  it('shows what is wrong with the graph above the slots', () => {
    editor(
      summary({
        analysis: {
          ...summary().analysis!,
          problems: ['Positive and negative both lead to CLIPTextEncode #6.']
        }
      })
    )

    expect(screen.getByText(/both lead to CLIPTextEncode #6/)).toBeTruthy()
  })

  it('says what the workflow is for, and why', () => {
    editor()
    expect(screen.getByText(/nothing loads a picture/)).toBeTruthy()
  })

  it('lets the author overrule what was read, and hand it back', async () => {
    const { onRole } = editor()
    await userEvent.click(screen.getByRole('radio', { name: 'Edits' }))
    expect(onRole).toHaveBeenCalledWith('edits')

    const set = editor(summary({ role: 'edits', roleByHand: true }))
    await userEvent.click(screen.getAllByRole('button', { name: 'auto' })[0]!)
    expect(set.onRole).toHaveBeenCalledWith(null)
  })

  it('offers the source picture only on a workflow that takes one', () => {
    editor()
    expect(screen.queryByLabelText('Source picture node')).toBeNull()

    editor(summary({ role: 'edits', roleByHand: true }))
    expect(screen.getByLabelText('Source picture node')).toBeTruthy()
  })

  it('makes this the one used when none is named', async () => {
    const { onDefault } = editor()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onDefault).toHaveBeenCalledWith(true)
  })

  it('offers no choice where there is none to make', () => {
    // The only workflow of its kind is already the one used, so a tick that
    // cannot be unticked would be a control that does nothing.
    render(
      <BindingEditor
        workflow={summary({ isDefault: true })}
        promptPrefix=""
        onSet={vi.fn()}
        onClear={vi.fn()}
        onRole={vi.fn()}
        onDefault={vi.fn()}
        onPromptPrefix={vi.fn()}
        siblings={1}
      />
    )

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(/only workflow that creates/)).toBeTruthy()
  })

  it('replaces the whole editor when the file was not an API export', () => {
    editor(
      summary({
        analysis: null,
        problem: 'This is a workflow saved from the ComfyUI canvas. Use Workflow → Export (API).'
      })
    )

    expect(screen.getByText(/Export \(API\)/)).toBeTruthy()
    expect(screen.queryByLabelText('Prompt node')).toBeNull()
  })
})
