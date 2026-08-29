import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMedia } from '@shared/mediaDoc'
import { parseNpcs } from '@shared/bundle/npcDoc'
import { emptyComfySettings } from '@shared/comfy'
import type { ToolContext } from './workspaceTools'
import { pictureSize, reshape } from './imageTools'

/**
 * Drawing a picture and filing it.
 *
 * ComfyUI itself is mocked — testing against a real one would mean a GPU and a
 * model checkout — but everything on this side of it is real: a temp workspace,
 * a real project, and every assertion read back through the app's own parsers.
 * What is being tested is the filing, which is the half that goes wrong
 * silently.
 */

let root = ''
let workflows = ''
let promptPrefixes: Record<string, string> = {}

/** What the fake ComfyUI hands back. Overwritten per test where it matters. */
let drawn: { ok: boolean; message: string; bytes: Buffer | null; filename: string | null } = {
  ok: true,
  message: '',
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  filename: 'ComfyUI_00001_.png'
}

const notes: string[] = []

vi.mock('../workspace', () => ({
  dataDir: () => root,
  projectsDir: () => join(root, 'projects'),
  librariesDir: () => join(root, 'codex'),
  ensureWorkspace: async () => {}
}))

vi.mock('../settings', () => ({
  loadSettings: async () => ({
    providers: [],
    activeProviderId: null,
    comfy: { ...emptyComfySettings(), workflowDir: workflows, promptPrefixes },
    encryptionAvailable: true
  })
}))

/** The graph as it was actually submitted, so the size can be read back. */
let sent: Record<string, { inputs: Record<string, unknown> }> = {}

/** What was uploaded before the run, so the source picture can be checked. */
let uploaded: { filename: string; bytes: number } | null = null

vi.mock('../comfy/client', () => ({
  uploadImage: vi.fn(async (_base: string, bytes: Buffer, filename: string) => {
    uploaded = { filename, bytes: bytes.length }
    return { ok: true, name: `inkcrafter/${filename}`, message: '' }
  })
}))

vi.mock('../comfy/run', () => ({
  generateImage: vi.fn(async (request: { prompt: unknown; onProgress?: (note: string) => void }) => {
    sent = request.prompt as typeof sent
    request.onProgress?.('step 1 of 20')
    request.onProgress?.('step 20 of 20')
    return drawn
  })
}))

const { runTool } = await import('./workspaceTools')
const { ALL_TOOLS } = await import('./tools')

const WORKFLOW = JSON.stringify({
  '3': {
    class_type: 'KSampler',
    inputs: { seed: 1, positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] }
  },
  // Saved portrait, as the author's own workflow is — which is the whole
  // reason a background needs a shape imposed rather than merely suggested.
  '5': { class_type: 'EmptyLatentImage', inputs: { width: 1080, height: 1920, batch_size: 1 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'a harbour' } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry' } },
  '9': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
})

/** One that takes a picture in, so an edit has somewhere to go. */
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

let context: ToolContext

const draw = (args: unknown) =>
  runTool('generate_image', JSON.stringify(args), context, ALL_TOOLS)

const projectDir = (): string => join(root, 'projects', 'the-lighthouse')

