import { Fragment, useEffect, useMemo, useRef } from 'react'
import { emptyMedia, type MediaDocument } from '@shared/mediaDoc'
import { sectionScenes } from '@shared/sectionScene'
import type { MediaFile } from '@shared/types'
import type { CodexEntry } from '@shared/codex'
import type {
  EndingNode,
  JunctionNode,
  ManuscriptNode,
  ProseNode,
  SourceAnchor
} from '@shared/manuscript'
import { findMentionsInProse } from '@shared/mentions'
import { EditableLine } from './EditableLine'
import { JunctionCard } from './JunctionCard'
import { SectionRail } from './SectionRail'
import type { ManuscriptSession } from './useManuscript'
import { Hint } from '../design/components'

interface ManuscriptViewProps {
  session: ManuscriptSession
  entryLabel: string
  codexEntries: CodexEntry[]
  onOpenSource: (anchor: SourceAnchor) => void
  onOpenEntry: (entryId: string) => void
  /** The section being written, highlighted in the reading. */
  selectedSection: number | null
  onSelectSection: (index: number) => void
  /**
   * The catalogues the rail draws from.
   *
   * Optional, and defaulted, because the manuscript is readable without them —
   * a project whose media has not loaded should still show its prose rather
   * than fail. Drilled down as props rather than reached for through a context,
   * which is how `StoryPlayer` gets the same three.
   */
  media?: MediaDocument
  mediaFiles?: MediaFile[]
}

