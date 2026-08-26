import { useEffect, useMemo, useState } from 'react'
import {
  galleryMedia,
  newGalleryGroup,
  newGalleryItem,
  updateGalleryGroup,
  type GalleryAspect,
  type GalleryDocument,
  type GalleryMediaRef
} from '@shared/bundle/galleryDoc'
import { isVideoFile, type MediaDocument } from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Hint,
  Input,
  IconButton,
  PaneHeader,
  Segmented,
  Select
} from '../design/components'
import { MediaPreview } from '../media/MediaPreview'

interface GalleryPanelProps {
  doc: GalleryDocument
  media: MediaDocument
  files: MediaFile[]
  saving: boolean
  error: string | null
  onChange: (next: GalleryDocument) => void
}

const refKey = (ref: GalleryMediaRef): string => `${ref.assetId}:${ref.variantId}`

export function GalleryPanel({
  doc,
  media,
  files,
  saving,
  error,
  onChange
}: GalleryPanelProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(doc.groups[0]?.id ?? null)
  const [itemQuery, setItemQuery] = useState('')
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const selected = doc.groups.find((group) => group.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId !== null && doc.groups.some((group) => group.id === selectedId)) return
    setSelectedId(doc.groups[0]?.id ?? null)
  }, [doc.groups, selectedId])

  const visualLooks = useMemo(
    () =>
      media.assets
        .filter((asset) => ['character', 'background', 'animation'].includes(asset.kind))
        .flatMap((asset) =>
          asset.variants.map((variant) => ({
            ref: { assetId: asset.id, variantId: variant.id },
            label: `${asset.display || asset.name} — ${variant.name}`,
            kind: asset.kind,
            file: variant.file,
            search: [asset.display, asset.name, variant.name, asset.kind, ...asset.tags]
              .join(' ')
              .toLocaleLowerCase()
          }))
        ),
    [media]
  )
  const unlockable = visualLooks.filter(
    (look) => look.kind === 'background' || look.kind === 'animation'
  )
  const queryTerms = itemQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const filteredUnlockable = unlockable.filter((look) =>
    queryTerms.every((term) => look.search.includes(term))
  )
  const previewLook = visualLooks.find((look) => refKey(look.ref) === previewKey) ?? null

  const patch = (changes: Parameters<typeof updateGalleryGroup>[2]): void => {
    if (selected === null) return
    onChange(updateGalleryGroup(doc, selected.id, changes))
  }

  const mediaUrl = (file: string): string | null =>
    files.find((candidate) => candidate.path === file)?.url ?? null

  const cover = selected?.cover ? galleryMedia(media, selected.cover) : null
  const coverUrl = cover ? mediaUrl(cover.file) : null

  const addGroup = (): void => {
    const group = newGalleryGroup('New gallery')
    onChange({ ...doc, groups: [...doc.groups, group] })
    setSelectedId(group.id)
  }

  return (
    <div className="gallery-layout">
      <div className="gallery-groups">
        <PaneHeader
          title="Gallery groups"
          actions={
            <>
              {saving && <span className="saving-note">saving…</span>}
              <Button size="sm" icon="plus" onClick={addGroup}>Add group</Button>
            </>
          }
        />
        {error && <p className="settings-error">{error}</p>}
        {doc.groups.length === 0 ? (
          <EmptyState
            centered
            title="No gallery groups"
            body="Add a group such as Seraphine, then choose the scenes that unlock beneath it."
            action={<Button icon="plus" onClick={addGroup}>Add a group</Button>}
          />
        ) : (
          <div className="gallery-group-list">
            {doc.groups.map((group) => {
              const preview = group.cover ? galleryMedia(media, group.cover) : null
              const url = preview ? mediaUrl(preview.file) : null
              return (
                <button
                  type="button"
                  key={group.id}
                  className={`gallery-group-card gallery-group-card--${group.aspect.replace(':', 'x')}${group.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(group.id)}
                >
                  <span className="gallery-group-art">
                    {url && preview ? (
                      isVideoFile(preview.file) ? <video src={url} muted /> : <img src={url} alt="" />
                    ) : (
                      <span>No cover</span>
                    )}
                  </span>
                  <strong>{group.name}</strong>
                  <small>{group.items.length} unlockable</small>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="gallery-detail">
        {selected === null ? (
          <EmptyState centered title="Nothing selected" body="Choose a gallery group to edit it." />
        ) : (
          <>
            <PaneHeader title={selected.name} />
            <div className="gallery-detail-fields">
              <Field label="Group name">
                <Input value={selected.name} onChange={(event) => patch({ name: event.target.value })} />
              </Field>

              <Field label="Selector shape" note="How this group appears in the player's top-level gallery.">
                <Segmented
                  label="Selector shape"
                  value={selected.aspect}
                  options={[
                    { value: '9:16', label: '9:16 portrait' },
                    { value: '16:9', label: '16:9 landscape' }
                  ]}
                  onChange={(aspect) => patch({ aspect: aspect as GalleryAspect })}
                />
              </Field>

              <Field label="Selector picture" note="Portrait groups commonly use a character sprite; landscape groups commonly use a background.">
                <Select
                  value={selected.cover ? refKey(selected.cover) : ''}
                  onChange={(event) => {
                    const look = visualLooks.find((one) => refKey(one.ref) === event.target.value)
                    patch({ cover: look?.ref ?? null })
                  }}
                >
                  <option value="">(no picture)</option>
                  {visualLooks.map((look) => (
                    <option key={refKey(look.ref)} value={refKey(look.ref)}>{look.label}</option>
                  ))}
                </Select>
              </Field>

              <div className={`gallery-cover-preview gallery-cover-preview--${selected.aspect.replace(':', 'x')}`}>
                {coverUrl && cover ? (
                  isVideoFile(cover.file)
                    ? <video src={coverUrl} muted loop autoPlay />
                    : <img src={coverUrl} alt="" />
                ) : <Hint>No selector picture chosen.</Hint>}
              </div>

              <Field as="div" label="Unlockable scenes" note="A scene unlocks the first time its background or animation tag is activated.">
                {unlockable.length === 0 ? (
                  <Hint>Add background or animation looks in Media first.</Hint>
                ) : (
                  <div className="gallery-item-browser">
                    <div className="gallery-item-filter">
                      <Input
                        type="search"
                        aria-label="Filter gallery scenes"
                        placeholder="Search backgrounds and animations…"
                        value={itemQuery}
                        onChange={(event) => setItemQuery(event.target.value)}
                      />
                      <span role="status">
                        {filteredUnlockable.length} of {unlockable.length}
                      </span>
                    </div>
                    {filteredUnlockable.length === 0 ? (
                      <Hint>No scenes match “{itemQuery.trim()}”.</Hint>
                    ) : (
                      <div className="gallery-item-list">
                        {filteredUnlockable.map((look) => {
                          const checked = selected.items.some((item) => refKey(item) === refKey(look.ref))
                          return (
                            <div className="gallery-item-row" key={refKey(look.ref)}>
                              <Checkbox
                                label={look.label}
                                checked={checked}
                                onChange={(event) => {
                                  patch({
                                    items: event.target.checked
                                      ? [...selected.items, newGalleryItem(look.ref)]
                                      : selected.items.filter((item) => refKey(item) !== refKey(look.ref))
                                  })
                                }}
                              />
                              <IconButton
                                icon="eye"
                                label={`Preview ${look.label}`}
                                size="sm"
                                onClick={() => setPreviewKey(refKey(look.ref))}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Field>
            </div>

            <div className="detail-row detail-row--danger gallery-remove">
              <Button
                variant="danger"
                icon="trash-2"
                onClick={() => {
                  onChange({ ...doc, groups: doc.groups.filter((group) => group.id !== selected.id) })
                  setSelectedId(null)
                }}
              >Remove this group</Button>
            </div>
          </>
        )}
      </div>

      {previewLook && (
        <MediaPreview
          items={[{
            file: previewLook.file,
            url: mediaUrl(previewLook.file) ?? undefined,
            label: previewLook.label,
            bytes: files.find((candidate) => candidate.path === previewLook.file)?.bytes
          }]}
          at={0}
          onMove={() => {}}
          onClose={() => setPreviewKey(null)}
        />
      )}
    </div>
  )
}
