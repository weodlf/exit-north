import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createGame,serializeGame} from '../src/game-engine.mjs';
import {world,route,atNode} from './helpers.mjs';
let browser,server;
const openContexts=new Set();
afterEach(async()=>{await Promise.all([...openContexts].map(context=>context.close()));});
const base='http://127.0.0.1:4173';
before(async()=>{
 const bin=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
 if(!bin)throw new Error('Chromium is required. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to its executable.');
 server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'4173',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Test server did not start')),8000);
   server.stdout.once('data',()=>{clearTimeout(timer);resolve();});
   server.once('error',error=>{clearTimeout(timer);reject(error);});
   server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Test server exited ${code}`));});
 });
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await mkdir(new URL('../artifacts/screenshots/',import.meta.url),{recursive:true});
});
after(async()=>{
 await browser?.close();
 if(server && server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
});
async function fresh(options={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',...options});
 openContexts.add(context);context.on('close',()=>openContexts.delete(context));
 return {context,page:await context.newPage()};
}
const snapshot=page=>page.evaluate(()=>ExitNorthBridge.getSnapshot());
async function loadState(context,state){
 const raw=serializeGame(state,world);
 await context.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key:'exit-north.save.v1',raw});
}

test('server serves the app, health checks, and blocks repository/source paths',async()=>{
 assert.equal((await fetch(base+'/healthz')).status,200);
 for(const path of ['/.git/config','/data/events.json','/src/game-engine.mjs','/%2e%2e/package.json'])assert.equal((await fetch(base+path)).status,404);
 assert.equal((await fetch(base,{method:'POST'})).status,405);
 const res=await fetch(base,{method:'HEAD'});assert.equal(res.status,200);assert.ok(res.headers.get('content-security-policy'));
});
test('desktop renders without JS errors or external runtime requests; clue choice works',async()=>{
 const {context,page}=await fresh();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(base+'?view=text');await page.locator('[data-choice="radio"]').click();
 assert.equal((await snapshot(page)).stats.hp,88);assert.equal((await snapshot(page)).stats.hunger,27);
 assert.equal(await page.locator('[data-choice="radio"]').isDisabled(),true);
 assert.equal(await page.locator('#hp-bar').getAttribute('aria-valuenow'),'88');
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(base)||url.startsWith('data:')));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'artifacts/screenshots/desktop.png',fullPage:true});await context.close();
});
test('mobile at 390px has no horizontal overflow and inventory interactions work',async()=>{
 const {context,page}=await fresh({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.goto(base+'?view=text');await page.locator('[data-item="bread"]').click();
 assert.equal((await snapshot(page)).inventory.bread,0);assert.equal((await snapshot(page)).turn,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'artifacts/screenshots/mobile.png',fullPage:true});await context.close();
});
test('typewriter can be skipped and reduced-motion mode shows full text immediately',async()=>{
 const {context,page}=await fresh({reducedMotion:'no-preference'});await page.goto(base+'?view=text');
 await page.getByRole('button',{name:/문장 바로 보기/}).click();
 assert.equal(await page.locator('#story-text').textContent(),world.nodes[0].text);assert.equal(await page.locator('#skip-text').isDisabled(),true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-choice="leave"]').click();
 assert.equal(await page.locator('#story-text').textContent(),world.nodes[1].text);await context.close();
});
test('keyboard shortcuts respect open dialogs and restart requires confirmation',async()=>{
 const {context,page}=await fresh();await page.goto(base+'?view=text');
 await page.getByRole('button',{name:'생존 규칙',exact:true}).click();await page.keyboard.press('1');assert.equal((await snapshot(page)).turn,0);
 await page.keyboard.press('Escape');await page.keyboard.press('1');assert.equal((await snapshot(page)).turn,1);
 await page.getByRole('button',{name:'새 여정 시작',exact:true}).click();assert.equal((await snapshot(page)).turn,1);
 await page.getByRole('button',{name:'계속 이어가기'}).click();assert.equal((await snapshot(page)).turn,1);
 await page.getByRole('button',{name:'새 여정 시작',exact:true}).click();await page.locator('#confirm-restart').click();assert.equal((await snapshot(page)).turn,0);await context.close();
});
test('reload preserves the complete save including PRNG state and clues',async()=>{
 const {context,page}=await fresh();await page.goto(base+'?view=text');await page.locator('[data-choice="radio"]').click();const before=await snapshot(page);
 await page.reload();assert.deepEqual(await snapshot(page),before);await context.close();
});
test('corrupt saves recover safely and denied storage leaves the game playable',async()=>{
 let {context,page}=await fresh();await context.addInitScript(()=>localStorage.setItem('exit-north.save.v1','{corrupt'));await page.goto(base+'?view=text');
 assert.equal((await snapshot(page)).turn,0);assert.ok((await page.locator('#toast').textContent()).includes('새 여정'));await context.close();
 ({context,page}=await fresh());await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('Storage blocked');};});await page.goto(base+'?view=text');
 await page.locator('[data-choice="coat"]').click();assert.equal((await snapshot(page)).stats.dollars,46);assert.ok((await page.locator('#toast').textContent()).includes('자동 저장'));await context.close();
});
test('lethal medicine use displays a game-over screen and locks further actions',async()=>{
 const {context,page}=await fresh();const state=createGame(world,42);state.stats.hp=1;await loadState(context,state);await page.goto(base+'?view=text');
 assert.equal(await page.locator('#item-risk').isVisible(),true);await page.locator('[data-item="medkit"]').click();
 assert.equal((await snapshot(page)).status,'dead');assert.equal(await page.locator('[data-choice]').count(),0);
 assert.equal(await page.locator('[data-item="bread"]').isDisabled(),true);assert.match(await page.locator('#story-title').textContent(),/멈췄다/);await context.close();
});
test('a complete six-chapter game reaches the epilogue using visible choices and supplies',async()=>{
 const {context,page}=await fresh();await page.goto(base+'?view=text');await page.evaluate(()=>ExitNorthBridge.dispatch({type:'RESTART',seed:42}));
 const visited=new Set(['ch1']);
 for(const id of route){
   for(let i=0;i<4;i++){
     const s=await snapshot(page);
     if(s.stats.hunger>=50 && (s.inventory.canned_food||s.inventory.bread))await page.locator(`[data-item="${s.inventory.canned_food?'canned_food':'bread'}"]`).click();
     else if(s.stats.hp<=58 && s.inventory.medkit)await page.locator('[data-item="medkit"]').click();
     else break;
   }
   const button=page.locator(`[data-choice="${id}"]`);assert.equal(await button.isEnabled(),true,`choice ${id} is locked`);await button.click();
   const s=await snapshot(page);assert.notEqual(s.status,'dead',`died at ${id}`);visited.add(s.chapterId);
 }
 const s=await snapshot(page);assert.equal(s.status,'escaped');assert.equal(visited.size,6);assert.equal(s.nodeId,'ch6.memory');
 await page.getByRole('button',{name:/진실의 방 읽기/}).click();assert.equal(await page.locator('#truth-dialog').isVisible(),true);
 await page.keyboard.press('Escape');await page.screenshot({path:'artifacts/screenshots/epilogue.png',fullPage:true});await context.close();
});
test('self-contained HTML runs offline without a server or a storage origin',async()=>{
 const {context,page}=await fresh();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await context.setOffline(true);await page.setContent(await readFile(new URL('../index.html',import.meta.url),'utf8'),{waitUntil:'load'});await page.waitForFunction(()=>window.ExitNorthBridge);if(await page.locator('body').evaluate(el=>el.classList.contains('mode-3d')))await page.locator('#view-mode-button').click();await page.locator('[data-choice="coat"]').click();
 assert.equal((await snapshot(page)).stats.dollars,46);assert.deepEqual(errors,[]);await context.close();
});

test('3D bridge commands produce exactly the same state as DOM interactions',async()=>{
 const {context,page}=await fresh();await page.goto(base+'?view=text');
 await page.evaluate(()=>ExitNorthBridge.dispatch({type:'RESTART',seed:42}));await page.locator('[data-choice="radio"]').click();const domState=await snapshot(page);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'choices-heading');
 await page.evaluate(()=>ExitNorthBridge.dispatch({type:'RESTART',seed:42}));
 const result=await page.evaluate(()=>ExitNorthBridge.dispatch({type:'CHOOSE',choiceId:'radio'}));
 assert.equal(result.ok,true);assert.deepEqual(result.state,domState);
 const scene=await page.evaluate(()=>ExitNorthBridge.getScene());assert.equal(scene.scene_3d,'home_dawn');assert.equal(scene.camera_mode,'third_person_follow');assert.ok(scene.hotspots.includes('wardrobe'));
 await context.close();
});
test('starvation warning matches the cost and surviving food clears it in the UI',async()=>{
 const {context,page}=await fresh();const state=createGame(world,42);state.stats.hp=7;state.stats.hunger=100;await loadState(context,state);await page.goto(base+'?view=text');
 assert.match(await page.locator('#hunger-note').textContent(),/아사 상태/);assert.match(await page.locator('#item-risk').textContent(),/−5/);
 await page.locator('[data-item="bread"]').click();assert.equal((await snapshot(page)).stats.hp,5);assert.equal((await snapshot(page)).stats.hunger,76);
 assert.equal(await page.locator('#hunger-card').evaluate(el=>el.classList.contains('starving')),false);
 await context.close();
});

async function fresh3D(options={}){
 const result=await fresh({viewport:{width:1200,height:800},...options});
 result.page.setDefaultTimeout(30000);
 await result.page.goto(base+'?view=3d');
 await result.page.waitForFunction(()=>window.ExitNorth3D?.getSnapshot().ready);
 return result;
}
const view3D=page=>page.evaluate(()=>ExitNorth3D.getSnapshot());

test('WebGL renders the rigged civilian, rotates the camera and charges physical movement',async()=>{
 const {context,page}=await fresh3D();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const initial=await view3D(page);assert.equal(initial.character.model,'blender-rigged');assert.equal(initial.character.animations.length,4);assert.ok(initial.drawCalls>20);
 await page.keyboard.down('w');await page.waitForFunction(()=>ExitNorth3D.getSnapshot().position.z<5.6);await page.keyboard.up('w');
 const s=await snapshot(page);assert.ok(s.turn>0);assert.ok(s.stats.hp<92);assert.ok(s.stats.hunger>18);
 const beforeCamera=await view3D(page);await page.mouse.move(600,380);await page.mouse.down();await page.mouse.move(750,400,{steps:5});await page.mouse.up();
 assert.ok(Math.abs((await view3D(page)).yaw-beforeCamera.yaw)>.3);
 await page.screenshot({path:'artifacts/screenshots/third-person.png'});assert.deepEqual(errors,[]);assert.equal(requests.length,0);await context.close();
});
test('walking up to a 3D object and pressing E exposes its choice and grants the clue',async()=>{
 const {context,page}=await fresh3D();
 await page.keyboard.down('a');await page.waitForFunction(()=>ExitNorth3D.getSnapshot().position.x< -2.3);await page.keyboard.up('a');
 await page.keyboard.down('w');await page.waitForFunction(()=>ExitNorth3D.getSnapshot().nearbyHotspot==='wardrobe');await page.keyboard.up('w');
 const before=await snapshot(page);await page.keyboard.press('e');assert.equal(await page.locator('[data-choice]:visible').count(),1);
 await page.locator('[data-choice="radio"]').click();const after=await snapshot(page);assert.equal(after.inventory.radio,1);assert.equal(after.stats.hp,before.stats.hp-4);assert.equal(after.stats.hunger,before.stats.hunger+9);
 assert.equal(await page.locator('body').getAttribute('data-panel'),'');await page.waitForFunction(()=>ExitNorth3D.getSnapshot().nearbyHotspot!=='wardrobe');
 await page.keyboard.press('i');assert.equal(await page.locator('#inventory').isVisible(),true);await page.locator('[data-item="bread"]').click();assert.equal((await snapshot(page)).inventory.bread,0);
 await page.keyboard.press('Escape');assert.equal(await page.locator('body').getAttribute('data-panel'),'');await context.close();
});
test('run and sneak use distinct animations and survival costs, and menus pause movement',async()=>{
 const {context,page}=await fresh3D();
 await page.keyboard.down('Shift');await page.keyboard.down('w');await page.waitForFunction(()=>ExitNorthBridge.getSnapshot().turn===1);await page.keyboard.up('w');await page.keyboard.up('Shift');
 assert.equal((await snapshot(page)).stats.hp,89);assert.equal((await snapshot(page)).stats.hunger,19);
 await page.keyboard.press('c');await page.keyboard.down('w');await page.waitForFunction(()=>ExitNorthBridge.getSnapshot().turn===2);
 assert.equal((await view3D(page)).animation,'Sneak');await page.keyboard.up('w');
 assert.equal((await snapshot(page)).stats.hp,88);assert.equal((await snapshot(page)).stats.hunger,22);
 await page.keyboard.press('i');const before=await view3D(page),s=await snapshot(page);
 await page.keyboard.down('w');await page.waitForFunction(frame=>ExitNorth3D.getSnapshot().frameCount>frame+3,before.frameCount);await page.keyboard.up('w');
 assert.deepEqual((await view3D(page)).position,before.position);assert.deepEqual((await snapshot(page)).stats,s.stats);await context.close();
});
test('solid buildings stop the character and blocked input does not keep draining HP',async()=>{
 const {context,page}=await fresh3D();
 // Align the camera to the wall normal. An oblique input intentionally slides along walls.
 const yaw=(await view3D(page)).yaw;
 await page.mouse.move(600,380);await page.mouse.down();await page.mouse.move(600+yaw/.006,380);await page.mouse.up();
 assert.ok(Math.abs((await view3D(page)).yaw)<.005);
 await page.keyboard.down('a');await page.waitForFunction(()=>ExitNorth3D.getSnapshot().position.x< -5.5);
 const reached=await view3D(page);await page.waitForFunction(frame=>ExitNorth3D.getSnapshot().frameCount>frame+4,reached.frameCount);const before=await view3D(page),s=await snapshot(page);
 await page.waitForFunction(frame=>ExitNorth3D.getSnapshot().frameCount>frame+4,before.frameCount);await page.keyboard.up('a');
 const after=await view3D(page);assert.equal(after.position.x,before.position.x);assert.ok(after.position.x>=-5.73);assert.ok(Math.abs(after.position.z-before.position.z)<.5);assert.deepEqual((await snapshot(page)).stats,s.stats);await context.close();
});
test('mobile direction pad moves the character with usable HUD and no horizontal overflow',async()=>{
 const {context,page}=await fresh3D({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const box=await page.locator('[data-move="forward"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForFunction(()=>ExitNorth3D.getSnapshot().position.z<5.7);await page.mouse.up();
 assert.ok((await snapshot(page)).turn>0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#inventory-toggle').click();assert.equal(await page.locator('[data-item="bread"]').isVisible(),true);await page.locator('#panel-close').click();
 await page.screenshot({path:'artifacts/screenshots/third-person-mobile.png'});await context.close();
});
test('3D renders all six chapters from actual narrative commands and preserves the ending',async()=>{
 const {context,page}=await fresh3D();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>ExitNorthBridge.dispatch({type:'RESTART',seed:42}));const rendered=new Set();
 for(const id of route){
   await page.evaluate(choiceId=>{
     for(let i=0;i<4;i++){
       const s=ExitNorthBridge.getSnapshot();
       if(s.stats.hunger>=50 && (s.inventory.canned_food||s.inventory.bread))ExitNorthBridge.dispatch({type:'USE_ITEM',itemId:s.inventory.canned_food?'canned_food':'bread'});
       else if(s.stats.hp<=58 && s.inventory.medkit)ExitNorthBridge.dispatch({type:'USE_ITEM',itemId:'medkit'});
       else break;
     }
     const result=ExitNorthBridge.dispatch({type:'CHOOSE',choiceId});if(!result.ok)throw new Error(result.error);
   },id);
   const current=await view3D(page);await page.waitForFunction(frame=>ExitNorth3D.getSnapshot().frameCount>frame,current.frameCount);rendered.add(current.sceneId);
 }
 assert.equal((await snapshot(page)).status,'escaped');assert.ok(rendered.size>=10);assert.deepEqual(errors,[]);
 await page.screenshot({path:'artifacts/screenshots/third-person-ending.png'});await context.close();
});
test('a lethal movement cost halts the character before it can advance',async()=>{
 const {context,page}=await fresh();const state=createGame(world,42);state.stats.hp=1;await loadState(context,state);await page.goto(base+'?view=3d');await page.waitForFunction(()=>window.ExitNorth3D?.getSnapshot().ready);
 const before=await view3D(page);await page.keyboard.down('w');await page.waitForFunction(()=>ExitNorthBridge.getSnapshot().status==='dead');await page.keyboard.up('w');
 assert.deepEqual((await view3D(page)).position,before.position);assert.equal(await page.locator('body').getAttribute('data-panel'),'choices');await context.close();
});
test('devices without WebGL retain a playable text mode and an explicit explanation',async()=>{
 const {context,page}=await fresh();await context.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'||type==='webgl')return null;return original.call(this,type,...args);};
 });
 await page.goto(base+'?view=3d');await page.waitForFunction(()=>document.getElementById('view-mode-button').textContent==='3D 다시 시도');
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('mode-3d')),false);await page.locator('[data-choice="coat"]').click();assert.equal((await snapshot(page)).stats.dollars,46);await context.close();
});
