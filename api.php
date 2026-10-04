<?php
declare(strict_types=1);

// API 永远输出纯 JSON；PHP 警告只写日志，不能混进响应。
ini_set('display_errors', '0');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

set_exception_handler(static function (Throwable $error): void {
    error_log('API: ' . $error->getMessage());
    respond(['ok' => false, 'error' => '数据读取或保存失败，请稍后重试；原有数据不会被默认内容覆盖'], 500);
});

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

// 塔防记录榜。地图的总波数要和前端 config.js 保持一致。
function td_scores_file(): string
{
    return DATA_DIR . '/td_scores.json';
}

const TD_MAP_WAVES = [1 => 18, 2 => 18, 3 => 20, 4 => 20];
const TD_MAP_SIZE = [1 => [15, 11], 2 => [15, 11], 3 => [20, 11], 4 => [20, 11]];
const TD_MAP_TOWERS = [
    1 => ['bolt', 'mortar', 'frost', 'rail'],
    2 => ['bolt', 'mortar', 'frost', 'rail', 'aura'],
    3 => ['bolt', 'mortar', 'frost', 'rail', 'aura', 'chain'],
    4 => ['bolt', 'inferno', 'frost', 'rail', 'aura', 'chain'],
];

const TD_CURRENT_VERSION = 'v1.06';
const TD_CURRENT_REVISION = 0;
const TD_REPLAY_MAX_ACTIONS = 2000;
const TD_REPLAY_MAX_TICKS = 216000; // 游戏内 1 小时，足够覆盖正常局并限制异常日志。
const TD_REPLAY_TIME_TOLERANCE_MS = 2000;

// 最终部署允许为空（例如把塔全拆了），但不接受非法塔种、越界坐标、重复格或未知等级。
function normalize_td_deployment($raw, int $map): ?array
{
    if (!is_array($raw) || count($raw) > 120 || !isset(TD_MAP_SIZE[$map], TD_MAP_TOWERS[$map])) {
        return null;
    }
    [$cols, $rows] = TD_MAP_SIZE[$map];
    $allowed = TD_MAP_TOWERS[$map];
    $seen = [];
    $out = [];
    foreach ($raw as $item) {
        if (!is_array($item)) {
            return null;
        }
        $type = (string) ($item['type'] ?? '');
        $c = filter_var($item['c'] ?? null, FILTER_VALIDATE_INT);
        $r = filter_var($item['r'] ?? null, FILTER_VALIDATE_INT);
        $level = filter_var($item['level'] ?? null, FILTER_VALIDATE_INT);
        if (!in_array($type, $allowed, true) || $c === false || $r === false || $level === false) {
            return null;
        }
        if ($c < 0 || $c >= $cols || $r < 0 || $r >= $rows || $level < 1 || $level > 3) {
            return null;
        }
        $key = $c . ',' . $r;
        if (isset($seen[$key])) {
            return null;
        }
        $seen[$key] = true;
        $out[] = ['type' => $type, 'c' => $c, 'r' => $r, 'level' => $level];
    }
    return $out;
}

function public_td_score(array $score): array
{
    // 旧成绩没有版本字段，统一视为 v1.01；未来新成绩由服务端写入当前版本。
    if (!isset($score['version']) || !is_string($score['version']) || $score['version'] === '') {
        $score['version'] = 'v1.01';
    }
    if (!array_key_exists('hasReplay', $score)) {
        $score['hasReplay'] = false;
    }
    if (!isset($score['replayStatus']) || !is_string($score['replayStatus'])) {
        $score['replayStatus'] = 'none';
    }
    unset($score['deployment'], $score['actions'], $score['replayResult'], $score['submissionId'], $score['dedupeKey'], $score['replayBackfilledAt']);
    return $score;
}

function public_td_scores(array $scores): array
{
    return array_map('public_td_score', $scores);
}

