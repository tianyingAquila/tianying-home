"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const base = path.resolve(__dirname, "../assets/js");
function element() {
  return { hidden: false, value: "", textContent: "", className: "", children: [],
    classList: { toggle() {}, add() {}, remove() {} }, style: { setProperty() {} },
    appendChild(item) { this.children.push(item); }, setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; } };
}
test("minesweeper late save response cannot mark next game saved", async () => {
  let resolve;
  const nodes = {};
  const ctx = { console, document: { readyState: "loading", addEventListener() {}, createElement: element },
    fetch: () => new Promise((r) => { resolve = r; }), setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  const source = fs.readFileSync(path.join(base, "game/minesweeper.js"), "utf8");
  vm.runInContext(source.replace('  const totalSafe =', '  window.__test = { G, el, saveScore, bindSetup };\n  const totalSafe ='), ctx);
  const { G, el, saveScore } = ctx.__test;
  for (const id of ["scoreName", "saveButton", "resultStatus", "scoreList", "scoreState", "scoreForm"]) el[id] = nodes[id] = element();
  Object.assign(G, { mode: "tier", tier: "easy", phase: "over", resultWon: true, gen: 1, endedAt: 6000, startedAt: 1000, submissionId: "a".repeat(32) });
  const pending = saveScore({ preventDefault() {} });
  G.gen++; G.phase = "playing"; G.savedThisGame = false; G.saving = false;
  resolve({ ok: true, json: async () => ({ ok: true, data: [] }) });
  await pending;
  assert.equal(G.savedThisGame, false); assert.equal(el.scoreForm.hidden, false);
});
test("tower late save response cannot mark restarted game saved", async () => {
  let resolve;
  const ctx = { console, document: { getElementById() { return null; } }, fetch: () => new Promise((r) => { resolve = r; }) };
  ctx.window = ctx; ctx.localStorage = { setItem() {} };
  ctx.TD = { config: { VERSION: "v1.03" } };
  vm.createContext(ctx);
  const source = fs.readFileSync(path.join(base, "game/tower/ui.js"), "utf8");
  vm.runInContext(source.replace('  /* 入口 */', '  window.__test = TowerGame;\n  /* 入口 */'), ctx);
  const game = Object.create(ctx.__test.prototype);
  Object.assign(game, { saved: false, saving: false, submissionId: "original", scores: [], renderBoard() {},
    el: { saveName: element(), saveBtn: element(), saveStatus: element(), saveForm: element() },
    eng: { state: "won", map: { id: 1 }, reachedWave: () => 18, lives: 20, gold: 10, stats: { kills: 10, leaked: 0, built: 0 }, realTime: 100, towers: [], actions: [] } });
  game.saveScore(); game.submissionId = "next"; game.saved = false;
  resolve({ ok: true, json: async () => ({ ok: true, data: [] }) });
  await new Promise((r) => setImmediate(r));
  assert.equal(game.saved, false); assert.equal(game.el.saveForm.hidden, false);
});
test("minesweeper setup changes only the next game's rules", () => {
  const ctx = { console, document: { readyState: "loading", addEventListener() {} } }; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(base, "game/effects.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(base, "game/minesweeper.js"), "utf8").replace('  const totalSafe =', '  window.__test = { G, el, bindSetup };\n  const totalSafe ='), ctx);
  const { G, el, bindSetup } = ctx.__test;
  const mode = element(), tier = element();
  mode.dataset = { mode: "free" }; tier.dataset = { tier: "hard" };
  mode.addEventListener = (_, fn) => { mode.click = fn; };
  tier.addEventListener = (_, fn) => { tier.click = fn; };
  for (const id of ["modeSwitch", "tierSwitch", "tierBlock", "freeBlock", "tierNote", "startButton", "restartButton", "flagToggle", "hint", "mineCount", "modeBadge", "immuneBadge", "hintCount"]) el[id] = element();
  el.modeSwitch.querySelectorAll = () => [mode]; el.tierSwitch.querySelectorAll = () => [tier];
  G.mode = "tier"; G.tier = "easy";
  bindSetup(); mode.click(); tier.click();
  assert.equal(G.mode, "tier"); assert.equal(G.tier, "easy");
  assert.equal(G.nextMode, "free"); assert.equal(G.nextTier, "hard");
});

test("tower map switch completes UI refresh in srcdoc and preserves standalone share URLs", () => {
  for (const embedded of [true, false]) {
    const historyCalls = [], updates = [];
    const ctx = { console, document: { getElementById() { return null; } },
      location: { href: embedded ? "about:srcdoc" : "https://example.test/tower.html", pathname: embedded ? "srcdoc" : "/tower.html" },
      history: { replaceState(...args) { if (embedded) throw new Error("srcdoc cannot rewrite history"); historyCalls.push(args); } },
      localStorage: { setItem() {} }, TD: { config: {} } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(base, "game/tower/ui.js"), "utf8").replace('  /* 入口 */', '  window.__test = TowerGame;\n  /* 入口 */'), ctx);
    const game = Object.create(ctx.__test.prototype);
    game.eng = { setMap(id) { updates.push(id); }, enableActionLog() {} };
    game.applyMap = () => updates.push("canvas-shop-legend");
    game.renderBoard = () => updates.push("leaderboard");
    game.switchMap(4);
    assert.deepEqual(updates, [4, "canvas-shop-legend", "leaderboard"]);
    assert.equal(historyCalls.length, embedded ? 0 : 1);
    if (!embedded) assert.equal(historyCalls[0][2], "/tower.html?map=4");
  }
});
