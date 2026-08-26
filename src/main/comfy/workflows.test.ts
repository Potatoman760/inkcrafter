import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listWorkflows, loadWorkflows, resolveWorkflow } from './workflows'
import type { BindingOverride, WorkflowRole } from '@shared/comfy'

/** The three parts of the settings these read, with nothing set. */
const NOTHING = { overrides: {}, roles: {}, defaults: {} }

const withOverrides = (overrides: Record<string, BindingOverride>) => ({ ...NOTHING, overrides })
const withRoles = (roles: Record<string, WorkflowRole>) => ({ ...NOTHING, roles })

/**
 * The folder of exported workflows.
 *
 * Real files in a real folder, because what this does is read a folder — and
 * the cases that matter are the ones where something in it is not what it
 * should be, which a stubbed filesystem would let through.
 */

const WORKFLOW = JSON.stringify({
  '3': {
    class_type: 'KSampler',
    inputs: { seed: 1, positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] }
  },
  '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'a harbour' } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry' } },
  '9': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
})

/** The same graph, but taking a picture in — so it edits rather than creates. */
const EDIT_WORKFLOW = JSON.stringify({
  '3': {
    class_type: 'KSampler',
    inputs: { seed: 1, positive: ['6', 0], negative: ['7', 0], latent_image: ['12', 0] }
  },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'a harbour' } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry' } },
  '10': { class_type: 'LoadImage', inputs: { image: 'base.png' } },
  '12': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0] } },
  '9': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
})

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-comfy-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadWorkflows', () => {
  it('reads every .json and ignores everything else', async () => {
    await writeFile(join(root, 'portrait.json'), WORKFLOW)
    await writeFile(join(root, 'background.json'), WORKFLOW)
    await writeFile(join(root, 'notes.txt'), 'not a workflow')
    await writeFile(join(root, 'sample.png'), Buffer.from([0x89, 0x50]))

    const result = await loadWorkflows(root, NOTHING)

    expect(result.loaded.map((one) => one.name)).toEqual(['background', 'portrait'])
    expect(result.loaded[0]?.bindings.positive).toEqual({ node: '6', field: 'text' })
  })

  it('keeps a file that will not parse, with the reason attached', async () => {
    await writeFile(join(root, 'good.json'), WORKFLOW)
    await writeFile(join(root, 'canvas.json'), JSON.stringify({ nodes: [], links: [] }))

    const result = await loadWorkflows(root, NOTHING)

    expect(result.loaded.map((one) => one.name)).toEqual(['good'])
    // Dropped from the list, it would look like the file was never there.
    expect(result.broken).toHaveLength(1)
    expect(result.broken[0]?.problem).toMatch(/Export \(API\)/)
  })

  it('applies an override, keyed by the file name', async () => {
    await writeFile(join(root, 'portrait.json'), WORKFLOW)

    const result = await loadWorkflows(root, withOverrides({
      'portrait.json': { positive: { node: '7', field: 'text' } }
    }))

    expect(result.loaded[0]?.bindings.positive).toEqual({ node: '7', field: 'text' })
  })

  it('carries an override that deliberately unbinds a slot', async () => {
    await writeFile(join(root, 'portrait.json'), WORKFLOW)

    const result = await loadWorkflows(root, withOverrides({ 'portrait.json': { negative: null } }))

    expect(result.loaded[0]?.bindings.negative).toBeNull()
    expect(result.loaded[0]?.bindings.positive).toEqual({ node: '6', field: 'text' })
  })

  it('says so plainly when there is no folder', async () => {
    const missing = await loadWorkflows(join(root, 'nowhere'), NOTHING)
    expect(missing.ok).toBe(false)
    expect(missing.message).toMatch(/no folder at/)

    const unset = await loadWorkflows(null, NOTHING)
    expect(unset.message).toMatch(/No workflow folder/)
  })

  it('names the menu item when the folder holds no workflows', async () => {
    await writeFile(join(root, 'readme.txt'), 'hello')

    const result = await loadWorkflows(root, NOTHING)
    expect(result.message).toMatch(/Export \(API\)/)
  })
})

