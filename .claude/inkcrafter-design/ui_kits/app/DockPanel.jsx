import React, { useState } from 'react'

const TABS = {
  editor: [{ value: 'assistant', label: 'Assistant' }, { value: 'preview', label: 'Preview' }, { value: 'write', label: 'Write' }],
  manuscript: [{ value: 'assistant', label: 'Assistant' }, { value: 'reading', label: 'Reading' }, { value: 'write', label: 'Write' }],
  plan: [{ value: 'assistant', label: 'Assistant' }, { value: 'structure', label: 'Structure' }],
  game: [{ value: 'assistant', label: 'Assistant' }, { value: 'preview', label: 'Preview' }]
};

/** The right-hand dock. One tab strip, the same in every view. */
export function DockPanel({ view }) {
  const tabs = TABS[view] || TABS.editor
  const [tab, setTab] = useState('assistant')
  const active = tabs.some((candidate) => candidate.value === tab) ? tab : tabs[0].value

  return (
    <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', borderLeft: '1px solid var(--border-hairline)', background: 'var(--surface-pane)' }}>
      <Tabs level="pane" label="Right panel" value={active} onChange={setTab} items={tabs} />
      {active === 'assistant' && <Assistant />}
      {active === 'preview' && <Preview />}
      {active === 'write' && <Write />}
      {active === 'reading' && <Reading />}
      {active === 'structure' && <Structure />}
    </section>
  )
}

function Assistant() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-hairline)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        <span>Working in <strong style={{ color: 'var(--text-primary)' }}>Breedhaven</strong></span>
        <span style={{ marginLeft: 'auto' }}><Select size="sm" defaultValue="glm" style={{ width: 132 }}><option value="glm">zai-org/glm-5.2</option></Select></span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <article style={{ alignSelf: 'flex-end', maxWidth: '86%', padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface-active)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
          Add a gated choice in the cove that needs the lantern.
        </article>

        <article style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[['read ink/chapter3.ink', true], ['edit ink/chapter3.ink · +4 lines', true], ['compile ink/main.ink', true]].map(([summary, ok]) => (
              <li key={summary} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name={ok ? 'check' : 'circle-alert'} size={11} style={{ color: ok ? 'var(--state-ok)' : 'var(--state-error)' }} />
                <button type="button" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{summary}</button>
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            Added a third option to <code>the_cove</code>, gated on <code>lantern</code>, diverting to a new <code>the_signal</code> knot. It compiles.
          </p>
        </article>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Try</span>
          {['List what is in my workspace.', 'Add a codex library with its three main characters.'].map((suggestion) => (
            <button key={suggestion} type="button" className="ic-row" style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', minHeight: 'auto', padding: '8px 10px', lineHeight: 1.45, whiteSpace: 'normal', display: 'block', color: 'var(--text-tertiary)' }}>
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderTop: '1px solid var(--border-hairline)' }}>
        <Textarea rows={3} placeholder="Ask it to build something…" aria-label="Message the assistant" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>Editor · chapter3.ink · 2 lines selected</span>
          <span style={{ flex: 1 }} />
          <Button variant="primary" size="sm" iconAfter="send">Send</Button>
        </div>
      </div>
    </div>
  )
}

function Preview() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 10 }}>
        <Placeholder label="stage · bg:cove/dawn + char:kael/wary" style={{ aspectRatio: '16/9' }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text-primary)' }}>
          The boat is still there, half-swamped and turned against the rocks.
        </p>
        <ChipRow><Chip mono variant="accent">bg:cove/dawn</Chip><Chip mono variant="accent">char:kael/wary</Chip></ChipRow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['Push it out', 'Wait for Kael to speak first'].map((choice) => (
            <button key={choice} type="button" className="ic-row" style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--accent-branch)' }}>
              <span className="ic-row__body"><span className="ic-row__name">{choice}</span></span>
            </button>
          ))}
          <button type="button" className="ic-row" disabled style={{ border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)', opacity: .55 }}>
            <span className="ic-row__body"><span className="ic-row__name">Light the lantern</span></span>
            <span className="ic-row__trail"><Badge variant="warn">needs lantern</Badge></span>
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderTop: '1px solid var(--border-hairline)' }}>
        <Button size="sm" icon="rotate-ccw">Restart</Button>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>trust 6 · coin 4</span>
      </div>
    </div>
  )
}

