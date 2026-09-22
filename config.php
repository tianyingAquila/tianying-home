<?php
declare(strict_types=1);

// 后台登录密码存放在同目录的 config.local.php 中，不提交到 Git。
// 如果本地没有这个文件，就生成一个随机密码，避免使用固定默认密码。
$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    require_once $localConfig;
}
if (!defined('ADMIN_PASSWORD') || ADMIN_PASSWORD === '') {
    define('ADMIN_PASSWORD', bin2hex(random_bytes(24)));
}

// Steam Web API 密钥（首页显示 Steam 在线状态用）。同样放在 config.local.php，不提交到 Git。
// 留空时会退回到抓取公开个人资料页的 XML。
if (!defined('STEAM_API_KEY')) {
    define('STEAM_API_KEY', '');
}

function is_https_request(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}
// 允许上传的图片类型（扩展名）
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

// 允许上传的音乐类型（扩展名）
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'];

// 单文件最大字节数，默认 30MB
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
