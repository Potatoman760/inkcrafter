import { planContextForKnot } from '@shared/plan'
import { roleAtDepth, type PlanDocument } from '@shared/planDoc'

/** Keeps a long chapter summary from displacing the story it is meant to frame. */
const MAX_SUMMARY_CHARS = 600

function trim(text: string): string {
  const clean = text.trim().replace(/\s*\n\s*/g, ' ')
  return clean.length > MAX_SUMMARY_CHARS ? `${clean.slice(0, MAX_SUMMARY_CHARS)}…` : clean
}

/**
 * Where the section being drafted sits in the plan, or '' when it sits nowhere.
 *
 * Ancestry, the node itself, and the next sibling — not the whole plan. The rest
 * is noise at best, and at worst it tells the model how the story ends in the
 * same breath as asking it not to resolve anything.
 */
export function renderPlanContext(plan: PlanDocument, knot: string | null): string {
  const context = planContextForKnot(plan, knot)
  if (!context) return ''

  const lines = [
    'PLAN — where this section sits in the story.',
    `${context.ancestry.map((node) => node.title || 'untitled').join(' › ')} (${context.role})`
  ]

  const own = trim(context.node.summary)
  if (own.length > 0) lines.push(`This ${context.role}: ${own}`)

  // Ancestors give the larger shape the section is serving.
  for (const [depth, ancestor] of context.ancestry.slice(0, -1).entries()) {
    const summary = trim(ancestor.summary)
    if (summary.length > 0) {
      lines.push(`The ${roleAtDepth(depth)} "${ancestor.title}": ${summary}`)
    }
  }

  if (context.node.tags.length > 0) lines.push(`Tags: ${context.node.tags.join(', ')}`)

  if (context.next) {
    const summary = trim(context.next.summary)
    lines.push(
      `What follows: ${context.next.title}${summary.length > 0 ? ` — ${summary}` : ''}`
    )
    lines.push('Lead towards it without arriving there; the next section covers it.')
  }

  return lines.join('\n')
}
