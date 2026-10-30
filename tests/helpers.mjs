import { readFile } from 'node:fs/promises';
import { createGame,resolveChoice,useItem } from '../src/game-engine.mjs';
export const world = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
export const route = ['radio','coat','papers','leave','forge','supplies','depart','labor','ration','dig','crawl','observe','sneak','search','city','work','contact','verify','trusted','quiet','cache','river','slow','careful'];
export function atNode(id,seed=42) {
  const state=createGame(world,seed), node=world.nodes.find(n=>n.id===id);
  state.nodeId=id; state.chapterId=node.chapterId; state.visited=[...new Set([world.startNode,id])];
  if(node.type==='ending')state.status='escaped';
  return state;
}
export function playRoute(seed=42,onStep=()=>{}) {
  let state=createGame(world,seed);
  for(const choiceId of route){
    if(state.status!=='playing')break;
    for(let j=0;j<4;j++){
      if(state.stats.hunger>=50 && (state.inventory.canned_food||state.inventory.bread))state=useItem(state,state.inventory.canned_food?'canned_food':'bread',world);
      else if(state.stats.hp<=58 && state.inventory.medkit)state=useItem(state,'medkit',world);
      else break;
      onStep(state);
    }
    state=resolveChoice(state,choiceId,world); onStep(state);
  }
  return state;
}
