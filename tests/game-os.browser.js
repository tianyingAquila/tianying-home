(async () => {
  const results = [];
  window.osQAResults = results;
  window.osQAError = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = () => document.body.dataset.osState;
  function check(name, ok, details) { results.push({ name, ok:!!ok, details }); if (!ok) throw Error(name + ': ' + JSON.stringify(details)); }
  async function until(fn, timeout=6000) { const end=performance.now()+timeout; while (!fn()) { if(performance.now()>end) throw Error('timeout'); await sleep(25); } }
  const mineCard=document.querySelector('[data-game=minesweeper]'), towerCard=document.querySelector('[data-game=tower]');
  const mw=mineCard.querySelector('iframe').contentWindow, tw=towerCard.querySelector('iframe').contentWindow;
  await until(()=>mineCard.classList.contains('is-ready')&&towerCard.classList.contains('is-ready'));
  if(state()==='running') { document.querySelector('.is-expanded .os-exit').click(); await until(()=>state()==='selecting'); }
  if(mineCard.dataset.position!=='current') { mineCard.querySelector('.module-trigger').click(); await sleep(720); }
  const board=mw.document.getElementById('gameBoard');
  const canvas=tw.document.getElementById('tdCanvas');
  check('preview isolates game input',mw.document.body.inert&&tw.document.body.inert&&getComputedStyle(mineCard.querySelector('iframe')).pointerEvents==='none');
  const beforeLaunch={revealed:mw.MS_DEBUG.state().revealedSafe,flags:mw.MS_DEBUG.state().flags,placed:mw.MS_DEBUG.state().placed};
  const samples=[];
  const start=performance.now();
  let sampling=true;
  function sample(t) { samples.push(t); if(sampling) requestAnimationFrame(sample); }
  requestAnimationFrame(sample);
  mineCard.querySelector('.module-trigger').click();
  // Fast repeated input cannot launch a second instance or change program.
  mineCard.querySelector('.module-trigger').click(); towerCard.querySelector('.module-trigger').click();
  await until(()=>state()==='running'); sampling=false;
  const gaps=samples.slice(1).map((t,i)=>t-samples[i]).sort((a,b)=>a-b);
  const duration=performance.now()-start;
  check('launch timing and continuous board',duration>1500&&duration<2200&&board===mw.document.getElementById('gameBoard')&&mineCard.dataset.position==='current',{duration,frames:samples.length,p95:gaps[Math.floor(gaps.length*.95)]});
  check('cartridge click does not play minesweeper',mw.MS_DEBUG.state().revealedSafe===beforeLaunch.revealed&&mw.MS_DEBUG.state().flags===beforeLaunch.flags&&mw.MS_DEBUG.state().placed===beforeLaunch.placed);
  mw.document.querySelector('[data-mode=free]').click(); mw.document.getElementById('startGame').click();
  await until(()=>mw.MS_DEBUG.state().phase==='playing');
  const d=mw.document;
  function pointer(node,type) { const b=node.getBoundingClientRect(); node.dispatchEvent(new mw.PointerEvent(type,{bubbles:true,button:0,clientX:b.x+b.width/2,clientY:b.y+b.height/2,pointerType:'mouse'})); }
  const first=d.querySelector('.ms-cell'); pointer(first,'pointerdown'); pointer(first,'pointerup');
  await until(()=>!mw.MS_DEBUG.state().tx);
  check('real minesweeper reveal',mw.MS_DEBUG.state().revealedSafe>0,{revealed:mw.MS_DEBUG.state().revealedSafe});
  const closed=d.querySelector('.ms-cell:not(.is-revealed)');
  d.getElementById('flagToggle').click(); pointer(closed,'pointerdown'); pointer(closed,'pointerup');
  await until(()=>!mw.MS_DEBUG.state().tx);
  check('flag control',mw.MS_DEBUG.state().flags===1,{flags:mw.MS_DEBUG.state().flags});
  d.getElementById('flagToggle').click(); d.getElementById('hintButton').click();
  await until(()=>!mw.MS_DEBUG.state().tx);
  check('hint control',d.getElementById('hintCount').textContent==='2/3',d.getElementById('hintCount').textContent);
  const g=mw.MS_DEBUG.state(), revealed=g.revealedSafe, timer=g.startedAt;
  mw.scrollTo(0,300);
  mineCard.querySelector('.os-exit').click(); await until(()=>state()==='selecting'); await sleep(300);
  check('eject retains game and suspends timer',board===d.getElementById('gameBoard')&&g.revealedSafe===revealed&&g.timerId===0,{revealed:g.revealedSafe,timerId:g.timerId});
  const preview=mw.GameOSModule.bounds(); check('scrolled board returns to cartridge',Math.abs(preview.y-16)<1,preview);
  mineCard.querySelector('.module-trigger').click(); await until(()=>state()==='running');
  check('resume excludes selector time',g.startedAt-timer>2500&&g.revealedSafe===revealed,{excluded:g.startedAt-timer});
  d.querySelector('[data-size=large]').click(); await until(()=>g.phase==='playing'&&g.cols===24);
  mineCard.querySelector('.os-exit').click(); await until(()=>state()==='selecting');
  check('changed board size updates preview',mineCard.querySelector('.module-footer span').textContent.startsWith('24 × 24'),mineCard.querySelector('.module-footer span').textContent);
  const dock=document.querySelector('.os-dock'), dockBefore=dock.getBoundingClientRect();
  towerCard.querySelector('.module-trigger').click(); await sleep(720);
  check('dock persists and aligns during switch',dock===document.querySelector('.os-dock')&&Math.abs((towerCard.getBoundingClientRect().left+towerCard.offsetWidth/2)-(dockBefore.left+dockBefore.width/2))<2);
  towerCard.querySelector('.module-trigger').click(); await until(()=>state()==='running');
  check('continuous tower canvas',canvas===tw.document.getElementById('tdCanvas'));
  for (const map of [2,3,4]) {
    tw.document.querySelector('[data-map="'+map+'"]').click(); await sleep(100);
    check('map '+map+' refreshes canvas and UI',tw.TD.game.eng.map.id===map&&tw.TD.game.rd.cols===tw.TD.game.eng.map.cols&&tw.document.getElementById('tdBoardMap').textContent===tw.TD.game.eng.map.name,{map:tw.TD.game.eng.map.id,cols:tw.TD.game.rd.cols,label:tw.document.getElementById('tdBoardMap').textContent});
  }
  tw.document.querySelector('[data-map="1"]').click();
  tw.document.querySelector('.td-shop-item[data-key=bolt]').click();
  const game=tw.TD.game, r=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new tw.MouseEvent('click',{bubbles:true,clientX:r.left+game.rd.ox+game.rd.cell*2.5,clientY:r.top+game.rd.oy+game.rd.cell*.5}));
  check('real tower construction',game.eng.towers.length===1&&game.eng.gold===170,{towers:game.eng.towers.length,gold:game.eng.gold});
  tw.document.getElementById('tdStart').click(); await sleep(300);
  tw.document.getElementById('tdPause').click(); check('pause control',game.eng.state==='paused',game.eng.state);
  tw.document.getElementById('tdPause').click(); tw.document.getElementById('tdSpeed').click(); check('speed control',game.eng.speed===2,game.eng.speed);
  const time=game.eng.realTime;
  tw.scrollTo(0,250); towerCard.querySelector('.os-exit').click(); await until(()=>state()==='selecting'); await sleep(300);
  check('ejected tower does not advance',game.eng.realTime===time&&game.paused,{time,now:game.eng.realTime,paused:game.paused});
  towerCard.querySelector('.module-trigger').click(); await until(()=>state()==='running'); await sleep(100);
  check('resume tower instance and state',canvas===tw.document.getElementById('tdCanvas')&&game.eng.towers.length===1&&!game.paused&&game.eng.realTime>time);
  towerCard.querySelector('.os-exit').click(); await until(()=>state()==='selecting');
  check('URL never navigated',location.pathname==='/games.html',location.href);
  return JSON.stringify(results);
})().then(value => { window.osQADone=true; return value; }).catch(error => { window.osQAError=error.message; window.osQADone=true; throw error; })
