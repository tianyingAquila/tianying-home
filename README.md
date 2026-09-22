# Tianying的巢

一个个人网站，包含：

- 首页：个人简介、社交链接、随笔、留言板、图片集、Steam 状态和音乐播放器
- 项目页：`projects.html` 的 Three.js 档案终端
- 扫雷页：`minesweeper.html` 的技能扫雷
- 后台：`admin.php`，只允许通过 HTTPS 访问

## 技术栈

- 前端：原生 HTML / CSS / JavaScript，无构建步骤
- 后端：PHP 单文件 API（`api.php`），数据存为 JSON 文件
- 无需数据库

## 目录结构

```
├── index.html / projects.html / minesweeper.html
├── admin.php / api.php / config.php
├── assets/              # 样式、脚本、图片、音乐
├── data/                # 网站内容、留言、成绩和缓存
├── uploads/             # 后台上传的图片/音频
└── cron/                # Steam 状态定时刷新
```

## 上线约定

- 部署从本机执行 `G:\个人网页\deploy.ps1`，不要用服务器反向拉 GitHub。
- `assets/` 走 Git 部署；`data/`、`uploads/` 和 `config.local.php` 不部署覆盖。
- 页面静态资源带版本参数，修改 CSS/JS 后必须同步提升 `?v=N`。
- 生产环境要求 HTTPS；后台登录和会话 Cookie 不能回退到明文 HTTP。
