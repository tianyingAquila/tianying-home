/* ==========================================================================
   扫雷效果表
   --------------------------------------------------------------------------
   这里是唯一需要改动的地方：把占位效果替换成真实效果，或继续往数组里加。

   一条效果的结构：
   {
     id:   唯一的字符串 id
     name: 显示名
     type: "buff" | "debuff"
     glyph: 图标名（radar / mist / blank）
     desc: 一句话说明，显示在左侧效果卡里
     placeholder: true 表示还没实现，只是占位
     hooks: {
       onGameStart(ctx)      开局时
       onRevealCommit(ctx)   已经算出要揭开的格子、但动画还没播时
       onRevealDone(ctx)     揭开动画播完之后
       onFlagChange(ctx)     插旗 / 取消旗之后
       onGameEnd(ctx)        结算时
     }
   }

   ctx 能用的东西（minesweeper.js 提供）：
     ctx.newCells            本次新揭开的格子数组
     ctx.revealedBefore      本次操作之前就已经揭开的格子数组
     ctx.origin              本次操作的起点格子
     ctx.depth               当前连锁深度
     ctx.isAdjacent(a, b)    两个格子是否相邻
     ctx.randomUnflaggedMine()  随机取一个还没插旗的雷（没有就返回 null）
     ctx.wasFired(cell) / ctx.markFired(cell)   给"每个格子只触发一次"这类效果用
     ctx.markMisted(cell)    把格子标记成被迷雾遮住（只影响显示）
     ctx.bump()              给这张效果卡 +1 触发次数
     ctx.queueFlag(cell, meta, depth)  排队一次自动插旗（会走连锁结算）
     ctx.log(msg)            输出到控制台，方便调试
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
  ];

  // 其余槽位先占位，用来验证简单 / 普通 / 困难的抽取配额。
  // 想加真效果时，把对应槽位的 placeholder 去掉并补上 hooks 即可。
  for (let i = 2; i <= 12; i += 1) {
    buffs.push({
      id: `buff_blank_${i}`,
      name: `空白正面效果 ${i}`,
      type: "buff",
      glyph: "blank",
      placeholder: true,
      desc: "占位槽，还没有设计效果。以后在这里写你的正面效果即可。",
      hooks: {},
    });
    debuffs.push({
      id: `debuff_blank_${i}`,
      name: `空白负面效果 ${i}`,
      type: "debuff",
      glyph: "blank",
      placeholder: true,
      desc: "占位槽，还没有设计效果。以后在这里写你的负面效果即可。",
      hooks: {},
    });
  }

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
