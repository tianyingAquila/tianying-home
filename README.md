# Tianying的巢

[访问网站](https://tianying0.com/)。这里是个人网站的公开前台源码。

| 页面 | 内容 |
| --- | --- |
| `index.html` | 资料、随笔、留言、照片、Steam状态和音乐 |
| `projects.html` | 电脑三维档案阵列、手机列表及项目详情 |
| `games.html` | 扫雷、塔防、混乱牌战的GAME OS入口 |
| `minesweeper.html` | 三种棋盘、27个效果的技能扫雷 |
| `tower.html`、`replay.html` | 四图塔防、成绩详情和按版本回放；当前新局v1.07 |
| `chaos-cards.html` | 197张随从，自由／三选一／疯狂模式构筑，联机及两档电脑对手；222张独立插画 |

## 预览与检查

原生HTML、CSS、JavaScript，无构建步骤；使用静态HTTP服务打开本目录。留言、Steam、榜单、保存和牌战联机需要对应在线接口；静态预览不能替代完整服务验收。

```sh
node tools/check_release.js
node --test tests/tower.test.js tests/frontend.test.js tests/chaos-cards.test.mjs
```

游戏终端保留同一iframe实例，退出可回到原局，刷新不保证续玩。牌战回合由服务器计时，收起页面不暂停；鼠标停在手牌区时，滚轮可左右浏览手牌，选牌与对局更新保留浏览位置。塔防回放在新标签页打开。

样式与脚本修改需更新对应页面的缓存参数；旧塔防versions和patches是历史成绩的运行依赖，保持冻结。`tests/game-os.browser.js` 用于实际浏览器验证三款游戏的轮换、启退和实例保留。

本仓库包含页面、assets、tests和tools，不包含整个网站的服务端及运行数据。项目档案参考RhineLabUI，许可见 `assets/data/RHINELABUI-LICENSE.txt`。
