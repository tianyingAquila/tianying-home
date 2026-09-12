<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>网站后台 · Tianying的巢</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="assets/css/admin.css?v=2">
</head>
<body>
  <div class="admin-shell">
    <header class="admin-header">
      <div>
        <h1>Tianying的巢 · 后台</h1>
        <p>修改首页内容、项目和照片。</p>
      </div>
      <button id="logoutButton" class="text-button" type="button" hidden>退出登录</button>
    </header>

    <section class="login-card" id="loginCard">
      <h2>登录后台</h2>
      <form id="loginForm">
        <input id="loginPassword" type="password" placeholder="请输入后台密码" autocomplete="current-password" required>
        <button class="primary-button" type="submit">登录</button>
        <p class="form-error" id="loginError" role="alert"></p>
      </form>
    </section>

    <main class="admin-main" id="adminMain" hidden>
      <section class="admin-section">
        <div class="section-title">
          <h2>首页内容</h2>
          <p>顶部介绍和随笔内容。</p>
        </div>
        <div class="form-grid">
          <label>网站名
            <input id="brandInput" type="text" maxlength="100">
          </label>
          <label>昵称
            <input id="nameInput" type="text" maxlength="60">
          </label>
          <label>GitHub 地址
            <input id="githubInput" type="url" maxlength="300">
          </label>
          <label>备案号（没有就留空）
            <input id="icpInput" type="text" maxlength="100">
          </label>
          <label class="full">个人介绍
            <textarea id="introInput" rows="3" maxlength="500"></textarea>
          </label>
          <label class="full">随笔（首页中间那句话）
            <textarea id="mottoInput" rows="2" maxlength="300"></textarea>
          </label>
        </div>
      </section>

      <section class="admin-section">
        <div class="section-title">
          <h2>外观</h2>
          <p>头像和背景图。背景图留空时会使用默认星空渐变。</p>
        </div>
        <div class="upload-row">
          <div>
            <label class="upload-label">头像</label>
            <input id="avatarFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
            <img class="preview" id="avatarPreview" alt="头像预览">
          </div>
          <div>
            <label class="upload-label">背景图</label>
            <input id="backgroundFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
            <img class="preview" id="backgroundPreview" alt="背景预览">
          </div>
        </div>
      </section>

      <section class="admin-section">
        <div class="section-title">
          <h2>音乐</h2>
          <p>首页固定播放一首歌。</p>
        </div>
        <div class="form-grid">
          <label>歌名
            <input id="musicTitleInput" type="text" maxlength="100">
          </label>
          <label>歌手
            <input id="musicArtistInput" type="text" maxlength="100">
          </label>
          <label>音频文件地址
            <input id="musicSrcInput" type="text" maxlength="300">
          </label>
          <label>封面图片地址
            <input id="musicCoverInput" type="text" maxlength="300">
          </label>
          <label class="upload-label">上传新音频
            <input id="musicFile" type="file" accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4">
          </label>
          <label class="upload-label">上传新封面
            <input id="musicCoverFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
          </label>
        </div>
      </section>

      <section class="admin-section">
        <div class="section-title">
          <h2>项目</h2>
          <p>显示在首页下方的项目卡片。</p>
        </div>
        <div id="projectEditor" class="project-editor"></div>
        <button id="addProjectButton" class="secondary-button" type="button">＋ 添加项目</button>
      </section>

      <section class="admin-section">
        <div class="section-title">
          <h2>照片墙</h2>
          <p>上传随手拍，点击首页照片可放大查看。</p>
        </div>
        <div class="upload-inline">
          <input id="galleryFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
          <input id="galleryCaption" type="text" maxlength="100" placeholder="照片说明（可选）">
          <button id="galleryUploadButton" class="primary-button" type="button">上传照片</button>
        </div>
        <div class="gallery-manager" id="galleryManager"></div>
      </section>

      <section class="admin-section">
        <div class="section-title">
          <h2>留言板</h2>
          <p>最多显示 5 条，新留言会自动挤掉最旧的。这里可以手动删除。</p>
        </div>
        <div class="message-manager" id="messageManager"></div>
      </section>

      <div class="save-bar">
        <span id="saveStatus" role="status"></span>
        <button id="saveButton" class="primary-button large" type="button">保存全部修改</button>
      </div>
    </main>
  </div>

  <script src="assets/js/admin.js"></script>
</body>
</html>
