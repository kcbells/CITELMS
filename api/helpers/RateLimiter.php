<?php
/**
 * RateLimiter — fixed-window, MySQL-backed rate limiting.
 *
 * Limits are keyed by (group : IP : user_id).
 * The table is created automatically on first use.
 * On any DB error the limiter fails-open so real traffic is never blocked
 * by an infrastructure fault.
 *
 * Groups and their defaults:
 *   auth   — 10 req / 15 min  (login, OTP, register)
 *   ai     — 20 req / hour    (AI quiz generation)
 *   write  — 120 req / min    (all other POSTs)
 *   read   — 300 req / min    (all GETs)
 */
class RateLimiter
{
    // [limit, window_seconds]
    private const GROUPS = [
        'auth'  => [10,   900],   // 10 / 15 min
        'ai'    => [20,  3600],   // 20 / hour
        'write' => [120,   60],   // 120 / min
        'read'  => [300,   60],   // 300 / min
    ];

    // API files that belong to the strict 'auth' group
    private const AUTH_SCRIPTS = ['AuthAPI.php'];

    // API files that belong to the 'ai' group
    private const AI_SCRIPTS   = ['AIQuizAPI.php'];

    private static bool $tableReady = false;

    // ── Public entry point ────────────────────────────────────
    public static function check(): void
    {
        $script = basename($_SERVER['SCRIPT_FILENAME'] ?? '');
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        [$group, $limit, $window] = self::resolveGroup($script, $method);

        $ip     = self::clientIp();
        $userId = self::peekUserId();
        // key length capped at 120 (table column size)
        $key    = substr($group . ':' . md5($ip . ':' . $userId), 0, 120);

        self::ensureTable();
        self::enforce($key, $limit, $window);
    }

    // ── Group resolution ──────────────────────────────────────
    private static function resolveGroup(string $script, string $method): array
    {
        if (in_array($script, self::AUTH_SCRIPTS, true)) {
            return ['auth', ...self::GROUPS['auth']];
        }
        if (in_array($script, self::AI_SCRIPTS, true)) {
            return ['ai', ...self::GROUPS['ai']];
        }
        $g = ($method === 'GET') ? 'read' : 'write';
        return [$g, ...self::GROUPS[$g]];
    }

    // ── Helpers ───────────────────────────────────────────────
    private static function clientIp(): string
    {
        foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $h) {
            if (!empty($_SERVER[$h])) {
                return trim(explode(',', $_SERVER[$h])[0]);
            }
        }
        return '0.0.0.0';
    }

    /**
     * Extract user_id from the JWT without loading the full Auth stack.
     * Returns 0 for unauthenticated / unparseable tokens.
     */
    private static function peekUserId(): int
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(\S+)/i', $header, $m)) return 0;
        $parts = explode('.', $m[1]);
        if (count($parts) !== 3) return 0;
        $payload = json_decode(
            base64_decode(strtr($parts[1], '-_', '+/')), true
        );
        return (int)($payload['sub'] ?? 0);
    }

    // ── Table bootstrap ───────────────────────────────────────
    private static function ensureTable(): void
    {
        if (self::$tableReady) return;
        self::$tableReady = true;
        try {
            pdo()->exec("CREATE TABLE IF NOT EXISTS `rate_limit` (
                `rl_key`       varchar(120) NOT NULL,
                `requests`     int(11)      NOT NULL DEFAULT 1,
                `window_start` int(11)      NOT NULL,
                `expires_at`   int(11)      NOT NULL,
                PRIMARY KEY (`rl_key`),
                KEY `idx_rl_expires` (`expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        } catch (Throwable $e) {
            error_log('[RateLimiter] ensureTable: ' . $e->getMessage());
        }
    }

    // ── Enforcement ───────────────────────────────────────────
    private static function enforce(string $key, int $limit, int $window): void
    {
        try {
            $now         = time();
            $winStart    = (int)($now - ($now % $window));   // aligned window start
            $expiresAt   = $winStart + $window;

            $pdo = pdo();

            /*
             * Atomic upsert:
             *   • New key                  → insert with requests = 1
             *   • Same key, same window    → increment requests
             *   • Same key, expired window → reset to 1 and slide window forward
             */
            $pdo->prepare("
                INSERT INTO rate_limit (rl_key, requests, window_start, expires_at)
                VALUES (?, 1, ?, ?)
                ON DUPLICATE KEY UPDATE
                    requests     = IF(window_start < VALUES(window_start), 1, requests + 1),
                    window_start = IF(window_start < VALUES(window_start), VALUES(window_start), window_start),
                    expires_at   = IF(window_start < VALUES(window_start), VALUES(expires_at),   expires_at)
            ")->execute([$key, $winStart, $expiresAt]);

            $row = $pdo->prepare(
                "SELECT requests, expires_at FROM rate_limit WHERE rl_key = ?"
            );
            $row->execute([$key]);
            $data = $row->fetch(PDO::FETCH_ASSOC);

            if ($data && (int)$data['requests'] > $limit) {
                $retryAfter = max(1, (int)$data['expires_at'] - $now);
                self::abort($limit, $retryAfter, (int)$data['expires_at']);
            }

            // Periodic cleanup — runs ~1% of requests, never blocks the response
            if (random_int(1, 100) === 1) {
                try {
                    $pdo->prepare("DELETE FROM rate_limit WHERE expires_at < ?")->execute([$now]);
                } catch (Throwable $e) { /* non-fatal */ }
            }

        } catch (Throwable $e) {
            // Fail-open: log and let the request through
            error_log('[RateLimiter] enforce: ' . $e->getMessage());
        }
    }

    // ── 429 response ──────────────────────────────────────────
    private static function abort(int $limit, int $retryAfter, int $resetAt): never
    {
        // Discard any PHP output buffer so our JSON is the only thing sent
        while (ob_get_level() > 0) { ob_end_clean(); }

        http_response_code(429);
        header('Content-Type: application/json');
        header('Retry-After: '          . $retryAfter);
        header('X-RateLimit-Limit: '    . $limit);
        header('X-RateLimit-Remaining: 0');
        header('X-RateLimit-Reset: '    . $resetAt);

        $minutes = (int)ceil($retryAfter / 60);
        $msg = $retryAfter < 90
            ? "Too many requests. Please wait {$retryAfter} seconds and try again."
            : "Too many requests. Please wait {$minutes} minute(s) and try again.";

        echo json_encode([
            'success'     => false,
            'error'       => 'rate_limited',
            'message'     => $msg,
            'retry_after' => $retryAfter,
        ]);
        exit;
    }
}
