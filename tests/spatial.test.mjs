import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv from 'ajv';
import {canOccupy,slideMove,movementVector,angleLerp} from '../src/spatial.mjs';
import {createGame,travel,validateState,createGameStore} from '../src/game-engine.mjs';
import {world} from './helpers.mjs';
const bounds={minX:-5,maxX:5,minZ:-5,maxZ:5},obstacles=[{minX:1,maxX:2,minZ:-2,maxZ:2}];
test('movement is normalized so diagonals do not increase speed',()=>{
 const v=movementVector(1,1,0);assert.ok(Math.abs(Math.hypot(v.x,v.z)-1)<1e-10);
 assert.deepEqual(movementVector(0,1,0),{x:0,z:-1});
 const turn=movementVector(0,1,Math.PI/2);assert.ok(Math.abs(turn.x+1)<1e-10);
});
test('character radius respects collision rectangles and world bounds',()=>{
 assert.equal(canOccupy(.8,0,obstacles,bounds),false);assert.equal(canOccupy(0,0,obstacles,bounds),true);assert.equal(canOccupy(4.9,0,[],bounds),false);
});
test('a blocked diagonal slides along a wall and cannot advance through it',()=>{
 const next=slideMove({x:.6,z:0},.2,-.2,obstacles,bounds);
 assert.equal(next.x,.6);assert.equal(next.z,-.2);
});
test('angle interpolation takes the short path across the wrap boundary',()=>{
 const result=angleLerp(Math.PI-.1,-Math.PI+.1,.5);assert.ok(Math.abs(result-Math.PI)<1e-10);
});
test('every movement mode pays its data-driven HP and hunger cost',()=>{
 for(const mode of ['walk','run','sneak']){
 const before=createGame(world,42),after=travel(before,mode,world),cost=world.rules.movement.modes[mode].cost;
 assert.equal(after.stats.hp,92-cost.hp);assert.equal(after.stats.hunger,18+cost.hunger);assert.equal(after.turn,1);assert.equal(before.turn,0);assert.deepEqual(validateState(after,world),[]);
 }
});
test('travel crossing hunger 100 applies starvation before moving',()=>{
 const s=createGame(world);s.stats.hp=30;s.stats.hunger=99;const next=travel(s,'walk',world);
 assert.equal(next.stats.hp,24);assert.equal(next.stats.hunger,100);assert.equal(next.lastResult.starvation,5);
});
test('lethal movement is terminal and cannot be charged again',()=>{
 const s=createGame(world);s.stats.hp=1;const next=travel(s,'walk',world);assert.equal(next.status,'dead');assert.throws(()=>travel(next,'walk',world));
});
test('unknown movement modes cannot mutate the store',()=>{
 const store=createGameStore(world,createGame(world));assert.throws(()=>store.dispatch({type:'TRAVEL',mode:'teleport'}));assert.equal(store.getSnapshot().turn,0);
});
test('3D spaces conform to a strict schema with all event/hotspot references intact',async()=>{
 const spaces=JSON.parse(await readFile(new URL('../data/spaces.json',import.meta.url),'utf8'));
 const schema=JSON.parse(await readFile(new URL('../schemas/spaces.schema.json',import.meta.url),'utf8'));
 const validate=new Ajv({strict:true,allErrors:true}).compile(schema);assert.ok(validate(spaces),JSON.stringify(validate.errors));
 for(const node of world.nodes){
   const space=spaces.scenes[node.scene_3d];assert.ok(space);assert.equal(node.camera_mode,'third_person_follow');
   assert.ok(space.bounds.minX<space.bounds.maxX);assert.ok(space.bounds.minZ<space.bounds.maxZ);assert.ok(space.fogNear<space.fogFar);
   for(const c of node.choices)assert.ok(space.hotspots.some(h=>h.bindings[node.id]?.includes(c.id)),`${node.id}/${c.id} has no physical hotspot`);
 }
 for(const space of Object.values(spaces.scenes))for(const hotspot of space.hotspots)for(const [id,choices] of Object.entries(hotspot.bindings)){
   const node=world.nodes.find(n=>n.id===id);assert.ok(node);for(const id of choices)assert.ok(node.choices.some(c=>c.id===id));
 }
});

test('the authored GLB contains a real skeleton, four clips and normalized skin weights',async()=>{
 const buffer=await readFile(new URL('../assets/civilian.glb',import.meta.url));assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(4),2);
 const jsonSize=buffer.readUInt32LE(12),gltf=JSON.parse(buffer.subarray(20,20+jsonSize).toString());
 const binaryOffset=20+jsonSize+8;
 assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,17);
 assert.deepEqual(gltf.animations.map(a=>a.name).sort(),['Idle','Run','Sneak','Walk']);
 assert.ok(gltf.materials.some(m=>m.name==='CanvasBackpack'));assert.ok(gltf.materials.some(m=>m.name==='Skin'));
 assert.equal(gltf.images,undefined); // No external textures or remote model requests.
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
   assert.ok('JOINTS_0' in primitive.attributes);const accessor=gltf.accessors[primitive.attributes.WEIGHTS_0],view=gltf.bufferViews[accessor.bufferView];
   assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC4');
   for(let i=0;i<accessor.count;i++){
     let sum=0;const offset=binaryOffset+(view.byteOffset||0)+(accessor.byteOffset||0)+i*(view.byteStride||16);
     for(let j=0;j<4;j++)sum+=buffer.readFloatLE(offset+j*4);
     assert.ok(Math.abs(sum-1)<.001,`unnormalized weights at ${i}`);
   }
 }
});
