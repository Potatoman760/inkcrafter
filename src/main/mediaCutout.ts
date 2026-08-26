import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { nativeImage } from 'electron'
import { isKeyableFile, MEDIA_DIR } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { CutoutRequest, CutoutResult } from '@shared/types'
import { describeColour, keyBackground, type Raster } from './backgroundKey'
import { freeFile } from './mediaImport'

/**
 * The thin part that knows how to open a PNG.
 *
 * All the judgement is in `backgroundKey.ts`, which is pure and unit-tested.
 * What is left here is a codec and a file, and it is separate for one reason:
 * `nativeImage` needs a real Electron, so nothing under this roof can be
 * covered by vitest. Keeping it thin keeps the untestable surface small — the
 * same split `mediaProtocol.ts` already makes for its own Electron edge.
 *
 * What `white-probe.cjs` established on Electron 43 / Windows, since none of it
 * is in the typings and all of it changes the arithmetic below:
 *
 *   toBitmap() of an opaque red pixel   -> 0,0,255,255   — BGRA, not RGBA
 *   toBitmap() of green at alpha 128    -> 0,128,0,128   — premultiplied
 *   createFromBitmap(...).toPNG() back through toBitmap  — byte-identical
 *   createFromBitmap fed straight  (200,200,200,128) reads back 128,128,128
 *   createFromBitmap fed premultiplied (100,100,100,128) reads back 100,100,100
 *
 * So: both channel order and premultiplication have to be undone on the way in
 * and redone on the way out, and `createFromBitmap` wants the same convention
 * `toBitmap` hands out. The probe has been deleted; `bitmapLayout` below
 * measures the same two facts at runtime rather than trusting this comment on
 * a platform nobody has run it on.
 */

/**
 * A 2×1 PNG: opaque red, then green at alpha 128.
 *
 * Two pixels chosen to answer the two questions at once — which channel holds
 * the red, and whether the half-transparent green comes back at 255 or at 128.
 */
const PROBE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP4z8Dwn+E/QwMAEHkDflwvYpMAAAAASUVORK5CYII='

interface BitmapLayout {
  /** True when byte 0 is blue rather than red. */
  swizzled: boolean
  /** True when the colour channels have been multiplied by the alpha. */
  premultiplied: boolean
}

let measured: BitmapLayout | null = null

/**
 * What `toBitmap` actually hands back, measured rather than assumed.
 *
 * Twenty lines and one decode, memoised, instead of a constant that is right on
 * the machine it was written on. Electron makes no promise about either fact
 * and has changed both before.
 *
 * The fallback is what the probe measured here, which is also what every
 * Chromium build has done for years — a decoder so broken it cannot read two
 * pixels is not going to be saved by a guess either way.
 */
function bitmapLayout(): BitmapLayout {
  if (measured) return measured

  const image = nativeImage.createFromDataURL(`data:image/png;base64,${PROBE_PNG}`)
  const bytes = image.toBitmap()

  if (bytes.length !== 8) {
    measured = { swizzled: true, premultiplied: true }
    return measured
  }

  measured = {
    swizzled: bytes[2]! > bytes[0]!,
    // Straight would keep the green at 255; premultiplied halves it. The test
    // is against a midpoint so a decoder rounding by a level either way is not
    // read as a different convention.
    premultiplied: Math.max(bytes[4]!, bytes[5]!, bytes[6]!) < 200
  }
  return measured
}

/** An Electron bitmap as the straight RGBA the keyer works in. */
function toRaster(bytes: Buffer, width: number, height: number): Raster {
  const { swizzled, premultiplied } = bitmapLayout()
  const data = new Uint8ClampedArray(width * height * 4)

  for (let at = 0; at < data.length; at += 4) {
    const alpha = bytes[at + 3]!
    const first = bytes[at]!
    const third = bytes[at + 2]!

    const r = swizzled ? third : first
    const g = bytes[at + 1]!
    const b = swizzled ? first : third

    if (premultiplied && alpha > 0 && alpha < 255) {
      // Recovering the colour a partly transparent pixel had before it was
      // scaled. A no-op on the opaque input this feature refuses to work
      // without, and correct rather than lucky.
      data[at] = Math.round((r * 255) / alpha)
      data[at + 1] = Math.round((g * 255) / alpha)
      data[at + 2] = Math.round((b * 255) / alpha)
    } else if (premultiplied && alpha === 0) {
      data[at] = 0
      data[at + 1] = 0
      data[at + 2] = 0
    } else {
      data[at] = r
      data[at + 1] = g
      data[at + 2] = b
    }

    data[at + 3] = alpha
  }

  return { width, height, data }
}

