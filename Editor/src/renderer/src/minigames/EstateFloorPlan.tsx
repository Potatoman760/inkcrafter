import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { newId } from '@shared/ids'
import type { EstateBounds, EstateMinigame, EstateRoom } from '@shared/bundle/estate'
import { boxOf, clampRect, MAP_HANDLES, rectBetween, rectOf, resizeRect, type MapHandle } from '@shared/bundle/mapDoc'
import { Button, Checkbox, Field, Hint, Input, Select } from '../design/components'
import { ArtField, type ArtHome, type ArtOption } from './ArtField'

type Gesture = { kind: 'draw'; from: { x: number; y: number }; room: string | null } |
  { kind: 'move' | 'resize'; key: string; from: { x: number; y: number }; original: EstateBounds; handle?: MapHandle }

/** Same image-pixel coordinates, drawing gestures, and handles as the map editor. */
export function EstateFloorPlan({ game, image, options, home, flags, onChange }: {
  /** Every still background look, for a room's pictures. */
  options: ArtOption[]
  /** Every declared true/false variable, which is what a room's gate names. */
  flags: string[]
  /** Where a picture uploaded for a room is filed. Without it, only the catalogue is offered. */
  home?: ArtHome
  game: EstateMinigame; image: string | null; onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState(game.rooms[0]?.key ?? '')
  const [placing, setPlacing] = useState(false)
  const [preview, setPreview] = useState<EstateBounds | null>(null)
  const [expanded, setExpanded] = useState(false)
  const canvas = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const draft = useRef<EstateBounds | null>(null)
  const captured = useRef<{ element: HTMLElement; id: number } | null>(null)
  const selected = game.rooms.find(room => room.key === selectedKey)
  const size = game.floorPlanSize
  const patchRoom = (key: string, changes: Partial<EstateRoom>): void =>
    onChange({ rooms: game.rooms.map(room => room.key === key ? { ...room, ...changes } : room) })

  const abandon = (): void => {
    const held = captured.current
    captured.current = null
    gesture.current = null
    draft.current = null
    if (held) { try { held.element.releasePointerCapture(held.id) } catch { /* already released */ } }
    setPreview(null)
  }
  useEffect(() => {
    window.addEventListener('blur', abandon)
    return () => { window.removeEventListener('blur', abandon); abandon() }
  }, [])
  useEffect(() => { abandon(); setPlacing(false) }, [image])
  useEffect(() => {
    if (!expanded) return
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); abandon(); setExpanded(false) }
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [expanded])

  const point = (event: React.PointerEvent): { x: number; y: number } | null => {
    const box = canvas.current?.getBoundingClientRect()
    return box && box.width && box.height
      ? { x: (event.clientX - box.left) / box.width * size.width, y: (event.clientY - box.top) / box.height * size.height } : null
  }
  const capture = (event: React.PointerEvent, next: Gesture): void => {
    event.preventDefault()
    const element = canvas.current!
    element.setPointerCapture(event.pointerId)
    captured.current = { element, id: event.pointerId }
    gesture.current = next
  }
  const finish = (): void => {
    const held = gesture.current
    const bounds = draft.current
    abandon()
    if (!held || !bounds || bounds.width < 12 || bounds.height < 12) return
    if (held.kind === 'draw') {
      if (held.room) patchRoom(held.room, { bounds })
      else {
        const key = newId('loc')
        onChange({ rooms: [...game.rooms, { key, name: `Suite ${game.rooms.filter(room => room.beds > 0).length + 1}`,
          description: '', cost: 30, beds: 0, residentKey: null, requires: 'hall', bounds }] })
        setSelectedKey(key)
      }
      setPlacing(false)
    } else patchRoom(held.key, { bounds })
  }
  const style = (bounds: EstateBounds): React.CSSProperties => ({
    left: `${bounds.x / size.width * 100}%`, top: `${bounds.y / size.height * 100}%`,
    width: `${bounds.width / size.width * 100}%`, height: `${bounds.height / size.height * 100}%`
  })
  const content = <section className={`estate-floorplan${expanded ? ' is-expanded' : ''}`}>
    <div className="estate-floorplan__toolbar">
      <h3>Floor plan</h3>
      <Button onClick={() => { setSelectedKey(''); setPlacing(true) }}>Draw room</Button>
      <Button disabled={!selected} onClick={() => setPlacing(true)}>Place room</Button>
      <Button onClick={() => { abandon(); setExpanded(!expanded) }}>{expanded ? 'Collapse' : 'Expand'}</Button>
    </div>
    <Hint>{placing ? 'Drag an area for the selected room, or a new suite.' : 'Drag empty space to add a room. Drag a room to move it; use its corner handles to resize.'}</Hint>
    <div className="estate-floorplan__layout">
      <div className="map-canvas estate-floorplan__canvas" ref={canvas} style={{ aspectRatio: `${size.width} / ${size.height}` }}
        aria-label="Villa floor plan" onPointerDown={event => {
          if (event.button !== 0) return
          const from = point(event)
          if (from) capture(event, { kind: 'draw', from, room: placing && selected ? selected.key : null })
        }} onPointerMove={event => {
          const held = gesture.current
          const at = point(event)
          if (!held || !at) return
          let bounds: EstateBounds
          if (held.kind === 'draw') bounds = boxOf(clampRect(rectBetween(held.from, at), size))
          else if (held.kind === 'resize') bounds = boxOf(clampRect(resizeRect(rectOf(held.original), held.handle!, at), size))
          else {
            const original = held.original
            bounds = { ...original,
              x: Math.max(original.width / 2, Math.min(size.width - original.width / 2, original.x + at.x - held.from.x)),
              y: Math.max(original.height / 2, Math.min(size.height - original.height / 2, original.y + at.y - held.from.y)) }
          }
          draft.current = bounds
          setPreview(bounds)
        }} onPointerUp={finish} onPointerCancel={abandon} onLostPointerCapture={() => { if (captured.current) abandon() }}>
        {image ? <img src={image} alt="Villa floor plan" draggable={false} onLoad={event => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget
          if (!width || !height || (width === size.width && height === size.height)) return
          onChange({ floorPlanSize: { width, height }, rooms: game.rooms.map(room => ({ ...room,
            bounds: room.bounds ? { x: room.bounds.x * width / size.width, y: room.bounds.y * height / size.height,
              width: room.bounds.width * width / size.width, height: room.bounds.height * height / size.height } : room.bounds })) })
        }} /> : <Hint>Choose a floor plan above, then draw room areas.</Hint>}
        {game.rooms.map(room => room.bounds && <button key={room.key} type="button"
          className={`map-hotspot${room.key === selectedKey ? ' is-selected' : ''}${room.startsActive || room.key === 'hall' ? '' : ' is-gated'}`}
          style={style(preview && gesture.current?.kind !== 'draw' && gesture.current?.key === room.key ? preview : room.bounds)}
          aria-label={`Room ${room.name}`} onClick={() => setSelectedKey(room.key)} onPointerDown={event => {
            if (placing || event.button !== 0) return
            event.stopPropagation()
            const from = point(event)
            if (!from) return
            setSelectedKey(room.key)
            capture(event, { kind: 'move', key: room.key, from, original: { ...room.bounds! } })
          }}><span className="map-hotspot__label">{room.name}</span></button>)}
        {selected?.bounds && !placing && <div className="map-handles" style={style(preview && gesture.current?.kind !== 'draw' ? preview : selected.bounds)}>
          {MAP_HANDLES.map(handle => <span key={handle} className={`map-handle map-handle--${handle}`} onPointerDown={event => {
            event.stopPropagation()
            const from = point(event)
            if (from) capture(event, { kind: 'resize', key: selected.key, from, original: { ...selected.bounds! }, handle })
          }} />)}
        </div>}
        {preview && gesture.current?.kind === 'draw' && <div className="map-hotspot map-drawing" style={style(preview)} />}
      </div>
      <aside className="estate-floorplan__fields">
        <Field label="Room"><Select aria-label="Selected room" value={selectedKey} onChange={event => { setSelectedKey(event.target.value); setPlacing(false) }}>
          <option value="">New room</option>
          {game.rooms.map(room => <option key={room.key} value={room.key}>{room.name}{room.bounds ? '' : ' · unplaced'}</option>)}
        </Select></Field>
        {selected && <>
          <Field label="Name"><Input value={selected.name} onChange={event => patchRoom(selected.key, { name: event.target.value })} /></Field>
          <Field label="Description"><Input value={selected.description} onChange={event => patchRoom(selected.key, { description: event.target.value })} /></Field>
          <Field label="Enabled when" about="Until this is true the room is unlabelled scenery: no actions, no way in. Separate from restoration and invitations.">
            <Select aria-label="Room availability variable" value={selected.availabilityVariable ?? ''} onChange={event => patchRoom(selected.key, { availabilityVariable: event.target.value || null })}>
              <option value="">Always</option>
              {selected.availabilityVariable && !flags.includes(selected.availabilityVariable) && <option value={selected.availabilityVariable}>Missing: {selected.availabilityVariable}</option>}
              {flags.map(flag => <option key={flag} value={flag}>{flag}</option>)}
            </Select>
          </Field>
          <ArtField label="Room background" about="Shown when the reader enters this room." value={selected.background} options={options}
            shape="wide" emptyLabel="Plain colour" home={home} look={selected.name}
            onChange={background => patchRoom(selected.key, { background })} />
          <ArtField label="Unrestored art" about="Shown instead until the room is restored." value={selected.unrestoredBackground} options={options}
            shape="wide" emptyLabel="Same, washed out" home={home} look={`${selected.name} unrestored`}
            onChange={unrestoredBackground => patchRoom(selected.key, { unrestoredBackground })} />
          <Field label="Cost"><Input type="number" min={0} value={selected.cost} onChange={event => patchRoom(selected.key, { cost: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></Field>
          <Field label="Resident" about="Reserve a home for one or two companions. Shared spaces cannot receive invitations.">
            <Select aria-label="Intended resident" value={selected.residentKey === undefined ? '__open' : selected.residentKey ?? ''} onChange={event => {
              const value = event.target.value
              patchRoom(selected.key, { residentKey: value === '__open' ? undefined : value || null, companionKey: null, inviteTogether: false, sharedBaths: value ? false : selected.sharedBaths, beds: value ? Math.min(2, Math.max(1, value === '__open' ? selected.beds : 1)) : 0 })
            }}>
              <option value="">Shared space</option>
              <option value="__open">Open suite (legacy)</option>
              {game.residents.map(resident => <option key={resident.key} value={resident.key}
                disabled={game.rooms.some(room => room.key !== selected.key && (room.residentKey === resident.key || room.companionKey === resident.key))}>{resident.name}</option>)}
              {selected.residentKey && !game.residents.some(one => one.key === selected.residentKey) && <option value={selected.residentKey}>Missing: {selected.residentKey}</option>}
            </Select>
          </Field>
          {selected.residentKey && <Field label="Roommate">
            <Select aria-label="Second resident" value={selected.companionKey ?? ''} onChange={event => patchRoom(selected.key, {
              companionKey: event.target.value || null, beds: event.target.value ? 2 : 1, inviteTogether: event.target.value ? selected.inviteTogether : false
            })}>
              <option value="">None</option>
              {game.residents.filter(one => one.key !== selected.residentKey).map(one => <option key={one.key} value={one.key}
                disabled={game.rooms.some(room => room.key !== selected.key && (room.residentKey === one.key || room.companionKey === one.key))}>{one.name}</option>)}
            </Select>
          </Field>}
          {selected.companionKey && <Checkbox label="Invite together" checked={selected.inviteTogether === true}
            onChange={event => patchRoom(selected.key, { inviteTogether: event.target.checked })} />}
          {selected.residentKey === undefined && <Field label="Residents"><Input type="number" min={0} max={2} value={selected.beds} onChange={event => patchRoom(selected.key, { beds: Math.min(2, Math.max(0, Math.round(Number(event.target.value) || 0))) })} /></Field>}
          <Checkbox label="Starts active" checked={selected.key === 'hall' || selected.startsActive === true} disabled={selected.key === 'hall'} onChange={event => patchRoom(selected.key, { startsActive: event.target.checked })} />
          <Checkbox label="Shared baths" checked={selected.sharedBaths === true} disabled={selected.beds > 0}
            onChange={event => patchRoom(selected.key, { sharedBaths: event.target.checked })} />
          {selected.sharedBaths && <ArtField label="Bathing background" value={selected.bathingBackground} options={options} shape="wide"
            home={home} look="bathing" emptyLabel="Room background" about="Water-level view used only after Take a bath, separate from the room interior."
            onChange={bathingBackground => patchRoom(selected.key, { bathingBackground })} />}
          {selected.bounds && <div className="estate-floorplan__coordinates">
            {(['x', 'y', 'width', 'height'] as const).map(key => <Field key={key} label={key}>
              <Input type="number" aria-label={`Room ${key}`} value={Math.round(selected.bounds![key])} onChange={event => {
                const value = Number(event.target.value)
                if (Number.isFinite(value)) patchRoom(selected.key, { bounds: boxOf(clampRect(rectOf({ ...selected.bounds!, [key]: key === 'width' || key === 'height' ? Math.max(12, value) : value }), size)) })
              }} />
            </Field>)}
          </div>}
          <div className="estate-list__actions">
            <Button disabled={!selected.bounds} onClick={() => patchRoom(selected.key, { bounds: null })}>Remove area</Button>
            {/* Keep the initial reception and clear obsolete prerequisite metadata
                when removing another room. Restoration itself has no dependencies. */}
            <Button variant="danger" icon="trash-2" disabled={selected.key === 'hall'} onClick={() => {
              onChange({ rooms: game.rooms.filter(room => room.key !== selected.key)
                .map(room => room.requires === selected.key ? { ...room, requires: null } : room) })
              setSelectedKey('')
            }}>Remove room</Button>
          </div>
        </>}
      </aside>
    </div>
  </section>
  return expanded ? createPortal(content, document.body) : content
}