/** Splits a paragraph around its codex mentions so they can be made clickable. */
function Prose({
  node,
  codexEntries,
  onOpenEntry
}: {
  node: ProseNode
  codexEntries: CodexEntry[]
  onOpenEntry: (entryId: string) => void
}): React.JSX.Element {
  const parts = useMemo(() => {
    const mentions = findMentionsInProse(node.text, codexEntries)
    const pieces: Array<{ text: string; entryId: string | null }> = []
    let cursor = 0

    for (const mention of mentions) {
      // Detection can return overlapping hits from different entries; the first
      // one wins and the rest are skipped rather than rendered twice.
      if (mention.from < cursor) continue
      if (mention.from > cursor) {
        pieces.push({ text: node.text.slice(cursor, mention.from), entryId: null })
      }
      pieces.push({ text: node.text.slice(mention.from, mention.to), entryId: mention.entryId })
      cursor = mention.to
    }

    if (cursor < node.text.length) pieces.push({ text: node.text.slice(cursor), entryId: null })
    return pieces
  }, [node.text, codexEntries])

  return (
    <>
      {parts.map((part, index) =>
        part.entryId ? (
          <button
            key={index}
            className="prose-mention"
            onClick={() => onOpenEntry(part.entryId!)}
            title="Open codex entry"
          >
            {part.text}
          </button>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
    </>
  )
}

/**
 * A run of prose, or one of the things between runs.
 *
 * The reading used to be a flat list of nodes with the section number counted
 * as it went. It is grouped now, because a rail belongs to a section rather
 * than to a paragraph — and grouping with `sectionsOf` would not do, because
 * that function drops the endings entirely on its way to the prose.
 */
type Piece =
  | { kind: 'section'; index: number; nodes: ProseNode[] }
  | { kind: 'node'; node: JunctionNode | EndingNode; ordinal: number }

/**
 * The reading, grouped into sections.
 *
 * Prose accumulates until something that is not prose arrives, and the run is
 * flushed as a section. The numbering is unchanged from the walk this replaced
 * — a junction opens the next section, an ending does not — so an index still
 * means what it means to `sectionsOf`, which is what the write panel and the
 * staging calls are keyed on.
 *
 * Prose with no text is dropped. Those are the tag-only lines in the ink: they
 * carry staging and no words, and until now they rendered here as an empty
 * paragraph with a line number floating beside it.
 */
function laidOut(nodes: readonly ManuscriptNode[]): Piece[] {
  const pieces: Piece[] = []
  const emitted = new Map<number, Piece & { kind: 'section' }>()
  let run: ProseNode[] = []
  let index = 0
  let ordinal = 0

  /**
   * Closes the run.
   *
   * At most one section per index, because only a junction opens a new one. An
   * ending closes the run too — it has to, so that "The End" is not drawn
   * inside the block it ends — but it does not start a section, so the flush
   * after it would otherwise emit a second piece carrying an index already on
   * screen. Both then matched the selection, and two rails opened at once.
   */
  const flush = (): void => {
    const already = emitted.get(index)
    if (already) already.nodes.push(...run)
    else {
      const piece = { kind: 'section' as const, index, nodes: run }
      emitted.set(index, piece)
      pieces.push(piece)
    }

    run = []
  }

  for (const node of nodes) {
    if (node.kind === 'prose') {
      if (node.text.trim().length > 0) run.push(node)
      continue
    }

    flush()
    if (node.kind === 'junction') {
      ordinal += 1
      index += 1
    }
    pieces.push({ kind: 'node', node, ordinal })
  }

  flush()
  return pieces
}

export function ManuscriptView({
  session,
  entryLabel,
  codexEntries,
  onOpenSource,
  onOpenEntry,
  selectedSection,
  onSelectSection,
  media,
  mediaFiles = []
}: ManuscriptViewProps): React.JSX.Element {
  const { manuscript, loading } = session
  const endRef = useRef<HTMLDivElement>(null)

  // One fold over the whole reading, so every section knows the stage it stands
  // in and not merely the tags it wrote. Memoised because it walks every tag in
  // the story and the reading re-renders on every keystroke of an edit.
  const catalogue = media ?? emptyMedia()
  const scenes = useMemo(() => sectionScenes(catalogue, manuscript), [catalogue, manuscript])

  // Follow the reading: the open junction is where the author is working.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [manuscript.nodes.length])

  if (loading && manuscript.nodes.length === 0) {
    return <Hint className="pad">Compiling…</Hint>
  }

  if (manuscript.diagnostics.length > 0) {
    return (
      <div className="manuscript-blocked">
        <p>This story does not compile, so there is nothing to read yet.</p>
        {manuscript.diagnostics.map((diagnostic, index) => (
          <p key={index} className="manuscript-diagnostic">
            {diagnostic}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="manuscript">
      <div className="manuscript-page">
        <header className="manuscript-head">
          <h1>{entryLabel}</h1>
          <p>
            {manuscript.wordCount} words · {manuscript.path.length} choice
            {manuscript.path.length === 1 ? '' : 's'} taken
            {manuscript.complete ? ' · complete' : ''}
          </p>
          {session.traced && (
            <p className="manuscript-traced">
              {session.traced.startedAt === null ? (
                <>
                  Traced to <code>{session.traced.knot}</code> in {session.traced.steps} choice
                  {session.traced.steps === 1 ? '' : 's'}. Other routes may reach it too.
                </>
              ) : (
                <>
                  No route to <code>{session.traced.knot}</code> from the beginning of the story
                  was found, so the reading begins at <code>{session.traced.startedAt}</code> —
                  the furthest back the diverts lead.
                </>
              )}
            </p>
          )}
        </header>

        {/* A refusal is reported as a toast, not printed into the reading: it is
            the outcome of a command rather than part of the manuscript, and it
            has to be dismissible. See `dismissError`. */}
        <p className="manuscript-hint">Double-click a line to rewrite it in the ink.</p>

        {laidOut(manuscript.nodes).map((piece) => {
          if (piece.kind === 'section') {
            return (
              <section
                key={`s${piece.index}`}
                className={`manuscript-section ${
                  piece.index === selectedSection ? 'is-selected' : ''
                }`}
                onClick={() => onSelectSection(piece.index)}
              >
                <SectionRail
                  scene={scenes[piece.index] ?? scenes[scenes.length - 1]!}
                  media={catalogue}
                  files={mediaFiles}
                  open={piece.index === selectedSection}
                  onSet={(command, replacing) => void session.setTag(piece.index, command, replacing)}
                  onClear={(raw) => void session.clearTag(piece.index, raw)}
                />

                <div className="manuscript-body">
                  {piece.nodes.map((node) => (
                    <p key={node.id} className="manuscript-prose">
                      <EditableLine
                        text={node.text}
                        edit={node.edit}
                        className="prose-line"
                        onSave={(text) => void session.edit(node.id, null, text)}
                      >
                        <Prose node={node} codexEntries={codexEntries} onOpenEntry={onOpenEntry} />
                      </EditableLine>
                      {node.source && (
                        <button
                          className="source-link"
                          title={`${node.source.file}:${node.source.line}`}
                          onClick={(event) => {
                            // Following a line number must not also select the
                            // section: the block around it selects on click.
                            event.stopPropagation()
                            onOpenSource(node.source!)
                          }}
                        >
                          {node.source.line}
                        </button>
                      )}
                    </p>
                  ))}
                </div>
              </section>
            )
          }

          if (piece.node.kind === 'junction') {
            return (
              <JunctionCard
                key={piece.node.id}
                junction={piece.node}
                ordinal={piece.ordinal}
                onChoose={(nodeId, choiceIndex) => void session.choose(nodeId, choiceIndex)}
                onEdit={(nodeId, choiceIndex, text) => void session.edit(nodeId, choiceIndex, text)}
                onOpenSource={onOpenSource}
              />
            )
          }

          const ending = piece.node
          return (
            <div key={ending.id} className={`manuscript-ending is-${ending.reason}`}>
              {ending.reason === 'end' && <span>The End</span>}
              {ending.reason === 'loop' && <span>{ending.message}</span>}
              {ending.reason === 'error' && <span>{ending.message}</span>}
            </div>
          )
        })}

        <div ref={endRef} />
      </div>
    </div>
  )
}
