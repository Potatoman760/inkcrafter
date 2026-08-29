import { describe, expect, it } from 'vitest'
import { analyse, applyBindings, effectiveBindings, parseGraph, type ComfyGraph } from './graph'

/**
 * Reading a workflow.
 *
 * The fixtures are real shapes rather than minimal ones, because the whole
 * point of the traversal is that it survives what people actually build: an
 * SDXL encode that splits the prompt in two, a combine between the text and the
 * sampler, an upscale that has a width and a height without deciding the size,
 * a base and a refiner with separate prompts.
 *
 * The first test is the important one. Everything else here is about picking
 * the right node; that one is about not damaging the graph on the way past.
 */

const SD15 = `{
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 8566257, "steps": 20, "cfg": 8, "sampler_name": "euler",
      "scheduler": "normal", "denoise": 1,
      "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]
    }
  },
  "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "v1-5-pruned.safetensors" } },
  "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512, "batch_size": 1 } },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "a photograph of a harbour", "clip": ["4", 1] },
    "_meta": { "title": "Positive" }
  },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry, watermark", "clip": ["4", 1] } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "ComfyUI", "images": ["8", 0] } }
}`

/** A combine between the text and the sampler — two prompts feeding one input. */
const COMBINED = `{
  "3": {
    "class_type": "KSampler",
    "inputs": { "seed": 1, "model": ["4", 0], "positive": ["10", 0], "negative": ["7", 0], "latent_image": ["5", 0] }
  },
  "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "x.safetensors" } },
  "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 768, "height": 768, "batch_size": 1 } },
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour", "clip": ["4", 1] } },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry", "clip": ["4", 1] } },
  "10": { "class_type": "ConditioningCombine", "inputs": { "conditioning_1": ["6", 0], "conditioning_2": ["11", 0] } },
  "11": { "class_type": "CLIPTextEncode", "inputs": { "text": "and a gull", "clip": ["4", 1] } },
  "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
}`

/** SDXL splits the prompt into a coarse stream and a fine one. */
const SDXL = `{
  "3": {
    "class_type": "KSampler",
    "inputs": { "seed": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] }
  },
  "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "sdxl.safetensors" } },
  "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": 1 } },
  "6": {
    "class_type": "CLIPTextEncodeSDXL",
    "inputs": { "width": 4096, "height": 4096, "text_g": "a harbour", "text_l": "a harbour", "clip": ["4", 1] }
  },
  "7": { "class_type": "CLIPTextEncodeSDXL", "inputs": { "text_g": "blurry", "text_l": "blurry", "clip": ["4", 1] } },
  "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
}`

function graphOf(json: string): ComfyGraph {
  const { graph, problem } = parseGraph(json)
  if (!graph) throw new Error(`fixture did not parse: ${problem}`)
  return graph
}

