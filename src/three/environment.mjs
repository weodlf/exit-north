import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCharacter} from './character.mjs';

export function createEnvironment(config,sceneKey) {
  const group=new THREE.Group(),obstacles=[],cameraObjects=[],markers=[],npcs=[],animated=[];
  const materials=new Map(),geometries=[];
  let seed=Array.from(sceneKey).reduce((a,c)=>a+c.charCodeAt(0),13);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const material=(color,extra={})=>{
    const key=color+JSON.stringify(extra);
    if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.93,...extra}));
    return materials.get(key);
  };
  function box(w,h,d,x,y,z,color,solid=false,parent=group){
    const geometry=new THREE.BoxGeometry(w,h,d);geometries.push(geometry);
    const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);
    if(solid){obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});cameraObjects.push(m);}
    return m;
  }
  function cylinder(radius,height,x,y,z,color,top=radius,parent=group){
    const g=new THREE.CylinderGeometry(top,radius,height,9);geometries.push(g);const m=new THREE.Mesh(g,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function sign(text,x,y,z,color='#c8bd9e',width=2.1,rotation=0){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#293b35';ctx.fillRect(0,0,512,160);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(9,9,494,142);ctx.fillStyle=color;ctx.font='bold 57px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,82);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width*160/512),new THREE.MeshStandardMaterial({map:texture,roughness:.9,emissive:color,emissiveIntensity:config.theme==='city'?.2:.025}));m.position.set(x,y,z);m.rotation.y=rotation;group.add(m);return m;
  }
  // Continuous street surface with locally generated asphalt/concrete texture.
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');const river=config.theme==='river',jungle=config.theme==='jungle';
  ctx.fillStyle=river?'#8c9d9e':jungle?'#6d7660':'#777c74';ctx.fillRect(0,0,512,512);
  for(let i=0;i<5000;i++){const shade=Math.floor(65+random()*95);ctx.fillStyle=`rgba(${shade},${shade},${shade},${.07+random()*.15})`;const s=1+random()*6;ctx.fillRect(random()*512,random()*512,s,s);}
  ctx.strokeStyle=river?'#b6c8c7':jungle?'#777d66':'#5a625c';ctx.lineWidth=1;
  for(let i=0;i<14;i++){const x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*70,y+random()*120);ctx.lineTo(x-30+random()*50,y+160);ctx.stroke();}
  const groundTexture=new THREE.CanvasTexture(canvas);groundTexture.colorSpace=THREE.SRGBColorSpace;groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(15,22);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(130,180),new THREE.MeshStandardMaterial({map:groundTexture,roughness:river?.45:.97,color:river?'#c1d4d5':'#c1c1ae'}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;group.add(ground);
  function building(x,z,w,h,d,index){
    const colors=config.theme==='city'?['#6b7977','#777a6b','#697270','#797b6d']:['#939786','#a5a28c','#8a9286','#a4a38e'];
    box(w,h,d,x,h/2,z,colors[index%colors.length],true);
    box(w+.26,.16,d+.26,x,h+.08,z,'#656e62');
    box(w+.035,.45,d+.035,x,.225,z,'#697063');
    // Facades face into the alley, with window grids and weathered shutters.
    const side=x<0?1:-1,front=x+side*(w/2+.018);
    for(let floor=0;floor<Math.max(1,Math.floor(h/2.65));floor++)for(let k=-1;k<=1;k++){
      const wz=z+k*d/3.5,wy=1.45+floor*2.5;
      box(.065,1.12,.87,front,wy,wz,'#43564f');
      box(.095,1.26,.07,front+side*.015,wy,wz-.47,'#c0bba0');box(.095,1.26,.07,front+side*.015,wy,wz+.47,'#c0bba0');
      box(.11,.065,1,front+side*.015,wy+.61,wz,'#b1ad94');box(.15,.11,1.08,front+side*.04,wy-.61,wz,'#bbb89e');
      box(.095,1.1,.025,front+side*.03,wy,wz,'#929a85');
      if(random()>.65)box(.1,.6,.75,front+side*.035,wy+.1,wz,'#777e6c');
    }
    if(index%2===0){
      const pipe=cylinder(.043,h,front+side*.2,h/2,z+d*.42,'#747b6b');
      box(.5,.6,.8,front+side*.2,2.5,z-d*.3,'#afb09c');
      for(let i=0;i<5;i++)box(.015,.025,.58,front+side*.46,2.35+i*.065,z-d*.3,'#7e8778');
    }
    box(.08,1.9,.9,front+side*.03,.96,z,'#424e40');
    if(config.theme==='city' &&index%2===0){
      // Emissive signs remain readable without a separate dynamic light per facade.
      const board=sign(['식료품','수리점','찻집','여관'][index%4],front+side*.08,3,z,'#cfbd91',2.2,side*Math.PI/2);
    }
    if(index%3===0) {
      const board=sign('오래된 골목',front+side*.07,3.3,z,'#b1ae93',1.9,side*Math.PI/2);
      box(.6,.08,2.2,front+side*.27,2.3,z,'#677e69');
    }
  }
  function wire(points){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const geometry=new THREE.TubeGeometry(curve,18,.018,4,false);group.add(new THREE.Mesh(geometry,material('#323f37')));}
  function tree(x,z,scale=1){
    const trunk=cylinder(.16*scale,3.4*scale,x,1.7*scale,z,'#6b6751',.09*scale);
    for(let i=0;i<3;i++){
      const geo=new THREE.IcosahedronGeometry((1.1-i*.15)*scale,1);const m=new THREE.Mesh(geo,material(['#53664a','#697957','#4c6348'][i]));m.position.set(x+(i-1)*.38*scale,(3+i*.4)*scale,z+(i%2)*.2);m.castShadow=true;group.add(m);
    }
    obstacles.push({minX:x-.2,maxX:x+.2,minZ:z-.2,maxZ:z+.2});
  }
  function car(x,z){
    const g=new THREE.Group();g.position.set(x,0,z);group.add(g);
    box(1.6,.48,3.35,0,.55,0,'#454f50',false,g);box(1.46,.56,1.95,0,1.02,.07,'#4b5857',false,g);
    box(1.31,.43,1.75,0,1.08,.05,'#314746',false,g);box(1.48,.07,1.91,0,1.35,.07,'#485656',false,g);
    box(1.65,.12,3.4,0,.4,0,'#343d39',false,g);box(1.15,.2,.028,0,.65,-1.69,'#9ba59a',false,g);
    for(const side of [-1,1]){
      for(const f of [-1,1]){const tire=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.2,12),material('#242d29'));tire.rotation.z=Math.PI/2;tire.position.set(side*.82,.31,f*1.08);g.add(tire);const hub=tire.clone();hub.geometry=new THREE.CylinderGeometry(.17,.17,.215,10);hub.material=material('#70766c');g.add(hub);}
      box(.3,.12,.035,side*.55,.72,-1.7,'#d7c9a3',false,g);box(.32,.12,.035,side*.55,.72,1.7,'#a15a4e',false,g);
    }
    obstacles.push({minX:x-.9,maxX:x+.9,minZ:z-1.8,maxZ:z+1.8});
  }
  const urban=['village','city','gate','morning'].includes(config.theme);
  if(urban){
    for(let i=0;i<8;i++){
      const z=8-i*7.8;
      building(-9,z,6,5.5+random()*3.5,7,i);
      building(9.3,z-2,6.4,6+random()*6,7.3,i+4);
    }
    for(let i=0;i<4;i++){building(-9,16+i*8,6,6+random()*4,7,i+2);building(9.3,17+i*8,6.4,7+random()*5,7.3,i+5);}
    box(.2,.12,160,-4.75,.06,0,'#a3a48f');box(.2,.12,160,4.75,.06,0,'#a3a48f');
    for(let i=-8;i<12;i++){box(.07,.008,1.1,-.08,.008,7-i*4.5,'#c3b58d');}
    car(3.2,-16);
    for(let i=0;i<5;i++){
      const z=6-i*13;
      cylinder(.07,6,-5.1,3,z,'#596858');
      const arm=box(1.6,.08,.1,-4.4,5.7,z,'#596858');
      const lamp=box(.55,.065,.25,-3.85,5.66,z,'#e1c69b');
      if(config.theme==='city' && i<3){const lampLight=new THREE.PointLight('#edc08a',25,10,2);lampLight.position.set(-3.85,5.5,z);group.add(lampLight);}
      wire([[-5.1,5.9,z],[-5.4,5.4,z-6],[-5.1,5.9,z-13]]);
      if(i%2===0)wire([[-5.1,5.8,z],[0,5.1,z+.5],[5.8,5.7,z]]);
      tree(-5.5,z-5,.8);tree(5.7,z-10,.9);
    }
    if(config.theme==='morning'){
      tree(-3,-6,1.2);tree(3,-8,1.4);box(4,.13,1,0,.06,-7,'#a3ae89');
    }
  } else if(config.theme==='camp'){
    for(let side of [-1,1]){
      for(let i=0;i<14;i++){const z=11-i*4;box(.12,3.1,.12,side*6,1.55,z,'#58665b',true);}
      for(let h of [1,2,2.9])box(.035,.035,56,side*6,h,-15,'#7b8574');
      box(.025,2.6,56,side*6,1.35,-15,'#637667');
      for(let i=0;i<3;i++)building(side*10.3,-8-i*15,6,3.5,10,i);
    }
    for(let i=0;i<6;i++)box(1,.6,1,-4,.3,5-i*3.2,'#717b69',true);
    const tower=new THREE.Group();tower.position.set(5.7,0,-20);group.add(tower);
    for(const x of [-.9,.9])for(const z of [-.9,.9])box(.15,5,.15,x,2.5,z,'#596a59',false,tower);
    box(2.6,.15,2.6,0,4,0,'#6c7561',false,tower);box(2.3,1.6,2.3,0,4.85,0,'#7f886f',false,tower);box(2.8,.25,2.8,0,5.8,0,'#5b6b57',false,tower);
    const spotlight=new THREE.SpotLight('#e8dec1',60,40,.25,.5,1);spotlight.position.set(5,5.4,-18);spotlight.target.position.set(0,0,-4);group.add(spotlight,spotlight.target);animated.push({type:'searchlight',object:spotlight});
  } else if(config.theme==='river'){
    for(let side of [-1,1])for(let i=0;i<13;i++)tree(side*(7+random()*8),8-i*5,.7+random()*.8);
    for(let i=0;i<9;i++){
      const geo=new THREE.IcosahedronGeometry(.8+random(),0),m=new THREE.Mesh(geo,material('#8a9d99'));m.position.set((i%2===0?-1:1)*(4.5+random()*3),.3,-i*4);m.scale.y=.45;group.add(m);
    }
    building(-12,-12,6,4,8,1);
    for(let i=0;i<20;i++){const z=random()*70-45,x=random()*13-6;const crack=box(.035,.006,2+random()*4,x,.007,z,'#687e83');crack.rotation.y=random()*Math.PI;}
    const spotlight=new THREE.SpotLight('#d7eff3',85,50,.22,.6,1);spotlight.position.set(8,7,-18);spotlight.target.position.set(0,0,-5);group.add(spotlight,spotlight.target);animated.push({type:'searchlight',object:spotlight});
  } else if(config.theme==='jungle'){
    for(let i=0;i<52;i++){const side=i%2===0?-1:1;tree(side*(5+random()*12),15-random()*80,1+random()*1.4);}
    for(let i=0;i<20;i++){
      const geo=new THREE.IcosahedronGeometry(.7+random()*.5,0),m=new THREE.Mesh(geo,material('#4b6347'));m.scale.set(1,.5,1);m.position.set((i%2?-1:1)*(3.6+random()*4),.2,random()*60-35);group.add(m);
    }
    box(2,.18,3,-3,.09,-2,'#7f8361');
  }
  for(const hotspot of config.hotspots){
    const [x,,z]=hotspot.position;
    if(hotspot.prop==='wardrobe'){
      box(1.3,2,.6,x,1,z,'#756f56',true);box(.022,1.84,.65,x,.95,z-.018,'#504f40');
      for(const sign of [-1,1])box(.035,.17,.055,x+sign*.09,1.02,z+.34,'#b0a78a');
    } else if(hotspot.prop==='desk'){
      box(1.35,.12,.75,x,.85,z,'#867b60',true);
      for(const dx of [-.55,.55])for(const dz of [-.25,.25])box(.075,.82,.075,x+dx,.4,z+dz,'#655f4a');
      box(.38,.012,.28,x+.15,.919,z,'#d4c7a4');box(.28,.012,.2,x-.2,.93,z+.04,'#c5b994').rotation.y=.3;
    } else if(hotspot.prop==='coat'){
      cylinder(.045,1.9,x,.95,z,'#79755c');box(.9,.07,.08,x,1.7,z,'#7b755d');
      box(.48,.75,.2,x,1.2,z,'#6b6f5a');const a=box(.13,.65,.16,x-.29,1.18,z,'#626a56');a.rotation.z=-.14;box(.13,.65,.16,x+.29,1.18,z,'#626a56').rotation.z=.14;
    } else if(hotspot.prop==='bench'){
      box(1.6,.12,.55,x,.48,z,'#6d775d',true);box(1.6,.5,.08,x,.85,z+.23,'#717b62');
      for(const dx of [-.55,.55])box(.1,.45,.45,x+dx,.225,z,'#495b4b');
    } else if(['supplies','work'].includes(hotspot.prop)){
      box(1.1,.8,.8,x,.4,z,'#897d59',true);
      for(const h of [.16,.64])box(1.14,.07,.84,x,h,z,'#5d634a');
      box(.45,.3,.35,x+.1,.95,z,'#a29c7b');
      if(hotspot.prop==='work')for(let i=0;i<3;i++)box(.8,.25,.5,x+1.2,.12+i*.25,z-.2,'#7a7e69',true);
    } else if(hotspot.prop==='person'){
      const npc=createCharacter({jacket:'#6a6754',pants:'#454d42',backpack:'#554d39'});npc.root.position.set(x,0,z);npc.root.rotation.y=Math.PI;group.add(npc.root);npcs.push({character:npc,data:{position:[x,0,z]},fixed:true});
    } else if(hotspot.prop==='lamp'){
      cylinder(.055,3.6,x,1.8,z,'#6d7c70');box(.5,.12,.3,x,3.6,z,'#cbd2b7');
    } else if(hotspot.prop==='gate'){
      for(const sign of [-1,1])box(.7,3.4,.7,x+sign*2.3,1.7,z,'#9ca38c',true);
      for(let i=0;i<15;i++)box(.06,2.8,.08,x-2+i*.285,1.4,z,'#4c6253');box(4.6,.09,.1,x,2.5,z,'#485e4c');
      sign('대한민국 · 보호 요청',x,3.12,z+.39,'#d6cba6',3.3);
    } else {
      // Visible threshold without an invisible collision wall: transition remains a narrative command.
      for(const side of [-1,1])box(.22,2.5,.25,x+side*1.1,1.25,z,'#747c65');
      box(2.42,.2,.25,x,2.6,z,'#7c826a');
    }
    const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.48,32),new THREE.MeshBasicMaterial({color:'#e8ca83',transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.035,z);group.add(ring);
    const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.1),new THREE.MeshBasicMaterial({color:'#e8ca83'}));diamond.position.set(x,2.35,z);group.add(diamond);
    markers.push({hotspot,ring,diamond,anchor:new THREE.Vector3(x,2.6,z)});
  }
  for(const data of config.npcs){const character=createCharacter({jacket:data.color,pants:'#464e43',backpack:'#656348'});character.root.position.fromArray(data.position);group.add(character.root);npcs.push({character,data,fixed:false,progress:0});}
  // Distant silhouettes give the street a continuous horizon without loading assets.
  if(urban)for(let i=0;i<14;i++)box(5+random()*5,7+random()*11,7,(i-7)*7,4,-62-random()*12,'#7b8a7f');
  // Merge static geometry by material; retain hidden colliders for camera raycasts.
  group.updateMatrixWorld(true);
  const batches=new Map();
  group.traverse(object=>{
    if(!object.isMesh || !object.material?.isMeshStandardMaterial)return;
    let owner=object;
    while(owner){if(owner.userData.character)return;owner=owner.parent;}
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    const list=batches.get(object.material)||[];list.push(geometry);batches.set(object.material,list);
    object.visible=false;
  });
  for(const [mat,list] of batches){
    const geometry=mergeGeometries(list,false);
    if(geometry){const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    for(const part of list)part.dispose();
  }
  function dispose(){
    const geo=new Set(),mats=new Set(),textures=new Set();
    group.traverse(o=>{let owner=o,shared=false;while(owner){if(owner.userData.character){shared=true;break;}owner=owner.parent;}if(o.geometry && !shared)geo.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){mats.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
    for(const t of textures)t.dispose();for(const g of geo)g.dispose();for(const m of mats)m.dispose();
  }
  return {group,obstacles,cameraObjects,markers,npcs,animated,dispose};
}
