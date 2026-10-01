/* ==========================================================================
   网格与路径
   --------------------------------------------------------------------------
   把配置里的航点展开成"占用格集合"和"行走折线"，并回答两个问题：
     1. 这一格能不能建塔（不能压路径、不能重叠、不能出界）
     2. 走了 d 格距离之后，敌人在哪、朝哪
   全部整数格运算，正交移动，没有曲线插值。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  /* 把航点之间的直线段展开成逐格坐标，用于判定"这格是路" */
  function buildPathCells(path) {
    var set = Object.create(null);
    var i, j;

    for (i = 0; i < path.length - 1; i++) {
      var a = path[i];
      var b = path[i + 1];
      var dc = Math.sign(b.c - a.c);
      var dr = Math.sign(b.r - a.r);
      var steps = Math.abs(b.c - a.c) + Math.abs(b.r - a.r);
      var c = a.c;
      var r = a.r;

      for (j = 0; j <= steps; j++) {
        set[c + "," + r] = true;
        c += dc;
        r += dr;
      }
    }

    return set;
  }

  /* 每段的累积长度，供 positionAt 二分定位 */
  function buildSegments(path) {
    var segs = [];
    var total = 0;
    var i;

    for (i = 0; i < path.length - 1; i++) {
      var a = path[i];
      var b = path[i + 1];
      var len = Math.abs(b.c - a.c) + Math.abs(b.r - a.r);
      segs.push({
        from: a,
        to: b,
        len: len,
        start: total,
        dc: Math.sign(b.c - a.c),
        dr: Math.sign(b.r - a.r)
      });
      total += len;
    }

    return { segs: segs, total: total };
  }

  function Grid() {
    this.cols = cfg.GRID.cols;
    this.rows = cfg.GRID.rows;
    this.path = cfg.PATH;
    this.pathCells = buildPathCells(this.path);

    var built = buildSegments(this.path);
    this.segs = built.segs;
    this.pathLength = built.total;

    /* 地形块：不可建也不是路，让"放哪"成为真决策 */
    this.blocks = Object.create(null);
    var i;
    for (i = 0; i < cfg.BLOCKS.length; i++) {
      this.blocks[cfg.BLOCKS[i][0] + "," + cfg.BLOCKS[i][1]] = true;
    }

    /* 塔占位：key "c,r" → tower */
    this.occupied = Object.create(null);
  }

  Grid.prototype.isBlock = function (c, r) {
    return !!this.blocks[c + "," + r];
  };

  Grid.prototype.inBounds = function (c, r) {
    return c >= 0 && c < this.cols && r >= 0 && r < this.rows;
  };

  Grid.prototype.isPath = function (c, r) {
    return !!this.pathCells[c + "," + r];
  };

  Grid.prototype.towerAt = function (c, r) {
    return this.occupied[c + "," + r] || null;
  };

  /* 能建塔的格：在界内、不是路、不是地形块、没被占 */
  Grid.prototype.canBuild = function (c, r) {
    if (!this.inBounds(c, r)) { return false; }
    if (this.isPath(c, r)) { return false; }
    if (this.isBlock(c, r)) { return false; }
    return !this.occupied[c + "," + r];
  };

  Grid.prototype.place = function (c, r, tower) {
    this.occupied[c + "," + r] = tower;
  };

  Grid.prototype.remove = function (c, r) {
    delete this.occupied[c + "," + r];
  };

  /* 走过 d 格之后的位置与朝向。
     d 用浮点（速度 × 时间），但位置始终落在某条正交段上，所以不会出现斜向漂移。 */
  Grid.prototype.positionAt = function (d) {
    var segs = this.segs;
    var i;

    if (d <= 0) {
      var f = segs[0];
      return { c: f.from.c, r: f.from.r, dc: f.dc, dr: f.dr, done: false };
    }

    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (d <= s.start + s.len) {
        var t = d - s.start;
        return {
          c: s.from.c + s.dc * t,
          r: s.from.r + s.dr * t,
          dc: s.dc,
          dr: s.dr,
          done: false
        };
      }
    }

    var last = segs[segs.length - 1];
    return { c: last.to.c, r: last.to.r, dc: last.dc, dr: last.dr, done: true };
  };

  TD.Grid = Grid;
})(window);
