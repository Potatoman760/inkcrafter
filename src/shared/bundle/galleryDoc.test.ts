import { describe, expect, it } from 'vitest'
import { emptyGallery, newGalleryGroup, parseGallery, serialiseGallery } from './galleryDoc'

describe('gallery document', () => {
  it('round-trips groups, selector shape, cover and unlockable items', () => {
    const group = {
      ...newGalleryGroup('Seraphine'),
      aspect: '16:9' as const,
      cover: { assetId: 'med_asset', variantId: 'med_cover' },
      items: [{ id: 'med_item', assetId: 'med_asset', variantId: 'med_scene' }]
    }
    expect(parseGallery(serialiseGallery({ version: 1, groups: [group] }))).toEqual({
      version: 1,
      groups: [group]
    })
  })

  it('drops malformed groups and items rather than inventing references', () => {
    expect(parseGallery('{"groups":[{"name":""},{"name":"Seraphine","items":[{}]}]}'))
      .toMatchObject({ groups: [{ name: 'Seraphine', items: [] }] })
  })

  it('returns an empty catalogue for invalid JSON', () => {
    expect(parseGallery('nope')).toEqual(emptyGallery())
  })
})
