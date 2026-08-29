import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { isIdOf } from '@shared/ids'
import { parseMap } from '@shared/bundle/mapDoc'
import { parseMedia } from '@shared/mediaDoc'
import { parseNpcs } from '@shared/bundle/npcDoc'
import { flattenPlan, parsePlan } from '@shared/planDoc'
import type { ToolContext } from './workspaceTools'

/**
 * The three documents nothing is generated from.
 *
 * Each tool is here for one failure a plain file write would not surface: a
 * hotspot pointing at a knot nobody wrote, a look pointing at a picture nobody
 * added, a plan node whose id was invented twice. All three are accepted by the
 * app and go wrong later, somewhere else.
 */

let root = ''

vi.mock('../workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

const { readProject } = await import('../project')
const { runTool } = await import('./workspaceTools')
const { ALL_TOOLS } = await import('./tools')

const ENTRY = `// The story.

-> the_door

=== the_door ===
The door is shut.
-> the_archive

=== the_archive ===
Shelves, and the woman who keeps them.
* [Leave]
    -> END
`

let context: ToolContext
let projectPath = ''

const call = async (
  name: string,
  args: unknown
): Promise<{ ok: boolean; content: string; summary: string }> =>
  runTool(name, JSON.stringify(args), context, ALL_TOOLS)

const read = async (path: string): Promise<string> =>
  readFile(join(projectPath, path.split('/').join(sep)), 'utf8')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-docs-'))
  projectPath = join(root, 'projects', 'the-lighthouse')
  await mkdir(join(projectPath, 'ink'), { recursive: true })
  await writeFile(join(projectPath, 'ink', 'main.ink'), ENTRY, 'utf8')
  await writeFile(
    join(projectPath, 'project.md'),
    '---\nid: prj_2n8v5h1t6w\ntitle: The Lighthouse\nlibraries: []\nmain: ink/main.ink\n---\n\nA light.\n',
    'utf8'
  )

  const project = (await readProject(projectPath))!
  context = { root, written: [], project }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ plan -- */

describe('write_plan', () => {
  it('mints a unique id per node, which is the thing a file write gets wrong', async () => {
    await call('write_plan', {
      nodes: [
        { title: 'Act One', children: [{ title: 'The door' }, { title: 'Inside' }] },
        { title: 'Act Two' }
      ]
    })

    const plan = parsePlan(await read('plan.json'))
    const ids = flattenPlan(plan).map((node) => node.id)

    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids.every((id) => isIdOf(id, 'pln'))).toBe(true)
  })

  it('takes a markdown outline, the way the app imports one', async () => {
    await call('write_plan', {
      markdown: '# Act One\n\nThe situation.\n\n## The door\n\nShe arrives after hours.\n'
    })

    const plan = parsePlan(await read('plan.json'))
    expect(plan.nodes.map((node) => node.title)).toEqual(['Act One'])
    expect(plan.nodes[0]?.summary).toContain('The situation')
    expect(plan.nodes[0]?.children.map((node) => node.title)).toEqual(['The door'])
  })

  it('merges by title and keeps the id, so links survive a second call', async () => {
    await call('write_plan', { nodes: [{ title: 'Act One' }] })
    const first = parsePlan(await read('plan.json')).nodes[0]!.id

    await call('write_plan', {
      nodes: [{ title: 'Act One', summary: 'The situation.', status: 'drafting' }]
    })

    const plan = parsePlan(await read('plan.json'))
    expect(plan.nodes).toHaveLength(1)
    expect(plan.nodes[0]?.id).toBe(first)
    expect(plan.nodes[0]?.summary).toBe('The situation.')
    expect(plan.nodes[0]?.status).toBe('drafting')
  })

  it('does not drop a branch the second call did not mention', async () => {
    await call('write_plan', { nodes: [{ title: 'Act One' }, { title: 'Act Two' }] })
    await call('write_plan', { nodes: [{ title: 'Act One', summary: 'Changed.' }] })

    const plan = parsePlan(await read('plan.json'))
    expect(plan.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two'])
  })

  it('replaces only when asked, because there is no undo', async () => {
    await call('write_plan', { nodes: [{ title: 'Act One' }, { title: 'Act Two' }] })
    await call('write_plan', { nodes: [{ title: 'Only this' }], replace: true })

    const plan = parsePlan(await read('plan.json'))
    expect(plan.nodes.map((node) => node.title)).toEqual(['Only this'])
  })

  it('drops a fourth level, which nothing renders', async () => {
    await call('write_plan', {
      nodes: [
        {
          title: 'Act One',
          children: [
            { title: 'Chapter', children: [{ title: 'Scene', children: [{ title: 'Too deep' }] }] }
          ]
        }
      ]
    })

    const titles = flattenPlan(parsePlan(await read('plan.json'))).map((node) => node.title)
    expect(titles).toEqual(['Act One', 'Chapter', 'Scene'])
  })
})

/* ------------------------------------------------------------------- map -- */

describe('write_map', () => {
  it('names a target that is not a knot, which nothing else would report', async () => {
    const result = await call('write_map', {
      locations: [
        { label: 'The Archive', target: 'the_archive' },
        { label: 'The Tower', target: 'the_tower' }
      ]
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain('The Tower → the_tower')
    expect(result.content).not.toContain('The Archive →')
  })

  it('writes the places anyway, because a map is laid out before the ink is written', async () => {
    await call('write_map', { locations: [{ label: 'The Tower', target: 'the_tower' }] })

    const doc = parseMap(await read('map.json'))
    expect(doc.maps[0]!.locations.map((one) => one.label)).toEqual(['The Tower'])
  })

  it('places a hotspot nobody positioned, and does not stack them', async () => {
    await call('write_map', {
      locations: [
        { label: 'One', target: 'the_door' },
        { label: 'Two', target: 'the_door' }
      ]
    })

    const doc = parseMap(await read('map.json'))
    const [first, second] = doc.maps[0]!.locations
    expect(first!.x).toBeGreaterThan(0)
    expect(second!.x).not.toBe(first!.x)
  })

  it('keeps a gate, and reports one the map could not read', async () => {
    const good = await call('write_map', {
      locations: [
        {
          label: 'The Archive',
          target: 'the_archive',
          available: {
            op: 'compare',
            left: { source: 'stat', key: 'resolve' },
            cmp: '>=',
            right: 3
          }
        }
      ]
    })
    expect(good.content).not.toMatch(/stands open/)
    expect(parseMap(await read('map.json')).maps[0]!.locations[0]?.available).not.toBeNull()

    const bad = await call('write_map', {
      locations: [{ label: 'The Door', target: 'the_door', available: { op: 'sometimes' } }]
    })
    expect(bad.ok).toBe(false)
    expect(bad.content).toMatch(/The Door/)
    expect(bad.content).toMatch(/stands open/)
  })

  it('leaves an existing gate alone when a later call does not mention it', async () => {
    await call('write_map', {
      locations: [
        {
          label: 'The Archive',
          target: 'the_archive',
          available: { op: 'compare', left: { source: 'stat', key: 'resolve' }, cmp: '>=', right: 3 }
        }
      ]
    })
    await call('write_map', { locations: [{ label: 'The Archive', target: 'the_archive' }] })

    expect(parseMap(await read('map.json')).maps[0]!.locations[0]?.available).not.toBeNull()
  })

  it('merges by label rather than adding the same place twice', async () => {
    await call('write_map', { locations: [{ label: 'The Archive', target: 'the_door' }] })
    await call('write_map', { locations: [{ label: 'the archive', target: 'the_archive' }] })

    const doc = parseMap(await read('map.json'))
    expect(doc.maps[0]!.locations).toHaveLength(1)
    expect(doc.maps[0]!.locations[0]?.destination).toEqual({ to: 'knot', name: 'the_archive' })
  })

  it('makes a map that is named but not there yet', async () => {
    const result = await call('write_map', {
      map: 'The City',
      display: 'The City',
      locations: [{ label: 'The Inn', target: 'the_door' }]
    })

    const doc = parseMap(await read('map.json'))
    expect(doc.maps.map((one) => one.name)).toEqual(['the_city'])
    expect(doc.maps[0]!.display).toBe('The City')
    expect(result.summary).toContain('The City')
  })

  /** Two maps may each have a Gate; merging on the label alone would move one. */
  it('merges within the named map, not across every map', async () => {
    await call('write_map', { map: 'world', locations: [{ label: 'Gate', target: 'the_door' }] })
    await call('write_map', { map: 'city', locations: [{ label: 'Gate', target: 'the_archive' }] })

    const doc = parseMap(await read('map.json'))
    expect(doc.maps.map((one) => one.name)).toEqual(['world', 'city'])
    expect(doc.maps[0]!.locations[0]!.destination).toEqual({ to: 'knot', name: 'the_door' })
    expect(doc.maps[1]!.locations[0]!.destination).toEqual({ to: 'knot', name: 'the_archive' })
  })

  it('writes a place that opens another map', async () => {
    await call('write_map', { map: 'city', locations: [{ label: 'Inn', target: 'the_door' }] })
    const result = await call('write_map', {
      map: 'world',
      locations: [{ label: 'The City', to: 'map', target: 'city' }]
    })

    expect(result.ok).toBe(true)
    const doc = parseMap(await read('map.json'))
    expect(doc.maps[1]!.locations[0]!.destination).toEqual({ to: 'map', name: 'city' })
  })

  it('names a map destination that is not a map, the way it does a knot', async () => {
    const result = await call('write_map', {
      locations: [{ label: 'The City', to: 'map', target: 'nowhere' }]
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain('The City → nowhere (a map)')
  })

  it('records the knots a map is the map for, and reports one the story lacks', async () => {
    const result = await call('write_map', {
      map: 'world',
      knots: ['the_door', 'not_a_knot'],
      locations: [{ label: 'The Archive', target: 'the_archive' }]
    })

    expect(parseMap(await read('map.json')).maps[0]!.knots).toEqual(['the_door', 'not_a_knot'])
    expect(result.content).toContain('not_a_knot')
  })
})

/* ----------------------------------------------------------------- media -- */

describe('write_media', () => {
  it('refuses a character, and names the tool that files one', async () => {
    const result = await call('write_media', {
      assets: [
        { name: 'maren', kind: 'character', variants: [{ file: 'sprites/maren.png' }] },
        { name: 'harbour', kind: 'background' }
      ]
    })

    // A character catalogued here would be unreachable: the media screen has no
    // character tab, and the cast finds one only through a cast member.
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/write_cast/)
    expect(result.content).toMatch(/maren/)

    // All or nothing: the background beside it is not written either.
    await expect(read('media.json')).rejects.toThrow()
  })

  it('names a look whose file is not in media/, which shows nothing at runtime', async () => {
    const result = await call('write_media', {
      assets: [
        {
          name: 'harbour',
          kind: 'background',
          variants: [{ name: 'dusk', file: 'bg/harbour-dusk.png' }]
        }
      ]
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain('bg/harbour-dusk.png')
  })

  it('is satisfied when the file is actually there', async () => {
    await mkdir(join(projectPath, 'media', 'bg'), { recursive: true })
    await writeFile(join(projectPath, 'media', 'bg', 'harbour-dusk.png'), 'x', 'utf8')

    const result = await call('write_media', {
      assets: [
        {
          name: 'harbour',
          kind: 'background',
          variants: [{ name: 'dusk', file: 'bg/harbour-dusk.png' }]
        }
      ]
    })

    expect(result.ok).toBe(true)
  })

  it('turns a name into an ink identifier', async () => {
    await call('write_media', { assets: [{ name: 'The Old Harbour', kind: 'background' }] })

    const doc = parseMedia(await read('media.json'))
    expect(doc.assets[0]?.name).toBe('the_old_harbour')
    expect(doc.assets[0]?.display).toBe('The Old Harbour')
  })

  it('keeps a background and an animation of the same name apart', async () => {
    await call('write_media', {
      assets: [
        { name: 'harbour', kind: 'background' },
        { name: 'harbour', kind: 'animation' }
      ]
    })

    expect(parseMedia(await read('media.json')).assets).toHaveLength(2)
  })

  it('merges looks rather than replacing them', async () => {
    await call('write_media', {
      assets: [{ name: 'harbour', kind: 'background', variants: [{ name: 'day', file: 'a.png' }] }]
    })
    await call('write_media', {
      assets: [{ name: 'harbour', kind: 'background', variants: [{ name: 'dusk', file: 'b.png' }] }]
    })

    const doc = parseMedia(await read('media.json'))
    expect(doc.assets).toHaveLength(1)
    expect(doc.assets[0]?.variants.map((one) => one.name)).toEqual(['day', 'dusk'])
  })

  it('catalogues music with one direct file rather than variants', async () => {
    await mkdir(join(projectPath, 'media', 'music'), { recursive: true })
    await writeFile(join(projectPath, 'media', 'music', 'theme.mp3'), 'x', 'utf8')

    const result = await call('write_media', {
      assets: [{ name: 'Theme', kind: 'music', file: 'music/theme.mp3' }]
    })

    expect(result.ok).toBe(true)
    const stored = JSON.parse(await read('media.json')).assets[0]
    expect(stored).toMatchObject({ kind: 'music', name: 'theme', file: 'music/theme.mp3' })
    expect(stored).not.toHaveProperty('variants')
  })

  it('catalogues a cue with one direct file rather than variants', async () => {
    await mkdir(join(projectPath, 'media', 'music'), { recursive: true })
    await writeFile(join(projectPath, 'media', 'music', 'door.ogg'), 'x', 'utf8')

    const result = await call('write_media', {
      assets: [{ name: 'Door slam', kind: 'music', file: 'music/door.ogg' }]
    })

    expect(result.ok).toBe(true)
    const stored = JSON.parse(await read('media.json')).assets[0]
    expect(stored).toMatchObject({ kind: 'music', name: 'door_slam', file: 'music/door.ogg' })
    expect(stored).not.toHaveProperty('variants')
  })

  it('says an asset has no look yet rather than leaving it silently unshowable', async () => {
    const result = await call('write_media', { assets: [{ name: 'harbour', kind: 'background' }] })
    expect(result.content).toMatch(/no look yet/)
  })
})

/* ------------------------------------------------------- cast sprites -- */

describe('write_cast looks', () => {
  it('files a character’s sprites, which write_media will not take', async () => {
    await mkdir(join(projectPath, 'media', 'sprites'), { recursive: true })
    await writeFile(join(projectPath, 'media', 'sprites', 'maren.png'), 'x', 'utf8')

    const result = await call('write_cast', {
      cast: [{ name: 'Maren', looks: [{ name: 'neutral', file: 'sprites/maren.png' }] }]
    })

    expect(result.ok).toBe(true)

    const media = parseMedia(await read('media.json'))
    expect(media.assets).toHaveLength(1)
    expect(media.assets[0]).toMatchObject({ kind: 'character', name: 'maren' })
    expect(media.assets[0]?.variants[0]).toMatchObject({
      name: 'neutral',
      file: 'sprites/maren.png'
    })
  })

  it('points the cast member at the asset, which is what makes the tag reachable', async () => {
    await call('write_cast', {
      cast: [{ name: 'Maren', looks: [{ name: 'neutral', file: 'sprites/maren.png' }] }]
    })

    const doc = parseNpcs(await read('npcs.json'))
    expect(doc.npcs[0]?.sprite).toBe('maren')
  })

  it('reports a look whose file is not in media/', async () => {
    const result = await call('write_cast', {
      cast: [{ name: 'Maren', looks: [{ file: 'sprites/gone.png' }] }]
    })

    expect(result.ok).toBe(false)
    expect(result.content).toContain('sprites/gone.png')
  })

  it('adds a look to a character that already has one', async () => {
    await call('write_cast', {
      cast: [{ name: 'Maren', looks: [{ name: 'neutral', file: 'a.png' }] }]
    })
    await call('write_cast', {
      cast: [{ name: 'Maren', looks: [{ name: 'happy', file: 'b.png' }] }]
    })

    const media = parseMedia(await read('media.json'))
    expect(media.assets).toHaveLength(1)
    expect(media.assets[0]?.variants.map((one) => one.name)).toEqual(['neutral', 'happy'])
  })

  it('leaves someone who never appears without an asset at all', async () => {
    await call('write_cast', { cast: [{ name: 'Maren', flags: [{ key: 'knows' }] }] })

    await expect(read('media.json')).rejects.toThrow()
    expect(parseNpcs(await read('npcs.json')).npcs[0]?.sprite).toBe('')
  })
})

/* ----------------------------------------------------------- every tool -- */

describe('all of them', () => {
  it('reports what it wrote, so the open pane reloads', async () => {
    await call('write_plan', { nodes: [{ title: 'Act One' }] })
    await call('write_map', { locations: [{ label: 'A', target: 'the_door' }] })
    await call('write_media', { assets: [{ name: 'harbour', kind: 'background' }] })

    expect(context.written).toEqual(
      expect.arrayContaining([
        'projects/the-lighthouse/plan.json',
        'projects/the-lighthouse/map.json',
        'projects/the-lighthouse/media.json'
      ])
    )
  })

  it('refuses to act with no project open rather than guessing at one', async () => {
    context.project = null

    for (const name of ['write_plan', 'write_map', 'write_media', 'write_cast']) {
      const result = await call(name, { nodes: [], locations: [], assets: [], cast: [] })
      expect(result.ok, name).toBe(false)
      expect(result.content, name).toMatch(/No project is open/)
    }
  })
})
