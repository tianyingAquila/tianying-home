<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/config.php';

define('DATA_DIR', __DIR__ . '/data');
define('UPLOAD_DIR', __DIR__ . '/uploads');

function respond(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
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
    return !empty($_SESSION['is_admin']);
}

function require_admin(array $body = []): void
{
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
        'avatar' => 'assets/img/avatar.svg',
        'background' => '',
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
            'title' => '未命名曲目',
            'artist' => 'Tianying',
            'src' => 'assets/music/track.wav',
            'cover' => 'assets/img/music-cover.svg',
        ],
        'projects' => [
            [
                'title' => 'GitHub 主页',
                'description' => '我的代码和开源项目都放在这里。',
                'url' => 'https://github.com/tianyingAquila',
                'tags' => ['GitHub'],
            ],
            [
                'title' => '天鹰个人网站',
                'description' => '你现在看到的这个网站。',
                'url' => '#',
                'tags' => ['网站'],
            ],
        ],
        'gallery' => [
            ['src' => 'assets/img/photo1.svg', 'caption' => '示例照片 1'],
            ['src' => 'assets/img/photo2.svg', 'caption' => '示例照片 2'],
            ['src' => 'assets/img/photo3.svg', 'caption' => '示例照片 3'],
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

function current_config(): array
{
    $config = read_json(config_file(), default_config());
    if ($config === []) {
        $config = default_config();
        write_json(config_file(), $config);
    }
    return array_replace_recursive(default_config(), $config);
}

function fetch_url(string $url, int $timeout = 8): string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Tianying-Home; +https://github.com/tianyingAquila/tianying-home)',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return $body !== false && $code < 400 ? (string) $body : '';
    }

    $context = stream_context_create([
        'http' => ['timeout' => $timeout, 'header' => "User-Agent: Mozilla/5.0\r\n"],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
    ]);
    $body = @file_get_contents($url, false, $context);
    return $body === false ? '' : (string) $body;
}

function parse_steam_status(string $xml): array
{
    $data = [
        'available' => false,
        'online' => false,
        'display' => '状态暂不可用',
        'gameName' => '',
    ];

    $previous = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml);
    libxml_use_internal_errors($previous);
    if ($doc === false || !isset($doc->profile)) {
        return $data;
    }

    $profile = $doc->profile;
    $onlineState = strtolower(trim((string) ($profile->onlineState ?? '')));
    $stateMessage = trim((string) ($profile->stateMessage ?? ''));
    $gameName = isset($profile->inGameInfo) ? trim((string) $profile->inGameInfo->gameName) : '';

    $data['available'] = true;
    $data['online'] = in_array($onlineState, ['online', 'in-game'], true) || $stateMessage === 'In-Game';
    $data['gameName'] = $gameName;

    if ($gameName !== '' && ($stateMessage === 'In-Game' || $onlineState === 'in-game')) {
        $data['display'] = '正在游玩 ' . $gameName;
    } elseif ($data['online']) {
        $data['display'] = '在线';
    } elseif (in_array($onlineState, ['away', 'snooze'], true)) {
        $data['display'] = '离开';
    } elseif ($onlineState === 'busy') {
        $data['display'] = '忙碌';
    } else {
        $data['display'] = '离线';
    }

    return $data;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {
    case 'config':
        respond(['ok' => true, 'data' => current_config()]);

    case 'messages':
        respond(['ok' => true, 'data' => read_json(messages_file(), [])]);

    case 'ms_scores':
        respond(['ok' => true, 'data' => read_json(ms_scores_file(), [])]);

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
        ]);

    case 'steam_status':
        $steam = current_config()['steam'] ?? [];
        $steamId = (string) ($steam['id'] ?? '');
        if ($steamId === '') {
            respond(['ok' => false, 'error' => '未配置 Steam ID'], 404);
        }

        $cacheFile = DATA_DIR . '/steam_status.json';
        $cache = read_json($cacheFile, []);
        if (($cache['steamId'] ?? '') === $steamId && ($cache['time'] ?? 0) > time() - 300) {
            respond(['ok' => true, 'data' => $cache['data']]);
        }

        $xml = fetch_url('https://steamcommunity.com/profiles/' . rawurlencode($steamId) . '/?xml=1');
        $data = $xml === '' ? [
            'available' => false,
            'online' => false,
            'display' => '状态暂不可用',
            'gameName' => '',
        ] : parse_steam_status($xml);

        write_json($cacheFile, [
            'steamId' => $steamId,
            'time' => time(),
            'data' => $data,
        ]);
        respond(['ok' => true, 'data' => $data]);

    case 'message':
        if ($method !== 'POST') {
            respond(['ok' => false, 'error' => '只接受 POST 请求'], 405);
        }
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
        if (!is_admin()) {
            respond(['ok' => false, 'error' => '未登录'], 401);
        }
        respond(['ok' => true, 'csrf' => $_SESSION['csrf'] ?? '']);

    case 'admin_logout':
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
            $config['music']['title'] = clean_text($input['music']['title'] ?? '', 100);
            $config['music']['artist'] = clean_text($input['music']['artist'] ?? '', 100);
            $config['music']['src'] = clean_url($input['music']['src'] ?? '');
            $config['music']['cover'] = clean_url($input['music']['cover'] ?? '');
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

        if (isset($input['projects']) && is_array($input['projects'])) {
            $projects = [];
            foreach ($input['projects'] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $tags = [];
                if (isset($item['tags']) && is_array($item['tags'])) {
                    foreach ($item['tags'] as $tag) {
                        $tags[] = clean_text($tag, 30);
                    }
                }
                $projects[] = [
                    'title' => clean_text($item['title'] ?? '', 80),
                    'description' => clean_text($item['description'] ?? '', 300),
                    'url' => clean_url($item['url'] ?? ''),
                    'tags' => $tags,
                ];
            }
            $config['projects'] = $projects;
        }

        write_json(config_file(), $config);
        respond(['ok' => true, 'data' => $config]);

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
