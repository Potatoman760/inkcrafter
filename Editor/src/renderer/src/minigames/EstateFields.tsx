import { useState } from 'react'
import type { EstateMinigame } from '@shared/bundle/estate'
import { Checkbox, Field, Input, Select, Tabs } from '../design/components'
import { ArtField, refKey, type ArtHome, type ArtOption } from './ArtField'
import { EstateCommissions } from './EstateCommissions'
import { EstateFloorPlan } from './EstateFloorPlan'
import { EstateResidents } from './EstateResidents'
import { EstateTutorialFields } from './EstateTutorialFields'
import { TuningField } from './TuningField'

type EstateTab = 'plan' | 'residents' | 'commissions' | 'ledger' | 'tutorial'

const TABS: { value: EstateTab; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'residents', label: 'Residents' },
  { value: 'commissions', label: 'Commissions' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'tutorial', label: 'Tutorial' }
]

/**
 * Villa systems have focused controls; its guided tour is an authored JSON script.
 */
export function EstateFields({ game, textVariables, stats, flags, portraits, options, characterArt = [], home, onChange }: {
  game: EstateMinigame
  /** Text variables, for the ledger. */
  textVariables: string[]
  /** Number stats, for tunings that scale with one. */
  stats: string[]
  /** Every declared true/false, which is what a gate or an invitation names. */
  flags: string[]
  /** Character asset names, for a resident's portrait. */
  portraits: string[]
  /** Every still background look, which every picture here is chosen from. */
  options: ArtOption[]
  characterArt?: ArtOption[]
  home: ArtHome
  onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const [tab, setTab] = useState<EstateTab>('plan')

  const plan = game.background ? options.find((one) => refKey(one.ref) === refKey(game.background!)) ?? null : null

  return (
    <section className="minigame-section">
      <Tabs level="sub" label="Villa" value={tab} onChange={(next) => setTab(next as EstateTab)} items={TABS} />

      {tab === 'tutorial' && <EstateTutorialFields key={game.id} game={game} portraits={portraits} onChange={onChange} />}

      {tab === 'plan' && (
        <>
          {/* One picture twice: the plan, and the same plan with every room
              unfurnished, which the player cuts in over rooms the story has
              not opened. Side by side at the plan's own shape, so the two not
              matching is visible here rather than as a misregistered patch. */}
          <div className="estate-plans">
            <ArtField
              label="Floor plan"
              value={game.background}
              options={options}
              shape={game.floorPlanSize}
              home={home}
              look="floor plan"
              onChange={(background) => onChange({ background })}
            />
            <ArtField
              label="Disabled map"
              about="The same plan with every room unfurnished. Drawn over rooms the story has not opened."
              value={game.disabledFloorPlan}
              options={options}
              shape={game.floorPlanSize}
              emptyLabel="Plain tiles"
              home={home}
              look="disabled map"
              onChange={(disabledFloorPlan) => onChange({ disabledFloorPlan })}
            />
          </div>
          <EstateFloorPlan game={game} image={plan?.url ?? null} options={options} home={home} flags={flags} onChange={onChange} />
        </>
      )}

      {tab === 'residents' && (
        <EstateResidents game={game} flags={flags} portraits={portraits} characterArt={characterArt} onChange={onChange} />
      )}

      {tab === 'commissions' && (
        <>
          <EstateCommissions game={game} onChange={onChange} />
          <ArtField
            label="Notice board"
            about="Behind the commissions page."
            value={game.noticeboardBackground}
            options={options}
            shape="wide"
            emptyLabel="Plain colour"
            home={home}
            look="notice board"
            onChange={(noticeboardBackground) => onChange({ noticeboardBackground })}
          />
        </>
      )}

      {tab === 'ledger' && (
        <>
          <Field
            label="Ledger"
            about="A text variable of its own. The household, restored rooms, crowns and day are kept in it, so an ordinary save carries the villa."
          >
            <Select value={game.stateVariable} onChange={(event) => onChange({ stateVariable: event.target.value })}>
              <option value="">Choose a text variable…</option>
              {textVariables.filter((name) => name !== game.resultVariable).map((name) => <option key={name}>{name}</option>)}
            </Select>
          </Field>
          <div className="minigame-tunings">
            <TuningField label="Starting crowns" unit="crowns" value={game.startingFunds} stats={stats} onChange={(startingFunds) => onChange({ startingFunds })} />
            <TuningField label="Daily stipend" unit="crowns" value={game.dailyStipend} stats={stats} onChange={(dailyStipend) => onChange({ dailyStipend })} />
            <TuningField label="Contract bonus" unit="crowns" value={game.commissionBonus} stats={stats} onChange={(commissionBonus) => onChange({ commissionBonus })} />
          </div>

          {/* In testing only, the villa keeps its own days and End day advances them.
              Under a calendar the story owns the day: the villa reads it, pays
              each day's work once, and only in the phase the story names. */}
          <Field
            as="div"
            label="Calendar"
            about="Required for story play. The villa reads the story day on every startup, pays each workday once, and never advances the story clock. Test mode keeps its own days."
          >
            <Checkbox
              label="The story keeps the days"
              checked={!!game.calendar}
              onChange={(event) => onChange({ calendar: event.target.checked ? { day: '', settled: '' } : null })}
            />
          </Field>
          {game.calendar && (
            <div className="estate-resident__fields">
              <Field label="Day">
                <Select aria-label="Calendar day variable" value={game.calendar.day} onChange={(event) => onChange({ calendar: { ...game.calendar!, day: event.target.value } })}>
                  <option value="">Choose a number…</option>
                  {game.calendar.day && !stats.includes(game.calendar.day) && <option value={game.calendar.day}>Missing: {game.calendar.day}</option>}
                  {stats.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              </Field>
              <Field label="Settled day" about="The last day whose work was paid. The villa writes it.">
                <Select aria-label="Settled day variable" value={game.calendar.settled} onChange={(event) => onChange({ calendar: { ...game.calendar!, settled: event.target.value } })}>
                  <option value="">Choose a number…</option>
                  {game.calendar.settled && !stats.includes(game.calendar.settled) && <option value={game.calendar.settled}>Missing: {game.calendar.settled}</option>}
                  {stats.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              </Field>
              <Field label="Pay when" about="A text variable and the value it must hold. Blank pays on any visit.">
                <div className="estate-list__actions">
                  <Select
                    aria-label="Settlement phase variable"
                    value={game.calendar.when?.variable ?? ''}
                    onChange={(event) => onChange({ calendar: { ...game.calendar!, when: event.target.value ? { variable: event.target.value, value: game.calendar!.when?.value ?? '' } : null } })}
                  >
                    <option value="">Any visit</option>
                    {textVariables.map((name) => <option key={name} value={name}>{name}</option>)}
                  </Select>
                  {game.calendar.when && (
                    <Input
                      mono
                      aria-label="Settlement phase value"
                      placeholder="evening"
                      value={game.calendar.when.value}
                      onChange={(event) => onChange({ calendar: { ...game.calendar!, when: { variable: game.calendar!.when!.variable, value: event.target.value.trim() } } })}
                    />
                  )}
                </div>
              </Field>
              <Field label="Last day" about="For the countdown. Blank shows the day alone.">
                <Input
                  type="number"
                  min={1}
                  aria-label="Calendar last day"
                  value={game.calendar.lastDay ?? ''}
                  onChange={(event) => onChange({ calendar: { ...game.calendar!, lastDay: Number(event.target.value) > 0 ? Math.round(Number(event.target.value)) : null } })}
                />
              </Field>
              <Field label="Last workday" about="The final day that pays commissions and stipend. Later days keep rooms and visits open. Blank allows work indefinitely.">
                <Input
                  type="number"
                  min={1}
                  aria-label="Calendar last workday"
                  value={game.calendar.lastWorkday ?? ''}
                  onChange={(event) => onChange({ calendar: { ...game.calendar!, lastWorkday: Number(event.target.value) > 0 ? Math.round(Number(event.target.value)) : null } })}
                />
              </Field>
            </div>
          )}
        </>
      )}
    </section>
  )
}
