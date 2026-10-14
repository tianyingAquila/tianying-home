import {CARDS} from './cards.mjs';
import {esc,cardText} from './ui.mjs';
const glossary={战吼:'随从从手牌放入己方场地时生效的效果。',亡语:'随从死亡时生效的效果。',嘲讽:'敌方随从必须先攻击具有嘲讽的随从。',冲锋:'随从上场的这个回合就可以攻击。',圣盾:'抵挡下一次受到的伤害，随后失去圣盾。',潜行:'不能被敌方攻击或指定为目标；主动攻击后失去潜行。',风怒:'每回合可以攻击两次。',剧毒:'对随从造成实际伤害后，消灭该随从。',冻结:'暂时无法攻击；在可攻击的己方回合结束时解冻。',沉默:'移除随从的卡牌效果、关键词和附加增益。',抉择:'使用时从列出的两种效果中选择一种。',激怒:'受伤时获得卡牌说明中的额外能力。',无法攻击:'不能主动发动攻击，但受攻击时仍会反击。',鱼人:'随从种族，可与写明“鱼人”的效果配合。',野兽:'随从种族，可与写明“野兽”的效果配合。',恶魔:'随从种族，可与写明“恶魔”的效果配合。',龙:'随从种族，可与写明“龙”的效果配合。'};
export function installInteractions(root,{canDrag,beginDrag,dropCard}){
  const tip=document.createElement('aside');tip.id='ccKeywordTip';tip.className='cc-keyword-tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
  let timer,hovered=null,drag=null,suppress=false;
  function hide(){clearTimeout(timer);hovered?.removeAttribute('aria-describedby');hovered=null;tip.hidden=true;}
  function show(el){
    if(!el.isConnected||drag||document.body.inert)return;const c=CARDS[el.dataset.id];if(!c)return;
    const tribe={BEAST:'野兽',MURLOC:'鱼人',DEMON:'恶魔',DRAGON:'龙'}[c.tribe]||'';
    const words=Object.keys(glossary).filter(word=>(c.text+' '+tribe+' '+(el.querySelector('.cc-keywords')?.textContent||'')).includes(word));
    if(!words.length)return;tip.innerHTML=words.map(word=>`<p>${cardText(word)}：${esc(glossary[word])}</p>`).join('');tip.hidden=false;el.setAttribute('aria-describedby',tip.id);
    const r=el.getBoundingClientRect(),t=tip.getBoundingClientRect();let left=r.right+12;if(left+t.width>innerWidth-10)left=r.left-t.width-12;
    tip.style.left=Math.max(10,Math.min(left,innerWidth-t.width-10))+'px';tip.style.top=Math.max(10,Math.min(r.top,innerHeight-t.height-10))+'px';
  }
  root.addEventListener('pointerover',e=>{if(e.pointerType==='touch'||drag)return;const el=e.target.closest('.cc-card');if(!el||el===hovered)return;hide();hovered=el;timer=setTimeout(()=>show(el),500);});
  root.addEventListener('pointerout',e=>{if(hovered&&!hovered.contains(e.relatedTarget))hide();});
  root.addEventListener('focusin',e=>{const el=e.target.closest('.cc-card');if(el){hide();hovered=el;timer=setTimeout(()=>show(el),500);}});
  root.addEventListener('focusout',hide);addEventListener('scroll',hide,true);addEventListener('resize',hide);document.addEventListener('visibilitychange',hide);
  root.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('.cc-card-name'))return;
    const el=e.target.closest('[data-hand]');if(!el||!canDrag(el.dataset.hand))return;
    const r=el.getBoundingClientRect();drag={uid:el.dataset.hand,x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,source:el,active:false};
  });
  addEventListener('pointermove',e=>{
    if(!drag)return;if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;
    e.preventDefault();if(!drag.active){hide();drag.active=true;drag.copy=drag.source.cloneNode(true);drag.copy.removeAttribute('data-entity');drag.copy.classList.add('cc-drag-copy');drag.copy.style.width=drag.source.getBoundingClientRect().width+'px';document.body.append(drag.copy);document.documentElement.classList.add('cc-dragging');beginDrag(drag.uid);}
    drag.copy.style.left=(e.clientX-drag.dx)+'px';drag.copy.style.top=(e.clientY-drag.dy)+'px';
    const row=root.querySelector('.cc-own-board'),r=row?.getBoundingClientRect();drag.position=null;
    for(const slot of root.querySelectorAll('.cc-drop-slot'))slot.classList.remove('is-drop');
    if(r&&e.clientX>=r.left-15&&e.clientX<=r.right+15&&e.clientY>=r.top-25&&e.clientY<=r.bottom+25){
      const units=[...row.querySelectorAll('.cc-unit')];drag.position=units.filter(el=>e.clientX>el.getBoundingClientRect().left+el.getBoundingClientRect().width/2).length;
      row.querySelector(`[data-position="${drag.position}"]`)?.classList.add('is-drop');
    }
    if(e.clientY<45)scrollBy(0,-12);else if(e.clientY>innerHeight-45)scrollBy(0,12);
  },{passive:false});
  function finish(cancel=false){if(!drag)return;const d=drag;drag=null;d.copy?.remove();document.documentElement.classList.remove('cc-dragging');for(const slot of root.querySelectorAll('.cc-drop-slot'))slot.classList.remove('is-drop');if(d.active){suppress=true;setTimeout(()=>suppress=false,100);if(!cancel&&d.position!==null)dropCard(d.uid,d.position);}}
  addEventListener('pointerup',()=>finish());addEventListener('pointercancel',()=>finish(true));addEventListener('blur',()=>{hide();finish(true);});document.addEventListener('keydown',e=>{if(e.key==='Escape'){hide();finish(true);}});
  document.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('dragstart',e=>{if(e.target.closest('.cc-card'))e.preventDefault();});
  return {hide};
}
