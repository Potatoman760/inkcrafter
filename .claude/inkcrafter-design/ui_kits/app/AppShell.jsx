import React, { useEffect, useState } from 'react'

/**
 * The whole window: toolbar, five-column workspace, diagnostics strip,
 * overlays. Mirrors App.tsx — same grid, same splitters, same dock.
 */
export function AppShell({ project, files, codex, ink, diagnostics, plan, media, stats, items, cast, hotspots, manuscript, commands }) {
  const [running, setRunning] = useState(!window.KIT_FIRST_RUN)
  const [view, setView] = useState(window.KIT_VIEW || 'editor')
  const [activeFile, setActiveFile] = useState('ink/chapter3.ink')
  const [sidebarWidth, setSidebarWidth] = useState(232)
  const [sideWidth, setSideWidth] = useState(420)
  const [overlay, setOverlay] = useState(null)
  const [menuAt, setMenuAt] = useState(null)
  const [section, setSection] = useState(0)
  const [toasts, setToasts] = useState([{ id: 1, tone: 'ok', title: 'Wrote ink/state.ink', detail: '+1 INCLUDE in main.ink' }])

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOverlay((current) => (current === 'palette' ? null : 'palette'))
      }
      if (event.key === 'Escape') { setOverlay(null); setMenuAt(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!running) return <FirstRun onOpen={() => setRunning(true)} />

  const errors = diagnostics.filter((item) => item.severity === 'error').length
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length
  const shown = view === 'editor' ? diagnostics : []

  const fileLabel = view === 'plan' ? 'plan.md' : view === 'game' ? 'media.json' : view === 'manuscript' ? manuscript.entryLabel : activeFile

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', background: 'var(--surface-canvas)' }}>
      <Toolbar>
        <ToolbarBrand style={{ width: sidebarWidth + 5 }}><Icon name="feather" size={15} style={{ color: 'var(--accent-signal)' }} />{project.title}</ToolbarBrand>
        <Tabs label="View" value={view} onChange={setView} items={[
          { value: 'editor', label: 'Editor', hint: 'Ctrl+1' },
          { value: 'manuscript', label: 'Manuscript', hint: 'Ctrl+2' },
          { value: 'plan', label: 'Plan', hint: 'Ctrl+3' },
          { value: 'game', label: 'Game', hint: 'Ctrl+4' }
        ]} />
        <ToolbarFile><Icon name="file-text" size={12} />{fileLabel}{view === 'editor' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-caution)' }} title="Unsaved changes" />}</ToolbarFile>
        <ToolbarSpacer />
        <IconButton icon="search" label="Commands (Ctrl+K)" onClick={() => setOverlay('palette')} />
        <IconButton icon="settings" label="Settings" onClick={() => setOverlay('settings')} />
        <StatusPill state={errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'ok'}>
          {errors > 0 ? errors + ' error' + (errors === 1 ? '' : 's') : 'Compiled in 32ms'}
          {warnings > 0 && ' · ' + warnings + ' warning'}
        </StatusPill>
      </Toolbar>

      <main style={{ display: 'grid', gridTemplateColumns: sidebarWidth + 'px auto minmax(0,1fr) auto ' + sideWidth + 'px', minHeight: 0, overflow: 'hidden' }}>
        <SidebarPane files={files} codex={codex} activeFile={activeFile} onSelectFile={setActiveFile} onOpenSettings={() => setOverlay('project')} />
        <Splitter value={sidebarWidth} onChange={setSidebarWidth} min={160} max={480} reset={232} label="Resize the sidebar" />

        {/* Toasts live in this pane, so they cannot reach the dock's composer
            or the diagnostics strip. */}
        <section style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {view === 'editor' && (
            <>
              <PaneHeader title={activeFile} actions={<>
                <Button variant="quiet" size="sm" icon="book-open">Read</Button>
                <IconButton icon="wand-sparkles" label="Draft with the assistant" size="sm" />
              </>} />
              <EditorScreen lines={ink} activeLine={40} onContextMenu={(event) => { event.preventDefault(); setMenuAt({ x: event.clientX, y: event.clientY }) }} />
            </>
          )}
          {view === 'manuscript' && <ManuscriptScreen manuscript={manuscript} selected={section} onSelect={setSection} />}
          {view === 'plan' && <PlanScreen acts={plan} onExpand={() => {}} />}
          {view === 'game' && <GameScreen media={media} stats={stats} items={items} cast={cast} hotspots={hotspots} />}
          <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
        </section>

        <Splitter value={sideWidth} onChange={setSideWidth} min={260} max={720} reset={420} invert label="Resize the right panel" />
        <DockPanel view={view} />
      </main>

      <Diagnostics items={shown} emptyLabel="No problems" />

      {overlay === 'settings' && <SettingsOverlay onClose={() => setOverlay(null)} />}
      {overlay === 'project' && <ProjectOverlay onClose={() => setOverlay(null)} />}
      {overlay === 'palette' && <CommandPalette commands={commands} onRun={() => setOverlay(null)} onClose={() => setOverlay(null)} />}
      {menuAt && <InkMenu at={menuAt} onClose={() => setMenuAt(null)} />}
    </div>
  )
}
