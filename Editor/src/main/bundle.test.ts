import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { Story } from 'inkjs/engine/Story'
import { BUNDLE_FILES, type BundleManifest } from '@shared/bundle/manifest'
import { parsePreviewCheckpoint } from '@shared/bundle/preview'
import type { MediaDocument } from '@shared/mediaDoc'
import { parseGallery, type GalleryDocument } from '@shared/bundle/galleryDoc'
import { newCombatMinigame, parseMinigames, serialiseMinigames } from '@shared/bundle/minigameDoc'
import type { Project } from '@shared/project'
import type { CatalogueExport } from '@shared/statsExport'
import { exportBundle, mirror, swapIn } from './bundle'
import { decryptProtectedBytes } from './bundleProtection'
import {
  PROTECTED_CHUNK_BYTES,
  parseProtectedHeader,
  type ProtectedBundlePayload
} from '@shared/bundle/protection'

/**
 * Exporting is a build step, so this points at real files and reads back what
 * landed on disk. Two claims matter more than the rest and are checked against
 * the runtime rather than against the exporter's own opinion: that the story
 * JSON actually loads, and that visit counting survived compilation — the whole
 * precompile decision rests on the second, and nothing else would notice if it
 * quietly stopped being true.
 */

let root = ''
let out = ''
let project: Project

const ENTRY = `INCLUDE state.ink
INCLUDE chapter.ink

-> the_gate

=== the_gate ===
# bg: courtyard
The gate is shut.

* [Knock] -> the_hall
`

const CHAPTER = `=== the_hall ===
# bg: courtyard
# char: abeline/happy
# music: door_slam/heavy
Someone is waiting.

-> inside

= inside
Deeper in.

-> END

=== function tally(a) ===
~ return a + 1
`

const STATE = `VAR courage = 2
`

const MEDIA: MediaDocument = {
  version: 1,
  assets: [
    {
      id: 'med_0000000001',
      kind: 'background',
      name: 'courtyard',
      display: 'Courtyard',
      description: '',
      tags: [],
      variants: [
        { id: 'med_0000000002', name: 'day', file: 'bg/courtyard-day.png' },
        // The same background as a looping clip. What an asset is *for* and
        // what its file *is* are separate questions, and the manifest answers
        // the second one.
        { id: 'med_0000000008', name: 'storm', file: 'bg/courtyard-storm.webm' }
      ]
    },
    {
      id: 'med_0000000003',
      kind: 'character',
      name: 'abeline',
      display: 'Abeline',
      description: '',
      tags: [],
      variants: [
        { id: 'med_0000000004', name: 'happy', file: 'sprites/abeline-happy.png' },
        { id: 'med_0000000005', name: 'gone', file: 'sprites/abeline-gone.png' }
      ]
    },
    {
      id: 'med_0000000006',
      kind: 'music',
      name: 'the_grove',
      display: 'The grove',
      description: '',
      tags: [],
      variants: [{ id: 'med_0000000007', name: 'loop', file: 'music/the_grove/loop.mp3' }]
    },
    {
      id: 'med_0000000009',
      kind: 'music',
      name: 'door_slam',
      display: 'Door slam',
      description: '',
      tags: [],
      variants: [{ id: 'med_0000000010', name: 'heavy', file: 'music/door_slam/heavy.ogg' }]
    }
  ]
}

