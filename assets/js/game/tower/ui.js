/* ==========================================================================
   UI · HUD、建造面板、结算屏、输入
   --------------------------------------------------------------------------
   这一层把引擎状态写进 DOM，并把鼠标/触摸翻译成建造与选中。
   渲染循环也在这里：rAF 驱动，页面不可见时停掉（省电省帧）。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  function $(id) { return document.getElementById(id); }

  function TowerGame() {
    this.eng = new TD.Engine();
    this.canvas = $("tdCanvas");
    this.rd = new TD.Renderer(this.canvas);

    this.view = { hover: null, buildKey: null, selected: null };
    this.last = 0;
    this.running = false;
    this.paused = false;        /* 因页面不可见而暂停 */
    this.statsKey = null;       /* 两侧属性栏的结构指纹，避免每帧重建 DOM */

    this.el = {
      lives: $("tdLives"),
      gold: $("tdGold"),
      wave: $("tdWave"),
      waveTotal: $("tdWaveTotal"),
      status: $("tdStatus"),
      shop: $("tdShop"),
      statsNow: $("tdStatsNow"),
      statsNext: $("tdStatsNext"),
      hint: $("tdHint"),
      startBtn: $("tdStart"),
      restartTopBtn: $("tdRestartTop"),
      pauseBtn: $("tdPause"),
      speedBtn: $("tdSpeed"),
      callBtn: $("tdCall"),
      result: $("tdResult"),
      resultTitle: $("tdResultTitle"),
      resultSub: $("tdResultSub"),
      resultStats: $("tdResultStats"),
      restartBtn: $("tdRestart"),
      resultCloseBtn: $("tdResultClose"),
      livesBox: $("tdLivesBox")
    };

    this.buildShop();
    this.bind();
    this.fit();
    this.sync();
    this.loop();
  }

  /* ------------------------------------------------------------------ 商店 */

  TowerGame.prototype.buildShop = function () {
    var self = this;
    var frag = document.createDocumentFragment();

    cfg.TOWER_ORDER.forEach(function (key) {
      var def = cfg.TOWERS[key];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "td-shop-item";
      btn.dataset.key = key;
      btn.innerHTML =
        '<span class="td-shop-head">' +
          '<span class="td-shop-name">' + def.name + '</span>' +
          '<span class="td-shop-cost">' + def.cost + '</span>' +
        '</span>' +
        '<span class="td-shop-en">' + def.en + ' · ' + def.role + '</span>' +
        '<span class="td-shop-desc">' + def.desc + '</span>';

      btn.addEventListener("click", function () {
        self.view.selected = null;
        self.view.buildKey = self.view.buildKey === key ? null : key;
        self.sync();
      });

      frag.appendChild(btn);
    });

    this.el.shop.appendChild(frag);
  };

  /* ------------------------------------------------------------------ 输入 */

  TowerGame.prototype.bind = function () {
    var self = this;
    var cv = this.canvas;

    /* 画布坐标：返回格子 + 画布内像素（像素给塔顶操作钮做命中判定） */
    function pointFromEvent(ev) {
      var rect = cv.getBoundingClientRect();
      var pt = ev.touches && ev.touches.length ? ev.touches[0] : ev;
      var x = pt.clientX - rect.left;
      var y = pt.clientY - rect.top;
      return { x: x, y: y, cell: self.rd.toCell(x, y) };
    }

    cv.addEventListener("mousemove", function (ev) {
      var p = pointFromEvent(ev);
      self.view.hover = p.cell;

      /* 悬在塔顶操作钮上时换成手型，告诉玩家这里能点 */
      var overBtn = false;
      if (self.view.selected) {
        var bx = self.rd.towerActionBoxes(self.view.selected);
        overBtn = inBox(p.x, p.y, bx.up) || inBox(p.x, p.y, bx.sell);
      }
      cv.style.cursor = overBtn ? "pointer" : "crosshair";
    });

    cv.addEventListener("mouseleave", function () {
      self.view.hover = null;
    });

    cv.addEventListener("click", function (ev) {
      var p = pointFromEvent(ev);
      self.tap(p.cell, p.x, p.y);
    });

    /* 触摸：塔顶操作钮要能一下点中（不走"二次确认"），
       否则升级要点两次很别扭。建造仍保留二次确认，避免手指挡住建错。 */
    cv.addEventListener("touchstart", function (ev) {
      ev.preventDefault();
      var p = pointFromEvent(ev);

      if (self.view.selected) {
        var bx = self.rd.towerActionBoxes(self.view.selected);
        if (inBox(p.x, p.y, bx.up) || inBox(p.x, p.y, bx.sell)) {
          self.tap(p.cell, p.x, p.y);
          return;
        }
      }

      var h = self.view.hover;
      if (h && h.c === p.cell.c && h.r === p.cell.r) {
        self.tap(p.cell, p.x, p.y);
        self.view.hover = null;
      } else {
        self.view.hover = p.cell;
      }
    }, { passive: false });

    this.el.startBtn.addEventListener("click", function () {
      self.eng.start();
      self.sync();
    });

    this.el.pauseBtn.addEventListener("click", function () {
      self.eng.togglePause();
      self.sync();
    });

    this.el.speedBtn.addEventListener("click", function () {
      var next = self.eng.speed === 1 ? 2 : 1;
      self.eng.setSpeed(next);
      self.sync();
    });

    this.el.callBtn.addEventListener("click", function () {
      self.eng.callWaveEarly();
      self.sync();
    });

    function restart() {
      self.eng.reset();
      self.view = { hover: null, buildKey: null, selected: null };
      self.el.result.hidden = true;
      self.sync();
    }

    this.el.restartBtn.addEventListener("click", restart);
    this.el.restartTopBtn.addEventListener("click", restart);

    /* 结算卡的"查看战场"只收起卡片，留在本页，不跳回游戏终端 */
    this.el.resultCloseBtn.addEventListener("click", function () {
      self.el.result.hidden = true;
    });

    window.addEventListener("resize", function () { self.fit(); });

    /* 键盘：1-4 选塔，空格暂停，Esc 取消，S 倍速 */
    window.addEventListener("keydown", function (ev) {
      if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) { return; }

      var n = parseInt(ev.key, 10);
      if (n >= 1 && n <= cfg.TOWER_ORDER.length) {
        self.view.selected = null;
        self.view.buildKey = cfg.TOWER_ORDER[n - 1];
        self.sync();
        return;
      }

      if (ev.key === " ") {
        ev.preventDefault();
        if (self.eng.state === "ready") { self.eng.start(); } else { self.eng.togglePause(); }
        self.sync();
      } else if (ev.key === "Escape") {
        self.view.buildKey = null;
        self.view.selected = null;
        self.sync();
      } else if (ev.key === "s" || ev.key === "S") {
        self.eng.setSpeed(self.eng.speed === 1 ? 2 : 1);
        self.sync();
      }
    });

    /* 页面不可见就停渲染；回来时不补算积压时间 */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        self.paused = true;
      } else {
        self.paused = false;
        self.last = 0;
      }
    });
  };

  /* 画布点击。顺序很重要：
     先判塔顶的操作钮（它画在最上层，就该最先响应），
     再判建造，最后判选中/取消。 */
  TowerGame.prototype.tap = function (cell, px, py) {
    var eng = this.eng;

    /* --- 1. 选中塔时，优先处理塔顶的升级/拆除钮 --- */
    if (this.view.selected && px !== undefined) {
      var boxes = this.rd.towerActionBoxes(this.view.selected);
      var t0 = this.view.selected;

      if (inBox(px, py, boxes.up)) {
        if (t0.upgradeCost() !== null) { this.eng.upgrade(t0); }
        this.sync();
        return;
      }
      if (inBox(px, py, boxes.sell)) {
        this.eng.sell(t0);
        this.view.selected = null;
        this.sync();
        return;
      }
    }

    var onTower = eng.grid.towerAt(cell.c, cell.r);

    /* --- 2. 建造态 --- */
    if (this.view.buildKey) {
      /* 点在能建的空地上就建；点别处（空白、路面、地形块、已有塔）一律取消建造态。
         原来只有点回商店按钮才能取消，想放弃时很难受。 */
      if (eng.grid.canBuild(cell.c, cell.r)) {
        if (eng.build(this.view.buildKey, cell.c, cell.r)) {
          if (!eng.canAfford(cfg.TOWERS[this.view.buildKey].cost)) { this.view.buildKey = null; }
        }
      } else {
        this.view.buildKey = null;
      }
      this.sync();
      return;
    }

    /* --- 3. 选中 / 取消选中 --- */
    this.view.selected = (onTower && onTower !== this.view.selected) ? onTower : null;
    this.sync();
  };

  function inBox(x, y, b) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  /* ------------------------------------------------------------------ 布局 */

  TowerGame.prototype.fit = function () {
    var box = this.canvas.parentElement;
    var w = box.clientWidth;
    /* 按网格比例定高，并留出上下呼吸空间 */
    var ratio = cfg.GRID.rows / cfg.GRID.cols;
    var h = Math.min(Math.round(w * ratio), Math.round(window.innerHeight * 0.66));
    this.rd.resize(w, Math.max(240, h));
  };

  /* ------------------------------------------------------------------ 同步 */

  TowerGame.prototype.sync = function () {
    var eng = this.eng;
    var el = this.el;

    el.lives.textContent = eng.lives;
    el.gold.textContent = eng.gold;
    el.wave.textContent = pad2(eng.currentWaveNo());
    el.waveTotal.textContent = pad2(eng.totalWaves());

    /* 生命告急才上暗红——暗红要稀有才有意义 */
    el.livesBox.classList.toggle("is-alert", eng.lives <= 5);

    el.startBtn.hidden = eng.state !== "ready";
    el.restartTopBtn.hidden = eng.state === "ready";
    el.pauseBtn.hidden = eng.state === "ready" || eng.state === "won" || eng.state === "lost";
    el.pauseBtn.textContent = eng.state === "paused" ? "继续" : "暂停";
    el.speedBtn.textContent = eng.speed + "×";
    el.speedBtn.classList.toggle("is-on", eng.speed === 2);

    var canCall = eng.state === "running" && !eng.waveActive && eng.waveIndex < eng.totalWaves();
    el.callBtn.hidden = !canCall;
    if (canCall) {
      el.callBtn.textContent = "提前开始 +" + Math.max(0, Math.round(eng.waveTimer * 5));
    }

    /* 状态行 */
    var status;
    if (eng.state === "ready") {
      status = "按「开始防守」布防";
    } else if (eng.state === "paused") {
      status = "已暂停";
    } else if (eng.state === "won") {
      status = "全部波次已清除";
    } else if (eng.state === "lost") {
      status = "防线失守";
    } else if (eng.waveActive) {
      status = "WAVE " + pad2(eng.waveIndex) + " 进行中 · 剩余 " + eng.enemies.length;
    } else {
      status = "下一波 " + eng.waveTimer.toFixed(1) + "s";
    }
    el.status.textContent = status;
    el.status.classList.toggle("is-alert", eng.state === "lost" || eng.lives <= 5);

    /* 商店按钮的可买状态 */
    var items = el.shop.querySelectorAll(".td-shop-item");
    var i;
    for (i = 0; i < items.length; i++) {
      var key = items[i].dataset.key;
      var afford = eng.canAfford(cfg.TOWERS[key].cost);
      items[i].classList.toggle("is-active", this.view.buildKey === key);
      items[i].classList.toggle("is-poor", !afford);
    }

    this.syncStats();
    this.syncHint();
  };

  /* 地图两侧的属性栏：左=当前属性，右=升级后属性（增益用绿色）。
     升级与拆除的按钮不在这里——它们画在画布上塔的正上方，手不离战场。

     注意：sync() 以 8Hz 跑，所以这里只在"换塔或升级"时重建一次 DOM
     （用 statsKey 做指纹），每帧只刷战绩数字。
     初版每次都重建 innerHTML 并重新 addEventListener，几十秒累积上千个
     监听器后崩掉，别再走回那条路。 */
  TowerGame.prototype.syncStats = function () {
    var t = this.view.selected;
    var now = this.el.statsNow;
    var next = this.el.statsNext;

    if (!t) {
      if (this.statsKey !== null) {
        now.innerHTML = "";
        next.innerHTML = "";
        now.classList.remove("is-on");
        next.classList.remove("is-on");
        this.statsKey = null;
      }
      return;
    }

    var key = t.id + ":" + t.level;
    var st = t.stats();
    var nx = t.nextStats();

    if (this.statsKey !== key) {
      this.statsKey = key;
      now.classList.add("is-on");
      next.classList.add("is-on");

      /* ---- 左：当前 ---- */
      now.innerHTML =
        '<p class="td-stats-eyebrow">CURRENT</p>' +
        '<p class="td-stats-name">' + t.def.name + '</p>' +
        '<p class="td-stats-lv">LV ' + t.level + ' / ' + t.maxLevel() + '</p>' +
        '<dl class="td-stats-list">' +
          srow("伤害", st.damage) +
          srow("射程", st.range.toFixed(1)) +
          (st.splash ? srow("溅射", st.splash.toFixed(2)) : "") +
          (st.slow ? srow("减速", Math.round(st.slow * 100) + "%") : "") +
          srow("射速", st.rate.toFixed(2) + "/s") +
        '</dl>' +
        '<dl class="td-stats-list td-stats-record">' +
          '<div><dt>击杀</dt><dd data-live="kills">' + t.kills + '</dd></div>' +
          '<div><dt>总伤害</dt><dd data-live="dmg">' + Math.round(t.damageDealt) + '</dd></div>' +
        '</dl>';

      /* ---- 右：升级后 ---- */
      if (nx) {
        next.innerHTML =
          '<p class="td-stats-eyebrow is-gain">AFTER UPGRADE</p>' +
          '<p class="td-stats-name">LV ' + (t.level + 1) + '</p>' +
          '<p class="td-stats-lv">费用 ' + t.upgradeCost() + '</p>' +
          '<dl class="td-stats-list">' +
            gainRow("伤害", st.damage, nx.damage, 0) +
            gainRow("射程", st.range, nx.range, 1) +
            (nx.splash ? gainRow("溅射", st.splash, nx.splash, 2) : "") +
            (nx.slow ? gainRow("减速", st.slow * 100, nx.slow * 100, 0, "%") : "") +
            srow("射速", nx.rate.toFixed(2) + "/s") +
          '</dl>' +
          '<p class="td-stats-foot">升级只提升伤害与射程<br>射速恒定不变</p>';
      } else {
        next.innerHTML =
          '<p class="td-stats-eyebrow">MAX LEVEL</p>' +
          '<p class="td-stats-name td-stats-maxed">已满级</p>' +
          '<p class="td-stats-foot">这座塔已达到最高等级</p>';
      }
    }

    /* 每帧只刷战绩 */
    var k = now.querySelector('[data-live="kills"]');
    var d = now.querySelector('[data-live="dmg"]');
    if (k) { k.textContent = t.kills; }
    if (d) { d.textContent = Math.round(t.damageDealt); }

    function srow(label, val) {
      return '<div><dt>' + label + '</dt><dd>' + val + '</dd></div>';
    }

    /* 升级后的值用绿色，并把增量写在后面 */
    function gainRow(label, from, to, digits, suffix) {
      var sfx = suffix || "";
      var delta = to - from;
      var shown = digits ? to.toFixed(digits) : Math.round(to);
      var dShown = digits ? delta.toFixed(digits) : Math.round(delta);
      return '<div><dt>' + label + '</dt>' +
        '<dd class="is-gain">' + shown + sfx +
        (delta > 0 ? '<span class="td-delta">+' + dShown + '</span>' : '') +
        '</dd></div>';
    }
  };

  TowerGame.prototype.syncHint = function () {
    var v = this.view;
    var txt;

    if (v.buildKey) {
      txt = "点空地放置 " + cfg.TOWERS[v.buildKey].name + "，点其它任意位置取消";
    } else if (v.selected) {
      txt = "塔顶两个小框：左升级、右拆除；两侧显示当前与升级后属性";
    } else {
      txt = "数字键 1-4 选塔 · 空格 暂停 · S 倍速";
    }

    this.el.hint.textContent = txt;
  };

  /* ------------------------------------------------------------------ 结算 */

  TowerGame.prototype.showResult = function (won) {
    var eng = this.eng;
    var el = this.el;

    el.resultTitle.textContent = won ? "防线稳固" : "防线失守";
    el.resultSub.textContent = won
      ? "十五波全部清除，终点未被突破。"
      : "第 " + pad2(eng.currentWaveNo()) + " 波时生命耗尽。";

    el.result.classList.toggle("is-lost", !won);
    el.resultStats.innerHTML =
      stat("清除", eng.stats.kills) +
      stat("漏怪", eng.stats.leaked) +
      stat("建塔", eng.stats.built) +
      stat("剩余生命", eng.lives) +
      stat("累计金币", eng.stats.goldEarned);

    el.result.hidden = false;

    function stat(k, v) {
      return '<div><span class="td-result-k">' + k + '</span><span class="td-result-v">' + v + '</span></div>';
    }
  };

  /* ------------------------------------------------------------------ 循环 */

  TowerGame.prototype.loop = function () {
    var self = this;

    function frame(ts) {
      window.requestAnimationFrame(frame);

      if (self.paused) { return; }

      var real = self.last ? (ts - self.last) / 1000 : 0;
      self.last = ts;

      self.eng.advance(real);

      var evts = self.eng.drain();
      if (evts.length) { self.handleEvents(evts); }

      self.rd.draw(self.eng, self.view);
    }

    window.requestAnimationFrame(frame);

    /* HUD 不需要每帧刷：固定 8Hz，省掉大量 DOM 写入 */
    window.setInterval(function () {
      if (!self.paused) { self.sync(); }
    }, 125);
  };

  TowerGame.prototype.handleEvents = function (evts) {
    var i;
    for (i = 0; i < evts.length; i++) {
      var e = evts[i];
      if (e.type === "won") { this.showResult(true); }
      else if (e.type === "lost") { this.showResult(false); }
    }
    this.sync();
  };

  /* --------------------------------------------------------------- 工具 */

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  /* 入口 */
  if (document.getElementById("tdCanvas")) {
    root.TD.game = new TowerGame();
  }
})(window);
