/* The same document supplies both the cartridge preview and the live game. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('gameos') !== '1' || window.parent === window) return;
  document.documentElement.classList.add('game-os-embedded');
  let active = false;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const surface = () => document.querySelector('.game-shell') || document.querySelector('.td-stage');
  function board() { return document.getElementById('gameBoard') || document.getElementById('tdCanvas'); }
  function redraw() {
    const game = window.TD && window.TD.game;
    if (game) { game.fit(); game.rd.draw(game.eng, game.view); }
  }
  function previewPose() {
    window.scrollTo(0, 0);
    const el = surface();
    el.style.transform = 'none';
    const y = 16 - board().getBoundingClientRect().top;
    el.style.transform = `translateY(${y}px)`;
    redraw();
    return el.style.transform;
  }

  function setActive(value) {
    active = value;
    document.documentElement.classList.toggle('game-os-preview', !active);
    document.body.inert = !active;
    document.dispatchEvent(new CustomEvent('gameos:active', { detail: active }));
    const game = window.TD && window.TD.game;
    if (game) {
      game.paused = !active || document.hidden;
      game.last = 0;
      if (!active) game.rd.draw(game.eng, game.view);
    }
  }

  window.GameOSModule = {
    ready,
    setActive,
    surface,
    previewPose,
    unfold() { document.documentElement.classList.remove('game-os-preview'); },
    ejectPose() {
      // Scrolled game content must remain at its current screen position when
      // the iframe scroll is reset for the reverse transform.
      const offset = window.scrollY;
      const el = surface();
      window.scrollTo(0, 0);
      el.style.transform = `translateY(${-offset}px)`;
      const target = 16 - (board().getBoundingClientRect().top + offset);
      return { from:el.style.transform, to:`translateY(${target}px)` };
    },
    bounds() {
      const rect = board().getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
  };
  window.addEventListener('resize', () => { if (!active) redraw(); });
  window.addEventListener('load', async () => {
    // Minesweeper deals skill cards asynchronously. Wait for that real game,
    // rather than exposing a placeholder board which its init would replace.
    const state = () => window.MS_DEBUG && window.MS_DEBUG.state();
    while (state() && state().phase === 'dealing') {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    setActive(false);
    // Register after tower UI's visibility listener so inactive modules stay idle.
    document.addEventListener('visibilitychange', () => setActive(active));
    resolveReady();
  });
})();
