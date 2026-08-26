import { emptyPromptOverrides } from '@shared/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Compiler } from 'inkjs/compiler/Compiler'
import { MAX_TOOL_ROUNDS, type ChatMessage } from '@shared/chat'
import { parsePlan } from '@shared/planDoc'
import { listProjects } from '../project'
import { PLAN_EXAMPLE, PROJECT_MANIFEST_EXAMPLE } from './chatPrompt'

let root = ''

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

const { runChatTurn } = await import('./chat')

/** One API response: either tool calls, or the final prose. */
function reply(options: { content?: string; tools?: [string, unknown][] }): Response {
  const tool_calls = options.tools?.map(([name, args], index) => ({
    id: `call_${index}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  }))

  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: options.content ?? null, ...(tool_calls ? { tool_calls } : {}) } }]
    })
  } as Response
}

function queue(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn()
  for (const response of responses) fetchMock.mockResolvedValueOnce(response)
  // Anything past the queue keeps the loop going, for the cap tests.
  fetchMock.mockResolvedValue(reply({ tools: [['list_files', {}]] }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ask = (text: string): ChatMessage[] => [{ id: 'm1', role: 'user', content: text }]

const request = (text = 'Make me a project.'): Parameters<typeof runChatTurn>[0] => ({
  messages: ask(text),
  providerId: 'prv_0000000000',
  model: 'a-model',
  projectPath: null
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-chat-'))
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(root, { recursive: true, force: true })
})

describe('runChatTurn', () => {
  it('returns the answer when the model uses no tools', async () => {
    queue(reply({ content: 'Nothing to do.' }))
    const result = await runChatTurn(request())

    expect(result.ok).toBe(true)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]!.content).toBe('Nothing to do.')
    expect(result.filesWritten).toEqual([])
  })

  it('runs a tool, feeds the result back, and answers', async () => {
    const fetchMock = queue(
      reply({ tools: [['write_file', { path: 'projects/x/ink/main.ink', contents: '-> a\n' }]] }),
      reply({ content: 'Made the project.' })
    )

    const result = await runChatTurn(request())

    expect(result.ok).toBe(true)
    expect(await readFile(join(root, 'projects/x/ink/main.ink'), 'utf8')).toBe('-> a\n')
    expect(result.filesWritten).toEqual(['projects/x/ink/main.ink'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends the tool result back attached to the call it answers', async () => {
    // Without a matching tool_call_id the provider rejects the next request, so
    // this is the part of the protocol most worth pinning down.
    const fetchMock = queue(
      reply({ tools: [['list_files', {}]] }),
      reply({ content: 'Empty.' })
    )

    await runChatTurn(request())

    const second = JSON.parse(String(fetchMock.mock.calls[1]![1].body))
    const toolMessage = second.messages.find((m: { role: string }) => m.role === 'tool')

    expect(toolMessage.tool_call_id).toBe('call_0')
    expect(second.messages.some((m: { role: string; tool_calls?: unknown }) => m.role === 'assistant' && m.tool_calls)).toBe(true)
  })

  it('records every tool call on the message, so the author sees what it did', async () => {
    queue(
      reply({ tools: [['write_file', { path: 'a.md', contents: 'x' }], ['list_files', {}]] }),
      reply({ content: 'Done.' })
    )

    const result = await runChatTurn(request())
    const calls = result.messages[0]!.toolCalls ?? []

    expect(calls.map((call) => call.name)).toEqual(['write_file', 'list_files'])
    expect(calls[0]!.summary).toMatch(/wrote a\.md/)
    expect(calls.every((call) => call.ok)).toBe(true)
  })

  it('shows a failed tool call rather than hiding it', async () => {
    queue(
      reply({ tools: [['write_file', { path: '../escape.md', contents: 'x' }]] }),
      reply({ content: 'I could not do that.' })
    )

    const result = await runChatTurn(request())
    const calls = result.messages[0]!.toolCalls ?? []

    expect(calls[0]!.ok).toBe(false)
    expect(result.filesWritten).toEqual([])
  })

  it('sends the tools it has on every request', async () => {
    const fetchMock = queue(reply({ content: 'Hello.' }))
    await runChatTurn(request())

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual([
      'list_files',
      'read_file',
      'write_file',
      'new_id',
      // One per document the app owns, in the order a story gets built. Each is
      // here because writing the file is not enough and the shortfall is quiet.
      'write_plan',
      'write_variables',
      'write_cast',
      'write_media',
      'write_map',
      'write_codex_entry',
      'generate_image',
      'remove_background'
    ])
  })

  it('stops after its round cap instead of looping forever', async () => {
    const fetchMock = queue()
    const result = await runChatTurn(request())

    expect(fetchMock).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS)
    expect(result.truncated).toBe(true)
    // Whatever it did is still reported: it may already have written files.
    expect(result.ok).toBe(true)
    expect(result.messages.at(-1)!.content).toMatch(/stopped after/i)
  })

  it('reports an HTTP failure without losing what it already did', async () => {
    queue(
      reply({ tools: [['write_file', { path: 'a.md', contents: 'x' }]] }),
      { ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'slow down' } as Response
    )

    const result = await runChatTurn(request())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/429/)
    expect(result.filesWritten).toEqual(['a.md'])
  })

  it('reports a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runChatTurn(request())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/ENOTFOUND/)
  })

  /**
   * The thing this feature was asked for, end to end: "create me a new project,
   * start with 5 chapters, and seed each chapter with an ink file." A scripted
   * provider stands in for the model; everything after the HTTP boundary is the
   * real code, and the result is opened with the app's own readers.
   */
  it('builds a project the app can then open', async () => {
    const chapters = ['arrival', 'the-lamp', 'the-storm', 'the-dark-hour', 'after']
    const knot = (name: string): string => name.replace(/-/g, '_')

    queue(
      reply({ tools: [['list_files', {}]] }),
      reply({ tools: [['new_id', { kind: 'prj' }]] }),
      reply({
        tools: [
          [
            'write_file',
            {
              path: 'projects/the-signal/project.md',
              contents: PROJECT_MANIFEST_EXAMPLE.replace(
                'libraries:\n  - lib_9c4k2m7q3x',
                'libraries: []'
              ).replace('title: The Lighthouse', 'title: The Signal')
            }
          ],
          [
            'write_file',
            { path: 'projects/the-signal/ink/main.ink', contents: `-> ${knot(chapters[0]!)}\n` }
          ],
          ...chapters.map((chapter, index): [string, unknown] => [
            'write_file',
            {
              path: `projects/the-signal/ink/chapters/${chapter}.ink`,
              contents:
                `=== ${knot(chapter)} ===\nChapter ${index + 1}.\n` +
                (index + 1 < chapters.length ? `-> ${knot(chapters[index + 1]!)}\n` : '-> END\n')
            }
          ]),
          ['write_file', { path: 'projects/the-signal/plan.json', contents: PLAN_EXAMPLE }]
        ]
      }),
      reply({ content: 'Created The Signal with five chapters.' })
    )

    const result = await runChatTurn(request('Create a project with 5 chapters, one ink file each.'))

    expect(result.ok).toBe(true)
    expect(result.truncated).toBe(false)
    // project.md, main.ink, five chapters, plan.json.
    expect(result.filesWritten).toHaveLength(8)

    // The app's own readers, on what the assistant actually wrote.
    const projects = await listProjects(join(root, 'projects'))
    expect(projects.map((project) => project.title)).toEqual(['The Signal'])

    const plan = parsePlan(await readFile(join(root, 'projects/the-signal/plan.json'), 'utf8'))
    expect(plan.nodes).toHaveLength(1)

    // And the story compiles as one thing, all five chapters reachable.
    const main = await readFile(join(root, 'projects/the-signal/ink/main.ink'), 'utf8')
    const includes = await Promise.all(
      chapters.map((chapter) =>
        readFile(join(root, `projects/the-signal/ink/chapters/${chapter}.ink`), 'utf8')
      )
    )
    const story = new Compiler(`${main}\n${includes.join('\n')}`).Compile()

    let output = ''
    while (story.canContinue) output += story.Continue()
    expect(output).toBe('Chapter 1.\nChapter 2.\nChapter 3.\nChapter 4.\nChapter 5.\n')
  })

  /**
   * Tool results accumulate and are resent on every later round, which is the
   * likeliest way a long turn runs past the request timeout.
   */
  describe('keeping the conversation small', () => {
    it('drops the bodies of older tool results once it grows too large', async () => {
      // Ten rounds of a tool returning a big listing, then an answer.
      const fetchMock = vi.fn()
      for (let round = 0; round < 10; round++) {
        fetchMock.mockResolvedValueOnce(reply({ tools: [['list_files', {}]] }))
      }
      fetchMock.mockResolvedValue(reply({ content: 'Done.' }))
      vi.stubGlobal('fetch', fetchMock)

      // Enough files that each listing is substantial.
      await mkdir(join(root, 'projects', 'big'), { recursive: true })
      await Promise.all(
        Array.from({ length: 300 }, (_, index) =>
          writeFile(join(root, 'projects', 'big', `chapter-${index}-with-a-long-name.ink`), 'x')
        )
      )

      await runChatTurn(request())

      const last = JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body)) as {
        messages: { role: string; content: string | null }[]
      }
      const size = last.messages.reduce((total, m) => total + (m.content?.length ?? 0), 0)

      expect(size).toBeLessThanOrEqual(120_000)
      expect(last.messages.some((m) => m.content?.includes('dropped to keep the conversation small'))).toBe(true)
    })

    it('leaves a tool message in place when it empties it, since the id must stay', async () => {
      const fetchMock = vi.fn()
      for (let round = 0; round < 10; round++) {
        fetchMock.mockResolvedValueOnce(reply({ tools: [['list_files', {}]] }))
      }
      fetchMock.mockResolvedValue(reply({ content: 'Done.' }))
      vi.stubGlobal('fetch', fetchMock)

      await mkdir(join(root, 'projects', 'big'), { recursive: true })
      await Promise.all(
        Array.from({ length: 300 }, (_, index) =>
          writeFile(join(root, 'projects', 'big', `chapter-${index}-with-a-long-name.ink`), 'x')
        )
      )

      await runChatTurn(request())

      const last = JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body)) as {
        messages: { role: string; tool_call_id?: string }[]
      }
      const results = last.messages.filter((m) => m.role === 'tool')

      // A tool message whose call id has vanished is a protocol error at the
      // far end, so trimming empties them rather than removing them.
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((m) => typeof m.tool_call_id === 'string')).toBe(true)
    })
  })

  describe('when the provider does not answer', () => {
    it('says it timed out, how far it got, and what survived', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply({ tools: [['write_file', { path: 'a.md', contents: 'x' }]] }))
        .mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError'
        }))
      vi.stubGlobal('fetch', fetchMock)

      const result = await runChatTurn(request())

      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/did not answer within/)
      expect(result.message).toMatch(/round 2 of 12/)
      // The file it managed before giving up is still on disk and must be said so.
      expect(result.message).toMatch(/1 file had already been written/)
      expect(result.filesWritten).toEqual(['a.md'])
    })

    it('says plainly when nothing was written', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
      )

      expect((await runChatTurn(request())).message).toMatch(/Nothing was written/)
    })

    it('passes an ordinary network failure through, with what survived', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')))

      const result = await runChatTurn(request())
      expect(result.message).toMatch(/ENOTFOUND/)
      expect(result.message).toMatch(/Nothing was written/)
    })
  })

  describe('progress', () => {
    it('reports each round starting and each tool call finishing', async () => {
      queue(
        reply({ tools: [['write_file', { path: 'a.md', contents: 'x' }]] }),
        reply({ content: 'Done.' })
      )

      const seen: string[] = []
      await runChatTurn(request(), (update) =>
        // Notes are spelled out rather than folded into the round, so a tool
        // that starts emitting them shows up here instead of reading as an
        // extra round that never happened.
        seen.push(
          update.call
            ? `call:${update.call.name}`
            : update.note
              ? `note:${update.note.text}`
              : `round:${update.round}`
        )
      )

      expect(seen).toEqual(['round:1', 'call:write_file', 'round:2'])
    })

    it('reports a failed call as it happens, not only at the end', async () => {
      queue(
        reply({ tools: [['write_file', { path: '../escape.md', contents: 'x' }]] }),
        reply({ content: 'Could not.' })
      )

      const calls: boolean[] = []
      await runChatTurn(request(), (update) => {
        if (update.call) calls.push(update.call.ok)
      })

      expect(calls).toEqual([false])
    })
  })

  it('carries the conversation so far, under a system prompt', async () => {
    const fetchMock = queue(reply({ content: 'Yes.' }))
    await runChatTurn({
      messages: [
        { id: 'a', role: 'user', content: 'First.' },
        { id: 'b', role: 'assistant', content: 'Reply.' },
        { id: 'c', role: 'user', content: 'Second.' }
      ],
      providerId: 'prv_0000000000',
      model: 'a-model',
      projectPath: '/w/data/projects/the-lighthouse'
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('/w/data/projects/the-lighthouse')
    expect(body.messages.slice(1).map((m: { content: string }) => m.content)).toEqual([
      'First.',
      'Reply.',
      'Second.'
    ])
  })
})
