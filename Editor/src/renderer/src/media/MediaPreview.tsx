import { useEffect, useState } from 'react'
import { isAudioFile, isVideoFile } from '@shared/mediaDoc'
import { Dialog, Hint, IconButton } from '../design/components'

/**
 * One picture, big enough to judge.
 *
 * The catalogue's thumbnails are the size of a fingernail, which is enough to
 * tell two looks apart and nothing like enough to tell whether a sprite is any
 * good — so every one of them opens this. It is a lightbox rather than a pane
 * because the same thumbnails appear on three screens, and a pane would have to
 * be built into each of them separately and be too small on all three.
 *
 * Stepping matters as much as the size. A character has eight expressions and
 * the question is nearly always "how do these compare", which is one keypress
 * apiece here and eight round trips through a list otherwise.
 */

export interface PreviewItem {
  /** Path under `media/`, which is also what identifies it. */
  file: string
  /** The `app://` url, or undefined when the folder does not have the file. */
  url?: string
  /** What this is a look of — "harbour", "wren". */
  label: string
  /** The look's own name, when it has one. */
  look?: string
  bytes?: number
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function MediaPreview({
  items,
  at,
  onMove,
  onClose
}: {
  items: PreviewItem[]
  at: number
  onMove: (index: number) => void
  onClose: () => void
}): React.JSX.Element | null {
  /**
   * How big the file really is, once the browser has it.
   *
   * Read off the loaded element rather than recorded anywhere: it is a fact
   * about the file, and a copy would go stale the moment one was redrawn.
   */
  const [size, setSize] = useState<string | null>(null)

  const item = items[at]
  useEffect(() => setSize(null), [item?.file])

  // Left and right step; Escape is the Dialog's own.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const next = at + (event.key === 'ArrowRight' ? 1 : -1)
      if (next < 0 || next >= items.length) return
      event.preventDefault()
      onMove(next)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [at, items.length, onMove])

  if (!item) return null

  const video = isVideoFile(item.file)
  const audio = isAudioFile(item.file)
  const facts = [item.file, size, item.bytes === undefined ? null : readableBytes(item.bytes)]
    .filter(Boolean)
    .join(' · ')

  return (
    <Dialog
      title={item.look ? `${item.label} · ${item.look}` : item.label}
      ariaLabel={`Preview of ${item.file}`}
      subtitle={facts}
      className="media-preview"
      flush
      onClose={onClose}
    >
      <div className="media-preview__stage">
        {!item.url ? (
          <Hint tone="error">
            {item.file} is not in the project&apos;s media/ folder, so there is nothing to show.
            Either put it there and press rescan, or point this look at a file that exists.
          </Hint>
        ) : audio ? (
          // Nothing to look at, so the controls are the whole of it. Not
          // autoplayed: opening a folder of tracks should not start one.
          <audio key={item.file} src={item.url} controls />
        ) : video ? (
          <video
            key={item.file}
            src={item.url}
            controls
            autoPlay
            loop
            onLoadedMetadata={(event) =>
              setSize(`${event.currentTarget.videoWidth}×${event.currentTarget.videoHeight}`)
            }
          />
        ) : (
          <img
            key={item.file}
            src={item.url}
            alt={item.file}
            onLoad={(event) =>
              setSize(`${event.currentTarget.naturalWidth}×${event.currentTarget.naturalHeight}`)
            }
          />
        )}
      </div>

      {items.length > 1 && (
        <div className="media-preview__bar">
          <IconButton
            icon="chevron-left"
            label="Previous"
            disabled={at === 0}
            onClick={() => onMove(at - 1)}
          />
          <span className="media-preview__count">
            {at + 1} of {items.length}
          </span>
          <IconButton
            icon="chevron-right"
            label="Next"
            disabled={at === items.length - 1}
            onClick={() => onMove(at + 1)}
          />
        </div>
      )}
    </Dialog>
  )
}

/**
 * A thumbnail that opens the preview.
 *
 * A button around whatever the list already draws, rather than a new kind of
 * thumbnail: the three places these appear each have their own markup and
 * sizing, and only the opening is shared.
 */
export function Peek({
  label,
  onClick,
  className = '',
  children
}: {
  /** What is being opened, for the button's name. */
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={['media-peek', className].filter(Boolean).join(' ')}
      aria-label={`Preview ${label}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
