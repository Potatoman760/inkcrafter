import { describe, expect, it } from 'vitest'
import { emptyPlan, planFromMarkdown, type PlanDocument } from './planDoc'
import { knotsIn, planKnotGroups } from './plan'
import type { KnotSource } from './inkKnots'

/**
 * The knots the story declares, arranged the way the plan arranges the story.
 *
 * `KnotChecklist.test.tsx` covers what an author does with these; this covers
 * the two rules that are invisible from there — what gets dropped, and what
 * happens to a plan that never grew Scenes.
 */

const PLAN = planFromMarkdown(
  ['# Act One', '', '## Arrival', '', '### At the gate', '', '### The hall', ''].join('\n')
)

/**
 * Knots whose declaring file nobody owns, so only the name can place them.
 *
 * The fallback path: a plan imported from markdown has no Scene files yet, so
 * an act or chapter owns its knot by title alone.
 */
const byName = (knots: string[]): KnotSource[] =>
  knots.map((knot) => ({ knot, file: `unowned/${knot}.ink` }))

/** A Scene, and the file it owns, which is what really places its knots. */
function withFiles(plan: PlanDocument, files: Record<string, string>): PlanDocument {
  return {
    ...plan,
    nodes: plan.nodes.map((act) => ({
      ...act,
      children: act.children.map((chapter) => ({
        ...chapter,
        children: chapter.children.map((scene) => ({
          ...scene,
          files: files[scene.title] ? [files[scene.title]!] : []
        }))
      }))
    }))
  }
}

describe('planKnotGroups', () => {
  it('files each Scene knot under its chapter, under its act', () => {
    const [act] = planKnotGroups(PLAN, byName(['at_the_gate', 'the_hall']))

    expect(act!.title).toBe('Act One')
    expect(act!.groups.map((one) => one.title)).toEqual(['Arrival'])
    expect(act!.groups[0]!.knots).toEqual(['at_the_gate', 'the_hall'])
  })

  it('keeps the plan order rather than the order the knots arrived in', () => {
    const [act] = planKnotGroups(PLAN, byName(['the_hall', 'at_the_gate']))
    expect(act!.groups[0]!.knots).toEqual(['at_the_gate', 'the_hall'])
  })

  /** A heading with nothing under it can only be read as broken. */
  it('drops a chapter and an act with no knots at all', () => {
    const plan = planFromMarkdown(
      ['# Act One', '', '## Arrival', '', '### At the gate', '', '# Act Two', '', '## Later', ''].join(
        '\n'
      )
    )

    const groups = planKnotGroups(plan, byName(['at_the_gate']))
    expect(groups.map((one) => one.title)).toEqual(['Act One'])
    expect(groups[0]!.groups.map((one) => one.title)).toEqual(['Arrival'])
  })

  /** What a plan pasted in from markdown looks like before Scenes exist. */
  it('lets an act own a knot by its own title', () => {
    const plan = planFromMarkdown('# Prologue\n')
    const [act] = planKnotGroups(plan, byName(['prologue']))

    expect(act!.knots).toEqual(['prologue'])
    expect(act!.groups).toEqual([])
  })

  it('puts everything the plan does not account for in one group at the end', () => {
    const groups = planKnotGroups(PLAN, byName(['at_the_gate', 'hand_written', 'overworld_hub']))
    const last = groups[groups.length - 1]!

    expect(last.title).toBe('Not in the plan')
    expect(last.id).toBe('')
    expect(last.knots).toEqual(['hand_written', 'overworld_hub'])
  })

  it('adds no such group when the plan accounts for everything', () => {
    expect(planKnotGroups(PLAN, byName(['at_the_gate'])).map((one) => one.title)).toEqual(['Act One'])
  })

  it('leaves every knot in one group when nothing is planned', () => {
    const [only] = planKnotGroups(emptyPlan(), byName(['a', 'b']))

    expect(only!.title).toBe('Not in the plan')
    expect(only!.knots).toEqual(['a', 'b'])
  })

  /** A stitch belongs to whatever its knot belongs to; it is never placed. */
  it('files a stitch with the knot that declares it', () => {
    const [act] = planKnotGroups(PLAN, byName(['at_the_gate', 'at_the_gate.inside', 'the_hall']))

    expect(act!.groups[0]!.knots).toEqual(['at_the_gate', 'at_the_gate.inside', 'the_hall'])
  })

  /** `at_the_gatehouse` starts with the same letters and is a different knot. */
  it('does not mistake a longer name for a stitch of a shorter one', () => {
    const groups = planKnotGroups(PLAN, byName(['at_the_gate', 'at_the_gatehouse']))

    expect(groups[0]!.groups[0]!.knots).toEqual(['at_the_gate'])
    expect(groups[groups.length - 1]!.knots).toEqual(['at_the_gatehouse'])
  })

  it('gathers everything a group holds, however deep', () => {
    const [act] = planKnotGroups(PLAN, byName(['at_the_gate', 'the_hall']))
    expect(knotsIn(act!)).toEqual(['at_the_gate', 'the_hall'])
  })

  /**
   * The file is what places a knot, not the name.
   *
   * A Scene owns one ink file, and what that file declares is that Scene's
   * whatever it is called — which is the usual case, not the exception: a Scene
   * titled "Forest encounter" is written into `forest-encounter.ink` and that
   * file declares `chapter1_forest` and four more. Placing by title-derived
   * knot instead reported every one of them as unplanned.
   */
  describe('by the file a knot was declared in', () => {
    const PLANNED = withFiles(PLAN, {
      'At the gate': 'chapter1/at-the-gate.ink',
      'The hall': 'chapter1/the-hall.ink'
    })

    it('gives a Scene every knot its file declares, however they are named', () => {
      const [act] = planKnotGroups(PLANNED, [
        { knot: 'chapter1_forest', file: 'chapter1/at-the-gate.ink' },
        { knot: 'chapter1_forest_sex', file: 'chapter1/at-the-gate.ink' },
        { knot: 'chapter1_forest_decision', file: 'chapter1/at-the-gate.ink' }
      ])

      expect(act!.groups[0]!.knots).toEqual([
        'chapter1_forest',
        'chapter1_forest_sex',
        'chapter1_forest_decision'
      ])
    })

    it('keeps two Scenes in one chapter apart by their files', () => {
      const [act] = planKnotGroups(PLANNED, [
        { knot: 'chapter0', file: 'chapter1/at-the-gate.ink' },
        { knot: 'chapter1', file: 'chapter1/the-hall.ink' }
      ])

      // One chapter, both Scenes' knots, in the plan's order.
      expect(act!.groups[0]!.knots).toEqual(['chapter0', 'chapter1'])
    })

    it('still calls a knot unplanned when no Scene owns its file', () => {
      const groups = planKnotGroups(PLANNED, [
        { knot: 'chapter1_forest', file: 'chapter1/at-the-gate.ink' },
        { knot: 'overworld_hub', file: 'ink/overworld.ink' }
      ])

      expect(groups[groups.length - 1]!.title).toBe('Not in the plan')
      expect(groups[groups.length - 1]!.knots).toEqual(['overworld_hub'])
    })

    /** A Scene with a file is placed by it, never by a name that happens to fit. */
    it('does not place a knot on a Scene whose file says otherwise', () => {
      const groups = planKnotGroups(PLANNED, [
        { knot: 'at_the_gate', file: 'somewhere/else.ink' }
      ])

      expect(groups[0]!.title).toBe('Not in the plan')
    })
  })
})