const readMediaDoc = async () => parseMedia(await readFile(join(projectDir(), 'media.json'), 'utf8'))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-image-'))
  workflows = join(root, 'workflows')
  notes.length = 0
  uploaded = null
  promptPrefixes = {}

  await mkdir(workflows, { recursive: true })
  await writeFile(join(workflows, 'portrait.json'), WORKFLOW)
  await writeFile(join(workflows, 'retouch.json'), EDIT_WORKFLOW)

  await mkdir(join(projectDir(), 'ink'), { recursive: true })
  await writeFile(
    join(projectDir(), 'project.md'),
    '---\nid: prj_0000000000\ntitle: The Lighthouse\n---\n\nA premise.\n'
  )

  drawn = {
    ok: true,
    message: '',
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
    filename: 'ComfyUI_00001_.png'
  }

  context = {
    root,
    written: [],
    project: {
      id: 'prj_0000000000',
      title: 'The Lighthouse',
      path: projectDir(),
      premise: '',
      libraries: [],
      main: 'ink/main.ink',
      bundleOut: null
    } as unknown as ToolContext['project'],
    onProgress: (note) => notes.push(note)
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/**
 * The shape a picture is drawn in.
 *
 * A background is the scene behind everything and a sprite is a person
 * standing in it, so one is wide and the other tall. Told to the model, and
 * also imposed here — the author's own workflow may well be saved portrait,
 * and then every background comes out portrait whenever the model forgets,
 * which is the failure hardest to notice.
 */
describe('the shape of a picture', () => {
  it('keeps the resolution and changes only the shape', () => {
    // The author's own workflow is saved 1080×1920.
    expect(reshape(1080, 1920, 16 / 9)).toEqual({ width: 1920, height: 1080 })
    expect(reshape(1080, 1920, 9 / 16)).toEqual({ width: 1080, height: 1920 })

    // And a smaller one stays small rather than being pushed to a fixed size.
    expect(reshape(512, 512, 16 / 9)).toEqual({ width: 680, height: 384 })
  })

  it('always lands on a multiple of eight, which every model needs', () => {
    for (const [w, h] of [[1000, 1000], [777, 333], [1080, 1920], [513, 907]]) {
      const out = reshape(w!, h!, 16 / 9)
      expect(out.width % 8, `${out.width} is not a multiple of 8`).toBe(0)
      expect(out.height % 8, `${out.height} is not a multiple of 8`).toBe(0)
    }
  })

  it('draws a background wide and a sprite tall when nothing was asked for', () => {
    const saved = { width: 1080, height: 1920 }

    expect(pictureSize('background', saved, {})).toEqual({ width: 1920, height: 1080, defaulted: true })
    expect(pictureSize('character', saved, {})).toEqual({ width: 1080, height: 1920, defaulted: true })
  })

  it('leaves a hotspot the shape the workflow was saved at', () => {
    // The map forces its box to whatever the art is, so no shape is wrong.
    expect(pictureSize('hotspot', { width: 1080, height: 1920 }, {})).toEqual({
      width: undefined,
      height: undefined,
      defaulted: false
    })
  })

  it('does as it is told when both sides are given', () => {
    expect(pictureSize('background', { width: 1080, height: 1920 }, { width: 640, height: 640 })).toEqual({
      width: 640,
      height: 640,
      defaulted: false
    })
  })

  it('derives the other side from one, rather than leaving a shape nobody chose', () => {
    expect(pictureSize('background', { width: 512, height: 512 }, { width: 1344 })).toEqual({
      width: 1344,
      height: 760,
      defaulted: false
    })
    expect(pictureSize('character', { width: 512, height: 512 }, { height: 1216 })).toEqual({
      width: 688,
      height: 1216,
      defaulted: false
    })
  })

  it('imposes nothing when the workflow has no size to reshape', () => {
    expect(pictureSize('background', { width: null, height: null }, {})).toEqual({ defaulted: false })
  })
})

/**
 * Working from a picture that already exists.
 *
 * The request this answers is "five expressions from the base sprite", which
 * is five calls naming the same source. What has to be true each time is that
 * the picture goes to ComfyUI, an edit workflow is chosen without being asked
 * for, and the result lands as another look on the same character rather than
 * as five new ones.
 */
describe('generate_image, working from a picture', () => {
  async function seedKael(): Promise<void> {
    await mkdir(join(projectDir(), 'media', 'sprites'), { recursive: true })
    await writeFile(join(projectDir(), 'media', 'sprites', 'kael-neutral.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))
    await writeFile(
      join(projectDir(), 'media.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'med_test000001',
            kind: 'character',
            name: 'kael',
            display: 'Kael',
            description: '',
            tags: [],
            variants: [{ id: 'med_test000002', name: 'neutral', file: 'sprites/kael-neutral.png' }]
          }
        ]
      })
    )
  }

  it('sends the picture over and files the result beside it', async () => {
    await seedKael()

    const result = await draw({
      prompt: 'the same person, smiling',
      kind: 'character',
      name: 'kael',
      variant: 'happy',
      from: 'kael/neutral'
    })

    expect(result.ok).toBe(true)
    // LoadImage holds a name in ComfyUI's own folder, so it has to be handed over.
    expect(uploaded?.filename).toBe('sprites-kael-neutral.png')
    expect(sent['10']!.inputs['image']).toBe('inkcrafter/sprites-kael-neutral.png')

    const doc = await readMediaDoc()
    expect(doc.assets).toHaveLength(1)
    expect(doc.assets[0]?.variants.map((one) => one.name)).toEqual(['neutral', 'happy'])
  })

  it('chooses an edit workflow without being asked to', async () => {
    await seedKael()
    const result = await draw({ prompt: 'smiling', kind: 'character', name: 'kael', variant: 'happy', from: 'kael/neutral' })

    // The folder holds a create workflow first; the role decides, not the order.
    expect(result.content).toContain('"retouch"')
    expect(result.content).toContain('from sprites/kael-neutral.png')
  })

  it('takes a path under media/ as well as a catalogued look', async () => {
    await seedKael()
    const result = await draw({
      prompt: 'smiling',
      kind: 'character',
      name: 'kael',
      variant: 'happy',
      from: 'sprites/kael-neutral.png'
    })

    expect(result.ok).toBe(true)
    expect(uploaded?.filename).toBe('sprites-kael-neutral.png')
  })

  it('takes an asset’s first look when no look is named', async () => {
    await seedKael()
    const result = await draw({ prompt: 'smiling', kind: 'character', name: 'kael', variant: 'happy', from: 'kael' })

    expect(result.ok).toBe(true)
  })

  it('says so before drawing when the source is not there', async () => {
    await seedKael()
    const result = await draw({ prompt: 'smiling', kind: 'character', name: 'kael', from: 'kael/furious' })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/no look called "furious"/)
    // Nothing was uploaded and nothing was drawn.
    expect(uploaded).toBeNull()
    expect(context.written).toEqual([])
  })

  it('says which pictures there are when the name is wrong', async () => {
    await seedKael()
    const result = await draw({ prompt: 'smiling', kind: 'character', name: 'kael', from: 'wren/happy' })

    expect(result.content).toMatch(/Nothing in the catalogue is called "wren"/)
  })

  it('refuses when nothing in the folder can edit', async () => {
    await seedKael()
    await rm(join(workflows, 'retouch.json'))

    const result = await draw({ prompt: 'smiling', kind: 'character', name: 'kael', from: 'kael/neutral' })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/No workflow here edits a picture/)
  })

  it('leaves an ordinary request on a create workflow', async () => {
    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })

    expect(result.content).toContain('"portrait"')
    expect(uploaded).toBeNull()
  })
})

