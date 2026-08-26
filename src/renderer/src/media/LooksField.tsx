import { useEffect, useState } from 'react'
import {
  addVariant,
  claimedFiles,
  COMBATANT_STATES,
  HOTSPOT_STATES,
  isKeyableFile,
  mediaName,
  moveVariant,
  newVariant,
  removeVariant,
  relocateMediaFiles,
  updateVariant,
  variantNameProblem,
  type MediaAsset,
  type MediaDocument,
  type MediaVariant
} from '@shared/mediaDoc'
import { formatMediaTag } from '@shared/mediaTag'
import type { CutoutMode, MediaFile } from '@shared/types'
import type { Project } from '@shared/project'
import {
  Button,
  Field,
  Hint,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Select,
  Thumb
} from '../design/components'
import { MediaPreview, Peek, type PreviewItem } from './MediaPreview'
import { copy } from '@shared/copy'

/**
 * The looks one asset has, and which file each one is.
 *
 * Lives on its own because two screens edit them: backgrounds and video in the
 * media catalogue, and a character's sprites inside the cast editor — a
 * character is edited in one place, and its pictures are part of it. One
 * implementation, so the two cannot drift into near-misses.
 *
 * The order matters and is editable: a bare `# char: wren` shows the first.
 *
 * A hotspot is the exception. Its looks are the four states the map draws, so
 * they are chosen from a list rather than typed — a look called `hovr` would be
 * art that never draws, and nothing anywhere would say so — and they are not
 * reorderable, because the map asks for each by name.
 */
