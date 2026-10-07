(() => {
  'use strict';
  const clocks = document.querySelectorAll('.system-clock');
  if (!clocks.length) return;
  const tick = () => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    clocks.forEach(clock => { clock.textContent = time; });
  };
  tick();
  setInterval(tick, 1000);
})();
