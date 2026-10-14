import { Game, legalActions } from './engine.mjs';
import { CARDS } from './cards.mjs';
export function basicDeck(offset=0) {
  const ids=['CS2_065','EX1_008','CS2_120','CS2_172','EX1_015','EX1_096','EX1_506','CS2_125','EX1_019','EX1_556','CS2_179','CS2_182','CS2_151','CS2_200','CS2_222'];
  return ids.flatMap(id=>[id,id]);
}
export function chooseAction(s,o,difficulty='normal',now=Date.now()){
  const actions=legalActions(s,o);if(!actions.length)return null;if(s.phase==='mulligan')return {type:'mulligan',cards:s.players[o].hand.filter(c=>CARDS[c.id].cost>4).map(c=>c.uid)};
  if(difficulty==='easy'){
    const good=actions.filter(a=>a.type!=='end'&&(!a.target||a.type==='attack'||(CARDS[s.players[o].hand.find(c=>c.uid===a.card)?.id]?.target!=='friendly'||new Game(s).find(a.target)?.owner===o)));
    return good.length?good[Math.floor(Math.random()*good.length)]:{type:'end'};
  }
  let best={type:'end'},value=-100;const until=performance.now()+45,g=new Game(s);
  // Score visible facts only: never simulate unknown draws or inspect future RNG.
  for(const a of actions){if(performance.now()>until&&value>-100)break;
    let x=-50;
    if(a.type==='attack'){
      const m=g.find(a.from),t=g.find(a.target),hit=g.attack(m),back=g.attack(t);
      if(t.hero)x=hit>=t.hp?1e6:hit*1.1;
      else {const kill=hit>=g.health(t)&&!g.has(t,'shield')||g.has(m,'poison')&&!g.has(t,'shield');const lose=back>=g.health(m)&&!g.has(m,'shield')||g.has(t,'poison')&&!g.has(m,'shield');x=(kill?g.attack(t)*2+g.health(t):hit*.5)-(lose?g.attack(m)+g.health(m):back*.4)+1;}
    }
    if(a.type==='play'){
      const c=s.players[o].hand.find(c=>c.uid===a.card),d=CARDS[c.id],t=g.find(a.target);
      x=g.cost(o,c)*1.1+d.attack*.4+d.health*.3+2;
      const friendly=['CS2_188','EX1_019','EX1_362','DS1_070','EX1_587','EX1_059'];
      if(t){if(friendly.includes(c.id))x+=t.owner===o?4:-15;
        if(['CS2_189','CS2_042','CS2_203','EX1_048','EX1_005','EX1_283'].includes(c.id))x+=t.owner!==o?3:-15;
        if(['EX1_011','NEW1_008'].includes(c.id))x+=t.owner===o?Math.min(5,g.max(t)-g.health(t)):-12;
        if(c.id==='EX1_564')x+=g.attack(t)+g.health(t);
        if(c.id==='EX1_561')x+=t.owner===o?15-t.hp:t.hp-15;
      }
      if(c.id==='NEW1_030')x+=s.players[1-o].board.length*5-s.players[o].board.length*6-s.players[o].hand.length*2;
      if(c.id==='NEW1_021')x+=s.players[1-o].board.length*3-s.players[o].board.length*4;
      if(c.id==='EX1_165'&&a.choice===1)x+=s.players[o].hp<15?3:0;
    }
    if(x>value){value=x;best=a;}
  }
  return best;
}
