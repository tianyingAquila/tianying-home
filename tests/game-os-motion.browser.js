(async () => {
  // Run in a fresh Chromium/Edge session, including reduced-motion emulation.
  const results = [];
  window.osMotionResults = results;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = () => document.body.dataset.osState;
  const cards = [...document.querySelectorAll('.os-module')];
  const mine = cards[0].querySelector('iframe').contentWindow;
  const tower = cards[1].querySelector('iframe').contentWindow;
  async function until(fn) {
    const end = performance.now() + 6000;
    while (!fn()) { if (performance.now() > end) throw Error('timeout'); await sleep(20); }
  }
  function check(name, ok, details) {
    results.push({name, ok:!!ok, details});
    if (!ok) throw Error(name + ': ' + JSON.stringify(details));
  }
  function position(card) {
    const f = card.querySelector('iframe'), w = f.contentWindow, b = w.GameOSModule.bounds();
    const m = new DOMMatrix(getComputedStyle(f).transform), aperture = card.querySelector('.module-window');
    return {x:b.x + b.width/2 + m.e - aperture.clientWidth/2, y:b.y + b.height/2 + m.f - aperture.clientHeight/2, scroll:w.scrollY, width:b.width, height:b.height};
  }
  async function centered(label) {
    // Delayed measurement catches transitions and post-layout canvas refits.
    await sleep(600);
    const positions = cards.map(position);
    check(label, positions.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.scroll===0), positions);
  }
  async function choose(card) {
    if (card.dataset.position==='current') return;
    const from=card.getBoundingClientRect().left, started=performance.now();
    card.querySelector('.module-trigger').click();
    await sleep(180);
    const middle=card.getBoundingClientRect().left;
    check('switch travels through intermediate position',middle<from-5&&middle>cards[0].parentElement.clientWidth*.2,{from,middle});
    await sleep(Math.max(0,720-(performance.now()-started)));
  }
  async function launch(card) {
    const w=card.querySelector('iframe').contentWindow, initial=w.GameOSModule.bounds(), started=performance.now();
    card.querySelector('.module-trigger').click();
    await sleep(160);
    check('launch stays animated and input remains locked',state()==='inserting'&&w.document.body.inert,{state:state(),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
    await until(()=>state()==='running');
    const after=w.GameOSModule.bounds(), duration=performance.now()-started;
    check('launch takes time without scaling game pixels',duration>1500&&duration<2400&&Math.abs(initial.width-after.width)<.01&&Math.abs(initial.height-after.height)<.01,{duration,initial,after});
  }
  async function eject(card) {
    card.querySelector('.os-exit').click(); await until(()=>state()==='selecting');
  }
  await until(()=>cards.every(c=>c.classList.contains('is-ready')));
  await centered('both initial previews are centered');
  for (const size of ['small','medium','large']) {
    await choose(cards[0]); await launch(cards[0]);
    mine.document.querySelector('[data-size='+size+']').click();
    const cols={small:10,medium:16,large:24}[size];
    await until(()=>mine.MS_DEBUG.state().cols===cols&&mine.MS_DEBUG.state().phase==='playing');
    mine.scrollTo(0,350); await sleep(100);
    await eject(cards[0]); await centered(size+' minesweeper returns without drift');
  }
  for (const map of [4,1,4]) {
    await choose(cards[1]); await launch(cards[1]);
    tower.document.querySelector('[data-map="'+map+'"]').click(); await sleep(150);
    tower.scrollTo(0,300); await sleep(100);
    await eject(cards[1]); await centered('tower map '+map+' returns without canvas drift');
  }
  await choose(cards[0]); await centered('repeated switching preserves both previews');
  return results;
})().then(results => { window.osMotionDone=true; return results; }).catch(error => { window.osMotionError=error.message; window.osMotionDone=true; throw error; });
