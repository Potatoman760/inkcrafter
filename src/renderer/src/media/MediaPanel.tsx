import { useEffect, useMemo, useState } from 'react'
import {
  addAsset,
  allTags,
  assetNameProblem,
  assetsOfKind,
  claimedFiles,
  MEDIA_KINDS,
  mediaName,
  newAsset,
  removeAsset,
  updateAsset,
  isAudioFile,
  isSingleFileMediaKind,
  isVideoFile,
  type MediaAsset,
  type MediaDocument,
  type MediaKind
} from '@shared/mediaDoc'
import { TAG_PREFIX } from '@shared/mediaTag'
import { LooksField } from './LooksField'
import { AudioFileField } from './AudioFileField'
import type { MediaFile } from '@shared/types'
import type { Project } from '@shared/project'
import { Icon } from '../design/Icon'
import {
  Button,
  Chip,
  ChipRow,
  Field,
  Hint,
  IconButton,
  Input,
  ListRow,
  MasterDetail,
  Tabs,
  Thumb
} from '../design/components'
import { MediaPreview, Peek, type PreviewItem } from './MediaPreview'
import { copy } from '@shared/copy'

interface MediaPanelProps {
  doc: MediaDocument
  files: MediaFile[]
  saving: boolean
  error: string | null
  onChange: (next: MediaDocument) => void
  onRescan: () => void
  /** Which project's folder a picture would be brought into. */
  project?: Project | null
  onReveal: () => void
}

const KIND_LABELS: Record<MediaKind, string> = {
  character: 'Characters',
  animation: 'Animations',
  background: 'Backgrounds',
  music: 'Music',
  sound: 'Sound effects',
  hotspot: 'Hotspots',
  combatant: 'Combatants'
}

/**
 * What this panel edits.
 *
 * Not `character`: a character's sprites are part of the character, and are
 * edited in the cast beside the state the story tracks about them. `character`
 * is still a kind in the catalogue and in every `# char:` tag — it just has no
 * tab of its own here, because there is one place for a person.
 */
const PANEL_KINDS = MEDIA_KINDS.filter((kind) => kind !== 'character' && kind !== 'combatant')

/** What one of each is called, for the add box. */
const SINGULAR: Record<MediaKind, string> = {
  character: 'character',
  animation: 'animation',
  background: 'background',
  music: 'track',
  sound: 'sound effect',
  hotspot: 'hotspot',
  combatant: 'combatant'
}

const NEW_PLACEHOLDER: Record<MediaKind, string> = {
  character: 'New character, e.g. Wren',
  animation: 'New animation, e.g. Rain',
  background: 'New background, e.g. The cove',
  music: 'New track, e.g. The grove',
  sound: 'New sound effect, e.g. Door slam',
  hotspot: 'New hotspot, e.g. Seedblossom',
  combatant: 'New combatant, e.g. Alley guard'
}

/**
 * The media catalogue.
 *
 * A dialog, like the other catalogues, so it is reachable from every view. The
 * shape differs in one way that matters: images arrive by being put in the
 * folder rather than through the app, so this shows *two* lists — what has been
 * catalogued, and what is sitting in `media/` that nobody has filed yet.
 *
 * Every change applies straight through and autosaves, except a name, which is
 * committed on blur — the same rule the stats catalogue follows, and for the
 * same reason: a name is what the tag is written from.
 */
