import { useState } from 'react'
import type { GalleryMediaRef } from '@shared/bundle/galleryDoc'
import {
  addAsset,
  addVariant,
  findAsset,
  mediaName,
  newAsset,
  newVariant,
  relocateMediaFiles,
  updateVariant,
  variantNameProblem,
  type MediaAsset,
  type MediaDocument,
  type MediaKind,
  type MediaVariant
} from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { ImportLookRequest } from '@shared/types'
import { Button, Field, Hint, Select, Thumb } from '../design/components'

/** A look an author can choose, with its picture already looked up. */
export interface ArtOption {
  ref: GalleryMediaRef
  label: string
  url: string | null
}

/**
 * Where a picture brought in through a slot is filed.
 *
 * A minigame keeps its own pictures in an asset named after it, so the folder
 * on disk matches what the author sees in the panel. It is made the first time
 * something lands in it rather than when the minigame is, so a minigame that
 * only ever chooses from the catalogue leaves nothing empty behind.
 */
export interface ArtHome {
  project: Project | null
  media: MediaDocument
  kind: MediaKind
  /** The asset's ink name. */
  asset: string
  display: string
  onMediaChange: (next: MediaDocument) => void
  /** Called once a picture has landed, so the folder can be read again. */
  onImported?: () => void
}

/**
 * How the player will draw the picture, which is the shape the preview takes.
 *
 * `wide` fills the screen, so it is cropped to 16:9 the way the player crops
 * it. `sprite` is a cut-out shown whole. A size is a picture the player draws
 * at its own proportions — the floor plan, and the map registered over it.
 */
export type ArtShape = 'wide' | 'sprite' | { width: number; height: number }

export const refKey = (ref: GalleryMediaRef): string => `${ref.assetId}:${ref.variantId}`

/**
 * One picture slot in a minigame: which look it holds, what that looks like,
 * and the two ways to put a new picture in it.
 *
 * Choosing from the catalogue is the same select every slot had before this.
 * What it adds is a way to bring a picture in *from here* — upload files a new
 * look and chooses it; replace gives the chosen look a new file — so an author
 * placing a room's interior does not leave for the media panel and come back.
 * Both go through the same import main already has, and the catalogue changes
 * in the same step as the slot, so neither can be left pointing at the other's
 * old state.
 */
