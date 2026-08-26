import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  lastUploadDir: vi.fn(),
  setLastUploadDir: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: mocks.showOpenDialog }
}))

vi.mock('./settings', () => ({
  lastUploadDir: mocks.lastUploadDir,
  setLastUploadDir: mocks.setLastUploadDir
}))

const { chooseUploadFile } = await import('./uploadPicker')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lastUploadDir.mockResolvedValue(null)
  mocks.setLastUploadDir.mockResolvedValue(undefined)
})

describe('chooseUploadFile', () => {
  it('starts in the previous upload folder and remembers the chosen file\'s folder', async () => {
    mocks.lastUploadDir.mockResolvedValue('C:\\art\\characters')
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\art\\backgrounds\\forest.png']
    })

    await expect(
      chooseUploadFile('Choose a picture', [{ name: 'Pictures', extensions: ['png'] }])
    ).resolves.toBe('C:\\art\\backgrounds\\forest.png')

    expect(mocks.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'C:\\art\\characters' })
    )
    expect(mocks.setLastUploadDir).toHaveBeenCalledWith('C:\\art\\backgrounds')
  })

  it('lets the OS choose the initial folder before an upload has happened', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    await chooseUploadFile('Choose a picture', [])

    expect(mocks.showOpenDialog.mock.calls[0]![0]).not.toHaveProperty('defaultPath')
  })

  it('does not forget the previous folder when the picker is cancelled', async () => {
    mocks.lastUploadDir.mockResolvedValue('C:\\art')
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    await expect(chooseUploadFile('Choose a picture', [])).resolves.toBeNull()
    expect(mocks.setLastUploadDir).not.toHaveBeenCalled()
  })
})