const GALLERY: GalleryDocument = {
  version: 1,
  groups: [
    {
      id: 'med_0000000020',
      name: 'Abeline',
      aspect: '9:16',
      cover: { assetId: 'med_0000000003', variantId: 'med_0000000004' },
      items: [
        {
          id: 'med_0000000021',
          assetId: 'med_0000000001',
          variantId: 'med_0000000002'
        }
      ]
    }
  ]
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'inkcrafter-bundle-'))
  out = join(root, 'out')

  await mkdir(join(root, 'project', 'ink'), { recursive: true })
  await mkdir(join(root, 'project', 'media', 'bg'), { recursive: true })
  await mkdir(join(root, 'project', 'media', 'sprites'), { recursive: true })

  await writeFile(join(root, 'project', 'ink', 'main.ink'), ENTRY, 'utf8')
  await writeFile(join(root, 'project', 'ink', 'chapter.ink'), CHAPTER, 'utf8')
  await writeFile(join(root, 'project', 'ink', 'state.ink'), STATE, 'utf8')
  await writeFile(join(root, 'project', 'media.json'), JSON.stringify(MEDIA), 'utf8')
  await writeFile(join(root, 'project', 'gallery.json'), JSON.stringify(GALLERY), 'utf8')

  // Only one of Abeline's two looks is on disk, so the missing-file warning has
  // something to find without the rest of the export being broken.
  await writeFile(join(root, 'project', 'media', 'bg', 'courtyard-day.png'), 'png', 'utf8')
  await writeFile(join(root, 'project', 'media', 'bg', 'courtyard-storm.webm'), 'webm', 'utf8')
  await writeFile(join(root, 'project', 'media', 'sprites', 'abeline-happy.png'), 'png', 'utf8')
  await mkdir(join(root, 'project', 'media', 'music', 'the_grove'), { recursive: true })
  await writeFile(join(root, 'project', 'media', 'music', 'the_grove', 'loop.mp3'), 'mp3', 'utf8')
  await mkdir(join(root, 'project', 'media', 'music', 'door_slam'), { recursive: true })
  await writeFile(join(root, 'project', 'media', 'music', 'door_slam', 'heavy.ogg'), 'ogg', 'utf8')

  project = {
    id: 'prj_0000000000',
    title: 'The Gate',
    libraries: [],
    main: 'ink/main.ink',
    description: '',
    bundleOut: null,
    path: join(root, 'project')
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Every line up to the next choice or the end, the way a player reads. */
function readOn(story: Story): string[] {
  const lines: string[] = []
  while (story.canContinue) {
    const text = story.Continue()?.trim() ?? ''
    if (text.length > 0) lines.push(text)
  }
  return lines
}

async function manifestOf(dir: string): Promise<BundleManifest> {
  return JSON.parse(await readFile(join(dir, BUNDLE_FILES.manifest), 'utf8')) as BundleManifest
}

describe('exportBundle', () => {
  it('protects every document and media file while retaining a decryptable chunked bundle', async () => {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' }
    })
    project.protection = {
      mode: 'protected',
      keyId: 'release-test-key',
      publicKey: pair.publicKey.toString('base64')
    }
    const large = Buffer.alloc(PROTECTED_CHUNK_BYTES + 17, 0x5a)
    await writeFile(join(project.path, 'media', 'bg', 'courtyard-storm.webm'), large)

    const result = await exportBundle(project, out)

    expect(result.ok).toBe(true)
    expect(await readdir(out)).toEqual(['content', 'manifest.json'])
    await expect(readFile(join(out, BUNDLE_FILES.story), 'utf8')).rejects.toThrow()
    await expect(readFile(join(out, 'media', 'bg', 'courtyard-day.png'))).rejects.toThrow()

    const header = parseProtectedHeader(JSON.parse(
      await readFile(join(out, BUNDLE_FILES.manifest), 'utf8')
    ))
    expect(header?.protection.keyId).toBe('release-test-key')
    const contentKey = privateDecrypt(
      { key: pair.privateKey, format: 'der', type: 'pkcs8', oaepHash: 'sha256' },
      Buffer.from(header!.protection.wrappedKey, 'base64')
    )
    const payload = JSON.parse(decryptProtectedBytes(
      await readFile(join(out, header!.protection.payload.path)),
      contentKey,
      header!.protection.keyId,
      'bundle-payload'
    ).toString('utf8')) as ProtectedBundlePayload

    expect(payload.documents.story).toContain('inkVersion')
    expect(payload.manifest.contentHash).toBe(result.manifest?.contentHash)
    expect(payload.documents.gallery).toContain('Abeline')

    const protectedClip = payload.assets.find((asset) => asset.logicalPath.endsWith('.webm'))!
    const recovered = decryptProtectedBytes(
      await readFile(join(out, protectedClip.path)),
      contentKey,
      header!.protection.keyId,
      protectedClip.logicalPath
    )
    expect(recovered.equals(large)).toBe(true)

    const corrupted = await readFile(join(out, protectedClip.path))
    const last = corrupted.length - 1
    corrupted[last] = (corrupted[last] ?? 0) ^ 1
    expect(() => decryptProtectedBytes(
      corrupted, contentKey, header!.protection.keyId, protectedClip.logicalPath
    )).toThrow()
  }, 15_000)

  it('keeps connected-player previews plain even when release protection is enabled', async () => {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' }
    })
    project.protection = {
      mode: 'protected',
      keyId: 'release-preview-key',
      publicKey: pair.publicKey.toString('base64')
    }

    const result = await exportBundle(project, out, {
      preview: { id: 'preview-protected-project', target: null }
    })

    expect(result.ok).toBe(true)
    expect(JSON.parse(await readFile(join(out, BUNDLE_FILES.manifest), 'utf8')).format).toBe(2)
    await expect(readFile(join(out, BUNDLE_FILES.story), 'utf8')).resolves.toContain('inkVersion')
    await expect(readFile(join(out, BUNDLE_FILES.preview), 'utf8')).resolves.toContain(
      'preview-protected-project'
    )
  })

  it('keeps a combat background reference in the connected-player preview', async () => {
    const combat = newCombatMinigame('Courtyard guard')
    combat.background = {
      assetId: 'med_0000000001',
      variantId: 'med_0000000002'
    }
    await writeFile(
      join(project.path, 'minigames.json'),
      serialiseMinigames({ version: 1, minigames: [combat] }),
      'utf8'
    )

    const result = await exportBundle(project, out, {
      preview: { id: 'preview-combat-background', target: null }
    })

    expect(result.ok).toBe(true)
    expect(parseMinigames(await readFile(join(out, BUNDLE_FILES.minigames), 'utf8')))
      .toEqual({ version: 1, minigames: [combat] })
  })

  it('writes a bundle a player can read with fetch alone', async () => {
    const result = await exportBundle(project, out)

    expect(result.ok).toBe(true)
    expect(await readdir(out)).toEqual(
      expect.arrayContaining([
        BUNDLE_FILES.manifest,
        BUNDLE_FILES.story,
        BUNDLE_FILES.catalogue,
        BUNDLE_FILES.media,
        BUNDLE_FILES.gallery,
        BUNDLE_FILES.achievements,
        BUNDLE_FILES.minigames,
        'media'
      ])
    )

    const manifest = await manifestOf(out)
    expect(manifest.format).toBe(2)
    expect(manifest.project).toEqual({ id: 'prj_0000000000', title: 'The Gate' })
    expect(manifest.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(parseGallery(await readFile(join(out, BUNDLE_FILES.gallery), 'utf8'))).toEqual(GALLERY)
  })

  it('compiles the INCLUDEs the player has no file handler to resolve', async () => {
    await exportBundle(project, out)
    const json = await readFile(join(out, BUNDLE_FILES.story), 'utf8')

    const story = new Story(json)
    expect(readOn(story)).toEqual(['The gate is shut.'])

    // From chapter.ink, reached only through the INCLUDE.
    story.ChooseChoiceIndex(0)
    expect(readOn(story)).toEqual(['Someone is waiting.', 'Deeper in.'])
  })

  it('writes a pre-paragraph checkpoint only for a connected-player preview', async () => {
    const result = await exportBundle(project, out, {
      preview: { id: 'preview-123', target: 'the_hall' }
    })

    expect(result.ok).toBe(true)
    const checkpoint = parsePreviewCheckpoint(
      await readFile(join(out, BUNDLE_FILES.preview), 'utf8')
    )
    expect(checkpoint).toMatchObject({
      format: 1,
      id: 'preview-123',
      bundleId: project.id,
      contentHash: result.manifest?.contentHash,
      target: 'the_hall'
    })

    // Restore into a fresh runtime, as the player does. The target paragraph
    // and its tags must still be pending rather than baked into a saved frame.
    const story = new Story(await readFile(join(out, BUNDLE_FILES.story), 'utf8'))
    story.state.LoadJson(checkpoint!.inkState)
    expect(story.Continue()?.trim()).toBe('Someone is waiting.')
    expect(story.currentTags).toEqual(
      expect.arrayContaining(['bg: courtyard', 'char: abeline/happy', 'music: door_slam/heavy'])
    )

    const ordinary = join(root, 'ordinary')
    await exportBundle(project, ordinary)
    await expect(readFile(join(ordinary, BUNDLE_FILES.preview), 'utf8')).rejects.toThrow()
  })

  it('refuses a preview target that is not in the compiled story', async () => {
    const result = await exportBundle(project, out, {
      preview: { id: 'preview-123', target: 'not_in_the_entry_story' }
    })

    expect(result.ok).toBe(false)
    expect(result.warnings.join(' ')).toContain('not reachable in this compile')
    await expect(readdir(out)).rejects.toThrow()
  })

  it('keeps visit counting alive in the compiled JSON', async () => {
    await exportBundle(project, out)
    const story = new Story(await readFile(join(out, BUNDLE_FILES.story), 'utf8'))

    expect(story.state.VisitCountAtPathString('the_hall')).toBe(0)

    readOn(story)
    story.ChooseChoiceIndex(0)
    readOn(story)

    expect(story.state.VisitCountAtPathString('the_hall')).toBe(1)
  })

  it('lists every knot and stitch as a travel destination, functions excluded', async () => {
    await exportBundle(project, out)
    const manifest = await manifestOf(out)

    expect(manifest.knots).toContain('the_gate')
    expect(manifest.knots).toContain('the_hall')
    expect(manifest.knots).toContain('the_hall.inside')
    expect(manifest.knots).not.toContain('tally')
  })

  it('copies catalogued media under keys derived from the tag', async () => {
    const result = await exportBundle(project, out)
    const manifest = await manifestOf(out)

    expect(manifest.assets.map((asset) => asset.key)).toEqual([
      'bg_courtyard_day',
      'bg_courtyard_storm',
      'char_abeline_happy',
      'music_the_grove_loop',
      'music_door_slam_heavy'
    ])

    // How it is loaded, read from the file rather than from the kind of asset
    // it belongs to. The two disagree here: both courtyards are backgrounds,
    // and only one of them is a picture. Shipping the clip as an `image` is a
    // broken picture in any player that believed the manifest.
    expect(manifest.assets.map((asset) => asset.kind)).toEqual([
      'image',
      'video',
      'image',
      'audio',
      'audio'
    ])
    expect(manifest.assets[0]?.path).toBe('media/bg/courtyard-day.png')
    await expect(readFile(join(out, 'media', 'bg', 'courtyard-day.png'), 'utf8')).resolves.toBe(
      'png'
    )
    await expect(readFile(join(out, 'media', 'bg', 'courtyard-storm.webm'), 'utf8')).resolves.toBe(
      'webm'
    )

    // Catalogued but not on disk: a warning, not a failed export.
    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toContain('abeline-gone.png')
  })

  it('regenerates the catalogue rather than copying a stale export/', async () => {
    await writeFile(
      join(root, 'project', 'stats.json'),
      JSON.stringify({
        version: 1,
        categories: [],
        stats: [
          {
            id: 'stt_0000000001',
            name: 'courage',
            kind: 'number',
            initial: 2,
            display: 'Courage',
            blurb: '',
            icon: '',
            description: '',
            custom: []
          }
        ],
        items: []
      }),
      'utf8'
    )

    await exportBundle(project, out)
    const catalogue = JSON.parse(
      await readFile(join(out, BUNDLE_FILES.catalogue), 'utf8')
    ) as CatalogueExport

    expect(catalogue.stats).toEqual([
      expect.objectContaining({ name: 'courage', type: 'int', default: 2, display: 'Courage' })
    ])
  })

  it('refuses a story that does not compile, and writes nothing', async () => {
    await writeFile(join(root, 'project', 'ink', 'main.ink'), '-> nowhere_at_all\n', 'utf8')

    const result = await exportBundle(project, out)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true)
    await expect(readdir(out)).rejects.toThrow()
  })

  it('refuses a destination holding something that is not a bundle', async () => {
    await mkdir(out, { recursive: true })
    await writeFile(join(out, 'a-year-of-work.txt'), 'do not delete me', 'utf8')

    const result = await exportBundle(project, out)

    expect(result.ok).toBe(false)
    expect(result.warnings.join(' ')).toContain('not empty and is not a bundle')
    await expect(readFile(join(out, 'a-year-of-work.txt'), 'utf8')).resolves.toBe(
      'do not delete me'
    )
  })

  /**
   * The wrong destination with the worst symptom. A player serves a folder *of*
   * games and finds each by name, so a bundle written into that folder instead
   * of into one inside it sits at the wrong depth and simply never loads — no
   * error, a blank screen. "Choose an empty folder" would be bad advice here.
   */
  it('refuses a folder that holds games rather than being one', async () => {
    const games = join(root, 'game')
    await exportBundle(project, join(games, 'game1'))

    const result = await exportBundle(project, games)

    expect(result.ok).toBe(false)
    expect(result.warnings.join(' ')).toContain('holds games (game1) rather than being one')
    // The game beside it is untouched.
    await expect(readFile(join(games, 'game1', BUNDLE_FILES.manifest), 'utf8')).resolves.toContain(
      'InkCrafter'
    )
  })

  // A name the player cannot ask for. The bundle is still whole, so this is a
  // warning: renaming the folder is the whole fix.
  it('warns when the folder is not a name a player can ask for', async () => {
    const result = await exportBundle(project, join(root, 'My Game!'))

    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toContain('is not a name one can ask for')
  })

  it('says nothing about a folder name a player can ask for', async () => {
    const result = await exportBundle(project, join(root, 'game-2.final'))

    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).not.toContain('not a name')
  })

  /**
   * The destination is never empty, even for an instant.
   *
   * This replaced a delete-then-rename that lost the whole bundle when the
   * rename failed — and on Windows it does fail: a deleted directory's name
   * lingers delete-pending until every handle closes, and an indexer or a dev
   * server watching the folder is enough to hold one. Losing a bundle to that
   * is how the player's game folder ended up empty.
   */
  it('leaves the old bundle in place when the new one cannot be moved in', async () => {
    await exportBundle(project, out)
    const before = await readdir(out)

    // Nothing to move in, so the rename fails the way a held name does.
    await expect(swapIn(join(root, 'no-such-staging'), out)).rejects.toThrow()

    expect(await readdir(out)).toEqual(before)
    expect((await manifestOf(out)).generatedBy).toBe('InkCrafter')
  })

  it('leaves nothing beside the bundle when the swap works', async () => {
    await exportBundle(project, out)
    await exportBundle(project, out)

    expect(await readdir(root)).not.toContain('.bundle.inkcrafter-old')
  })

  /**
   * The fallback for a folder Windows will not let go of, which is the ordinary
   * case here: an editor with the player's repo open holds `game/game1`, and a
   * directory rename onto it fails with EPERM. Updating the files in place is
   * the only way through, so it has to leave the folder holding exactly the
   * bundle and nothing else.
   */
  it('mirrors a folder exactly, removing what is no longer part of the bundle', async () => {
    const from = join(root, 'staging')
    const to = join(root, 'live')

    await mkdir(join(from, 'media'), { recursive: true })
    await writeFile(join(from, 'manifest.json'), 'new', 'utf8')
    await writeFile(join(from, 'media', 'kept.png'), 'new', 'utf8')

    await mkdir(join(to, 'media'), { recursive: true })
    await writeFile(join(to, 'manifest.json'), 'old', 'utf8')
    await writeFile(join(to, 'media', 'kept.png'), 'old', 'utf8')
    await writeFile(join(to, 'media', 'dropped-sprite.png'), 'old', 'utf8')
    await writeFile(join(to, 'story.json'), 'old', 'utf8')

    await mirror(from, to)

    expect(await readdir(to)).toEqual(['manifest.json', 'media'])
    expect(await readdir(join(to, 'media'))).toEqual(['kept.png'])
    expect(await readFile(join(to, 'manifest.json'), 'utf8')).toBe('new')
    expect(await readFile(join(to, 'media', 'kept.png'), 'utf8')).toBe('new')
  })

  it('replaces an earlier bundle, leaving nothing of it behind', async () => {
    await exportBundle(project, out)
    await writeFile(join(out, 'media', 'stale-sprite.png'), 'png', 'utf8')

    const result = await exportBundle(project, out)

    expect(result.ok).toBe(true)
    expect(await readdir(join(out, 'media'))).not.toContain('stale-sprite.png')
  })

  it('leaves no staging directory behind', async () => {
    await exportBundle(project, out)
    expect(await readdir(root)).toEqual(expect.arrayContaining(['out', 'project']))
    expect((await readdir(root)).some((name) => name.includes('inkcrafter-tmp'))).toBe(false)
  })
})