function normalize_td_actions($raw, int $map): ?array
{
    if (!is_array($raw) || count($raw) > TD_REPLAY_MAX_ACTIONS || !isset(TD_MAP_SIZE[$map], TD_MAP_TOWERS[$map])) {
        return null;
    }
    [$cols, $rows] = TD_MAP_SIZE[$map];
    $allowedTowers = TD_MAP_TOWERS[$map];
    $allowedOps = ['start', 'build', 'upgrade', 'sell', 'wave', 'speed', 'pause', 'resume'];
    $lastTick = -1;
    $out = [];

    foreach ($raw as $item) {
        if (!is_array($item)) {
            return null;
        }
        $tick = filter_var($item['tick'] ?? null, FILTER_VALIDATE_INT);
        $op = (string) ($item['op'] ?? '');
        if ($tick === false || $tick < 0 || $tick > TD_REPLAY_MAX_TICKS || $tick < $lastTick) {
            return null;
        }
        if (!in_array($op, $allowedOps, true)) {
            return null;
        }
        $action = ['tick' => $tick, 'op' => $op];
        if (array_key_exists('timeMs', $item)) {
            $timeMs = filter_var($item['timeMs'], FILTER_VALIDATE_INT);
            if ($timeMs === false || $timeMs < 0 || $timeMs > 14400000) {
                return null;
            }
            $action['timeMs'] = $timeMs;
        }

        if ($op === 'build') {
            $type = (string) ($item['type'] ?? '');
            $c = filter_var($item['c'] ?? null, FILTER_VALIDATE_INT);
            $r = filter_var($item['r'] ?? null, FILTER_VALIDATE_INT);
            if (!in_array($type, $allowedTowers, true) || $c === false || $r === false || $c < 0 || $c >= $cols || $r < 0 || $r >= $rows) {
                return null;
            }
            $action += ['type' => $type, 'c' => $c, 'r' => $r];
        } elseif ($op === 'upgrade' || $op === 'sell') {
            $c = filter_var($item['c'] ?? null, FILTER_VALIDATE_INT);
            $r = filter_var($item['r'] ?? null, FILTER_VALIDATE_INT);
            if ($c === false || $r === false || $c < 0 || $c >= $cols || $r < 0 || $r >= $rows) {
                return null;
            }
            $action += ['c' => $c, 'r' => $r];
        } elseif ($op === 'speed') {
            $speed = filter_var($item['speed'] ?? null, FILTER_VALIDATE_INT);
            if ($speed === false || !in_array($speed, [1, 2], true)) {
                return null;
            }
            $action['speed'] = $speed;
        }
        $out[] = $action;
        $lastTick = $tick;
    }
    return $out;
}

function find_td_duplicate(array $scores, array $record): ?array
{
    $submissionId = (string) ($record['submissionId'] ?? '');
    $dedupeKey = (string) ($record['dedupeKey'] ?? '');
    $createdAt = (int) ($record['createdAt'] ?? time());
    foreach ($scores as $score) {
        if (!is_array($score)) {
            continue;
        }
        if ($submissionId !== '' && ($score['submissionId'] ?? '') === $submissionId) {
            return $score;
        }
        if ($dedupeKey !== '' && ($score['dedupeKey'] ?? '') === $dedupeKey && abs($createdAt - (int) ($score['createdAt'] ?? 0)) <= 600) {
            return $score;
        }
    }
    return null;
}

// 一次性 Node CLI 复核。服务端不常驻进程、不开端口；出错一律返回 null，
// 由调用方记为“回放暂不可用”，绝不因此标红。
function run_td_replay_check(array $payload): ?array
{
    $runner = __DIR__ . '/tools/td_replay_runner.js';
    if (!is_file($runner) || !function_exists('proc_open')) {
        return ['ok' => false, 'error' => 'runner unavailable'];
    }
    $node = '/usr/bin/node';
    $cmd = [$node, '--max-old-space-size=128', $runner];
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $pipes = [];
    $proc = @proc_open($cmd, $descriptors, $pipes, __DIR__);
    if (!is_resource($proc)) {
        return ['ok' => false, 'error' => 'proc_open failed'];
    }

    fwrite($pipes[0], json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}');
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $stdout = '';
    $stderr = '';
    $timedOut = false;
    $deadline = microtime(true) + 12.0;
    while (true) {
        $stdout .= stream_get_contents($pipes[1]);
        $stderr .= stream_get_contents($pipes[2]);
        $status = proc_get_status($proc);
        if (!$status['running']) {
            break;
        }
        if (microtime(true) >= $deadline) {
            $timedOut = true;
            @proc_terminate($proc, 9);
            break;
        }
        usleep(50000);
    }
    $stdout .= stream_get_contents($pipes[1]);
    $stderr .= stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    @proc_close($proc);

    if ($timedOut) {
        return ['ok' => false, 'error' => 'timeout', 'stderr' => $stderr];
    }
    if ($stdout === '') {
        return ['ok' => false, 'error' => 'empty stdout', 'stderr' => $stderr];
    }
    $decoded = json_decode($stdout, true);
    return is_array($decoded) ? $decoded : ['ok' => false, 'error' => 'invalid json', 'stdout' => $stdout, 'stderr' => $stderr];
}

