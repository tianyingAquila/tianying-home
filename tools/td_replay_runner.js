/* 塔防成绩服务端复核器。
   输入 JSON 从 stdin 读取；加载对应版本的无头引擎；按动作日志重放；
   输出唯一一段 JSON。任何加载/执行错误都只返回 ok:false，由 PHP 记为“回放暂不可用”。 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => resolve(raw));
    process.stdin.on("error", reject);
  });
}

function normTowers(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    type: String(item && item.type || ""),
    c: Number(item && item.c),
    r: Number(item && item.r),
    level: Number(item && item.level),
  })).sort((a, b) => (a.c - b.c) || (a.r - b.r));
}

function sameTowers(a, b) {
  const left = JSON.stringify(normTowers(a));
  const right = JSON.stringify(normTowers(b));
  return left === right;
}

function expectedTimeMs(actions, finalTick) {
  let tick = 0;
  let speed = 1;
  let total = 0;
  for (const action of actions) {
    if (action.tick > finalTick) break;
    if (action.op === "speed") {
      total += ((action.tick - tick) * 1000) / 60 / speed;
      tick = action.tick;
      speed = action.speed === 2 ? 2 : 1;
    }
  }
  total += ((finalTick - tick) * 1000) / 60 / speed;
  return Math.round(total);
}

function loadEngine(version) {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("版本号不合法");
  const versionDir = path.resolve(__dirname, "..", "assets", "js", "game", "tower", "versions", version);
  if (!fs.existsSync(versionDir)) throw new Error("版本目录不存在");

  const sandbox = { console: console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ["config.js", "grid.js", "enemies.js", "towers.js", "engine.js"]) {
    const filePath = path.join(versionDir, file);
    const code = fs.readFileSync(filePath, "utf8");
    vm.runInContext(code, sandbox, { filename: filePath });
  }
  if (!sandbox.TD || !sandbox.TD.Engine) throw new Error("引擎加载失败");
  return sandbox.TD;
}

function compare(payload, result, expectedMs) {
  const mismatches = [];
  if (result.won !== Boolean(payload.won)) mismatches.push("胜负不一致");
  if (Number(result.wave) !== Number(payload.wave)) mismatches.push("波数不一致");
  if (Number(result.lives) !== Number(payload.lives)) mismatches.push("剩余生命不一致");
  if (Number(result.gold) !== Number(payload.gold)) mismatches.push("金币不一致");
  if (Number(result.leaked) !== Number(payload.leaked)) mismatches.push("漏怪数不一致");
  if (Number(result.kills) !== Number(payload.kills)) mismatches.push("击杀数不一致");
  if (Number(result.built) !== Number(payload.built)) mismatches.push("建塔数不一致");
  if (!sameTowers(result.towers, payload.deployment)) mismatches.push("最终部署不一致");
  if (Math.abs(Number(payload.timeMs) - expectedMs) > 2000) mismatches.push("用时误差超过 2 秒");
  return mismatches;
}

(async () => {
  try {
    const raw = await readStdin();
    const payload = JSON.parse(raw || "{}");
    if (!payload || typeof payload !== "object") throw new Error("输入不是对象");
    let actions = Array.isArray(payload.actions) ? payload.actions.slice() : [];
    if (actions.length > 2000) throw new Error("动作过多");
    if (!actions.some((action) => action && action.op === "start" && Number(action.tick) === 0)) {
      actions.unshift({ tick: 0, op: "start" });
    }
    const maxTicks = Math.max(1, Math.min(Number(payload.maxTicks) || 216000, 216000));
    const TD = loadEngine(String(payload.version || ""));
    const eng = new TD.Engine(Number(payload.map));
    const result = eng.runReplay(actions, maxTicks);
    if (result.state !== "won" && result.state !== "lost") {
      throw new Error("回放没有在限制内结束");
    }
    const expectedMs = expectedTimeMs(actions, result.ticks);
    const mismatches = compare(payload, result, expectedMs);
    process.stdout.write(JSON.stringify({
      ok: true,
      question: mismatches.length > 0,
      expectedTimeMs: expectedMs,
      mismatches,
      result: result,
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(error && error.message || error) }));
  }
})();
