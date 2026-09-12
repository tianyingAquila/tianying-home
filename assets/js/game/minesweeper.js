/* ==========================================================================
   技能扫雷
   --------------------------------------------------------------------------
   - 16x16 / 40 雷，首击安全（首击格和它的 8 邻格不布雷，所以首击必为 0）
     （负面效果可以增加本局雷数，首击安全规则不变）
   - 一次玩家操作 = 一个事务：锁定输入 → 结算 → 播完所有连锁动画 → 解锁
   - 单次事务最多 30 个连锁事件、8 层深度，超限只停止派发新事件
   - 效果逻辑全部写在 assets/js/game/effects.js
   ========================================================================== */

(function () {
  "use strict";

  const FALLBACK = {
    config: { cols: 16, rows: 16, mines: 40, maxChainEvents: 30, maxChainDepth: 8, mistChance: 0.1 },
    tiers: {
      easy: { id: "easy", label: "简单", buffs: 4, debuffs: 1, desc: "" },
      normal: { id: "normal", label: "普通", buffs: 3, debuffs: 2, desc: "" },
      hard: { id: "hard", label: "困难", buffs: 2, debuffs: 3, desc: "" },
    },
    buffs: [],
    debuffs: [],
  };

  const SOURCE = window.MS_EFFECTS || FALLBACK;
  const CFG = Object.assign({}, FALLBACK.config, SOURCE.config || {});
  const TIERS = SOURCE.tiers || FALLBACK.tiers;
  const BUFFS = SOURCE.buffs || [];
  const DEBUFFS = SOURCE.debuffs || [];
  const ABORT = Symbol("ms-abort");

  const ICONS = {
    radar:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.4"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5"/><path d="M12 19.5A7.5 7.5 0 0 1 4.5 12"/><path d="M12 8.6a3.4 3.4 0 0 1 3.4 3.4"/></svg>',
    mist:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 9.5a3.5 3.5 0 1 1 5.3 3c-.9.6-1.3 1.1-1.3 2.1"/><circle cx="12.4" cy="18" r="0.9" fill="currentColor" stroke="none"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.6" y="3.6" width="7" height="7" rx="1.8"/><path d="M8 7.1h3.4"/><path d="M14.6 16.9h5.8M17.5 14v5.8"/><rect x="14.2" y="14.2" width="6.2" height="6.2" rx="1.6" stroke-dasharray="2.6 2.2"/></svg>',
    flagplus:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20.4V4.6"/><path d="M7 5.2h7.4l-1.6 3.3 1.6 3.3H7z"/><path d="M17.4 15.4h4.2M19.5 13.3v4.2"/></svg>',
    headstart:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 20.4V4.8"/><path d="M6.4 5.4h7.2l-1.6 3.3 1.6 3.3H6.4z"/><path d="M17.4 8.2l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2-1.5-1.4 2-.3z"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l6.2 2.3v5.5c0 3.6-2.5 6.8-6.2 8.6-3.7-1.8-6.2-5-6.2-8.6V5.9z"/><path d="M9 12.1l2.1 2.1 4-4.2"/></svg>',
    mineplus:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="4.4"/><path d="M11 3.6v2.4M11 16v2.4M3.6 11h2.4M16 11h2.4M5.8 5.8l1.7 1.7M14.5 14.5l1.7 1.7M16.2 5.8l-1.7 1.7M7.5 14.5l-1.7 1.7"/><path d="M18.4 18h4.2M20.5 15.9v4.2"/></svg>',
    blank:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke-dasharray="3 3"/></svg>',
  };

  const FLAG_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="glyph-flag" d="M8 20V4.8"/><path class="glyph-flag" d="M8 5.4h7.6l-1.6 3.4 1.6 3.4H8z"/></svg>';
  const MINE_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="glyph-mine" cx="12" cy="12" r="4.6" fill="currentColor" fill-opacity="0.22"/><path class="glyph-mine" d="M12 4.4v3M12 16.6v3M4.4 12h3M16.6 12h3M6.6 6.6l2.1 2.1M15.3 15.3l2.1 2.1M17.4 6.6l-2.1 2.1M8.7 15.3l-2.1 2.1"/></svg>';

  const el = {};
  const G = {
    gen: 0,
    cells: [],
    nodes: {},
    cols: CFG.cols,
    rows: CFG.rows,
    mines: CFG.mines,
    phase: "idle", // idle | dealing | playing | over
    placed: false,
    flags: 0,
    revealedSafe: 0,
    seq: 0,
    startedAt: 0,
    endedAt: 0,
    timerId: 0,
    tx: null,
    txSeq: 0,
    effects: [],
    fxState: {},
    fired: new Set(),
    reserved: new Set(),
    counts: {},
    mode: "tier",
    tier: "normal",
    freeSelection: new Set(["buff_radar2", "debuff_mist"]),
    flagMode: false,
    rng: Math.random,
    scores: [],
    scoreTab: "rank",
    savedThisGame: false,
    panelOpen: false,
  };

  const totalSafe = () => G.cols * G.rows - G.mines;
  const key = (cell) => cell.y * G.cols + cell.x;
  const rnd = () => G.rng();
  const randInt = (n) => Math.floor(rnd() * n);
  const sleep = (ms) => {
    const token = G.tx ? G.tx.token : -1;
    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
        if (token !== -1 && G.txSeq !== token) {
          reject(ABORT);
          return;
        }
        resolve();
      }, Math.max(0, ms));
    });
  };

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = randInt(i + 1);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function at(x, y) {
    if (x < 0 || y < 0 || x >= G.cols || y >= G.rows) {
      return null;
    }
    return G.cells[y * G.cols + x];
  }

  function neighbors(cell) {
    const list = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const n = at(cell.x + dx, cell.y + dy);
        if (n) {
          list.push(n);
        }
      }
    }
    return list;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y);
  }

  // ---------------------------------------------------------------- 棋盘数据

  function buildCells() {
    G.gen += 1;
    G.cells = [];
    G.nodes = {};
    G.fxState = {};
    G.fired = new Set();
    G.reserved = new Set();
    G.counts = {};
    G.flags = 0;
    G.revealedSafe = 0;
    G.seq = 0;
    G.placed = false;
    for (let y = 0; y < G.rows; y += 1) {
      for (let x = 0; x < G.cols; x += 1) {
        G.cells.push({
          x,
          y,
          mine: false,
          value: 0,
          revealed: false,
          flagged: false,
          misted: false,
          wrong: false,
          exploded: false,
          revealSeq: 0,
        });
      }
    }
  }

  // 首击格 + 它的 8 邻格都不布雷：首击格因此必然是 0，会按标准规则自动扩散。
  function placeMines(safeX, safeY) {
    const safe = new Set();
    const start = at(safeX, safeY);
    if (start) {
      safe.add(key(start));
      neighbors(start).forEach((n) => safe.add(key(n)));
    }
    const pool = G.cells.filter((c) => !safe.has(key(c)));
    shuffle(pool);
    const count = Math.min(G.mines, pool.length);
    for (let i = 0; i < count; i += 1) {
      pool[i].mine = true;
    }
    G.cells.forEach((cell) => {
      cell.value = neighbors(cell).filter((n) => n.mine).length;
    });
    G.placed = true;
  }

  function collectReveal(start) {
    const out = [];
    const seen = new Set([key(start)]);
    const queue = [{ cell: start, dist: 0 }];
    let head = 0;
    while (head < queue.length) {
      const item = queue[head];
      head += 1;
      const cell = item.cell;
      if (cell.revealed || cell.flagged) {
        continue;
      }
      out.push(item);
      if (cell.mine || cell.value !== 0) {
        continue;
      }
      neighbors(cell).forEach((n) => {
        if (n.revealed || n.flagged) {
          return;
        }
        const k = key(n);
        if (seen.has(k)) {
          return;
        }
        seen.add(k);
        queue.push({ cell: n, dist: item.dist + 1 });
      });
    }
    return out;
  }

  function collectChord(cell) {
    if (!cell.revealed || cell.value <= 0) {
      return null;
    }
    const ns = neighbors(cell);
    const flags = ns.filter((n) => n.flagged).length;
    if (flags !== cell.value) {
      return null;
    }
    const targets = ns.filter((n) => !n.flagged && !n.revealed);
    if (!targets.length) {
      return null;
    }
    const merged = new Map();
    targets.forEach((t) => {
      collectReveal(t).forEach((entry) => {
        const k = key(entry.cell);
        const dist = entry.dist + 1;
        const prev = merged.get(k);
        if (prev === undefined || dist < prev) {
          merged.set(k, dist);
        }
      });
    });
    return Array.from(merged.entries()).map(([k, dist]) => ({ cell: G.cells[k], dist }));
  }

  function removeFlag(cell) {
    if (!cell.flagged) {
      return;
    }
    cell.flagged = false;
    G.flags -= 1;
  }

  // ------------------------------------------------------------------ 渲染

  function buildBoardNodes() {
    const frag = document.createDocumentFragment();
    el.board.innerHTML = "";
    // 行和列都按配置写死成等分轨道，格子永远保持一样大，不会因为内容不同而变形。
    el.board.style.gridTemplateColumns = `repeat(${G.cols}, minmax(0, 1fr))`;
    el.board.style.gridTemplateRows = `repeat(${G.rows}, minmax(0, 1fr))`;
    G.cells.forEach((cell) => {
      const node = document.createElement("div");
      node.className = "ms-cell";
      node.setAttribute("role", "gridcell");
      node.dataset.x = String(cell.x);
      node.dataset.y = String(cell.y);
      frag.appendChild(node);
      G.nodes[key(cell)] = node;
    });
    el.board.appendChild(frag);
  }

  function paintCell(cell, option) {
    const node = G.nodes[key(cell)];
    if (!node) {
      return;
    }
    const dissolving = option === "dissolve";
    const plain = option === "plain";
    node.className = "ms-cell";
    node.textContent = "";

    if (cell.revealed) {
      node.classList.add("is-revealed");
      if (cell.mine) {
        node.classList.add("is-mine");
        if (cell.exploded) {
          node.classList.add("is-exploded");
        }
        node.innerHTML = MINE_SVG;
      } else if (cell.value > 0) {
        const misted = cell.misted && !plain && !dissolving;
        if (misted) {
          node.classList.add("is-misted");
          node.textContent = "?";
        } else {
          node.classList.add("num-" + cell.value);
          node.textContent = String(cell.value);
          if (dissolving) {
            node.classList.add("is-dissolving");
          }
        }
      }
    } else if (cell.flagged) {
      node.classList.add("is-flagged");
      if (cell.wrong) {
        node.classList.add("is-wrong");
        node.innerHTML = "";
        return;
      }
      node.innerHTML = FLAG_SVG;
    } else if (cell.wrong) {
      node.classList.add("is-wrong");
    }

    node.setAttribute(
      "aria-label",
      `第 ${cell.y + 1} 行第 ${cell.x + 1} 列，${
        cell.revealed ? (cell.mine ? "雷" : cell.value === 0 ? "空" : `数字 ${cell.value}`) : cell.flagged ? "已插旗" : "未揭开"
      }`
    );
  }

  function paintAll() {
    G.cells.forEach((cell) => paintCell(cell));
  }

  function flashCell(cell, className) {
    const node = G.nodes[key(cell)];
    if (!node) {
      return;
    }
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    window.setTimeout(() => node.classList.remove(className), 700);
  }

  function updateHud() {
    el.mineCount.textContent = String(Math.max(0, G.mines - G.flags));
    el.modeBadge.textContent =
      G.mode === "free" ? (G.freeSelection.size ? `自由 · ${G.freeSelection.size} 个效果` : "自由 · 纯扫雷") : `难度 · ${TIERS[G.tier].label}`;
    el.modeBadge.classList.toggle("is-free", G.mode === "free");
  }

  function formatClock(ms, withTenth) {
    const total = Math.max(0, Number(ms) || 0) / 1000;
    const m = Math.floor(total / 60);
    const s = withTenth ? (total % 60).toFixed(1) : String(Math.floor(total % 60)).padStart(2, "0");
    const seconds = withTenth && Number(s) < 10 ? `0${s}` : s;
    return `${String(m).padStart(2, "0")}:${seconds}`;
  }

  function renderTimer() {
    const ms = G.startedAt ? (G.endedAt || Date.now()) - G.startedAt : 0;
    el.timerText.textContent = formatClock(ms, false);
  }

  function startTimer() {
    if (G.startedAt) {
      return;
    }
    G.startedAt = Date.now();
    renderTimer();
    G.timerId = window.setInterval(renderTimer, 100);
  }

  function stopTimer() {
    if (G.timerId) {
      window.clearInterval(G.timerId);
      G.timerId = 0;
    }
    renderTimer();
  }

  // ------------------------------------------------------------ 动画与特效

  async function animateReveal(batch) {
    const gen = G.gen;
    const maxDist = batch.reduce((acc, item) => Math.max(acc, item.dist), 0);
    batch.forEach((item) => {
      const delay = Math.min(item.dist * 18, 460);
      window.setTimeout(() => {
        if (gen !== G.gen) {
          return;
        }
        paintCell(item.cell, "plain");
        flashCell(item.cell, "is-revealing");
      }, delay);
    });
    const spread = Math.min(maxDist * 18, 460);
    await sleep(spread + 280);
  }

  async function animateMist(cells) {
    const gen = G.gen;
    for (const cell of cells) {
      if (gen !== G.gen) {
        return;
      }
      const node = G.nodes[key(cell)];
      if (!node) {
        continue;
      }
      node.textContent = String(cell.value);
      node.classList.add("num-" + cell.value);
      await sleep(120);
      node.classList.add("is-misting");
      paintCell(cell);
      await sleep(200);
      node.classList.remove("is-misting");
    }
  }

  function cellCenter(cell, wrapRect) {
    const node = G.nodes[key(cell)];
    if (!node) {
      return { x: 0, y: 0 };
    }
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left - wrapRect.left + rect.width / 2,
      y: rect.top - wrapRect.top + rect.height / 2,
    };
  }

  async function radarBeam(from, to) {
    const wrapRect = el.boardWrap.getBoundingClientRect();
    el.radar.setAttribute("width", String(Math.round(wrapRect.width)));
    el.radar.setAttribute("height", String(Math.round(wrapRect.height)));
    const a = cellCenter(from, wrapRect);
    const b = cellCenter(to, wrapRect);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(96, len * 0.34);
    const cx = midX + (-dy / len) * bend;
    const cy = midY + (dx / len) * bend;

    const ns = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`);
    path.setAttribute("class", "radar-path");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("class", "radar-dot");
    el.radar.appendChild(path);
    el.radar.appendChild(dot);

    const steps = 16;
    const frames = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const inv = 1 - t;
      const x = inv * inv * a.x + 2 * inv * t * cx + t * t * b.x;
      const y = inv * inv * a.y + 2 * inv * t * cy + t * t * b.y;
      frames.push({ transform: `translate(${x}px, ${y}px)` });
    }
    let finished = true;
    try {
      const anim = dot.animate(frames, { duration: 380, easing: "ease-in-out", fill: "forwards" });
      await anim.finished;
    } catch (error) {
      finished = false;
    }
    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", String(b.x));
    ring.setAttribute("cy", String(b.y));
    ring.setAttribute("r", "6");
    ring.setAttribute("class", "radar-ring");
    el.radar.appendChild(ring);
    try {
      await ring
        .animate([{ r: 6, opacity: 0.9 }, { r: 26, opacity: 0 }], { duration: 420, easing: "ease-out" })
        .finished;
    } catch (error) {
      finished = finished && false;
    }
    path.remove();
    dot.remove();
    ring.remove();
    return finished;
  }

  function burstParticles() {
    const wrapRect = el.boardWrap.getBoundingClientRect();
    const cx = wrapRect.width / 2;
    const cy = wrapRect.height / 2;
    const count = 30;
    for (let i = 0; i < count; i += 1) {
      const node = document.createElement("span");
      node.className = "burst-particle";
      node.style.left = `${cx}px`;
      node.style.top = `${cy}px`;
      el.particles.appendChild(node);
      const angle = (Math.PI * 2 * i) / count + rnd() * 0.4;
      const dist = 90 + rnd() * 190;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const size = 4 + rnd() * 7;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.4)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 0 },
        ],
        { duration: 900 + rnd() * 500, easing: "cubic-bezier(.2,.7,.3,1)" }
      ).finished
        .catch(() => {})
        .then(() => node.remove());
    }
  }

  function showVignette() {
    const node = document.createElement("div");
    node.className = "damage-vignette";
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 800);
  }

  // 棋盘上方的浮动提示：某个效果触发时让玩家看得见。
  function showBoardToast(text, effectId) {
    if (!el.toasts || !text) {
      return;
    }
    const def = G.effects.find((item) => item.id === effectId);
    const node = document.createElement("span");
    node.className = `board-toast is-${def && def.type === "debuff" ? "debuff" : "buff"}`;
    node.textContent = text;
    el.toasts.appendChild(node);
    window.setTimeout(() => node.remove(), 1700);
  }

  // 免死护盾展开时的圆环特效。
  function shieldRing(cell) {
    const wrapRect = el.boardWrap.getBoundingClientRect();
    const point = cellCenter(cell, wrapRect);
    const ring = document.createElement("span");
    ring.className = "shield-ring";
    ring.style.left = `${point.x}px`;
    ring.style.top = `${point.y}px`;
    el.boardWrap.appendChild(ring);
    window.setTimeout(() => ring.remove(), 900);
  }

  // ------------------------------------------------------------ 效果与结算

  function activeEffect(id) {
    return G.effects.find((item) => item.id === id) || null;
  }

  function bumpEffectCount(id, amount) {
    const inc = amount || 1;
    if (!id) {
      return;
    }
    G.counts[id] = (G.counts[id] || 0) + inc;
    pulseEffectCard(id);
  }

  let currentEffectId = null;

  function runHooks(name, ctx) {
    G.effects.forEach((def) => {
      const hook = def.hooks && def.hooks[name];
      if (typeof hook !== "function") {
        return;
      }
      currentEffectId = def.id;
      try {
        hook.call(def, ctx);
      } catch (error) {
        console.error(`[扫雷效果] ${def.id} 的 ${name} 出错：`, error);
      } finally {
        currentEffectId = null;
      }
    });
  }

  function makeCtx(extra) {
    const option = extra || {};
    const newCells = option.newCells || [];
    const base = {
      config: CFG,
      mines: G.mines,
      depth: option.depth || 0,
      newCells,
      newSafeCount: newCells.filter((cell) => !cell.mine).length,
      meta: option.meta || {},
      // true 表示这次揭格是效果自动触发的（额外开格），计数类效果会跳过它，避免自己喂自己形成长连锁。
      effectDriven: !!(option.meta && option.meta.effectId),
      revealedBefore: option.revealedBefore || G.cells.filter((c) => c.revealed),
      origin: option.origin || null,
      isAdjacent,
      cellKey(cell) {
        return `${cell.x},${cell.y}`;
      },
      // 每张效果卡在本局里的私有数据，换局自动清空。
      state() {
        const id = currentEffectId;
        if (!id) {
          return {};
        }
        if (!G.fxState[id]) {
          G.fxState[id] = {};
        }
        return G.fxState[id];
      },
      randomUnflaggedMine() {
        const pool = G.cells.filter((c) => c.mine && !c.flagged && !G.reserved.has(key(c)));
        return pool.length ? pool[randInt(pool.length)] : null;
      },
      randomHiddenSafeCell(options) {
        const opts = options || {};
        const avoid = opts.awayFrom || [];
        const gap = opts.minGap || 0;
        const pool = G.cells.filter((c) => !c.mine && !c.revealed && !c.flagged && !G.reserved.has(key(c)));
        if (!pool.length) {
          return null;
        }
        if (gap > 0 && avoid.length) {
          const spread = pool.filter((c) =>
            avoid.every((other) => Math.max(Math.abs(other.x - c.x), Math.abs(other.y - c.y)) >= gap)
          );
          if (spread.length) {
            return spread[randInt(spread.length)];
          }
        }
        return pool[randInt(pool.length)];
      },
      wasFired(cell) {
        return G.fired.has(key(cell));
      },
      markFired(cell) {
        G.fired.add(key(cell));
      },
      markMisted(cell) {
        cell.misted = true;
      },
      bump(amount) {
        bumpEffectCount(currentEffectId, amount || 1);
      },
      toast(text) {
        showBoardToast(text, currentEffectId);
      },
      queueFlag(cell, meta, depth) {
        enqueueFromEffect({ type: "autoFlag", x: cell.x, y: cell.y, meta: meta || {} }, depth);
      },
      queueReveal(cell, meta, depth) {
        enqueueFromEffect({ type: "reveal", x: cell.x, y: cell.y, meta: meta || {} }, depth);
      },
      log() {
        console.log("[扫雷效果]", ...arguments);
      },
    };
    return Object.assign(base, option);
  }

  function markTruncated() {
    if (!G.tx || G.tx.truncated) {
      return;
    }
    G.tx.truncated = true;
    console.warn(
      `[扫雷] 单次操作的连锁达到上限（${CFG.maxChainEvents} 个事件 / ${CFG.maxChainDepth} 层），已停止继续触发。`
    );
    const note = document.createElement("p");
    note.className = "fx-truncate-note";
    note.textContent = "连锁达到上限，已停止继续触发。";
    el.fxNote.innerHTML = "";
    el.fxNote.appendChild(note);
    window.setTimeout(() => {
      if (note.parentNode) {
        note.remove();
      }
    }, 3000);
  }

  function enqueueFromEffect(step, depth) {
    if (!G.tx) {
      return;
    }
    if (depth > CFG.maxChainDepth || G.tx.events >= CFG.maxChainEvents) {
      markTruncated();
      return;
    }
    if (step.type === "autoFlag" || (step.type === "reveal" && step.meta && step.meta.effectId)) {
      // 同一批连锁里不要重复挑到同一个格子：排队时就先占位。
      G.reserved.add(step.y * G.cols + step.x);
    }
    G.tx.events += 1;
    G.tx.queue.push(Object.assign({ depth }, step));
  }

  function setLocked(locked) {
    el.boardWrap.classList.toggle("is-locked", !!locked);
    el.statusline.classList.toggle("is-locked", !!locked);
    el.lockText.textContent = locked ? "结算中…" : "";
  }

  async function stepReveal(step) {
    const start = at(step.x, step.y);
    if (!start || start.revealed || start.flagged || G.phase !== "playing") {
      return;
    }
    if (!G.placed) {
      placeMines(start.x, start.y);
      paintAll();
      startTimer();
      // 布雷完成：把机会给“开局自动标记”这类效果，它们排的队会在本步之后依次结算。
      runHooks("onMinesPlaced", makeCtx({ origin: start, depth: step.depth, type: "minesPlaced" }));
    }
    const batch = collectReveal(start);
    if (!batch.length) {
      return;
    }
    const meta = step.meta || {};
    if (meta.effectId) {
      // 效果触发的额外揭格：先给反馈，再播揭格动画。
      pulseEffectCard(meta.effectId);
      flashCell(start, "is-blessed");
    }
    const before = G.cells.filter((c) => c.revealed);
    const newCells = [];
    batch.forEach((item) => {
      item.cell.revealed = true;
      G.seq += 1;
      item.cell.revealSeq = G.seq;
      if (!item.cell.mine) {
        G.revealedSafe += 1;
      }
      newCells.push(item.cell);
    });

    const ctx = makeCtx({ newCells, revealedBefore: before, origin: start, depth: step.depth, type: "reveal", meta });
    runHooks("onRevealCommit", ctx);

    updateHud();
    await animateReveal(batch);

    const misted = newCells.filter((c) => c.misted && !c.mine);
    if (misted.length) {
      await animateMist(misted);
    }

    runHooks("onRevealDone", ctx);

    const hitCell = newCells.find((c) => c.mine);
    if (hitCell) {
      if (await resolveMineHit(ctx, hitCell)) {
        return;
      }
      await runLoss(hitCell);
      return;
    }
    if (G.revealedSafe >= totalSafe()) {
      await runWin();
    }
  }

  async function stepChord(step) {
    const cell = at(step.x, step.y);
    if (!cell || !cell.revealed || G.phase !== "playing") {
      return;
    }
    const batch = collectChord(cell);
    if (!batch) {
      flashCell(cell, "is-hinting");
      return;
    }
    const before = G.cells.filter((c) => c.revealed);
    const newCells = [];
    batch.forEach((item) => {
      item.cell.revealed = true;
      G.seq += 1;
      item.cell.revealSeq = G.seq;
      if (!item.cell.mine) {
        G.revealedSafe += 1;
      }
      newCells.push(item.cell);
    });
    const ctx = makeCtx({ newCells, revealedBefore: before, origin: cell, depth: step.depth, type: "chord" });
    runHooks("onRevealCommit", ctx);
    updateHud();
    await animateReveal(batch);
    const misted = newCells.filter((c) => c.misted && !c.mine);
    if (misted.length) {
      await animateMist(misted);
    }
    runHooks("onRevealDone", ctx);

    const hitCell = newCells.find((c) => c.mine);
    if (hitCell) {
      if (await resolveMineHit(ctx, hitCell)) {
        return;
      }
      await runLoss(hitCell);
      return;
    }
    if (G.revealedSafe >= totalSafe()) {
      await runWin();
    }
  }

  // 踩到雷：先给效果一次“免死”的机会；没有效果救场就正常失败。
  async function resolveMineHit(ctx, hitCell) {
    const outcome = { cancelled: false, flag: true };
    const hitCtx = makeCtx({
      newCells: ctx.newCells,
      revealedBefore: ctx.revealedBefore,
      origin: ctx.origin,
      depth: ctx.depth,
      type: "mineHit",
      hitCell,
    });
    hitCtx.cancelLoss = (options) => {
      outcome.cancelled = true;
      outcome.flag = !(options && options.flag === false);
    };
    runHooks("onMineHit", hitCtx);
    if (!outcome.cancelled) {
      return false;
    }
    await animateShield(hitCell, outcome.flag);
    return true;
  }

  async function animateShield(cell, flagIt) {
    const gen = G.gen;
    const node = G.nodes[key(cell)];
    if (node) {
      node.classList.add("is-shielded");
    }
    shieldRing(cell);
    await sleep(560);
    if (gen !== G.gen) {
      return;
    }
    cell.revealed = false;
    cell.exploded = false;
    cell.misted = false;
    cell.flagged = !!flagIt;
    if (flagIt) {
      G.flags += 1;
    }
    paintCell(cell);
    flashCell(cell, flagIt ? "is-flagging" : "is-hinting");
    updateHud();
    await sleep(200);
    if (gen === G.gen) {
      runHooks(
        "onFlagChange",
        makeCtx({ origin: cell, depth: 0, type: "shieldFlag", flagCell: cell, flagValue: cell.flagged })
      );
    }
  }

  async function stepToggleFlag(step) {
    const cell = at(step.x, step.y);
    if (!cell || cell.revealed || G.phase !== "playing") {
      return;
    }
    if (!cell.flagged && G.flags >= G.mines) {
      flashCell(cell, "is-hinting");
      return;
    }
    cell.flagged = !cell.flagged;
    G.flags += cell.flagged ? 1 : -1;
    paintCell(cell);
    flashCell(cell, "is-flagging");
    updateHud();
    await sleep(170);
    runHooks("onFlagChange", makeCtx({ origin: cell, depth: step.depth, type: "flag", flagCell: cell, flagValue: cell.flagged }));
  }

  async function stepAutoFlag(step) {
    const cell = at(step.x, step.y);
    if (!cell || cell.flagged || !cell.mine || G.phase !== "playing") {
      return;
    }
    const meta = step.meta || {};
    const from = meta.fromX === undefined ? null : at(meta.fromX, meta.fromY);
    if (from && from.revealed) {
      await radarBeam(from, cell);
    }
    cell.flagged = true;
    G.flags += 1;
    paintCell(cell);
    flashCell(cell, "is-flagging");
    updateHud();
    if (meta.effectId) {
      pulseEffectCard(meta.effectId);
    }
    await sleep(180);
    runHooks("onFlagChange", makeCtx({ origin: cell, depth: step.depth, type: "autoFlag", flagCell: cell, flagValue: true }));
  }

  async function executeStep(step) {
    if (step.type === "reveal") {
      await stepReveal(step);
    } else if (step.type === "chord") {
      await stepChord(step);
    } else if (step.type === "toggleFlag") {
      await stepToggleFlag(step);
    } else if (step.type === "autoFlag") {
      await stepAutoFlag(step);
    }
  }

  async function runTransaction(kind, payload) {
    if (G.tx || G.phase !== "playing") {
      return;
    }
    G.reserved = new Set();
    const tx = { token: G.txSeq + 1, events: 0, depth: 0, queue: [], truncated: false };
    G.txSeq = tx.token;
    G.tx = tx;
    setLocked(true);
    try {
      if (kind === "reveal") {
        tx.queue.push({ type: "reveal", x: payload.x, y: payload.y, depth: 0 });
      } else if (kind === "chord") {
        tx.queue.push({ type: "chord", x: payload.x, y: payload.y, depth: 0 });
      } else if (kind === "flag") {
        tx.queue.push({ type: "toggleFlag", x: payload.x, y: payload.y, depth: 0 });
      }
      while (tx.queue.length) {
        if (G.txSeq !== tx.token) {
          break;
        }
        const step = tx.queue.shift();
        await executeStep(step);
        if (G.phase !== "playing") {
          tx.queue.length = 0;
        }
      }
    } catch (error) {
      if (error !== ABORT) {
        console.error("[扫雷] 结算出错：", error);
      }
    } finally {
      if (G.txSeq === tx.token) {
        G.tx = null;
        if (G.phase === "playing") {
          setLocked(false);
        }
        updateHud();
      }
    }
  }

  function abortTransaction() {
    G.txSeq += 1;
    G.tx = null;
    setLocked(false);
  }

  async function runWin() {
    G.phase = "over";
    G.endedAt = Date.now();
    stopTimer();
    if (G.tx) {
      G.tx.queue.length = 0;
    }
    el.boardWrap.classList.add("is-winning");
    const gen = G.gen;
    const mines = G.cells.filter((c) => c.mine && !c.flagged);
    mines.forEach((cell, index) => {
      window.setTimeout(() => {
        if (gen !== G.gen) {
          return;
        }
        cell.flagged = true;
        G.flags += 1;
        paintCell(cell);
        flashCell(cell, "is-flagging");
        updateHud();
      }, index * 40);
    });
    await sleep(mines.length * 40 + 280);
    burstParticles();
    await sleep(560);
    el.boardWrap.classList.remove("is-winning");
    runHooks("onGameEnd", makeCtx({ type: "win", depth: 0 }));
    showResult(true);
  }

  async function runLoss(hitCell) {
    G.phase = "over";
    G.endedAt = Date.now();
    stopTimer();
    if (G.tx) {
      G.tx.queue.length = 0;
    }
    hitCell.exploded = true;
    paintCell(hitCell);
    flashCell(hitCell, "is-exploded");
    showVignette();
    el.boardWrap.classList.add("is-shaking");
    const gen = G.gen;
    await sleep(260);
    const mines = G.cells.filter((c) => c.mine && c !== hitCell && !c.flagged);
    mines.forEach((cell, index) => {
      window.setTimeout(() => {
        if (gen !== G.gen) {
          return;
        }
        cell.revealed = true;
        paintCell(cell);
      }, index * 55);
    });
    await sleep(mines.length * 55 + 300);
    el.boardWrap.classList.remove("is-shaking");
    const wrong = G.cells.filter((c) => c.flagged && !c.mine);
    wrong.forEach((cell) => {
      cell.wrong = true;
      paintCell(cell);
    });
    await sleep(200);
    const misted = G.cells.filter((c) => c.misted && c.revealed && !c.mine);
    misted.forEach((cell) => paintCell(cell, "dissolve"));
    await sleep(340);
    runHooks("onGameEnd", makeCtx({ type: "lose", depth: 0 }));
    showResult(false);
  }

  // ------------------------------------------------------------------ 面板 UI

  function iconFor(effect) {
    return ICONS[effect.glyph] || ICONS.blank;
  }

  function renderEffectCards() {
    el.fxList.innerHTML = "";
    el.fxCount.textContent = String(G.effects.length);
    if (!G.effects.length) {
      const empty = document.createElement("p");
      empty.className = "fx-empty";
      empty.textContent = "本局没有生效的效果。";
      el.fxList.appendChild(empty);
      return;
    }
    G.effects.forEach((effect) => {
      const card = document.createElement("article");
      card.className = `fx-card is-${effect.type}${effect.placeholder ? " is-placeholder" : ""}`;
      card.dataset.effectId = effect.id;
      const icon = document.createElement("span");
      icon.className = "fx-icon";
      icon.innerHTML = iconFor(effect);
      const body = document.createElement("div");
      const name = document.createElement("p");
      name.className = "fx-name";
      name.textContent = effect.name;
      const desc = document.createElement("p");
      desc.className = "fx-desc";
      desc.textContent = effect.desc;
      body.appendChild(name);
      body.appendChild(desc);
      const count = document.createElement("span");
      count.className = "fx-count";
      count.textContent = `×${G.counts[effect.id] || 0}`;
      card.appendChild(icon);
      card.appendChild(body);
      card.appendChild(count);
      el.fxList.appendChild(card);
    });
  }

  function pulseEffectCard(effectId) {
    const card = el.fxList.querySelector(`[data-effect-id="${effectId}"]`);
    if (!card) {
      return;
    }
    card.classList.remove("is-firing");
    void card.offsetWidth;
    card.classList.add("is-firing");
    const badge = card.querySelector(".fx-count");
    if (badge) {
      badge.textContent = `×${G.counts[effectId] || 0}`;
      badge.classList.remove("is-hot");
      void badge.offsetWidth;
      badge.classList.add("is-hot");
    }
    const floater = document.createElement("span");
    floater.className = "fx-float";
    floater.textContent = "+1";
    card.appendChild(floater);
    window.setTimeout(() => floater.remove(), 900);
  }

  function syncFxPicker() {
    el.buffChoices.querySelectorAll(".fx-choice").forEach((btn) => {
      btn.classList.toggle("is-selected", G.freeSelection.has(btn.dataset.effectId));
    });
    el.debuffChoices.querySelectorAll(".fx-choice").forEach((btn) => {
      btn.classList.toggle("is-selected", G.freeSelection.has(btn.dataset.effectId));
    });
  }

  function buildFxPicker() {
    const fill = (container, list) => {
      container.innerHTML = "";
      list.forEach((effect) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `fx-choice is-${effect.type}${effect.placeholder ? " is-placeholder" : ""}`;
        btn.dataset.effectId = effect.id;
        btn.textContent = effect.name;
        btn.title = effect.desc;
        btn.addEventListener("click", () => {
          if (G.freeSelection.has(effect.id)) {
            G.freeSelection.delete(effect.id);
          } else {
            G.freeSelection.add(effect.id);
          }
          btn.classList.toggle("is-selected", G.freeSelection.has(effect.id));
        });
        container.appendChild(btn);
      });
    };
    fill(el.buffChoices, BUFFS);
    fill(el.debuffChoices, DEBUFFS);
    syncFxPicker();
  }

  function pickRandom(list, count) {
    const pool = list.slice();
    shuffle(pool);
    return pool.slice(0, Math.min(count, pool.length));
  }

  function drawTierEffects(tierId) {
    const tier = TIERS[tierId];
    const buffs = pickRandom(BUFFS, tier.buffs);
    const debuffs = pickRandom(DEBUFFS, tier.debuffs);
    return buffs.concat(debuffs);
  }

  function effectsForFreeMode() {
    return BUFFS.concat(DEBUFFS).filter((effect) => G.freeSelection.has(effect.id));
  }

  async function dealEffectCards(effects) {
    G.effects = [];
    renderEffectCards(false);
    el.fxList.innerHTML = "";
    for (const effect of effects) {
      G.effects.push(effect);
      renderEffectCards(false);
      const card = el.fxList.querySelector(`[data-effect-id="${effect.id}"]`);
      if (card) {
        card.style.animationDelay = "0ms";
      }
      await sleep(260);
    }
    if (!effects.length) {
      renderEffectCards(false);
    }
  }

  function setPhaseBadge(text) {
    el.statusText.textContent = text;
  }

  async function startGame() {
    abortTransaction();
    G.phase = "dealing";
    G.mines = CFG.mines;
    hideResult();
    buildCells();
    buildBoardNodes();
    paintAll();
    G.startedAt = 0;
    G.endedAt = 0;
    stopTimer();
    G.savedThisGame = false;
    updateHud();
    el.setup.open = false;
    setLocked(true);
    setPhaseBadge("正在抽取效果…");

    let effects = [];
    if (G.mode === "free") {
      effects = effectsForFreeMode();
      setPhaseBadge(effects.length ? "自由模式：按你挑的效果开局" : "自由模式：纯扫雷");
    } else {
      effects = drawTierEffects(G.tier);
      setPhaseBadge(`难度模式：${TIERS[G.tier].label} · 正在抽取效果`);
    }
    await dealEffectCards(effects);

    G.mines = minesForEffects(effects);
    G.phase = "playing";
    setLocked(false);
    updateHud();
    runHooks("onGameStart", makeCtx({ type: "start" }));
    setPhaseBadge(
      G.mode === "free"
        ? "自由模式：随便玩，不上榜。"
        : `难度模式：${TIERS[G.tier].label} · 胜利后可以保存成绩。`
    );
    renderEffectCards(false);
  }

  // 本局雷数 = 基础雷数 + 所有负面效果的加成（例如「雷区扩张 +10」）。
  function minesForEffects(effects) {
    return CFG.mines + effects.reduce((sum, effect) => sum + (Number(effect.mineDelta) || 0), 0);
  }

  function showResult(won) {
    const ms = G.endedAt - G.startedAt;
    G.resultWon = won;
    el.resultTitle.textContent = won ? "排雷成功" : "踩到雷了";
    el.resultTitle.className = `result-title ${won ? "is-win" : "is-lose"}`;
    el.resultSub.textContent = won
      ? G.mode === "free"
        ? "自由模式不上榜，但这一局很漂亮。"
        : "难度模式通关，可以留个名字。"
      : "下一局注意那些被迷雾盖住的数字。";
    el.resultTime.textContent = formatClock(ms, true);
    el.resultFlags.textContent = String(G.flags);
    el.resultMode.textContent =
      G.mode === "free" ? "自由" : TIERS[G.tier].label;
    el.resultEffects.innerHTML = "";
    G.effects.forEach((effect) => {
      const chip = document.createElement("span");
      chip.className = `result-chip is-${effect.type}`;
      chip.textContent = effect.name;
      el.resultEffects.appendChild(chip);
    });
    const canSave = won && G.mode === "tier" && !G.savedThisGame;
    el.scoreForm.hidden = !canSave;
    el.saveButton.disabled = false;
    el.resultStatus.textContent = "";
    if (won && G.mode === "tier" && G.savedThisGame) {
      el.resultStatus.textContent = "本局成绩已经保存过了。";
    }
    el.result.hidden = false;
    syncResultReopen();
  }

  function hideResult() {
    el.result.hidden = true;
    syncResultReopen();
  }

  // 「关闭」只收起结算层，让玩家能看着最终棋盘截图；结束的局可以用顶部按钮重新打开结算。
  function syncResultReopen() {
    if (el.resultReopen) {
      el.resultReopen.hidden = !(G.phase === "over" && el.result.hidden);
    }
  }

  // ------------------------------------------------------------------ 榜单

  async function loadScores() {
    el.scoreState.textContent = "正在读取记录…";
    try {
      const response = await fetch("api.php?action=ms_scores", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "读取失败");
      }
      G.scores = Array.isArray(data.data) ? data.data : [];
      renderScores();
      el.scoreState.textContent = "";
    } catch (error) {
      el.scoreState.textContent = "记录读取失败，稍后再试。";
    }
  }

  function renderScores() {
    const rows = G.scores.slice();
    if (G.scoreTab === "rank") {
      rows.sort((a, b) => a.timeMs - b.timeMs);
    } else {
      rows.sort((a, b) => b.createdAt - a.createdAt);
    }
    const list = rows.slice(0, 50);
    el.scoreList.innerHTML = "";
    if (!list.length) {
      el.scoreState.textContent = "还没有记录，赢一局难度模式来占个位。";
      return;
    }
    el.scoreState.textContent = "";
    list.forEach((row, index) => {
      const item = document.createElement("div");
      item.className = `score-row${G.scoreTab === "rank" && index === 0 ? " is-first" : ""}`;
      const rank = document.createElement("span");
      rank.className = "score-rank";
      rank.textContent = G.scoreTab === "rank" ? String(index + 1) : "·";
      const name = document.createElement("span");
      name.className = "score-name";
      name.textContent = row.name || "匿名玩家";
      const time = document.createElement("span");
      time.className = "score-time";
      time.textContent = formatClock(row.timeMs || 0, true);
      const tier = document.createElement("span");
      const tierId = TIERS[row.difficulty] ? row.difficulty : "normal";
      tier.className = `score-tier tier-${tierId}`;
      tier.textContent = TIERS[tierId].label;
      item.appendChild(rank);
      item.appendChild(name);
      item.appendChild(time);
      item.appendChild(tier);
      item.title = `保存时间：${new Date(row.createdAt * 1000).toLocaleString("zh-CN", { hour12: false })}`;
      el.scoreList.appendChild(item);
    });
  }

  async function saveScore(event) {
    event.preventDefault();
    // 只有难度模式的胜利才能上榜：自由模式、失败局、已保存过的都不允许。
    if (G.mode !== "tier" || G.savedThisGame || !G.resultWon) {
      return;
    }
    const name = el.scoreName.value.trim() || "匿名玩家";
    el.saveButton.disabled = true;
    el.resultStatus.textContent = "正在保存…";
    try {
      const response = await fetch("api.php?action=ms_score", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mode: G.mode,
          timeMs: G.endedAt - G.startedAt,
          difficulty: G.tier,
          effects: G.effects.map((effect) => effect.id),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "保存失败");
      }
      G.scores = Array.isArray(data.data) ? data.data : G.scores;
      G.savedThisGame = true;
      renderScores();
      el.scoreForm.hidden = true;
      el.resultStatus.textContent = "成绩已保存，本局不能重复保存。";
    } catch (error) {
      el.resultStatus.textContent = error.message || "保存失败，稍后再试。";
      el.saveButton.disabled = false;
    }
  }

  // ---------------------------------------------------------------- 交互绑定

  function cellFromEvent(event) {
    const target = event.target.closest(".ms-cell");
    if (!target) {
      return null;
    }
    return at(Number(target.dataset.x), Number(target.dataset.y));
  }

  function bindBoard() {
    let pressTimer = 0;
    let longPressed = false;
    let pressCell = null;
    let pressX = 0;
    let pressY = 0;

    const clearPress = () => {
      if (pressTimer) {
        window.clearTimeout(pressTimer);
        pressTimer = 0;
      }
    };

    el.board.addEventListener("pointerdown", (event) => {
      const cell = cellFromEvent(event);
      if (!cell) {
        return;
      }
      if (event.button === 2) {
        event.preventDefault();
        runTransaction("flag", { x: cell.x, y: cell.y });
        return;
      }
      if (event.button !== 0 || G.phase !== "playing" || G.tx) {
        return;
      }
      longPressed = false;
      pressCell = cell;
      pressX = event.clientX;
      pressY = event.clientY;
      flashCell(cell, "is-pressed");
      clearPress();
      pressTimer = window.setTimeout(() => {
        longPressed = true;
        runTransaction("flag", { x: cell.x, y: cell.y });
      }, 420);
    });

    el.board.addEventListener("pointermove", (event) => {
      if (!pressTimer) {
        return;
      }
      if (Math.abs(event.clientX - pressX) > 10 || Math.abs(event.clientY - pressY) > 10) {
        clearPress();
      }
    });

    el.board.addEventListener("pointerup", (event) => {
      clearPress();
      if (longPressed) {
        longPressed = false;
        return;
      }
      if (event.button !== 0 || !pressCell) {
        pressCell = null;
        return;
      }
      const cell = cellFromEvent(event) || pressCell;
      pressCell = null;
      if (G.phase !== "playing" || G.tx) {
        return;
      }
      if (G.flagMode || event.ctrlKey) {
        runTransaction("flag", { x: cell.x, y: cell.y });
      } else {
        runTransaction("reveal", { x: cell.x, y: cell.y });
      }
    });

    el.board.addEventListener("pointercancel", () => {
      clearPress();
      pressCell = null;
    });

    el.board.addEventListener("pointerleave", () => {
      clearPress();
    });

    el.board.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const cell = cellFromEvent(event);
      if (cell && !longPressed) {
        // 右键插旗：pointerdown 已经处理过鼠标右键，这里只兜底触屏长按菜单。
        if (event.pointerType !== "mouse") {
          runTransaction("flag", { x: cell.x, y: cell.y });
        }
      }
    });

    el.board.addEventListener("dblclick", (event) => {
      const cell = cellFromEvent(event);
      if (!cell || G.phase !== "playing" || G.tx) {
        return;
      }
      if (cell.revealed && cell.value > 0) {
        runTransaction("chord", { x: cell.x, y: cell.y });
      }
    });
  }

  function bindSetup() {
    el.modeSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        G.mode = btn.dataset.mode;
        el.modeSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        el.tierBlock.hidden = G.mode !== "tier";
        el.freeBlock.hidden = G.mode !== "free";
        updateHud();
      });
    });
    el.tierSwitch.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        G.tier = btn.dataset.tier;
        el.tierSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        el.tierNote.textContent = `${TIERS[G.tier].label}：${TIERS[G.tier].buffs} 个正面 + ${TIERS[G.tier].debuffs} 个负面。${TIERS[G.tier].desc}`;
        updateHud();
      });
    });
    el.startButton.addEventListener("click", () => {
      startGame();
    });
    el.restartButton.addEventListener("click", () => {
      startGame();
    });
    el.flagToggle.addEventListener("click", () => {
      G.flagMode = !G.flagMode;
      el.flagToggle.classList.toggle("is-active", G.flagMode);
      el.flagToggle.setAttribute("aria-pressed", G.flagMode ? "true" : "false");
    });
  }

  function bindResult() {
    el.scoreForm.addEventListener("submit", saveScore);
    el.resultRestart.addEventListener("click", () => {
      startGame();
    });
    el.resultClose.addEventListener("click", () => {
      // 只收起结算层，最终棋盘留着给人看；要重开上面本来就有按钮。
      hideResult();
      if (G.phase === "over") {
        setPhaseBadge("本局结束 · 想看成绩可以点上面「本局结算」，或直接「重新开局」");
      }
    });
    el.resultReopen.addEventListener("click", () => {
      showResult(!!G.resultWon);
    });
    el.scoreTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        G.scoreTab = tab.dataset.tab;
        el.scoreTabs.forEach((item) => item.classList.toggle("is-active", item === tab));
        renderScores();
      });
    });
  }

  // --------------------------------------------------------------- 面板开关

  function openPanel() {
    if (G.panelOpen) {
      return;
    }
    G.panelOpen = true;
    document.body.classList.add("game-open");
    el.panel.hidden = false;
    el.panel.setAttribute("aria-hidden", "false");
    el.entry.setAttribute("aria-expanded", "true");
    void el.panel.offsetWidth;
    el.panel.classList.add("is-open");
    if (G.phase === "idle" || G.phase === "over") {
      startGame();
    }
    loadScores();
  }

  function closePanel() {
    if (!G.panelOpen) {
      return;
    }
    G.panelOpen = false;
    abortTransaction();
    G.phase = "idle";
    G.endedAt = Date.now();
    stopTimer();
    setLocked(false);
    hideResult();
    document.body.classList.remove("game-open");
    el.panel.classList.remove("is-open");
    el.entry.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!G.panelOpen) {
        el.panel.hidden = true;
        el.panel.setAttribute("aria-hidden", "true");
      }
    }, 520);
  }

  function applyHash(initial) {
    if (window.location.hash === "#game") {
      if (!G.panelOpen) {
        if (initial) {
          el.panel.classList.add("no-anim");
        }
        openPanel();
        if (initial) {
          window.setTimeout(() => el.panel.classList.remove("no-anim"), 60);
        }
      }
    } else if (G.panelOpen) {
      closePanel();
    }
  }

  function bindPanel() {
    el.entry.addEventListener("click", () => {
      if (G.panelOpen) {
        closePanel();
        if (window.location.hash === "#game") {
          history.pushState(null, "", window.location.pathname + window.location.search);
        }
        return;
      }
      history.pushState(null, "", "#game");
      openPanel();
    });
    el.closeButton.addEventListener("click", () => {
      closePanel();
      if (window.location.hash === "#game") {
        history.pushState(null, "", window.location.pathname + window.location.search);
      }
    });
    window.addEventListener("hashchange", () => applyHash(false));
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !G.panelOpen) {
        return;
      }
      if (!el.result.hidden) {
        // 结算层开着的时候，Esc 先收结算层。
        el.resultClose.click();
        return;
      }
      closePanel();
      if (window.location.hash === "#game") {
        history.pushState(null, "", window.location.pathname + window.location.search);
      }
    });
  }

  // ------------------------------------------------------------------- 启动

  function cacheDom() {
    el.panel = document.getElementById("gamePanel");
    el.entry = document.getElementById("gameEntry");
    el.closeButton = document.getElementById("gameClose");
    el.restartButton = document.getElementById("gameRestart");
    el.startButton = document.getElementById("startGame");
    el.statusline = document.getElementById("gameStatusline");
    el.statusText = document.getElementById("gameStatusText");
    el.lockText = document.getElementById("gameLockText");
    el.mineCount = document.getElementById("mineCount");
    el.timerText = document.getElementById("timerText");
    el.modeBadge = document.getElementById("modeBadge");
    el.flagToggle = document.getElementById("flagToggle");
    el.board = document.getElementById("gameBoard");
    el.boardWrap = document.getElementById("boardWrap");
    el.toasts = document.getElementById("boardToasts");
    el.radar = document.getElementById("radarLayer");
    el.particles = document.getElementById("particleLayer");
    el.modeSwitch = document.getElementById("modeSwitch");
    el.tierSwitch = document.getElementById("tierSwitch");
    el.tierBlock = document.getElementById("tierBlock");
    el.tierNote = document.getElementById("tierNote");
    el.freeBlock = document.getElementById("freeBlock");
    el.buffChoices = document.getElementById("buffChoices");
    el.debuffChoices = document.getElementById("debuffChoices");
    el.setup = document.getElementById("gameSetup");
    el.fxList = document.getElementById("fxList");
    el.fxCount = document.getElementById("fxCount");
    el.fxNote = document.getElementById("fxNote");
    el.result = document.getElementById("gameResult");
    el.resultTitle = document.getElementById("resultTitle");
    el.resultSub = document.getElementById("resultSub");
    el.resultTime = document.getElementById("resultTime");
    el.resultFlags = document.getElementById("resultFlags");
    el.resultMode = document.getElementById("resultMode");
    el.resultEffects = document.getElementById("resultEffects");
    el.scoreForm = document.getElementById("scoreForm");
    el.scoreName = document.getElementById("scoreName");
    el.saveButton = document.getElementById("scoreSave");
    el.resultStatus = document.getElementById("resultStatus");
    el.resultRestart = document.getElementById("resultRestart");
    el.resultClose = document.getElementById("resultClose");
    el.resultReopen = document.getElementById("resultReopen");
    el.scoreList = document.getElementById("scoreList");
    el.scoreState = document.getElementById("scoreState");
    el.scoreTabs = Array.from(document.querySelectorAll(".score-tab"));
  }

  function init() {
    cacheDom();
    if (!el.panel || !el.board) {
      return;
    }
    G.cols = CFG.cols;
    G.rows = CFG.rows;
    buildCells();
    buildBoardNodes();
    buildFxPicker();
    bindBoard();
    bindSetup();
    bindResult();
    bindPanel();
    updateHud();
    el.tierNote.textContent = `${TIERS[G.tier].label}：${TIERS[G.tier].buffs} 个正面 + ${TIERS[G.tier].debuffs} 个负面。${TIERS[G.tier].desc}`;
    applyHash(true);

    window.MS_DEBUG = {
      state: () => G,
      pool: () => ({ buffs: BUFFS.map((e) => e.id), debuffs: DEBUFFS.map((e) => e.id) }),
      minesForEffects,
      draw: (tierId) => drawTierEffects(tierId),
      startTier(tier) {
        G.mode = "tier";
        G.tier = tier;
        return startGame();
      },
      startFree(ids) {
        G.mode = "free";
        G.freeSelection = new Set(ids || []);
        return startGame();
      },
      open: openPanel,
      close: closePanel,
      reveal: (x, y) => runTransaction("reveal", { x, y }),
      flag: (x, y) => runTransaction("flag", { x, y }),
      chord: (x, y) => runTransaction("chord", { x, y }),
      setRng(fn) {
        G.rng = typeof fn === "function" ? fn : Math.random;
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
