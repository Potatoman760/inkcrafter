import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Project } from '@shared/project'

/**
 * Tracing to a knot, against a real compiled story.
 *
 * The interesting half is the knot nothing routes to. A story being written has
 * plenty of those — a branch whose caller is not drafted yet, a scene reached
 * only from a file that does not exist. Refusing to show them would make the
 * manuscript useless for exactly the work it is meant to support.
 */

vi.mock('electron', () => ({
  net: { fetch: async () => new Response(null) },
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} }
}))

const { openManuscript, closeManuscript, traceToKnot } = await import('./session')

let root = ''

const project = (): Project =>
  ({ id: 'prj_0000000000', title: 'Probe', path: root }) as unknown as Project

async function story(...lines: string[]): Promise<void> {
  await mkdir(join(root, 'ink'), { recursive: true })
  await writeFile(join(root, 'ink', 'main.ink'), lines.join('\n'), 'utf8')
}

const trace = (knot: string) => traceToKnot(project(), 'ink/main.ink', knot)

const prose = (manuscript: { nodes: Array<{ kind: string }> }): string[] =>
  manuscript.nodes
    .filter((node): node is { kind: 'prose'; text: string } => node.kind === 'prose')
    .map((node) => node.text)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-trace-'))
})

afterEach(async () => {
  closeManuscript()
  await rm(root, { recursive: true, force: true })
})

describe('traceToKnot', () => {
  it('reads from the beginning when a route exists', async () => {
    await story(
      '-> start',
      '=== start ===',
      'The gate stood open.',
      '* [Go in] -> inner',
      '=== inner ===',
      'Inside was colder.',
      '-> END'
    )
    await openManuscript(project(), 'ink/main.ink')

    const outcome = await trace('inner')

    expect(outcome.error).toBeNull()
    expect(outcome.startedAt).toBeNull()
    expect(outcome.steps).toBe(1)
    expect(prose(outcome.manuscript)).toEqual(['The gate stood open.', 'Inside was colder.'])
  })

  it('begins at the knot when nothing routes to it', async () => {
    await story(
      '-> start',
      '=== start ===',
      'The gate stood open.',
      '-> END',
      '=== orphan ===',
      'Nobody has written the way here yet.',
      '-> END'
    )
    await openManuscript(project(), 'ink/main.ink')

    const outcome = await trace('orphan')

    // The reading is real, not an error with the old page left up.
    expect(outcome.error).toBeNull()
    expect(outcome.startedAt).toBe('orphan')
    expect(outcome.steps).toBe(0)
    expect(prose(outcome.manuscript)).toEqual(['Nobody has written the way here yet.'])
  })

  // The case that prompted this: a knot at the end of a long chain, where the
  // forward search gives up. Reading begins at the head of the chain instead.
  it('walks the diverts back to a knot nothing refers to', async () => {
    await story(
      '-> start',
      '=== start ===',
      'The gate stood open.',
      '-> END',
      '=== arrival ===',
      'She was waiting.',
      '-> the_offer',
      '=== the_offer ===',
      'She named her price.',
      '-> the_answer',
      '=== the_answer ===',
      'He agreed.',
      '-> END'
    )
    await openManuscript(project(), 'ink/main.ink')

    const outcome = await trace('the_answer')

    expect(outcome.error).toBeNull()
    // `arrival` is referred to by nothing, so that is where reading begins.
    expect(outcome.startedAt).toBe('arrival')
    expect(prose(outcome.manuscript)).toEqual([
      'She was waiting.',
      'She named her price.',
      'He agreed.'
    ])
  })

  it('stops walking back when the chain meets itself', async () => {
    await story(
      '-> start',
      '=== start ===',
      'Begin.',
      '-> END',
      '=== hub ===',
      'The hub.',
      '-> scene',
      '=== scene ===',
      'A scene.',
      '-> hub'
    )
    await openManuscript(project(), 'ink/main.ink')

    const outcome = await trace('scene')

    // hub -> scene -> hub is a loop; it must not be followed round for ever.
    expect(outcome.error).toBeNull()
    expect(outcome.startedAt).toBe('hub')
  })

  it('still refuses a knot the story does not contain', async () => {
    await story('-> start', '=== start ===', 'The gate stood open.', '-> END')
    await openManuscript(project(), 'ink/main.ink')

    const outcome = await trace('no_such_knot')

    expect(outcome.error).not.toBeNull()
    expect(outcome.startedAt).toBeNull()
    // The previous reading is left standing rather than being emptied.
    expect(prose(outcome.manuscript)).toEqual(['The gate stood open.'])
  })
})
