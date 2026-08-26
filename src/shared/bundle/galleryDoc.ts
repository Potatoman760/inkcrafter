import { newId } from '../ids'
import type { MediaDocument, MediaKind } from '../mediaDoc'

/** The shape of a group's selector card in the player's gallery. */
export type GalleryAspect = '16:9' | '9:16'
export const GALLERY_ASPECTS: readonly GalleryAspect[] = ['16:9', '9:16']

/** A stable reference to one concrete media look. */
export interface GalleryMediaRef {
  assetId: string
  variantId: string
}

export interface GalleryItem extends GalleryMediaRef {
  id: string
}

export interface GalleryGroup {
  id: string
  name: string
  aspect: GalleryAspect
  /** Selector art. Usually a character sprite for 9:16 or a background for 16:9. */
  cover: GalleryMediaRef | null
  /** Unlockable background and animation looks, in display order. */
  items: GalleryItem[]
}

export interface GalleryDocument {
  version: 1
  groups: GalleryGroup[]
}

export function emptyGallery(): GalleryDocument {
  return { version: 1, groups: [] }
}

export function newGalleryGroup(name: string): GalleryGroup {
  return { id: newId('med'), name: name.trim(), aspect: '9:16', cover: null, items: [] }
}

export function newGalleryItem(ref: GalleryMediaRef): GalleryItem {
  return { id: newId('med'), ...ref }
}

export function galleryMedia(
  media: MediaDocument,
  ref: GalleryMediaRef
): { kind: MediaKind; assetName: string; assetDisplay: string; variantName: string; file: string } | null {
  const asset = media.assets.find((one) => one.id === ref.assetId)
  const variant = asset?.variants.find((one) => one.id === ref.variantId)
  if (!asset || !variant) return null
  return {
    kind: asset.kind,
    assetName: asset.name,
    assetDisplay: asset.display || asset.name,
    variantName: variant.name,
    file: variant.file
  }
}

export function updateGalleryGroup(
  doc: GalleryDocument,
  id: string,
  changes: Partial<GalleryGroup>
): GalleryDocument {
  return {
    ...doc,
    groups: doc.groups.map((group) => (group.id === id ? { ...group, ...changes } : group))
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function mediaRef(value: unknown): GalleryMediaRef | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const assetId = text(record['assetId']).trim()
  const variantId = text(record['variantId']).trim()
  return assetId && variantId ? { assetId, variantId } : null
}

function item(value: unknown): GalleryItem | null {
  const ref = mediaRef(value)
  if (!ref || typeof value !== 'object' || value === null) return null
  const id = text((value as Record<string, unknown>)['id']).trim()
  return { id: id || newId('med'), ...ref }
}

function group(value: unknown): GalleryGroup | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const name = text(record['name']).trim()
  if (!name) return null
  const id = text(record['id']).trim()
  return {
    id: id || newId('med'),
    name,
    aspect: GALLERY_ASPECTS.includes(record['aspect'] as GalleryAspect)
      ? (record['aspect'] as GalleryAspect)
      : '9:16',
    cover: mediaRef(record['cover']),
    items: Array.isArray(record['items'])
      ? record['items'].map(item).filter((one): one is GalleryItem => one !== null)
      : []
  }
}

export function parseGallery(json: string): GalleryDocument {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return emptyGallery()
    const groups = (parsed as Record<string, unknown>)['groups']
    return {
      version: 1,
      groups: Array.isArray(groups)
        ? groups.map(group).filter((one): one is GalleryGroup => one !== null)
        : []
    }
  } catch {
    return emptyGallery()
  }
}

export function serialiseGallery(doc: GalleryDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
