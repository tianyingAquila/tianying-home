import test from 'node:test';
import assert from 'node:assert/strict';
import { POOL, CARDS } from '../assets/js/game/chaos-cards/cards.mjs';
import { Game, createGame, act, validateDeck, legalActions, timeout, view } from '../assets/js/game/chaos-cards/engine.mjs';
import { basicDeck, chooseAction } from '../assets/js/game/chaos-cards/ai.mjs';
import {boardEffects,combatHints} from '../assets/js/game/chaos-cards/presentation.mjs';
const path='../assets/js/game/chaos-cards/';
function rig(){const s=createGame([basicDeck(),basicDeck()],123,0);s.phase='playing';s.active=0;s.turn=10;s.deadline=1e9;for(const p of s.players){p.hand=[];p.board=[];p.deck=basicDeck();p.mana=10;p.maxMana=10;p.mulligan=true;}return new Game(s);}
const play=(g,id,target,choice=0)=>{const c={id,uid:'e'+g.s.next++};g.p(0).hand.push(c);return act(g.s,0,{type:'play',card:c.uid,position:0,target,choice},1);};
test('catalog and global copy limit',()=>{assert.equal(POOL.length,100);assert.equal(Object.keys(CARDS).length,113);assert.ok(POOL.every(c=>c.themes.length));assert.throws(()=>validateDeck(Array(30).fill('CS2_120')),/两张/);assert.equal(validateDeck(basicDeck()),true);});
test('attack hints follow the current legal attackers and taunt targets',()=>{
 const g=rig(),awake=g.summon(0,'CS2_120'),sleeping=g.summon(0,'EX1_556'),taunt=g.summon(1,'CS2_125'),other=g.summon(1,'CS2_200');awake.born=0;
 let hints=combatHints(view(g.s,0).options);assert.deepEqual([...hints.attackers],[awake.uid]);assert.deepEqual([...hints.targets],[taunt.uid]);assert.ok(!hints.attackers.has(sleeping.uid));
 g.silence(taunt.uid);hints=combatHints(view(g.s,0).options);assert.ok(hints.targets.has(other.uid));assert.ok(hints.targets.has(g.p(1).uid));
 awake.frozen=10;assert.equal(combatHints(view(g.s,0).options).targets.size,0);awake.frozen=0;
 assert.equal(combatHints(view(g.s,1).options).attackers.size,0);assert.equal(combatHints(view(g.s,0).options,{playingCard:true}).targets.size,0);
});
test('live effect display keeps deathrattles, triggers and actual modifiers, and removes lost abilities',()=>{
 const g=rig(),wolf=g.summon(0,'DS1_175'),beast=g.summon(0,'CS2_120'),death=g.summon(0,'EX1_556'),shield=g.summon(0,'EX1_008'),water=g.summon(1,'CS2_033');g.q=[];
 const current=m=>g.publicPlayers().flatMap(p=>p.board).find(p=>p.uid===m.uid),effects=m=>boardEffects(m.id,current(m));
 assert.ok(effects(wolf).some(e=>e.label==='光环'));assert.ok(effects(beast).some(e=>e.label==='光环 +1/0'));assert.ok(effects(death).some(e=>e.label==='亡语'));assert.ok(effects(water).some(e=>e.label==='伤害触发'));
 g.buff(beast.uid,2,0,[],true);assert.ok(effects(beast).some(e=>e.label==='本回合 +2/0'));assert.ok(!effects(beast).some(e=>e.label.startsWith('属性')));
 g.damage([[shield.uid,1]]);assert.ok(!effects(shield).some(e=>e.label==='圣盾'));
 g.silence(death.uid);assert.ok(!effects(death).some(e=>e.label==='亡语'));assert.ok(effects(death).some(e=>e.label==='已沉默'));
 g.silence(wolf.uid);assert.ok(!effects(wolf).some(e=>e.label==='光环'));assert.ok(!effects(beast).some(e=>e.type==='aura'));
 g.end(1);assert.ok(!effects(beast).some(e=>e.label.startsWith('本回合')));
 for(const c of Object.values(CARDS))assert.doesNotThrow(()=>boardEffects(c.id,{keys:c.keywords,health:c.health,maxHealth:c.health}));
 assert.ok(!boardEffects('CS2_189',{keys:[]}).some(e=>e.label==='战吼'));
});
test('rejected actions are atomic and deterministic',()=>{const g=rig();const before=structuredClone(g.s);assert.throws(()=>act(g.s,0,{type:'play',card:'missing',position:0},1));assert.deepEqual(g.s,before);assert.deepEqual(createGame([basicDeck(),basicDeck()],42,0),createGame([basicDeck(),basicDeck()],42,0));});
test('combat is simultaneous; shield and poison need actual damage',()=>{const g=rig(),a=g.summon(0,'CS2_172'),b=g.summon(1,'CS2_172');g.q=[];a.born=0;const n=act(g.s,0,{type:'attack',from:a.uid,target:b.uid},1);assert.equal(n.players[0].board.length,0);assert.equal(n.players[1].board.length,0);
 const h=rig(),snake=h.summon(0,'EX1_170'),shield=h.summon(1,'EX1_020');h.q=[];snake.born=0;const z=act(h.s,0,{type:'attack',from:snake.uid,target:shield.uid},1);assert.equal(z.players[1].board.length,1);assert.ok(!z.players[1].board[0].keys.includes('shield'));});
