// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installApi, settings } from '../../../test/harness'
import { SettingsDialog } from './SettingsDialog'

beforeEach(() => {
  installApi()
})

describe('SettingsDialog appearance', () => {
  it('opens on interface size and saves a new zoom level', async () => {
    const setInterfaceScale = vi.fn(async (scale: number) => settings({ interfaceScale: scale }))
    installApi({ settings: { setInterfaceScale } })
    render(<SettingsDialog onClose={vi.fn()} />)

    const picker = await screen.findByRole('combobox', { name: 'Interface size' })
    await userEvent.selectOptions(picker, '1.25')

    expect(setInterfaceScale).toHaveBeenCalledWith(1.25)
  })
})