describe('parseGraph', () => {
  it('reads an API-format export', () => {
    const graph = graphOf(SD15)
    expect(graph.order).toEqual(['3', '4', '5', '6', '7', '8', '9'])
    expect(graph.nodes.get('6')?.classType).toBe('CLIPTextEncode')
    expect(graph.nodes.get('6')?.title).toBe('Positive')
    expect(graph.nodes.get('6')?.inputs.get('text')).toEqual({ kind: 'value', value: 'a photograph of a harbour' })
    expect(graph.nodes.get('3')?.inputs.get('positive')).toEqual({ kind: 'link', node: '6', slot: 0 })
  })

  it('reads a link whose node id was exported as a number', () => {
    const numeric = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": [6, 0], "negative": [7, 0], "latent_image": [5, 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "9": { "class_type": "SaveImage", "inputs": { "images": [3, 0] } }
    }`

    const analysis = analyse(graphOf(numeric))
    expect(analysis.detected.positive).toEqual({ node: '6', field: 'text' })
    expect(analysis.detected.negative).toEqual({ node: '7', field: 'text' })
  })

  it('names the menu item when given a canvas save instead of an export', () => {
    const canvas = `{ "last_node_id": 9, "last_link_id": 9, "nodes": [{ "id": 3, "type": "KSampler" }], "links": [] }`
    const { graph, problem } = parseGraph(canvas)

    expect(graph).toBeNull()
    expect(problem).toMatch(/Export \(API\)/)
  })

  it('refuses a file with no nodes in it', () => {
    expect(parseGraph('{"hello":"world"}').problem).toMatch(/Export \(API\)/)
  })

  it('refuses unreadable JSON without throwing', () => {
    expect(parseGraph('{ not json').graph).toBeNull()
  })
})

describe('analyse', () => {
  it('binds every slot of an ordinary workflow', () => {
    const analysis = analyse(graphOf(SD15))

    expect(analysis.sampler).toBe('3')
    expect(analysis.detected).toEqual({
      positive: { node: '6', field: 'text' },
      negative: { node: '7', field: 'text' },
      // Nothing loads a picture, so there is nowhere for one to come in.
      image: null,
      width: { node: '5', field: 'width' },
      height: { node: '5', field: 'height' },
      seed: { node: '3', field: 'seed' },
      checkpoint: { node: '4', field: 'ckpt_name' },
      batch: { node: '5', field: 'batch_size' },
      output: { node: '9', field: 'images' }
    })
    expect(analysis.problems).toEqual([])
  })

  it('says how it got there, naming the title the author gave the node', () => {
    const analysis = analyse(graphOf(SD15))
    expect(analysis.notes.positive).toBe(
      'followed KSampler #3 positive → CLIPTextEncode #6 ("Positive") text'
    )
  })

  it('lists every input holding a literal, for the tab to offer', () => {
    const analysis = analyse(graphOf(SD15))
    const sampler = analysis.nodes.find((one) => one.id === '3')

    expect(sampler?.fields.map((one) => one.name)).toEqual([
      'seed',
      'steps',
      'cfg',
      'sampler_name',
      'scheduler',
      'denoise'
    ])
  })

  it('walks through a conditioning combine and records the road not taken', () => {
    const analysis = analyse(graphOf(COMBINED))

    expect(analysis.detected.positive).toEqual({ node: '6', field: 'text' })
    expect(analysis.candidates.positive).toEqual([
      { node: '6', field: 'text' },
      { node: '11', field: 'text' }
    ])
    expect(analysis.problems.join(' ')).toMatch(/2 text nodes lead to positive/)
  })

  it('prefers the coarse stream of an SDXL encode', () => {
    const analysis = analyse(graphOf(SDXL))
    expect(analysis.detected.positive).toEqual({ node: '6', field: 'text_g' })
  })

  it('does not mistake an SDXL encode’s own width for the picture size', () => {
    // Node 6 has a width and a height, but it is not in the latent chain.
    const analysis = analyse(graphOf(SDXL))
    expect(analysis.detected.width).toEqual({ node: '5', field: 'width' })
  })

  it('unbinds the negative when both prompts lead to one node', () => {
    const shared = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["6", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
    }`

    const analysis = analyse(graphOf(shared))
    expect(analysis.detected.positive).toEqual({ node: '6', field: 'text' })
    expect(analysis.detected.negative).toBeNull()
    expect(analysis.problems.join(' ')).toMatch(/its own negative/)
  })

  it('picks the refiner, not the base, when one feeds the other', () => {
    const refiner = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "base" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "base negative" } },
      "13": { "class_type": "KSampler", "inputs": { "seed": 2, "positive": ["14", 0], "negative": ["15", 0], "latent_image": ["3", 0] } },
      "14": { "class_type": "CLIPTextEncode", "inputs": { "text": "refiner" } },
      "15": { "class_type": "CLIPTextEncode", "inputs": { "text": "refiner negative" } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["13", 0] } }
    }`

    const analysis = analyse(graphOf(refiner))
    expect(analysis.sampler).toBe('13')
    expect(analysis.detected.positive).toEqual({ node: '14', field: 'text' })
    expect(analysis.detected.seed).toEqual({ node: '13', field: 'seed' })
    // The base is still reachable through the latent chain, so the size comes
    // from the empty latent at the very back.
    expect(analysis.detected.width).toEqual({ node: '5', field: 'width' })
  })

  it('warns when two samplers have nothing between them', () => {
    const twins = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "one" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "two" } },
      "13": { "class_type": "KSampler", "inputs": { "seed": 2, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["13", 0] } }
    }`

    const analysis = analyse(graphOf(twins))
    expect(analysis.sampler).toBe('13')
    expect(analysis.problems.join(' ')).toMatch(/2 samplers with no link between them/)
  })

  it('takes the size from the empty latent, not from an upscale in front of it', () => {
    const upscaled = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["12", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512, "batch_size": 1 } },
      "12": { "class_type": "LatentUpscale", "inputs": { "samples": ["5", 0], "width": 1024, "height": 1024, "crop": "disabled" } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
    }`

    const analysis = analyse(graphOf(upscaled))
    expect(analysis.detected.width).toEqual({ node: '5', field: 'width' })
    expect(analysis.detected.batch).toEqual({ node: '5', field: 'batch_size' })
  })

  it('finds a seed the sampler keeps in a separate node', () => {
    const custom = `{
      "3": { "class_type": "SamplerCustomAdvanced", "inputs": { "noise": ["20", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "20": { "class_type": "RandomNoise", "inputs": { "noise_seed": 42 } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
    }`

    const analysis = analyse(graphOf(custom))
    expect(analysis.detected.seed).toEqual({ node: '20', field: 'noise_seed' })
    expect(analysis.notes.seed).toMatch(/walked back from/)
  })

  it('collects from the node that saves, not the one that previews', () => {
    // A preview writes to a temp folder and is routinely listed first.
    const both = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "8": { "class_type": "PreviewImage", "inputs": { "images": ["3", 0] } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
    }`

    expect(analyse(graphOf(both)).detected.output).toEqual({ node: '9', field: 'images' })
  })

  it('finds a save node that is not called SaveImage', () => {
    const custom = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "9": { "class_type": "Image Save (WAS)", "inputs": { "images": ["3", 0], "filename": "x" } }
    }`

    expect(analyse(graphOf(custom)).detected.output).toEqual({ node: '9', field: 'images' })
  })

  it('says what is missing rather than throwing, and terminates on a cycle', () => {
    const looped = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "ConditioningSetArea", "inputs": { "conditioning": ["7", 0] } },
      "7": { "class_type": "ConditioningSetArea", "inputs": { "conditioning": ["6", 0] } }
    }`

    const analysis = analyse(graphOf(looped))
    expect(analysis.detected.positive).toBeNull()
    expect(analysis.problems.join(' ')).toMatch(/No prompt node is bound/)
    expect(analysis.problems.join(' ')).toMatch(/No node saves an image/)
  })

  it('reports a graph with no sampler at all', () => {
    const flat = `{ "1": { "class_type": "LoadImage", "inputs": { "image": "x.png" } } }`
    const analysis = analyse(graphOf(flat))

    expect(analysis.sampler).toBeNull()
    expect(analysis.problems.join(' ')).toMatch(/No sampler here/)
  })

  it('warns about a workflow with no seed, because ComfyUI would cache it', () => {
    const seedless = `{
      "3": { "class_type": "KSampler", "inputs": { "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
    }`

    expect(analyse(graphOf(seedless)).problems.join(' ')).toMatch(/same picture every time/)
  })
})

