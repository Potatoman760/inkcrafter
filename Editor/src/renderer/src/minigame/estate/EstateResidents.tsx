import { useState } from 'react'
import type { EstateMinigame, EstateResident } from '@shared/bundle/estate'
import { estateBathPercent } from '@shared/bundle/estate'
import { mediaName } from '@shared/mediaDoc'
import { Button, Field, Hint, IconButton, Input, Select } from '../../design/components'
import { ArtField, type ArtOption } from '../ArtField'

/**
 * The household: who can move in, on what condition, and the moments each
 * unlocks in which room.
 *
 * Chosen from a list and edited below it, the way a room is on the plan,
 * rather than each on a card: a villa has nine of them and each has a list of
 * its own, and nine open lists is a wall.
 */
export function EstateResidents({ game, flags, portraits, characterArt = [], onChange }: {
  game: EstateMinigame
  /** Every declared true/false, which is what an invitation waits on. */
  flags: string[]
  /** Character asset names. */
  portraits: string[]
  characterArt?: ArtOption[]
  onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState(game.residents[0]?.key ?? '')
  const [keyProblem, setKeyProblem] = useState<string | null>(null)
  const selected = game.residents.find((one) => one.key === selectedKey)

  const patch = (key: string, changes: Partial<EstateResident>): void =>
    onChange({ residents: game.residents.map((one) => (one.key === key ? { ...one, ...changes } : one)) })

  const add = (): void => {
    const key = freeKey(game.residents.map((one) => one.key), 'resident')
    onChange({
      residents: [
        ...game.residents,
        { key, name: 'New resident', eligibilityVariable: '', requirement: '', sprite: '', scenes: [] }
      ]
    })
    setSelectedKey(key)
  }

  /**
   * Her key is what rooms and saved games know her by, so it follows her
   * into any room reserved for her. A blank or a clash is refused rather than
   * written: two residents with one key would share a home and a history.
   */
  const rename = (resident: EstateResident, wanted: string): void => {
    const key = mediaName(wanted)
    if (!key) {
      setKeyProblem('A key needs at least one letter or digit.')
      return
    }
    if (game.residents.some((one) => one.key === key && one !== resident)) {
      setKeyProblem(`${key} is already someone's key.`)
      return
    }
    setKeyProblem(null)
    if (key === resident.key) return
    onChange({
      residents: game.residents.map((one) => (one === resident ? { ...one, key } : one)),
      rooms: game.rooms.map((room) => ({ ...room,
        ...(room.residentKey === resident.key ? { residentKey: key } : {}),
        ...(room.companionKey === resident.key ? { companionKey: key } : {}) }))
    })
    setSelectedKey(key)
  }

  /** A room reserved for her becomes shared again, rather than reserved for nobody. */
  const remove = (resident: EstateResident): void => {
    onChange({
      residents: game.residents.filter((one) => one !== resident),
      rooms: game.rooms.map((room) =>
        room.residentKey === resident.key ? { ...room, residentKey: room.companionKey ?? null, companionKey: null, inviteTogether: false, beds: room.companionKey ? 1 : 0 }
          : room.companionKey === resident.key ? { ...room, companionKey: null, inviteTogether: false, beds: 1 } : room
      )
    })
    setSelectedKey('')
  }

  const patchScene = (resident: EstateResident, index: number, changes: Partial<EstateResident['scenes'][number]>): void =>
    patch(resident.key, { scenes: resident.scenes.map((scene, at) => (at === index ? { ...scene, ...changes } : scene)) })

  /**
   * A result token is what the story branches on, so a new one is unique
   * across every resident from the start rather than after the author notices.
   */
  const addScene = (resident: EstateResident): void => {
    const taken = game.residents.flatMap((one) => one.scenes.map((scene) => scene.result))
    const result = freeKey(taken, `villa_${resident.key}_scene`)
    patch(resident.key, { scenes: [...resident.scenes, { room: 'hall', title: 'A new moment', result }] })
  }

  return (
    <>
      <div className="estate-list__actions">
        <Field label="Resident">
          <Select aria-label="Selected resident" value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); setKeyProblem(null) }}>
            <option value="">Choose…</option>
            {game.residents.map((one) => <option key={one.key} value={one.key}>{one.name}</option>)}
          </Select>
        </Field>
        <Button icon="plus" onClick={add}>Add resident</Button>
      </div>

      {game.residents.length === 0 && <Hint>Nobody can move in yet.</Hint>}

      {selected && (
        <>
          <div className="estate-resident__fields">
            <Field label="Name">
              <Input aria-label="Resident name" value={selected.name} onChange={(event) => patch(selected.key, { name: event.target.value })} />
            </Field>
            <Field label="Key" about="What rooms and saved games know her by." error={keyProblem}>
              <Input mono aria-label="Resident key" defaultValue={selected.key} key={selected.key} onBlur={(event) => rename(selected, event.target.value)} />
            </Field>
            <Field label="Invited when" about="A true/false the story sets once her route is done.">
              <Select aria-label="Invitation variable" value={selected.eligibilityVariable} onChange={(event) => patch(selected.key, { eligibilityVariable: event.target.value })}>
                <option value="">Choose a variable…</option>
                {selected.eligibilityVariable && !flags.includes(selected.eligibilityVariable) && (
                  <option value={selected.eligibilityVariable}>Missing: {selected.eligibilityVariable}</option>
                )}
                {flags.map((flag) => <option key={flag} value={flag}>{flag}</option>)}
              </Select>
            </Field>
            <Field label="Until then" about="Shown in her room's place while the invitation is not yet open.">
              <Input aria-label="Resident requirement" value={selected.requirement} onChange={(event) => patch(selected.key, { requirement: event.target.value })} />
            </Field>
            <Field label="Portrait">
              <Select aria-label="Resident portrait" value={selected.sprite} onChange={(event) => patch(selected.key, { sprite: event.target.value })}>
                <option value="">None</option>
                {selected.sprite && !portraits.includes(selected.sprite) && <option value={selected.sprite}>Missing: {selected.sprite}</option>}
                {portraits.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </Field>
          </div>

          <ArtField label="Bath sprite" value={selected.bathSprite} options={characterArt} shape="sprite"
            emptyLabel="Not shown" about="A character look cropped into the water on the Take a bath screen. This does not replace her room portrait. Unassigned residents do not appear in the pool."
            onChange={bathSprite => patch(selected.key, { bathSprite })} />
          <Field label="Visible %" about="The top percentage of the actual figure shown above the water, ignoring transparent margins. The bottom edge fades into the pool.">
            <Input aria-label="Bath visible percent" type="number" min={5} max={100} value={estateBathPercent(selected.bathVisiblePercent)}
              onChange={event => patch(selected.key, { bathVisiblePercent: estateBathPercent(Number(event.target.value)) })} />
          </Field>

          <Field
            as="div"
            label="Scenes"
            note={`${selected.scenes.length}`}
            about="A moment in a room, once she lives here and the room is restored. The result is what the story reads back to play it. A gate is a true/false her story sets first."
          >
            <div className="estate-rows">
              {selected.scenes.length > 0 && (
                <div className="estate-row estate-row--scene estate-row--head" aria-hidden="true">
                  <span>Room</span><span>Title</span><span>Result</span><span>Gate</span><span />
                </div>
              )}
              {selected.scenes.map((scene, index) => (
                <div className="estate-row estate-row--scene" key={index}>
                  <Select aria-label={`Scene ${index + 1} room`} value={scene.room} onChange={(event) => patchScene(selected, index, { room: event.target.value })}>
                    {!game.rooms.some((room) => room.key === scene.room) && <option value={scene.room}>Missing: {scene.room}</option>}
                    {game.rooms.map((room) => <option key={room.key} value={room.key}>{room.name}</option>)}
                  </Select>
                  <Input aria-label={`Scene ${index + 1} title`} value={scene.title} onChange={(event) => patchScene(selected, index, { title: event.target.value })} />
                  <Input mono aria-label={`Scene ${index + 1} result`} value={scene.result} onChange={(event) => patchScene(selected, index, { result: event.target.value.trim() })} />
                  <Select aria-label={`Scene ${index + 1} gate`} value={scene.gate ?? ''} onChange={(event) => patchScene(selected, index, { gate: event.target.value || null })}>
                    <option value="">None</option>
                    {scene.gate && !flags.includes(scene.gate) && <option value={scene.gate}>Missing: {scene.gate}</option>}
                    {flags.map((flag) => <option key={flag} value={flag}>{flag}</option>)}
                  </Select>
                  <IconButton icon="x" size="sm" label={`Remove scene ${index + 1}`} onClick={() => patch(selected.key, { scenes: selected.scenes.filter((_, at) => at !== index) })} />
                </div>
              ))}
            </div>
            <div className="estate-list__actions">
              <Button size="sm" icon="plus" onClick={() => addScene(selected)}>Add scene</Button>
            </div>
          </Field>

          <div className="estate-list__actions">
            <Button variant="danger" icon="trash-2" onClick={() => remove(selected)}>Remove resident</Button>
          </div>
        </>
      )}
    </>
  )
}

/** `wanted`, or the next numbered one not already in the list. */
function freeKey(taken: string[], wanted: string): string {
  if (!taken.includes(wanted)) return wanted
  for (let n = 2; ; n += 1) {
    const key = `${wanted}_${n}`
    if (!taken.includes(key)) return key
  }
}
