import { useEffect, useMemo, useState } from 'react'
import {
  addCategory,
  addItem,
  addStat,
  addVariable,
  categoryProblem,
  inkName,
  itemsInCategory,
  moveCategory,
  moveItem,
  moveStat,
  moveVariable,
  nameProblem,
  newItem,
  newStat,
  newVariable,
  removeCategory,
  removeItem,
  removeStat,
  removeVariable,
  renameCategory,
  STAT_KINDS,
  updateItem,
  updateStat,
  updateVariable,
  type Item,
  type Stat,
  type StatKind,
  type StatsDocument,
  type Variable
} from '@shared/statsDoc'
import { initialLiteral, listName } from '@shared/statsInk'
import type { NameUse } from '@shared/types'
import { CustomFields } from './CustomFields'
import {
  Button,
  Field,
  GroupLabel,
  Hint,
  IconButton,
  Input,
  ListRow,
  MasterDetail,
  Meter,
  Select,
  Tabs,
  Textarea
} from '../design/components'
import { NameField } from './NameField'
import { Icon } from '../design/Icon'
import { copy } from '@shared/copy'

interface StatsPanelProps {
  doc: StatsDocument
  saving: boolean
  error: string | null
  /** Every line of ink mentioning an identifier, so a rename can warn. */
  findUses: (name: string) => Promise<NameUse[]>
  onChange: (next: StatsDocument) => void
  onOpenUse: (use: NameUse) => void
}

const KIND_LABELS: Record<StatKind, string> = {
  number: 'Number',
  boolean: 'Yes / no',
  text: 'Text'
}

/**
 * The catalogue: what visible stats, hidden vars and items this story has.
 *
 * Master/detail rather than the grid it started as. Four fields fitted in a row;
 * ten do not, and the presentation half — display name, blurb, icon, custom
 * pairs — is most of what the export exists to carry.
 *
 * Every change applies straight through; there is no draft and no Save button.
 * The document autosaves, and each save regenerates both `ink/state.ink` and the
 * export, so a half-entered stat sitting in a draft would be a stat the ink does
 * not have. The exception is a *name*, which is committed on blur — see
 * `NameField` — because a colliding name is a compile error, not a typo.
 */
