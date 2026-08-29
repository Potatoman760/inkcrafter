import {
  COMPARISONS,
  describe,
  type Cmp,
  type Condition,
  type ConditionLabels,
  type Term
} from '@shared/bundle/condition'
import type { Npc, NpcDocument, NpcVarKind } from '@shared/bundle/npcDoc'
import type { StatsDocument } from '@shared/statsDoc'
import { Icon } from '../design/Icon'
import { Button, Field, Input, Select } from '../design/components'

interface ConditionEditorProps {
  condition: Condition | null
  knots: string[]
  stats: StatsDocument
  npcs: NpcDocument
  labels: ConditionLabels
  onChange: (next: Condition | null) => void
}

/**
 * Building a gate without writing one.
 *
 * The controls only ever offer things that exist — a knot from the story, a
 * stat from the catalogue, one of a person's declared attributes — so a gate
 * built here cannot reference something that is not there. That is the whole
 * reason for the screen: the failure it prevents is a door that never opens
 * because it is waiting on a variable nobody ever declared.
 *
 * A flat list of clauses joined by all-or-any, rather than an arbitrary tree.
 * Nesting is expressible in the format and is deliberately not offered here:
 * "these three things, all of them" covers what a map gate is actually for, and
 * a tree editor for the rest would be a worse way to write what ink writes
 * better.
 */
export function ConditionEditor({
  condition,
  knots,
  stats,
  npcs,
  labels,
  onChange
}: ConditionEditorProps): React.JSX.Element {
  const join = condition?.op === 'any' ? 'any' : 'all'
  const clauses = flatten(condition)

  const replace = (next: Condition[]): void => {
    if (next.length === 0) onChange(null)
    else if (next.length === 1) onChange(next[0]!)
    else onChange({ op: join, of: next })
  }

  const patch = (index: number, changes: Partial<Extract<Condition, { op: 'compare' }>>): void =>
    replace(clauses.map((one, at) => (at === index ? { ...one, ...changes } : one)))

  const add = (): void =>
    replace([
      ...clauses,
      {
        op: 'compare',
        left: { source: 'visits', path: knots[0] ?? '' },
        cmp: '>',
        right: 0
      }
    ])

  return (
    <Field as="div" label="Open when" note={describe(condition, labels)}>

      {clauses.length > 1 && (
        <label className="condition-join">
          <Select
            value={join}
            onChange={(event) =>
              onChange({ op: event.target.value as 'all' | 'any', of: clauses })
            }
          >
            <option value="all">all of these</option>
            <option value="any">any of these</option>
          </Select>
        </label>
      )}

      {clauses.map((clause, index) => (
        <div className="condition-clause" key={index}>
          <Select
            value={sourceKey(clause.left)}
            onChange={(event) =>
              patch(index, { left: termFor(event.target.value, { knots, stats, npcs }) })
            }
          >
            <option value="visits">has been to…</option>
            <option value="stat">a variable…</option>
            <option value="npcStat">someone's number…</option>
            <option value="npcStatus">someone's status…</option>
            <option value="npcFlag">someone's yes/no…</option>
          </Select>

          <TermFields
            term={clause.left}
            knots={knots}
            stats={stats}
            npcs={npcs}
            onChange={(left) => patch(index, { left })}
          />

          <Select
            value={clause.cmp}
            onChange={(event) => patch(index, { cmp: event.target.value as Cmp })}
          >
            {COMPARISONS.map((cmp) => (
              <option key={cmp} value={cmp}>
                {cmp}
              </option>
            ))}
          </Select>

          <RightHand
            term={clause.left}
            value={clause.right}
            npcs={npcs}
            onChange={(right) => patch(index, { right })}
          />

          <Button onClick={() => replace(clauses.filter((_, at) => at !== index))}>Remove</Button>
        </div>
      ))}

      <Button onClick={add} disabled={knots.length === 0}>
        <Icon name="plus" size={13} />
        Add a requirement
      </Button>
    </Field>
  )
}

interface Sources {
  knots: string[]
  stats: StatsDocument
  npcs: NpcDocument
}

