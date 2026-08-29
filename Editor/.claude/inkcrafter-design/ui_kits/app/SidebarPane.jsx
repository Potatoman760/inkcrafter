import React, { useState } from 'react'

/** The left column: Files or Codex, as the app's `.codex` aside. */
export function SidebarPane({ files, codex, activeFile, onSelectFile, onOpenSettings }) {
  const [tab, setTab] = useState('files')
  const [selectedEntry, setSelectedEntry] = useState('k')
  const folders = [...new Set(files.map((file) => file.path.split('/').slice(0, -1).join('/')))]
  const types = [...new Set(codex.map((entry) => entry.type))]

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', borderRight: '1px solid var(--border-hairline)', background: 'var(--surface-pane)' }}>
      <Tabs level="pane" label="Sidebar" value={tab} onChange={setTab}
        items={[{ value: 'files', label: 'Files' }, { value: 'codex', label: 'Codex' }]} />

      {tab === 'files' ? (
        <>
          <PaneHeader title="Breedhaven" actions={
            <>
              <IconButton icon="settings" label="Project settings" size="sm" onClick={onOpenSettings} />
              <IconButton icon="folder-open" label="Reveal in file manager" size="sm" />
            </>
          } />
          <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border-hairline)' }}>
            <Input size="sm" mono placeholder="ink/act-two" aria-label="New file" />
            <Button size="sm" variant="primary" icon="plus" aria-label="Add file">Add</Button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 4 }}>
            {folders.map((folder) => (
              <section key={folder}>
                <GroupLabel>{folder || 'root'}</GroupLabel>
                {files.filter((file) => file.path.startsWith(folder + '/')).map((file) => {
                  const name = file.path.split('/').pop()
                  return (
                    <ListRow key={file.path} icon="file-text" mono name={name}
                      selected={file.path === activeFile}
                      dirty={name === 'chapter3.ink'}
                      onClick={() => onSelectFile(file.path)}
                      title={file.path + ' — double-click to edit'}
                      trail={file.path === 'ink/main.ink' ? <Badge variant="accent">main</Badge>
                        : name === 'state.ink' ? <Badge>generated</Badge> : null} />
                  )
                })}
              </section>
            ))}
          </div>
          <Hint>Chapters are ink files. <code>state.ink</code> is written for you by the catalogues.</Hint>
        </>
      ) : (
        <>
          <PaneHeader title="Codex" actions={<Button variant="link" onClick={onOpenSettings}>libraries</Button>} />
          <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border-hairline)' }}>
            <Input size="sm" placeholder="New entry…" aria-label="New entry" />
            <Select size="sm" defaultValue="character" style={{ width: 96 }}>
              <option value="character">Character</option>
              <option value="location">Location</option>
              <option value="lore">Lore</option>
            </Select>
            <Button size="sm">Add</Button>
          </div>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border-hairline)' }}>
            <Input size="sm" placeholder="Filter by name or tag…" aria-label="Filter entries" />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 4 }}>
            {types.map((type) => (
              <section key={type}>
                <GroupLabel>{type}</GroupLabel>
                {codex.filter((entry) => entry.type === type).map((entry) => (
                  <div key={entry.id}>
                    <ListRow name={<>{entry.name}{entry.folder && <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', marginLeft: 6 }}>{entry.folder}</span>}</>}
                      selected={entry.id === selectedEntry}
                      onClick={() => setSelectedEntry(entry.id)}
                      trail={<Badge variant={entry.count === 0 ? 'zero' : 'default'}>{entry.count}</Badge>} />
                    {entry.id === selectedEntry && (
                      <div style={{ padding: '8px 12px 12px 16px', borderLeft: '2px solid var(--border-default)', margin: '2px 0 8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                          Ferryman's daughter. Refuses the tithe before anyone else does.
                        </p>
                        <ChipRow><Chip mono>coast</Chip><Chip mono>refuser</Chip></ChipRow>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{entry.count} mentions here</span>
                          <Button variant="link">edit</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
