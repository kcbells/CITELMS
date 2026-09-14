<?php
/**
 * ElectiveAPI — elective tracks and subject assignments (dean only, scoped to own dept)
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

// Scoping flag used throughout below (dean sees only their own department;
// admin sees everything) — kept even though the access GATE itself is now
// the RBAC check below, not a hardcoded role list.
$isDean  = Auth::role() === 'dean';
$isAdmin = Auth::role() === 'admin';

// RBAC: enforce permission per action — electives.view/manage are currently
// only granted to admin and dean (see role_permissions), same effective
// scope as before, just data-driven instead of a hardcoded role check.
$action = $_GET['action'] ?? '';
$_elecPerms = [
    'list'           => 'electives.view',
    'add_track'      => 'electives.manage',
    'delete_track'   => 'electives.manage',
    'add_subject'    => 'electives.manage',
    'remove_subject' => 'electives.manage',
];
if (isset($_elecPerms[$action]) && !Auth::can($_elecPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_elecPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'list':           handleList();          break;
    case 'add_track':      handleAddTrack();      break;
    case 'delete_track':   handleDeleteTrack();   break;
    case 'add_subject':    handleAddSubject();    break;
    case 'remove_subject': handleRemoveSubject(); break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ── Dean info ──────────────────────────────────────────────────────────────

function deanInfo(): array {
    return db()->fetchOne(
        "SELECT program_id, department_id, campus_id FROM users WHERE users_id = ?",
        [Auth::id()]
    ) ?: ['program_id' => 0, 'department_id' => 0, 'campus_id' => 0];
}

/**
 * All program_ids the dean manages — a department can oversee several programs,
 * so a dean must be able to work with any of them here, not just their single
 * primary users.program_id (see SubjectOfferingsAPI.php's deanProgramIds()).
 */
function deanProgramIds(): array {
    static $ids = null;
    if ($ids === null) {
        $info = deanInfo();
        $ids  = [];
        if (!empty($info['department_id'])) {
            $rows = db()->fetchAll(
                "SELECT program_id FROM department_program WHERE department_id = ?",
                [$info['department_id']]
            );
            $ids = array_map(fn($r) => (int)$r['program_id'], $rows);
        }
        if (!$ids && !empty($info['program_id'])) {
            $ids = [(int)$info['program_id']];
        }
    }
    return $ids;
}

// Accepts the program_id the caller asked for (e.g. the program the dean has
// selected in the curriculum UI), but for deans it must be one of the programs
// their department actually manages.
function resolveProgram(): int {
    global $isDean;
    $requested = (int)($_GET['program_id'] ?? $_POST['program_id'] ?? 0);
    if (!$isDean) return $requested;
    if ($requested && in_array($requested, deanProgramIds(), true)) return $requested;
    return (int)(deanInfo()['program_id'] ?? 0);
}

// ── Ownership check: does this track belong to a program the dean manages? ──

function canAccessTrack(int $trackId): bool {
    global $isDean;
    if (!$isDean) return true;
    $row = db()->fetchOne("SELECT program_id FROM elective_track WHERE track_id=?", [$trackId]);
    return $row && in_array((int)$row['program_id'], deanProgramIds(), true);
}

// ── List tracks + subjects for a program ──────────────────────────────────

function handleList() {
    $programId = resolveProgram();
    if (!$programId) { echo json_encode(['success' => false, 'message' => 'program_id required']); return; }

    $tracks = db()->fetchAll(
        "SELECT track_id, track_name, department_id, program_id
         FROM elective_track WHERE program_id = ? AND status = 'active' ORDER BY track_id",
        [$programId]
    );

    foreach ($tracks as &$t) {
        $t['subjects'] = db()->fetchAll(
            "SELECT es.id, s.subject_id, s.subject_code, s.subject_name, s.units
             FROM elective_subject es
             JOIN subject s ON s.subject_id = es.subject_id
             WHERE es.track_id = ?
             ORDER BY s.subject_code",
            [$t['track_id']]
        );
    }

    echo json_encode(['success' => true, 'data' => $tracks]);
}

// ── Add track ──────────────────────────────────────────────────────────────

function handleAddTrack() {
    global $isDean;
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $name = trim($data['track_name'] ?? '');
    if (!$name) { echo json_encode(['success' => false, 'message' => 'track_name required']); return; }

    $programId    = (int)($data['program_id']    ?? 0);
    $departmentId = (int)($data['department_id'] ?? 0);

    if ($isDean) {
        // Must be one of the programs the dean's department actually manages.
        if (!$programId || !in_array($programId, deanProgramIds(), true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: not a program in your department']);
            return;
        }
        $departmentId = (int)(deanInfo()['department_id'] ?? $departmentId);
    }

    if (!$programId || !$departmentId) {
        echo json_encode(['success' => false, 'message' => 'program_id and department_id required']);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO elective_track (department_id, program_id, track_name)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE status = 'active'"
        )->execute([$departmentId, $programId, $name]);
        $row = db()->fetchOne(
            "SELECT track_id FROM elective_track WHERE program_id=? AND track_name=?",
            [$programId, $name]
        );
        echo json_encode(['success' => true, 'message' => 'Track added', 'track_id' => (int)$row['track_id']]);
    } catch (Exception $e) {
        error_log('ElectiveAPI add-track: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add track. It may already exist.']);
    }
}

// ── Delete track ───────────────────────────────────────────────────────────

function handleDeleteTrack() {
    $data    = json_decode(file_get_contents('php://input'), true) ?? [];
    $trackId = (int)($data['track_id'] ?? 0);
    if (!$trackId) { echo json_encode(['success' => false, 'message' => 'track_id required']); return; }
    if (!canAccessTrack($trackId)) { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Access denied']); return; }

    pdo()->prepare("UPDATE elective_track SET status='inactive' WHERE track_id=?")->execute([$trackId]);
    echo json_encode(['success' => true, 'message' => 'Track removed']);
}

// ── Add subject to track ───────────────────────────────────────────────────

function handleAddSubject() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $trackId   = (int)($data['track_id']   ?? 0);
    $subjectId = (int)($data['subject_id'] ?? 0);
    if (!$trackId || !$subjectId) { echo json_encode(['success' => false, 'message' => 'track_id and subject_id required']); return; }
    if (!canAccessTrack($trackId)) { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Access denied']); return; }

    try {
        pdo()->prepare("INSERT IGNORE INTO elective_subject (track_id, subject_id) VALUES (?,?)")
             ->execute([$trackId, $subjectId]);
        echo json_encode(['success' => true, 'message' => 'Subject added to track']);
    } catch (Exception $e) {
        error_log('ElectiveAPI add-subject: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add subject to track.']);
    }
}

// ── Remove subject from track ──────────────────────────────────────────────

function handleRemoveSubject() {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id   = (int)($data['id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'id required']); return; }

    $row = db()->fetchOne("SELECT track_id FROM elective_subject WHERE id=?", [$id]);
    if (!$row || !canAccessTrack((int)$row['track_id'])) {
        http_response_code(403); echo json_encode(['success' => false, 'message' => 'Access denied']); return;
    }

    pdo()->prepare("DELETE FROM elective_subject WHERE id=?")->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Subject removed']);
}
