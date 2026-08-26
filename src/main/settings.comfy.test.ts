import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMFY_DEFAULT_BASE_URL, normaliseComfyUrl } from '@shared/comfy'

/**
 * Remembering where ComfyUI is, and what the author corrected.
 *
 * The case that matters most is the null override. "Leave this slot unbound"
 * and "I have no opinion about this slot" are different instructions that would
 * both look like absence to a careless reader, and confusing them turns a
 * deliberate choice back into a guess on the next app start.
 */

let root = ''

vi.mock('electron', () => ({
  app: { getPath: () => root },
  safeStorage: { isEncryptionAvailable: () => true }
}))

const {
  loadSettings,
  setComfyBaseUrl,
  setComfyBinding,
  setComfyDefault,
  setComfyPromptPrefix,
  setComfyRole,
  setComfyTimeout,
  setComfyWorkflowDir,
  clearComfyBinding
} = await import('./settings')

const file = (): string => join(root, 'settings.json')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-settings-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('comfy settings', () => {
  it('defaults when the file has never heard of ComfyUI', async () => {
    // Exactly what an existing install's settings.json looks like.
    await writeFile(file(), JSON.stringify({ version: 1, providers: [], activeProviderId: null }))

    const { comfy } = await loadSettings()
    expect(comfy.baseUrl).toBe(COMFY_DEFAULT_BASE_URL)
    expect(comfy.workflowDir).toBeNull()
    expect(comfy.promptPrefixes).toEqual({})
    expect(comfy.overrides).toEqual({})
  })

  it('remembers a prompt prefix per workflow, and clears it without touching another', async () => {
    await setComfyPromptPrefix('portrait.json', '<lora:portrait:0.8>, sharp focus,')
    await setComfyPromptPrefix('landscape.json', 'wide establishing shot,')

    expect((await loadSettings()).comfy.promptPrefixes).toEqual({
      'portrait.json': '<lora:portrait:0.8>, sharp focus,',
      'landscape.json': 'wide establishing shot,'
    })

    await setComfyPromptPrefix('portrait.json', null)
    expect((await loadSettings()).comfy.promptPrefixes).toEqual({
      'landscape.json': 'wide establishing shot,'
    })
  })

  it('keeps the address, tidied', async () => {
    await setComfyBaseUrl('http://192.168.1.9:8188/')
    expect((await loadSettings()).comfy.baseUrl).toBe('http://192.168.1.9:8188')
  })

  it('refuses an address it could not call rather than storing it', async () => {
    await setComfyBaseUrl('http://127.0.0.1:9000')
    await setComfyBaseUrl('file:///etc/passwd')

    expect((await loadSettings()).comfy.baseUrl).toBe('http://127.0.0.1:9000')
  })

  it('clamps a timeout to something a person could have meant', async () => {
    await setComfyTimeout(4)
    expect((await loadSettings()).comfy.timeoutSeconds).toBe(30)

    await setComfyTimeout(9_999_999)
    expect((await loadSettings()).comfy.timeoutSeconds).toBe(1800)
  })

  it('remembers a correction against the file name', async () => {
    await setComfyBinding('portrait.json', 'positive', { node: '6', field: 'text' })

    const { comfy } = await loadSettings()
    expect(comfy.overrides['portrait.json']).toEqual({ positive: { node: '6', field: 'text' } })
  })

  it('survives a round trip through disk with a slot deliberately unbound', async () => {
    await setComfyBinding('portrait.json', 'negative', null)

    // Straight off disk, because this is where a careless reader drops it.
    const raw = JSON.parse(await readFile(file(), 'utf8')) as {
      comfy: { overrides: Record<string, Record<string, unknown>> }
    }
    expect('negative' in raw.comfy.overrides['portrait.json']!).toBe(true)

    const { comfy } = await loadSettings()
    expect(comfy.overrides['portrait.json']).toEqual({ negative: null })
    expect('negative' in comfy.overrides['portrait.json']!).toBe(true)
  })

  it('forgets a correction without disturbing the others', async () => {
    await setComfyBinding('portrait.json', 'positive', { node: '6', field: 'text' })
    await setComfyBinding('portrait.json', 'seed', { node: '3', field: 'seed' })
    await clearComfyBinding('portrait.json', 'seed')

    expect((await loadSettings()).comfy.overrides['portrait.json']).toEqual({
      positive: { node: '6', field: 'text' }
    })
  })

  it('stops listing a workflow once it has nothing left to say about it', async () => {
    await setComfyBinding('portrait.json', 'positive', { node: '6', field: 'text' })
    await clearComfyBinding('portrait.json', 'positive')

    // Otherwise the tab would go on badging it as edited.
    expect((await loadSettings()).comfy.overrides).toEqual({})
  })

  it('drops a malformed correction rather than carrying it into the graph', async () => {
    await writeFile(
      file(),
      JSON.stringify({
        version: 1,
        comfy: { overrides: { 'portrait.json': { positive: { node: '', field: 'text' }, seed: 'nonsense' } } }
      })
    )

    expect((await loadSettings()).comfy.overrides['portrait.json']).toEqual({
      positive: null,
      seed: null
    })
  })

  it('keeps the workflow folder, and forgets it on null', async () => {
    await setComfyWorkflowDir('C:/comfy/api-workflows')
    expect((await loadSettings()).comfy.workflowDir).toBe('C:/comfy/api-workflows')

    await setComfyWorkflowDir(null)
    expect((await loadSettings()).comfy.workflowDir).toBeNull()
  })

  it('leaves the rest of the settings alone', async () => {
    await setComfyWorkflowDir('C:/comfy')
    const stored = JSON.parse(await readFile(file(), 'utf8')) as Record<string, unknown>

    expect(stored['version']).toBe(1)
    expect(stored['providers']).toEqual([])
  })
})

