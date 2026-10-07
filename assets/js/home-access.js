/* Homepage-only models: no destination page, engine or data fetch. */
(() => {
  'use strict';
  const terminals = [...document.querySelectorAll('.access-terminal')];
  if (!terminals.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let navigating = false, navigationTimer = 0, peekFrame = 0;
  const archive = document.querySelector('.archive-array');
  const ns = 'http://www.w3.org/2000/svg';
  const svgNode = (name, attrs) => {
    const node = document.createElementNS(ns, name);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const scene = svgNode('svg', {viewBox:'0 0 600 320', preserveAspectRatio:'xMidYMid slice', focusable:'false'});
  // Fixed local markup; no user data is interpolated into the miniature scene.
  scene.innerHTML = '<defs><linearGradient id="archive-face" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="#f2ede2"/><stop offset="1" stop-color="#cfc3ab"/></linearGradient><linearGradient id="archive-edge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#f8f5ee"/><stop offset="1" stop-color="#e3dccf"/></linearGradient></defs>';
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = -45 + col * 205 + row * 35, y = 82 + row * 78;
    const file = svgNode('g', {class:'archive-file', transform:`translate(${x} ${y})`});
    file.append(svgNode('path', {class:'archive-shadow', d:'M0 76 140 12 172 26 32 90Z'}));
    // The hit area stays put while the model lifts, avoiding edge hover jitter.
    file.append(svgNode('path', {class:'archive-hit', d:'M-13 -17 140 -80 140 12 0 76 -13 70Z'}));
    const model = svgNode('g', {class:'archive-model'});
    model.append(
      svgNode('path', {d:'M-13 -6 127 -70 140 -64 0 0Z', fill:'#faf7ef'}),
      svgNode('path', {d:'M-13 -6 0 0 0 76 -13 70Z', fill:'url(#archive-edge)'}),
      svgNode('path', {d:'M0 0 140 -64 140 12 0 76Z', fill:'url(#archive-edge)'}),
      svgNode('path', {d:'M7 4 133 -54 133 8 7 66Z', fill:'url(#archive-face)', stroke:'#d3c8b3', 'stroke-width':'.7'}),
      svgNode('path', {d:'M7 66V4L133 -54', fill:'none', stroke:'#fffdf5', 'stroke-opacity':'.6'}),
      svgNode('path', {class:'archive-spine-mark', d:'M-7 20V52'}),
      svgNode('path', {class:'archive-slot', d:'M41 -22 65 -33 69 -31 45 -20Z'}),
      svgNode('path', {d:'M14 51 36 41M14 55 29 48', stroke:'#b2a489', 'stroke-width':'.8', opacity:'.6'})
    );
    file.append(model); scene.append(file);
  }
  archive.append(scene);
  const cols = 12, rows = 6, mines = new Set([3,10,14,20,29,34,37,44,51,58,64,69]);
  const board = document.querySelector('.preview-board');
  const covered = document.createElement('div'), revealed = document.createElement('div');
  covered.className = 'preview-layer preview-covered';
  revealed.className = 'preview-layer preview-reveal';
  for (let i = 0; i < cols * rows; i++) {
    const cover = document.createElement('span'), cell = document.createElement('span');
    cover.className = cell.className = 'preview-cell';
    if (mines.has(i)) {
      const mine = svgNode('svg', {class:'preview-mine', viewBox:'0 0 24 24', focusable:'false'});
      mine.innerHTML = '<path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5"/><circle cx="12" cy="12" r="5.5"/><circle cx="10" cy="10" r="1.4" fill="#eee8dd" stroke="none"/>';
      cell.append(mine);
    } else {
      let count = 0;
      const x = i % cols, y = Math.floor(i / cols);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && mines.has(ny * cols + nx)) count++;
      }
      cell.dataset.number = String(count); cell.textContent = count || '';
    }
    covered.append(cover); revealed.append(cell);
  }
  board.append(covered, revealed);
  let spotX = 0, spotY = 0;
  const clearPeek = () => {
    cancelAnimationFrame(peekFrame); peekFrame = 0;
    board.classList.remove('is-peeking');
  };
  board.addEventListener('pointermove', event => {
    if (!fine.matches || event.pointerType === 'touch' || navigating) return;
    const bounds = board.getBoundingClientRect();
    spotX = event.clientX - bounds.left - board.clientLeft;
    spotY = event.clientY - bounds.top - board.clientTop;
    if (!peekFrame) peekFrame = requestAnimationFrame(() => {
      board.style.setProperty('--spot-x', spotX + 'px');
      board.style.setProperty('--spot-y', spotY + 'px');
      board.classList.add('is-peeking'); peekFrame = 0;
    });
  });
  board.addEventListener('pointerleave', clearPeek);
  board.addEventListener('pointercancel', clearPeek);
  for (const el of terminals) el.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || el.target || reduced.matches) return;
    event.preventDefault(); if (navigating) return;
    navigating = true; clearPeek();
    el.classList.add('is-opening'); document.body.classList.add('access-departing');
    navigationTimer = setTimeout(() => location.assign(el.href), 320);
  });
  const reset = () => {
    clearTimeout(navigationTimer); navigating = false; clearPeek();
    document.body.classList.remove('access-departing');
    terminals.forEach(el => el.classList.remove('is-opening'));
  };
  addEventListener('pageshow', reset);
  // Scrolling can move the board away without sending a pointerleave event.
  addEventListener('scroll', clearPeek, {passive:true});
  addEventListener('blur', clearPeek);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPeek(); });
  fine.addEventListener('change', clearPeek);
})();
