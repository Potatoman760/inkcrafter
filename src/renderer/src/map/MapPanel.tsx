import { useEffect, useRef, useState } from 'react'
import { describe, type ConditionLabels } from '@shared/bundle/condition'
import {
  boxOf,
  clampRect,
  DEFAULT_HOTSPOT,
  fitToAspect,
  MAP_HANDLES,
  mapNameProblem,
  mapsLinkingTo,
  moveTo,
  newMapArea,
  rectBetween,
  rectOf,
  renameMap,
  rescaleLocations,
  resizeRect,
  updateLocation,
  updateMap,
  type MapArea,
  type MapDocument,
  type MapHandle,
  type MapLocation,
  type MapRect
} from '@shared/bundle/mapDoc'
import type { KnotSource } from '@shared/inkKnots'
import type { HotspotState } from '@shared/mediaDoc'
import type { NpcDocument } from '@shared/bundle/npcDoc'
import type { StatsDocument } from '@shared/statsDoc'
import { newId } from '@shared/ids'
import type { PlanDocument } from '@shared/planDoc'
import { ConditionEditor } from './ConditionEditor'
import { KnotChecklist } from './KnotChecklist'
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Field,
  Hint,
  IconButton,
  Input,
  Select
} from '../design/components'
import { copy } from '@shared/copy'

interface MapPanelProps {
  doc: MapDocument
  saving: boolean
  error: string | null
  /** Every knot in the project, alphabetical, for choosing a destination. */
  knots: string[]
  /** The same knots with the file that declares each, for grouping by the plan. */
  knotSources: KnotSource[]
  /** Acts, chapters and Scenes, for offering those knots in a shape worth reading. */
  plan: PlanDocument
  stats: StatsDocument
  npcs: NpcDocument
  /** Background asset names, for the picture under the hotspots. */
  backgrounds: string[]
  /** A background asset's picture as an `app://` URL, or null when there is none. */
  backgroundUrl: (name: string) => string | null
  /** Hotspot asset names, for the art a place is drawn with. */
  hotspots: string[]
  /**
   * A hotspot asset's art for one state, as an `app://` URL — or for `idle`
   * when it has no art for that state.
   */
  hotspotUrl: (name: string, state: HotspotState) => string | null
  onChange: (next: MapDocument) => void
}

/**
 * The maps: where the reader can go, and when.
 *
 * Laid out on the picture rather than in a list of numbers, because "is the
 * sanctum roughly where the sanctum is drawn" is a question about a picture and
 * cannot be answered by two spinboxes. Drag on the picture to draw a place,
 * drag its middle to move it, drag a handle to resize it.
 *
 * The one catalogue that is not a master–detail: the picture is the list, so
 * there is nothing for a master column to hold that pressing a hotspot does not
 * already do. What sits down the left is the rail every other catalogue has —
 * which map, adding a place, and the fields of whatever is selected.
 *
 * The rail shows *one* set of fields, not two: with a place selected it is
 * about that place, and with nothing selected it is about the map itself. Both
 * at once would not fit, and would offer two red delete buttons a hand's width
 * apart. Clicking bare picture deselects, and so does the link that says so.
 *
 * Coordinates are the picture's own pixels. Each map's `size` is adopted from
 * its image when it loads, so a place is at the pixel it looks like it is at,
 * and anything drawing this map later scales by `rendered / size` in one step.
 */

/**
 * How far a drag must run, in map units, before it is a rectangle rather than a
 * click. Below this a press on the picture means "select nothing".
 */
const MIN_DRAW = 12

