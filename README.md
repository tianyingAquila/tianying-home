# Tianying的巢

这是一个个人网站首页，包含：

- 个人简介与社交链接
- 首页固定音乐播放器
- 可编辑随笔
- 最多 5 条的留言板
- 照片墙
- 项目卡片
- 日间 / 夜间模式
- 系统运行时间和当前时间

## 日常维护

后台地址：`https://你的网站地址/admin.php`

初始后台密码：`Tianying0`

建议上线后尽快修改密码。密码在服务器根目录的 `config.php` 中，把 `ADMIN_PASSWORD` 改成新密码即可。

后台可以修改：

- 网站名、昵称、介绍、随笔
- 头像和背景图
- 音乐信息和文件
- 项目卡片
- 照片墙
- 删除留言

## 想直接替换文件

如果不想用后台，也可以直接在服务器的 `/www/wwwroot/tianying` 目录替换：

- 头像：`assets/img/avatar.svg` 或通过后台上传
- 背景图：通过后台上传，或修改 `data/config.json` 里的 `background`
- 音乐：`assets/music/track.wav`
- 项目与照片：`data/config.json`

修改 `data/config.json` 后刷新首页即可看到变化。

## 留言板规则

每条留言最长 20 个字，最多保留 5 条；新留言会自动挤掉最旧的一条。
