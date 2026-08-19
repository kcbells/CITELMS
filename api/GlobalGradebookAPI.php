<?php
/**
 * Global Gradebook API
 * Handles read/write for the 14-module EL/Mastery grading model.
 *
 * Tables used:
 *   global_module_grades  — per student × offering × module (1-14)
 *   global_project_grades — per student × offering (ONE project for the
 *       whole term, not one per period — 4 check-ins spread across it:
 *       checkin1=P1, checkin2=P2, checkin3=P3.1, checkin4=P3.2 (optional),
 *       plus one final_output. Shared by all three periods' Mastery calc.
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// Students may only hit their own read-only summary action; everything else
// (bulk class rosters, editing) stays instructor/dean/admin/program_head only.
$allowedRoles = $action === 'student-summary'
    ? ['student', 'instructor', 'dean', 'admin', 'program_head']
    : ['instructor', 'dean', 'admin', 'program_head'];
if (!in_array(Auth::role(), $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied']);
    exit;
}

// Migration guard: auto-create all three grade tables if they don't exist yet.
// Wrapped in try/catch so a DB hiccup never breaks the JSON response.
try {
    $__db = Database::getInstance()->getConnection();
    $__db->exec("CREATE TABLE IF NOT EXISTS `global_module_grades` (
        `grade_id`               INT           NOT NULL AUTO_INCREMENT,
        `subject_offered_id`     INT           NOT NULL,
        `student_id`             INT           NOT NULL,
        `module_number`          TINYINT       NOT NULL,
        `soc1`                   ENUM('P','A') NULL,
        `soc2`                   ENUM('P','A') NULL,
        `lets_practice`          TINYINT       NULL,
        `lets_practice_optional` TINYINT       NULL,
        `reflection`             TINYINT       NULL,
        `wrap_up_quiz`           DECIMAL(6,2)  NULL,
        `updated_at`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`grade_id`),
        UNIQUE KEY `uq_gmg` (`subject_offered_id`, `student_id`, `module_number`),
        KEY `idx_gmg_offering` (`subject_offered_id`),
        KEY `idx_gmg_student`  (`student_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $__db->exec("CREATE TABLE IF NOT EXISTS `global_project_grades` (
        `proj_id`            INT           NOT NULL AUTO_INCREMENT,
        `subject_offered_id` INT           NOT NULL,
        `student_id`         INT           NOT NULL,
        `checkin1`           DECIMAL(6,2)  NULL,
        `checkin2`           DECIMAL(6,2)  NULL,
        `checkin3`           DECIMAL(6,2)  NULL,
        `checkin4`           DECIMAL(6,2)  NULL,
        `final_output`       DECIMAL(6,2)  NULL,
        `updated_at`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`proj_id`),
        UNIQUE KEY `uq_gpg` (`subject_offered_id`, `student_id`),
        KEY `idx_gpg_offering` (`subject_offered_id`),
        KEY `idx_gpg_student`  (`student_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $__db->exec("CREATE TABLE IF NOT EXISTS `global_retry_tracker` (
        `id`                  INT           NOT NULL AUTO_INCREMENT,
        `subject_offered_id`  INT           NOT NULL,
        `student_id`          INT           NOT NULL,
        `modules_for_retry`   TEXT          NULL,
        `specific_activities` TEXT          NULL,
        `schedule_of_retry`   VARCHAR(255)  NULL,
        `status`              VARCHAR(50)   NOT NULL DEFAULT '',
        `notes`               TEXT          NULL,
        `updated_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uq_retry` (`subject_offered_id`, `student_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    unset($__db);
} catch (Exception $__e) {
    error_log('GlobalGradebook migration guard: ' . $__e->getMessage());
    unset($__e);
}

switch ($action) {
    case 'student-summary': handleStudentSummary(); break;
    case 'module-grades':   handleModuleGrades();   break;
    case 'project-grades':  handleProjectGrades();  break;
    case 'save-field':      handleSaveField();      break;
    case 'save-project':    handleSaveProject();    break;
    case 'get-retry':       handleGetRetry();       break;
    case 'save-retry':      handleSaveRetry();      break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET ?action=module-grades&subject_offered_id=X&section_id=Y
 *
 * Returns all students in the section with their grades for all 14 modules.
 * Response shape:
 *   {
 *     success: true,
 *     students: [{ user_student_id, student_id, first_name, last_name }],
 *     grades: { "<student_id>": { "<module_number>": { soc1, soc2, lets_practice, … } } }
 *   }
 */
