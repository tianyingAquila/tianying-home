/* ==========================================================================
   技能扫雷 · 效果表
   --------------------------------------------------------------------------
   这是唯一需要改的地方：加效果 = 往 buffs / debuffs 数组里加一条即可，
   界面、抽取、动画、计数都会自动跟上。

   一条效果的结构：
   {
     id:          唯一的字符串 id
     name:        显示名
     type:        "buff" | "debuff"
     glyph:       图标名
     desc:        一句话说明，显示在左侧效果卡里
     mineDelta:   可选，改变本局雷数（例如 +15）
     bossTarget:  可选 { value, count }：开局布雷时保证有 count 个 ≥ value 的数字
     hooks: { ... }
   }

   钩子（引擎在对应时机自动调用）：
     onGameStart(ctx)      新一局开始（棋盘还没布雷）
     onMinesPlaced(ctx)    第一击布雷之后、第一片区域揭开之前
     onRevealCommit(ctx)   已经算出要揭开的格子、动画还没播时
     onRevealDone(ctx)     揭开动画播完之后
     onFlagChange(ctx)     插旗 / 取消旗之后（ctx.flagCell、ctx.flagValue）
     onMineHit(ctx)        踩到雷的瞬间，可以 ctx.cancelLoss() 免死
     onGameEnd(ctx)        结算时

   ctx 提供的东西：
     ctx.config / ctx.cols / ctx.rows / ctx.mines
     ctx.newCells / ctx.newSafeCount / ctx.revealedBefore / ctx.origin / ctx.depth / ctx.type / ctx.meta
     ctx.effectDriven      本次揭格是不是效果自己触发的
     ctx.flagCell / ctx.flagValue       插旗钩子
     ctx.hitCell / ctx.cancelLoss(opts) 踩雷钩子（免死）
     ctx.stats()           本局统计 { total, hidden, revealed, hiddenRatio, flags, mines }
     ctx.revealedCells()   当前所有已揭开的格子
     ctx.revealedNumbers() 当前所有已揭开的数字格（被迷雾/沙尘盖住的也算）
     ctx.neighbors(cell)   周围 8 格
     ctx.cellKey(cell)     格子的稳定 key
     ctx.random() / ctx.int(n)          随机数
     ctx.isAdjacent(a, b)
     ctx.randomUnflaggedMine()          随机取一个还没插旗的雷
     ctx.randomHiddenSafeCell(opts)     随机取一个还没揭开的非雷格（opts: awayFrom / minGap）
     ctx.randomHiddenZeroCell()         随机取一个还没揭开的 0 格
     ctx.randomRects(count, size)       随机取 count 个互不重叠的 size×size 区域
     ctx.wasFired(cell) / ctx.markFired(cell)
     ctx.markMisted(cell)
     ctx.grantImmunity(n) / ctx.spendImmunity()   免疫层数（挡下一次负面触发）
     ctx.bump(n)            给这张效果卡 +n 次触发
     ctx.toast(text)        棋盘上飘一条小提示
     ctx.shockwave(cell)    以某个格子为中心播一次冲击波动画
     ctx.queueFlag(cell, meta, depth)            排队自动插旗
     ctx.queueFlagBatch(cells, meta, depth)      排队批量插旗（算 1 个事件）
     ctx.queueReveal(cell, meta, depth)          排队自动揭格
     ctx.queueRevealBatch(cells, meta, depth)    排队批量揭格（算 1 个事件）
     ctx.queueArea(rects, meta, depth)           排队区域开采：框选动画 → 区内雷插旗、安全格揭开
     ctx.queueSand(cells, meta, depth)           排队把已揭开的数字格盖成沙尘
     ctx.state()            本效果本局专属的可变对象，每局自动清空
     ctx.log(...)           输出到控制台，方便调试
   ========================================================================== */

