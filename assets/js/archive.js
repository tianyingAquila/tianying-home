/* ==========================================================================
   天鹰档案终端 · 交互脚本
   设计语言与交互参考 LBEILC/RhineLabUI（MIT License）
   Copyright (c) 2026 LBEILC
   动画全部由 CSS 负责，本文件只做数据渲染与 class 切换。
   ========================================================================== */
(function () {
  "use strict";

  const MOVE_MS = 320;     // 一次滑动动画的时长（略大于 CSS 过渡，兼顾连按手感）
  const BG_MAX = 6;        // 背景阵列范围：gx / gy 各 -6..6
  const SAVED_KEY = "tianying.archive.saved.v1";

  const el = {};
  const state = {
    columns: [],
    col: 0,
    row: 0,
    saved: new Set(),
    fg: [],
    busy: false,
  };

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    [
      "arcGrid", "infoCat", "infoNum", "infoTitle", "infoEn", "selIndex", "selTotal",
      "tickBars", "prevFile", "nextFile", "prevCol", "nextCol", "colIndex", "colName",
      "accessBtn", "savedCount", "indexBtn", "indexClose", "arcIndex", "indexList",
      "detailBack", "docFile", "docArea", "docTitle", "docSub", "docChip", "docType",
      "docStatus", "docAbstract", "docCommitsBlock", "docCommits", "docSave",
      "docExport", "docRepo", "caseTop", "caseSub", "caseNo", "capNo", "detailCase", "detailDoc",
    ].forEach((id) => { el[id] = document.getElementById(id); });

    loadSaved();
    bindEvents();
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
        buildBackground();
        buildForeground();
        renderAll();
        document.body.classList.add("is-ready");
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

  function isSmallScreen() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 620px)").matches;
  }

  // 背景：一片固定的档案墙（手机端改纵向列表，不再生成这些装饰盒）
  function buildBackground() {
    if (isSmallScreen()) {
      return;
    }
    const frag = document.createDocumentFragment();
    for (let gy = -BG_MAX; gy <= BG_MAX; gy += 1) {
      for (let gx = -BG_MAX; gx <= BG_MAX; gx += 1) {
        const node = makeFile("is-decor");
        node.style.setProperty("--gx", gx);
        node.style.setProperty("--gy", gy);
        const depth = Math.max(Math.abs(gx), Math.abs(gy));
        node.style.setProperty("--dim", String(Math.max(0.34, 1 - depth * 0.1)));
        if (depth >= 3) { node.style.setProperty("--blur", (depth - 2) * 0.45 + "px"); }
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
    renderSavedCount();
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
      const gy = i - state.row;
      node.style.setProperty("--gy", gy);
      node.classList.toggle("is-active", i === state.row);
      const depth = Math.abs(gy);
      node.style.setProperty("--dim", String(Math.max(0.4, 1 - depth * 0.12)));
      node.style.setProperty("--blur", depth >= 5 ? (depth - 4) * 0.6 + "px" : "0px");
      node.querySelector(".arc-tag").textContent = entry.id;
      node.querySelector(".arc-name").textContent = entry.title;
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
    el.docSave.addEventListener("click", toggleSave);
    el.docExport.addEventListener("click", exportEntry);

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
    renderArray();
    renderHud();
    renderTicks();
  }

  function selectRow(index) {
    const total = currentColumn().entries.length;
    if (index === state.row || index < 0 || index >= total) { return; }
    if (!lockMove()) { return; }
    state.row = index;
    renderArray();
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
    document.body.classList.add("is-col-switching");
    renderHud();
    window.setTimeout(() => {
      renderArray();
      renderTicks();
      document.body.classList.remove("is-col-switching");
    }, 240);
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
    el.docSave.classList.toggle("is-saved", state.saved.has(entry.id));
    el.docSave.textContent = state.saved.has(entry.id) ? "已收藏 ✓" : "＋ 收藏档案";
  }

  /* ------------------------------------------------------------ 收藏 / 导出 */

  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      if (raw) { state.saved = new Set(JSON.parse(raw)); }
    } catch (error) {
      state.saved = new Set();
    }
  }

  function persistSaved() {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(state.saved)));
    } catch (error) {
      /* 隐私模式下写不进去也不影响浏览 */
    }
  }

  function renderSavedCount() {
    el.savedCount.textContent = String(state.saved.size).padStart(2, "0");
  }

  function toggleSave() {
    const entry = currentEntry();
    if (!entry) { return; }
    if (state.saved.has(entry.id)) { state.saved.delete(entry.id); } else { state.saved.add(entry.id); }
    persistSaved();
    renderSavedCount();
    fillDetail(entry);
  }

  function exportEntry() {
    const entry = currentEntry();
    if (!entry) { return; }
    const lines = [
      "FILE " + entry.id,
      entry.title + (entry.en ? " / " + entry.en : ""),
      "类型：" + (entry.type || "—"),
      "状态：" + (entry.status || "—"),
      "",
      entry.abstract || "",
    ];
    if (Array.isArray(entry.commits) && entry.commits.length) {
      lines.push("", "提交记录：");
      entry.commits.forEach((c) => { lines.push("  " + (c.date || "") + "  " + (c.message || "")); });
    }
    if (entry.repo) { lines.push("", entry.repo); }
    lines.push("", "— Tianying Archive");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "archive-" + entry.id + ".txt";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
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