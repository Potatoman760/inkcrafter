import { useState } from 'react'
import {
  claimedFiles,
  isAudioFile,
  relocateMediaFiles,
  setMediaFile,
  type MediaAsset,
  type MediaDocument
} from '@shared/mediaDoc'
import type { MediaFile } from '@shared/types'
import type { Project } from '@shared/project'
import { Button, Field, Hint, Select } from '../design/components'

/** One named audio asset, one file—without a visual-style look selection. */
export function AudioFileField({
  doc,
  asset,
  files,
  project,
  onChange,
  onImported
}: {
  doc: MediaDocument
  asset: MediaAsset
  files: MediaFile[]
  project: Project | null
  onChange: (next: MediaDocument) => void
  onImported: () => void
}): React.JSX.Element {
  const [importing, setImporting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const current = asset.variants[0]?.file ?? ''
  const claimed = claimedFiles(doc)
  const options = files
    .filter((file) => isAudioFile(file.path) && (!claimed.has(file.path) || file.path === current))
    .map((file) => file.path)

  if (current.length > 0 && !options.includes(current)) options.unshift(current)

  const upload = async (): Promise<void> => {
    if (!project) return
    setImporting(true)
    setProblem(null)

    try {
      const result = await window.inkcrafter.media.importLook(project, {
        kind: asset.kind,
        asset: asset.name,
        // Only a file-system stem. It never becomes a user-facing look.
        look: asset.kind === 'music' ? 'track' : 'effect',
        gather: asset.variants.map((variant) => variant.file)
      })

      if (result.cancelled) return
      if (!result.ok || !result.file) {
        setProblem(result.message || 'That audio file could not be brought in.')
        return
      }

      const relocated = relocateMediaFiles(doc, result.moved)
      onChange(setMediaFile(relocated, asset.id, result.file))
      onImported()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(false)
    }
  }

  const noun = asset.kind === 'music' ? 'track' : 'sound effect'

  return (
    <Field
      as="div"
      label="File"
      note={`The audio file this ${noun} plays. It is tagged by ${noun} name, without a look.`}
    >
      <div className="media-add">
        <Select
          value={current}
          aria-label={`File for ${asset.name}`}
          onChange={(event) => onChange(setMediaFile(doc, asset.id, event.target.value))}
        >
          <option value="">choose an audio file…</option>
          {options.map((file) => (
            <option key={file} value={file}>
              {file}
            </option>
          ))}
        </Select>

        {project && (
          <Button icon="folder-open" disabled={importing} onClick={() => void upload()}>
            {importing ? 'Copying…' : 'Upload…'}
          </Button>
        )}
      </div>

      {current.length > 0 && !files.some((file) => file.path === current) && (
        <span className="codex-error">missing from media/</span>
      )}
      <code className="media-tag">#{asset.kind}:{asset.name}</code>
      {asset.variants.length > 1 && (
        <Hint tone="error">
          This older {noun} has {asset.variants.length} variant files. Choosing or uploading one
          file converts it to the simpler single-file audio format.
        </Hint>
      )}
      {problem && <Hint tone="error">{problem}</Hint>}
    </Field>
  )
}
