(() => {
  'use strict';
  if (window !== window.top) return;
  const root = document.documentElement;
  const portalKey = 'tianying:portal';
  const bootKey = 'tianying:home-boot';
  const ease = 'cubic-bezier(.32,.02,.2,1)';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let portal = null, leaving = false, ready = false, arrival = null, arrivalTimer = 0, bootTimer = 0;
  const storage = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { sessionStorage.removeItem(key); } catch {} }
  };
  try {
    const saved = JSON.parse(storage.get(portalKey));
    if (saved && saved.target === location.pathname && Date.now() - saved.time < 15000) arrival = saved;
  } catch {}
  storage.remove(portalKey);

  function createPortal(data) {
    const layer = document.createElement('div');
    layer.className = 'os-portal' + (data.dark ? ' is-dark' : '');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.background = data.background;
    const scene = document.createElement('div');
    scene.className = 'os-portal-scene';
    scene.style.width = data.width + 'px';
    scene.style.height = data.height + 'px';
    scene.innerHTML = data.html;
    layer.append(scene);
    root.append(layer);
    return layer;
  }
  function fullscreenScene(width, height) {
    const scale = Math.max(innerWidth / width, innerHeight / height);
    return `translate(${(innerWidth - width * scale) / 2}px,${(innerHeight - height * scale) / 2}px) scale(${scale})`;
  }
  if (arrival) {
    root.dataset.osArrival = '';
    portal = createPortal(arrival);
    Object.assign(portal.style, { left: '0px', top: '0px', width: '100vw', height: '100vh', borderRadius: '0px' });
    portal.firstElementChild.style.transform = fullscreenScene(arrival.width, arrival.height);
    arrivalTimer = setTimeout(reveal, 3500);
  }

  function reveal() {
    ready = true;
    if (!arrival || !portal) return;
    clearTimeout(arrivalTimer);
    arrival = null;
    const layer = portal;
    const duration = reduced.matches ? 280 : 420;
    const cleanup = () => { layer.remove(); if (portal === layer) portal = null; delete root.dataset.osArrival; };
    layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: ease, fill: 'forwards' }).finished.then(cleanup, cleanup);
  }
  addEventListener('os:scene-ready', () => requestAnimationFrame(() => requestAnimationFrame(reveal)));

  const home = /\/(?:index\.html)?$/.test(location.pathname);
  const navigation = performance.getEntriesByType('navigation')[0];
  const boot = home && navigation?.type !== 'back_forward' && !storage.get(bootKey);
  if (boot) {
    root.dataset.osBoot = 'armed';
    bootTimer = setTimeout(startBoot, 1600);
    addEventListener('os:home-ready', startBoot, { once: true });
  }
  function startBoot() {
    if (root.dataset.osBoot !== 'armed') return;
    clearTimeout(bootTimer);
    storage.set(bootKey, '1');
    root.dataset.osBoot = 'running';
    bootTimer = setTimeout(() => { delete root.dataset.osBoot; }, 1000);
  }

  addEventListener('DOMContentLoaded', () => {
    if (ready) reveal();
    document.addEventListener('click', async event => {
      const link = event.target.closest('a.access-terminal');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
      if (leaving) { event.preventDefault(); return; }
      const windowEl = link.querySelector('.access-window');
      const world = windowEl?.querySelector('.access-world');
      if (!world || !windowEl.animate) return;
      event.preventDefault();
      leaving = true;
      root.dataset.osLeaving = '';
      const box = windowEl.getBoundingClientRect();
      const clone = world.cloneNode(true);
      clone.querySelector('.is-peeking')?.classList.remove('is-peeking');
      const data = {
        target: new URL(link.href).pathname, time: Date.now(), html: clone.outerHTML,
        width: box.width, height: box.height, dark: document.body.dataset.theme === 'dark',
        background: getComputedStyle(windowEl).backgroundColor
      };
      portal = createPortal(data);
      const layer = portal, scene = layer.firstElementChild;
      Object.assign(layer.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
      const duration = reduced.matches ? 440 : 620;
      try {
        await Promise.all([
          layer.animate([
            { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px', borderRadius: '8px' },
            { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px', borderRadius: '0px' }
          ], { duration, easing: ease, fill: 'forwards' }).finished,
          scene.animate([{ transform: 'none' }, { transform: fullscreenScene(box.width, box.height) }], { duration, easing: ease, fill: 'forwards' }).finished
        ]);
      } catch {}
      if (!leaving || portal !== layer) return;
      storage.set(portalKey, JSON.stringify(data));
      location.assign(link.href);
    });
  });
  addEventListener('pageswap', event => { if (leaving) event.viewTransition?.skipTransition(); });
  function reset() {
    clearTimeout(arrivalTimer); clearTimeout(bootTimer);
    portal?.remove(); portal = null; arrival = null; leaving = false;
    delete root.dataset.osLeaving; delete root.dataset.osArrival; delete root.dataset.osBoot;
    storage.remove(portalKey);
  }
  addEventListener('pagereveal', () => { if (leaving) reset(); });
  addEventListener('pageshow', event => { if (event.persisted) reset(); });
})();
