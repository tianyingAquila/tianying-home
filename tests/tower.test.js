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
  for (const version of ["v1.01", "v1.02", "v1.03", "v1.04"]) {
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
  for (const version of ["v1.01", "v1.02", "v1.03", "v1.04"]) {
    const dir = path.join(base, "versions", version);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
    for (const [file, hash] of Object.entries(manifest.files)) {
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex").toUpperCase(), hash);
    }
  }
});

test("map four follows every road cell in the reference and distributes 65/35", () => {
  const { TD } = load(), map = TD.config.mapById(4), grid = new TD.Grid(map);
  assert.deepEqual(Array.from(grid.paths, p => p.length), [93, 66]);
  assert.equal(map.waves.length, 20);
  const roads = [
    [7,8,9,10,11,12,13,14,15,16,17,18,19],
    [1,2,3,4,5,7,15,19], [1,5,7,9,10,11,12,13,15,17,18,19],
    [1,3,5,7,9,13,15,17], [1,3,5,7,9,10,11,13,15,17,18,19],
    [1,3,5,7,9,10,11,13,15,19], [1,3,5,7,9,10,11,13,15,17,19],
    [1,3,5,7,13,15,17,19], [1,3,4,5,7,8,9,10,11,12,13,15,17,19],
    [1,15,17,19], [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18,19]
  ];
  for (let r = 0; r < 11; r++) for (let c = 0; c < 20; c++) {
    assert.equal(grid.isPath(c, r), roads[r].includes(c), `road ${c},${r}`);
    assert.ok(!(grid.isPath(c, r) && grid.isBlock(c, r)), `overlap ${c},${r}`);
    assert.equal(grid.canBuild(c, r), !grid.isPath(c, r) && !grid.isBlock(c, r));
  }
  const blocks = [[0,1,2,3,4,5,6], [0,10,14], [0,2,3,16], [2,4,8,12,18], [0,4], [2,4,6,14], [0,6], [2,4,6,12,16], [0], [2,3,4,5,6,7,8,14,18], [0,16]];
  for (let r = 0; r < 11; r++) for (let c = 0; c < 20; c++) assert.equal(grid.isBlock(c, r), blocks[r].includes(c), `block ${c},${r}`);
  assert.equal(map.blocks.length, 44);
  const jobs = TD.buildSchedule({ no: 1, groups: [["drone", 100, 1, 0]] }, grid.paths);
  assert.equal(jobs.filter(job => job.path === 0).length, 65);
  assert.equal(jobs.filter(job => job.path === 1).length, 35);
  assert.ok(!map.towers.includes("mortar"));
  assert.ok(!map.enemies.includes("rusher") && !map.enemies.includes("splitter"));
  assert.equal(TD.config.ENEMIES.flash.hp, TD.config.ENEMIES.rusher.hp / 2);
  assert.equal(TD.config.ENEMIES.flash.speed, TD.config.ENEMIES.rusher.speed * 2.5);
});

test("inferno locks, ramps, survives upgrades and resets on target loss", () => {
  const { TD } = load(), eng = new TD.Engine(4), tower = new TD.Tower("inferno", 8, 4);
  const first = eng.spawn("warden", 0), next = eng.spawn("drone", 0);
  first.c = 9; first.r = 4; next.c = 9; next.r = 4;
  first.dist = 20; next.dist = 10;
  tower.updateBeam(5, eng.enemies, eng.grid);
  next.dist = 30;
  tower.updateBeam(5, eng.enemies, eng.grid);
  assert.equal(tower.beamTarget, first);
  assert.equal(tower.beamTime, 10);
  tower.upgrade(); assert.equal(tower.beamTime, 10);
  tower.updateBeam(10, eng.enemies, eng.grid);
  const bolt = TD.config.TOWERS.bolt.levels[1];
  assert.equal(tower.beamDps(), bolt.damage * bolt.rate * 10);
  first.alive = false;
  tower.updateBeam(1 / 60, eng.enemies, eng.grid);
  assert.equal(tower.beamTarget, next); assert.equal(tower.beamTime, 1 / 60);
  next.c = 30;
  assert.equal(tower.updateBeam(1 / 60, eng.enemies, eng.grid), null);
  assert.equal(tower.beamTime, 0);
});

test("continuous damage scales armor per second and records actual damage", () => {
  const { TD } = load(), eng = new TD.Engine(4), e = eng.spawn("hauler", 0), owner = new TD.Tower("inferno", 8, 4);
  for (let tick = 0; tick < 60; tick++) eng.damage(e, 30 / 60, { owner }, 8, 4, 1 / 60);
  assert.ok(Math.abs(e.hp - (e.maxHp - 26)) < 1e-8);
  eng.damage(e, 10000, { owner }, 8, 4, 1 / 60);
  assert.ok(Math.abs(owner.damageDealt - e.maxHp) < 1e-8);
  assert.equal(owner.kills, 1);
});

test("priest moves ten seconds, casts three seconds and may heal itself", () => {
  const { TD } = load(), eng = new TD.Engine(4), priest = eng.spawn("priest", 0);
  priest.hp = 20;
  for (let i = 0; i < 600; i++) priest.step(1 / 60, eng.grid);
  const dist = priest.dist;
  assert.ok(Math.abs(dist - 9.2) < 1e-8);
  for (let i = 0; i < 180; i++) priest.step(1 / 60, eng.grid);
  assert.ok(Math.abs(priest.dist - dist) < 1e-8);
  assert.equal(priest.healReady, true);
  eng.healFrom(priest); assert.equal(priest.hp, 105);
  priest.step(1 / 60, eng.grid); assert.ok(priest.dist > dist);
  eng.healFrom(priest); assert.equal(priest.hp, 170);
  const far = eng.spawn("warden", 1); far.c = 19; far.r = 10; far.hp = 1;
  eng.healFrom(priest); assert.equal(far.hp, 1);
  priest.alive = false; priest.hp = 0;
  eng.healFrom(priest); assert.equal(priest.hp, 0);
});

test("healing randomness is reproducible independently of visual randomness", () => {
  const { TD } = load();
  function run() {
    const eng = new TD.Engine(4), priest = eng.spawn("priest", 0);
    eng.spawn("hauler", 1); eng.spawn("warden", 0);
    for (const e of eng.enemies) e.hp = 1;
    for (let i = 0; i < 4; i++) eng.healFrom(priest);
    return eng.enemies.map(e => e.hp);
  }
  assert.deepEqual(run(), run());
});

test("first three maps retain v1.03 battle results", () => {
  const current = load().TD, previous = load("v1.03").TD;
  for (const map of [1, 2, 3]) {
    const a = new current.Engine(map), b = new previous.Engine(map);
    assert.equal(JSON.stringify(a.map), JSON.stringify(b.map));
    const log = [{ tick: 0, op: "build", type: "bolt", c: map === 3 ? 2 : 0, r: 1 }, { tick: 0, op: "start" }];
    a.runToTick(log, 15000, 15000); b.runToTick(log, 15000, 15000);
    assert.equal(JSON.stringify(a.resultState()), JSON.stringify(b.resultState()));
  }
});
