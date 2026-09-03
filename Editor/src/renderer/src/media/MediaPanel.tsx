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
import { UsageField } from './UsageField'
import type { MediaFile } from '@shared/types'
import type { Project } from '@shared/project'
import { Icon } from '../design/Icon'
import {
  Button,
  Checkbox,
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
  /** Opens the ink where a tag names the selected asset. */
  onOpenUse: (path: string, line: number) => void
}

const KIND_LABELS: Record<MediaKind, string> = {
  character: 'Characters',
  animation: 'Animations',
  background: 'Backgrounds',
  music: 'Music/Sound',
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
  hotspot: 'hotspot',
  combatant: 'combatant'
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
  onReveal,
  onOpenUse
}: MediaPanelProps): React.JSX.Element {
  const [kind, setKind] = useState<MediaKind>('background')
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** What the lightbox is showing, or null. */
  const [preview, setPreview] = useState<{ items: PreviewItem[]; at: number } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  /** Unfiled paths ticked for a batch operation. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())

  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const claimed = useMemo(() => claimedFiles(doc), [doc])
  const unfiled = useMemo(() => files.filter((file) => !claimed.has(file.path)), [files, claimed])

  /**
   * Deletes one file or a ticked batch of them.
   *
   * One confirmation for the whole batch and one rescan after it: the folder is
   * read once however many went, and a prompt per file would train the author to
   * click through them. Failures are collected rather than thrown, so one file
   * held open by something else does not abandon the rest.
   */
  const deleteFiles = async (targets: MediaFile[]): Promise<void> => {
    if (project === null || targets.length === 0) return

    const what = targets.length === 1 ? `"${targets[0]!.path}"` : `${targets.length} files`
    if (!window.confirm(`Permanently delete ${what} from media/? This cannot be undone.`)) return

    setDeleteError(null)
    const failed: string[] = []

    for (const file of targets) {
      setDeleting(file.path)
      try {
        await window.inkcrafter.media.deleteFile(project, file.path)
      } catch (caught) {
        failed.push(`${file.path} — ${caught instanceof Error ? caught.message : String(caught)}`)
      }
    }

    setDeleting(null)
    setPicked(new Set())
    setPreview(null)
    onRescan()

    if (failed.length > 0) setDeleteError(failed.join('; '))
  }

  const pick = (path: string, on: boolean): void =>
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })

  // A rescan can take a ticked file away — deleted here, or filed from another
  // panel — and a selection holding paths that are gone would delete nothing
  // and count wrong.
  useEffect(() => {
    const present = new Set(unfiled.map((file) => file.path))
    setPicked((current) => {
      const kept = new Set([...current].filter((path) => present.has(path)))
      return kept.size === current.size ? current : kept
    })
  }, [unfiled])

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
              placeholder="Name"
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
              onOpenUse={onOpenUse}
            />
          ) : (
            <Unfiled
              unfiled={unfiled}
              total={files.length}
              onReveal={onReveal}
              deleting={deleting}
              picked={picked}
              onPick={pick}
              onPickAll={(on) =>
                setPicked(on ? new Set(unfiled.map((file) => file.path)) : new Set())
              }
              onDelete={(file) => void deleteFiles([file])}
              onDeletePicked={() =>
                void deleteFiles(unfiled.filter((file) => picked.has(file.path)))
              }
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
  picked,
  onPick,
  onPickAll,
  onDelete,
  onDeletePicked,
  onPreview
}: {
  unfiled: MediaFile[]
  total: number
  onReveal: () => void
  deleting: string | null
  picked: ReadonlySet<string>
  onPick: (path: string, on: boolean) => void
  onPickAll: (on: boolean) => void
  onDelete: (file: MediaFile) => void
  onDeletePicked: () => void
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
      {/* The bar is always here rather than appearing with the first tick: a
          control that arrives when you act cannot be found before you act, and
          "select all" is how most batches start. */}
      <div className="media-grid__bar">
        <Checkbox
          label={picked.size === unfiled.length ? 'Clear selection' : 'Select all'}
          checked={picked.size === unfiled.length}
          disabled={deleting !== null}
          onChange={(event) => onPickAll(event.target.checked)}
        />
        {picked.size > 0 && (
          <>
            <span className="media-grid__count">{picked.size} selected</span>
            <Button
              variant="danger"
              size="sm"
              icon="trash-2"
              disabled={deleting !== null}
              onClick={onDeletePicked}
            >
              Delete selected
            </Button>
          </>
        )}
      </div>

      <ul className="media-grid">
        {unfiled.map((file, index) => (
          <li key={file.path} className={picked.has(file.path) ? 'is-picked' : undefined}>
            <Checkbox
              className="media-grid__pick"
              label={`Select ${file.path}`}
              checked={picked.has(file.path)}
              disabled={deleting !== null}
              onChange={(event) => onPick(file.path, event.target.checked)}
            />
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
  onRemoved,
  onOpenUse
}: {
  doc: MediaDocument
  asset: MediaAsset
  files: MediaFile[]
  byPath: Map<string, MediaFile>
  project: Project | null
  onChange: (next: MediaDocument) => void
  onRescan: () => void
  onRemoved: () => void
  /** Opens the ink where a tag names this asset. */
  onOpenUse: (path: string, line: number) => void
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

      <UsageField project={project} asset={asset} onOpen={onOpenUse} />

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
