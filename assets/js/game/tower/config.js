/* ==========================================================================
   网格塔防 · 配置表
   --------------------------------------------------------------------------
   所有可调数值集中在这里：地图、路径、塔、敌人、波次、配色。
   调平衡只改这个文件，不碰引擎和渲染。

   坐标约定：格子坐标 (col, row)，左上角是 (0, 0)。
   路径航点全是整数格心，敌人只沿正交方向移动——这是"坐标系式"塔防的根，
   也让寻路、射程、占格判定全部变成整数运算。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});

  /* ------------------------------------------------------------------ 地图 */

  var GRID = {
    cols: 15,
    rows: 11
  };

  /* 蛇形正交路径：左侧 row 1 进场，右侧 row 9 出场。
     每段都是纯横向或纯竖向，转角为直角。 */
  var PATH = [
    { c: -1, r: 1 },
    { c: 11, r: 1 },
    { c: 11, r: 4 },
    { c: 3, r: 4 },
    { c: 3, r: 7 },
    { c: 12, r: 7 },
    { c: 12, r: 9 },
    { c: 15, r: 9 }
  ];

  /* 地形块：不能建塔也不是路。
     没有它们的话贴路空地有 100 多格，玩家可以无脑铺满塔，
     "放哪"就不再是决策了——实测会堆到 50 座塔无脑通关。
     这些块把好位置变成稀缺资源，顺带压住了塔的数量上限（也就压住了 CPU）。 */
  var BLOCKS = [
    [1, 3], [2, 3], [1, 9], [2, 9], [0, 6], [1, 6],
    [5, 0], [6, 0], [8, 2], [9, 2],
    [6, 5], [7, 5], [6, 6], [7, 6],
    [13, 2], [14, 2], [13, 5], [14, 5],
    [5, 9], [6, 9], [9, 10], [10, 10],
    [0, 10], [1, 10], [8, 8], [9, 8]
  ];

  /* ------------------------------------------------------------------ 规则 */

  /* 经济是难度的主旋钮。实测（60 局模拟）：
     赏金再降 15% 以上，布防略差的玩家会全败；再高则塔可以无脑铺满。
     当前值下：贴路布防稳胜，一半塔放错位置会在后几波崩。 */
  var RULES = {
    lives: 20,
    gold: 230,
    sellRatio: 0.6,      /* 拆塔返还比例 */
    speeds: [1, 2],      /* 倍速档 */
    waveGap: 4.0,        /* 波间喘息秒数 */
    firstWaveDelay: 6.0  /* 开局准备时间 */
  };

  /* ------------------------------------------------------------------ 塔 */

  /* 每种塔有明确战术角色，不是"造价和射程不同的同质塔"。
     range 单位是格；rate 是每秒发射次数；dps 由 damage × rate 得出。

     ---- 升级规则（刻意设计，改之前先读完） ----
     升级**只提升伤害与射程，射速恒定**。这样升级面板上只有两个数字在动，
     玩家一眼就知道自己花钱买到了什么，不必比对一堆属性。

     伤害固定按 1 / 2.6 / 3.9 倍递增，且**每级升级费 = 建造费**，于是：
       花 2 倍钱：升级得 2.6 倍伤害，另建一座得 2 倍 → 升级高 30%
       花 3 倍钱：升级得 3.9 倍伤害，另建两座得 3 倍 → 升级高 30%
     即「总是升级」在同等经济下总 DPS 恒定比「总是铺塔」高 30%。
     铺塔换来的是覆盖面（能同时拦不同路段），两条路线各有用处。

     例外：霜滞环的减速随等级提升。它的全部价值是控制而非伤害，
     若只长伤害，升级它等于花钱买 +6 伤害，会变成纯陷阱选项。 */
  var TOWERS = {
    bolt: {
      key: "bolt",
      name: "穿甲钉",
      en: "BOLT",
      role: "单体速射",
      desc: "射速快、单体伤害稳定。布防主力，性价比最高。",
      cost: 60,
      shape: "bolt",
      levels: [
        { damage: 10, rate: 2.2, range: 2.6, cost: 0 },
        { damage: 26, rate: 2.2, range: 3.0, cost: 60 },
        { damage: 39, rate: 2.2, range: 3.4, cost: 60 }
      ]
    },
    mortar: {
      key: "mortar",
      name: "散爆臼",
      en: "MORTAR",
      role: "范围溅射",
      desc: "炮弹落点范围伤害。对成群小怪效率极高，打单体慢。",
      cost: 110,
      shape: "mortar",
      splash: true,
      levels: [
        { damage: 20, rate: 0.75, range: 3.2, splash: 1.05, cost: 0 },
        { damage: 52, rate: 0.75, range: 3.5, splash: 1.25, cost: 110 },
        { damage: 78, rate: 0.75, range: 3.8, splash: 1.45, cost: 110 }
      ]
    },
    frost: {
      key: "frost",
      name: "霜滞环",
      en: "FROST",
      role: "减速控制",
      desc: "命中后大幅拖慢目标。自身伤害低，靠配合别的塔输出。",
      cost: 90,
      shape: "frost",
      levels: [
        { damage: 10, rate: 1.4, range: 2.4, slow: 0.42, slowTime: 1.5, cost: 0 },
        { damage: 26, rate: 1.4, range: 2.8, slow: 0.52, slowTime: 1.9, cost: 90 },
        { damage: 39, rate: 1.4, range: 3.2, slow: 0.62, slowTime: 2.4, cost: 90 }
      ]
    },
    rail: {
      key: "rail",
      name: "长轨炮",
      en: "RAIL",
      role: "远程狙击",
      desc: "射程覆盖半张图，单发极重还能贯穿三个。但 DPS 低于穿甲钉，怕被小怪淹。",
      cost: 165,
      shape: "rail",
      pierce: true,
      /* 平衡要点：射程是它唯一的优势，DPS 必须明显低于穿甲钉，
         否则它严格优于其他塔，玩家只会一直造它（实测过，会无脑通关）。 */
      levels: [
        { damage: 35, rate: 0.42, range: 5.6, cost: 0 },
        { damage: 91, rate: 0.42, range: 6.3, cost: 165 },
        { damage: 136, rate: 0.42, range: 7.0, cost: 165 }
      ]
    }
  };

  var TOWER_ORDER = ["bolt", "mortar", "frost", "rail"];

  /* ------------------------------------------------------------------ 敌人 */

  /* 靠形状区分族类，每种有自己的"运动语法"——静态形状平移会像死流水线，
     所以每种敌人的浮动/摆尾/沉步/自转都写在这里，由 enemies.js 执行。
     speed 单位是格/秒。armor 是每次受击的固定减免。 */
  var ENEMIES = {
    drone: {
      key: "drone",
      name: "巡飞",
      en: "DRONE",
      shape: "circle",
      hp: 42,
      speed: 1.55,
      armor: 0,
      bounty: 7,
      radius: 0.30,
      motion: { bob: 0.055, bobRate: 4.2 }
    },
    rusher: {
      key: "rusher",
      name: "疾突",
      en: "RUSHER",
      shape: "triangle",
      hp: 30,
      speed: 2.75,
      armor: 0,
      bounty: 9,
      radius: 0.29,
      motion: { sway: 0.30, swayRate: 9.5, lean: 0.34 }
    },
    hauler: {
      key: "hauler",
      name: "重载",
      en: "HAULER",
      shape: "square",
      hp: 170,
      speed: 0.92,
      armor: 4,
      bounty: 18,
      radius: 0.33,
      motion: { sink: 0.045, sinkRate: 2.6, tilt: 0.05 }
    },
    warden: {
      key: "warden",
      name: "监护者",
      en: "WARDEN",
      shape: "ringed",
      hp: 900,
      speed: 0.72,
      armor: 9,
      bounty: 115,
      radius: 0.46,
      boss: true,
      motion: { spin: 0.55, ringSpin: -0.9, bob: 0.03, bobRate: 2.0 }
    }
  };

  /* ------------------------------------------------------------------ 波次 */

  /* 手写 15 波，有节奏：压力 → 喘息 → 高潮。
     程序随机生成的波次永远是一锅粥，手写才有起伏。
     groups: [敌人类型, 数量, 间隔秒, 起始延迟秒] */
  var WAVES = [
    { no: 1, groups: [["drone", 6, 0.95, 0]] },
    { no: 2, groups: [["drone", 9, 0.80, 0]] },
    { no: 3, groups: [["drone", 6, 0.85, 0], ["rusher", 4, 0.55, 5.5]] },
    { no: 4, groups: [["rusher", 10, 0.48, 0]] },
    { no: 5, groups: [["hauler", 3, 2.1, 0], ["drone", 8, 0.75, 1.2]], note: "重载首次出现" },
    { no: 6, groups: [["rusher", 12, 0.42, 0], ["hauler", 2, 2.4, 3.0]] },
    { no: 7, groups: [["drone", 14, 0.55, 0], ["hauler", 4, 1.9, 2.0]] },
    { no: 8, groups: [["warden", 1, 0, 0], ["drone", 8, 0.9, 2.5]], note: "首个监护者" },
    { no: 9, groups: [["rusher", 16, 0.36, 0]] },
    { no: 10, groups: [["hauler", 7, 1.5, 0], ["rusher", 10, 0.5, 4.0]] },
    { no: 11, groups: [["drone", 18, 0.45, 0], ["hauler", 5, 1.7, 3.0]] },
    { no: 12, groups: [["warden", 2, 5.5, 0], ["rusher", 14, 0.42, 3.0]] },
    { no: 13, groups: [["hauler", 10, 1.25, 0], ["drone", 16, 0.42, 2.0]] },
    { no: 14, groups: [["rusher", 22, 0.30, 0], ["hauler", 6, 1.6, 5.0]] },
    { no: 15, groups: [["warden", 3, 4.5, 0], ["hauler", 8, 1.4, 2.0], ["rusher", 18, 0.34, 6.0]], note: "最终波" }
  ];

  /* 后续波次的整体强化系数（血量随波次线性抬升，速度轻微） */
  function waveScale(no) {
    return {
      hp: 1 + (no - 1) * 0.155,
      speed: 1 + (no - 1) * 0.011
    };
  }

  /* ------------------------------------------------------------------ 配色 */

  /* 与 tokens.css 一一对应。canvas 拿不到 CSS 变量，所以在这里再写一份，
     改色时两边都要改（tokens.css 是设计事实来源）。 */
  var PALETTE = {
    bone: "#f6f5f3",
    boneWarm: "#efece6",
    file: "#ffffff",
    ink: "#14161a",
    muted: "rgba(20, 22, 26, 0.46)",
    faint: "rgba(20, 22, 26, 0.26)",
    line: "rgba(20, 22, 26, 0.16)",
    hair: "rgba(20, 22, 26, 0.08)",
    accent: "#b4794a",
    steel: "#4a6b82",
    gold: "#9a7b3f",
    alert: "#9c4a3f",
    gain: "#5f7a4f"
  };

  /* ------------------------------------------------------------------ 性能 */

  var LIMITS = {
    maxParticles: 220,   /* 粒子硬上限，超了就不再生成 */
    maxBullets: 260,
    stepHz: 60           /* 逻辑固定步长 */
  };

  TD.config = {
    GRID: GRID,
    PATH: PATH,
    BLOCKS: BLOCKS,
    RULES: RULES,
    TOWERS: TOWERS,
    TOWER_ORDER: TOWER_ORDER,
    ENEMIES: ENEMIES,
    WAVES: WAVES,
    waveScale: waveScale,
    PALETTE: PALETTE,
    LIMITS: LIMITS
  };
})(window);
