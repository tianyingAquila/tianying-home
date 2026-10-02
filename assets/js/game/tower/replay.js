/* ==========================================================================
   塔防动作回放页：只读取某一条成绩的动作日志，按记录版本加载冻结引擎。
   这里重放的是“正常规则下的操作结果”，不参与任何成绩修改。
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    record: null,
    engine: null,
    renderer: null,
    actions: [],
    totalTicks: 0,
    maxTicks: 216000,
    acc: 0,
    lastTs: 0,
    playing: true,
    playbackSpeed: 2
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("版本脚本加载失败")); };
      document.head.appendChild(script);
    });
  }

  function loadVersion(version) {
    if (!/^v\d+\.\d+$/.test(version)) {
      throw new Error("版本号不正确");
    }
    var base = "assets/js/game/tower/versions/" + version + "/";
    var files = ["config.js", "grid.js", "enemies.js", "towers.js", "engine.js", "render.js"];
    return files.reduce(function (chain, file) {
      return chain.then(function () { return loadScript(base + file); });
    }, Promise.resolve());
  }

  function formatTime(seconds) {
    var sec = Math.max(0, Math.round(seconds || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function setLoading(text) {
    var el = $("replayLoading");
    if (!text) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function fail(text) {
    $("replayStatus").textContent = "回放暂不可用";
    $("replayStatus").classList.remove("is-question");
    $("replayState").textContent = "--";
    setLoading(text || "回放暂不可用");
  }

  function fit() {
    if (!state.engine || !state.renderer) { return; }
    var box = $("replayCanvasBox");
    var map = state.engine.map;
    var ratio = map.rows / map.cols;
    var availW = Math.max(180, box.clientWidth - 16);
    var availH = Math.max(160, Math.min(box.clientHeight - 16, window.innerHeight * 0.64));
    var w = availW;
    var h = Math.round(w * ratio);
    if (h > availH) {
      h = availH;
      w = Math.round(h / ratio);
    }
    state.renderer.setGrid(map.cols, map.rows);
    state.renderer.resize(w, h);
  }

  function draw() {
    if (!state.engine || !state.renderer) { return; }
    state.renderer.draw(state.engine, { hover: null, buildKey: null, selected: null });
  }

  function sync() {
    if (!state.engine) { return; }
    var eng = state.engine;
    var ended = eng.state === "won" || eng.state === "lost";
    var progress = state.totalTicks > 0 ? Math.round(eng.stepCount / state.totalTicks * 1000) : 0;
    $("replaySeek").value = String(Math.max(0, Math.min(1000, progress)));
    $("replayLives").textContent = eng.lives;
    $("replayGold").textContent = eng.gold;
    $("replayWave").textContent = ("0" + eng.currentWaveNo()).slice(-2) + " / " + ("0" + eng.totalWaves()).slice(-2);
    if (eng.state === "ready") { $("replayState").textContent = "准备"; }
    else if (eng.state === "running") { $("replayState").textContent = "进行中"; }
    else if (eng.state === "paused") { $("replayState").textContent = "暂停"; }
    else if (eng.state === "won") { $("replayState").textContent = "通关"; }
    else { $("replayState").textContent = "失守"; }

    $("replayTime").textContent = formatTime(eng.stepCount / 60) + " / " + formatTime(state.totalTicks / 60);
    $("replayPlay").textContent = state.playing && !ended ? "暂停" : (ended ? "重播" : "继续");
    $("replaySpeed").textContent = state.playbackSpeed + "×";

    if (state.record && state.record.replayStatus === "question") {
      $("replayStatus").textContent = "疑问回放";
      $("replayStatus").classList.add("is-question");
    } else if (ended) {
      $("replayStatus").textContent = eng.state === "won" ? "回放结束 · 通关" : "回放结束 · 失守";
    } else {
      $("replayStatus").textContent = "回放中";
    }
  }

  function makeEngine() {
    return new window.TD.Engine(state.record.map);
  }

  function seekTo(tick) {
    state.engine = makeEngine();
    state.engine.runToTick(state.actions, tick, state.maxTicks);
    state.acc = 0;
    state.lastTs = 0;
    draw();
    sync();
  }

  function probeEnd() {
    var probe = makeEngine();
    var result = probe.runReplay(state.actions, state.maxTicks);
    state.totalTicks = Math.max(1, result.ticks || 1);
    return result;
  }

  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (!state.engine) { return; }
    var eng = state.engine;

    if (state.playing && eng.state !== "won" && eng.state !== "lost") {
      if (!state.lastTs) { state.lastTs = ts; }
      var elapsed = Math.min((ts - state.lastTs) / 1000, 0.1);
      state.lastTs = ts;
      state.acc += elapsed * 60 * state.playbackSpeed;
      var steps = Math.floor(state.acc);
      state.acc -= steps;
      if (steps > 0) {
        var target = Math.min(state.totalTicks, eng.stepCount + steps);
        eng.runToTick(state.actions, target, state.maxTicks);
      }
    } else {
      state.lastTs = ts;
    }

    draw();
    sync();
  }

  function bind() {
    $("replayPlay").addEventListener("click", function () {
      if (!state.engine) { return; }
      var ended = state.engine.state === "won" || state.engine.state === "lost";
      if (ended) {
        seekTo(0);
        state.playing = true;
      } else {
        state.playing = !state.playing;
      }
      sync();
    });

    $("replayRestart").addEventListener("click", function () {
      seekTo(0);
      state.playing = true;
      sync();
    });

    $("replaySpeed").addEventListener("click", function () {
      var speeds = [1, 2, 4];
      var index = speeds.indexOf(state.playbackSpeed);
      state.playbackSpeed = speeds[(index + 1) % speeds.length];
      sync();
    });

    $("replaySeek").addEventListener("input", function () {
      if (!state.totalTicks) { return; }
      state.playing = false;
      var tick = Math.round(parseInt(this.value, 10) / 1000 * state.totalTicks);
      seekTo(tick);
    });

    window.addEventListener("resize", function () {
      fit();
      draw();
    });
  }

  function start(data) {
    state.record = data;
    state.actions = Array.isArray(data.actions) ? data.actions.slice() : [];
    if (!state.actions.some(function (action) { return action && action.op === "start" && Number(action.tick) === 0; })) {
      state.actions.unshift({ tick: 0, op: "start" });
    }
    $("replayTitle").textContent = (data.name || "匿名玩家") + "的成绩";
    $("replayVersion").textContent = data.version;
    $("replayBack").href = "tower.html?map=" + data.map;
    if (data.replayStatus === "question") {
      $("replayVersion").classList.add("is-question");
      $("replayNote").textContent = "服务器复核结果与提交成绩不一致。这里播放的是提交动作在正常规则下的实际过程。";
    }

    loadVersion(data.version)
      .then(function () {
        data.mapName = window.TD.config.mapById(data.map).name;
        $("replayMeta").textContent = data.mapName + " · 提交用时 " + formatTime(data.timeMs / 1000) + " · 记录版本 " + data.version;
        state.renderer = new window.TD.Renderer($("replayCanvas"));
        state.maxTicks = 216000;
        var result = probeEnd();
        if (result.state !== "won" && result.state !== "lost") {
          throw new Error("回放没有在限制内结束");
        }
        seekTo(0);
        fit();
        draw();
        setLoading("");
        state.playing = true;
        window.requestAnimationFrame(frame);
      })
      .catch(function (error) {
        fail(error && error.message || "回放暂不可用");
      });
  }

  function init() {
    bind();
    var id = new URLSearchParams(window.location.search).get("id") || "";
    if (!/^[a-f0-9]{12}$/.test(id)) {
      fail("记录编号不正确");
      return;
    }
    fetch("api.php?action=td_replay&id=" + encodeURIComponent(id), { credentials: "same-origin" })
      .then(function (response) {
        return response.json().then(function (body) { return { ok: response.ok, body: body }; });
      })
      .then(function (result) {
        if (!result.ok || !result.body.ok || !result.body.data) {
          throw new Error(result.body.error || "记录读取失败");
        }
        start(result.body.data);
      })
      .catch(function (error) {
        fail(error && error.message || "记录读取失败");
      });
  }

  init();
})();
