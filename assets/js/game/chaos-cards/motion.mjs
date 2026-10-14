// Presentation only: authoritative actions have already settled on the server.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
export class BattleMotion {
  constructor(root){this.root=root;this.layer=document.createElement('div');this.layer.className='cc-fx-layer';this.layer.setAttribute('aria-hidden','true');document.body.append(this.layer);this.positions=new Map();this.fallen=new Map();}
  get reduced(){return document.documentElement.dataset.motion==='reduced';}
  get available(){return !document.hidden&&!document.body.inert;}
  entity(uid){return [...this.root.querySelectorAll('[data-entity]')].find(e=>e.dataset.entity===uid);}
  remember(){for(const el of this.root.querySelectorAll('[data-entity]')){const r=el.getBoundingClientRect();this.positions.set(el.dataset.entity,{left:r.left,top:r.top,width:r.width,height:r.height});}}
  rect(uid){return this.fallen.get(uid)?.getBoundingClientRect()||this.entity(uid)?.getBoundingClientRect()||this.positions.get(uid);}
  async animate(el,frames,ms,options={}){if(!el)return;const a=el.animate(frames,{duration:this.reduced?Math.min(ms,110):ms,easing:'ease-in-out',fill:'forwards',...options});await a.finished.catch(()=>{});a.cancel();}
  ghost(el,r=el.getBoundingClientRect()){const copy=el.cloneNode(true);copy.classList.add('cc-fx-copy');copy.removeAttribute('data-entity');Object.assign(copy.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',margin:'0',transform:'none'});this.layer.append(copy);return copy;}
  async number(uid,text,kind='damage'){const r=this.rect(uid);if(!r)return;const el=document.createElement('b');el.className='cc-float cc-float-'+kind;el.textContent=text;el.style.left=(r.left+r.width/2)+'px';el.style.top=(r.top+r.height*.45)+'px';this.layer.append(el);try{await this.animate(el,[{transform:'translate(-50%,0) scale(.7)',opacity:0},{transform:'translate(-50%,-15px) scale(1.15)',opacity:1,offset:.25},{transform:'translate(-50%,-52px) scale(1)',opacity:0}],650);}finally{el.remove();}}
  async beam(from,to,kind='damage'){const a=this.rect(from),b=this.rect(to);if(!b)return;const start=a?center(a):{x:b.left+b.width/2,y:Math.max(12,b.top-60)},end=center(b);const dx=end.x-start.x,dy=end.y-start.y;const ray=document.createElement('i');ray.className='cc-ray cc-ray-'+kind;Object.assign(ray.style,{left:start.x+'px',top:start.y+'px',width:Math.hypot(dx,dy)+'px',transform:`rotate(${Math.atan2(dy,dx)}rad)`});this.layer.append(ray);try{await this.animate(ray,[{opacity:0,scale:'0 1'},{opacity:1,scale:'1 1',offset:.55},{opacity:0,scale:'1 1'}],230);}finally{ray.remove();}}
  async impact(hits){await Promise.all(hits.map(async h=>{const el=this.entity(h.target);const tasks=[this.number(h.target,h.shield?'圣盾':`−${h.n}`,h.shield?'shield':'damage')];if(el)tasks.push(this.animate(el,[{translate:'0 0'},{translate:'-5px 0',filter:'brightness(1.6)'},{translate:'5px 0'},{translate:'0 0'}],240));await Promise.all(tasks);}));}
  async shatter(uid){const el=this.entity(uid),held=this.fallen.get(uid);if(!el&&!held)return;const r=(held||el).getBoundingClientRect();const source=held||el.querySelector('.cc-card')||el;if(el)el.style.visibility='hidden';if(held)held.style.visibility='hidden';const pieces=[];try{for(let i=0;i<4;i++){const copy=this.ghost(source,r);copy.style.visibility='';copy.style.clipPath=['polygon(0 0,52% 0,46% 51%,0 56%)','polygon(52% 0,100% 0,100% 53%,46% 51%)','polygon(0 56%,46% 51%,53% 100%,0 100%)','polygon(46% 51%,100% 53%,100% 100%,53% 100%)'][i];pieces.push(copy);}await Promise.all(pieces.map((p,i)=>this.animate(p,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${i%2?32:-32}px,${i<2?-16:40}px) rotate(${i%2?15:-15}deg)`,opacity:0}],420)));}finally{pieces.forEach(p=>p.remove());held?.remove();this.fallen.delete(uid);if(el)el.style.visibility='';}}
  async play(event,commit){
    this.remember();this.layer.dataset.event=event.type;
    if(!this.available){commit();return;}
    const hits=event.hits||[];
    if(event.type==='attack'){
      const el=this.entity(event.from),r=el?.getBoundingClientRect(),dest=this.rect(event.target);let clone;
      try{if(el&&dest){clone=this.ghost(el.querySelector('.cc-card')||el,r);el.style.visibility='hidden';const a=center(r),b=center(dest),dx=b.x-a.x,dy=b.y-a.y;await this.animate(clone,[{transform:'translate(0,0) scale(1)'},{transform:'translate(0,-18px) scale(1.1)',offset:.3},{transform:`translate(${dx*.85}px,${dy*.85}px) scale(1.06)`}],340);clone.style.transform=`translate(${dx*.85}px,${dy*.85}px) scale(1.06)`;commit();const fresh=this.entity(event.from);if(fresh)fresh.style.visibility='hidden';if(event.fallen)this.fallen.set(event.from,clone);const fx=this.impact(hits);if(event.fallen){await fx;clone=null;}else{await Promise.all([fx,this.animate(clone,[{transform:clone.style.transform},{transform:'translate(0,-12px) scale(1.05)',offset:.7},{transform:'translate(0,0) scale(1)'}],330)]);}}
        else {commit();await this.impact(hits);}
      }finally{clone?.remove();if(el)el.style.visibility='';const fresh=this.entity(event.from);if(fresh&&!this.fallen.has(event.from))fresh.style.visibility='';}return;
    }
    if(event.type==='death'){await Promise.all(event.targets.map(uid=>this.shatter(uid)));commit();return;}
    if(event.type==='damage'){await Promise.all(hits.map(h=>this.beam(event.from,h.target)));commit();await this.impact(hits);return;}
    if(event.type==='bounce'){const el=this.entity(event.target);if(el)await this.animate(el,[{transform:'translateY(0)',opacity:1},{transform:'translateY(65px) scale(.7)',opacity:0}],280);commit();return;}
    if(event.type==='summon'){
      const hand=this.root.querySelector(`[data-hand="${event.target}"]`),r=hand?.getBoundingClientRect();const copy=hand?this.ghost(hand):null;commit();const el=this.entity(event.target);try{if(copy&&el){const end=el.getBoundingClientRect();el.style.visibility='hidden';await this.animate(copy,[{transform:'translate(0,0) scale(1)'},{transform:`translate(${end.left-r.left}px,${end.top-r.top}px) scale(${end.width/r.width})`}],360);el.style.visibility='';}if(el)await this.animate(el,[{opacity:.3,transform:'translateY(-20px) scale(.85)',filter:'brightness(1.7)'},{opacity:1,transform:'translateY(0) scale(1)',filter:'brightness(1)'}],250);}finally{copy?.remove();if(el)el.style.visibility='';}return;
    }
    if(['heal','buff','effect'].includes(event.type)){
      await this.beam(event.from,event.target,event.type==='heal'?'heal':'effect');commit();await Promise.all([this.number(event.target,event.type==='heal'?`+${event.n}`:event.label||'强化',event.type==='heal'?'heal':'effect'),this.animate(this.entity(event.target),[{filter:'brightness(1)'},{filter:'brightness(1.6)',offset:.4},{filter:'brightness(1)'}],280)]);return;
    }
    commit();if(event.type==='draw')await this.number(event.target,'抽牌','draw');else await pause(50);
  }
  reset(){for(const a of this.layer.getAnimations({subtree:true}))a.cancel();this.layer.replaceChildren();this.fallen.clear();delete this.layer.dataset.event;}
}
