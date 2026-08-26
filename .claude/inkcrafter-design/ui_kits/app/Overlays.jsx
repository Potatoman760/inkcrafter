import React from 'react'

/** Settings, project setup, the ink right-click menu, and toasts. */
export function SettingsOverlay({ onClose }) {
  return (
    <Dialog title="Settings" size="lg" onClose={onClose} flush
      footer={<><span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Keys are stored in your OS keychain.</span><DialogSpacer /><Button onClick={onClose}>Close</Button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '176px 1fr', minHeight: 0, flex: 1 }}>
        <nav style={{ borderRight: '1px solid var(--border-hairline)', background: 'var(--surface-pane)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[['AI providers', true], ['Editor', false], ['Appearance', false], ['Keyboard', false]].map(([label, active]) => (
            <ListRow key={label} name={label} selected={active} />
          ))}
        </nav>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16, minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="ic-group-label" style={{ padding: '0 0 2px' }}>Providers</div>
              <ListRow name="Z.ai" meta="glm-5.2" selected trail={<Badge variant="accent">active</Badge>} />
              <ListRow name="Local" meta="llama.cpp" />
              <Button variant="quiet" size="sm" icon="plus">Add provider</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Name"><Input defaultValue="Z.ai" /></Field>
              <Field label="Base URL" hint="OpenAI-compatible /v1 endpoint."><Input mono defaultValue="https://api.z.ai/api/paas/v4" /></Field>
              <Field label="API key"><Input type="password" defaultValue="sk-live-8f2c" /></Field>
              <Field label="Model" hint="Type to filter the provider's catalogue.">
                <Input mono defaultValue="zai-org/glm-5.2" />
              </Field>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button size="sm" icon="plug">Test connection</Button>
                <span className="ic-pill ic-pill--ok"><span className="ic-pill__dot" />reachable · 312ms</span>
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="danger">Remove</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

export function ProjectOverlay({ onClose }) {
  return (
    <Dialog title="Project settings" subtitle="~/InkCrafter/breedhaven" onClose={onClose}
      footer={<><Button variant="danger" size="sm">Delete project</Button><DialogSpacer /><Button onClick={onClose}>Cancel</Button><Button variant="primary">Save</Button></>}>
      <Field label="Title"><Input defaultValue="Breedhaven" /></Field>
      <Field label="Description" hint="Shown on the start screen."><Textarea rows={2} defaultValue="A ferry town that stops paying the tithe." /></Field>
      <Field label="Entry point" hint="Compilation and the manuscript both start here.">
        <Select defaultValue="ink/main.ink"><option>ink/main.ink</option><option>ink/chapter1.ink</option></Select>
      </Field>
      <div>
        <div className="ic-group-label" style={{ padding: '0 0 6px' }}>Codex libraries</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
            <Checkbox label="Breedhaven cast" defaultChecked />
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>6 entries</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
            <Checkbox label="Shared world lore" />
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>21 entries</span>
          </div>
          <Button variant="link">manage libraries…</Button>
        </div>
      </div>
    </Dialog>
  )
}

export function InkMenu({ at, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onMouseDown={onClose}>
      <Menu label="line 41 · in knot the_cove" style={{ position: 'absolute', left: at.x, top: at.y }} onMouseDown={(event) => event.stopPropagation()}>
        <MenuItem icon="git-branch" keys="Ctrl+Alt+C">Add a choice…</MenuItem>
        <MenuItem icon="package">Give an item…</MenuItem>
        <MenuItem icon="sliders-horizontal">Change a stat…</MenuItem>
        <MenuItem icon="users">Set a cast mood…</MenuItem>
        <MenuSeparator />
        <MenuItem icon="image">Set the background…</MenuItem>
        <MenuItem icon="lock">Gate this choice…</MenuItem>
        <MenuSeparator />
        <MenuItem icon="book-open">Open Kael in the codex</MenuItem>
        <MenuItem icon="trash-2" danger>Delete this line</MenuItem>
      </Menu>
    </div>
  )
}

export function Toasts({ toasts, onDismiss }) {
  return (
    <ToastStack>
      {toasts.map((toast) => <Toast key={toast.id} tone={toast.tone} title={toast.title} detail={toast.detail} onDismiss={() => onDismiss(toast.id)} />)}
    </ToastStack>
  )
}
