// Live VN + map handoff, isolated from the user's windows and save namespace.
const { app, BrowserWindow } = require('electron')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { writeFileSync } = require('node:fs')
let server
const delay = ms => new Promise(done => setTimeout(done, ms))
const timer = setTimeout(() => { console.error('Chapter 5 player probe timed out'); app.exit(2) }, 55000)
app.whenReady().then(async () => {
  try {
    const root = resolve(__dirname, '../../Player')
    const { createServer } = await import(pathToFileURL(resolve(root, 'node_modules/vite/dist/node/index.js')).href)
    server = await createServer({ root, server:{host:'127.0.0.1',port:0,open:false}, plugins:[{name:'chapter5-check',configureServer(vite){
      vite.middlewares.use('/__chapter5_probe',(_req,res)=>{
        res.setHeader('Content-Type','text/html')
        res.end(`<html><body style="margin:0"><div id="game"></div><script type="module">
          import { MainMenuScene } from '/src/scenes/MainMenuScene.ts';
          import { VNScene } from '/src/scenes/VNScene.ts';
          import { getGameState } from '/src/state/registry.ts';
          const original = MainMenuScene.prototype.create;
          MainMenuScene.prototype.create = function(...args) {
            original.apply(this,args); const state=getGameState(this);
            state.newGame(); state.engine.setVariable('trial_ally','tink');
            state.engine.setVariable('seraphine_relationship','love');
            state.engine.goTo('sire_consort_after'); this.scene.start('VN',{mode:'preview'});
          };
          const createVN=VNScene.prototype.create;
          VNScene.prototype.create=function(data){createVN.call(this,data);window.chapter5Probe=this;};
          await import('/src/main.ts');
        </script></body></html>`)
      })
    }}] })
    await server.listen()
    const win=new BrowserWindow({show:false,width:1280,height:720,useContentSize:true,webPreferences:{partition:'chapter5-flow-check',backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}})
    win.webContents.on('console-message',(_event,_level,message)=>console.log('Renderer: '+message))
    await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/__chapter5_probe?game=breedhaven`)
    for(let i=0;i<170;i++){if(await win.webContents.executeJavaScript('!!window.chapter5Probe?.state'))break;await delay(150)}
    await win.webContents.executeJavaScript(`(async()=>{
      const v=window.chapter5Probe;
      if(!v)throw new Error('VN did not load');
      for(let i=0;i<8&&!v.scene.isActive('Map');i++){await v.advance();v.game.loop.wake();v.game.step(performance.now(),16);await new Promise(r=>setTimeout(r,30));}
      if(!v.scene.isActive('Map'))throw new Error('Royal scene did not open the map');
      if(v.state.showingMap()?.name!=='seedblossom')throw new Error('Wrong map area');
      if(v.state.engine.visitCount('shared_court'))throw new Error('Court breakfast fired immediately');
      const m=v.scene.get('Map');
      if(!m.children.list.some(x=>x.texture?.key?.includes('consort_villa_marker')))throw new Error('Villa marker not drawn');
      window.mapBefore=v.state.engine.saveState();
    })()`)
    const capture=async name=>{
      const data=await win.webContents.executeJavaScript(`new Promise(resolve=>{const g=window.chapter5Probe.game;g.renderer.snapshot(image=>resolve(image.src));g.loop.wake();g.step(performance.now(),16);})`)
      writeFileSync(resolve(__dirname,'../out/'+name),Buffer.from(data.split(',')[1],'base64'))
    }
    await capture('chapter5-villa-map.png')
    // Exercise the real map's pointer target, not a direct Ink divert.
    const point = await win.webContents.executeJavaScript(`(()=>{const v=window.chapter5Probe,m=v.scene.get('Map');const loc=v.state.showingMap().locations.find(l=>l.art==='consort_villa_marker');const bounds=v.game.canvas.getBoundingClientRect();v.game.loop.wake();v.game.step(performance.now(),16);return{x:Math.round(bounds.x+(m.frame.x+loc.x*m.frame.scale)/1280*bounds.width),y:Math.round(bounds.y+(m.frame.y+loc.y*m.frame.scale)/720*bounds.height)};})()`)
    win.webContents.sendInputEvent({type:'mouseMove',...point})
    win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1})
    win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1})
    await delay(150)
    await win.webContents.executeJavaScript(`(async()=>{
      const v=window.chapter5Probe;
      for(let i=0;i<120&&v.state.engine.canContinue;i++)await v.advance();
      if(v.state.engine.getVariable('villa_day')!==1||v.state.engine.visitCount('shared_court'))throw new Error('Villa entry did not start Day 1 alone');
      if(!v.state.engine.choices.some(c=>c.text==='Manage the villa'))throw new Error('Day 1 menu missing');
      // Returning to the map and closing it must not reopen it or alter the day.
      v.jumpTo('villa_world_map');
      await new Promise(r=>setTimeout(r,100));v.game.step(performance.now(),16);
      v.scene.get('Map').close();v.game.step(performance.now(),16);
      await v.rebuildAndShow();v.game.step(performance.now(),16);
      if(v.scene.isActive('Map')||v.state.engine.getVariable('villa_day')!==1)throw new Error('Map event replayed on restore');
      // A first private meeting clears Kael from the stage.
      v.state.engine.setVariable('villa_day',4);v.state.engine.setVariable('villa_phase','evening');
      v.state.engine.setVariable('shared_relationship','accepted');v.state.engine.setVariable('villa_shared_since',2);
      v.jumpTo('shared_private_meeting');await new Promise(r=>setTimeout(r,100));
      const sprites=v.state.sceneMeta.sprites.map(sprite=>sprite.name);
      if(sprites.includes('kael')||!sprites.includes('tink')||!sprites.includes('seraphine'))throw new Error('Incorrect private meeting cast');
      v.dialogue.skip();
    })()`)
    await capture('chapter5-private-meeting.png')
    console.log('Chapter 5 live player passed: automatic Seedblossom map, visible/clickable villa, Day 1 handover, no immediate court, map return and private staging.')
    clearTimeout(timer);await server.close();win.destroy();app.exit(0)
  }catch(error){console.error(error);clearTimeout(timer);if(server)await server.close();app.exit(1)}
})
