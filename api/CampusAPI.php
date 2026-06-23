<?php
/**
 * Campus API — list, create, update campuses
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

$action = $_GET['action'] ?? 'list';

switch ($action) {
    case 'list':   handleList();   break;
    case 'create': handleCreate(); break;
    case 'update': handleUpdate(); break;
    case 'delete': handleDelete(); break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function handleList() {
    $campuses = db()->fetchAll(
        "SELECT c.*,
            (SELECT COUNT(*) FROM department d WHERE d.campus_id = c.campus_id AND d.status = 'active') AS department_count,
            (SELECT COUNT(*) FROM users u WHERE u.campus_id = c.campus_id AND u.status = 'active') AS user_count
         FROM campus c
         ORDER BY c.campus_id ASC"
    );
    echo json_encode(['success' => true, 'data' => $campuses]);
}

function handleCreate() {
    if (!Auth::isAdmin()) {
        echo json_encode(['success' => false, 'message' => 'Admin only']); return;
    }

    $data    = json_decode(file_get_contents('php://input'), true) ?? [];
    $name    = trim($data['campus_name']    ?? '');
    $code    = trim($data['campus_code']    ?? '');
    $address = trim($data['address']        ?? '');
    $phone   = trim($data['contact_number'] ?? '');
    $email   = trim($data['email']          ?? '');
    $status  = in_array($data['status'] ?? '', ['active','inactive']) ? $data['status'] : 'active';

    if (!$name || !$code) {
        echo json_encode(['success' => false, 'message' => 'Campus name and code are required']); return;
    }

    $exists = db()->fetchOne("SELECT campus_id FROM campus WHERE campus_code = ?", [$code]);
    if ($exists) {
        echo json_encode(['success' => false, 'message' => 'Campus code already exists']); return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO campus (campus_name, campus_code, address, contact_number, email, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())"
        )->execute([$name, $code, $address ?: null, $phone ?: null, $email ?: null, $status]);
        echo json_encode(['success' => true, 'message' => 'Campus created successfully']);
    } catch (Exception $e) {
        error_log('CampusAPI create: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create campus']);
    }
}

function handleUpdate() {
    if (!Auth::isAdmin()) {
        echo json_encode(['success' => false, 'message' => 'Admin only']); return;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id   = (int)($data['campus_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'campus_id required']); return; }

    $name    = trim($data['campus_name']    ?? '');
    $code    = trim($data['campus_code']    ?? '');
    $address = trim($data['address']        ?? '');
    $phone   = trim($data['contact_number'] ?? '');
    $email   = trim($data['email']          ?? '');
    $status  = in_array($data['status'] ?? '', ['active','inactive']) ? $data['status'] : 'active';

    if (!$name || !$code) {
        echo json_encode(['success' => false, 'message' => 'Campus name and code are required']); return;
    }

    $dup = db()->fetchOne("SELECT campus_id FROM campus WHERE campus_code = ? AND campus_id != ?", [$code, $id]);
    if ($dup) {
        echo json_encode(['success' => false, 'message' => 'Campus code already in use']); return;
    }

    try {
        pdo()->prepare(
            "UPDATE campus SET campus_name=?, campus_code=?, address=?, contact_number=?, email=?, status=?, updated_at=NOW()
             WHERE campus_id=?"
        )->execute([$name, $code, $address ?: null, $phone ?: null, $email ?: null, $status, $id]);
        echo json_encode(['success' => true, 'message' => 'Campus updated successfully']);
    } catch (Exception $e) {
        error_log('CampusAPI update: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update campus']);
    }
}

function handleDelete() {
    if (!Auth::isAdmin()) {
        echo json_encode(['success' => false, 'message' => 'Admin only']); return;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id   = (int)($data['campus_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'campus_id required']); return; }

    $deptCount = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM department WHERE campus_id = ? AND status = 'active'", [$id]
    )['c'] ?? 0;
    if ($deptCount > 0) {
        echo json_encode(['success' => false, 'message' => "Cannot deactivate: campus has {$deptCount} active department(s)"]); return;
    }

    try {
        pdo()->prepare("UPDATE campus SET status='inactive', updated_at=NOW() WHERE campus_id=?")->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Campus deactivated']);
    } catch (Exception $e) {
        error_log('CampusAPI delete: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to deactivate campus']);
    }
}
