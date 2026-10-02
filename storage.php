<?php
declare(strict_types=1);

// Lock a stable sidecar: replacing the JSON file must not replace its lock.
function json_lock(string $file, int $mode, callable $callback)
{
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create data directory');
    }
    $fp = @fopen($file . '.lock', 'c+');
    if ($fp === false) {
        throw new RuntimeException('Cannot open data lock');
    }
    try {
        if (!flock($fp, $mode)) {
            throw new RuntimeException('Cannot lock data file');
        }
        return $callback($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function json_lock_target($fp): string
{
    if (!is_resource($fp)) {
        throw new RuntimeException('Invalid data lock');
    }
    return substr(stream_get_meta_data($fp)['uri'], 0, -5);
}

function read_json_unlocked(string $file, array $default = []): array
{
    if (!is_file($file)) {
        return $default;
    }
    $raw = @file_get_contents($file);
    if ($raw === false) {
        throw new RuntimeException('Cannot read data file');
    }
    $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data)) {
        throw new RuntimeException('Data file must contain a JSON array or object');
    }
    return $data;
}

function read_json(string $file, array $default = []): array
{
    return json_lock($file, LOCK_SH, static fn ($fp) => read_json_unlocked($file, $default));
}

function with_file_lock(string $file, callable $callback)
{
    return json_lock($file, LOCK_EX, $callback);
}

function read_json_from_handle($fp, array $default = []): array
{
    return read_json_unlocked(json_lock_target($fp), $default);
}

function write_json_to_handle($fp, array $data): void
{
    $file = json_lock_target($fp);
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temp = @tempnam(dirname($file), '.json-');
    if ($temp === false) {
        throw new RuntimeException('Cannot create temporary data file');
    }
    try {
        if (@file_put_contents($temp, $encoded) !== strlen($encoded)) {
            throw new RuntimeException('Cannot write complete data file');
        }
        if (!@chmod($temp, is_file($file) ? (fileperms($file) & 0777) : 0644) || !@rename($temp, $file)) {
            throw new RuntimeException('Cannot replace data file');
        }
    } finally {
        if (is_file($temp)) {
            @unlink($temp);
        }
    }
}

function write_json(string $file, array $data): void
{
    with_file_lock($file, static function ($fp) use ($data): void {
        write_json_to_handle($fp, $data);
    });
}

// Objects inherit missing fields; lists, including empty lists, replace defaults.
function merge_config(array $defaults, array $saved): array
{
    foreach ($saved as $key => $value) {
        if (is_array($value) && !array_is_list($value) && isset($defaults[$key]) && is_array($defaults[$key]) && !array_is_list($defaults[$key])) {
            $defaults[$key] = merge_config($defaults[$key], $value);
        } else {
            $defaults[$key] = $value;
        }
    }
    return $defaults;
}
