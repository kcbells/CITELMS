<?php
/**
 * Users API - CRUD for user management
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/Sanitize.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

function logActivity($userId, $activityType, $description) {
    try {
        db()->execute(
            "INSERT INTO activity_logs (users_id, activity_type, activity_description, created_at)
             VALUES (?, ?, ?, NOW())",
            [$userId, $activityType, $description]
        );
    } catch (Exception $e) {
        error_log('Activity log error: ' . $e->getMessage());
    }
}

// Dean can list/view/create instructors in their campus
$isDean = Auth::role() === 'dean';
$deanAllowed = ['list', 'get', 'programs', 'departments', 'campuses', 'create', 'update', 'deactivate', 'set-password'];

$_userPerms = [
    'list'         => 'users.view',
    'get'          => 'users.view',
    'departments'  => 'users.view',
    'programs'     => 'users.view',
    'campuses'     => 'users.view',
    'create'       => 'users.create',
    'update'       => 'users.edit',
    'delete'       => 'users.delete',
    'activate'     => 'users.edit',
    'deactivate'   => 'users.edit',
    'set-password' => 'users.edit',
    'activity-log' => 'users.view',
];

if (isset($_userPerms[$action]) && !Auth::can($_userPerms[$action]) && !($isDean && in_array($action, $deanAllowed))) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_userPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'list':        handleList();        break;
    case 'get':         handleGet();         break;
    case 'create':      handleCreate();      break;
    case 'update':      handleUpdate();      break;
    case 'delete':      handleDelete();      break;
    case 'activate':    handleActivate();    break;
    case 'deactivate':  handleDeactivate();  break;
    case 'departments': handleDepartments(); break;
    case 'programs':    handlePrograms();    break;
    case 'campuses':      handleCampuses();      break;
    case 'set-password':  handleSetPassword();   break;
    case 'activity-log':  handleActivityLog();   break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ── helpers ───────────────────────────────────────────────────────────────

function ensureNameColumns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $cols = array_column(pdo()->query("SHOW COLUMNS FROM users")->fetchAll(\PDO::FETCH_ASSOC), 'Field');
        if (!in_array('middle_name', $cols))
            pdo()->exec("ALTER TABLE users ADD COLUMN middle_name VARCHAR(80) NULL AFTER first_name");
        if (!in_array('suffix', $cols))
            pdo()->exec("ALTER TABLE users ADD COLUMN suffix VARCHAR(20) NULL AFTER last_name");
    } catch (\Exception $e) { error_log('ensureNameColumns: ' . $e->getMessage()); }
}

function ensureDeanCampusScopeTable(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS dean_campus_scope (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            dean_id   INT NOT NULL,
            campus_id INT NOT NULL,
            UNIQUE KEY uk_dean_campus (dean_id, campus_id),
            INDEX idx_dean (dean_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {
        error_log('ensureDeanCampusScopeTable: ' . $e->getMessage());
    }
}

function deanCampusId() {
    return deanScope()['campus_id'];
}

function deanScope(): array {
    static $s = null;
    if ($s !== null) return $s;
    $row = db()->fetchOne("SELECT campus_id, department_id, program_id FROM users WHERE users_id = ?", [Auth::id()]);

    ensureDeanCampusScopeTable();
    $multiRows  = db()->fetchAll("SELECT campus_id FROM dean_campus_scope WHERE dean_id = ?", [Auth::id()]);
    $campusIds  = array_map('intval', array_column($multiRows, 'campus_id'));
    $primaryId  = (int)($row['campus_id'] ?? 0);
    if (empty($campusIds) && $primaryId) $campusIds = [$primaryId];

    $s = [
        'campus_id'     => $primaryId,
        'campus_ids'    => $campusIds,
        'department_id' => (int)($row['department_id'] ?? 0),
        'program_id'    => (int)($row['program_id'] ?? 0),
    ];
    return $s;
}

function saveDeanCampusScope(int $deanId, array $campusIds): void {
    ensureDeanCampusScopeTable();
    try {
        $pdo = pdo();
        $pdo->prepare("DELETE FROM dean_campus_scope WHERE dean_id = ?")->execute([$deanId]);
        if (count($campusIds) > 1) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO dean_campus_scope (dean_id, campus_id) VALUES (?, ?)");
            foreach ($campusIds as $cid) {
                if ($cid) $stmt->execute([$deanId, $cid]);
            }
        }
    } catch (Exception $e) {
        error_log('saveDeanCampusScope: ' . $e->getMessage());
    }
}

function getDeanCampusIds(int $deanId): array {
    ensureDeanCampusScopeTable();
    $rows = db()->fetchAll("SELECT campus_id FROM dean_campus_scope WHERE dean_id = ?", [$deanId]);
    return array_map('intval', array_column($rows, 'campus_id'));
}

// ── handlers ──────────────────────────────────────────────────────────────

/**
 * GET ?action=activity-log — recent activity across the whole system (logins,
 * registrations, password changes, etc. — see every logActivity() call).
 * Admin-only regardless of RBAC grants: this spans every campus/department,
 * unlike the rest of this file's dean-scoped actions, so it must never be
 * reachable by a dean even if 'users.view' happens to be granted to them.
 */
