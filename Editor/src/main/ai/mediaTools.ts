import {
  MEDIA_KINDS,
  isSingleFileMediaKind,
  mediaName,
  newAsset,
  type MediaAsset,
  type MediaDocument,
  type MediaKind,
  type MediaVariant
} from '@shared/mediaDoc'
import { newId } from '@shared/ids'
import { formatMediaTag } from '@shared/mediaTag'
import { readMedia, scanMedia, writeMedia } from '../media'
import { asStringList, asText, needProject, projectFolder } from './toolInput'
import type { ToolDefinition, ToolResult } from './workspaceTools'

/**
 * The media catalogue.
 *
 * Nothing is generated from `media.json` either, so what this is for is the
 * *filing*: naming what is already in `media/`, giving it the ink identifier
 * the tags will use, and grouping a place's day and night under one name.
 *
 * Filing only. `generate_image` makes a picture where there was none, and
 * catalogues what it drew in the same call — so a picture arrives here either
 * because the author put it in the folder or because that tool has already
 * been down this path.
 *
 * The failure it catches is a look that names a file which is not there. The
 * catalogue accepts it, the panel draws a small red mark, and the story shows
 * nothing at all when the tag fires — much later, and by then the tag looks
 * like the broken thing. Here the files are still to hand, so they are checked
 * against what is actually on disk and the misses are named.
 *
 * Backgrounds and animations only. A character's sprites are part of the character,
 * edited in the cast beside the state the story tracks, and reachable only
 * through a cast member — so one catalogued here would be a thing the app could
 * not show. `write_cast` takes them.
 */

interface VariantInput {
  name: string
  file: string
}

function readVariantInput(value: unknown): VariantInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const file = asText(record['file']).trim().replace(/^\/+/, '')
  if (file.length === 0) return null

  // A look with no name is the default one, which is what a bare `# bg: harbour`
  // resolves to.
  return { name: mediaName(asText(record['name'])), file }
}

interface AssetInput {
  kind: MediaKind
  name: string
  display: string
  description: string
  tags: string[]
  variants: VariantInput[]
  file: string
  sentFile: boolean
}

function readAssetInput(value: unknown): AssetInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const given = asText(record['name'])
  const name = mediaName(given)
  if (name.length === 0) return null

  const kind = MEDIA_KINDS.includes(record['kind'] as MediaKind)
    ? (record['kind'] as MediaKind)
    : 'background'

  return {
    kind,
    name,
    display: asText(record['display']) || given.trim(),
    description: asText(record['description']),
    tags: asStringList(record['tags']),
    variants: Array.isArray(record['variants'])
      ? record['variants']
          .map(readVariantInput)
          .filter((one): one is VariantInput => one !== null)
      : [],
    file: asText(record['file']).trim().replace(/^\/+/, ''),
    sentFile: typeof record['file'] === 'string'
  }
}

/** Merges looks by name, so adding one does not drop the other six. */
function mergeVariants(existing: MediaVariant[], incoming: VariantInput[]): MediaVariant[] {
  const merged = [...existing]
  for (const variant of incoming) {
    const at = merged.findIndex((one) => one.name === variant.name)
    const next: MediaVariant = {
      id: at === -1 ? newId('med') : merged[at]!.id,
      name: variant.name,
      file: variant.file
    }
    if (at === -1) merged.push(next)
    else merged[at] = next
  }
  return merged
}