/**
 * What a workflow is for.
 *
 * Reachability rather than a particular chain: an img2img graph brings its
 * picture in through a VAEEncode on the latent, and the newer edit models take
 * it through the conditioning instead. Both edit a picture; what they share is
 * that a loaded image sits behind the sampler at all.
 */
describe('what a workflow is for', () => {
  const IMG2IMG = `{
    "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["12", 0] } },
    "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a harbour" } },
    "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
    "10": { "class_type": "LoadImage", "inputs": { "image": "base.png", "upload": "image" } },
    "12": { "class_type": "VAEEncode", "inputs": { "pixels": ["10", 0] } },
    "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
  }`

  it('reads a workflow that starts from nothing as one that creates', () => {
    const analysis = analyse(graphOf(SD15))
    expect(analysis.role).toBe('creates')
    expect(analysis.detected.image).toBeNull()
    expect(analysis.roleNote).toMatch(/nothing loads a picture/)
  })

  it('reads one that loads a picture as one that edits, and binds where it enters', () => {
    const analysis = analyse(graphOf(IMG2IMG))

    expect(analysis.role).toBe('edits')
    expect(analysis.detected.image).toEqual({ node: '10', field: 'image' })
    expect(analysis.roleNote).toMatch(/LoadImage #10 reaches KSampler #3/)
  })

  it('finds a picture that arrives through the conditioning, not the latent', () => {
    // How the newer edit models take their source, and it is still an edit.
    const throughText = `{
      "3": { "class_type": "KSampler", "inputs": { "seed": 1, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512 } },
      "6": { "class_type": "TextEncodeQwenImageEdit", "inputs": { "prompt": "make them smile", "image": ["10", 0] } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry" } },
      "10": { "class_type": "LoadImage", "inputs": { "image": "base.png" } },
      "9": { "class_type": "SaveImage", "inputs": { "images": ["3", 0] } }
    }`

    const analysis = analyse(graphOf(throughText))
    expect(analysis.role).toBe('edits')
    expect(analysis.detected.image).toEqual({ node: '10', field: 'image' })
  })

  it('writes the uploaded name into the load node, and leaves its widget alone', () => {
    const graph = graphOf(IMG2IMG)
    const { prompt } = applyBindings(graph, analyse(graph).detected, {
      positive: 'make them smile',
      image: 'inkcrafter/sprites-kael-neutral.png'
    })

    const nodes = prompt as Record<string, { inputs: Record<string, unknown> }>
    expect(nodes['10']!.inputs['image']).toBe('inkcrafter/sprites-kael-neutral.png')
    expect(nodes['10']!.inputs['upload']).toBe('image')
  })
})

describe('effectiveBindings', () => {
  const graph = graphOf(SD15)
  const analysis = analyse(graph)

  it('uses what was detected when nothing was corrected', () => {
    const { bindings, problems } = effectiveBindings(graph, analysis, undefined)
    expect(bindings.positive).toEqual({ node: '6', field: 'text' })
    expect(problems).toEqual([])
  })

  it('takes the author’s correction over the detected one', () => {
    const { bindings } = effectiveBindings(graph, analysis, { positive: { node: '7', field: 'text' } })
    expect(bindings.positive).toEqual({ node: '7', field: 'text' })
  })

  it('treats an explicit null as "leave this alone", not as "use the detected one"', () => {
    const { bindings } = effectiveBindings(graph, analysis, { negative: null })
    expect(bindings.negative).toBeNull()
    expect(bindings.positive).toEqual({ node: '6', field: 'text' })
  })

  it('falls back when a saved correction points at a node that has gone', () => {
    const { bindings, problems } = effectiveBindings(graph, analysis, {
      positive: { node: '99', field: 'text' }
    })

    expect(bindings.positive).toEqual({ node: '6', field: 'text' })
    expect(problems.join(' ')).toMatch(/no longer has/)
  })

  it('refuses a correction pointing at an input that is fed by a link', () => {
    // Nothing can be written to `clip` — it is wired, not typed in.
    const { bindings, problems } = effectiveBindings(graph, analysis, {
      positive: { node: '6', field: 'clip' }
    })

    expect(bindings.positive).toEqual({ node: '6', field: 'text' })
    expect(problems).toHaveLength(1)
  })
})

describe('applyBindings', () => {
  it('returns the workflow untouched when nothing is asked for', () => {
    const graph = graphOf(SD15)
    const { prompt } = applyBindings(graph, analyse(graph).detected, {})

    // The property the whole feature rests on: a graph the app quietly changed
    // would produce a wrong picture and no error anywhere.
    expect(prompt).toEqual(JSON.parse(SD15))
  })

  it('writes the values into the bound nodes and nowhere else', () => {
    const graph = graphOf(SD15)
    const { prompt, applied, skipped } = applyBindings(graph, analyse(graph).detected, {
      positive: 'a harbour at dusk',
      negative: 'text, signature',
      width: 1024,
      height: 768,
      seed: 12345,
      batch: 1
    })

    const nodes = prompt as Record<string, { inputs: Record<string, unknown> }>
    expect(nodes['6']!.inputs['text']).toBe('a harbour at dusk')
    expect(nodes['7']!.inputs['text']).toBe('text, signature')
    expect(nodes['5']!.inputs['width']).toBe(1024)
    expect(nodes['5']!.inputs['height']).toBe(768)
    expect(nodes['3']!.inputs['seed']).toBe(12345)
    expect(applied).toEqual(['positive', 'negative', 'width', 'height', 'seed', 'batch'])
    expect(skipped).toEqual([])

    // Everything else survives, including what this file never modelled.
    expect(nodes['3']!.inputs['sampler_name']).toBe('euler')
    expect(nodes['6']!.inputs['clip']).toEqual(['4', 1])
    expect((nodes['6'] as unknown as { _meta: unknown })._meta).toEqual({ title: 'Positive' })
  })

  it('does not write through the graph it was given', () => {
    const graph = graphOf(SD15)
    applyBindings(graph, analyse(graph).detected, { positive: 'changed' })

    // The parsed workflow is cached and reused for the next generation.
    const again = applyBindings(graph, analyse(graph).detected, {})
    expect(again.prompt).toEqual(JSON.parse(SD15))
  })

  it('reports what it could not write rather than dropping it silently', () => {
    const graph = graphOf(SD15)
    const bindings = { ...analyse(graph).detected, width: null, height: null }
    const { applied, skipped } = applyBindings(graph, bindings, {
      positive: 'a harbour',
      width: 1024,
      height: 768
    })

    expect(applied).toEqual(['positive'])
    expect(skipped).toEqual(['width', 'height'])
  })
})