function td_rank_for_id(array $scores, string $id): array
{
    $target = null;
    foreach ($scores as $score) {
        if (($score['id'] ?? '') === $id) {
            $target = $score;
            break;
        }
    }
    if ($target === null) {
        return ['rank' => 0, 'total' => 0];
    }
    $map = (int) ($target['map'] ?? 0);
    $ofMap = array_values(array_filter($scores, static fn ($s): bool => (int) ($s['map'] ?? 0) === $map));
    usort($ofMap, static fn ($a, $b): int =>
        [$b['wave'], $b['lives'], $a['timeMs']] <=> [$a['wave'], $a['lives'], $b['timeMs']]);
    foreach ($ofMap as $index => $score) {
        if (($score['id'] ?? '') === $id) {
            return ['rank' => $index + 1, 'total' => count($ofMap)];
        }
    }
    return ['rank' => 0, 'total' => count($ofMap)];
}

function admin_td_questions(array $scores): array
{
    $questions = array_values(array_filter(
        $scores,
        static fn ($score): bool => ($score['replayStatus'] ?? '') === 'question'
    ));
    usort($questions, static fn ($a, $b): int => (int) ($b['createdAt'] ?? 0) <=> (int) ($a['createdAt'] ?? 0));
    return array_map(static function (array $score) use ($scores): array {
        $rank = td_rank_for_id($scores, (string) ($score['id'] ?? ''));
        return [
            'id' => (string) ($score['id'] ?? ''),
            'name' => (string) ($score['name'] ?? '匿名玩家'),
            'map' => (int) ($score['map'] ?? 0),
            'wave' => (int) ($score['wave'] ?? 0),
            'total' => (int) ($score['total'] ?? 0),
            'lives' => (int) ($score['lives'] ?? 0),
            'timeMs' => (int) ($score['timeMs'] ?? 0),
            'version' => (string) ($score['version'] ?? TD_CURRENT_VERSION),
            'createdAt' => (int) ($score['createdAt'] ?? 0),
            'rank' => $rank['rank'],
            'rankTotal' => $rank['total'],
        ];
    }, $questions);
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
    return merge_config(default_config(), read_json(config_file(), []));
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {
    case 'config':
        respond(['ok' => true, 'data' => current_config()]);

    case 'messages':
        respond(['ok' => true, 'data' => read_json(messages_file(), [])]);

    case 'archives':
        respond(['ok' => true, 'data' => current_archives()]);

    case 'ms_scores':
        respond(['ok' => true, 'data' => read_json(ms_scores_file(), [])]);

    case 'td_scores':
        respond(['ok' => true, 'data' => public_td_scores(read_json(td_scores_file(), []))]);

    case 'td_deployment':
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{12}$/', $id)) {
            respond(['ok' => false, 'error' => '记录编号不正确'], 400);
        }
        foreach (read_json(td_scores_file(), []) as $score) {
            if (($score['id'] ?? '') !== $id) {
                continue;
            }
            if (($score['hasDeployment'] ?? false) !== true || !is_array($score['deployment'] ?? null)) {
                respond(['ok' => false, 'error' => '这条记录没有部署详情'], 404);
            }
            respond([
                'ok' => true,
                'data' => [
                    'id' => $id,
                    'map' => (int) ($score['map'] ?? 0),
                    'deployment' => $score['deployment'],
                ],
            ], 200, 300);
        }
        respond(['ok' => false, 'error' => '找不到这条记录'], 404);

    case 'td_replay':
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{12}$/', $id)) {
            respond(['ok' => false, 'error' => '记录编号不正确'], 400);
        }
        foreach (read_json(td_scores_file(), []) as $score) {
            if (($score['id'] ?? '') !== $id) {
                continue;
            }
            if (($score['hasReplay'] ?? false) !== true || !is_array($score['actions'] ?? null)) {
                respond(['ok' => false, 'error' => '这条记录没有动作回放'], 404);
            }
            respond([
                'ok' => true,
                'data' => [
                    'id' => $id,
                    'name' => (string) ($score['name'] ?? '匿名玩家'),
                    'map' => (int) ($score['map'] ?? 0),
                    'version' => (string) ($score['version'] ?? 'v1.01'),
                    'revision' => (int) ($score['revision'] ?? 0),
                    'wave' => (int) ($score['wave'] ?? 0),
                    'total' => (int) ($score['total'] ?? 0),
                    'lives' => (int) ($score['lives'] ?? 0),
                    'won' => ($score['won'] ?? false) === true,
                    'timeMs' => (int) ($score['timeMs'] ?? 0),
                    'replayStatus' => (string) ($score['replayStatus'] ?? 'verified'),
                    'actions' => $score['actions'],
                ],
            ], 200, 300);
        }
        respond(['ok' => false, 'error' => '找不到这条记录'], 404);

    case 'td_score':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        require_json_fetch();
        rate_limit('td_score', 30, 600);
        $body = request_body();

        $version = trim((string) ($body['version'] ?? ''));
        if ($version !== TD_CURRENT_VERSION) {
            respond(['ok' => false, 'error' => '游戏版本已更新，请刷新页面后重试'], 409);
        }
        $revision = (int) ($body['revision'] ?? 0);
        if ($revision < 0 || $revision > TD_CURRENT_REVISION) {
            respond(['ok' => false, 'error' => '规则快照不正确'], 400);
        }

        $name = clean_text($body['name'] ?? '', 12);
        if ($name === '') {
            $name = '匿名玩家';
        }
        $map = (int) ($body['map'] ?? 0);
        if (!isset(TD_MAP_WAVES[$map])) {
            respond(['ok' => false, 'error' => '地图不正确'], 400);
        }
        $total = TD_MAP_WAVES[$map];
        $wave = (int) ($body['wave'] ?? 0);
        $lives = (int) ($body['lives'] ?? -1);
        $won = ($body['won'] ?? false) === true;
        $timeMs = (int) ($body['timeMs'] ?? 0);
        foreach (['gold', 'kills', 'leaked', 'built'] as $field) {
            if (!array_key_exists($field, $body)) {
                respond(['ok' => false, 'error' => '成绩数据不完整，请刷新页面后重试'], 400);
            }
        }
        $gold = (int) $body['gold'];
        $kills = (int) $body['kills'];
        $leaked = (int) $body['leaked'];
        $built = (int) $body['built'];
        if ($gold < 0 || $gold > 10000000 || $kills < 0 || $kills > 100000 || $leaked < 0 || $leaked > 100000 || $built < 0 || $built > 5000) {
            respond(['ok' => false, 'error' => '成绩数据不合法'], 400);
        }

        if (!array_key_exists('deployment', $body)) {
            respond(['ok' => false, 'error' => '缺少最终部署数据'], 400);
        }
        $deployment = normalize_td_deployment($body['deployment'], $map);
        if ($deployment === null) {
            respond(['ok' => false, 'error' => '部署数据不合法'], 400);
        }

        $actions = null;
        $hasReplay = false;
        if ($won) {
            if (!array_key_exists('actions', $body)) {
                respond(['ok' => false, 'error' => '缺少动作回放数据'], 400);
            }
            $actions = normalize_td_actions($body['actions'], $map);
            if ($actions === null) {
                respond(['ok' => false, 'error' => '动作回放数据不合法'], 400);
            }
            $hasReplay = true;
        }

        if ($wave < 1 || $wave > $total || $lives < 0 || $lives > 20) {
            respond(['ok' => false, 'error' => '成绩数据不合法'], 400);
        }
        if ($won && ($wave !== $total || $lives < 1)) {
            respond(['ok' => false, 'error' => '成绩数据不合法'], 400);
        }
        if (!$won && $lives !== 0) {
            respond(['ok' => false, 'error' => '成绩数据不合法'], 400);
        }
        if ($timeMs < $wave * 3000 || $timeMs > 14400000) {
            respond(['ok' => false, 'error' => '用时不合法'], 400);
        }

        $submissionId = strtolower(trim((string) ($body['submissionId'] ?? '')));
        if ($submissionId !== '' && !preg_match('/^[a-f0-9-]{16,64}$/', $submissionId)) {
            respond(['ok' => false, 'error' => '提交编号不正确'], 400);
        }
        if ($submissionId === '') {
            // 兼容旧页面：没有提交编号时仍生成一个，主要依靠内容指纹防重。
            $submissionId = bin2hex(random_bytes(12));
        }
        $dedupeKey = hash('sha256', json_encode([
            'version' => TD_CURRENT_VERSION,
            'revision' => $revision,
            'name' => $name,
            'map' => $map,
            'wave' => $wave,
            'lives' => $lives,
            'gold' => $gold,
            'kills' => $kills,
            'leaked' => $leaked,
            'built' => $built,
            'won' => $won,
            'timeMs' => $timeMs,
            'deployment' => $deployment,
            'actions' => $actions ?? [],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');

        $record = [
            'id' => bin2hex(random_bytes(6)),
            'name' => $name,
            'version' => TD_CURRENT_VERSION,
            'revision' => $revision,
            'map' => $map,
            'wave' => $wave,
            'total' => $total,
            'lives' => $lives,
            'gold' => $gold,
            'kills' => $kills,
            'leaked' => $leaked,
            'built' => $built,
            'won' => $won,
            'timeMs' => $timeMs,
            'createdAt' => time(),
            'submissionId' => $submissionId,
            'dedupeKey' => $dedupeKey,
            'hasDeployment' => true,
            'deployment' => $deployment,
            'hasReplay' => $hasReplay,
            'replayStatus' => 'none',
        ];
        $currentScores = read_json(td_scores_file(), []);
        if (find_td_duplicate($currentScores, $record) !== null) {
            respond(['ok' => true, 'duplicate' => true, 'data' => public_td_scores($currentScores)]);
        }

        if ($hasReplay) {
            $record['actions'] = $actions;
            $check = run_td_replay_check([
                'version' => TD_CURRENT_VERSION,
                'revision' => $revision,
                'map' => $map,
                'wave' => $wave,
                'lives' => $lives,
                'gold' => $gold,
                'kills' => $kills,
                'leaked' => $leaked,
                'built' => $built,
                'won' => $won,
                'timeMs' => $timeMs,
                'deployment' => $deployment,
                'actions' => $actions,
                'maxTicks' => TD_REPLAY_MAX_TICKS,
            ]);
            if (is_array($check) && ($check['ok'] ?? false) === true) {
                $record['replayStatus'] = !empty($check['question']) ? 'question' : 'verified';
                $record['replayResult'] = [
                    'expectedTimeMs' => (int) ($check['expectedTimeMs'] ?? 0),
                    'mismatches' => array_values(array_filter((array) ($check['mismatches'] ?? []), 'is_string')),
                    'failedActions' => (int) ($check['failedActions'] ?? 0),
                ];
            } else {
                $record['replayStatus'] = 'unavailable';
                $record['replayResult'] = [
                    'error' => (string) (($check['error'] ?? 'replay unavailable')),
                    'stderr' => (string) (($check['stderr'] ?? '')),
                ];
            }
        }

        $saved = with_file_lock(td_scores_file(), function ($fp) use ($record) {
            $scores = is_resource($fp)
                ? read_json_from_handle($fp, [])
                : read_json(td_scores_file(), []);
            if (find_td_duplicate($scores, $record) !== null) {
                return ['scores' => $scores, 'duplicate' => true];
            }
            array_unshift($scores, $record);
            // 最多留 300 条；超出时删最旧的，但每张图排行前 20 名永远保留，免得好成绩被刷掉。
            if (count($scores) > 300) {
                $keep = [];
                foreach (array_keys(TD_MAP_WAVES) as $m) {
                    $ofMap = array_values(array_filter($scores, static fn ($s): bool => (int) ($s['map'] ?? 0) === $m));
                    usort($ofMap, static fn ($a, $b): int =>
                        [$b['wave'], $b['lives'], $a['timeMs']] <=> [$a['wave'], $a['lives'], $b['timeMs']]);
                    foreach (array_slice($ofMap, 0, 20) as $s) {
                        $keep[$s['id']] = true;
                    }
                }
                $out = [];
                foreach ($scores as $s) {
                    if (count($out) < 300 || isset($keep[$s['id']])) {
                        $out[] = $s;
                    }
                }
                $scores = $out;
            }
            if (is_resource($fp)) {
                write_json_to_handle($fp, $scores);
            } else {
                write_json(td_scores_file(), $scores);
            }
            return ['scores' => $scores, 'duplicate' => false];
        });
        respond([
            'ok' => true,
            'duplicate' => !empty($saved['duplicate']),
            'data' => public_td_scores(is_array($saved['scores'] ?? null) ? $saved['scores'] : []),
        ]);

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
        $submissionId = strtolower(trim((string) ($body['submissionId'] ?? '')));
        if ($submissionId !== '' && !preg_match('/^[a-f0-9-]{16,64}$/', $submissionId)) {
            respond(['ok' => false, 'error' => '提交编号不正确'], 400);
        }
        if ($submissionId !== '') { $record['submissionId'] = $submissionId; }
        $scores = with_file_lock(ms_scores_file(), function ($fp) use ($record) {
            $scores = is_resource($fp)
                ? read_json_from_handle($fp, [])
                : read_json(ms_scores_file(), []);
            foreach ($scores as $score) {
                if (!empty($record['submissionId']) && ($score['submissionId'] ?? '') === $record['submissionId']) {
                    return $scores;
                }
            }
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

        $config = with_file_lock(config_file(), function ($fp) use ($input) {
            $config = merge_config(default_config(), read_json_from_handle($fp, []));
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
            if (array_key_exists('github', $input)) {
                foreach ($config['social'] as &$socialItem) {
                    if (($socialItem['icon'] ?? '') === 'github' || ($socialItem['name'] ?? '') === 'GitHub') {
                        $socialItem['url'] = $config['github'];
                    }
                }
                unset($socialItem);
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

            write_json_to_handle($fp, $config);
            return $config;
        });
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
        if (!in_array($type, ['avatar', 'background', 'music', 'music-cover'], true)) {
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

        $relative = 'uploads/' . $name;
        $config = with_file_lock(config_file(), function ($fp) use ($type, $relative) {
            $config = merge_config(default_config(), read_json_from_handle($fp, []));
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
            }
            write_json_to_handle($fp, $config);
            return $config;
        });
        respond(['ok' => true, 'data' => $config, 'file' => $relative]);

    case 'delete_image':
        respond(['ok' => false, 'error' => '照片管理已取消'], 410);

    case 'admin_td_questions':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        $body = request_body();
        require_admin($body);
        $scores = read_json(td_scores_file(), []);
        respond(['ok' => true, 'data' => admin_td_questions($scores)]);

    case 'admin_td_delete':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
        $body = request_body();
        require_admin($body);
        $id = (string) ($body['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{12}$/', $id)) {
            respond(['ok' => false, 'error' => '记录编号不正确'], 400);
        }
        $deleteError = '';
        $scores = with_file_lock(td_scores_file(), function ($fp) use ($id, &$deleteError) {
            $scores = is_resource($fp)
                ? read_json_from_handle($fp, [])
                : read_json(td_scores_file(), []);
            $found = false;
            $isQuestion = false;
            $out = [];
            foreach ($scores as $score) {
                if (($score['id'] ?? '') === $id) {
                    $found = true;
                    $isQuestion = ($score['replayStatus'] ?? '') === 'question';
                    if ($isQuestion) {
                        continue;
                    }
                }
                $out[] = $score;
            }
            if (!$found) {
                $deleteError = '找不到这条记录';
                return $scores;
            }
            if (!$isQuestion) {
                $deleteError = '只能删除疑问记录';
                return $scores;
            }
            if (is_resource($fp)) {
                write_json_to_handle($fp, $out);
            } else {
                write_json(td_scores_file(), $out);
            }
            return $out;
        });
        if ($deleteError !== '') {
            respond(['ok' => false, 'error' => $deleteError], 404);
        }
        respond(['ok' => true, 'data' => admin_td_questions($scores)]);

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
