import * as THREE from 'three';
import {createCharacter,characterAssetInfo} from './character.mjs';
import {createEnvironment} from './environment.mjs';
import {slideMove,movementVector,angleLerp} from '../spatial.mjs';
import {availability,getNode} from '../game-engine.mjs';

export function createThirdPersonRenderer({container,world,spaces,bridge,onInteract,onProximity,onFallback,isPaused}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.className='game-canvas';renderer.domElement.setAttribute('aria-label','캐릭터 뒤를 따라가는 3인칭 3D 장면');
  container.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(54,1,.12,180);
  const ambient=new THREE.HemisphereLight('#dbe6e3','#565b42',2);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#ffe1ae',2.6);sun.position.set(-14,25,-17);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-18;sun.shadow.camera.far=90;sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;scene.add(sun);
  const fill=new THREE.DirectionalLight('#d1dde0',.45);fill.position.set(10,8,12);scene.add(fill);
  const character=createCharacter(spaces.character);scene.add(character.root);
  const labelLayer=document.createElement('div');labelLayer.className='world-labels';container.parentElement.appendChild(labelLayer);
  const labels=new Map(),keys=new Set(),subscriptions=[];
  let state=bridge.getSnapshot(),config,environment,sceneId='',runId='',activeNode='',enabled=true,disposed=false,contextLost=false;
  let yaw=.08,pitch=0,crouching=false,mobileRunning=false,paidDistance=0,paidMode='',mode='walk',velocity=0;
  let frameCount=0,lastTime=0,elapsed=0,raf,nearby=null,lastNearby='',lastMovementFailure='',drag=null;
  const raycaster=new THREE.Raycaster(),lookTarget=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),projected=new THREE.Vector3();
  const map=document.getElementById('minimap-canvas'),mapContext=map.getContext('2d');
  const dpr=Math.min(devicePixelRatio,2);map.width=180*dpr;map.height=180*dpr;
  const control=document.getElementById('movement-status');
  function bind(target,name,handler,options){target.addEventListener(name,handler,options);subscriptions.push(()=>target.removeEventListener(name,handler,options));}
  function resetInput(){keys.clear();drag=null;mobileRunning=false;}
  function updateState(next){
    const restarted=next.turn===0 && state.turn>0;
    state=next;const metadata=bridge.getScene();
    if(metadata.camera_mode!=='third_person_follow')throw new Error('지원하지 않는 3D 카메라 리그입니다.');
    const changed=metadata.scene_3d!==sceneId || next.runId!==runId || restarted;
    if(changed){
      const nextConfig=spaces.scenes[metadata.scene_3d];
      if(!nextConfig)throw new Error(`3D 공간 정의가 없습니다: ${metadata.scene_3d}`);
      if(environment){scene.remove(environment.group);environment.dispose();}
      config=nextConfig;sceneId=metadata.scene_3d;runId=next.runId;
      environment=createEnvironment(config,sceneId);scene.add(environment.group);
      character.root.position.fromArray(config.spawn);character.root.rotation.y=0;
      paidDistance=0;paidMode='';yaw=.08;pitch=0;crouching=false;resetInput();
      scene.background=new THREE.Color(config.sky);scene.fog=new THREE.Fog(config.fog,config.fogNear,config.fogFar);
      sun.color.set(config.sunColor);sun.intensity=config.sunIntensity;renderer.toneMappingExposure=config.exposure;
      camera.fov=config.camera.fov;camera.updateProjectionMatrix();
      lookTarget.copy(character.root.position).add(new THREE.Vector3(0,1.25,0));
      camera.position.copy(lookTarget).add(new THREE.Vector3(.6,config.camera.height-1.25,config.camera.distance));camera.lookAt(lookTarget);
      document.getElementById('world-time').textContent=config.time;
    }
    if(changed || next.nodeId!==activeNode){
      activeNode=next.nodeId;lastNearby='';labelLayer.replaceChildren();labels.clear();
      for(const marker of environment.markers){
        const ids=marker.hotspot.bindings[activeNode] || [];
        const visible=ids.length>0 || next.status==='escaped';
        marker.ring.visible=marker.diamond.visible=visible;
        if(!visible)continue;
        const label=document.createElement('div');label.className='world-label';
        const diamond=document.createElement('span');diamond.className='label-diamond';
        const text=document.createElement('span');text.textContent=marker.hotspot.label;
        label.append(diamond,text);labelLayer.appendChild(label);labels.set(marker.hotspot.id,label);
      }
    }
    if(next.status!=='playing')resetInput();
    for(const marker of environment.markers){
      const visible=isMarkerActive(marker);
      marker.ring.visible=marker.diamond.visible=visible;
      if(!visible && labels.has(marker.hotspot.id))labels.get(marker.hotspot.id).hidden=true;
    }
  }
  function resize(){const w=Math.max(container.clientWidth,1),h=Math.max(container.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  updateState(state);resize();const unsubscribe=bridge.subscribe(updateState);

  const movementKey=(event)=>['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code);
  bind(window,'keydown',event=>{
    if(!enabled || event.ctrlKey || event.altKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || document.querySelector('dialog[open]'))return;
    if(movementKey(event)){event.preventDefault();keys.add(event.code);}
    if(event.repeat)return;
    if(event.code==='KeyC' && !isPaused()){crouching=!crouching;mobileRunning=false;}
    if(event.code==='KeyE' && !isPaused() && nearby){event.preventDefault();resetInput();onInteract(nearby);}
  });
  bind(window,'keyup',event=>keys.delete(event.code));
  bind(window,'blur',resetInput);bind(document,'visibilitychange',()=>{resetInput();lastTime=0;});
  bind(renderer.domElement,'pointerdown',event=>{
    if(!enabled || isPaused())return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};renderer.domElement.setPointerCapture(event.pointerId);
  });
  bind(renderer.domElement,'pointermove',event=>{
    if(!drag || drag.id!==event.pointerId)return;
    yaw-=(event.clientX-drag.x)*.006;
    pitch=THREE.MathUtils.clamp(pitch+(event.clientY-drag.y)*.005,-.5,.65);
    drag.x=event.clientX;drag.y=event.clientY;
  });
  bind(renderer.domElement,'pointerup',()=>{drag=null;});bind(renderer.domElement,'pointercancel',()=>{drag=null;});
  bind(renderer.domElement,'contextmenu',event=>event.preventDefault());
  bind(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();contextLost=true;resetInput();onFallback('3D 화면 연결이 끊겨 텍스트 모드로 전환했습니다. 진행은 보존됩니다.');});
  bind(renderer.domElement,'webglcontextrestored',()=>{contextLost=false;resize();});
  const directions={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD'};
  for(const button of document.querySelectorAll('[data-move]')){
    const key=directions[button.dataset.move];
    bind(button,'pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(key);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])bind(button,name,()=>keys.delete(key));
  }
  bind(document.getElementById('mobile-run'),'click',()=>{mobileRunning=!mobileRunning;crouching=false;});
  bind(document.getElementById('mobile-sneak'),'click',()=>{crouching=!crouching;mobileRunning=false;});
  bind(document.getElementById('interaction-prompt'),'click',()=>{if(nearby && !isPaused()){resetInput();onInteract(nearby);}});

  function isMarkerActive(marker){
    if(state.status==='escaped')return true;
    const ids=marker.hotspot.bindings[state.nodeId] || [];
    const choices=getNode(world,state.nodeId).choices.filter(choice=>ids.includes(choice.id));
    return choices.length>0 && !choices.every(choice=>availability(state,choice,world).code==='completed');
  }
  function activeMarkers(){
    return environment.markers.filter(isMarkerActive);
  }
  function updateProximity(time){
    const position=character.root.position;
    let closest=null,closestDistance=Infinity;
    for(const marker of activeMarkers()){
      const distance=Math.hypot(position.x-marker.anchor.x,position.z-marker.anchor.z);
      if(distance<closestDistance){closest=marker.hotspot;closestDistance=distance;}
      marker.diamond.rotation.y=time*.6;marker.diamond.position.y=2.35+Math.sin(time*1.8)*.055;
      const label=labels.get(marker.hotspot.id);
      if(label){
        projected.copy(marker.anchor).project(camera);
        const behind=projected.z>1 || projected.z< -1 || distance>23;
        label.hidden=behind;
        if(!behind){label.style.transform=`translate(${(projected.x*.5+.5)*container.clientWidth}px,${(-projected.y*.5+.5)*container.clientHeight}px) translate(-50%,-100%)`;label.style.opacity=distance<spaces.controls.interactionRadius?'1':'.58';}
      }
    }
    nearby=closestDistance<=spaces.controls.interactionRadius?closest:null;
    const id=nearby?.id || '';
    if(id!==lastNearby){lastNearby=id;onProximity(nearby);}
  }
  function drawMap(){
    const ctx=mapContext,w=180,h=180,p=character.root.position,scale=4.1;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#182522';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(90,98);ctx.rotate(yaw);
    const point=(x,z)=>({x:(x-p.x)*scale,y:(z-p.z)*scale});
    ctx.fillStyle='#65766a';const road=point(-4.8,-80);ctx.fillRect(road.x,road.y,9.6*scale,180*scale);
    ctx.fillStyle='#354a3f';ctx.strokeStyle='#829181';ctx.lineWidth=.6;
    for(const rect of environment.obstacles){const a=point(rect.minX,rect.minZ);ctx.fillRect(a.x,a.y,(rect.maxX-rect.minX)*scale,(rect.maxZ-rect.minZ)*scale);ctx.strokeRect(a.x,a.y,(rect.maxX-rect.minX)*scale,(rect.maxZ-rect.minZ)*scale);}
    for(const marker of activeMarkers()){
      const q=point(marker.hotspot.position[0],marker.hotspot.position[2]);ctx.fillStyle='#e9c87c';ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.PI/4);ctx.fillRect(-2.4,-2.4,4.8,4.8);ctx.restore();
    }
    ctx.fillStyle='#a7c7bf';for(const npc of environment.npcs){const q=point(npc.character.root.position.x,npc.character.root.position.z);ctx.beginPath();ctx.arc(q.x,q.y,1.5,0,Math.PI*2);ctx.fill();}
    ctx.restore();ctx.save();ctx.translate(90,98);ctx.rotate(-character.root.rotation.y+yaw);
    ctx.fillStyle='#f0e8d0';ctx.strokeStyle='#25382d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
    ctx.fillStyle='#e6dfcc';ctx.font='10px sans-serif';ctx.fillText('N',86+Math.sin(yaw)*66,92-Math.cos(yaw)*66);ctx.fillStyle='#0d1919a8';ctx.fillRect(0,157,180,23);ctx.fillStyle='#c1cbbb';ctx.font='8px sans-serif';ctx.fillText('주변 지도',10,172);ctx.fillStyle='#c4b078';ctx.fillRect(133,169,30,1);ctx.fillText('10m',137,165);
  }
  function animateNPCs(dt,time){
    for(const npc of environment.npcs){
      if(!npc.fixed && npc.data.path){
        const [a,b]=npc.data.path,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        npc.progress=(npc.progress+dt*npc.data.speed/length)%2;
        const progress=npc.progress<=1?npc.progress:2-npc.progress;
        npc.character.root.position.x=a[0]+dx*progress;npc.character.root.position.z=a[1]+dz*progress;
        npc.character.root.rotation.y=Math.atan2(-dx,-dz)+(npc.progress>1?Math.PI:0);
        npc.character.animate(dt,npc.data.speed,'walk',time);
      }else npc.character.animate(dt,0,'walk',time);
    }
    for(const entry of environment.animated){if(entry.type==='searchlight')entry.object.target.position.x=Math.sin(time*.23)*5;}
  }
  function step(dt,time){
    const paused=isPaused() || state.status!=='playing';
    mode=crouching?'sneak':keys.has('ShiftLeft') || keys.has('ShiftRight') || mobileRunning?'run':'walk';
    let horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
    let vertical=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
    velocity=0;
    if(!paused && (horizontal||vertical)){
      const direction=movementVector(horizontal,vertical,yaw);
      const speed=spaces.controls[mode==='run'?'runSpeed':mode==='sneak'?'sneakSpeed':'walkSpeed'];
      const position=character.root.position;
      let distance=speed*dt;
      // Test collision before purchasing a segment: pushing a wall never costs HP.
      const proposed=slideMove(position,direction.x*distance,direction.z*distance,environment.obstacles,config.bounds,spaces.controls.playerRadius);
      const actualDistance=Math.hypot(proposed.x-position.x,proposed.z-position.z);
      if(actualDistance>.0001){
        if(paidDistance<=.0001 || paidMode!==mode){
          const result=bridge.dispatch({type:'TRAVEL',mode});
          if(result.ok && result.state.status==='playing'){paidDistance=world.rules.movement.segmentDistance;paidMode=mode;lastMovementFailure='';}
          else {lastMovementFailure=result.error || '체력이 다했습니다.';resetInput();return;}
        }
        distance=Math.min(actualDistance,paidDistance);
        const fraction=distance/actualDistance;
        const dx=(proposed.x-position.x)*fraction,dz=(proposed.z-position.z)*fraction;
        position.x+=dx;position.z+=dz;paidDistance=Math.max(0,paidDistance-distance);
        character.root.rotation.y=angleLerp(character.root.rotation.y,Math.atan2(-dx,-dz),1-Math.exp(-dt*11));
        velocity=distance/Math.max(dt,.001);
      }
    }
    character.animate(dt,velocity,mode,time);
    if(state.status==='dead')character.rig.rotation.z=THREE.MathUtils.lerp(character.rig.rotation.z,-1.2,1-Math.exp(-dt*3));
    else character.rig.rotation.z=0;
    lookTarget.copy(character.root.position);lookTarget.y+=crouching?1.04:1.3;
    const dist=config.camera.distance,side=.56;
    desiredCamera.set(character.root.position.x+Math.sin(yaw)*dist+Math.cos(yaw)*side,config.camera.height+pitch*2,character.root.position.z+Math.cos(yaw)*dist-Math.sin(yaw)*side);
    const direction=desiredCamera.clone().sub(lookTarget),length=direction.length();raycaster.set(lookTarget,direction.normalize());raycaster.far=length;
    const hits=raycaster.intersectObjects(environment.cameraObjects,false);
    if(hits.length && hits[0].distance<length)desiredCamera.copy(lookTarget).addScaledVector(direction,Math.max(.8,hits[0].distance-.2));
    camera.position.lerp(desiredCamera,1-Math.exp(-dt*9));camera.lookAt(lookTarget);
    animateNPCs(dt,time);updateProximity(time);drawMap();
    const rule=world.rules.movement.modes[mode];
    const text=`${rule.label} · ${world.rules.movement.segmentDistance}m마다 HP −${rule.cost.hp} / 허기 +${rule.cost.hunger}`;
    if(control.textContent!==text)control.textContent=text;
    document.getElementById('compass-heading').textContent=`${['N','NE','E','SE','S','SW','W','NW'][((Math.round(-yaw/(Math.PI/4))%8)+8)%8]}  ·  ${Math.round(((-yaw*180/Math.PI)%360+360)%360)}°`;
    document.body.dataset.movement=mode;
  }
  function frame(time){
    if(disposed)return;
    raf=requestAnimationFrame(frame);
    if(!enabled || contextLost || document.hidden){lastTime=time;return;}
    const dt=lastTime?Math.min((time-lastTime)/1000,.25):1/60;lastTime=time;
    // Substeps keep movement responsive at low FPS without tunnelling through thin walls.
    const count=Math.max(1,Math.ceil(dt/.05)),slice=dt/count;
    try{for(let i=0;i<count;i++){elapsed+=slice;step(slice,elapsed);}renderer.render(scene,camera);frameCount++;if(frameCount===1)document.body.dataset.engine='ready';}
    catch(error){enabled=false;resetInput();onFallback(`3D 화면을 불러오지 못해 텍스트 모드로 전환했습니다. ${error.message}`);}
  }
  raf=requestAnimationFrame(frame);
  return {
    setEnabled(value){enabled=value;resetInput();lastTime=0;if(value)resize();labelLayer.hidden=!value;},
    getSnapshot:()=>({backend:'webgl',character:characterAssetInfo(),animation:character.getAnimation(),ready:frameCount>0,enabled,contextLost,sceneId,nodeId:state.nodeId,position:{x:character.root.position.x,y:character.root.position.y,z:character.root.position.z},yaw,mode,moving:velocity>0,nearbyHotspot:nearby?.id || null,frameCount,drawCalls:renderer.info.render.calls,paidDistance,lastMovementFailure}),
    dispose(){disposed=true;cancelAnimationFrame(raf);resetInput();observer.disconnect();unsubscribe();subscriptions.forEach(fn=>fn());environment?.dispose();scene.traverse(o=>{if(o.userData.character)o.traverse(c=>{c.geometry?.dispose();if(c.material)c.material.dispose();});});renderer.dispose();renderer.domElement.remove();labelLayer.remove();},
  };
}
