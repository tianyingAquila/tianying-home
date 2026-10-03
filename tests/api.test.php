<?php
declare(strict_types=1);
require __DIR__ . '/../storage.php';
function verify(bool $ok, string $message): void {
    if (!$ok) { throw new RuntimeException($message); }
    echo "PASS: $message\n";
}
function cleanup(string $dir): void {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($dir);
}
$root = dirname(__DIR__);
$dir = sys_get_temp_dir() . '/tianying-api-test-' . bin2hex(random_bytes(6));
mkdir($dir); mkdir($dir . '/data'); mkdir($dir . '/assets'); mkdir($dir . '/assets/data');
foreach (['api.php', 'storage.php', 'steam.php', 'config.php'] as $file) { copy($root . '/' . $file, $dir . '/' . $file); }
file_put_contents($dir . '/config.local.php', "<?php const ADMIN_PASSWORD = 'isolated-test-password';");
file_put_contents($dir . '/router.php', "<?php \$_SERVER['HTTPS']='on'; require __DIR__.'/api.php';");
copy($root . '/assets/data/archives.json', $dir . '/assets/data/archives.json');
$socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
$address = stream_socket_get_name($socket, false); fclose($socket);
$proc = proc_open([PHP_BINARY, '-S', $address, $dir . '/router.php'], [0 => ['file', '/dev/null', 'r'], 1 => ['file', $dir . '/server.log', 'a'], 2 => ['file', $dir . '/server.log', 'a']], $pipes, $dir);
$cookie = '';
function api(string $action, ?array $body = null): array {
    global $address, $cookie;
    $headers = "Content-Type: application/json\r\nX-Requested-With: XMLHttpRequest\r\nCookie: $cookie\r\n";
    $context = stream_context_create(['http' => ['method' => $body === null ? 'GET' : 'POST', 'header' => $headers, 'content' => $body === null ? '' : json_encode($body), 'ignore_errors' => true, 'timeout' => 5]]);
    $raw = file_get_contents('http://' . $address . '/api.php?action=' . $action, false, $context);
    foreach ($http_response_header as $header) {
        if (stripos($header, 'Set-Cookie:') === 0) { $cookie = explode(';', trim(substr($header, 11)))[0]; }
    }
    return [json_decode($raw, true, 512, JSON_THROW_ON_ERROR), $http_response_header];
}
try {
    for ($i = 0; $i < 50; $i++) {
        $ready = @stream_socket_client('tcp://' . $address);
        if ($ready) { fclose($ready); break; }
        usleep(20000);
    }
    [$login] = api('admin_login', ['password' => 'isolated-test-password']);
    verify($login['ok'] && !empty($login['csrf']), 'admin login and session work');
    [$save] = api('admin_save', ['csrf' => $login['csrf'], 'config' => ['github' => 'https://github.com/example']]);
    verify($save['ok'] && $save['data']['social'][0]['url'] === 'https://github.com/example', 'GitHub edit changes actual social link');
    [$config, $headers] = api('config');
    verify($config['data']['github'] === 'https://github.com/example' && str_contains(implode(' ', $headers), 'no-store'), 'saved config is fresh');
    $saved = read_json($dir . '/data/config.json'); $saved['gallery'] = []; $saved['music']['tracks'] = [];
    write_json($dir . '/data/config.json', $saved);
    [$config] = api('config');
    verify($config['data']['gallery'] === [] && $config['data']['music']['tracks'] === [], 'empty lists remain empty in API');
    [$deleted, $headers] = api('delete_image', ['csrf' => $login['csrf'], 'src' => 'assets/img/photo1.webp']);
    verify(!$deleted['ok'] && str_contains($headers[0], '410'), 'removed gallery delete endpoint rejects writes');
    [$archive, $headers] = api('archives');
    verify($archive['ok'] && str_contains(implode(' ', $headers), 'no-store'), 'archives bypass stale browser cache');
    $score = ['name' => 'test', 'mode' => 'tier', 'timeMs' => 5000, 'difficulty' => 'easy', 'size' => 'small', 'effects' => [], 'submissionId' => str_repeat('a', 32)];
    [$one] = api('ms_score', $score); [$two] = api('ms_score', $score);
    verify($one['ok'] && $two['ok'] && count($two['data']) === 1, 'retry saves minesweeper score once');
    $towerScore = ['name' => 'map4-test', 'map' => 4, 'version' => 'v1.05', 'revision' => 0, 'wave' => 12, 'lives' => 0, 'won' => false, 'timeMs' => 180000, 'gold' => 10, 'kills' => 80, 'leaked' => 20, 'built' => 1, 'deployment' => [['type' => 'inferno', 'c' => 8, 'r' => 4, 'level' => 2]], 'submissionId' => str_repeat('b', 32)];
    [$towerOne] = api('td_score', $towerScore); [$towerTwo] = api('td_score', $towerScore);
    verify($towerOne['ok'] && $towerTwo['ok'] && count($towerTwo['data']) === 1 && $towerTwo['data'][0]['map'] === 4, 'fourth map accepts inferno deployment and deduplicates retries');
    verify($towerTwo['data'][0]['version'] === 'v1.05' && $towerTwo['data'][0]['revision'] === 0, 'new scores use the v1.05 snapshot');
    $legacy = $towerScore; $legacy['version'] = 'v1.04'; $legacy['submissionId'] = str_repeat('c', 32); $legacy['name'] = 'legacy';
    foreach ([0, 1] as $revision) {
        $legacy['revision'] = $revision;
        [$legacyResult, $headers] = api('td_score', $legacy);
        verify(!$legacyResult['ok'] && str_contains($headers[0], '409'), 'old v1.04 pages request refresh for revision ' . $revision);
    }
    $towerScore['deployment'][0]['type'] = 'mortar';
    [$wrongTower, $headers] = api('td_score', $towerScore);
    verify(!$wrongTower['ok'] && str_contains($headers[0], '400'), 'fourth map rejects removed mortar tower');
    file_put_contents($dir . '/data/messages.json', '{broken');
    [$bad, $headers] = api('message', ['name' => 'test', 'message' => 'test']);
    verify(!$bad['ok'] && str_contains($headers[0], '500') && file_get_contents($dir . '/data/messages.json') === '{broken', 'API returns JSON error and preserves corrupt data');
} finally {
    proc_terminate($proc); proc_close($proc); cleanup($dir);
}
