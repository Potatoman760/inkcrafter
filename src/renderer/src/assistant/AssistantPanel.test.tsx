// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatTurnResult } from '@shared/chat'
import { newEntry } from '@shared/codex'
import { installApi } from '../../../test/harness'
import { AssistantPanel } from './AssistantPanel'
import { useAssistant } from './useAssistant'

function turn(overrides: Partial<ChatTurnResult> = {}): ChatTurnResult {
  return { ok: true, messages: [], message: null, truncated: false, filesWritten: [], ...overrides }
}

/** Renders the dialog against a live `useAssistant`, as App does. */
function dialog(
  chat = vi.fn(async () => turn({ messages: [assistantSays('Done.')] })),
  panel: Partial<Parameters<typeof AssistantPanel>[0]> = {}
): {
  chat: typeof chat
  onFilesWritten: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  installApi({ ai: { chat } })
  const onFilesWritten = vi.fn()
  const onClose = vi.fn()

  function Host(): React.JSX.Element {
    const assistant = useAssistant()
    return (
      <AssistantPanel
        assistant={assistant}
        projectPath="/w/data/projects/the-lighthouse"
        projectTitle="The Lighthouse"
        onFilesWritten={onFilesWritten}
        {...panel}
      />
    )
  }

  render(<Host />)
  return { chat, onFilesWritten, onClose }
}

const assistantSays = (
  content: string,
  toolCalls?: { id: string; name: string; argumentsJson: string; summary: string; ok: boolean }[]
): { id: string; role: 'assistant'; content: string; toolCalls?: typeof toolCalls } => ({
  id: `a_${content.slice(0, 4)}`,
  role: 'assistant',
  content,
  ...(toolCalls ? { toolCalls } : {})
})

