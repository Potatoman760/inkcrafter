import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Project } from '@shared/project'

/**
 * Staging a section, all the way to the file.
 *
 * The locator has its own tests against lines held in memory; this is the other
 * half — a real story, compiled, read, written and recompiled. Everything that
 * can only go wrong end to end lives here: whether the tag lands where the
 * locator said, whether the reading afterwards actually shows it, and whether
 * the second edit finds the first one now that every line below it has moved.
 */

vi.mock('electron', () => ({
  net: { fetch: async () => new Response(null) },
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} }
}))

const { openManuscript, closeManuscript, setSectionTag, clearSectionTag } = await import('./session')

let root = ''

const project = (): Project =>
  ({ id: 'prj_0000000000', title: 'Probe', path: root }) as unknown as Project

async function story(...lines: string[]): Promise<void> {
  await mkdir(join(root, 'ink'), { recursive: true })
  await writeFile(join(root, 'ink', 'main.ink'), lines.join('\n'), 'utf8')
}

const written = async (): Promise<string[]> =>
  (await readFile(join(root, 'ink', 'main.ink'), 'utf8')).split(/\r?\n/)

const open = () => openManuscript(project(), 'ink/main.ink')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-stage-'))
})

afterEach(async () => {
  closeManuscript()
  await rm(root, { recursive: true, force: true })
})

describe('setSectionTag', () => {
  it('adds a tag above the section that had none', async () => {
    await story('-> start', '=== start ===', 'You have arrived.', '-> END')
    await open()

    const outcome = await setSectionTag(0, { kind: 'bg', name: 'grove', variant: null })

    expect(outcome.error).toBeNull()
    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# bg: grove',
      'You have arrived.',
      '-> END'
    ])
  })

  /**
   * The case the whole locator exists for: the tags are above the first line
   * the manuscript has an anchor for, so a second background must find the
   * first one rather than stack a contradicting line beneath it.
   */
  it('replaces the background already written above the section', async () => {
    await story('-> start', '=== start ===', '# bg: grove', 'You have arrived.', '-> END')
    await open()

    await setSectionTag(0, { kind: 'bg', name: 'harbour', variant: 'dusk' })

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# bg: harbour/dusk',
      'You have arrived.',
      '-> END'
    ])
  })

  it('leaves the other characters standing when it changes one', async () => {
    await story(
      '-> start',
      '=== start ===',
      '# show: wren at left',
      '# show: kael at right',
      'They wait.',
      '-> END'
    )
    await open()

    await setSectionTag(0, { kind: 'show', name: 'wren', variant: 'happy', slot: null, flipped: false })

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# show: wren/happy',
      '# show: kael at right',
      'They wait.',
      '-> END'
    ])
  })

  it('adds a second character below the first', async () => {
    await story('-> start', '=== start ===', '# show: wren at left', 'She waits.', '-> END')
    await open()

    await setSectionTag(0, { kind: 'show', name: 'kael', variant: null, slot: 'right', flipped: false })

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# show: wren at left',
      '# show: kael at right',
      'She waits.',
      '-> END'
    ])
  })

  it('keeps the spacing the author wrote', async () => {
    await story('-> start', '=== start ===', '#bg: grove', 'You have arrived.', '-> END')
    await open()

    await setSectionTag(0, { kind: 'bg', name: 'harbour', variant: null })

    expect((await written())[2]).toBe('#bg: harbour')
  })

  it('leaves prose alone when the tag was written at the end of a line', async () => {
    await story('-> start', '=== start ===', 'She turns. # bg: grove', '-> END')
    await open()

    await setSectionTag(0, { kind: 'bg', name: 'harbour', variant: null })

    expect((await written())[2]).toBe('She turns. # bg: harbour')
  })

  /**
   * Every write shifts the lines below it, so the second edit is reading a
   * manuscript rebuilt after the first. This is the case that would break if
   * anything cached a line number across a reread.
   */
  it('finds its own last edit after the lines have moved', async () => {
    await story('-> start', '=== start ===', 'You have arrived.', '-> END')
    await open()

    await setSectionTag(0, { kind: 'bg', name: 'grove', variant: null })
    await setSectionTag(0, { kind: 'music', name: 'theme', variant: null })
    await setSectionTag(0, { kind: 'bg', name: 'harbour', variant: null })

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# bg: harbour',
      '# music: theme',
      'You have arrived.',
      '-> END'
    ])
  })

  it('stages the section the author picked, not the first one', async () => {
    await story(
      '-> start',
      '=== start ===',
      'The opening.',
      '* [On] -> second',
      '=== second ===',
      'The next beat.',
      '-> END'
    )
    const first = await open()
    // Take the choice, so the manuscript holds two sections.
    const junctionNode = first.nodes.find((node) => node.kind === 'junction')!
    const { chooseAt } = await import('./session')
    chooseAt(junctionNode.id, 0)

    await setSectionTag(1, { kind: 'bg', name: 'harbour', variant: null })

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      'The opening.',
      '* [On] -> second',
      '=== second ===',
      '# bg: harbour',
      'The next beat.',
      '-> END'
    ])
  })

  it('says so rather than throwing when there is no such section', async () => {
    await story('-> start', '=== start ===', 'You have arrived.', '-> END')
    await open()

    const outcome = await setSectionTag(9, { kind: 'bg', name: 'grove', variant: null })

    expect(outcome.error).toBe('No such section.')
  })

  it('reads the tag back through the manuscript it returns', async () => {
    await story('-> start', '=== start ===', 'You have arrived.', '-> END')
    await open()

    const outcome = await setSectionTag(0, { kind: 'bg', name: 'grove', variant: null })
    const tags = outcome.manuscript.nodes.flatMap((node) =>
      node.kind === 'prose' ? node.tags : []
    )

    expect(tags).toContain('bg: grove')
  })
})

