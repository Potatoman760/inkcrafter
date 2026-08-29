import React from 'react'

/** The start screen. Nothing useful exists until a project is chosen. */
export function FirstRun({ onOpen }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 400px', background: 'var(--surface-canvas)' }}>
      <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <div style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--text-display)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Ink<span style={{ color: 'var(--accent-signal)' }}>Crafter</span>
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>Choose a project, or start a new one.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[['Breedhaven', 'A ferry town that stops paying the tithe.', '2 libraries · 7 ink files'],
              ['The Signal', 'Five chapters, seeded and empty.', '1 library · 5 ink files']].map(([title, blurb, meta]) => (
              <button key={title} type="button" className="ic-row" onClick={onOpen}
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '10px 12px', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface-raised)' }}>
                <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>{blurb}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{meta}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <Input placeholder="New project title…" aria-label="New project title" />
            <Button variant="primary">Create</Button>
          </div>

          <Button variant="link" style={{ alignSelf: 'flex-start' }}>Open the data folder</Button>
        </div>
      </div>

      <aside style={{ borderLeft: '1px solid var(--border-hairline)', background: 'var(--surface-pane)', display: 'flex', flexDirection: 'column' }}>
        <PaneHeader title="Assistant" />
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 1.55, color: 'var(--text-faint)' }}>
            It can read and write files in your workspace — projects, plans, ink and codex entries. It cannot reach anything outside it.
          </p>
          {['Create a new project called The Signal, with 5 chapters, and seed each chapter with an ink file.', 'List what is in my workspace.'].map((suggestion) => (
            <button key={suggestion} type="button" className="ic-row"
              style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.45, padding: '8px 10px', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)' }}>
              {suggestion}
            </button>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Textarea rows={3} placeholder="Ask it to build something…" aria-label="Message the assistant" />
          <Button variant="primary" size="sm" style={{ alignSelf: 'flex-end' }}>Send</Button>
        </div>
      </aside>
    </div>
  )
}
