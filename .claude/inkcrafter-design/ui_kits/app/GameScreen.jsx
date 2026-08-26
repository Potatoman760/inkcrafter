import React, { useState } from 'react'

/** The Game view: two rows of tabs, then one of four catalogues. */
export function GameScreen({ media, stats, items, cast, hotspots }) {
  const [section, setSection] = useState('media')
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs level="pane" label="Catalogue" value={section} onChange={setSection}
        items={[
          { value: 'media', label: 'Media', icon: 'image' },
          { value: 'stats', label: 'Stats & items', icon: 'package' },
          { value: 'cast', label: 'Cast', icon: 'users' },
          { value: 'map', label: 'Map', icon: 'map' }
        ]} />
      {section === 'media' && <MediaSection media={media} />}
      {section === 'stats' && <StatsSection stats={stats} items={items} />}
      {section === 'cast' && <CastSection cast={cast} />}
      {section === 'map' && <MapSection hotspots={hotspots} />}
    </div>
  )
}

function MediaSection({ media }) {
  const [kind, setKind] = useState('characters')
  const [picked, setPicked] = useState('kael')
  const list = media[kind] || []
  const asset = list.find((entry) => entry.name === picked) || list[0]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs level="sub" value={kind} onChange={setKind}
        items={[
          { value: 'characters', label: 'Characters', count: media.characters.length },
          { value: 'backgrounds', label: 'Backgrounds', count: media.backgrounds.length },
          { value: 'video', label: 'Video', count: 0 }
        ]}
        trail={<><Button variant="quiet" size="sm" icon="rotate-ccw">Rescan</Button><Button variant="quiet" size="sm" icon="folder-open">Open folder</Button></>} />

      <MasterDetail masterWidth={230}
        master={
          <>
            <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border-hairline)' }}>
              <Input size="sm" placeholder={'New ' + kind.slice(0, -1) + ', e.g. Wren'} aria-label="New asset" />
              <Button size="sm">Add</Button>
            </div>
            <div style={{ padding: 8, paddingBottom: 0 }}><Input size="sm" placeholder="Filter by name or tag…" aria-label="Filter" /></div>
            <MasterList>
              {list.map((entry) => (
                <ListRow key={entry.name} mono name={entry.name} meta={entry.looks + ' looks'}
                  selected={asset && entry.name === asset.name} onClick={() => setPicked(entry.name)}
                  trail={<Thumb size="sm" label={kind === 'characters' ? 'png' : '16:9'} />} />
              ))}
              {list.length === 0 && <Hint>No video assets yet.</Hint>}
            </MasterList>
          </>
        }
        detail={asset ? (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <Placeholder label={kind === 'characters' ? 'sprite 512×1024' : 'background 1920×1080'} style={{ width: 132, aspectRatio: kind === 'characters' ? '1/2' : '16/9' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Name"><Input mono defaultValue={asset.name} /></Field>
                <Field label="Tags" hint="Comma separated. Used to filter, not to reference."><Input defaultValue="coast, night" /></Field>
                <Field label="Reference in ink">
                  <code style={{ padding: '6px 8px', background: 'var(--surface-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', color: 'var(--syntax-tag)', fontSize: 'var(--text-xs)' }}>{'# ' + asset.tag}</code>
                </Field>
              </div>
            </div>

            <div>
              <div className="ic-group-label" style={{ padding: '0 0 6px' }}>Looks</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {['dawn', 'wary'].slice(0, asset.looks).map((look) => (
                  <div key={look} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
                    <Thumb size="sm" label="png" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <code style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{kind === 'characters' ? 'char/kael-' + look + '.png' : 'bg/cove-' + look + '.png'}</code>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--syntax-tag)' }}>{'# ' + asset.tag.split('/')[0] + '/' + look}</span>
                    </div>
                    <IconButton icon="x" label="Remove look" size="sm" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="ic-group-label" style={{ padding: '0 0 6px' }}>Not filed yet <span style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)' }}>· {media.unfiled.length} in the folder that nothing claims</span></div>
              <div style={{ display: 'flex', gap: 10 }}>
                {media.unfiled.map((path) => (
                  <div key={path} style={{ width: 118, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Placeholder label="unfiled" style={{ aspectRatio: '16/9' }} />
                    <code style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{path}</code>
                    <Button size="xs" variant="quiet" icon="plus">File it</Button>
                  </div>
                ))}
              </div>
            </div>
            <Hint>Images live in <code>media/</code> inside the project. Add them there and press rescan.</Hint>
          </>
        ) : <EmptyState centered title="Nothing here yet" body="Drop files into media/ and press rescan." />} />
    </div>
  )
}

function StatsSection({ stats, items }) {
  const [kind, setKind] = useState('stats')
  const [picked, setPicked] = useState('trust');
  const list = kind === 'stats' ? stats : items
  const chosen = list.find((entry) => entry.name === picked) || list[0]
  const categories = [...new Set(stats.map((stat) => stat.category))]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs level="sub" value={kind} onChange={(next) => { setKind(next); setPicked(next === 'stats' ? 'trust' : 'lantern') }}
        items={[{ value: 'stats', label: 'Stats', count: stats.length }, { value: 'items', label: 'Items', count: items.length }]}
        trail={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', paddingRight: 6 }}>writes ink/state.ink</span>} />

      <MasterDetail masterWidth={230}
        master={
          <>
            <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border-hairline)' }}>
              <Input size="sm" mono placeholder={kind === 'stats' ? 'new_stat' : 'new_item'} aria-label="New name" />
              <Button size="sm">Add</Button>
            </div>
            <div style={{ padding: 8, paddingBottom: 0 }}><Input size="sm" placeholder="Filter…" aria-label="Filter" /></div>
            <MasterList>
              {kind === 'stats' ? categories.map((category) => (
                <section key={category}>
                  <GroupLabel>{category}</GroupLabel>
                  {stats.filter((stat) => stat.category === category).map((stat) => (
                    <ListRow key={stat.name} mono name={stat.name} selected={chosen && stat.name === chosen.name}
                      onClick={() => setPicked(stat.name)}
                      trail={<Badge variant={stat.uses === 0 ? 'zero' : 'default'}>{stat.uses}</Badge>} />
                  ))}
                </section>
              )) : items.map((item) => (
                <ListRow key={item.name} mono name={item.name} meta={item.label} selected={chosen && item.name === chosen.name}
                  onClick={() => setPicked(item.name)} trail={<Badge>{item.uses}</Badge>} />
              ))}
            </MasterList>
          </>
        }
        detail={chosen ? (
          <>
            <Field label="Name" hint="This is the ink variable name. Renaming it rewrites every use."><Input mono defaultValue={chosen.name} /></Field>
            {kind === 'stats' ? (
              <>
                <Field label="Kind" inline><Select defaultValue={chosen.kind}><option value="number">number</option><option value="flag">flag</option></Select></Field>
                <Field label="Starts at" inline><Input defaultValue={String(chosen.start)} style={{ width: 90 }} /></Field>
                {chosen.kind === 'number' && (
                  <Field label="Range" inline hint="Clamped on every change, in the editor and at runtime.">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Input defaultValue={String(chosen.min)} style={{ width: 66 }} aria-label="Minimum" />
                      <span style={{ color: 'var(--text-faint)' }}>to</span>
                      <Input defaultValue={String(chosen.max)} style={{ width: 66 }} aria-label="Maximum" />
                    </div>
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Label" inline><Input defaultValue={chosen.label} /></Field>
                <Field label="Description"><Textarea rows={2} defaultValue={chosen.desc} /></Field>
              </>
            )}
            <div>
              <div className="ic-group-label" style={{ padding: '0 0 6px' }}>Used in {chosen.uses} places</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[['ink/chapter3.ink', 41], ['ink/chapter3.ink', 52], ['ink/chapter4.ink', 8]].map(([file, line], index) => (
                  <ListRow key={index} mono name={file + ':' + line} meta={index === 0 ? '~ ' + chosen.name + ' += 1' : '{ ' + chosen.name + ' > 3 }'} icon="corner-down-right" />
                ))}
              </div>
            </div>
            <Hint>Saving rewrites <code>ink/state.ink</code> and adds an INCLUDE to <code>main.ink</code> if it is missing.</Hint>
          </>
        ) : <EmptyState centered title="Nothing selected" body="Pick a stat to edit it." />} />
    </div>
  )
}

function CastSection({ cast }) {
  const [picked, setPicked] = useState('kael')
  const npc = cast.find((entry) => entry.name === picked) || cast[0]
  return (
    <MasterDetail masterWidth={230}
      master={
        <>
          <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border-hairline)' }}>
            <Input size="sm" mono placeholder="new_npc" aria-label="New cast member" />
            <Button size="sm">Add</Button>
          </div>
          <MasterList>
            {cast.map((entry) => (
              <ListRow key={entry.name} mono name={entry.name} meta={entry.attrs.length + ' attributes'}
                selected={npc && entry.name === npc.name} onClick={() => setPicked(entry.name)}
                trail={<Thumb size="sm" label="png" />} />
            ))}
          </MasterList>
        </>
      }
      detail={npc ? (
        <>
          <div style={{ display: 'flex', gap: 14 }}>
            <Placeholder label="sprite 512×1024" style={{ width: 96, aspectRatio: '1/2' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Name"><Input mono defaultValue={npc.name} /></Field>
              <Field label="Sprite" hint="From the media library's characters."><Select defaultValue={npc.sprite}><option>kael</option><option>maren</option></Select></Field>
            </div>
          </div>
          <div>
            <div className="ic-group-label" style={{ padding: '0 0 6px' }}>Attributes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {npc.attrs.map((attr) => (
                <div key={attr.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-pane)' }}>
                  <Input size="sm" mono defaultValue={attr.key} style={{ width: 120 }} aria-label="Attribute name" />
                  <Input size="sm" defaultValue={String(attr.value)} style={{ width: 74 }} aria-label="Value" />
                  {attr.max !== undefined && <div style={{ flex: 1 }}><Meter value={attr.value} min={attr.min} max={attr.max} /></div>}
                  <code style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{'npc_' + npc.name + '_' + attr.key}</code>
                  <IconButton icon="x" label="Remove attribute" size="sm" />
                </div>
              ))}
              <Button variant="quiet" size="sm" icon="plus">Add attribute</Button>
            </div>
          </div>
          <Hint>Cast attributes share <code>ink/state.ink</code> with stats, and the right-click menu treats them the same.</Hint>
        </>
      ) : null} />
  )
}

function MapSection({ hotspots }) {
  const [picked, setPicked] = useState('The Cove')
  const spot = hotspots.find((entry) => entry.name === picked) || hotspots[0]
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', minHeight: 0 }}>
      {/* The map is a landscape image: the canvas keeps 16:9 and is centred in
          whatever space the pane has, rather than stretching to the pane's
          full height and reading as a vertical strip. */}
      <div style={{ display: 'grid', placeItems: 'start stretch', minWidth: 0, minHeight: 0, padding: 16, overflow: 'auto' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <Placeholder label="map background · bg/breedhaven-map.png" style={{ position: 'absolute', inset: 0, borderRadius: 0, border: 0 }} />
        {hotspots.map((entry) => (
          <button key={entry.name} type="button" onClick={() => setPicked(entry.name)}
            style={{
              position: 'absolute', left: entry.x + '%', top: entry.y + '%', transform: 'translate(-50%,-50%)',
              display: 'flex', alignItems: 'center', gap: 6, height: 'var(--control-sm)', padding: '0 8px',
              border: '1px solid ' + (entry.name === spot.name ? 'var(--accent-signal)' : entry.gated ? 'var(--state-warning)' : 'var(--border-strong)'),
              borderStyle: entry.gated ? 'dashed' : 'solid',
              borderRadius: 'var(--radius-pill)',
              background: entry.name === spot.name ? 'var(--state-info-bg)' : 'var(--surface-overlay)',
              color: entry.name === spot.name ? 'var(--text-accent)' : 'var(--text-secondary)',
              font: '500 var(--text-xs)/1 var(--font-ui)', whiteSpace: 'nowrap', cursor: 'pointer', boxShadow: 'var(--shadow-pop)'
            }}>
            <Icon name={entry.gated ? 'lock' : 'map-pin'} size={11} />
            {entry.name}
          </button>
        ))}
      </div>
      </div>
      <div style={{ borderLeft: '1px solid var(--border-hairline)', background: 'var(--surface-pane)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <PaneHeader title="Hotspot" actions={<IconButton icon="trash-2" label="Remove hotspot" size="sm" />} />
        <Field label="Label"><Input defaultValue={spot.name} /></Field>
        <Field label="Goes to" hint="Any knot in the compiled story."><Select defaultValue={spot.knot}><option>{spot.knot}</option><option>the_cove</option></Select></Field>
        <div>
          <div className="ic-group-label" style={{ padding: '0 0 6px' }}>Gate</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Select size="sm" defaultValue="trust"><option>trust</option><option>lantern</option></Select>
              <Select size="sm" defaultValue=">=" style={{ width: 62 }}><option>{'>='}</option><option>{'=='}</option></Select>
              <Input size="sm" defaultValue="4" style={{ width: 56 }} aria-label="Value" />
              <IconButton icon="x" label="Remove clause" size="sm" />
            </div>
            <Button variant="quiet" size="sm" icon="plus">Add clause</Button>
          </div>
        </div>
        <Hint>A gated hotspot draws dashed until its clauses pass, both here and in the preview.</Hint>
      </div>
    </div>
  )
}
