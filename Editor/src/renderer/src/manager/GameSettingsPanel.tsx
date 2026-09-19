import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  DIALOGUE_FONT_OPTIONS,
  DIALOGUE_SIZE_MAX,
  DIALOGUE_SIZE_MIN,
  type BuiltinDialogueFont,
  type DialogueTextStyle,
  type GameDocument
} from '@shared/bundle/gameDoc'
import { isVideoFile, type MediaDocument } from '@shared/mediaDoc'
import type { Project } from '@shared/project'
import type { IconFile, MediaFile } from '@shared/types'
import { Button, Checkbox, Field, Hint, Input, Popover, Select, Thumb } from '../design/components'

interface GameSettingsPanelProps {
  doc: GameDocument
  project: Project | null
  /** Shown as the title field's placeholder, since blank means this. */
  projectTitle: string
  media: MediaDocument
  files: MediaFile[]
  saving: boolean
  error: string | null
  onChange: (next: GameDocument) => void
}

const refKey = (ref: { assetId: string; variantId: string }): string =>
  `${ref.assetId}:${ref.variantId}`

interface BackgroundChoice {
  ref: NonNullable<GameDocument['startupBackground']>
  label: string
  file: string
}

function BackgroundPicker({
  choices,
  selected,
  files,
  onChange
}: {
  choices: BackgroundChoice[]
  selected: GameDocument['startupBackground']
  files: ReadonlyMap<string, MediaFile>
  onChange: (next: GameDocument['startupBackground']) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selectedKey = selected ? refKey(selected) : ''
  const [activeKey, setActiveKey] = useState(selectedKey)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const entries = [
    { key: '', label: '(plain colour)', file: null },
    ...choices.map((choice) => ({ ...choice, key: refKey(choice.ref) }))
  ]
  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? entries[0]!
  const activeEntry = entries.find((entry) => entry.key === activeKey) ?? selectedEntry

  useEffect(() => {
    if (!open) setActiveKey(selectedKey)
  }, [open, selectedKey])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const pick = (entry: (typeof entries)[number]): void => {
    onChange(entry.file === null ? null : entry.ref)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const move = (step: number): void => {
    const current = Math.max(0, entries.findIndex((entry) => entry.key === activeEntry.key))
    const next = (current + step + entries.length) % entries.length
    setActiveKey(entries[next]!.key)
  }

  return (
    <div className="game-settings__background-picker" ref={rootRef}>
      {/* ic-select exception: a native select cannot preview an option on hover;
          this combobox keeps the shared select shell and supplies a visual listbox. */}
      <button
        ref={triggerRef}
        type="button"
        className="ic-select game-settings__background-trigger"
        role="combobox"
        aria-label="Startup background"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeEntry.key || 'plain'}` : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) setOpen(true)
            else move(event.key === 'ArrowDown' ? 1 : -1)
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            pick(activeEntry)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        {selectedEntry.label}
      </button>

      {open && (
        <Popover className="game-settings__background-popover">
          <div id={listId} className="game-settings__background-list" role="listbox">
            {entries.map((entry) => (
              <button
                key={entry.key}
                id={`${listId}-${entry.key || 'plain'}`}
                type="button"
                role="option"
                aria-selected={entry.key === selectedKey}
                className={`game-settings__background-option${
                  entry.key === activeEntry.key ? ' is-active' : ''
                }${entry.key === selectedKey ? ' is-selected' : ''}`}
                onMouseEnter={() => setActiveKey(entry.key)}
                onFocus={() => setActiveKey(entry.key)}
                onClick={() => pick(entry)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="game-settings__background-hover-preview" aria-live="polite">
            {activeEntry.file === null ? (
              <div className="game-settings__plain-preview">Plain colour</div>
            ) : (
              <Thumb
                size="wide"
                src={files.get(activeEntry.file)?.url}
                missing={!files.get(activeEntry.file)?.url}
                missingLabel="unavailable"
                alt={`${activeEntry.label} preview`}
              />
            )}
            <span>{activeEntry.label}</span>
          </div>
        </Popover>
      )}
    </div>
  )
}

/**
 * Settings the player needs before there is a story.
 *
 * Everything else in the Game view is a catalogue the ink reaches into. These
 * are the things no knot can set, because the reader meets them first — the
 * launch menu is on screen before a single line has run.
 */
export function GameSettingsPanel({
  doc,
  project,
  projectTitle,
  media,
  files,
  saving,
  error,
  onChange
}: GameSettingsPanelProps): React.JSX.Element {
  const [importingFont, setImportingFont] = useState<'text' | 'name' | null>(null)
  const [fontError, setFontError] = useState<string | null>(null)
  const [importingIcon, setImportingIcon] = useState(false)
  const [iconError, setIconError] = useState<string | null>(null)
  const [uploadedIcons, setUploadedIcons] = useState<IconFile[]>([])
  const [iconsLoaded, setIconsLoaded] = useState(false)
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  useEffect(() => {
    let current = true
    setIconsLoaded(false)
    if (!project) {
      setUploadedIcons([])
      setIconsLoaded(true)
      return () => { current = false }
    }
    void window.inkcrafter.game.icons(project).then(
      (found) => {
        if (current) setUploadedIcons(found)
      },
      (cause) => {
        if (current) setIconError(cause instanceof Error ? cause.message : String(cause))
      }
    ).finally(() => {
      if (current) setIconsLoaded(true)
    })
    return () => { current = false }
  }, [project])

  // Stills only: the menu is a held picture, and a clip behind it would loop
  // under the buttons with nothing to stop it.
  const backgrounds = useMemo(
    () =>
      media.assets
        .filter((asset) => asset.kind === 'background')
        .flatMap((asset) =>
          asset.variants
            .filter((variant) => !isVideoFile(variant.file))
            .map((variant) => ({
              ref: { assetId: asset.id, variantId: variant.id },
              label: `${asset.display || asset.name} — ${variant.name}`,
              file: variant.file
            }))
        ),
    [media]
  )

  // A wordmark is usually filed as a background; an animation look is allowed
  // too, since either is a still picture the export already copies.
  const artwork = useMemo(
    () =>
      media.assets
        .filter((asset) => asset.kind === 'background' || asset.kind === 'animation')
        .flatMap((asset) =>
          asset.variants
            .filter((variant) => !isVideoFile(variant.file))
            .map((variant) => ({
              ref: { assetId: asset.id, variantId: variant.id },
              label: `${asset.display || asset.name} — ${variant.name}`,
              file: variant.file
            }))
        ),
    [media]
  )

  const iconChoices = useMemo(
    () => media.assets.flatMap((asset) => asset.variants
      .filter((variant) => /\.(?:png|jpe?g)$/i.test(variant.file))
      .map((variant) => ({
        ref: { assetId: asset.id, variantId: variant.id },
        label: `${asset.display || asset.name} — ${variant.name}`,
        file: variant.file
      }))),
    [media]
  )

  const setTitle = (changes: Partial<GameDocument['title']>): void =>
    onChange({ ...doc, title: { ...doc.title, ...changes } })
  const setDialogue = (changes: Partial<GameDocument['dialogue']>): void =>
    onChange({ ...doc, dialogue: { ...doc.dialogue, ...changes } })
  const customFonts = [...new Set([doc.dialogue.text.file, doc.dialogue.name.file].filter(
    (file): file is string => file !== null
  ))]
  const setDialogueStyle = (slot: 'text' | 'name', style: DialogueTextStyle): void =>
    setDialogue({ [slot]: style })
  const chooseFont = (slot: 'text' | 'name', value: string): void => {
    const current = doc.dialogue[slot]
    if (value.startsWith('custom:')) {
      setDialogueStyle(slot, { ...current, font: 'custom', file: value.slice('custom:'.length) })
    } else {
      setDialogueStyle(slot, { ...current, font: value as BuiltinDialogueFont })
    }
  }
  const uploadFont = async (slot: 'text' | 'name'): Promise<void> => {
    if (!project || importingFont !== null) return
    setImportingFont(slot)
    setFontError(null)
    try {
      const result = await window.inkcrafter.game.importFont(project)
      if (result.cancelled) return
      if (!result.ok || !result.file) {
        setFontError(result.message || 'The font could not be imported.')
        return
      }
      setDialogueStyle(slot, { ...doc.dialogue[slot], font: 'custom', file: result.file })
    } catch (cause) {
      setFontError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImportingFont(null)
    }
  }
  const uploadIcon = async (): Promise<void> => {
    if (!project || importingIcon) return
    setImportingIcon(true)
    setIconError(null)
    try {
      const result = await window.inkcrafter.game.importIcon(project)
      if (result.cancelled) return
      if (!result.ok || !result.file || !result.url) {
        setIconError(result.message || 'The icon could not be imported.')
        return
      }
      setUploadedIcons((current) => [
        ...current.filter((icon) => icon.file !== result.file),
        { file: result.file!, url: result.url! }
      ].sort((a, b) => a.file.localeCompare(b.file)))
      onChange({ ...doc, desktopIcon: { kind: 'file', file: result.file } })
    } catch (cause) {
      setIconError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImportingIcon(false)
    }
  }

  const chosen = doc.startupBackground
    ? (backgrounds.find((one) => refKey(one.ref) === refKey(doc.startupBackground!)) ?? null)
    : null
  const url = chosen ? (byPath.get(chosen.file)?.url ?? null) : null
  const selectedMediaIconKey = doc.desktopIcon?.kind === 'media'
    ? refKey(doc.desktopIcon.ref)
    : null
  const selectedIconFile = doc.desktopIcon?.kind === 'file' ? doc.desktopIcon.file : null
  const selectedIconChoice = selectedMediaIconKey
    ? (iconChoices.find((one) => refKey(one.ref) === selectedMediaIconKey) ?? null)
    : null
  const selectedUploadedIcon = selectedIconFile
    ? (uploadedIcons.find((one) => one.file === selectedIconFile) ?? null)
    : null
  const desktopIconUrl = selectedIconChoice
    ? (byPath.get(selectedIconChoice.file)?.url ?? null)
    : (selectedUploadedIcon?.url ?? null)
  const desktopIconValue = doc.desktopIcon?.kind === 'media'
    ? `media:${refKey(doc.desktopIcon.ref)}`
    : doc.desktopIcon?.kind === 'file'
      ? `file:${doc.desktopIcon.file}`
      : ''

  return (
    <div className="game-settings">
      {saving && <span className="saving-note saving-note--loose">saving…</span>}
      {error && <p className="settings-error">{error}</p>}

      <Field
        as="div"
        label="Adult declaration"
        about="Shown once before the launch menu. Readers who confirm they are 18 or older will not see it again."
      >
        <Checkbox
          label="Require 18+ confirmation"
          checked={doc.requireAdultConfirmation}
          onChange={(event) =>
            onChange({ ...doc, requireAdultConfirmation: event.target.checked })
          }
        />
      </Field>

      <Field
        as="div"
        label="Speaker names"
        about="When enabled, a line such as Jack: Hello displays Jack as the speaker label and Hello as the dialogue. Explicit speaker tags continue to work either way."
      >
        <Checkbox
          label="Separate Name: prefixes"
          checked={doc.dialogue.separateNames}
          onChange={(event) => setDialogue({ separateNames: event.target.checked })}
        />
      </Field>

      <div className="game-settings__row game-settings__row--typography">
        <Field as="div" label="Dialogue font">
          <div className="game-settings__font">
            <Select
              value={doc.dialogue.text.font === 'custom' && doc.dialogue.text.file
                ? `custom:${doc.dialogue.text.file}`
                : doc.dialogue.text.font}
              aria-label="Dialogue font"
              onChange={(event) => chooseFont('text', event.target.value)}
            >
              {DIALOGUE_FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
              {customFonts.map((file) => (
                <option key={file} value={`custom:${file}`}>{file.split('/').pop()}</option>
              ))}
            </Select>
            <Button
              className="game-settings__font-upload"
              disabled={!project || importingFont !== null}
              onClick={() => void uploadFont('text')}
            >
              {importingFont === 'text' ? 'Copying' : 'Upload'}
            </Button>
          </div>
        </Field>

        <Field label="Dialogue size">
          <div className="game-settings__font-size">
            <Input
              className="game-settings__font-size-input"
              type="number"
              min={DIALOGUE_SIZE_MIN}
              max={DIALOGUE_SIZE_MAX}
              value={doc.dialogue.text.size}
              aria-label="Dialogue size"
              onChange={(event) =>
                setDialogue({ text: { ...doc.dialogue.text, size: Number(event.target.value) } })
              }
            />
            <span aria-hidden="true">px</span>
          </div>
        </Field>
      </div>

      <div className="game-settings__row game-settings__row--typography">
        <Field as="div" label="Name font">
          <div className="game-settings__font">
            <Select
              value={doc.dialogue.name.font === 'custom' && doc.dialogue.name.file
                ? `custom:${doc.dialogue.name.file}`
                : doc.dialogue.name.font}
              aria-label="Name font"
              onChange={(event) => chooseFont('name', event.target.value)}
            >
              {DIALOGUE_FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
              {customFonts.map((file) => (
                <option key={file} value={`custom:${file}`}>{file.split('/').pop()}</option>
              ))}
            </Select>
            <Button
              className="game-settings__font-upload"
              disabled={!project || importingFont !== null}
              onClick={() => void uploadFont('name')}
            >
              {importingFont === 'name' ? 'Copying' : 'Upload'}
            </Button>
          </div>
        </Field>

        <Field label="Name size">
          <div className="game-settings__font-size">
            <Input
              className="game-settings__font-size-input"
              type="number"
              min={DIALOGUE_SIZE_MIN}
              max={DIALOGUE_SIZE_MAX}
              value={doc.dialogue.name.size}
              aria-label="Name size"
              onChange={(event) =>
                setDialogue({ name: { ...doc.dialogue.name, size: Number(event.target.value) } })
              }
            />
            <span aria-hidden="true">px</span>
          </div>
        </Field>
      </div>

      {fontError && <Hint tone="error">{fontError}</Hint>}

      <Field label="Version" note="Shown in the top-right of the launch screen exactly as entered.">
        <Input
          value={doc.releaseVersion}
          placeholder="v1.0.0"
          maxLength={32}
          aria-label="Game version"
          onChange={(event) => onChange({ ...doc, releaseVersion: event.target.value })}
        />
      </Field>

      <Field
        as="div"
        label="Desktop icon"
        about="Used by exported desktop games. A square PNG of at least 512 × 512 pixels works best across platforms; JPEG is also supported."
      >
        <div className="game-settings__icon-setting">
          <div className="game-settings__icon-controls">
            <Select
              value={desktopIconValue}
              aria-label="Desktop icon"
              onChange={(event) => {
                const value = event.target.value
                if (value.startsWith('media:')) {
                  const found = iconChoices.find((one) => refKey(one.ref) === value.slice(6))
                  onChange({ ...doc, desktopIcon: found ? { kind: 'media', ref: found.ref } : null })
                } else if (value.startsWith('file:')) {
                  const file = value.slice(5)
                  onChange({ ...doc, desktopIcon: { kind: 'file', file } })
                } else {
                  onChange({ ...doc, desktopIcon: null })
                }
              }}
            >
              <option value="">(use Electron default)</option>
              {selectedIconFile && !selectedUploadedIcon && (
                <option value={`file:${selectedIconFile}`}>
                  {selectedIconFile.split('/').pop()}
                </option>
              )}
              {uploadedIcons.length > 0 && (
                <optgroup label="Uploaded icons">
                  {uploadedIcons.map((icon) => (
                    <option key={icon.file} value={`file:${icon.file}`}>
                      {icon.file.split('/').pop()}
                    </option>
                  ))}
                </optgroup>
              )}
              {iconChoices.length > 0 && (
                <optgroup label="Media catalogue">
                  {iconChoices.map((choice) => (
                    <option key={refKey(choice.ref)} value={`media:${refKey(choice.ref)}`}>
                      {choice.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            <Button
              className="game-settings__icon-upload"
              disabled={!project || importingIcon}
              onClick={() => void uploadIcon()}
            >
              {importingIcon ? 'Copying' : 'Upload'}
            </Button>
          </div>

          {doc.desktopIcon && (
            <Thumb
              className="game-settings__icon-preview"
              src={desktopIconUrl ?? undefined}
              missing={iconsLoaded && !desktopIconUrl}
              missingLabel="unavailable"
              alt="Desktop icon preview"
            />
          )}
        </div>
        {iconError && <Hint tone="error">{iconError}</Hint>}
        {doc.desktopIcon?.kind === 'media' && !selectedIconChoice && (
          <Hint tone="error">That image is no longer in the media catalogue.</Hint>
        )}
        {selectedIconFile && iconsLoaded && !selectedUploadedIcon && (
          <Hint tone="error">That uploaded icon file is missing.</Hint>
        )}
      </Field>

      <Field
        as="div"
        label="Startup background"
        note="Shown behind the launch menu, before the story starts."
      >
        <BackgroundPicker
          choices={backgrounds}
          selected={doc.startupBackground}
          files={byPath}
          onChange={(startupBackground) => onChange({ ...doc, startupBackground })}
        />

        {chosen && <Thumb className="game-settings__preview" src={url ?? undefined} missing={!url} />}

        {doc.startupBackground && !chosen && (
          <Hint tone="error">
            That background is no longer in the catalogue. Choose another, or the menu falls back to
            its plain colour.
          </Hint>
        )}

        {backgrounds.length === 0 && <Hint>No backgrounds catalogued yet.</Hint>}
      </Field>

      <Field label="Title" note="Blank uses the project's own title.">
        <Input
          value={doc.title.text}
          placeholder={projectTitle}
          aria-label="Title text"
          onChange={(event) => setTitle({ text: event.target.value })}
        />
      </Field>

      <div className="game-settings__row">
        <Field label="Colour">
          <div className="game-settings__colour">
            <Input
              type="color"
              className="game-settings__swatch"
              value={doc.title.color}
              aria-label="Title colour"
              onChange={(event) => setTitle({ color: event.target.value })}
            />
            <Input
              mono
              value={doc.title.color}
              aria-label="Title colour, as hex"
              onChange={(event) => setTitle({ color: event.target.value })}
            />
          </div>
        </Field>

        <Field label="Size" note="Points.">
          <Input
            type="number"
            min={8}
            max={240}
            value={doc.title.size}
            aria-label="Title size"
            onChange={(event) => setTitle({ size: Number(event.target.value) })}
          />
        </Field>
      </div>

      <Field label="Title graphic" note="A wordmark, drawn instead of the text.">
        <Select
          value={doc.title.art ? refKey(doc.title.art) : ''}
          aria-label="Title graphic"
          onChange={(event) => {
            const found = artwork.find((one) => refKey(one.ref) === event.target.value)
            setTitle({ art: found?.ref ?? null })
          }}
        >
          <option value="">(use the text above)</option>
          {artwork.map((one) => (
            <option key={refKey(one.ref)} value={refKey(one.ref)}>
              {one.label}
            </option>
          ))}
        </Select>

        {doc.title.art && (
          <Hint tight>The text, colour and size above are not drawn while this is set.</Hint>
        )}
      </Field>
    </div>
  )
}
