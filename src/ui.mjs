import { preloadCharacter } from './three/character.mjs';
import { createThirdPersonRenderer } from './three/renderer.mjs';
import { assertValidWorld, createGame, createGameStore, deserializeGame, serializeGame, getNode, getChapter, availability, successChance, previewCost } from './game-engine.mjs';
const world = JSON.parse(document.getElementById('world-data').textContent);
assertValidWorld(world);
const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const saveKey = 'exit-north.save.v1';
const makeSeed = () => globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
let startupNotice = '';
let initial;
try {
  const raw = localStorage.getItem(saveKey);
  initial = raw ? deserializeGame(raw, world) : createGame(world, makeSeed());
} catch {
  initial = createGame(world, makeSeed());
  startupNotice = '이전 저장을 읽을 수 없어 새 여정을 시작했습니다. 브라우저 저장 공간 또는 데이터 버전을 확인해 주세요.';
}
const store = createGameStore(world, initial);
let state = store.getSnapshot();
let previousScene = '';
let previousStatus = '';
let typingTimer;
let typingText = '';
let typing = false;
let toastTimer;
let lastCommandType='';
let renderer3D;
let focusedHotspot=null;
let using3D=false;
let modeRequest=0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const iconPaths = {
  bread: '<path d="M5 9C1 7 3 2 7 3c2-2 8-2 10 0 4-1 6 4 2 6v11H5Z"/><path d="M8 7v3m4-4v4m4-3v3M5 16h14"/>',
  can: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 4 14 4 14 0V5M5 15c3 2 11 2 14 0"/><path d="M10 5h4"/>',
  medical: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M9 5V2h6v3m-3 4v8m-4-4h8"/>',
};
const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${iconPaths[id] || ''}</svg>`;

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}
function save() {
  try {
    localStorage.setItem(saveKey, serializeGame(state, world));
    $('save-status').textContent = '이 기기에 자동 저장';
  } catch {
    $('save-status').textContent = '저장 불가 · 탭을 닫으면 진행이 사라짐';
    // The warning must remain visible on small screens where the normal badge is hidden.
    toast('자동 저장을 사용할 수 없습니다. 이 탭을 닫으면 진행이 사라집니다.');
  }
}
function completeTyping() {
  clearTimeout(typingTimer);
  typing = false;
  $('story-text').textContent = typingText;
  $('story-text').classList.remove('typing-caret');
  $('skip-text').disabled = true;
}
function typeStory(text, animate = true) {
  clearTimeout(typingTimer);
  typingText = text;
  $('accessible-story').textContent = text;
  $('story-text').textContent = '';
  if (!animate || reducedMotion.matches) { completeTyping(); return; }
  typing = true;
  $('skip-text').disabled = false;
  $('story-text').classList.add('typing-caret');
  const characters = Array.from(text);
  let offset = 0;
  function tick() {
    offset = Math.min(offset + 2, characters.length);
    $('story-text').textContent = characters.slice(0, offset).join('');
    if (offset < characters.length) typingTimer = setTimeout(tick, 28);
    else completeTyping();
  }
  tick();
}

function renderStats() {
  for (const key of ['hp','hunger','dollars','stealth']) $(key+'-value').textContent = state.stats[key];
  for (const key of ['hp','hunger','stealth']) {
    const bar = $(key+'-bar');
    bar.setAttribute('aria-valuenow', state.stats[key]);
    bar.querySelector('span').style.width = `${state.stats[key]}%`;
  }
  $('hp-card').classList.toggle('low', state.stats.hp <= 25);
  $('hunger-card').classList.toggle('starving', state.stats.hunger === 100);
  $('hp-note').textContent = state.stats.hp <= 25 ? '체력 경고 · 회복 물품을 확인하세요' : '살아남기 위한 마지막 자원';
  $('hunger-note').textContent = state.status !== 'playing' ? '생존 판정 종료 · 마지막 허기 기록' : state.stats.hunger === 100 ? '아사 상태 · 다음 행동에도 HP −5' : '높을수록 배고픔 · 100이면 아사';
  $('run-status').textContent = state.status === 'dead' ? '여정이 멈춤' : state.status === 'escaped' ? '보호를 요청함' : state.stats.hunger === 100 ? '아사 상태' : state.stats.hp <= 25 ? '위태로운 상태' : '살아 있음';
  $('run-status').style.color = state.status === 'dead' || state.stats.hunger === 100 ? 'var(--red)' : '';
}
function renderChapters() {
  $('chapters').innerHTML = world.chapters.map(chapter => {
    const current = chapter.id === state.chapterId;
    const completed = !current && state.visited.some(id => getNode(world,id).chapterId === chapter.id);
    return `<li class="chapter ${current ? 'current' : completed ? 'completed' : ''}" ${current ? 'aria-current="step"' : ''}><span class="chapter-mark">${completed ? '✓' : String(chapter.number).padStart(2,'0')}</span><span class="chapter-name">${escapeHTML(chapter.shortTitle)}<small>${current ? '지금, 이곳' : completed ? '지나온 장면' : '아직 닿지 않은 곳'}</small></span></li>`;
  }).join('');
  document.querySelector('.chapter.current')?.scrollIntoView({ block:'nearest',inline:'nearest',behavior:'instant' });
}
function renderScene() {
  const node = getNode(world,state.nodeId);
  const chapter = getChapter(world,state.chapterId);
  const scene = world.scenes[node.scene_3d];
  $('scene-frame').dataset.environment = scene.environment;
  $('scene-frame').classList.toggle('dead',state.status === 'dead');
  $('scene-frame').classList.toggle('escaped',state.status === 'escaped');
  $('chapter-tag').textContent = `CHAPTER ${String(chapter.number).padStart(2,'0')} / 06`;
  $('scene-location').textContent = chapter.location;
  $('scene-genre').textContent = chapter.genre;
  $('story-title').textContent = state.status === 'dead' ? '여기서,\n여정이 멈췄다.' : node.title;
  if (previousScene !== node.id || previousStatus !== state.status) {
    const text = state.status === 'dead' ? '몸이 더는 움직이지 않는다. 걸어온 길은 사라지지 않는다.\n\n이번 여정은 여기서 멈췄지만, 남겨진 기록을 읽거나 첫 아침부터 다시 선택할 수 있다.' : node.text;
    typeStory(text);
    renderChapters();
  }
  $('objective-text').textContent = chapter.objective;
  $('objectives').innerHTML = chapter.objectives.map(task => `<li class="${state.flags.includes(task.flag) ? 'done' : ''}">${escapeHTML(task.label)}</li>`).join('');
  $('clues').innerHTML = state.flags.length ? state.flags.map(flag => `<span class="clue">${escapeHTML(world.flags[flag])}</span>`).join('') : '<p class="empty-note">아직 손에 쥔 단서가 없습니다.<br>수색으로 기억의 조각을 찾으세요.</p>';
}
function renderResult() {
  if (!state.lastResult) {
    $('latest-result').classList.remove('danger');
    $('latest-result').innerHTML = '<strong>기억의 첫 페이지</strong><span>모든 선택은 흔적을 남깁니다. 지금, 무엇을 챙기시겠습니까.</span>';
    return;
  }
  const r = state.lastResult;
  const detail = r.starvation ? ` · 아사 피해 −${r.starvation} HP` : '';
  $('latest-result').classList.toggle('danger',r.kind === 'death' || r.kind === 'setback');
  $('latest-result').innerHTML = `<strong>${escapeHTML(r.label+detail)}</strong><span>${escapeHTML(r.text)}</span>`;
}
function renderChoices() {
  $('turn-label').textContent = `결정 ${String(state.turn).padStart(2,'0')}회 · 행동력 제한 없음`;
  if (state.status !== 'playing') {
    $('choices').style.gridTemplateColumns = '1fr';
    $('choices-heading').textContent = state.status === 'escaped' ? '끝나지 않은 이야기' : '남겨진 기록';
    $('choices').innerHTML = `<div class="journey-end"><h3>${state.status === 'escaped' ? '남겨진 바람을 기억하며' : '이 여정도, 한 사람의 기록입니다.'}</h3><p>${state.status === 'escaped' ? '살아남음을 점수로 매기지 않습니다.<br>기억의 바깥에 있는 현실을 함께 읽어 주세요.' : '체력이 0이 되어 더 이상 선택할 수 없습니다.<br>지나온 선택을 돌아보고 새로운 여정을 시작할 수 있습니다.'}</p>${state.status === 'escaped' ? '<button class="primary-button" data-truth type="button">진실의 방 읽기 ↗</button>' : '<button class="primary-button" data-restart type="button">첫 아침부터 다시 시작</button>'}<button class="quiet-button" data-journal type="button">여정 기록 살펴보기</button></div>`;
    return;
  }
  $('choices').style.gridTemplateColumns = '';
  $('choices-heading').textContent = '어떻게 하시겠습니까?';
  $('choices').innerHTML = getNode(world,state.nodeId).choices.map((choice,index) => {
    const check = availability(state,choice,world);
    const cost = previewCost(state,choice.cost,world);
    const chance = successChance(state,choice);
    return `<button class="choice" type="button" data-choice="${escapeHTML(choice.id)}" ${check.allowed ? '' : 'disabled'} aria-describedby="choice-description-${index}"><span class="choice-top"><span class="choice-key" aria-hidden="true">${index+1}</span><span class="choice-title">${escapeHTML(choice.label)}</span><span class="choice-arrow" aria-hidden="true">↗</span></span><span class="choice-description" id="choice-description-${index}">${escapeHTML(choice.description)}</span><span class="choice-cost"><span>HP −${cost.hp}</span><span class="hunger-cost">허기 +${cost.hunger}</span>${choice.cost.dollars ? `<span>$ −${choice.cost.dollars}</span>` : ''}${cost.starvation ? `<span class="fatal">아사 −${cost.starvation}</span>` : ''}${chance !== null ? `<span class="chance">성공 ${Math.round(chance*100)}%</span>` : ''}</span>${!check.allowed ? `<span class="choice-requirement">${escapeHTML(check.reason)}</span>` : cost.lethal ? '<span class="choice-requirement fatal-note">이 행동의 비용만으로 체력이 0이 됩니다.</span>' : ''}</button>`;
  }).join('');
}
function renderInventory() {
  $('inventory').innerHTML = Object.entries(world.items).filter(([,item]) => item.kind === 'consumable').map(([id,item]) => {
    const count = state.inventory[id];
    const disabled = !count || state.status !== 'playing';
    return `<div class="inventory-item ${count ? '' : 'empty'}"><span class="item-icon">${icon(item.icon)}</span><div class="item-info"><div class="item-name">${escapeHTML(item.name)} <small>×${count}</small></div><div class="item-desc">${escapeHTML(item.description.split('. ').at(-1))}</div></div><button class="use-item" data-item="${id}" type="button" ${disabled ? 'disabled' : ''} aria-label="${escapeHTML(item.name)} 사용, ${count}개 보유">사용</button></div>`;
  }).join('');
  const cost = previewCost(state,world.rules.inventoryActionCost,world);
  $('item-risk').hidden = state.status !== 'playing' || (!cost.lethal && !cost.starvation);
  $('item-risk').textContent = cost.lethal ? '현재 HP로는 물품 사용 비용을 버티지 못합니다. 회복 전에 체력이 0이 됩니다.' : '현재 물품 사용에도 아사 피해 HP −5가 먼저 적용됩니다.';
}
function render() {
  renderStats(); renderScene(); renderResult(); renderChoices(); renderInventory();
  sync3DOverlay();
  previousScene = state.nodeId;
  previousStatus = state.status;
}
function dispatch(command) {
  // Commands may come from any renderer, but they always pass through the same engine.
  try {
    lastCommandType=command.type;
    if(command.type==='RESTART') { focusedHotspot=null; document.body.dataset.panel=''; }
    const next = store.dispatch(command);
    if(command.type==='CHOOSE' && using3D && next.status==='playing')close3DPanel();
    return { ok:true,state:next };
  } catch (error) {
    toast(error.message);
    return { ok:false,error:error.message };
  } finally { lastCommandType=''; }
}
function openJournal() {
  $('journal-summary').textContent = `${state.turn}번의 결정 · 최근 ${state.journal.length}개 기록 · HP ${state.stats.hp}`;
  $('journal-entries').innerHTML = state.journal.length ? [...state.journal].reverse().map(entry => `<article class="journal-entry"><h3>${String(entry.turn).padStart(2,'0')} — ${escapeHTML(entry.label)}</h3><p>${escapeHTML(entry.text)}</p><small>HP ${entry.delta.hp >= 0 ? '+' : ''}${entry.delta.hp} · 허기 ${entry.delta.hunger >= 0 ? '+' : ''}${entry.delta.hunger} · $ ${entry.delta.dollars >= 0 ? '+' : ''}${entry.delta.dollars}${entry.starvation ? ` · 아사 −${entry.starvation} HP 포함` : ''}</small></article>`).join('') : '<p>아직 기록된 선택이 없습니다. 첫 아침의 문 앞에 서 있습니다.</p>';
  $('journal-dialog').showModal();
}
store.subscribe(next => {
  const changed = next.nodeId !== state.nodeId || next.status !== state.status;
  const focusedItem = document.activeElement?.dataset.item;
  const focusedChoice = document.activeElement?.hasAttribute('data-choice');
  state = next;
  if(lastCommandType==='TRAVEL' && !changed){renderStats();if(document.body.dataset.panel==='choices')renderChoices();save();return;}
  if(changed && using3D){focusedHotspot=null;document.body.dataset.panel=next.status==='playing'?'':'choices';}
  if (!changed) completeTyping();
  render(); save();
  if (changed) $('story-title').focus({preventScroll:true});
  else if (focusedItem) {
    const nextButton = document.querySelector(`[data-item="${CSS.escape(focusedItem)}"]`);
    (nextButton && !nextButton.disabled ? nextButton : $('choices-heading')).focus({preventScroll:true});
  } else if (focusedChoice) $('choices-heading').focus({preventScroll:true});
});
$('skip-text').addEventListener('click',completeTyping);
reducedMotion.addEventListener('change',() => { if (reducedMotion.matches) completeTyping(); });
$('rules-button').addEventListener('click',() => $('rules-dialog').showModal());
$('journal-button').addEventListener('click',openJournal);
$('restart-button').addEventListener('click',() => $('restart-dialog').showModal());
$('confirm-restart').addEventListener('click',() => {
  $('restart-dialog').close();
  dispatch({type:'RESTART',seed:makeSeed()});
  $('story-title').focus({preventScroll:true});
});
document.addEventListener('click',event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.choice) dispatch({type:'CHOOSE',choiceId:button.dataset.choice});
  else if (button.dataset.item) dispatch({type:'USE_ITEM',itemId:button.dataset.item});
  else if (button.hasAttribute('data-close')) button.closest('dialog').close();
  else if (button.hasAttribute('data-restart')) $('restart-dialog').showModal();
  else if (button.hasAttribute('data-journal')) openJournal();
  else if (button.hasAttribute('data-truth')) $('truth-dialog').showModal();
});
document.addEventListener('keydown',event => {
  if(using3D && event.code==='KeyI' && !event.repeat && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();toggleInventory();return;}
  if(using3D && event.code==='Escape' && document.body.dataset.panel){close3DPanel();return;}
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'Space' && typing && !/BUTTON|A/.test(event.target.tagName)) { event.preventDefault(); completeTyping(); }
  if (/^[1-9]$/.test(event.key)) {
    if(using3D && document.body.dataset.panel!=='choices')return;
    const button = [...$('choices').querySelectorAll('[data-choice]')].filter(button=>!button.hidden)[Number(event.key)-1];
    if (button && !button.disabled) { event.preventDefault(); button.click(); }
  }
});
// Adapter contract: renderers subscribe, send commands, and never mutate the store.
globalThis.ExitNorthBridge = Object.freeze({
  dispatch,
  getSnapshot: store.getSnapshot,
  subscribe: store.subscribe,
  getScene: () => { const node=getNode(world,state.nodeId); return structuredClone({ nodeId:node.id,scene_3d:node.scene_3d,camera_mode:node.camera_mode,...world.scenes[node.scene_3d] }); },
});

function close3DPanel(){
  document.body.dataset.panel='';focusedHotspot=null;
}
function toggleInventory(){
  document.body.dataset.panel=document.body.dataset.panel==='inventory'?'':'inventory';
  focusedHotspot=null;
}
function sync3DOverlay(){
  $('hud-objective').textContent=getChapter(world,state.chapterId).objective;
  if(!using3D)return;
  if(state.status!=='playing')document.body.dataset.panel='choices';
  if(focusedHotspot && state.status==='playing'){
    const ids=focusedHotspot.bindings[state.nodeId] || [];
    let index=1;
    for(const button of $('choices').querySelectorAll('[data-choice]')){
      button.hidden=!ids.includes(button.dataset.choice);
      if(!button.hidden)button.querySelector('.choice-key').textContent=index++;
    }
    $('choices-heading').textContent=focusedHotspot.label;
  }
}
async function set3DMode(enabled){
  const request=++modeRequest;
  if(enabled){
    using3D=true;document.body.classList.add('mode-3d');
    document.body.dataset.engine='loading';
    $('view-mode-button').textContent='텍스트 모드';
    try{
      await preloadCharacter();
      if(request!==modeRequest || !using3D)return;
      if(renderer3D?.getSnapshot().contextLost){renderer3D.dispose();renderer3D=undefined;}
      if(!renderer3D){
        document.body.dataset.engine='loading';
        renderer3D=createThirdPersonRenderer({
          container:$('viewport'),world,spaces:JSON.parse($('spaces-data').textContent),bridge:globalThis.ExitNorthBridge,
          onInteract(hotspot){
            if(state.status==='escaped'){$('truth-dialog').showModal();return;}
            focusedHotspot=hotspot;document.body.dataset.panel='choices';renderChoices();sync3DOverlay();
            $('choices').querySelector('button:not(:disabled):not([hidden])')?.focus({preventScroll:true});
          },
          onProximity(hotspot){
            $('interaction-prompt').hidden=!hotspot;
            $('interaction-label').textContent=hotspot?`${hotspot.label} · 조사하기`:'';
          },
          isPaused:()=>Boolean(document.querySelector('dialog[open]') || document.body.dataset.panel),
          onFallback(message){set3DMode(false);toast(message);},
        });
        globalThis.ExitNorth3D=Object.freeze({getSnapshot:renderer3D.getSnapshot});
      }
      using3D=true;document.body.classList.add('mode-3d');renderer3D.setEnabled(true);
      if(renderer3D.getSnapshot().ready)document.body.dataset.engine='ready';
      $('view-mode-button').textContent='텍스트 모드';$('inventory-toggle').hidden=false;$('story-toggle').hidden=false;
      sync3DOverlay();
    }catch(error){
      using3D=false;document.body.classList.remove('mode-3d');$('view-mode-button').textContent='3D 다시 시도';
      $('inventory-toggle').hidden=true;$('story-toggle').hidden=true;
      document.body.dataset.panel='';toast(`이 기기에서 3D를 시작하지 못해 텍스트 모드로 열었습니다. ${error.message}`);
    }
  }else{
    using3D=false;renderer3D?.setEnabled(false);document.body.classList.remove('mode-3d','story-visible');
    document.body.dataset.panel='';focusedHotspot=null;
    $('view-mode-button').textContent='3D 모드';$('inventory-toggle').hidden=true;$('story-toggle').hidden=true;
    renderChoices();renderChapters();
  }
}
$('view-mode-button').addEventListener('click',()=>set3DMode(!using3D));
$('inventory-toggle').addEventListener('click',toggleInventory);
$('story-toggle').addEventListener('click',()=>document.body.classList.toggle('story-visible'));
$('panel-close').addEventListener('click',close3DPanel);

render(); save();
if(new URL(location.href).searchParams.get('view')!=='text')set3DMode(true);
if (startupNotice) toast(startupNotice);
