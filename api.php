<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

define('DATA_DIR', __DIR__ . '/data');
define('UPLOAD_DIR', __DIR__ . '/uploads');
require_once __DIR__ . '/steam.php';

function respond(array $data, int $code = 200, ?int $cacheSeconds = null): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    if ($cacheSeconds === null) {
        header('Cache-Control: no-store, no-cache, must-revalidate');
    } else {
        header('Cache-Control: public, max-age=' . $cacheSeconds);
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json(string $file, array $default = []): array
{
    if (!is_file($file)) {
        return $default;
    }
    $raw = file_get_contents($file);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

function write_json(string $file, array $data): void
{
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents(
        $file,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

function with_file_lock(string $file, callable $callback)
{
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $fp = @fopen($file, 'c+');
    if ($fp === false) {
        return $callback(null);
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return $callback(null);
    }
    try {
        return $callback($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function read_json_from_handle($fp, array $default = []): array
{
    if (!is_resource($fp)) {
        return $default;
    }
    rewind($fp);
    $raw = stream_get_contents($fp);
    if ($raw === false || $raw === '') {
        return $default;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

function write_json_to_handle($fp, array $data): void
{
    if (!is_resource($fp)) {
        return;
    }
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
}

function request_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : [];
}

function client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function ensure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https_request(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function require_https(): void
{
    if (!is_https_request()) {
        respond(['ok' => false, 'error' => '管理操作必须通过 HTTPS 访问'], 403);
    }
}

function require_json_fetch(): void
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($contentType, 'application/json')) {
        respond(['ok' => false, 'error' => '请求格式不正确'], 415);
    }
    if (strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) !== 'xmlhttprequest') {
        respond(['ok' => false, 'error' => '请求来源未通过校验'], 403);
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        $requestHost = (string) ($_SERVER['HTTP_HOST'] ?? '');
        $requestHost = preg_replace('/:\d+$/', '', $requestHost) ?? $requestHost;
        if (!is_string($originHost) || strcasecmp($originHost, $requestHost) !== 0) {
            respond(['ok' => false, 'error' => '请求来源未通过校验'], 403);
        }
    }
}

function rate_limit(string $bucket, int $max, int $window): void
{
    $file = DATA_DIR . '/rate_limits.json';
    $key = hash('sha256', $bucket . '|' . client_ip());
    $now = time();
    $retry = 0;
    with_file_lock($file, function ($fp) use ($file, $key, $max, $window, $now, &$retry) {
        $store = is_resource($fp) ? read_json_from_handle($fp, []) : read_json($file, []);
        $cutoff = $now - $window;
        foreach ($store as $bucketKey => $stamps) {
            if (!is_array($stamps)) {
                unset($store[$bucketKey]);
                continue;
            }
            $fresh = array_values(array_filter(
                $stamps,
                static fn ($stamp): bool => is_int($stamp) && $stamp >= $cutoff
            ));
            if ($fresh) {
                $store[$bucketKey] = $fresh;
            } else {
                unset($store[$bucketKey]);
            }
        }
        $hits = isset($store[$key]) && is_array($store[$key]) ? $store[$key] : [];
        if (count($hits) >= $max) {
            $retry = max(1, ((int) min($hits)) + $window - $now);
            return;
        }
        $hits[] = $now;
        $store[$key] = $hits;
        if (is_resource($fp)) {
            write_json_to_handle($fp, $store);
        } else {
            write_json($file, $store);
        }
    });
    if ($retry > 0) {
        header('Retry-After: ' . $retry);
        respond(['ok' => false, 'error' => '请求过于频繁，请稍后再试'], 429);
    }
}
function clean_text(mixed $value, int $max = 200): string
{
    $text = trim((string) ($value ?? ''));
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max);
    }
    return substr($text, 0, $max);
}

function clean_url(mixed $value): string
{
    $url = trim((string) ($value ?? ''));
    if ($url === '') {
        return '';
    }
    if (!preg_match('#^(https?://|mailto:|/|assets/|uploads/)#i', $url)) {
        return '';
    }
    return $url;
}

function is_admin(): bool
{
    ensure_session();
    return !empty($_SESSION['is_admin']);
}

function require_admin(array $body = []): void
{
    require_https();
    ensure_session();
    if (!is_admin()) {
        respond(['ok' => false, 'error' => '未登录或会话已过期'], 401);
    }
    $token = $body['csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || !hash_equals($_SESSION['csrf'] ?? '', $token)) {
        respond(['ok' => false, 'error' => '请求校验失败，请刷新页面重试'], 403);
    }
}

function default_config(): array
{
    return [
        'brand' => 'Tianying的巢',
        'name' => 'Tianying',
        'intro' => '一个正在慢慢长大的个人小站。',
        'motto' => '月落乌啼霜满天',
        'avatar' => 'assets/img/avatar.webp',
        'background' => 'assets/img/background.webp',
        'github' => 'https://github.com/tianyingAquila',
        'steam' => [
            'id' => '76561199375770516',
            'url' => 'https://steamcommunity.com/profiles/76561199375770516/',
        ],
        'social' => [
            ['name' => 'GitHub', 'url' => 'https://github.com/tianyingAquila', 'icon' => 'github'],
            ['name' => '邮箱', 'url' => 'mailto:tianyingden@163.com', 'icon' => 'mail'],
        ],
        'music' => [
            'title' => 'Ex-Otogibanashi',
            'artist' => 'ryo (supercell) / 夏吉ゆうこ / 早見沙織',
            'src' => 'assets/music/ex-otogibanashi.mp3',
            'cover' => 'assets/img/music-cover.webp',
            'tracks' => [
                [
                    'title' => 'Ex-Otogibanashi',
                    'artist' => 'ryo (supercell) / 夏吉ゆうこ / 早見沙織',
                    'src' => 'assets/music/ex-otogibanashi.mp3',
                ],
                [
                    'title' => 'ワールドイズマイン (かぐや&月見ヤチヨ ver.) [CPK! Remix]',
                    'artist' => 'ryo (supercell) / 夏吉ゆうこ / 早見沙織',
                    'src' => 'assets/music/world-is-mine-cpk-remix.mp3',
                ],
            ],
        ],
        'gallery' => [
            ['src' => 'assets/img/photo1.webp', 'caption' => ''],
            ['src' => 'assets/img/photo2.webp', 'caption' => ''],
            ['src' => 'assets/img/photo3.webp', 'caption' => ''],
        ],
        'icp' => '',
    ];
}

function config_file(): string
{
    return DATA_DIR . '/config.json';
}

function messages_file(): string
{
    return DATA_DIR . '/messages.json';
}

function ms_scores_file(): string
{
    return DATA_DIR . '/ms_scores.json';
}

// 项目页的档案数据：仓库里的 assets/data/archives.json 是种子，
// 后台改过的四个字段（名称/类型/状态/概述）存在 data/archives.json，
// 由 api.php 合并后给前端。data/ 不进 Git、不被 deploy.ps1 覆盖，所以改动不会丢。
function archives_seed_file(): string
{
    return __DIR__ . '/assets/data/archives.json';
}

function archives_override_file(): string
{
    return DATA_DIR . '/archives.json';
}

const ARCHIVE_EDITABLE_KEYS = ['title', 'type', 'status', 'abstract'];

function current_archives(): array
{
    $seed = read_json(archives_seed_file(), []);
    if (!is_array($seed) || !isset($seed['columns']) || !is_array($seed['columns'])) {
        return ['generatedAt' => date('Y-m-d'), 'columns' => []];
    }
    $overrides = read_json(archives_override_file(), []);
    $saved = is_array($overrides['entries'] ?? null) ? $overrides['entries'] : [];
    if (!$saved) {
        return $seed;
    }
    foreach ($seed['columns'] as $ci => $column) {
        if (!isset($column['entries']) || !is_array($column['entries'])) {
            continue;
        }
        foreach ($column['entries'] as $ei => $entry) {
            $id = (string) ($entry['id'] ?? '');
            if ($id === '' || !isset($saved[$id]) || !is_array($saved[$id])) {
                continue;
            }
            foreach (ARCHIVE_EDITABLE_KEYS as $key) {
                if (array_key_exists($key, $saved[$id])) {
                    $seed['columns'][$ci]['entries'][$ei][$key] = (string) $saved[$id][$key];
                }
            }
        }
    }
    return $seed;
}

function current_config(): array
{
    $config = read_json(config_file(), default_config());
    if ($config === []) {
        $config = default_config();
        write_json(config_file(), $config);
    }
    return array_replace_recursive(default_config(), $config);
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {
    case 'config':
        respond(['ok' => true, 'data' => current_config()], 200, 300);

    case 'messages':
        respond(['ok' => true, 'data' => read_json(messages_file(), [])], 200, 60);

    case 'archives':
        respond(['ok' => true, 'data' => current_archives()], 200, 300);

    case 'ms_scores':
        respond(['ok' => true, 'data' => read_json(ms_scores_file(), [])], 200, 60);

    case 'uptime':
        $startedFile = DATA_DIR . '/started_at.txt';
        if (!is_file($startedFile)) {
            @file_put_contents($startedFile, (string) time(), LOCK_EX);
        }
        $startedAt = (int) trim((string) @file_get_contents($startedFile));
        $seconds = $startedAt > 0 ? max(0, time() - $startedAt) : 0;
        respond([
            'ok' => true,
            'data' => [
                'uptimeSeconds' => $seconds,
                'serverTime' => time(),
            ],
        ], 200, 30);

    case 'steam_status':
        $steam = current_config()['steam'] ?? [];
        $steamId = (string) ($steam['id'] ?? '');
        if ($steamId === '') {
            respond(['ok' => false, 'error' => '未配置 Steam ID'], 404);
        }

        // 正常情况下缓存由服务器上的 cron 每 5 分钟刷新一次，这里只负责读取，
        // 所以访客几乎不会等待 Steam 接口。
        $cache = read_json(steam_cache_file(), []);
        $cachedData = is_array($cache['data'] ?? null) ? $cache['data'] : null;
        $cacheOwner = (string) ($cache['steamId'] ?? '');
        $cacheAge = time() - (int) ($cache['time'] ?? 0);

        if ($cachedData !== null && $cacheOwner === $steamId && $cacheAge <= 900) {
            respond(['ok' => true, 'data' => $cachedData], 200, 60);
        }

        if ($cachedData !== null) {
            // 缓存过期：先把旧数据返回给访客，再在后台刷新，避免让访客干等
            steam_flush_then_refresh($steamId, $cachedData);
        }

        // 完全没有缓存（刚部署、cron 还没跑）：同步取一次，预算调短
        $fresh = steam_fetch_status($steamId, true);
        if ($fresh !== null) {
            steam_write_cache($steamId, $fresh);
            respond(['ok' => true, 'data' => $fresh], 200, 60);
        }
        respond(['ok' => true, 'data' => steam_empty_status('状态获取中…')], 200, 30);

    case 'steam_icon':
        $appid = (int) preg_replace('/\D/', '', (string) ($_GET['appid'] ?? ''));
        $hash = strtolower((string) preg_replace('/[^0-9a-f]/i', '', (string) ($_GET['hash'] ?? '')));
        if ($appid <= 0 || !preg_match('/^[0-9a-f]{40}$/', $hash)) {
            http_response_code(404);
            exit;
        }
        rate_limit('steam_icon', 120, 600);
        $steamCache = read_json(steam_cache_file(), []);
        $recentGames = is_array($steamCache['data']['recent'] ?? null) ? $steamCache['data']['recent'] : [];
        $allowed = false;
        foreach ($recentGames as $game) {
            $icon = (string) ($game['icon'] ?? '');
            if ((int) ($game['appid'] ?? 0) === $appid && str_contains($icon, $hash)) {
                $allowed = true;
                break;
            }
        }
        if (!$allowed) {
            http_response_code(404);
            exit;
        }
        $iconBytes = steam_icon_bytes($appid, $hash);
        if ($iconBytes === '') {
            http_response_code(404);
            exit;
        }
        header('Content-Type: image/jpeg');
        header('Content-Length: ' . strlen($iconBytes));
        header('Cache-Control: public, max-age=2592000');
            echo $iconBytes;
        exit;
    case 'message':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        require_json_fetch();
        rate_limit('message', 5, 600);
        $body = request_body();
        $text = clean_text($body['message'] ?? '', 20);
        $name = clean_text($body['name'] ?? '访客', 12);
        if ($text === '') {
            respond(['ok' => false, 'error' => '留言不能为空'], 400);
        }
        if (function_exists('mb_strlen') && mb_strlen($text) > 20) {
            respond(['ok' => false, 'error' => '留言不能超过 20 个字'], 400);
        }
        if (function_exists('mb_strlen') && mb_strlen($name) > 12) {
            respond(['ok' => false, 'error' => '昵称不能超过 12 个字'], 400);
        }
        $messages = with_file_lock(messages_file(), function ($fp) use ($text, $name) {
            $messages = is_resource($fp)
                ? read_json_from_handle($fp, [])
                : read_json(messages_file(), []);
            $message = [
                'id' => bin2hex(random_bytes(6)),
                'name' => $name,
                'text' => $text,
                'time' => time(),
            ];
            array_unshift($messages, $message);
            $messages = array_slice($messages, 0, 5);
            if (is_resource($fp)) {
                write_json_to_handle($fp, $messages);
            } else {
                write_json(messages_file(), $messages);
            }
            return $messages;
        });
        respond(['ok' => true, 'data' => $messages]);

    case 'ms_score':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        require_json_fetch();
        rate_limit('ms_score', 30, 600);
        $body = request_body();
        $name = clean_text($body['name'] ?? '', 12);
        if ($name === '') {
            $name = '匿名玩家';
        }
        $timeMs = (int) ($body['timeMs'] ?? 0);
        if ($timeMs < 1000 || $timeMs > 86400000) {
            respond(['ok' => false, 'error' => '用时不合法'], 400);
        }
        $difficulty = (string) ($body['difficulty'] ?? '');
        if (!in_array($difficulty, ['easy', 'normal', 'hard'], true)) {
            respond(['ok' => false, 'error' => '难度不正确'], 400);
        }
        // 棋盘大小（新版本前端会带；老客户端没有这个字段就存空字符串）
        $size = (string) ($body['size'] ?? '');
        if (!in_array($size, ['small', 'medium', 'large'], true)) {
            $size = '';
        }
        // 只有难度模式的胜利可以进榜，自由模式一律不收。
        if (($body['mode'] ?? '') !== 'tier') {
            respond(['ok' => false, 'error' => '只有难度模式的成绩可以上榜'], 403);
        }
        $rawEffects = $body['effects'] ?? [];
        if (!is_array($rawEffects)) {
            $rawEffects = [];
        }
        $effectIds = [];
        foreach (array_slice($rawEffects, 0, 24) as $rawEffect) {
            $clean = clean_text($rawEffect, 40);
            if ($clean !== '') {
                $effectIds[] = $clean;
            }
        }
        $record = [
            'id' => bin2hex(random_bytes(6)),
            'name' => $name,
            'timeMs' => $timeMs,
            'difficulty' => $difficulty,
            'size' => $size,
            'effects' => $effectIds,
            'createdAt' => time(),
        ];
        $scores = with_file_lock(ms_scores_file(), function ($fp) use ($record) {
            $scores = is_resource($fp)
                ? read_json_from_handle($fp, [])
                : read_json(ms_scores_file(), []);
            array_unshift($scores, $record);
            $scores = array_slice($scores, 0, 200);
            if (is_resource($fp)) {
                write_json_to_handle($fp, $scores);
            } else {
                write_json(ms_scores_file(), $scores);
            }
            return $scores;
        });
        respond(['ok' => true, 'data' => $scores]);

    case 'admin_login':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        require_https();
        ensure_session();
        rate_limit('admin_login', 8, 900);
        $body = request_body();
        $password = (string) ($body['password'] ?? '');
        if (hash_equals(ADMIN_PASSWORD, $password)) {
            session_regenerate_id(true);
            $_SESSION['is_admin'] = true;
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
            respond(['ok' => true, 'csrf' => $_SESSION['csrf']]);
        }
        respond(['ok' => false, 'error' => '密码不正确'], 403);

    case 'admin_state':
        require_https();
        ensure_session();
        if (!is_admin()) {
            respond(['ok' => false, 'error' => '未登录'], 401);
        }
        respond(['ok' => true, 'csrf' => $_SESSION['csrf'] ?? '']);

    case 'admin_logout':
        require_https();
        ensure_session();
        session_destroy();
        respond(['ok' => true]);

    case 'admin_save':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        $body = request_body();
        require_admin($body);
        $input = $body['config'] ?? [];
        if (!is_array($input)) {
            respond(['ok' => false, 'error' => '配置格式不正确'], 400);
        }

        $config = current_config();
        $textKeys = ['brand', 'name', 'intro', 'motto', 'avatar', 'background', 'github', 'icp'];
        foreach ($textKeys as $key) {
            if (array_key_exists($key, $input)) {
                if (in_array($key, ['avatar', 'background', 'github'], true)) {
                    $config[$key] = clean_url($input[$key]);
                } else {
                    $config[$key] = clean_text($input[$key], 500);
                }
            }
        }

        if (isset($input['music']) && is_array($input['music'])) {
            $musicTitle = clean_text($input['music']['title'] ?? '', 100);
            $musicArtist = clean_text($input['music']['artist'] ?? '', 100);
            $musicSrc = clean_url($input['music']['src'] ?? '');
            $musicCover = clean_url($input['music']['cover'] ?? '');
            $config['music']['title'] = $musicTitle;
            $config['music']['artist'] = $musicArtist;
            $config['music']['src'] = $musicSrc;
            $config['music']['cover'] = $musicCover;
            if (isset($config['music']['tracks']) && is_array($config['music']['tracks']) && isset($config['music']['tracks'][0]) && is_array($config['music']['tracks'][0])) {
                $config['music']['tracks'][0]['title'] = $musicTitle;
                $config['music']['tracks'][0]['artist'] = $musicArtist;
                $config['music']['tracks'][0]['src'] = $musicSrc;
            }
        }

        if (isset($input['social']) && is_array($input['social'])) {
            $social = [];
            foreach ($input['social'] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $social[] = [
                    'name' => clean_text($item['name'] ?? '', 30),
                    'url' => clean_url($item['url'] ?? ''),
                    'icon' => clean_text($item['icon'] ?? '', 30),
                ];
            }
            $config['social'] = $social;
        }

        write_json(config_file(), $config);
        respond(['ok' => true, 'data' => $config]);

    case 'archive_save':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        $body = request_body();
        require_admin($body);
        $input = $body['entries'] ?? [];
        if (!is_array($input)) {
            respond(['ok' => false, 'error' => '数据格式不正确'], 400);
        }
        // 只认种子数据里真实存在的 P- 档案，虚拟档案与提交记录一概不动
        $seed = read_json(archives_seed_file(), []);
        $known = [];
        foreach ($seed['columns'] ?? [] as $column) {
            foreach ($column['entries'] ?? [] as $entry) {
                $id = (string) ($entry['id'] ?? '');
                if ($id !== '' && str_starts_with($id, 'P-')) {
                    $known[$id] = true;
                }
            }
        }
        $entries = [];
        foreach ($input as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = clean_text($item['id'] ?? '', 20);
            if (!isset($known[$id])) {
                continue;
            }
            $entries[$id] = [
                'title' => clean_text($item['title'] ?? '', 120),
                'type' => clean_text($item['type'] ?? '', 40),
                'status' => clean_text($item['status'] ?? '', 40),
                'abstract' => clean_text($item['abstract'] ?? '', 600),
            ];
        }
        if (!$entries) {
            respond(['ok' => false, 'error' => '没有可保存的项目档案'], 400);
        }
        write_json(archives_override_file(), [
            'updatedAt' => date('Y-m-d H:i:s'),
            'entries' => $entries,
        ]);
        respond(['ok' => true, 'data' => current_archives()]);

    case 'upload':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        require_admin($_POST);
        $type = (string) ($_POST['type'] ?? '');
        if (!in_array($type, ['avatar', 'background', 'music', 'music-cover', 'gallery'], true)) {
            respond(['ok' => false, 'error' => '未知的上传类型'], 400);
        }
        if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
            respond(['ok' => false, 'error' => '没有收到文件'], 400);
        }
        $file = $_FILES['file'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            respond(['ok' => false, 'error' => '文件上传失败'], 400);
        }
        if (($file['size'] ?? 0) > MAX_UPLOAD_BYTES) {
            respond(['ok' => false, 'error' => '文件超过大小限制'], 400);
        }

        $original = (string) ($file['name'] ?? '');
        $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        if ($type === 'music') {
            $allowed = AUDIO_EXTENSIONS;
        } else {
            $allowed = IMAGE_EXTENSIONS;
        }
        if (!in_array($extension, $allowed, true)) {
            respond(['ok' => false, 'error' => '不支持的文件类型：' . $extension], 400);
        }

        if ($type === 'music') {
            if (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mime = $finfo ? (string) finfo_file($finfo, $file['tmp_name']) : '';
                if ($finfo) {
                    finfo_close($finfo);
                }
                $allowedMime = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'video/mp4'];
                if ($mime !== '' && !in_array($mime, $allowedMime, true)) {
                    respond(['ok' => false, 'error' => '音频内容与扩展名不匹配'], 415);
                }
            }
        } elseif (@getimagesize($file['tmp_name']) === false) {
            respond(['ok' => false, 'error' => '图片内容无效'], 415);
        }

        if (!is_dir(UPLOAD_DIR)) {
            mkdir(UPLOAD_DIR, 0755, true);
        }
        $name = $type . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(3)) . '.' . $extension;
        $target = UPLOAD_DIR . '/' . $name;
        if (!move_uploaded_file($file['tmp_name'], $target)) {
            respond(['ok' => false, 'error' => '保存文件失败'], 500);
        }
        chmod($target, 0644);

        $config = current_config();
        $relative = 'uploads/' . $name;
        if ($type === 'avatar') {
            $config['avatar'] = $relative;
        } elseif ($type === 'background') {
            $config['background'] = $relative;
        } elseif ($type === 'music') {
            $config['music']['src'] = $relative;
            if (isset($config['music']['tracks']) && is_array($config['music']['tracks']) && isset($config['music']['tracks'][0]) && is_array($config['music']['tracks'][0])) {
                $config['music']['tracks'][0]['src'] = $relative;
            }
        } elseif ($type === 'music-cover') {
            $config['music']['cover'] = $relative;
        } elseif ($type === 'gallery') {
            $config['gallery'][] = [
                'src' => $relative,
                'caption' => clean_text($_POST['caption'] ?? '随手拍', 100),
            ];
        }
        write_json(config_file(), $config);
        respond(['ok' => true, 'data' => $config, 'file' => $relative]);

    case 'delete_image':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        $body = request_body();
        require_admin($body);
        $src = (string) ($body['src'] ?? '');
        $config = current_config();
        $found = false;
        $config['gallery'] = array_values(array_filter($config['gallery'], function ($item) use ($src, &$found) {
            if (($item['src'] ?? '') === $src) {
                $found = true;
                return false;
            }
            return true;
        }));
        if ($found) {
            write_json(config_file(), $config);
            $path = realpath(UPLOAD_DIR . '/' . basename($src));
            if ($path && str_starts_with($path, realpath(UPLOAD_DIR) . DIRECTORY_SEPARATOR) && is_file($path)) {
                @unlink($path);
            }
            respond(['ok' => true, 'data' => $config]);
        }
        respond(['ok' => false, 'error' => '没有找到这张图片'], 404);

    case 'delete_message':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        $body = request_body();
        require_admin($body);
        $id = (string) ($body['id'] ?? '');
        $messages = with_file_lock(messages_file(), function ($fp) use ($id) {
            $messages = is_resource($fp)
                ? read_json_from_handle($fp, [])
                : read_json(messages_file(), []);
            $messages = array_values(array_filter($messages, function ($item) use ($id) {
                return ($item['id'] ?? '') !== $id;
            }));
            if (is_resource($fp)) {
                write_json_to_handle($fp, $messages);
            } else {
                write_json(messages_file(), $messages);
            }
            return $messages;
        });
        respond(['ok' => true, 'data' => $messages]);

    default:
        respond(['ok' => false, 'error' => '未知操作'], 404);
}
