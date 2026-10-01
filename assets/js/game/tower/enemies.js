/* ==========================================================================
   敌人 · 运动语法与受击表现
   --------------------------------------------------------------------------
   这个文件的重点不是血量，是"活着的感觉"。
   静态形状沿路径平移 = 死流水线，再好的配色也救不回来。
   所以每族敌人有自己固定的运动语法，全部由数学生成，零贴图：

     圆（巡飞）  上下浮动，像悬浮着走
     三角（疾突）左右摆尾，摆频跟着速度，转弯时整体倾斜
     方（重载）  几乎不晃，但有节奏地微沉，走得沉重
     环（监护者）本体缓慢自转 + 外环反向自转（反向差是关键，同向会很廉价）

   受击统一是"朝受力方向压扁再弹回"的形变，不是闪白。
   死亡是碎片沿惯性飞散后淡出，不是原地消失。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  var seq = 0;

  function Enemy(typeKey, waveNo) {
    var type = cfg.ENEMIES[typeKey];
    var scale = cfg.waveScale(waveNo);

    this.id = ++seq;
    this.type = type;
    this.key = typeKey;
    this.shape = type.shape;
    this.boss = !!type.boss;

    this.maxHp = Math.round(type.hp * scale.hp);
    this.hp = this.maxHp;
    this.baseSpeed = type.speed * scale.speed;
    this.armor = type.armor;
    this.bounty = type.bounty;
    this.radius = type.radius;
    this.motion = type.motion || {};

    /* 沿路径走过的格数 */
    this.dist = 0;
    this.c = 0;
    this.r = 0;
    this.dc = 1;
    this.dr = 0;

    this.alive = true;
    this.leaked = false;

    /* 减速：slowUntil 是剩余秒数，slowFactor 取最强的那次 */
    this.slowTime = 0;
    this.slowFactor = 1;

    /* 受击形变：hitTime 递减，hitDx/hitDy 是受力方向 */
    this.hitTime = 0;
    this.hitDx = 0;
    this.hitDy = 0;

    /* 相位错开，让同批敌人不整齐地一起晃——整齐才像流水线 */
    this.phase = Math.random() * Math.PI * 2;
    this.spin = Math.random() * Math.PI * 2;
    this.ringSpin = 0;
  }

  Enemy.prototype.speed = function () {
    return this.baseSpeed * this.slowFactor;
  };

  Enemy.prototype.applySlow = function (factor, time) {
    /* 取更强的减速，并刷新持续时间；不叠乘，避免多个霜塔把怪彻底冻死 */
    if (factor < this.slowFactor || this.slowTime <= 0) {
      this.slowFactor = Math.min(this.slowFactor, factor);
    }
    this.slowTime = Math.max(this.slowTime, time);
  };

  Enemy.prototype.hurt = function (amount, fromC, fromR) {
    var real = Math.max(1, amount - this.armor);
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

    this.dist += this.speed() * dt;

    var pos = grid.positionAt(this.dist);
    this.c = pos.c;
    this.r = pos.r;
    this.dc = pos.dc;
    this.dr = pos.dr;

    var m = this.motion;
    if (m.spin) { this.spin += m.spin * dt; }
    if (m.ringSpin) { this.ringSpin += m.ringSpin * dt; }

    if (pos.done) {
      this.leaked = true;
      this.alive = false;
    }
  };

  /* 渲染用的视觉偏移与形变。engine 不关心这些，只有 render 读。
     t 是全局时间（秒），用来驱动周期运动。 */
  Enemy.prototype.visual = function (t) {
    var m = this.motion;
    var ph = t * 1 + this.phase;

    var ox = 0;
    var oy = 0;
    var lean = 0;
    var squashX = 1;
    var squashY = 1;

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
      squashX: squashX,
      squashY: squashY,
      spin: this.spin,
      ringSpin: this.ringSpin
    };
  };

  /* --------------------------------------------------------------- 波次调度 */

  /* 把一波的 groups 展开成"到点就生成"的时间表 */
  function buildSchedule(wave) {
    var list = [];
    var i, n;

    for (i = 0; i < wave.groups.length; i++) {
      var g = wave.groups[i];
      var key = g[0];
      var count = g[1];
      var gap = g[2];
      var delay = g[3] || 0;

      for (n = 0; n < count; n++) {
        list.push({ at: delay + n * gap, key: key });
      }
    }

    list.sort(function (a, b) { return a.at - b.at; });
    return list;
  }

  TD.Enemy = Enemy;
  TD.buildSchedule = buildSchedule;
})(window);