/**
 * GET ?action=student-summary&subject_offered_id=X
 * Student-facing, read-only. Returns the CALLER's own module + project
 * grades for one offering — never another student's, never a bulk roster.
 */
function handleStudentSummary(): void
{
    $offeredId = (int)($_GET['subject_offered_id'] ?? 0);
    $studentId = Auth::id();
    if (!$offeredId) {
        echo json_encode(['success' => false, 'message' => 'subject_offered_id required']);
        return;
    }

    $enrolled = db()->fetchOne(
        "SELECT 1 FROM student_subject WHERE user_student_id = ? AND subject_offered_id = ? AND status = 'enrolled'",
        [$studentId, $offeredId]
    );
    if (Auth::role() === 'student' && !$enrolled) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Not enrolled in this offering']);
        return;
    }

    $moduleRows = db()->fetchAll(
        "SELECT module_number, soc1, soc2, lets_practice, lets_practice_optional, reflection, wrap_up_quiz
         FROM global_module_grades WHERE subject_offered_id = ? AND student_id = ?",
        [$offeredId, $studentId]
    );
    $modules = [];
    foreach ($moduleRows as $r) {
        $modules[(int)$r['module_number']] = [
            'soc1'                   => $r['soc1'],
            'soc2'                   => $r['soc2'],
            'lets_practice'          => $r['lets_practice'] !== null ? (int)$r['lets_practice'] : null,
            'lets_practice_optional' => $r['lets_practice_optional'] !== null ? (int)$r['lets_practice_optional'] : null,
            'reflection'             => $r['reflection'] !== null ? (int)$r['reflection'] : null,
            'wrap_up_quiz'           => $r['wrap_up_quiz'] !== null ? (float)$r['wrap_up_quiz'] : null,
        ];
    }

    $projectRow = db()->fetchOne(
        "SELECT checkin1, checkin2, checkin3, checkin4, final_output
         FROM global_project_grades WHERE subject_offered_id = ? AND student_id = ?",
        [$offeredId, $studentId]
    );
    $project = $projectRow ? [
        'checkin1'     => $projectRow['checkin1']     !== null ? (float)$projectRow['checkin1']     : null,
        'checkin2'     => $projectRow['checkin2']     !== null ? (float)$projectRow['checkin2']     : null,
        'checkin3'     => $projectRow['checkin3']     !== null ? (float)$projectRow['checkin3']     : null,
        'checkin4'     => $projectRow['checkin4']     !== null ? (float)$projectRow['checkin4']     : null,
        'final_output' => $projectRow['final_output'] !== null ? (float)$projectRow['final_output'] : null,
    ] : [];

    echo json_encode(['success' => true, 'data' => ['modules' => $modules, 'project' => $project]]);
}

