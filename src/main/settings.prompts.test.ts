import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Remembering what the author changed about the prompts.
 *
 * The case that carries the design is what "reset to default" writes, which is
 * nothing at all. Storing a copy of the app's own prompt would look identical
 * today and diverge a version later, when the default is improved and the
 * author is still being sent the old one — having pressed a button that said
 * their choice had been undone.
 */

let root = ''

vi.mock('electron', () => ({
  app: { getPath: () => root },
  safeStorage: { isEncryptionAvailable: () => true }
}))

const { loadSettings, setPrompt } = await import('./settings')

const file = (): string => join(root, 'settings.json')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-prompts-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('prompt overrides', () => {
  it('starts with none, so the app sends its own', async () => {
    const { prompts } = await loadSettings()

    expect(prompts).toEqual({ prose: null, ink: null, assistant: '' })
  })

  it('keeps a replacement, exactly as written', async () => {
    await setPrompt('prose', 'Write it my way.\n\nEvery line a beat.')

    expect((await loadSettings()).prompts.prose).toBe('Write it my way.\n\nEvery line a beat.')
  })

  it('keeps the three apart', async () => {
    await setPrompt('prose', 'Prose, my way.')
    await setPrompt('ink', 'Ink, my way.')
    await setPrompt('assistant', 'Present tense, please.')

    expect((await loadSettings()).prompts).toEqual({
      prose: 'Prose, my way.',
      ink: 'Ink, my way.',
      assistant: 'Present tense, please.'
    })
  })

  /** The whole reason an override is null rather than a copy. */
  it('writes nothing at all when one is reset', async () => {
    await setPrompt('ink', 'Ink, my way.')
    await setPrompt('ink', null)

    const written = JSON.parse(await readFile(file(), 'utf8'))
    expect(written.prompts.ink).toBeNull()
    expect((await loadSettings()).prompts.ink).toBeNull()
  })

  /**
   * Selecting everything in the box and deleting it is how an author asks for
   * the default back without noticing there is a button for it.
   */
  it('reads an emptied replacement as a reset', async () => {
    await setPrompt('prose', 'Prose, my way.')
    await setPrompt('prose', '   \n  ')

    expect((await loadSettings()).prompts.prose).toBeNull()
  })

  /** The assistant's is an addition, so emptying it is just an empty addition. */
  it('keeps an emptied assistant note as nothing added', async () => {
    await setPrompt('assistant', 'Present tense.')
    await setPrompt('assistant', '')

    expect((await loadSettings()).prompts.assistant).toBe('')
  })

  it('survives a round trip through the file', async () => {
    await setPrompt('prose', 'Prose, my way.')

    expect(JSON.parse(await readFile(file(), 'utf8')).prompts.prose).toBe('Prose, my way.')
    expect((await loadSettings()).prompts.prose).toBe('Prose, my way.')
  })

  it('does not disturb the rest of the settings', async () => {
    await setPrompt('prose', 'Prose, my way.')
    const after = await loadSettings()

    expect(after.providers).toEqual([])
    expect(after.comfy).toBeDefined()
  })

  describe('a settings file written by something else', () => {
    const put = async (contents: unknown): Promise<void> => {
      await writeFile(file(), JSON.stringify(contents), 'utf8')
    }

    it('falls back to the built-in ones when the field is missing', async () => {
      await put({ version: 1, providers: [], activeProviderId: null })

      expect((await loadSettings()).prompts).toEqual({ prose: null, ink: null, assistant: '' })
    })

    /**
     * A prompt is the difference between a model that writes ink and one that
     * writes an essay about ink, so nonsense in the file falls back to the
     * app's rather than being sent as-is.
     */
    it('falls back when the field is the wrong shape', async () => {
      await put({ version: 1, providers: [], activeProviderId: null, prompts: 'yes please' })

      expect((await loadSettings()).prompts.prose).toBeNull()
    })

    it('ignores a replacement that is not text', async () => {
      await put({
        version: 1,
        providers: [],
        activeProviderId: null,
        prompts: { prose: 42, ink: null, assistant: ['no'] }
      })

      const { prompts } = await loadSettings()
      expect(prompts.prose).toBeNull()
      expect(prompts.assistant).toBe('')
    })
  })
})
