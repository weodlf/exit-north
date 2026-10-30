/** Pure, renderer-independent domain engine. No DOM, network, clocks or storage. */
export const SCHEMA_VERSION = 1;
const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const record = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
export const getNode = (world, id) => world.nodes.find((node) => node.id === id);
export const getChapter = (world, id) => world.chapters.find((chapter) => chapter.id === id);

export function createGame(world, seed = 0x45584954) {
  const first = getNode(world, world.startNode);
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: `run-${(seed >>> 0).toString(16).padStart(8, '0')}`,
    status: 'playing',
    chapterId: first.chapterId,
    nodeId: first.id,
    turn: 0,
    stats: clone(world.rules.initialStats),
    inventory: Object.fromEntries(Object.keys(world.items).map((id) => [id, world.rules.initialInventory[id] || 0])),
    flags: [],
    visited: [first.id],
    rngState: seed >>> 0,
    journal: [],
    lastResult: null,
  };
}

/** Mulberry32: explicit saved PRNG state; save/reload cannot reroll a choice. */
function draw(state) {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function successChance(state, choice) {
  if (!choice.chance) return null;
  let p = choice.chance.base;
  for (const modifier of choice.chance.modifiers) {
    if (modifier.stat) p += state.stats[modifier.stat] * modifier.factor;
    if (modifier.flag && state.flags.includes(modifier.flag)) p += modifier.add;
  }
  return clamp(p, choice.chance.min, choice.chance.max);
}

export function availability(state, choice, world) {
  if (state.status !== 'playing') return { allowed: false, reason: '이미 끝난 여정입니다.' };
  if (state.turn >= 1_000_000) return { allowed: false, reason: '기록 한도에 도달했습니다. 새 여정을 시작하세요.' };
  const req = choice.requires || {};
  for (const flag of req.allFlags || []) {
    if (!state.flags.includes(flag)) return { allowed: false, reason: `필요한 단서: ${world.flags[flag]}` };
  }
  for (const flag of req.missingFlags || []) {
    if (state.flags.includes(flag)) return { allowed: false, reason: '이미 확인한 선택입니다.', code: 'completed' };
  }
  for (const [id, count] of Object.entries(req.items || {})) {
    if ((state.inventory[id] || 0) < count) return { allowed: false, reason: `${world.items[id].name} ${count}개가 필요합니다.` };
  }
  if (state.stats.dollars < (choice.cost.dollars || 0)) {
    return { allowed: false, reason: `$${choice.cost.dollars} 필요 · 현재 $${state.stats.dollars}` };
  }
  for (const [id, count] of Object.entries(choice.cost.items || {})) {
    if ((state.inventory[id] || 0) < count) return { allowed: false, reason: `${world.items[id].name} ${count}개가 필요합니다.` };
  }
  return { allowed: true, reason: '' };
}

export function previewCost(state, cost, world) {
  const hunger = clamp(state.stats.hunger + cost.hunger, 0, state.stats.maxHunger);
  const starvation = hunger === state.stats.maxHunger ? world.rules.starvationDamage : 0;
  return { hp: cost.hp, hunger: cost.hunger, starvation, lethal: state.stats.hp <= cost.hp + starvation };
}

function normalizeStats(state) {
  const s = state.stats;
  s.hp = clamp(s.hp, 0, s.maxHp);
  s.hunger = clamp(s.hunger, 0, s.maxHunger);
  s.stealth = clamp(s.stealth, 0, 100);
  s.dollars = clamp(s.dollars, 0, 1_000_000);
}

function payCost(state, cost, world) {
  const price = previewCost(state, cost, world);
  state.stats.hp -= cost.hp;
  state.stats.hunger += cost.hunger;
  state.stats.dollars -= cost.dollars || 0;
  for (const [id, count] of Object.entries(cost.items || {})) state.inventory[id] -= count;
  normalizeStats(state);
  // Death interrupts resolution: neither medicine nor a successful outcome can resurrect.
  if (state.stats.hp <= 0) return { dead: true, starvation: 0 };
  state.stats.hp -= price.starvation;
  normalizeStats(state);
  return { dead: state.stats.hp <= 0, starvation: price.starvation };
}

function applyEffects(state, effects = {}) {
  for (const key of ['hp', 'hunger', 'dollars', 'stealth']) state.stats[key] += effects[key] || 0;
  normalizeStats(state);
}

function finish(state, before, world, { label, text, kind, starvation = 0, chance = null, roll = null }) {
  if (state.stats.hp <= 0) state.status = 'dead';
  const delta = Object.fromEntries(['hp', 'hunger', 'dollars', 'stealth'].map((key) => [key, state.stats[key] - before.stats[key]]));
  state.lastResult = { label, text, kind: state.status === 'dead' ? 'death' : kind, starvation, chance, roll, delta };
  state.journal.push({ turn: state.turn, nodeId: before.nodeId, ...clone(state.lastResult) });
  state.journal = state.journal.slice(-world.rules.journalLimit);
  return state;
}

export function resolveChoice(previous, choiceId, world) {
  const node = getNode(world, previous.nodeId);
  const choice = node?.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('이 장면에 없는 선택입니다.');
  const check = availability(previous, choice, world);
  if (!check.allowed) throw new Error(check.reason);
  const next = clone(previous);
  next.turn += 1;
  const paid = payCost(next, choice.cost, world);
  if (paid.dead) return finish(next, previous, world, {
    label: choice.label, text: '몸이 더 이상 움직이지 않는다. 선택의 비용을 견딜 체력이 남아 있지 않았다.', kind: 'death', starvation: paid.starvation,
  });
  const chance = successChance(next, choice);
  const roll = chance === null ? null : draw(next);
  const success = chance === null || roll < chance;
  const result = chance === null ? choice.outcome : success ? choice.success : choice.failure;
  applyEffects(next, result.effects);
  // Outcome damage is also immediately terminal, before rewards or a scene transition.
  if (next.stats.hp <= 0) return finish(next, previous, world, {
    label: choice.label, text: `${result.text}\n남은 체력으로는 더 나아갈 수 없었다.`, kind: 'death', starvation: paid.starvation, chance, roll,
  });
  for (const [id, count] of Object.entries(result.addItems || {})) next.inventory[id] = clamp(next.inventory[id] + count, 0, 999);
  next.flags = [...new Set([...next.flags, ...(result.addFlags || [])])];
  const target = getNode(world, result.target);
  next.nodeId = target.id;
  next.chapterId = target.chapterId;
  if (!next.visited.includes(target.id)) next.visited.push(target.id);
  if (target.type === 'ending') next.status = 'escaped';
  return finish(next, previous, world, {
    label: choice.label, text: result.text, kind: chance === null ? 'action' : success ? 'success' : 'setback', starvation: paid.starvation, chance, roll,
  });
}

/** Prepay a physical movement segment; distance is consumed only by the renderer. */
export function travel(previous, mode, world) {
  if (previous.status !== 'playing') throw new Error('여정이 끝났습니다.');
  if (previous.turn >= 1_000_000) throw new Error('기록 한도에 도달했습니다.');
  const movement = world.rules.movement;
  if (!movement || !Object.hasOwn(movement.modes, mode)) throw new Error('알 수 없는 이동 방식입니다.');
  const rule = movement.modes[mode];
  const next = clone(previous);
  next.turn += 1;
  const paid = payCost(next, rule.cost, world);
  return finish(next, previous, world, {
    label: `${rule.label} · ${movement.segmentDistance}m`,
    text: paid.dead ? '한 걸음을 내딛으려 했지만 남은 체력이 다했다.' : `${movement.segmentDistance}m 이동 비용을 지불했다. HP −${rule.cost.hp} · 허기 +${rule.cost.hunger}`,
    kind: 'action', starvation: paid.starvation,
  });
}

export function useItem(previous, itemId, world) {
  const item = world.items[itemId];
  if (previous.status !== 'playing') throw new Error('여정이 끝났습니다.');
  if (previous.turn >= 1_000_000) throw new Error('기록 한도에 도달했습니다.');
  if (!item || item.kind !== 'consumable' || !(previous.inventory[itemId] > 0)) throw new Error('사용할 수 없는 아이템입니다.');
  const next = clone(previous);
  next.turn += 1;
  next.inventory[itemId] -= 1;
  const paid = payCost(next, world.rules.inventoryActionCost, world);
  if (!paid.dead) applyEffects(next, item.effects);
  return finish(next, previous, world, {
    label: `${item.name} 사용`,
    text: paid.dead ? '물품을 꺼내는 동안 마지막 힘이 다했다. 회복 효과가 적용되기 전에 여정이 멈췄다.' : `${item.name}을(를) 사용했다. ${item.description}`,
    kind: 'item', starvation: paid.starvation,
  });
}

/** Runtime save validation. The JSON Schema is also checked with Ajv in tests. */
export function validateState(state, world) {
  const errors = [];
  if (!record(state)) return ['저장 상태가 객체가 아닙니다.'];
  const keys = ['schemaVersion','runId','status','chapterId','nodeId','turn','stats','inventory','flags','visited','rngState','journal','lastResult'];
  if (Object.keys(state).some((key) => !keys.includes(key)) || keys.some((key) => !(key in state))) errors.push('상태 필드 불일치');
  if (state.schemaVersion !== SCHEMA_VERSION) errors.push('지원하지 않는 저장 버전');
  if (typeof state.runId !== 'string' || !/^run-[0-9a-f]{8}$/.test(state.runId)) errors.push('여정 ID 오류');
  const node = getNode(world, state.nodeId);
  if (!node || node.chapterId !== state.chapterId) errors.push('장면/챕터 불일치');
  if (!['playing', 'dead', 'escaped'].includes(state.status)) errors.push('상태 오류');
  if (!isInt(state.turn, 0, 1_000_000) || !isInt(state.rngState, 0, 0xffffffff)) errors.push('행동 수/난수 상태 오류');
  const s = state.stats;
  const statKeys = ['hp','maxHp','hunger','maxHunger','dollars','stealth'];
  if (!record(s) || Object.keys(s).length !== statKeys.length || !statKeys.every(k => k in s) || s.maxHp !== world.rules.initialStats.maxHp || s.maxHunger !== world.rules.initialStats.maxHunger || !isInt(s.hp, 0, s.maxHp) || !isInt(s.hunger, 0, s.maxHunger) || !isInt(s.dollars, 0, 1_000_000) || !isInt(s.stealth, 0, 100)) errors.push('능력치 범위 오류');
  if (record(s) && ((state.status === 'dead') !== (s.hp === 0))) errors.push('사망 상태 불일치');
  if ((state.status === 'escaped') !== (node?.type === 'ending') && state.status !== 'dead') errors.push('엔딩 상태 불일치');
  if (!record(state.inventory) || Object.keys(state.inventory).length !== Object.keys(world.items).length || Object.keys(world.items).some(id => !isInt(state.inventory[id], 0, 999)) || Object.keys(state.inventory || {}).some(id => !world.items[id])) errors.push('소지품 오류');
  if (!Array.isArray(state.flags) || new Set(state.flags).size !== state.flags.length || state.flags.some(flag => !Object.hasOwn(world.flags, flag))) errors.push('단서 오류');
  if (!Array.isArray(state.visited) || !state.visited.includes(state.nodeId) || new Set(state.visited).size !== state.visited.length || state.visited.some(id => !getNode(world, id))) errors.push('방문 기록 오류');
  function validResult(result) {
    return record(result) && typeof result.label === 'string' && result.label.length <= 200 && typeof result.text === 'string' && result.text.length <= 4000 && ['action','success','setback','item','death'].includes(result.kind) && isInt(result.starvation,0,world.rules.starvationDamage) && (result.chance === null || (typeof result.chance === 'number' && result.chance >= 0 && result.chance <= 1)) && (result.roll === null || (typeof result.roll === 'number' && result.roll >= 0 && result.roll < 1)) && record(result.delta) && Object.keys(result.delta).length === 4 && ['hp','hunger','dollars','stealth'].every(key => isInt(result.delta[key], -1_000_000, 1_000_000));
  }
  if (state.lastResult !== null && !validResult(state.lastResult)) errors.push('최근 결과 오류');
  if (!Array.isArray(state.journal) || state.journal.length > world.rules.journalLimit || state.journal.some((entry,i) => !validResult(entry) || !getNode(world,entry.nodeId) || !isInt(entry.turn,1,state.turn) || (i > 0 && entry.turn <= state.journal[i-1].turn))) errors.push('일지 오류');
  return errors;
}

export function serializeGame(state, world) {
  const errors = validateState(state, world);
  if (errors.length) throw new Error(errors.join(', '));
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, dataRevision: world.revision, state });
}