function handleModuleGrades(): void
{
    $offeredId = (int)($_GET['subject_offered_id'] ?? 0);
    $sectionId = (int)($_GET['section_id']         ?? 0);
    if (!$offeredId || !$sectionId) {
        echo json_encode(['success' => false, 'message' => 'subject_offered_id and section_id required']);
        return;
    }

    // Students enrolled in this section × offering
    $students = db()->fetchAll(
        "SELECT DISTINCT u.users_id AS user_student_id, u.student_id, u.first_name, u.last_name
         FROM student_subject ss
         JOIN users u ON u.users_id = ss.user_student_id
         WHERE ss.section_id = ? AND ss.subject_offered_id = ? AND ss.status = 'enrolled'
         ORDER BY u.last_name, u.first_name",
        [$sectionId, $offeredId]
    );

    // All existing module grade rows for this offering
    $rows = db()->fetchAll(
        "SELECT student_id, module_number,
                soc1, soc2,
                lets_practice, lets_practice_optional, reflection,
                wrap_up_quiz
         FROM global_module_grades
         WHERE subject_offered_id = ?
           AND student_id IN (
               SELECT DISTINCT u.users_id
               FROM student_subject ss
               JOIN users u ON u.users_id = ss.user_student_id
               WHERE ss.section_id = ? AND ss.subject_offered_id = ? AND ss.status = 'enrolled'
           )",
        [$offeredId, $sectionId, $offeredId]
    );

    // Index: grades[student_id][module_number] = row
    $grades = [];
    foreach ($rows as $r) {
        $sid = (int)$r['student_id'];
        $mod = (int)$r['module_number'];
        $grades[$sid][$mod] = [
            'soc1'                   => $r['soc1'],
            'soc2'                   => $r['soc2'],
            'lets_practice'          => $r['lets_practice'] !== null ? (int)$r['lets_practice'] : null,
            'lets_practice_optional' => $r['lets_practice_optional'] !== null ? (int)$r['lets_practice_optional'] : null,
            'reflection'             => $r['reflection'] !== null ? (int)$r['reflection'] : null,
            'wrap_up_quiz'           => $r['wrap_up_quiz'] !== null ? (float)$r['wrap_up_quiz'] : null,
        ];
    }

    echo json_encode(['success' => true, 'students' => $students, 'grades' => $grades]);
}

/**
 * GET ?action=project-grades&subject_offered_id=X&section_id=Y
 *
 * Returns the ONE project's grades per student (not per period — see the
 * file-level doc comment for why).
 * Response shape:
 *   {
 *     success: true,
 *     project: { "<student_id>": { checkin1…checkin4, final_output } }
 *   }
 */
function handleProjectGrades(): void
{
    $offeredId = (int)($_GET['subject_offered_id'] ?? 0);
    $sectionId = (int)($_GET['section_id']         ?? 0);
    if (!$offeredId || !$sectionId) {
        echo json_encode(['success' => false, 'message' => 'subject_offered_id and section_id required']);
        return;
    }

    $rows = db()->fetchAll(
        "SELECT student_id,
                checkin1, checkin2, checkin3, checkin4, final_output
         FROM global_project_grades
         WHERE subject_offered_id = ?
           AND student_id IN (
               SELECT DISTINCT u.users_id
               FROM student_subject ss
               JOIN users u ON u.users_id = ss.user_student_id
               WHERE ss.section_id = ? AND ss.subject_offered_id = ? AND ss.status = 'enrolled'
           )",
        [$offeredId, $sectionId, $offeredId]
    );

    $project = [];
    foreach ($rows as $r) {
        $sid = (int)$r['student_id'];
        $project[$sid] = [
            'checkin1'     => $r['checkin1']     !== null ? (float)$r['checkin1']     : null,
            'checkin2'     => $r['checkin2']     !== null ? (float)$r['checkin2']     : null,
            'checkin3'     => $r['checkin3']     !== null ? (float)$r['checkin3']     : null,
            'checkin4'     => $r['checkin4']     !== null ? (float)$r['checkin4']     : null,
            'final_output' => $r['final_output'] !== null ? (float)$r['final_output'] : null,
        ];
    }

    echo json_encode(['success' => true, 'project' => $project]);
}

/**
 * POST ?action=save-field
 * Body: { subject_offered_id, student_id, module_number, field, value }
 *
 * Upserts one field in global_module_grades.
 * Allowed fields: soc1, soc2, lets_practice, lets_practice_optional, reflection, wrap_up_quiz
 */
