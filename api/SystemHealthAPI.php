<?php
/**
 * System Health API — admin-only diagnostic snapshot of core modules.
 * Runs real checks (DB connectivity, table reachability, storage, email
 * config) rather than fabricated statuses.
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}
if (!Auth::can('settings.view')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permission denied: settings.view']);
    exit;
}

$action = $_GET['action'] ?? 'check';
if ($action !== 'check') {
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
    exit;
}

function tableCheck(string $label, string $table): array {
    try {
        db()->fetchOne("SELECT 1 FROM `$table` LIMIT 1");
        return ['name' => $label, 'status' => 'ok', 'detail' => 'Reachable'];
    } catch (Exception $e) {
        return ['name' => $label, 'status' => 'error', 'detail' => 'Query failed'];
    }
}

$modules = [];

// ── Database connection ──────────────────────────────────────────
try {
    db()->fetchOne('SELECT 1');
    $modules[] = ['name' => 'Database Connection', 'status' => 'ok', 'detail' => 'Connected'];
} catch (Exception $e) {
    $modules[] = ['name' => 'Database Connection', 'status' => 'error', 'detail' => 'Cannot reach database'];
}

// ── Core academic tables ─────────────────────────────────────────
$modules[] = tableCheck('User Accounts',        'users');
$modules[] = tableCheck('Enrollment',           'student_subject');
$modules[] = tableCheck('Lessons Module',       'lessons');
$modules[] = tableCheck('Quizzes Module',       'quiz');
$modules[] = tableCheck('Announcements Module', 'announcement');
$modules[] = tableCheck('Messaging Module',     'messages');
$modules[] = tableCheck('Gradebook Module',     'global_module_grades');
$modules[] = tableCheck('Curriculum Module',    'curriculum');

// ── File storage ──────────────────────────────────────────────────
$uploadsDir = dirname(__DIR__) . '/uploads';
if (!is_dir($uploadsDir)) {
    $modules[] = ['name' => 'File Storage', 'status' => 'error', 'detail' => 'uploads/ directory missing'];
} elseif (!is_writable($uploadsDir)) {
    $modules[] = ['name' => 'File Storage', 'status' => 'warning', 'detail' => 'uploads/ directory not writable'];
} else {
    $modules[] = ['name' => 'File Storage', 'status' => 'ok', 'detail' => 'Writable'];
}

// ── Email / notifications ────────────────────────────────────────
require_once __DIR__ . '/../config/email.php';
$mailConfigured = !empty(GMAIL_SMTP_USER) && !empty(GMAIL_SMTP_APP_PASSWORD);
$modules[] = $mailConfigured
    ? ['name' => 'Email Notifications', 'status' => 'ok', 'detail' => 'SMTP configured']
    : ['name' => 'Email Notifications', 'status' => 'warning', 'detail' => 'SMTP credentials not set'];

// ── PHP environment ──────────────────────────────────────────────
$requiredExt = ['pdo_mysql', 'mbstring', 'json'];
$missingExt  = array_filter($requiredExt, fn($e) => !extension_loaded($e));
$modules[] = empty($missingExt)
    ? ['name' => 'PHP Environment', 'status' => 'ok', 'detail' => 'PHP ' . PHP_VERSION]
    : ['name' => 'PHP Environment', 'status' => 'error', 'detail' => 'Missing extensions: ' . implode(', ', $missingExt)];

$okCount    = count(array_filter($modules, fn($m) => $m['status'] === 'ok'));
$warnCount  = count(array_filter($modules, fn($m) => $m['status'] === 'warning'));
$errorCount = count(array_filter($modules, fn($m) => $m['status'] === 'error'));

echo json_encode([
    'success' => true,
    'data' => [
        'modules'   => $modules,
        'summary'   => ['ok' => $okCount, 'warning' => $warnCount, 'error' => $errorCount, 'total' => count($modules)],
        'checked_at' => date('c'),
    ],
]);