(function () {
  "use strict";

  const buffs = [
    {
      id: "buff_radar2",
      name: "二号雷达",
      type: "buff",
      glyph: "radar",
      desc: "每个已揭开的数字 2，在它周围第一次揭出新格子时，自动标记一个真实的雷。每个 2 只发射一次。",
      hooks: {
        onRevealDone(ctx) {
          if (!ctx.newCells.length) {
            return;
          }
          const candidates = ctx.revealedBefore
            .filter((cell) => !cell.mine && cell.value === 2 && !ctx.wasFired(cell))
            .sort((a, b) => a.revealSeq - b.revealSeq);

          for (const two of candidates) {
            const touched = ctx.newCells.some((cell) => ctx.isAdjacent(cell, two));
            if (!touched) {
              continue;
            }
            const target = ctx.randomUnflaggedMine();
            if (!target) {
              break;
            }
            ctx.markFired(two);
            ctx.bump();
            ctx.queueFlag(target, { effectId: "buff_radar2", fromX: two.x, fromY: two.y }, ctx.depth + 1);
          }
        },
      },
    },
    {
      id: "buff_open9",
      name: "九格馈赠",
      type: "buff",
      glyph: "expand",
      desc: "每累计揭开 9 个格子，额外自动揭开 1 个安全格。",
      hooks: {
        onRevealDone(ctx) {
          const state = ctx.state();
          state.opened = (state.opened || 0) + ctx.newSafeCount;
          if (state.opened < 9) {
            return;
          }
          const target = ctx.randomHiddenSafeCell();
          if (!target) {
            return;
          }
          state.opened -= 9;
          ctx.bump();
          ctx.toast("九格馈赠 · 额外揭开 1 格");
          ctx.queueReveal(target, { effectId: "buff_open9" }, ctx.depth + 1);
        },
      },
    },
    {
      id: "buff_open12",
      name: "十二格馈赠",
      type: "buff",
      glyph: "expand",
      desc: "每累计揭开 12 个格子，额外自动揭开 2 个安全格。",
      hooks: {
        onRevealDone(ctx) {
          const state = ctx.state();
          state.opened = (state.opened || 0) + ctx.newSafeCount;
          if (state.opened < 12) {
            return;
          }
          const first = ctx.randomHiddenSafeCell();
          if (!first) {
            return;
          }
          state.opened -= 12;
          ctx.bump();
          ctx.toast("十二格馈赠 · 额外揭开 2 格");
          ctx.queueReveal(first, { effectId: "buff_open12" }, ctx.depth + 1);
          const second = ctx.randomHiddenSafeCell({
            awayFrom: [first, ctx.origin].filter(Boolean),
            minGap: 5,
          });
          if (second) {
            ctx.queueReveal(second, { effectId: "buff_open12" }, ctx.depth + 1);
          }
        },
      },
    },
    {
      id: "buff_flag5",
      name: "五雷回响",
      type: "buff",
      glyph: "flagplus",
      desc: "每正确标记 5 个雷，额外随机标记 1 个雷（自己插的和效果自动插的都算）。",
      hooks: {
        onFlagChange(ctx) {
          if (!ctx.flagValue || !ctx.flagCell.mine) {
            return;
          }
          const state = ctx.state();
          state.counted = state.counted || new Set();
          const id = ctx.cellKey(ctx.flagCell);
          if (state.counted.has(id)) {
            return;
          }
          state.counted.add(id);
          state.correct = (state.correct || 0) + 1;
          if (state.correct < 5) {
            return;
          }
          const target = ctx.randomUnflaggedMine();
          if (!target) {
            return;
          }
          state.correct -= 5;
          ctx.bump();
          ctx.toast("五雷回响 · 额外标记 1 雷");
          ctx.queueFlag(target, { effectId: "buff_flag5" }, ctx.depth + 1);
        },
      },
    },
    {
      id: "buff_flag8",
      name: "八雷回响",
      type: "buff",
      glyph: "flagplus",
      desc: "每正确标记 8 个雷，额外随机标记 2 个雷（自己插的和效果自动插的都算）。",
      hooks: {
        onFlagChange(ctx) {
          if (!ctx.flagValue || !ctx.flagCell.mine) {
            return;
          }
          const state = ctx.state();
          state.counted = state.counted || new Set();
          const id = ctx.cellKey(ctx.flagCell);
          if (state.counted.has(id)) {
            return;
          }
          state.counted.add(id);
          state.correct = (state.correct || 0) + 1;
          if (state.correct < 8) {
            return;
          }
          state.correct -= 8;
          let queued = 0;
          for (let i = 0; i < 2; i += 1) {
            const target = ctx.randomUnflaggedMine();
            if (!target) {
              break;
            }
            ctx.queueFlag(target, { effectId: "buff_flag8" }, ctx.depth + 1);
            queued += 1;
          }
          if (queued) {
            ctx.bump();
            ctx.toast(`八雷回响 · 额外标记 ${queued} 雷`);
          }
        },
      },
    },
    {
      id: "buff_start5",
      name: "先手标记 +5",
      type: "buff",
      glyph: "headstart",
      desc: "第一击布雷后，自动随机标记 5 个真实的雷。",
      hooks: {
        onMinesPlaced(ctx) {
          const state = ctx.state();
          if (state.done) {
            return;
          }
          state.done = true;
          let queued = 0;
          for (let i = 0; i < 5; i += 1) {
            const target = ctx.randomUnflaggedMine();
            if (!target) {
              break;
            }
            ctx.queueFlag(target, { effectId: "buff_start5" }, ctx.depth + 1);
            queued += 1;
          }
          if (queued) {
            ctx.bump();
            ctx.toast(`先手标记 · 自动标记 ${queued} 个雷`);
          }
        },
      },
    },
    {
      id: "buff_start8",
      name: "先手标记 +8",
      type: "buff",
      glyph: "headstart",
      desc: "第一击布雷后，自动随机标记 8 个真实的雷。",
      hooks: {
        onMinesPlaced(ctx) {
          const state = ctx.state();
          if (state.done) {
            return;
          }
          state.done = true;
          let queued = 0;
          for (let i = 0; i < 8; i += 1) {
            const target = ctx.randomUnflaggedMine();
            if (!target) {
              break;
            }
            ctx.queueFlag(target, { effectId: "buff_start8" }, ctx.depth + 1);
            queued += 1;
          }
          if (queued) {
            ctx.bump();
            ctx.toast(`先手标记 · 自动标记 ${queued} 个雷`);
          }
        },
      },
    },
    {
      id: "buff_shield",
      name: "免死的赐福",
      type: "buff",
      glyph: "shield",
      desc: "本局第一次踩到雷时展开护盾：这颗雷被重新盖回去并插上旗，游戏继续。",
      hooks: {
        onMineHit(ctx) {
          const state = ctx.state();
          if (state.used) {
            return;
          }
          state.used = true;
          ctx.bump();
          ctx.toast("免死的赐福 · 护盾展开");
          ctx.cancelLoss({ flag: true });
        },
      },
    },
    {
      id: "buff_sharp_eye",
      name: "熟练的锐眼",
      type: "buff",
      glyph: "eye",
      desc: "剩余未揭开格 ≤ 40% 时，每个新揭开的数字有 1/5 概率额外打开一片随机零区。",
      hooks: {
        onRevealDone(ctx) {
          const stats = ctx.stats();
          if (stats.hiddenRatio > ctx.config.sharpEyeThreshold) {
            return;
          }
          const numbers = ctx.newCells.filter((cell) => !cell.mine && cell.value >= 1);
          for (const cell of numbers) {
            if (ctx.random() >= ctx.config.sharpEyeChance) {
              continue;
            }
            const target = ctx.randomHiddenZeroCell();
            if (!target) {
              break;
            }
            ctx.bump();
            ctx.toast("熟练的锐眼 · 额外扩散一片零区");
            ctx.queueReveal(target, { effectId: "buff_sharp_eye" }, ctx.depth + 1);
          }
        },
      },
    },
    {
      id: "buff_tianxia",
      name: "天下劫",
      type: "buff",
      glyph: "grid",
      desc: "第一击后随机框选三片 3×3 区域：区内安全格全开、雷全部标记。",
      hooks: {
        onMinesPlaced(ctx) {
          const state = ctx.state();
          if (state.done) {
            return;
          }
          state.done = true;
          const rects = ctx.randomRects(3, 3);
          if (!rects.length) {
            return;
          }
          state.rects = rects;
          ctx.bump();
          ctx.toast("天下劫 · 框选三片区域");
          ctx.queueArea(rects, { effectId: "buff_tianxia" }, ctx.depth + 1);
        },
      },
    },
    {
      id: "buff_leyline",
      name: "雷脉",
      type: "buff",
      glyph: "row",
      desc: "第一击后，把首击所在的一整横排开采：安全格全开、雷全部标记。",
      hooks: {
        onMinesPlaced(ctx) {
          const state = ctx.state();
          if (state.done || !ctx.origin) {
            return;
          }
          state.done = true;
          ctx.bump();
          ctx.toast("雷脉 · 开采首击横排");
          ctx.queueArea([{ x0: 0, y0: ctx.origin.y, w: ctx.cols, h: 1 }], { effectId: "buff_leyline" }, ctx.depth + 1);
        },
      },
    },
    {
      id: "buff_leyline2",
      name: "雷脉Ⅱ",
      type: "buff",
      glyph: "cross",
      desc: "第一击后，把首击所在的横排 + 竖排一起开采：安全格全开、雷全部标记。",
      hooks: {
        onMinesPlaced(ctx) {
          const state = ctx.state();
          if (state.done || !ctx.origin) {
            return;
          }
          state.done = true;
          ctx.bump();
          ctx.toast("雷脉Ⅱ · 开采首击横排 + 竖排");
          ctx.queueArea(
            [
              { x0: 0, y0: ctx.origin.y, w: ctx.cols, h: 1 },
              { x0: ctx.origin.x, y0: 0, w: 1, h: ctx.rows },
            ],
            { effectId: "buff_leyline2" },
            ctx.depth + 1
          );
        },
      },
    },
    {
      id: "buff_big_num",
      name: "大数字的对策",
      type: "buff",
      glyph: "big",
      desc: "每揭开一个 ≥4 的数字，获得 1 层免疫（可累计），挡住下一次负面效果触发。",
      hooks: {
        onRevealDone(ctx) {
          const bigs = ctx.newCells.filter((cell) => !cell.mine && cell.value >= 4);
          if (!bigs.length) {
            return;
          }
          ctx.grantImmunity(bigs.length);
          ctx.bump(bigs.length);
          ctx.toast(`大数字的对策 · 免疫 +${bigs.length}`);
        },
      },
    },
    {
      id: "buff_big_num2",
      name: "大数字的对策Ⅱ",
      type: "buff",
      glyph: "wave",
      desc: "每揭开一个 ≥5 的数字，播一次冲击波，并标记场上所有 ≥5 数字周围的雷。",
      hooks: {
        onRevealDone(ctx) {
          const bigs = ctx.newCells.filter((cell) => !cell.mine && cell.value >= 5);
          if (!bigs.length) {
            return;
          }
          ctx.bump();
          ctx.toast("大数字的对策Ⅱ · 冲击波标记");
          ctx.shockwave(bigs[0]);
          const targets = [];
          const seen = new Set();
          ctx.revealedCells().forEach((cell) => {
            if (cell.mine || cell.value < 5) {
              return;
            }
            ctx.neighbors(cell).forEach((n) => {
              if (!n.mine || n.flagged || n.revealed) {
                return;
              }
              const k = ctx.cellKey(n);
              if (seen.has(k)) {
                return;
              }
              seen.add(k);
              targets.push(n);
            });
          });
          if (targets.length) {
            ctx.queueFlagBatch(targets, { effectId: "buff_big_num2" }, ctx.depth + 1);
          }
        },
      },
    },
  ];

  const debuffs = [
    {
      id: "debuff_mist",
      name: "数字迷雾",
      type: "debuff",
      glyph: "mist",
      desc: "每个数字被揭开时，有 1/10 概率被迷雾盖住显示成「?」，本局不再恢复。格子内部仍然保留真实数字。",
      hooks: {
        onRevealCommit(ctx) {
          for (const cell of ctx.newCells) {
            if (cell.mine || cell.value < 1) {
              continue;
            }
            if (Math.random() >= ctx.config.mistChance) {
              continue;
            }
            if (ctx.spendImmunity()) {
              ctx.toast("免疫生效 · 挡下数字迷雾");
              continue;
            }
            ctx.markMisted(cell);
            ctx.bump();
          }
        },
      },
    },
    {
      id: "debuff_mine1",
      name: "雷区扩张Ⅰ",
      type: "debuff",
      glyph: "mineplus",
      desc: "本局雷的数量增加 15 颗（首击安全规则不变）。",
      mineDelta: 15,
      hooks: {},
    },
    {
      id: "debuff_mine2",
      name: "雷区扩张Ⅱ",
      type: "debuff",
      glyph: "mineplus",
      desc: "本局雷的数量增加 25 颗（首击安全规则不变）。",
      mineDelta: 25,
      hooks: {},
    },
    {
      id: "debuff_mine3",
      name: "雷区扩张Ⅲ",
      type: "debuff",
      glyph: "mineplus",
      desc: "本局雷的数量增加 35 颗（首击安全规则不变）。",
      mineDelta: 35,
      hooks: {},
    },
    {
      id: "debuff_sand",
      name: "沙尘漫天",
      type: "debuff",
      glyph: "sand",
      desc: "每标记 10 个雷，随机把 3 个已显示的数字盖成沙子（被盖的格子恢复成未翻开的样子，可以重新点开）。",
      hooks: {
        onFlagChange(ctx) {
          if (!ctx.flagValue || !ctx.flagCell.mine) {
            return;
          }
          const state = ctx.state();
          state.counted = state.counted || new Set();
          const id = ctx.cellKey(ctx.flagCell);
          if (state.counted.has(id)) {
            return;
          }
          state.counted.add(id);
          state.correct = (state.correct || 0) + 1;
          if (state.correct < ctx.config.sandEvery) {
            return;
          }
          const shown = ctx.revealedNumbers();
          if (!shown.length) {
            return;
          }
          state.correct -= ctx.config.sandEvery;
          if (ctx.spendImmunity()) {
            ctx.toast("免疫生效 · 挡下沙尘漫天");
            return;
          }
          const pool = shown.slice();
          const picks = [];
          for (let i = 0; i < ctx.config.sandCount && pool.length; i += 1) {
            picks.push(pool.splice(ctx.int(pool.length), 1)[0]);
          }
          ctx.bump();
          ctx.toast(`沙尘漫天 · 盖住 ${picks.length} 个数字`);
          ctx.queueSand(picks, { effectId: "debuff_sand" }, ctx.depth + 1);
        },
      },
    },
    {
      id: "debuff_boss1",
      name: "boss亦能存在Ⅰ",
      type: "debuff",
      glyph: "boss",
      desc: "本局雷的数量增加 10 颗，并且开局保证场上至少有 5 个 ≥6 的大数字。",
      mineDelta: 10,
      bossTarget: { value: 6, count: 5 },
      hooks: {},
    },
    {
      id: "debuff_boss2",
      name: "boss亦能存在Ⅱ",
      type: "debuff",
      glyph: "boss",
      desc: "本局雷的数量增加 20 颗，并且开局保证场上至少有 5 个 ≥8 的大数字。",
      mineDelta: 20,
      bossTarget: { value: 8, count: 5 },
      hooks: {},
    },
  ];

  window.MS_EFFECTS = {
    config: {
      cols: 16,
      rows: 16,
      mines: 40,
      sizes: {
        small: { id: "small", label: "小", cols: 10, rows: 10, mines: 15 },
        medium: { id: "medium", label: "中", cols: 16, rows: 16, mines: 40 },
        large: { id: "large", label: "大", cols: 24, rows: 24, mines: 90 },
      },
      maxChainEvents: 500,
      maxChainDepth: Infinity,
      mistChance: 0.1,
      sharpEyeThreshold: 0.4,
      sharpEyeChance: 0.2,
      sandEvery: 10,
      sandCount: 3,
    },
    tiers: {
      easy: { id: "easy", label: "简单", buffs: 4, debuffs: 1, desc: "正面多、负面少，玩起来轻松。" },
      normal: { id: "normal", label: "普通", buffs: 3, debuffs: 2, desc: "正面比负面稍多，比较均衡。" },
      hard: { id: "hard", label: "困难", buffs: 2, debuffs: 3, desc: "负面比正面多，难度偏高。" },
    },
    buffs,
    debuffs,
  };
})();
