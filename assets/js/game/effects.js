/* ==========================================================================
   技能扫雷 · 效果表
   --------------------------------------------------------------------------
   这是唯一需要改的地方：加效果 = 往 buffs / debuffs 数组里加一条即可，
   界面、抽取、动画、计数都会自动跟上。

   一条效果的结构：
   {
     id:        唯一的字符串 id
     name:      显示名
     type:      "buff" | "debuff"
     glyph:     图标名（radar / mist / expand / flagplus / headstart / shield / mineplus）
     desc:      一句话说明，显示在左侧效果卡里
     mineDelta: 可选，改变本局雷数（负面效果用，例如 +10、+15）
     hooks: { ... }   见下面的钩子清单
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
     ctx.config               全局配置（棋盘大小、基础雷数、连锁上限…）
     ctx.mines                本局雷数（已含负面效果加成）
     ctx.newCells             本次新揭开的格子数组
     ctx.newSafeCount         本次新揭开的“非雷”格子数量
     ctx.revealedBefore       本次操作之前就已经揭开的格子
     ctx.origin               本次操作的起点格子
     ctx.depth                当前连锁深度
     ctx.type                 本次钩子的类型字符串
     ctx.flagCell / flagValue 插旗钩子里的格子与结果
     ctx.hitCell              踩雷钩子里的那颗雷
     ctx.cancelLoss(opts)     免死：取消这次失败（默认把雷盖回去并插旗）
     ctx.isAdjacent(a, b)     两个格子是否相邻
     ctx.cellKey(cell)        格子的稳定 key，可以做 Set / Map 的键
     ctx.randomUnflaggedMine()          随机取一个还没插旗的雷（没有返回 null）
     ctx.randomHiddenSafeCell(opts)     随机取一个还没揭开的非雷格
                                        opts: { awayFrom: [cell], minGap: 5 }
     ctx.wasFired(cell) / ctx.markFired(cell)   给“每个格子只触发一次”这类效果用
     ctx.markMisted(cell)     把格子标记成被迷雾遮住（只影响显示）
     ctx.bump(n)              给这张效果卡 +n 次触发
     ctx.toast(text)          棋盘上飘一条小提示
     ctx.queueFlag(cell, meta, depth)    排队自动插旗（会走连锁结算）
     ctx.queueReveal(cell, meta, depth)  排队自动揭格（会走连锁结算）
     ctx.state()              本效果本局专属的可变对象，每局自动清空
     ctx.log(...)             输出到控制台，方便调试
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
              // 没有可以标记的雷时不消耗发射机会，等以后有目标了再说。
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
          if (ctx.effectDriven) {
            // 效果自己开的格子不再计入下一次进度，避免连锁失控。
            return;
          }
          const state = ctx.state();
          state.opened = (state.opened || 0) + ctx.newSafeCount;
          if (state.opened < 9) {
            return;
          }
          const target = ctx.randomHiddenSafeCell();
          if (!target) {
            // 没有可以揭的格子时留着进度，下次揭开后再结算。
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
          if (ctx.effectDriven) {
            // 效果自己开的格子不再计入下一次进度，避免连锁失控。
            return;
          }
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
      desc: "每亲手正确标记 5 个雷，额外随机标记 1 个雷（自动插的旗不算）。",
      hooks: {
        onFlagChange(ctx) {
          if (ctx.type !== "flag" || !ctx.flagValue || !ctx.flagCell.mine) {
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
      desc: "每亲手正确标记 8 个雷，额外随机标记 2 个雷（自动插的旗不算）。",
      hooks: {
        onFlagChange(ctx) {
          if (ctx.type !== "flag" || !ctx.flagValue || !ctx.flagCell.mine) {
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
            if (Math.random() < ctx.config.mistChance) {
              ctx.markMisted(cell);
              ctx.bump();
            }
          }
        },
      },
    },
    {
      id: "debuff_mine10",
      name: "雷区扩张 +10",
      type: "debuff",
      glyph: "mineplus",
      desc: "本局雷的数量增加 10 颗（首击安全规则不变）。",
      mineDelta: 10,
      hooks: {},
    },
    {
      id: "debuff_mine15",
      name: "雷区扩张 +15",
      type: "debuff",
      glyph: "mineplus",
      desc: "本局雷的数量增加 15 颗（首击安全规则不变）。",
      mineDelta: 15,
      hooks: {},
    },
  ];

  window.MS_EFFECTS = {
    config: {
      cols: 16,
      rows: 16,
      mines: 40,
      maxChainEvents: 30,
      maxChainDepth: 8,
      mistChance: 0.1,
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
