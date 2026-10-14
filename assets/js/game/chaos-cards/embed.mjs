export const embedded=!!(window.frameElement?.dataset.gameos==='1');
let started=false;
export function installEmbed(onActive,onEscape){
  if(!embedded){onActive();return;}
  document.documentElement.classList.add('cc-embedded','cc-preview');document.body.inert=true;
  const surface=()=>document.querySelector('.cc-shell');
  const bounds=()=>{const r=(document.querySelector('.cc-sample')||surface()).getBoundingClientRect();return {x:r.x,y:Math.max(0,r.y),width:r.width,height:Math.min(r.height,innerHeight)};};
  window.GameOSModule={ready:Promise.resolve(),surface,bounds,previewPose(){window.scrollTo(0,0);surface().style.transform='none';},unfold(){document.documentElement.classList.remove('cc-preview');},ejectPose(){const offset=scrollY;window.scrollTo(0,0);surface().style.transform=`translateY(${-offset}px)`;return {from:surface().style.transform,to:'translateY(0px)',bounds:bounds()};},setActive(active){document.documentElement.classList.toggle('cc-preview',!active);document.body.inert=!active;if(active&&!started){started=true;onActive();}}};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!onEscape())window.parent.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}});
}
