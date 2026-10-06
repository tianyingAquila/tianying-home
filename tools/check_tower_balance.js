"use strict";
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
function load(snapshot) {
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  for (const file of ["config", "grid", "enemies", "towers", "engine"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/game/tower", snapshot || "", file + ".js"), "utf8"), ctx);
  }
  return ctx.TD;
}
const TD = load(process.argv.includes("--original") ? "versions/v1.04" : "");
function actualDamage(eng) {
  let damage = 0;
  const hurt = eng.damage;
  eng.damage = function (e, ...args) {
    const hp = e.hp;
    hurt.call(this, e, ...args);
    damage += Math.max(0, hp - e.hp);
  };
  return () => Math.round(damage);
}
function candidates(eng, anchor) {
  const cells = [];
  for (let r = 0; r < eng.grid.rows; r++) for (let c = 0; c < eng.grid.cols; c++) {
    if (eng.grid.canBuild(c, r)) cells.push({ c, r, d: Math.hypot(c - anchor[0], r - anchor[1]) });
  }
  return cells.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
}
function duel(key, level, wave, anchor, slow) {
  const eng = new TD.Engine(4), getDamage = actualDamage(eng);
  eng.gold = 100000; eng.lives = 100000;
  const count = key === "bolt" ? TD.config.TOWERS.inferno.cost / TD.config.TOWERS.bolt.cost : 1;
  const cells = candidates(eng, anchor);
  for (let i = 0; i < count; i++) {
    eng.build(key, cells[i].c, cells[i].r);
    for (let l = 1; l < level; l++) eng.upgrade(eng.towers[i]);
  }
  if (slow) {
    const cell = candidates(eng, anchor)[0];
    eng.build("frost", cell.c, cell.r);
    eng.upgrade(eng.towers[count]); eng.upgrade(eng.towers[count]);
  }
  eng.start(); eng.waveIndex = wave - 1; eng.startNextWave();
  let tick = 0;
  while (eng.waveActive && tick++ < 30000) eng.step(1 / 60);
  return { damage: getDamage(), kills: eng.stats.kills, leaked: eng.stats.leaked };
}
function campaign(map, strategy, variant) {
  const eng = new TD.Engine(map), getDamage = actualDamage(eng);
  eng.enableActionLog();
  const formations = [
    ["chain", "chain", "frost", "aura", "inferno", "aura"],
    ["bolt", "bolt", "chain", "frost", "aura", "inferno", "chain", "aura"],
    ["aura", "bolt", "chain", "frost", "inferno", "chain", "aura"],
    ["chain", "aura", "frost", "aura", "chain", "inferno", "aura", "aura"]
  ];
  const focused = strategy === "focused";
  const keys = focused ? formations[variant % formations.length] : strategy === "bolt" ? ["bolt"] : strategy === "no-inferno" ? ["bolt", "frost", "chain", "rail", "aura"] : ["bolt", "frost", "chain", "inferno", "aura", "rail"];
  const targets = [];
  eng.grid.paths.forEach(p => {
    for (let d = 0; d < p.length; d += 0.8) {
      const pos = eng.grid.positionAt(p.index, d);
      targets.push({ ...pos, weight: p.weight * (focused && d < 42 ? 2 + Math.floor(variant / 4) % 3 : 1), covered: 0 });
    }
  });
  function purchase() {
    // 固定轮换塔种、贪心覆盖空白路段；只在波间消费，保留可复查的动作日志。
    for (let purchases = 0; purchases < 100; purchases++) {
      const upgrade = strategy !== "bolt" && eng.towers.find(t => t.level < 3 && (eng.towers.length >= 4 || t.level === 2) && eng.canAfford(t.upgradeCost()));
      if (upgrade) { eng.upgrade(upgrade); continue; }
      const key = keys[(eng.towers.length + (focused ? 0 : variant)) % keys.length], def = TD.config.TOWERS[key];
      if (!eng.canAfford(def.cost)) break;
      let best, bestScore = -1;
      for (const cell of candidates(eng, [10, 5])) {
        let score = 0;
        for (const p of targets) {
          if (Math.hypot(p.c - cell.c, p.r - cell.r) <= def.levels[0].range) score += p.weight / (1 + p.covered * 2);
        }
        score *= 1 + 0.015 * Math.sin(cell.c * 7 + cell.r * 11 + variant * 13);
        if (score > bestScore) { bestScore = score; best = cell; }
      }
      if (!best) break;
      eng.build(key, best.c, best.r);
      for (const p of targets) if (Math.hypot(p.c - best.c, p.r - best.r) <= def.levels[0].range) p.covered++;
    }
  }
  purchase(); eng.start();
  let lastWave = -1, tick = 0;
  while (eng.state === "running" && tick++ < 216000) {
    eng.realTime = eng.stepCount / 60;
    if (!eng.waveActive && eng.waveIndex !== lastWave) {
      if (focused && variant >= 24) eng.callWaveEarly();
      purchase(); lastWave = eng.waveIndex;
    }
    eng.step(1 / 60);
  }
  return { map, strategy, variant, state: eng.state, wave: eng.reachedWave(), lives: eng.lives, damage: getDamage(), towers: eng.towers.length, ticks: eng.stepCount, actions: eng.actions, result: eng.resultState() };
}
module.exports = { campaign, load };
if (require.main === module && process.argv.includes("--search")) {
  let best;
  for (let variant = 24; variant < 48; variant++) {
    const run = campaign(4, "focused", variant);
    console.log(JSON.stringify({ ...run, actions: undefined, result: undefined }));
    if (!best || run.lives > best.lives || (run.lives === best.lives && run.wave > best.wave)) best = run;
    if (run.state === "won" && run.lives === 20) {
      if (process.argv.includes("--verify")) {
        const replay = new TD.Engine(4);
        replay.runToTick(run.actions, run.ticks, 216000);
        if (JSON.stringify(replay.resultState()) !== JSON.stringify(run.result)) throw new Error("Replay mismatch");
      }
      console.log("Full-health legal campaign found: " + variant);
      break;
    }
  }
  if (best.state !== "won" || best.lives !== 20) process.exitCode = 1;
} else if (require.main === module && process.argv.includes("--campaign")) {
  const runs = [];
  for (const map of [3, 4]) for (const strategy of ["bolt", "mixed", "no-inferno"]) {
    if (map === 3 && strategy === "mixed") continue;
    for (let variant = 0; variant < 3; variant++) {
      const run = campaign(map, strategy, variant); runs.push(run);
      console.log(JSON.stringify({ ...run, actions: undefined, result: undefined }));
    }
  }
  if (process.argv.includes("--verify")) {
    for (const run of runs) {
      const replay = new TD.Engine(run.map);
      replay.runToTick(run.actions, run.ticks, 216000);
      if (JSON.stringify(replay.resultState()) !== JSON.stringify(run.result)) throw new Error("Replay mismatch");
    }
    console.log("All campaign action logs reproduce exactly");
  }
} else if (require.main === module) {
  const results = [];
  for (const level of [1, 3]) for (const wave of [4, 13, 17, 20]) for (const anchor of [[8, 4], [14, 6], [4, 6]]) for (const slow of [false, true]) {
    const inferno = duel("inferno", level, wave, anchor, slow), bolt = duel("bolt", level, wave, anchor, slow);
    results.push({ level, wave, anchor, slow, inferno, bolt, ratio: Number((inferno.damage / Math.max(1, bolt.damage)).toFixed(2)) });
  }
  if (process.argv.includes("--full")) console.log(JSON.stringify(results, null, 2));
  else for (const level of [1, 3]) for (const wave of [4, 13, 17, 20]) {
    const group = results.filter(r => r.level === level && r.wave === wave);
    const damage = key => group.reduce((sum, r) => sum + r[key].damage, 0);
    console.log(JSON.stringify({ level, wave, layouts: group.length, inferno: damage("inferno"), bolt: damage("bolt"), ratio: Number((damage("inferno") / damage("bolt")).toFixed(2)) }));
  }
}