test('presentation trace preserves impact, death and deathrattle order without hidden cards',()=>{
 const g=rig(),a=g.summon(0,'CS2_172'),b=g.summon(1,'EX1_556');a.born=0;g.q=[];g.p(1).hand=[{id:'EX1_298',uid:'secret-hand'}];
 const n=act(g.s,0,{type:'attack',from:a.uid,target:b.uid},1);assert.deepEqual(n.visual.map(e=>e.type),['attack','death','summon']);assert.equal(n.visual[0].from,a.uid);assert.equal(n.visual[0].fallen,true);assert.equal(n.visual[0].players[0].board[0].health,0);assert.equal(n.visual[1].players[0].board.length,0);assert.equal(n.visual[2].players[1].board[0].id,'skele21');
 const visible=view(n,0);assert.ok(!JSON.stringify(visible.visual).includes('secret-hand'));assert.ok(visible.visual.every(e=>e.players.every(p=>!('hand' in p)&&!('deck' in p))));
 const next=act(n,0,{type:'end'},2);assert.equal(next.visualId,n.visualId+1);assert.ok(!next.visual.some(e=>e.type==='attack'));
 const h=rig(),target=h.summon(1,'EX1_029');h.q=[];const z=play(h,'CS2_189',target.uid);assert.deepEqual(z.visual.map(e=>e.type),['summon','damage','death','damage']);assert.equal(z.visual[1].from,z.players[0].board[0].uid);assert.equal(z.visual[3].from,target.uid);
});
test('deathrattle summons and loot draw on lethal damage',()=>{const g=rig(),m=g.summon(0,'EX1_556');g.q=[];g.damage([[m.uid,3]]);g.flush();assert.equal(g.p(0).board[0].id,'skele21');const h=rig(),a=h.summon(0,'EX1_007');h.q=[];h.damage([[a.uid,4]]);h.flush();assert.equal(h.p(0).hand.length,1);assert.equal(h.p(0).board.length,0);});
test('tribal aura, silence, copy and fatigue draw',()=>{const g=rig(),a=g.summon(0,'EX1_507'),b=g.summon(1,'EX1_506a');g.q=[];assert.equal(g.attack(b),3);g.silence(a.uid);assert.equal(g.attack(b),1);g.buff(b.uid,2,2);const n=play(g,'EX1_564',b.uid);assert.equal(new Game(n).attack(n.players[0].board[0]),3);
 const h=rig();h.p(0).deck=[];h.draw(0,2);assert.equal(h.p(0).hp,27);assert.equal(h.p(0).fatigue,2);});
test('hand cap, full board and return do not fire deathrattle',()=>{const g=rig();g.draw(0,13);assert.equal(g.p(0).hand.length,12);const m=g.summon(0,'EX1_556');g.q=[];g.bounce(m.uid);assert.equal(g.p(0).board.length,0);assert.equal(g.p(0).hand.length,12);
 const h=rig();for(let i=0;i<7;i++)h.summon(0,'CS2_231');assert.throws(()=>play(h,'CS2_120'),/七个/);});
