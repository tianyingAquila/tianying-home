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
  await wait(() => cards.every(card => card.classList.contains('is-ready')));
  for (let i = 0; i < cards.length; i++) {
    const target = cards.find(card => card.dataset.position === 'next');
    const incoming = cards[(cards.indexOf(target) + 1) % cards.length];
    const before = incoming.getBoundingClientRect().left;
    target.querySelector('.module-trigger').click();
    if (target.dataset.position !== 'current' || incoming.dataset.position !== 'next') throw new Error('轮换没有同时更新全部卡带');
    await new Promise(resolve => setTimeout(resolve, 300));
    if (incoming.getBoundingClientRect().left >= before || Number(getComputedStyle(incoming).opacity) <= .05) throw new Error('右侧卡带没有随本轮动画进入');
    await wait(() => !document.querySelector('.is-departing'));
    if (cards.some(card => card.getAnimations().some(animation => animation.playState === 'running'))) throw new Error('轮换结束后又启动第二段位移动画');
  }
  results.push('三游戏完整轮换：右侧同步进入、没有延迟补位通过');
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
    if (card.dataset.game === 'chaos-cards') {
      await wait(() => original.querySelector('.cc-online.connected'));
    }
    card.querySelector('.os-exit').click();
    await wait(() => state() === 'selecting');
    if (frame.contentDocument !== original || !original.body.inert) throw new Error('退出未保留并暂停游戏');
    results.push(card.dataset.game + ': 启动、退出、实例保留通过');
  }
  return results;
})();
