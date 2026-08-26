// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyComfySettings, type WorkflowRole, type WorkflowSummary } from '@shared/comfy'
import type { AppSettings } from '@shared/settings'
import { installApi, settings as appSettings } from '../../../test/harness'
import { ComfyUiTab } from './ComfyUiTab'
import type { Settings } from './useSettings'

/**
 * The tab's own wiring.
 *
 * `BindingEditor` is tested through its props, which is right for what it does
 * — but it left a gap exactly the width of this bug: the switch called its
 * callback, the callback wrote the setting, and the list was never asked for
 * again, so the control looked dead while working perfectly. A test on the
 * callback passes throughout. This one holds the settings the way the real
 * hook does and watches what the tab asks main for.
 */

function summary(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    file: 'krea2.json',
    name: 'krea2',
    problem: null,
    override: {},
    role: 'creates',
    roleByHand: false,
    isDefault: true,
    bindings: {
      positive: { node: '6', field: 'text' },
      negative: null,
      image: null,
      width: null,
      height: null,
      seed: null,
      checkpoint: null,
      batch: null,
      output: { node: '9', field: 'images' }
    },
    analysis: {
      nodes: [{ id: '6', classType: 'CLIPTextEncode', title: null, fields: [{ name: 'text', value: 'a harbour' }] }],
      sampler: '3',
      role: 'creates',
      roleNote: 'nothing loads a picture, so it makes one from nothing',
      detected: {
        positive: { node: '6', field: 'text' },
        negative: null,
        image: null,
        width: null,
        height: null,
        seed: null,
        checkpoint: null,
        batch: null,
        output: { node: '9', field: 'images' }
      },
      notes: {},
      candidates: {},
      problems: []
    },
    ...overrides
  }
}

/**
 * Renders the tab over settings that behave the way `useSettings` does: main
 * answers with the whole object, and the new one becomes the state.
 */
function tab(workflows: WorkflowSummary[], legacy = false) {
  const list = vi.fn(async () => ({ ok: true, dir: 'C:/wf', message: '', workflows }))
  const setComfyRole = vi.fn()
  const setComfyPromptPrefix = vi.fn()
  installApi({ comfy: { workflows: list } })
  const initial = appSettings()
  if (legacy) delete (initial.comfy as Partial<typeof initial.comfy>).promptPrefixes

  function Host(): React.JSX.Element {
    const [current, setCurrent] = useState<AppSettings>(initial)

    const settings = {
      settings: current,
      loading: false,
      error: null,
      setComfyRole: async (file: string, role: WorkflowRole | null) => {
        setComfyRole(file, role)
        // What main sends back, and what the hook then holds.
        setCurrent((was) => ({
          ...was,
          comfy: { ...emptyComfySettings(), roles: role ? { [file]: role } : {} }
        }))
      },
      setComfyBaseUrl: vi.fn(),
      setComfyWorkflowDir: vi.fn(),
      setComfyTimeout: vi.fn(),
      setComfyPromptPrefix: async (file: string, prefix: string | null) => {
        setComfyPromptPrefix(file, prefix)
        setCurrent((was) => ({
          ...was,
          comfy: {
            ...was.comfy,
            promptPrefixes: prefix ? { ...was.comfy.promptPrefixes, [file]: prefix } : {}
          }
        }))
      },
      setComfyBinding: vi.fn(),
      clearComfyBinding: vi.fn(),
      setComfyDefault: vi.fn()
    } as unknown as Settings

    return <ComfyUiTab settings={settings} />
  }

  render(<Host />)
  return { list, setComfyRole, setComfyPromptPrefix }
}

describe('ComfyUiTab', () => {
  it('opens a workflow from a legacy settings payload with no prefix map', async () => {
    tab([summary()], true)

    expect(await screen.findByLabelText('Prompt prefix')).toHaveValue('')
    expect(screen.getByLabelText('Prompt node')).toBeInTheDocument()
  })

  it('asks main again when the author changes what a workflow is for', async () => {
    const { list, setComfyRole } = tab([summary(), summary({ file: 'b.json', name: 'b', isDefault: false })])
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('radio', { name: 'Edits' }))

    expect(setComfyRole).toHaveBeenCalledWith('krea2.json', 'edits')
    // The reading lives in main, so the answer has to come back from there —
    // without this the switch writes the setting and nothing on screen moves.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('names the switch for a screen reader', async () => {
    tab([summary()])
    // Segmented takes `label`; an aria-label passed to it is silently dropped,
    // because TypeScript does not check hyphenated JSX attributes.
    expect(await screen.findByRole('radiogroup', { name: 'What this workflow does' })).toBeTruthy()
  })

  it('shows what each workflow is for in the list', async () => {
    tab([summary(), summary({ file: 'edit.json', name: 'edit', role: 'edits', isDefault: false })])

    await screen.findByText('krea2')

    // Scoped to the list: the switch beside it says the same words.
    const rows = document.querySelectorAll('.comfy-list .ic-row')
    expect(Array.from(rows).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Creates'),
      expect.stringContaining('Edits')
    ])
  })

  it('saves a prompt prefix against the selected workflow', async () => {
    const { setComfyPromptPrefix } = tab([summary()])
    const field = await screen.findByLabelText('Prompt prefix')

    await userEvent.type(field, '<lora:storybook:1>,')
    await userEvent.tab()

    expect(setComfyPromptPrefix).toHaveBeenCalledWith('krea2.json', '<lora:storybook:1>,')
  })
})
