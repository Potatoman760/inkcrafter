// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Compiler } from 'inkjs/compiler/Compiler'
import { CompilerOptions } from 'inkjs/compiler/CompilerOptions'
import {
  addAsset,
  addVariant,
  emptyMedia,
  newAsset,
  newVariant,
  type MediaDocument
} from '@shared/mediaDoc'
import userEvent from '@testing-library/user-event'
import { parseNpcs, type NpcDocument } from '@shared/bundle/npcDoc'
import { emptyStats } from '@shared/statsDoc'
import type { MediaFile } from '@shared/types'
import { StoryPlayer } from './StoryPlayer'

/** One character with an affection score, which is all the gate below needs. */
function cast(): NpcDocument {
  return parseNpcs(
    JSON.stringify({
      version: 1,
      npcs: [
        {
          id: 'npc_a',
          inkId: 'abeline',
          name: 'Sister Abeline',
          stats: [{ key: 'affection', label: 'Affection', initial: 0, min: 0, max: 10 }]
        }
      ]
    })
  )
}

const STORY = `# bg:the_cove/night
# char:wren/happy
The cove is quiet.

* [Wait]
    -> END
`

const compiled = (source = STORY): string => new Compiler(source).Compile().ToJson()!

function media(): MediaDocument {
  let doc = emptyMedia()

  const wren = newAsset('Wren', 'character')
  doc = addAsset(doc, wren)
  doc = addVariant(doc, wren.id, newVariant('happy', 'sprites/wren-happy.png'))

  const cove = newAsset('The Cove', 'background')
  doc = addAsset(doc, cove)
  doc = addVariant(doc, cove.id, newVariant('night', 'bg/cove-night.png'))

  return doc
}

const FILES: MediaFile[] = [
  { path: 'sprites/wren-happy.png', bytes: 1, url: 'app://media/p/media/sprites/wren-happy.png' },
  { path: 'bg/cove-night.png', bytes: 1, url: 'app://media/p/media/bg/cove-night.png' }
]

describe('StoryPlayer', () => {
  it('says what to do while nothing compiles', () => {
    render(<StoryPlayer storyJson={null} />)
    expect(screen.getByText(/Fix the errors below/)).toBeInTheDocument()
  })

  it('plays a story', () => {
    render(<StoryPlayer storyJson={compiled()} />)
    expect(screen.getByText('The cove is quiet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wait' })).toBeInTheDocument()
  })

  /**
   * What every startup does: the preview mounts before the first compile has
   * finished, then gets a story. Two `useMemo` calls once sat *below* the
   * early return for a null story, so they ran only on the second render —
   * more hooks than the render before, which takes the whole view down. The UI
   * flashed and went blank.
   */
  it('survives going from no story to a story', () => {
    const { rerender } = render(<StoryPlayer storyJson={null} media={media()} mediaFiles={FILES} />)
    expect(screen.getByText(/Fix the errors below/)).toBeInTheDocument()

    rerender(<StoryPlayer storyJson={compiled()} media={media()} mediaFiles={FILES} />)

    expect(screen.getByText('The cove is quiet.')).toBeInTheDocument()
  })

  it('survives going back to no story', () => {
    const { rerender } = render(<StoryPlayer storyJson={compiled()} />)
    rerender(<StoryPlayer storyJson={null} />)

    expect(screen.getByText(/Fix the errors below/)).toBeInTheDocument()
  })

  it('draws the scene the tags describe', () => {
    const { container } = render(
      <StoryPlayer storyJson={compiled()} media={media()} mediaFiles={FILES} />
    )

    expect(container.querySelector('.stage-bg')).toHaveAttribute(
      'src',
      'app://media/p/media/bg/cove-night.png'
    )
    expect(container.querySelector('.stage-char')).toHaveAttribute(
      'src',
      'app://media/p/media/sprites/wren-happy.png'
    )
  })

  it('shows no stage at all for a story with no media tags', () => {
    const { container } = render(
      <StoryPlayer storyJson={compiled('Just prose.\n-> END\n')} media={media()} mediaFiles={FILES} />
    )

    expect(container.querySelector('.stage')).toBeNull()
    expect(screen.getByText('Just prose.')).toBeInTheDocument()
  })

  it('works with no media at all, which is the default', () => {
    render(<StoryPlayer storyJson={compiled()} />)
    expect(screen.getByText('The cove is quiet.')).toBeInTheDocument()
  })

  /* State tags ------------------------------------------------------------- */

  /**
   * ink treats a tag as an opaque string, so without the catalogues the preview
   * plays a story where nothing the reader does ever counts. With them it takes
   * the same branch the game will, which is the only reason the preview is worth
   * play-testing in.
   */
  describe('a # npc: change', () => {
    const CAST = `-> start
=== start ===
* [Step forward]
    # npc: abeline affection +2
    She smiles.
    -> the_vow
=== the_vow ===
{ abeline_affection >= 2: She proposes. | She stays distant. }
-> END
`

    const withState = `VAR abeline_affection = 0\n${CAST}`

    it('opens a gate the story branches on', async () => {
      render(
        <StoryPlayer storyJson={compiled(withState)} stats={emptyStats()} npcs={cast()} />
      )

      await userEvent.click(screen.getByRole('button', { name: 'Step forward' }))

      expect(screen.getByText('She proposes.')).toBeInTheDocument()
    })

    // The honest comparison: the same story with nothing to read the tag takes
    // the other branch, which is what the preview used to do every time.
    it('leaves the gate shut when there is no catalogue to read it', async () => {
      render(<StoryPlayer storyJson={compiled(withState)} />)

      await userEvent.click(screen.getByRole('button', { name: 'Step forward' }))

      expect(screen.getByText('She stays distant.')).toBeInTheDocument()
    })
  })
})

