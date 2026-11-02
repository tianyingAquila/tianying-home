// 发布前冒烟：牌战能完整打完、塔防新旧版本回放一致。规则细节不在这里逐条测。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { POOL, CARDS } from '../assets/js/game/chaos-cards/cards.mjs';
import { Game, createGame, act, validateDeck, view } from '../assets/js/game/chaos-cards/engine.mjs';
import { basicDeck, chooseAction } from '../assets/js/game/chaos-cards/ai.mjs';

test('牌战：卡牌齐全，每张牌都能打出', () => {
  assert.equal(POOL.length, 197);
  assert.equal(Object.keys(CARDS).length, 222);
  assert.equal(validateDeck(basicDeck()), true);
  for (const c of POOL) for (let choice = 0; choice < (c.choices?.length || 1); choice++) {
    const s = createGame([basicDeck(), basicDeck()], 123, 0);
    Object.assign(s, { phase: 'playing', active: 0, turn: 10, deadline: 1e9 });
    for (const p of s.players) Object.assign(p, { hand: [], board: [], deck: basicDeck(), mana: 10, maxMana: 10, mulligan: true });
    const g = new Game(s);
    g.summon(0, 'CS2_120'); for (let i = 0; i < 4; i++) g.summon(1, 'CS2_200'); g.q = [];
    const card = { id: c.id, uid: 'hand' };
    g.p(0).hand = [card];
    const next = act(g.s, 0, { type: 'play', card: 'hand', position: 1, choice, target: g.targets(0, card, choice)[0] }, 1);
    assert.ok(next.players.every(p => p.board.length <= 7), c.name);
  }
});

test('牌战：两档电脑对手都能打完一整局', () => {
  for (const difficulty of ['easy', 'normal']) {
    let s = createGame([basicDeck(), basicDeck()], 39, 0), now = 1;
    for (let i = 0; i < 2; i++) s = act(s, i, { type: 'mulligan', cards: [] }, now);
    for (let step = 0; step < 1800 && s.phase !== 'finished'; step++) s = act(s, s.active, chooseAction(s, s.active, difficulty, now), now++);
    assert.equal(s.phase, 'finished', difficulty);
    assert.equal(view(s, 0).players[1].hand.length, 0);
  }
});

test('塔防：当前和各冻结旧版本分段回放都与整段回放一致', () => {
  const base = new URL('../assets/js/game/tower/', import.meta.url);
  const actions = [
    { tick: 0, op: 'build', type: 'bolt', c: 0, r: 0 }, { tick: 0, op: 'upgrade', c: 0, r: 0 }, { tick: 0, op: 'start' },
    { tick: 3, op: 'sell', c: 0, r: 0 }, { tick: 3, op: 'build', type: 'bolt', c: 0, r: 0 },
  ];
  const versions = fs.readdirSync(new URL('versions/', base)).map(v => 'versions/' + v + '/');
  for (const dir of ['', ...versions]) {
    const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
    for (const name of ['config', 'grid', 'enemies', 'towers', 'engine']) vm.runInContext(fs.readFileSync(new URL(dir + name + '.js', base), 'utf8'), ctx);
    // 旧版本由回放页的外壳适配，和线上回放走同一条路
    ctx.document = { getElementById() {} };
    vm.runInContext(fs.readFileSync(new URL('replay.js', base), 'utf8').replace('  init();', '  window.__replay = { state, makeEngine };'), ctx);
    ctx.__replay.state.record = { map: 1 };
    const single = ctx.__replay.makeEngine(), chunks = ctx.__replay.makeEngine();
    single.runToTick(actions, 30, 100);
    for (let tick = 0; tick <= 30; tick++) chunks.runToTick(actions, tick, 100);
    assert.equal(JSON.stringify(chunks.resultState()), JSON.stringify(single.resultState()), dir || '当前版本');
  }
});
