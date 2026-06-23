<?php
/**
 * Programs API - CRUD for program management
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

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action
$_progApiPerms = [
    'list'        => 'programs.view',
    'get'         => 'programs.view',
    'departments' => 'programs.view',
    'create'      => 'programs.create',
    'update'      => 'programs.edit',
    'delete'      => 'programs.delete',
];
if (isset($_progApiPerms[$action]) && !Auth::can($_progApiPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_progApiPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'list': handleList(); break;
    case 'get': handleGet(); break;
    case 'create': handleCreate(); break;
    case 'update': handleUpdate(); break;
    case 'delete': handleDelete(); break;
    case 'archive': handleArchive(); break;
    case 'departments': handleDepartments(); break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function handleList() {
    $deptId = (int)($_GET['department_id'] ?? 0);
    $where  = $deptId ? 'WHERE dp.department_id = ?' : '';
    $params = $deptId ? [$deptId] : [];

    $programs = db()->fetchAll(
        "SELECT p.*, d.department_name, dp.department_id,
            (SELECT COUNT(*) FROM users u WHERE u.program_id = p.program_id) as student_count
         FROM program p
         LEFT JOIN department_program dp ON p.program_id = dp.program_id
         LEFT JOIN department d ON dp.department_id = d.department_id
         $where
         ORDER BY p.program_code",
        $params
    );
    echo json_encode(['success' => true, 'data' => $programs]);
}

function handleGet() {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'ID required']); return; }

    $program = db()->fetchOne("SELECT * FROM program WHERE program_id = ?", [$id]);
    if (!$program) { echo json_encode(['success' => false, 'message' => 'Program not found']); return; }

    $deptLink = db()->fetchOne("SELECT department_id FROM department_program WHERE program_id = ? LIMIT 1", [$id]);
    $program['department_id'] = $deptLink ? $deptLink['department_id'] : null;

    echo json_encode(['success' => true, 'data' => $program]);
}

function handleCreate() {
    $data = json_decode(file_get_contents('php://input'), true);

    $deptId = (int)($data['department_id'] ?? 0);
    $code = trim($data['program_code'] ?? '');
    $name = trim($data['program_name'] ?? '');
    $totalUnits = (int)($data['total_units'] ?? 150);
    $description = trim($data['description'] ?? '');
    $status = $data['status'] ?? 'active';

    if (!$deptId || !$code || !$name) {
        echo json_encode(['success' => false, 'message' => 'Department, code, and name are required']);
        return;
    }

    $exists = db()->fetchOne("SELECT program_id FROM program WHERE program_code = ?", [$code]);
    if ($exists) { echo json_encode(['success' => false, 'message' => 'Program code already exists']); return; }

    try {
        $stmt = pdo()->prepare(
            "INSERT INTO program (department_id, program_name, program_code, total_units, description, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())"
        );
        $stmt->execute([$deptId, $name, $code, $totalUnits, $description, $status]);
        $newId = pdo()->lastInsertId();

        // Link to department
        $stmt2 = pdo()->prepare("INSERT INTO department_program (department_id, program_id) VALUES (?, ?)");
        $stmt2->execute([$deptId, $newId]);

        echo json_encode(['success' => true, 'message' => 'Program created successfully', 'data' => ['id' => $newId]]);
    } catch (Exception $e) {
        error_log('Create program error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create program']);
    }
}

function handleUpdate() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['program_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Program ID required']); return; }

    $deptId = (int)($data['department_id'] ?? 0);
    $code = trim($data['program_code'] ?? '');
    $name = trim($data['program_name'] ?? '');
    $totalUnits = (int)($data['total_units'] ?? 150);
    $description = trim($data['description'] ?? '');
    $status = $data['status'] ?? 'active';

    if (!$deptId || !$code || !$name) {
        echo json_encode(['success' => false, 'message' => 'Department, code, and name are required']);
        return;
    }

    $exists = db()->fetchOne("SELECT program_id FROM program WHERE program_code = ? AND program_id != ?", [$code, $id]);
    if ($exists) { echo json_encode(['success' => false, 'message' => 'Program code already exists']); return; }

    try {
        $stmt = pdo()->prepare("UPDATE program SET department_id=?, program_name=?, program_code=?, total_units=?, description=?, status=?, updated_at=NOW() WHERE program_id=?");
        $stmt->execute([$deptId, $name, $code, $totalUnits, $description, $status, $id]);

        // Re-sync department link
        pdo()->prepare("DELETE FROM department_program WHERE program_id = ?")->execute([$id]);
        pdo()->prepare("INSERT INTO department_program (department_id, program_id) VALUES (?, ?)")->execute([$deptId, $id]);

        echo json_encode(['success' => true, 'message' => 'Program updated successfully']);
    } catch (Exception $e) {
        error_log('Update program error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update program']);
    }
}

function handleDelete() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['program_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Program ID required']); return; }

    $activeUsers = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE program_id = ? AND status = 'active'", [$id])['count'] ?? 0;
    if ($activeUsers > 0) {
        echo json_encode(['success' => false, 'message' => "Cannot delete program with $activeUsers active user(s)"]);
        return;
    }

    try {
        $stmt = pdo()->prepare("UPDATE program SET status = 'inactive', updated_at = NOW() WHERE program_id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Program deactivated successfully']);
    } catch (Exception $e) {
        error_log('Delete program error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to deactivate program']);
    }
}

function handleArchive() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['program_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Program ID required']); return; }

    $activeUsers = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE program_id = ? AND status = 'active'", [$id])['count'] ?? 0;
    if ($activeUsers > 0) {
        echo json_encode(['success' => false, 'message' => "Cannot archive: program has {$activeUsers} active enrolled user(s)"]);
        return;
    }

    try {
        pdo()->prepare("UPDATE program SET status = 'archived', updated_at = NOW() WHERE program_id = ?")
             ->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Program archived']);
    } catch (Exception $e) {
        error_log('Archive program error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to archive program']);
    }
}

function handleDepartments() {
    $depts = db()->fetchAll("SELECT department_id, department_name FROM department WHERE status = 'active' ORDER BY department_name");
    echo json_encode(['success' => true, 'data' => $depts]);
}
