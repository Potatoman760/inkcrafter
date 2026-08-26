const { app, BrowserWindow } = require('electron')

setTimeout(() => {
  console.log('hard timeout')
  app.exit(2)
}, 40000)

require(require('path').join(__dirname, 'out/main/index.js'))

app.whenReady().then(async () => {
  await new Promise((resolve) => setTimeout(resolve, 8000))
  const win = BrowserWindow.getAllWindows()[0]
  const result = await win.webContents.executeJavaScript(`({
    rootLength: document.getElementById('root')?.innerHTML.length ?? 0,
    title: document.title
  })`)
  console.log(`PROBE: ${JSON.stringify(result)}`)
  app.exit(result.rootLength > 0 ? 0 : 1)
})
