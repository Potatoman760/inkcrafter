import { useEffect, useState } from 'react'
import {
  BINDING_SLOTS,
  ROLE_LABELS,
  SLOT_LABELS,
  WORKFLOW_ROLES,
  type BindingSlot,
  type NodeField,
  type WorkflowRole,
  type WorkflowSummary
} from '@shared/comfy'
import { Button, Checkbox, Field, Hint, Input, Segmented, Select } from '../design/components'
import { copy } from '@shared/copy'

/**
 * Where in one workflow each of the app's values goes.
 *
 * The app reads a graph and works this out, and is right most of the time —
 * but a graph with two samplers, or three text nodes feeding a combine, has no
 * single right answer, and the author is the one who knows which they meant.
 * So every slot shows what was chosen, *why* it was chosen, and a way to say
 * otherwise.
 *
 * The note under each row is the point. "followed KSampler #3 positive →
 * CLIPTextEncode #6 text" is checkable at a glance against what they built; a
 * bare node number is something to take on faith.
 *
 * Takes its data and its setters as props, like `ModelPicker`, so it can be
 * driven in a test without a window or a running ComfyUI.
 */
export function BindingEditor({
  workflow,
  promptPrefix,
  onSet,
  onClear,
  onRole,
  onDefault,
  onPromptPrefix,
  siblings
}: {
  workflow: WorkflowSummary
  promptPrefix: string
  onSet: (slot: BindingSlot, at: NodeField | null) => void
  onClear: (slot: BindingSlot) => void
  onRole: (role: WorkflowRole | null) => void
  onDefault: (isDefault: boolean) => void
  onPromptPrefix: (prefix: string | null) => void
  /** How many workflows share this one's role, this one included. */
  siblings: number
}): React.JSX.Element {
  const { analysis, problem, bindings, override } = workflow
  const [prefixDraft, setPrefixDraft] = useState(promptPrefix)

  // A workflow switch replaces the field; a save round-trip refreshes it.
  useEffect(() => setPrefixDraft(promptPrefix), [workflow.file, promptPrefix])

  const commitPrefix = (): void => {
    if (prefixDraft === promptPrefix) return
    onPromptPrefix(prefixDraft.trim().length > 0 ? prefixDraft : null)
  }

  if (!analysis) {
    return (
      <div className="comfy-bindings">
        <Hint tone="error">{problem ?? 'This workflow could not be read.'}</Hint>
      </div>
    )
  }

  /** Moving a slot to another node keeps the field name where it can. */
  const moveTo = (slot: BindingSlot, nodeId: string): void => {
    if (nodeId.length === 0) {
      onSet(slot, null)
      return
    }

    const node = analysis.nodes.find((one) => one.id === nodeId)
    const current = bindings[slot]?.field
    const keeps = current && node?.fields.some((one) => one.name === current)
    const field = keeps ? current : (node?.fields[0]?.name ?? 'images')

    onSet(slot, { node: nodeId, field })
  }

  return (
    <div className="comfy-bindings">
      {/* What the workflow is for comes first: it decides which requests reach
          this workflow at all, and which slots below are even meaningful. */}
      <Field as="div" label="What it does">
        <div className="detail-row">
          <Segmented
            value={workflow.role}
            label="What this workflow does"
            options={WORKFLOW_ROLES.map((role) => ({
              value: role,
              label: ROLE_LABELS[role]
            }))}
            onChange={(value) => onRole(value as WorkflowRole)}
          />
          {workflow.roleByHand && (
            <Button variant="link" onClick={() => onRole(null)}>
              auto
            </Button>
          )}
        </div>

        {workflow.roleByHand ? (
          <Hint tight>Set by hand.</Hint>
        ) : (
          <Hint tight>{analysis.roleNote}</Hint>
        )}

        {/* Only where there is a choice. The only workflow of its kind is
            already the one that gets used, and a tick that cannot be unticked
            is a control that does nothing. */}
        {siblings > 1 ? (
          <Checkbox
            label={
              workflow.role === 'edits'
                ? 'Use this when the assistant is asked to work from a picture'
                : 'Use this when the assistant is asked to draw something new'
            }
            checked={workflow.isDefault}
            onChange={(event) => onDefault(event.target.checked)}
          />
        ) : (
          <Hint tight>
            The only workflow that {workflow.role === 'edits' ? 'edits' : 'creates'}, so this is
            the one used when the assistant names none.
          </Hint>
        )}
      </Field>

      <Field label="Prompt prefix" about={copy('comfy.promptPrefix')}>
        <Input
          mono
          value={prefixDraft}
          placeholder="<lora:character_style:1>,"
          aria-label="Prompt prefix"
          onChange={(event) => setPrefixDraft(event.target.value)}
          onBlur={commitPrefix}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </Field>

      {analysis.problems.map((one) => (
        <Hint key={one} tone="error">
          {one}
        </Hint>
      ))}

      {BINDING_SLOTS.filter((slot) => slot !== 'image' || workflow.role === 'edits').map((slot) => {
        const at = bindings[slot]
        const node = at ? analysis.nodes.find((one) => one.id === at.node) : undefined
        const edited = slot in override

        return (
          <Field
            as="div"
            key={slot}
            label={SLOT_LABELS[slot]}
            note={slot === 'output' ? copy('comfy.output') : undefined}
          >
            <div className="detail-row">
              <Select
                value={at?.node ?? ''}
                aria-label={`${SLOT_LABELS[slot]} node`}
                onChange={(event) => moveTo(slot, event.target.value)}
              >
                <option value="">not bound</option>
                {analysis.nodes.map((one) => (
                  <option key={one.id} value={one.id}>
                    #{one.id} {one.classType}
                    {one.title ? ` — ${one.title}` : ''}
                  </option>
                ))}
              </Select>

              {/* Nothing is written to the output node; only its identity is
                  used, so there is no field to choose. */}
              {slot !== 'output' && (
                <Select
                  size="sm"
                  value={at?.field ?? ''}
                  disabled={!at}
                  aria-label={`${SLOT_LABELS[slot]} input`}
                  onChange={(event) => at && onSet(slot, { node: at.node, field: event.target.value })}
                >
                  {!at && <option value="">—</option>}
                  {node?.fields.map((one) => (
                    <option key={one.name} value={one.name}>
                      {one.name}
                    </option>
                  ))}
                </Select>
              )}

              {edited && (
                <Button variant="link" onClick={() => onClear(slot)}>
                  auto
                </Button>
              )}
            </div>

            {edited ? (
              <Hint tight>Set by hand.</Hint>
            ) : (
              analysis.notes[slot] && <Hint tight>{analysis.notes[slot]}</Hint>
            )}
          </Field>
        )
      })}
    </div>
  )
}
