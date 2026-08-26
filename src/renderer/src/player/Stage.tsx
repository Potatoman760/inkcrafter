import { DEFAULT_SLOT } from '@shared/bundle/tagSpec'
import { isVideoFile } from '@shared/mediaDoc'
import type { ResolvedMedia, Scene } from '@shared/mediaTag'

interface StageProps {
  scene: Scene
  /** Every image on disk, keyed by its path under `media/`. */
  urls: Map<string, string>
}

/**
 * What the reader would be looking at.
 *
 * The preview already ran the story and already had the tags; this is the part
 * that makes them mean something. A background fills the frame with the
 * characters over it, which is the arrangement almost every visual novel uses
 * and is enough to tell whether the right sprite is up.
 *
 * Nothing here is what a finished game would look like — the game owns its own
 * presentation, and the exported bundle is what it reads. This answers a
 * narrower question: does `# char:wren/happy` show Wren, happy, and standing
 * where the tag put her.
 *
 * An animation is not a fourth thing standing beside the cast. It is shown over
 * the whole scene behind a pale cover — the scene dimmed, the effect filling
 * what it can of the frame without being stretched. So it takes no slot, and
 * the cover is what makes it read as a thing happening *to* the scene rather
 * than a very large person standing in it.
 *
 * A background is drawn or played depending on its file, and so is an
 * animation, because an <img> pointed at a .webm is a broken icon that says
 * nothing about why. Muted either way: a browser refuses to autoplay anything
 * that could make a noise, and sound in this story is what `# music:` is for.
 *
 * The three slots are the grammar's, not a layout decision made here: a tag
 * says left, middle or right and the pixels are the player's business. Drawing
 * them at all is what makes two characters on screen legible — without it they
 * stack in the centre, and a scene with two people in it looks like a scene
 * with one.
 */
export function Stage({ scene, urls }: StageProps): React.JSX.Element | null {
  const background = scene.background ? urls.get(scene.background.path) : undefined
  const backgroundPlays = scene.background ? isVideoFile(scene.background.variant.file) : false
  // Mirrored the same way a character or an effect is, and for the same reason:
  // a place drawn facing one way is a second place for free.
  const backdrop = `stage-bg${scene.backgroundFlipped ? ' is-flipped' : ''}`

  const drawable = (
    list: ResolvedMedia[]
  ): { media: ResolvedMedia; url: string }[] =>
    list
      .map((media) => ({ media, url: urls.get(media.path) }))
      .filter((entry): entry is { media: ResolvedMedia; url: string } => entry.url !== undefined)

  const characters = drawable(scene.characters)
  const animations = drawable(scene.animations)

  // A tag naming a file that is not in the folder resolves in the catalogue but
  // has no URL, and that is worth saying rather than showing an empty frame.
  const missing = [
    scene.background && !background ? scene.background.path : null,
    ...[...scene.characters, ...scene.animations]
      .filter((one) => !urls.has(one.path))
      .map((one) => one.path)
  ].filter((path): path is string => path !== null)

  // Tags that change nothing visible still change what the line does, so the
  // preview names them rather than swallowing them.
  const notes = [
    scene.speaker.length > 0 ? scene.speaker : null,
    scene.mapEnabled ? null : 'map off'
  ].filter((note): note is string => note !== null)

  const empty =
    !background &&
    characters.length === 0 &&
    animations.length === 0 &&
    notes.length === 0 &&
    scene.unresolved.length === 0 &&
    missing.length === 0

  if (empty) return null

  return (
    <div className="stage">
      {background === undefined ? (
        <div className="stage-bg is-empty" />
      ) : backgroundPlays ? (
        <video
          key={`${background}:${scene.backgroundOnce ? 'once' : 'loop'}`}
          className={backdrop}
          src={background}
          autoPlay
          loop={!scene.backgroundOnce}
          muted
          playsInline
        />
      ) : (
        <img className={backdrop} src={background} alt="" />
      )}

      {characters.map(({ media, url }) => (
        <img
          key={media.asset.id}
          // Middle when the tag never said — which is the grammar's default,
          // not a fallback invented here.
          className={`stage-char is-${scene.slots[media.asset.name] ?? DEFAULT_SLOT}${
            scene.flipped[media.asset.name] ? ' is-flipped' : ''
          }`}
          src={url}
          alt=""
        />
      ))}

      {/* One cover however many are running, so two transparent effects layer
          over a single dimming rather than dimming the scene twice. */}
      {animations.length > 0 && <div className="stage-cover" />}

      {animations.map(({ media, url }) => {
        const how = `stage-anim${scene.animFlipped[media.asset.name] ? ' is-flipped' : ''}`

        // Muted and inline because it has to start on its own: a browser
        // refuses to autoplay anything that could make a noise, and an
        // animation nobody pressed play on is the whole point of one.
        return isVideoFile(media.variant.file) ? (
          <video key={media.asset.id} className={how} src={url} autoPlay loop muted playsInline />
        ) : (
          <img key={media.asset.id} className={how} src={url} alt="" />
        )
      })}

      {notes.length > 0 && (
        <div className="stage-notes">
          {notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}

      {(scene.unresolved.length > 0 || missing.length > 0) && (
        <div className="stage-problems">
          {scene.unresolved.map((tag) => (
            <span key={tag} title="Nothing of that name in the catalogue">
              #{tag} — not in the catalogue
            </span>
          ))}
          {missing.map((path) => (
            <span key={path} title="Catalogued, but the file is not in media/">
              {path} — missing from the folder
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
