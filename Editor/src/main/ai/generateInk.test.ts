import { emptyPromptOverrides } from '@shared/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriteInkRequest } from '@shared/ai'
import type { Project } from '@shared/project'

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

const { checkCompiles, fileWithDraft, writeInk } = await import('./generateInk')

const CHAPTER = `=== the_winch ===
The winch complains all the way up.

* [Go on]
    -> papers

=== papers ===
Vance holds out the folder.
-> END
`

let root = ''
let project: Project

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-ink-'))
  await mkdir(join(root, 'ink', 'chapters'), { recursive: true })
  await writeFile(
    join(root, 'ink', 'main.ink'),
    'INCLUDE chapters/arrival.ink\n\n-> the_winch\n'
  )
  await writeFile(join(root, 'ink', 'chapters', 'arrival.ink'), CHAPTER)

  project = {
    id: 'prj_0000000000',
    title: 'The Lighthouse',
    libraries: [],
    main: 'ink/main.ink',
    description: '',
    bundleOut: null,
    path: root
  }
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(root, { recursive: true, force: true })
})

function request(overrides: Partial<WriteInkRequest> = {}): WriteInkRequest {
  return {
    filePath: 'ink/chapters/arrival.ink',
    source: CHAPTER,
    instruction: 'Add a refusal.',
    selection: '',
    providerId: 'prv_0000000000',
    model: 'a-model',
    ...overrides
  }
}

function replies(content: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] })
    }))
  )
}

describe('fileWithDraft', () => {
  it('appends when nothing is selected', () => {
    expect(fileWithDraft('A.\n', '', 'B.')).toBe('A.\n\nB.\n')
  })

  it('splices over the selection when there is one', () => {
    expect(fileWithDraft('A.\nB.\nC.\n', 'B.', 'X.')).toBe('A.\nX.\nC.\n')
  })

  it('falls back to appending when the selection is no longer in the file', () => {
    // The buffer moved under us between asking and answering.
    expect(fileWithDraft('A.\n', 'gone', 'B.')).toBe('A.\n\nB.\n')
  })
})

describe('checkCompiles', () => {
  it('accepts a draft that diverts to a knot that exists', () => {
    const result = checkCompiles(project, request(), '=== waiting ===\nHe waits.\n-> papers\n')

    expect(result.compiles).toBe(true)
    expect(result.compileError).toBeNull()
  })

  // The two mistakes a model actually makes, and neither is visible by reading.
  it('catches a divert to a knot that does not exist', () => {
    const result = checkCompiles(project, request(), '=== waiting ===\nHe waits.\n-> nowhere\n')

    expect(result.compiles).toBe(false)
    expect(result.compileError).toMatch(/nowhere/)
  })

  it('catches a knot redefined', () => {
    const result = checkCompiles(project, request(), '=== papers ===\nAgain.\n-> END\n')

    expect(result.compiles).toBe(false)
    expect(result.compileError).toMatch(/papers/i)
  })

  it('compiles through the entry point, so a divert into another file resolves', () => {
    // `the_winch` lives in this file but is reached from main.ink. Compiling
    // the file alone would not prove anything about that.
    const result = checkCompiles(project, request(), '=== extra ===\nMore.\n-> the_winch\n')
    expect(result.compiles).toBe(true)
  })

  it('reports nothing rather than a false failure when there is no project', () => {
    const result = checkCompiles(null, request(), 'anything at all')
    expect(result.compiles).toBe(false)
    expect(result.compileError).toBeNull()
  })
})

describe('writeInk', () => {
  it('returns the ink and confirms it compiles', async () => {
    replies('=== waiting ===\nHe waits.\n-> papers\n')

    const result = await writeInk(request(), project)

    expect(result.ok).toBe(true)
    expect(result.text).toContain('=== waiting ===')
    expect(result.compiles).toBe(true)
  })

  it('still returns a draft that does not compile, with the reason', async () => {
    // Reported, not enforced: it is usually most of what was wanted.
    replies('=== waiting ===\nHe waits.\n-> nowhere\n')

    const result = await writeInk(request(), project)

    expect(result.ok).toBe(true)
    expect(result.text).toContain('=== waiting ===')
    expect(result.compiles).toBe(false)
    expect(result.compileError).toMatch(/nowhere/)
  })

  it('strips a markdown fence, however firmly the prompt asked for none', async () => {
    replies('```ink\n=== waiting ===\nHe waits.\n-> papers\n```')

    const result = await writeInk(request(), project)

    expect(result.text.startsWith('===')).toBe(true)
    expect(result.text).not.toContain('```')
    expect(result.compiles).toBe(true)
  })

  it('strips an unlabelled fence too', async () => {
    replies('```\nHe waits.\n```')
    expect((await writeInk(request(), project)).text).toBe('He waits.')
  })

  it('sends no max_tokens, since the answer might be a whole knot', async () => {
    replies('He waits.')
    await writeInk(request(), project)

    const body = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body))
    expect(body.max_tokens).toBeUndefined()
  })

  it('reports an HTTP failure and hands back what it sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'bad key' }))
    )

    const result = await writeInk(request(), project)

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/401/)
    expect(result.prompt).toContain('the_winch')
  })

  it('refuses without a provider rather than failing at the request', async () => {
    const result = await writeInk(request({ providerId: '' }), project)
    expect(result.ok).toBe(false)
  })
})
