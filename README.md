# Tianying的巢

个人网站的前台源码，包含：

- 首页：个人简介、社交链接、随笔、留言板、图片集、Steam 状态和音乐播放器
- 项目页：`projects.html` 的 Three.js 档案终端
- 游戏选择页：`games.html` 的一屏 GAME OS
- 扫雷页：`minesweeper.html` 的技能扫雷
- 塔防页：`tower.html` 的四张地图；`replay.html` 可按记录版本回放

## 技术与目录

原生 HTML、CSS、JavaScript，无构建步骤。在线内容及成绩通过页面中使用的同源 API 读取；离线预览部分功能需要相应的在线接口。

```text
├── index.html / projects.html / games.html
├── minesweeper.html / tower.html / replay.html
├── assets/     # 样式、脚本、公开图片、音乐与种子数据
├── tests/      # 前台逻辑与浏览器回归
├── tools/      # 引擎版本检查、冻结与平衡模拟
└── docs/       # 前台设计与验证记录
```

## 本地预览与检查

用静态 HTTP 服务打开项目目录。项目档案接口不可用时会回落到 `assets/data/archives.json`；留言、Steam 状态、榜单和在线成绩保存需要对应 API。

```sh
node tools/check_release.js
node --test tests/*.test.js
```

页面 CSS/JS 修改后同步提升资源的 `?v=N` 参数。当前塔防规则为 `v1.06`；所有历史冻结快照保留，已有成绩按其对应版本回放。不能直接修改冻结文件；规则变化须发布新版本。

## GAME OS

游戏终端固定为一屏：中央大卡带、右侧下一张卡带和贴底游戏机。卡带预览使用原游戏页面的真实棋盘或 Canvas，保持同一实例、相同尺寸；启动时平移到运行位置，退出后保留本局，刷新不保存本局。

选择器读取原游戏 HTML，在同源 iframe 中挂载。预览期间隔离真实游戏输入、暂停推进与计时；运行后恢复。卡带切换、插入、退出和 UI 显现保留核心动画，游戏装饰遵循减少动态效果设置。

浏览器回归记录见 `docs/game-os-verification.md`，可复用断言为 `tests/game-os.browser.js` 和 `tests/game-os-motion.browser.js`。后者覆盖 Edge 减少动态效果模式、三档扫雷、宽地图及退出定位；这些脚本在浏览器中执行，不属于 Node 测试。
