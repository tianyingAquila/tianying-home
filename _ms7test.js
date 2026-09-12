(async function () {
  const out = { done: false, tests: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sink = document.getElementById("testOut");
  const st = () => window.MS_DEBUG.state();
  const publish = () => sink && (sink.textContent = JSON.stringify(out));
  const record = (name, ok, detail) => {
    out.tests.push({ name, ok: !!ok, detail });
    publish();
  };
  let seed = 424242;
  const seeded = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const T = (p, ms, label) =>
    Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error("timeout:" + label)), ms))]);
  const cellAt = (x, y) => st().cells.find((c) => c.x === x && c.y === y);

  for (let i = 0; i < 200 && !window.MS_DEBUG; i += 1) await sleep(100);

  try {
    MS_DEBUG.setRng(seeded);
    MS_DEBUG.open();
    await sleep(2000);

    // A. 沙尘：盖住的格子要恢复成"未翻开"的原样（无图标、无特殊样式），还能再点开
    MS_DEBUG.setSizeId("medium");
    await T(MS_DEBUG.startFree(["debuff_sand"]), 30000, "sand");
    await T(MS_DEBUG.reveal(8, 8), 60000, "sand click");
    let s = st();
    for (const m of s.cells.filter((c) => c.mine && !c.flagged)) {
      if ((st().counts.debuff_sand || 0) >= 1) break;
      await T(MS_DEBUG.flag(m.x, m.y), 60000, "sand flag");
    }
    s = st();
    const sanded = s.cells.filter((c) => c.sand);
    await sleep(1400); // 等覆盖动画播完，看最终形态
    const dom = sanded.map((c) => {
      const n = document.querySelector(`.ms-cell[data-x="${c.x}"][data-y="${c.y}"]`);
      return {
        x: c.x, y: c.y,
        revealed: c.revealed,
        hasIcon: n ? n.children.length > 0 || n.innerHTML.trim().length > 0 : null,
        cls: n ? n.className : null,
      };
    });
    record("沙尘盖住的格子 = 未翻开原样（无图标、无特殊样式）", sanded.length >= 1 && dom.every((d) => !d.revealed && !d.hasIcon && !String(d.cls).includes("is-sand")), { sanded: dom });
    let reopened = false;
    if (sanded.length) {
      await T(MS_DEBUG.reveal(sanded[0].x, sanded[0].y), 60000, "reopen");
      const c = cellAt(sanded[0].x, sanded[0].y);
      reopened = c.revealed === true && c.sand === false;
    }
    record("被沙尘盖住的格子能再点开", reopened, { reopened });

    // B. 光扫 = 严格相等：多一面不行、少一面不行
    await T(MS_DEBUG.startFree([]), 30000, "sweep");
    await T(MS_DEBUG.reveal(8, 8), 30000, "sweep click");
    s = st();
    const mines = s.cells.filter((c) => c.mine);
    for (let i = 0; i < mines.length - 1; i += 1) {
      await T(MS_DEBUG.flag(mines[i].x, mines[i].y), 30000, "flag mine " + i);
    }
    const wrong = s.cells.find((c) => !c.mine && !c.flagged && !c.revealed);
    await T(MS_DEBUG.flag(wrong.x, wrong.y), 30000, "wrong flag");
    s = st();
    const blockedWithWrong = s.phase === "playing" && s.flags === s.mines;
    await T(MS_DEBUG.flag(mines[mines.length - 1].x, mines[mines.length - 1].y), 30000, "last mine");
    s = st();
    const blockedWithExtra = s.phase === "playing" && s.flags === s.mines + 1;
    const wrongCell = cellAt(wrong.x, wrong.y);
    await T(MS_DEBUG.flag(wrong.x, wrong.y), 60000, "remove wrong");
    s = st();
    record(
      "光扫严格相等：多一面/少一面都不触发，改正后立刻通关",
      blockedWithWrong && blockedWithExtra && s.phase === "over" && s.resultWon === true,
      { blockedWithWrong, blockedWithExtra, finalPhase: s.phase, won: s.resultWon, flags: s.flags, mines: s.mines, wrongCell }
    );

    // C. 允许插旗超过雷数（负数）
    await T(MS_DEBUG.startFree([]), 30000, "neg");
    await T(MS_DEBUG.reveal(8, 8), 30000, "neg click");
    s = st();
    const negMines = s.cells.filter((c) => c.mine && !c.flagged);
    for (let i = 0; i < negMines.length - 1; i += 1) {
      await T(MS_DEBUG.flag(negMines[i].x, negMines[i].y), 30000, "neg mine " + i);
    }
    const extraCells = s.cells.filter((c) => !c.mine && !c.flagged && !c.revealed).slice(0, 2);
    for (const c of extraCells) {
      await T(MS_DEBUG.flag(c.x, c.y), 30000, "neg extra");
    }
    s = st();
    record("插旗可以超过雷数（HUD 显示负数）", s.flags > s.mines && Number(document.getElementById("mineCount").textContent) < 0, {
      flags: s.flags, mines: s.mines, hud: document.getElementById("mineCount").textContent,
    });

    out.done = true;
    publish();
  } catch (error) {
    out.fatal = String((error && error.stack) || error);
    out.done = true;
    publish();
  }
})();
