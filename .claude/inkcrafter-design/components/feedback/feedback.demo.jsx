const DIAGS = [
  {severity:'error',line:41,message:"Expected a knot name after '->'."},
  {severity:'warning',line:12,message:'main.ink includes state.ink twice.'},
  {severity:'todo',line:88,file:'chapter4.ink',message:'TODO: write the refusal branch.'}
];

export function Demo() {
  return (
    <div className="demo">
      <div className="line"><span className="cap">status</span>
        <StatusPill state="ok">Compiled in 32ms</StatusPill>
        <StatusPill state="warn">1 warning</StatusPill>
        <StatusPill state="error">2 errors</StatusPill>
        <StatusPill state="busy">Compiling…</StatusPill>
      </div>
      <div style={{border:'1px solid var(--border-hairline)',borderRadius:'var(--radius-md)',overflow:'hidden'}}>
        <Diagnostics items={DIAGS} />
      </div>
      <div className="line" style={{alignItems:'flex-start',gap:20}}>
        <div style={{width:290,border:'1px solid var(--border-hairline)',borderRadius:'var(--radius-md)',display:'flex'}}>
          <EmptyState title="No ink files yet" body="Chapters live as .ink files inside this project's folder." action={<Button variant="primary" size="sm" icon="plus">New file</Button>} />
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8,width:300}}>
          <Toast tone="ok" title="Wrote ink/state.ink" detail="+1 INCLUDE in main.ink" onDismiss={() => {}} />
          <div><div style={{display:'flex',justifyContent:'space-between',fontSize:'var(--text-xs)',color:'var(--text-tertiary)'}}><span>trust</span><span style={{fontFamily:'var(--font-mono)'}}>6 / 10</span></div><Meter value={6} max={10} /></div>
          <Hint>Images live in <code>media/</code>. Add them there and press rescan.</Hint>
        </div>
      </div>
    </div>
  );
}
