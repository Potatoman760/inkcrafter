import { placeFiles } from '@shared/plan'
import {
  duplicateKnots,
  flattenPlan,
  knotOf,
  setGlobalFile,
  type PlanDocument,
  type PlanNode
} from '@shared/planDoc'
import { Icon } from '../design/Icon'
import { Button, Field, Hint } from '../design/components'
import { copy } from '@shared/copy'

interface PlanStructureProps {
  plan: PlanDocument
  projectFiles: string[]
  onChange: (next: PlanDocument) => void
  onOpenFile: (path: string) => void
  onImport: () => void
}

/**
 * How the plan is read, including the knot owned by every Scene.
 *
 * Its job is to be checked before ink is made from it: the nesting, and the knot
 * each Scene owns. Two Scenes colliding on one knot name is caught here before
 * either one is drafted further.
 */
function Node({ node, depth }: { node: PlanNode; depth: number }): React.JSX.Element {
  return (
    <li>
      <div className="outline-node">
        <span className="outline-node-title">{node.title || <em>untitled</em>}</span>
        {depth >= 2 && <code className="outline-node-knot">{knotOf(node)}</code>}
      </div>

      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <Node key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function PlanStructure({
  plan,
  projectFiles,
  onChange,
  onOpenFile,
  onImport
}: PlanStructureProps): React.JSX.Element {
  const all = flattenPlan(plan)
  const scenes = plan.nodes.flatMap((act) => act.children.flatMap((chapter) => chapter.children))
  const clashes = duplicateKnots(plan)
  const placement = placeFiles(plan, projectFiles)

  const fileRow = (path: string, global: boolean): React.JSX.Element => (
    <li className="plan-file-row" key={path}>
      <button className="plan-file-path" onClick={() => onOpenFile(path)} title={path}>
        {path}
      </button>
      <Button variant="link"
        onClick={() => onChange(setGlobalFile(plan, path, !global))}
      >
        {global ? 'unmark' : 'global'}
      </Button>
    </li>
  )

  return (
    <div className="outline-structure">
      {all.length === 0 ? (
        <Hint>
          Nothing planned yet. Add an act on the board, or paste an outline you already have.
        </Hint>
      ) : (
        <>
          <Hint tight>
            {all.length} section{all.length === 1 ? '' : 's'} · {scenes.length} Scene
            {scenes.length === 1 ? '' : 's'}, each with one Ink file.
          </Hint>

          {clashes.length > 0 && (
            <p className="codex-warning">
              {clashes.length === 1 ? 'One name is' : 'Some names are'} claimed twice (
              {clashes.join(', ')}). Scene Ink knots must be unique.
            </p>
          )}

          <ul className="outline-tree">
            {plan.nodes.map((node) => (
              <Node key={node.id} node={node} depth={0} />
            ))}
          </ul>
        </>
      )}

      <Field as="div" label="Global ink" about={copy('plan.storyWide')}>
        {placement.globals.length === 0 ? (
          <Hint tight>None. An overworld map or shared functions would go here.</Hint>
        ) : (
          <ul className="plan-file-list">{placement.globals.map((path) => fileRow(path, true))}</ul>
        )}
      </Field>

      {placement.unassigned.length > 0 && (
        <Field as="div" label="Unassigned" about={copy('plan.loose')}>
          <ul className="plan-file-list">
            {placement.unassigned.map((path) => fileRow(path, false))}
          </ul>
        </Field>
      )}

      <Button onClick={onImport}><Icon name="clipboard-paste" size={13} />Paste an outline…</Button>
    </div>
  )
}