export function StatsPanel({
  doc,
  saving,
  error,
  findUses,
  onChange,
  onOpenUse
}: StatsPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<'stats' | 'variables' | 'items'>('stats')
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [uses, setUses] = useState<NameUse[]>([])

  const selectedStat = doc.stats.find((stat) => stat.id === selectedId) ?? null
  const selectedVariable = doc.variables.find((variable) => variable.id === selectedId) ?? null
  const selectedItem = doc.items.find((item) => item.id === selectedId) ?? null
  const selectedName = selectedStat?.name ?? selectedVariable?.name ?? selectedItem?.name ?? null

  // Looked up when the selection changes rather than on every keystroke: it
  // reads every ink file in the project.
  useEffect(() => {
    if (!selectedName) {
      setUses([])
      return
    }

    let cancelled = false
    void findUses(selectedName).then((found) => {
      if (!cancelled) setUses(found)
    })

    return () => {
      cancelled = true
    }
  }, [selectedName, findUses])

  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (haystack: string): boolean =>
    terms.every((term) => haystack.toLowerCase().includes(term))

  const stats = useMemo(
    () => doc.stats.filter((stat) => matches(`${stat.name} ${stat.display} ${stat.description}`)),
    [doc.stats, filter]
  )

  const variables = useMemo(
    () => doc.variables.filter((variable) => matches(`${variable.name} ${variable.description}`)),
    [doc.variables, filter]
  )

  const items = useMemo(
    () =>
      doc.items.filter((item) =>
        matches(`${item.name} ${item.display} ${item.category} ${item.description}`)
      ),
    [doc.items, filter]
  )

  const newProblem = draftName.trim().length > 0 ? nameProblem(doc, draftName) : null

  const create = (): void => {
    if (draftName.trim().length === 0 || newProblem) return

    if (tab === 'stats') {
      const stat = newStat(draftName)
      onChange(addStat(doc, stat))
      setSelectedId(stat.id)
    } else if (tab === 'variables') {
      const variable = newVariable(draftName)
      onChange(addVariable(doc, variable))
      setSelectedId(variable.id)
    } else {
      const category = draftCategory.trim() || doc.categories[0] || 'Items'
      const item = newItem(draftName, category)
      onChange(addItem(doc, item))
      setSelectedId(item.id)
      setDraftCategory(category)
    }
    setDraftName('')
  }

  const switchTab = (next: 'stats' | 'variables' | 'items'): void => {
    setTab(next)
    setSelectedId(null)
  }

  return (
    <>
      <Tabs
        level="pane"
        label="Catalogue"
        value={tab}
        onChange={(next) => switchTab(next as 'stats' | 'variables' | 'items')}
        items={[
          { value: 'stats', label: 'Stats', count: doc.stats.length },
          { value: 'variables', label: 'Vars', count: doc.variables.length },
          { value: 'items', label: 'Items', count: doc.items.length }
        ]}
        trail={saving && <span className="saving-note">saving…</span>}
      />

      <MasterDetail
        masterWidth={280}
        masterClassName="stats-master"
        detailClassName="stats-detail"
        master={
          <>
          {/* Adding leads the column. It used to sit under the list, at the
              far end of a scroll, which is the last place anyone looks. */}
          <div className="panel-new">
            <Input
              value={draftName}
              aria-label={tab === 'stats' ? 'New stat name' : tab === 'variables' ? 'New var name' : 'New item name'}
              placeholder={tab === 'stats' ? 'New stat, e.g. Strength' : tab === 'variables' ? 'New var, e.g. Has met Wren' : 'New item, e.g. Brass key'}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
            />
            {tab === 'items' && (
              <Input className="stats-category-input"
                value={draftCategory}
                aria-label="New item category"
                placeholder="Category"
                list="stats-categories"
                onChange={(event) => setDraftCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create()
                }}
              />
            )}
            <Button variant="primary"
              onClick={create}
              disabled={draftName.trim().length === 0 || newProblem !== null}
            >
              <Icon name="plus" size={13} />
              Add
            </Button>
          </div>

          {/* The name becomes an ink identifier, so what it will become is
              shown before it is committed rather than applied silently. */}
          {draftName.trim().length > 0 && (
            <Hint tight tone={newProblem ? 'error' : 'default'} className="panel-new-preview">
              {newProblem ?? (
                <>
                  will be declared as <code>{inkName(draftName)}</code>
                </>
              )}
            </Hint>
          )}


          <Input className="codex-filter"
            value={filter}
            aria-label="Filter"
            placeholder="Filter…"
            onChange={(event) => setFilter(event.target.value)}
          />

          {tab === 'items' ? (
            <ItemMaster
              doc={doc}
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={onChange}
            />
          ) : (
            <StateMaster
              entries={tab === 'stats' ? stats : variables}
              empty={tab === 'stats' ? doc.stats.length === 0 : doc.variables.length === 0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={(id, by) =>
                onChange(tab === 'stats' ? moveStat(doc, id, by) : moveVariable(doc, id, by))
              }
            />
          )}

          <datalist id="stats-categories">
            {doc.categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          </>
        }
        detail={
          <>
          {selectedStat && (
            <StateDetail
              doc={doc}
              variable={selectedStat}
              visible
              uses={uses}
              onChange={onChange}
              onOpenUse={onOpenUse}
              onRemoved={() => setSelectedId(null)}
            />
          )}
          {selectedVariable && (
            <StateDetail
              doc={doc}
              variable={selectedVariable}
              visible={false}
              uses={uses}
              onChange={onChange}
              onOpenUse={onOpenUse}
              onRemoved={() => setSelectedId(null)}
            />
          )}
          {selectedItem && (
            <ItemDetail
              doc={doc}
              item={selectedItem}
              uses={uses}
              onChange={onChange}
              onOpenUse={onOpenUse}
              onRemoved={() => setSelectedId(null)}
            />
          )}
          {!selectedStat && !selectedVariable && !selectedItem && (
            <Hint>
              {tab === 'stats'
                ? 'Choose a stat, or add one. Stats are shown to the player on the character screen.'
                : tab === 'variables'
                  ? 'Choose a var, or add one. Vars hold hidden story state and are never listed to the player.'
                  : 'Choose an item, or add one. Each category becomes one ink LIST, and everything carried goes into the inventory variable.'}
            </Hint>
          )}
          </>
        }
      />

      {error && <p className="codex-error">{error}</p>}
    </>
  )
}

/* Master lists ------------------------------------------------------------- */

function MoveButtons({
  label,
  onMove
}: {
  label: string
  onMove: (by: number) => void
}): React.JSX.Element {
  return (
    <span className="stats-move">
      <IconButton icon="chevron-up" label={`Move ${label} up`} onClick={() => onMove(-1)} />
      <IconButton icon="chevron-down" label={`Move ${label} down`} onClick={() => onMove(1)} />
    </span>
  )
}

function StateMaster({
  entries,
  empty,
  selectedId,
  onSelect,
  onMove
}: {
  entries: (Stat | Variable)[]
  empty: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (id: string, by: number) => void
}): React.JSX.Element {
  if (empty) return <Hint>Nothing here yet.</Hint>
  if (entries.length === 0) return <Hint>Nothing matches that filter.</Hint>

  return (
    <ul className="stats-rows">
      {entries.map((variable) => (
        <li key={variable.id}>
          <ListRow
            className="stats-pick"
            mono
            name={variable.name}
            meta={'display' in variable && variable.display.length > 0 ? variable.display : undefined}
            selected={variable.id === selectedId}
            onClick={() => onSelect(variable.id)}
          />
          <MoveButtons label={variable.name} onMove={(by) => onMove(variable.id, by)} />
        </li>
      ))}
    </ul>
  )
}

function ItemMaster({
  doc,
  items,
  selectedId,
  onSelect,
  onChange
}: {
  doc: StatsDocument
  items: Item[]
  selectedId: string | null
  onSelect: (id: string) => void
  onChange: (next: StatsDocument) => void
}): React.JSX.Element {
  const [newCategory, setNewCategory] = useState('')

  if (doc.items.length === 0 && doc.categories.length === 0) {
    return <Hint>No items yet.</Hint>
  }

  const shown = new Set(items.map((item) => item.id))
  const categories = doc.categories.filter(
    (category) =>
      doc.items.some((item) => item.category === category && shown.has(item.id)) ||
      itemsInCategory(doc, category).length === 0
  )

  const problem = newCategory.trim().length > 0 ? categoryProblem(doc, newCategory) : null

  const create = (): void => {
    if (newCategory.trim().length === 0 || problem) return
    onChange(addCategory(doc, newCategory.trim()))
    setNewCategory('')
  }

  return (
    <>
      {categories.length === 0 && <Hint>Nothing matches that filter.</Hint>}

      {categories.map((category) => (
        <section className="stats-category" key={category}>
          {/* A label, not a heading — it names the ink LIST this category
              becomes, which is the thing an author goes looking for. */}
          <GroupLabel>
            <code>LIST {listName(category)}</code>
            <MoveButtons
              label={`the ${category} category`}
              onMove={(by) => onChange(moveCategory(doc, category, by))}
            />
          </GroupLabel>

          <CategoryName doc={doc} category={category} onChange={onChange} />

          <ul className="stats-rows">
            {items
              .filter((item) => item.category === category)
              .map((item) => (
                <li key={item.id}>
                  <ListRow
                    className="stats-pick"
                    name={<code>{item.name}</code>}
                    meta={item.display.length > 0 ? item.display : undefined}
                    selected={item.id === selectedId}
                    onClick={() => onSelect(item.id)}
                  />
                  <MoveButtons label={item.name} onMove={(by) => onChange(moveItem(doc, item.id, by))} />
                </li>
              ))}
          </ul>
        </section>
      ))}

      <div className="panel-new is-inline">
        <Input
          value={newCategory}
          aria-label="New category"
          placeholder="New category, e.g. Documents"
          onChange={(event) => setNewCategory(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') create()
          }}
        />
        <Button onClick={create} disabled={newCategory.trim().length === 0 || problem !== null}>
          <Icon name="plus" size={13} />
          Add category
        </Button>
      </div>
      {problem && <p className="codex-error">{problem}</p>}
    </>
  )
}

/** A category's own name, renameable in place. */
function CategoryName({
  doc,
  category,
  onChange
}: {
  doc: StatsDocument
  category: string
  onChange: (next: StatsDocument) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(category)
  useEffect(() => setDraft(category), [category])

  const problem = draft.trim() !== category ? categoryProblem(doc, draft, category) : null

  return (
    <div className="stats-category-name">
      <Input
        value={draft}
        aria-label={`Name of the ${category} category`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (problem || draft.trim() === category) setDraft(category)
          else onChange(renameCategory(doc, category, draft))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(category)
            event.currentTarget.blur()
          }
        }}
      />
      <Button
        variant="danger"
        size="sm"
        icon="trash-2"
        aria-label={`Remove the ${category} category`}
        onClick={() => {
          const count = itemsInCategory(doc, category).length
          if (window.confirm(`Remove ${category} and its ${count} item(s)?`)) {
            onChange(removeCategory(doc, category))
          }
        }}
      >
        Remove
      </Button>
      {problem && <p className="codex-error">{problem}</p>}
    </div>
  )
}

