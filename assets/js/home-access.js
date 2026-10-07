/* Homepage-only miniature worlds. No destination page, engine or data fetch. */
(() => {
  'use strict';
  const terminals = [...document.querySelectorAll('.access-terminal')];
  if (!terminals.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let navigating = false;
  const states = [];

  const archive = document.querySelector('.archive-array');
  for (let i = 0; i < 12; i++) {
    const file = document.createElement('span');
    file.className = 'access-file' + (i === 7 ? ' is-selected' : '');
    const label = document.createElement('em');
    label.textContent = 'P-' + String(i + 1).padStart(3, '0');
    const title = document.createElement('small');
    title.textContent = ['个人项目', '实验记录', '创作档案'][i % 3];
    file.append(label, title, document.createElement('i'));
    archive.append(file);
  }

  const cols = 10, rows = 8, mines = new Set([7,17,28,38,48,58,69,79]);
  const neighbors = index => {
    const x = index % cols, y = Math.floor(index / cols), result = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) result.push(ny * cols + nx);
    }
    return result;
  };
  const counts = Array.from({length:cols*rows}, (_,i) => neighbors(i).filter(n => mines.has(n)).length);
  const opened = new Map([[42,0]]), queue = [42];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    if (counts[index]) continue;
    for (const next of neighbors(index)) if (!mines.has(next) && !opened.has(next)) {
      opened.set(next, opened.get(index) + 1); queue.push(next);
    }
  }
  const board = document.querySelector('.preview-board');
  for (let i = 0; i < cols * rows; i++) {
    const cell = document.createElement('span'), number = document.createElement('span');
    cell.className = 'preview-cell';
    if (opened.has(i)) {
      cell.dataset.open = ''; cell.dataset.number = String(counts[i]);
      cell.style.setProperty('--reveal-delay', (140 + opened.get(i) * 65) + 'ms');
      number.textContent = counts[i] || '';
    } else if (i === 17) { cell.classList.add('is-flag'); number.textContent = '⚑'; }
    cell.append(number); board.append(cell);
  }

  const stop = state => {
    cancelAnimationFrame(state.frame); state.frame = 0;
    state.last = 0;
    state.x = state.y = state.lift = state.tx = state.ty = state.tlift = state.vx = state.vy = state.vlift = 0;
    state.el.style.setProperty('--mx',0); state.el.style.setProperty('--my',0); state.el.style.setProperty('--lift',0);
    state.el.classList.remove('is-engaged');
  };
  for (const el of terminals) {
    const s = {el,x:0,y:0,lift:0,tx:0,ty:0,tlift:0,vx:0,vy:0,vlift:0,frame:0,visible:true,last:0,focused:false,hovered:false};
    states.push(s);
    const frame = time => {
      const dt = Math.min(32, time - (s.last || time - 16)); s.last = time;
      const step = dt / 1000;
      for (const [value,target,velocity] of [['x','tx','vx'],['y','ty','vy'],['lift','tlift','vlift']]) {
        s[velocity] += ((s[target]-s[value])*190 - s[velocity]*21)*step;
        s[value] += s[velocity]*step;
      }
      el.style.setProperty('--mx',s.x.toFixed(4)); el.style.setProperty('--my',s.y.toFixed(4)); el.style.setProperty('--lift',s.lift.toFixed(4));
      const distance=Math.abs(s.tx-s.x)+Math.abs(s.ty-s.y)+Math.abs(s.tlift-s.lift);
      const momentum=Math.abs(s.vx)+Math.abs(s.vy)+Math.abs(s.vlift);
      if (distance + momentum*.03 > .001 && s.visible && !document.hidden) s.frame=requestAnimationFrame(frame);
      else {
        s.frame=0; s.last=0; s.x=s.tx; s.y=s.ty; s.lift=s.tlift; s.vx=s.vy=s.vlift=0;
        el.style.setProperty('--mx',s.x); el.style.setProperty('--my',s.y); el.style.setProperty('--lift',s.lift);
      }
    };
    const animate = () => { if (!s.frame && !reduced.matches && s.visible && !document.hidden && !navigating) s.frame=requestAnimationFrame(frame); };
    const engage = () => { if (navigating) return; el.classList.add('is-engaged'); s.tlift=1; animate(); };
    const release = () => { if (s.focused || s.hovered) return; el.classList.remove('is-engaged'); s.tx=s.ty=s.tlift=0; animate(); };
    el.addEventListener('pointerenter',event => { if (fine.matches && event.pointerType !== 'touch') { s.hovered=true; engage(); } });
    el.addEventListener('pointermove',event => {
      if (!fine.matches || reduced.matches || navigating || event.pointerType === 'touch') return;
      if (!s.hovered) { s.hovered=true; engage(); }
      // offset geometry stays stationary while the instrument follows the pointer.
      const box=el.parentElement.getBoundingClientRect();
      const x=box.left+el.offsetLeft, y=box.top+el.offsetTop;
      s.tx=Math.max(-1,Math.min(1,(event.clientX-x)/el.offsetWidth*2-1));
      s.ty=Math.max(-1,Math.min(1,(event.clientY-y)/el.offsetHeight*2-1)); animate();
    });
    el.addEventListener('pointerleave',() => { s.hovered=false; release(); });
    el.addEventListener('focus',() => { s.focused=true; engage(); });
    el.addEventListener('blur',() => { s.focused=false; release(); });
    el.addEventListener('click',event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || el.target || reduced.matches) return;
      event.preventDefault(); if (navigating) return;
      navigating=true; cancelAnimationFrame(s.frame); s.frame=0;
      el.classList.add('is-engaged','is-opening'); document.body.classList.add('access-departing');
      setTimeout(() => location.assign(el.href),420);
    });
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const s=states.find(state=>state.el===entry.target); s.visible=entry.isIntersecting;
      if (!s.visible) { s.hovered=s.focused=false; stop(s); }
    }
  });
  terminals.forEach(el=>observer.observe(el));
  const reset = () => { navigating=false; document.body.classList.remove('access-departing'); states.forEach(s=>{s.el.classList.remove('is-opening');s.hovered=s.focused=false;stop(s);}); };
  addEventListener('pageshow',reset);
  document.addEventListener('visibilitychange',() => { if (document.hidden) states.forEach(stop); });
  reduced.addEventListener('change',reset);
})();