function TermFields({
  term,
  knots,
  stats,
  npcs,
  onChange
}: Sources & { term: Term; onChange: (next: Term) => void }): React.JSX.Element | null {
  if (term.source === 'visits') {
    return (
      <Select value={term.path} onChange={(event) => onChange({ ...term, path: event.target.value })}>
        {/* A knot that has since been renamed is kept as an option, so picking
            another is a choice rather than a silent repointing. */}
        {(knots.includes(term.path) ? knots : [term.path, ...knots]).map((knot) => (
          <option key={knot} value={knot}>
            {knot}
          </option>
        ))}
      </Select>
    )
  }

  if (term.source === 'stat') {
    return (
      <Select value={term.key} onChange={(event) => onChange({ ...term, key: event.target.value })}>
        <optgroup label="Stats">
          {stats.stats.map((stat) => (
            <option key={stat.name} value={stat.name}>
              {stat.display || stat.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Vars">
          {stats.variables.map((variable) => (
            <option key={variable.name} value={variable.name}>
              {variable.name}
            </option>
          ))}
        </optgroup>
      </Select>
    )
  }

  const npc = npcs.npcs.find((one) => one.inkId === term.npc) ?? npcs.npcs[0]
  // The three sources are still three, because a gate compares against a
  // number, a word or a yes/no and each reads differently. What used to be
  // three lists on the NPC is one now, so the kind is what picks them out.
  const wanted: NpcVarKind =
    term.source === 'npcStat' ? 'number' : term.source === 'npcStatus' ? 'text' : 'boolean'
  const attrs = (npc?.variables ?? []).filter((one) => one.kind === wanted)

  return (
    <>
      <Select
        value={term.npc}
        onChange={(event) => onChange({ ...term, npc: event.target.value, key: '' })}
      >
        {npcs.npcs.map((one) => (
          <option key={one.inkId} value={one.inkId}>
            {one.name}
          </option>
        ))}
      </Select>
      <Select value={term.key} onChange={(event) => onChange({ ...term, key: event.target.value })}>
        {attrs.map((attr) => (
          <option key={attr.key} value={attr.key}>
            {attr.label}
          </option>
        ))}
      </Select>
    </>
  )
}

function RightHand({
  term,
  value,
  npcs,
  onChange
}: {
  term: Term
  value: number | string | boolean
  npcs: NpcDocument
  onChange: (next: number | string | boolean) => void
}): React.JSX.Element {
  if (term.source === 'npcFlag') {
    return (
      <Select value={String(value === true)} onChange={(event) => onChange(event.target.value === 'true')}>
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    )
  }

  // A status can only ever be one of its declared words, so offering anything
  // else would be offering a gate that can never open.
  if (term.source === 'npcStatus') {
    const npc = npcs.npcs.find((one) => one.inkId === term.npc)
    const values =
      npc?.variables.find((one) => one.key === term.key && one.kind === 'text')?.values ?? []

    return (
      <Select value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {(values.includes(String(value)) ? values : [String(value), ...values]).map((one) => (
          <option key={one} value={one}>
            {one}
          </option>
        ))}
      </Select>
    )
  }

  return (
    <Input
      type="number"
      value={typeof value === 'number' ? value : 0}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}

/** The clauses of a gate as a flat list, whatever shape it was stored in. */
/** The first variable of one kind, for a source that has just been chosen. */
function firstOfKind(npc: Npc | undefined, kind: NpcVarKind): string {
  return npc?.variables.find((one) => one.kind === kind)?.key ?? ''
}

function flatten(condition: Condition | null): Extract<Condition, { op: 'compare' }>[] {
  if (condition === null) return []
  if (condition.op === 'compare') return [condition]
  if (condition.op === 'not') return flatten(condition.of)
  return condition.of.flatMap(flatten)
}

function sourceKey(term: Term): string {
  return term.source
}

function termFor(source: string, { knots, stats, npcs }: Sources): Term {
  const npc = npcs.npcs[0]

  switch (source) {
    case 'stat':
      return { source: 'stat', key: stats.stats[0]?.name ?? stats.variables[0]?.name ?? '' }
    case 'npcStat':
      return { source: 'npcStat', npc: npc?.inkId ?? '', key: firstOfKind(npc, 'number') }
    case 'npcStatus':
      return { source: 'npcStatus', npc: npc?.inkId ?? '', key: firstOfKind(npc, 'text') }
    case 'npcFlag':
      return { source: 'npcFlag', npc: npc?.inkId ?? '', key: firstOfKind(npc, 'boolean') }
    default:
      return { source: 'visits', path: knots[0] ?? '' }
  }
}
