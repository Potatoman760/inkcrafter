import { useEffect, useRef, useState } from 'react'
import {
  insertPlanNode,
  updatePlanNode,
  type PlanChanges,
  type PlanDocument,
  type PlanNode
} from '@shared/planDoc'
import { Button, EmptyState, IconButton, Input, Textarea } from '../design/components'

interface PlanOutlineProps {
  plan: PlanDocument
  onChange: (next: PlanDocument) => void
  onOpenFile: (path: string) => void
  onExpand: (id: string) => void
  onImport: () => void
}

/**
 * The outline: the whole story read top to bottom.
 *
 * The board answers "what is next to what"; this answers "what happens". Acts,
 * then chapters in order, then the summary of every scene under each — one
 * column at a reading measure, so the story can be read straight down without
 * the eye having to find the next card.
 *
 * Everything shown is editable where it stands. A summary is the thing being
 * read *and* the thing being fixed, so clicking it opens it rather than sending
 * the author back to the board to find the same card again.
 */

interface Draft {
  editing: boolean
  draft: string
  setDraft: (next: string) => void
  open: () => void
  cancel: () => void
  close: (commit: (next: string) => void) => void
}

/**
 * A value that shows itself until it is clicked.
 *
 * `cancelling` exists because Escape unmounts the control, and whether the
 * browser then fires a blur is not something to depend on: the flag makes the
 * discard survive either order. It is cleared on the way *in*, so a cancel
 * cannot leak into the next edit.
 */
function useDraft(value: string): Draft {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelling = useRef(false)

  // Re-sync when the node changes underneath — the assistant writes plan.json.
  useEffect(() => setDraft(value), [value])

  return {
    editing,
    draft,
    setDraft,
    open: () => {
      cancelling.current = false
      setDraft(value)
      setEditing(true)
    },
    cancel: () => {
      cancelling.current = true
      setDraft(value)
      setEditing(false)
    },
    close: (commit) => {
      setEditing(false)
      if (cancelling.current) {
        cancelling.current = false
        setDraft(value)
        return
      }
      if (draft !== value) commit(draft)
    }
  }
}

function OutlineTitle({
  value,
  label,
  className,
  onCommit
}: {
  value: string
  label: string
  className: string
  onCommit: (next: string) => void
}): React.JSX.Element {
  const field = useDraft(value)

  if (!field.editing) {
    return (
      <button type="button" className={`${className} plan-outline-open`} onClick={field.open}>
        {value || <em>untitled</em>}
      </button>
    )
  }

  return (
    <Input
      autoFocus
      className={className}
      value={field.draft}
      aria-label={label}
      onChange={(event) => field.setDraft(event.target.value)}
      onBlur={() => field.close(onCommit)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        else if (event.key === 'Escape') field.cancel()
      }}
    />
  )
}

