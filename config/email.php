<?php
/**
 * Email configuration — Gmail SMTP
 * Credentials: config/email.local.php (create via tools/mail-setup.php)
 */
$emailLocal = __DIR__ . '/email.local.php';
if (is_readable($emailLocal)) {
    require_once $emailLocal;
}

if (!defined('MAIL_PROVIDER')) {
    define('MAIL_PROVIDER', getenv('MAIL_PROVIDER') ?: 'google');
}

if (!defined('MAIL_FROM_NAME')) {
    define('MAIL_FROM_NAME', 'PHINMA COC-LMS');
}

if (!defined('GMAIL_SMTP_USER')) {
    define('GMAIL_SMTP_USER', getenv('GMAIL_SMTP_USER') ?: '');
}
if (!defined('GMAIL_SMTP_APP_PASSWORD')) {
    define('GMAIL_SMTP_APP_PASSWORD', getenv('GMAIL_SMTP_APP_PASSWORD') ?: '');
}

if (!defined('MAIL_FROM_EMAIL')) {
    define(
        'MAIL_FROM_EMAIL',
        getenv('MAIL_FROM_EMAIL') ?: (GMAIL_SMTP_USER ?: 'noreply@phinma-coc.edu.ph')
    );
}

if (!defined('MAIL_DIGEST_MODE')) {
    define('MAIL_DIGEST_MODE', filter_var(getenv('MAIL_DIGEST_MODE') ?: 'true', FILTER_VALIDATE_BOOLEAN));
}

if (!defined('MAIL_DIGEST_HOUR')) {
    define('MAIL_DIGEST_HOUR', (int)(getenv('MAIL_DIGEST_HOUR') ?: 17));
}

if (!defined('MAIL_DAILY_LIMIT')) {
    define('MAIL_DAILY_LIMIT', (int)(getenv('MAIL_DAILY_LIMIT') ?: 500));
}

if (!defined('MAIL_BATCH_SIZE')) {
    define('MAIL_BATCH_SIZE', (int)(getenv('MAIL_BATCH_SIZE') ?: 50));
}

if (!defined('BREVO_API_KEY')) {
    define('BREVO_API_KEY', getenv('BREVO_API_KEY') ?: '');
}

if (!defined('MAIL_CRON_TOKEN')) {
    define('MAIL_CRON_TOKEN', getenv('MAIL_CRON_TOKEN') ?: 'change-me-in-production');
}

if (!defined('MAIL_DEV_LOG')) {
    define('MAIL_DEV_LOG', true);
}

/** Password OTP validity — 1 minute */
if (!defined('PASSWORD_OTP_TTL')) {
    define('PASSWORD_OTP_TTL', (int)(getenv('PASSWORD_OTP_TTL') ?: 60));
}
