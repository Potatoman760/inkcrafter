// Read-only production editor smoke test; hide its isolated window.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
app.setAppPath(path.resolve(__dirname, '..'))
app.on('browser-window-created', (_event, win) => { win.on('show', () => win.hide()) })
const timer = setTimeout(() => app.exit(2), 35000)
require(path.resolve(__dirname, '../out/main/index.js'))
app.whenReady().then(async () => {
  try {
    await new Promise(done => setTimeout(done, 5000))
    const win = BrowserWindow.getAllWindows()[0]
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('.picker-item')].find(x=>x.innerText.startsWith('Breedhaven'))?.click()`)
    await new Promise(done => setTimeout(done, 1500))
    for (const label of ['Game', 'Minigames', 'The Consort’s Villa']) {
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(label)}||x.innerText.startsWith(${JSON.stringify(label + '\n')}))?.click()`)
      await new Promise(done => setTimeout(done, 400))
    }
    const state = await win.webContents.executeJavaScript(`({rooms:document.querySelectorAll('.estate-floorplan .map-hotspot').length, labels:[...document.querySelectorAll('.estate-floorplan .map-hotspot')].map(x=>x.textContent),errors:[...document.querySelectorAll('.settings-error')].map(x=>x.textContent)})`)
    console.log(JSON.stringify(state))
    if (state.rooms !== 9 || state.errors.length) throw Error('Editor did not load the nine-room plan')
    clearTimeout(timer);app.exit(0)
  } catch(error) { console.error(error);clearTimeout(timer);app.exit(1) }
})