async function send(text: string): Promise<void> {
  // Settings arrive asynchronously and the box is disabled until a provider is
  // known, so typing straight away would go nowhere.
  const box = screen.getByLabelText('Message the assistant')
  await waitFor(() => expect(box).toBeEnabled())

  await userEvent.type(box, text)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('AssistantPanel', () => {
  it('takes focus back from a stale editor when its dock tab opens', async () => {
    const staleEditor = document.createElement('div')
    staleEditor.contentEditable = 'true'
    staleEditor.tabIndex = 0
    document.body.append(staleEditor)
    staleEditor.focus()

    dialog(undefined, { takeFocus: true })
    const box = screen.getByLabelText('Message the assistant')
    await waitFor(() => expect(box).toBeEnabled())
    await waitFor(() => expect(box).toHaveFocus())
  })

  it('repairs stale focus when the prompt itself is clicked', async () => {
    dialog()
    const box = screen.getByLabelText('Message the assistant')
    await waitFor(() => expect(box).toBeEnabled())
    const staleEditor = document.createElement('div')
    staleEditor.contentEditable = 'true'
    staleEditor.tabIndex = 0
    document.body.append(staleEditor)
    staleEditor.focus()

    await userEvent.click(box)

    expect(box).toHaveFocus()
    await userEvent.type(box, 'Still typing')
    expect(box).toHaveValue('Still typing')
  })

  it('says which project it is working in', async () => {
    dialog()
    expect(await screen.findByText('The Lighthouse')).toBeInTheDocument()
  })

  it('sends the message and shows the reply', async () => {
    const { chat } = dialog()

    await send('Make me a project.')

    expect(await screen.findByText('Done.')).toBeInTheDocument()
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: '/w/data/projects/the-lighthouse',
        messages: [expect.objectContaining({ role: 'user', content: 'Make me a project.' })]
      })
    )
  })

  it('flushes the editor before the assistant reads or writes files', async () => {
    const chat = vi.fn(async () => turn({ messages: [assistantSays('Done.')] }))
    const onBeforeSend = vi.fn(async () => {})
    dialog(chat, { onBeforeSend })

    await send('Change this chapter.')

    expect(onBeforeSend).toHaveBeenCalledOnce()
    expect(onBeforeSend.mock.invocationCallOrder[0]).toBeLessThan(chat.mock.invocationCallOrder[0]!)
  })

  it('shows the detected context above the input and expands its details', async () => {
    const wren = newEntry('lib_world', 'Wren')
    dialog(undefined, {
      context: { view: 'editor', file: 'ink/main.ink' },
      contextText: 'Wren waits beside the door.',
      codexEntries: [wren]
    })

    const toggle = screen.getByRole('button', { name: /Context/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Ink editor · ink/main.ink · 1 codex')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Wren')).toBeInTheDocument()
  })

  it('sends exactly the codex entries previewed by the context bar', async () => {
    const chat = vi.fn(async () => turn({ messages: [assistantSays('Done.')] }))
    const wren = newEntry('lib_world', 'Wren')
    dialog(chat, {
      context: { view: 'editor', file: 'ink/main.ink' },
      codexEntries: [wren]
    })

    await send('Ask Wren about the light.')

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          codexEntryIds: [wren.id],
          detectedCodexEntryIds: [wren.id]
        })
      })
    )
  })

  it('keeps the question in the transcript', async () => {
    dialog()
    await send('Make me a project.')
    expect(screen.getByText('Make me a project.')).toBeInTheDocument()
  })

  // A file appearing on disk with no visible cause is what would make this
  // untrustworthy, so the record of what it did is not behind a toggle.
  it('shows every tool call it made', async () => {
    const chat = vi.fn(async () =>
      turn({
        messages: [
          assistantSays('Made it.', [
            { id: 'c0', name: 'write_file', argumentsJson: '{"path":"a.ink"}', summary: 'wrote a.ink (12 chars)', ok: true },
            { id: 'c1', name: 'list_files', argumentsJson: '{}', summary: 'listed the workspace — 3 entries', ok: true }
          ])
        ],
        filesWritten: ['a.ink']
      })
    )
    dialog(chat)

    await send('Go.')

    expect(await screen.findByRole('button', { name: 'wrote a.ink (12 chars)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /listed the workspace/ })).toBeInTheDocument()
  })

  it('shows the arguments of a tool call on request', async () => {
    const chat = vi.fn(async () =>
      turn({
        messages: [
          assistantSays('Made it.', [
            { id: 'c0', name: 'write_file', argumentsJson: '{"path":"a.ink"}', summary: 'wrote a.ink', ok: true }
          ])
        ]
      })
    )
    dialog(chat)

    await send('Go.')
    await userEvent.click(await screen.findByRole('button', { name: 'wrote a.ink' }))

    expect(screen.getByText('{"path":"a.ink"}')).toBeInTheDocument()
  })

  it('tells the app which files were written, so it can reload them', async () => {
    const chat = vi.fn(async () =>
      turn({ messages: [assistantSays('Made it.')], filesWritten: ['projects/x/plan.json'] })
    )
    const { onFilesWritten } = dialog(chat)

    await send('Go.')

    await waitFor(() => expect(onFilesWritten).toHaveBeenCalledWith(['projects/x/plan.json']))
  })

  it('does not announce a reload when nothing was written', async () => {
    const { onFilesWritten } = dialog()
    await send('Just talk to me.')
    await screen.findByText('Done.')
    expect(onFilesWritten).not.toHaveBeenCalled()
  })

  it('reports a failure without losing the conversation', async () => {
    const chat = vi.fn(async () => turn({ ok: false, message: '429 rate limited' }))
    dialog(chat)

    await send('Go.')

    expect(await screen.findByText('429 rate limited')).toBeInTheDocument()
    expect(screen.getByText('Go.')).toBeInTheDocument()
  })

  it('offers a starting point when the conversation is empty', async () => {
    const { chat } = dialog()

    await userEvent.click(await screen.findByRole('button', { name: /Create a new project/ }))

    expect(chat).toHaveBeenCalled()
  })
})

describe('useAssistant', () => {
  it('grows the conversation, sending the whole thing each turn', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(turn({ messages: [assistantSays('One.')] }))
      .mockResolvedValueOnce(turn({ messages: [assistantSays('Two.')] }))
    installApi({ ai: { chat } })

    const { result } = renderHook(() => useAssistant())
    const options = { providerId: 'prv_0000000000', model: 'm', projectPath: null }

    await act(async () => {
      await result.current.send('First.', options)
    })
    await act(async () => {
      await result.current.send('Second.', options)
    })

    expect(result.current.messages.map((message) => message.content)).toEqual([
      'First.',
      'One.',
      'Second.',
      'Two.'
    ])
    expect(chat.mock.calls[1]![0].messages).toHaveLength(3)
  })

  it('keeps a failed turn in the transcript', async () => {
    installApi({ ai: { chat: vi.fn(async () => turn({ ok: false, message: 'no' })) } })
    const { result } = renderHook(() => useAssistant())

    await act(async () => {
      await result.current.send('Go.', { providerId: 'p', model: 'm', projectPath: null })
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.error).toBe('no')
  })

  it('clears the conversation on request', async () => {
    installApi()
    const { result } = renderHook(() => useAssistant())

    await act(async () => {
      await result.current.send('Go.', { providerId: 'p', model: 'm', projectPath: null })
    })
    act(() => result.current.clear())

    expect(result.current.messages).toEqual([])
  })

  it('ignores an empty message', async () => {
    const chat = vi.fn()
    installApi({ ai: { chat } })
    const { result } = renderHook(() => useAssistant())

    await act(async () => {
      await result.current.send('   ', { providerId: 'p', model: 'm', projectPath: null })
    })

    expect(chat).not.toHaveBeenCalled()
  })
})

/**
 * A tool that narrates itself while it runs.
 *
 * Only `generate_image` does — drawing a picture takes a minute of somebody
 * else's GPU, which without this looks exactly like a hang.
 */
describe('progress notes', () => {
  /** Renders the panel and hands back the progress emitter main would use. */
  function narrating(): { say: (progress: unknown) => void } {
    let emit: ((progress: unknown) => void) | null = null

    installApi({
      ai: {
        onChatProgress: vi.fn((handler: (progress: unknown) => void) => {
          emit = handler
          return () => {}
        }),
        // Never settles, so the turn stays busy and the note stays on screen.
        chat: vi.fn(() => new Promise<ChatTurnResult>(() => {}))
      }
    })

    function Host(): React.JSX.Element {
      const assistant = useAssistant()
      return (
        <AssistantPanel
          assistant={assistant}
          projectPath="/w/data/projects/the-lighthouse"
          projectTitle="The Lighthouse"
          onFilesWritten={vi.fn()}
        />
      )
    }

    render(<Host />)
    return { say: (progress) => act(() => emit?.(progress)) }
  }

  it('shows what the running tool last said', async () => {
    const { say } = narrating()
    await send('draw me a harbour')

    say({ round: 1, call: null, note: { tool: 'generate_image', text: 'step 12 of 20' } })

    expect(await screen.findByText('step 12 of 20')).toBeTruthy()
  })

  it('replaces the last note rather than stacking twenty of them', async () => {
    const { say } = narrating()
    await send('draw me a harbour')

    for (const value of [4, 12, 20]) {
      say({ round: 1, call: null, note: { tool: 'generate_image', text: `step ${value} of 20` } })
    }

    expect(await screen.findByText('step 20 of 20')).toBeTruthy()
    expect(screen.queryByText('step 4 of 20')).toBeNull()
    expect(screen.queryByText('step 12 of 20')).toBeNull()
  })

  it('leaves the finished-calls list alone, since a note is not a call', async () => {
    const { say } = narrating()
    await send('draw me a harbour')

    say({ round: 1, call: null, note: { tool: 'generate_image', text: 'queued — 1 job ahead' } })
    say({
      round: 1,
      call: { id: 'c1', name: 'generate_image', argumentsJson: '{}', summary: 'drew bg/harbour.png', ok: true }
    })

    expect(await screen.findByText('drew bg/harbour.png')).toBeTruthy()
    // The call has landed, so its narration has nothing left to add.
    expect(screen.queryByText('queued — 1 job ahead')).toBeNull()
  })
})
