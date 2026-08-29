export function Demo() {
  const [pick, setPick] = React.useState('trust');
  return (
    <div className="line" style={{alignItems:'flex-start',gap:18}}>
      <div style={{width:250}}>
        <Menu label="in knot the_cove">
          <MenuItem icon="git-branch" keys="Ctrl+Alt+C">Add a choice…</MenuItem>
          <MenuItem icon="package">Give an item…</MenuItem>
          <MenuItem icon="sliders-horizontal">Change a stat…</MenuItem>
          <MenuSeparator />
          <MenuItem icon="users" disabled>Set a cast mood…</MenuItem>
          <MenuItem icon="trash-2" danger>Delete this line</MenuItem>
        </Menu>
      </div>
      <div style={{flex:1,minWidth:340,height:290,display:'flex',flexDirection:'column',border:'1px solid var(--border-strong)',borderRadius:'var(--radius-lg)',background:'var(--surface-overlay)',overflow:'hidden'}}>
        <header className="ic-dialog__header"><h2 className="ic-dialog__title">Stats &amp; items</h2><span className="ic-dialog__subtitle">ink/state.ink</span></header>
        <MasterDetail masterWidth={130}
          master={<><div style={{padding:6}}><Input size="sm" placeholder="Filter…" /></div>
            <MasterList>
              {['trust','lantern','coin'].map((n) => <ListRow key={n} mono name={n} selected={pick===n} onClick={() => setPick(n)} />)}
            </MasterList></>}
          detail={<>
            <Field label="Name"><Input mono defaultValue={pick} /></Field>
            <Field label="Kind" inline><Select defaultValue="number"><option>number</option><option>flag</option></Select></Field>
            <Field label="Starts at" inline hint="Written into ink/state.ink on save."><Input defaultValue="0" /></Field>
          </>} />
        <footer className="ic-dialog__footer"><Button variant="danger" size="sm">Delete</Button><DialogSpacer /><Button size="sm">Cancel</Button><Button size="sm" variant="primary">Save</Button></footer>
      </div>
    </div>
  );
}
