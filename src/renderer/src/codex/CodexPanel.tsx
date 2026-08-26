import { useEffect, useMemo, useState } from 'react'
import { CodexEntrySummary } from './CodexEntrySummary'
import {
  CODEX_TYPES,
  CODEX_TYPE_LABELS,
  entryFolder,
  type CodexEntry,
  type CodexType
} from '@shared/codex'
import type { CodexLibrary, NameConflict } from '@shared/project'
import { Icon } from '../design/Icon'
import {
  Badge,
  Button,
  GroupLabel,
  Hint,
  Input,
  ListRow,
  PaneHeader,
  Select
} from '../design/components'

interface CodexPanelProps {
  entries: CodexEntry[]
  /** Only the libraries this project links — the ones a new entry can go into. */
  linkedLibraries: CodexLibrary[]
  conflicts: NameConflict[]
  mentionCounts: Record<string, number>
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
  /** Double-click, or the edit affordance: opens the entry for editing. */
  onEdit: (id: string) => void
  onCreate: (name: string, type: CodexType, libraryId: string) => void
  onOpenSettings: () => void
}

export function CodexPanel({
  entries,
  linkedLibraries,
  conflicts,
  mentionCounts,
  selectedId,
  loading,
  error,
  onSelect,
  onEdit,
  onCreate,
  onOpenSettings
}: CodexPanelProps): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CodexType>('character')
  const [targetLibrary, setTargetLibrary] = useState('')

  // Keep the target valid as the project's linked libraries change.
  useEffect(() => {
    if (linkedLibraries.length === 0) {
      setTargetLibrary('')
    } else if (!linkedLibraries.some((library) => library.id === targetLibrary)) {
      setTargetLibrary(linkedLibraries[0]!.id)
    }
  }, [linkedLibraries, targetLibrary])

  const libraryTitles = useMemo(
    () => Object.fromEntries(linkedLibraries.map((library) => [library.id, library.title])),
    [linkedLibraries]
  )

  const conflicted = useMemo(
    () => new Set(conflicts.flatMap((conflict) => conflict.entryIds)),
    [conflicts]
  )

  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matches = entries.filter((entry) => {
      if (needle.length === 0) return true
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        entry.file.toLowerCase().includes(needle)
      )
    })

    return CODEX_TYPES.map((type) => ({
      type,
      entries: matches.filter((entry) => entry.type === type)
    })).filter((group) => group.entries.length > 0)
  }, [entries, filter])

  const submit = (): void => {
    const name = newName.trim()
    if (name.length === 0 || targetLibrary.length === 0) return
    onCreate(name, newType, targetLibrary)
    setNewName('')
  }

  if (linkedLibraries.length === 0) {
    return (
      <>
        <PaneHeader className="pane-header" title="Codex" />
        <p className="codex-unavailable">
          This project links no codex libraries yet. A library is a collection of characters,
          locations and lore that any number of projects can share.
        </p>
        <p className="codex-unavailable">
          <Button variant="link" onClick={onOpenSettings}>
            Open project settings
          </Button>{' '}
          to link or create one.
        </p>
      </>
    )
  }

  return (
    <>
      <PaneHeader
        className="pane-header"
        title="Codex"
        actions={
          <Button variant="link" icon="book-open" onClick={onOpenSettings}>
            libraries
          </Button>
        }
      />

      <div className="codex-new">
        <Input
          value={newName}
          placeholder="New entry…"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
        <Select value={newType} onChange={(event) => setNewType(event.target.value as CodexType)}>
          {CODEX_TYPES.map((type) => (
            <option key={type} value={type}>
              {CODEX_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Button onClick={submit} disabled={newName.trim().length === 0}>
          <Icon name="plus" size={13} />
          Add
        </Button>
        {linkedLibraries.length > 1 && (
          <Select className="codex-new-library"
            value={targetLibrary}
            onChange={(event) => setTargetLibrary(event.target.value)}
          >
            {linkedLibraries.map((library) => (
              <option key={library.id} value={library.id}>
                into {library.title}
              </option>
            ))}
          </Select>
        )}
      </div>

      {entries.length > 0 && (
        <Input className="codex-filter"
          value={filter}
          placeholder="Filter…"
          onChange={(event) => setFilter(event.target.value)}
        />
      )}

      {error && <p className="codex-error">{error}</p>}

      {conflicts.length > 0 && (
        <p className="codex-warning">
          {conflicts.length === 1 ? 'One name is' : `${conflicts.length} names are`} claimed by more
          than one entry ({conflicts.map((conflict) => conflict.term).join(', ')}). Detection cannot
          tell them apart — rename one, or stop tracking it.
        </p>
      )}

      <div className="codex-list">
        {loading && <Hint>Loading…</Hint>}

        {!loading && entries.length === 0 && (
          <Hint>
            No entries yet. Add characters, locations and lore here and they will be underlined
            wherever they appear in your story.
          </Hint>
        )}

        {grouped.map((group) => (
          <section key={group.type} className="codex-group">
            <GroupLabel>{CODEX_TYPE_LABELS[group.type]}</GroupLabel>
            {group.entries.map((entry) => {
              const count = mentionCounts[entry.id] ?? 0
              const folder = entryFolder(entry.file)
              const library = libraryTitles[entry.libraryId]
              const selected = entry.id === selectedId

              return (
                <div key={entry.id}>
                  <ListRow
                    name={
                      <>
                        {entry.name}
                        {conflicted.has(entry.id) && (
                          <span
                            className="codex-item-warn"
                            title="This name is claimed by another entry"
                          >
                            !
                          </span>
                        )}
                      </>
                    }
                    meta={folder}
                    selected={selected}
                    trail={
                      <Badge
                        variant={count === 0 ? 'zero' : 'default'}
                        title={`${count} mention${count === 1 ? '' : 's'} in this file`}
                      >
                        {count}
                      </Badge>
                    }
                    onClick={() => onSelect(entry.id)}
                    onDoubleClick={() => onEdit(entry.id)}
                    title={`${library ?? entry.libraryId} · ${entry.file}.md — double-click to edit`}
                  />

                  {/* The selected entry reads here rather than in a tab of its
                      own on the right. The codex already owns this column, and
                      a second home was what left the dock no room for the one
                      thing that belongs in every view. */}
                  {selected && (
                    <div className="codex-item-summary">
                      <CodexEntrySummary
                        entry={entry}
                        libraryTitle={library ?? entry.libraryId}
                        mentionCount={count}
                        onEdit={() => onEdit(entry.id)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </>
  )
}