export function ArtField({
  label,
  value,
  options,
  shape,
  emptyLabel = 'None',
  about,
  home,
  look,
  onChange
}: {
  label: string
  value: GalleryMediaRef | null | undefined
  options: ArtOption[]
  shape: ArtShape
  /** What the empty choice is called: what the player shows instead. */
  emptyLabel?: string
  about?: React.ReactNode
  /** Where an uploaded picture goes. Without it, only the catalogue is offered. */
  home?: ArtHome
  /** The look an uploaded picture becomes; the label when not given. */
  look?: string
  onChange: (next: GalleryMediaRef | null) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState<'upload' | 'replace' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const chosen = value ? (options.find((one) => refKey(one.ref) === refKey(value)) ?? null) : null
  // Referenced but no longer in the catalogue. Shown as such rather than as
  // empty: the slot has not been cleared, and the player draws nothing.
  const missing = !!value && !chosen
  const held = value && home ? lookOf(home.media, value) : null

  /**
   * Brings a file in, then changes the catalogue and the slot together.
   *
   * Main never overwrites an existing file: it copies under a free name and
   * reports what moved, and `apply` repoints the catalogue. The old file is
   * still there for the media panel to find.
   */
  const bring = async (
    what: 'upload' | 'replace',
    request: ImportLookRequest,
    apply: (relocated: MediaDocument, file: string) => { media: MediaDocument; ref: GalleryMediaRef | null }
  ): Promise<void> => {
    if (!home?.project) return

    setBusy(what)
    setProblem(null)

    try {
      const result = await window.inkcrafter.media.importLook(home.project, request)
      if (result.cancelled) return
      if (!result.ok || !result.file) {
        setProblem(result.message || 'That picture could not be brought in.')
        return
      }

      const next = apply(relocateMediaFiles(home.media, result.moved), result.file)
      home.onMediaChange(next.media)
      if (next.ref) onChange(next.ref)
      home.onImported?.()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  /** A new look in the minigame's own asset, chosen as soon as it lands. */
  const upload = async (): Promise<void> => {
    if (!home) return
    const existing = findAsset(home.media, home.kind, mediaName(home.asset))
    const asset = existing ?? { ...newAsset(home.asset, home.kind), display: home.display }
    const name = freeLookName(asset, look ?? label)

    await bring(
      'upload',
      { kind: home.kind, asset: asset.name, look: name, gather: asset.variants.map((one) => one.file) },
      (relocated, file) => {
        const variant = newVariant(name, file)
        return {
          media: existing
            ? addVariant(relocated, asset.id, variant)
            : addAsset(relocated, { ...asset, variants: [variant] }),
          ref: { assetId: asset.id, variantId: variant.id }
        }
      }
    )
  }

  /** A new file for the look already chosen, wherever it is filed. */
  const replace = async (): Promise<void> => {
    if (!held) return
    const { asset, variant } = held

    await bring(
      'replace',
      { kind: asset.kind, asset: asset.name, look: variant.name, gather: asset.variants.map((one) => one.file) },
      (relocated, file) => ({
        media: updateVariant(relocated, asset.id, variant.id, { file }),
        ref: null
      })
    )
  }

  return (
    <Field as="div" label={label} about={about} className="art-field">
      <Select
        aria-label={label}
        value={value ? refKey(value) : ''}
        onChange={(event) => {
          const option = options.find((one) => refKey(one.ref) === event.target.value)
          onChange(option?.ref ?? null)
        }}
      >
        <option value="">{emptyLabel}</option>
        {missing && <option value={refKey(value!)}>Missing picture</option>}
        {options.map((option) => (
          <option key={refKey(option.ref)} value={refKey(option.ref)}>{option.label}</option>
        ))}
      </Select>

      {value && (
        <Thumb
          size="wide"
          className={`art-field__preview${shape === 'sprite' ? ' art-field__preview--whole' : typeof shape === 'object' ? ' art-field__preview--plan' : ''}`}
          style={typeof shape === 'object' ? { '--art-aspect': `${shape.width} / ${shape.height}` } as React.CSSProperties : undefined}
          src={chosen?.url ?? undefined}
          missing={missing || (!!chosen && !chosen.url)}
          alt={`${label} preview`}
        />
      )}

      {home?.project && (
        <div className="art-field__actions">
          <Button
            size="sm"
            icon="folder-open"
            aria-label={`Upload for ${label}`}
            disabled={busy !== null}
            onClick={() => void upload()}
          >
            {busy === 'upload' ? 'Copying…' : 'Upload…'}
          </Button>
          {held && (
            <Button
              size="sm"
              icon="folder-open"
              aria-label={`Replace ${label}`}
              disabled={busy !== null}
              onClick={() => void replace()}
            >
              {busy === 'replace' ? 'Copying…' : 'Replace'}
            </Button>
          )}
        </div>
      )}

      {problem && <Hint tone="error">{problem}</Hint>}
    </Field>
  )
}

/** The asset and look a reference points at, or null once either is gone. */
function lookOf(
  media: MediaDocument,
  ref: GalleryMediaRef
): { asset: MediaAsset; variant: MediaVariant } | null {
  const asset = media.assets.find((one) => one.id === ref.assetId)
  const variant = asset?.variants.find((one) => one.id === ref.variantId)
  return asset && variant ? { asset, variant } : null
}

/**
 * The name a new look takes: what was asked for, or the next free number
 * after it. A second upload into the same slot is a second picture, not a
 * refusal — replacing the first is the other button.
 */
function freeLookName(asset: MediaAsset, wanted: string): string {
  const base = mediaName(wanted) || 'picture'
  if (variantNameProblem(asset, base) === null) return base

  for (let n = 2; ; n += 1) {
    const name = `${base}_${n}`
    if (variantNameProblem(asset, name) === null) return name
  }
}
