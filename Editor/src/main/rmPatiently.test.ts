import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `rm` fails with a held error the first `heldFor` times it is called, then
 * does the real thing. Mocked in its own file so only these tests see it.
 */
const state = { heldFor: 0, calls: 0, code: 'EBUSY', lastOptions: {} as Record<string, unknown> }

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    rm: vi.fn(async (target: string, options: Record<string, unknown>) => {
      state.calls++
      state.lastOptions = options
      if (state.calls <= state.heldFor) {
        const error = new Error(`${state.code}: resource busy or locked, rmdir '${target}'`)
        ;(error as NodeJS.ErrnoException).code = state.code
        throw error
      }
      return real.rm(target, options)
    })
  }
})

const { rmPatiently } = await import('./bundle')
const { mkdtemp, mkdir, writeFile, stat } = await import('node:fs/promises')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')

/** A folder with something in it, so a removal has work to do. */
async function tree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'inkcrafter-rm-'))
  await mkdir(join(root, 'resources'), { recursive: true })
  await writeFile(join(root, 'resources', 'default_app.asar'), 'x')
  return root
}

const gone = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => false,
    () => true
  )

beforeEach(() => {
  state.heldFor = 0
  state.calls = 0
  state.code = 'EBUSY'
})

describe('rmPatiently', () => {
  it('removes a tree', async () => {
    const root = await tree()
    await rmPatiently(root, { recursive: true })
    expect(await gone(root)).toBe(true)
  })

  /**
   * `fs.rm`'s own per-entry retries are multiplied by the depth of the tree, so
   * a file held for good three levels down turned an instant EBUSY into a stall
   * of minutes. The patience here is whole attempts instead, which cost what the
   * first one cost.
   */
  it('does not ask fs.rm to retry per entry', async () => {
    await rmPatiently(await tree(), { recursive: true })
    expect(state.lastOptions).not.toHaveProperty('maxRetries')
    expect(state.lastOptions).not.toHaveProperty('retryDelay')
  })

  /**
   * The failure this was written for: a scanner holds one file for a moment, so
   * the removal half-empties the folder and throws. It let go on its own well
   * before this gave up.
   */
  it('gets there once a transient lock clears', async () => {
    state.heldFor = 2
    const root = await tree()

    await rmPatiently(root, { recursive: true })

    expect(state.calls).toBe(3)
    expect(await gone(root)).toBe(true)
  })

  it('gives up rather than retrying forever', async () => {
    state.heldFor = 99
    await expect(rmPatiently(await tree(), { recursive: true })).rejects.toThrow(/EBUSY/)
    expect(state.calls).toBe(4)
  })

  /**
   * The budget, stated as a number rather than left to be inferred: a caller
   * that cannot remove something has to be able to say so while the author is
   * still looking at the screen.
   */
  it('gives up quickly enough to report, when the lock is a real one', async () => {
    state.heldFor = 99
    const started = Date.now()

    await expect(rmPatiently(await tree(), { recursive: true })).rejects.toThrow(/EBUSY/)

    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('does not retry an error that is not a lock', async () => {
    state.heldFor = 99
    state.code = 'EROFS'
    await expect(rmPatiently(await tree(), { recursive: true })).rejects.toThrow(/EROFS/)
    expect(state.calls).toBe(1)
  })

  it('is patient about a single file too, where fs.rm ignores maxRetries', async () => {
    state.heldFor = 2
    const root = await tree()
    const file = join(root, 'resources', 'default_app.asar')

    await rmPatiently(file)

    expect(state.calls).toBe(3)
    expect(await gone(file)).toBe(true)
  })

  it('says nothing about a path that is already gone', async () => {
    await expect(rmPatiently(join(tmpdir(), 'inkcrafter-not-there'))).resolves.toBeUndefined()
  })
})
