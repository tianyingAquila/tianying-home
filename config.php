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

// 允许上传的图片类型（扩展名）
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

// 允许上传的音乐类型（扩展名）
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'];

// 单文件最大字节数，默认 30MB
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