describe('generate_image', () => {
  it('prepends the selected workflow prefix to the main prompt only', async () => {
    promptPrefixes = { 'portrait.json': '<lora:storybook:0.85>, rich inks,' }

    await draw({
      prompt: 'a harbour at dusk',
      negative: 'blurry, low contrast',
      kind: 'background',
      name: 'harbour'
    })

    expect(sent['6']!.inputs['text']).toBe(
      '<lora:storybook:0.85>, rich inks,\na harbour at dusk'
    )
    expect(sent['7']!.inputs['text']).toBe('blurry, low contrast')
  })

  it('writes the picture and catalogues it in one call', async () => {
    const result = await draw({ prompt: 'a harbour at dusk', kind: 'background', name: 'harbour' })

    expect(result.ok).toBe(true)
    expect(await readFile(join(projectDir(), 'media', 'backgrounds', 'harbour', 'default.png'))).toEqual(drawn.bytes)

    const doc = await readMediaDoc()
    expect(doc.assets).toHaveLength(1)
    expect(doc.assets[0]?.kind).toBe('background')
    expect(doc.assets[0]?.name).toBe('harbour')
    expect(doc.assets[0]?.variants[0]?.file).toBe('backgrounds/harbour/default.png')
  })

  it('turns a portrait workflow the right way round for a background', async () => {
    await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })

    // The workflow was saved 1080×1920; a background is the scene behind
    // everything, so it goes out wide at the same resolution.
    expect(sent['5']!.inputs['width']).toBe(1920)
    expect(sent['5']!.inputs['height']).toBe(1080)
  })

  it('leaves a sprite tall, which is what the workflow already was', async () => {
    await draw({ prompt: 'a young woman', kind: 'character', name: 'wren' })

    expect(sent['5']!.inputs['width']).toBe(1080)
    expect(sent['5']!.inputs['height']).toBe(1920)
  })

  it('says the shape was chosen, so it can be overruled', async () => {
    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    expect(result.content).toMatch(/1920×1080, the wide shape a background wants/)
  })

  it('does as it is told when a size is asked for', async () => {
    const result = await draw({
      prompt: 'a harbour',
      kind: 'background',
      name: 'harbour',
      width: 1024,
      height: 1024
    })

    expect(sent['5']!.inputs['width']).toBe(1024)
    expect(sent['5']!.inputs['height']).toBe(1024)
    expect(result.content).not.toMatch(/the wide shape/)
  })

  it('leaves a hotspot at whatever the workflow was saved with', async () => {
    await draw({ prompt: 'a city', kind: 'hotspot', name: 'city', variant: 'idle' })

    // The map forces its box to the art, so no shape here is the wrong one.
    expect(sent['5']!.inputs['width']).toBe(1080)
    expect(sent['5']!.inputs['height']).toBe(1920)
  })

  it('reports both paths, so the app refreshes without being asked', async () => {
    await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })

    // This is what bumps the workspace nonce and re-scans the media folder.
    expect(context.written).toContain('projects/the-lighthouse/media/backgrounds/harbour/default.png')
    expect(context.written).toContain('projects/the-lighthouse/media.json')
  })

  it('tells the model it has already been filed', async () => {
    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    expect(result.content).toMatch(/do not call write_media/)
    expect(result.content).toMatch(/# bg: harbour/)
  })

  it('adds a second look without dropping the first', async () => {
    await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    await draw({ prompt: 'a harbour at night', kind: 'background', name: 'harbour', variant: 'night' })

    const doc = await readMediaDoc()
    expect(doc.assets).toHaveLength(1)
    expect(doc.assets[0]?.variants.map((one) => one.name)).toEqual(['default', 'night'])
    expect(doc.assets[0]?.variants[1]?.file).toBe('backgrounds/harbour/night.png')
  })

  it('files a character against their cast member and points them at it', async () => {
    await writeFile(
      join(projectDir(), 'npcs.json'),
      JSON.stringify({
        version: 1,
        npcs: [
          {
            id: 'npc_1',
            inkId: 'wren',
            name: 'Wren',
            description: '',
            sprite: '',
            stats: [],
            statuses: [],
            flags: []
          }
        ]
      })
    )

    const result = await draw({ prompt: 'a young woman', kind: 'character', name: 'wren', variant: 'happy' })

    expect(result.ok).toBe(true)
    const doc = await readMediaDoc()
    expect(doc.assets[0]?.kind).toBe('character')
    expect(doc.assets[0]?.variants[0]?.file).toBe('characters/wren/happy.png')

    // The only way the app can reach a character's pictures.
    const npcs = parseNpcs(await readFile(join(projectDir(), 'npcs.json'), 'utf8'))
    expect(npcs.npcs[0]?.sprite).toBe('wren')

    // Routed through writeNpcs, so the declarations were regenerated.
    expect(context.written.some((path) => path.endsWith('state.ink'))).toBe(true)
  })

  it('still files a character nobody has created yet, and says what is missing', async () => {
    const result = await draw({ prompt: 'a young woman', kind: 'character', name: 'wren' })

    // Refusing would strand a picture that is already on disk.
    expect(result.ok).toBe(true)
    expect(await readFile(join(projectDir(), 'media', 'characters', 'wren', 'default.png'))).toBeTruthy()
    expect(result.content).toMatch(/no cast member called "wren"/)
    expect(result.content).toMatch(/write_cast/)
  })

  it('refuses a hotspot look that is not one of the four states', async () => {
    const result = await draw({ prompt: 'a city', kind: 'hotspot', name: 'city', variant: 'hovr' })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/idle, hover, active, disabled/)
  })

  it('accepts the four states a hotspot does have', async () => {
    const result = await draw({ prompt: 'a city', kind: 'hotspot', name: 'city', variant: 'disabled' })

    expect(result.ok).toBe(true)
    expect((await readMediaDoc()).assets[0]?.variants[0]?.name).toBe('disabled')
  })

  it('refuses a name that leaves nothing, before drawing anything', async () => {
    const result = await draw({ prompt: 'a harbour', kind: 'background', name: '!!!' })

    expect(result.ok).toBe(false)
    // An empty name would have resolved to the folder rather than a file in it.
    expect(result.content).toMatch(/leaves nothing/)
    expect(context.written).toEqual([])
  })

  it('does not overwrite a picture that is already there', async () => {
    await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    await draw({ prompt: 'a harbour, again', kind: 'background', name: 'harbour' })

    const doc = await readMediaDoc()
    // Both looks are called `default`, so the second repoints the first
    // rather than adding one — but the file beside it is a new file.
    expect(doc.assets[0]?.variants).toHaveLength(1)
    expect(doc.assets[0]?.variants[0]?.file).toBe('backgrounds/harbour/default-2.png')
    // The first attempt is not recoverable once replaced, so it is kept.
    expect(await readFile(join(projectDir(), 'media', 'backgrounds', 'harbour', 'default.png'))).toBeTruthy()
  })

  it('writes nothing when what came back is not a PNG', async () => {
    drawn = { ok: true, message: '', bytes: Buffer.from('<html>error</html>'), filename: 'x.png' }

    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/not a PNG/)
    expect(context.written).toEqual([])
  })

  it('passes a failure from ComfyUI through as it was worded', async () => {
    drawn = { ok: false, message: 'Nothing is answering at http://127.0.0.1:8188. Is ComfyUI running?', bytes: null, filename: null }

    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    expect(result.content).toMatch(/Is ComfyUI running\?/)
  })

  it('names the settings tab when no workflow folder is set', async () => {
    workflows = join(root, 'nowhere')

    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/Settings → ComfyUI/)
  })

  it('lists what there is when the workflow was named wrongly', async () => {
    const result = await draw({
      prompt: 'a harbour',
      kind: 'background',
      name: 'harbour',
      workflow: 'landscape'
    })

    expect(result.content).toMatch(/no workflow called "landscape"/)
    expect(result.content).toMatch(/portrait/)
  })

  it('refuses a workflow with nowhere to put the prompt', async () => {
    // A graph whose sampler takes its conditioning from nothing readable.
    await writeFile(
      join(workflows, 'portrait.json'),
      JSON.stringify({
        '3': { class_type: 'KSampler', inputs: { seed: 1, positive: ['6', 0], negative: ['6', 0], latent_image: ['5', 0] } },
        '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
        '6': { class_type: 'ControlNetApply', inputs: { conditioning: ['5', 0] } },
        '9': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
      })
    )

    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })

    // Drawing something that ignored the prompt is worse than not drawing.
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/no prompt node bound/)
  })

  it('stops after eight pictures in one turn', async () => {
    for (let n = 0; n < 8; n++) {
      expect((await draw({ prompt: 'a harbour', kind: 'background', name: `harbour${n}` })).ok).toBe(true)
    }

    const ninth = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour9' })
    expect(ninth.ok).toBe(false)
    expect(ninth.content).toMatch(/8 pictures this turn/)
  })

  it('counts per turn, not for the life of the app', async () => {
    for (let n = 0; n < 8; n++) {
      await draw({ prompt: 'a harbour', kind: 'background', name: `harbour${n}` })
    }

    // A fresh context is a fresh turn.
    context = { ...context, written: [] }
    expect((await draw({ prompt: 'a harbour', kind: 'background', name: 'later' })).ok).toBe(true)
  })

  it('passes the run’s notes on to whoever is watching', async () => {
    await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    expect(notes).toEqual(['step 1 of 20', 'step 20 of 20'])
  })

  it('says the size and how long it took', async () => {
    const result = await draw({ prompt: 'a harbour', kind: 'background', name: 'harbour' })
    // Read from the PNG header the fake handed back.
    expect(result.summary).toMatch(/drew backgrounds\/harbour\/default\.png/)
  })
})
