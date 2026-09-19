import { useMemo, useRef, useState } from 'react'
import { emptyMedia, type MediaDocument } from '@shared/mediaDoc'
import { applyTags, EMPTY_SCENE, type Scene } from '@shared/mediaTag'
import type { MediaFile } from '@shared/types'
import { Stage } from './Stage'
import { stagingAt } from './staging'
import { Icon } from '../design/Icon'
import { Button } from '../design/components'

/** One instance, not a fresh object per render, or the memo below never holds. */
const NO_MEDIA = emptyMedia()
const EMPTY_FILES: MediaFile[] = []

interface ScenePreviewProps {
  /** The ink buffer as it stands, unsaved edits included. */
  source: string
  /** Where the caret is, 1-based. */
  line: number
  /** The media catalogue, for turning tags into pictures. */
  media?: MediaDocument
  /** Every image on disk, so a resolved tag can find its URL. */
  mediaFiles?: MediaFile[]
}

/**
 * Whether the scan found anything the stage would draw or complain about.
 *
 * Asked here rather than inferred from `Stage` rendering nothing, so the panel
 * can say *why* it is blank. `missing` is not in the list because a file
 * missing from the folder implies a background or a character that named it.
 */
function staged(scene: Scene): boolean {
  return (
    scene.background !== null ||
    scene.characters.length > 0 ||
    scene.animations.length > 0 ||
    scene.speaker.length > 0 ||
    !scene.mapEnabled ||
    scene.unresolved.length > 0
  )
}

/**
 * What the reader would be looking at, at the line the author is writing.
 *
 * Reads the buffer rather than running the story — see `staging.ts` for why.
 * That makes this a picture of the tags above the caret and nothing more: it
 * does not play, so there is no transcript, no choices and no state to get out
 * of step with. Play-testing is `Preview in player`, which builds the bundle and
 * opens the real player at this knot.
 */
export function ScenePreview({
  source,
  line,
  media = NO_MEDIA,
  mediaFiles = EMPTY_FILES
}: ScenePreviewProps): React.JSX.Element {
  const { knot, tags } = useMemo(() => stagingAt(source, line), [source, line])

  // Folded in source order, because that is how a visual novel reads: a
  // background set at the top of the knot is still what the reader is looking
  // at ten lines down, and a `# clear` between the two takes it away.
  const scene = useMemo(() => applyTags(media, EMPTY_SCENE, tags), [media, tags])

  const urls = useMemo(
    () => new Map(mediaFiles.map((file) => [`media/${file.path}`, file.url])),
    [mediaFiles]
  )

  return (
    <div className="player">
      <div className="player-where">
        {knot === null ? (
          <span>before the first knot</span>
        ) : (
          <span>
            <code>{knot}</code> down to line {line}
          </span>
        )}
      </div>

      {staged(scene) ? (
        <Stage scene={scene} urls={urls} />
      ) : (
        <p className="player-empty">
          {knot === null
            ? 'Nothing staged above this line.'
            : `Nothing staged between ${knot} and this line.`}
        </p>
      )}

      {scene.music && (
        <MusicBar
          key={scene.music.path}
          track={`${scene.music.asset.display || scene.music.asset.name}${
            scene.music.variant.name ? ` · ${scene.music.variant.name}` : ''
          }`}
          url={urls.get(scene.music.path)}
          file={scene.music.path}
        />
      )}
    </div>
  )
}

/**
 * The track a scene set, and a way to hear it.
 *
 * Silent until asked, on purpose. The preview follows the caret, and a pane that
 * started playing music every time it moved would be unusable to write beside —
 * the one thing worse than not hearing the track is hearing the first two
 * seconds of it forty times.
 *
 * Keyed on the file by the caller, so a scene that sets the same track again
 * keeps this instance and goes on playing. A different track is a different
 * element, which is what makes it start silent again rather than swapping the
 * source under something already sounding.
 */
function MusicBar({
  track,
  url,
  file
}: {
  track: string
  url: string | undefined
  file: string
}): React.JSX.Element {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = (): void => {
    const element = audio.current
    if (!element) return

    if (playing) {
      element.pause()
      setPlaying(false)
      return
    }
    void element.play().then(
      () => setPlaying(true),
      () => setPlaying(false)
    )
  }

  return (
    <div className="player-music">
      <Icon name="play" size={11} />
      <span className="player-music__name">{track}</span>

      {url === undefined ? (
        <span className="player-music__missing">{file} is not in media/</span>
      ) : (
        <>
          {/* Looping, because a scene's music is a bed rather than a cue: it
              holds until a tag stops it, and a track that ran out would say
              the scene had ended when it had not. */}
          <audio ref={audio} src={url} loop onEnded={() => setPlaying(false)} />
          <Button variant="link" onClick={toggle}>
            {playing ? 'stop' : 'play'}
          </Button>
        </>
      )}
    </div>
  )
}
