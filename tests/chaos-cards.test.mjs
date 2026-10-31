import test from 'node:test';
import assert from 'node:assert/strict';
import { POOL, CARDS } from '../assets/js/game/chaos-cards/cards.mjs';
import { Game, createGame, act, validateDeck, legalActions, timeout, view } from '../assets/js/game/chaos-cards/engine.mjs';
import { basicDeck, chooseAction } from '../assets/js/game/chaos-cards/ai.mjs';
import {boardEffects,combatHints} from '../assets/js/game/chaos-cards/presentation.mjs';
const path='../assets/js/game/chaos-cards/';
function rig(){const s=createGame([basicDeck(),basicDeck()],123,0);s.phase='playing';s.active=0;s.turn=10;s.deadline=1e9;for(const p of s.players){p.hand=[];p.board=[];p.deck=basicDeck();p.mana=10;p.maxMana=10;p.mulligan=true;}return new Game(s);}
const play=(g,id,target,choice=0)=>{const c={id,uid:'e'+g.s.next++};g.p(0).hand.push(c);return act(g.s,0,{type:'play',card:c.uid,position:0,target,choice},1);};
test('catalog and global copy limit',()=>{assert.equal(POOL.length,197);assert.equal(Object.keys(CARDS).length,222);assert.ok(POOL.every(c=>c.themes.length));assert.throws(()=>validateDeck(Array(30).fill('CS2_120')),/两张/);assert.equal(validateDeck(basicDeck()),true);});
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
test('each card executes all choices without a missing handler or corrupt board',()=>{for(const c of POOL)for(let choice=0;choice<(c.choices?.length||1);choice++){
 const g=rig();g.summon(0,'CS2_120');g.summon(0,'EX1_008');for(let i=0;i<4;i++)g.summon(1,i===0?'EX1_506a':'CS2_200');g.q=[];
 const h={id:c.id,uid:'hand'};g.p(0).hand=[h];const ts=g.targets(0,h,choice);let n;assert.doesNotThrow(()=>{n=act(g.s,0,{type:'play',card:'hand',position:1,choice,target:ts[0]},1);},c.name);
 assert.ok(n.players.every(p=>p.board.length<=7&&p.hand.length<=12),c.name);assert.ok(n.players.flatMap(p=>p.board).every(m=>Number.isFinite(new Game(n).health(m))),c.name);
}});
test('both AI difficulties complete games without hidden hands in view',()=>{for(const difficulty of ['easy','normal']){let s=createGame([basicDeck(),basicDeck()],39,0),now=1;for(let i=0;i<2;i++)s=act(s,i,{type:'mulligan',cards:[]},now);for(let step=0;step<1800&&s.phase!=='finished';step++){const a=chooseAction(s,s.active,difficulty,now);assert.ok(a);s=act(s,s.active,a,now);now++;}assert.equal(s.phase,'finished',difficulty);assert.equal(view(s,0).players[1].hand.length,0);}});

