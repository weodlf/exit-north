import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {assertValidWorld} from '../src/game-engine.mjs';
const root=new URL('../',import.meta.url);
const [template,rawData,rawSpaces,styles,notices]=await Promise.all([
 readFile(new URL('src/index.template.html',root),'utf8'),
 readFile(new URL('data/events.json',root),'utf8'),
 readFile(new URL('data/spaces.json',root),'utf8'),
 readFile(new URL('src/three/three.css',root),'utf8'),
 readFile(new URL('THIRD_PARTY_NOTICES.md',root),'utf8'),
]);
const world=JSON.parse(rawData),spaces=JSON.parse(rawSpaces);assertValidWorld(world);
for(const node of world.nodes)if(!spaces.scenes[node.scene_3d])throw new Error(`Missing spatial scene ${node.scene_3d}`);
const result=await build({entryPoints:[fileURLToPath(new URL('src/ui.mjs',root))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'inline',loader:{'.glb':'binary'},logLevel:'warning'});
const script=result.outputFiles[0].text;
if(/<\/script/i.test(script))throw new Error('Inline script contains an unsafe closing tag');
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const html=template.replace('<head>','<head>\n<!-- '+notices.replace(/-->/g,'-- >')+' -->').replace('</style>',styles+'\n</style>').replace('/*__WORLD__*/',json(world)).replace('/*__SPACES__*/',json(spaces)).replace('/*__APPLICATION__*/',()=>script);
await writeFile(new URL('index.html',root),html);
console.log(`Built index.html: ${Buffer.byteLength(html)} bytes; ${world.chapters.length} chapters, ${Object.keys(spaces.scenes).length} WebGL spaces. No runtime network dependencies.`);