export function MediaPanel({
  doc,
  files,
  saving,
  error,
  onChange,
  onRescan,
  project = null,
  onReveal
}: MediaPanelProps): React.JSX.Element {
  const [kind, setKind] = useState<MediaKind>('background')
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** What the lightbox is showing, or null. */
  const [preview, setPreview] = useState<{ items: PreviewItem[]; at: number } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const claimed = useMemo(() => claimedFiles(doc), [doc])
  const unfiled = useMemo(() => files.filter((file) => !claimed.has(file.path)), [files, claimed])

  const deleteUnfiled = async (file: MediaFile): Promise<void> => {
    if (project === null) return
    if (!window.confirm(`Permanently delete "${file.path}" from media/? This cannot be undone.`)) {
      return
    }

    setDeleting(file.path)
    setDeleteError(null)
    try {
      await window.inkcrafter.media.deleteFile(project, file.path)
      setPreview(null)
      onRescan()
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setDeleting(null)
    }
  }

  /** An asset's looks, for stepping through from its row. */
  const itemsOf = (asset: MediaAsset): PreviewItem[] =>
    asset.variants.map((variant) => ({
      file: variant.file,
      url: byPath.get(variant.file)?.url,
      bytes: byPath.get(variant.file)?.bytes,
      label: asset.display || asset.name,
      look: isSingleFileMediaKind(asset.kind) ? undefined : variant.name
    }))

  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (haystack: string): boolean =>
    terms.every((term) => haystack.toLowerCase().includes(term))

  const shown = assetsOfKind(doc, kind).filter((asset) =>
    matches(`${asset.name} ${asset.display} ${asset.tags.join(' ')}`)
  )

  const selected = doc.assets.find((asset) => asset.id === selectedId) ?? null
  const problem = draftName.trim().length > 0 ? assetNameProblem(doc, kind, draftName) : null

  const create = (): void => {
    if (draftName.trim().length === 0 || problem) return
    const asset = newAsset(draftName, kind)
    onChange(addAsset(doc, asset))
    setSelectedId(asset.id)
    setDraftName('')
  }

  return (
    <>
      <Tabs
        level="pane"
        label="Media kind"
        value={kind}
        onChange={(next) => {
          setKind(next as MediaKind)
          setSelectedId(null)
        }}
        items={PANEL_KINDS.map((candidate) => ({
          value: candidate,
          label: KIND_LABELS[candidate],
          count: assetsOfKind(doc, candidate).length
        }))}
        trail={
          <>
            {saving && <span className="saving-note">saving…</span>}
            <IconButton icon="rotate-ccw" label="Rescan" onClick={onRescan} />
            <IconButton icon="folder-open" label="Open folder" onClick={onReveal} />
          </>
        }
      />

      <MasterDetail
        masterWidth={260}
        masterClassName="media-master"
        detailClassName="media-detail"
        master={
          <>
          {/* Adding leads the column. It used to sit under the list, at the far
              end of a scroll, which is the last place anyone looks for it. */}
          <div className="panel-new">
            <Input
              value={draftName}
              aria-label={`New ${SINGULAR[kind]} name`}
              placeholder={NEW_PLACEHOLDER[kind]}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
            />
            <Button variant="primary"
              onClick={create}
              disabled={draftName.trim().length === 0 || problem !== null}
            >
              <Icon name="plus" size={13} />
              Add
            </Button>
          </div>
          {draftName.trim().length > 0 && (
            <Hint tight tone={problem ? 'error' : 'default'} className="panel-new-preview">
              {problem ?? (
                <>
                  {kind === 'hotspot' ? (
                    <>
                      named <code>{mediaName(draftName)}</code> for a map place to use
                    </>
                  ) : (
                    <>
                      tagged as <code>{`${TAG_PREFIX[kind] ?? kind}:${mediaName(draftName)}`}</code>
                    </>
                  )}
                </>
              )}
            </Hint>
          )}

          <Input className="codex-filter"
            value={filter}
            aria-label="Filter"
            placeholder="Filter by name or tag…"
            onChange={(event) => setFilter(event.target.value)}
          />

          {shown.length === 0 ? (
            <Hint>
              {assetsOfKind(doc, kind).length === 0
                ? `No ${KIND_LABELS[kind].toLowerCase()} yet.`
                : 'Nothing matches that filter.'}
            </Hint>
          ) : (
            <ul className="media-rows">
              {shown.map((asset) => {
                const first = asset.variants[0]
                const thumb = first ? byPath.get(first.file) : undefined

                return (
                  // The thumbnail sits beside the row rather than inside it:
                  // the row is a button, and the picture is now a button too.
                  <li key={asset.id}>
                    <ListRow
                      className="media-pick"
                      mono
                      name={asset.name}
                      meta={
                        isSingleFileMediaKind(asset.kind)
                          ? (first?.file ?? 'No file')
                          : `${asset.variants.length} look${asset.variants.length === 1 ? '' : 's'}`
                      }
                      selected={asset.id === selectedId}
                      onClick={() => setSelectedId(asset.id)}
                    />
                    <Peek
                      label={asset.display || asset.name}
                      onClick={() => setPreview({ items: itemsOf(asset), at: 0 })}
                    >
                      <Thumb
                        className="media-thumb"
                        size="sm"
                        src={isSingleFileMediaKind(asset.kind) ? undefined : thumb?.url}
                        // A look pointing at a file the folder does not have
                        // draws dashed red rather than as an empty square.
                        missing={!isSingleFileMediaKind(asset.kind) && Boolean(first) && !thumb}
                        label={
                          isSingleFileMediaKind(asset.kind)
                            ? <Icon name={asset.kind === 'music' ? 'music' : 'play'} size={16} />
                            : '?'
                        }
                      />
                    </Peek>
                  </li>
                )
              })}
            </ul>
          )}
          </>
        }
        detail={
          <>
          {selected ? (
            <AssetDetail
              doc={doc}
              asset={selected}
              files={files}
              byPath={byPath}
              project={project}
              onChange={onChange}
              onRescan={onRescan}
              onRemoved={() => setSelectedId(null)}
            />
          ) : (
            <Unfiled
              unfiled={unfiled}
              total={files.length}
              onReveal={onReveal}
              deleting={deleting}
              onDelete={(file) => void deleteUnfiled(file)}
              onPreview={(at) =>
                setPreview({
                  items: unfiled.map((file) => ({
                    file: file.path,
                    url: file.url,
                    bytes: file.bytes,
                    label: 'Not filed yet'
                  })),
                  at
                })
              }
            />
          )}
          </>
        }
      />

      {preview && (
        <MediaPreview
          items={preview.items}
          at={preview.at}
          onMove={(at) => setPreview({ ...preview, at })}
          onClose={() => setPreview(null)}
        />
      )}

      {(error || deleteError) && <p className="codex-error">{error ?? deleteError}</p>}
    </>
  )
}

