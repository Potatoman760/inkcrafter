import { useEffect, useState } from 'react'
import type { CodexEntry } from '@shared/codex'
import { scanKnots, type KnotRef } from '@shared/inkKnots'
import { charactersOf } from '@shared/plan'
import {
  knotOf,
  PLAN_STATUSES,
  roleAtDepth,
  type PlanChanges,
  type PlanNode,
  type PlanStatus
} from '@shared/planDoc'
import type { ProjectFile } from '@shared/project'
import {
  Button,
  Chip,
  ChipRow,
  Dialog,
  DialogSpacer,
  Field,
  Hint,
  Input,
  Select,
  Textarea
} from '../design/components'
import { copy } from '@shared/copy'

interface PlanNodeDialogProps {
  node: PlanNode
  /** Depth in the plan, for naming what this is. */
  depth: number
  entries: CodexEntry[]
  projectFiles: ProjectFile[]
  /** Existing project-relative folders offered while assigning a Chapter. */
  projectFolders: string[]
  onSave: (id: string, changes: PlanChanges) => void
  onOpenFile: (path: string, line?: number) => void
  onOpenEntry: (entryId: string) => void
  onClose: () => void
}

interface AttachedFile {
  path: string
  knots: KnotRef[]
  error: string | null
}

/**
 * One section of the plan, expanded.
 *
 * The card on the board is a summary. Acts and chapters show their contents;
 * a Scene shows its one app-managed Ink file and the knots inside it, so the
 * plan can be followed directly into the writing.
 */
