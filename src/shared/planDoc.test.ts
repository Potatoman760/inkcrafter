import { describe, expect, it } from 'vitest'
import {
  duplicateKnots,
  emptyPlan,
  findPlanNode,
  flattenPlan,
  insertPlanNode,
  knotOf,
  migratePlanScenes,
  movePlanNode,
  parsePlan,
  planFromMarkdown,
  planToMarkdown,
  removePlanNode,
  serialisePlan,
  updatePlanNode,
  type PlanDocument
} from './planDoc'

const MARKDOWN = [
  'Notes about the story.',
  '',
  '# Act One',
  '',
  'The situation.',
  '',
  '## The door',
  'status: drafting',
  'tags: night, arrival',
  '',
  'She arrives after hours.',
  '',
  '## Inside',
  '',
  '# Act Two',
  '',
  '## The ledger',
  ''
].join('\n')

const plan = (): PlanDocument => planFromMarkdown(MARKDOWN)

describe('planFromMarkdown', () => {
  it('reads heading level as hierarchy', () => {
    const imported = plan()
    expect(imported.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two'])
    expect(imported.nodes[0]!.children.map((node) => node.title)).toEqual(['The door', 'Inside'])
  })

  it('takes the text beneath a heading as its summary', () => {
    expect(plan().nodes[0]!.children[0]!.summary).toBe('She arrives after hours.')
  })

  it('leaves imported Chapters ready for the app to assign a folder', () => {
    expect(plan().nodes[0]!.children[0]!.folder).toBeNull()
  })

  it('keeps what precedes the first heading as notes', () => {
    expect(plan().notes).toBe('Notes about the story.')
  })

  it('reads status and tags', () => {
    const door = plan().nodes[0]!.children[0]!
    expect(door.status).toBe('drafting')
    expect(door.tags).toEqual(['night', 'arrival'])
  })

  it('gives every node an id of its own', () => {
    const ids = flattenPlan(plan()).map((node) => node.id)
    expect(ids.every((id) => /^pln_[0-9a-z]{10}$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('imports nothing from nothing', () => {
    expect(planFromMarkdown('').nodes).toEqual([])
  })
})

describe('knots', () => {
  it('derives from the title', () => {
    expect(knotOf(plan().nodes[0]!.children[0]!)).toBe('the_door')
  })

  it('uses an override when one is set', () => {
    const before = plan()
    const overridden = updatePlanNode(before, before.nodes[0]!.id, { knot: 'prologue' })
    expect(knotOf(overridden.nodes[0]!)).toBe('prologue')
  })

  it('reports names claimed twice, which would collide when generated', () => {
    const clashing = planFromMarkdown('# Act\n\n## Chapter\n\n### Escape\n\n### Escape!\n')
    expect(duplicateKnots(clashing)).toEqual(['escape'])
    expect(duplicateKnots(plan())).toEqual([])
  })
})

describe('Scene migration', () => {
  it('turns a chapter attachment into one child Scene without changing the path', () => {
    const before = planFromMarkdown('# Act\n\n## Arrival\n\nThe chapter overview.\n')
    before.nodes[0]!.children[0]!.files = ['ink/chapter1.ink']

    const after = migratePlanScenes(before)
    const chapter = after.nodes[0]!.children[0]!

    expect(chapter.files).toEqual([])
    expect(chapter.children).toHaveLength(1)
    expect(chapter.children[0]).toMatchObject({
      title: 'Arrival',
      summary: 'The chapter overview.',
      files: ['ink/chapter1.ink']
    })
  })

  it('gives an existing fileless Scene its chapter’s old file', () => {
    const before = planFromMarkdown('# Act\n\n## Arrival\n\n### At the gate\n')
    before.nodes[0]!.children[0]!.files = ['ink/chapter1.ink']

    const after = migratePlanScenes(before)
    expect(after.nodes[0]!.children[0]!.children[0]!.files).toEqual(['ink/chapter1.ink'])
  })

  it('moves an old act attachment into global Ink', () => {
    const before = planFromMarkdown('# Act\n\n## Arrival\n')
    before.nodes[0]!.files = ['ink/shared.ink']

    const after = migratePlanScenes(before)
    expect(after.nodes[0]!.files).toEqual([])
    expect(after.globals).toContain('ink/shared.ink')
  })
})

describe('tree operations', () => {
  it('updates one node and leaves its children alone', () => {
    const before = plan()
    const act = before.nodes[0]!
    const after = updatePlanNode(before, act.id, { summary: 'Rewritten.' })

    expect(after.nodes[0]!.summary).toBe('Rewritten.')
    expect(after.nodes[0]!.children).toEqual(act.children)
  })

  it('leaves siblings identical', () => {
    const before = plan()
    const after = updatePlanNode(before, before.nodes[0]!.id, { status: 'done' })
    expect(after.nodes[1]).toEqual(before.nodes[1])
  })

  it('keeps a node’s id through a rename', () => {
    const before = plan()
    const door = before.nodes[0]!.children[0]!
    const after = updatePlanNode(before, door.id, { title: 'The gate' })

    expect(after.nodes[0]!.children[0]!.id).toBe(door.id)
    expect(knotOf(after.nodes[0]!.children[0]!)).toBe('the_gate')
  })

  it('inserts under the given parent, at the end by default', () => {
    const before = plan()
    const { plan: after, node } = insertPlanNode(before, before.nodes[0]!.id, 'The grate')

    expect(after.nodes[0]!.children.map((child) => child.title)).toEqual([
      'The door',
      'Inside',
      'The grate'
    ])
    expect(findPlanNode(after, node.id)?.title).toBe('The grate')
  })

  it('inserts after a named sibling', () => {
    const before = plan()
    const { plan: after } = insertPlanNode(
      before,
      before.nodes[0]!.id,
      'The grate',
      before.nodes[0]!.children[0]!.id
    )
    expect(after.nodes[0]!.children.map((child) => child.title)).toEqual([
      'The door',
      'The grate',
      'Inside'
    ])
  })

  it('inserts at the top level when there is no parent', () => {
    const { plan: after } = insertPlanNode(plan(), null, 'Act Three')
    expect(after.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two', 'Act Three'])
  })

  it('removes a node and its descendants, and nothing else', () => {
    const before = plan()
    const after = removePlanNode(before, before.nodes[0]!.children[0]!.id)

    expect(after.nodes[0]!.children.map((child) => child.title)).toEqual(['Inside'])
    expect(after.nodes[1]).toEqual(before.nodes[1])
  })

  it('moves a node to another parent, keeping its id and its children', () => {
    const before = plan()
    const door = before.nodes[0]!.children[0]!
    const after = movePlanNode(before, door.id, before.nodes[1]!.id)

    expect(after.nodes[0]!.children.map((child) => child.title)).toEqual(['Inside'])
    expect(after.nodes[1]!.children.map((child) => child.title)).toEqual(['The ledger', 'The door'])
    expect(after.nodes[1]!.children[1]!.id).toBe(door.id)
  })

  it('moves a node to the beginning of its siblings', () => {
    const before = plan()
    const inside = before.nodes[0]!.children[1]!
    const after = movePlanNode(before, inside.id, before.nodes[0]!.id, null)

    expect(after.nodes[0]!.children.map((child) => child.title)).toEqual(['Inside', 'The door'])
    expect(after.nodes[0]!.children[0]!.id).toBe(inside.id)
  })

  it('refuses to move a node inside itself, which would detach the branch', () => {
    const before = plan()
    const act = before.nodes[0]!
    const child = act.children[0]!

    expect(movePlanNode(before, act.id, child.id)).toEqual(before)
  })
})

describe('the file', () => {
  it('round-trips through JSON unchanged', () => {
    const before = plan()
    expect(parsePlan(serialisePlan(before))).toEqual(before)
  })

  it('is idempotent', () => {
    const once = serialisePlan(plan())
    expect(serialisePlan(parsePlan(once))).toBe(once)
  })

  it('survives a summary containing anything at all', () => {
    const before = plan()
    const tricky = updatePlanNode(before, before.nodes[0]!.id, {
      summary: 'Note: a colon.\n\n```\n# not a heading\n```\n\nstatus: not a field'
    })
    const reparsed = parsePlan(serialisePlan(tricky))

    expect(reparsed.nodes[0]!.summary).toBe(tricky.nodes[0]!.summary)
    // The thing markdown could not do: a summary that looks like a field is
    // just a summary.
    expect(reparsed.nodes[0]!.status).toBe(tricky.nodes[0]!.status)
  })

  it('yields an empty plan from nonsense rather than throwing', () => {
    expect(parsePlan('not json at all')).toEqual(emptyPlan())
    expect(parsePlan('null')).toEqual(emptyPlan())
    expect(parsePlan('[]')).toEqual(emptyPlan())
  })

  it('tolerates a hand-edited file with pieces missing', () => {
    const sparse = parsePlan('{"nodes":[{"title":"Only a title"}]}')
    expect(sparse.nodes[0]!.title).toBe('Only a title')
    expect(sparse.nodes[0]!.summary).toBe('')
    expect(sparse.nodes[0]!.tags).toEqual([])
    expect(sparse.nodes[0]!.folder).toBeNull()
    // A node without an id is given one, so the file stays usable.
    expect(sparse.nodes[0]!.id).toMatch(/^pln_/)
  })

  it('discards a status it does not recognise', () => {
    expect(parsePlan('{"nodes":[{"title":"x","status":"maybe"}]}').nodes[0]!.status).toBeNull()
  })
})

describe('planToMarkdown', () => {
  it('exports a plan that imports back to the same shape', () => {
    const before = plan()
    const after = planFromMarkdown(planToMarkdown(before))

    expect(after.nodes.map((node) => node.title)).toEqual(['Act One', 'Act Two'])
    expect(after.nodes[0]!.children.map((node) => node.title)).toEqual(['The door', 'Inside'])
    expect(after.nodes[0]!.children[0]!.status).toBe('drafting')
    expect(after.notes).toBe('Notes about the story.')
  })

  it('nests by depth rather than any stored level', () => {
    const markdown = planToMarkdown(plan())
    expect(markdown).toContain('# Act One')
    expect(markdown).toContain('## The door')
  })
})
