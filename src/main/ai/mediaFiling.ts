import {
  addAsset,
  addVariant,
  assetsOfKind,
  newAsset,
  newVariant,
  updateVariant,
  type MediaAsset,
  type MediaDocument,
  type MediaKind
} from '@shared/mediaDoc'

/**
 * Putting one picture into the catalogue.
 *
 * The same three steps every time — find the asset or mint it, find the look or
 * mint it, point the look at the file — and they were already written twice:
 * once privately in `mediaTools`, once differently in `castTools`. A third copy
 * here would have made it a pattern rather than a mistake, so this is the one.
 *
 * Merging by name rather than replacing is the whole behaviour. A character has
 * eight expressions and a place has a day and a night; drawing one more must
 * add to that, and there is no undo in the workspace for the version that
 * replaced the lot.
 */
export interface FiledVariant {
  doc: MediaDocument
  /** True when the asset did not exist and has just been made. */
  createdAsset: boolean
  /** True when this look is new rather than repointed at a different file. */
  createdVariant: boolean
}

export function fileVariant(
  doc: MediaDocument,
  kind: MediaKind,
  name: string,
  display: string,
  variantName: string,
  file: string
): FiledVariant {
  let next = doc

  // Kind is part of the identity: a background and a character may both be
  // called "harbour" without being the same thing.
  let asset: MediaAsset | undefined = assetsOfKind(next, kind).find((one) => one.name === name)
  const createdAsset = asset === undefined

  if (!asset) {
    asset = { ...newAsset(display || name, kind), name }
    next = addAsset(next, asset)
  }

  const existing = asset.variants.find((one) => one.name === variantName)
  next = existing
    ? updateVariant(next, asset.id, existing.id, { file })
    : addVariant(next, asset.id, newVariant(variantName, file))

  return { doc: next, createdAsset, createdVariant: existing === undefined }
}