test('expansion preserves original numbers and requested edits',()=>{
  for(const id of ['TY_002','TY_008','TY_045'])assert.ok(!CARDS[id]);
  for(const [id,a,h] of [['TY_068',3,2],['TY_060',2,2],['TY_063',4,3],['TY_100',1,1]])assert.deepEqual([CARDS[id].attack,CARDS[id].health],[a,h]);
  assert.ok(!CARDS.TY_027.text.includes('如果弃掉的是随从牌'));
  const g=rig(),m=g.summon(0,'TY_073');g.q=[];g.kill(m.uid);g.flush();assert.equal(g.p(0).hp,24);assert.equal(g.p(0).board.filter(x=>x.id==='TY_demon44').length,2);
  const h=rig(),n=h.summon(0,'TY_027');h.q=[];h.battlecry(n);h.flush();assert.ok(h.p(0).board.some(x=>x.id==='TY_demon33'));
});
test('shield events include combat, damage and Blood Knight; grants exclude existing shields',()=>{
  for(const id of ['TY_065','TY_096']){
    const g=rig(),m=g.summon(0,id);for(let i=0;i<4;i++)g.summon(0,'CS2_120');g.q=[];g.battlecry(m);g.flush();
    assert.equal(g.p(0).board.filter(x=>x.uid!==m.uid&&g.has(x,'shield')).length,2,id);
    if(id==='TY_065')assert.equal(g.attack(m),7);
  }
  const g=rig(),prayer=g.summon(0,'TY_012'),sun=g.summon(0,'TY_037'),judge=g.summon(0,'TY_044');g.p(0).hp=20;g.q=[];
  g.damage([[sun.uid,1]]);g.flush();assert.equal(g.attack(sun),4);assert.equal(g.health(sun),5);assert.equal(g.p(0).hp,23);assert.equal(g.p(1).hp,28);
  g.buff(sun.uid,0,0,['shield']);const blood=g.summon(0,'EX1_590');g.q=[];g.battlecry(blood);g.flush();assert.equal(g.attack(blood),6);assert.equal(g.p(0).hp,26);assert.equal(g.p(1).hp,26);
  const h=rig(),a=h.summon(0,'CS2_120'),shield=h.summon(1,'EX1_008'),enemyJudge=h.summon(1,'TY_044');a.born=0;h.q=[];
  const s=act(h.s,0,{type:'attack',from:a.uid,target:shield.uid},1);assert.equal(s.shieldsBroken,1);assert.equal(s.players[0].hp,28);
  const j=rig(),rearm=j.summon(0,'TY_023'),b=j.summon(0,'EX1_008');j.q=[];j.damage([[b.uid,1]]);j.flush();assert.ok(j.has(b,'shield'));assert.ok(!j.has(rearm,'shield'));
  const k=rig(),enemyShield=k.summon(1,'EX1_008');k.q=[];const result=play(k,'TY_086');assert.ok(new Game(result).has(result.players[0].board[0],'shield'));
});
test('active deathrattles preserve their source and respect board capacity and silence',()=>{
  const g=rig(),lion=g.summon(0,'EX1_534');g.q=[];const s=play(g,'TY_060',lion.uid);assert.ok(s.players[0].board.some(x=>x.uid===lion.uid));assert.equal(s.players[0].board.filter(x=>x.id==='EX1_534t').length,4);
  const h=rig(),loot=h.summon(0,'EX1_096');h.q=[];const n=play(h,'TY_030',loot.uid);assert.equal(n.players[0].hand.length,1);assert.ok(n.players[0].board.some(x=>x.uid===loot.uid));
  h.silence(loot.uid);assert.deepEqual(h.targets(0,{id:'TY_060',uid:'hand'}),[]);
});
test('resurrection uses friendly printed forms, death order and explicit battlecry policy',()=>{
  const g=rig(),scout=g.summon(0,'EX1_506'),seer=g.summon(0,'TY_013');g.buff(scout.uid,5,5);g.q=[];g.kill(scout.uid);g.kill(seer.uid);g.flush();
  assert.deepEqual(g.p(0).graveyard.map(x=>x.id),['EX1_506','TY_013']);
  let s=play(g,'TY_066');let ng=new Game(s);assert.equal(s.players[0].board.length,3);assert.equal(ng.attack(s.players[0].board.find(x=>x.id==='EX1_506')),2);assert.ok(!s.players[0].board.some(x=>x.id==='EX1_506a'));
  const h=rig(),a=h.summon(0,'EX1_506'),b=h.summon(0,'TY_013');h.q=[];h.kill(a.uid);h.kill(b.uid);h.flush();s=play(h,'TY_088');ng=new Game(s);assert.deepEqual(s.players[0].board.map(x=>x.id),['TY_088','EX1_506','EX1_506a','TY_013']);assert.equal(ng.max(s.players[0].board[0]),8);
  const j=rig(),beast=j.summon(0,'CS2_120');j.q=[];j.kill(beast.uid);j.flush();s=play(j,'TY_098');ng=new Game(s);assert.ok(ng.ready(s.players[0].board.find(x=>x.id==='CS2_120')));
  const k=rig(),loot=k.summon(0,'EX1_096');k.q=[];k.kill(loot.uid);k.flush();s=play(k,'TY_093');assert.equal(s.players[0].hand.length,2);assert.ok(s.players[0].board.some(x=>x.id==='EX1_096'));
});
test('ancestral beast mother excludes her own identity but allows a separate namesake',()=>{
  const solo=rig(),mother=solo.summon(0,'TY_091');solo.q=[];
  solo.kill(mother.uid);solo.flush();assert.equal(solo.p(0).board.length,0);
  const g=rig();
  // A separate mother from a legacy snapshot is still a valid target.
  g.p(0).graveyard=[{id:'TY_091',order:0}];
  const a=g.summon(0,'TY_091'),beast=g.summon(0,'CS2_120'),enemy=g.summon(1,'EX1_028');g.q=[];
  g.damage([[a.uid,100],[beast.uid,100],[enemy.uid,100]]);g.flush();
  assert.deepEqual(g.p(0).board.map(m=>m.id).sort(),['CS2_120','TY_091']);
  assert.ok(g.p(0).board.every(m=>g.has(m,'taunt')));
  assert.equal(g.p(0).board.find(m=>m.id==='TY_091').resurrectionOrigin,0);
  assert.match(CARDS.TY_091.text,/自身除外/);
});

