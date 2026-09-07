// Isolated real-player smoke test. No existing app window or player save is used.
// Uses a private Vite middleware page to capture the real EstateScene, not a shipped debug hook.
const { app, BrowserWindow } = require('electron')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { writeFileSync } = require('node:fs')
let server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timer = setTimeout(() => { console.error('Player villa probe timed out'); app.exit(2) }, 55000)
app.whenReady().then(async () => {
  try {
    const root = resolve(__dirname, '../../Player')
    const { createServer } = await import(pathToFileURL(resolve(root, 'node_modules/vite/dist/node/index.js')).href)
    server = await createServer({ root, server: { host: '127.0.0.1', port: 0, open: false }, plugins: [{ name: 'villa-smoke-only', configureServer(vite) {
      vite.middlewares.use('/__villa_probe', (_req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.end(`<html><body style="margin:0"><div id="game"></div><script type="module">
          import { EstateScene } from '/src/scenes/EstateScene.ts';
          const original = EstateScene.prototype.create;
          EstateScene.prototype.create = function(data) { original.call(this, data); window.villaProbe = this; };
          await import('/src/main.ts');
        </script></body></html>`)
      })
    } }] })
    await server.listen()
    const win = new BrowserWindow({ show: false, width: 1280, height: 720, useContentSize: true,
      webPreferences: { partition: 'villa-review-probe', backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    win.webContents.on('console-message', (_event, _level, message) => console.log('Renderer: ' + message))
    win.webContents.on('did-fail-load', (_event, code, message) => console.error('Load failed: ' + code + ' ' + message))
    await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/__villa_probe?game=breedhaven&minigame=consort_villa`)
    for (let i = 0; i < 160; i++) {
      if (await win.webContents.executeJavaScript('!!window.villaProbe?.definition')) break
      await delay(200)
    }
    const capture = async name => {
      const data = await win.webContents.executeJavaScript(`new Promise(resolve => {
        const game = window.villaProbe.game;
        game.renderer.snapshot(image => resolve(image.src));
        game.loop.wake(); game.step(performance.now(), 16);
      })`)
      writeFileSync(resolve(__dirname, '../out/' + name), Buffer.from(data.split(',')[1], 'base64'))
    }
    const tour = await win.webContents.executeJavaScript(`(() => {
      const v = window.villaProbe;
      if (v.tutorialStep !== 0 || !v.children.getByName('estate-tutorial-guide')) throw new Error('Isolde tutorial did not auto-start');
      window.tourBefore = JSON.stringify(v.ledger);
      window.storyBefore = v.state.engine.getVariable(v.definition.stateVariable);
      v.act({kind:'restore',key:'east'}); v.act({kind:'contract',index:0}); v.act({kind:'settle'}); v.finish();
      if(JSON.stringify(v.ledger) !== window.tourBefore || v.closed) throw new Error('Tour allowed underlying actions');
      return v.tutorialSteps().length;
    })()`)
    for (let step = 0; step < tour; step++) {
      if ([0, 2, 3, 7, 8].includes(step)) await capture('villa-tutorial-' + step + '.png')
      await win.webContents.executeJavaScript(`(() => {
        const v = window.villaProbe;
        if (v.tutorialStep !== ${step}) throw new Error('Wrong tour step');
        v.input.keyboard.emit('keydown', {key:'Enter', code:'Enter', repeat:false, preventDefault(){}});
      })()`)
    }
    await win.webContents.executeJavaScript('window.villaProbe.startTutorial()')
    const click = async (x, y) => {
      const point = await win.webContents.executeJavaScript(`(() => {
        // Hidden windows can stop animation frames. Flush Phaser's pending
        // input registrations and render list before native hit testing.
        const game = window.villaProbe.game; game.loop.wake(); game.step(performance.now(), 16);
        const bounds = window.villaProbe.game.canvas.getBoundingClientRect();
        return {x:Math.round(bounds.x + ${x} / 1280 * bounds.width), y:Math.round(bounds.y + ${y} / 720 * bounds.height)};
      })()`)
      win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
      win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      await delay(100)
    }
    await click(190, 365) // Restore on the plan underneath the modal tour.
    await win.webContents.executeJavaScript(`(() => {
      const v = window.villaProbe;
      if (v.ledger.rooms.includes('east') || v.tutorialStep !== 0) throw new Error('Click leaked through tutorial');
    })()`)
    await click(1160, 669) // The tour's actual Next button.
    await win.webContents.executeJavaScript(`(() => {
      const v = window.villaProbe;
      if (v.tutorialStep !== 1) throw new Error('Mouse Next failed: ' + JSON.stringify({ step:v.tutorialStep, pointer:[v.input.activePointer.x,v.input.activePointer.y], bounds:v.game.canvas.getBoundingClientRect().toJSON() }));
      const original = navigator.getGamepads;
      const buttons = Array.from({length:16}, () => ({pressed:false}));
      Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:() => [{axes:[0,0], buttons}]});
      try {
        buttons[0].pressed = true; v.events.emit('update');
        if (v.tutorialStep !== 2) throw new Error('Controller A failed');
        buttons[0].pressed = false; v.events.emit('update');
        buttons[1].pressed = true; v.events.emit('update');
        if (v.tutorialStep !== -1) throw new Error('Controller B failed');
        buttons[1].pressed = false; v.events.emit('update');
      } finally { Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:original}); }
    })()`)
    await win.webContents.executeJavaScript(`(() => {
      const v = window.villaProbe, {tutorialSeen, ...after} = v.ledger;
      if (v.tutorialStep !== -1 || tutorialSeen !== v.definition.tutorial.version || JSON.stringify(after) !== window.tourBefore) throw new Error('Tour changed the estate');
      if (v.state.engine.getVariable(v.definition.stateVariable) !== window.storyBefore) throw new Error('Test tour wrote story progress');
      v.navigate('commissions'); v.startTutorial(); v.moveTutorial(3);
      v.input.keyboard.emit('keydown', {key:'Escape', repeat:false});
      if (v.page !== 'commissions' || v.tutorialStep !== -1) throw new Error('Skip did not restore the previous page');
      v.launchData.mode = 'story'; v.startTutorial(); v.endTutorial();
      if (JSON.parse(v.state.engine.getVariable(v.definition.stateVariable)).tutorialSeen !== v.definition.tutorial.version) throw new Error('Story tutorial completion not saved');
      v.launchData.mode = 'test'; v.render();
    })()`)
    await click(700, 60)
    await win.webContents.executeJavaScript(`(() => {
      const v=window.villaProbe, input=document.querySelector('input[aria-label="Test crowns"]');
      if(!input||document.activeElement!==input) throw new Error('Click did not open and focus the test crown editor');
      input.value='2468';
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      if(v.ledger.crowns!==2468) throw new Error('Enter did not apply edited crowns');
      if(document.querySelector('input[aria-label="Test crowns"]')) throw new Error('Crown editor stayed open after Enter');
      const flatten=list=>list.flatMap(one=>[one,...(Array.isArray(one.list)?flatten(one.list):[])]);
      if(!flatten(v.children.list).some(one=>one.text==='2468 crowns')) throw new Error('Edited crown total did not rerender');
    })()`)
    const result = await win.webContents.executeJavaScript(`(() => {
      const view = window.villaProbe;
      if (!view?.definition) throw new Error('Villa did not load');
      const assert = (ok, message) => { if (!ok) { console.error('Assertion: ' + message); throw new Error(message); } };
      const flatten = list => list.flatMap(one => [one, ...(Array.isArray(one.list) ? flatten(one.list) : [])]);
      const text = () => flatten(view.children.list).filter(one => typeof one.text === 'string').map(one => one.text);
      assert(view.launchData.mode === 'test', 'Direct test mode');
      assert(text().includes('Reset test'), 'Test reset control missing');
      view.navigate('commissions'); assert(text().includes('End day'), 'Test day control missing');
      const testDay = view.ledger.day; view.act({kind:'settle'});
      assert(view.ledger.day === testDay + 1, 'Test day did not advance');
      view.launchData.mode = 'story'; view.calendar = null; view.render();
      assert(!text().includes('End day'), 'Day control leaked into story without a calendar');
      const storyCrowns = flatten(view.children.list).find(one => one.text === view.ledger.crowns + ' crowns');
      assert(storyCrowns && !storyCrowns.input, 'Crown editor leaked into story mode');
      const storyDay = view.ledger.day; view.act({kind:'settle'});
      assert(view.ledger.day === storyDay, 'Story action advanced the day');
      for (const room of view.definition.rooms.filter(one => ['guest','guest_2'].includes(one.key))) {
        assert(view.art(room.background), room.name + ' restored art missing');
        assert(view.art(room.unrestoredBackground), room.name + ' empty art missing');
      }
      view.ledger.crowns = 1000;
      view.launchData.mode = 'story'; view.calendar = view.definition.calendar;
      view.state.engine.setVariable('villa_day', 8);
      view.state.engine.setVariable('villa_phase', 'evening');
      view.state.engine.setVariable('villa_settled', 7);
      view.ledger.day = 8; view.ledger.selected = [0];
      view.settleIfDue(); const earned = view.ledger.crowns;
      view.settleIfDue(); assert(view.ledger.crowns === earned, 'Double settlement');
      view.ledger.day = 9; view.state.engine.setVariable('villa_day', 9); view.state.engine.setVariable('villa_phase', 'morning');
      view.navigate('commissions');
      assert(text().includes('Commissions complete'), 'Final board heading');
      assert(!text().includes('Pays at dusk'), 'Final board offers payout');
      assert(!text().includes('Reset test'), 'Test reset leaked into story');
      const before = view.ledger.crowns;
      view.act({kind:'contract', index:0}); assert(view.ledger.selected.length === 0, 'Final assignment accepted');
      view.settleIfDue(); assert(view.ledger.crowns === before, 'Ninth payout');
      view.openRoom('guest');
      return { day: view.ledger.day, crowns: before, lastWorkday: view.calendar.lastWorkday, rooms: view.visibleRooms().length };
    })()`)
    await capture('villa-isolde-unrestored.png')
    await win.webContents.executeJavaScript(`(() => {
      const v = window.villaProbe;
      v.act({kind:'restore',key:'guest'}); v.state.engine.setVariable('isolde_arrived',true);
      v.act({kind:'invite',key:'isolde',room:'guest'}); v.openRoom('guest');
      const label = 'After the ledgers close';
      const flatten = list => list.flatMap(one => [one, ...(Array.isArray(one.list) ? flatten(one.list) : [])]);
      const button = flatten(v.children.list).find(one => one.text === label);
      if (!button) throw new Error('Gated scene label missing');
      v.act({kind:'scene',result:'villa_isolde_night'});
      if(v.closed || v.ledger.seen.includes('villa_isolde_night')) throw new Error('False scene gate bypassed');
    })()`)
    await capture('villa-isolde-restored.png')
    await win.webContents.executeJavaScript(`(() => {
      const v=window.villaProbe;
      v.state.engine.setVariable('lira_is_bred',true); v.state.engine.setVariable('piri_is_bred',false);
      v.act({kind:'restore',key:'garden'}); v.openRoom('garden');
      if(v.invitations('garden').length) throw new Error('Joint invitation opened before Piri');
      v.act({kind:'invite',key:'lira',room:'garden'});
      if(v.ledger.residents.includes('lira')) throw new Error('Partial pair invited');
      v.state.engine.setVariable('piri_is_bred',true); v.render();
      const flatten=list=>list.flatMap(one=>[one,...(Array.isArray(one.list)?flatten(one.list):[])]);
      if(!flatten(v.children.list).some(one=>one.text==='Invite Lira + Piri')) throw new Error('Missing joint invitation label');
      v.act({kind:'invite',key:'lira',room:'garden'});
      if(v.ledger.assignments.lira!=='garden'||v.ledger.assignments.piri!=='garden') throw new Error('Pair not housed together');
      if(!flatten(v.children.list).some(one=>one.texture?.key==='char_piri_neutral')) throw new Error('Piri neutral sprite missing');
    })()`)
    await capture('villa-shared-garden.png')
    await win.webContents.executeJavaScript(`(() => { const v=window.villaProbe; v.openRoom('baths'); v.takeBath(); if(v.page==='bath') throw new Error('Unrestored bath opened'); })()`)
    await capture('villa-bathhouse-unrestored.png')
    await win.webContents.executeJavaScript(`(() => {
      const v=window.villaProbe;
      window.bathHomes=JSON.stringify(v.ledger.assignments);
      v.act({kind:'restore',key:'baths'}); v.openRoom('baths');
      const flatten=list=>list.flatMap(one=>[one,...(Array.isArray(one.list)?flatten(one.list):[])]);
      const labels=()=>flatten(v.children.list).map(one=>one.text);
      if(v.page!=='room'||!labels().includes('Take a bath')) throw new Error('Bath entry button missing');
      window.bathLedger=JSON.stringify(v.ledger); v.takeBath();
      if(!labels().includes('Roman bathhouse')||!labels().includes('Lira')||!labels().includes('Piri')||!labels().includes('Isolde')) throw new Error('Bathhouse household missing');
      if(labels().includes('Invite Piri')||labels().includes('See them off')) throw new Error('Baths changed housing controls');
      if(JSON.stringify(v.ledger.assignments)!==window.bathHomes) throw new Error('Visiting baths moved residents');
      if(flatten(v.children.list).some(one=>one.texture?.key==='char_piri_neutral')) throw new Error('Missing bath sprite fell back to ordinary outfit');
      const firstCrop=flatten(v.children.list).find(one=>one.texture?.key?.startsWith('estate-bath:'));
      if(!firstCrop||firstCrop.scaleX!==1||firstCrop.scaleY!==1||firstCrop.width>360||firstCrop.height>320) throw new Error('Optimized bath crop missing: '+JSON.stringify(firstCrop&&{key:firstCrop.texture?.key,width:firstCrop.width,height:firstCrop.height,scaleX:firstCrop.scaleX,scaleY:firstCrop.scaleY}));
      const crop=flatten(v.children.list).find(one=>one.texture?.key?.startsWith('estate-bath:char_piri_bath:'));
      if(!crop||crop.scaleX!==1||crop.scaleY!==1) throw new Error('Piri was not rendered natively');
      if(JSON.stringify(v.ledger)!==window.bathLedger) throw new Error('Bath changed ledger');
      const isolde=flatten(v.children.list).find(one=>one.texture?.key?.startsWith('estate-bath:char_isolde_bath:'));
      if(!isolde||isolde.scaleX!==1||isolde.scaleY!==1) throw new Error('Isolde bath sprite missing');
    })()`)
    await capture('villa-bathhouse-restored.png')
    await win.webContents.executeJavaScript(`(() => {const v=window.villaProbe; v.back(); if(v.page!=='room') throw new Error('Bath Back failed'); v.takeBath(); })()`)
    await win.webContents.executeJavaScript(`(() => {
      const v=window.villaProbe;
      window.beforeBathCrowd=JSON.stringify(v.ledger); v.launchData.mode='test'; v.ledger.crowns=5000;
      for(const room of v.definition.rooms) { if(room.availabilityVariable) v.testGates.set(room.availabilityVariable,true); v.act({kind:'restore',key:room.key}); }
      for(const person of v.definition.residents) v.act({kind:'invite',key:person.key});
      v.openRoom('baths'); v.takeBath();
      const flatten=list=>list.flatMap(one=>[one,...(Array.isArray(one.list)?flatten(one.list):[])]);
      const expected=['Maren','Anwen','Elowen','Lira','Piri','Tink','Faye','Dinah','Yelena','Daphne','Tamsin','Isolde'];
      const seen=[];
      for(let i=0;i<3;i++) {
        const objects=flatten(v.children.list);
        seen.push(...objects.map(one=>one.text).filter(text=>expected.includes(text)));
        const crops=objects.filter(one=>one.texture?.key?.startsWith('estate-bath:'));
        if(crops.length!==4||crops.some(one=>one.scaleX!==1||one.scaleY!==1||one.width>360||one.height>320)) throw new Error('Bath page did not use four optimized native-size crops');
        const next=v.controls.find(one=>flatten([one.object]).some(child=>child.text==='More guests'));
        if(next) next.activate();
      }
      if(!expected.every(name=>seen.includes(name))) throw new Error('Bath guest pages missing: '+expected.filter(name=>!seen.includes(name)).join(', '));
    })()`)
    await capture('villa-bathhouse-company.png')
    await win.webContents.executeJavaScript(`(() => { const v=window.villaProbe; v.ledger=JSON.parse(window.beforeBathCrowd); v.launchData.mode='story'; v.testGates.clear(); v.persist(); v.openRoom('baths'); })()`)
    await win.webContents.executeJavaScript(`(() => {
      const v=window.villaProbe;
      window.savedVillaCrowns=v.ledger.crowns;
      v.state.engine.setVariable('villa_day',10);
      v.scene.restart({name:'consort_villa',mode:'story'});
      v.game.loop.wake(); v.game.step(performance.now(),16);
    })()`)
    await delay(200)
    await win.webContents.executeJavaScript(`(() => {
      const v=window.villaProbe;
      if(v.ledger.day!==10||v.ledger.crowns!==window.savedVillaCrowns) throw new Error('Startup did not resync Ink day safely');
      if(v.tutorialStep!==-1) throw new Error('Startup forgot tutorial completion');
    })()`)
    console.log('Real player villa smoke passed: ' + JSON.stringify(result))
    win.destroy(); await server.close(); clearTimeout(timer); app.exit(0)
  } catch (error) {
    console.error(error); await server?.close(); clearTimeout(timer); app.exit(1)
  }
})