describe('what each workflow is for, and which one is reached for', () => {
  it('remembers a default per role, so both kinds of request have an answer', async () => {
    await setComfyDefault('creates', 'landscape.json')
    await setComfyDefault('edits', 'retouch.json')

    expect((await loadSettings()).comfy.defaults).toEqual({
      creates: 'landscape.json',
      edits: 'retouch.json'
    })
  })

  it('forgets a default, which is not the same as having none', async () => {
    await setComfyDefault('creates', 'landscape.json')
    await setComfyDefault('creates', null)

    // Back to "the first of that kind", which is where it started.
    expect((await loadSettings()).comfy.defaults).toEqual({})
  })

  it('remembers a role set by hand, and hands it back on null', async () => {
    await setComfyRole('odd.json', 'edits')
    expect((await loadSettings()).comfy.roles).toEqual({ 'odd.json': 'edits' })

    await setComfyRole('odd.json', null)
    expect((await loadSettings()).comfy.roles).toEqual({})
  })

  it('ignores a role that is not one', async () => {
    await setComfyRole('odd.json', 'sideways' as never)
    expect((await loadSettings()).comfy.roles).toEqual({})
  })

  it('drops a role it does not recognise off disk', async () => {
    await writeFile(
      file(),
      JSON.stringify({ version: 1, comfy: { roles: { 'a.json': 'edits', 'b.json': 'sideways' } } })
    )

    expect((await loadSettings()).comfy.roles).toEqual({ 'a.json': 'edits' })
  })
})

describe('normaliseComfyUrl', () => {
  it('strips trailing slashes and keeps a sub-path', () => {
    expect(normaliseComfyUrl('http://box:8188//').url).toBe('http://box:8188')
    // A reverse proxy may well serve it from somewhere other than the root.
    expect(normaliseComfyUrl('https://gpu.example/comfy/').url).toBe('https://gpu.example/comfy')
  })

  it('explains the missing scheme rather than half-accepting it', () => {
    const { url, problem } = normaliseComfyUrl('127.0.0.1:8188')
    expect(url).toBeNull()
    expect(problem).toMatch(/Include the http:\/\//)
  })

  it('refuses anything fetch has no business calling', () => {
    expect(normaliseComfyUrl('file:///etc/passwd').url).toBeNull()
    expect(normaliseComfyUrl('javascript:alert(1)').url).toBeNull()
  })
})
