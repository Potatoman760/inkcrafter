import type { Story } from 'inkjs/engine/Story'
import type { PathStep } from '@shared/manuscript'

/**
 * Finding a way to a knot.
 *
 * Asking "how does the reader ever get to this ending?" is a question an ink
 * file cannot answer by inspection — the route is spread across choices in other
 * files, and reading backwards through diverts is exactly the work this tool
 * exists to remove. So the story is searched instead.
 *
 * The search is breadth-first, which means the path found is the shortest one.
 * When several routes reach the same knot any of them will do, and the shortest
 * is the least arbitrary-looking answer as well as the quickest to find.
 */

/** Continues past a single stretch without a choice; mirrors the reader's own cap. */
const MAX_CONTINUES = 5_000
/** Junction expansions before giving up. Keeps a combinatorial story bounded. */
const MAX_EXPLORED = 4_000
const TIME_BUDGET_MS = 5_000

export interface TraceResult {
  found: boolean
  path: PathStep[]
  /** Junction expansions performed, for reporting a give-up honestly. */
  explored: number
  message: string | null
}

function runToJunction(story: Story): void {
  let steps = 0
  while (story.canContinue) {
    story.Continue()
    if (++steps > MAX_CONTINUES) return
  }
}

/**
 * Visit counts are the exact test for "has the story been here", including for a
 * knot that only diverts and never emits a line. It requires the story to have
 * been compiled with `countAllVisits`, since ink otherwise only counts the
 * containers whose read counts the script itself asks about.
 */
function hasVisited(story: Story, target: string): boolean {
  const count = story.state.VisitCountAtPathString(target)
  return typeof count === 'number' && count > 0
}

/**
 * Two states are treated as the same search node when the story stands in the
 * same place facing the same choices. This is what keeps a story with loops
 * finite. It can in principle merge two states that differ only in a variable,
 * so a route that depends on such a variable may be missed — the honest cost of
 * searching a story rather than a graph.
 */
function fingerprint(story: Story): string {
  const choices = story.currentChoices.map((choice) => choice.sourcePath).join(',')
  return `${story.state.currentPathString ?? ''}|${choices}`
}

/**
 * Searches for a sequence of choices reaching `target`.
 *
 * Leaves the story's state wherever the search ended; callers reset and replay.
 */
export function findPathToKnot(story: Story, target: string): TraceResult {
  const startedAt = Date.now()

  story.ResetState()
  runToJunction(story)

  if (hasVisited(story, target)) {
    return { found: true, path: [], explored: 0, message: null }
  }

  const queue: Array<{ state: string; path: PathStep[] }> = [
    { state: story.state.ToJson(), path: [] }
  ]
  const seen = new Set<string>([fingerprint(story)])
  let explored = 0

  while (queue.length > 0) {
    const node = queue.shift()!

    story.state.LoadJson(node.state)
    const options = story.currentChoices.map((choice) => ({
      index: choice.index,
      sourcePath: choice.sourcePath,
      text: choice.text
    }))

    for (const option of options) {
      if (explored >= MAX_EXPLORED || Date.now() - startedAt > TIME_BUDGET_MS) {
        return {
          found: false,
          path: [],
          explored,
          message: `Gave up after exploring ${explored} choices without reaching "${target}". It may be unreachable, or behind more branching than this search covers.`
        }
      }

      story.state.LoadJson(node.state)
      story.ChooseChoiceIndex(option.index)
      runToJunction(story)
      explored++

      const path = [
        ...node.path,
        { sourcePath: option.sourcePath, choiceIndex: option.index, choiceText: option.text }
      ]

      if (hasVisited(story, target)) {
        return { found: true, path, explored, message: null }
      }

      // A finished story has nowhere further to search from.
      if (story.currentChoices.length === 0) continue

      const key = fingerprint(story)
      if (seen.has(key)) continue
      seen.add(key)

      queue.push({ state: story.state.ToJson(), path })
    }
  }

  return {
    found: false,
    path: [],
    explored,
    message: `No path reaches "${target}". Nothing in the story diverts there from the beginning.`
  }
}
