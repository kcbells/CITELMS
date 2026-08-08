<?php
/**
 * Departments API - CRUD for department management
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
$_deptPerms = [
    'list'     => 'departments.view',
    'get'      => 'departments.view',
    'campuses' => 'departments.view',
    'create'   => 'departments.create',
    'update'   => 'departments.edit',
    'delete'   => 'departments.delete',
];
if (isset($_deptPerms[$action]) && !Auth::can($_deptPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_deptPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'list': handleList(); break;
    case 'get': handleGet(); break;
    case 'create': handleCreate(); break;
    case 'update': handleUpdate(); break;
    case 'delete': handleDelete(); break;
    case 'campuses': handleCampuses(); break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/** Dean's campus_ids (multi-campus via dean_campus_scope), or [] if not a dean. */
function deanCampusIdsForDept(): array {
    if (Auth::role() !== 'dean') return [];
    static $ids = null;
    if ($ids === null) {
        $u = db()->fetchOne("SELECT campus_id FROM users WHERE users_id = ?", [Auth::id()]);
        $multi = db()->fetchAll("SELECT campus_id FROM dean_campus_scope WHERE dean_id = ?", [Auth::id()]);
        $ids   = array_map('intval', array_column($multi, 'campus_id'));
        if (!$ids && !empty($u['campus_id'])) $ids = [(int)$u['campus_id']];
    }
    return $ids;
}

function handleList() {
    $campusId = (int)($_GET['campus_id'] ?? 0);

    // Dean: always scoped to their own campus(es), ignoring any foreign campus_id request
    $deanCampusIds = deanCampusIdsForDept();
    $filterCampusIds = $deanCampusIds ?: ($campusId ? [$campusId] : []);

    $deanCampusFilter = '';
    $whereCampusClause = '';
    if ($filterCampusIds) {
        $ph = implode(',', array_fill(0, count($filterCampusIds), '?'));
        $deanCampusFilter  = "AND campus_id IN ($ph)";
        $whereCampusClause = "AND d.campus_id IN ($ph)";
    }

    // Params appear twice: once for the correlated subquery's filter, once for the outer WHERE
    $params = array_merge($filterCampusIds, $filterCampusIds);

    $depts = db()->fetchAll(
        "SELECT d.*,
            (SELECT COUNT(*) FROM department_program dp WHERE dp.department_id = d.department_id) as program_count,
            u.users_id AS dean_id,
            CONCAT_WS(' ',
                NULLIF(u.first_name,''),
                NULLIF(u.middle_name,''),
                NULLIF(u.last_name,''),
                NULLIF(u.suffix,'')
            ) AS dean_name,
            u.email AS dean_email
         FROM department d
         LEFT JOIN users u ON u.users_id = (
             SELECT users_id FROM users
             WHERE department_id = d.department_id
               AND role = 'dean' AND status = 'active'
               $deanCampusFilter
             ORDER BY created_at DESC LIMIT 1
         )
         WHERE d.status = 'active' $whereCampusClause
         ORDER BY d.department_name",
        $params
    );
    echo json_encode(['success' => true, 'data' => $depts]);
}

function handleGet() {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'ID required']); return; }

    $dept = db()->fetchOne("SELECT * FROM department WHERE department_id = ?", [$id]);
    if (!$dept) { echo json_encode(['success' => false, 'message' => 'Department not found']); return; }

    $deanCampusIds = deanCampusIdsForDept();
    if ($deanCampusIds && !in_array((int)$dept['campus_id'], $deanCampusIds, true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: department is not on your campus']);
        return;
    }

    echo json_encode(['success' => true, 'data' => $dept]);
}

function handleCreate() {
    $data = json_decode(file_get_contents('php://input'), true);

    $campusId    = (int)($data['campus_id'] ?? 1);
    $name        = trim($data['department_name'] ?? '');
    $description = trim($data['description'] ?? '');
    $status      = $data['status'] ?? 'active';
    $code        = trim($data['department_code'] ?? '') ?: deriveDeptCode($name);

    if (!$name) {
        echo json_encode(['success' => false, 'message' => 'Department name is required']);
        return;
    }

    try {
        $stmt = pdo()->prepare(
            "INSERT INTO department (campus_id, department_code, department_name, description, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())"
        );
        $stmt->execute([$campusId, $code, $name, $description, $status]);
        echo json_encode(['success' => true, 'message' => 'Department created successfully', 'data' => ['id' => pdo()->lastInsertId()]]);
    } catch (Exception $e) {
        error_log('Create department error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create department']);
    }
}

function handleUpdate() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['department_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Department ID required']); return; }

    $campusId    = (int)($data['campus_id'] ?? 1);
    $name        = trim($data['department_name'] ?? '');
    $description = trim($data['description'] ?? '');
    $status      = $data['status'] ?? 'active';
    $code        = trim($data['department_code'] ?? '') ?: deriveDeptCode($name);

    if (!$name) {
        echo json_encode(['success' => false, 'message' => 'Department name is required']);
        return;
    }

    try {
        $stmt = pdo()->prepare(
            "UPDATE department SET campus_id=?, department_code=?, department_name=?, description=?, status=?, updated_at=NOW() WHERE department_id=?"
        );
        $stmt->execute([$campusId, $code, $name, $description, $status, $id]);
        echo json_encode(['success' => true, 'message' => 'Department updated successfully']);
    } catch (Exception $e) {
        error_log('Update department error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update department']);
    }
}

function deriveDeptCode(string $name): string {
    $skip = ['of', 'and', 'the', 'for', 'in', 'at', 'a'];
    $words = preg_split('/\s+/', $name);
    $code  = '';
    foreach ($words as $w) {
        if (!in_array(strtolower($w), $skip)) $code .= strtoupper($w[0] ?? '');
    }
    return $code ?: strtoupper(substr($name, 0, 4));
}

function handleDelete() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['department_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Department ID required']); return; }

    $activePrograms = db()->fetchOne(
        "SELECT COUNT(*) as count FROM department_program dp JOIN program p ON dp.program_id = p.program_id WHERE dp.department_id = ? AND p.status = 'active'",
        [$id]
    )['count'] ?? 0;

    if ($activePrograms > 0) {
        echo json_encode(['success' => false, 'message' => "Cannot delete department with $activePrograms active program(s)"]);
        return;
    }

    try {
        $stmt = pdo()->prepare("UPDATE department SET status = 'inactive', updated_at = NOW() WHERE department_id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Department deactivated successfully']);
    } catch (Exception $e) {
        error_log('Delete department error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to deactivate department']);
    }
}

function handleCampuses() {
    $campuses = db()->fetchAll("SELECT campus_id, campus_name FROM campus ORDER BY campus_name");
    echo json_encode(['success' => true, 'data' => $campuses]);
}
