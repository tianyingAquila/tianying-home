import { CARDS, VERSION } from './cards.mjs';
import { battle, death, onEvent, phaseEffect } from './effects.mjs';

export const TURN_MS = 180000;
export function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 30) throw Error('卡组必须为30张');
  const counts = {};
  for (const id of deck) {
    if (!CARDS[id] || CARDS[id].token) throw Error('卡组包含不可构筑的牌');
    if ((counts[id] = (counts[id] || 0) + 1) > 2) throw Error('同一种牌最多两张');
  }
  return true;
}
export class Game {
  constructor(s) { this.s = s; this.q = []; this.steps = 0; }
  random(n) {
    let x = this.s.rng >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s.rng = x >>> 0; return Math.floor((this.s.rng / 4294967296) * n);
  }
  pick(a) { return a.length ? a[this.random(a.length)] : null; }
  shuffle(a) { for (let i=a.length-1;i>0;i--) { const j=this.random(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  p(i) { return this.s.players[i]; }
  all() { return this.s.players.flatMap(p => p.board).sort((a,b)=>a.order-b.order); }
  find(uid) { return this.all().find(m=>m.uid===uid) || this.s.players.find(p=>p.uid===uid); }
  card(m) { return CARDS[m.id]; }
  log(text) { this.s.events.push(text); if(this.s.events.length>30)this.s.events.shift(); }
  withSource(m,fn) { const previous=this.source;this.source=m?.uid;try{return fn();}finally{this.source=previous;} }
  publicPlayers() { return this.s.players.map(p=>({uid:p.uid,hp:p.hp,mana:p.mana,maxMana:p.maxMana,fatigue:p.fatigue,deckCount:p.deck.length,handCount:p.hand.length,board:p.board.map(m=>({uid:m.uid,id:m.id,attack:this.attack(m),health:this.health(m),maxHealth:this.max(m),keys:[...m.keys,...(this.has(m,'windfury')&&!m.keys.includes('windfury')?['windfury']:[])],frozen:!!m.frozen,silenced:m.silenced,ready:this.s.active===m.owner&&this.ready(m)}))})); }
  visual(type,data={}) { this.s.visual??=[];if(this.s.visual.length<96)this.s.visual.push({type,from:this.source||null,...data,players:this.publicPlayers()}); }
  health(m) { return m.hero ? m.hp : this.max(m)-m.damage; }
  max(m) { return m.hero ? 30 : Math.max(0,m.baseH+m.buffH+m.auraH); }
  attack(m) {
    if(m.hero)return 0;
    const a=m.baseA+m.buffA+m.auraA;
    if(!m.silenced && m.id==='EX1_335')return Math.max(0,this.health(m));
    return Math.max(0,a+(!m.silenced&&m.id==='EX1_412'&&m.damage>0?1:0));
  }
  has(m,k) { return !m.hero && (m.keys.includes(k) || (k==='windfury'&&!m.silenced&&m.id==='EX1_412'&&m.damage>0)); }
  ready(m) { return !m.hero && this.attack(m)>0 && !this.has(m,'cantAttack') && !m.frozen && (m.born<this.s.turn||this.has(m,'charge')) && m.attacks<(this.has(m,'windfury')?2:1); }
  recalc() {
    const all=this.all(), live=all.filter(m=>this.health(m)>0&&!m.dead&&!m.silenced);
    const extras=new Map(all.map(m=>[m.uid,[0,0]]));
    for(const a of live)for(const m of all) {
      if(a.uid===m.uid)continue;
      const same=a.owner===m.owner, tribe=this.card(m).tribe;
      const adjacent=same&&Math.abs(this.p(a.owner).board.indexOf(a)-this.p(m.owner).board.indexOf(m))===1;
      const e=extras.get(m.uid);
      if(a.id==='DS1_175'&&same&&tribe==='BEAST')e[0]++;
      if(a.id==='EX1_508'&&tribe==='MURLOC')e[0]++;
      if(a.id==='EX1_507'&&tribe==='MURLOC'){e[0]+=2;e[1]++;}
      if(a.id==='EX1_162'&&adjacent)e[0]++;
      if(a.id==='CS2_122'&&same)e[0]++;
      if(a.id==='CS2_222'&&same){e[0]++;e[1]++;}
    }
    for(const m of all)[m.auraA,m.auraH]=extras.get(m.uid);
  }
  observers(event,data,list=this.all()) {
    return list.filter(m=>!m.silenced).map(m=>{const copy=structuredClone(m);return ()=>this.withSource(copy,()=>onEvent(this,copy,event,data));});
  }
  emit(event,data,list) { this.q.push(...this.observers(event,data,list)); }
  winner() {
    const dead=this.s.players.map(p=>p.hp<=0);
    if(dead.some(Boolean)){this.s.phase='finished';this.s.winner=dead.every(Boolean)?null:(dead[0]?1:0);this.s.reason='生命耗尽';this.q=[];this.log(this.s.winner===null?'平局':`玩家${this.s.winner+1}获胜`);return true;}return false;
  }
  settle() {
    const jobs=[];
    for(let pass=0;pass<40;pass++) {
      this.recalc(); const dead=this.all().filter(m=>m.dead||this.health(m)<=0);
      if(!dead.length)break;
      const deadIds=new Set(dead.map(m=>m.uid));
      for(const m of dead){const row=this.p(m.owner).board;m.slot=row.indexOf(m);m.anchor=row.slice(m.slot+1).find(x=>!deadIds.has(x.uid))?.uid||null;this.log(`${this.card(m).name}离场`);}
      for(const p of this.s.players)p.board=p.board.filter(m=>!deadIds.has(m.uid));
      this.recalc();this.visual('death',{targets:dead.map(m=>m.uid)});
      const survivors=this.all();
      for(const observer of survivors)for(const m of dead)jobs.push(...this.observers('death',structuredClone(m),[observer]));
      for(const m of dead)if(!m.silenced)jobs.push(()=>this.withSource(m,()=>death(this,m)));
    }
    return jobs;
  }
  flush() {
    this.q.unshift(...this.settle());
    while(this.q.length&&this.s.phase!=='finished') {
      if(++this.steps>3000)throw Error('效果结算超出限制，本次操作未提交');
      this.q.shift()(); this.q.unshift(...this.settle());
      if(this.winner())break;
    }
    this.recalc(); this.winner();
  }
  damage(hits,source=null) {
    if(this.s.phase==='finished')return;
    const before=this.all().map(m=>structuredClone(m)), jobs=[],changes=[];
    for(const [uid,n] of hits) {
      const m=this.find(uid); if(!m||n<=0||(!m.hero&&m.dead))continue;
      if(this.has(m,'shield')) {m.keys=m.keys.filter(k=>k!=='shield');this.log('圣盾抵挡伤害');changes.push({target:uid,shield:true,n:0});continue;}
      if(m.hero)m.hp-=n;else m.damage+=n;
      this.log(`${m.hero?'玩家'+(m.owner+1):this.card(m).name} -${n}`);
      changes.push({target:uid,n});
      jobs.push(...this.observers('damage',{target:structuredClone(m),n},before));
      if(source&&!source.hero&&!m.hero) {
        if(this.has(source,'poison'))m.dead=true;
        if(!source.silenced&&source.id==='CS2_033')this.freeze(m,false);
      }
    }
    if(changes.length)this.visual('damage',{from:source?.uid||this.source||null,hits:changes});
    const deaths=this.settle(); if(this.winner())return;
    this.q.unshift(...jobs,...deaths);
  }
  heal(uid,n) {
    const m=this.find(uid);if(!m)return;
    const actual=Math.min(n,this.max(m)-this.health(m));if(actual<=0)return;
    if(m.hero)m.hp+=actual;else m.damage-=actual;
    this.visual('heal',{target:uid,n:actual});
    this.log(`治疗 +${actual}`);this.emit('heal',{target:structuredClone(m),n:actual});
  }
  buff(uid,a=0,h=0,keys=[],temporary=false) {
    const m=this.find(uid);if(!m||m.hero)return;
    m.buffA+=a;m.buffH+=h;for(const k of keys)if(!m.keys.includes(k))m.keys.push(k);
    if(temporary)m.temps.push({a,h,turn:this.s.turn});this.recalc();
    this.visual('buff',{target:uid});
  }
  summon(owner,id,slot=this.p(owner).board.length,fromHand=null) {
    const p=this.p(owner);if(p.board.length>=7)return null;
    const c=CARDS[id], watchers=this.all().map(m=>structuredClone(m));
    const m={uid:fromHand?.uid||'e'+this.s.next++,id,owner,order:this.s.next++,baseA:c.attack,baseH:c.health,buffA:0,buffH:0,auraA:0,auraH:0,damage:0,keys:[...c.keywords],temps:[],born:this.s.turn,attacks:0,frozen:0,silenced:false};
    p.board.splice(Math.max(0,Math.min(slot,p.board.length)),0,m);this.recalc();
    this.visual('summon',{target:m.uid,owner});
    this.emit('summon',{target:structuredClone(m)},watchers);this.log(`召唤 ${c.name}`);return m;
  }
  draw(owner,n=1) {
    const p=this.p(owner);
    for(let i=0;i<n&&this.s.phase!=='finished';i++) {
      if(!p.deck.length){p.fatigue++;this.damage([[p.uid,p.fatigue]]);this.flush();continue;}
      const id=p.deck.shift(); if(p.hand.length<12)p.hand.push({id,uid:'e'+this.s.next++});else this.log(`手牌已满：${CARDS[id].name}被烧毁`);
      this.visual('draw',{owner,target:p.uid});
    }
  }
  kill(uid){const m=this.find(uid);if(m&&!m.hero){m.dead=true;this.visual('effect',{target:uid,label:'摧毁'});}}
  deathSlot(m){const row=this.p(m.owner).board;if(!m.anchor)return row.length;const i=row.findIndex(x=>x.uid===m.anchor);return i<0?Math.min(m.slot,row.length):i;}
  bounce(uid){const m=this.find(uid);if(!m||m.hero)return;const p=this.p(m.owner);p.board=p.board.filter(x=>x.uid!==uid);if(p.hand.length<12)p.hand.push({id:m.id,uid:m.uid});this.recalc();this.visual('bounce',{target:uid,owner:m.owner});}
  silence(uid){const m=this.find(uid);if(!m||m.hero)return;const hp=this.health(m),c=this.card(m);Object.assign(m,{silenced:true,baseA:c.attack,baseH:c.health,buffA:0,buffH:0,keys:[],temps:[]});this.recalc();m.damage=this.max(m)-Math.min(hp,this.max(m));this.visual('effect',{target:uid,label:'沉默'});}
  freeze(m,show=true){if(m.frozen&&m.frozen>=this.s.turn)return;m.frozen=this.s.turn+(m.owner===this.s.active&&this.ready(m)?0:(m.owner===this.s.active?2:1));if(show)this.visual('effect',{target:m.uid,label:'冻结'});}
  transform(uid,id){const m=this.find(uid);if(!m||m.hero)return;const c=CARDS[id];Object.assign(m,{id,baseA:c.attack,baseH:c.health,buffA:0,buffH:0,damage:0,keys:[...c.keywords],silenced:false,temps:[],frozen:0});this.recalc();this.visual('effect',{target:uid,label:'变形'});}
  steal(uid,owner){const m=this.find(uid);if(!m||m.hero||this.p(owner).board.length>=7)return;this.p(m.owner).board=this.p(m.owner).board.filter(x=>x.uid!==uid);m.owner=owner;m.born=this.s.turn;this.p(owner).board.push(m);this.recalc();this.visual('effect',{target:uid,label:'控制'});}
  copy(uid,target){const m=this.find(uid),t=this.find(target);if(!m||!t||t.hero)return;const keep={uid:m.uid,owner:m.owner,order:m.order,born:m.born,attacks:m.attacks};Object.assign(m,structuredClone(t),keep);const frozen=m.frozen;m.frozen=0;if(frozen)this.freeze(m,false);this.recalc();this.visual('effect',{target:uid,label:'复制'});}
  discard(owner,n){const h=this.p(owner).hand;for(let i=0;i<n&&h.length;i++)h.splice(this.random(h.length),1);}
  cost(owner,c) {
    let n=CARDS[c.id].cost;
    if(c.id==='EX1_586')n-=this.all().length;
    for(const m of this.all().filter(x=>!x.silenced)) {
      if(m.id==='EX1_616')n++;
      if(m.id==='EX1_076'&&m.owner===owner&&this.p(owner).played===0)n--;
    }
    return Math.max(0,n);
  }
  targets(owner,c,choice=0) {
    let kind=CARDS[c.id].target;
    if(kind==='choiceHeal')kind=choice===1?'character':'';
    if(!kind)return [];
    return [...this.all(),...this.s.players].filter(m=>{
      if(m.uid===c.uid)return false;
      if(!m.hero&&m.owner!==owner&&this.has(m,'stealth'))return false;
      if(kind==='hero')return m.hero;
      if(kind==='character')return true;
      if(m.hero)return false;
      if(kind==='friendly')return m.owner===owner;
      if(kind==='beast')return m.owner===owner&&this.card(m).tribe==='BEAST';
      if(kind==='big')return this.attack(m)>=7;
      return true;
    }).map(m=>m.uid);
  }
  start(now) {
    const p=this.p(this.s.active);this.s.turn++;p.maxMana=Math.min(10,p.maxMana+1);p.mana=p.maxMana;p.played=0;
    for(const m of p.board)m.attacks=0;
    const phase=this.all().filter(m=>m.owner===this.s.active&&!m.silenced).map(m=>structuredClone(m));
    for(const m of phase)this.q.push(()=>this.withSource(m,()=>phaseEffect(this,m,'start')));
    this.flush();if(this.s.phase==='finished')return;this.draw(this.s.active);this.flush();this.s.deadline=now+TURN_MS;
  }
  end(now){
    const phase=this.all().filter(m=>m.owner===this.s.active&&!m.silenced).map(m=>structuredClone(m));
    for(const m of phase)this.q.push(()=>this.withSource(m,()=>phaseEffect(this,m,'end')));this.flush();
    for(const m of this.all()){
      for(const t of m.temps){m.buffA-=t.a;m.buffH-=t.h;}m.temps=[];
      if(m.frozen&&m.frozen<=this.s.turn&&m.owner===this.s.active)m.frozen=0;
    }
    for(const p of this.s.players)if(p.frozen&&p.frozen<=this.s.turn&&p.owner===this.s.active)p.frozen=0;
    this.flush();if(this.s.phase==='finished')return;this.s.active=1-this.s.active;this.start(now);
  }
}
export function createGame(decks,seed=1,now=Date.now()) {
  decks.forEach(validateDeck);
  const s={version:VERSION,rng:(seed>>>0)||1,next:1,turn:0,active:0,phase:'mulligan',deadline:now+TURN_MS,events:[],winner:null,players:[0,1].map(owner=>({hero:true,uid:'h'+owner,owner,hp:30,deck:[...decks[owner]],hand:[],board:[],mana:0,maxMana:0,played:0,fatigue:0,mulligan:false}))};
  const g=new Game(s);s.active=g.random(2);
  for(let i=0;i<2;i++){g.shuffle(g.p(i).deck);g.draw(i,i===s.active?5:6);}
  return s;
}
export function act(state,owner,a,now=Date.now()) {
  const s=structuredClone(state),g=new Game(s),p=g.p(owner);
  s.visual=[];s.visualId=(state.visualId||0)+1;
  if(!p||s.phase==='finished')throw Error('对局已经结束');
  if(a.type==='concede'){s.phase='finished';s.winner=1-owner;s.reason='主动认输';return s;}
  if(s.phase==='mulligan'){
    if(a.type!=='mulligan'||p.mulligan)throw Error('等待双方换牌');
    const ids=a.cards||[];if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!p.hand.some(c=>c.uid===id)))throw Error('换牌选择无效');
    const out=p.hand.filter(c=>ids.includes(c.uid));p.hand=p.hand.filter(c=>!ids.includes(c.uid));g.draw(owner,out.length);p.deck.push(...out.map(c=>c.id));g.shuffle(p.deck);p.mulligan=true;
    if(s.players.every(x=>x.mulligan)){s.phase='playing';g.start(now);}return s;
  }
  if(s.phase!=='playing'||s.active!==owner)throw Error('现在不是你的回合');
  if(now>=s.deadline)throw Error('回合已超时，请等待同步');
  if(a.type==='end'){g.end(now);return s;}
  if(a.type==='play'){
    const c=p.hand.find(c=>c.uid===a.card);if(!c)throw Error('这张牌不在手牌中');
    const d=CARDS[c.id],choice=a.choice??0;
    if(!Number.isInteger(choice)||choice<0||choice>=(d.choices?.length||1))throw Error('抉择无效');
    const targets=g.targets(owner,c,choice);if(targets.length?!targets.includes(a.target):!!a.target)throw Error('请选择合法目标');
    const cost=g.cost(owner,c);if(cost>p.mana)throw Error('法力不足');if(p.board.length>=7)throw Error('场上最多七个随从');
    if(!Number.isInteger(a.position)||a.position<0||a.position>p.board.length)throw Error('放置位置无效');
    const observers=g.all().map(x=>structuredClone(x));p.hand=p.hand.filter(x=>x.uid!==c.uid);p.mana-=cost;p.played++;
    const m=g.summon(owner,c.id,a.position,c);g.withSource(m,()=>battle(g,m,a.target,choice));g.emit('play',{owner,id:c.id},observers);g.flush();return s;
  }
  if(a.type==='attack'){
    const m=g.find(a.from),t=g.find(a.target);
    if(!m||m.hero||m.owner!==owner||!g.ready(m)||!t||t.owner===owner||(!t.hero&&g.has(t,'stealth')))throw Error('不能进行这次攻击');
    const taunts=g.p(1-owner).board.filter(x=>g.has(x,'taunt')&&!g.has(x,'stealth'));if(taunts.length&&!taunts.includes(t))throw Error('必须先攻击嘲讽随从');
    const ma=g.attack(m),ta=g.attack(t);m.attacks++;m.keys=m.keys.filter(k=>k!=='stealth');
    // Both strikes apply before death; a defender's keywords still apply when it dies.
    const sourceM=structuredClone(m),sourceT=structuredClone(t);
    const before=g.all().map(x=>structuredClone(x)),jobs=[],hits=[];
    for(const [dest,n,source] of [[t,ma,sourceM],[m,ta,sourceT]]){
      if(n<=0)continue;if(g.has(dest,'shield')){dest.keys=dest.keys.filter(k=>k!=='shield');hits.push({target:dest.uid,n:0,shield:true});continue;}
      if(dest.hero)dest.hp-=n;else dest.damage+=n;
      hits.push({target:dest.uid,n});
      jobs.push(...g.observers('damage',{target:structuredClone(dest),n},before));
      if(!source.hero&&!dest.hero&&g.has(source,'poison'))dest.dead=true;
      if(!source.hero&&!source.silenced&&source.id==='CS2_033')g.freeze(dest,false);
    }
    g.visual('attack',{from:m.uid,target:t.uid,hits,fallen:!!m.dead||g.health(m)<=0});
    g.log(`${g.card(m).name}发动攻击`);const deaths=g.settle();if(!g.winner()){g.q.push(...jobs,...deaths);g.flush();}return s;
  }
  throw Error('未知操作');
}
export function timeout(state,now=Date.now()) {
  if(state.phase==='finished'||now<state.deadline)return state;
  let s=structuredClone(state);
  if(s.phase==='mulligan'){for(let i=0;i<2;i++)if(!s.players[i].mulligan)s=act(s,i,{type:'mulligan',cards:[]},now);}
  else if(s.phase==='playing'){s.visual=[];s.visualId=(state.visualId||0)+1;new Game(s).end(now);}
  return s;
}
export function view(s,owner) {
  const g=new Game(s);
  const options={plays:{},attacks:{}};
  if(s.phase==='playing'&&s.active===owner){
    if(g.p(owner).board.length<7)for(const c of g.p(owner).hand)if(g.cost(owner,c)<=g.p(owner).mana)options.plays[c.uid]=Array.from({length:CARDS[c.id].choices?.length||1},(_,choice)=>g.targets(owner,c,choice));
    const enemy=g.p(1-owner),taunts=enemy.board.filter(m=>g.has(m,'taunt')&&!g.has(m,'stealth'));
    const targets=(taunts.length?taunts:[enemy,...enemy.board.filter(m=>!g.has(m,'stealth'))]).map(m=>m.uid);
    for(const m of g.p(owner).board)if(g.ready(m))options.attacks[m.uid]=targets;
  }
  return {phase:s.phase,active:s.active,turn:s.turn,deadline:s.deadline,winner:s.winner,reason:s.reason,events:s.events,visualId:s.visualId||0,visual:s.visual||[],options,players:g.publicPlayers().map((p,i)=>({...p,mulligan:s.players[i].mulligan,hand:i===owner?s.players[i].hand.map(c=>({...c,cost:g.cost(i,c)})):[]}))};
}
export function legalActions(s,owner) {
  if(s.phase==='mulligan')return s.players[owner].mulligan?[]:[{type:'mulligan',cards:[]}];
  if(s.phase!=='playing'||s.active!==owner)return [];
  const g=new Game(s),p=g.p(owner),out=[];
  if(p.board.length<7)for(const c of p.hand)if(g.cost(owner,c)<=p.mana)for(let choice=0;choice<(CARDS[c.id].choices?.length||1);choice++){
    const ts=g.targets(owner,c,choice);for(const target of ts.length?ts:[null])for(let position=0;position<=p.board.length;position++)out.push({type:'play',card:c.uid,choice,target,position});
  }
  const enemy=g.p(1-owner),taunt=enemy.board.filter(m=>g.has(m,'taunt')&&!g.has(m,'stealth'));
  const targets=taunt.length?taunt:[enemy,...enemy.board.filter(m=>!g.has(m,'stealth'))];
  for(const m of p.board)if(g.ready(m))for(const t of targets)out.push({type:'attack',from:m.uid,target:t.uid});
  out.push({type:'end'});return out;
}
