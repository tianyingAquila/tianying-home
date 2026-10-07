// 在 games.html 控制台运行：启动、退出与实例保留。
(async () => {
  const wait = async predicate => {
    const deadline = performance.now() + 8000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('游戏未进入预期状态');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  };
  const cards = [...document.querySelectorAll('.os-module')];
  const state = () => document.body.dataset.osState;
  if (state() === 'running') {
    document.querySelector('.is-expanded .os-exit').click();
    await wait(() => state() === 'selecting');
  }
  const results = [];
  for (const card of cards) {
    await wait(() => card.classList.contains('is-ready'));
    if (card.dataset.position !== 'current') {
      card.querySelector('.module-trigger').click();
      await wait(() => document.getAnimations().every(animation => animation.playState !== 'running'));
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const frame = card.querySelector('iframe'), original = frame.contentDocument;
    card.querySelector('.module-trigger').click();
    await wait(() => state() === 'running');
    if (frame.contentDocument !== original || original.body.inert) throw new Error('启动未恢复原游戏');
    card.querySelector('.os-exit').click();
    await wait(() => state() === 'selecting');
    if (frame.contentDocument !== original || !original.body.inert) throw new Error('退出未保留并暂停游戏');
    results.push(card.dataset.game + ': 启动、退出、实例保留通过');
  }
  return results;
})();
