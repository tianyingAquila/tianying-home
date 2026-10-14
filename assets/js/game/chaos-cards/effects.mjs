// Card-specific effects use the same atomic operations and event queue.
const board=(g,o)=>g.p(o).board;
const uid=x=>x?.uid;
export function battle(g,m,target,choice=0) {
  const o=m.owner,enemy=1-o,id=m.id,t=g.find(target),adj=()=>{const b=board(g,o),i=b.indexOf(m);return [b[i-1],b[i+1]].filter(Boolean);};
  switch(id){
    case 'CS2_188':g.buff(target,2,0,[],true);break;
    case 'CS2_189':g.damage([[target,1]],m);break;
    case 'EX1_011':g.heal(target,2);break;
    case 'EX1_319':g.damage([['h'+o,3]],m);break;
    case 'CS2_203':case 'EX1_048':g.silence(target);break;
    case 'EX1_015':g.draw(o);break;
    case 'EX1_049':g.bounce(target);break;
    case 'EX1_059':if(t&&!t.hero){const a=g.attack(t),h=g.health(t);t.buffA+=h-a;t.baseH=a;t.buffH=-t.auraH;t.damage=0;}break;
    case 'EX1_082':for(let i=0;i<3&&g.s.phase!=='finished';i++){const x=g.pick([...g.all().filter(x=>x.uid!==m.uid),...g.s.players]);if(x){g.damage([[x.uid,1]],m);g.flush();}}break;
    case 'EX1_362':g.buff(target,0,0,['shield']);break;
    case 'EX1_506':g.summon(o,'EX1_506a',board(g,o).indexOf(m)+1);break;
    case 'CS2_181':g.damage([[m.uid,4]],m);break;
    case 'CS2_196':g.summon(o,'CS2_boar',board(g,o).indexOf(m)+1);break;
    case 'EX1_005':g.kill(target);break;
    case 'EX1_019':g.buff(target,1,1);break;
    case 'EX1_050':g.draw(o,2);if(g.s.phase!=='finished')g.draw(enemy,2);break;
    case 'EX1_083':{const x=g.pick(g.all().filter(x=>x.uid!==m.uid));if(x)g.transform(x.uid,g.random(2)?'EX1_tk28':'EX1_tk29');break;}
    case 'EX1_085':if(board(g,enemy).length>=4)g.steal(uid(g.pick(board(g,enemy))),o);break;
    case 'EX1_103':for(const x of g.all())if(x.uid!==m.uid&&g.card(x).tribe==='MURLOC')g.buff(x.uid,0,2);break;
    case 'EX1_590':{let n=0;for(const x of g.all())if(g.has(x,'shield')){n++;x.keys=x.keys.filter(k=>k!=='shield');}g.buff(m.uid,n*3,n*3);break;}
    case 'DS1_070':g.buff(target,2,2,['taunt']);break;
    case 'EX1_025':g.summon(o,'EX1_025t',board(g,o).indexOf(m)+1);break;
    case 'EX1_043':g.buff(m.uid,0,g.p(o).hand.length);break;
    case 'EX1_093':for(const x of adj())g.buff(x.uid,1,1,['taunt']);break;
    case 'EX1_116':g.summon(enemy,'EX1_116t');g.summon(enemy,'EX1_116t');break;
    case 'EX1_587':g.buff(target,0,0,['windfury']);break;
    case 'CS2_151':g.summon(o,'CS2_152',board(g,o).indexOf(m)+1);break;
    case 'CS2_226':{const n=board(g,o).length-1;g.buff(m.uid,n,n);break;}
    case 'DS1_055':for(const x of [...board(g,o),g.p(o)])g.heal(x.uid,2);break;
    case 'EX1_165':g.transform(m.uid,choice===0?'EX1_165t1':'EX1_165t2');break;
    case 'EX1_310':g.discard(o,2);break;
    case 'EX1_564':g.copy(m.uid,target);break;
    case 'NEW1_041':g.kill(uid(g.pick(board(g,enemy).filter(x=>g.attack(x)<=2))));break;
    case 'CS2_042':g.damage([[target,3]],m);break;
    case 'EX1_283':if(t)g.freeze(t);break;
    case 'CS2_088':g.heal('h'+o,6);break;
    case 'NEW1_008':if(choice===0)g.draw(o,2);else g.heal(target,5);break;
    case 'EX1_561':if(t?.hero)t.hp=15;break;
    case 'EX1_562':while(board(g,o).length<7)g.summon(o,'EX1_116t');break;
    case 'NEW1_030':for(const x of g.all())if(x.uid!==m.uid)g.kill(x.uid);g.p(o).hand=[];break;
  }
}
export function death(g,m){
  const o=m.owner,slot=g.deathSlot(m);
  switch(m.id){
    case 'EX1_029':g.damage([['h'+(1-o),2]],m);break;
    case 'EX1_096':g.draw(o);break;
    case 'EX1_556':g.summon(o,'skele21',slot);break;
    case 'EX1_097':g.damage([...g.all(),...g.s.players].map(x=>[x.uid,2]),m);break;
    case 'EX1_016':g.steal(uid(g.pick(board(g,1-o))),o);break;
    case 'EX1_110':g.summon(o,'EX1_110t',slot);break;
    case 'EX1_534':g.summon(o,'EX1_534t',slot);g.summon(o,'EX1_534t',slot+1);break;
  }
}
export function onEvent(g,m,event,d){
  const live=g.find(m.uid),o=m.owner;
  // Source snapshots allow lethal damage triggers to resolve, but buffs to departed entities fizzle.
  if(event==='damage'){
    if(m.id==='EX1_007'&&d.target.uid===m.uid)g.draw(o);
    if(m.id==='EX1_399'&&d.target.uid===m.uid&&live)g.buff(m.uid,3);
  }
  if(event==='heal'){
    if(m.id==='CS2_235'&&!d.target.hero)g.draw(o);
    if(m.id==='EX1_001'&&live)g.buff(m.uid,2);
  }
  if(event==='death'){
    if(m.id==='EX1_531'&&live&&d.owner===o&&g.card(d).tribe==='BEAST')g.buff(m.uid,2,1);
    if(m.id==='tt_004'&&live)g.buff(m.uid,1);
    if(m.id==='EX1_595'&&live&&d.owner===o&&d.uid!==m.uid)g.draw(o);
  }
  if(event==='summon'){
    if(m.id==='EX1_509'&&live&&g.card(d.target).tribe==='MURLOC')g.buff(m.uid,1);
    if(m.id==='CS2_237'&&d.target.owner===o&&g.card(d.target).tribe==='BEAST')g.draw(o);
    if(m.id==='NEW1_019'&&d.target.owner===o&&live){const x=g.pick([...board(g,1-o),g.p(1-o)]);if(x)g.damage([[x.uid,1]],m);}
  }
  if(event==='play'&&m.id==='EX1_044'&&live&&d.owner===o)g.buff(m.uid,1,1);
}
export function phaseEffect(g,m,phase){
  const live=g.find(m.uid);if(!live||live.silenced)return;
  const o=m.owner;
  if(phase==='start')switch(m.id){
    case 'EX1_341':g.heal(uid(g.pick([...board(g,o),g.p(o)].filter(x=>g.health(x)<g.max(x)))),3);break;
    case 'NEW1_021':for(const x of g.all())g.kill(x.uid);break;
    case 'EX1_102':{const x=g.pick([...board(g,1-o),g.p(1-o)]);if(x)g.damage([[x.uid,2]],m);break;}
  }
  if(phase==='end')switch(m.id){
    case 'NEW1_037':g.buff(uid(g.pick(board(g,o).filter(x=>x.uid!==m.uid))),1);break;
    case 'NEW1_040':g.summon(o,'NEW1_040t');break;
    case 'EX1_249':g.damage([...g.all().filter(x=>x.uid!==m.uid),...g.s.players].map(x=>[x.uid,2]),m);break;
    case 'EX1_298':{const x=g.pick([...board(g,1-o),g.p(1-o)]);if(x)g.damage([[x.uid,8]],m);break;}
  }
}
