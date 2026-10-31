import { CARDS } from './cards.mjs?v=20261025-fixes';

const row=(g,o)=>g.p(o).board;
const others=(g,m)=>row(g,m.owner).filter(x=>x.uid!==m.uid);
const tribe=(g,m,t)=>others(g,m).filter(x=>g.card(x).tribe===t);
const hurt=(g,o,heroes=false)=>[...row(g,o),...(heroes?[g.p(o)]:[])].filter(x=>g.health(x)<g.max(x));
const enemyHit=(g,m,n)=>{const t=g.pick([...row(g,1-m.owner),g.p(1-m.owner)]);if(t)g.damage([[t.uid,n]],m);};
function shields(g,m,n,includeSelf=false){let count=0;for(let i=0;i<n;i++){const t=g.pick((includeSelf?row(g,m.owner):others(g,m)).filter(x=>!g.has(x,'shield')));if(!t)break;g.buff(t.uid,0,0,['shield']);count++;}return count;}
function spawn(g,m,id,n,slot=row(g,m.owner).indexOf(m)+1){for(let i=0;i<n;i++)g.summon(m.owner,id,slot+i);}
function healAll(g,m,n){let sum=0,count=0;for(const x of hurt(g,m.owner,true)){const actual=g.heal(x.uid,n);sum+=actual;if(actual)count++;}return {sum,count};}
function drawBeast(g,o,fallback=false,discount=0){
  const p=g.p(o),indices=p.deck.flatMap((id,i)=>CARDS[id].tribe==='BEAST'?[i]:[]),index=g.pick(indices);
  if(index===null){if(fallback)g.draw(o);return;}
  const [id]=p.deck.splice(index,1);if(p.hand.length<12)p.hand.push({id,uid:'e'+g.s.next++,discount:-discount});else g.log(`手牌已满：${CARDS[id].name}被烧毁`);g.visual('draw',{owner:o,target:p.uid});
}
function resurrect(g,m,n,filter=()=>true,{ordered=false,battlecry=false,keys=[],trigger=false}={}){
  // Keep a resurrected unit's identity across deaths, including legacy snapshots.
  const origin=m.resurrectionOrigin??m.order;
  const entries=[...(g.p(m.owner).graveyard||[])].filter(x=>(x.resurrectionOrigin??x.order)!==origin&&filter(CARDS[x.id]));
  if(!ordered)g.shuffle(entries);
  let count=0;
  for(const entry of entries){
    if(count>=n||row(g,m.owner).length>=g.rules().boardLimit||g.s.phase==='finished')break;
    const x=g.summon(m.owner,entry.id);if(!x)break;count++;
    x.resurrectionOrigin=entry.resurrectionOrigin??entry.order;
    if(keys.length)g.buff(x.uid,0,0,keys);
    if(battlecry){const targets=g.targets(m.owner,{id:x.id,uid:x.uid});g.battlecry(x,g.pick(targets),0);}
    if(trigger)g.triggerDeath(x);
    g.flush();
  }
}
export function expansionBattle(g,m,target){
  const o=m.owner,t=g.find(target),adj=()=>{const b=row(g,o),i=b.indexOf(m);return [b[i-1],b[i+1]].filter(Boolean);};
  switch(m.id){
    case 'TY_001':{const injured=t&&!t.hero&&t.owner===o&&g.health(t)<g.max(t);g.heal(target,2);if(injured)g.buff(target,1,0,[],true);break;}
    case 'TY_003':if(tribe(g,m,'MURLOC').length)g.draw(o);break;
    case 'TY_005':g.buff(target,2,0,[],true);break;
    case 'TY_007':g.damage([['h'+o,2]],m);break;
    case 'TY_009':g.damage([[m.uid,2]],m);break;
    case 'TY_013':for(const x of tribe(g,m,'MURLOC'))g.buff(x.uid,0,1);break;
    case 'TY_018':g.damage([[target,1]],m);g.buff(target,2);break;
    case 'TY_022':for(const x of adj())g.buff(x.uid,2,0,[],true);break;
    case 'TY_024':if(t&&g.heal(target,g.max(t))>=3)g.draw(o);break;
    case 'TY_025':spawn(g,m,'TY_murloc11',tribe(g,m,'MURLOC').length?2:1);break;
    case 'TY_027':g.discard(o,1);spawn(g,m,'TY_demon33',1);break;
    case 'TY_029':for(const x of adj())g.buff(x.uid,0,1);break;
    case 'TY_030':if(t)g.triggerDeath(t);break;
    case 'TY_031':if(t){g.damage([[target,2]],m);if(!g.find(target))g.buff(m.uid,2);}break;
    case 'TY_033':for(const x of tribe(g,m,'MURLOC'))g.buff(x.uid,1,1);break;
    case 'TY_035':drawBeast(g,o,true);break;
    case 'TY_040':resurrect(g,m,1,c=>c.cost<=2);break;
    case 'TY_042':g.buff(target,1,0,['windfury'],true);break;
    case 'TY_043':g.buff(target,0,0,['shield']);break;
    case 'TY_046':g.draw(o,Math.min(3,Math.floor((g.p(o).graveyard||[]).filter(x=>CARDS[x.id].tribe==='MURLOC').length/2)));break;
    case 'TY_050':if(t){g.heal(target,g.max(t));g.buff(target,0,0,['taunt']);}break;
    case 'TY_051':g.damage([['h'+o,3]],m);break;
    case 'TY_054':g.damage(g.shuffle([...row(g,1-o)]).slice(0,2).map(x=>[x.uid,2]),m);break;
    case 'TY_055':shields(g,m,2);break;
    case 'TY_057':{const beasts=tribe(g,m,'BEAST');if(beasts.length)for(const x of beasts)g.buff(x.uid,2,2);else spawn(g,m,'TY_beast22',1);break;}
    case 'TY_059':{const cards=g.discard(o,1);if(cards.length&&CARDS[cards[0].id].cost>=5)spawn(g,m,'TY_demon55',1);break;}
    case 'TY_060':if(t){g.triggerDeath(t);g.flush();g.triggerDeath(t);}break;
    case 'TY_063':{const frozen=row(g,1-o).filter(x=>x.frozen),fresh=row(g,1-o).filter(x=>!x.frozen);for(const x of fresh)g.freeze(x);g.damage(frozen.map(x=>[x.uid,3]),m);break;}
    case 'TY_065':g.buff(m.uid,shields(g,m,2));break;
    case 'TY_066':resurrect(g,m,3,c=>c.tribe==='MURLOC');break;
    case 'TY_070':g.buff(m.uid,healAll(g,m,4).count);break;
    case 'TY_072':g.damage([['h'+o,5]],m);if(g.s.phase!=='finished')g.kill(target);break;
    case 'TY_074':resurrect(g,m,2,c=>c.cost<=4);break;
    case 'TY_075':for(const x of others(g,m).filter(x=>g.has(x,'taunt')))g.buff(x.uid,2,2);break;
    case 'TY_078':spawn(g,m,'TY_saint22',Math.min(3,Math.floor(healAll(g,m,Infinity).sum/5)));break;
    case 'TY_079':{const victims=row(g,1-o).filter(x=>g.attack(x)<=2);for(const x of victims)g.kill(x.uid);g.flush();spawn(g,m,'TY_murloc11',victims.length);break;}
    case 'TY_080':spawn(g,m,'TY_horn33taunt',tribe(g,m,'BEAST').length>=2?3:2);break;
    case 'TY_081':{const victims=g.all().filter(x=>g.has(x,'shield'));for(const x of victims)g.removeShield(x);g.flush();for(let i=0;i<victims.length&&g.s.phase!=='finished';i++){enemyHit(g,m,2);g.flush();}break;}
    case 'TY_082':spawn(g,m,'TY_demon55abyss',g.discard(o,2).length);break;
    case 'TY_084':{const count=g.s.players.reduce((n,p)=>n+(p.graveyard?.length||0),0);g.damage(g.all().filter(x=>x.uid!==m.uid).map(x=>[x.uid,2]),m);const dead=g.s.players.reduce((n,p)=>n+(p.graveyard?.length||0),0)-count;g.heal('h'+o,dead*2);break;}
    case 'TY_085':for(const x of others(g,m))if(g.has(x,'windfury'))g.buff(x.uid,2,0,[],true);else g.buff(x.uid,0,0,['windfury'],true);break;
    case 'TY_086':{const before=g.s.shieldsBroken||0;g.damage(g.all().map(x=>[x.uid,1]),m);const broken=(g.s.shieldsBroken||0)-before;g.flush();for(let i=0;i<broken;i++)shields(g,m,2,true);break;}
    case 'TY_087':{const n=Math.min(6,Math.floor(healAll(g,m,6).sum/3));g.flush();for(let i=0;i<n&&g.s.phase!=='finished';i++){enemyHit(g,m,2);g.flush();}break;}
    case 'TY_088':resurrect(g,m,g.rules().boardLimit,c=>c.tribe==='MURLOC',{ordered:true,battlecry:true});break;
    case 'TY_089':{const n=tribe(g,m,'MURLOC').length;for(const x of row(g,o).filter(x=>g.card(x).tribe==='MURLOC'))g.buff(x.uid,n,n);break;}
    case 'TY_090':for(const x of tribe(g,m,'BEAST')){g.buff(x.uid,0,0,['charge']);g.buff(x.uid,2,0,[],true);}break;
    case 'TY_092':g.damage([['h'+o,6]],m);if(g.s.phase!=='finished')for(const x of row(g,1-o).filter(x=>g.attack(x)<=5))g.kill(x.uid);break;
    case 'TY_093':resurrect(g,m,2,c=>c.features.includes('亡语'),{trigger:true});break;
    case 'TY_094':spawn(g,m,'TY_wall35',2);break;
    case 'TY_095':{const targets=g.all().filter(x=>x.uid!==m.uid);for(const x of targets){const a=g.attack(x),h=g.health(x);x.buffA+=h-a;x.baseH=a;x.buffH=-x.auraH;x.damage=0;}g.damage(targets.map(x=>[x.uid,2]),m);break;}
    case 'TY_096':shields(g,m,2);break;
    case 'TY_097':{const n=Math.min(10,Math.floor((g.p(o).healed||0)/5));for(let i=0;i<n&&g.s.phase!=='finished';i++){enemyHit(g,m,2);g.flush();}break;}
    case 'TY_098':resurrect(g,m,3,c=>c.tribe==='BEAST',{keys:['charge']});break;
    case 'TY_099':{const victims=others(g,m);for(const x of victims)g.kill(x.uid);g.flush();for(let i=0;i<victims.length&&g.s.phase!=='finished';i++){const x=g.pick(row(g,1-o));if(x)g.kill(x.uid);g.flush();}break;}
    case 'TY_100':for(let i=0;i<2&&g.s.phase!=='finished';i++){
      const enemies=row(g,1-o);if(!enemies.length)break;const max=Math.max(...enemies.map(x=>g.attack(x))),victim=g.pick(enemies.filter(x=>g.attack(x)===max)),snapshot=structuredClone(victim);
      g.kill(victim.uid);g.flush();const copy=g.summon(o,snapshot.id);if(copy)g.copySnapshot(copy,snapshot);
    }break;
  }
}
export function expansionDeath(g,m){
  const o=m.owner,slot=g.deathSlot(m);
  switch(m.id){
    case 'TY_004':case 'TY_014':spawn(g,m,'TY_murloc11',2,slot);break;
    case 'TY_006':g.buff(g.pick(tribe(g,m,'BEAST'))?.uid,1,1);break;
    case 'TY_011':enemyHit(g,m,2);break;
    case 'TY_019':g.damage([['h'+o,2]],m);break;
    case 'TY_020':g.silence(g.pick(row(g,1-o))?.uid);break;
    case 'TY_026':spawn(g,m,'TY_beast11',2,slot);break;
    case 'TY_052':resurrect(g,m,1,c=>c.cost<=3);break;
    case 'TY_068':spawn(g,m,'TY_horn33',2,slot);break;
    case 'TY_073':spawn(g,m,'TY_demon44',2,slot);g.damage([['h'+o,6]],m);break;
    case 'TY_077':shields(g,m,2);break;
    case 'TY_083':resurrect(g,m,3,c=>c.cost<=5);break;
    case 'TY_089':spawn(g,m,'TY_murloc21',3,slot);break;
    case 'TY_091':resurrect(g,m,3,c=>c.tribe==='BEAST',{keys:['taunt']});break;
    case 'TY_099':g.damage([['h'+o,5]],m);break;
  }
}
export function expansionEvent(g,m,event,d){
  const live=g.find(m.uid),o=m.owner,t=d.target;
  if(event==='shieldLost'&&t.owner===o){
    if(m.id==='TY_012'&&t.uid!==m.uid)g.buff(t.uid,1);
    if(m.id==='TY_023'&&t.uid!==m.uid)shields(g,m,1);
    if(m.id==='TY_037'&&t.uid===m.uid)g.heal('h'+o,3);
    if(m.id==='TY_044')enemyHit(g,m,2);
    if(m.id==='TY_096')enemyHit(g,m,3);
  }
  if(event==='heal'&&t.owner===o&&!t.hero){
    if(m.id==='TY_028'&&live)g.buff(m.uid,1);
    if(m.id==='TY_049'&&t.uid!==m.uid)g.buff(t.uid,1,1);
    if(m.id==='TY_071'&&t.uid!==m.uid&&t.damage===0)g.buff(t.uid,0,0,['shield']);
  }
  if(event==='summon'&&t.owner===o&&g.card(t).tribe==='BEAST'&&m.id==='TY_015'&&live)g.buff(g.pick(row(g,o).filter(x=>g.card(x).tribe==='BEAST'))?.uid,1,1);
  if(event==='death'&&d.owner===o&&d.uid!==m.uid){
    if(m.id==='TY_034'&&g.card(d).tribe==='MURLOC')g.summon(o,'TY_murloc11');
    if(m.id==='TY_039'&&live&&g.card(d).tribe==='DEMON')g.buff(m.uid,1,1);
    if(m.id==='TY_041'&&live&&(d.keys.includes('taunt')||d.auraTaunt))g.buff(m.uid,2,2);
    if(m.id==='TY_056'&&g.card(d).tribe==='MURLOC')enemyHit(g,m,2);
  }
  if(event==='damage'&&t.owner===o){
    if(m.id==='TY_036'&&t.uid!==m.uid&&!t.hero&&g.card(t).tribe==='BEAST'&&live)g.heal(m.uid,1);
    if(m.id==='TY_051'&&t.hero&&live)g.buff(m.uid,1);
    if(m.id==='TY_094'&&!t.hero&&(t.keys.includes('taunt')||t.auraTaunt))enemyHit(g,m,1);
  }
  if(event==='play'&&d.owner===o&&m.id==='TY_010'&&live)live.otherPlayedTurn=g.s.turn;
  if(event==='attack'&&t.owner===o){
    if(m.id==='TY_067'&&g.card(t).tribe==='MURLOC'&&live)g.buff(g.pick(row(g,o).filter(x=>g.card(x).tribe==='MURLOC'))?.uid,1,1);
    if(t.uid===m.uid&&d.killed){
      if(m.id==='TY_021'&&(live?.killDrawTurn??m.killDrawTurn)!==g.s.turn){if(live)live.killDrawTurn=g.s.turn;g.draw(o);}
      if(m.id==='TY_048'&&live)g.buff(m.uid,0,0,['stealth']);
      if(m.id==='TY_062'&&live)g.heal(m.uid,3);
    }
  }
}
export function expansionPhase(g,m,phase){
  if(phase!=='end')return;const o=m.owner,live=g.find(m.uid);
  switch(m.id){
    case 'TY_010':if(live.otherPlayedTurn===g.s.turn)g.buff(m.uid,1);break;
    case 'TY_017':{const targets=hurt(g,o);const min=Math.min(...targets.map(x=>g.health(x)));g.heal(g.pick(targets.filter(x=>g.health(x)===min))?.uid,2);break;}
    case 'TY_032':if(others(g,m).length>=3)g.draw(o);break;
    case 'TY_038':for(const x of hurt(g,o))g.heal(x.uid,1);break;
    case 'TY_047':g.buff(g.pick(tribe(g,m,'BEAST'))?.uid,2,2);break;
    case 'TY_058':healAll(g,m,2);break;
    case 'TY_069':drawBeast(g,o,false,2);break;
  }
}
