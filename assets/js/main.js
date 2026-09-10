(function () {
  "use strict";

  const DEFAULT_CONFIG = {
    brand: "Tianying的巢",
    name: "Tianying",
    intro: "一个正在慢慢长大的个人小站。",
    motto: "月落乌啼霜满天",
    avatar: "assets/img/avatar.svg",
    background: "/assets/img/background.jpg",
    github: "https://github.com/tianyingAquila",
    social: [
      { name: "GitHub", url: "https://github.com/tianyingAquila", icon: "github" },
      { name: "B站", url: "https://space.bilibili.com/385516184", icon: "bilibili" },
    ],
    music: {
      title: "未命名曲目",
      artist: "Tianying",
      src: "assets/music/track.wav",
      cover: "assets/img/music-cover.svg",
    },
    projects: [
      {
        title: "DeepSeek 余额悬浮小工具",
        description: "Windows 桌面上的 DeepSeek 余额悬浮小工具（可跟随 Codex 显隐）",
        url: "https://github.com/tianyingAquila/deepseek-balance-widget",
        tags: ["PowerShell", "Windows"],
      },
      {
        title: "git-hello-world",
        description: "第一次 Git 尝试",
        url: "https://github.com/tianyingAquila/git-hello-world",
        tags: ["Git"],
      },
    ],
    gallery: [
      { src: "assets/img/photo1.svg", caption: "示例照片 1" },
      { src: "assets/img/photo2.svg", caption: "示例照片 2" },
      { src: "assets/img/photo3.svg", caption: "示例照片 3" },
    ],
    icp: "",
  };

  const state = {
    config: { ...DEFAULT_CONFIG },
    messages: [],
    currentImageIndex: -1,
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

  function safeUrl(value, fallback = "#") {
    const text = String(value || "").trim();
    if (/^(https?:|mailto:|\/)/i.test(text)) {
      return text;
    }
    return fallback;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatUptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    if (days > 0) {
      return `${days} 天 ${hours} 小时`;
    }
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours} 小时 ${minutes} 分钟`;
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
    return data.data;
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem("tianying-theme", theme);
  }

  function setupTheme() {
    const saved = localStorage.getItem("tianying-theme") || "light";
    applyTheme(saved);
    $("themeToggle").addEventListener("click", () => {
      const next = document.body.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }

  function renderBackground() {
    const bg = $("bg");
    const image = state.config.background;
    if (image) {
      bg.style.setProperty("--bg-image", `url("${CSS.escape(image)}")`);
      bg.classList.add("has-image");
    } else {
      bg.classList.remove("has-image");
    }
  }

  function renderProfile() {
    document.title = state.config.brand || "Tianying的巢";
    $("brandText").textContent = state.config.brand || "Tianying的巢";
    $("nameText").textContent = state.config.name || "Tianying";
    $("introText").textContent = state.config.intro || "";
    $("mottoText").textContent = state.config.motto || "月落乌啼霜满天";
    $("avatarImg").src = state.config.avatar || DEFAULT_CONFIG.avatar;
    $("avatarImg").alt = state.config.name ? `${state.config.name} 的头像` : "头像";
    $("socialLinks").innerHTML = "";
    (state.config.social || []).forEach((item) => {
      const link = document.createElement("a");
      link.className = "social-link";
      link.href = safeUrl(item.url);
      link.textContent = item.name || item.icon || "链接";
      if (/^https?:/i.test(item.url || "")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      $("socialLinks").appendChild(link);
    });
    const icp = state.config.icp;
    if (icp) {
      $("icpText").innerHTML = `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(icp)}</a>`;
    } else {
      $("icpText").textContent = "";
    }
  }

  function setupMusic() {
    const audio = $("musicAudio");
    const playButton = $("musicPlay");
    const cover = $("musicCover");
    const record = document.querySelector(".record-wrap");
    const progress = $("musicProgress");

    audio.src = state.config.music.src || DEFAULT_CONFIG.music.src;
    cover.src = state.config.music.cover || DEFAULT_CONFIG.music.cover;
    $("musicTitle").textContent = state.config.music.title || "未命名曲目";
    $("musicArtist").textContent = state.config.music.artist || "Tianying";

    function togglePlay() {
      if (audio.paused) {
        audio.play().catch(() => {
          // 浏览器可能拦截自动播放，用户点击后通常可以播放。
        });
      } else {
        audio.pause();
      }
    }

    function updatePlayState() {
      const playing = !audio.paused;
      playButton.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
      playButton.setAttribute("aria-label", playing ? "暂停" : "播放");
      record.classList.toggle("playing", playing);
    }

    function updateProgress() {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        progress.value = "0";
        $("totalTime").textContent = "00:00";
        return;
      }
      const percent = (audio.currentTime / audio.duration) * 100;
      progress.value = String(percent);
      progress.style.setProperty("--value", `${percent}%`);
      $("currentTime").textContent = formatTime(audio.currentTime);
      $("totalTime").textContent = formatTime(audio.duration);
    }

    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("play", updatePlayState);
    audio.addEventListener("pause", updatePlayState);
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      updateProgress();
      updatePlayState();
    });

    playButton.addEventListener("click", togglePlay);
    $("musicPrev").addEventListener("click", () => {
      audio.currentTime = 0;
      if (audio.paused) {
        audio.play().catch(() => {});
      }
    });
    $("musicNext").addEventListener("click", () => {
      audio.currentTime = 0;
      if (audio.paused) {
        audio.play().catch(() => {});
      }
    });
    progress.addEventListener("input", () => {
      if (!Number.isFinite(audio.duration)) {
        return;
      }
      const percent = Number(progress.value) || 0;
      audio.currentTime = (percent / 100) * audio.duration;
      progress.style.setProperty("--value", `${percent}%`);
    });
  }

  function renderMessages() {
    const list = $("messageList");
    list.innerHTML = "";
    if (!state.messages.length) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "还没有留言，来做第一个吧。";
      list.appendChild(empty);
      return;
    }
    state.messages.forEach((message) => {
      const item = document.createElement("div");
      item.className = "message-item";
      const avatar = document.createElement("div");
      avatar.className = "message-avatar";
      avatar.textContent = (message.name || "客").slice(0, 1);
      const body = document.createElement("div");
      body.className = "message-body";
      const meta = document.createElement("div");
      meta.className = "message-meta";
      const name = document.createElement("span");
      name.className = "message-name";
      name.textContent = message.name || "访客";
      const time = document.createElement("span");
      const date = new Date((message.time || 0) * 1000);
      time.textContent = isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
      meta.append(name, time);
      const text = document.createElement("p");
      text.className = "message-text";
      text.textContent = message.text;
      body.append(meta, text);
      item.append(avatar, body);
      list.appendChild(item);
    });
  }

  async function loadMessages() {
    try {
      state.messages = await request("messages");
    } catch (error) {
      state.messages = [];
    }
    renderMessages();
  }

  function setupGuestbook() {
    const form = $("messageForm");
    const nameInput = $("guestName");
    const messageInput = $("guestMessage");
    const count = $("charCount");
    const status = $("messageStatus");

    $("guestbookHelp").addEventListener("click", () => {
      $("guestbookHelp").classList.toggle("tooltip-open");
    });

    messageInput.addEventListener("input", () => {
      count.textContent = `${messageInput.value.length} / 20`;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = messageInput.value.trim();
      if (!message) {
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = "正在发送…";
      try {
        state.messages = await request("message", {
          method: "POST",
          body: JSON.stringify({
            name: nameInput.value.trim(),
            message,
          }),
        });
        messageInput.value = "";
        nameInput.value = "";
        count.textContent = "0 / 20";
        status.textContent = "已发送";
        renderMessages();
      } catch (error) {
        status.textContent = error.message || "发送失败";
      } finally {
        button.disabled = false;
        window.setTimeout(() => {
          status.textContent = "";
        }, 3000);
      }
    });
  }

  let galleryTimer = null;
  let galleryIndex = 0;

  function stopGalleryAutoplay() {
    if (galleryTimer) {
      window.clearInterval(galleryTimer);
      galleryTimer = null;
    }
  }

  function startGalleryAutoplay() {
    stopGalleryAutoplay();
    galleryTimer = window.setInterval(() => {
      const images = state.config.gallery || [];
      if (images.length > 1) {
        moveGallery((galleryIndex + 1) % images.length);
      }
    }, 4200);
  }

  function moveGallery(index) {
    const images = state.config.gallery || [];
    if (!images.length) {
      return;
    }
    galleryIndex = (index + images.length) % images.length;
    const track = $("galleryTrack");
    track.style.transform = `translateX(-${galleryIndex * 100}%)`;
    const dots = Array.from($("galleryDots").querySelectorAll(".carousel-dot"));
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === galleryIndex);
    });
  }

  function setupGalleryControls() {
    $("galleryPrev").addEventListener("click", () => moveGallery(galleryIndex - 1));
    $("galleryNext").addEventListener("click", () => moveGallery(galleryIndex + 1));
    const carousel = $("galleryCarousel");
    carousel.addEventListener("mouseenter", stopGalleryAutoplay);
    carousel.addEventListener("mouseleave", startGalleryAutoplay);

    let startX = 0;
    carousel.addEventListener("touchstart", (event) => {
      startX = event.touches[0].clientX;
      stopGalleryAutoplay();
    }, { passive: true });
    carousel.addEventListener("touchend", (event) => {
      const endX = event.changedTouches[0].clientX;
      const diff = startX - endX;
      if (Math.abs(diff) > 45) {
        moveGallery(galleryIndex + (diff > 0 ? 1 : -1));
      }
      startGalleryAutoplay();
    }, { passive: true });
  }

  function renderGallery() {
    const track = $("galleryTrack");
    const dots = $("galleryDots");
    track.innerHTML = "";
    dots.innerHTML = "";
    galleryIndex = 0;
    const images = state.config.gallery || [];
    if (!images.length) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "图片还没有放进来。";
      track.appendChild(empty);
      return;
    }
    images.forEach((image, index) => {
      const slide = document.createElement("div");
      slide.className = "gallery-slide";
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = image.caption || `图片 ${index + 1}`;
      img.loading = "lazy";
      const caption = document.createElement("p");
      caption.className = "gallery-caption";
      caption.textContent = image.caption || "";
      slide.append(img, caption);
      slide.addEventListener("click", () => openLightbox(index));
      track.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      dot.setAttribute("aria-label", `切换到第 ${index + 1} 张`);
      dot.addEventListener("click", () => moveGallery(index));
      dots.appendChild(dot);
    });
    moveGallery(0);
    startGalleryAutoplay();
  }

  function openLightbox(index) {
    const images = state.config.gallery || [];
    if (!images[index]) {
      return;
    }
    state.currentImageIndex = index;
    $("lightboxImg").src = images[index].src;
    $("lightboxImg").alt = images[index].caption || "照片大图";
    $("lightboxCaption").textContent = images[index].caption || "";
    $("lightbox").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    $("lightbox").hidden = true;
    document.body.style.overflow = "";
  }

  function setupLightbox() {
    $("lightboxClose").addEventListener("click", closeLightbox);
    $("lightbox").addEventListener("click", (event) => {
      if (event.target === $("lightbox")) {
        closeLightbox();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (!$("lightbox").hidden && event.key === "Escape") {
        closeLightbox();
      }
    });
  }

  function renderProjects() {
    const grid = $("projectGrid");
    grid.innerHTML = "";
    (state.config.projects || []).forEach((project) => {
      const card = document.createElement("a");
      const url = safeUrl(project.url, "#");
      card.className = "project-card";
      card.href = url;
      if (/^https?:/i.test(url)) {
        card.target = "_blank";
        card.rel = "noopener noreferrer";
      }
      const title = document.createElement("h3");
      title.className = "project-title";
      title.textContent = project.title || "未命名项目";
      const description = document.createElement("p");
      description.className = "project-description";
      description.textContent = project.description || "";
      const tags = document.createElement("div");
      tags.className = "project-tags";
      (project.tags || []).forEach((tag) => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = tag;
        tags.appendChild(span);
      });
      card.append(title, description, tags);
      grid.appendChild(card);
    });
  }

  function setupParticles() {
    const container = $("bgParticles");
    const count = window.innerWidth < 620 ? 10 : 18;
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement("span");
      dot.className = "particle";
      const size = 2 + Math.random() * 4;
      dot.style.left = `${Math.random() * 100}%`;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.animationDuration = `${8 + Math.random() * 10}s`;
      dot.style.animationDelay = `${Math.random() * 8}s`;
      dot.style.opacity = String(0.35 + Math.random() * 0.5);
      container.appendChild(dot);
    }
  }

  function setupSakura() {
    const container = $("sakura");
    const count = window.innerWidth < 620 ? 12 : 20;
    for (let i = 0; i < count; i += 1) {
      const petal = document.createElement("span");
      petal.className = "petal";
      petal.style.left = `${Math.random() * 100}%`;
      petal.style.animationDuration = `${7 + Math.random() * 8}s`;
      petal.style.animationDelay = `${Math.random() * 8}s`;
      petal.style.transform = `scale(${0.65 + Math.random() * 0.7})`;
      container.appendChild(petal);
    }
  }

  function setupClockAndUptime() {
    const clock = () => {
      $("clockText").textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    };
    clock();
    window.setInterval(clock, 1000);

    const updateUptime = async () => {
      try {
        const data = await request("uptime");
        $("uptimeText").textContent = formatUptime(data.uptimeSeconds);
      } catch (error) {
        $("uptimeText").textContent = "--";
      }
    };
    updateUptime();
    window.setInterval(updateUptime, 60000);
  }

  async function init() {
    setupTheme();
    setupParticles();
    setupSakura();
    setupClockAndUptime();
    setupLightbox();
    setupGalleryControls();

    try {
      state.config = await request("config");
    } catch (error) {
      state.config = { ...DEFAULT_CONFIG };
    }

    renderBackground();
    renderProfile();
    setupMusic();
    renderGallery();
    renderProjects();
    setupGuestbook();
    loadMessages();
  }

  init();
})();
