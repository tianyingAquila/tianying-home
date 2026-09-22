<?php
declare(strict_types=1);

// Steam 状态模块
// ---------------------------------------------------------------------------
// 优先使用官方 Web API（密钥放在 config.local.php 的 STEAM_API_KEY，不进 Git）。
// 没有密钥时退回到抓取公开个人资料页的 XML。
//
// 这台深圳服务器访问 api.steampowered.com 时，HTTPS 会被运营商随机干扰：
// TCP 能连上、TLS 握手也正常，但响应常常收不到（实测大约三分之一能成功）。
// 端口 80 则一直稳定。所以这里统一按「HTTPS 试两次 -> HTTP 兜底」的顺序请求，
// 平时由 cron 每 5 分钟刷新一次缓存，访客看到的都是缓存结果。

if (!defined('DATA_DIR')) {
    define('DATA_DIR', __DIR__ . '/data');
}

function steam_cache_file(): string
{
    return DATA_DIR . '/steam_status.json';
}

function steam_refresh_marker(): string
{
    return DATA_DIR . '/steam_refresh.lock';
}

function steam_empty_status(string $display = '状态暂不可用'): array
{
    return [
        'available' => false,
        'online' => false,
        'personaState' => 0,
        'display' => $display,
        'gameName' => '',
        'personaName' => '',
        'avatar' => '',
        'recent' => [],
        'fetchedAt' => 0,
    ];
}

// 单次 HTTP GET，返回 ['ok' => bool, 'body' => string, 'error' => string]
function steam_http_get(string $url, int $timeout): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => 'Tianying-Home (+https://tianying0.com)',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = (string) curl_error($ch);
        curl_close($ch);
        if ($body !== false && $code >= 200 && $code < 300 && $body !== '') {
            return ['ok' => true, 'body' => (string) $body, 'error' => ''];
        }
        return ['ok' => false, 'body' => '', 'error' => $error !== '' ? $error : 'HTTP ' . $code];
    }

    $context = stream_context_create([
        'http' => ['timeout' => $timeout, 'header' => "User-Agent: Tianying-Home\r\n"],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false || $body === '') {
        return ['ok' => false, 'body' => '', 'error' => 'stream 请求失败'];
    }
    return ['ok' => true, 'body' => (string) $body, 'error' => ''];
}