function OutlineSummary({
  value,
  label,
  placeholder,
  onCommit
}: {
  value: string
  label: string
  placeholder: string
  onCommit: (next: string) => void
}): React.JSX.Element {
  const field = useDraft(value)
  const box = useRef<HTMLTextAreaElement>(null)

  // The box holds what is in it. A fixed height would show less of a summary
  // while editing it than reading it did — the same note as on PlanCard.
  useEffect(() => {
    const el = box.current
    if (!field.editing || !el) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + border}px`
  }, [field.editing, field.draft])

  if (!field.editing) {
    return (
      <button
        type="button"
        className={`plan-outline-prose${value.length === 0 ? ' is-empty' : ''}`}
        onClick={field.open}
      >
        {value.length > 0 ? value : placeholder}
      </button>
    )
  }

  return (
    <Textarea
      ref={box}
      autoFocus
      className="plan-outline-editor"
      value={field.draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => field.setDraft(event.target.value)}
      onBlur={() => field.close(onCommit)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') field.cancel()
      }}
    />
  )
}

function OutlineScene({
  scene,
  ordinal,
  onChange,
  onOpenFile,
  onExpand
}: {
  scene: PlanNode
  ordinal: number
  onChange: (id: string, changes: PlanChanges) => void
  onOpenFile: (path: string) => void
  onExpand: (id: string) => void
}): React.JSX.Element {
  const name = scene.title || `scene ${ordinal}`

  return (
    <div className="plan-outline-scene">
      <div className="plan-outline-scene-head">
        <span className="plan-outline-eyebrow">Scene {ordinal}</span>
        <OutlineTitle
          value={scene.title}
          label={`Scene ${ordinal} title`}
          className="plan-outline-scene-title"
          onCommit={(title) => onChange(scene.id, { title })}
        />
        {scene.files[0] && (
          <IconButton
            className="plan-outline-action"
            icon="file-text"
            size="sm"
            label={`Open ${scene.files[0]}`}
            onClick={() => onOpenFile(scene.files[0]!)}
          />
        )}
        <IconButton
          className="plan-outline-action"
          icon="maximize-2"
          size="sm"
          label={`Expand ${name}`}
          onClick={() => onExpand(scene.id)}
        />
      </div>
      <OutlineSummary
        value={scene.summary}
        label={`Summary of ${name}`}
        placeholder="What happens in this scene."
        onCommit={(summary) => onChange(scene.id, { summary })}
      />
    </div>
  )
}

export function PlanOutline({
  plan,
  onChange,
  onOpenFile,
  onExpand,
  onImport
}: PlanOutlineProps): React.JSX.Element {
  const change = (id: string, changes: PlanChanges): void =>
    onChange(updatePlanNode(plan, id, changes))

  if (plan.nodes.length === 0) {
    return (
      <EmptyState
        centered
        className="plan-empty"
        body="Nothing planned yet. The outline reads the whole story top to bottom — acts, their chapters, and the summary of every scene. Add an act below, or paste an outline you have already written."
        action={
          <div className="detail-row">
            <Button icon="plus" onClick={() => onChange(insertPlanNode(plan, null, 'Act One').plan)}>
              Add an act
            </Button>
            <Button icon="clipboard-paste" onClick={onImport}>
              Paste an outline…
            </Button>
          </div>
        }
      />
    )
  }

  // Chapters are numbered across the whole story rather than restarting inside
  // each act: that is the number the author says out loud, and the one a reader
  // would count to.
  let chapterNumber = 0

  return (
    <div className="plan-outline">
      {plan.nodes.map((act, actIndex) => {
        const actName = act.title || `act ${actIndex + 1}`
        return (
          <section className="plan-outline-act" key={act.id} aria-label={actName}>
            <header className="plan-outline-act-head">
              <h2 className="plan-outline-act-heading">
                <span className="plan-outline-act-number">Act {actIndex + 1}</span>
                <OutlineTitle
                  value={act.title}
                  label={`Act ${actIndex + 1} title`}
                  className="plan-outline-act-title"
                  onCommit={(title) => change(act.id, { title })}
                />
              </h2>
              <span className="plan-outline-count">
                {act.children.length} chapter{act.children.length === 1 ? '' : 's'}
              </span>
              <IconButton
                className="plan-outline-action"
                icon="maximize-2"
                size="sm"
                label={`Expand ${actName}`}
                onClick={() => onExpand(act.id)}
              />
            </header>

            <OutlineSummary
              value={act.summary}
              label={`Summary of ${actName}`}
              placeholder="What this act is for."
              onCommit={(summary) => change(act.id, { summary })}
            />

            {act.children.length === 0 && (
              <p className="plan-outline-none">No chapters in this act yet.</p>
            )}

            {act.children.map((chapter) => {
              chapterNumber += 1
              const number = chapterNumber
              const name = chapter.title || `chapter ${number}`
              return (
                <article className="plan-outline-chapter" key={chapter.id}>
                  <div className="plan-outline-chapter-head">
                    <span className="plan-outline-eyebrow">
                      Chapter {number}
                      {chapter.status ? ` · ${chapter.status}` : ''}
                    </span>
                    <h3 className="plan-outline-chapter-heading">
                      <OutlineTitle
                        value={chapter.title}
                        label={`Chapter ${number} title`}
                        className="plan-outline-chapter-title"
                        onCommit={(title) => change(chapter.id, { title })}
                      />
                    </h3>
                    <span className="plan-outline-count">
                      {chapter.children.length} scene{chapter.children.length === 1 ? '' : 's'}
                    </span>
                    <IconButton
                      className="plan-outline-action"
                      icon="maximize-2"
                      size="sm"
                      label={`Expand ${name}`}
                      onClick={() => onExpand(chapter.id)}
                    />
                  </div>

                  <OutlineSummary
                    value={chapter.summary}
                    label={`Summary of ${name}`}
                    placeholder="What happens in this chapter."
                    onCommit={(summary) => change(chapter.id, { summary })}
                  />

                  {chapter.children.map((scene, sceneIndex) => (
                    <OutlineScene
                      key={scene.id}
                      scene={scene}
                      ordinal={sceneIndex + 1}
                      onChange={change}
                      onOpenFile={onOpenFile}
                      onExpand={onExpand}
                    />
                  ))}
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
