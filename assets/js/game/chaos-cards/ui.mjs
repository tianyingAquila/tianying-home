import {CARDS} from './cards.mjs';import {art} from './art.mjs';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const button=(text,act,data='',disabled=false,cls='')=>`<button class="cc-button ${cls}" data-act="${act}" ${data} ${disabled?'disabled':''}>${esc(text)}</button>`;
export const keys={taunt:'嘲讽',charge:'冲锋',shield:'圣盾',stealth:'潜行',windfury:'风怒',poison:'剧毒',cantAttack:'无法攻击'};
const emphasis={战吼:'battlecry',亡语:'deathrattle',鱼人:'murloc',野兽:'beast',恶魔:'demon',龙:'dragon',嘲讽:'defense',圣盾:'defense',冲锋:'attack',风怒:'attack',剧毒:'attack',潜行:'stealth',冻结:'control',沉默:'control',抉择:'choice',激怒:'attack',无法攻击:'control'};
export const cardText=text=>esc(text).replace(/无法攻击|战吼|亡语|鱼人|野兽|恶魔|嘲讽|圣盾|冲锋|风怒|剧毒|潜行|冻结|沉默|抉择|激怒|龙/g,word=>`<strong class="cc-term cc-term-${emphasis[word]}">${word}</strong>`);
export function card(id,{count=null,action='',label='',disabled=false,selected=false,small=false,stats=null,data='',uid='',hand=false,gesture=''}={}){
  const c=CARDS[id];if(!c)return '';
  return `<article class="cc-card ${small?'cc-small':''} ${selected?'is-selected':''} ${stats?.ready?'is-ready':''} ${disabled?'is-full':''}" data-id="${id}" ${uid?`data-entity="${uid}"`:''} ${hand?`data-hand="${uid}"`:''} ${gesture&&!disabled?`data-act="${gesture}" data-uid="${uid}" tabindex="0" aria-label="${esc(c.name)}，${gesture==='hand'?'拖到己方场地出牌':gesture==='attacker'?'拖向敌方目标攻击':'选择此目标'}"`:''}>
  <header><span class="cc-cost" title="法力费用">${stats?.cost??c.cost}</span><button class="cc-card-name" data-act="info" data-id="${id}">${esc(c.name)}</button></header>${art(id)}
  <p class="cc-card-text">${cardText(c.text)}</p><div class="cc-stats"><b class="cc-attack"><small>攻</small>${stats?.attack??c.attack}</b><span class="cc-tribe">${cardText(c.tribe?({BEAST:'野兽',MURLOC:'鱼人',DEMON:'恶魔',DRAGON:'龙'}[c.tribe]||c.tribe):'随从')}</span><b class="cc-health ${stats&&stats.health<stats.maxHealth?'is-hurt':''}"><small>血</small>${stats?.health??c.health}</b></div>
  ${stats?`<div class="cc-keywords">${cardText([...(stats.keys||[]).map(k=>keys[k]),stats.frozen?'冻结':'',stats.silenced?'沉默':''].filter(Boolean).join(' '))}</div>`:''}
  ${action?button(label||'选择',action,`data-id="${id}" ${data}`,disabled,'cc-card-action'):''}${count!==null?`<span class="cc-count">${count}/2</span>`:''}</article>`;
}
export function showInfo(id){const c=CARDS[id];document.getElementById('dialogRoot').innerHTML=`<dialog open class="cc-dialog"><button data-act="close-info" class="cc-close" aria-label="关闭卡牌详情">×</button>${card(id)}<p class="cc-detail-themes">${esc(c.themes.join(' / '))}</p></dialog><div class="cc-scrim" data-act="close-info"></div>`;}
export function closeInfo(){document.getElementById('dialogRoot').innerHTML='';}
