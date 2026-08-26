import React, { useState } from 'react'

/** The board: acts as columns, chapters as cards. */
export function PlanScreen({ acts, onExpand }) {
  const [mode, setMode] = useState('grid')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="ic-tabs ic-tabs--pane" style={{ alignItems: 'center', gap: 10 }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'grid', label: 'Grid' }, { value: 'matrix', label: 'Matrix' }]} />
        <span className="ic-tabs__trail">
          <Button variant="quiet" size="sm" icon="clipboard-paste">Paste an outline…</Button>
        </span>
      </div>

      {mode === 'grid' ? (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16, background: 'var(--surface-canvas)' }}>
          {acts.map((act) => (
            <section key={act.title} style={{ flex: 'none', width: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className="ic-input ic-input--sm" defaultValue={act.title} aria-label="Act title"
                  style={{ background: 'transparent', border: '1px solid transparent', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)', paddingLeft: 6 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{act.chapters.length} ch</span>
                <IconButton icon="maximize-2" label={'Expand ' + act.title} size="sm" onClick={onExpand} />
              </header>
              {act.summary && <p style={{ margin: 0, padding: '0 6px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>{act.summary}</p>}

              {act.chapters.map((chapter) => (
                <Card key={chapter.title} status={chapter.status} interactive>
                  <CardHead>
                    <CardTitle>{chapter.title}</CardTitle>
                    <Select size="sm" defaultValue={chapter.status} aria-label={'Status of ' + chapter.title} style={{ width: 92 }}>
                      <option value="">—</option><option value="planned">Planned</option>
                      <option value="drafting">Drafting</option><option value="done">Done</option>
                    </Select>
                    <IconButton icon="maximize-2" label={'Expand ' + chapter.title} size="sm" onClick={onExpand} />
                  </CardHead>
                  {chapter.summary
                    ? <CardSummary>{chapter.summary}</CardSummary>
                    : <CardSummary empty>No summary yet.</CardSummary>}
                  {(chapter.tags.length > 0 || chapter.cast.length > 0) && (
                    <ChipRow>
                      {chapter.tags.map((tag) => <Chip key={tag} mono>{tag}</Chip>)}
                      {chapter.cast.map((name) => <Chip key={name} variant="detected" onClick={() => {}}>{name}</Chip>)}
                    </ChipRow>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {chapter.files.map((path) => (
                      <span key={path} className="ic-chip ic-chip--mono">
                        <button type="button">{path}</button>
                        <button type="button" className="ic-chip__x" aria-label={'Detach ' + path}>×</button>
                      </span>
                    ))}
                    <Select size="sm" defaultValue="" aria-label="Attach a file" style={{ width: 108 }}>
                      <option value="">+ ink file…</option><option>chapter2.ink</option><option>chapter5.ink</option>
                    </Select>
                  </div>
                  <CardFoot><code>{chapter.knot}</code>{chapter.scenes > 0 && <span>{chapter.scenes} scenes</span>}</CardFoot>
                </Card>
              ))}
              <Button variant="quiet" icon="plus" block>Add chapter</Button>
            </section>
          ))}
          <section style={{ flex: 'none', width: 300, display: 'flex', gap: 6 }}>
            <Input placeholder="New act…" aria-label="New act title" />
            <Button>Add act</Button>
          </section>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--surface-canvas)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr>
                <th style={{ padding: 8, textAlign: 'left', color: 'var(--text-faint)', fontWeight: 500 }}></th>
                {['Kael', 'Maren', 'The Warden'].map((name) => (
                  <th key={name} style={{ padding: 8, color: 'var(--text-tertiary)', fontWeight: 500, writingMode: 'vertical-rl', height: 84 }}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acts.flatMap((act) => act.chapters).map((chapter) => (
                <tr key={chapter.title}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, borderTop: '1px solid var(--border-hairline)' }}>{chapter.title}</th>
                  {['Kael', 'Maren', 'The Warden'].map((name) => (
                    <td key={name} style={{ width: 34, textAlign: 'center', borderTop: '1px solid var(--border-hairline)', borderLeft: '1px solid var(--border-hairline)', background: chapter.cast.includes(name) ? 'var(--accent-branch-quiet)' : 'transparent', color: 'var(--accent-branch)' }}>
                      {chapter.cast.includes(name) ? '•' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