/** The four numbers behind a rectangle, named the way an author reads them. */
const BOX_FIELDS = [
  { key: 'x', label: 'Centre x' },
  { key: 'y', label: 'Centre y' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' }
] as const

type MapGesture =
  | { kind: 'draw'; from: { x: number; y: number } }
  | { kind: 'move'; id: string }
  | { kind: 'resize'; id: string; handle: MapHandle }

export function MapPanel({
  doc,
  saving,
  error,
  knots,
  knotSources,
  plan,
  stats,
  npcs,
  backgrounds,
  backgroundUrl,
  hotspots,
  hotspotUrl,
  onChange
}: MapPanelProps): React.JSX.Element {
  const [activeMapId, setActiveMapId] = useState<string | null>(doc.maps[0]?.id ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftName, setDraftName] = useState<string | null>(null)
  const canvas = useRef<HTMLDivElement>(null)

  /**
   * The gesture in progress.
   *
   * One piece of state for all three, because they are one gesture: press,
   * move, release. Keeping them apart meant three pairs of handlers that could
   * each be left running when the pointer went somewhere unexpected.
   */
  const drag = useRef<MapGesture | null>(null)

  /**
   * The element that owns the browser's pointer capture for `drag`.
   *
   * Chromium normally releases capture on pointer-up, but a view change can
   * remove the owner first. On Electron/Windows that leaves subsequent clicks
   * unable to focus controls until the whole window loses and regains focus.
   */
  const captured = useRef<{ element: HTMLElement; pointerId: number } | null>(null)

  /** The rectangle being drawn, in map units. Nothing is written until release. */
  const [drawing, setDrawing] = useState<MapRect | null>(null)

  const releaseCapture = (): void => {
    const held = captured.current
    captured.current = null
    if (!held) return
    try {
      held.element.releasePointerCapture(held.pointerId)
    } catch {
      // Pointer-up may already have released it. The ref still needed clearing.
    }
  }

  const capturePointer = (
    event: React.PointerEvent<HTMLElement>,
    gesture: MapGesture
  ): void => {
    releaseCapture()
    event.currentTarget.setPointerCapture(event.pointerId)
    captured.current = { element: event.currentTarget, pointerId: event.pointerId }
    drag.current = gesture
  }

  // Leaving the view or the application must never leave Chromium holding a
  // pointer on a detached map element. The latter also covers a pointer-up the
  // OS delivered while another window was active.
  useEffect(() => {
    const abandon = (): void => {
      releaseCapture()
      drag.current = null
      setDrawing(null)
    }
    window.addEventListener('blur', abandon)
    return () => {
      window.removeEventListener('blur', abandon)
      releaseCapture()
      drag.current = null
    }
  }, [])

  /**
   * The shape of each hotspot asset's art, once the browser has loaded it.
   *
   * Measured rather than stored: the art is four files on disk and their size is
   * a fact about them, so recording it in `map.json` would be a copy that could
   * go stale the moment the author exported the picture again. Keyed by asset
   * name, so every map using the same art shares what was measured once.
   */
  const [aspects, setAspects] = useState<Record<string, number>>({})

  const area: MapArea | null = doc.maps.find((one) => one.id === activeMapId) ?? doc.maps[0] ?? null

  // The map underneath can change — the assistant writes `map.json` too — and a
  // tab pointing at one that has gone would leave the panel with nothing.
  useEffect(() => {
    if (activeMapId !== null && doc.maps.some((one) => one.id === activeMapId)) return
    setActiveMapId(doc.maps[0]?.id ?? null)
    setSelectedId(null)
  }, [doc.maps, activeMapId])

  const aspectFor = (location: MapLocation): number | null =>
    location.art.length > 0 ? (aspects[location.art] ?? null) : null

  const selected = area?.locations.find((one) => one.id === selectedId) ?? null

  const labels: ConditionLabels = {
    stats: Object.fromEntries([
      ...stats.stats.map((stat) => [stat.name, stat.display || stat.name] as const),
      ...stats.variables.map((variable) => [variable.name, variable.name] as const)
    ]),
    npcs: Object.fromEntries(npcs.npcs.map((npc) => [npc.inkId, npc.name])),
    attrs: Object.fromEntries(
      npcs.npcs.flatMap((npc) =>
        npc.variables.map((attr) => [
          `${npc.inkId}.${attr.key}`,
          attr.label
        ])
      )
    )
  }

  const addMap = (): void => {
    const made = newMapArea('New map')
    onChange({ ...doc, maps: [...doc.maps, made] })
    setActiveMapId(made.id)
    setSelectedId(null)
    setDraftName(null)
  }

  if (area === null) {
    return (
      <>
        {saving && <p className="saving-note saving-note--loose">saving…</p>}
        {error !== null && <p className="settings-error">{error}</p>}
        <EmptyState
          centered
          className="plan-empty"
          title="No maps"
          body="A map is a picture with places on it — an overworld, a city, a house. Add one, then drag its places onto the picture."
          action={
            <Button variant="primary" icon="plus" onClick={addMap}>
              Add a map
            </Button>
          }
        />
      </>
    )
  }

  const patchArea = (changes: Partial<MapArea>): void => onChange(updateMap(doc, area.id, changes))

  const patch = (id: string, changes: Partial<MapLocation>): void =>
    onChange(updateLocation(doc, area.id, id, changes))

  /** Where a pointer is on the picture, in map units. */
  const pointAt = (event: React.PointerEvent): { x: number; y: number } | null => {
    const box = canvas.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null

    return {
      x: ((event.clientX - box.left) / box.width) * area.size.width,
      y: ((event.clientY - box.top) / box.height) * area.size.height
    }
  }

  /**
   * `label` is what the rail's box was holding. Drawing on the picture cannot
   * ask for one — there is nowhere to type mid-drag — so it keeps the
   * placeholder and the field below is where it gets named.
   */
  const addAt = (rect: MapRect, label = 'Somewhere'): void => {
    const location: MapLocation = {
      id: newId('loc'),
      label,
      ...boxOf(clampRect(rect, area.size)),
      destination: { to: 'knot', name: knots[0] ?? '' },
      available: null,
      lockedHint: '',
      art: ''
    }
    patchArea({ locations: [...area.locations, location] })
    setSelectedId(location.id)
  }

  /**
   * The picture's real size becomes the coordinate space.
   *
   * Adopted on load rather than when the picture is chosen, because the natural
   * size is not known until the browser has it. Anything already placed is
   * rescaled by the same ratio, so it stays over the part of the drawing it was
   * put on — the space changed, not the map.
   */
  const adoptImageSize = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth === 0 || naturalHeight === 0) return
    if (naturalWidth === area.size.width && naturalHeight === area.size.height) return

    const size = { width: naturalWidth, height: naturalHeight }
    patchArea({ size, locations: rescaleLocations(area.locations, area.size, size) })
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    const gesture = drag.current
    const at = pointAt(event)
    if (!gesture || !at) return

    if (gesture.kind === 'draw') {
      setDrawing(clampRect(rectBetween(gesture.from, at), area.size))
      return
    }

    const location = area.locations.find((one) => one.id === gesture.id)
    if (!location) return

    if (gesture.kind === 'move') {
      patch(location.id, moveTo(location, at, area.size))
      return
    }

    const resized = resizeRect(rectOf(location), gesture.handle, at)
    const aspect = aspectFor(location)
    const shaped = aspect === null ? resized : fitToAspect(resized, aspect, gesture.handle)

    patch(location.id, boxOf(clampRect(shaped, area.size)))
  }

  /**
   * A location as a percentage box on the picture.
   *
   * Percentages rather than pixels so the whole map scales with whatever room
   * the pane has — which is the same arithmetic a player does, one level up.
   */
  const boxStyle = (location: MapLocation): React.CSSProperties => ({
    left: `${(location.x / area.size.width) * 100}%`,
    top: `${(location.y / area.size.height) * 100}%`,
    width: `${(location.width / area.size.width) * 100}%`,
    height: `${(location.height / area.size.height) * 100}%`
  })

  const endGesture = (): void => {
    releaseCapture()
    const gesture = drag.current
    drag.current = null

    if (gesture?.kind !== 'draw') {
      setDrawing(null)
      return
    }

    // A press without a drag is a click on the picture, which deselects rather
    // than dropping a place nobody asked for.
    const rect = drawing
    setDrawing(null)
    if (!rect) {
      setSelectedId(null)
      return
    }

    if (rect.right - rect.left < MIN_DRAW || rect.bottom - rect.top < MIN_DRAW) {
      setSelectedId(null)
      return
    }

    addAt(rect)
  }

  /** Dropped in the middle of the picture, for a place added from the rail. */
  const addInMiddle = (): void => {
    const middle = { x: area.size.width / 2, y: area.size.height / 2 }
    addAt(
      {
        left: middle.x - DEFAULT_HOTSPOT.width / 2,
        top: middle.y - DEFAULT_HOTSPOT.height / 2,
        right: middle.x + DEFAULT_HOTSPOT.width / 2,
        bottom: middle.y + DEFAULT_HOTSPOT.height / 2
      },
      draftLabel.trim() || undefined
    )
    setDraftLabel('')
  }

  const nameProblem = draftName === null ? null : mapNameProblem(doc, draftName, area.id)

  /** Committed on blur rather than per keystroke: a half-typed name is not one. */
  const commitName = (): void => {
    if (draftName === null) return
    if (nameProblem === null) onChange(renameMap(doc, area.id, draftName))
    setDraftName(null)
  }

  const image = area.image.length > 0 ? backgroundUrl(area.image) : null
  const linkedFrom = mapsLinkingTo(doc, area.name)
  // A knot claimed before it was renamed or deleted. The checklist can only
  // offer what exists, so these need a way off the list of their own.
  const stray = area.knots.filter((knot) => !knots.includes(knot))
  const elsewhere = doc.maps.filter((one) => one.id !== area.id)

  return (
    <>
      {saving && <p className="saving-note saving-note--loose">saving…</p>}
      {error !== null && <p className="settings-error">{error}</p>}

      <div className="map-layout">
        <aside className="map-rail">
          {/* Which map, and adding a place to it. Both are about the map rather
              than about any one place on it, so they stay put while the fields
              below them scroll. */}
          <div className="map-rail__top">
            <div className="map-pick">
              <Field label="Map">
                <Select
                  size="sm"
                  value={area.id}
                  onChange={(event) => {
                    setActiveMapId(event.target.value)
                    setSelectedId(null)
                    setDraftName(null)
                  }}
                >
                  {doc.maps.map((one) => (
                    <option key={one.id} value={one.id}>
                      {one.display || one.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <IconButton icon="plus" label="Add a map" onClick={addMap} />
            </div>

            {/* Drawing on the picture is the way in, but a box and a button is
                what you look for the first time — and it is the only way to add
                a place when there is no picture to draw on. */}
            <div className="panel-new">
              <Input
                value={draftLabel}
                aria-label="New place label"
                placeholder="Name"
                disabled={knots.length === 0}
                onChange={(event) => setDraftLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addInMiddle()
                }}
              />
              <Button
                variant="primary"
                icon="plus"
                onClick={addInMiddle}
                disabled={knots.length === 0}
              >
                Add
              </Button>
            </div>

            {knots.length === 0 && (
              <Hint tight>Nowhere to travel to yet — the story has no knots.</Hint>
            )}

            {/* The way back to the map's own fields. Clicking bare picture does
                it too, which is not a thing anybody guesses. */}
            {selected !== null && (
              <Button variant="link" onClick={() => setSelectedId(null)}>
                Map settings
              </Button>
            )}
          </div>

          <div className="map-rail__body">
            {selected === null ? (
              <>
                <Field label="Name" about={copy('map.name')}>
                  <Input
                    mono
                    value={draftName ?? area.name}
                    aria-label="Map name"
                    invalid={nameProblem !== null}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        setDraftName(null)
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  {nameProblem !== null && <Hint tight tone="error">{nameProblem}</Hint>}
                </Field>

                <Field label="Title" note="Shown to the reader. Empty falls back to the name.">
                  <Input
                    value={area.display}
                    aria-label="Map title"
                    onChange={(event) => patchArea({ display: event.target.value })}
                  />
                </Field>

                <Field label="Picture">
                  <Select
                    value={area.image}
                    aria-label="Map picture"
                    onChange={(event) => patchArea({ image: event.target.value })}
                  >
                    <option value="">(no picture)</option>
                    {(area.image.length === 0 || backgrounds.includes(area.image)
                      ? backgrounds
                      : [area.image, ...backgrounds]
                    ).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field as="div" label="Default for" about={copy('map.defaultFor')}>
                  {/* Keyed by map: the checklist opens the groups this map has
                      something in, and that is read once per mount. */}
                  <KnotChecklist
                    key={area.id}
                    knots={knotSources}
                    plan={plan}
                    selected={area.knots}
                    onChange={(next) => patchArea({ knots: next })}
                  />
                  {stray.length > 0 && (
                    <>
                      <Hint tight tone="error">
                        {stray.length === 1 ? 'This knot is' : 'These knots are'} listed here but no
                        longer in the story:
                      </Hint>
                      <ChipRow>
                        {stray.map((knot) => (
                          <Chip
                            key={knot}
                            onClick={() =>
                              patchArea({ knots: area.knots.filter((one) => one !== knot) })
                            }
                          >
                            {knot}
                          </Chip>
                        ))}
                      </ChipRow>
                    </>
                  )}
                </Field>

                <div className="detail-row detail-row--danger">
                  {linkedFrom.length > 0 && (
                    <Hint tight tone="error">
                      {linkedFrom.map((one) => one.display || one.name).join(', ')} opens this map.
                      Removing it leaves {linkedFrom.length === 1 ? 'that hotspot' : 'those hotspots'}{' '}
                      going nowhere.
                    </Hint>
                  )}
                  <Button
                    variant="danger"
                    icon="trash-2"
                    aria-label={`Remove ${area.display || area.name}`}
                    onClick={() => {
                      onChange({ ...doc, maps: doc.maps.filter((one) => one.id !== area.id) })
                      setActiveMapId(null)
                      setSelectedId(null)
                    }}
                  >
                    Remove this map
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Field label="Label">
                  <Input
                    value={selected.label}
                    onChange={(event) => patch(selected.id, { label: event.target.value })}
                  />
                </Field>

                {/* The picture is how a hotspot is placed; these are for saying it
                    exactly — two places the same size, an edge on a round number. */}
                <Field
                  as="div"
                  className="map-box"
                  label="Area"
                  note={copy('map.box', { width: area.size.width, height: area.size.height })}
                >
                  {BOX_FIELDS.map(({ key, label }) => (
                    <label key={key} className="map-box__field">
                      <span>{label}</span>
                      <Input
                        size="sm"
                        type="number"
                        aria-label={`${label} of ${selected.label}`}
                        value={selected[key]}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (!Number.isFinite(value)) return
                          patch(
                            selected.id,
                            boxOf(clampRect(rectOf({ ...selected, [key]: value }), area.size))
                          )
                        }}
                      />
                    </label>
                  ))}
                </Field>

                {/* Art is optional. A place without it is the labelled rectangle
                    the map has always drawn. */}
                <Field label="Art" about={copy('map.hotspot')}>
                  <Select
                    value={selected.art}
                    onChange={(event) => {
                      const art = event.target.value
                      const aspect = art.length > 0 ? (aspects[art] ?? null) : null
                      patch(
                        selected.id,
                        aspect === null
                          ? { art }
                          : {
                              art,
                              ...boxOf(
                                clampRect(fitToAspect(rectOf(selected), aspect, null), area.size)
                              )
                            }
                      )
                    }}
                  >
                    <option value="">(a plain rectangle)</option>
                    {/* Art named but no longer catalogued stays listed, so it reads
                        as wrong rather than being silently dropped. */}
                    {(selected.art.length === 0 || hotspots.includes(selected.art)
                      ? hotspots
                      : [selected.art, ...hotspots]
                    ).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  {selected.art.length > 0 && !hotspots.includes(selected.art) && (
                    <Hint tone="error">
                      There is no hotspot called <code>{selected.art}</code> in the catalogue.
                    </Hint>
                  )}
                </Field>

                {/* Two controls, one decision: a place goes to exactly one thing,
                    and which kind it is decides what the list beside it holds. */}
                <Field as="div" className="map-dest" label="Goes to" about={copy('map.goesTo')}>
                  <Select
                    size="sm"
                    aria-label="Kind of destination"
                    value={selected.destination.to}
                    onChange={(event) => {
                      const to = event.target.value === 'map' ? 'map' : 'knot'
                      // Both at once: a kind beside a name meant for the other
                      // is a place that goes nowhere.
                      patch(selected.id, {
                        destination: {
                          to,
                          name: (to === 'map' ? elsewhere[0]?.name : knots[0]) ?? ''
                        }
                      })
                    }}
                  >
                    <option value="knot">a knot</option>
                    <option value="map">another map</option>
                  </Select>

                  {selected.destination.to === 'knot' ? (
                    <Select
                      aria-label="Destination knot"
                      value={selected.destination.name}
                      onChange={(event) =>
                        patch(selected.id, { destination: { to: 'knot', name: event.target.value } })
                      }
                    >
                      {/* A knot that has since been renamed stays listed, so it is
                          visibly wrong rather than silently repointed. */}
                      {(knots.includes(selected.destination.name)
                        ? knots
                        : [selected.destination.name, ...knots]
                      ).map((knot) => (
                        <option key={knot} value={knot}>
                          {knot}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      aria-label="Destination map"
                      value={selected.destination.name}
                      onChange={(event) =>
                        patch(selected.id, { destination: { to: 'map', name: event.target.value } })
                      }
                    >
                      {/* This map is not offered: a hotspot that opens the map it
                          is already on does nothing when clicked. One already
                          written stays listed, so it can be seen and changed. */}
                      {elsewhere.some((one) => one.name === selected.destination.name) ? null : (
                        <option value={selected.destination.name}>
                          {selected.destination.name || '(nowhere)'}
                        </option>
                      )}
                      {elsewhere.map((one) => (
                        <option key={one.id} value={one.name}>
                          {one.display || one.name}
                        </option>
                      ))}
                    </Select>
                  )}

                  {selected.destination.to === 'map' &&
                    !elsewhere.some((one) => one.name === selected.destination.name) && (
                      <Hint tight tone="error">
                        There is no other map called <code>{selected.destination.name}</code>.
                      </Hint>
                    )}
                </Field>

                <ConditionEditor
                  condition={selected.available}
                  knots={knots}
                  stats={stats}
                  npcs={npcs}
                  labels={labels}
                  onChange={(available) => patch(selected.id, { available })}
                />

                {selected.available !== null && (
                  <Field
                    label="Hint when locked"
                    note={copy('map.otherwise', { fallback: describe(selected.available, labels) })}
                  >
                    <Input
                      value={selected.lockedHint}
                      onChange={(event) => patch(selected.id, { lockedHint: event.target.value })}
                    />
                  </Field>
                )}

                <Hint>
                  A gated place draws dashed until its requirements pass, both here and in the
                  preview.
                </Hint>

                {/* At the foot and named, like every other detail pane here. */}
                <div className="detail-row detail-row--danger">
                  <Button
                    variant="danger"
                    icon="trash-2"
                    aria-label={`Remove ${selected.label}`}
                    onClick={() => {
                      patchArea({
                        locations: area.locations.filter((one) => one.id !== selected.id)
                      })
                      setSelectedId(null)
                    }}
                  >
                    Remove this place
                  </Button>
                </div>
              </>
            )}
          </div>
        </aside>

        <div className="map-canvas-wrap">
          <div
            ref={canvas}
            className="map-canvas"
            style={{ aspectRatio: `${area.size.width} / ${area.size.height}` }}
            // Pressing the picture itself starts a rectangle. A hotspot stops
            // the event, so pressing one moves it rather than drawing over it.
            onPointerDown={(event) => {
              if (knots.length === 0) return
              const at = pointAt(event)
              if (!at) return
              capturePointer(event, { kind: 'draw', from: at })
              setDrawing(null)
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onLostPointerCapture={() => {
              // An explicit release has already cleared the owner. Only an
              // unexpected loss still has a gesture to finish.
              if (captured.current !== null) endGesture()
            }}
          >
            {image ? (
              <img src={image} alt="" draggable={false} onLoad={adoptImageSize} />
            ) : (
              <Hint>No picture. Pick a background in the rail, or leave it bare.</Hint>
            )}

            {area.locations.map((location) => {
              // Gated places draw their disabled art, because that is what the
              // reader will see until they open it — the point of drawing the
              // art here at all is that the editor looks like the game.
              const state: HotspotState = location.available === null ? 'idle' : 'disabled'
              const art = location.art.length > 0 ? hotspotUrl(location.art, state) : null

              return (
                <button
                  key={location.id}
                  type="button"
                  className={`map-hotspot${location.id === selectedId ? ' is-selected' : ''}${
                    location.available === null ? '' : ' is-gated'
                  }${art ? ' has-art' : ''}${
                    location.destination.to === 'map' ? ' is-doorway' : ''
                  }`}
                  style={boxStyle(location)}
                  title={describe(location.available, labels)}
                  onPointerDown={(event) => {
                    // Not the canvas's business: pressing a place moves it.
                    event.stopPropagation()
                    capturePointer(event, { kind: 'move', id: location.id })
                    setSelectedId(location.id)
                  }}
                >
                  {art && (
                    <img
                      src={art}
                      alt=""
                      draggable={false}
                      // The art's own shape, learnt the only place it is known.
                      // Recorded per asset rather than per place: it is a fact
                      // about the files, and every place using them shares it.
                      onLoad={(event) => {
                        const { naturalWidth, naturalHeight } = event.currentTarget
                        if (naturalWidth === 0 || naturalHeight === 0) return
                        const ratio = naturalWidth / naturalHeight
                        setAspects((current) =>
                          current[location.art] === ratio
                            ? current
                            : { ...current, [location.art]: ratio }
                        )
                      }}
                    />
                  )}
                  <span className="map-hotspot__label">{location.label}</span>
                </button>
              )
            })}

            {/* The handles ride on the selected place rather than inside it, so
                a corner can be grabbed on a hotspot only a few pixels tall. */}
            {selected && (
              <div className="map-handles" style={boxStyle(selected)} aria-hidden="true">
                {MAP_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={`map-handle map-handle--${handle}`}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      capturePointer(event, { kind: 'resize', id: selected.id, handle })
                    }}
                  />
                ))}
              </div>
            )}

            {drawing && (
              <div
                className="map-drawing"
                aria-hidden="true"
                style={{
                  left: `${(drawing.left / area.size.width) * 100}%`,
                  top: `${(drawing.top / area.size.height) * 100}%`,
                  width: `${((drawing.right - drawing.left) / area.size.width) * 100}%`,
                  height: `${((drawing.bottom - drawing.top) / area.size.height) * 100}%`
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