test('resurrected mothers exclude all their prior deaths after snapshot restore',()=>{
  const h=rig();h.p(0).graveyard=[{id:'TY_091',order:0}];
  const s=play(h,'TY_098'),ng=new Game(JSON.parse(JSON.stringify(s))),revived=ng.p(0).board.find(m=>m.id==='TY_091');
  assert.ok(revived);assert.equal(revived.resurrectionOrigin,0);
  // Repeated deaths and returning to hand must not reset her identity.
  ng.bounce(revived.uid);ng.q=[];ng.p(0).mana=10;
  const replay=act(ng.s,0,{type:'play',card:revived.uid,position:0},2),again=new Game(replay),m=again.find(revived.uid);
  assert.equal(m.resurrectionOrigin,0);again.kill(m.uid);again.flush();assert.ok(!again.p(0).board.some(m=>m.id==='TY_091'));
  const raiser=again.summon(0,'TY_098');again.q=[];again.battlecry(raiser);again.flush();
  const mothers=again.p(0).board.filter(m=>m.id==='TY_091');assert.equal(mothers.length,2);
  for(const x of mothers)again.kill(x.uid);again.flush();assert.ok(!again.p(0).board.some(m=>m.id==='TY_091'));
  const original=again.summon(0,'TY_091'),copy=again.summon(0,'EX1_564');again.copy(copy.uid,original.uid);
  assert.notEqual(copy.resurrectionOrigin,original.resurrectionOrigin);
  const snapshotCopy=again.summon(0,'EX1_564');again.copySnapshot(snapshotCopy,original);
  assert.notEqual(snapshotCopy.resurrectionOrigin,original.resurrectionOrigin);
});

