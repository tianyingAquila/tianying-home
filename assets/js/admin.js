(function () {
  "use strict";

  const state = {
    csrf: "",
    config: null,
    messages: [],
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function request(action, options = {}) {
    const url = `api.php?action=${encodeURIComponent(action)}`;
    const init = {
      method: options.method || "GET",
      headers: options.headers || {},
      credentials: "same-origin",
    };
    if (options.body !== undefined) {
      init.body = options.body;
      if (!init.headers["Content-Type"] && !(options.body instanceof FormData)) {
        init.headers["Content-Type"] = "application/json";
      }
    }
    const response = await fetch(url, init);
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("服务器返回了无法解析的数据");
    }
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "请求失败");
    }
    return data;
  }

  function showLogin() {
    $("loginCard").hidden = false;
    $("adminMain").hidden = true;
    $("logoutButton").hidden = true;
  }

  function showAdmin() {
    $("loginCard").hidden = true;
    $("adminMain").hidden = false;
    $("logoutButton").hidden = false;
  }

  function setStatus(text, isError = false) {
    const el = $("saveStatus");
    el.textContent = text;
    el.style.color = isError ? "#fb7185" : "";
  }

  function fillFields() {
    const c = state.config || {};
    $("brandInput").value = c.brand || "";
    $("nameInput").value = c.name || "";
    $("introInput").value = c.intro || "";
    $("mottoInput").value = c.motto || "";
    $("githubInput").value = c.github || "";
    $("icpInput").value = c.icp || "";
    $("musicTitleInput").value = c.music?.title || "";
    $("musicArtistInput").value = c.music?.artist || "";
    $("musicSrcInput").value = c.music?.src || "";
    $("musicCoverInput").value = c.music?.cover || "";
    $("avatarPreview").src = c.avatar || "assets/img/avatar.svg";
    $("backgroundPreview").src = c.background || "";
    if (!c.background) {
      $("backgroundPreview").style.opacity = "0";
    } else {
      $("backgroundPreview").style.opacity = "1";
    }
  }

  function renderProjects() {
    const container = $("projectEditor");
    container.innerHTML = "";
    (state.config?.projects || []).forEach((project, index) => {
      const row = document.createElement("div");
      row.className = "project-editor-item";
      row.dataset.index = String(index);
      row.innerHTML = `
        <label>标题
          <input class="p-title" type="text" value="${escapeHtml(project.title || "")}">
        </label>
        <label>说明
          <input class="p-desc" type="text" value="${escapeHtml(project.description || "")}">
        </label>
        <label>链接
          <input class="p-url" type="url" value="${escapeHtml(project.url || "")}">
        </label>
        <label>标签（用逗号分隔）
          <input class="p-tags" type="text" value="${escapeHtml((project.tags || []).join(", "))}">
        </label>
        <button class="remove-button" type="button" data-action="remove-project">删除</button>
      `;
      container.appendChild(row);
    });
  }

  function renderGallery() {
    const container = $("galleryManager");
    container.innerHTML = "";
    (state.config?.gallery || []).forEach((item) => {
      const card = document.createElement("div");
      card.className = "gallery-manager-item";
      card.innerHTML = `
        <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.caption || "照片")}">
        <div class="caption">${escapeHtml(item.caption || "")}</div>
        <button class="remove-button" type="button" data-src="${escapeHtml(item.src)}">删除</button>
      `;
      container.appendChild(card);
    });
  }

  function renderMessages() {
    const container = $("messageManager");
    container.innerHTML = "";
    if (!state.messages.length) {
      container.innerHTML = '<p class="message-manager-meta">暂无留言。</p>';
      return;
    }
    state.messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = "message-manager-item";
      const date = new Date((message.time || 0) * 1000);
      const time = isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
      row.innerHTML = `
        <div>
          <p><strong>${escapeHtml(message.name || "访客")}</strong>：${escapeHtml(message.text)}</p>
          <p class="message-manager-meta">${escapeHtml(time)}</p>
        </div>
        <button class="remove-button" type="button" data-id="${escapeHtml(message.id)}">删除</button>
      `;
      container.appendChild(row);
    });
  }

  function collectConfig() {
    const c = state.config || {};
    const projects = Array.from($("projectEditor").querySelectorAll(".project-editor-item")).map((row) => {
      const tags = row.querySelector(".p-tags").value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        title: row.querySelector(".p-title").value.trim(),
        description: row.querySelector(".p-desc").value.trim(),
        url: row.querySelector(".p-url").value.trim(),
        tags,
      };
    });
    return {
      brand: $("brandInput").value.trim(),
      name: $("nameInput").value.trim(),
      intro: $("introInput").value.trim(),
      motto: $("mottoInput").value.trim(),
      github: $("githubInput").value.trim(),
      icp: $("icpInput").value.trim(),
      music: {
        title: $("musicTitleInput").value.trim(),
        artist: $("musicArtistInput").value.trim(),
        src: $("musicSrcInput").value.trim(),
        cover: $("musicCoverInput").value.trim(),
      },
      projects,
      gallery: c.gallery || [],
    };
  }

  async function saveConfig() {
    const button = $("saveButton");
    button.disabled = true;
    setStatus("正在保存…");
    try {
      const result = await request("admin_save", {
        method: "POST",
        body: JSON.stringify({
          csrf: state.csrf,
          config: collectConfig(),
        }),
      });
      state.config = result.data;
      setStatus("已保存");
      fillFields();
      renderGallery();
      window.setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      setStatus(error.message || "保存失败", true);
    } finally {
      button.disabled = false;
    }
  }

  async function uploadFile(type, fileInput, caption = "") {
    if (!fileInput.files || !fileInput.files[0]) {
      setStatus("请先选择文件", true);
      return;
    }
    const form = new FormData();
    form.append("csrf", state.csrf);
    form.append("type", type);
    form.append("caption", caption);
    form.append("file", fileInput.files[0]);
    setStatus("正在上传…");
    try {
      const result = await request("upload", {
        method: "POST",
        body: form,
      });
      state.config = result.data;
      fillFields();
      renderGallery();
      fileInput.value = "";
      setStatus("上传成功");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      setStatus(error.message || "上传失败", true);
    }
  }

  function bindEvents() {
    $("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      $("loginError").textContent = "";
      try {
        const result = await request("admin_login", {
          method: "POST",
          body: JSON.stringify({ password: $("loginPassword").value }),
        });
        state.csrf = result.csrf;
        showAdmin();
        await loadData();
      } catch (error) {
        $("loginError").textContent = error.message || "登录失败";
      }
    });

    $("logoutButton").addEventListener("click", async () => {
      try {
        await request("admin_logout", { method: "POST" });
      } catch (error) {
        // 即使退出失败也回到登录界面。
      }
      state.csrf = "";
      state.config = null;
      showLogin();
    });

    $("saveButton").addEventListener("click", saveConfig);
    $("addProjectButton").addEventListener("click", () => {
      state.config = state.config || { projects: [] };
      state.config.projects = state.config.projects || [];
      state.config.projects.push({ title: "", description: "", url: "", tags: [] });
      renderProjects();
    });

    $("projectEditor").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='remove-project']");
      if (!button) {
        return;
      }
      const row = button.closest(".project-editor-item");
      const index = Number(row.dataset.index || 0);
      state.config.projects.splice(index, 1);
      renderProjects();
    });

    $("avatarFile").addEventListener("change", () => uploadFile("avatar", $("avatarFile")));
    $("backgroundFile").addEventListener("change", () => uploadFile("background", $("backgroundFile")));
    $("musicFile").addEventListener("change", () => uploadFile("music", $("musicFile")));
    $("musicCoverFile").addEventListener("change", () => uploadFile("music-cover", $("musicCoverFile")));
    $("galleryUploadButton").addEventListener("click", () => {
      uploadFile("gallery", $("galleryFile"), $("galleryCaption").value.trim());
    });

    $("galleryManager").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-src]");
      if (!button) {
        return;
      }
      try {
        const result = await request("delete_image", {
          method: "POST",
          body: JSON.stringify({ csrf: state.csrf, src: button.dataset.src }),
        });
        state.config = result.data;
        renderGallery();
      } catch (error) {
        setStatus(error.message || "删除失败", true);
      }
    });

    $("messageManager").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-id]");
      if (!button) {
        return;
      }
      try {
        const result = await request("delete_message", {
          method: "POST",
          body: JSON.stringify({ csrf: state.csrf, id: button.dataset.id }),
        });
        state.messages = result.data;
        renderMessages();
      } catch (error) {
        setStatus(error.message || "删除失败", true);
      }
    });
  }

  async function loadData() {
    try {
      const configResult = await request("config");
      state.config = configResult.data;
      const messageResult = await request("messages");
      state.messages = messageResult.data;
      fillFields();
      renderProjects();
      renderGallery();
      renderMessages();
    } catch (error) {
      setStatus(error.message || "加载失败", true);
    }
  }

  async function init() {
    bindEvents();
    showLogin();
    try {
      const result = await request("admin_state");
      state.csrf = result.csrf;
      showAdmin();
      await loadData();
    } catch (error) {
      // 未登录时停留在登录界面即可。
    }
  }

  init();
})();
