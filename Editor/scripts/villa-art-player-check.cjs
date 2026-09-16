// A hidden, isolated real-player check of the current nine-room catalogue.
const { app, BrowserWindow } = require('electron')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { writeFileSync } = require('node:fs')
let server
const delay = ms => new Promise(done => setTimeout(done, ms))
const timer = setTimeout(() => app.exit(2), 55000)
app.whenReady().then(async () => {
  try {
    const root = resolve(__dirname, '../../Player')
    const { createServer } = await import(pathToFileURL(resolve(root, 'node_modules/vite/dist/node/index.js')).href)
    server = await createServer({ root, server: { host: '127.0.0.1', port: 0, open: false }, plugins: [{ name: 'home-probe', configureServer(vite) {
      vite.middlewares.use('/__home_probe', (_req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.end(`<html><body style="margin:0"><div id="game"></div><script type="module">
          await import('/src/main.ts');
          const { EstateScene } = await import('/src/minigame/estate/EstateScene.ts');
          const original = EstateScene.prototype.create;
          EstateScene.prototype.create = function(data) { original.call(this, data); window.villaProbe = this; };
        </script></body></html>`)
      })
    } }] })
    await server.listen()
    const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { partition: 'home-probe-' + Date.now(), backgroundThrottling: false } })
    win.webContents.on('console-message', (_event, _level, message) => console.log('Renderer: ' + message))
    await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/__home_probe?game=breedhaven&minigame=consort_villa`)
    for (let i = 0; i < 120; i++) {
      if (await win.webContents.executeJavaScript('!!window.villaProbe?.definition')) break
      await delay(200)
    }
    const run = async code => {
      const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await eval(${JSON.stringify(code)})}}catch(error){return {error:error.stack}}})()`)
      if (result.error) throw Error(result.error)
      return result.value
    }
    const setup = await run(`(() => {
      const v=window.villaProbe;
      if(v.definition.rooms.length!==9||v.definition.residents.length!==6)throw Error('Wrong exported catalogue');
      v.endTutorial();v.launchData.mode='story';
      for(const a of ['faye','tink','yelena','dinah'])v.state.engine.setVariable('villa_partner_'+a,a==='faye');
      v.state.engine.setVariable('trial_ally','faye');v.state.engine.setVariable('villa_day',9);v.state.engine.setVariable('villa_phase','morning');
      v.state.engine.setVariable('villa_seraphine_available',true);v.state.engine.setVariable('villa_couple_settled',true);
      v.ledger={...v.ledger,day:9,crowns:1000,rooms:['hall','master'],residents:['faye'],assignments:{faye:'master'},completed:[]};
      v.persist();v.openRoom('garden');
      const buttons=()=>v.controls.flatMap(c=>c.object.list.filter(x=>typeof x.text==='string').map(x=>x.text));
      if(!buttons().includes('Restore · 45'))throw Error('Garden restoration button missing');
      v.controls.find(c=>c.object.list.some(x=>x.text==='Restore · 45')).activate();
      if(v.ledger.crowns!==955||!buttons().includes('An afternoon together'))throw Error('Restoration did not unlock garden romance');
      window.homeButtons=buttons;
      return {rooms:v.definition.rooms.map(r=>r.name),garden:buttons()};
    })()`)
    console.log(JSON.stringify(setup))
    const capture = async name => {
      const data = await run(`new Promise(done=>{const g=window.villaProbe.game;g.renderer.snapshot(img=>done(img.src));g.loop.wake();g.step(performance.now(),16)})`)
      writeFileSync(resolve(__dirname, '../out/' + name + '.png'), Buffer.from(data.split(',')[1], 'base64'))
    }
    await capture('villa-home-garden')
    await run(`(() => {const v=window.villaProbe;v.ledger.completed=['villa_faye_garden'];v.openRoom('garden');if(!window.homeButtons().includes('Memory: An afternoon together'))throw Error('Completed scene not a memory');v.openRoom('hall');if(!window.homeButtons().includes('Invite Seraphine'))throw Error('Reception invite missing');if(window.homeButtons().includes('A private evening'))throw Error('Private invitation bypassed story gate');})()`)
    await capture('villa-home-reception')
    await run(`(() => {const v=window.villaProbe;v.act({kind:'restore',key:'baths'});v.openRoom('baths');if(!window.homeButtons().includes('Warm water')||!window.homeButtons().includes('Take a bath'))throw Error('Bath activities missing');})()`)
    await capture('villa-home-baths')
    await run(`(() => {const v=window.villaProbe;v.openRoom('master');if(!window.homeButtons().includes('A room for two'))throw Error('Master scene missing');v.navigate('villa');})()`)
    await capture('villa-home-floorplan')
    for (const key of ['library','dining','games']) {
      await run(`(() => {const v=window.villaProbe;v.ledger.crowns=1000;v.ledger.rooms=v.ledger.rooms.filter(k=>k!=='${key}');v.openRoom('${key}');const r=v.definition.rooms.find(r=>r.key==='${key}');if(!v.art(r.background)||!v.art(r.unrestoredBackground)||v.art(r.background)===v.art(r.unrestoredBackground))throw Error('Missing paired textures '+r.key);})()`);
      await capture('villa-art-'+key+'-empty');
      await run(`window.villaProbe.act({kind:'restore',key:'${key}'})`);
      await capture('villa-art-'+key+'-furnished');
    }
    console.log('Real player passed: nine room destinations, restoration spending/unlock, partner scenes, memories, reception guest gate and bath controls.')
    win.destroy();await server.close();clearTimeout(timer);app.exit(0)
  } catch (error) { console.error(error);await server?.close();clearTimeout(timer);app.exit(1) }
})