export function deserializeGame(raw, world) {
  if (typeof raw !== 'string' || raw.length > 500_000) throw new Error('저장 파일 크기 오류');
  const envelope = JSON.parse(raw);
  if (!record(envelope) || envelope.schemaVersion !== SCHEMA_VERSION || envelope.dataRevision !== world.revision) throw new Error('게임 데이터 버전이 바뀌었습니다. 새 여정이 필요합니다.');
  const errors = validateState(envelope.state, world);
  if (errors.length) throw new Error(errors.join(', '));
  return clone(envelope.state);
}

export function assertValidWorld(world) {
  const ids = world.nodes.map(node => node.id);
  if (ids.length !== new Set(ids).size || !ids.includes(world.startNode)) throw new Error('장면 ID 중복 또는 시작 장면 누락');
  for (const node of world.nodes) {
    if (!getChapter(world, node.chapterId) || !world.scenes[node.scene_3d]) throw new Error(`장면 메타데이터 오류: ${node.id}`);
    if (new Set(node.choices.map(choice => choice.id)).size !== node.choices.length) throw new Error(`선택 ID 중복: ${node.id}`);
    if (node.type !== 'ending' && !node.choices.length) throw new Error(`이동할 수 없는 장면: ${node.id}`);
    for (const choice of node.choices) {
      if (!isInt(choice.cost.hp, 1, 100) || !isInt(choice.cost.hunger,1,100)) throw new Error(`행동 비용 오류: ${choice.id}`);
      for (const id of Object.keys(choice.cost.items || {}).concat(Object.keys(choice.requires?.items || {}))) if (!world.items[id]) throw new Error(`아이템 참조 오류: ${id}`);
      for (const flag of [...(choice.requires?.allFlags || []),...(choice.requires?.missingFlags || [])]) if (!Object.hasOwn(world.flags,flag)) throw new Error(`요구 단서 참조 오류: ${flag}`);
      for (const modifier of choice.chance?.modifiers || []) if (modifier.flag && !Object.hasOwn(world.flags,modifier.flag)) throw new Error(`확률 단서 참조 오류: ${modifier.flag}`);
      for (const result of [choice.outcome, choice.success, choice.failure].filter(Boolean)) {
        if (!ids.includes(result.target)) throw new Error(`이동 대상 오류: ${result.target}`);
        for (const id of Object.keys(result.addItems || {})) if (!world.items[id]) throw new Error(`보상 아이템 오류: ${id}`);
        for (const flag of result.addFlags || []) if (!Object.hasOwn(world.flags,flag)) throw new Error(`단서 참조 오류: ${flag}`);
      }
    }
  }
  return true;
}

/** Shared command boundary for DOM, Three.js raycasts, and a Unity JS bridge. */
export function createGameStore(world, initial = createGame(world)) {
  if (validateState(initial, world).length) throw new Error('초기 상태 검증 실패');
  let current = clone(initial);
  const listeners = new Set();
  const snapshot = () => clone(current);
  return Object.freeze({
    getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch(command) {
      if (!record(command)) throw new Error('명령 형식 오류');
      if (command.type === 'CHOOSE') current = resolveChoice(current, command.choiceId, world);
      else if (command.type === 'USE_ITEM') current = useItem(current, command.itemId, world);
      else if (command.type === 'TRAVEL') current = travel(current, command.mode, world);
      else if (command.type === 'RESTART') current = createGame(world, command.seed);
      else throw new Error('지원하지 않는 명령입니다.');
      for (const listener of listeners) listener(snapshot());
      return snapshot();
    },
  });
}
