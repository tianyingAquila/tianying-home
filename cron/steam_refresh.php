<?php
declare(strict_types=1);

// Steam 状态定时刷新（服务器 crontab 每 5 分钟跑一次）
//     */5 * * * * /www/server/php/82/bin/php /www/wwwroot/tianying/cron/steam_refresh.php >/dev/null 2>&1
// 只允许命令行运行，防止被外面的网址调用。

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/steam.php';

function steam_cron_log(string $message): void
{
    @file_put_contents(DATA_DIR . '/steam_refresh.log', date('c') . ' ' . $message . "\n", FILE_APPEND);
}

$config = json_decode((string) @file_get_contents(DATA_DIR . '/config.json'), true);
$steamId = is_array($config) ? trim((string) ($config['steam']['id'] ?? '')) : '';
if ($steamId === '') {
    steam_cron_log('未在 data/config.json 里配置 steam.id，跳过');
    exit(1);
}

@touch(steam_refresh_marker());
$data = steam_fetch_status($steamId);
if ($data === null) {
    steam_cron_log('刷新失败（Steam 接口不可达），保留上一次的缓存');
    exit(1);
}

steam_write_cache($steamId, $data);
exit(0);