describe('clearSectionTag', () => {
  it('takes the whole line when the tag was all of it', async () => {
    await story('-> start', '=== start ===', '# bg: grove', 'You have arrived.', '-> END')
    await open()

    const outcome = await clearSectionTag(0, 'bg: grove')

    expect(outcome.error).toBeNull()
    expect(await written()).toEqual(['-> start', '=== start ===', 'You have arrived.', '-> END'])
  })

  it('keeps a line that had prose on it', async () => {
    await story('-> start', '=== start ===', 'She turns. # bg: grove', '-> END')
    await open()

    await clearSectionTag(0, 'bg: grove')

    expect((await written())[2]).toBe('She turns.')
  })

  it('takes only the tag it was asked for', async () => {
    await story(
      '-> start',
      '=== start ===',
      '# bg: grove',
      '# show: wren at left',
      'She waits.',
      '-> END'
    )
    await open()

    await clearSectionTag(0, 'bg: grove')

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# show: wren at left',
      'She waits.',
      '-> END'
    ])
  })

  it('says so when the tag is no longer there', async () => {
    await story('-> start', '=== start ===', 'You have arrived.', '-> END')
    await open()

    const outcome = await clearSectionTag(0, 'bg: grove')

    expect(outcome.error).toMatch(/no longer has a "bg: grove" tag/)
  })
})

/**
 * Editing a row rather than adding one.
 *
 * The subject rule cannot serve both: changing a character from Wren to Kael is
 * one edit to the author and two different subjects to `replaces`.
 */
describe('setSectionTag, replacing a named tag', () => {
  it('rewrites the tag named, even when the subject changed', async () => {
    await story(
      '-> start',
      '=== start ===',
      '# show: wren at left',
      '# show: kael at right',
      'They wait.',
      '-> END'
    )
    await open()

    await setSectionTag(
      0,
      { kind: 'show', name: 'maren', variant: null, slot: 'left', flipped: false },
      'show: wren at left'
    )

    expect(await written()).toEqual([
      '-> start',
      '=== start ===',
      '# show: maren at left',
      '# show: kael at right',
      'They wait.',
      '-> END'
    ])
  })

  it('keeps the tag where the author put it', async () => {
    await story('-> start', '=== start ===', 'She turns. # stat: courage +1', '-> END')
    await open()

    await setSectionTag(0, { kind: 'stat', stat: 'faith', op: '=', value: 3 }, 'stat: courage +1')

    expect((await written())[2]).toBe('She turns. # stat: faith = 3')
  })

  /** Still on screen, no longer in the file: write it rather than refuse. */
  it('falls back to the subject rule when the named tag has gone', async () => {
    await story('-> start', '=== start ===', '# bg: grove', 'You have arrived.', '-> END')
    await open()

    const outcome = await setSectionTag(
      0,
      { kind: 'bg', name: 'harbour', variant: null },
      'bg: something_else'
    )

    expect(outcome.error).toBeNull()
    expect((await written())[2]).toBe('# bg: harbour')
  })
})

/**
 * The shape a real knot has: a header, several staging tags, then the prose.
 *
 * The manuscript anchors that paragraph to the first tag line, so this is the
 * arrangement that broke — changing the second character wrote a third line
 * rather than rewriting his.
 */
describe('a knot staged with several tags', () => {
  const knot = [
    '-> arrival',
    '',
    '=== arrival ===',
    '# bg: grove',
    '# show: wren at left',
    '# show: kael/neutral at right',
    'The portal opens.',
    '-> END'
  ]

  it('changes the second character rather than adding a third line', async () => {
    await story(...knot)
    await open()

    await setSectionTag(
      0,
      { kind: 'show', name: 'kael', variant: 'wary', slot: 'right', flipped: false },
      'show: kael/neutral at right'
    )

    expect((await written()).filter((line) => line.startsWith('#'))).toEqual([
      '# bg: grove',
      '# show: wren at left',
      '# show: kael/wary at right'
    ])
  })

  it('moves one character without disturbing the other', async () => {
    await story(...knot)
    await open()

    await setSectionTag(
      0,
      { kind: 'show', name: 'kael', variant: 'neutral', slot: 'middle', flipped: false },
      'show: kael/neutral at right'
    )

    expect((await written())[5]).toBe('# show: kael/neutral at middle')
    expect((await written())[4]).toBe('# show: wren at left')
  })

  it('takes one of them out and leaves the rest of the staging alone', async () => {
    await story(...knot)
    await open()

    await clearSectionTag(0, 'show: kael/neutral at right')

    expect((await written()).filter((line) => line.startsWith('#'))).toEqual([
      '# bg: grove',
      '# show: wren at left'
    ])
  })
})
