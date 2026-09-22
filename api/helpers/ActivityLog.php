<?php
/**
 * Activity log helpers — shared by every API that records an action.
 *
 * Each entry now also stores WHERE it came from (IP address) and WHAT it was
 * done on (browser/device), so an admin reading the log can tell a normal
 * sign-in from someone else's phone on another network.
 */

/** Adds ip_address / user_agent to activity_logs on older installs. */
function ensureActivityLogColumns(): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    try {
        $cols = array_column(db()->fetchAll('SHOW COLUMNS FROM activity_logs'), 'Field');
        if (!in_array('ip_address', $cols, true)) {
            pdo()->exec("ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45) NULL AFTER activity_description");
        }
        if (!in_array('user_agent', $cols, true)) {
            pdo()->exec("ALTER TABLE activity_logs ADD COLUMN user_agent VARCHAR(255) NULL AFTER ip_address");
        }
    } catch (Throwable $e) {
        error_log('ensureActivityLogColumns: ' . $e->getMessage());
    }
}

/**
 * The caller's IP. Proxy headers are only trusted when the request actually
 * arrived from a proxy we run, otherwise anyone could spoof their address by
 * sending an X-Forwarded-For header.
 */
function activityClientIp(): ?string
{
    $remote = $_SERVER['REMOTE_ADDR'] ?? null;
    $trustedProxies = array_filter(array_map('trim', explode(',', (string)(envValue('TRUSTED_PROXIES') ?: ''))));

    if ($remote && $trustedProxies && in_array($remote, $trustedProxies, true)) {
        $fwd = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        foreach (explode(',', $fwd) as $candidate) {
            $candidate = trim($candidate);
            if (filter_var($candidate, FILTER_VALIDATE_IP)) return substr($candidate, 0, 45);
        }
    }

    // XAMPP reports local visits as ::1 — say so in plain words instead.
    if ($remote === '::1' || $remote === '127.0.0.1') return 'This computer';
    return $remote ? substr($remote, 0, 45) : null;
}

/** The raw browser string, trimmed to what the column holds. */
function activityUserAgent(): ?string
{
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    return $ua !== '' ? substr($ua, 0, 255) : null;
}

/**
 * Turns a browser string into something readable: "iPhone · Safari".
 * Deliberately short — an admin wants to recognise a device, not parse it.
 */
function activityDeviceLabel(?string $ua): string
{
    if (!$ua) return 'Unknown device';

    $os = 'Unknown';
    if (preg_match('/iPhone|iPod/i', $ua))                 $os = 'iPhone';
    elseif (preg_match('/iPad/i', $ua))                    $os = 'iPad';
    elseif (preg_match('/Android/i', $ua))                 $os = 'Android';
    elseif (preg_match('/Windows NT/i', $ua))              $os = 'Windows';
    elseif (preg_match('/Mac OS X/i', $ua))                $os = 'Mac';
    elseif (preg_match('/Linux/i', $ua))                   $os = 'Linux';

    $browser = 'Unknown browser';
    if (preg_match('/Edg\//i', $ua))                       $browser = 'Edge';
    elseif (preg_match('/OPR\/|Opera/i', $ua))             $browser = 'Opera';
    elseif (preg_match('/SamsungBrowser/i', $ua))          $browser = 'Samsung Internet';
    elseif (preg_match('/Chrome\//i', $ua))                $browser = 'Chrome';
    elseif (preg_match('/CriOS/i', $ua))                   $browser = 'Chrome';
    elseif (preg_match('/FxiOS|Firefox/i', $ua))           $browser = 'Firefox';
    elseif (preg_match('/Safari/i', $ua))                  $browser = 'Safari';

    $isPhone = preg_match('/Mobile|iPhone|iPod|Android.*Mobile/i', $ua) === 1;
    $kind = $isPhone ? 'Phone' : (in_array($os, ['iPad'], true) ? 'Tablet' : 'Computer');

    return $os . ' · ' . $browser . ' (' . $kind . ')';
}

/** Phone / Tablet / Computer on its own — used for the device filter. */
function activityDeviceKind(?string $ua): string
{
    if (!$ua) return 'unknown';
    if (preg_match('/iPad|Tablet/i', $ua)) return 'tablet';
    if (preg_match('/Mobile|iPhone|iPod|Android/i', $ua)) return 'phone';
    return 'computer';
}

/**
 * Plain-English name for an activity type, so the log reads as actions
 * ("Signed in", "Created a user") rather than raw codes ("login").
 */
function activityActionLabel(string $type): string
{
    $map = [
        // the types this system actually records
        'login_success'        => 'Signed in',
        'login_failed'         => 'Failed sign-in',
        'login_blocked'        => 'Sign-in blocked',
        'first_login'          => 'First sign-in',
        'password_set'         => 'Set their password',
        'admin_password_reset' => 'Password reset by an admin',
        'login'                => 'Signed in',
        'logout'               => 'Signed out',
        'failed_login'         => 'Failed sign-in',
        'register'             => 'Registered an account',
        'registration'         => 'Registered an account',
        'password_reset'       => 'Reset their password',
        'password_change'      => 'Changed their password',
        'user_created'         => 'Created a user',
        'user_updated'         => 'Updated a user',
        'user_deleted'         => 'Deleted a user',
        'user_activated'       => 'Activated a user',
        'user_deactivated'     => 'Deactivated a user',
        'bulk_import'          => 'Imported a file',
        'backup_created'       => 'Created a database backup',
        'backup_deleted'       => 'Deleted a database backup',
        'settings_updated'     => 'Changed settings',
        'content_blocked'      => 'Blocked: bad words or photo',
    ];
    if (isset($map[$type])) return $map[$type];

    // Anything not listed: turn "some_action_name" into "Some action name".
    return ucfirst(str_replace('_', ' ', $type));
}

/** Broad grouping used for colour-coding and the category filter. */
function activityActionSeverity(string $type): string
{
    if (preg_match('/fail|denied|lock|block/i', $type))                  return 'warn';
    if (preg_match('/delete|deactivat|reset|restore/i', $type))      return 'danger';
    if (preg_match('/creat|import|register|activat|backup/i', $type)) return 'create';
    return 'normal';
}

/**
 * The one place a log line is written. Every API should call this rather than
 * inserting into activity_logs directly, so IP and device are never missed.
 */
function recordActivity(?int $userId, string $activityType, string $description): void
{
    try {
        ensureActivityLogColumns();
        db()->execute(
            "INSERT INTO activity_logs (users_id, activity_type, activity_description, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())",
            [$userId, $activityType, $description, activityClientIp(), activityUserAgent()]
        );
    } catch (Throwable $e) {
        error_log('recordActivity error: ' . $e->getMessage());
    }
}
