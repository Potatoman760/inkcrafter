import { useMemo, useState } from 'react'
import type { CodexEntry } from '@shared/codex'
import { planActs } from '@shared/plan'
import {
  insertPlanNode,
  movePlanNode,
  removePlanNode,
  updatePlanNode,
  type PlanChanges,
  type PlanDocument
} from '@shared/planDoc'
import { PlanCard } from './PlanCard'
import { Icon } from '../design/Icon'
import { Button, EmptyState, IconButton, Input } from '../design/components'

interface PlanGridProps {
  plan: PlanDocument
  entries: CodexEntry[]
  onChange: (next: PlanDocument) => void
  /** Creates both the Scene record and its mandatory Ink file. */
  onCreateScene: (chapterId: string, title: string) => void
  onOpenEntry: (entryId: string) => void
  onOpenFile: (path: string) => void
  onExpand: (id: string) => void
  onImport: () => void
}

/**
 * The board: acts as columns, chapters as cards beneath them.
 *
 * Every edit goes through a tree operation and hands back a whole outline. The
 * grid never composes markdown, so it cannot disturb anything it is not showing.
 */
export function PlanGrid({
  plan,
  entries,
  onChange,
  onCreateScene,
  onOpenEntry,
  onOpenFile,
  onExpand,
  onImport
}: PlanGridProps): React.JSX.Element {
  const [newAct, setNewAct] = useState('')
  const [dragging, setDragging] = useState<{ id: string; role: 'chapter' | 'scene' } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const acts = useMemo(() => planActs(plan, entries), [plan, entries])

  const change = (id: string, changes: PlanChanges): void =>
    onChange(updatePlanNode(plan, id, changes))

  const beginDrag = (
    event: React.DragEvent<HTMLButtonElement>,
    id: string,
    role: 'chapter' | 'scene'
  ): void => {
    event.dataTransfer.setData('text/inkcrafter-plan-node', id)
    event.dataTransfer.setData('text/inkcrafter-plan-role', role)
    event.dataTransfer.effectAllowed = 'move'
    setDragging({ id, role })
  }

  const finishDrag = (): void => {
    setDragging(null)
    setDropTarget(null)
  }

  const draggedNode = (event: React.DragEvent): typeof dragging => {
    const id = event.dataTransfer.getData('text/inkcrafter-plan-node') || dragging?.id
    const storedRole = event.dataTransfer.getData('text/inkcrafter-plan-role')
    const role = storedRole === 'chapter' || storedRole === 'scene' ? storedRole : dragging?.role
    return id && role ? { id, role } : null
  }

  /** Drops immediately before a sibling, including before the first one. */
  const dropBefore = (
    event: React.DragEvent,
    role: 'chapter' | 'scene',
    parentId: string,
    beforeId: string,
    siblingIds: string[]
  ): void => {
    const dragged = draggedNode(event)
    if (dragged?.role !== role) return
    event.preventDefault()
    if (role === 'scene') event.stopPropagation()
    finishDrag()
    if (dragged.id === beforeId) return

    // Find the preceding sibling after taking the dragged card out. Otherwise,
    // dragging the first card one place down would name itself as the anchor.
    const remaining = siblingIds.filter((candidate) => candidate !== dragged.id)
    const at = remaining.indexOf(beforeId)
    if (at === -1) return
    onChange(movePlanNode(plan, dragged.id, parentId, at === 0 ? null : remaining[at - 1]!))
  }

  const dropAtEnd = (
    event: React.DragEvent,
    role: 'chapter' | 'scene',
    parentId: string
  ): void => {
    const dragged = draggedNode(event)
    if (dragged?.role !== role) return
    event.preventDefault()
    if (role === 'scene') event.stopPropagation()
    finishDrag()
    onChange(movePlanNode(plan, dragged.id, parentId))
  }

  const dragOver = (
    event: React.DragEvent,
    role: 'chapter' | 'scene',
    target: string
  ): void => {
    if (dragging?.role !== role) return
    event.preventDefault()
    if (role === 'scene') event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  if (plan.nodes.length === 0) {
    return (
      <EmptyState
        centered
        className="plan-empty"
        body="Nothing planned yet. Acts hold chapters, which hold scenes. Add an act below, or paste an outline you have already written."
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

  return (
    <div className="plan-grid">
      {acts.map((act) => (
        <section className="plan-act" key={act.node.id}>
          <header className="plan-act-head">
            <Input className="plan-act-title"
              value={act.node.title}
              aria-label="Act title"
              onChange={(event) => change(act.node.id, { title: event.target.value })}
            />
            <span className="plan-act-count">
              {act.chapters.length} chapter{act.chapters.length === 1 ? '' : 's'}
            </span>
            <IconButton icon="maximize-2" label={`Expand ${act.node.title}`}
              title="Open this act and its ink"
              onClick={() => onExpand(act.node.id)}
             className="plan-expand" />
          </header>

          {act.node.summary.length > 0 && <p className="plan-act-summary">{act.node.summary}</p>}

          <div className="plan-cards">
            {act.chapters.map((chapter) => {
              const target = `before:${chapter.node.id}`
              const siblingIds = act.chapters.map((one) => one.node.id)
              return (
                <div
                  key={chapter.node.id}
                  className={`plan-card-drop${dropTarget === target ? ' is-drop-target' : ''}${dragging?.id === chapter.node.id ? ' is-dragging' : ''}`}
                  onDragOver={(event) =>
                    dragging?.role === 'scene'
                      ? dragOver(event, 'scene', `scene:end:${chapter.node.id}`)
                      : dragOver(event, 'chapter', target)
                  }
                  onDrop={(event) =>
                    draggedNode(event)?.role === 'scene'
                      ? dropAtEnd(event, 'scene', chapter.node.id)
                      : dropBefore(event, 'chapter', act.node.id, chapter.node.id, siblingIds)
                  }
                >
                  <PlanCard
                    chapter={chapter}
                    onChange={change}
                    onRemove={(id) => onChange(removePlanNode(plan, id))}
                    onOpenEntry={onOpenEntry}
                    onCreateScene={onCreateScene}
                    onOpenFile={onOpenFile}
                    onExpand={onExpand}
                    onDragStart={(event) => beginDrag(event, chapter.node.id, 'chapter')}
                    onDragEnd={finishDrag}
                    draggingSceneId={dragging?.role === 'scene' ? dragging.id : null}
                    sceneDropTarget={dropTarget}
                    onSceneDragStart={(event, id) => beginDrag(event, id, 'scene')}
                    onSceneDragOver={(event, sceneTarget) => dragOver(event, 'scene', sceneTarget)}
                    onSceneDropBefore={(event, beforeId, sceneIds) =>
                      dropBefore(event, 'scene', chapter.node.id, beforeId, sceneIds)
                    }
                    onSceneDropAtEnd={(event) => dropAtEnd(event, 'scene', chapter.node.id)}
                  />
                </div>
              )
            })}

            <Button
              className={`plan-add${dropTarget === `end:${act.node.id}` ? ' is-drop-target' : ''}`}
              onDragOver={(event) => dragOver(event, 'chapter', `end:${act.node.id}`)}
              onDrop={(event) => dropAtEnd(event, 'chapter', act.node.id)}
              onClick={() => onChange(insertPlanNode(plan, act.node.id, 'New chapter').plan)}
            >
              <Icon name="plus" size={13} />
              Add chapter
            </Button>
          </div>
        </section>
      ))}

      <section className="plan-act is-new">
        <Input
          value={newAct}
          placeholder="Name"
          aria-label="New act title"
          onChange={(event) => setNewAct(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || newAct.trim().length === 0) return
            onChange(insertPlanNode(plan, null, newAct.trim()).plan)
            setNewAct('')
          }}
        />
        <Button
          onClick={() => {
            if (newAct.trim().length === 0) return
            onChange(insertPlanNode(plan, null, newAct.trim()).plan)
            setNewAct('')
          }}
          disabled={newAct.trim().length === 0}
        >
          Add act
        </Button>
      </section>
    </div>
  )
}
