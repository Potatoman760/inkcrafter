const SET = ['file-text','folder','book-open','map','users','package','image','sparkles','play','git-branch','panel-right','search','settings','plus','x','chevron-right','circle-alert','triangle-alert','check','rotate-ccw','maximize-2','trash-2'];

export function Demo() {
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:14}}>
      {SET.map((name) => (
        <div key={name} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,width:58,color:'var(--text-secondary)'}}>
          <Icon name={name} size={17} />
          <span style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--text-faint)',textAlign:'center',lineHeight:1.2}}>{name}</span>
        </div>
      ))}
    </div>
  );
}
