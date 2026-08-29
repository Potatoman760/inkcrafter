// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ChipRow,
  Diagnostics,
  EmptyState,
  Field,
  GroupLabel,
  Hint,
  IconButton,
  Input,
  ListRow,
  MasterDetail,
  Meter,
  PaneHeader,
  Placeholder,
  Segmented,
  Select,
  StatusPill,
  Tabs,
  Textarea,
  Thumb,
  Tooltip
} from './index'

/**
 * The port's contract.
 *
 * These components exist to emit exactly the markup the app writes by hand
 * today, so that converting a screen to them is a rename and not a redesign.
 * Each case pins the class string and the element, because that is what the
 * stylesheet and the existing tests are both keyed to.
 *
 * A failure here means a screen is about to change appearance for a reason
 * nobody chose.
 */

function classOf(element: HTMLElement | null): string {
  return element?.getAttribute('class') ?? ''
}

describe('controls', () => {
  it('Button is a type=button with the variant and size as modifiers', () => {
    render(
      <Button variant="primary" size="sm">
        Add
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Add' })
    expect(button).toHaveAttribute('type', 'button')
    expect(classOf(button)).toBe('ic-btn ic-btn--primary ic-btn--sm')
  })

  it('Button drops the modifier for the default variant and md size', () => {
    render(<Button>Save</Button>)
    expect(classOf(screen.getByRole('button', { name: 'Save' }))).toBe('ic-btn')
  })

  it('IconButton names itself for both the reader and the pointer', () => {
    render(<IconButton icon="x" label="Remove look" size="sm" />)
    const button = screen.getByRole('button', { name: 'Remove look' })
    expect(classOf(button)).toBe('ic-iconbtn ic-iconbtn--sm')
    expect(button).toHaveAttribute('title', 'Remove look')
  })

  it('IconButton reports a toggle state only when it is one', () => {
    const { rerender } = render(<IconButton icon="panel-right" label="Dock" />)
    expect(screen.getByRole('button', { name: 'Dock' })).not.toHaveAttribute('aria-pressed')
    rerender(<IconButton icon="panel-right" label="Dock" active />)
    expect(screen.getByRole('button', { name: 'Dock' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Input carries mono and invalid as the stylesheet expects', () => {
    render(<Input mono invalid size="sm" aria-label="Path" />)
    const input = screen.getByLabelText('Path')
    expect(classOf(input)).toBe('ic-input ic-input--mono ic-input--invalid ic-input--sm')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('Textarea defaults to four rows', () => {
    render(<Textarea aria-label="Summary" />)
    expect(screen.getByLabelText('Summary')).toHaveAttribute('rows', '4')
  })

  it('Select stays a native select', () => {
    render(
      <Select aria-label="Entry point">
        <option value="a">a</option>
      </Select>
    )
    const select = screen.getByLabelText('Entry point')
    expect(select.tagName).toBe('SELECT')
    expect(classOf(select)).toBe('ic-select')
  })

  it('Checkbox makes the label part of the hit target', () => {
    render(<Checkbox label="Link this library" />)
    // Found by its label, which means the label wraps it.
    expect(screen.getByRole('checkbox', { name: 'Link this library' })).toBeInTheDocument()
  })

  it('Segmented is a tablist of exclusive options', () => {
    render(
      <Segmented
        label="Length"
        value="120"
        onChange={() => {}}
        options={[
          { value: '60', label: '60' },
          { value: '120', label: '120' }
        ]}
      />
    )
    // Divergence from the kit, which renders tablist/tab. A tab announces a
    // panel that follows it; these announce a value, which is what the kit's
    // own prose for this component says it is.
    expect(screen.getByRole('radiogroup', { name: 'Length' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '120' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('Field', () => {
  it('names its control by wrapping it, which is how the app finds every input', () => {
    render(
      <Field label="Name">
        <Input />
      </Field>
    )
    // No htmlFor, no id — the wrapper is the association.
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })

  it('puts the note inside the label, as an em', () => {
    const { container } = render(
      <Field label="Ink name" note="variables are abeline_attribute">
        <Input />
      </Field>
    )
    const em = container.querySelector('.ic-field__label em')
    expect(em).toHaveTextContent('variables are abeline_attribute')
    // Still one accessible name, note included — the app's existing behaviour.
    expect(screen.getByRole('textbox', { name: /Ink name/ })).toBeInTheDocument()
  })

  it('becomes a div for a group, so it does not claim the first control', () => {
    const { container } = render(
      <Field as="div" label="Numbers">
        <Input aria-label="Key" />
        <Input aria-label="Label" />
      </Field>
    )
    expect(container.querySelector('label.ic-field')).toBeNull()
    expect(screen.getByLabelText('Key')).toBeInTheDocument()
    expect(screen.getByLabelText('Label')).toBeInTheDocument()
  })

  it('lets an error replace the hint rather than stack with it', () => {
    const { container } = render(
      <Field label="Name" hint="the ink identifier" error="already used">
        <Input />
      </Field>
    )
    const hint = container.querySelector('.ic-field__hint')
    expect(hint).toHaveTextContent('already used')
    expect(hint).toHaveClass('is-error')
    expect(container.textContent).not.toContain('the ink identifier')
  })
})

describe('data', () => {
  it('Badge shows a zero rather than hiding it', () => {
    render(<Badge variant="zero">0</Badge>)
    const badge = screen.getByText('0')
    expect(classOf(badge)).toBe('ic-badge ic-badge--zero')
  })

  it('Chip is a list item, and detected is the dashed inferred one', () => {
    render(
      <ChipRow>
        <Chip variant="detected">Wren</Chip>
      </ChipRow>
    )
    const chip = screen.getByRole('listitem')
    expect(classOf(chip)).toBe('ic-chip ic-chip--detected')
  })

  it('Chip names what its × removes', () => {
    render(
      <ChipRow>
        <Chip onRemove={() => {}} removeLabel="Detach one.ink">
          one.ink
        </Chip>
      </ChipRow>
    )
    expect(screen.getByRole('button', { name: 'Detach one.ink' })).toBeInTheDocument()
  })

  it('Thumb is inline, so it can sit inside a row button', () => {
    const { container } = render(<Thumb size="sm" label="png" />)
    const thumb = container.querySelector('.ic-thumb')
    expect(thumb?.tagName).toBe('SPAN')
    expect(classOf(thumb as HTMLElement)).toBe('ic-thumb ic-thumb--sm')
  })

  it('Thumb says a referenced file is missing rather than drawing nothing', () => {
    render(<Thumb missing src="gone.png" />)
    expect(screen.getByText('missing')).toBeInTheDocument()
  })

  it('Placeholder says what belongs there', () => {
    render(<Placeholder label="sprite 512×1024" />)
    expect(screen.getByText('sprite 512×1024')).toBeInTheDocument()
  })

  it('ListRow marks selection for assistive tech as well as for the eye', () => {
    render(<ListRow name="main.ink" selected mono meta="ink/" />)
    const row = screen.getByRole('button', { name: /main\.ink/ })
    expect(classOf(row)).toBe('ic-row is-selected')
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('ListRow puts the name in a span, so clicking the text still hits the row', async () => {
    const { container } = render(<ListRow name="wren" mono />)
    const name = screen.getByText('wren')
    expect(name.tagName).toBe('SPAN')
    expect(classOf(name)).toBe('ic-row__name ic-row__name--mono')
    expect(container.querySelector('button')?.contains(name)).toBe(true)
  })
})

describe('navigation', () => {
  it('Tabs are tabs, at the level they were asked for', () => {
    render(
      <Tabs
        level="pane"
        label="Sidebar"
        value="files"
        onChange={() => {}}
        items={[
          { value: 'files', label: 'Files' },
          { value: 'codex', label: 'Codex' }
        ]}
      />
    )
    const strip = screen.getByRole('tablist', { name: 'Sidebar' })
    expect(classOf(strip)).toBe('ic-tabs ic-tabs--pane')
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
  })

  it('Tabs put the count in parentheses and the hint in the tooltip', () => {
    render(
      <Tabs
        value="a"
        onChange={() => {}}
        items={[{ value: 'a', label: 'Characters', count: 0, hint: 'Ctrl+1' }]}
      />
    )
    const tab = screen.getByRole('tab', { name: /Characters/ })
    expect(tab).toHaveTextContent('Characters(0)')
    expect(tab).toHaveAttribute('title', 'Ctrl+1')
  })

  it('PaneHeader keeps its actions in their own slot', () => {
    const { container } = render(
      <PaneHeader title="Codex" actions={<IconButton icon="settings" label="Project settings" />} />
    )
    expect(container.querySelector('.ic-pane-header__title')).toHaveTextContent('Codex')
    expect(container.querySelector('.ic-pane-header__actions')).toBeInTheDocument()
  })

  it('GroupLabel is a heading, so a pane can be navigated by its groups', () => {
    // Divergence from the kit, which renders a div. Every use of it names the
    // group of rows beneath it; `as="div"` is there for the exceptions.
    render(<GroupLabel>ink</GroupLabel>)
    expect(screen.getByRole('heading', { name: 'ink' })).toBeInTheDocument()

    const { container } = render(<GroupLabel as="div">ink</GroupLabel>)
    expect(container.querySelector('.ic-group-label')?.tagName).toBe('DIV')
  })
})

describe('layout', () => {
  it('Card draws a stripe only when it has a status to show', () => {
    const { container, rerender } = render(<Card>plain</Card>)
    expect(container.querySelector('.ic-card__stripe')).toBeNull()
    rerender(<Card status="drafting">busy</Card>)
    expect(container.querySelector('.ic-card__stripe')).toBeInTheDocument()
    expect(classOf(container.querySelector('.ic-card') as HTMLElement)).toBe(
      'ic-card ic-card--drafting'
    )
  })

  it('MasterDetail sizes its master column', () => {
    const { container } = render(<MasterDetail masterWidth={230} master={<p>list</p>} detail={<p>fields</p>} />)
    expect(container.querySelector('.ic-master-detail')).toHaveStyle({
      gridTemplateColumns: '230px 1fr'
    })
  })

  it('Diagnostics collapses to a status line when there is nothing wrong', () => {
    const { container } = render(<Diagnostics items={[]} emptyLabel="No problems" />)
    expect(classOf(container.querySelector('.ic-diagnostics') as HTMLElement)).toBe(
      'ic-diagnostics is-empty'
    )
    expect(screen.getByText('No problems')).toBeInTheDocument()
  })

  it('Diagnostics rows are buttons, so a keyboard can reach the line too', async () => {
    const onSelect = vi.fn()
    render(
      <Diagnostics
        onSelect={onSelect}
        items={[{ severity: 'error', message: "Expected a knot name.", line: 52 }]}
      />
    )
    const row = screen.getByRole('button', { name: /Expected a knot name/ })
    expect(row).toHaveTextContent('line 52')
    await userEvent.click(row)
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('Diagnostics names the file when the problem is in another one', () => {
    render(
      <Diagnostics
        items={[{ severity: 'todo', message: 'write the refusal branch.', line: 88, file: 'ink/four.ink' }]}
      />
    )
    expect(screen.getByText('ink/four.ink:88')).toBeInTheDocument()
  })
})

describe('feedback', () => {
  it('Meter reports its range, and clamps rather than overflowing', () => {
    render(<Meter value={99} min={0} max={10} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '99')
    expect(meter).toHaveAttribute('aria-valuemax', '10')
    expect(meter.querySelector('.ic-meter__fill')).toHaveStyle({ width: '100%' })
  })

  it('Meter draws nothing rather than dividing by zero', () => {
    render(<Meter value={5} min={5} max={5} />)
    expect(screen.getByRole('meter').querySelector('.ic-meter__fill')).toHaveStyle({ width: '0%' })
  })

  it('StatusPill always carries its dot, which is what pulses when busy', () => {
    const { container } = render(<StatusPill state="busy">Compiling…</StatusPill>)
    expect(container.querySelector('.ic-pill__dot')).toBeInTheDocument()
    expect(classOf(container.querySelector('.ic-pill') as HTMLElement)).toBe('ic-pill ic-pill--busy')
  })

  it('EmptyState carries a real control, not a sentence about one', () => {
    render(<EmptyState title="Nothing yet" body="Add one." action={<Button>Add</Button>} centered />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('Hint turns red without becoming an error state', () => {
    const { container } = render(<Hint tone="error">missing from media/</Hint>)
    expect(classOf(container.querySelector('.ic-hint') as HTMLElement)).toBe('ic-hint ic-hint--error')
  })
})

/**
 * The info mark beside a label.
 *
 * A label row explains itself once and then has to get out of the way, so the
 * sentence lives behind a mark rather than printed on every field forever. The
 * cases that matter are the ones a hover-only tooltip usually gets wrong:
 * keyboard, and being reachable at all without a pointer.
 */
describe('Tooltip', () => {
  it('says nothing until it is asked', () => {
    render(<Tooltip text="defaults to the provider's" />)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens on hover and describes the mark while it is open', async () => {
    render(<Tooltip text="defaults to the provider's" label="About Model" />)
    const mark = screen.getByRole('button', { name: 'About Model' })

    await userEvent.hover(mark)

    const bubble = screen.getByRole('tooltip')
    expect(bubble).toHaveTextContent("defaults to the provider's")
    expect(mark).toHaveAttribute('aria-describedby', bubble.getAttribute('id'))
  })

  it('opens on focus, so it is reachable without a pointer', async () => {
    render(<Tooltip text="what this section should do" />)

    await userEvent.tab()

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  /** A tap has no hover; the mark has to be pressable too. */
  it('toggles on click', async () => {
    render(<Tooltip text="what this section should do" label="About Instruction" />)
    const mark = screen.getByRole('button', { name: 'About Instruction' })

    await userEvent.click(mark)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  /**
   * The one that looks like a nit and is not. `Field` wraps its control in a
   * `<label>`, and `button` is a labelable element — a button in there makes
   * the label name the mark instead of the input, taking the accessible name
   * off the field and breaking every query that finds a control by its label.
   */
  it('is not a labelable element, so it cannot steal a label', () => {
    const { container } = render(
      <label>
        Model
        <Tooltip text="x" />
        <input />
      </label>
    )

    expect(container.querySelector('input')!.labels).toHaveLength(1)
    expect(container.querySelector('button')).not.toBeInTheDocument()
  })
})

describe('Field and its two kinds of small print', () => {
  it('prints a note beside the label, where it can be read at a glance', () => {
    const { container } = render(
      <Field label="File" note="seraphine.md">
        <Input />
      </Field>
    )

    expect(container.querySelector('.ic-field__label em')).toHaveTextContent('seraphine.md')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('puts an explanation behind a mark instead', async () => {
    render(
      <Field label="Model" about="defaults to the provider's">
        <Input />
      </Field>
    )

    expect(screen.queryByText("defaults to the provider's")).not.toBeInTheDocument()

    await userEvent.hover(screen.getByRole('button', { name: 'About Model' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent("defaults to the provider's")
  })

  /** Both at once: a value to check, and a sentence explaining the field. */
  it('carries both without one displacing the other', () => {
    const { container } = render(
      <Field label="Ink name" note="variables are kael_attribute" about="the ink identifier">
        <Input />
      </Field>
    )

    expect(container.querySelector('.ic-field__label em')).toHaveTextContent('kael_attribute')
    expect(screen.getByRole('button', { name: 'About Ink name' })).toBeInTheDocument()
  })

  it('still names its control when it carries a mark', () => {
    render(
      <Field label="Instruction" about="what this section should do">
        <Input />
      </Field>
    )

    expect(screen.getByRole('textbox', { name: /Instruction/ })).toBeInTheDocument()
  })
})
