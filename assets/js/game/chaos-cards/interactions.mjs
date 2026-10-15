import {CARDS} from './cards.mjs';
import {esc,cardText} from './ui.mjs';
const glossary={战吼:'随从从手牌放入己方场地时生效的效果。',亡语:'随从死亡时生效的效果。',嘲讽:'敌方随从必须先攻击具有嘲讽的随从。',冲锋:'随从上场的这个回合就可以攻击。',圣盾:'抵挡下一次受到的伤害，随后失去圣盾。',潜行:'不能被敌方攻击或指定为目标；主动攻击后失去潜行。',风怒:'每回合可以攻击两次。',剧毒:'对随从造成实际伤害后，消灭该随从。',冻结:'暂时无法攻击；在可攻击的己方回合结束时解冻。',沉默:'移除随从的卡牌效果、关键词和附加增益。',抉择:'使用时从列出的两种效果中选择一种。',激怒:'受伤时获得卡牌说明中的额外能力。',无法攻击:'不能主动发动攻击，但受攻击时仍会反击。',鱼人:'随从种族，可与写明“鱼人”的效果配合。',野兽:'随从种族，可与写明“野兽”的效果配合。',恶魔:'随从种族，可与写明“恶魔”的效果配合。',龙:'随从种族，可与写明“龙”的效果配合。'};
export function installInteractions(root,{canDrag,canAttack,beginDrag,beginAttack,dropCard,chooseTarget,aim,cancel}){
  const tip=document.createElement('aside');tip.id='ccKeywordTip';tip.className='cc-keyword-tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');
  arrow.classList.add('cc-aim');arrow.setAttribute('aria-hidden','true');
  arrow.innerHTML='<defs><marker id="ccArrowHead" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L6 3.5 L0 7 Z" fill="currentColor"/></marker></defs><path class="cc-aim-line" marker-end="url(#ccArrowHead)"/><circle class="cc-aim-origin" r="7"/>';
  document.body.append(arrow);
  let timer,hovered=null,drag=null,suppress=false,pointer={x:innerWidth/2,y:innerHeight/2};
  function targetAt(x,y){return document.elementFromPoint(x,y)?.closest('[data-entity]')?.dataset.entity;}
  function sync(){
    const a=aim(),source=a&&root.querySelector(`[data-entity="${a.source}"]`),r=source?.getBoundingClientRect();
    arrow.style.display=r?'block':'none';
    for(const el of root.querySelectorAll('.cc-aim-over'))el.classList.remove('cc-aim-over');
    if(!r)return;const x=r.left+r.width/2,y=r.top+r.height/2,uid=targetAt(pointer.x,pointer.y),valid=a.targets.includes(uid);
    arrow.classList.toggle('is-valid',valid);
    if(valid)root.querySelector(`[data-entity="${uid}"]`)?.classList.add('cc-aim-over');
    arrow.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    arrow.querySelector('.cc-aim-line').setAttribute('d',`M${x} ${y} Q${(x+pointer.x)/2+28} ${(y+pointer.y)/2-25} ${pointer.x} ${pointer.y}`);
    const dot=arrow.querySelector('circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);
  }
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
    pointer={x:e.clientX,y:e.clientY};
    if(e.button!==0)return;
    if(aim()){
      const uid=e.target.closest('[data-entity]')?.dataset.entity;
      if(uid===aim().source){drag={type:'target',pointerId:e.pointerId,active:true};root.setPointerCapture(e.pointerId);}
      return;
    }
    const el=e.target.closest('[data-entity]');if(!el)return;
    const uid=el.dataset.entity,type=el.dataset.hand&&canDrag(uid)?'hand':canAttack(uid)?'attack':null;
    if(!type)return;const r=el.getBoundingClientRect();
    drag={uid,type,pointerId:e.pointerId,x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,source:el,active:false,position:null};
  });
  addEventListener('pointermove',e=>{
    pointer={x:e.clientX,y:e.clientY};
    if(!drag){sync();return;}if(drag.pointerId!==e.pointerId)return;
    if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;
    e.preventDefault();if(!drag.active){
      hide();drag.active=true;root.setPointerCapture(e.pointerId);document.documentElement.classList.add('cc-dragging');
      if(drag.type==='hand'){
        drag.copy=drag.source.cloneNode(true);drag.copy.removeAttribute('data-entity');drag.copy.classList.add('cc-drag-copy');
        drag.copy.style.width=drag.source.getBoundingClientRect().width+'px';document.body.append(drag.copy);beginDrag(drag.uid);
      }else beginAttack(drag.uid);
    }
    if(drag.copy){
      drag.copy.style.left=(e.clientX-drag.dx)+'px';drag.copy.style.top=(e.clientY-drag.dy)+'px';
      const row=root.querySelector('.cc-own-board'),r=row?.getBoundingClientRect();drag.position=null;
      for(const slot of root.querySelectorAll('.cc-drop-slot'))slot.classList.remove('is-drop');
      if(r&&e.clientX>=r.left-15&&e.clientX<=r.right+15&&e.clientY>=r.top-25&&e.clientY<=r.bottom+25){
        const units=[...row.querySelectorAll('.cc-unit')];drag.position=units.filter(el=>e.clientX>el.getBoundingClientRect().left+el.getBoundingClientRect().width/2).length;
        row.querySelector(`[data-position="${drag.position}"]`)?.classList.add('is-drop');
      }
    }
    if(e.clientY<45)scrollBy(0,-12);else if(e.clientY>innerHeight-45)scrollBy(0,12);sync();
  },{passive:false});
  function finish(abort=false){
    if(!drag)return;const d=drag;drag=null;if(root.hasPointerCapture(d.pointerId))root.releasePointerCapture(d.pointerId);d.copy?.remove();document.documentElement.classList.remove('cc-dragging');
    for(const slot of root.querySelectorAll('.cc-drop-slot'))slot.classList.remove('is-drop');
    if(d.active){
      suppress=true;setTimeout(()=>suppress=false,100);
      if(abort)cancel();
      else if(d.type==='hand'&&d.position!==null)dropCard(d.uid,d.position);
      else if(['attack','target'].includes(d.type)&&aim()?.targets.includes(targetAt(pointer.x,pointer.y)))chooseTarget(targetAt(pointer.x,pointer.y));
      else if(d.type==='target')sync();
      else cancel();
    }
    sync();
  }
  addEventListener('pointerup',e=>{pointer={x:e.clientX,y:e.clientY};if(drag?.pointerId===e.pointerId)finish();});
  addEventListener('pointercancel',()=>finish(true));
  addEventListener('blur',()=>{hide();finish(true);});
  addEventListener('scroll',sync,true);addEventListener('resize',sync);
  root.addEventListener('contextmenu',e=>{if(aim()||drag||root.querySelector('.cc-pending-unit')){e.preventDefault();finish(true);cancel();}});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){hide();finish(true);}
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.cc-card[data-act]')){e.preventDefault();e.target.click();}
  });
  document.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('dragstart',e=>{if(e.target.closest('.cc-card'))e.preventDefault();});
  return {hide,sync};
}
