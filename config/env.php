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
            if (getenv($key) === false) {
                putenv("$key=$val");
                $_ENV[$key]    = $val;
                $_SERVER[$key] = $val;
            }
        }
    }
}

loadDotEnv(__DIR__ . '/../.env');