test('actual healing feeds legacy and expansion observers and cumulative finishers',()=>{
  const g=rig(),priest=g.summon(0,'CS2_235'),trainer=g.summon(0,'TY_028'),spring=g.summon(0,'TY_049'),redeemer=g.summon(0,'TY_071'),target=g.summon(0,'CS2_120');g.q=[];
  target.damage=2;assert.equal(g.heal(target.uid,9),2);g.flush();assert.equal(g.p(0).healed,2);assert.equal(g.p(0).hand.length,1);assert.equal(g.attack(trainer),3);assert.equal(g.max(target),4);assert.ok(g.has(target,'shield'));assert.equal(g.heal(target.uid,1),0);
  g.p(0).hp=20;g.heal('h0',10);g.flush();const finisher=g.summon(0,'TY_097');g.q=[];g.battlecry(finisher);g.flush();assert.equal(g.p(1).hp,26);assert.equal(g.p(0).healed,12);
});
test('temporary windfury expires while persistent grants and taunt auras follow their source',()=>{
  const g=rig(),m=g.summon(0,'CS2_120'),permanent=g.summon(0,'CS2_169');g.q=[];g.buff(m.uid,0,0,['windfury'],true);g.buff(permanent.uid,0,0,['windfury'],true);g.end(1);assert.ok(!g.has(m,'windfury'));assert.ok(g.has(permanent,'windfury'));
  const h=rig(),left=h.summon(0,'CS2_120'),chief=h.summon(0,'TY_053'),bastion=h.summon(0,'TY_061');h.q=[];h.recalc();assert.ok(h.has(left,'taunt'));assert.equal(h.attack(left),3);assert.equal(h.attack(bastion),7);
  h.silence(chief.uid);assert.ok(!h.has(left,'taunt'));assert.equal(h.attack(bastion),4);assert.equal(h.attack(left),2);
  const j=rig(),beast=j.summon(0,'CS2_120');j.q=[];j.p(0).deck=['CS2_120','CS2_200'];const keeper=j.summon(0,'TY_069');j.q=[];j.end(1);assert.equal(j.p(0).hand.length,1);assert.equal(j.cost(0,j.p(0).hand[0]),0);
});
test('attack triggers distinguish combat kills, survival and first minion counterattack',()=>{
  const g=rig(),raider=g.summon(0,'TY_021'),victim=g.summon(1,'CS2_172');g.q=[];raider.born=0;let s=act(g.s,0,{type:'attack',from:raider.uid,target:victim.uid},1);assert.equal(s.players[0].hand.length,1);assert.ok(!s.players[0].board.length);
  const k=rig(),twice=k.summon(0,'TY_021'),one=k.summon(1,'CS2_231'),two=k.summon(1,'EX1_015');k.q=[];twice.born=0;s=act(k.s,0,{type:'attack',from:twice.uid,target:one.uid},1);s=act(s,0,{type:'attack',from:twice.uid,target:two.uid},2);assert.equal(s.players[0].hand.length,1);assert.equal(s.players[0].board.length,0);
  const h=rig(),stalker=h.summon(0,'TY_048'),small=h.summon(1,'EX1_008');h.q=[];stalker.born=0;s=act(h.s,0,{type:'attack',from:stalker.uid,target:small.uid},1);assert.ok(!new Game(s).has(s.players[0].board[0],'stealth'));
  const j=rig(),duelist=j.summon(0,'TY_076'),enemy=j.summon(1,'CS2_200');j.q=[];duelist.born=0;s=act(j.s,0,{type:'attack',from:duelist.uid,target:enemy.uid},1);assert.equal(new Game(s).health(s.players[0].board[0]),7);assert.equal(s.players[0].board[0].attacks,1);
});
test('mass freeze, attack-health swap and highest-attack copies use current board state',()=>{
  const g=rig(),frozen=g.summon(1,'CS2_200'),fresh=g.summon(1,'CS2_200');g.freeze(frozen);g.q=[];let s=play(g,'TY_063');let ng=new Game(s);assert.equal(ng.health(s.players[1].board[0]),4);assert.equal(ng.health(s.players[1].board[1]),7);assert.ok(s.players[1].board.every(x=>x.frozen));
  const h=rig(),high=h.summon(1,'TY_061'),low=h.summon(1,'CS2_120');h.q=[];s=play(h,'TY_095');ng=new Game(s);assert.equal(ng.attack(s.players[1].board[0]),9);assert.equal(ng.health(s.players[1].board[0]),2);assert.ok(!ng.find(low.uid));
  const j=rig(),large=j.summon(1,'CS2_200'),shield=j.summon(1,'EX1_008');j.buff(shield.uid,8,0);j.q=[];s=play(j,'TY_100');ng=new Game(s);assert.equal(s.players[1].board.length,0);assert.deepEqual(s.players[0].board.map(x=>x.id),['TY_100','EX1_008','CS2_200']);assert.equal(ng.attack(s.players[0].board[1]),9);assert.ok(ng.has(s.players[0].board[1],'shield'));assert.ok(!s.players[0].board[1].dead);
});

