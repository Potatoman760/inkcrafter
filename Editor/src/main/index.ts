import { join } from 'node:path'
import { app, shell, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc'
import { handleMediaRequests, registerMediaScheme } from './mediaProtocol'
import { WINDOW_BACKGROUND } from '@shared/theme'
import { buildMenu } from './menu'
import { seedWorkspace } from './seed'
import { ensureWorkspace } from './workspace'
import { loadSettings } from './settings'

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    title: 'InkCrafter',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer is untrusted web content by construction: it renders story
      // text and, later, model output. Keep it sandboxed and talking only over IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Electron's native zoom is used instead of scaling selected CSS tokens, so
  // the editor, dialogs, previews and hit targets all remain in proportion.
  try {
    window.webContents.setZoomFactor((await loadSettings()).interfaceScale)
  } catch (error) {
    console.error('Could not apply the saved interface size:', error)
  }

  window.once('ready-to-show', () => window.show())

  buildMenu(window)

  // Anything trying to open a new window goes to the system browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Before whenReady, necessarily: registering later leaves the scheme
// non-standard, which gives it an opaque origin that the CSP will not match.
registerMediaScheme()

app.whenReady().then(async () => {
  // The workspace should exist before the first dialog wants to open in it, but
  // a read-only or otherwise unwritable location must not stop the app opening —
  // the editor still works, and saving will report the real error.
  try {
    await ensureWorkspace()
    await seedWorkspace()
  } catch (error) {
    console.error('Could not prepare the workspace:', error)
  }

  handleMediaRequests()
  registerIpcHandlers()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
