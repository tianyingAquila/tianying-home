/* ==========================================================================
   塔 · 索敌与开火
   --------------------------------------------------------------------------
   四种塔各有战术角色（见 config.js）。这里只管三件事：
     选目标（沿路径最靠前的那个，也就是最接近终点的威胁）
     冷却与开火
     子弹生成（子弹本体在 engine 里走，命中结算在 engine）
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  var seq = 0;

  function Tower(typeKey, c, r) {
    var def = cfg.TOWERS[typeKey];

    this.id = ++seq;
    this.key = typeKey;
    this.def = def;
    this.c = c;
    this.r = r;
    this.level = 1;

    this.cooldown = 0;
    this.invested = def.cost;

    /* 炮口朝向，开火时转过去；渲染用 */
    this.aim = -Math.PI / 2;
    this.flash = 0;          /* 开火闪光余量，渲染用 */
    this.placedAt = 0;       /* 落成时间，用于建造动画 */

    this.kills = 0;
    this.damageDealt = 0;
  }

  Tower.prototype.stats = function () {
    return this.def.levels[this.level - 1];
  };

  Tower.prototype.maxLevel = function () {
    return this.def.levels.length;
  };

  /* 下一级的属性，满级返回 null。
     给侧栏的"升级后"对比和画布上的升级射程预览用。 */
  Tower.prototype.nextStats = function () {
    if (this.level >= this.maxLevel()) { return null; }
    return this.def.levels[this.level];
  };

  Tower.prototype.upgradeCost = function () {
    if (this.level >= this.maxLevel()) { return null; }
    return this.def.levels[this.level].cost;
  };

  Tower.prototype.upgrade = function () {
    if (this.level >= this.maxLevel()) { return false; }
    this.invested += this.def.levels[this.level].cost;
    this.level += 1;
    return true;
  };

  Tower.prototype.sellValue = function () {
    return Math.floor(this.invested * cfg.RULES.sellRatio);
  };

  /* 目标选择：射程内沿路径走得最远的那个。
     这是塔防里最经典也最合理的策略——优先打最快漏出去的。 */
  Tower.prototype.pickTarget = function (enemies) {
    var st = this.stats();
    var range = st.range;
    var best = null;
    var bestDist = -1;
    var i;

    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) { continue; }

      var dx = e.c - this.c;
      var dy = e.r - this.r;
      if (dx * dx + dy * dy > range * range) { continue; }

      if (e.dist > bestDist) {
        bestDist = e.dist;
        best = e;
      }
    }

    return best;
  };

  /* 返回要生成的子弹描述，或 null（还在冷却 / 没目标） */
  Tower.prototype.tryFire = function (dt, enemies) {
    if (this.cooldown > 0) { this.cooldown -= dt; }
    if (this.flash > 0) { this.flash -= dt; }
    if (this.cooldown > 0) { return null; }

    var target = this.pickTarget(enemies);
    if (!target) { return null; }

    var st = this.stats();
    this.cooldown = 1 / st.rate;
    this.aim = Math.atan2(target.r - this.r, target.c - this.c);
    this.flash = 0.12;

    return {
      kind: this.def.shape,
      fromC: this.c,
      fromR: this.r,
      target: target,
      damage: st.damage,
      splash: st.splash || 0,
      slow: st.slow || 0,
      slowTime: st.slowTime || 0,
      pierce: !!this.def.pierce,
      owner: this
    };
  };

  TD.Tower = Tower;
})(window);
