import { useEffect, useRef, useState } from 'react'
import type { PlanChapter } from '@shared/plan'
import { PLAN_STATUSES, type PlanChanges, type PlanStatus } from '@shared/planDoc'
import { Icon } from '../design/Icon'
import {
  Button,
  Card,
  CardFoot,
  CardHead,
  CardSummary,
  CardTitle,
  Chip,
  ChipRow,
  IconButton,
  Input,
  Select,
  Textarea
} from '../design/components'

interface PlanCardProps {
  chapter: PlanChapter
  onChange: (id: string, changes: PlanChanges) => void
  onRemove: (id: string) => void
  onOpenEntry: (entryId: string) => void
  onCreateScene: (chapterId: string, title: string) => void
  onOpenFile: (path: string) => void
  onExpand: (id: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  draggingSceneId: string | null
  sceneDropTarget: string | null
  onSceneDragStart: (event: React.DragEvent<HTMLButtonElement>, id: string) => void
  onSceneDragOver: (event: React.DragEvent, target: string) => void
  onSceneDropBefore: (event: React.DragEvent, beforeId: string, siblingIds: string[]) => void
  onSceneDropAtEnd: (event: React.DragEvent) => void
}

const STATUS_LABELS: Record<PlanStatus, string> = {
  planned: 'Planned',
  drafting: 'Drafting',
  done: 'Done'
}

/**
 * One chapter on the board.
 *
 * Editing writes into the tree, never into markdown — the card hands back a
 * change and the outline is re-serialised whole, so a card cannot damage
 * anything outside the node it belongs to.
 */
export function PlanCard({
  chapter,
  onChange,
  onRemove,
  onOpenEntry,
  onCreateScene,
  onOpenFile,
  onExpand,
  onDragStart,
  onDragEnd,
  draggingSceneId,
  sceneDropTarget,
  onSceneDragStart,
  onSceneDragOver,
  onSceneDropBefore,
  onSceneDropAtEnd
}: PlanCardProps): React.JSX.Element {
  const { node, characters } = chapter
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(node.title)
  const [summary, setSummary] = useState(node.summary)
  const [tags, setTags] = useState(node.tags.join(', '))
  const [newScene, setNewScene] = useState('')
  const summaryBox = useRef<HTMLTextAreaElement>(null)

  // Re-sync when the file changes underneath, e.g. edited in the markdown view.
  useEffect(() => {
    setTitle(node.title)
    setSummary(node.summary)
    setTags(node.tags.join(', '))
  }, [node.id, node.title, node.summary, node.tags.join(',')])

  const commit = (): void => {
    setEditing(false)
    const nextTags = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const changed =
      title !== node.title ||
      summary !== node.summary ||
      nextTags.join(',') !== node.tags.join(',')

    if (changed) onChange(node.id, { title, summary, tags: nextTags })
  }

  /**
   * The summary box grows to hold what is in it.
   *
   * A fixed four rows made the box *smaller* than the paragraph it replaced,
   * so clicking a chapter to edit it hid most of what you were editing. The
   * floor is in CSS, so an empty summary still opens something worth typing in.
   */
  useEffect(() => {
    const box = summaryBox.current
    if (!editing || !box) return
    box.style.height = 'auto'
    // scrollHeight counts the padding but not the border, and the box is
    // border-box — without the difference it lands two pixels short and shows
    // a scrollbar for text that fits.
    const border = box.offsetHeight - box.clientHeight
    box.style.height = `${box.scrollHeight + border}px`
  }, [editing, summary])

  /** Backs out of the edit entirely, restoring what the node still says. */
  const cancel = (): void => {
    setTitle(node.title)
    setSummary(node.summary)
    setTags(node.tags.join(', '))
    setEditing(false)
  }

  // The status reads off the top edge, so a board of chapters can be scanned
  // down a column without reading a word of it.
  return (
    <Card className="plan-card" status={node.status ?? ''}>
      {/* Only the three fields being edited swap. Status, cast and Scenes stay
          where they are, because a card that rearranges itself when clicked is
          a card the author has to re-read. */}
      <CardHead>
        <IconButton
          className="plan-drag"
          icon="grip-vertical"
          label={`Drag ${node.title}`}
          size="sm"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
        {editing ? (
          <Input className="plan-card-title"
            value={title}
            aria-label="Chapter title"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
            }}
          />
        ) : (
          <CardTitle className="plan-card-title-button" onClick={() => setEditing(true)}>
            {node.title || <em>untitled</em>}
          </CardTitle>
        )}
        <IconButton icon="maximize-2" label={`Expand ${node.title}`}
          title="Open this section and its ink"
          onClick={() => onExpand(node.id)}
         className="plan-expand" />
      </CardHead>

