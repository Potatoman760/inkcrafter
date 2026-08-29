import { useMemo } from 'react'
import type { GameDocument } from '@shared/bundle/gameDoc'
import { isVideoFile, type MediaDocument } from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import { Field, Hint, Input, Select, Thumb } from '../design/components'

interface GameSettingsPanelProps {
  doc: GameDocument
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

/**
 * Settings the player needs before there is a story.
 *
 * Everything else in the Game view is a catalogue the ink reaches into. These
 * are the things no knot can set, because the reader meets them first — the
 * launch menu is on screen before a single line has run.
 */
export function GameSettingsPanel({
  doc,
  projectTitle,
  media,
  files,
  saving,
  error,
  onChange
}: GameSettingsPanelProps): React.JSX.Element {
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

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

  const setTitle = (changes: Partial<GameDocument['title']>): void =>
    onChange({ ...doc, title: { ...doc.title, ...changes } })

  const chosen = doc.startupBackground
    ? (backgrounds.find((one) => refKey(one.ref) === refKey(doc.startupBackground!)) ?? null)
    : null
  const url = chosen ? (byPath.get(chosen.file)?.url ?? null) : null

  return (
    <div className="game-settings">
      {saving && <span className="saving-note saving-note--loose">saving…</span>}
      {error && <p className="settings-error">{error}</p>}

      <Field
        label="Startup background"
        note="Shown behind the launch menu, before the story starts."
      >
        <Select
          value={doc.startupBackground ? refKey(doc.startupBackground) : ''}
          aria-label="Startup background"
          onChange={(event) => {
            const found = backgrounds.find((one) => refKey(one.ref) === event.target.value)
            onChange({ ...doc, startupBackground: found?.ref ?? null })
          }}
        >
          <option value="">(plain colour)</option>
          {backgrounds.map((one) => (
            <option key={refKey(one.ref)} value={refKey(one.ref)}>
              {one.label}
            </option>
          ))}
        </Select>

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
