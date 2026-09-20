/* ==========================================================================
   天鹰档案终端 · 交互脚本
   设计语言与交互参考 LBEILC/RhineLabUI（MIT License）
   Copyright (c) 2026 LBEILC
   动画全部由 CSS 负责，本文件只做数据渲染与 class 切换。
   ========================================================================== */
(function () {
  "use strict";

  const MOVE_MS = 320;     // 一次滑动动画的时长（略大于 CSS 过渡，兼顾连按手感）
  const BG_COLS = 15;      // 同一列里左右各铺多少片装饰档案（原版纵深 32 个位置）
  const BG_ROWS = 6;       // 往深处铺多少列（原版 5 个分类 + 两侧补位）
  const CURRENT_ROW = 1;   // 当前这一列在第几排（前面留两排，画面才有纵深）
  const SAVED_KEY = "tianying.archive.saved.v1";

  const el = {};
  let stage = null;            // PC 端的 WebGL 档案墙（手机端为 null，走 CSS 列表）
  const state = {
    columns: [],
    col: 0,
    row: 0,
    fg: [],
    busy: false,
  };

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    [
      "arcGrid", "arcCanvas", "infoCat", "infoNum", "infoTitle", "infoEn", "selIndex", "selTotal",
      "tickBars", "prevFile", "nextFile", "prevCol", "nextCol", "colIndex", "colName",
      "accessBtn", "hudClock", "indexBtn", "indexClose", "arcIndex", "indexList",
      "detailBack", "docFile", "docArea", "docTitle", "docSub", "docChip", "docType",
      "docStatus", "docAbstract", "docCommitsBlock", "docCommits", "docRepo",
      "caseTop", "caseSub", "caseNo", "capNo", "detailCase", "detailDoc",
    ].forEach((id) => { el[id] = document.getElementById(id); });

    bindEvents();
    startClock();
    loadData();
  }

  /* ---------------------------------------------------------------- 数据 */

  function loadData() {
    fetch("assets/data/archives.json?v=1", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status))))
      .then((data) => {
        const columns = Array.isArray(data.columns) ? data.columns.filter((c) => c && Array.isArray(c.entries) && c.entries.length) : [];
        if (!columns.length) {
          throw new Error("档案数据为空");
        }
        state.columns = columns;
        if (isSmallScreen()) {
          buildBackground();
          buildForeground();
        }
        renderAll();
        document.body.classList.add("is-ready");
        if (!isSmallScreen()) {
          setup3D();
        }
      })
      .catch((error) => {
        console.error("[档案终端] 数据加载失败：", error);
        el.infoCat.textContent = "INTERNAL DATABASE ／ 数据不可用";
        el.infoNum.textContent = "ARCHIVE OFFLINE";
        el.infoTitle.textContent = "档案数据读取失败";
        el.infoEn.textContent = "RELOAD TO RETRY";
        el.accessBtn.disabled = true;
        el.accessBtn.style.opacity = "0.4";
        document.body.classList.add("is-ready");
      });
  }

  function currentColumn() {
    return state.columns[state.col] || { name: "", entries: [] };
  }

  function currentEntry() {
    const col = currentColumn();
    return col.entries[Math.min(state.row, col.entries.length - 1)] || null;
  }

  /* ------------------------------------------------------------ 阵列渲染 */

  function makeFile(extraClass) {
    const node = document.createElement("div");
    node.className = "arc-file" + (extraClass ? " " + extraClass : "");
    const box = document.createElement("div");
    box.className = "arc-box";
    const tag = document.createElement("span");
    tag.className = "arc-tag";
    const name = document.createElement("span");
    name.className = "arc-name";
    const dot = document.createElement("span");
    dot.className = "arc-dot";
    box.appendChild(tag);
    box.appendChild(name);
    box.appendChild(dot);
    node.appendChild(box);
    return node;
  }

  // PC 端：动态加载 WebGL 渲染层。加载失败就退回 CSS 阵列，不影响浏览。
  function setup3D() {
    if (!el.arcCanvas) {
      buildBackground();
      buildForeground();
      return;
    }
    // 注意：改 archive3d.js 之后要顺手把这里的版本号 +1，否则浏览器会用缓存
    import("./archive3d.js?v=22")
      .then((mod) => {
        // 先让 canvas 参与布局，否则量到的尺寸是 0
        document.body.classList.add("is-3d");
        stage = mod.createStage(el.arcCanvas, state.columns, {
          // 点中阵列里的哪一册，就把那一册滑到选中位再抬起来
          onPick(hit) {
            if (hit.colIndex === state.col && hit.entryIndex === state.row) { return; }
            state.col = hit.colIndex;
            state.row = hit.entryIndex;
            stage.selectCell(state.col, state.row, hit.dLane, hit.dRow);
            renderHud();
            renderTicks();
          },
        });
        stage.setLift(0.9);
        stage.resize();
      })
      .catch((error) => {
        console.error("[档案终端] 3D 初始化失败，退回平面阵列：", error);
        document.body.classList.remove("is-3d");
        buildBackground();
        buildForeground();
        renderArray();
      });
  }

  function isSmallScreen() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 620px)").matches;
  }

  // 背景：一排排竖立的档案册堆成档案墙
  // gx = 同一排里的位置，gy = 第几排（0 = 最前面那一排，也就是当前列所在的排）
  function buildBackground() {
    if (isSmallScreen()) {
      return;
    }
    const frag = document.createDocumentFragment();
    for (let gy = 0; gy <= BG_ROWS; gy += 1) {
      for (let gx = -BG_COLS; gx <= BG_COLS; gx += 1) {
        const node = makeFile("is-decor");
        node.style.setProperty("--gx", gx);
        node.style.setProperty("--gy", gy);
        node.style.setProperty("--dim", String(Math.max(0.22, 1 - gy * 0.155)));
        if (gy >= 1) { node.style.setProperty("--blur", gy * 0.5 + "px"); }
        frag.appendChild(node);
      }
    }
    el.arcGrid.appendChild(frag);
  }

  // 前景：当前列的可交互档案
  function buildForeground() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 7; i += 1) {
      const node = makeFile("is-fg");
      node.style.setProperty("--gx", 0);
      node.addEventListener("click", () => selectRow(i));
      frag.appendChild(node);
      state.fg.push(node);
    }
    el.arcGrid.appendChild(frag);
  }

  function renderAll() {
    renderArray();
    renderHud();
    renderTicks();
  }

  function renderArray() {
    const col = currentColumn();
    state.fg.forEach((node, i) => {
      const entry = col.entries[i];
      if (!entry) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      const gx = i - state.row;            // 沿当前这一排左右移动
      node.style.setProperty("--gx", gx);
      node.style.setProperty("--gy", CURRENT_ROW);   // 始终待在同一排
      node.classList.toggle("is-active", i === state.row);
      const depth = Math.abs(gx);
      node.style.setProperty("--dim", String(Math.max(0.45, 1 - depth * 0.1)));
      node.style.setProperty("--blur", depth >= 4 ? (depth - 3) * 0.5 + "px" : "0px");
      node.querySelector(".arc-tag").textContent = entry.id;
      node.querySelector(".arc-name").textContent = entry.title;   // 桌面端被 CSS 隐藏，手机端列表要用
    });
  }

  function renderHud() {
    const col = currentColumn();
    const entry = currentEntry();
    if (!entry) { return; }
    el.infoCat.textContent = "INTERNAL DATABASE ／ " + (col.name || "");
    el.infoNum.textContent = "FILE NUMBER: " + entry.id;
    el.infoTitle.textContent = entry.title;
    el.infoEn.textContent = entry.en || entry.type;
    el.selIndex.textContent = String(state.row + 1).padStart(2, "0");
    el.selTotal.textContent = String(col.entries.length).padStart(2, "0");
    el.colIndex.textContent = String(state.col + 1).padStart(2, "0");
    el.colName.textContent = col.name || "";
  }

  function renderTicks() {
    const total = currentColumn().entries.length;
    if (el.tickBars.childElementCount !== total) {
      el.tickBars.textContent = "";
      for (let i = 0; i < total; i += 1) {
        const bar = document.createElement("button");
        bar.type = "button";
        bar.className = "bar";
        bar.setAttribute("aria-label", "跳转到第 " + (i + 1) + " 份档案");
        bar.addEventListener("click", () => selectRow(i));
        el.tickBars.appendChild(bar);
      }
    }
    Array.prototype.forEach.call(el.tickBars.children, (bar, i) => {
      bar.classList.toggle("is-active", i === state.row);
      bar.classList.toggle("is-done", i < state.row);
    });
  }

  /* -------------------------------------------------------------- 交互 */

  function bindEvents() {
    el.prevFile.addEventListener("click", () => moveRow(-1));
    el.nextFile.addEventListener("click", () => moveRow(1));
    el.prevCol.addEventListener("click", () => moveCol(-1));
    el.nextCol.addEventListener("click", () => moveCol(1));
    el.accessBtn.addEventListener("click", openDetail);
    el.detailBack.addEventListener("click", closeDetail);
    el.indexBtn.addEventListener("click", openIndex);
    el.indexClose.addEventListener("click", closeIndex);
    el.arcIndex.addEventListener("click", (event) => {
      if (event.target === el.arcIndex) { closeIndex(); }
    });
    document.addEventListener("keydown", onKeydown);
    el.detailCase.addEventListener("click", openDetail);
    bindSwipe();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      if (document.body.classList.contains("is-index-open")) { closeIndex(); return; }
      if (document.body.dataset.view === "detail") { closeDetail(); }
      return;
    }
    if (document.body.dataset.view === "detail" || document.body.classList.contains("is-index-open")) {
      return;
    }
    if (event.key === "ArrowLeft") { moveCol(-1); event.preventDefault(); }
    else if (event.key === "ArrowRight") { moveCol(1); event.preventDefault(); }
    else if (event.key === "ArrowUp") { moveRow(-1); event.preventDefault(); }
    else if (event.key === "ArrowDown") { moveRow(1); event.preventDefault(); }
    else if (event.key === "Enter") { openDetail(); event.preventDefault(); }
  }

  function lockMove() {
    if (state.busy) { return false; }
    state.busy = true;
    window.setTimeout(() => { state.busy = false; }, MOVE_MS);
    return true;
  }

  function moveRow(delta) {
    const total = currentColumn().entries.length;
    const next = state.row + delta;
    if (next < 0 || next >= total) { return; }
    if (!lockMove()) { return; }
    state.row = next;
    if (stage) {
      stage.goRow(delta);
    } else {
      renderArray();
    }
    renderHud();
    renderTicks();
  }

  function selectRow(index) {
    const total = currentColumn().entries.length;
    if (index === state.row || index < 0 || index >= total) { return; }
    if (!lockMove()) { return; }
    const delta = index - state.row;
    state.row = index;
    if (stage) {
      stage.goRow(delta);
    } else {
      renderArray();
    }
    renderHud();
    renderTicks();
  }

  function moveCol(delta) {
    const total = state.columns.length;
    if (!total) { return; }
    if (!lockMove()) { return; }
    state.col = (state.col + delta + total) % total;
    const entries = currentColumn().entries.length;
    state.row = Math.min(state.row, Math.max(0, entries - 1));

    // 整片档案墙向前滑一排，同时当前排淡出；滑完瞬移归位并换上新的列
    if (stage) {
      stage.goColumn(delta);
      renderHud();
      renderTicks();
      return;
    }
    el.arcGrid.style.setProperty("--shift-y", String(-delta));
    document.body.classList.add("is-col-switching");
    renderHud();
    window.setTimeout(() => {
      el.arcGrid.classList.add("no-anim");
      el.arcGrid.style.setProperty("--shift-y", "0");
      renderArray();
      renderTicks();
      document.body.classList.remove("is-col-switching");
      window.requestAnimationFrame(() => el.arcGrid.classList.remove("no-anim"));
    }, 430);
  }

  function bindSwipe() {
    let sx = 0, sy = 0, active = false;
    el.arcGrid.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) { return; }
      active = true;
      sx = event.touches[0].clientX;
      sy = event.touches[0].clientY;
    }, { passive: true });
    el.arcGrid.addEventListener("touchend", (event) => {
      if (!active) { return; }
      active = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - sx;
      const dy = touch.clientY - sy;
      if (Math.abs(dx) < 44 && Math.abs(dy) < 44) { return; }
      if (Math.abs(dx) > Math.abs(dy)) {
        moveCol(dx < 0 ? 1 : -1);
      } else {
        moveRow(dy < 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------ 详情视图 */

  function openDetail() {
    const entry = currentEntry();
    if (entry) { fillDetail(entry); }
    document.body.classList.add("is-decrypting");
    document.body.dataset.view = "detail";
    window.setTimeout(() => document.body.classList.remove("is-decrypting"), 1900);
  }

  function closeDetail() {
    document.body.classList.remove("is-decrypting");
    document.body.dataset.view = "array";
  }

  function fillDetail(entry) {
    el.docFile.textContent = "FILE " + entry.id;
    el.docArea.textContent = entry.repo ? "SOURCE ONLINE" : "REFERENCE AREA";
    el.docTitle.textContent = entry.title;
    el.docSub.textContent = entry.en || "";
    el.docChip.textContent = entry.type || "";
    el.docType.textContent = entry.type || "—";
    el.docStatus.textContent = entry.status || "—";
    el.docAbstract.textContent = entry.abstract || "";
    el.caseNo.textContent = entry.id;
    el.caseSub.textContent = "NO." + entry.id.replace(/^[A-Z]+-/, "");
    el.caseTop.textContent = entry.en ? entry.en.slice(0, 26) : "TIANYING ARCHIVE";
    el.capNo.textContent = entry.id;

    const commits = Array.isArray(entry.commits) ? entry.commits : [];
    el.docCommitsBlock.hidden = commits.length === 0;
    el.docCommits.textContent = "";
    commits.forEach((item) => {
      const li = document.createElement("li");
      const d = document.createElement("span");
      d.className = "d";
      d.textContent = item.date || "";
      const m = document.createElement("span");
      m.className = "m";
      m.textContent = item.message || "";
      li.appendChild(d);
      li.appendChild(m);
      el.docCommits.appendChild(li);
    });

    if (entry.repo) {
      el.docRepo.hidden = false;
      el.docRepo.href = entry.repo;
    } else {
      el.docRepo.hidden = true;
      el.docRepo.removeAttribute("href");
    }
  }

  /* ---------------------------------------------------------------- 时钟 */

  function startClock() {
    if (!el.hudClock) { return; }
    const tick = () => {
      const now = new Date();
      const p = (n) => String(n).padStart(2, "0");
      el.hudClock.textContent = p(now.getHours()) + ":" + p(now.getMinutes()) + ":" + p(now.getSeconds());
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* -------------------------------------------------------------- 索引 */

  function openIndex() {
    if (!state.columns.length) { return; }
    if (!el.indexList.childElementCount) {
      state.columns.forEach((col, ci) => {
        const wrap = document.createElement("div");
        wrap.className = "idx-col";
        const title = document.createElement("h4");
        title.textContent = "COLUMN " + String(ci + 1).padStart(2, "0") + " · " + col.name;
        wrap.appendChild(title);
        const list = document.createElement("div");
        list.className = "idx-list";
        col.entries.forEach((entry, ri) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "idx-item";
          const no = document.createElement("span");
          no.className = "no";
          no.textContent = entry.id;
          btn.appendChild(no);
          btn.appendChild(document.createTextNode(entry.title));
          btn.addEventListener("click", () => {
            state.col = ci;
            state.row = ri;
            renderAll();
            closeIndex();
          });
          list.appendChild(btn);
        });
        wrap.appendChild(list);
        el.indexList.appendChild(wrap);
      });
    }
    document.body.classList.add("is-index-open");
  }

  function closeIndex() {
    document.body.classList.remove("is-index-open");
  }
})();