function Write() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 12, gap: 12, overflow: 'auto' }}>
      <Field label="What it will see" hint="Everything the prompt carries, so nothing is sent unseen.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface-pane)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          <span><strong style={{ color: 'var(--text-secondary)' }}>Knot</strong> <code>the_cove</code></span>
          <span><strong style={{ color: 'var(--text-secondary)' }}>Plan</strong> The Cove — Kael finds the boat…</span>
          <ChipRow><Chip variant="detected">Kael</Chip><Chip variant="detected">The Cove</Chip><Chip mono>trust</Chip><Chip mono>lantern</Chip></ChipRow>
        </div>
      </Field>
      <Field label="Instruction"><Textarea rows={4} placeholder="Add a refusal that costs trust." /></Field>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Segmented value="120" onChange={() => {}} options={[{ value: '60', label: '60w' }, { value: '120', label: '120w' }, { value: '240', label: '240w' }]} />
        <span style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon="sparkles">Draft</Button>
      </div>
      <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-pane)', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ fontSize: 'var(--text-2xs)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Draft</span>
          <span className="ic-pill ic-pill--ok" style={{ height: 18 }}><span className="ic-pill__dot" />compiles</span>
          <span style={{ flex: 1 }} />
          <Button size="xs" variant="quiet">Discard</Button>
          <Button size="xs" variant="primary">Insert</Button>
        </div>
        <pre style={{ margin: 0, padding: 10, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--syntax-text)', whiteSpace: 'pre-wrap' }}>
{'* [Say the tithe is paid] ~ trust -= 2\n    Kael does not look at you.\n    -> the_waiting'}
        </pre>
      </div>
    </div>
  )
}

function Reading() {
  /* ManuscriptOutline.tsx: an entry-file select, a recompile button with its
     caveat, then the junction list — chosen text, or "awaiting a choice". */
  const junctions = [
    { index: 1, text: 'Push it out' },
    { index: 2, text: 'awaiting a choice', pending: true }
  ];
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label={<>Read from <em style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>any file in the project</em></>}>
        <Select defaultValue="ink/main.ink">
          {['ink/main.ink', 'ink/chapter1.ink', 'ink/chapter3.ink'].map((path) => <option key={path}>{path}</option>)}
        </Select>
      </Field>
      <div>
        <Button size="sm" icon="rotate-ccw">Recompile and reread</Button>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-faint)' }}>
          The manuscript reads the saved file. Rereading recompiles it and puts you back on the same path, as far as the edited story still allows.
        </p>
      </div>
      <div>
        <div className="ic-group-label" style={{ padding: '0 0 4px' }}>Junctions</div>
        {junctions.map((junction) => (
          <ListRow key={junction.index} name={junction.text} selected={junction.index === 1}
            icon={junction.pending ? 'circle-dashed' : 'circle-dot'}
            meta={junction.pending ? undefined : 'choice ' + junction.index} />
        ))}
      </div>
    </div>
  )
}

function Structure() {
  /* PlanStructure.tsx: what the plan would generate — the tree with each
     node's knot, duplicate-knot warnings, then global and unassigned ink. */
  const TREE = [
    { title: 'Act One — The Tithe', knot: 'act_one', depth: 0 },
    { title: 'Arrival', knot: 'arrival', depth: 1 },
    { title: 'The Cove', knot: 'the_cove', depth: 1 },
    { title: 'The Warden Calls', knot: 'warden_calls', depth: 1 },
    { title: 'Act Two — The Crossing', knot: 'act_two', depth: 0 },
    { title: 'Open Water', knot: 'open_water', depth: 1 }
  ];
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
        6 sections · 4 would become knots. Nothing is generated yet.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {TREE.map((node) => (
          <div key={node.knot} style={{ paddingLeft: node.depth * 14 }}>
            <ListRow name={node.title} selected={node.knot === 'the_cove'}
              icon={node.depth === 0 ? 'chevron-down' : 'corner-down-right'}
              trail={<code style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{node.knot}</code>} />
          </div>
        ))}
      </div>

      <Field label={<>Global ink <em style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>belongs to the story, not a section</em></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="ic-row" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
              <span className="ic-row__body"><span className="ic-row__name">ink/state.ink</span></span>
            </button>
            <Button variant="link">unmark</Button>
          </div>
        </div>
      </Field>

      <Field label={<>Unassigned <em style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>in the project, placed nowhere</em></>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="ic-row" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
            <span className="ic-row__body"><span className="ic-row__name">ink/chapter5.ink</span></span>
          </button>
          <Button variant="link">global</Button>
        </div>
      </Field>

      <Button size="sm" icon="clipboard-paste">Paste an outline…</Button>
    </div>
  )
}
