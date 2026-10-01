/* ==========================================================================
   塔 · 索敌与开火
   --------------------------------------------------------------------------
   六种塔各有战术角色（见 config.js）。这里只管三件事：
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
     这是塔防里最经典也最合理的策略——优先打最快漏出去的。
     多条路时"走得最远"按各自路线的剩余距离比较（剩得越少越危险）。
     霜滞环会尽量避开免疫减速的召唤者，打别人才有意义；射程里只剩它时照样打。 */
  Tower.prototype.pickTarget = function (enemies, grid) {
    var st = this.stats();
    var range = st.range;
    var avoidImmune = !!st.slow;
    var best = null;
    var bestLeft = Infinity;
    var fallback = null;
    var fallbackLeft = Infinity;
    var i;

    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) { continue; }

      var dx = e.c - this.c;
      var dy = e.r - this.r;
      if (dx * dx + dy * dy > range * range) { continue; }

      var left = grid ? grid.paths[e.path].length - e.dist : -e.dist;

      if (avoidImmune && e.slowImmune) {
        if (left < fallbackLeft) { fallbackLeft = left; fallback = e; }
        continue;
      }
      if (left < bestLeft) {
        bestLeft = left;
        best = e;
      }
    }

    return best || fallback;
  };

  /* 返回要生成的子弹描述，或 null（还在冷却 / 没目标） */
  Tower.prototype.tryFire = function (dt, enemies, grid) {
    if (this.cooldown > 0) { this.cooldown -= dt; }
    if (this.flash > 0) { this.flash -= dt; }
    if (this.cooldown > 0) { return null; }

    var target = this.pickTarget(enemies, grid);
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
      range: st.range,
      splash: st.splash || 0,
      slow: st.slow || 0,
      slowTime: st.slowTime || 0,
      pierce: !!this.def.pierce,
      aoe: !!this.def.aoe,
      chain: this.def.chain || null,
      instant: !!this.def.instant,
      owner: this
    };
  };

  TD.Tower = Tower;
})(window);
