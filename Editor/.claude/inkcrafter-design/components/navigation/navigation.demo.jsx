const VIEWS = [{value:'editor',label:'Editor',hint:'Ctrl+1'},{value:'manuscript',label:'Manuscript',hint:'Ctrl+2'},{value:'plan',label:'Plan',hint:'Ctrl+3'},{value:'game',label:'Game',hint:'Ctrl+4'}];
const PANES = [{value:'media',label:'Media',count:2},{value:'stats',label:'Stats & items'},{value:'cast',label:'Cast'},{value:'map',label:'Map'}];

export function Demo() {
  const [view, setView] = React.useState('editor');
  const [pane, setPane] = React.useState('media');
  return (
    <div className="demo" style={{gap:16}}>
      <div style={{border:'1px solid var(--border-hairline)',borderRadius:'var(--radius-md)',overflow:'hidden'}}>
        <Toolbar>
          <ToolbarBrand><Icon name="feather" size={15} />Breedhaven</ToolbarBrand>
          <Tabs items={VIEWS} value={view} onChange={setView} label="View" />
          <ToolbarFile><Icon name="file-text" size={12} />chapter3.ink</ToolbarFile>
          <ToolbarSpacer />
          <IconButton icon="search" label="Commands (Ctrl+K)" />
          <StatusPill state="ok">Compiled in 32ms</StatusPill>
        </Toolbar>
        <Tabs level="pane" items={PANES} value={pane} onChange={setPane} label="Catalogue"
          trail={<><IconButton icon="rotate-ccw" label="Rescan" size="sm" /><IconButton icon="folder" label="Open folder" size="sm" /></>} />
        <PaneHeader title="Breedhaven" actions={<><IconButton icon="settings" label="Project settings" size="sm" /><IconButton icon="folder" label="Reveal folder" size="sm" /></>} />
        <GroupLabel>ink / act-one</GroupLabel>
      </div>
      <div className="line"><span className="cap">palette</span>
        <div className="ic-palette" style={{width:340}}>
          <input className="ic-palette__input" defaultValue="cast" />
          <div className="ic-palette__list">
            <div className="ic-palette__section">Project</div>
            <button className="ic-palette__item is-highlighted"><Icon name="users" size={14} />Manage cast<Kbd>Ctrl+Shift+C</Kbd></button>
            <button className="ic-palette__item"><Icon name="package" size={14} />Stats &amp; items<Kbd>Ctrl+Shift+S</Kbd></button>
          </div>
        </div>
      </div>
    </div>
  );
}