/* Detail panes ------------------------------------------------------------- */

function StateDetail({
  doc,
  variable,
  visible,
  uses,
  onChange,
  onOpenUse,
  onRemoved
}: {
  doc: StatsDocument
  variable: Stat | Variable
  visible: boolean
  uses: NameUse[]
  onChange: (next: StatsDocument) => void
  onOpenUse: (use: NameUse) => void
  onRemoved: () => void
}): React.JSX.Element {
  const set = (changes: Partial<Variable>): void =>
    onChange(
      visible
        ? updateStat(doc, variable.id, changes as Partial<Stat>)
        : updateVariable(doc, variable.id, changes)
    )

  return (
    <>
      <NameField
        value={variable.name}
        problem={(candidate) => nameProblem(doc, candidate, variable.id)}
        uses={uses}
        onCommit={(name) => set({ name })}
        onOpenUse={onOpenUse}
      />

      {visible && 'display' in variable && (
        <Field label="Display name" about={copy('stats.display')}>
          <Input
            value={variable.display}
            onChange={(event) =>
              onChange(updateStat(doc, variable.id, { display: event.target.value }))
            }
          />
        </Field>
      )}

      <div className="detail-row">
        <Field label="Kind">
          <Select
            aria-label={`Kind of ${variable.name}`}
            value={variable.kind}
            onChange={(event) => set({ kind: event.target.value as StatKind })}
          >
            {STAT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Starts at"
          note={<code>{`VAR ${variable.name} = ${initialLiteral(variable)}`}</code>}
        >
          {variable.kind === 'boolean' ? (
            <Select
              aria-label={`Starting value of ${variable.name}`}
              value={variable.initial === true ? 'true' : 'false'}
              onChange={(event) => set({ initial: event.target.value === 'true' })}
            >
              <option value="false">no</option>
              <option value="true">yes</option>
            </Select>
          ) : (
            <Input
              type={variable.kind === 'number' ? 'number' : 'text'}
              aria-label={`Starting value of ${variable.name}`}
              value={String(variable.initial)}
              onChange={(event) =>
                set({
                  initial: variable.kind === 'number' ? Number(event.target.value) : event.target.value
                })
              }
            />
          )}
        </Field>
      </div>

      {/* The document has carried min and max since the exporter needed them,
          and no screen has ever offered them — a range the author could not set
          is a range that is always empty. Numbers only: a flag has two states
          and a piece of text has no order to be inside of. */}
      {variable.kind === 'number' && (
        <Field
          as="div"
          label="Range"
          note={
            variable.min === null || variable.max === null
              ? 'unbounded — leave either empty and nothing clamps'
              : `clamped to ${variable.min}–${variable.max}`
          }
        >
          <div className="detail-row stat-range">
            <Input
              size="sm"
              type="number"
              aria-label={`Minimum of ${variable.name}`}
              placeholder="min"
              value={variable.min ?? ''}
              onChange={(event) =>
                set({ min: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
            {/* ic-field exception: the word between two inputs is a
                separator, not a hint under one, and Hint is a paragraph. */}
            <span className="ic-field__hint">to</span>
            <Input
              size="sm"
              type="number"
              aria-label={`Maximum of ${variable.name}`}
              placeholder="max"
              value={variable.max ?? ''}
              onChange={(event) =>
                set({ max: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
            {/* Only drawn when there is a range to be inside of. A bar with no
                ends is a shape pretending to be a measurement. */}
            {variable.min !== null && variable.max !== null && (
              <Meter
                className="stat-range-meter"
                value={typeof variable.initial === 'number' ? variable.initial : variable.min}
                min={variable.min}
                max={variable.max}
                title={`starts at ${String(variable.initial)}`}
              />
            )}
          </div>
        </Field>
      )}

      {visible && 'display' in variable ? (
        <Shared
          entry={variable}
          onChange={(changes) => onChange(updateStat(doc, variable.id, changes))}
        />
      ) : (
        <Field label="Note" about={copy('stats.note')}>
          <Input
            value={variable.description}
            onChange={(event) => set({ description: event.target.value })}
          />
        </Field>
      )}

      <div className="detail-row detail-row--danger">
        <Button
          variant="danger"
          icon="trash-2"
          aria-label={`Remove ${variable.name}`}
          onClick={() => {
            if (window.confirm(`Remove ${variable.name}? Any ink already using it will stop compiling.`)) {
              onChange(visible ? removeStat(doc, variable.id) : removeVariable(doc, variable.id))
              onRemoved()
            }
          }}
        >
          Remove this {visible ? 'stat' : 'var'}
        </Button>
      </div>
    </>
  )
}

function ItemDetail({
  doc,
  item,
  uses,
  onChange,
  onOpenUse,
  onRemoved
}: {
  doc: StatsDocument
  item: Item
  uses: NameUse[]
  onChange: (next: StatsDocument) => void
  onOpenUse: (use: NameUse) => void
  onRemoved: () => void
}): React.JSX.Element {
  const set = (changes: Partial<Item>): void => onChange(updateItem(doc, item.id, changes))

  return (
    <>
      <NameField
        value={item.name}
        problem={(candidate) => nameProblem(doc, candidate, item.id)}
        uses={uses}
        onCommit={(name) => set({ name })}
        onOpenUse={onOpenUse}
      />

      <Field label="Display name" about={copy('stats.display')}>
        <Input value={item.display} onChange={(event) => set({ display: event.target.value })} />
      </Field>

      <Field
        label="Category"
        note={
          <>
            declared in <code>LIST {listName(item.category)}</code>
          </>
        }
      >
        <Select
          aria-label={`Category of ${item.name}`}
          value={item.category}
          onChange={(event) => set({ category: event.target.value })}
        >
          {doc.categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>

      <Shared entry={item} onChange={set} />

      <div className="detail-row detail-row--danger">
        <Button
          variant="danger"
          icon="trash-2"
          aria-label={`Remove ${item.name}`}
          onClick={() => {
            if (window.confirm(`Remove ${item.name}? Any ink already using it will stop compiling.`)) {
              onChange(removeItem(doc, item.id))
              onRemoved()
            }
          }}
        >
          Remove this item
        </Button>
      </div>
    </>
  )
}

/** The fields a stat and an item have in common, laid out identically. */
function Shared({
  entry,
  onChange
}: {
  entry: Stat | Item
  onChange: (changes: Partial<Stat & Item>) => void
}): React.JSX.Element {
  return (
    <>
      <Field label="Blurb" about={copy('stats.item.display')}>
        <Textarea
          rows={2}
          value={entry.blurb}
          onChange={(event) => onChange({ blurb: event.target.value })}
        />
      </Field>

      <Field label="Icon" about={copy('stats.icon')}>
        <Input value={entry.icon} onChange={(event) => onChange({ icon: event.target.value })} />
      </Field>

      <Field label="Note" about={copy('stats.note')}>
        <Input
          value={entry.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>

      <CustomFields
        fields={entry.custom}
        owner={entry.name}
        onChange={(custom) => onChange({ custom })}
      />
    </>
  )
}
