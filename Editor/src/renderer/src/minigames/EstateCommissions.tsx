import {
  CREWS,
  ESTATE_CONTRACT_LIMIT,
  ESTATE_CONTRACTS,
  ESTATE_CREW_LARGEST,
  type CrewBudget,
  type EstateContract,
  type EstateMinigame
} from '@shared/bundle/estate'
import { Button, Field, IconButton, Input } from '../design/components'

/**
 * The notices on the commission board: what each pays, and which crews it
 * takes.
 *
 * A villa that never wrote any keeps the built-in six, and the first edit
 * writes all six down — so the board is always whole, and putting it back is
 * one button rather than remembering what it was.
 */
export function EstateCommissions({ game, onChange }: {
  game: EstateMinigame
  onChange: (changes: Partial<EstateMinigame>) => void
}): React.JSX.Element {
  const notices = game.contracts ?? ESTATE_CONTRACTS

  const set = (next: EstateContract[]): void => onChange({ contracts: next })
  const patch = (index: number, changes: Partial<EstateContract>): void =>
    set(notices.map((one, at) => (at === index ? { ...one, ...changes } : one)))
  const need = (index: number, crew: number, value: string): void => {
    const needs = [...notices[index]!.needs] as CrewBudget
    needs[crew] = Math.max(0, Math.min(ESTATE_CREW_LARGEST, Math.round(Number(value) || 0)))
    patch(index, { needs })
  }

  return (
    <Field
      as="div"
      label="Notices"
      note={`${notices.length} of ${ESTATE_CONTRACT_LIMIT}`}
      about={`Pay rises by up to four crowns as the days turn. Crews are three each, with one at two and one at ${ESTATE_CREW_LARGEST}, changing daily — so a notice wanting more than ${ESTATE_CREW_LARGEST} of a crew can never be pinned.`}
    >
      <div className="estate-rows">
        <div className="estate-row estate-row--notice estate-row--head" aria-hidden="true">
          <span>Notice</span><span>Pay</span>
          {CREWS.map((crew) => <span key={crew}>{crew}</span>)}
          <span />
        </div>
        {notices.map((notice, index) => (
          <div className="estate-row estate-row--notice" key={index}>
            <Input aria-label={`Notice ${index + 1} name`} value={notice.name} onChange={(event) => patch(index, { name: event.target.value })} />
            <Input
              type="number"
              min={0}
              aria-label={`Notice ${index + 1} pay`}
              value={notice.pay}
              onChange={(event) => patch(index, { pay: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
            />
            {CREWS.map((crew, at) => (
              <Input
                key={crew}
                type="number"
                min={0}
                max={ESTATE_CREW_LARGEST}
                aria-label={`Notice ${index + 1} ${crew.toLowerCase()}`}
                value={notice.needs[at]}
                onChange={(event) => need(index, at, event.target.value)}
              />
            ))}
            <IconButton
              icon="x"
              size="sm"
              label={`Remove notice ${index + 1}`}
              disabled={notices.length === 1}
              onClick={() => set(notices.filter((_, at) => at !== index))}
            />
          </div>
        ))}
      </div>
      <div className="estate-list__actions">
        <Button
          size="sm"
          icon="plus"
          disabled={notices.length >= ESTATE_CONTRACT_LIMIT}
          onClick={() => set([...notices, { name: 'New notice', needs: [1, 0, 0], pay: 12 }])}
        >
          Add notice
        </Button>
        {game.contracts && (
          <Button size="sm" variant="quiet" onClick={() => onChange({ contracts: undefined })}>
            Use the built-in six
          </Button>
        )}
      </div>
    </Field>
  )
}