describe('roles and defaults', () => {
  it('sorts each workflow by what it is for', async () => {
    await writeFile(join(root, 'draw.json'), WORKFLOW)
    await writeFile(join(root, 'edit.json'), EDIT_WORKFLOW)

    const result = await loadWorkflows(root, NOTHING)
    expect(result.loaded.map((one) => [one.name, one.role])).toEqual([
      ['draw', 'creates'],
      ['edit', 'edits']
    ])
  })

  it('lets the author overrule what was read', async () => {
    await writeFile(join(root, 'draw.json'), WORKFLOW)

    const result = await loadWorkflows(root, withRoles({ 'draw.json': 'edits' }))
    expect(result.loaded[0]?.role).toBe('edits')
    expect(result.loaded[0]?.roleByHand).toBe(true)
  })

  it('marks one default of each kind, so both requests have an answer', async () => {
    await writeFile(join(root, 'draw.json'), WORKFLOW)
    await writeFile(join(root, 'draw-two.json'), WORKFLOW)
    await writeFile(join(root, 'edit.json'), EDIT_WORKFLOW)

    const result = await listWorkflows(root, { ...NOTHING, defaults: { creates: 'draw-two.json' } })

    expect(result.workflows.filter((one) => one.isDefault).map((one) => one.name)).toEqual([
      'draw-two',
      'edit'
    ])
  })

  it('refuses a request it has no workflow for, and says what to do', async () => {
    await writeFile(join(root, 'draw.json'), WORKFLOW)

    const { loaded } = await loadWorkflows(root, NOTHING)
    const { workflow, problem } = resolveWorkflow(loaded, '', { role: 'edits', default: undefined })

    expect(workflow).toBeNull()
    expect(problem).toMatch(/No workflow here edits a picture/)
  })

  it('refuses one named but of the wrong kind, rather than ignoring the picture', async () => {
    await writeFile(join(root, 'draw.json'), WORKFLOW)
    await writeFile(join(root, 'edit.json'), EDIT_WORKFLOW)

    const { loaded } = await loadWorkflows(root, NOTHING)
    const { workflow, problem } = resolveWorkflow(loaded, 'draw', { role: 'edits', default: undefined })

    expect(workflow).toBeNull()
    expect(problem).toMatch(/makes a picture from nothing, which is not what this needs/)
  })
})

describe('listWorkflows', () => {
  it('flattens to something that can cross to the renderer', async () => {
    await writeFile(join(root, 'portrait.json'), WORKFLOW)
    await writeFile(join(root, 'broken.json'), '{ not json')

    const result = await listWorkflows(root, NOTHING)

    expect(result.workflows.map((one) => one.name)).toEqual(['broken', 'portrait'])
    expect(result.workflows[0]?.analysis).toBeNull()
    expect(result.workflows[1]?.analysis?.notes.positive).toMatch(/followed KSampler #3/)
    // Structured-cloneable: no Maps, no graphs, nothing that dies over IPC.
    expect(() => structuredClone(result)).not.toThrow()
  })
})

describe('resolveWorkflow', () => {
  const loaded = [
    { name: 'portrait-sdxl', role: 'creates' },
    { name: 'background-wide', role: 'creates' },
    { name: 'background-tall', role: 'creates' }
  ] as Parameters<typeof resolveWorkflow>[0]

  /** What an ordinary "draw me something" request needs. */
  const CREATE = { role: 'creates' as const, default: undefined }

  it('takes the only one when none was named', () => {
    const one = [{ name: 'portrait', role: 'creates' }] as typeof loaded
    expect(resolveWorkflow(one, '', CREATE)?.workflow?.name).toBe('portrait')
  })

  it('takes the first of its kind when several exist and none was named', () => {
    // It used to refuse here, which made every request name a workflow to say
    // something the author had already decided once.
    expect(resolveWorkflow(loaded, '', CREATE).workflow?.name).toBe('portrait-sdxl')
  })

  it('takes the author’s default over the first', () => {
    const chosen = { role: 'creates' as const, default: 'background-wide.json' }
    const withFiles = loaded.map((one) => ({ ...one, file: `${one.name}.json` })) as typeof loaded

    expect(resolveWorkflow(withFiles, '', chosen).workflow?.name).toBe('background-wide')
  })

  it('falls back rather than refusing when the default has gone', () => {
    // The folder is a folder: a workflow can be renamed with the app shut.
    const stale = { role: 'creates' as const, default: 'deleted.json' }
    expect(resolveWorkflow(loaded, '', stale).workflow?.name).toBe('portrait-sdxl')
  })

  it('forgives the case and a left-on extension', () => {
    expect(resolveWorkflow(loaded, 'Portrait-SDXL', CREATE).workflow?.name).toBe('portrait-sdxl')
    expect(resolveWorkflow(loaded, 'portrait-sdxl.json', CREATE).workflow?.name).toBe('portrait-sdxl')
  })

  it('accepts a prefix only when it can mean one thing', () => {
    expect(resolveWorkflow(loaded, 'portrait', CREATE).workflow?.name).toBe('portrait-sdxl')
    expect(resolveWorkflow(loaded, 'background', CREATE).problem).toMatch(/could be any of/)
  })

  it('lists what there is when the name is wrong', () => {
    const problem = resolveWorkflow(loaded, 'hotspot', CREATE).problem
    expect(problem).toContain('portrait-sdxl')
    expect(problem).toContain('background-wide')
  })
})
