import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Story } from 'inkjs'
import { emptyNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import { parseTag } from '@shared/bundle/tagSpec'
import { emptyMedia, type MediaDocument } from '@shared/mediaDoc'
import { sceneFrom } from '@shared/mediaTag'
import { emptyStats, type StatsDocument } from '@shared/statsDoc'
import { applyChange, trackablesOf, type Trackable } from '@shared/trackables'
import type { MediaFile } from '@shared/types'
import { Stage } from './Stage'
import { Icon } from '../design/Icon'
import { Button } from '../design/components'

/** One instance, not a fresh object per render, or the memo below never holds. */
const NO_MEDIA = emptyMedia()
const NO_STATS = emptyStats()
const NO_NPCS = emptyNpcs()
const EMPTY_FILES: MediaFile[] = []

interface StoryPlayerProps {
  /** Compiled story JSON, or null when the current source does not compile. */
  storyJson: string | null
  /**
   * The section the author has the cursor in, played instead of the whole
   * story. Null plays from the start.
   *
   * A scene late in a story is otherwise unreachable without clicking through
   * everything before it, which is most of what previewing one costs.
   */
  knot?: string | null
  /** The media catalogue, for turning tags into pictures. */
  media?: MediaDocument
  /** Every image on disk, so a resolved tag can find its URL. */
  mediaFiles?: MediaFile[]
  /** The catalogues, so a `# stat:` or `# npc:` tag moves what it says it does. */
  stats?: StatsDocument
  npcs?: NpcDocument
}

interface Choice {
  index: number
  text: string
}

type Entry =
  | { kind: 'text'; text: string; tags: string[] }
  | { kind: 'choice'; text: string }
  | { kind: 'error'; text: string }

/**
 * Applies the state tags on a line, the way the game will.
 *
 * ink treats a tag as an opaque string and changes nothing, so without this a
 * gate on `abeline_affection` never opens in the preview however many
 * `# npc: abeline affection +2` lines the story has passed. Between `Continue()`
 * calls is the only place it can go: ink evaluates a condition *during* one, so
 * a change applied at the end of the run would arrive after every branch that
 * reads it.
 */
function applyState(story: Story, trackables: readonly Trackable[], tags: readonly string[]): void {
  if (trackables.length === 0) return

  const store = {
    get: (name: string): unknown => story.variablesState[name],
    set: (name: string, value: number | string | boolean): void => {
      story.variablesState[name] = value
    }
  }

  for (const raw of tags) {
    const command = parseTag(raw)
    if (command && (command.kind === 'stat' || command.kind === 'npc')) {
      applyChange(store, trackables, command)
    }
  }
}

/**
 * The knots a compiled story has.
 *
 * Read from the story rather than scanned from the source, because a divert
 * commonly lands in another file and the preview plays the whole story, not
 * the one buffer the editor is showing. Functions come back in this list too
 * and are harmless: the story never walks into one.
 */
function knotsOf(story: Story): string[] {
  const named = story.mainContentContainer?.namedContent
  return named ? [...named.keys()] : []
}

/**
 * How many times the story has been into each knot.
 *
 * This is the only reliable way to tell which knot a line came from. The
 * obvious answers — `state.currentPathString`, `state.previousPointer` — are
 * both null on the last line before the story runs out, which is exactly the
 * shape a two-knot scene has: the leaked line is the one they cannot name.
 * A count that just went up cannot be missed the same way.
 */
function visitsOf(story: Story, knots: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const knot of knots) counts.set(knot, story.state.VisitCountAtPathString(knot) ?? 0)
  return counts
}

/** What one run of the story produced, and where it stopped. */
interface Run {
  entries: Entry[]
  /**
   * The first line of the next knot, read but held back.
   *
   * Held rather than thrown away because ink cannot un-read it, and held rather
   * than shown because its tags belong to the next scene. Its `# stat:` and
   * `# npc:` changes are deliberately not applied yet either — they land only
   * if the author reads on.
   */
  next: { knot: string; entry: Extract<Entry, { kind: 'text' }> } | null
}

/**
 * Runs the story forward until it needs input, collecting everything it emits.
 * ink yields one paragraph per `Continue()`, along with the tags in scope at
 * that point, so tags have to be read between calls rather than at the end.
 *
 * `within` stops the run when the story walks into another knot. A knot is
 * where an author changes the background, the cast or an animation, so a
 * preview that read straight on through the next one would show that scene's
 * staging while claiming to be showing this one — the edit an author just made
 * two knots down would appear to have done nothing at all. A choice already
 * stopped the run; this makes a plain divert stop it too.
 */
