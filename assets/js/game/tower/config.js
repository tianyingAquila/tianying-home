/* ==========================================================================
   网格塔防 · 配置表
   --------------------------------------------------------------------------
   所有可调数值集中在这里：规则、塔、敌人、三张地图（路径/地形/波次）、配色。
   调平衡只改这个文件，不碰引擎和渲染。

   坐标约定：格子坐标 (col, row)，左上角是 (0, 0)。
   路径航点全是整数格心，敌人只沿正交方向移动——这是"坐标系式"塔防的根，
   也让寻路、射程、占格判定全部变成整数运算。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});

  /* ------------------------------------------------------------------ 规则 */

  /* 经济是难度的主旋钮。实测（60 局模拟）：
     赏金再降 15% 以上，布防略差的玩家会全败；再高则塔可以无脑铺满。
     当前值下：贴路布防稳胜，一半塔放错位置会在后几波崩。
     地图可以用自己的 lives / gold 覆盖这里的默认值。 */
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
     升级主要提升伤害与射程，除霜滞环外射速恒定。这样升级面板上通常只有两个数字在动，
     玩家一眼就知道自己花钱买到了什么，不必比对一堆属性。

     伤害基准按 1 / 2.6 / 3.9 倍递增；长轨炮的每级伤害增量在此基础上再 +20%。
     每级升级费 = 建造费，于是：
       花 2 倍钱：升级得 2.6 倍伤害，另建一座得 2 倍 → 升级高 30%
       花 3 倍钱：升级得 3.9 倍伤害，另建两座得 3 倍 → 升级高 30%
     即「总是升级」在同等经济下总 DPS 恒定比「总是铺塔」高 30%。
     铺塔换来的是覆盖面（能同时拦不同路段），两条路线各有用处。

     例外：霜滞环每级射速 +0.2、射程 +0.2，减速也随等级提升。它的全部价值是控制，
     若只长伤害，升级它会变成纯陷阱选项。

     散爆臼的射程涨幅刻意压小：覆盖面积按射程的平方增长，
     射程涨多了实际收益会远超 30%。光环塔则按指定平衡目标每级 +0.3 格。 */
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
        { damage: 10, rate: 1.4, range: 2.4, slow: 0.52, slowTime: 1.5, cost: 0 },
        { damage: 26, rate: 1.6, range: 2.6, slow: 0.62, slowTime: 1.9, cost: 90 },
        { damage: 39, rate: 1.8, range: 2.8, slow: 0.72, slowTime: 2.4, cost: 90 }
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
      instant: true,
      /* 平衡要点：射程是它唯一的优势，DPS 必须明显低于穿甲钉，
         否则它严格优于其他塔，玩家只会一直造它（实测过，会无脑通关）。 */
      levels: [
        { damage: 35, rate: 0.42, range: 5.6, cost: 0 },
        { damage: 102.2, rate: 0.42, range: 6.8, cost: 165 },
        { damage: 156.2, rate: 0.42, range: 8.0, cost: 165 }
      ]
    },
    aura: {
      key: "aura",
      name: "光环塔",
      en: "AURA",
      role: "近身全覆盖",
      desc: "射程很短，但每次脉冲对范围内全部敌人造成伤害，专克成群的小怪。",
      cost: 120,
      shape: "aura",
      aoe: true,
      instant: true,
      /* 和散爆臼分开定位：光环塔打身边、必中、没有弹道；散爆臼打远处、落点有延迟 */
      levels: [
        { damage: 16, rate: 0.8, range: 1.55, cost: 0 },
        { damage: 42, rate: 0.8, range: 1.85, cost: 120 },
        { damage: 62, rate: 0.8, range: 2.15, cost: 120 }
      ]
    },
    chain: {
      key: "chain",
      name: "连锁塔",
      en: "CHAIN",
      role: "闪电连锁",
      desc: "闪电命中主目标后，再跳向附近两个敌人；跳跃伤害减半。",
      cost: 130,
      shape: "chain",
      instant: true,
      chain: { jumps: 2, jumpRange: 1.8, ratio: 0.5 },
      levels: [
        { damage: 24, rate: 1.0, range: 3.0, cost: 0 },
        { damage: 62, rate: 1.0, range: 3.3, cost: 130 },
        { damage: 94, rate: 1.0, range: 3.6, cost: 130 }
      ]
    }
  };

  /* 全部塔的固定顺序（商店排列、数字快捷键都按这个顺序，再按地图过滤） */
  var TOWER_ORDER = ["bolt", "mortar", "frost", "rail", "aura", "chain"];

  /* ------------------------------------------------------------------ 敌人 */

  /* 靠形状区分族类，每种有自己的"运动语法"——静态形状平移会像死流水线，
     所以每种敌人的浮动/摆尾/沉步/自转都写在这里，由 enemies.js 执行。
     speed 单位是格/秒。armor 是每次受击的固定减免。leak 是漏掉时扣几条命。 */
  var ENEMIES = {
    drone: {
      key: "drone",
      name: "巡飞",
      en: "DRONE",
      note: "常规，成群出现",
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
      note: "极快，血薄",
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
      note: "厚甲，迟缓",
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
      note: "首领，漏掉扣 3 生命",
      shape: "ringed",
      hp: 900,
      speed: 0.72,
      armor: 9,
      bounty: 115,
      radius: 0.46,
      boss: true,
      leak: 3,
      motion: { spin: 0.55, ringSpin: -0.9, bob: 0.03, bobRate: 2.0 }
    },
    splitter: {
      key: "splitter",
      name: "分裂者",
      en: "SPLITTER",
      note: "死后裂成 3 个分裂体",
      shape: "trefoil",
      hp: 90,
      speed: 1.25,
      armor: 0,
      bounty: 8,
      radius: 0.32,
      /* 死亡时原地裂开。裂出的分裂体只给 1 金，否则散爆臼打分裂者就成了刷钱 */
      split: { type: "shard", count: 3, bounty: 1 },
      motion: { breathe: 0.08, breatheRate: 3.4, spin: 0.9 }
    },
    shard: {
      key: "shard",
      name: "分裂体",
      en: "SHARD",
      note: "分裂者裂出或召唤者召唤，血少跑得快",
      shape: "mote",
      hp: 22,
      speed: 2.1,
      armor: 0,
      bounty: 1,
      radius: 0.17,
      minion: true,
      motion: { jitter: 0.045, jitterRate: 17 }
    },
    summoner: {
      key: "summoner",
      name: "召唤者",
      en: "SUMMONER",
      note: "精英，不吃减速；每 5 秒召唤 2 个分裂体",
      shape: "summoner",
      hp: 450,               /* 监护者的一半 */
      speed: 0.78,
      armor: 5,
      bounty: 60,
      radius: 0.42,
      elite: true,
      leak: 2,
      slowImmune: true,
      /* 召唤物不给钱：它就是来堆压力的，给钱会变成刷钱机器。
         上限 15 只（每个召唤者各算各的），太少会失去"堆怪"的压迫感。 */
      summon: { type: "shard", count: 2, every: 5, cap: 15, bounty: 0, stopAt: 0.8 },
      motion: { spin: 0.45, orbit: 2.4, bob: 0.03, bobRate: 2.4 }
    }
  };

  /* 图例展示顺序（只列地图里真正会出现的） */
  var ENEMY_ORDER = ["drone", "rusher", "hauler", "warden", "splitter", "shard", "summoner"];

  /* ------------------------------------------------------------------ 地图 */

  /* 每张地图自带：尺寸、若干条路径（出怪口→防御点）、地形块、可用塔、出场敌人、波次。

     paths[].weight：一波里的敌人按这个比例分到各条路上（短路线分得少）。
     波次 groups：[敌人类型, 数量, 间隔秒, 起始延迟秒, 指定路线(可省略)]。
     省略路线时由调度器按 weight 交错分配，保证同一波里各条路的压力比例稳定。

     endgame：最后三波的血量额外倍数。试玩反馈"前面不认真也能通关"，
     所以每张图最后三波都明显拉开，才是真正的考验。 */

  /* ---- 地图 1 · 回廊：单入口单防线，蛇形 ---- */
  var MAP1 = {
    id: 1,
    name: "回廊",
    en: "CORRIDOR",
    desc: "单入口 · 单防线",
    cols: 15,
    rows: 11,
    paths: [
      {
        weight: 1,
        points: [
          { c: -1, r: 1 }, { c: 11, r: 1 }, { c: 11, r: 4 }, { c: 3, r: 4 },
          { c: 3, r: 7 }, { c: 12, r: 7 }, { c: 12, r: 9 }, { c: 15, r: 9 }
        ]
      }
    ],
    /* 地形块：没有它们时贴路空地有 100 多格，实测能无脑铺 50 座塔通关 */
    blocks: [
      [1, 3], [2, 3], [1, 9], [2, 9], [0, 6], [1, 6],
      [5, 0], [6, 0], [8, 2], [9, 2],
      [6, 5], [7, 5], [6, 6], [7, 6],
      [13, 2], [14, 2], [13, 5], [14, 5],
      [5, 9], [6, 9], [9, 10], [10, 10],
      [0, 10], [1, 10], [8, 8], [9, 8]
    ],
    towers: ["bolt", "mortar", "frost", "rail"],
    enemies: ["drone", "rusher", "hauler", "warden"],
    /* 实测（每种打法 6 局）：只铺不升全死在 16，升级铺塔各一半死在 17~18，
       多塔种 + 优先升级的认真布防才能通关且只剩约 8 命。 */
    endgame: { 16: 1.8, 17: 2.2, 18: 2.6 },
    waves: [
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
      { no: 15, groups: [["warden", 3, 4.5, 0], ["hauler", 8, 1.4, 2.0], ["rusher", 18, 0.34, 6.0]] },
      { no: 16, groups: [["warden", 4, 3.6, 0], ["hauler", 12, 1.05, 1.0], ["drone", 20, 0.38, 3.0]], note: "终局 · 一" },
      { no: 17, groups: [["rusher", 30, 0.24, 0], ["hauler", 10, 1.1, 2.0], ["warden", 3, 4.0, 6.0]], note: "终局 · 二" },
      /* 最终波：首领全程持续出场，三种小怪混编穿插其间 */
      { no: 18, groups: [
        ["warden", 9, 4.2, 0], ["drone", 26, 0.55, 1.0],
        ["rusher", 26, 0.55, 2.5], ["hauler", 16, 1.6, 4.0]
      ], note: "最终波" }
    ]
  };

  /* ---- 地图 2 · 交错：双入口双防线 ----
     按主人在 mapcraft 上画的图转写。红线（左上→左下）54 格，紫线（右上→右下）32 格。
     第 7 列第 5~8 行是两条线反向共用的走廊，(9,5) 和 (9,8) 是十字交叉。
     紫线只有红线六成长，所以右侧出怪按四成分配。两个防御点共用 20 条命。 */
  var MAP2 = {
    id: 2,
    name: "交错",
    en: "CROSSING",
    desc: "双入口 · 双防线",
    cols: 15,
    rows: 11,
    paths: [
      {
        weight: 0.6,
        points: [
          { c: 1, r: 0 }, { c: 1, r: 1 }, { c: 9, r: 1 }, { c: 9, r: 10 },
          { c: 3, r: 10 }, { c: 3, r: 5 }, { c: 5, r: 5 }, { c: 5, r: 8 },
          { c: 7, r: 8 }, { c: 7, r: 3 }, { c: 1, r: 3 }, { c: 1, r: 10 }
        ]
      },
      {
        weight: 0.4,
        points: [
          { c: 13, r: 0 }, { c: 13, r: 1 }, { c: 11, r: 1 }, { c: 11, r: 3 },
          { c: 13, r: 3 }, { c: 13, r: 5 }, { c: 7, r: 5 }, { c: 7, r: 8 },
          { c: 11, r: 8 }, { c: 11, r: 7 }, { c: 14, r: 7 }, { c: 14, r: 10 },
          { c: 11, r: 10 }
        ]
      }
    ],
    gold: 260,
    blocks: [],
    towers: ["bolt", "mortar", "frost", "rail", "aura"],
    enemies: ["drone", "rusher", "hauler", "warden", "splitter", "shard"],
    /* 实测（每种打法 5 局）：只铺不升全死在 16；升级铺塔各一半 4/5 死在 18；
       认真布防通关且约剩 8 命——和地图 1 是同一条难度曲线。
       两条路把火力摊薄，所以起始金币比地图 1 多 30，终局系数也略低。 */
    endgame: { 16: 1.7, 17: 2.05, 18: 2.4 },
    waves: [
      { no: 1, groups: [["drone", 8, 0.9, 0]] },
      { no: 2, groups: [["drone", 10, 0.75, 0], ["rusher", 4, 0.5, 6.0]] },
      { no: 3, groups: [["splitter", 4, 1.6, 0], ["drone", 6, 0.8, 2.0]], note: "分裂者首次出现" },
      { no: 4, groups: [["rusher", 12, 0.42, 0]] },
      { no: 5, groups: [["hauler", 3, 2.0, 0], ["splitter", 5, 1.3, 1.5]] },
      { no: 6, groups: [["drone", 14, 0.5, 0], ["rusher", 8, 0.45, 4.0]] },
      { no: 7, groups: [["splitter", 9, 0.9, 0], ["hauler", 3, 2.0, 3.0]] },
      { no: 8, groups: [["warden", 1, 0, 0], ["drone", 10, 0.8, 2.5]], note: "首个监护者" },
      { no: 9, groups: [["rusher", 18, 0.33, 0]] },
      { no: 10, groups: [["hauler", 7, 1.4, 0], ["splitter", 8, 0.9, 3.0]] },
      { no: 11, groups: [["drone", 20, 0.42, 0], ["splitter", 6, 1.1, 4.0]] },
      { no: 12, groups: [["warden", 2, 5.0, 0], ["rusher", 14, 0.4, 3.0]] },
      { no: 13, groups: [["splitter", 14, 0.7, 0], ["hauler", 8, 1.3, 2.0]] },
      { no: 14, groups: [["rusher", 24, 0.28, 0], ["hauler", 6, 1.5, 5.0]] },
      { no: 15, groups: [["warden", 3, 4.5, 0], ["splitter", 10, 0.8, 2.0], ["rusher", 16, 0.34, 6.0]] },
      { no: 16, groups: [["warden", 4, 3.6, 0], ["splitter", 16, 0.6, 1.0], ["hauler", 10, 1.1, 3.0]], note: "终局 · 一" },
      { no: 17, groups: [["rusher", 30, 0.24, 0], ["splitter", 14, 0.7, 2.0], ["warden", 3, 4.0, 6.0]], note: "终局 · 二" },
      { no: 18, groups: [
        ["warden", 9, 4.2, 0], ["splitter", 20, 0.9, 1.0], ["drone", 22, 0.6, 2.0],
        ["rusher", 22, 0.6, 3.0], ["hauler", 14, 1.7, 4.0]
      ], note: "最终波" }
    ]
  };

  /* ---- 地图 3 · 汇流：三入口双防线，20×11 ----
     红线（左上→左下）54 格；紫线（右上→中央）38 格；绿线（右下→中央）36 格。
     紫线与绿线在 (11,2) 汇合，最后 11 格共用一条道直奔中央防御点；
     红线在第 8 行第 9~11 列与它们反向擦肩。中央防御点是两路汇流的咽喉。
     20 列是手机横屏还能舒服点按（格子约 28px）的宽度上限。 */
  var MAP3 = {
    id: 3,
    name: "汇流",
    en: "CONFLUENCE",
    desc: "三入口 · 双防线",
    cols: 20,
    rows: 11,
    gold: 300,
    paths: [
      {
        weight: 0.42,
        points: [
          { c: 1, r: 0 }, { c: 1, r: 6 }, { c: 0, r: 6 }, { c: 0, r: 7 },
          { c: 1, r: 7 }, { c: 1, r: 8 }, { c: 5, r: 8 }, { c: 5, r: 6 },
          { c: 3, r: 6 }, { c: 3, r: 4 }, { c: 7, r: 4 }, { c: 7, r: 8 },
          { c: 16, r: 8 }, { c: 16, r: 10 }, { c: 1, r: 10 }
        ]
      },
      {
        weight: 0.30,
        points: [
          { c: 18, r: 0 }, { c: 3, r: 0 }, { c: 3, r: 2 }, { c: 9, r: 2 },
          { c: 9, r: 3 }, { c: 10, r: 3 }, { c: 10, r: 2 }, { c: 11, r: 2 },
          { c: 11, r: 8 }, { c: 9, r: 8 }, { c: 9, r: 5 }
        ]
      },
      {
        weight: 0.28,
        points: [
          { c: 18, r: 10 }, { c: 18, r: 6 }, { c: 17, r: 6 }, { c: 17, r: 5 },
          { c: 18, r: 5 }, { c: 18, r: 2 }, { c: 15, r: 2 }, { c: 15, r: 6 },
          { c: 13, r: 6 }, { c: 13, r: 2 }, { c: 11, r: 2 }, { c: 11, r: 8 },
          { c: 9, r: 8 }, { c: 9, r: 5 }
        ]
      }
    ],
    blocks: [],
    towers: ["bolt", "mortar", "frost", "rail", "aura", "chain"],
    enemies: ["drone", "rusher", "hauler", "warden", "splitter", "shard", "summoner"],
    /* 实测：只铺不升全死在 15；升级铺塔各一半 4/5 死在 20；认真布防通关约剩 5 命 */
    endgame: { 18: 1.7, 19: 2.05, 20: 2.4 },
    waves: [
      { no: 1, groups: [["drone", 10, 0.8, 0]] },
      { no: 2, groups: [["drone", 10, 0.7, 0], ["rusher", 6, 0.45, 5.0]] },
      { no: 3, groups: [["splitter", 6, 1.3, 0], ["drone", 6, 0.8, 2.0]] },
      { no: 4, groups: [["rusher", 14, 0.38, 0]] },
      { no: 5, groups: [["hauler", 4, 1.8, 0], ["splitter", 6, 1.2, 1.5]] },
      { no: 6, groups: [["drone", 16, 0.45, 0], ["rusher", 10, 0.4, 4.0]] },
      { no: 7, groups: [["splitter", 10, 0.85, 0], ["hauler", 4, 1.8, 3.0]] },
      { no: 8, groups: [["warden", 1, 0, 0], ["drone", 12, 0.7, 2.0]], note: "首个监护者" },
      { no: 9, groups: [["summoner", 1, 0, 0], ["drone", 10, 0.7, 2.0]], note: "召唤者首次出现" },
      { no: 10, groups: [["rusher", 20, 0.3, 0], ["hauler", 6, 1.5, 4.0]] },
      { no: 11, groups: [["splitter", 12, 0.75, 0], ["summoner", 1, 0, 3.0]] },
      { no: 12, groups: [["warden", 2, 5.0, 0], ["drone", 18, 0.45, 2.0]] },
      { no: 13, groups: [["hauler", 10, 1.2, 0], ["rusher", 14, 0.36, 3.0]] },
      { no: 14, groups: [["summoner", 2, 6.0, 0], ["splitter", 12, 0.7, 2.0]] },
      { no: 15, groups: [["warden", 3, 4.5, 0], ["rusher", 18, 0.32, 4.0]] },
      { no: 16, groups: [["splitter", 18, 0.6, 0], ["hauler", 8, 1.3, 2.0], ["summoner", 1, 0, 6.0]] },
      { no: 17, groups: [["warden", 3, 4.0, 0], ["summoner", 2, 5.0, 2.0], ["drone", 20, 0.45, 1.0]] },
      { no: 18, groups: [["warden", 3, 4.0, 0], ["summoner", 2, 5.0, 2.0], ["splitter", 18, 0.6, 1.0], ["hauler", 10, 1.1, 3.0]], note: "终局 · 一" },
      { no: 19, groups: [["rusher", 34, 0.22, 0], ["summoner", 3, 4.0, 2.0], ["splitter", 14, 0.7, 4.0], ["warden", 2, 4.0, 8.0]], note: "终局 · 二" },
      /* 首领数比地图 1 的最终波少：三条路把火力摊薄了。
         实测原先 7 首领 + 3 召唤者的总血量是第 19 波的 3 倍，任何打法都过不去；
         现在压到约 2 倍，仍是全图最难的一波。 */
      { no: 20, groups: [
        ["warden", 4, 5.0, 0], ["summoner", 2, 9.0, 3.0], ["splitter", 16, 1.1, 1.0],
        ["drone", 20, 0.7, 2.0], ["rusher", 20, 0.7, 3.0], ["hauler", 10, 1.9, 4.0]
      ], note: "最终波" }
    ]
  };

  var MAPS = [MAP1, MAP2, MAP3];

  function mapById(id) {
    var i;
    for (i = 0; i < MAPS.length; i++) {
      if (MAPS[i].id === id) { return MAPS[i]; }
    }
    return MAPS[0];
  }

  /* 波次强化系数：血量随波次线性抬升，速度轻微；最后三波再乘地图的终局系数 */
  function waveScale(map, no) {
    var end = (map && map.endgame && map.endgame[no]) || 1;
    return {
      hp: (1 + (no - 1) * 0.155) * end,
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
    maxEnemies: 260,     /* 召唤/分裂的总量保险丝：到顶就不再生成新的小怪 */
    stepHz: 60           /* 逻辑固定步长 */
  };

  TD.config = {
    RULES: RULES,
    TOWERS: TOWERS,
    TOWER_ORDER: TOWER_ORDER,
    ENEMIES: ENEMIES,
    ENEMY_ORDER: ENEMY_ORDER,
    MAPS: MAPS,
    mapById: mapById,
    waveScale: waveScale,
    PALETTE: PALETTE,
    LIMITS: LIMITS
  };
})(window);