/** What is in the folder that nobody has filed, shown when nothing is selected. */
function Unfiled({
  unfiled,
  total,
  onReveal,
  deleting,
  onDelete,
  onPreview
}: {
  unfiled: MediaFile[]
  total: number
  onReveal: () => void
  deleting: string | null
  onDelete: (file: MediaFile) => void
  onPreview: (index: number) => void
}): React.JSX.Element {
  if (total === 0) {
    return (
      <div>
        <Hint>
          Nothing in <code>media/</code> yet.{' '}
          <Button variant="link" onClick={onReveal}>
            Open the folder
          </Button>{' '}
          and drop some media files in, then press rescan — or add one at a time with{' '}
          <strong>Upload…</strong> beside its file field.
        </Hint>
      </div>
    )
  }

  if (unfiled.length === 0) {
    return <Hint>Choose something on the left, or add one above it.</Hint>
  }

  return (
    <Field
      as="div"
      label="Not filed yet"
      note={copy('media.unfiled', { count: unfiled.length })}
    >
      <ul className="media-grid">
        {unfiled.map((file, index) => (
          <li key={file.path}>
            <Peek label={file.path} onClick={() => onPreview(index)}>
              {/* A clip has no still to draw, and an <img> pointed at one
                  renders as a broken icon that explains nothing. */}
              {isVideoFile(file.path) || isAudioFile(file.path) ? (
                <span className="media-grid__clip">
                  <Icon name="play" size={18} />
                </span>
              ) : (
                <img src={file.url} alt={file.path} />
              )}
            </Peek>
            <IconButton
              className="media-grid__delete"
              icon="trash-2"
              label={`Delete ${file.path}`}
              size="sm"
              disabled={deleting !== null}
              onClick={() => onDelete(file)}
            />
            <code>{file.path}</code>
          </li>
        ))}
      </ul>
    </Field>
  )
}

