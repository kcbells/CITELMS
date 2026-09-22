<?php
require_once __DIR__ . '/env.php';
/**
 * Email configuration — Gmail SMTP
 * Credentials: config/email.local.php (create via tools/mail-setup.php)
 */
$emailLocal = __DIR__ . '/email.local.php';
if (is_readable($emailLocal)) {
    require_once $emailLocal;
}

if (!defined('MAIL_PROVIDER')) {
    define('MAIL_PROVIDER', envValue('MAIL_PROVIDER') ?: 'google');
}

if (!defined('MAIL_FROM_NAME')) {
    define('MAIL_FROM_NAME', 'PHINMA COC-LMS');
}

if (!defined('GMAIL_SMTP_USER')) {
    define('GMAIL_SMTP_USER', envValue('GMAIL_SMTP_USER') ?: '');
}
if (!defined('GMAIL_SMTP_APP_PASSWORD')) {
    define('GMAIL_SMTP_APP_PASSWORD', envValue('GMAIL_SMTP_APP_PASSWORD') ?: '');
}

if (!defined('MAIL_FROM_EMAIL')) {
    define(
        'MAIL_FROM_EMAIL',
        envValue('MAIL_FROM_EMAIL') ?: (GMAIL_SMTP_USER ?: 'noreply@phinma-coc.edu.ph')
    );
}

if (!defined('MAIL_DIGEST_MODE')) {
    define('MAIL_DIGEST_MODE', filter_var(envValue('MAIL_DIGEST_MODE') ?: 'true', FILTER_VALIDATE_BOOLEAN));
}

if (!defined('MAIL_DIGEST_HOUR')) {
    define('MAIL_DIGEST_HOUR', (int)(envValue('MAIL_DIGEST_HOUR') ?: 17));
}

if (!defined('MAIL_DAILY_LIMIT')) {
    define('MAIL_DAILY_LIMIT', (int)(envValue('MAIL_DAILY_LIMIT') ?: 500));
}

if (!defined('MAIL_BATCH_SIZE')) {
    define('MAIL_BATCH_SIZE', (int)(envValue('MAIL_BATCH_SIZE') ?: 50));
}

if (!defined('BREVO_API_KEY')) {
    define('BREVO_API_KEY', envValue('BREVO_API_KEY') ?: '');
}

if (!defined('GOOGLE_CLIENT_ID')) {
    define('GOOGLE_CLIENT_ID', envValue('GOOGLE_CLIENT_ID') ?: '');
}
if (!defined('GOOGLE_CLIENT_SECRET')) {
    define('GOOGLE_CLIENT_SECRET', envValue('GOOGLE_CLIENT_SECRET') ?: '');
}
if (!defined('GOOGLE_REFRESH_TOKEN')) {
    define('GOOGLE_REFRESH_TOKEN', envValue('GOOGLE_REFRESH_TOKEN') ?: '');
}
if (!defined('GOOGLE_SENDER_EMAIL')) {
    define('GOOGLE_SENDER_EMAIL', envValue('GOOGLE_SENDER_EMAIL') ?: '');
}

if (!defined('MAIL_CRON_TOKEN')) {
    define('MAIL_CRON_TOKEN', envValue('MAIL_CRON_TOKEN') ?: 'change-me-in-production');
}

if (!defined('MAIL_DEV_LOG')) {
    define('MAIL_DEV_LOG', true);
}

/** Password OTP validity — 10 minutes */
if (!defined('PASSWORD_OTP_TTL')) {
    define('PASSWORD_OTP_TTL', (int)(envValue('PASSWORD_OTP_TTL') ?: 600));
}
