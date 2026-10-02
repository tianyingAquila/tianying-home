<?php
declare(strict_types=1);
function verify_deploy(bool $ok, string $message): void {
    if (!$ok) { throw new RuntimeException($message); }
    echo "PASS: $message\n";
}
function delete_deploy_fixture(string $dir): void {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($dir);
}
function command(array $args, ?array $env = null): int {
    $proc = proc_open($args, [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', 'php://stderr', 'w']], $pipes, null, $env);
    return proc_close($proc);
}
$source = dirname(__DIR__);
$dir = sys_get_temp_dir() . '/tianying-deploy-test-' . bin2hex(random_bytes(6));
mkdir($dir); mkdir($dir . '/package'); mkdir($dir . '/root'); mkdir($dir . '/root/data');
$files = ['index.html', 'projects.html', 'games.html', 'minesweeper.html', 'tower.html', 'replay.html', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'admin.php', 'api.php', 'storage.php', 'config.php', 'steam.php', 'cron', 'tools', 'assets/css', 'assets/js', 'assets/img', 'assets/data'];
try {
    verify_deploy(command(array_merge(['tar', '-czf', $dir . '/source.tgz', '-C', $source], $files)) === 0, 'build isolated deployment fixture');
    verify_deploy(command(['tar', '-xzf', $dir . '/source.tgz', '-C', $dir . '/package']) === 0, 'extract deployment fixture');
    file_put_contents($dir . '/package/release.json', '{"id":"fixture"}');
    file_put_contents($dir . '/root/index.html', 'old-index');
    file_put_contents($dir . '/root/data/messages.json', 'original-data');
    $archive = $dir . '/release.tgz';
    command(['tar', '-czf', $archive, '-C', $dir . '/package', '.']);
    $env = array_merge(getenv(), ['TIANYING_DEPLOY_ROOT' => $dir . '/root']);
    verify_deploy(command(['sh', $source . '/tools/deploy_release.sh', $archive, str_repeat('0', 64)], $env) !== 0 && file_get_contents($dir . '/root/index.html') === 'old-index', 'bad archive hash fails before changing the site');
    command(['tar', '-czf', $archive, '-C', $dir . '/package', '.']);
    $script = file_get_contents($source . '/tools/deploy_release.sh');
    $script = str_replace('sha256sum -c release.sha256 >/dev/null', 'printf live-new > "$root/data/messages.json"; false', $script);
    file_put_contents($dir . '/fail.sh', $script);
    verify_deploy(command(['sh', $dir . '/fail.sh', $archive, hash_file('sha256', $archive)], $env) !== 0, 'post-copy failure propagates a nonzero exit');
    verify_deploy(file_get_contents($dir . '/root/index.html') === 'old-index', 'post-copy failure restores previous code');
    verify_deploy(file_get_contents($dir . '/root/data/messages.json') === 'live-new', 'rollback preserves data written during deployment');
    command(['tar', '-czf', $archive, '-C', $dir . '/package', '.']);
    verify_deploy(command(['sh', $source . '/tools/deploy_release.sh', $archive, hash_file('sha256', $archive)], $env) === 0, 'full staged publish and file hash verification succeed');
} finally { delete_deploy_fixture($dir); }