function handleActivityLog() {
    if (Auth::role() !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Admin only']);
        return;
    }

    $search   = trim($_GET['search'] ?? '');
    $type     = trim($_GET['activity_type'] ?? '');
    $page     = max(1, (int)($_GET['page'] ?? 1));
    $perPage  = min(100, max(1, (int)($_GET['per_page'] ?? 30)));
    $offset   = ($page - 1) * $perPage;

    $where  = [];
    $params = [];
    if ($search !== '') {
        $where[]  = "(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR al.activity_description LIKE ?)";
        $s = "%$search%";
        array_push($params, $s, $s, $s, $s);
    }
    if ($type !== '') {
        $where[]  = "al.activity_type = ?";
        $params[] = $type;
    }
    $whereSQL = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $total = (int)(db()->fetchOne(
        "SELECT COUNT(*) AS c FROM activity_logs al LEFT JOIN users u ON u.users_id = al.users_id $whereSQL",
        $params
    )['c'] ?? 0);

    $logs = db()->fetchAll(
        "SELECT al.log_id, al.activity_type, al.activity_description, al.created_at,
                al.users_id, u.first_name, u.last_name, u.email, u.role
         FROM activity_logs al
         LEFT JOIN users u ON u.users_id = al.users_id
         $whereSQL
         ORDER BY al.created_at DESC, al.log_id DESC
         LIMIT $perPage OFFSET $offset",
        $params
    );

    // Distinct activity types seen overall (not just this page/filter) — lets
    // the frontend populate a type filter dropdown without a separate call.
    $types = array_column(db()->fetchAll(
        "SELECT DISTINCT activity_type FROM activity_logs ORDER BY activity_type"
    ), 'activity_type');

    echo json_encode(['success' => true, 'data' => [
        'logs'        => $logs,
        'types'       => $types,
        'total'       => $total,
        'page'        => $page,
        'per_page'    => $perPage,
        'total_pages' => (int)ceil($total / $perPage),
    ]]);
}

