import { emptyPromptOverrides } from '@shared/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolDefinition } from './workspaceTools'

/**
 * A tool saying what it is doing while it does it.
 *
 * Its own file because the only tool that narrates is the one that draws a
 * picture, and testing this against that would mean a real ComfyUI. So the
 * tool list is replaced with a probe: `runChatTurn` reaches for `ALL_TOOLS`
 * directly, and mocking the module is the only seam there is.
 *
 * Kept out of `chat.test.ts` so that file keeps exercising the real tools.
 */

let root = ''
const said: string[] = []

vi.mock('../settings', () => ({
  loadSettings: vi.fn(async () => ({
    providers: [],
    activeProviderId: 'prv_0000000000',
    prompts: emptyPromptOverrides()
  })),
  providerById: vi.fn(async () => ({
    id: 'prv_0000000000',
    label: 'Test',
    baseUrl: 'https://example.test/v1',
    model: 'a-model',
    hasKey: true
  })),
  apiKeyFor: vi.fn(async () => 'sk-test')
}))

vi.mock('../workspace', () => ({ dataDir: () => root }))

const probe: ToolDefinition = {
  name: 'probe',
  description: 'A tool that takes a while and says so.',
  parameters: { type: 'object', properties: {} },
  async run(_args, context) {
    for (const text of said) context.onProgress?.(text)
    return { ok: true, summary: 'probe done', content: 'done' }
  }
}

vi.mock('./tools', () => ({ ALL_TOOLS: [probe] }))

const { runChatTurn } = await import('./chat')

function reply(options: { content?: string; tools?: string[] }): Response {
  const tool_calls = options.tools?.map((name, index) => ({
    id: `call_${index}`,
    type: 'function',
    function: { name, arguments: '{}' }
  }))

  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: options.content ?? null, ...(tool_calls ? { tool_calls } : {}) } }]
    })
  } as Response
}

function queue(...responses: Response[]): void {
  const mock = vi.fn()
  for (const response of responses) mock.mockResolvedValueOnce(response)
  mock.mockResolvedValue(reply({ content: 'Done.' }))
  vi.stubGlobal('fetch', mock)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-progress-'))
  said.length = 0
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(root, { recursive: true, force: true })
})

const request = {
  messages: [{ id: 'prv_0000000001', role: 'user' as const, content: 'draw something' }],
  providerId: 'prv_0000000000',
  model: '',
  projectPath: null
}

describe('a tool that narrates itself', () => {
  it('reaches the renderer before the call finishes, in order', async () => {
    said.push('asking ComfyUI…', 'step 12 of 20')
    queue(reply({ tools: ['probe'] }), reply({ content: 'Done.' }))

    const seen: string[] = []
    await runChatTurn(request, (update) =>
      seen.push(
        update.call
          ? `call:${update.call.name}`
          : update.note
            ? `note:${update.note.text}`
            : `round:${update.round}`
      )
    )

    // The notes come before the call's own summary — that is the whole point.
    expect(seen).toEqual([
      'round:1',
      'note:asking ComfyUI…',
      'note:step 12 of 20',
      'call:probe',
      'round:2'
    ])
  })

  it('says which tool and which round the note belongs to', async () => {
    said.push('step 1 of 20')
    queue(reply({ tools: ['probe'] }), reply({ content: 'Done.' }))

    const notes: { tool: string; round: number }[] = []
    await runChatTurn(request, (update) => {
      if (update.note) notes.push({ tool: update.note.tool, round: update.round })
    })

    expect(notes).toEqual([{ tool: 'probe', round: 1 }])
  })

  it('leaves `call` null on a note, so the finished-calls list ignores it', async () => {
    said.push('working')
    queue(reply({ tools: ['probe'] }), reply({ content: 'Done.' }))

    const notes: unknown[] = []
    await runChatTurn(request, (update) => {
      if (update.note) notes.push(update.call)
    })

    expect(notes).toEqual([null])
  })
})
