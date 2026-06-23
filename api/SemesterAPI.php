<?php
/**
 * Semester API — list, create, update semesters (School Year records)
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

// Only admins can modify; anyone logged in can list
$action = $_GET['action'] ?? 'list';

switch ($action) {
    case 'list':       handleList();       break;
    case 'create':     handleCreate();     break;
    case 'update':     handleUpdate();     break;
    case 'delete':     handleDelete();     break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Auto-activate semester by today's date ───────────────────────────────
// Only runs when NO semester is currently active (e.g. fresh install).
// Never overrides a manually-set active semester.

function autoActivateSemester() {
    // If admin has already set an active semester, respect that choice
    $current = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
    if ($current) return;

    // No active semester — try to find one whose date range covers today
    $today = date('Y-m-d');
    $match = db()->fetchOne(
        "SELECT semester_id FROM semester
         WHERE start_date IS NOT NULL AND end_date IS NOT NULL
           AND start_date <= ? AND end_date >= ?
         ORDER BY start_date DESC LIMIT 1",
        [$today, $today]
    );

    if (!$match) return;

    // Activate the date-matched semester
    pdo()->prepare("UPDATE semester SET status = 'inactive' WHERE semester_id != ?")->execute([$match['semester_id']]);
    pdo()->prepare("UPDATE semester SET status = 'active'   WHERE semester_id  = ?")->execute([$match['semester_id']]);
}

// ─── List all semesters (newest first) ────────────────────────────────────

function handleList() {
    autoActivateSemester();

    // GROUP BY deduplicates rows from old migrations that ran multiple times.
    // Promotes 'active' status if any duplicate has it; keeps MIN semester_id.
    $semesters = db()->fetchAll(
        "SELECT MIN(sem.semester_id) AS semester_id,
                MIN(sem.semester_name) AS semester_name,
                sem.academic_year,
                MIN(sem.start_date) AS start_date,
                MAX(sem.end_date)   AS end_date,
                MAX(CASE sem.status
                    WHEN 'active'   THEN 'active'
                    WHEN 'upcoming' THEN 'upcoming'
                    ELSE 'inactive' END) AS status,
                st.sem_level
         FROM semester sem
         LEFT JOIN sem_type st ON st.sem_type_id = sem.sem_type_id
         GROUP BY sem.academic_year, sem.sem_type_id, st.sem_level
         ORDER BY sem.academic_year DESC, st.sem_level ASC"
    );
    echo json_encode(['success' => true, 'data' => $semesters]);
}

// ─── Create new semester ───────────────────────────────────────────────────

function handleCreate() {
    if (!Auth::isAdmin()) {
        echo json_encode(['success' => false, 'message' => 'Admin only']); return;
    }

    $data       = json_decode(file_get_contents('php://input'), true) ?? [];
    $name       = trim($data['semester_name']  ?? '');
    $acadYear   = trim($data['academic_year']  ?? '');
    $startDate  = $data['start_date'] ?? null;
    $endDate    = $data['end_date']   ?? null;
    $status     = in_array($data['status'] ?? '', ['active','inactive','upcoming'])
                    ? $data['status'] : 'upcoming';
    $semLevel   = (int)($data['sem_level'] ?? 1); // 1=1st, 2=2nd, 3=Summer

    if (!$name || !$acadYear) {
        echo json_encode(['success' => false, 'message' => 'Semester name and academic year are required']);
        return;
    }

    // Validate academic year format (e.g., 2025-2026)
    if (!preg_match('/^\d{4}-\d{4}$/', $acadYear)) {
        echo json_encode(['success' => false, 'message' => 'Academic year must be in format YYYY-YYYY (e.g. 2025-2026)']);
        return;
    }

    // Get sem_type_id for the given level
    $semType = db()->fetchOne("SELECT sem_type_id FROM sem_type WHERE sem_level = ?", [$semLevel]);
    if (!$semType) {
        echo json_encode(['success' => false, 'message' => 'Invalid semester level']);
        return;
    }

    // Check duplicate
    $exists = db()->fetchOne(
        "SELECT semester_id FROM semester WHERE academic_year = ? AND sem_type_id = ?",
        [$acadYear, $semType['sem_type_id']]
    );
    if ($exists) {
        echo json_encode(['success' => false, 'message' => 'This semester already exists for the selected academic year']);
        return;
    }

    // If setting as active, deactivate others
    if ($status === 'active') {
        pdo()->prepare("UPDATE semester SET status = 'inactive' WHERE status = 'active'")->execute([]);
    }

    try {
        pdo()->prepare(
            "INSERT INTO semester (semester_name, academic_year, start_date, end_date, status, sem_type_id)
             VALUES (?, ?, ?, ?, ?, ?)"
        )->execute([$name, $acadYear, $startDate ?: null, $endDate ?: null, $status, $semType['sem_type_id']]);

        echo json_encode(['success' => true, 'message' => 'Semester created']);
    } catch (Exception $e) {
        error_log('SemesterAPI create: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create semester']);
    }
}

// ─── Update a semester ─────────────────────────────────────────────────────

function handleUpdate() {
    if (!Auth::isAdmin()) {
        echo json_encode(['success' => false, 'message' => 'Admin only']); return;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id   = (int)($data['semester_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'semester_id required']); return; }

    $name      = trim($data['semester_name'] ?? '');
    $acadYear  = trim($data['academic_year'] ?? '');
    $startDate = $data['start_date'] ?? null;
    $endDate   = $data['end_date']   ?? null;
    $status    = in_array($data['status'] ?? '', ['active','inactive','upcoming'])
                    ? $data['status'] : 'inactive';

    if (!$name || !$acadYear) {
        echo json_encode(['success' => false, 'message' => 'Semester name and academic year are required']);
        return;
    }

    // If setting as active, deactivate all others first
    if ($status === 'active') {
        pdo()->prepare("UPDATE semester SET status = 'inactive' WHERE status = 'active' AND semester_id != ?")->execute([$id]);
    }

    try {
        pdo()->prepare(
            "UPDATE semester SET semester_name = ?, academic_year = ?, start_date = ?, end_date = ?, status = ?
             WHERE semester_id = ?"
        )->execute([$name, $acadYear, $startDate ?: null, $endDate ?: null, $status, $id]);

        echo json_encode(['success' => true, 'message' => 'Semester updated']);
    } catch (Exception $e) {
        error_log('SemesterAPI update: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update semester']);
    }
}

// ─── Delete a semester ─────────────────────────────────────────────────────

function handleDelete() {
    if (!Auth::isAdmin()) {
        echo json_encode(['success' => false, 'message' => 'Admin only']); return;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id   = (int)($data['semester_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'semester_id required']); return; }

    // Prevent deleting the active semester
    $sem = db()->fetchOne("SELECT status, semester_name, academic_year FROM semester WHERE semester_id = ?", [$id]);
    if (!$sem) { echo json_encode(['success' => false, 'message' => 'Semester not found']); return; }
    if ($sem['status'] === 'active') {
        echo json_encode(['success' => false,
            'message' => 'Cannot delete the active semester. Set another semester as active first.']);
        return;
    }

    // Check if semester is used in subject offerings
    $inUse = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM subject_offered WHERE semester_id = ?", [$id]
    )['c'] ?? 0;

    if ($inUse > 0) {
        echo json_encode(['success' => false,
            'message' => "Cannot delete: this semester has {$inUse} subject offering(s) linked to it"]);
        return;
    }

    try {
        pdo()->prepare("DELETE FROM semester WHERE semester_id = ?")->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Semester deleted']);
    } catch (Exception $e) {
        error_log('SemesterAPI delete: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete semester']);
    }
}