export function PlanNodeDialog({
  node,
  depth,
  entries,
  projectFiles,
  projectFolders,
  onSave,
  onOpenFile,
  onOpenEntry,
  onClose
}: PlanNodeDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<PlanChanges>({})
  const [attached, setAttached] = useState<AttachedFile[]>([])

  const value = <K extends keyof PlanChanges>(key: K, fallback: PlanChanges[K]): PlanChanges[K] =>
    draft[key] !== undefined ? draft[key] : fallback

  const title = value('title', node.title) as string
  const summary = value('summary', node.summary) as string
  const tags = (value('tags', node.tags) as string[]) ?? []
  const status = value('status', node.status) as PlanStatus | null
  const folder = value('folder', node.folder) as string | null

  const dirty = Object.keys(draft).length > 0
  const role = roleAtDepth(depth)

  useEffect(() => setDraft({}), [node.id])

  // Only Scenes own Ink. Acts and chapters are planning containers, and the
  // writer guarantees every Scene has exactly one local file.
  const sources = roleAtDepth(depth) === 'scene' ? node.files.slice(0, 1) : []

  // Read the Scene file so its knots can be listed and jumped to.
  const sourceKey = sources.join('|')

  useEffect(() => {
    let cancelled = false

    void Promise.all(
      sources.map(async (path): Promise<AttachedFile> => {
        const file = projectFiles.find((candidate) => candidate.path === path)
        if (!file) {
          return { path, knots: [], error: 'Not in the project any more.' }
        }
        try {
          const contents = await window.inkcrafter.readFile(file.absolutePath)
          const knots = scanKnots(contents).filter((knot) => !knot.isFunction)
          return { path, knots, error: null }
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : String(cause)
          return { path, knots: [], error }
        }
      })
    ).then((loaded) => {
      if (!cancelled) setAttached(loaded)
    })

    return () => {
      cancelled = true
    }
  }, [sourceKey, projectFiles])

  const close = (): void => {
    if (dirty && !window.confirm('Discard the changes to this section?')) return
    onClose()
  }

  const save = (): void => {
    const changes = { ...draft }
    // Renaming a Scene must not silently invalidate the knot already declared
    // in its file. Keep the old derived name as an explicit stable override.
    if (role === 'scene' && draft.title !== undefined && draft.title !== node.title && node.knot === null) {
      changes.knot = knotOf(node)
    }
    onSave(node.id, changes)
    onClose()
  }

  // Does the knot this section claims actually exist in its ink?
  const wanted = knotOf(node)
  const declaredIn = attached.find((file) => file.knots.some((knot) => knot.name === wanted))
  const declaration = declaredIn?.knots.find((knot) => knot.name === wanted)

  return (
    <Dialog
      title={
        <>
          {role === 'act' ? 'Act' : role === 'chapter' ? 'Chapter' : 'Scene'}
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </>
      }
      ariaLabel={`Plan section: ${node.title}`}
      className="entry-dialog"
      onClose={close}
      footer={
        <>
          {/* Destructive far left, then the way out, then the commit. */}
          <DialogSpacer />
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!dirty}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input
          value={title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </Field>

      <Field label={role === 'scene' ? 'Description' : 'Summary'}>
        <Textarea
          rows={5}
          value={summary}
          onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
        />
      </Field>

      {role === 'chapter' && (
        <Field
          label="Chapter folder"
          note="New Scene Ink files are created here. Existing Scene files move with the Chapter."
        >
          <Input
            value={folder ?? ''}
            list={`chapter-folders-${node.id}`}
            aria-label="Chapter folder"
            placeholder="chapter-one"
            onChange={(event) =>
              setDraft({ ...draft, folder: event.target.value.trim().length > 0 ? event.target.value : null })
            }
          />
          <datalist id={`chapter-folders-${node.id}`}>
            {projectFolders
              .filter((candidate) => !/^(media|export)(\/|$)/.test(candidate))
              .map((candidate) => <option value={candidate} key={candidate} />)}
          </datalist>
        </Field>
      )}

      <div className="detail-row">
        <Field label="Status">
          <Select
            value={status ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                status: event.target.value === '' ? null : (event.target.value as PlanStatus)
              })
            }
          >
            <option value="">—</option>
            {PLAN_STATUSES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tags" about={copy('plan.aliases')}>
          <Input
            value={tags.join(', ')}
            onChange={(event) =>
              setDraft({
                ...draft,
                tags: event.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              })
            }
          />
        </Field>
      </div>

      {role === 'scene' && <Field as="div" label="Scene Ink file" about={copy('plan.attached')}>

        {attached.length === 0 && <Hint>The Scene file is being created.</Hint>}

        {attached.map((file) => (
          <div
            className="plan-ink"
            key={file.path}
          >
            <div className="plan-ink-head">
              <button className="plan-file-path" onClick={() => onOpenFile(file.path)}>
                {file.path}
              </button>
            </div>

            {file.error && <p className="codex-error">{file.error}</p>}

            {!file.error && file.knots.length === 0 && (
              <Hint tight>No knots — variables or functions only.</Hint>
            )}

            {file.knots.length > 0 && (
              <ul className="plan-knots">
                {file.knots.map((knot) => (
                  <li key={`${file.path}:${knot.name}`}>
                    <button
                      className={knot.name === wanted ? 'is-match' : ''}
                      onClick={() => onOpenFile(file.path, knot.line)}
                      title={`${file.path}:${knot.line}`}
                    >
                      {knot.isStitch ? `= ${knot.title}` : `=== ${knot.title}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      </Field>}

      {role === 'scene' && <Field as="div" label="Knot" about={copy('plan.wouldGenerate')}>
        {declaration && declaredIn ? (
          <p className="provider-test-ok">
            <code>{wanted}</code> is declared in {declaredIn.path}, line {declaration.line}
            .{' '}
            <Button variant="link"
              onClick={() => onOpenFile(declaredIn.path, declaration.line)}
            >
              open it
            </Button>
          </p>
        ) : (
          <Hint tight>
            <code>{wanted}</code> is not declared in this Scene's Ink file. Restore that knot or
            change the Scene's knot name to match the file.
          </Hint>
        )}
      </Field>}

      {node.children.length > 0 && (
        <Field
          as="div"
          label="Contains"
          note={copy('plan.children', { count: node.children.length })}
        >
          <ul className="plan-file-list">
            {node.children.map((child) => (
              <li className="plan-file-row" key={child.id}>
                <span>{child.title || 'untitled'}</span>
                {child.files[0] && (
                  <Button variant="link" onClick={() => onOpenFile(child.files[0]!)}>
                    {child.files[0].split('/').pop()}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {charactersOf(node, entries).length > 0 && (
        <Field as="div" label="Characters here">
          <ChipRow>
            {charactersOf(node, entries).map((character) => (
              <Chip
                key={character.id}
                variant="accent"
                onClick={() => onOpenEntry(character.id)}
              >
                {character.name}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      )}
    </Dialog>
  )
}
