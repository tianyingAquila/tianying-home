<?php
declare(strict_types=1);
$root = rtrim($argv[1] ?? '', '/');
if ($root === '' || !is_dir($root . '/data')) { throw new RuntimeException('Extract backup into an isolated directory first'); }
$count = 0;
foreach (glob($root . '/data/*.json') as $file) {
    $data = json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data)) { throw new RuntimeException('Invalid JSON root: ' . basename($file)); }
    $count++;
}
if (!is_file($root . '/config.local.php') || !is_dir($root . '/uploads')) { throw new RuntimeException('Missing private config or uploads'); }
$config = json_decode(file_get_contents($root . '/data/config.json'), true, 512, JSON_THROW_ON_ERROR);
$paths = [$config['avatar'] ?? '', $config['background'] ?? '', $config['music']['cover'] ?? ''];
foreach ($config['gallery'] ?? [] as $item) { $paths[] = $item['src'] ?? ''; }
foreach ($config['music']['tracks'] ?? [] as $item) { $paths[] = $item['src'] ?? ''; }
foreach ($paths as $file) {
    if ($file !== '' && !preg_match('#^(https?://|mailto:)#', $file) && !is_file($root . '/' . ltrim($file, '/'))) {
        throw new RuntimeException('Missing referenced asset: ' . $file);
    }
}
echo "Backup verified: $count JSON files, private config, uploads and referenced assets\n";