/**
 * The tag list, held as text until it is committed.
 *
 * Splitting on every keystroke destroys the separator as it is typed: the comma
 * in "cast, act one" turns into an empty tag, gets filtered out, and the field
 * re-renders without it — so the list can never be typed at all. The draft is
 * the text; the array is what it means once you have stopped.
 */
function TagsField({
  asset,
  onCommit
}: {
  asset: MediaAsset
  onCommit: (tags: string[]) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(asset.tags.join(', '))
  useEffect(() => setDraft(asset.tags.join(', ')), [asset.id, asset.tags.join(',')])

  const commit = (): void =>
    onCommit(
      draft
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )

  return (
    <Input
      value={draft}
      aria-label={`Tags for ${asset.name}`}
      placeholder="cast, act one"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function AssetDetail({
  doc,
  asset,
  files,
  byPath,
  project,
  onChange,
  onRescan,
  onRemoved
}: {
  doc: MediaDocument
  asset: MediaAsset
  files: MediaFile[]
  byPath: Map<string, MediaFile>
  project: Project | null
  onChange: (next: MediaDocument) => void
  onRescan: () => void
  onRemoved: () => void
}): React.JSX.Element {
  const [name, setName] = useState(asset.name)

  useEffect(() => setName(asset.name), [asset.id, asset.name])

  const set = (changes: Partial<MediaAsset>): void => onChange(updateAsset(doc, asset.id, changes))

  const nameTrouble =
    mediaName(name) !== asset.name ? assetNameProblem(doc, asset.kind, name, asset.id) : null

  return (
    <>
      <Field label="Name" about={copy('media.name')}>
        <Input className="stats-name-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (nameTrouble || mediaName(name) === asset.name) setName(asset.name)
            else set({ name: mediaName(name) })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setName(asset.name)
              event.currentTarget.blur()
            }
          }}
        />
        {nameTrouble && <p className="codex-error">{nameTrouble}</p>}
      </Field>

      <Field label="Display name" about={copy('media.displayName')}>
        <Input value={asset.display} onChange={(event) => set({ display: event.target.value })} />
      </Field>

      <Field label="Tags" about={copy('media.tags')}>
        <TagsField asset={asset} onCommit={(tags) => set({ tags })} />
        {allTags(doc).length > 0 && (
          <ChipRow>
            {allTags(doc).map((tag) => (
              <Chip
                key={tag}
                variant={asset.tags.includes(tag) ? 'accent' : 'default'}
                onClick={() =>
                  set({
                    tags: asset.tags.includes(tag)
                      ? asset.tags.filter((current) => current !== tag)
                      : [...asset.tags, tag]
                  })
                }
              >
                {tag}
              </Chip>
            ))}
          </ChipRow>
        )}
      </Field>

      {isSingleFileMediaKind(asset.kind) ? (
        <AudioFileField
          doc={doc}
          asset={asset}
          files={files}
          project={project}
          onChange={onChange}
          onImported={onRescan}
        />
      ) : (
        <LooksField
          doc={doc}
          asset={asset}
          files={files}
          byPath={byPath}
          project={project}
          onChange={onChange}
          onImported={onRescan}
        />
      )}

      <div className="detail-row detail-row--danger">
        <Button
          variant="danger"
          icon="trash-2"
          aria-label={`Remove ${asset.name}`}
          onClick={() => {
            if (window.confirm(`Remove ${asset.name}? The media files stay in media/.`)) {
              onChange(removeAsset(doc, asset.id))
              onRemoved()
            }
          }}
        >
          Remove this {asset.kind}
        </Button>
      </div>
    </>
  )
}
