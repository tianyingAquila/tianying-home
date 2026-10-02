/* ==========================================================================
   渲染 · 全部用 canvas 图形指令画，零贴图零 emoji
   --------------------------------------------------------------------------
   视觉纪律（改画面前先读）：
     底是骨白，墨色只画轮廓和文字，灰做层级。
     褐 = 我方塔与可交互；钢蓝 = 敌人；暗金 = 强化态与满级；暗红 = 危险。
     不用发光（shadowBlur 一律不开）——发光是扫雷那套劣质赛博朋克的根源。
     深度靠"偏移的硬阴影"表达，像等距模型的投影，这是档案页的手法。

   敌人靠形状区分族类，不靠颜色：
     圆 = 巡飞  三角 = 疾突  方 = 重载  带环 = 监护者
     三叶 = 分裂者  碎点 = 分裂体  菱 + 卫星 = 召唤者
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;
  var P = cfg.PALETTE;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.cell = 40;
    this.ox = 0;
    this.oy = 0;
    this.w = 0;
    this.h = 0;
    this.cols = 15;
    this.rows = 11;
  }

  /* 换地图时告诉渲染器新的格数（地图 3 是 20×11） */
  Renderer.prototype.setGrid = function (cols, rows) {
    this.cols = cols;
    this.rows = rows;
  };

  /* 按容器尺寸算格子边长与居中偏移。DPR 封顶 2，手机上 3 倍像素纯属浪费带宽和帧率。 */
  Renderer.prototype.resize = function (cssW, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = cssW;
    this.h = cssH;

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";

    /* 边距随画布缩放：大屏 26px 留白好看，手机横屏寸土寸金只留 6px */
    var pad = Math.max(6, Math.min(26, Math.round(Math.min(cssW, cssH) * 0.04)));
    var cw = (cssW - pad * 2) / this.cols;
    var ch = (cssH - pad * 2) / this.rows;
    this.cell = Math.max(14, Math.floor(Math.min(cw, ch)));

    this.ox = Math.round((cssW - this.cell * this.cols) / 2);
    this.oy = Math.round((cssH - this.cell * this.rows) / 2);
  };

  /* 格坐标 → 像素（格心） */
  Renderer.prototype.px = function (c) { return this.ox + (c + 0.5) * this.cell; };
  Renderer.prototype.py = function (r) { return this.oy + (r + 0.5) * this.cell; };

  /* 像素 → 格坐标（取整，用于点击建造） */
  Renderer.prototype.toCell = function (x, y) {
    return {
      c: Math.floor((x - this.ox) / this.cell),
      r: Math.floor((y - this.oy) / this.cell)
    };
  };

  Renderer.prototype.draw = function (eng, view) {
    var ctx = this.ctx;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);

    ctx.fillStyle = P.bone;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawGrid(ctx);
    this.drawPath(ctx, eng);
    this.drawBlocks(ctx, eng);
    this.drawEndpoints(ctx, eng);
    if (view.hover) { this.drawHover(ctx, eng, view); }

    if (view.selected) {
      var sel = view.selected;
      /* 先画升级后的射程（更大更淡的松散虚线），再画当前射程，
         这样"升级能多覆盖多少"一眼可见 */
      var next = sel.nextStats();
      if (next) { this.drawNextRange(ctx, sel.c, sel.r, next.range); }
      this.drawRange(ctx, sel.c, sel.r, sel.stats().range, P.accent);
    }

    this.drawTowers(ctx, eng, view);
    this.drawEnemies(ctx, eng);
    this.drawBullets(ctx, eng);
    this.drawParticles(ctx, eng);
    this.drawFloaters(ctx, eng);

    /* 塔顶操作钮画在最上层，不能被敌人盖住 */
    if (view.selected) { this.drawTowerActions(ctx, eng, view); }

    ctx.restore();
  };

  /* ------------------------------------------------------------- 网格底板 */

  Renderer.prototype.drawGrid = function (ctx) {
    var cell = this.cell;
    var w = cell * this.cols;
    var h = cell * this.rows;
    var i;

    /* 场地底面：比画面底色稍暖一点，划出"这是棋盘"的边界 */
    ctx.fillStyle = P.boneWarm;
    ctx.fillRect(this.ox, this.oy, w, h);

    ctx.strokeStyle = P.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i <= this.cols; i++) {
      var x = Math.round(this.ox + i * cell) + 0.5;
      ctx.moveTo(x, this.oy);
      ctx.lineTo(x, this.oy + h);
    }
    for (i = 0; i <= this.rows; i++) {
      var y = Math.round(this.oy + i * cell) + 0.5;
      ctx.moveTo(this.ox, y);
      ctx.lineTo(this.ox + w, y);
    }
    ctx.stroke();

    /* 四角的裁切标记：仪器感，档案页的手法 */
    var t = 9;
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1.5;
    var corners = [
      [this.ox, this.oy, 1, 1],
      [this.ox + w, this.oy, -1, 1],
      [this.ox, this.oy + h, 1, -1],
      [this.ox + w, this.oy + h, -1, -1]
    ];
    for (i = 0; i < 4; i++) {
      var k = corners[i];
      ctx.beginPath();
      ctx.moveTo(k[0] + k[2] * t, k[1]);
      ctx.lineTo(k[0], k[1]);
      ctx.lineTo(k[0], k[1] + k[3] * t);
      ctx.stroke();
    }
  };

  /* ------------------------------------------------------------- 路径 */

  Renderer.prototype.drawPath = function (ctx, eng) {
    var cell = this.cell;
    var grid = eng.grid;
    var i, p;

    /* 路面：必须明显深于场地。塔防最核心的信息是"怪从哪来、往哪走"，
       实测 0.055 的填充和场地几乎一样，走向要盯着虚线才看得出来。
       多条路共用的格子只铺一次，所以交汇处不会更深。 */
    ctx.fillStyle = "rgba(20, 22, 26, 0.105)";
    for (var key in grid.pathCells) {
      var parts = key.split(",");
      var c = parseInt(parts[0], 10);
      var r = parseInt(parts[1], 10);
      if (!grid.inBounds(c, r)) { continue; }
      ctx.fillRect(this.ox + c * cell, this.oy + r * cell, cell, cell);
    }

    for (p = 0; p < grid.paths.length; p++) {
      var path = grid.paths[p].points;

      /* 中心引导线：虚线，细，说明"怪从这走" */
      ctx.save();
      ctx.strokeStyle = P.faint;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      for (i = 0; i < path.length; i++) {
        var x = this.px(path[i].c);
        var y = this.py(path[i].r);
        if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
      ctx.restore();

      /* 转角的方向标记：小直角箭头，比画整条带箭头的路干净 */
      ctx.strokeStyle = P.faint;
      ctx.lineWidth = 1.4;
      for (i = 1; i < path.length - 1; i++) {
        var pt = path[i];
        if (!grid.inBounds(pt.c, pt.r)) { continue; }
        var nx = this.px(pt.c);
        var ny = this.py(pt.r);
        var ndc = Math.sign(path[i + 1].c - pt.c);
        var ndr = Math.sign(path[i + 1].r - pt.r);
        var s = cell * 0.17;
        ctx.beginPath();
        ctx.moveTo(nx + ndc * s - ndr * s, ny + ndr * s - ndc * s);
        ctx.lineTo(nx + ndc * s * 1.7, ny + ndr * s * 1.7);
        ctx.lineTo(nx + ndc * s + ndr * s, ny + ndr * s + ndc * s);
        ctx.stroke();
      }
    }
  };

  /* 地形块：不可建的实体。斜向细线填充（像工程图的剖面线），
     比画成实心色块更安静，也一眼能认出"这里不是空地"。 */
  Renderer.prototype.drawBlocks = function (ctx, eng) {
    var cell = this.cell;
    var i;

    var list = eng.grid.blockList;
    for (i = 0; i < list.length; i++) {
      var c = list[i][0];
      var r = list[i][1];
      if (!eng.grid.inBounds(c, r)) { continue; }

      var x = this.ox + c * cell;
      var y = this.oy + r * cell;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();

      /* 只画一层极淡的实底 + 四角的小角标，不再用斜线填充。
         斜线铺满 26 格会把整张图切碎，骨白的大面积留白就没了——
         档案页之所以高级正是因为大片安静的底，这里不能反过来最吵。 */
      ctx.fillStyle = "rgba(20, 22, 26, 0.045)";
      ctx.fillRect(x, y, cell, cell);
      ctx.restore();

      /* 四角小角标：说明"这格被占住了"，比满格斜线安静得多 */
      var t = Math.max(3, cell * 0.16);
      ctx.strokeStyle = "rgba(20, 22, 26, 0.26)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2 + t); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 2 + t, y + 2);
      ctx.moveTo(x + cell - 2 - t, y + 2); ctx.lineTo(x + cell - 2, y + 2); ctx.lineTo(x + cell - 2, y + 2 + t);
      ctx.moveTo(x + 2, y + cell - 2 - t); ctx.lineTo(x + 2, y + cell - 2); ctx.lineTo(x + 2 + t, y + cell - 2);
      ctx.moveTo(x + cell - 2 - t, y + cell - 2); ctx.lineTo(x + cell - 2, y + cell - 2); ctx.lineTo(x + cell - 2, y + cell - 2 - t);
      ctx.stroke();
    }
  };

  /* 出怪口与防御点。
     出怪口：钢蓝淡底 + 指向行进方向的小三角 + IN；
     防御点：褐色淡底 + 褐色描边 + 中央实心小方块 + BASE（要守的地方）。
     地图 1 的出入口在棋盘外：出怪口夹回最靠边那一格，防御点画成棋盘边缘的褐色竖条。
     几条路共用一个防御点（地图 3 的中央）时只画一次。 */
  Renderer.prototype.drawEndpoints = function (ctx, eng) {
    var cell = this.cell;
    var grid = eng.grid;
    var drawnBase = Object.create(null);
    var i;

    ctx.font = "600 " + Math.max(8, Math.round(cell * 0.21)) + "px " + mono();
    ctx.textBaseline = "middle";

    for (i = 0; i < grid.paths.length; i++) {
      var p = grid.paths[i];
      var seg0 = p.segs[0];

      /* ---- 出怪口 ---- */
      var sc = clamp(p.start.c, 0, grid.cols - 1);
      var sr = clamp(p.start.r, 0, grid.rows - 1);
      var sx = this.ox + sc * cell;
      var sy = this.oy + sr * cell;
      ctx.fillStyle = "rgba(74, 107, 130, 0.16)";
      ctx.fillRect(sx, sy, cell, cell);

      var tz = cell * 0.16;
      ctx.save();
      ctx.translate(sx + cell / 2, sy + cell / 2);
      ctx.rotate(Math.atan2(seg0.dr, seg0.dc));
      ctx.fillStyle = P.steel;
      ctx.beginPath();
      ctx.moveTo(tz, 0);
      ctx.lineTo(-tz * 0.7, -tz * 0.8);
      ctx.lineTo(-tz * 0.7, tz * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = P.muted;
      ctx.textAlign = "left";
      ctx.fillText("IN", sx + 3, sy + cell * 0.17);

      /* ---- 防御点 ---- */
      var key = p.end.c + "," + p.end.r;
      if (drawnBase[key]) { continue; }
      drawnBase[key] = true;

      if (!grid.inBounds(p.end.c, p.end.r)) {
        var ly = this.py(p.end.r);
        var right = p.end.c >= grid.cols;
        var edgeX = right ? this.ox + grid.cols * cell - 3 : this.ox;
        ctx.fillStyle = P.accent;
        ctx.fillRect(edgeX, ly - cell * 0.5, 3, cell);
        ctx.textAlign = right ? "right" : "left";
        ctx.fillText("BASE", right ? edgeX - 4 : edgeX + 7, ly - cell * 0.38);
        continue;
      }

      var bx = this.ox + p.end.c * cell;
      var by = this.oy + p.end.r * cell;
      ctx.fillStyle = "rgba(180, 121, 74, 0.16)";
      ctx.fillRect(bx, by, cell, cell);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(bx + 1.5, by + 1.5, cell - 3, cell - 3);
      var core = cell * 0.22;
      ctx.fillStyle = P.accent;
      ctx.fillRect(bx + cell / 2 - core / 2, by + cell * 0.56 - core / 2, core, core);
      ctx.textAlign = "center";
      ctx.fillText("BASE", bx + cell / 2, by + cell * 0.2);
    }
  };

  /* ------------------------------------------------------------- 悬停预览 */

  Renderer.prototype.drawHover = function (ctx, eng, view) {
    var h = view.hover;
    var cell = this.cell;
    var x = this.ox + h.c * cell;
    var y = this.oy + h.r * cell;

    if (!eng.grid.inBounds(h.c, h.r)) { return; }

    var ok = view.buildKey && eng.grid.canBuild(h.c, h.r) && eng.canAfford(cfg.TOWERS[view.buildKey].cost);
    var blocked = view.buildKey && !eng.grid.canBuild(h.c, h.r);

    ctx.save();
    if (blocked) {
      ctx.fillStyle = "rgba(156, 74, 63, 0.10)";
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = P.alert;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, cell - 1.5, cell - 1.5);
      /* 一道斜杠表示不可建，比画 × 干净 */
      ctx.beginPath();
      ctx.moveTo(x + cell * 0.28, y + cell * 0.72);
      ctx.lineTo(x + cell * 0.72, y + cell * 0.28);
      ctx.stroke();
    } else if (ok) {
      ctx.fillStyle = "rgba(180, 121, 74, 0.12)";
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, cell - 1.5, cell - 1.5);
      this.drawRange(ctx, h.c, h.r, cfg.TOWERS[view.buildKey].levels[0].range, P.accent);
      this.drawTowerGlyph(ctx, this.px(h.c), this.py(h.r), cfg.TOWERS[view.buildKey].shape, 1, 0.45, -Math.PI / 2, 0);
    } else if (!view.buildKey) {
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, cell - 1.5, cell - 1.5);
    }
    ctx.restore();
  };

  /* 射程圈：极淡实色填充 + 实线边。
     原来用虚线，和网格虚线、路径虚线叠在一起形成三重虚线互相干扰；
     改成"淡填充 + 一条实线"后，射程范围一眼可读且不再和别的虚线打架。 */
  Renderer.prototype.drawRange = function (ctx, c, r, range, color) {
    var x = this.px(c);
    var y = this.py(r);
    var rr = range * this.cell;

    ctx.save();

    /* 填充极淡（0.07 实测仍然太抢，整个圆成了画面主体），这里压到 0.035，
       并且只画圆周上的四段短弧而不是整圈，范围能读但不夺视线。 */
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fillStyle = color === P.accent ? "rgba(180, 121, 74, 0.035)" : "rgba(74, 107, 130, 0.035)";
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    var seg;
    for (seg = 0; seg < 4; seg++) {
      var a0 = seg * Math.PI / 2 - Math.PI / 4;
      ctx.beginPath();
      ctx.arc(x, y, rr, a0 - 0.30, a0 + 0.30);
      ctx.stroke();
    }

    ctx.restore();
  };

  /* 升级后的射程：更大、更淡、更松散的虚线，用"更好"的绿表示增益 */
  Renderer.prototype.drawNextRange = function (ctx, c, r, range) {
    ctx.save();
    ctx.strokeStyle = P.gain;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);          /* 松散：和当前射程的短弧区分开 */
    ctx.beginPath();
    ctx.arc(this.px(c), this.py(r), range * this.cell, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  /* 塔顶两个操作钮：左升级、右拆除。
     放在塔正上方是为了手不离战场——原来做在右侧栏里，
     每次升级都要把视线和鼠标甩到屏幕另一头，玩起来很难受。
     返回命中区给 ui.js 做点击判定，渲染与判定共用同一套几何。 */
  Renderer.prototype.towerActionBoxes = function (tower) {
    var cell = this.cell;
    /* 下限不是美学选择而是硬要求：文字小于 10px 没法读，
       触摸目标小于 30px 点不准。所以小格子下按钮会比格子还宽，这是对的——
       它只在选中塔时出现，挡一下棋盘换来能点能看，值得。 */
    var w = Math.max(31, cell * 0.68);
    var h = Math.max(23, cell * 0.50);
    var gap = Math.max(3, cell * 0.08);
    var cx = this.px(tower.c);
    var cy = this.py(tower.r);

    /* 默认在塔上方；最上面一行的塔会顶出画布，这时翻到下方。
       横向也要夹回画布内，否则最左/最右列的塔有一个钮会被切掉。
       小格子时按钮比格子高，所以让开的距离按"按钮高度"算而不是按格子算，
       否则按钮会压在塔身上。 */
    var clear = cell * 0.46 + 5;      /* 塔基座半高 (cell*0.38) 再留 5px 呼吸 */
    var y = cy - clear - h;           /* y 是按钮上边，所以要整个减掉高度 */
    if (y < 2) { y = cy + clear; }

    var pairW = w * 2 + gap;
    var left = cx - pairW / 2;
    var minX = 2;
    var maxX = this.w - pairW - 2;
    if (left < minX) { left = minX; }
    if (left > maxX) { left = Math.max(minX, maxX); }

    return {
      up: { x: left, y: y, w: w, h: h },
      sell: { x: left + w + gap, y: y, w: w, h: h }
    };
  };

  Renderer.prototype.drawTowerActions = function (ctx, eng, view) {
    var t = view.selected;
    var boxes = this.towerActionBoxes(t);
    var upCost = t.upgradeCost();
    var maxed = upCost === null;
    var canAfford = !maxed && eng.canAfford(upCost);

    /* ---- 升级钮 ---- */
    var b = boxes.up;
    var upColor = maxed ? P.faint : (canAfford ? P.gain : P.muted);
    this.actionBox(ctx, b, upColor, maxed || !canAfford ? 0.45 : 1);

    ctx.save();
    ctx.globalAlpha = maxed || !canAfford ? 0.5 : 1;
    ctx.strokeStyle = upColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    /* 顺时针转 90° 的「《」= 向上的双箭头，一眼读作"升级" */
    var ax = b.x + b.w / 2;
    var ay = b.y + b.h * 0.42;
    var aw = b.w * 0.17;
    var ah = b.h * 0.15;
    ctx.beginPath();
    ctx.moveTo(ax - aw, ay);
    ctx.lineTo(ax, ay - ah);
    ctx.lineTo(ax + aw, ay);
    ctx.moveTo(ax - aw, ay + ah * 1.45);
    ctx.lineTo(ax, ay + ah * 0.45);
    ctx.lineTo(ax + aw, ay + ah * 1.45);
    ctx.stroke();

    ctx.fillStyle = upColor;
    ctx.font = "600 " + Math.max(10, Math.round(this.cell * 0.19)) + "px " + sans();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(maxed ? "满级" : "升级", ax, b.y + b.h - Math.max(3, this.cell * 0.075));
    ctx.restore();

    /* ---- 拆除钮 ---- */
    var s = boxes.sell;
    this.actionBox(ctx, s, P.alert, 1);

    ctx.save();
    ctx.strokeStyle = P.alert;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    var sx = s.x + s.w / 2;
    var sy = s.y + s.h * 0.38;
    var sr = Math.min(s.w, s.h) * 0.17;
    ctx.beginPath();
    ctx.moveTo(sx - sr, sy - sr); ctx.lineTo(sx + sr, sy + sr);
    ctx.moveTo(sx + sr, sy - sr); ctx.lineTo(sx - sr, sy + sr);
    ctx.stroke();

    ctx.fillStyle = P.alert;
    ctx.font = "600 " + Math.max(10, Math.round(this.cell * 0.19)) + "px " + sans();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("拆除", sx, s.y + s.h - Math.max(3, this.cell * 0.075));
    ctx.restore();
  };

  /* 操作钮的底板：白面 + 偏移硬阴影 + 彩色细边，和塔基座同一手法 */
  Renderer.prototype.actionBox = function (ctx, b, color, alpha) {
    ctx.save();
    ctx.fillStyle = "rgba(20, 22, 26, 0.14)";
    ctx.fillRect(b.x + 1.5, b.y + 2, b.w, b.h);
    ctx.fillStyle = P.file;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.restore();
  };

  /* ------------------------------------------------------------- 塔 */

  Renderer.prototype.drawTowers = function (ctx, eng, view) {
    var i;
    for (i = 0; i < eng.towers.length; i++) {
      var t = eng.towers[i];
      var x = this.px(t.c);
      var y = this.py(t.r);

      /* 建造动画：从 0.6 弹到 1，0.26 秒 */
      var age = eng.time - t.placedAt;
      var grow = age < 0.26 ? 0.6 + 0.4 * ease(age / 0.26) : 1;

      var isSel = view.selected === t;
      this.drawTowerBase(ctx, x, y, grow, isSel, t.level);
      this.drawTowerGlyph(ctx, x, y, t.def.shape, grow, 1, t.aim, t.flash);

      /* 满级标记：右上角一个暗金小方块，不加任何光 */
      if (t.level >= t.maxLevel()) {
        var s = this.cell * 0.11;
        ctx.fillStyle = P.gold;
        ctx.fillRect(x + this.cell * 0.26, y - this.cell * 0.34, s, s);
      }
    }
  };

  /* 塔基座：方座 + 偏移硬阴影，像等距模型的投影。
     基座要比符号占的地方大一些，塔才有"坐落在格子里"的实感。 */
  Renderer.prototype.drawTowerBase = function (ctx, x, y, grow, selected, level) {
    var cell = this.cell;
    var s = cell * 0.76 * grow;

    /* 投影：向右下偏移的实色块，不用模糊 */
    ctx.fillStyle = "rgba(20, 22, 26, 0.13)";
    ctx.fillRect(x - s / 2 + 2.5, y - s / 2 + 3, s, s);

    ctx.fillStyle = P.file;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);

    ctx.strokeStyle = selected ? P.accent : P.line;
    ctx.lineWidth = selected ? 1.6 : 1;
    ctx.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);

    /* 等级：底边的刻度格，1~3 格，暗金填充。比数字干净，一眼能数 */
    var i;
    var tickW = s * 0.17;
    var tickH = 2.5;
    var gap = s * 0.055;
    var totalW = tickW * 3 + gap * 2;
    var sx = x - totalW / 2;
    for (i = 0; i < 3; i++) {
      ctx.fillStyle = i < level ? P.gold : P.line;
      ctx.fillRect(sx + i * (tickW + gap), y + s / 2 - tickH - 2, tickW, tickH);
    }
  };

  /* 塔身符号：每种塔一个可辨识的几何形，朝向跟着 aim 转 */
  Renderer.prototype.drawTowerGlyph = function (ctx, x, y, shape, grow, alpha, aim, flash) {
    var cell = this.cell;
    var u = cell * 0.34 * grow;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    /* 每种塔只给一个大色块 + 一根炮管。
       之前每种塔画 4~5 个元素，在 cell=40 时每个只有 3~5px，
       缩小后全部糊成一团灰方块，四种塔分不出来。
       现在改成"一眼能认的剪影"：实心几何体 + 粗炮管，细节一律删掉。 */
    if (shape === "bolt") {
      /* 穿甲钉 · 褐色实心圆 + 一根细长炮管 */
      ctx.rotate(aim);
      ctx.fillStyle = P.accent;
      ctx.fillRect(u * 0.1, -u * 0.17, u * 1.05, u * 0.34);
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.52, 0, Math.PI * 2);
      ctx.fill();
      if (flash > 0) {
        ctx.globalAlpha = alpha * (flash / 0.12);
        ctx.fillStyle = P.ink;
        ctx.fillRect(u * 1.0, -u * 0.14, u * 0.5, u * 0.28);
      }
    } else if (shape === "mortar") {
      /* 散爆臼 · 褐色实心方 + 粗短炮口（方 vs 圆是最强的区分） */
      ctx.fillStyle = P.accent;
      var s = u * 0.94;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.rotate(aim);
      ctx.fillStyle = P.ink;
      ctx.fillRect(u * 0.2, -u * 0.26, u * 0.78, u * 0.52);
      if (flash > 0) {
        ctx.globalAlpha = alpha * (flash / 0.12);
        ctx.fillStyle = P.gold;
        ctx.beginPath();
        ctx.arc(u * 1.1, 0, u * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (shape === "frost") {
      /* 霜滞环 · 钢蓝实心菱形（唯一的冷色塔，一眼能挑出来） */
      ctx.fillStyle = P.steel;
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.72);
      ctx.lineTo(u * 0.72, 0);
      ctx.lineTo(0, u * 0.72);
      ctx.lineTo(-u * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      if (flash > 0) {
        ctx.globalAlpha = alpha * (flash / 0.12) * 0.8;
        ctx.strokeStyle = P.steel;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, u * 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (shape === "rail") {
      /* 长轨炮 · 暗金实心六边形 + 超长炮管（最长的管子 = 最远的射程） */
      ctx.save();
      ctx.fillStyle = P.gold;
      ctx.beginPath();
      var k;
      for (k = 0; k < 6; k++) {
        var ha = (k / 6) * Math.PI * 2 + Math.PI / 6;
        var hx = Math.cos(ha) * u * 0.66;
        var hy = Math.sin(ha) * u * 0.66;
        if (k === 0) { ctx.moveTo(hx, hy); } else { ctx.lineTo(hx, hy); }
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.rotate(aim);
      ctx.fillStyle = P.ink;
      ctx.fillRect(0, -u * 0.13, u * 1.5, u * 0.26);
      if (flash > 0) {
        ctx.globalAlpha = alpha * (flash / 0.12);
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(u * 1.55, 0);
        ctx.lineTo(u * 2.3, 0);
        ctx.stroke();
      }
    } else if (shape === "aura") {
      /* 光环塔 · 褐色空心环 + 墨色实心核：没有炮管，因为它不瞄准，四面一起打 */
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = Math.max(2, u * 0.26);
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.24, 0, Math.PI * 2);
      ctx.fill();
      if (flash > 0) {
        ctx.globalAlpha = alpha * (flash / 0.12);
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, u * 1.05, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (shape === "chain") {
      /* 连锁塔 · 墨色实心三角（尖朝目标）+ 尖端一颗暗金电极 */
      ctx.rotate(aim);
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.moveTo(u * 0.78, 0);
      ctx.lineTo(-u * 0.5, -u * 0.62);
      ctx.lineTo(-u * 0.5, u * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = P.gold;
      ctx.beginPath();
      ctx.arc(u * 0.78, 0, u * 0.2, 0, Math.PI * 2);
      ctx.fill();
      if (flash > 0) {
        ctx.globalAlpha = alpha * (flash / 0.12);
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(u * 0.78, 0, u * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  /* ------------------------------------------------------------- 敌人 */

  Renderer.prototype.drawEnemies = function (ctx, eng) {
    var i;
    for (i = 0; i < eng.enemies.length; i++) {
      var e = eng.enemies[i];
      var v = e.visual(eng.time);
      var x = this.px(e.c + v.ox);
      var y = this.py(e.r + v.oy);
      var rad = e.radius * this.cell;

      /* 投影：跟着本体偏移，给悬浮感 */
      ctx.fillStyle = "rgba(20, 22, 26, 0.10)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + rad * 0.72, rad * 0.78, rad * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(v.squashX, v.squashY);

      var heading = Math.atan2(e.dr, e.dc);
      var hurt = e.hitTime > 0;

      /* 敌人要用实色钢蓝填充。之前填白色描边钢蓝，在骨白底上明度差不到 6%，
         最该被追踪的东西反而成了画面最弱的元素。
         受击瞬间整体转暗红，减速时偏冷淡——都靠填充色表达，不加发光。 */
      var fill = hurt ? P.alert : (e.slowTime > 0 ? "#7d98ab" : P.steel);
      var stroke = hurt ? "#7d3a31" : "#36505f";

      ctx.lineWidth = (e.boss || e.elite) ? 2 : (e.minion ? 1 : 1.4);
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;

      if (e.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        /* 内部一道短横：让它有"正面"，不是纯圆点。实色底上用骨白才看得见 */
        ctx.beginPath();
        ctx.moveTo(-rad * 0.34, 0);
        ctx.lineTo(rad * 0.34, 0);
        ctx.strokeStyle = "rgba(246, 245, 243, 0.75)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
      } else if (e.shape === "triangle") {
        ctx.rotate(heading + v.lean);
        ctx.beginPath();
        ctx.moveTo(rad * 1.05, 0);
        ctx.lineTo(-rad * 0.66, -rad * 0.82);
        ctx.lineTo(-rad * 0.34, 0);
        ctx.lineTo(-rad * 0.66, rad * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.shape === "square") {
        ctx.rotate(v.lean * 0.4);
        var s = rad * 1.5;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        /* 装甲纹：两条内嵌横线，说明"硬"。实色底上用骨白 */
        ctx.strokeStyle = "rgba(246, 245, 243, 0.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.28, -s * 0.16);
        ctx.lineTo(s * 0.28, -s * 0.16);
        ctx.moveTo(-s * 0.28, s * 0.16);
        ctx.lineTo(s * 0.28, s * 0.16);
        ctx.stroke();
      } else if (e.shape === "ringed") {
        /* 监护者：本体自转 + 外环反向自转。反向差是关键，同向会很廉价 */
        ctx.save();
        ctx.rotate(v.spin);
        ctx.beginPath();
        var k;
        for (k = 0; k < 6; k++) {
          var a = (k / 6) * Math.PI * 2;
          var px2 = Math.cos(a) * rad * 0.72;
          var py2 = Math.sin(a) * rad * 0.72;
          if (k === 0) { ctx.moveTo(px2, py2); } else { ctx.lineTo(px2, py2); }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.rotate(v.ringSpin);
        ctx.strokeStyle = hurt ? P.alert : P.ink;
        ctx.lineWidth = 2;
        var seg;
        for (seg = 0; seg < 4; seg++) {
          var a0 = (seg / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(0, 0, rad * 1.12, a0, a0 + Math.PI * 0.36);
          ctx.stroke();
        }
        ctx.restore();
      } else if (e.shape === "trefoil") {
        /* 分裂者：三个小圆抱成一团，一胀一缩地呼吸并缓慢自转——像随时要裂开 */
        ctx.rotate(v.spin);
        var lobe = rad * 0.52;
        var off = rad * 0.48;
        var q;
        ctx.beginPath();
        for (q = 0; q < 3; q++) {
          var la = (q / 3) * Math.PI * 2;
          ctx.moveTo(Math.cos(la) * off + lobe, Math.sin(la) * off);
          ctx.arc(Math.cos(la) * off, Math.sin(la) * off, lobe, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        /* 中心一点骨白：三块的接缝，暗示"会从这里裂开" */
        ctx.fillStyle = "rgba(246, 245, 243, 0.8)";
        ctx.beginPath();
        ctx.arc(0, 0, rad * 0.16, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.shape === "mote") {
        /* 分裂体：一颗小菱形，靠高频抖动显得躁动 */
        ctx.rotate(Math.PI / 4);
        var m2 = rad * 1.25;
        ctx.fillRect(-m2 / 2, -m2 / 2, m2, m2);
        ctx.strokeRect(-m2 / 2, -m2 / 2, m2, m2);
      } else if (e.shape === "summoner") {
        /* 召唤者：自转的菱形本体 + 三颗绕身公转的墨色卫星。
           它免疫减速，所以永远不会变成"被减速的淡蓝"——一眼就能认出它不吃霜塔 */
        ctx.save();
        ctx.rotate(v.spin);
        ctx.beginPath();
        ctx.moveTo(0, -rad * 0.86);
        ctx.lineTo(rad * 0.86, 0);
        ctx.lineTo(0, rad * 0.86);
        ctx.lineTo(-rad * 0.86, 0);
        ctx.closePath();
        ctx.fillStyle = hurt ? P.alert : P.steel;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(246, 245, 243, 0.85)";
        ctx.beginPath();
        ctx.arc(0, 0, rad * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        var sat;
        ctx.fillStyle = hurt ? P.alert : P.ink;
        for (sat = 0; sat < 3; sat++) {
          var oa = v.orbit + (sat / 3) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(oa) * rad * 1.22, Math.sin(oa) * rad * 1.22, Math.max(1.6, rad * 0.15), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      /* 分裂体一碰就碎，满屏血条只会是噪音，所以不画 */
      if (!e.minion) {
        this.drawHealthBar(ctx, x, y - rad - ((e.boss || e.elite) ? 9 : 6), rad * 2, e);
      }
    }
  };

  /* 血条：细线，满血时不画（省得画面到处是条），钢蓝 → 暗红随血量过渡 */
  Renderer.prototype.drawHealthBar = function (ctx, x, y, w, e) {
    var ratio = e.hp / e.maxHp;
    if (ratio >= 1) { return; }

    var bw = Math.max(14, w * 0.95);
    var bh = (e.boss || e.elite) ? 3.5 : 2.5;
    var bx = x - bw / 2;

    ctx.fillStyle = "rgba(20, 22, 26, 0.14)";
    ctx.fillRect(bx, y, bw, bh);

    /* 血量低于 35% 才转暗红——暗红要稀有才有意义 */
    ctx.fillStyle = ratio < 0.35 ? P.alert : P.steel;
    ctx.fillRect(bx, y, bw * ratio, bh);

    if (e.boss || e.elite) {
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 0.5, y - 0.5, bw + 1, bh + 1);
    }
  };

  /* ------------------------------------------------------------- 子弹 */

  Renderer.prototype.drawBullets = function (ctx, eng) {
    var i;
    for (i = 0; i < eng.bullets.length; i++) {
      var b = eng.bullets[i];
      var x = this.px(b.c);
      var y = this.py(b.r);

      if (b.kind === "rail") {
        /* 轨炮弹道：一条深灰褐的射线，0.26 秒内淡出。
           用灰褐而不是纯黑——纯黑在骨白上像把页面划开一刀。
           射线必须画出来：这是玩家判断"这一发贯穿了谁"的唯一依据。 */
        var k = Math.max(0, b.life / (b.maxLife || 0.34));
        var x0 = this.px(b.fromC);
        var y0 = this.py(b.fromR);
        var x1 = this.px(b.beamC);
        var y1 = this.py(b.beamR);

        ctx.save();

        /* 外层：更宽更淡的一层，给射线一点厚度，不用发光 */
        ctx.globalAlpha = k * 0.22;
        ctx.strokeStyle = "#5a5048";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        /* 芯线 */
        ctx.globalAlpha = k * 0.92;
        ctx.strokeStyle = "#4a423b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        /* 贯穿点：每个被打到的目标上画一个小十字，一眼看清穿了几个 */
        if (b.marks) {
          ctx.globalAlpha = k;
          ctx.strokeStyle = P.gold;
          ctx.lineWidth = 1.6;
          var m, mx, my, ms = this.cell * 0.14;
          for (m = 0; m < b.marks.length; m++) {
            mx = this.px(b.marks[m].c);
            my = this.py(b.marks[m].r);
            ctx.beginPath();
            ctx.moveTo(mx - ms, my); ctx.lineTo(mx + ms, my);
            ctx.moveTo(mx, my - ms); ctx.lineTo(mx, my + ms);
            ctx.stroke();
          }
        }

        ctx.restore();
      } else if (b.kind === "aura") {
        /* 光环脉冲：从塔身向外扩到射程边缘的褐色圆环，越扩越淡。
           扩散的那一下就是"这一圈都挨打了"，不需要再给每个敌人加特效 */
        var ka = 1 - Math.max(0, b.life / (b.maxLife || 0.42));
        var ar = this.cell * (0.35 + (b.range - 0.35) * ease(Math.min(1, ka * 1.25)));
        ctx.save();
        ctx.globalAlpha = (1 - ka) * 0.55;
        ctx.fillStyle = "rgba(180, 121, 74, 0.10)";
        ctx.beginPath();
        ctx.arc(this.px(b.fromC), this.py(b.fromR), ar, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = (1 - ka) * 0.9;
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else if (b.kind === "chain") {
        /* 连锁闪电：从塔折到主目标、再折到每个跳跃目标的锯齿线，暗金色。
           锯齿的抖动用固定种子算，不每帧乱跳——闪烁会显得廉价 */
        if (b.marks && b.marks.length) {
          var kc = Math.max(0, b.life / (b.maxLife || 0.34));
          var pts = [{ x: this.px(b.fromC), y: this.py(b.fromR) }];
          var mi;
          for (mi = 0; mi < b.marks.length; mi++) {
            pts.push({ x: this.px(b.marks[mi].c), y: this.py(b.marks[mi].r) });
          }
          ctx.save();
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.strokeStyle = P.gold;
          for (mi = 0; mi < pts.length - 1; mi++) {
            /* 主目标那一段粗，跳跃段细：伤害减半，线也细一半 */
            ctx.globalAlpha = kc * (mi === 0 ? 0.95 : 0.75);
            ctx.lineWidth = mi === 0 ? 2.2 : 1.4;
            this.zigzag(ctx, pts[mi], pts[mi + 1], mi + 1);
          }
          ctx.globalAlpha = kc;
          ctx.fillStyle = P.gold;
          for (mi = 1; mi < pts.length; mi++) {
            ctx.beginPath();
            ctx.arc(pts[mi].x, pts[mi].y, mi === 1 ? 3 : 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      } else if (b.kind === "mortar") {
        /* 臼炮弹：实心小圆 + 短尾 */
        ctx.fillStyle = P.accent;
        ctx.beginPath();
        ctx.arc(x, y, this.cell * 0.085, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === "frost") {
        /* 霜弹：小方块，钢蓝 */
        var s = this.cell * 0.11;
        ctx.fillStyle = P.steel;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      } else {
        /* 钉：细短线，朝着飞行方向 */
        var ang = Math.atan2(y - this.py(b.fromR), x - this.px(b.fromC));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-this.cell * 0.12, 0);
        ctx.lineTo(this.cell * 0.06, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  /* 两点之间画一条锯齿闪电。偏移量由段号决定（固定种子），所以同一道闪电不会闪烁 */
  Renderer.prototype.zigzag = function (ctx, a, b, seed) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var n = Math.max(3, Math.round(len / 9));
    var amp = Math.min(6, len * 0.12);
    var k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (k = 1; k < n; k++) {
      var t = k / n;
      var off = Math.sin(seed * 12.9898 + k * 78.233) * amp * (k % 2 ? 1 : -1);
      ctx.lineTo(a.x + dx * t + nx * off, a.y + dy * t + ny * off);
    }
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  /* ------------------------------------------------------------- 粒子与飘字 */

  Renderer.prototype.drawParticles = function (ctx, eng) {
    var i;
    for (i = 0; i < eng.particles.length; i++) {
      var p = eng.particles[i];
      var a = p.life / p.maxLife;
      var x = this.px(p.c);
      var y = this.py(p.r);

      ctx.save();
      ctx.globalAlpha = Math.max(0, a) * 0.9;
      ctx.fillStyle = p.color;

      if (p.shard) {
        /* 碎片：带自转的小方片，比圆点更像"碎掉" */
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      } else {
        ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
      }

      ctx.restore();
    }
  };

  Renderer.prototype.drawFloaters = function (ctx, eng) {
    var i;
    ctx.font = "600 " + Math.max(9, Math.round(this.cell * 0.26)) + "px " + mono();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (i = 0; i < eng.floaters.length; i++) {
      var f = eng.floaters[i];
      var a = f.life / f.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, this.px(f.c), this.py(f.r));
      ctx.restore();
    }
  };

  TD.Renderer = Renderer;

  /* --------------------------------------------------------------- 工具 */

  function ease(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function mono() {
    return 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';
  }

  function sans() {
    return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  }
})(window);