function handleList() {
    $search     = $_GET['search']        ?? '';
    $role       = $_GET['role']          ?? '';
    $status     = $_GET['status']        ?? '';
    $deptId     = $_GET['department_id'] ?? '';
    $programId  = $_GET['program_id']    ?? '';
    $campusId   = $_GET['campus_id']     ?? '';
    $page       = max(1, (int)($_GET['page'] ?? 1));
    $perPage    = min(100, max(1, (int)($_GET['per_page'] ?? 20)));

    $where  = [];
    $params = [];

    // Dean: scope to their campus/campuses + department only
    if (Auth::role() === 'dean') {
        $scope = deanScope();
        $cids  = $scope['campus_ids'];
        if (count($cids) === 1) {
            $where[] = 'u.campus_id = ?'; $params[] = $cids[0];
        } elseif (count($cids) > 1) {
            $ph = implode(',', array_fill(0, count($cids), '?'));
            $where[] = "u.campus_id IN ($ph)";
            $params   = array_merge($params, $cids);
        }
        if ($scope['department_id']) {
            // Match by direct dept column OR by program linked to that dept (covers instructors
            // created before dept was enforced on the user row)
            $where[]  = '(u.department_id = ? OR (u.program_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM department_program dp
                WHERE dp.program_id = u.program_id AND dp.department_id = ?
            )))';
            $params[] = $scope['department_id'];
            $params[] = $scope['department_id'];
        }
    } elseif ($campusId) {
        $where[] = 'u.campus_id = ?'; $params[] = $campusId;
    }

    if ($search) {
        $where[] = "(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ? OR u.student_id LIKE ?)";
        $s = "%$search%";
        $params = array_merge($params, [$s, $s, $s, $s, $s]);
    }
    if ($role) {
        $roles = array_values(array_filter(array_map('trim', explode(',', $role))));
        if (count($roles) === 1) {
            $where[] = 'u.role = ?'; $params[] = $roles[0];
        } elseif (count($roles) > 1) {
            $ph = implode(',', array_fill(0, count($roles), '?'));
            $where[] = "u.role IN ($ph)";
            $params  = array_merge($params, $roles);
        }
    }
    if ($status)    { $where[] = 'u.status = ?';        $params[] = $status; }
    if ($deptId)    { $where[] = 'u.department_id = ?'; $params[] = $deptId; }
    if ($programId) { $where[] = 'u.program_id = ?';    $params[] = $programId; }

    $whereSQL = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    ensureNameColumns();

    $total = (int)(db()->fetchOne(
        "SELECT COUNT(*) as c FROM users u $whereSQL",
        $params
    )['c'] ?? 0);

    $totalPages = max(1, (int)ceil($total / $perPage));
    $page       = min($page, $totalPages);
    $offset     = ($page - 1) * $perPage;

    // export=1: return every matching row (still respecting filters), skip pagination
    $isExport = !empty($_GET['export']);
    $limitSQL = $isExport ? '' : "LIMIT $perPage OFFSET $offset";

    $users = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email, u.role, u.status,
                u.employee_id, u.student_id, u.department_id, u.program_id,
                u.campus_id, u.year_level, u.year_level_from, u.year_level_to, u.created_at,
                u.password IS NULL AS never_logged_in, u.must_change_password AS on_temp_password,
                d.department_name, p.program_code, p.program_name,
                c.campus_name, c.campus_code
         FROM users u
         LEFT JOIN department  d ON u.department_id = d.department_id
         LEFT JOIN program     p ON u.program_id    = p.program_id
         LEFT JOIN campus      c ON u.campus_id     = c.campus_id
         $whereSQL
         ORDER BY u.created_at DESC
         $limitSQL",
        $params
    );

    echo json_encode(['success' => true, 'data' => [
        'users'       => $users,
        'total'       => $total,
        'page'        => $page,
        'per_page'    => $perPage,
        'total_pages' => $totalPages,
    ]]);
}

function handleGet() {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'ID required']); return; }

    $user = db()->fetchOne(
        "SELECT u.*, c.campus_name, c.campus_code
         FROM users u
         LEFT JOIN campus c ON u.campus_id = c.campus_id
         WHERE u.users_id = ?",
        [$id]
    );
    if (!$user) { echo json_encode(['success' => false, 'message' => 'User not found']); return; }
    unset($user['password']);
    // For dean users, include multi-campus IDs
    if ($user['role'] === 'dean') {
        $user['campus_ids'] = getDeanCampusIds((int)$user['users_id']);
    }
    echo json_encode(['success' => true, 'data' => $user]);
}

