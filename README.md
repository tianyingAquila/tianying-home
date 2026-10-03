# Tianying的巢

一个个人网站，包含：

- 首页：个人简介、社交链接、随笔、留言板、图片集、Steam 状态和音乐播放器
- 项目页：`projects.html` 的 Three.js 档案终端
- 扫雷页：`minesweeper.html` 的技能扫雷
- 塔防页：`tower.html`；赢局从 v1.02 起保存动作日志，`replay.html` 可现场回放
- 后台：`admin.php`，只允许通过 HTTPS 访问

## 技术栈

- 前端：原生 HTML / CSS / JavaScript，无构建步骤
- 后端：PHP 单文件 API（`api.php`），数据存为 JSON 文件；塔防服务端复核使用一次性 Node CLI
- 无需数据库

## 目录结构

```
├── index.html / projects.html / minesweeper.html
├── admin.php / api.php / config.php
├── assets/              # 样式、脚本、图片、音乐；塔防冻结版本在 js/game/tower/versions/
├── data/                # 网站内容、留言、成绩和缓存
├── uploads/             # 后台上传的图片/音频
├── cron/                # Steam 状态定时刷新
└── tools/               # 服务器 Node CLI 工具（不常驻）
```

## 上线约定

- 部署从本机执行 `G:\个人网页\deploy.ps1`，不要用服务器反向拉 GitHub。
- `assets/` 中的代码、图片和种子数据走普通部署；`data/`、`uploads/` 和 `config.local.php` 不部署覆盖。
- `assets/music/` 也不在日常部署范围，首次恢复服务器时需单独恢复音乐。
- 照片墙只展示已有照片，后台不再提供照片上传、删除或更改。
- `storage.php` 使用独立锁文件和临时文件替换，失败返回错误；列表配置整体替换默认值。
- 当前塔防规则 `v1.04`，四张地图；第四图「螺旋」增加地狱塔、闪光和牧师，按65/35分配双路敌军。正式页面加载冻结版本，历史快照永久保留。
- 页面静态资源带版本参数，修改 CSS/JS 后必须同步提升 `?v=N`。
- 生产环境要求 HTTPS；后台登录和会话 Cookie 不能回退到明文 HTTP。

## 回归验证

本地执行 `node --test tests/*.test.js`、`node tools/check_release.js`。服务器或 PHP 8.2 CLI Linux 环境执行 `php tests/storage.test.php`、`php tests/api.test.php`。PHP 测试使用独立临时目录，不修改真实数据。`tests/deploy.test.php` 需要现有 Linux 服务器的 PHP/Node 路径和 www 用户，用隔离站点验证发布失败回退。部署检查每步退出码、服务器语法、冻结版本及整批发布文件哈希，最后核对线上 `release.json`。
