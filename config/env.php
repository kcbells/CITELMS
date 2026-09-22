<?php
/**
 * Simple .env loader
 * Reads PROJECT_ROOT/.env and registers each key via putenv() + $_ENV.
 * Real server environment variables always take precedence.
 * Call loadDotEnv() once at bootstrap — safe to call multiple times.
 */
if (!function_exists('loadDotEnv')) {
    function loadDotEnv(string $path): void {
        if (!is_readable($path)) return;
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            if (!str_contains($line, '=')) continue;
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key);
            $val = trim(trim($val), "\"'");
            if ($key === '') continue;
            // Never override real environment variables (set by server/hosting)
            if (envValue($key) === false) {
                if (function_exists('putenv')) @putenv("$key=$val");
                $_ENV[$key]    = $val;
                $_SERVER[$key] = $val;
            }
        }
    }
}

/**
 * Reads one setting. Some hosts (InfinityFree) let putenv() run but ignore it,
 * so getenv() stays empty — fall back to the copy kept in $_ENV / $_SERVER.
 * Returns false when the setting is not defined anywhere, just like getenv().
 */
if (!function_exists('envValue')) {
    function envValue(string $key) {
        $v = getenv($key);
        if ($v !== false) return $v;
        if (array_key_exists($key, $_ENV)) return $_ENV[$key];
        if (array_key_exists($key, $_SERVER) && is_string($_SERVER[$key])) return $_SERVER[$key];
        return false;
    }
}
loadDotEnv(__DIR__ . '/../.env');
