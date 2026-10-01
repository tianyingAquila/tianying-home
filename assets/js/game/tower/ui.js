/* ==========================================================================
   UI · 地图选择、HUD、建造面板、属性栏、记录榜、结算屏、输入
   --------------------------------------------------------------------------
   这一层把引擎状态写进 DOM，并把鼠标/触摸翻译成建造与选中。
   渲染循环也在这里：rAF 驱动，页面不可见时停掉（省电省帧）。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  var MAP_KEY = "td.map";
  var NAME_KEY = "td.name";

  function $(id) { return document.getElementById(id); }

  /* 手机横屏紧凑布局：和 tower.css 里的媒体查询保持同一个条件 */
  var COMPACT_MQ = "(orientation: landscape) and (max-height: 560px)";

  function TowerGame() {
    this.eng = new TD.Engine(initialMap());
    this.canvas = $("tdCanvas");
    this.rd = new TD.Renderer(this.canvas);

    this.view = { hover: null, buildKey: null, selected: null };
    this.last = 0;
    this.paused = false;        /* 因页面不可见而暂停 */
    this.statsKey = null;       /* 两侧属性栏的结构指纹，避免每帧重建 DOM */
    this.scores = [];
    this.boardTab = "rank";
    this.saved = false;         /* 本局成绩是否已保存（一局只能存一次） */
    this.pendingMap = null;     /* 等待确认要切去的地图 */
    this.deployEng = null;      /* 排行榜详情里的只读部署 */
    this.deployRd = new TD.Renderer($("tdDeploymentCanvas"));

    this.el = {
      maps: $("tdMaps"),
      lives: $("tdLives"),
      gold: $("tdGold"),
      wave: $("tdWave"),
      waveTotal: $("tdWaveTotal"),
      status: $("tdStatus"),
      shop: $("tdShop"),
      legend: $("tdLegend"),
      statsNow: $("tdStatsNow"),
      statsNext: $("tdStatsNext"),
      hint: $("tdHint"),
      startBtn: $("tdStart"),
      restartTopBtn: $("tdRestartTop"),
      pauseBtn: $("tdPause"),
      speedBtn: $("tdSpeed"),
      callBtn: $("tdCall"),
      result: $("tdResult"),
      resultEyebrow: $("tdResultEyebrow"),
      resultTitle: $("tdResultTitle"),
      resultSub: $("tdResultSub"),
      resultStats: $("tdResultStats"),
      restartBtn: $("tdRestart"),
      resultCloseBtn: $("tdResultClose"),
      saveForm: $("tdSave"),
      saveName: $("tdSaveName"),
      saveBtn: $("tdSaveBtn"),
      saveStatus: $("tdSaveStatus"),
      livesBox: $("tdLivesBox"),
      boardMap: $("tdBoardMap"),
      boardList: $("tdBoardList"),
      boardState: $("tdBoardState"),
      confirm: $("tdConfirm"),
      confirmTitle: $("tdConfirmTitle"),
      confirmYes: $("tdConfirmYes"),
      confirmNo: $("tdConfirmNo"),
      deployment: $("tdDeployment"),
      deploymentTitle: $("tdDeploymentTitle"),
      deploymentMeta: $("tdDeploymentMeta"),
      deploymentBox: $("tdDeploymentBox"),
      deploymentCanvas: $("tdDeploymentCanvas"),
      deploymentState: $("tdDeploymentState"),
      deploymentClose: $("tdDeploymentClose")
    };

    this.buildMaps();
    this.applyMap();
    this.bind();
    this.loadScores();
    this.loop();
  }

  /* 初始地图：URL ?map=2 优先（方便直接发链接），其次上次玩的，默认 1 */
  function initialMap() {
    var q = /[?&]map=(\d)/.exec(location.search);
    var id = q ? parseInt(q[1], 10) : parseInt(storeGet(MAP_KEY) || "1", 10);
    return cfg.MAPS.some(function (m) { return m.id === id; }) ? id : 1;
  }

  function storeGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }

  function storeSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ------------------------------------------------------------------ 地图 */

  TowerGame.prototype.buildMaps = function () {
    var self = this;
    var frag = document.createDocumentFragment();

    cfg.MAPS.forEach(function (m) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "td-map";
      btn.dataset.map = m.id;
      btn.innerHTML =
        '<span class="td-map-no">' + pad2(m.id) + '</span>' +
        '<span class="td-map-body">' +
          '<span class="td-map-name">' + m.name + '<i>' + m.en + '</i></span>' +
          '<span class="td-map-desc">' + m.desc + ' · ' + m.waves.length + ' 波</span>' +
        '</span>';
      btn.addEventListener("click", function () { self.requestMap(m.id); });
      frag.appendChild(btn);
    });

    this.el.maps.appendChild(frag);
  };

  /* 切地图：没开打或已结束就直接切；打到一半先确认，免得误点丢进度 */
  TowerGame.prototype.requestMap = function (id) {
    if (id === this.eng.map.id) { return; }
    var st = this.eng.state;
    if (st === "running" || st === "paused") {
      this.pendingMap = id;
      this.el.confirmTitle.textContent = "切换到「" + cfg.mapById(id).name + "」？";
      this.el.confirm.hidden = false;
      return;
    }
    this.switchMap(id);
  };

  TowerGame.prototype.switchMap = function (id) {
    this.eng.setMap(id);
    storeSet(MAP_KEY, String(id));
    /* 地址栏同步，刷新或分享链接都会停在这张图 */
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", location.pathname + "?map=" + id);
    }
    this.applyMap();
    this.renderBoard();
  };

  /* 把当前地图的尺寸、商店、图例、标题全部换上 */
  TowerGame.prototype.applyMap = function () {
    var map = this.eng.map;
    this.view = { hover: null, buildKey: null, selected: null };
    this.statsKey = undefined;
    this.saved = false;
    this.el.result.hidden = true;
    this.el.confirm.hidden = true;

    this.rd.setGrid(map.cols, map.rows);
    document.body.classList.toggle("is-wide-map", map.cols > 15);

    var items = this.el.maps.querySelectorAll(".td-map");
    var i;
    for (i = 0; i < items.length; i++) {
      var on = parseInt(items[i].dataset.map, 10) === map.id;
      items[i].classList.toggle("is-active", on);
      items[i].setAttribute("aria-pressed", on ? "true" : "false");
    }

    this.el.boardMap.textContent = map.name;
    this.buildShop();
    this.buildLegend();
    this.fit();
    this.sync();
  };

  /* ------------------------------------------------------------------ 商店 */

  TowerGame.prototype.buildShop = function () {
    var self = this;
    var frag = document.createDocumentFragment();
    this.el.shop.innerHTML = "";

    this.eng.towerKeys().forEach(function (key, idx) {
      var def = cfg.TOWERS[key];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "td-shop-item";
      btn.dataset.key = key;
      btn.innerHTML =
        '<span class="td-shop-head">' +
          '<span class="td-shop-name"><kbd>' + (idx + 1) + '</kbd>' + def.name + '</span>' +
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

  /* 图例只列这张图真正会出现的敌人 */
  TowerGame.prototype.buildLegend = function () {
    var list = this.eng.map.enemies;
    var html = "";
    cfg.ENEMY_ORDER.forEach(function (key) {
      if (list.indexOf(key) < 0) { return; }
      var e = cfg.ENEMIES[key];
      html +=
        '<li><span class="td-gl td-gl-' + e.shape + '" aria-hidden="true"></span>' +
        '<span class="td-gl-name">' + e.name + '</span>' +
        '<span class="td-gl-en">' + e.en + '</span>' +
        '<span class="td-gl-note">' + e.note + '</span></li>';
    });
    this.el.legend.innerHTML = html;
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
      self.eng.setSpeed(self.eng.speed === 1 ? 2 : 1);
      self.sync();
    });

    this.el.callBtn.addEventListener("click", function () {
      self.eng.callWaveEarly();
      self.sync();
    });

    function restart() {
      self.eng.reset();
      self.view = { hover: null, buildKey: null, selected: null };
      self.saved = false;
      self.el.result.hidden = true;
      self.sync();
    }

    this.el.restartBtn.addEventListener("click", restart);
    this.el.restartTopBtn.addEventListener("click", restart);

    /* 结算卡的"查看战场"只收起卡片，留在本页，不跳回游戏终端 */
    this.el.resultCloseBtn.addEventListener("click", function () {
      self.el.result.hidden = true;
    });

    this.el.saveForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      self.saveScore();
    });

    this.el.confirmYes.addEventListener("click", function () {
      var id = self.pendingMap;
      self.pendingMap = null;
      self.el.confirm.hidden = true;
      if (id) { self.switchMap(id); }
    });

    this.el.confirmNo.addEventListener("click", function () {
      self.pendingMap = null;
      self.el.confirm.hidden = true;
    });

    this.el.deploymentClose.addEventListener("click", function () {
      self.closeDeployment();
    });

    this.el.deployment.addEventListener("click", function (ev) {
      if (ev.target === self.el.deployment) { self.closeDeployment(); }
    });

    this.el.boardList.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".td-board-detail") : null;
      if (!btn || !btn.dataset.id) { return; }
      self.openDeployment(btn.dataset.id);
    });

    var tabs = document.querySelectorAll(".td-board-tab");
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener("click", function () {
        self.boardTab = tab.dataset.tab;
        Array.prototype.forEach.call(tabs, function (t) {
          var on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        self.renderBoard();
      });
    });

    window.addEventListener("resize", function () {
      self.fit();
      self.fitDeployment();
    });
    window.addEventListener("orientationchange", function () {
      window.setTimeout(function () { self.fit(); }, 120);
    });

    /* 点网页上任意空白处都取消当前操作（建造态 / 选中塔）。
       画布内的点击由 tap() 自己处理；按钮、链接、输入框、商店卡、属性栏、
       记录榜这些可交互或有内容的地方不算"空白"，点它们不应顺带取消。 */
    document.addEventListener("click", function (ev) {
      if (!self.view.buildKey && !self.view.selected) { return; }
      var el = ev.target;
      if (el === cv) { return; }
      if (el.closest && el.closest("button, a, input, .td-shop-item, .td-stats, .td-result, .td-board")) { return; }
      self.view.buildKey = null;
      self.view.selected = null;
      self.sync();
    });

    /* 键盘：1-N 选塔（N = 这张图的塔数），空格暂停，Esc 取消，S 倍速 */
    window.addEventListener("keydown", function (ev) {
      if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) { return; }

      if (ev.key === "Escape" && !self.el.deployment.hidden) {
        self.closeDeployment();
        return;
      }

      var keys = self.eng.towerKeys();
      var n = parseInt(ev.key, 10);
      if (n >= 1 && n <= keys.length) {
        self.view.selected = null;
        self.view.buildKey = keys[n - 1];
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
      /* 点在能建的空地上就建；点别处（空白、路面、地形块、已有塔）一律取消建造态 */
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

  /* 画布尺寸：桌面按宽度定、并按地图比例算高（上限是屏高的 66%）；
     手机横屏时画布被 CSS 夹在一个固定高度的格子里，直接取那个格子的宽高。 */
  TowerGame.prototype.fit = function () {
    var box = this.canvas.parentElement;
    var map = this.eng.map;
    var ratio = map.rows / map.cols;
    var compact = window.matchMedia && window.matchMedia(COMPACT_MQ).matches;
    var w = box.clientWidth;
    var h;

    if (compact) {
      h = Math.max(160, box.clientHeight);
      /* 宽度富余时收窄画布，让棋盘居中、四周留白均匀 */
      w = Math.min(w, Math.round(h / ratio) + 12);
    } else {
      h = Math.min(Math.round(w * ratio), Math.round(window.innerHeight * 0.66));
      h = Math.max(220, h);
    }

    this.rd.resize(w, h);
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
      status = eng.map.name + " · 按「开始防守」布防";
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
      items[i].classList.toggle("is-active", this.view.buildKey === key);
      items[i].classList.toggle("is-poor", !eng.canAfford(cfg.TOWERS[key].cost));
    }

    document.body.classList.toggle("has-selection", !!this.view.selected);

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
    var chain = t.def.chain;
    var frostUpgrade = t.key === "frost" && !!nx;

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
          srow(t.def.aoe ? "范围伤害" : "伤害", st.damage) +
          srow("射程", st.range.toFixed(1)) +
          (st.splash ? srow("溅射", st.splash.toFixed(2)) : "") +
          (st.slow ? srow("减速", Math.round(st.slow * 100) + "%") : "") +
          (chain ? srow("跳跃", chain.jumps + " 次 · " + Math.round(chain.ratio * 100) + "%") : "") +
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
            gainRow(t.def.aoe ? "范围伤害" : "伤害", st.damage, nx.damage, 0) +
            gainRow("射程", st.range, nx.range, 1) +
            (nx.splash ? gainRow("溅射", st.splash, nx.splash, 2) : "") +
            (nx.slow ? gainRow("减速", st.slow * 100, nx.slow * 100, 0, "%") : "") +
            (frostUpgrade
              ? gainRow("射速", st.rate, nx.rate, 2, "/s")
              : srow("射速", nx.rate.toFixed(2) + "/s")) +
          '</dl>' +
          '<p class="td-stats-foot">' +
            (frostUpgrade
              ? '升级提升伤害、射程与射速<br>减速值同步提高'
              : '升级只提升伤害与射程<br>射速恒定不变') +
          '</p>';
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

    /* 升级后的值写成「当前 → 升级后」，升级后的数用绿色。
       初版写成「91+56」，会被读成"现在 91、再升 +56"，以为左侧没刷新。 */
    function gainRow(label, from, to, digits, suffix) {
      var sfx = suffix || "";
      var fromShown = digits ? from.toFixed(digits) : Math.round(from);
      var shown = digits ? to.toFixed(digits) : Math.round(to);
      return '<div><dt>' + label + '</dt>' +
        '<dd><span class="td-from">' + fromShown + sfx + ' →</span>' +
        '<span class="is-gain">' + shown + sfx + '</span></dd></div>';
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
      txt = "数字键 1-" + this.eng.towerKeys().length + " 选塔 · 空格 暂停 · S 倍速";
    }

    this.el.hint.textContent = txt;
  };

  /* ------------------------------------------------------------------ 结算 */

  TowerGame.prototype.showResult = function (won) {
    var eng = this.eng;
    var el = this.el;
    var total = eng.totalWaves();

    el.resultEyebrow.textContent = "DEFENSE REPORT · " + eng.map.en;
    el.resultTitle.textContent = won ? "防线稳固" : "防线失守";
    el.resultSub.textContent = won
      ? "「" + eng.map.name + "」" + total + " 波全部清除，终点未被突破。"
      : "「" + eng.map.name + "」第 " + pad2(eng.reachedWave()) + " / " + total + " 波时生命耗尽。";

    el.result.classList.toggle("is-lost", !won);
    el.resultStats.innerHTML =
      stat("用时", fmtTime(eng.realTime)) +
      stat("剩余生命", eng.lives) +
      stat("清除", eng.stats.kills) +
      stat("漏怪", eng.stats.leaked) +
      stat("建塔", eng.stats.built);

    /* 失败也能保存成绩（排行看的是打到第几波） */
    el.saveForm.hidden = this.saved;
    el.saveBtn.disabled = false;
    el.saveStatus.textContent = this.saved ? "本局成绩已保存。" : "";
    if (!el.saveName.value) { el.saveName.value = storeGet(NAME_KEY) || ""; }

    el.result.hidden = false;

    function stat(k, v) {
      return '<div><span class="td-result-k">' + k + '</span><span class="td-result-v">' + v + '</span></div>';
    }
  };

  /* ------------------------------------------------------------------ 记录榜 */

  TowerGame.prototype.loadScores = function () {
    var self = this;
    this.el.boardState.textContent = "正在读取记录…";
    fetch("api.php?action=td_scores", { credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok) { throw new Error(); }
        self.scores = Array.isArray(res.d.data) ? res.d.data : [];
        self.renderBoard();
      })
      .catch(function () {
        self.el.boardState.textContent = "记录读取失败，稍后再试。";
      });
  };

  /* 最高记录：只看当前地图（三张图难度不同，混排没意义），
     按 打到的波数 → 剩余生命 → 用时 排序。
     最新：所有地图混在一起按时间倒序，每条标上是哪张图。 */
  TowerGame.prototype.renderBoard = function () {
    var mapId = this.eng.map.id;
    var rows;

    if (this.boardTab === "rank") {
      rows = this.scores.filter(function (s) { return s.map === mapId; });
      rows.sort(function (a, b) {
        return (b.wave - a.wave) || (b.lives - a.lives) || (a.timeMs - b.timeMs);
      });
    } else {
      rows = this.scores.slice();
      rows.sort(function (a, b) { return b.createdAt - a.createdAt; });
    }

    rows = rows.slice(0, 20);
    var list = this.el.boardList;
    list.innerHTML = "";

    if (!rows.length) {
      this.el.boardState.textContent = this.boardTab === "rank"
        ? "这张图还没有记录，打一局来占个位。"
        : "还没有任何记录。";
      return;
    }
    this.el.boardState.textContent = "";

    var self = this;
    rows.forEach(function (s, idx) {
      var li = document.createElement("li");
      li.className = "td-board-row" + (self.boardTab === "rank" && idx === 0 ? " is-first" : "");
      var m = cfg.mapById(s.map);
      var outcome = s.won
        ? '<span class="td-board-won">通关</span> 余 ' + s.lives + ' 命'
        : '第 ' + s.wave + ' / ' + s.total + ' 波';
      li.innerHTML =
        '<span class="td-board-rank">' + (self.boardTab === "rank" ? (idx + 1) : "·") + '</span>' +
        '<span class="td-board-player">' +
          '<span class="td-board-name"></span>' +
          (s.hasDeployment === true
            ? '<button class="td-board-detail" type="button">详情</button>'
            : '<span class="td-board-legacy" title="旧成绩未保存终局部署">旧版</span>') +
        '</span>' +
        '<span class="td-board-outcome">' + outcome + '</span>' +
        '<span class="td-board-time">' + fmtTime(s.timeMs / 1000) + '</span>' +
        (self.boardTab === "latest" ? '<span class="td-board-map">' + m.name + '</span>' : '');
      /* 名字是访客输入的，用 textContent 写入，不拼进 HTML */
      li.querySelector(".td-board-name").textContent = s.name || "匿名玩家";
      var detailBtn = li.querySelector(".td-board-detail");
      if (detailBtn) { detailBtn.dataset.id = s.id; }
      li.title = "保存时间：" + new Date(s.createdAt * 1000).toLocaleString("zh-CN", { hour12: false });
      list.appendChild(li);
    });
  };

  TowerGame.prototype.saveScore = function () {
    var self = this;
    var eng = this.eng;
    var el = this.el;
    if (this.saved || (eng.state !== "won" && eng.state !== "lost")) { return; }

    var name = el.saveName.value.trim() || "匿名玩家";
    storeSet(NAME_KEY, name);
    el.saveBtn.disabled = true;
    el.saveStatus.textContent = "正在保存…";

    fetch("api.php?action=td_score", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        name: name,
        map: eng.map.id,
        wave: eng.reachedWave(),
        lives: eng.lives,
        won: eng.state === "won",
        timeMs: Math.round(eng.realTime * 1000),
        deployment: eng.towers.map(function (t) {
          return { type: t.key, c: t.c, r: t.r, level: t.level };
        })
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok) { throw new Error(res.d.error || "保存失败"); }
        self.saved = true;
        self.scores = Array.isArray(res.d.data) ? res.d.data : self.scores;
        self.renderBoard();
        el.saveForm.hidden = true;
        el.saveStatus.textContent = "成绩已保存，本局不能重复保存。";
      })
      .catch(function (err) {
        el.saveStatus.textContent = (err && err.message) || "保存失败，稍后再试。";
        el.saveBtn.disabled = false;
      });
  };

  /* 排行榜详情：从服务器拿到某一局的最终塔位，用只读引擎重绘。 */
  TowerGame.prototype.openDeployment = function (id) {
    var self = this;
    var record = this.scores.find(function (s) { return s.id === id; });
    var el = this.el;
    el.deployment.hidden = false;
    el.deploymentTitle.textContent = (record && record.name ? record.name : "匿名玩家") + "的最终部署";
    el.deploymentMeta.textContent = record
      ? cfg.mapById(record.map).name + " · 第 " + record.wave + " / " + record.total + " 波 · 余 " + record.lives + " 命"
      : "";
    el.deploymentState.textContent = "正在读取部署…";

    fetch("api.php?action=td_deployment&id=" + encodeURIComponent(id), { credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok || !res.d.data || !Array.isArray(res.d.data.deployment)) {
          throw new Error(res.d.error || "读取失败");
        }
        var eng = new TD.Engine(res.d.data.map);
        eng.gold = 999999;
        res.d.data.deployment.forEach(function (item) {
          if (!eng.build(item.type, item.c, item.r)) { throw new Error("部署数据不完整"); }
          var t = eng.grid.towerAt(item.c, item.r);
          while (t && t.level < item.level) {
            if (!eng.upgrade(t)) { throw new Error("部署等级数据不完整"); }
          }
        });
        self.deployEng = eng;
        el.deploymentState.textContent = "共 " + res.d.data.deployment.length + " 座塔";
        self.fitDeployment();
      })
      .catch(function (err) {
        self.deployEng = null;
        el.deploymentState.textContent = (err && err.message) || "部署读取失败，请稍后再试。";
      });
  };

  TowerGame.prototype.closeDeployment = function () {
    this.el.deployment.hidden = true;
    this.deployEng = null;
  };

  TowerGame.prototype.fitDeployment = function () {
    if (this.el.deployment.hidden || !this.deployEng) { return; }
    var map = this.deployEng.map;
    var box = this.el.deploymentBox;
    var availW = Math.max(180, box.clientWidth - 16);
    var availH = Math.max(140, box.clientHeight - 16);
    var ratio = map.rows / map.cols;
    var w = availW;
    var h = Math.round(w * ratio);
    if (h > availH) {
      h = availH;
      w = Math.round(h / ratio);
    }
    this.deployRd.setGrid(map.cols, map.rows);
    this.deployRd.resize(w, h);
    this.deployRd.draw(this.deployEng, { hover: null, buildKey: null, selected: null });
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

  function fmtTime(sec) {
    var s = Math.max(0, Math.round(sec));
    return pad2(Math.floor(s / 60)) + ":" + pad2(s % 60);
  }

  /* 入口 */
  if (document.getElementById("tdCanvas")) {
    root.TD.game = new TowerGame();
  }
})(window);