      <div className="plan-status-row">
        <Select className="plan-status"
          value={node.status ?? ''}
          aria-label={`Status of ${node.title}`}
          onChange={(event) =>
            onChange(node.id, {
              status: event.target.value === '' ? null : (event.target.value as PlanStatus)
            })
          }
        >
          <option value="">—</option>
          {PLAN_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {editing ? (
        <>
          <Textarea
            ref={summaryBox}
            className="plan-card-editor"
            value={summary}
            aria-label="Chapter summary"
            placeholder="What happens here."
            onChange={(event) => setSummary(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
            }}
          />
          <Input
            value={tags}
            aria-label="Chapter tags"
            placeholder="tags, comma separated"
            onChange={(event) => setTags(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
            }}
          />
          {/* These govern the fields above them and nothing below: cast is
              derived, and Scenes are managed separately. */}
          <div className="detail-row plan-card-actions">
            <Button variant="primary" onClick={commit}>
              Save
            </Button>
            <Button onClick={cancel}>Cancel</Button>
            <Button variant="link" onClick={() => onRemove(node.id)}>
              <Icon name="trash-2" size={12} />
              delete
            </Button>
          </div>
        </>
      ) : (
        <>
          <CardSummary
            empty={node.summary.length === 0}
            className="plan-card-summary"
            onClick={() => setEditing(true)}
          >
            {node.summary.length > 0 ? node.summary : 'No summary yet.'}
          </CardSummary>

          {node.tags.length > 0 && (
            <ChipRow>
              {node.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </ChipRow>
          )}
        </>
      )}

      {characters.length > 0 && (
        <ChipRow className="plan-cast">
          {characters.map((character) => (
            <Chip
              key={character.id}
              variant="accent"
              onClick={() => onOpenEntry(character.id)}
            >
              {character.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      <section
        className={`plan-scenes${sceneDropTarget === `scene:end:${node.id}` ? ' is-drop-target' : ''}`}
        aria-label={`Scenes in ${node.title}`}
        onDragOver={(event) => onSceneDragOver(event, `scene:end:${node.id}`)}
        onDrop={onSceneDropAtEnd}
      >
        <div className="plan-scenes-head">
          <div className="plan-scenes-label">
            <strong>Scenes</strong>
            <code>{node.folder ? `${node.folder}/` : 'folder pending'}</code>
          </div>
          <span>{node.children.length}</span>
        </div>
        {node.children.map((scene) => (
          <div
            className={`plan-scene${sceneDropTarget === `scene:before:${scene.id}` ? ' is-drop-target' : ''}${draggingSceneId === scene.id ? ' is-dragging' : ''}`}
            key={scene.id}
            onDragOver={(event) => onSceneDragOver(event, `scene:before:${scene.id}`)}
            onDrop={(event) =>
              onSceneDropBefore(event, scene.id, node.children.map((child) => child.id))
            }
          >
            <IconButton
              className="plan-scene-drag"
              icon="grip-vertical"
              label={`Drag scene ${scene.title}`}
              size="sm"
              draggable
              onDragStart={(event) => onSceneDragStart(event, scene.id)}
              onDragEnd={onDragEnd}
            />
            <button className="plan-scene-main" onClick={() => onExpand(scene.id)}>
              <strong>{scene.title || 'Untitled scene'}</strong>
              <span>{scene.summary || 'No description yet.'}</span>
            </button>
            {scene.files[0] && (
              <IconButton
                icon="file-text"
                label={`Open ${scene.files[0]}`}
                size="sm"
                onClick={() => onOpenFile(scene.files[0]!)}
              />
            )}
            <IconButton
              icon="x"
              label={`Remove scene ${scene.title}`}
              size="sm"
              onClick={() => onRemove(scene.id)}
            />
          </div>
        ))}
        <div className="plan-scene-new">
          <Input
            value={newScene}
            aria-label={`New scene in ${node.title}`}
            placeholder="New scene…"
            onChange={(event) => setNewScene(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || newScene.trim().length === 0) return
              onCreateScene(node.id, newScene.trim())
              setNewScene('')
            }}
          />
          <IconButton
            icon="plus"
            label={`Add scene to ${node.title}`}
            disabled={newScene.trim().length === 0}
            onClick={() => {
              if (newScene.trim().length === 0) return
              onCreateScene(node.id, newScene.trim())
              setNewScene('')
            }}
          />
        </div>
      </section>

      <CardFoot>
        <span>{node.children.length} scene{node.children.length === 1 ? '' : 's'}</span>
      </CardFoot>
    </Card>
  )
}
