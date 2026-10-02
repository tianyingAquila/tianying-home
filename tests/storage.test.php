<?php
declare(strict_types=1);
require dirname(__DIR__) . '/storage.php';

if (($argv[1] ?? '') === 'worker') {
    for ($i = 0; $i < 30; $i++) {
        with_file_lock($argv[2], static function ($fp): void {
            $data = read_json_from_handle($fp, ['count' => 0]);
            $data['count']++;
            write_json_to_handle($fp, $data);
        });
    }
    exit;
}
function check(bool $ok, string $message): void {
    if (!$ok) { throw new RuntimeException($message); }
    echo "PASS: $message\n";
}
function remove_test_dir(string $dir): void {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($dir);
}
$dir = sys_get_temp_dir() . '/tianying-storage-test-' . bin2hex(random_bytes(6));
mkdir($dir);
try {
    $file = $dir . '/counter.json';
    write_json($file, ['count' => 0]);
    $processes = [];
    for ($i = 0; $i < 4; $i++) {
        $processes[] = proc_open([PHP_BINARY, __FILE__, 'worker', $file], [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    }
    while (array_filter($processes, static fn ($proc) => proc_get_status($proc)['running'])) {
        check(is_int(read_json($file)['count']), 'reader sees complete JSON during concurrent writes');
        usleep(20000);
    }
    foreach ($processes as $proc) { proc_close($proc); }
    check(read_json($file)['count'] === 120, 'four concurrent writers preserve all updates');
    $merged = merge_config(['gallery' => [1, 2, 3], 'music' => ['cover' => 'old', 'tracks' => [1, 2]]], ['gallery' => [], 'music' => ['tracks' => [9]]]);
    check($merged['gallery'] === [] && $merged['music']['tracks'] === [9] && $merged['music']['cover'] === 'old', 'lists replace defaults, object fields inherit');
    file_put_contents($file, '{broken');
    $caught = false;
    try { with_file_lock($file, static function ($fp) { $data = read_json_from_handle($fp); write_json_to_handle($fp, $data); }); }
    catch (JsonException $e) { $caught = true; }
    check($caught && file_get_contents($file) === '{broken', 'corrupt JSON is reported and preserved');
    $blocked = $dir . '/not-a-file'; mkdir($blocked);
    $caught = false;
    try { write_json($blocked, ['test' => 1]); } catch (RuntimeException $e) { $caught = true; }
    check($caught && is_dir($blocked), 'failed replacement throws without deleting original');
    check(count(glob($dir . '/.json-*')) === 0, 'failed writes clean up temporary files');
} finally { remove_test_dir($dir); }
