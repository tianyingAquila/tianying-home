"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const crypto = require("node:crypto");
const base = path.resolve(__dirname, "../assets/js/game/tower");
function load(version) {
  const ctx = { console }; ctx.window = ctx;
  vm.createContext(ctx);
  for (const name of ["config", "grid", "enemies", "towers", "engine"]) {
    vm.runInContext(fs.readFileSync(path.join(base, version ? "versions/" + version : "", name + ".js"), "utf8"), ctx);
  }
  return ctx;
}
const actions = [
  { tick: 0, op: "build", type: "bolt", c: 0, r: 0 },
  { tick: 0, op: "upgrade", c: 0, r: 0 },
  { tick: 0, op: "start" },
  { tick: 3, op: "sell", c: 0, r: 0 },
  { tick: 3, op: "build", type: "bolt", c: 0, r: 0 },
  { tick: 4, op: "pause" }, { tick: 4, op: "resume" },
];
test("chunked replay equals a single replay, including seek boundaries", () => {
  const { TD } = load();
  const single = new TD.Engine(1), chunks = new TD.Engine(1);
  single.runToTick(actions, 30, 100);
  for (let tick = 0; tick <= 30; tick++) chunks.runToTick(actions, tick, 100);
  assert.equal(JSON.stringify(chunks.resultState()), JSON.stringify(single.resultState()));
});
test("browser shell adapts old frozen engines without editing them", () => {
  for (const version of ["v1.01", "v1.02", "v1.03"]) {
    const ctx = load(version);
    ctx.document = { getElementById() {} };
    vm.runInContext(fs.readFileSync(path.join(base, "replay.js"), "utf8").replace("  init();", "  window.__test = { state, makeEngine };"), ctx);
    ctx.__test.state.record = { map: 1 };
    const single = ctx.__test.makeEngine(), chunks = ctx.__test.makeEngine();
    single.runToTick(actions, 30, 100);
    for (let tick = 0; tick <= 30; tick++) chunks.runToTick(actions, tick, 100);
    assert.equal(JSON.stringify(chunks.resultState()), JSON.stringify(single.resultState()), version);
  }
});
test("dead enemies at the exit cannot leak or cost a life", () => {
  const { TD } = load(), eng = new TD.Engine(1);
  eng.start();
  const e = eng.spawn("drone", 0, eng.grid.paths[0].length - 0.001);
  eng.damage(e, 100000, null, 0, 0);
  eng.step(1 / 60);
  assert.equal(eng.lives, 20); assert.equal(eng.stats.kills, 1); assert.equal(eng.stats.leaked, 0);
});
test("ended games keep their final deployment and gold", () => {
  const { TD } = load(), eng = new TD.Engine(1);
  eng.build("bolt", 0, 0); eng.state = "won";
  const before = JSON.stringify(eng.resultState());
  assert.equal(eng.upgrade(eng.towers[0]), false);
  assert.equal(eng.sell(eng.towers[0]), false);
  assert.equal(eng.build("bolt", 1, 0), false);
  assert.equal(JSON.stringify(eng.resultState()), before);
});
test("all frozen manifests still match their files", () => {
  for (const version of ["v1.01", "v1.02", "v1.03"]) {
    const dir = path.join(base, "versions", version);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
    for (const [file, hash] of Object.entries(manifest.files)) {
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex").toUpperCase(), hash);
    }
  }
});