export function LooksField({
  doc,
  asset,
  files,
  byPath,
  note,
  project,
  onChange,
  onImported
}: {
  doc: MediaDocument
  asset: MediaAsset
  files: MediaFile[]
  byPath: Map<string, MediaFile>
  note?: React.ReactNode
  /** Needed to bring a picture in; without it only filing is offered. */
  project?: Project | null
  onChange: (next: MediaDocument) => void
  /** Called once a picture has landed, so the folder can be read again. */
  onImported?: () => void
}): React.JSX.Element {
  const [newLook, setNewLook] = useState('')
  const [newFile, setNewFile] = useState('')
  /** Which look is open in the preview, or null. */
  const [previewing, setPreviewing] = useState<number | null>(null)
  /** `new` or the id of the existing look currently receiving a file. */
  const [importing, setImporting] = useState<string | null>(null)
  /** Which look is having its background taken out, or null. */
  const [cutting, setCutting] = useState<string | null>(null)
  /** The open mode menu: which look it belongs to, and where to put it. */
  const [modes, setModes] = useState<{ id: string; x: number; y: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  /** What the last cutout did, so a quiet success is not indistinguishable from nothing. */
  const [cutoutNote, setCutoutNote] = useState<string | null>(null)

  const states = asset.kind === 'hotspot'
    ? HOTSPOT_STATES
    : asset.kind === 'combatant'
      ? COMBATANT_STATES
      : null

  /**
   * The pixel size of each look, once the browser has loaded it.
   *
   * Only for hotspots, and only to say when they disagree: the map draws one
   * box per place and swaps the picture inside it, so a look of another size is
   * the one that comes out stretched. Measured here rather than recorded in the
   * catalogue, because it is a fact about the files and a copy would go stale
   * the moment one was re-exported.
   */
  const [sizes, setSizes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!states) return

    let live = true
    for (const variant of asset.variants) {
      const url = byPath.get(variant.file)?.url
      if (!url) continue

      const image = new Image()
      image.onload = () => {
        if (!live) return
        const size = `${image.naturalWidth}×${image.naturalHeight}`
        setSizes((current) => (current[variant.file] === size ? current : { ...current, [variant.file]: size }))
      }
      image.src = url
    }

    return () => {
      live = false
    }
  }, [states, asset.variants, byPath])

  /**
   * The menu is dismissed by anything that is not a choice from it.
   *
   * The test is where the pointer landed rather than whether the event was
   * stopped: a React handler stopping propagation does not reliably outrun a
   * listener on `window`, and when it loses, the menu closes before the click
   * reaches the item and the command silently does nothing. `FileTree` learned
   * this the same way.
   */
  useEffect(() => {
    if (!modes) return

    const close = (event: Event): void => {
      const target = event.target
      if (target instanceof Element && target.closest('.cutout-menu')) return
      setModes(null)
    }

    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
    }
  }, [modes])

  /** The look the open menu belongs to. */
  const chosen = modes ? asset.variants.find((one) => one.id === modes.id) : undefined

  const measured = asset.variants
    .map((variant) => ({ name: variant.name, size: sizes[variant.file] }))
    .filter((one): one is { name: string; size: string } => one.size !== undefined)

  const odd = measured.length > 1 && measured.some((one) => one.size !== measured[0]!.size)
  /** The states this hotspot has no art for yet. */
  const spare = states?.filter((state) => !asset.variants.some((one) => one.name === state)) ?? []

  /** What the preview steps through: this asset's looks, in the shown order. */
  const previewItems: PreviewItem[] = asset.variants.map((variant) => ({
    file: variant.file,
    url: byPath.get(variant.file)?.url,
    bytes: byPath.get(variant.file)?.bytes,
    label: asset.display || asset.name,
    look: variant.name
  }))

  const claimed = claimedFiles(doc)
  const available = files.filter((file) => !claimed.has(file.path))

  /**
   * What one look may point at: anything nothing has claimed, plus the file it
   * points at now — which is claimed, by itself, and would otherwise drop out
   * of its own list.
   *
   * A file that has gone missing from the folder stays listed too, so the look
   * reads as wrong rather than being silently repointed at something else the
   * moment the author opens the picker.
   */
  const filesFor = (variant: MediaVariant): string[] => {
    const options = available.map((file) => file.path)
    return variant.file.length > 0 && !options.includes(variant.file)
      ? [variant.file, ...options]
      : options
  }

  /**
   * Brings a file in for either a new or an existing look.
   *
   * Main never overwrites the old binary: an app URL may still cache it, and
   * the workspace has no undo. It copies the replacement under a free name and
   * this callback repoints the look, leaving the old file recoverable and
   * visible as unfiled media after the rescan.
   */
  const bringIn = async (
    label: string,
    token: string,
    apply: (relocated: MediaDocument, file: string) => MediaDocument
  ): Promise<boolean> => {
    if (!project) return false

    setImporting(token)
    setProblem(null)

    try {
      const result = await window.inkcrafter.media.importLook(project, {
        kind: asset.kind,
        asset: asset.name,
        look: label,
        gather: asset.variants.map((one) => one.file)
      })

      if (result.cancelled) return false
      if (!result.ok || !result.file) {
        setProblem(result.message || 'That picture could not be brought in.')
        return false
      }

      // Anything gathered on the way moved, so the catalogue follows it in the
      // same change as the add or replacement.
      const relocated = relocateMediaFiles(doc, result.moved)
      onChange(apply(relocated, result.file))
      onImported?.()
      return true
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(null)
    }

    return false
  }

  /** Brings a picture in from outside and files it as a new look. */
  const importLook = async (): Promise<void> => {
    const label = newLook.trim()
    if (label.length === 0 || variantNameProblem(asset, label)) return

    const added = await bringIn(label, 'new', (relocated, file) =>
      addVariant(relocated, asset.id, newVariant(label, file))
    )
    if (added) {
      setNewLook('')
      setNewFile('')
    }
  }

  /** Uploads a new file and makes an existing look point at it. */
  const replaceLook = async (variant: MediaVariant): Promise<void> => {
    await bringIn(variant.name, variant.id, (relocated, file) =>
      updateVariant(relocated, asset.id, variant.id, { file })
    )
  }

  /**
   * Takes the white card out from behind one look.
   *
   * The result is a new file and the look is repointed at it, so the original
   * is still there — this is a workspace with no undo, and an `app://` URL
   * carries no version, so a file rewritten under its own name might well go on
   * showing the pixels it had.
   *
   * A refusal is reported rather than worked around. Main measures the border
   * and says what colour it actually found; retrying at a different tolerance
   * would just key a picture that has no card behind it.
   */
  const cutout = async (variant: MediaVariant, mode: CutoutMode): Promise<void> => {
    if (!project) return

    setModes(null)
    setCutting(variant.id)
    setProblem(null)
    setCutoutNote(null)

    try {
      const result = await window.inkcrafter.media.cutout(project, { file: variant.file, mode })

      if (!result.ok || !result.file) {
        setProblem(result.message || 'That background could not be taken out.')
        return
      }

      onChange(updateVariant(doc, asset.id, variant.id, { file: result.file }))
      setCutoutNote(
        `Took ${result.colour} out of ${variant.name || asset.name} into ${result.file} — ${result.cleared.toLocaleString()} pixels cleared, ${result.feathered.toLocaleString()} softened at the edge. ` +
          (result.enclosed > 0
            ? `${result.enclosed.toLocaleString()} of them were gaps the art had closed around.`
            : 'White inside the picture was kept.')
      )
      onImported?.()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCutting(null)
    }
  }

  const addLook = (): void => {
    const file = newFile.trim()
    if (file.length === 0) return
    const label = newLook.trim() || file.split('/').pop() || 'look'
    if (variantNameProblem(asset, label)) return

    onChange(addVariant(doc, asset.id, newVariant(label, file)))
    setNewLook('')
    setNewFile('')
  }

  return (
    <Field as="div" label="Looks" note={note ?? copy('media.looks')}>
      {asset.variants.length === 0 && <Hint>No looks yet. Add one below and this becomes showable.</Hint>}

      <ul className="media-variants">
        {asset.variants.map((variant, index) => {
          const file = byPath.get(variant.file)

          return (
            <li key={variant.id}>
              <Peek
                label={variant.name || asset.name}
                onClick={() => setPreviewing(index)}
              >
                <Thumb
                  className="media-thumb"
                  src={file?.url}
                  missing={file === undefined}
                  missingLabel={<span className="media-missing">!</span>}
                  title={file === undefined ? 'This file is not in the folder' : undefined}
                />
              </Peek>

              <span className="media-variant-body">
                {states ? (
                  <Select
                    value={variant.name}
                    aria-label={`Name of look ${index + 1}`}
                    onChange={(event) =>
                      onChange(
                        updateVariant(doc, asset.id, variant.id, { name: event.target.value })
                      )
                    }
                  >
                    {states.map((state) => (
                      <option
                        key={state}
                        value={state}
                        // A state another look already has would leave one of
                        // them unreachable.
                        disabled={
                          state !== variant.name &&
                          asset.variants.some((one) => one.name === state)
                        }
                      >
                        {state}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={variant.name}
                    aria-label={`Name of look ${index + 1}`}
                    onChange={(event) =>
                      onChange(
                        updateVariant(doc, asset.id, variant.id, {
                          name: mediaName(event.target.value)
                        })
                      )
                    }
                  />
                )}
                <span className="media-look-file">
                  <Select
                    size="sm"
                    value={variant.file}
                    aria-label={`File for look ${index + 1}`}
                    onChange={(event) =>
                      onChange(updateVariant(doc, asset.id, variant.id, { file: event.target.value }))
                    }
                  >
                    {filesFor(variant).map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </Select>
                  {project && (
                    <Button
                      size="xs"
                      icon="folder-open"
                      aria-label={`Upload replacement for ${variant.name || asset.name}`}
                      disabled={importing !== null}
                      onClick={() => void replaceLook(variant)}
                    >
                      {importing === variant.id ? 'Copying…' : 'Replace'}
                    </Button>
                  )}
                </span>
                {!file && <span className="codex-error">missing from media/</span>}
                {formatMediaTag(asset, variant) !== null && (
                  <code className="media-tag">#{formatMediaTag(asset, variant)}</code>
                )}
              </span>

              {!states && (
                <span className="stats-move">
                  <IconButton
                    icon="chevron-up"
                    label={`Move ${variant.name} up`}
                    onClick={() => onChange(moveVariant(doc, asset.id, variant.id, -1))}
                  />
                  <IconButton
                    icon="chevron-down"
                    label={`Move ${variant.name} down`}
                    onClick={() => onChange(moveVariant(doc, asset.id, variant.id, 1))}
                  />
                </span>
              )}

              {/* Outside the reorder block on purpose: a hotspot's art comes
                  off the same generator and needs this as much as a sprite
                  does, and only the *order* of its looks is fixed. */}
              {project && file && isKeyableFile(variant.file) && (
                <IconButton
                  icon="scissors"
                  // The same class as the menu, so the window listener that
                  // dismisses it does not fire on the button that toggles it.
                  className="cutout-menu"
                  label={`Take the white background out of ${variant.name || asset.name}`}
                  disabled={cutting !== null}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect()
                    setModes(
                      modes?.id === variant.id
                        ? null
                        : { id: variant.id, x: box.left, y: box.bottom + 4 }
                    )
                  }}
                />
              )}

              <IconButton
                icon="x"
                label={`Remove look ${variant.name}`}
                onClick={() => onChange(removeVariant(doc, asset.id, variant.id))}
              />
            </li>
          )
        })}
      </ul>

      <div className="media-add">
        {states ? (
          <Select
            value={newLook}
            aria-label="New look name"
            disabled={spare.length === 0}
            onChange={(event) => setNewLook(event.target.value)}
          >
            <option value="">choose a state…</option>
            {spare.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={newLook}
            aria-label="New look name"
            placeholder="neutral"
            onChange={(event) => setNewLook(event.target.value)}
          />
        )}
        <Select
          value={newFile}
          aria-label="File for the new look"
          onChange={(event) => setNewFile(event.target.value)}
        >
          <option value="">choose a file…</option>
          {available.map((file) => (
            <option key={file.path} value={file.path}>
              {file.path}
            </option>
          ))}
        </Select>
        <Button
          icon="plus"
          onClick={addLook}
          disabled={newFile.trim().length === 0 || (states !== null && newLook.length === 0)}
        >
          Add look
        </Button>

        {/* Filing something already in the folder and bringing something in are
            the same act with a different starting point, so they share the row
            and the name typed beside them. */}
        {project && (
          <Button
            icon="folder-open"
            disabled={importing !== null || newLook.trim().length === 0 || variantNameProblem(asset, newLook.trim()) !== null}
            onClick={() => void importLook()}
          >
            {importing === 'new' ? 'Copying…' : 'Upload…'}
          </Button>
        )}
      </div>

      {problem && <Hint tone="error">{problem}</Hint>}
      {cutoutNote && <Hint tight>{cutoutNote}</Hint>}

      {available.length === 0 && files.length > 0 && (
        <Hint tight>Every image in the folder is already filed.</Hint>
      )}

      {odd && (
        <Hint tone="error">
          These are not all the same size —{' '}
          {measured.map((one) => `${one.name} is ${one.size}`).join(', ')}. The map draws one box
          and swaps the picture in it, so the others are stretched into the first one&apos;s shape.
        </Hint>
      )}

      {states && spare.length > 0 && asset.variants.length > 0 && (
        <Hint tight>
          No art for {spare.join(', ')} yet — the map falls back to idle for those.
        </Hint>
      )}

      {/* Anchored to the button rather than nested in the row: a menu inside the
          list would be clipped by the row's own overflow, and the row is where
          the scrollbar lives. */}
      {modes && (
        <Menu
          className="cutout-menu"
          aria-label="Take out the background"
          label={`Take out the background of ${chosen?.name || asset.name}`}
          labelClassName="cutout-menu__label"
          style={{ position: 'fixed', left: modes.x, top: modes.y }}
        >
          <MenuItem
            icon="scissors"
            title="Floods in from the border and stops at the first pixel that is not the background, so white the art encloses — a highlight, the whites of an eye — is kept."
            onClick={() => chosen && void cutout(chosen, 'edge')}
          >
            From the edge
          </MenuItem>
          <MenuItem
            icon="scissors"
            title="Also takes out background the art has closed around, such as the paper showing through a loop of hair. A gap is told from a highlight by what walls it in."
            onClick={() => chosen && void cutout(chosen, 'gaps')}
          >
            Edge, and gaps in the art
          </MenuItem>
        </Menu>
      )}

      {previewing !== null && (
        <MediaPreview
          items={previewItems}
          at={previewing}
          onMove={setPreviewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </Field>
  )
}