test('crazy rules allow the eighth slot for plays, summons, fills, resurrection and control',()=>{
  const g=rig();g.s.mode='crazy';for(let i=0;i<7;i++)g.summon(0,'CS2_231');g.q=[];
  g.p(0).hand=[{id:'CS2_120',uid:'eighth'}];assert.ok(view(g.s,0).options.plays.eighth);
  let s=act(g.s,0,{type:'play',card:'eighth',position:7},1);assert.equal(s.players[0].board.length,8);assert.equal(new Game(s).summon(0,'CS2_231'),null);
  const h=rig();h.s.mode='crazy';s=play(h,'EX1_562');assert.equal(s.players[0].board.length,8);
  const j=rig();j.s.mode='crazy';for(let i=0;i<7;i++)j.summon(0,'CS2_231');const enemy=j.summon(1,'CS2_120');j.q=[];j.steal(enemy.uid,0);assert.equal(j.p(0).board.length,8);assert.equal(j.p(1).board.length,0);
  const k=rig();k.s.mode='crazy';k.p(0).graveyard=Array.from({length:7},(_,order)=>({id:'EX1_506a',order}));s=play(k,'TY_088');assert.equal(s.players[0].board.length,8);
  const normal=rig();for(let i=0;i<7;i++)normal.summon(0,'CS2_231');assert.equal(normal.summon(0,'CS2_120'),null);
});
test('crazy turns draw two cards including the opening turn and stop at twelve mana',()=>{
  let s=createGame([basicDeck(),basicDeck()],91,0,'crazy'),owner=s.active;
  const opening=s.players[owner].hand.length;s=act(s,0,{type:'mulligan',cards:[]},1);s=act(s,1,{type:'mulligan',cards:[]},1);
  assert.equal(s.players[owner].hand.length,opening+2);assert.deepEqual(view(s,owner).rules,{boardLimit:8,manaLimit:12,drawPerTurn:2});
  const g=rig();g.s.mode='crazy';g.s.active=1;g.p(0).maxMana=11;g.p(0).hand=[];g.end(1);assert.equal(g.p(0).mana,12);assert.equal(g.p(0).maxMana,12);assert.equal(g.p(0).hand.length,2);
  g.s.active=1;g.end(2);assert.equal(g.p(0).maxMana,12);
  const h=rig();h.s.active=1;h.p(0).hand=[];h.end(1);assert.equal(h.p(0).maxMana,10);assert.equal(h.p(0).hand.length,1);
  const k=rig();k.s.mode='crazy';k.p(0).hand=[];k.p(0).deck=[];k.s.active=1;k.end(1);assert.equal(k.p(0).fatigue,2);assert.equal(k.p(0).hp,27);
});

test('assist seat gets one extra mana, one extra draw and +1/+1 summons in every mode',()=>{
  const decks=[basicDeck(),basicDeck()];
  assert.deepEqual(createGame(decks,7,0,'free',{assist:[true,false]}).assist,[true,false]);
  assert.deepEqual(createGame(decks,7,0,'free').assist,[false,false]);
  const g=rig();g.s.assist=[true,false];g.s.active=1;g.p(0).maxMana=0;g.p(0).mana=0;g.p(0).hand=[];g.p(0).deck=[...decks[0]];
  g.end(1);
  assert.equal(g.p(0).maxMana,2);assert.equal(g.p(0).mana,2);assert.equal(g.p(0).hand.length,2);
  g.s.active=1;g.end(2);
  assert.equal(g.p(0).maxMana,3);assert.equal(g.p(0).hand.length,4);
  const beast=g.summon(0,'CS2_120'),other=g.summon(1,'CS2_120'),token=g.summon(0,'skele21');
  assert.deepEqual([g.attack(beast),g.max(beast)],[3,4]);
  assert.deepEqual([g.attack(other),g.max(other)],[2,3]);
  assert.deepEqual([g.attack(token),g.max(token)],[3,2]);
  const cap=rig();cap.s.assist=[true,false];cap.s.active=1;cap.p(0).maxMana=10;cap.p(0).hand=[];cap.end(1);
  assert.equal(cap.p(0).maxMana,11);
  const plain=rig();plain.s.active=1;plain.p(0).maxMana=10;plain.p(0).hand=[];plain.end(1);
  assert.equal(plain.p(0).maxMana,10);assert.equal(plain.p(0).hand.length,1);
  const crazy=rig();crazy.s.mode='crazy';crazy.s.assist=[true,false];crazy.s.active=1;crazy.p(0).maxMana=12;crazy.p(0).hand=[];
  crazy.end(1);assert.equal(crazy.p(0).maxMana,13);assert.equal(crazy.p(0).hand.length,3);
});
