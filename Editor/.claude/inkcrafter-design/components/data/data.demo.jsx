export function Demo() {
  const [sel, setSel] = React.useState('main.ink');
  return (
    <div className="demo">
      <div className="line" style={{alignItems:'flex-start',gap:20}}>
        <div style={{width:250}}>
          {['chapter1.ink','main.ink','state.ink'].map((file) => (
            <ListRow key={file} icon="file-text" mono name={file} selected={sel===file} onClick={() => setSel(file)}
              dirty={file==='state.ink'}
              trail={file==='main.ink' ? <Badge variant="accent">main</Badge> : file==='chapter1.ink' ? <Badge variant="zero">0</Badge> : null} />
          ))}
          <ListRow icon="users" name="Kael" meta="2 looks · 14 mentions" trail={<Badge variant="branch">npc</Badge>} />
        </div>
        <Card status="drafting" interactive style={{width:290}}>
          <CardHead><CardTitle>The Cove</CardTitle><Badge>3 scenes</Badge><IconButton icon="maximize-2" label="Expand" size="sm" /></CardHead>
          <CardSummary>Kael finds the boat, and decides whether the crossing is still on the table.</CardSummary>
          <ChipRow>
            <Chip mono>coast</Chip>
            <Chip variant="detected" onClick={() => {}}>Kael</Chip>
            <Chip mono onRemove={() => {}}>chapter3.ink</Chip>
          </ChipRow>
          <CardFoot><code>the_cove</code><span>3 scenes</span></CardFoot>
        </Card>
      </div>
      <div className="line"><span className="cap">thumbs</span>
        <Thumb size="sm" label="png" /><Thumb size="md" label="1920" /><Thumb size="sm" missing />
        <div style={{width:120}}><Placeholder label="background 16:9" style={{aspectRatio:'16/9'}} /></div>
      </div>
    </div>
  );
}