test('mana discounts and expiring temporary attack',()=>{const g=rig();g.summon(0,'EX1_076');g.q=[];assert.equal(g.cost(0,{id:'CS2_171'}),0);const b=g.summon(0,'CS2_120');g.q=[];g.buff(b.uid,2,0,[],true);assert.equal(g.attack(b),4);g.end(10);assert.equal(g.attack(b),2);});
test('simultaneous deathrattles preserve placement around surviving anchors',()=>{const g=rig();const a=g.summon(0,'EX1_534'),b=g.summon(0,'EX1_110');g.summon(0,'CS2_200');g.q=[];g.damage([[a.uid,9],[b.uid,9]]);g.flush();assert.deepEqual(g.p(0).board.map(m=>m.id),['EX1_534t','EX1_534t','EX1_110t','CS2_200']);assert.equal(CARDS.EX1_110t.cost,4);});
test('freeze, choice forms, healing triggers and transformation preserve their specific behavior',()=>{const g=rig(),m=g.summon(0,'CS2_120');g.q=[];m.born=0;g.freeze(m);assert.equal(g.ready(m),false);g.end(2);assert.equal(m.frozen,0);
 const h=rig(),priest=h.summon(0,'CS2_235'),hurt=h.summon(0,'CS2_120');h.q=[];hurt.damage=1;h.heal(hurt.uid,2);h.flush();assert.equal(h.p(0).hand.length,1);h.heal(hurt.uid,2);h.flush();assert.equal(h.p(0).hand.length,1);
 const n=play(rig(),'EX1_165',null,1),ng=new Game(n),d=n.players[0].board[0];assert.equal(ng.health(d),6);ng.silence(d.uid);assert.equal(ng.health(d),6);assert.equal(ng.has(d,'taunt'),false);});
test('repeat freeze does not add another turn; death observers use source entry order',()=>{
 const g=rig(),m=g.summon(0,'CS2_120');g.q=[];m.born=0;g.freeze(m);g.freeze(m);assert.equal(m.frozen,10);g.end(2);assert.equal(m.frozen,0);
 const h=rig();h.summon(0,'EX1_595');h.summon(1,'EX1_595');const b=h.summon(1,'CS2_231'),a=h.summon(0,'CS2_231');h.q=[];h.p(0).hp=h.p(1).hp=1;h.p(0).deck=[];h.p(1).deck=[];h.damage([[a.uid,1],[b.uid,1]]);h.flush();assert.equal(h.s.winner,1);
});
test('simultaneous hero deaths are draw; timer advances only once',()=>{const g=rig();g.p(0).hp=2;g.p(1).hp=2;g.damage([['h0',2],['h1',2]]);g.flush();assert.equal(g.s.phase,'finished');assert.equal(g.s.winner,null);const h=rig();h.s.deadline=10;const n=timeout(h.s,11);assert.equal(n.active,1);assert.deepEqual(timeout(n,11),n);});
test('each of 100 cards executes all choices without a missing handler or corrupt board',()=>{for(const c of POOL)for(let choice=0;choice<(c.choices?.length||1);choice++){
 const g=rig();g.summon(0,'CS2_120');g.summon(0,'EX1_008');for(let i=0;i<4;i++)g.summon(1,i===0?'EX1_506a':'CS2_200');g.q=[];
 const h={id:c.id,uid:'hand'};g.p(0).hand=[h];const ts=g.targets(0,h,choice);let n;assert.doesNotThrow(()=>{n=act(g.s,0,{type:'play',card:'hand',position:1,choice,target:ts[0]},1);},c.name);
 assert.ok(n.players.every(p=>p.board.length<=7&&p.hand.length<=12),c.name);assert.ok(n.players.flatMap(p=>p.board).every(m=>Number.isFinite(new Game(n).health(m))),c.name);
}});
test('both AI difficulties complete games without hidden hands in view',()=>{for(const difficulty of ['easy','normal']){let s=createGame([basicDeck(),basicDeck()],39,0),now=1;for(let i=0;i<2;i++)s=act(s,i,{type:'mulligan',cards:[]},now);for(let step=0;step<1800&&s.phase!=='finished';step++){const a=chooseAction(s,s.active,difficulty,now);assert.ok(a);s=act(s,s.active,a,now);now++;}assert.equal(s.phase,'finished',difficulty);assert.equal(view(s,0).players[1].hand.length,0);}});
