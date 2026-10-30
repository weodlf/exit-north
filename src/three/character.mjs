import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import characterBytes from '../../assets/civilian.glb';
let asset,pending,nativeHeight=1.93;

export function preloadCharacter(){
  if(asset)return Promise.resolve(asset);
  if(!pending)pending=new Promise((resolve,reject)=>{
    const buffer=characterBytes.buffer.slice(characterBytes.byteOffset,characterBytes.byteOffset+characterBytes.byteLength);
    new GLTFLoader().parse(buffer,'',loaded=>{
      asset=loaded;
      const bounds=new THREE.Box3().setFromObject(asset.scene);nativeHeight=bounds.max.y-bounds.min.y;
      resolve(asset);
    },error=>{pending=undefined;reject(error);});
  });
  return pending;
}

/** Original Blender-authored, skinned mesh; body joints blend continuously. */
export function createCharacter({jacket,pants,backpack,skin,height=1.9}={}) {
  if(!asset)throw new Error('캐릭터 모델을 먼저 불러와야 합니다.');
  const root=new THREE.Group(),rig=new THREE.Group(),model=cloneSkeleton(asset.scene);
  root.add(rig);rig.add(model);model.scale.setScalar(height/nativeHeight);
  const colors={CoatFabric:jacket,TrouserFabric:pants,CanvasBackpack:backpack,Skin:skin};
  model.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;
    const material=object.material.clone();
    if(colors[material.name])material.color.set(colors[material.name]);
    object.material=material;
  });
  const mixer=new THREE.AnimationMixer(model);
  const actions=Object.fromEntries(asset.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
  let current='Idle';actions.Idle?.play();
  function animate(dt,speed,mode='walk'){
    const next=speed>.05?(mode==='run'?'Run':mode==='sneak'?'Sneak':'Walk'):'Idle';
    if(next!==current){
      const old=actions[current],action=actions[next];
      if(action){action.reset().setEffectiveWeight(1).play();old?.crossFadeTo(action,.18,false);current=next;}
    }
    const action=actions[current];
    if(action)action.timeScale=current==='Idle'?1:THREE.MathUtils.clamp(speed/(current==='Run'?4.7:current==='Sneak'?1.15:2.3),.5,1.45);
    mixer.update(dt);
  }
  root.userData.character=true;root.userData.model='blender-rigged';
  return {root,rig,animate,model,mixer,getAnimation:()=>current};
}
export const characterAssetInfo=()=>({model:'blender-rigged',ready:Boolean(asset),animations:asset?.animations.map(clip=>clip.name)||[],nativeHeight});
