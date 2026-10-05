(function () {
  'use strict';
  const body = document.body;
  const cards = [...document.querySelectorAll('.os-module')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const progress = document.querySelector('.dock-progress');
  const status = document.getElementById('osStatus');
  const names = ['技能扫雷', '网格塔防'];
  const descriptions = [
    '三档棋盘，27 个正负面效果随机上身。连锁结算、三次提示、成绩上榜。',
    '四张地图：回廊、交错、汇流、螺旋。防御塔三级强化，末段波次逐步强化。'
  ];
  let current = 0;
  let busy = false;
  let needsResize = false;
  const modules = cards.map((card, index) => ({
    card, index, frame: card.querySelector('iframe'), window: card.querySelector('.module-window'),
    trigger: card.querySelector('.module-trigger'), exit: card.querySelector('.os-exit'), ready: false
  }));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const state = value => { body.dataset.osState = value; };
  function chromeActive(active) {
    document.querySelectorAll('.os-heading,.os-details,.os-footer,.os-selector-note').forEach(el => { el.inert = !active; });
    modules.forEach(m => { if (m.index !== current) m.card.inert = !active; });
  }

  function area() {
    const edge = innerWidth <= 760 ? 8 : 24;
    const top = document.querySelector('.site-header').getBoundingClientRect().bottom + 12;
    return { left: edge, top, width: document.body.clientWidth - edge * 2, height: Math.max(240, innerHeight - top - edge) };
  }
  function sizeFrame(module) {
    const target = area();
    module.frame.style.width = (target.width - 2) + 'px';
    module.frame.style.height = (target.height - 56) + 'px';
  }
  function shapeDock() {
    const dock = document.querySelector('.os-dock');
    const shoulder = Math.max(24, (1440 - (cards[current].offsetWidth + 48) / dock.clientWidth * 1440) / 2);
    const right = 1440 - shoulder;
    // The physical recess follows the cartridge width at every breakpoint.
    dock.querySelector('path').setAttribute('d', `M 1 160 V 25 Q 1 7 20 7 H ${shoulder - 19} Q ${shoulder} 7 ${shoulder} 26 V 49 Q ${shoulder} 57 ${shoulder + 10} 57 H ${right - 10} Q ${right} 57 ${right} 49 V 26 Q ${right} 7 ${right + 19} 7 H 1420 Q 1439 7 1439 25 V 160`);
  }
  function crop(module, w = module.window.clientWidth, h = module.window.clientHeight, bounds) {
    const b = bounds || module.frame.contentWindow.GameOSModule.bounds();
    // One preview pixel is one live-game pixel. A small aperture clips edges;
    // it never resizes the board, canvas, or the document inside the iframe.
    return `translate(${(w - b.width) / 2 - b.x}px, ${(h - b.height) / 2 - b.y}px)`;
  }
  function preview(module) {
    if (module.ready) {
      module.frame.contentWindow.GameOSModule.previewPose();
      module.frame.style.transform = crop(module);
      const win = module.frame.contentWindow;
      if (win.MS_DEBUG) {
        const g = win.MS_DEBUG.state();
        module.card.querySelector('.module-footer span').textContent = `${g.cols} × ${g.rows} / SKILL SYSTEM`;
      }
    }
  }
  function boxStyle(rect) {
    return { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' };
  }
  async function animate(element, from, to, duration) {
    if (reduced.matches) { Object.assign(element.style, to); return; }
    const animation = element.animate([from, to], { duration, easing: 'cubic-bezier(.32,.02,.2,1)', fill: 'both' });
    await animation.finished;
    Object.assign(element.style, to);
    animation.cancel();
  }
  function metadata() {
    const id = 'G-00' + (current + 1);
    document.getElementById('dockProgram').textContent = id;
    document.getElementById('osIndex').textContent = id + ' / 02';
    document.getElementById('osDescription').textContent = descriptions[current];
    modules.forEach((m, i) => m.trigger.setAttribute('aria-label', (i === current ? '插入并启动' : '选择') + names[i]));
    status.textContent = names[current] + ' / 点击卡带启动';
  }

  async function select(index) {
    if (busy || body.dataset.osState !== 'selecting' || index === current) return;
    busy = true;
    const old = cards[current];
    old.classList.add('is-departing');
    old.dataset.position = 'next';
    cards[index].dataset.position = 'current';
    current = index;
    metadata();
    await delay(reduced.matches ? 0 : 660);
    old.classList.remove('is-departing');
    busy = false;
    await refreshIfNeeded();
  }

  async function launch() {
    if (busy || body.dataset.osState !== 'selecting') return;
    const m = modules[current];
    if (!m.ready) { status.textContent = '程序仍在读取，请稍候再点击卡带。'; return; }
    busy = true;
    const hoverPose = getComputedStyle(m.card).transform;
    m.trigger.hidden = true;
    chromeActive(false);
    state('inserting');
    document.getElementById('dockPrompt').textContent = 'LOADING';
    status.textContent = '正在启动' + names[current];
    progress.setAttribute('aria-valuenow', '5');
    // Only the lower lip enters the persistent dock; there is no rotation.
    await animate(m.card, { transform:hoverPose }, { transform:'translateY(30px)' }, 320);
    progress.setAttribute('aria-valuenow', '25');
    const from = m.card.getBoundingClientRect();
    const windowFrom = { left: m.window.offsetLeft, top: m.window.offsetTop, width: m.window.offsetWidth, height: m.window.offsetHeight };
    const frameFrom = m.frame.style.transform;
    const bridge = m.frame.contentWindow.GameOSModule;
    const surfaceFrom = bridge.surface().style.transform;
    const target = area();
    m.card.classList.add('is-expanded');
    Object.assign(m.card.style, boxStyle(from), { transform: 'none' });
    m.window.style.right = 'auto';
    m.window.style.bottom = 'auto';
    Object.assign(m.window.style, boxStyle(windowFrom));
    // The source document keeps its natural layout. Only translations change,
    // so the board travels into place at exactly the preview's original size.
    await Promise.all([
      animate(m.card, boxStyle(from), boxStyle(target), 900),
      animate(m.window, boxStyle(windowFrom), boxStyle({ left:0, top:54, width:target.width - 2, height:target.height - 56 }), 900),
      animate(m.frame, { transform:frameFrom }, { transform:'translate(0px, 0px)' }, 900),
      animate(bridge.surface(), { transform:surfaceFrom }, { transform:'translateY(0px)' }, 900)
    ]);
    bridge.unfold();
    progress.setAttribute('aria-valuenow', '75');
    // Reveal controls after the board has settled, while input remains inert.
    await delay(reduced.matches ? 0 : 450);
    progress.setAttribute('aria-valuenow', '100');
    state('running');
    bridge.surface().style.transform = 'none';
    m.frame.contentWindow.GameOSModule.setActive(true);
    m.frame.removeAttribute('aria-hidden');
    m.frame.removeAttribute('tabindex');
    m.exit.focus({ preventScroll:true });
    busy = false;
    await refreshIfNeeded();
  }

  async function eject() {
    if (busy || body.dataset.osState !== 'running') return;
    busy = true;
    const m = modules[current];
    const bridge = m.frame.contentWindow.GameOSModule;
    const surfacePose = bridge.ejectPose();
    bridge.setActive(false);
    m.frame.setAttribute('aria-hidden', 'true');
    m.frame.setAttribute('tabindex', '-1');
    state('ejecting');
    await delay(reduced.matches ? 0 : 180);
    // Measure the current selector position even after a viewport resize.
    const probe = document.createElement('div');
    probe.className = 'os-module';
    probe.style.visibility = 'hidden';
    m.card.parentElement.append(probe);
    const target = probe.getBoundingClientRect();
    const windowProbe = document.createElement('div');
    windowProbe.className = 'module-window';
    probe.append(windowProbe);
    const toWindow = { left:windowProbe.offsetLeft, top:windowProbe.offsetTop, width:windowProbe.offsetWidth, height:windowProbe.offsetHeight };
    probe.remove();
    const from = m.card.getBoundingClientRect();
    const fromWindow = { left:m.window.offsetLeft, top:m.window.offsetTop, width:m.window.offsetWidth, height:m.window.offsetHeight };
    const frameTarget = crop(m, toWindow.width - 2, toWindow.height - 2, surfacePose.bounds);
    await Promise.all([
      animate(m.card, boxStyle(from), boxStyle(target), 850),
      animate(m.window, boxStyle(fromWindow), boxStyle(toWindow), 850),
      animate(m.frame, { transform:m.frame.style.transform }, { transform:frameTarget }, 850),
      animate(bridge.surface(), { transform:surfacePose.from }, { transform:surfacePose.to }, 850)
    ]);
    m.card.classList.remove('is-expanded');
    m.card.removeAttribute('style');
    m.window.removeAttribute('style');
    m.trigger.hidden = false;
    state('selecting');
    chromeActive(true);
    document.getElementById('dockPrompt').textContent = 'INSERT / EXECUTE';
    progress.setAttribute('aria-valuenow', '0');
    preview(m);
    metadata();
    m.trigger.focus({ preventScroll:true });
    busy = false;
    await refreshIfNeeded();
  }

  async function resize() {
    if (busy) { needsResize = true; return; }
    shapeDock();
    modules.forEach(sizeFrame);
    await nextFrame();
    if (body.dataset.osState === 'running') {
      const m = modules[current], target = area();
      Object.assign(m.card.style,boxStyle(target));
      Object.assign(m.window.style,boxStyle({ left:0,top:54,width:target.width-2,height:target.height-56 }));
      modules.filter(other => other !== m).forEach(preview);
    } else modules.forEach(preview);
  }
  async function refreshIfNeeded() {
    if (needsResize) { needsResize = false; await resize(); }
  }
  modules.forEach(m => {
    sizeFrame(m);
    let initializing = false;
    async function initialize() {
      if (initializing || m.ready) return;
      const bridge = m.frame.contentWindow.GameOSModule;
      if (!bridge) return;
      initializing = true;
      try {
        await bridge.ready;
        await nextFrame();
        m.ready = true;
        preview(m);
        m.card.classList.add('is-ready');
      } catch (error) {
        m.ready = false;
        m.card.querySelector('.module-loading').textContent = '读取失败，请刷新重试';
      }
    }
    m.frame.addEventListener('load', initialize);
    if (m.frame.contentDocument.readyState === 'complete') initialize();
    // Production protects full pages with X-Frame-Options: DENY and
    // frame-ancestors 'none'. Load the same trusted source into a same-origin
    // srcdoc instead, preserving those response headers and all game scripts.
    async function mount() {
      try {
        const response = await fetch(m.frame.dataset.src, { credentials:'same-origin' });
        if (!response.ok) throw new Error('Program response: ' + response.status);
        const source = new DOMParser().parseFromString(await response.text(), 'text/html');
        const base = source.createElement('base');
        base.href = new URL(m.frame.dataset.src, location.href).href;
        source.head.prepend(base);
        m.frame.srcdoc = '<!DOCTYPE html>' + source.documentElement.outerHTML;
      } catch (error) {
        m.card.querySelector('.module-loading').textContent = '读取失败，请刷新重试';
        status.textContent = names[m.index] + '暂时无法读取，请刷新重试。';
      }
    }
    mount();
    m.trigger.addEventListener('click', () => m.index === current ? launch() : select(m.index));
    m.exit.addEventListener('click', eject);
  });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize,100); });
  window.addEventListener('keydown', event => {
    if (event.target.closest('a,input,textarea')) return;
    if (body.dataset.osState === 'selecting' && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault(); select(1-current);
    }
    if (event.key === 'Escape' && body.dataset.osState === 'running') eject();
  });
  metadata();
  shapeDock();
})();
