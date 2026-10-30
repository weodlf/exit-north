import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,resolveChoice,useItem,successChance,previewCost,serializeGame,deserializeGame,validateState,createGameStore,availability} from '../src/game-engine.mjs';
import {world,atNode,playRoute} from './helpers.mjs';
const choice=(node,id)=>world.nodes.find(n=>n.id===node).choices.find(c=>c.id===id);
test('initial state contains six resources and no action-points budget',()=>{
 const s=createGame(world,42); assert.deepEqual(validateState(s,world),[]);
 assert.equal(s.stats.hp,92); assert.equal(s.stats.hunger,18); assert.equal(s.turn,0);
 assert.equal(Object.hasOwn(s,'ap'),false); assert.equal(Object.hasOwn(s.stats,'actionPoints'),false);
});
test('action costs, clue rewards, immutable previous state',()=>{
 const s=createGame(world,42), before=structuredClone(s), next=resolveChoice(s,'radio',world);
 assert.deepEqual(s,before); assert.equal(next.stats.hp,88);assert.equal(next.stats.hunger,27);
 assert.equal(next.inventory.radio,1); assert.ok(next.flags.includes('radio_found'));assert.equal(next.turn,1);
 assert.equal(next.journal.length,1);assert.equal(next.journal[0].delta.hp,-4);
});
test('repeated one-time searches are rejected without mutating state',()=>{
 const s=resolveChoice(createGame(world),'radio',world), before=serializeGame(s,world);
 assert.throws(()=>resolveChoice(s,'radio',world),/이미/);assert.equal(serializeGame(s,world),before);
});
test('money requirements and purchase costs are enforced transactionally',()=>{
 const s=atNode('ch4.market');s.stats.dollars=11;
 assert.equal(availability(s,choice('ch4.market','buy'),world).allowed,false);
 assert.throws(()=>resolveChoice(s,'buy',world),/필요/);assert.equal(s.stats.dollars,11);
 s.stats.dollars=12;const next=resolveChoice(s,'buy',world);
 assert.equal(next.stats.dollars,0);assert.equal(next.inventory.bread,2);
});
test('starvation starts on the action that reaches 100, and repeats each action',()=>{
 const s=createGame(world);s.stats.hp=50;s.stats.hunger=91;
 const next=resolveChoice(s,'radio',world);assert.equal(next.stats.hunger,100);assert.equal(next.stats.hp,41);assert.equal(next.lastResult.starvation,5);
 const again=resolveChoice(next,'coat',world);assert.equal(again.stats.hp,33);assert.equal(again.lastResult.starvation,5);
});
test('HP zero from a cost interrupts immediately, before medicine or starvation',()=>{
 const s=createGame(world);s.stats.hp=1;s.stats.hunger=100;
 const next=useItem(s,'medkit',world);
 assert.equal(next.stats.hp,0);assert.equal(next.status,'dead');assert.equal(next.inventory.medkit,0);assert.equal(next.lastResult.starvation,0);
});
test('food cannot rescue a player who dies from the preceding starvation tick',()=>{
 const s=createGame(world);s.stats.hp=6;s.stats.hunger=100;
 const next=useItem(s,'bread',world);assert.equal(next.status,'dead');assert.equal(next.stats.hunger,100);assert.equal(next.stats.hp,0);
});
test('surviving a starvation tick allows nutrition to clear starvation next action',()=>{
 const s=createGame(world);s.stats.hp=7;s.stats.hunger=100;
 const next=useItem(s,'bread',world);assert.equal(next.stats.hp,5);assert.equal(next.stats.hunger,76);assert.equal(next.lastResult.starvation,5);
 const again=resolveChoice(next,'papers',world);assert.equal(again.stats.hp,3);assert.equal(again.lastResult.starvation,0);
});
test('item healing and hunger clamp to their bounds; clues cannot be consumed',()=>{
 const s=createGame(world);s.stats.hp=99;s.stats.hunger=0;
 const next=useItem(s,'canned_food',world);assert.equal(next.stats.hp,100);assert.equal(next.stats.hunger,0);
 assert.throws(()=>useItem(s,'radio',world),/아이템/);s.inventory.bread=0;assert.throws(()=>useItem(s,'bread',world),/아이템/);
});
test('a lethal random result cannot grant an ending or its rewards',()=>{
 const custom=structuredClone(world), sprint=custom.nodes.find(n=>n.id==='ch3.bank').choices.find(c=>c.id==='sprint');
 sprint.chance={base:0,min:0,max:0,modifiers:[]};
 const s=atNode('ch3.bank');s.stats.hp=20;
 const next=resolveChoice(s,'sprint',custom);
 assert.equal(next.status,'dead');assert.equal(next.nodeId,'ch3.bank');assert.equal(next.stats.hp,0);assert.equal(next.flags.includes('river_crossed'),false);
});
test('stealth and flags modify displayed probability with min/max caps',()=>{
 const s=atNode('ch3.bank'), c=choice('ch3.bank','sprint');
 assert.equal(successChance(s,c),.652);s.flags=['radio_found','light_observed'];assert.equal(successChance(s,c),.892);
 s.stats.stealth=100;assert.equal(successChance(s,c),.94);
 const custom={chance:{base:2,min:.1,max:.96,modifiers:[]}};assert.equal(successChance(s,custom),.96);
});
test('save/reload preserves the next random result',()=>{
 const s=atNode('ch3.bank',2026), reload=deserializeGame(serializeGame(s,world),world);
 assert.deepEqual(resolveChoice(s,'sneak',world),resolveChoice(reload,'sneak',world));
 assert.notEqual(resolveChoice(s,'sneak',world).rngState,s.rngState);
});
test('invalid saves, unknown references and revision mismatches are rejected',()=>{
 const s=createGame(world);s.stats.hp=-1;assert.ok(validateState(s,world).length);assert.throws(()=>serializeGame(s,world));
 const raw=JSON.parse(serializeGame(createGame(world),world));raw.dataRevision='old';assert.throws(()=>deserializeGame(JSON.stringify(raw),world),/버전/);
 raw.dataRevision=world.revision;raw.state.inventory.not_an_item=99;assert.throws(()=>deserializeGame(JSON.stringify(raw),world));
 assert.throws(()=>deserializeGame('not json',world));assert.throws(()=>deserializeGame('x'.repeat(500001),world));
});
test('terminal states reject actions and items',()=>{
 const s=createGame(world);s.stats.hp=1;const dead=resolveChoice(s,'radio',world);
 assert.throws(()=>resolveChoice(dead,'coat',world));assert.throws(()=>useItem(dead,'bread',world));
 const end=atNode('ch6.memory');assert.throws(()=>useItem(end,'medkit',world));
});
test('cost preview exposes starvation and lethal actions',()=>{
 const s=createGame(world);s.stats.hp=9;s.stats.hunger=99;
 assert.deepEqual(previewCost(s,{hp:4,hunger:5},world),{hp:4,hunger:5,starvation:5,lethal:true});
});
test('bounded journals retain 60 most recent actions with increasing turn numbers',()=>{
 const w=structuredClone(world), c=w.nodes[0].choices[0];delete c.requires;c.outcome.addFlags=[];c.outcome.addItems={};c.cost={hp:1,hunger:1};c.outcome.effects={hp:1,hunger:-1};
 let s=createGame(w);for(let i=0;i<75;i++)s=resolveChoice(s,'radio',w);
 assert.equal(s.journal.length,60);assert.equal(s.journal[0].turn,16);assert.equal(s.journal.at(-1).turn,75);assert.deepEqual(validateState(s,w),[]);
});
test('all six chapters can be completed through actual rules across 50 seeds',()=>{
 let wins=0;
 for(let seed=1;seed<=50;seed++){
   const s=playRoute(seed,step=>assert.deepEqual(validateState(step,world),[]));
   if(s.status==='escaped'){wins++;assert.equal(new Set(s.visited.map(id=>world.nodes.find(n=>n.id===id).chapterId)).size,6);}
 }
 assert.ok(wins>=40,`only ${wins}/50 completed the preparation route`);
});
test('store isolates snapshots and rejects unknown commands',()=>{
 const store=createGameStore(world,createGame(world,2));const snap=store.getSnapshot();snap.stats.hp=1;
 assert.equal(store.getSnapshot().stats.hp,92);
 let count=0;const unsub=store.subscribe(next=>{count++;next.stats.hp=0;});
 store.dispatch({type:'CHOOSE',choiceId:'radio'});assert.equal(count,1);assert.equal(store.getSnapshot().stats.hp,88);unsub();
 assert.throws(()=>store.dispatch({type:'TELEPORT',nodeId:'ch6.memory'}));assert.equal(count,1);
});

test('rest is one-time so capped hunger cannot be exploited for infinite HP',()=>{
 const s=atNode('ch2.yard');s.stats.hp=30;s.stats.hunger=100;
 const next=resolveChoice(s,'rest',world);
 assert.equal(next.stats.hp,32);assert.ok(next.flags.includes('prison_rested'));
 assert.throws(()=>resolveChoice(next,'rest',world),/이미/);
});