function handleSaveField(): void
{
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $offeredId = (int)($data['subject_offered_id'] ?? 0);
    $studentId = (int)($data['student_id']         ?? 0);
    $modNum    = (int)($data['module_number']       ?? 0);
    $field     = $data['field']  ?? '';
    $value     = $data['value']; // may be null

    $allowed = ['soc1', 'soc2', 'lets_practice', 'lets_practice_optional', 'reflection', 'wrap_up_quiz'];
    if (!$offeredId || !$studentId || $modNum < 1 || $modNum > 14 || !in_array($field, $allowed)) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        return;
    }

    // Sanitise value per field type
    if (in_array($field, ['soc1', 'soc2'])) {
        $value = ($value === 'P' || $value === 'A') ? $value : null;
    } elseif (in_array($field, ['lets_practice', 'lets_practice_optional', 'reflection'])) {
        $value = ($value !== null && $value !== '') ? max(0, min(3, (int)$value)) : null;
    } elseif ($field === 'wrap_up_quiz') {
        $value = ($value !== null && $value !== '') ? max(0.0, min(100.0, (float)$value)) : null;
    }

    try {
        pdo()->prepare(
            "INSERT INTO global_module_grades
                (subject_offered_id, student_id, module_number, {$field})
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE {$field} = VALUES({$field}), updated_at = NOW()"
        )->execute([$offeredId, $studentId, $modNum, $value]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('GlobalGradebook save-field: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Save failed']);
    }
}

/**
 * POST ?action=save-project
 * Body: { subject_offered_id, student_id, field, value }
 *
 * Upserts one field in global_project_grades — one row per student per
 * offering (no period; see the file-level doc comment).
 * field: checkin1 (P1) | checkin2 (P2) | checkin3 (P3.1) | checkin4 (P3.2, optional) | final_output
 */
function handleSaveProject(): void
{
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $offeredId = (int)($data['subject_offered_id'] ?? 0);
    $studentId = (int)($data['student_id']         ?? 0);
    $field     = $data['field']  ?? '';
    $value     = $data['value'];

    $validFields = ['checkin1', 'checkin2', 'checkin3', 'checkin4', 'final_output'];
    if (!$offeredId || !$studentId || !in_array($field, $validFields)) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        return;
    }

    $value = ($value !== null && $value !== '') ? max(0.0, min(100.0, (float)$value)) : null;

    try {
        pdo()->prepare(
            "INSERT INTO global_project_grades
                (subject_offered_id, student_id, {$field})
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE {$field} = VALUES({$field}), updated_at = NOW()"
        )->execute([$offeredId, $studentId, $value]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('GlobalGradebook save-project: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Save failed']);
    }
}

/**
 * GET ?action=get-retry&subject_offered_id=X&section_id=Y
 * Returns retry tracker rows keyed by student_id.
 */
function handleGetRetry(): void
{
    $offeredId = (int)($_GET['subject_offered_id'] ?? 0);
    $sectionId = (int)($_GET['section_id']         ?? 0);
    if (!$offeredId) { echo json_encode(['success' => false, 'message' => 'subject_offered_id required']); return; }

    $stmt = pdo()->prepare(
        "SELECT t.student_id, t.modules_for_retry, t.specific_activities,
                t.schedule_of_retry, t.status, t.notes
         FROM global_retry_tracker t
         WHERE t.subject_offered_id = ?"
    );
    $stmt->execute([$offeredId]);
    $data = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $data[(int)$row['student_id']] = [
            'modules_for_retry'  => $row['modules_for_retry'],
            'specific_activities'=> $row['specific_activities'],
            'schedule_of_retry'  => $row['schedule_of_retry'],
            'status'             => $row['status'],
            'notes'              => $row['notes'],
        ];
    }
    echo json_encode(['success' => true, 'data' => $data]);
}

/**
 * POST ?action=save-retry
 * Body: { subject_offered_id, student_id, field, value }
 */
function handleSaveRetry(): void
{
    $body      = json_decode(file_get_contents('php://input'), true) ?? [];
    $offeredId = (int)($body['subject_offered_id'] ?? 0);
    $studentId = (int)($body['student_id']         ?? 0);
    $field     = $body['field']  ?? '';
    $value     = $body['value']  ?? '';

    $allowed = ['modules_for_retry', 'specific_activities', 'schedule_of_retry', 'status', 'notes'];
    if (!$offeredId || !$studentId || !in_array($field, $allowed, true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']); return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO global_retry_tracker (subject_offered_id, student_id, {$field})
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE {$field} = VALUES({$field}), updated_at = NOW()"
        )->execute([$offeredId, $studentId, $value]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('GlobalGradebook save-retry: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Save failed']);
    }
}
