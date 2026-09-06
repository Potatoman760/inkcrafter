// Launch the production renderer and inspect its mounted DOM (no authoring writes).
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { writeFileSync } = require('node:fs')
app.setAppPath(path.resolve(__dirname, '..'))
setTimeout(() => { console.error('Villa renderer probe timed out'); app.exit(2) }, 35000)
require(path.resolve(__dirname, '../out/main/index.js'))
app.whenReady().then(async () => {
  await new Promise(resolve => setTimeout(resolve, 6000))
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) { console.error('No renderer window'); app.exit(1); return }
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.picker-item')].find(x => x.innerText.startsWith('Breedhaven'))?.click()`)
  await new Promise(resolve => setTimeout(resolve, 1800))
  for (const label of ['Game', 'Minigames', 'The Consort’s Villa']) {
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(x => x.innerText.trim() === ${JSON.stringify(label)} || x.innerText.startsWith(${JSON.stringify(label + '\n')}))?.click()`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  await win.webContents.executeJavaScript(`document.querySelector('.estate-floorplan')?.scrollIntoView({block:'center'})`)
  await new Promise(resolve => setTimeout(resolve, 500))
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.estate-floorplan button')].find(x => x.innerText === 'Expand')?.click()`)
  await new Promise(resolve => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.estate-floorplan .map-hotspot')].find(x => x.innerText.includes('Lira'))?.click()`)
  await new Promise(resolve => setTimeout(resolve, 200))
  const state = await win.webContents.executeJavaScript(`({ root: document.getElementById('root')?.innerHTML.length, rooms: document.querySelectorAll('.estate-floorplan .map-hotspot').length, imageLoaded: document.querySelector('.estate-floorplan img')?.naturalWidth, canvasWidth: document.querySelector('.estate-floorplan__canvas')?.getBoundingClientRect().width, resident: document.querySelector('[aria-label="Intended resident"]')?.value, interiorLoaded: document.querySelector('img[alt="Room background preview"]')?.naturalWidth, interior: document.querySelector('[aria-label="Room background"]')?.value, errors: [...document.querySelectorAll('.settings-error')].map(x => x.innerText) })`)
  console.log(JSON.stringify(state))
  const household = await win.webContents.executeJavaScript(`({ roommate: document.querySelector('[aria-label="Second resident"]')?.value, together: [...document.querySelectorAll('label')].find(x => x.textContent.includes('Invite together'))?.querySelector('input')?.checked, dependencies: [...document.querySelectorAll('.estate-floorplan label')].some(x => x.textContent.trim() === 'Requires') })`)
  console.log('Shared household editor: ' + JSON.stringify(household))
  if (household.roommate !== 'piri' || !household.together || household.dependencies) { app.exit(1); return }
  const unrestored = await win.webContents.executeJavaScript(`({ selected: document.querySelector('[aria-label="Unrestored art"]')?.value, loaded: document.querySelector('img[alt="Unrestored art preview"]')?.naturalWidth })`)
  console.log('Unrestored art: ' + JSON.stringify(unrestored))
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.estate-floorplan .map-hotspot')].find(x => x.innerText.includes('Faye'))?.click()`)
  await new Promise(resolve => setTimeout(resolve, 200))
  const gate = await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Room availability variable"]')?.value`)
  console.log('Faye availability: ' + gate)
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.estate-floorplan .map-hotspot')].find(x => x.innerText.includes('Roman bathhouse'))?.click()`)
  await new Promise(resolve => setTimeout(resolve, 200))
  const bath = await win.webContents.executeJavaScript(`({background:document.querySelector('[aria-label="Bathing background"]')?.value,width:document.querySelector('[aria-label="Room width"]')?.value})`)
  if (!bath.background || Number(bath.width) < 250 || Number(bath.width) > 320) { console.error('Bath editor failed', bath); app.exit(1); return }
  writeFileSync(path.resolve(__dirname, '../out/villa-floorplan-editor.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(x => x.innerText === 'Tutorial')?.click()`)
  await new Promise(resolve => setTimeout(resolve, 300))
  const tutorial = await win.webContents.executeJavaScript(`(() => {
    const textarea = document.querySelector('[aria-label="Tutorial JSON"]');
    const script = textarea && JSON.parse(textarea.value);
    return {speaker: script?.speaker.sprite, steps: script?.steps.length, pureJson: textarea?.tagName === 'TEXTAREA'};
  })()`)
  console.log('Tutorial JSON editor: ' + JSON.stringify(tutorial))
  writeFileSync(path.resolve(__dirname, '../out/villa-tutorial-editor.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(x => x.innerText === 'Residents')?.click()`)
  await new Promise(resolve => setTimeout(resolve, 200))
  const crop = await win.webContents.executeJavaScript(`({sprite:document.querySelector('[aria-label="Bath sprite"]')?.value,percent:document.querySelector('[aria-label="Bath visible percent"]')?.value})`)
  console.log('Bath crop editor: ' + JSON.stringify(crop))
  app.exit(state.rooms === 14 && state.imageLoaded > 1500 && state.canvasWidth > 800 && state.resident === 'lira' && state.interiorLoaded === 1672 && state.interior && unrestored.selected && unrestored.loaded === 1672 && gate === 'faye_complete' && tutorial.speaker === 'isolde' && tutorial.steps === 12 && tutorial.pureJson && crop.sprite && crop.percent === '40' ? 0 : 1)
})