export const writeMediaTool: ToolDefinition = {
  name: 'write_media',
  description:
    'Catalogue backgrounds, animations, music, and hotspots already in the open project’s media/ folder. Music is all audio, score or cue, and has one direct file; visual assets may have variants. Characters are not here: their sprites belong to the character, so they go through write_cast. This only files assets that exist: list media/ first and catalogue what is there. To make new art, use generate_image, which files what it draws itself. Checks every file named against what is actually on disk. Merges by kind and name, so send only what is new or changed.',
  parameters: {
    type: 'object',
    properties: {
      assets: {
        type: 'array',
        description: 'The backgrounds, animations, music, and hotspots to catalogue.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The ink identifier used in tags, e.g. "harbour" in "# bg: harbour/dusk".'
            },
            kind: {
              type: 'string',
              enum: MEDIA_KINDS.filter((one) => one !== 'character'),
              description: 'Not character — a character’s sprites belong to write_cast.'
            },
            display: { type: 'string', description: 'What a player sees, where one is shown.' },
            description: { type: 'string', description: 'A note for the author.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'For finding it later.' },
            file: {
              type: 'string',
              description:
                'For music: the one audio file under media/, exactly as list_files reports it.'
            },
            variants: {
              type: 'array',
              description:
                'For visual assets and hotspots. A background might have day and night.',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'The look, e.g. "dusk". Omit for the default one.'
                  },
                  file: {
                    type: 'string',
                    description: 'Path under the project’s media/, exactly as list_files reports it. New art the app files goes to <kind>/<name>/<look>, e.g. "backgrounds/harbour/dusk.png", but a file already elsewhere stays where it is and is catalogued where it is.'
                  }
                },
                required: ['file']
              }
            }
          },
          required: ['name', 'kind']
        }
      }
    },
    required: ['assets']
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    const all = Array.isArray(args['assets'])
      ? args['assets'].map(readAssetInput).filter((one): one is AssetInput => one !== null)
      : []

    // A character catalogued here would be unreachable: the media screen has no
    // tab for characters, and the cast reaches one only through a cast member's
    // `sprite`. Refused with the name of the tool that files it properly.
    const characters = all.filter((one) => one.kind === 'character')
    if (characters.length > 0) {
      return {
        ok: false,
        summary: `write_media — ${characters.length} character(s) refused`,
        content:
          `A character's sprites belong to the character: send ${characters
            .map((one) => one.name)
            .join(', ')} to write_cast as \`looks\` instead. Nothing was written.`
      }
    }

    const inputs = all

    if (inputs.length === 0) {
      return {
        ok: false,
        summary: 'write_media — nothing usable',
        content: 'No usable assets. Each needs a name that survives as an ink identifier, and a kind.'
      }
    }

    const doc = await readMedia(project)
    let assets = [...doc.assets]
    let added = 0

    for (const input of inputs) {
      // Kind is part of the identity: a background and a character may both be
      // called "harbour" without being the same thing.
      const at = assets.findIndex((one) => one.kind === input.kind && one.name === input.name)
      const existing = at === -1 ? null : assets[at]!

      const audioFile = input.sentFile ? input.file : (input.variants[0]?.file ?? '')
      const audioVariants = input.sentFile || input.variants.length > 0
        ? audioFile.length > 0
          ? [
              {
                id: existing?.variants[0]?.id ?? newId('med'),
                name: existing?.variants[0]?.name || 'default',
                file: audioFile
              }
            ]
          : []
        : (existing?.variants ?? [])

      const asset: MediaAsset = {
        ...(existing ?? newAsset(input.display || input.name, input.kind)),
        kind: input.kind,
        name: input.name,
        display: input.display || existing?.display || input.name,
        description: input.description || existing?.description || '',
        tags: input.tags.length > 0 ? input.tags : (existing?.tags ?? []),
        variants:
          isSingleFileMediaKind(input.kind)
            ? audioVariants
            : mergeVariants(existing?.variants ?? [], input.variants)
      }

      if (existing) assets[at] = asset
      else {
        assets = [...assets, asset]
        added++
      }
    }

    const next: MediaDocument = { ...doc, assets }
    await writeMedia(project, next)
    context.written.push(`${projectFolder(project)}/media.json`)

    const onDisk = new Set((await scanMedia(project)).map((file) => file.path))
    const missing = next.assets
      .flatMap((asset) =>
        asset.variants
          .filter((variant) => !onDisk.has(variant.file))
          .map((variant) =>
            `${asset.name}${!isSingleFileMediaKind(asset.kind) && variant.name ? `/${variant.name}` : ''} → ${variant.file}`
          )
      )
      .slice(0, 12)

    const emptyAudio = next.assets
      .filter((asset) => isSingleFileMediaKind(asset.kind) && asset.variants.length === 0)
      .map((one) => one.name)
    const emptyLooks = next.assets
      .filter((asset) => !isSingleFileMediaKind(asset.kind) && asset.variants.length === 0)
      .map((one) => one.name)

    const notes = [
      missing.length > 0
        ? `These name a file that is not in media/, so they will show nothing: ${missing.join(', ')}. List media/ and use the paths that are there.`
        : '',
      emptyAudio.length > 0
        ? `${emptyAudio.join(', ')} ${emptyAudio.length === 1 ? 'has' : 'have'} no file yet.`
        : '',
      emptyLooks.length > 0
        ? `${emptyLooks.join(', ')} ${emptyLooks.length === 1 ? 'has' : 'have'} no look yet.`
        : ''
    ].filter(Boolean)

    return {
      ok: missing.length === 0,
      summary: `media: +${added} asset${added === 1 ? '' : 's'}, ${next.assets.length} in all`,
      content: [
        `The catalogue now holds ${next.assets.length} asset(s). Show one with a tag: "# ${next.assets[0] ? (formatMediaTag(next.assets[0], next.assets[0].variants[0]) ?? next.assets[0].name) : 'bg:name'}".`,
        ...notes
      ].join(' ')
    }
  }
}
