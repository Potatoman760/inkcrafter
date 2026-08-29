export function Demo() {
  const [mode, setMode] = React.useState('grid');
  return (
    <div className="demo">
      <div className="line"><span className="cap">buttons</span>
        <Button variant="primary" icon="plus">Add chapter</Button>
        <Button>Rescan</Button>
        <Button variant="quiet" icon="folder">Open folder</Button>
        <Button variant="danger" icon="trash-2">Delete</Button>
        <Button variant="link">detach</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="line"><span className="cap">sizes</span>
        <Button size="xs">xs</Button><Button size="sm">sm</Button><Button>md</Button><Button size="lg">lg</Button>
        <IconButton icon="settings" label="Settings" /><IconButton icon="panel-right" label="Dock" active />
      </div>
      <div className="line" style={{alignItems:'flex-start'}}><span className="cap">inputs</span>
        <div style={{width:200}}><Field label="New file" hint="Enter adds it to ink/."><Input mono placeholder="ink/act-two" /></Field></div>
        <div style={{width:150}}><Field label="Status"><Select defaultValue="drafting"><option value="">—</option><option value="planned">Planned</option><option value="drafting">Drafting</option><option value="done">Done</option></Select></Field></div>
        <div style={{width:160}}><Field label="Range" error="Max must exceed min."><Input defaultValue="10" invalid /></Field></div>
      </div>
      <div className="line" style={{alignItems:'flex-start'}}><span className="cap">more</span>
        <div style={{width:240}}><Textarea rows={2} placeholder="What happens here." /></div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          <Checkbox label="Link this library" defaultChecked />
          <Checkbox label="Bundle media" />
        </div>
        <Segmented value={mode} onChange={setMode} options={[{value:'grid',label:'Grid'},{value:'matrix',label:'Matrix'}]} />
      </div>
    </div>
  );
}
