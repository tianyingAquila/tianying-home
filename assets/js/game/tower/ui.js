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
    this.detailKey = null;      /* 详情面板的结构指纹，避免每帧重建 DOM */

    this.el = {
      lives: $("tdLives"),
      gold: $("tdGold"),
      wave: $("tdWave"),
      waveTotal: $("tdWaveTotal"),
      status: $("tdStatus"),
      shop: $("tdShop"),
      detail: $("tdDetail"),
      hint: $("tdHint"),
      startBtn: $("tdStart"),
      pauseBtn: $("tdPause"),
      speedBtn: $("tdSpeed"),
      callBtn: $("tdCall"),
      result: $("tdResult"),
      resultTitle: $("tdResultTitle"),
      resultSub: $("tdResultSub"),
      resultStats: $("tdResultStats"),
      restartBtn: $("tdRestart"),
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

    function cellFromEvent(ev) {
      var rect = cv.getBoundingClientRect();
      var pt = ev.touches ? ev.touches[0] : ev;
      return self.rd.toCell(pt.clientX - rect.left, pt.clientY - rect.top);
    }

    cv.addEventListener("mousemove", function (ev) {
      self.view.hover = cellFromEvent(ev);
    });

    cv.addEventListener("mouseleave", function () {
      self.view.hover = null;
    });

    cv.addEventListener("click", function (ev) {
      self.tap(cellFromEvent(ev));
    });

    /* 触摸：先点一下显示预览，再点同格确认——避免手指挡住看不到就建错 */
    cv.addEventListener("touchstart", function (ev) {
      ev.preventDefault();
      var cell = cellFromEvent(ev);
      var h = self.view.hover;
      if (h && h.c === cell.c && h.r === cell.r) {
        self.tap(cell);
        self.view.hover = null;
      } else {
        self.view.hover = cell;
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

    /* 详情面板用事件委托绑一次：面板内容会被重建，所以不能绑在按钮本身上 */
    this.el.detail.addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest("[data-act]") : null;
      if (!btn) { return; }
      var t = self.view.selected;
      if (!t) { return; }

      if (btn.dataset.act === "up") {
        self.eng.upgrade(t);
      } else if (btn.dataset.act === "sell") {
        self.eng.sell(t);
        self.view.selected = null;
      }
      self.sync();
    });

    this.el.restartBtn.addEventListener("click", function () {
      self.eng.reset();
      self.view = { hover: null, buildKey: null, selected: null };
      self.detailKey = null;
      self.el.result.hidden = true;
      self.sync();
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

  TowerGame.prototype.tap = function (cell) {
    var eng = this.eng;

    if (this.view.buildKey) {
      if (eng.build(this.view.buildKey, cell.c, cell.r)) {
        /* 建成后保持选中同类塔，方便连续布防 */
        if (!eng.canAfford(cfg.TOWERS[this.view.buildKey].cost)) { this.view.buildKey = null; }
      }
      this.sync();
      return;
    }

    var t = eng.grid.towerAt(cell.c, cell.r);
    this.view.selected = this.view.selected === t ? null : t;
    this.sync();
  };

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

    this.syncDetail();
    this.syncHint();
  };

  /* 选中塔的详情面板：升级、拆除、战绩。
     注意：sync() 以 8Hz 跑，所以这里绝不能每次都重建 innerHTML 再绑事件——
     那样每秒会多挂 8 组监听器，几十秒后就累积上千个，最终报错崩掉。
     做法：结构只在"选中对象或等级变化"时重建一次，按钮用事件委托（bind 里绑一次），
     每帧只更新会变的数字文本。 */
  TowerGame.prototype.syncDetail = function () {
    var t = this.view.selected;
    var box = this.el.detail;

    if (!t) {
      if (!box.hidden) {
        box.hidden = true;
        box.innerHTML = "";
        this.detailKey = null;
      }
      return;
    }

    var st = t.stats();
    var up = t.upgradeCost();
    var max = t.level >= t.maxLevel();
    var key = t.id + ":" + t.level;

    /* 结构重建（只在换塔或升级后发生一次） */
    if (this.detailKey !== key) {
      this.detailKey = key;
      box.hidden = false;
      box.innerHTML =
        '<div class="td-detail-head">' +
          '<span class="td-detail-name">' + t.def.name + '</span>' +
          '<span class="td-detail-lv">LV ' + t.level + ' / ' + t.maxLevel() + '</span>' +
        '</div>' +
        '<dl class="td-detail-stats">' +
          row("伤害", st.damage) +
          row("射速", st.rate.toFixed(2) + " /s") +
          row("射程", st.range.toFixed(1) + " 格") +
          (st.splash ? row("溅射", st.splash.toFixed(2) + " 格") : "") +
          (st.slow ? row("减速", Math.round(st.slow * 100) + "%") : "") +
          '<div><dt>击杀</dt><dd data-live="kills">' + t.kills + '</dd></div>' +
          '<div><dt>总伤害</dt><dd data-live="dmg">' + Math.round(t.damageDealt) + '</dd></div>' +
        '</dl>' +
        '<div class="td-detail-actions">' +
          (max
            ? '<span class="td-detail-max">已满级</span>'
            : '<button type="button" class="td-btn primary" data-act="up">强化 ' + up + '</button>') +
          '<button type="button" class="td-btn ghost" data-act="sell">拆除 +' + t.sellValue() + '</button>' +
        '</div>';
    }

    /* 每帧只刷会变的部分 */
    var kills = box.querySelector('[data-live="kills"]');
    var dmg = box.querySelector('[data-live="dmg"]');
    if (kills) { kills.textContent = t.kills; }
    if (dmg) { dmg.textContent = Math.round(t.damageDealt); }

    var upBtn = box.querySelector('[data-act="up"]');
    if (upBtn) { upBtn.disabled = !this.eng.canAfford(up); }

    var sellBtn = box.querySelector('[data-act="sell"]');
    if (sellBtn) { sellBtn.textContent = "拆除 +" + t.sellValue(); }

    function row(k, v) {
      return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
    }
  };

  TowerGame.prototype.syncHint = function () {
    var v = this.view;
    var txt;

    if (v.buildKey) {
      txt = "点空地放置 " + cfg.TOWERS[v.buildKey].name + "，Esc 取消";
    } else if (v.selected) {
      txt = "可强化或拆除，点别处取消选中";
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