function handleCreate() {
    ensureNameColumns();
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $firstName  = Sanitize::text($data['first_name']  ?? '');
    $middleName = Sanitize::text($data['middle_name'] ?? '') ?: null;
    $lastName     = Sanitize::text($data['last_name']         ?? '');
    $suffix       = Sanitize::text($data['suffix']            ?? '') ?: null;
    $email        = trim($data['email']             ?? '');
    $password     = $data['password']               ?? '';
    $departmentId = ($data['department_id'] ?? null) ?: null;
    $programId    = ($data['program_id']    ?? null) ?: null;
    $employeeId   = trim($data['employee_id']        ?? '');
    $studentId    = trim($data['student_id']         ?? '');
    $yearLevel    = ($data['year_level']    ?? null) ?: null;
    // Program Head supervision scope (e.g. "handles 1st-2nd year of BSN")
    $yearLevelFrom = ($data['year_level_from'] ?? null) !== null && $data['year_level_from'] !== ''
        ? max(1, min(4, (int)$data['year_level_from'])) : null;
    $yearLevelTo   = ($data['year_level_to']   ?? null) !== null && $data['year_level_to']   !== ''
        ? max(1, min(4, (int)$data['year_level_to']))   : null;

    $isAdmin = Auth::hasRole('admin');
    $isDean  = Auth::role() === 'dean';

    // Determine role & status
    $allowedRoles    = ['admin', 'dean', 'program_head', 'instructor', 'student'];
    $allowedStatuses = ['active', 'inactive', 'suspended'];

    if ($isAdmin) {
        $role     = in_array($data['role']   ?? '', $allowedRoles)    ? $data['role']   : 'student';
        $status   = in_array($data['status'] ?? '', $allowedStatuses) ? $data['status'] : 'active';
        $campusId = $data['campus_id'] ?: null;
    } elseif ($isDean) {
        // Dean can create instructor or program head accounts in their own campus/department
        $scope         = deanScope();
        $requestedRole = $data['role'] ?? 'instructor';
        $role          = in_array($requestedRole, ['instructor', 'program_head'], true) ? $requestedRole : 'instructor';
        $status        = 'active';
        $campusId = $scope['campus_id'] ?: null;
        // Always anchor the new instructor to the dean's own department
        if ($scope['department_id']) $departmentId = $scope['department_id'];
        // Use dean's program as default if one is set on their account
        $programId = $scope['program_id'] ?: $programId;
        if (!$campusId) {
            echo json_encode(['success' => false, 'message' => 'Your account is not assigned to a campus.']);
            return;
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Permission denied.']);
        return;
    }

    // Deans created by admin get no password — they set it on first login
    $requirePassword = !($role === 'dean' && $isAdmin);
    if (!$firstName || !$lastName || !$email || ($requirePassword && !$password)) {
        echo json_encode(['success' => false, 'message' => 'First name, last name, email, and password are required']);
        return;
    }
    if ($requirePassword || $password) {
        $pwError = Auth::validatePasswordStrength($password);
        if ($pwError) {
            echo json_encode(['success' => false, 'message' => $pwError]);
            return;
        }
    }
    $passwordHash = $password ? password_hash($password, PASSWORD_DEFAULT) : null;

    // Auto-sync department from program (admin path only — dean dept is already forced
    // above when a dean is the actor, AND must never apply when the account being
    // CREATED is itself a dean: a dean manages a department directly, chosen explicitly
    // in the form, and should never be silently overwritten by a program's mapped
    // department — that was the bug behind "new dean doesn't show up under the
    // department I picked").
    if ($programId && !$isDean && $role !== 'dean') {
        $progDept = db()->fetchOne("SELECT department_id FROM department_program WHERE program_id = ? LIMIT 1", [$programId]);
        if ($progDept) $departmentId = $progDept['department_id'];
    }

    if (db()->fetchOne("SELECT users_id FROM users WHERE email = ?", [$email])) {
        echo json_encode(['success' => false, 'message' => 'Email already exists']);
        return;
    }
    if ($employeeId && db()->fetchOne("SELECT users_id FROM users WHERE employee_id = ?", [$employeeId])) {
        echo json_encode(['success' => false, 'message' => 'Employee ID already exists']);
        return;
    }

    // Multi-campus scope for deans
    $campusIds = [];
    if ($role === 'dean' && $isAdmin) {
        $submitted = $data['campus_ids'] ?? [];
        $campusIds = is_array($submitted) ? array_map('intval', array_filter($submitted)) : [];
        // Use primary campus_id as home campus
        if (!$campusId && !empty($campusIds)) $campusId = $campusIds[0];
    }

    try {
        pdo()->prepare(
            "INSERT INTO users
             (first_name, middle_name, last_name, suffix, email, password, role, status,
              campus_id, department_id, program_id, employee_id, student_id, year_level,
              year_level_from, year_level_to,
              created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
        )->execute([
            $firstName, $middleName, $lastName, $suffix, $email,
            $passwordHash,
            $role, $status, $campusId, $departmentId, $programId,
            $employeeId ?: null, $studentId ?: null, $yearLevel,
            $role === 'program_head' ? $yearLevelFrom : null,
            $role === 'program_head' ? $yearLevelTo   : null,
        ]);
        $newId = (int)pdo()->lastInsertId();

        // Save multi-campus scope for new dean
        if ($role === 'dean' && count($campusIds) > 1) {
            saveDeanCampusScope($newId, $campusIds);
        }

        // Deactivate previous active dean(s) for this department+campus so they don't
        // create duplicate rows in the department list or block the new dean from seeing data
        if ($role === 'dean' && $isAdmin && $departmentId) {
            pdo()->prepare(
                "UPDATE users SET status = 'inactive', updated_at = NOW()
                 WHERE role = 'dean' AND department_id = ? AND campus_id = ?
                   AND status = 'active' AND users_id != ?"
            )->execute([$departmentId, $campusId, $newId]);
        }

        $roleLabels = ['dean' => 'Dean', 'program_head' => 'Program Head', 'admin' => 'Admin', 'student' => 'Student'];
        $msg = ($roleLabels[$role] ?? 'Instructor') . ' account created successfully.';
        http_response_code(201);
        echo json_encode(['success' => true, 'message' => $msg, 'data' => ['id' => $newId]]);
    } catch (Exception $e) {
        error_log('Create user error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create user']);
    }
}

function handleUpdate() {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $id   = (int)($data['users_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'User ID required']); return; }

    $current = db()->fetchOne("SELECT role, status, campus_id, program_id FROM users WHERE users_id = ?", [$id]);
    if (!$current) { echo json_encode(['success' => false, 'message' => 'User not found']); return; }

    $isAdmin = Auth::hasRole('admin');
    $isDean  = Auth::role() === 'dean';

    // Dean can only edit instructors/program heads in their own campus(es)+department
    if ($isDean) {
        $scope = deanScope();
        $inScope = in_array((int)$current['campus_id'], $scope['campus_ids'])
                   && ($scope['department_id']
                       ? db()->fetchOne("SELECT 1 FROM users WHERE users_id = ? AND department_id = ?", [$id, $scope['department_id']])
                       : true);
        if (!in_array($current['role'], ['instructor', 'program_head']) || !$inScope) {
            echo json_encode(['success' => false, 'message' => 'You can only edit faculty in your department.']);
            return;
        }
    }

    ensureNameColumns();
    $firstName  = Sanitize::text($data['first_name']  ?? '');
    $middleName = Sanitize::text($data['middle_name'] ?? '') ?: null;
    $lastName   = Sanitize::text($data['last_name']   ?? '');
    $suffix     = Sanitize::text($data['suffix']      ?? '') ?: null;
    $email      = trim($data['email']       ?? '');
    $password     = $data['password']               ?? '';
    $departmentId = ($data['department_id'] ?? null) ?: null;
    $programId    = ($data['program_id']    ?? null) ?: null;
    $employeeId   = trim($data['employee_id']        ?? '');
    $studentId    = trim($data['student_id']         ?? '');
    $yearLevel    = ($data['year_level']    ?? null) ?: null;

    $allowedRoles    = ['admin', 'dean', 'program_head', 'instructor', 'student'];
    $allowedStatuses = ['active', 'inactive', 'suspended'];
    $role     = $isAdmin && in_array($data['role']   ?? '', $allowedRoles)    ? $data['role']   : $current['role'];
    $status   = in_array($data['status'] ?? '', $allowedStatuses) ? $data['status'] : $current['status'];
    $campusId = $isAdmin ? ($data['campus_id'] ?: $current['campus_id']) : $current['campus_id'];
    if (!$isAdmin) $role = $current['role'];

    if (!$firstName || !$lastName || !$email) {
        echo json_encode(['success' => false, 'message' => 'First name, last name, and email are required']); return;
    }

    if ($programId) {
        $progDept = db()->fetchOne("SELECT department_id FROM department_program WHERE program_id = ? LIMIT 1", [$programId]);
        if ($progDept) $departmentId = $progDept['department_id'];
    }

    if (db()->fetchOne("SELECT users_id FROM users WHERE email = ? AND users_id != ?", [$email, $id])) {
        echo json_encode(['success' => false, 'message' => 'Email already exists']); return;
    }

    if ($password) {
        $pwError = Auth::validatePasswordStrength($password);
        if ($pwError) { echo json_encode(['success' => false, 'message' => $pwError]); return; }
    }

    // Multi-campus scope for deans
    $campusIds = [];
    if ($role === 'dean' && $isAdmin) {
        $submitted = $data['campus_ids'] ?? [];
        $campusIds = is_array($submitted) ? array_map('intval', array_filter($submitted)) : [];
        if (!empty($campusIds)) $campusId = $campusIds[0]; // home campus = first selected
    }

    try {
        if ($password) {
            pdo()->prepare(
                "UPDATE users SET first_name=?, middle_name=?, last_name=?, suffix=?, email=?, password=?, role=?, status=?,
                 campus_id=?, department_id=?, program_id=?, employee_id=?, student_id=?, year_level=?, updated_at=NOW()
                 WHERE users_id=?"
            )->execute([$firstName, $middleName, $lastName, $suffix, $email, password_hash($password, PASSWORD_DEFAULT), $role, $status, $campusId, $departmentId, $programId, $employeeId ?: null, $studentId ?: null, $yearLevel, $id]);
        } else {
            pdo()->prepare(
                "UPDATE users SET first_name=?, middle_name=?, last_name=?, suffix=?, email=?, role=?, status=?,
                 campus_id=?, department_id=?, program_id=?, employee_id=?, student_id=?, year_level=?, updated_at=NOW()
                 WHERE users_id=?"
            )->execute([$firstName, $middleName, $lastName, $suffix, $email, $role, $status, $campusId, $departmentId, $programId, $employeeId ?: null, $studentId ?: null, $yearLevel, $id]);
        }

        // Save multi-campus scope if this is a dean update by admin
        if ($role === 'dean' && $isAdmin) {
            saveDeanCampusScope($id, $campusIds);
        }

        echo json_encode(['success' => true, 'message' => 'User updated successfully']);
    } catch (Exception $e) {
        error_log('Update user error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update user']);
    }
}

function handleDelete() {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $id   = (int)($data['users_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'User ID required']); return; }
    if ($id == Auth::id()) { echo json_encode(['success' => false, 'message' => 'Cannot deactivate your own account']); return; }
    try {
        pdo()->prepare("UPDATE users SET status='inactive', updated_at=NOW() WHERE users_id=?")->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'User deactivated successfully']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to deactivate user']);
    }
}

function handleDeactivate() {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $id   = (int)($data['users_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'User ID required']); return; }
    if ($id == Auth::id()) { echo json_encode(['success' => false, 'message' => 'Cannot deactivate your own account']); return; }

    $isDean = Auth::role() === 'dean';
    if ($isDean) {
        $scope  = deanScope();
        $target = db()->fetchOne("SELECT role, campus_id, department_id, program_id FROM users WHERE users_id = ?", [$id]);
        $inScope = $target
            && in_array((int)$target['campus_id'], $scope['campus_ids'])
            && ($scope['department_id']
                ? ((int)$target['department_id'] === (int)$scope['department_id']
                    || ($target['program_id'] && db()->fetchOne(
                        "SELECT 1 FROM department_program WHERE program_id = ? AND department_id = ?",
                        [$target['program_id'], $scope['department_id']]
                    )))
                : true);
        if (!$target || !in_array($target['role'], ['instructor', 'program_head']) || !$inScope) {
            echo json_encode(['success' => false, 'message' => 'You can only deactivate faculty in your department.']); return;
        }
    }
    try {
        $newStatus = (($data['status'] ?? 'inactive') === 'active') ? 'active' : 'inactive';
        pdo()->prepare("UPDATE users SET status=?, updated_at=NOW() WHERE users_id=?")->execute([$newStatus, $id]);
        echo json_encode(['success' => true, 'message' => 'User status updated']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to update status']);
    }
}

function handleActivate() {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $id    = (int)($input['users_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'User ID required']); return; }
    $user = db()->fetchOne("SELECT users_id, status FROM users WHERE users_id = ?", [$id]);
    if (!$user) { echo json_encode(['success' => false, 'message' => 'User not found']); return; }
    db()->execute("UPDATE users SET status='active', updated_at=NOW() WHERE users_id=?", [$id]);
    echo json_encode(['success' => true, 'message' => 'Account activated.']);
}

function handleSetPassword() {
    $data     = json_decode(file_get_contents('php://input'), true) ?: [];
    $id       = (int)($data['users_id'] ?? 0);
    $password = $data['new_password'] ?? '';

    if (!$id)       { echo json_encode(['success' => false, 'message' => 'User ID required']); return; }
    if (!$password) { echo json_encode(['success' => false, 'message' => 'New password is required']); return; }

    $pwError = Auth::validatePasswordStrength($password);
    if ($pwError) { echo json_encode(['success' => false, 'message' => $pwError]); return; }

    $target = db()->fetchOne("SELECT users_id, role, campus_id, program_id FROM users WHERE users_id = ?", [$id]);
    if (!$target) { echo json_encode(['success' => false, 'message' => 'User not found']); return; }

    // Dean scope: can only reset passwords of instructors in their program
    if (Auth::role() === 'dean') {
        $scope = deanScope();
        if ($target['role'] !== 'instructor'
            || $target['campus_id'] != $scope['campus_id']
            || $target['program_id'] != $scope['program_id']
        ) {
            echo json_encode(['success' => false, 'message' => 'You can only change passwords for instructors in your program.']); return;
        }
    }

    try {
        db()->execute(
            "UPDATE users SET password = ?, updated_at = NOW() WHERE users_id = ?",
            [password_hash($password, PASSWORD_DEFAULT), $id]
        );
        echo json_encode(['success' => true, 'message' => 'Password updated successfully.']);
        try {
            logActivity(Auth::id(), 'admin_password_reset', "Password changed for user #$id by admin/dean");
        } catch (Throwable $logErr) {
            error_log('set-password activity log: ' . $logErr->getMessage());
        }
    } catch (Exception $e) {
        error_log('set-password: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update password']);
    }
}

function handleDepartments() {
    if (Auth::role() === 'dean') {
        // Dean: return their own department directly via their department_id
        $scope  = deanScope();
        $deptId = $scope['department_id'];
        $depts  = $deptId ? db()->fetchAll(
            "SELECT d.department_id, d.department_name, d.department_code, d.campus_id, c.campus_name
             FROM department d
             LEFT JOIN campus c ON d.campus_id = c.campus_id
             WHERE d.department_id = ? AND d.status = 'active'",
            [$deptId]
        ) : [];
        echo json_encode(['success' => true, 'data' => $depts]);
        return;
    }

    $campusId = $_GET['campus_id'] ?? '';
    $where  = ["d.status = 'active'"];
    $params = [];
    if ($campusId) { $where[] = 'd.campus_id = ?'; $params[] = $campusId; }

    $depts = db()->fetchAll(
        "SELECT d.department_id, d.department_name, d.department_code, d.campus_id, c.campus_name
         FROM department d
         LEFT JOIN campus c ON d.campus_id = c.campus_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY d.department_name",
        $params
    );
    echo json_encode(['success' => true, 'data' => $depts]);
}

function handlePrograms() {
    if (Auth::role() === 'dean') {
        // Dean: return all programs linked to their department via department_program
        $scope  = deanScope();
        $deptId = $scope['department_id'];
        if ($deptId) {
            $programs = db()->fetchAll(
                "SELECT p.program_id, p.program_code, p.program_name, p.department_id, d.campus_id
                 FROM program p
                 JOIN department_program dp ON dp.program_id = p.program_id AND dp.department_id = ?
                 JOIN department d ON d.department_id = p.department_id
                 WHERE p.status = 'active'
                 ORDER BY p.program_code",
                [$deptId]
            );
        } elseif ($scope['program_id']) {
            // Fallback: dean has a specific program_id on their user record
            $programs = db()->fetchAll(
                "SELECT p.program_id, p.program_code, p.program_name, p.department_id, d.campus_id
                 FROM program p
                 JOIN department d ON d.department_id = p.department_id
                 WHERE p.program_id = ? AND p.status = 'active'",
                [$scope['program_id']]
            );
        } else {
            $programs = [];
        }
        echo json_encode(['success' => true, 'data' => $programs]);
        return;
    }

    $where  = ["p.status = 'active'"];
    $params = [];
    if (!empty($_GET['campus_id'])) {
        $where[] = 'd.campus_id = ?';
        $params[] = $_GET['campus_id'];
    }
    if (!empty($_GET['department_id'])) {
        $where[] = 'p.department_id = ?';
        $params[] = $_GET['department_id'];
    }

    $programs = db()->fetchAll(
        "SELECT p.program_id, p.program_code, p.program_name, p.department_id, d.campus_id
         FROM program p
         JOIN department d ON d.department_id = p.department_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY p.program_code",
        $params
    );
    echo json_encode(['success' => true, 'data' => $programs]);
}

function handleCampuses() {
    $campuses = db()->fetchAll(
        "SELECT campus_id, campus_name, campus_code, address FROM campus WHERE status='active' ORDER BY campus_name"
    );
    echo json_encode(['success' => true, 'data' => $campuses]);
}
