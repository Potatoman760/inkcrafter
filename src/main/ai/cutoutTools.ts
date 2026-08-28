import { MEDIA_DIR } from '@shared/mediaDoc'
import { cutoutLook } from '../mediaCutout'
import { readMedia, writeMedia } from '../media'
import { sourcePicture } from './imageTools'
import { asText, needProject, projectFolder } from './toolInput'
import type { ToolDefinition, ToolResult } from './workspaceTools'

/**
 * Taking the white card out from behind a picture.
 *
 * The other half of `generate_image`, and the reason it is a tool rather than
 * only a button: a model asked for five expressions draws five sprites on five
 * white cards, and being able to say "now take the backgrounds out" is the
 * difference between that being finished and being five files to open in an
 * image editor.
 *
 * It repoints the look itself, for the same reason `generate_image` catalogues
 * what it drew: the new file is on disk by then, and a model that forgets the
 * second call leaves an asset the app cannot see.
 *
 * All the judgement lives in `backgroundKey.ts`. What matters here is that a
 * refusal comes back as a refusal — "the border of this is #6b7a52" — and is
 * not retried at a different tolerance, which would only key a picture that has
 * no card behind it.
 */

function no(summary: string, content: string): ToolResult {
  return { ok: false, summary, content }
}

/** A tolerance the model sent, if it is one and is in range. */
function asTolerance(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(value)
}

export const removeBackgroundTool: ToolDefinition = {
  name: 'remove_background',
  description:
    'Take the flat white background out from behind a picture in the open project, so it can stand over a scene. Writes a new file — the original is left alone — and repoints the look at it, so never follow it with write_media or write_cast for the same picture. Use it on a sprite or a hotspot drawn on a white card. It works from the edge inward and stops at the first pixel that is not the background, so white inside the picture — highlights, pale hair, the whites of an eye — is kept. It refuses a picture whose border is not a near-uniform near-white, and says what colour it actually is. Two modes: edge is the default and cannot put a hole through anything; gaps also takes out paper walled in by the art, such as the white showing through a loop of hair.',
  parameters: {
    type: 'object',
    properties: {
      picture: {
        type: 'string',
        description:
          'Which picture: "kael/neutral" for a catalogued look, or a path under media/ such as "characters/kael/neutral.png". Must be a PNG.'
      },
      mode: {
        type: 'string',
        enum: ['edge', 'gaps'],
        description:
          'edge, the default, takes out only card the fill can reach from the border, so white the art closes around — the whites of an eye, a highlight — is kept. gaps also takes out card walled in by the art, such as the paper showing through a loop of hair. Use gaps when the author says there are still white patches inside the picture; it tells a gap from a highlight by what surrounds it, but edge is the one that cannot put a hole through anything.'
      },
      tolerance: {
        type: 'number',
        description:
          'How far from the border’s own colour still counts as background, in levels of 0–255. Omit it. The default of 12 suits generated art; raise it only for a scan with visible grain in the white, and never to get past a refusal.'
      }
    },
    required: ['picture']
  },

  async run(args, context): Promise<ToolResult> {
    const project = needProject(context.project)

    // `sourcePicture` was written for `generate_image`'s *optional* `from`, so
    // it answers an empty string with a cheerful "nothing, and no problem".
    // Here that would be a silent success having done nothing at all.
    const wanted = asText(args['picture']).trim()
    if (wanted.length === 0) {
      return no(
        'remove_background — no picture',
        'Say which picture. Name a look like "kael/neutral", or a path under media/.'
      )
    }

    const found = await sourcePicture(project, wanted)
    if (found.problem) return no('remove_background — no such picture', found.problem)
    if (!found.file) {
      return no('remove_background — no such picture', `Could not work out what "${wanted}" refers to.`)
    }

    const asked = asText(args['mode']).trim()
    if (asked.length > 0 && asked !== 'edge' && asked !== 'gaps') {
      return no(
        'remove_background — unknown mode',
        `mode must be edge or gaps. "${asked}" is neither.`
      )
    }

    const result = await cutoutLook(project, {
      file: found.file,
      mode: asked === 'gaps' ? 'gaps' : 'edge',
      tolerance: asTolerance(args['tolerance'])
    })

    if (!result.ok || !result.file) {
      return no(
        'remove_background — refused',
        `${result.message} Do not try again with a different tolerance; tell the author what colour it actually is and let them decide.`
      )
    }

    const folder = projectFolder(project)
    context.written.push(`${folder}/${MEDIA_DIR}/${result.file}`)

    // Every look pointing at the old file follows it. Matching on the path
    // rather than on whatever the model named catches the case where one file
    // is shared by two looks, and the case where it named a path rather than a
    // look at all.
    const doc = await readMedia(project)
    const repointed = doc.assets.map((asset) => ({
      ...asset,
      variants: asset.variants.map((variant) =>
        variant.file === found.file ? { ...variant, file: result.file! } : variant
      )
    }))

    const moved = repointed.some((asset, at) =>
      asset.variants.some((variant, index) => variant.file !== doc.assets[at]!.variants[index]!.file)
    )

    if (moved) {
      await writeMedia(project, { ...doc, assets: repointed })
      context.written.push(`${folder}/media.json`)
    }

    return {
      ok: true,
      summary: `keyed ${result.file} (${result.cleared.toLocaleString()} cleared)`,
      content: [
        result.enclosed > 0
          ? `Took ${result.colour} out from behind ${found.file} into ${result.file}: ${result.cleared.toLocaleString()} pixels cleared — ${result.enclosed.toLocaleString()} of them gaps the art had closed around — and ${result.feathered.toLocaleString()} softened at the edge.`
          : `Took ${result.colour} out from behind ${found.file} into ${result.file}: ${result.cleared.toLocaleString()} pixels cleared and ${result.feathered.toLocaleString()} softened at the edge, with white inside the picture kept.`,
        // The cutout replaces the original rather than sitting beside it, and
        // the model must not go looking for a file that is gone.
        result.message || `${found.file} has been removed.`,
        moved
          ? 'The look now points at the new file — do not call write_media or write_cast for it.'
          : 'Nothing in the catalogue pointed at that file, so nothing was repointed; catalogue the new file if the story needs it.'
      ].join(' ')
    }
  }
}
