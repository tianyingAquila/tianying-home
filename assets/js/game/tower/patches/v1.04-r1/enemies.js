/* ==========================================================================
   敌人 · 运动语法与受击表现
   --------------------------------------------------------------------------
   这个文件的重点不是血量，是"活着的感觉"。
   静态形状沿路径平移 = 死流水线，再好的配色也救不回来。
   所以每族敌人有自己固定的运动语法，全部由数学生成，零贴图：

     圆（巡飞）    上下浮动，像悬浮着走
     三角（疾突）  左右摆尾，摆频跟着速度，转弯时整体倾斜
     方（重载）    几乎不晃，但有节奏地微沉，走得沉重
     环（监护者）  本体缓慢自转 + 外环反向自转（反向差是关键，同向会很廉价）
     三叶（分裂者）一胀一缩地"呼吸"并缓慢自转，像随时要裂开
     碎点（分裂体）高频小幅抖动，像一群躁动的碎屑
     菱（召唤者）  本体自转，三颗小点绕身公转；召唤那一刻整体一缩一弹

   受击统一是"朝受力方向压扁再弹回"的形变，不是闪白。
   死亡是碎片沿惯性飞散后淡出，不是原地消失。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  var seq = 0;

  /* map 用来取终局系数；path 是这只敌人走哪条路 */
  function Enemy(typeKey, waveNo, map, path) {
    var type = cfg.ENEMIES[typeKey];
    /* 分裂体不吃终局倍数：它是"堆数量"的压力，不是终局考验本身。
       实测吃了倍数后，第 20 波的召唤物每只近 200 血、跑得又快，任何打法都守不住。 */
    var scale = cfg.waveScale(type.minion ? null : map, waveNo);

    this.id = ++seq;
    this.type = type;
    this.key = typeKey;
    this.shape = type.shape;
    this.boss = !!type.boss;
    this.elite = !!type.elite;
    this.minion = !!type.minion;
    this.slowImmune = !!type.slowImmune;

    this.maxHp = Math.round(type.hp * scale.hp);
    this.hp = this.maxHp;
    this.baseSpeed = type.speed * scale.speed;
    this.armor = type.armor;
    this.bounty = Math.floor(type.bounty * ((map && map.bountyScale) || 1));
    this.leakCost = type.leak || 1;
    this.radius = type.radius;
    this.motion = type.motion || {};

    /* 沿自己那条路走过的格数 */
    this.path = path || 0;
    this.dist = 0;
    this.c = 0;
    this.r = 0;
    this.dc = 1;
    this.dr = 0;

    this.alive = true;
    this.leaked = false;

    /* 减速：slowTime 是剩余秒数，slowFactor 取最强的那次 */
    this.slowTime = 0;
    this.slowFactor = 1;

    /* 受击形变：hitTime 递减，hitDx/hitDy 是受力方向 */
    this.hitTime = 0;
    this.hitDx = 0;
    this.hitDy = 0;

    /* 召唤者：计时与"自己召唤出来、还活着的"数量（上限在 config 里） */
    if (type.summon) {
      this.summonTimer = type.summon.every * 0.6;   /* 出场后稍快地召唤第一次 */
      this.minionsAlive = 0;
      this.summonPulse = 0;                          /* 召唤瞬间的一缩一弹，渲染用 */
    }
    this.master = null;    /* 被召唤出来的小怪指向它的召唤者 */
    this.healTimer = type.heal ? type.heal.every : 0;
    this.castRemaining = 0;
    this.healReady = false;
    this.healPulse = 0;

    /* 相位错开，让同批敌人不整齐地一起晃——整齐才像流水线 */
    this.phase = Math.random() * Math.PI * 2;
    this.spin = Math.random() * Math.PI * 2;
    this.ringSpin = 0;
    this.orbit = Math.random() * Math.PI * 2;
  }

  Enemy.prototype.speed = function () {
    return this.baseSpeed * this.slowFactor;
  };

  Enemy.prototype.applySlow = function (factor, time) {
    /* 召唤者是精英，免疫减速 */
    if (this.slowImmune) { return; }
    /* 取更强的减速，并刷新持续时间；不叠乘，避免多个霜塔把怪彻底冻死 */
    if (factor < this.slowFactor || this.slowTime <= 0) {
      this.slowFactor = Math.min(this.slowFactor, factor);
    }
    this.slowTime = Math.max(this.slowTime, time);
  };

  Enemy.prototype.hurt = function (amount, fromC, fromR, continuousDt) {
    /* 激光按秒减免护甲，不能在60Hz下每帧扣一次完整护甲或保底1伤害。 */
    var real = continuousDt ? Math.min(this.hp, Math.max(continuousDt, amount - this.armor * continuousDt)) : Math.max(1, amount - this.armor);
    this.hp -= real;

    /* 受力方向：从伤害来源指向自己 */
    var dx = this.c - fromC;
    var dy = this.r - fromR;
    var len = Math.hypot(dx, dy) || 1;
    this.hitDx = dx / len;
    this.hitDy = dy / len;
    this.hitTime = 0.16;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }

    return real;
  };

  Enemy.prototype.step = function (dt, grid) {
    if (this.slowTime > 0) {
      this.slowTime -= dt;
      if (this.slowTime <= 0) {
        this.slowTime = 0;
        this.slowFactor = 1;
      }
    }

    if (this.hitTime > 0) { this.hitTime -= dt; }
    if (this.summonPulse > 0) { this.summonPulse -= dt; }
    if (this.healPulse > 0) { this.healPulse -= dt; }

    var moveDt = dt;
    var heal = this.type.heal;
    if (heal) {
      if (this.castRemaining > 0) {
        moveDt = Math.max(0, dt - this.castRemaining);
        this.castRemaining = Math.max(0, this.castRemaining - dt);
        if (this.castRemaining <= 1e-9) {
          this.castRemaining = 0;
          this.healReady = true;
          this.healTimer = heal.every;
        }
      } else {
        moveDt = Math.min(dt, this.healTimer);
        this.healTimer = Math.max(0, this.healTimer - dt);
        if (this.healTimer <= 1e-9) {
          this.healTimer = 0;
          this.castRemaining = heal.cast - (dt - moveDt);
        }
      }
    }
    this.dist += this.speed() * moveDt;

    var pos = grid.positionAt(this.path, this.dist);
    this.c = pos.c;
    this.r = pos.r;
    this.dc = pos.dc;
    this.dr = pos.dr;

    var m = this.motion;
    if (m.spin) { this.spin += m.spin * dt; }
    if (m.ringSpin) { this.ringSpin += m.ringSpin * dt; }
    if (m.orbit) { this.orbit += m.orbit * dt; }

    if (pos.done) {
      this.leaked = true;
      this.alive = false;
    }
  };

  /* 召唤者每一步问一次"该召唤了吗"，返回本次要召唤几只（0 = 不召唤）。
     真正生成小怪由 engine 做，因为它要看全局的数量上限。 */
  Enemy.prototype.wantsSummon = function (dt, pathLength) {
    var s = this.type.summon;
    if (!s || !this.alive) { return 0; }
    /* 走完路线八成以后不再召唤：贴着防御点放出来的小怪没有任何塔能拦，
       等于白送漏怪。玩家要做的是"在它走近之前打掉它"，这条规则让它可读。 */
    if (pathLength && this.dist > pathLength * (s.stopAt || 0.8)) { return 0; }
    this.summonTimer -= dt;
    if (this.summonTimer > 0) { return 0; }
    this.summonTimer += s.every;
    var room = s.cap - this.minionsAlive;
    return Math.max(0, Math.min(s.count, room));
  };

  /* 渲染用的视觉偏移与形变。engine 不关心这些，只有 render 读。
     t 是全局时间（秒），用来驱动周期运动。 */
  Enemy.prototype.visual = function (t) {
    var m = this.motion;
    var ph = t + this.phase;

    var ox = 0;
    var oy = 0;
    var lean = 0;
    var squashX = 1;
    var squashY = 1;
    var scale = 1;

    /* 浮动：垂直于行进方向偏移，横向走时上下浮，竖向走时左右浮 */
    if (m.bob) {
      var bob = Math.sin(ph * (m.bobRate || 4)) * m.bob;
      if (this.dr !== 0) { ox += bob; } else { oy += bob; }
    }

    /* 摆尾：疾突的招牌动作，垂直于行进方向左右扭 */
    if (m.sway) {
      var sway = Math.sin(ph * (m.swayRate || 9)) * m.sway;
      if (this.dr !== 0) { ox += sway * 0.34; } else { oy += sway * 0.34; }
      lean = sway * (m.lean || 0.3);
    }

    /* 沉步：重载的节奏感，只在竖直方向压一下 */
    if (m.sink) {
      var s = Math.abs(Math.sin(ph * (m.sinkRate || 2.6)));
      oy += s * m.sink;
      squashY = 1 - s * (m.tilt || 0.04);
      squashX = 1 + s * (m.tilt || 0.04) * 0.6;
    }

    /* 呼吸：分裂者一胀一缩，像随时要裂开 */
    if (m.breathe) {
      scale *= 1 + Math.sin(ph * (m.breatheRate || 3)) * m.breathe;
    }

    /* 抖动：分裂体高频小幅乱颤，两个方向用不同频率才不像在画圆 */
    if (m.jitter) {
      var jr = m.jitterRate || 16;
      ox += Math.sin(ph * jr) * m.jitter;
      oy += Math.cos(ph * jr * 1.37) * m.jitter;
    }

    /* 召唤瞬间：整体先缩后弹，告诉玩家"刚才那两只是它放出来的" */
    if (this.summonPulse > 0) {
      var kp = this.summonPulse / 0.32;   /* 1 → 0 */
      scale *= 1 - Math.sin(kp * Math.PI) * 0.22;
    }

    /* 受击形变：沿受力方向压扁，短促地弹回 */
    if (this.hitTime > 0) {
      var k = this.hitTime / 0.16;          /* 1 → 0 */
      var amt = k * 0.30;
      var ax = Math.abs(this.hitDx);
      var ay = Math.abs(this.hitDy);
      squashX *= 1 - amt * ax + amt * ay * 0.5;
      squashY *= 1 - amt * ay + amt * ax * 0.5;
      ox += this.hitDx * k * 0.07;
      oy += this.hitDy * k * 0.07;
    }

    return {
      ox: ox,
      oy: oy,
      lean: lean,
      squashX: squashX * scale,
      squashY: squashY * scale,
      spin: this.spin,
      ringSpin: this.ringSpin,
      orbit: this.orbit
    };
  };

  /* --------------------------------------------------------------- 波次调度 */

  /* 把一波的 groups 展开成"到点就生成"的时间表，并给每只敌人分配路线。
     没指定路线的组按各条路的 weight 交错分配（"欠账轮转"）：
     哪条路欠得最多就派给哪条，保证每一组在各条路上的比例都稳定。
     初始欠账按波次号轮换，单只出场的首领/精英才会在几条路之间轮流出现。 */
  function buildSchedule(wave, paths) {
    var list = [];
    var n = paths.length;
    var gi, i, p;

    var weightSum = 0;
    for (p = 0; p < n; p++) { weightSum += paths[p].weight; }

    for (gi = 0; gi < wave.groups.length; gi++) {
      var g = wave.groups[gi];
      var key = g[0];
      var count = g[1];
      var gap = g[2];
      var delay = g[3] || 0;
      var fixed = g.length > 4 ? g[4] : null;

      var credit = [];
      for (p = 0; p < n; p++) {
        credit.push(paths[p].weight / weightSum + ((wave.no + gi) % n === p ? 1 : 0));
      }

      for (i = 0; i < count; i++) {
        var route = 0;
        if (fixed !== null && fixed !== undefined) {
          route = Math.min(n - 1, fixed);
        } else if (n > 1) {
          var best = 0;
          for (p = 1; p < n; p++) {
            if (credit[p] > credit[best]) { best = p; }
          }
          route = best;
          credit[best] -= 1;
          for (p = 0; p < n; p++) { credit[p] += paths[p].weight / weightSum; }
        }
        list.push({ at: delay + i * gap, key: key, path: route });
      }
    }

    list.sort(function (a, b) { return a.at - b.at; });
    return list;
  }

  TD.Enemy = Enemy;
  TD.buildSchedule = buildSchedule;
})(window);