/**
 * Playing the section the author is in.
 *
 * A scene late in a story is otherwise unreachable without clicking through
 * everything before it, which is most of what previewing one costs. The knot
 * comes from where the cursor is, so this is the preview following the work
 * rather than the author steering the preview.
 */
describe('the section being played', () => {
  const TWO_KNOTS = `
-> first

=== first ===
The first knot.
-> END

=== second ===
The second knot.
-> END
`

  const compiled = (source: string): string =>
    new Compiler(source).Compile().ToJson() as string

  it('plays the story from the top when no section is given', () => {
    render(<StoryPlayer storyJson={compiled(TWO_KNOTS)} />)

    expect(screen.getByText('The first knot.')).toBeInTheDocument()
    expect(screen.queryByText('The second knot.')).not.toBeInTheDocument()
  })

  it('plays the section the cursor is in', () => {
    render(<StoryPlayer storyJson={compiled(TWO_KNOTS)} knot="second" />)

    expect(screen.getByText('The second knot.')).toBeInTheDocument()
    expect(screen.queryByText('The first knot.')).not.toBeInTheDocument()
  })

  it('offers the whole story, and goes back to the section', async () => {
    render(<StoryPlayer storyJson={compiled(TWO_KNOTS)} knot="second" />)

    await userEvent.click(screen.getByRole('button', { name: 'from the start' }))
    expect(screen.getByText('The first knot.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'play second' }))
    expect(screen.getByText('The second knot.')).toBeInTheDocument()
  })

  it('says which of the two it is playing', () => {
    render(<StoryPlayer storyJson={compiled(TWO_KNOTS)} knot="second" />)
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('says nothing when there is no section to choose between', () => {
    // Above the first knot of a file there is nothing to play but the story.
    render(<StoryPlayer storyJson={compiled(TWO_KNOTS)} />)
    expect(screen.queryByRole('button', { name: 'from the start' })).not.toBeInTheDocument()
  })

  it('falls back to the whole story when the compile has no such section', () => {
    // The open file may not be part of this compile at all.
    render(<StoryPlayer storyJson={compiled(TWO_KNOTS)} knot="nowhere" />)

    expect(screen.getByText(/Nothing called nowhere in this compile/)).toBeInTheDocument()
    expect(screen.getByText('The first knot.')).toBeInTheDocument()
  })

  /**
   * A knot is where an author changes the background, the cast or an animation,
   * so it is where the preview has to stop. Reading straight on through a plain
   * divert showed the *next* scene's staging while claiming to show this one —
   * which made moving an animation one knot down look like it had done nothing.
   *
   * Compiled the way the app compiles, counting every visit: a visit count is
   * the only thing that names the knot of the last line before a story runs out
   * of content, which is exactly the line that used to leak.
   */
  describe('stopping at the end of the knot', () => {
    const RUNS_ON = `
-> first

=== first ===
The first knot.
-> second

=== second ===
# anim: rain
The second knot.
-> END
`

    const counted = (source: string): string =>
      new Compiler(source, new CompilerOptions(null, [], true, null)).Compile().ToJson() as string

    it('does not read on into the next knot', () => {
      render(<StoryPlayer storyJson={counted(RUNS_ON)} knot="first" />)

      expect(screen.getByText('The first knot.')).toBeInTheDocument()
      expect(screen.queryByText(/The second knot\./)).not.toBeInTheDocument()
    })

    /** The tag belongs to the next scene, so it must not reach this stage. */
    it('leaves the staging of the next knot off the stage', () => {
      render(<StoryPlayer storyJson={counted(RUNS_ON)} knot="first" />)

      expect(screen.queryByText(/anim: rain/)).not.toBeInTheDocument()
    })

    it('offers to read on, and names where', async () => {
      render(<StoryPlayer storyJson={counted(RUNS_ON)} knot="first" />)

      await userEvent.click(screen.getByRole('button', { name: /Read on into second/ }))

      expect(screen.getByText(/The second knot\./)).toBeInTheDocument()
      // Twice over once it is read: in the transcript, and on the stage as a
      // tag naming nothing this test put in the catalogue.
      expect(screen.getAllByText(/anim: rain/).length).toBeGreaterThan(0)
    })

    /** A stitch is part of its knot, not somewhere else to stop. */
    it('reads through a stitch of the same knot', () => {
      render(
        <StoryPlayer
          storyJson={counted(`
=== first ===
The first knot.
-> first.inner
= inner
Still the first knot.
-> END
`)}
          knot="first"
        />
      )

      expect(screen.getByText('Still the first knot.')).toBeInTheDocument()
    })

    /** Playing from the start is not previewing a section, so nothing bounds it. */
    it('reads straight through when playing the whole story', async () => {
      render(<StoryPlayer storyJson={counted(RUNS_ON)} knot="first" />)

      await userEvent.click(screen.getByRole('button', { name: 'from the start' }))

      expect(screen.getByText(/The second knot\./)).toBeInTheDocument()
    })
  })

  it('plays a stitch, which is a section like any other', () => {
    const withStitch = `
-> first

=== first ===
The first knot.
-> END

=== second ===
= inner
The inner stitch.
-> END
`
    render(<StoryPlayer storyJson={compiled(withStitch)} knot="second.inner" />)
    expect(screen.getByText('The inner stitch.')).toBeInTheDocument()
  })
})

/**
 * The track a scene set.
 *
 * Silent until asked, on purpose: the preview restarts on every recompile and
 * every move between sections, and a pane that started playing each time would
 * be unusable to write beside. What it is for is telling you the right tag
 * fired and letting you check the file when you want to.
 */
describe('the music bar', () => {
  function withTrack(): MediaDocument {
    let doc = emptyMedia()
    const grove = newAsset('The grove', 'music')
    doc = addAsset(doc, grove)
    doc = addVariant(doc, grove.id, newVariant('loop', 'music/the_grove/loop.mp3'))
    return doc
  }

  const FILES = [
    { path: 'music/the_grove/loop.mp3', bytes: 1, url: 'app://media/p/media/music/the_grove/loop.mp3' }
  ]

  const story = (source: string): string => new Compiler(source).Compile().ToJson() as string

  const scene = (tag: string): React.JSX.Element => (
    <StoryPlayer
      storyJson={story(`Arriving.\n#${tag}\n-> END\n`)}
      media={withTrack()}
      mediaFiles={FILES}
    />
  )

  it('names the track a scene set', () => {
    render(scene('music:the_grove'))
    expect(screen.getByText(/The grove/)).toBeInTheDocument()
  })

  it('says nothing when no scene set one', () => {
    render(scene('speaker:Kael'))
    expect(screen.queryByRole('button', { name: 'play' })).not.toBeInTheDocument()
  })

  it('starts silent, and offers to play', () => {
    const { container } = render(scene('music:the_grove'))

    const audio = container.querySelector('audio')
    expect(audio).toHaveAttribute('src', 'app://media/p/media/music/the_grove/loop.mp3')
    // A bed rather than a cue: it holds until a tag stops it, and a track that
    // ran out would say the scene had ended when it had not.
    expect(audio).toHaveAttribute('loop')
    expect(audio!.autoplay).toBe(false)
    expect(screen.getByRole('button', { name: 'play' })).toBeInTheDocument()
  })

  it('says nothing to play when the file is not in the folder', () => {
    render(
      <StoryPlayer
        storyJson={story('Arriving.\n#music:the_grove\n-> END\n')}
        media={withTrack()}
        mediaFiles={[]}
      />
    )

    expect(screen.getByText(/is not in media\//)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'play' })).not.toBeInTheDocument()
  })

  it('goes quiet when a scene stops it', () => {
    render(scene('music:the_grove\n#music:stop'))
    expect(screen.queryByRole('button', { name: 'play' })).not.toBeInTheDocument()
  })
})