/** Straight RGBA back out as a PNG, in whatever convention this build wants. */
function toPng(image: Raster): Buffer {
  const { swizzled, premultiplied } = bitmapLayout()
  const bytes = Buffer.alloc(image.width * image.height * 4)

  for (let at = 0; at < bytes.length; at += 4) {
    const alpha = image.data[at + 3]!
    const scale = premultiplied ? alpha / 255 : 1

    const r = Math.round(image.data[at]! * scale)
    const g = Math.round(image.data[at + 1]! * scale)
    const b = Math.round(image.data[at + 2]! * scale)

    bytes[at] = swizzled ? b : r
    bytes[at + 1] = g
    bytes[at + 2] = swizzled ? r : b
    bytes[at + 3] = alpha
  }

  return nativeImage
    .createFromBitmap(bytes, { width: image.width, height: image.height })
    .toPNG()
}

/** Absolute, and provably still inside `media/`. */
function inMedia(project: Project, file: string): string | null {
  const root = join(project.path, MEDIA_DIR)
  const full = join(root, ...file.split('/'))
  const step = relative(root, full)

  // `resolveInWorkspace` would be the obvious call and is the wrong one: its
  // whitelist of name characters would refuse a picture the author reasonably
  // called `héroïne.png`. Containment is the property that matters here.
  if (step.startsWith('..') || step.startsWith(`..${sep}`) || step.length === 0) return null
  return full
}

/**
 * Takes the white card out from behind one look, into a new file beside it.
 *
 * Never overwrites: `neutral.png` becomes `neutral-cutout.png`, and the caller
 * repoints the look. The original is what the author has if this was not what
 * they wanted, and there is no undo in a workspace.
 */
export async function cutoutLook(
  project: Project,
  request: CutoutRequest
): Promise<CutoutResult> {
  const nothing = { ok: false, file: null, colour: null, cleared: 0, feathered: 0, enclosed: 0 }

  if (!request.file) {
    return { ...nothing, message: 'No picture was given.' }
  }
  if (!isKeyableFile(request.file)) {
    return {
      ...nothing,
      message: `${request.file} is not a PNG. Save it as one first — a JPEG may carry a rotation that would be applied on the way through, and an animated file would lose every frame but the first.`
    }
  }

  const source = inMedia(project, request.file)
  if (!source) {
    return { ...nothing, message: `${request.file} is not inside media/.` }
  }

  let bytes: Buffer
  try {
    bytes = await readFile(source)
  } catch {
    return { ...nothing, message: `Could not read media/${request.file}.` }
  }

  const image = nativeImage.createFromBuffer(bytes)
  // An undecodable file comes back as an empty image rather than throwing, so
  // this is the only thing standing between a corrupt PNG and a confusing
  // "that picture has no pixels" from a keyer that was never given any.
  if (image.isEmpty()) {
    return { ...nothing, message: `Could not read media/${request.file} as a picture.` }
  }

  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  if (bitmap.length !== width * height * 4) {
    // A scale factor was applied somewhere and the bytes are not the size the
    // dimensions say. Better to stop than to key a picture at the wrong stride.
    return {
      ...nothing,
      message: `media/${request.file} decoded to ${bitmap.length} bytes for a ${width}×${height} picture, which does not add up. Nothing was changed.`
    }
  }

  const outcome = keyBackground(toRaster(bitmap, width, height), {
    tolerance: request.tolerance,
    mode: request.mode
  })

  if (!outcome.ok) {
    return {
      ...nothing,
      colour: outcome.reading ? describeColour(outcome.reading.colour) : null,
      message: outcome.message
    }
  }

  const dot = request.file.lastIndexOf('.')
  const stem = dot === -1 ? request.file : request.file.slice(0, dot)
  const file = await freeFile(project, `${stem}-cutout.png`)
  const destination = inMedia(project, file)!

  try {
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, toPng(outcome.image))
  } catch (cause) {
    return {
      ...nothing,
      colour: describeColour(outcome.reading.colour),
      message: `Could not write it: ${cause instanceof Error ? cause.message : String(cause)}`
    }
  }

  return {
    ok: true,
    file,
    colour: describeColour(outcome.reading.colour),
    cleared: outcome.cleared,
    feathered: outcome.feathered,
    enclosed: outcome.enclosed,
    message: ''
  }
}