function advance(story: Story, trackables: readonly Trackable[], within: string | null): Run {
  const entries: Entry[] = []
  // A stitch is part of its knot, so the boundary is the knot's own name.
  const home = within === null ? null : (within.split('.')[0] ?? null)
  const knots = home === null ? [] : knotsOf(story)
  let seen = visitsOf(story, knots)

  try {
    while (story.canContinue) {
      const text = story.Continue() ?? ''
      const tags = story.currentTags ?? []

      if (home !== null) {
        const now = visitsOf(story, knots)
        const entered = knots.find(
          (knot) => knot !== home && (now.get(knot) ?? 0) > (seen.get(knot) ?? 0)
        )
        seen = now
        if (entered !== undefined) {
          return { entries, next: { knot: entered, entry: { kind: 'text', text: text.trim(), tags } } }
        }
      }

      applyState(story, trackables, tags)
      if (text.trim().length > 0 || tags.length > 0) {
        entries.push({ kind: 'text', text: text.trim(), tags })
      }
    }
  } catch (error) {
    entries.push({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
  }

  for (const message of story.currentErrors ?? []) {
    entries.push({ kind: 'error', text: message })
  }

  return { entries, next: null }
}

function currentChoices(story: Story): Choice[] {
  return story.currentChoices.map((choice) => ({ index: choice.index, text: choice.text }))
}

export function StoryPlayer({
  storyJson,
  knot = null,
  media = NO_MEDIA,
  mediaFiles = EMPTY_FILES,
  stats = NO_STATS,
  npcs = NO_NPCS
}: StoryPlayerProps): React.JSX.Element {
  const storyRef = useRef<Story | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [ended, setEnded] = useState(false)
  /**
   * Set when the run stopped at a knot boundary rather than at a choice or the
   * end, holding the line that would have started the next scene.
   */
  const [next, setNext] = useState<Run['next']>(null)
  /**
   * Set when the author asked for the whole story rather than the section they
   * are in. Cleared by moving to another section, because the request was
   * about this one.
   */
  const [wholeStory, setWholeStory] = useState(false)
  useEffect(() => setWholeStory(false), [knot])

  const trackables = useMemo(() => trackablesOf(stats, npcs), [stats, npcs])

  const start = useCallback(
    (json: string | null, at: string | null) => {
      if (json === null) {
        storyRef.current = null
        setEntries([])
        setChoices([])
        setEnded(false)
        setNext(null)
        return
      }

      try {
        let story = new Story(json)

        // A knot the compile does not have — an open file the entry point
        // never includes — throws rather than returning anything. A refused
        // path also leaves the story pointing at nothing, so the fallback is a
        // fresh one rather than this one carried on with.
        let missing = false
        if (at !== null) {
          try {
            story.ChoosePathString(at)
          } catch {
            missing = true
            story = new Story(json)
          }
        }

        storyRef.current = story
        // A story played from the start is not being previewed as a section, so
        // nothing bounds it; it reads to the first choice the way it always has.
        const run = advance(story, trackables, missing ? null : at)
        if (missing) {
          run.entries.unshift({
            kind: 'error',
            text: `Nothing called ${at} in this compile, so this is the story from the start.`
          })
        }
        setEntries(run.entries)
        setNext(run.next)
        // Stopping at a boundary is not the end of anything, and there is
        // nothing to choose there — the story has more to say when asked.
        setChoices(run.next === null ? currentChoices(story) : [])
        setEnded(run.next === null && story.currentChoices.length === 0 && !story.canContinue)
      } catch (error) {
        storyRef.current = null
        setEntries([
          { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        ])
        setChoices([])
        setEnded(false)
        setNext(null)
      }
    },
    [trackables]
  )

  // Recompiling replays from the top. Preserving position across edits needs
  // state-snapshot restore, which is only safe when the story structure is
  // unchanged — a later feature, not a default.
  const playing = wholeStory ? null : knot
  useEffect(() => start(storyJson, playing), [storyJson, playing, start])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [entries])

  const choose = (choice: Choice): void => {
    const story = storyRef.current
    if (!story) return

    story.ChooseChoiceIndex(choice.index)
    // Unbounded: taking a choice is play-testing rather than looking at the
    // section under the cursor, and stopping at the knot it leads into would
    // mean every choice showed nothing until it was asked twice.
    const run = advance(story, trackables, null)
    setEntries((previous) => [...previous, { kind: 'choice', text: choice.text }, ...run.entries])
    setNext(run.next)
    setChoices(currentChoices(story))
    setEnded(story.currentChoices.length === 0 && !story.canContinue)
  }

  /**
   * Past the boundary and on into the next knot, one knot at a time.
   *
   * The held line is played out here — its state changes included, which is why
   * they were not applied when it was read.
   */
  const readOn = (): void => {
    const story = storyRef.current
    if (!story || !next) return

    applyState(story, trackables, next.entry.tags)
    const run = advance(story, trackables, next.knot)
    // A blank untagged line still marks the boundary, but there is nothing of
    // it worth putting in the transcript.
    const shown =
      next.entry.text.length === 0 && next.entry.tags.length === 0 ? [] : [next.entry]

    setEntries((previous) => [...previous, ...shown, ...run.entries])
    setNext(run.next)
    setChoices(run.next === null ? currentChoices(story) : [])
    setEnded(run.next === null && story.currentChoices.length === 0 && !story.canContinue)
  }

  const urls = useMemo(
    () => new Map(mediaFiles.map((file) => [`media/${file.path}`, file.url])),
    [mediaFiles]
  )

  // Folded over every line read so far, not just the last: a background set
  // three paragraphs ago is still what the reader is looking at.
  const scene = useMemo(
    () =>
      sceneFrom(
        media,
        entries.flatMap((entry) => (entry.kind === 'text' ? [entry.tags] : []))
      ),
    [media, entries]
  )

  // Every hook has to be above this. A story that has not compiled yet returns
  // here, and a hook below would then run only once one had — a different number
  // of hooks between renders, which takes the whole view down.
  if (storyJson === null) {
    return (
      <div className="player">
        <div className="player-empty">
          Fix the errors below to preview the story.
        </div>
      </div>
    )
  }

  return (
    <div className="player">
      {/* Which of the two things is being played, and the way to the other.
          Only where there is a choice to make: above the first knot of a file
          there is nothing to play but the story. */}
      {knot !== null && (
        <div className="player-where">
          {wholeStory ? (
            <>
              <span>the whole story</span>
              <Button variant="link" onClick={() => setWholeStory(false)}>
                play {knot}
              </Button>
            </>
          ) : (
            <>
              <span>
                from <code>{knot}</code>
              </span>
              <Button variant="link" onClick={() => setWholeStory(true)}>
                from the start
              </Button>
            </>
          )}
        </div>
      )}

      <Stage scene={scene} urls={urls} />

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
      <div className="transcript" ref={transcriptRef}>
        {entries.map((entry, index) => {
          if (entry.kind === 'choice') {
            return (
              <p key={index} className="transcript-choice">
                {entry.text}
              </p>
            )
          }
          if (entry.kind === 'error') {
            return (
              <p key={index} className="transcript-error">
                {entry.text}
              </p>
            )
          }
          return (
            <p key={index} className="transcript-text">
              {entry.text}
              {entry.tags.length > 0 && (
                <span className="transcript-tags">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="tag">
                      #{tag}
                    </span>
                  ))}
                </span>
              )}
            </p>
          )
        })}
      </div>

      <div className="choices">
        {choices.map((choice) => (
          <Button key={choice.index} className="choice" onClick={() => choose(choice)}>
            {choice.text}
          </Button>
        ))}
        {next && (
          <Button className="read-on" variant="link" onClick={readOn}>
            <Icon name="corner-down-right" size={13} />
            Read on into {next.knot}
          </Button>
        )}
        {ended && <p className="player-ended">End of story.</p>}
        <Button className="restart" onClick={() => start(storyJson, playing)}>
          <Icon name="rotate-ccw" size={13} />
          Restart
        </Button>
      </div>
    </div>
  )
}

/**
 * The track a scene set, and a way to hear it.
 *
 * Silent until asked, on purpose. The preview restarts on every recompile and
 * every move between sections, and a pane that started playing music each time
 * would be unusable to write beside — the one thing worse than not hearing the
 * track is hearing the first two seconds of it forty times.
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
