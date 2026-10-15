import {CARDS} from './cards.mjs';

export const keys={taunt:'嘲讽',charge:'冲锋',shield:'圣盾',stealth:'潜行',windfury:'风怒',poison:'剧毒',cantAttack:'无法攻击'};
export const glossary={战吼:'随从从手牌放入己方场地时生效的效果。',亡语:'随从死亡时生效的效果。',光环:'随从在场且能力有效时持续生效；来源离场、被沉默或站位改变时重新计算。',嘲讽:'敌方随从必须先攻击具有嘲讽的随从。',冲锋:'随从上场的这个回合就可以攻击。',圣盾:'抵挡下一次受到的伤害，随后失去圣盾。',潜行:'不能被敌方攻击或指定为目标；主动攻击后失去潜行。',风怒:'每回合可以攻击两次。',剧毒:'对随从造成实际伤害后，消灭该随从。',冻结:'暂时无法攻击；在可攻击的己方回合结束时解冻。',沉默:'移除随从的卡牌效果、关键词和附加增益。',抉择:'使用时从列出的两种效果中选择一种。',激怒:'受伤时获得卡牌说明中的额外能力。',无法攻击:'不能主动发动攻击，但受攻击时仍会反击。',鱼人:'随从种族，可与写明“鱼人”的效果配合。',野兽:'随从种族，可与写明“野兽”的效果配合。',恶魔:'随从种族，可与写明“恶魔”的效果配合。',龙:'随从种族，可与写明“龙”的效果配合。'};
const signed=n=>n>0?'+'+n:String(n);
const change=(a,h)=>`${signed(a)}攻 / ${signed(h)}生命`;

// Only live abilities belong on a minion. A spent Battlecry is not a live effect.
export function boardEffects(id,stats){
  const c=CARDS[id],out=[];
  const add=(label,description,type='ability')=>out.push({label,description,type});
  for(const key of stats.keys||[])if(keys[key])add(keys[key],glossary[keys[key]],key==='shield'||key==='taunt'?'defense':'keyword');
  if(!stats.silenced){
    if(c.text.includes('光环：'))add('光环',c.text,'aura');
    for(const tag of ['亡语','回合开始','回合结束','治疗触发','召唤触发','死亡触发','受伤触发','出牌触发','伤害触发','激怒','动态属性']){
      if(!c.features.includes(tag))continue;
      const description=tag==='亡语'?(c.text.split(/[；;]/).find(t=>t.trim().startsWith('亡语：'))||c.text):c.text;
      add(tag==='激怒'&&stats.health<stats.maxHealth?'激怒·生效':tag,description,tag==='亡语'?'deathrattle':'ability');
    }
  }
  if(stats.frozen)add('冻结',glossary.冻结,'control');
  if(stats.silenced)add('已沉默','原有卡牌能力已被移除；之后获得的新效果仍可生效。','control');
  const aura=stats.aura||{},buff=stats.buff||{},temporary=stats.temporary||{};
  if(aura.attack||aura.health)add(`光环 ${signed(aura.attack||0)}/${signed(aura.health||0)}`,`受到的光环加成：${change(aura.attack||0,aura.health||0)}；随光环来源和站位变化。`,'aura');
  const a=(buff.attack||0)-(temporary.attack||0),h=(buff.health||0)-(temporary.health||0);
  if(a||h)add(`属性 ${signed(a)}/${signed(h)}`,`附加属性：${change(a,h)}。`,'buff');
  if(temporary.attack||temporary.health)add(`本回合 ${signed(temporary.attack||0)}/${signed(temporary.health||0)}`,`本回合的临时加成：${change(temporary.attack||0,temporary.health||0)}，回合结束时移除。`,'buff');
  return out;
}

export function combatHints(options,{enabled=true,playingCard=false}={}){
  if(!enabled||playingCard)return {attackers:new Set(),targets:new Set()};
  const attacks=Object.entries(options.attacks||{}).filter(([,targets])=>targets.length);
  return {attackers:new Set(attacks.map(([uid])=>uid)),targets:new Set(attacks.flatMap(([,targets])=>targets))};
}