// 请求 Steam Web API，$quick = true 时用更短的预算（给访客请求兜底用）
function steam_api_get(string $path, array $query, int $timeout = 8, bool $quick = false): ?array
{
    $suffix = 'api.steampowered.com' . $path . '?' . http_build_query($query);
    // 密钥只能通过 HTTPS 发送；HTTP 兜底会泄露 API key。
    $plan = $quick
        ? [['https://' . $suffix, 5], ['https://' . $suffix, 6]]
        : [['https://' . $suffix, $timeout], ['https://' . $suffix, $timeout], ['https://' . $suffix, $timeout]];

    foreach ($plan as [$url, $limit]) {
        $result = steam_http_get($url, $limit);
        if (!$result['ok']) {
            continue;
        }
        $decoded = json_decode($result['body'], true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    return null;
}

function steam_persona_display(int $state, string $game): string
{
    if ($game !== '') {
        return '正在游玩 ' . $game;
    }
    switch ($state) {
        case 1:
            return '在线';
        case 2:
            return '忙碌';
        case 3:
            return '离开';
        case 4:
            return '打盹';
        case 5:
            return '想交易';
        case 6:
            return '想玩游戏';
        default:
            return '离线';
    }
}

function steam_format_recent(array $games, int $limit = 3): array
{
    $recent = [];
    foreach (array_slice($games, 0, $limit) as $game) {
        if (!is_array($game)) {
            continue;
        }
        $name = trim((string) ($game['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $appid = (int) ($game['appid'] ?? 0);
        $hash = (string) preg_replace('/[^0-9a-f]/i', '', (string) ($game['img_icon_url'] ?? ''));
        $recent[] = [
            'appid' => $appid,
            'name' => $name,
            'minutesTotal' => (int) ($game['playtime_forever'] ?? 0),
            'minutes2w' => (int) ($game['playtime_2weeks'] ?? 0),
            'icon' => ($appid > 0 && $hash !== '')
                ? 'api.php?action=steam_icon&appid=' . $appid . '&hash=' . $hash
                : '',
        ];
    }
    return $recent;
}

// 抓取 Steam 状态，失败返回 null
function steam_fetch_status(string $steamId, bool $quick = false): ?array
{
    $steamId = trim($steamId);
    if ($steamId === '' || !ctype_digit($steamId)) {
        return null;
    }

    $key = defined('STEAM_API_KEY') ? trim((string) STEAM_API_KEY) : '';
    if ($key === '') {
        return steam_fetch_status_xml($steamId, $quick);
    }

    $summary = steam_api_get('/ISteamUser/GetPlayerSummaries/v2/', [
        'key' => $key,
        'steamids' => $steamId,
    ], 8, $quick);

    $player = $summary['response']['players'][0] ?? null;
    if (!is_array($player)) {
        // Web API 的 HTTPS 不通时，退回不带密钥的公开 XML 页面。
        return steam_fetch_status_xml($steamId, $quick);
    }

    $gameName = trim((string) ($player['gameextrainfo'] ?? ''));
    $state = (int) ($player['personastate'] ?? 0);

    $data = [
        'available' => true,
        'online' => $state > 0 || $gameName !== '',
        'personaState' => $state,
        'display' => steam_persona_display($state, $gameName),
        'gameName' => $gameName,
        'personaName' => trim((string) ($player['personaname'] ?? '')),
        'avatar' => (string) ($player['avatarfull'] ?? ''),
        'recent' => [],
        'fetchedAt' => time(),
    ];

    $recent = steam_api_get('/IPlayerService/GetRecentlyPlayedGames/v1/', [
        'key' => $key,
        'steamid' => $steamId,
        'count' => 3,
    ], 8, $quick);

    $games = $recent['response']['games'] ?? null;
    if (is_array($games)) {
        $data['recent'] = steam_format_recent($games);
    }

    return $data;
}

// 没有 Web API 密钥时的兜底：抓公开资料的 XML
function steam_fetch_status_xml(string $steamId, bool $quick = false): ?array
{
    $suffix = 'steamcommunity.com/profiles/' . rawurlencode($steamId) . '/?xml=1';
    $plan = $quick
        ? [['https://' . $suffix, 5], ['http://' . $suffix, 6]]
        : [['https://' . $suffix, 8], ['http://' . $suffix, 8]];

    $xml = '';
    foreach ($plan as [$url, $limit]) {
        $result = steam_http_get($url, $limit);
        if ($result['ok']) {
            $xml = $result['body'];
            break;
        }
    }
    if ($xml === '') {
        return null;
    }

    $previous = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml);
    libxml_use_internal_errors($previous);
    if ($doc === false || !isset($doc->profile)) {
        return null;
    }

    $profile = $doc->profile;
    $onlineState = strtolower(trim((string) ($profile->onlineState ?? '')));
    $stateMessage = trim((string) ($profile->stateMessage ?? ''));
    $gameName = isset($profile->inGameInfo) ? trim((string) $profile->inGameInfo->gameName) : '';

    $data = steam_empty_status();
    $data['available'] = true;
    $data['gameName'] = $gameName;
    $data['personaName'] = trim((string) ($profile->steamID ?? ''));
    $data['fetchStatus'] = $stateMessage;
    $data['online'] = in_array($onlineState, ['online', 'in-game'], true) || $stateMessage === 'In-Game';
    $data['display'] = $gameName !== '' && $data['online']
        ? '正在游玩 ' . $gameName
        : ($data['online'] ? '在线' : '离线');
    $data['fetchedAt'] = time();

    return $data;
}

function steam_write_cache(string $steamId, array $data): void
{
    if (!is_dir(DATA_DIR)) {
        @mkdir(DATA_DIR, 0755, true);
    }
    @file_put_contents(
        steam_cache_file(),
        json_encode(
            ['steamId' => $steamId, 'time' => time(), 'data' => $data],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
        LOCK_EX
    );
}

// 启动一次后台刷新：60 秒内只允许一个刷新在跑
function steam_try_refresh(string $steamId, bool $quick = false): void
{
    @touch(steam_refresh_marker());
    $fresh = steam_fetch_status($steamId, $quick);
    if ($fresh !== null) {
        steam_write_cache($steamId, $fresh);
    }
}

function steam_refresh_recently_started(): bool
{
    $marker = steam_refresh_marker();
    if (!is_file($marker)) {
        return false;
    }
    return (time() - (int) @filemtime($marker)) < 60;
}

// 取（并缓存）游戏图标，返回图片二进制内容
function steam_icon_bytes(int $appid, string $hash): string
{
    $cacheDir = DATA_DIR . '/steam_icons';
    $cacheFile = $cacheDir . '/' . $appid . '_' . $hash . '.jpg';

    if (is_file($cacheFile)) {
        $cached = (string) @file_get_contents($cacheFile);
        if ($cached !== '') {
            return $cached;
        }
    }

    $path = '/steamcommunity/public/images/apps/' . $appid . '/' . $hash . '.jpg';
    foreach ([['https://media.steampowered.com' . $path, 6], ['http://media.steampowered.com' . $path, 6]] as [$url, $limit]) {
        $result = steam_http_get($url, $limit);
        if ($result['ok'] && strlen($result['body']) < 500000) {
            if (!is_dir($cacheDir)) {
                @mkdir($cacheDir, 0755, true);
            }
            if (is_dir($cacheDir)) {
                @file_put_contents($cacheFile, $result['body'], LOCK_EX);
            }
            return $result['body'];
        }
    }
    return '';
}


// 先把已有缓存响应给访客，再在后台刷新（仅 PHP-FPM 下有效；CLI/测试环境只返回缓存）
function steam_flush_then_refresh(string $steamId, array $data): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=60');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
        if (!steam_refresh_recently_started()) {
            steam_try_refresh($steamId);
        }
    }
    exit;
}