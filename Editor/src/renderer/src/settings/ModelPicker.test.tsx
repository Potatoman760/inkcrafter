// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ModelListResult } from '@shared/settings'
import { ModelPicker } from './ModelPicker'

const CATALOGUE = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'azure/openai/gpt-4o',
  'anthropic/claude-opus-4',
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-3.1-70b'
]

function listing(models = CATALOGUE): ModelListResult {
  return { ok: true, status: 200, message: 'ok', models }
}

function picker(
  result: ModelListResult | (() => Promise<ModelListResult>) = listing(),
  value = ''
): { onChange: ReturnType<typeof vi.fn>; listModels: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn()
  const listModels = vi.fn(typeof result === 'function' ? result : async () => result)

  render(
    <ModelPicker
      providerId="prv_0000000000"
      baseUrl="https://example.test/v1"
      value={value}
      onChange={onChange}
      listModels={listModels}
    />
  )

  return { onChange, listModels }
}

const options = (): string[] =>
  screen.getAllByRole('button').map((button) => button.textContent ?? '').filter((text) => text.includes('/'))

describe('ModelPicker', () => {
  it('fetches on focus and shows the whole catalogue before anything is typed', async () => {
    const { listModels } = picker()

    await userEvent.click(screen.getByRole('textbox'))

    await waitFor(() => expect(listModels).toHaveBeenCalledWith('prv_0000000000'))
    expect(await screen.findByText('openai/gpt-4o')).toBeInTheDocument()
    expect(screen.getByText(/6 of 6 models/)).toBeInTheDocument()
  })

  it('matches each term independently, so punctuation need not be reproduced', async () => {
    picker()

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('openai/gpt-4o')
    await userEvent.type(screen.getByRole('textbox'), 'gpt 4o')

    const shown = options()
    expect(shown).toContain('openai/gpt-4o')
    expect(shown).toContain('openai/gpt-4o-mini')
    expect(shown).not.toContain('anthropic/claude-opus-4')
  })

  it('ranks the earliest hit first, so a bare name beats a namespaced one', async () => {
    picker()

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('openai/gpt-4o')
    await userEvent.type(screen.getByRole('textbox'), 'openai/gpt-4o')

    const shown = options()
    expect(shown[0]).toBe('openai/gpt-4o')
    expect(shown.indexOf('openai/gpt-4o')).toBeLessThan(shown.indexOf('azure/openai/gpt-4o'))
  })

  it('selects a model by clicking it', async () => {
    const { onChange } = picker()

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.click(await screen.findByText('openai/gpt-4o-mini'))

    expect(onChange).toHaveBeenCalledWith('openai/gpt-4o-mini')
  })

  it('navigates with the arrow keys and selects with Enter', async () => {
    const { onChange } = picker()

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('openai/gpt-4o')
    await userEvent.type(screen.getByRole('textbox'), 'mistral')
    await userEvent.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('mistralai/mistral-7b-instruct:free')
  })

  it('accepts a model the provider did not list', async () => {
    // Not every endpoint advertises everything it serves, so the field has to
    // stay a text input rather than becoming a closed list.
    const { onChange } = picker()

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('openai/gpt-4o')
    await userEvent.type(screen.getByRole('textbox'), 'some-private-model{Enter}')

    expect(onChange).toHaveBeenCalledWith('some-private-model')
  })

  it('offers to use an unmatched query rather than looking broken', async () => {
    picker()

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('openai/gpt-4o')
    await userEvent.type(screen.getByRole('textbox'), 'zzzz')

    expect(screen.getByText(/Press Enter to use it anyway/)).toBeInTheDocument()
  })

  it('caps the rendered list and says how many matched', async () => {
    const many = Array.from({ length: 613 }, (_, index) => `vendor/model-${index}`)
    picker(listing(many))

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('vendor/model-0')

    expect(screen.getByText(/Showing 200 of 613 matches/)).toBeInTheDocument()
    expect(options()).toHaveLength(200)
  })

  it('surfaces a provider failure instead of an empty list', async () => {
    picker({ ok: false, status: 401, message: 'Incorrect API key provided', models: [] })

    await userEvent.click(screen.getByRole('textbox'))

    expect(await screen.findByText('Incorrect API key provided')).toBeInTheDocument()
  })

  it('refetches on demand, but only once otherwise', async () => {
    const { listModels } = picker()

    await userEvent.click(screen.getByRole('textbox'))
    await screen.findByText('openai/gpt-4o')
    await userEvent.click(screen.getByRole('textbox'))
    expect(listModels).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(listModels).toHaveBeenCalledTimes(2))
  })
})
