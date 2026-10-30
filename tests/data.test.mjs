import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv from 'ajv';
import {assertValidWorld} from '../src/game-engine.mjs';
import {world,playRoute} from './helpers.mjs';
const ajv=new Ajv({allErrors:true,strict:true});
const eventSchema=JSON.parse(await readFile(new URL('../schemas/events.schema.json',import.meta.url),'utf8'));
const stateSchema=JSON.parse(await readFile(new URL('../schemas/game-state.schema.json',import.meta.url),'utf8'));
test('event JSON conforms to a strict JSON Schema and every reference resolves',()=>{
 const validate=ajv.compile(eventSchema);assert.ok(validate(world),JSON.stringify(validate.errors));assert.equal(assertValidWorld(world),true);
});
test('the initial example and every state of a complete route conform to the global schema',async()=>{
 const validate=ajv.compile(stateSchema);
 const example=JSON.parse(await readFile(new URL('../data/initial-state.example.json',import.meta.url),'utf8'));
 assert.ok(validate(example),JSON.stringify(validate.errors));
 playRoute(42,state=>assert.ok(validate(state),JSON.stringify(validate.errors)));
});
test('every scene is graph-reachable and carries 3D/camera metadata',()=>{
 const reached=new Set(),queue=[world.startNode];
 while(queue.length){const id=queue.shift();if(reached.has(id))continue;reached.add(id);const node=world.nodes.find(n=>n.id===id);
 assert.ok(world.scenes[node.scene_3d].assetKey);assert.ok(node.camera_mode);
 for(const c of node.choices)for(const r of [c.outcome,c.success,c.failure].filter(Boolean))queue.push(r.target);
 }
 assert.equal(reached.size,world.nodes.length);
 assert.deepEqual(world.chapters.map(c=>c.number),[1,2,3,4,5,6]);
});
test('broken targets and unknown flag requirements are rejected before building',()=>{
 const w=structuredClone(world);w.nodes[0].choices[0].outcome.target='missing';assert.throws(()=>assertValidWorld(w),/대상/);
 w.nodes[0].choices[0].outcome.target=w.startNode;w.nodes[0].choices[0].requires.allFlags=['missing'];assert.throws(()=>assertValidWorld(w),/단서/);
});
