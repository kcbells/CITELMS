<?php
/**
 * AI provider settings (Hugging Face access token + model) — admin-only.
 * Backs the "AI / Ali Assistant" panel in admin/settings.js. Values live in
 * the existing `system_settings` key/value table (hf_api_key, ai_model),
 * the same table every AI feature already reads from (helpers/AiProvider.php).
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json');

if (!Auth::check() || Auth::role() !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Admin access required']);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get':
        handleGet();
        break;
    case 'save':
        handleSave();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function ensureSystemSettingsTable(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS `system_settings` (
            `setting_key` VARCHAR(100) NOT NULL,
            `setting_value` TEXT NULL,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`setting_key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
    } catch (Exception $e) {
        error_log('ensureSystemSettingsTable: ' . $e->getMessage());
    }
}

function handleGet(): void {
    ensureSystemSettingsTable();
    $key = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'hf_api_key'");
    $model = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'ai_model'");
    $raw = $key['setting_value'] ?? '';
    // Never send the full token back to the browser — just enough to confirm which one is saved.
    $masked = $raw !== '' ? (substr($raw, 0, 6) . str_repeat('•', 10) . substr($raw, -4)) : '';
    echo json_encode([
        'success' => true,
        'data' => [
            'has_key'    => $raw !== '',
            'masked_key' => $masked,
            'model'      => $model['setting_value'] ?? '',
        ],
    ]);
}

function handleSave(): void {
    ensureSystemSettingsTable();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $key   = trim((string)($input['hf_api_key'] ?? ''));
    $model = trim((string)($input['ai_model'] ?? ''));

    try {
        if ($key !== '') {
            pdo()->prepare(
                "INSERT INTO system_settings (setting_key, setting_value) VALUES ('hf_api_key', ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
            )->execute([$key]);
        }
        if ($model !== '') {
            pdo()->prepare(
                "INSERT INTO system_settings (setting_key, setting_value) VALUES ('ai_model', ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
            )->execute([$model]);
        }
        echo json_encode(['success' => true, 'message' => 'AI settings saved']);
    } catch (Exception $e) {
        error_log('AiSettings save: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save AI settings']);
    }
}
