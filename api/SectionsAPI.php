<?php
/**
 * Sections API - CRUD for section management
 * Each section can hold multiple subjects (via section_subject junction table)
 */
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/StudentListParser.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action
$_sectPerms = [
    'list'                      => 'sections.view',
    'instructor-list'           => 'sections.view',
    'available-subjects'        => 'sections.view',
    'instructor-avail-subjects'      => 'sections.view',
    'instructor-assigned-subjects'   => 'sections.view',
    'instructor-classes'             => 'sections.view',
    'create-for-subject'             => 'sections.create',
    'subject-sections'               => 'sections.view',
    'instructor-programs'            => 'sections.view',
    'instructors'               => 'sections.view',
    'students'                  => 'sections.view',
    'semesters'                 => 'sections.view',
    'programs'                  => 'sections.view',
    'departments'               => 'sections.view',
    'create'                    => 'sections.create',
    'bulk-import'               => 'sections.create',
    'preview-import-students'   => 'sections.edit',
    'bulk-import-students'      => 'sections.edit',
    'update'                    => 'sections.edit',
    'add-subject'               => 'sections.edit',
    'remove-subject'            => 'sections.edit',
    'bulk-add-subjects'         => 'sections.edit',
    'update-section-subject'    => 'sections.edit',
    'remove-class'              => 'sections.edit',
    'unenroll'                  => 'sections.edit',
    'delete'                    => 'sections.delete',
];
// Dean has intrinsic access to sections (scoped by dept).
// Instructors have intrinsic access to CRUD on their own sections.
$isDeanSect  = Auth::role() === 'dean';
$isInstrSect = Auth::role() === 'instructor';
// Actions instructors can always perform on their own sections (server-side scoping handles security)
$instrActions = ['create','update','delete','add-subject','remove-subject','unenroll',
                 'instructor-list','instructor-avail-subjects','instructor-assigned-subjects',
                 'instructor-programs','instructor-classes','create-for-subject','students',
                 'preview-import-students','bulk-import-students'];
$instrBypassed = $isInstrSect && in_array($action, $instrActions);

if (!$isDeanSect && !$instrBypassed && isset($_sectPerms[$action]) && !Auth::can($_sectPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_sectPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'list':                       handleList();                      break;
    case 'create':                     handleCreate();                    break;
    case 'update':                     handleUpdate();                    break;
    case 'delete':                     handleDelete();                    break;
    case 'add-subject':                handleAddSubject();                break;
    case 'remove-subject':             handleRemoveSubject();             break;
    case 'available-subjects':         handleAvailableSubjects();         break;
    case 'instructor-list':            handleInstructorList();            break;
    case 'instructor-avail-subjects':      handleInstructorAvailSubjects();      break;
    case 'instructor-assigned-subjects':   handleInstructorAssignedSubjects();   break;
    case 'instructor-classes':             handleInstructorClasses();            break;
    case 'create-for-subject':             handleCreateForSubject();             break;
    case 'subject-sections':               handleSubjectSections();              break;
    case 'instructor-programs':            handleInstructorPrograms();           break;
    case 'remove-class':               handleRemoveClass();               break;
    case 'instructors':                handleInstructors();               break;
    case 'students':                   handleStudents();                  break;
    case 'unenroll':                   handleUnenroll();                  break;
    case 'semesters':                  handleSemesters();                 break;
    case 'programs':                   handlePrograms();                  break;
    case 'departments':                handleDepartments();               break;
    case 'bulk-add-subjects':          handleBulkAddSubjects();           break;
    case 'update-section-subject':     handleUpdateSectionSubject();      break;
    case 'preview-import-students':    handlePreviewImportStudents();     break;
    case 'bulk-import-students':       handleBulkImportStudents();        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── List all sections with their subjects ─────────────────────────────────

function handleList() {
    $semesterId = (int)($_GET['semester_id'] ?? 0);
    $programId  = (int)($_GET['program_id']  ?? 0);

    $conditions = [];
    $params     = [];
    if ($semesterId) { $conditions[] = 'sec.semester_id = ?'; $params[] = $semesterId; }
    if ($programId)  { $conditions[] = 'sec.program_id = ?';  $params[] = $programId;  }
    // Dean: scope to sections under their department's programs
    if (Auth::role() === 'dean') {
        $deanUser = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [Auth::id()]);
        $deptId   = $deanUser['department_id'] ?? null;
        if ($deptId) {
            $conditions[] = 'sec.program_id IN (SELECT program_id FROM department_program WHERE department_id = ?)';
            $params[]     = $deptId;
        }
    }
    $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

    $sections = db()->fetchAll(
        "SELECT sec.section_id, sec.section_name, sec.enrollment_code,
                sec.max_students, sec.status, sec.created_at,
                sec.program_id, sec.year_level, sec.semester_id,
                p.program_code, p.program_name,
                sem.semester_name, sem.academic_year,
                COUNT(DISTINCT ss_stud.user_student_id) AS student_count
         FROM section sec
         LEFT JOIN program p    ON p.program_id    = sec.program_id
         LEFT JOIN semester sem ON sem.semester_id  = sec.semester_id
         LEFT JOIN student_subject ss_stud ON ss_stud.section_id = sec.section_id
                                          AND ss_stud.status = 'enrolled'
         $where
         GROUP BY sec.section_id
         ORDER BY sem.academic_year DESC, p.program_code, sec.year_level, sec.section_name",
        $params
    );

    // Attach subjects list to each section
    foreach ($sections as &$sec) {
        $sec['subjects'] = db()->fetchAll(
            "SELECT ss.section_subject_id, ss.subject_offered_id,
                    ss.schedule, ss.room,
                    s.subject_id, s.subject_code, s.subject_name, s.units,
                    CONCAT(u.first_name, ' ', u.last_name) AS instructor_name
             FROM section_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject s ON s.subject_id = so.subject_id
             LEFT JOIN users u ON u.users_id = so.user_teacher_id
             WHERE ss.section_id = ? AND ss.status = 'active'
             ORDER BY s.subject_code",
            [$sec['section_id']]
        );
    }

    echo json_encode(['success' => true, 'data' => $sections]);
}

// ─── Generate unique enrollment code ──────────────────────────────────────

function generateEnrollmentCode() {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    do {
        $code = '';
        for ($i = 0; $i < 3; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
        $code .= '-' . str_pad(random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $exists = db()->fetchOne("SELECT section_id FROM section WHERE enrollment_code = ?", [$code]);
    } while ($exists);
    return $code;
}

// ─── Create section ────────────────────────────────────────────────────────

function handleCreate() {
    $data        = json_decode(file_get_contents('php://input'), true) ?? [];
    $name        = trim($data['section_name'] ?? '');
    $maxStudents = max(1, (int)($data['max_students'] ?? 40));
    $programId   = !empty($data['program_id'])  ? (int)$data['program_id']  : null;
    $yearLevel   = !empty($data['year_level'])   ? (int)$data['year_level']  : null;
    $semesterId  = !empty($data['semester_id'])  ? (int)$data['semester_id'] : null;

    if (!$name) {
        echo json_encode(['success' => false, 'message' => 'Section name is required']);
        return;
    }

    // Dean: verify program belongs to their department
    if (Auth::role() === 'dean' && $programId) {
        $deanUser = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [Auth::id()]);
        $deptId   = $deanUser['department_id'] ?? null;
        $allowed  = $deptId ? db()->fetchOne(
            "SELECT 1 FROM department_program WHERE program_id = ? AND department_id = ?",
            [$programId, $deptId]
        ) : null;
        if (!$allowed) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: program not in your department']);
            return;
        }
    }

    // For instructors: auto-fill program_id from their profile if not provided
    if (Auth::role() === 'instructor' && !$programId) {
        $instrUser = db()->fetchOne("SELECT program_id FROM users WHERE users_id = ?", [Auth::id()]);
        if ($instrUser && $instrUser['program_id']) {
            $programId = (int)$instrUser['program_id'];
        }
    }

    // Auto-fall-back to active semester if none provided
    if (!$semesterId) {
        $active = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        $semesterId = $active ? (int)$active['semester_id'] : null;
    }

    $code = generateEnrollmentCode();

    try {
        $pdo = pdo();
        $pdo->prepare(
            "INSERT INTO section (section_name, program_id, year_level, semester_id, enrollment_code, max_students, status)
             VALUES (?, ?, ?, ?, ?, ?, 'active')"
        )->execute([$name, $programId, $yearLevel, $semesterId, $code, $maxStudents]);

        $sectionId = $pdo->lastInsertId();
        echo json_encode(['success' => true, 'message' => 'Section created', 'data' => ['section_id' => $sectionId, 'enrollment_code' => $code]]);
    } catch (Exception $e) {
        error_log('Create section: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create section']);
    }
}

// ─── Update section ────────────────────────────────────────────────────────

function handleUpdate() {
    $data        = json_decode(file_get_contents('php://input'), true) ?? [];
    $id          = (int)($data['section_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Section ID required']); return; }

    $name        = trim($data['section_name'] ?? '');
    $maxStudents = max(1, (int)($data['max_students'] ?? 40));
    $status      = in_array($data['status'] ?? '', ['active','inactive']) ? $data['status'] : 'active';
    $programId   = !empty($data['program_id'])  ? (int)$data['program_id']  : null;
    $yearLevel   = !empty($data['year_level'])   ? (int)$data['year_level']  : null;
    $semesterId  = !empty($data['semester_id'])  ? (int)$data['semester_id'] : null;

    try {
        pdo()->prepare(
            "UPDATE section SET section_name=?, program_id=?, year_level=?, semester_id=?, max_students=?, status=? WHERE section_id=?"
        )->execute([$name, $programId, $yearLevel, $semesterId, $maxStudents, $status, $id]);
        echo json_encode(['success' => true, 'message' => 'Section updated']);
    } catch (Exception $e) {
        error_log('Update section: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update section']);
    }
}

// ─── Delete (deactivate) section ───────────────────────────────────────────

function handleDelete() {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = (int)($data['section_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Section ID required']); return; }

    try {
        $pdo = pdo();
        $pdo->prepare("DELETE FROM student_subject WHERE section_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM section_subject WHERE section_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM section WHERE section_id = ?")->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Section deleted']);
    } catch (Exception $e) {
        error_log('Delete section: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete section']);
    }
}

// ─── Add a subject to a section ────────────────────────────────────────────

function handleAddSubject() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $sectionId = (int)($data['section_id']        ?? 0);
    $offeredId = (int)($data['subject_offered_id'] ?? 0);  // optional: admin flow
    $subjectId = (int)($data['subject_id']         ?? 0);  // instructor curriculum flow
    $schedule  = trim($data['schedule'] ?? '');
    $room      = trim($data['room']     ?? '');

    if (!$sectionId || !$offeredId && !$subjectId) {
        echo json_encode(['success' => false, 'message' => 'section_id and subject_id are required']);
        return;
    }

    if (!db()->fetchOne("SELECT section_id FROM section WHERE section_id = ?", [$sectionId])) {
        echo json_encode(['success' => false, 'message' => 'Section not found']);
        return;
    }

    // Instructor role: verify the offering belongs to them; reactivate if cancelled
    if (Auth::role() === 'instructor' && $offeredId) {
        $owns = db()->fetchOne(
            "SELECT subject_offered_id, status FROM subject_offered WHERE subject_offered_id = ? AND user_teacher_id = ?",
            [$offeredId, Auth::id()]
        );
        if (!$owns) {
            echo json_encode(['success' => false, 'message' => 'You can only add subjects assigned to you by the dean']);
            return;
        }
        // If the offering was previously cancelled (e.g., by old auto-cancel logic),
        // reactivate it so it can be added to a section again.
        if ($owns['status'] === 'cancelled') {
            try {
                pdo()->prepare("UPDATE subject_offered SET status = 'open', updated_at = NOW() WHERE subject_offered_id = ?")
                    ->execute([$offeredId]);
            } catch (Exception $e) {
                error_log('Reactivate offering on add: ' . $e->getMessage());
                echo json_encode(['success' => false, 'message' => 'Failed to reactivate subject offering']);
                return;
            }
        }
    }

    // Instructor curriculum flow: auto-find or create a subject_offered record
    if (!$offeredId && $subjectId) {
        $userId = Auth::id();

        // 1. Prefer an open offering already owned by this instructor
        $mine = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
            [$subjectId, $userId]
        );
        if ($mine) {
            $offeredId = (int)$mine['subject_offered_id'];
        } else {
            // 1b. Check if instructor has a cancelled offering — reactivate it
            $myCancelled = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered WHERE subject_id = ? AND user_teacher_id = ? LIMIT 1",
                [$subjectId, $userId]
            );
            if ($myCancelled) {
                $offeredId = (int)$myCancelled['subject_offered_id'];
                try {
                    pdo()->prepare("UPDATE subject_offered SET status = 'open', updated_at = NOW() WHERE subject_offered_id = ?")
                        ->execute([$offeredId]);
                } catch (Exception $e) {
                    error_log('Reactivate offering: ' . $e->getMessage());
                    echo json_encode(['success' => false, 'message' => 'Failed to reactivate subject offering']);
                    return;
                }
            } else {
                // 2. Use the latest semester to create a new offering
                $sem = db()->fetchOne("SELECT semester_id FROM semester ORDER BY semester_id DESC LIMIT 1");
                if (!$sem) {
                    echo json_encode(['success' => false, 'message' => 'No semester found. Ask admin to create a semester first.']);
                    return;
                }
                $semId = (int)$sem['semester_id'];

                // Check unique constraint: one offering per (subject, semester)
                $existing = db()->fetchOne(
                    "SELECT subject_offered_id, user_teacher_id FROM subject_offered WHERE subject_id = ? AND semester_id = ?",
                    [$subjectId, $semId]
                );
                try {
                    $pdo = pdo();
                    if ($existing) {
                        $offeredId = (int)$existing['subject_offered_id'];
                        if ($existing['user_teacher_id'] === null) {
                            // Unassigned — claim it and open it
                            $pdo->prepare(
                                "UPDATE subject_offered SET user_teacher_id = ?, status = 'open', updated_at = NOW()
                                 WHERE subject_offered_id = ?"
                            )->execute([$userId, $offeredId]);
                        } else {
                            // Assigned to someone else — create a separate offering for this instructor
                            $pdo->prepare(
                                "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                                 VALUES (?, ?, ?, 'open', NOW(), NOW())"
                            )->execute([$subjectId, $semId, $userId]);
                            $offeredId = (int)$pdo->lastInsertId();
                        }
                    } else {
                        // Create a fresh offering assigned to this instructor
                        $pdo->prepare(
                            "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                             VALUES (?, ?, ?, 'open', NOW(), NOW())"
                        )->execute([$subjectId, $semId, $userId]);
                        $offeredId = (int)$pdo->lastInsertId();
                    }
                } catch (Exception $e) {
                    error_log('Auto-create offering: ' . $e->getMessage());
                    echo json_encode(['success' => false, 'message' => 'Failed to create subject offering']);
                    return;
                }
            }
        }
    }

    // Check not already in section
    $exists = db()->fetchOne(
        "SELECT section_subject_id FROM section_subject WHERE section_id = ? AND subject_offered_id = ?",
        [$sectionId, $offeredId]
    );
    if ($exists) {
        echo json_encode(['success' => false, 'message' => 'Subject already added to this section']);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO section_subject (section_id, subject_offered_id, schedule, room, status)
             VALUES (?, ?, ?, ?, 'active')"
        )->execute([$sectionId, $offeredId, $schedule ?: null, $room ?: null]);
        echo json_encode(['success' => true, 'message' => 'Subject added to section']);
    } catch (Exception $e) {
        error_log('Add subject to section: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add subject']);
    }
}

// ─── Remove a subject from a section ──────────────────────────────────────

function handleRemoveSubject() {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $sectionSubjectId = (int)($data['section_subject_id'] ?? 0);

    if (!$sectionSubjectId) {
        echo json_encode(['success' => false, 'message' => 'section_subject_id required']);
        return;
    }

    $row = db()->fetchOne(
        "SELECT section_id, subject_offered_id FROM section_subject WHERE section_subject_id = ?",
        [$sectionSubjectId]
    );
    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'Not found']);
        return;
    }

    try {
        $pdo = pdo();

        $pdo->prepare("DELETE FROM section_subject WHERE section_subject_id = ?")->execute([$sectionSubjectId]);

        // NOTE: We intentionally do NOT cancel the subject_offered row here.
        // Cancellation is handled explicitly by the instructor via "Remove from My Classes"
        // (handleRemoveClass). Auto-cancelling here would prevent the instructor from
        // re-adding the subject to another (or the same) section in the same semester.

        echo json_encode(['success' => true, 'message' => 'Subject removed from section']);
    } catch (Exception $e) {
        error_log('Remove subject from section: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to remove subject']);
    }
}

// ─── Get curriculum subjects not yet in this section ───────────────────────
// Queries the subject table directly so that ALL subjects for a program/year/semester
// appear regardless of whether a subject_offered entry exists yet.

function handleAvailableSubjects() {
    $sectionId = (int)($_GET['section_id'] ?? 0);
    if (!$sectionId) {
        echo json_encode(['success' => false, 'message' => 'section_id required']);
        return;
    }

    // Load section context + sem_level (matches subject.semester column)
    $sec = db()->fetchOne(
        "SELECT sec.program_id, sec.year_level, sec.semester_id, st.sem_level
         FROM section sec
         LEFT JOIN semester sem ON sem.semester_id = sec.semester_id
         LEFT JOIN sem_type st  ON st.sem_type_id  = sem.sem_type_id
         WHERE sec.section_id = ?",
        [$sectionId]
    );

    if (!$sec || !$sec['program_id'] || !$sec['year_level'] || !$sec['sem_level']) {
        echo json_encode([
            'success' => true,
            'data'    => [],
            '_note'   => 'Section is missing program, year level, or semester context',
        ]);
        return;
    }

    $programId  = (int)$sec['program_id'];
    $yearLevel  = (int)$sec['year_level'];
    $semLevel   = (int)$sec['sem_level'];
    $semesterId = (int)$sec['semester_id'];

    // Return all active curriculum subjects for this program/year/semester
    // that are NOT already assigned to this section.
    // Correlated subqueries grab the best offering (prefer instructor-assigned) and
    // the instructor name — both are nullable (subject may not have an offering yet).
    $subjects = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                (SELECT so.subject_offered_id
                 FROM subject_offered so
                 WHERE so.subject_id   = s.subject_id
                   AND so.semester_id  = {$semesterId}
                 ORDER BY (so.user_teacher_id IS NOT NULL) DESC
                 LIMIT 1) AS subject_offered_id,
                (SELECT CONCAT(u.first_name,' ',u.last_name)
                 FROM subject_offered so
                 JOIN users u ON u.users_id = so.user_teacher_id
                 WHERE so.subject_id   = s.subject_id
                   AND so.semester_id  = {$semesterId}
                   AND so.user_teacher_id IS NOT NULL
                 LIMIT 1) AS instructor_name
         FROM subject s
         WHERE s.program_id  = ?
           AND s.year_level  = ?
           AND s.semester    = ?
           AND s.status      = 'active'
           AND s.subject_id NOT IN (
               SELECT so2.subject_id
               FROM section_subject ss2
               JOIN subject_offered so2 ON so2.subject_offered_id = ss2.subject_offered_id
               WHERE ss2.section_id = ?
           )
         ORDER BY s.subject_code",
        [$programId, $yearLevel, $semLevel, $sectionId]
    );

    echo json_encode(['success' => true, 'data' => $subjects]);
}

// ─── Bulk-add multiple subjects to a section ───────────────────────────────
// Accepts subject_ids (curriculum flow — finds or creates offering as needed).
// Falls back to legacy subject_offered_ids if provided directly.

function handleBulkAddSubjects() {
    $data       = json_decode(file_get_contents('php://input'), true);
    $sectionId  = (int)($data['section_id'] ?? 0);
    $subjectIds = array_map('intval', $data['subject_ids']        ?? []);
    $offeredIds = array_map('intval', $data['subject_offered_ids'] ?? []);

    if (!$sectionId || empty($subjectIds) && empty($offeredIds)) {
        echo json_encode(['success' => false, 'message' => 'Invalid data']);
        return;
    }

    // Get section's semester_id so we can find/create offerings
    $sec   = db()->fetchOne("SELECT semester_id FROM section WHERE section_id = ?", [$sectionId]);
    $semId = $sec ? (int)$sec['semester_id'] : null;

    $added = 0;

    // ── curriculum subject_ids flow ─────────────────────────────────────────
    foreach ($subjectIds as $subjectId) {
        if (!$subjectId) continue;

        // Find the best offering for this subject+semester
        // (prefer one with an instructor assigned)
        $offering = $semId ? db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
             WHERE subject_id = ? AND semester_id = ?
             ORDER BY (user_teacher_id IS NOT NULL) DESC
             LIMIT 1",
            [$subjectId, $semId]
        ) : null;

        if ($offering) {
            $offeredId = (int)$offering['subject_offered_id'];
        } else {
            // No offering yet — create an unassigned one
            if (!$semId) continue;
            try {
                $pdo = pdo();
                $pdo->prepare(
                    "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                     VALUES (?, ?, NULL, 'open', NOW(), NOW())"
                )->execute([$subjectId, $semId]);
                $offeredId = (int)$pdo->lastInsertId();
            } catch (Exception $e) {
                error_log('Bulk-add create offering: ' . $e->getMessage());
                continue;
            }
        }

        $exists = db()->fetchOne(
            "SELECT 1 FROM section_subject WHERE section_id = ? AND subject_offered_id = ?",
            [$sectionId, $offeredId]
        );
        if (!$exists) {
            db()->execute(
                "INSERT INTO section_subject (section_id, subject_offered_id, status, created_at)
                 VALUES (?, ?, 'active', NOW())",
                [$sectionId, $offeredId]
            );
            $added++;
        }
    }

    // ── legacy subject_offered_ids flow ────────────────────────────────────
    foreach ($offeredIds as $offeredId) {
        if (!$offeredId) continue;
        $exists = db()->fetchOne(
            "SELECT 1 FROM section_subject WHERE section_id = ? AND subject_offered_id = ?",
            [$sectionId, $offeredId]
        );
        if (!$exists) {
            db()->execute(
                "INSERT INTO section_subject (section_id, subject_offered_id, status, created_at)
                 VALUES (?, ?, 'active', NOW())",
                [$sectionId, $offeredId]
            );
            $added++;
        }
    }

    echo json_encode(['success' => true, 'added' => $added]);
}

// ─── Update schedule / room on a section_subject row ───────────────────────

function handleUpdateSectionSubject() {
    $data     = json_decode(file_get_contents('php://input'), true);
    $id       = (int)($data['section_subject_id'] ?? 0);
    $schedule = trim($data['schedule'] ?? '');
    $room     = trim($data['room']     ?? '');

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Invalid ID']);
        return;
    }

    db()->execute(
        "UPDATE section_subject SET schedule = ?, room = ? WHERE section_subject_id = ?",
        [$schedule ?: null, $room ?: null, $id]
    );
    echo json_encode(['success' => true]);
}

// ─── Subject sections (dean/admin curriculum drill-down) ─────────────────────

function handleSubjectSections() {
    $subjectId  = (int)($_GET['subject_id'] ?? 0);
    $semesterId = (int)($_GET['semester_id'] ?? 0);
    $programId  = (int)($_GET['program_id'] ?? 0);

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }

    $subject = db()->fetchOne(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units, s.year_level, s.semester,
                s.program_id, p.program_code, p.program_name
         FROM subject s
         LEFT JOIN program p ON p.program_id = s.program_id
         WHERE s.subject_id = ?",
        [$subjectId]
    );
    if (!$subject) {
        echo json_encode(['success' => false, 'message' => 'Subject not found']);
        return;
    }

    if (Auth::role() === 'dean') {
        $deanUser = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [Auth::id()]);
        $deanDeptId = $deanUser['department_id'] ?? null;
        if ($deanDeptId && $subject['program_id']) {
            $inDept = db()->fetchOne(
                "SELECT 1 FROM department_program WHERE department_id = ? AND program_id = ? LIMIT 1",
                [$deanDeptId, $subject['program_id']]
            );
            if (!$inDept) {
                echo json_encode(['success' => false, 'message' => 'Subject not in your department']);
                return;
            }
        }
    }

    if (!$semesterId) {
        $active = db()->fetchOne("SELECT semester_id, semester_name, academic_year FROM semester WHERE status = 'active' LIMIT 1");
        $semesterId = $active ? (int)$active['semester_id'] : 0;
    }

    $semester = $semesterId
        ? db()->fetchOne("SELECT semester_id, semester_name, academic_year, status FROM semester WHERE semester_id = ?", [$semesterId])
        : null;

    $offering = null;
    $sections = [];

    if ($semesterId) {
        $offering = db()->fetchOne(
            "SELECT so.subject_offered_id, so.subject_id, so.semester_id, so.status, so.batch,
                    so.user_teacher_id,
                    CONCAT(u.first_name, ' ', u.last_name) AS instructor_name
             FROM subject_offered so
             LEFT JOIN users u ON u.users_id = so.user_teacher_id
             WHERE so.subject_id = ? AND so.semester_id = ? AND so.status != 'cancelled'
             ORDER BY so.subject_offered_id DESC LIMIT 1",
            [$subjectId, $semesterId]
        );

        if ($offering) {
            $sections = db()->fetchAll(
                "SELECT sec.section_id, sec.section_name, sec.enrollment_code,
                        sec.max_students, sec.status,
                        ss.section_subject_id, ss.subject_offered_id, ss.schedule, ss.room,
                        COUNT(DISTINCT st.user_student_id) AS student_count
                 FROM section_subject ss
                 JOIN section sec ON sec.section_id = ss.section_id
                 LEFT JOIN student_subject st ON st.section_id = sec.section_id
                      AND st.subject_offered_id = ss.subject_offered_id
                      AND st.status = 'enrolled'
                 WHERE ss.subject_offered_id = ? AND ss.status = 'active'
                 GROUP BY ss.section_subject_id, ss.subject_offered_id, sec.section_id, sec.section_name,
                          sec.enrollment_code, sec.max_students, sec.status,
                          ss.schedule, ss.room
                 ORDER BY sec.section_name",
                [$offering['subject_offered_id']]
            );
        }
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'subject'  => $subject,
            'semester' => $semester,
            'offering' => $offering,
            'sections' => $sections ?: [],
        ],
    ]);
}

// ─── Instructor My Classes: subjects with nested sections ───────────────────

function handleInstructorClasses() {
    $userId = Auth::id();
    $semRow = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
    $semId  = $semRow ? (int)$semRow['semester_id'] : 0;

    $subjects = db()->fetchAll(
        "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name, s.units,
                so.subject_offered_id, p.program_code, p.program_name
         FROM subject_offered so
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN program p ON p.program_id = s.program_id
         WHERE so.user_teacher_id = ? AND so.status = 'open'
           AND (? = 0 OR so.semester_id = ?)
         ORDER BY s.subject_code",
        [$userId, $semId, $semId]
    );

    foreach ($subjects as &$sub) {
        $sub['sections'] = db()->fetchAll(
            "SELECT sec.section_id, sec.section_name, sec.enrollment_code,
                    sec.max_students, sec.status,
                    ss.section_subject_id, ss.subject_offered_id, ss.schedule, ss.room,
                    COUNT(DISTINCT st.user_student_id) AS student_count
             FROM section_subject ss
             JOIN section sec ON sec.section_id = ss.section_id
             LEFT JOIN student_subject st ON st.section_id = sec.section_id
                  AND st.subject_offered_id = ss.subject_offered_id
                  AND st.status = 'enrolled'
             WHERE ss.subject_offered_id = ? AND ss.status = 'active'
             GROUP BY ss.section_subject_id, ss.subject_offered_id, sec.section_id, sec.section_name,
                      sec.enrollment_code, sec.max_students, sec.status,
                      ss.schedule, ss.room
             ORDER BY sec.section_name",
            [$sub['subject_offered_id']]
        );
    }
    unset($sub);

    echo json_encode(['success' => true, 'data' => $subjects]);
}

// ─── Create section for a subject (section name + schedule + room) ───────────

function handleCreateForSubject() {
    $data             = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId        = (int)($data['subject_id'] ?? 0);
    $subjectOfferedId = (int)($data['subject_offered_id'] ?? 0);
    $sectionName      = trim($data['section_name'] ?? '');
    $schedule         = trim($data['schedule'] ?? '');
    $room             = trim($data['room'] ?? '');
    $maxStudents      = max(1, (int)($data['max_students'] ?? 40));

    if (!$sectionName) {
        echo json_encode(['success' => false, 'message' => 'Section name is required']);
        return;
    }
    if (!$schedule) {
        echo json_encode(['success' => false, 'message' => 'Schedule is required']);
        return;
    }

    $userId = Auth::id();

    if (!$subjectOfferedId && $subjectId) {
        if (Auth::role() === 'instructor') {
            $row = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                 WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open'
                 ORDER BY subject_offered_id DESC LIMIT 1",
                [$subjectId, $userId]
            );
            $subjectOfferedId = $row ? (int)$row['subject_offered_id'] : 0;
        } else {
            $semId = (int)($data['semester_id'] ?? 0);
            if ($semId) {
                $row = db()->fetchOne(
                    "SELECT subject_offered_id FROM subject_offered
                     WHERE subject_id = ? AND semester_id = ? AND status != 'cancelled'
                     ORDER BY subject_offered_id DESC LIMIT 1",
                    [$subjectId, $semId]
                );
                $subjectOfferedId = $row ? (int)$row['subject_offered_id'] : 0;
            }
        }
    }

    if (!$subjectOfferedId) {
        $msg = Auth::role() === 'instructor'
            ? 'Subject not assigned to you'
            : 'Open this subject for the selected semester first';
        echo json_encode(['success' => false, 'message' => $msg]);
        return;
    }

    $role = Auth::role();
    if ($role === 'instructor') {
        $owns = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
             WHERE subject_offered_id = ? AND user_teacher_id = ? AND status = 'open'",
            [$subjectOfferedId, $userId]
        );
        if (!$owns) {
            echo json_encode(['success' => false, 'message' => 'You can only create sections for your assigned subjects']);
            return;
        }
    } elseif (!in_array($role, ['dean', 'admin'], true)) {
        echo json_encode(['success' => false, 'message' => 'Not authorized']);
        return;
    }

    $offeringRow = db()->fetchOne(
        "SELECT so.semester_id, s.program_id FROM subject_offered so
         JOIN subject s ON s.subject_id = so.subject_id WHERE so.subject_offered_id = ?",
        [$subjectOfferedId]
    );
    $programId  = $offeringRow ? (int)($offeringRow['program_id'] ?? 0) : null;
    $semesterId = $offeringRow ? (int)($offeringRow['semester_id'] ?? 0) : null;
    if (!$programId || !$semesterId) {
        $instrUser = db()->fetchOne("SELECT program_id FROM users WHERE users_id = ?", [$userId]);
        if ($instrUser && $instrUser['program_id']) {
            $programId = (int)$instrUser['program_id'];
        }
        $active = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        if ($active) {
            $semesterId = (int)$active['semester_id'];
        }
    }

    $code = generateEnrollmentCode();

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $pdo->prepare(
            "INSERT INTO section (section_name, program_id, year_level, semester_id, enrollment_code, max_students, status)
             VALUES (?, ?, NULL, ?, ?, ?, 'active')"
        )->execute([$sectionName, $programId, $semesterId, $code, $maxStudents]);

        $sectionId = (int)$pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO section_subject (section_id, subject_offered_id, schedule, room, status)
             VALUES (?, ?, ?, ?, 'active')"
        )->execute([$sectionId, $subjectOfferedId, $schedule, $room]);

        $sectionSubjectId = (int)$pdo->lastInsertId();
        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Section created',
            'data' => [
                'section_id'         => $sectionId,
                'enrollment_code'    => $code,
                'section_subject_id' => $sectionSubjectId,
            ]
        ]);
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Create section for subject: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create section']);
    }
}

// ─── Instructor-scoped list: sections containing the instructor's subjects ──

function handleInstructorList() {
    $userId = Auth::id();

    // Show sections that match the instructor's assigned program,
    // programs they teach via offerings, or sections they already have a subject in.
    $sections = db()->fetchAll(
        "SELECT sec.section_id, sec.section_name, sec.enrollment_code,
                sec.max_students, sec.status, sec.created_at,
                COUNT(DISTINCT ss_stud.user_student_id) AS student_count
         FROM section sec
         LEFT JOIN student_subject ss_stud ON ss_stud.section_id = sec.section_id
                                          AND ss_stud.status = 'enrolled'
         WHERE (
             sec.program_id = (SELECT program_id FROM users WHERE users_id = ? LIMIT 1)
             OR sec.program_id IN (
                 SELECT DISTINCT s.program_id
                 FROM subject_offered so
                 JOIN subject s ON s.subject_id = so.subject_id
                 WHERE so.user_teacher_id = ?
                   AND so.status = 'open'
                   AND s.program_id IS NOT NULL
             )
             OR sec.section_id IN (
                 SELECT DISTINCT ss.section_id
                 FROM section_subject ss
                 JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
                 WHERE so.user_teacher_id = ?
                   AND ss.status = 'active'
             )
         )
         GROUP BY sec.section_id
         ORDER BY sec.section_name",
        [$userId, $userId, $userId]
    );

    // Attach all subjects in each section, flagging instructor's own subjects
    foreach ($sections as &$sec) {
        $sec['subjects'] = db()->fetchAll(
            "SELECT ss.section_subject_id, ss.subject_offered_id,
                    ss.schedule, ss.room,
                    s.subject_id, s.subject_code, s.subject_name, s.units,
                    CONCAT(u.first_name, ' ', u.last_name) AS instructor_name,
                    CASE WHEN so.user_teacher_id = ? THEN 1 ELSE 0 END AS is_mine
             FROM section_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject s ON s.subject_id = so.subject_id
             LEFT JOIN users u ON u.users_id = so.user_teacher_id
             WHERE ss.section_id = ? AND ss.status = 'active'
             ORDER BY s.subject_code",
            [$userId, $sec['section_id']]
        );
    }

    echo json_encode(['success' => true, 'data' => $sections]);
}

// ─── Get instructor's programs (inferred from their subject offerings) ────────

function handleInstructorPrograms() {
    $userId = Auth::id();

    $programs = db()->fetchAll(
        "SELECT DISTINCT p.program_id, p.program_code, p.program_name,
                d.department_id, d.department_name, d.department_code
         FROM subject_offered so
         JOIN subject s   ON s.subject_id   = so.subject_id
         JOIN program p   ON p.program_id   = s.program_id
         JOIN department d ON d.department_id = p.department_id
         WHERE so.user_teacher_id = ?
           AND so.status = 'open'
           AND s.program_id IS NOT NULL
           AND p.status = 'active'
         ORDER BY p.program_code",
        [$userId]
    );

    echo json_encode(['success' => true, 'data' => $programs]);
}

// ─── Remove a class (cancel orphaned offering) from My Classes ────────────

function handleRemoveClass() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $offeredId = (int)($data['subject_offered_id'] ?? 0);
    $userId    = Auth::id();

    if (!$offeredId) {
        echo json_encode(['success' => false, 'message' => 'subject_offered_id required']);
        return;
    }

    // Must belong to this instructor
    $offering = db()->fetchOne(
        "SELECT subject_offered_id FROM subject_offered WHERE subject_offered_id = ? AND user_teacher_id = ?",
        [$offeredId, $userId]
    );
    if (!$offering) {
        echo json_encode(['success' => false, 'message' => 'Not found or not yours']);
        return;
    }

    // Must not be in any active section
    $inSection = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM section_subject WHERE subject_offered_id = ? AND status = 'active'",
        [$offeredId]
    )['c'] ?? 1;
    if ((int)$inSection > 0) {
        echo json_encode(['success' => false, 'message' => 'Cannot remove: subject is still assigned to a section']);
        return;
    }

    // Must have no enrolled students
    $hasStudents = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM student_subject WHERE subject_offered_id = ? AND status = 'enrolled'",
        [$offeredId]
    )['c'] ?? 1;
    if ((int)$hasStudents > 0) {
        echo json_encode(['success' => false, 'message' => 'Cannot remove: students are still enrolled']);
        return;
    }

    try {
        pdo()->prepare("UPDATE subject_offered SET status = 'cancelled', updated_at = NOW() WHERE subject_offered_id = ?")
            ->execute([$offeredId]);
        echo json_encode(['success' => true, 'message' => 'Removed from My Classes']);
    } catch (Exception $e) {
        error_log('Remove class: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to remove']);
    }
}

// ─── Only subjects the dean has assigned to this instructor ──────────────
// Returns subject_offered rows where user_teacher_id = caller and status = open,
// excluding subjects already in the target section.

function handleInstructorAssignedSubjects() {
    $userId    = Auth::id();
    $sectionId = (int)($_GET['section_id'] ?? 0);

    // Only show offerings from the active semester — same scope the dean uses
    // in Faculty Assignments. This prevents stale self-created offerings from
    // other semesters from appearing as "assigned".
    $semRow = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
    $semId  = $semRow ? (int)$semRow['semester_id'] : 0;
    if (!$semId) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    // ── Heal cancelled offerings for this instructor in the active semester ─────
    // Reactivate any 'cancelled' offering ONLY when there is no other 'open'
    // offering for the same subject (prevents creating duplicates).
    $cancelledRows = db()->fetchAll(
        "SELECT so.subject_offered_id, so.subject_id
         FROM subject_offered so
         WHERE so.user_teacher_id = ? AND so.semester_id = ? AND so.status = 'cancelled'",
        [$userId, $semId]
    );
    foreach ($cancelledRows as $cr) {
        $hasOpen = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
              WHERE subject_id = ? AND semester_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
            [$cr['subject_id'], $semId, $userId]
        );
        if (!$hasOpen) {
            db()->execute(
                "UPDATE subject_offered SET status = 'open', updated_at = NOW() WHERE subject_offered_id = ?",
                [$cr['subject_offered_id']]
            );
        }
    }

    // ── Deduplicate: cancel extra orphaned open offerings ─────────────────────
    // If the instructor has >1 open offering for the same subject in this semester,
    // keep only the one that is in a section (or the newest if none are).
    $allOpen = db()->fetchAll(
        "SELECT so.subject_offered_id, so.subject_id,
                (SELECT COUNT(*) FROM section_subject ss WHERE ss.subject_offered_id = so.subject_offered_id AND ss.status = 'active') AS in_section
         FROM subject_offered so
         WHERE so.user_teacher_id = ? AND so.semester_id = ? AND so.status = 'open'
         ORDER BY so.subject_id, in_section DESC, so.subject_offered_id DESC",
        [$userId, $semId]
    );
    $seenSubjects = [];
    foreach ($allOpen as $row) {
        $sid = $row['subject_id'];
        if (!isset($seenSubjects[$sid])) {
            $seenSubjects[$sid] = true; // keep this one (first = best)
        } else {
            // Duplicate — cancel the extra orphaned offering
            if ((int)$row['in_section'] === 0) {
                db()->execute(
                    "UPDATE subject_offered SET status = 'cancelled', updated_at = NOW() WHERE subject_offered_id = ?",
                    [$row['subject_offered_id']]
                );
            }
        }
    }

    // ── Return one row per subject (deduplicate with GROUP BY) ────────────────
    // Use MAX(so.subject_offered_id) so we pick the most recently created
    // offering when multiple rows exist for the same subject.
    $subjects = db()->fetchAll(
        "SELECT MAX(so.subject_offered_id) AS subject_offered_id,
                s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester AS curriculum_semester,
                p.program_id, p.program_code, p.program_name
         FROM subject_offered so
         JOIN subject s ON s.subject_id  = so.subject_id
         JOIN program p ON p.program_id  = s.program_id
         WHERE so.user_teacher_id = ?
           AND so.semester_id     = ?
           AND so.status          = 'open'
           AND s.status           = 'active'
           AND ($sectionId = 0 OR NOT EXISTS (
               SELECT 1 FROM section_subject ss
               JOIN subject_offered so2 ON so2.subject_offered_id = ss.subject_offered_id
               WHERE so2.subject_id      = s.subject_id
                 AND so2.user_teacher_id = $userId
                 AND ss.section_id       = $sectionId
                 AND ss.status           = 'active'
           ))
         GROUP BY s.subject_id, s.subject_code, s.subject_name, s.units,
                  s.year_level, s.semester,
                  p.program_id, p.program_code, p.program_name
         ORDER BY p.program_code, s.year_level, s.semester, s.subject_code",
        [$userId, $semId]
    );

    echo json_encode(['success' => true, 'data' => $subjects]);
}

// ─── Instructor-scoped available subjects (from subject table) ────────────
// Queries subject.program_id / year_level / semester directly — works even
// if the curriculum table hasn't been populated yet.
// Accepts: program_id, year_level, sem_level (1/2/3 = 1st/2nd/Summer).

function handleInstructorAvailSubjects() {
    $sectionId = (int)($_GET['section_id'] ?? 0);
    $programId = (int)($_GET['program_id'] ?? 0);
    $semLevel  = (int)($_GET['sem_level']  ?? 0);
    $yearLevel = (int)($_GET['year_level'] ?? 0);

    if (!$sectionId) {
        echo json_encode(['success' => false, 'message' => 'section_id required']);
        return;
    }

    if (!$programId) {
        echo json_encode([
            'success' => true,
            'data'    => [],
            '_debug'  => ['message' => 'Select a program to see curriculum subjects'],
        ]);
        return;
    }

    // Filter by program, exclude subjects already in this section
    $conditions = [
        "s.status     = 'active'",
        "s.program_id = ?",
        "NOT EXISTS (
            SELECT 1
            FROM section_subject ss
            JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
            WHERE so.subject_id = s.subject_id
              AND ss.section_id = ?
              AND ss.status     = 'active'
        )",
    ];
    $params = [$programId, $sectionId];

    if ($semLevel) {
        $conditions[] = "s.semester = ?";
        $params[]     = $semLevel;
    }
    if ($yearLevel) {
        $conditions[] = "s.year_level = ?";
        $params[]     = $yearLevel;
    }

    $where = implode(' AND ', $conditions);

    $subjects = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester AS curriculum_semester
         FROM subject s
         WHERE $where
         ORDER BY s.year_level, s.semester, s.subject_code",
        $params
    );

    echo json_encode([
        'success' => true,
        'data'    => $subjects,
        '_debug'  => [
            'program_id'   => $programId,
            'sem_level'    => $semLevel,
            'year_level'   => $yearLevel,
            'result_count' => count($subjects),
        ],
    ]);
}

// ─── List active instructors ───────────────────────────────────────────────

function handleInstructors() {
    $instructors = db()->fetchAll(
        "SELECT users_id, first_name, last_name, employee_id
         FROM users WHERE role = 'instructor' AND status = 'active'
         ORDER BY last_name, first_name"
    );
    echo json_encode(['success' => true, 'data' => $instructors]);
}

// ─── List students enrolled in a section ───────────────────────────────────

function handleStudents() {
    $sectionId = (int)($_GET['section_id'] ?? 0);
    if (!$sectionId) { echo json_encode(['success' => false, 'message' => 'section_id required']); return; }

    $students = db()->fetchAll(
        "SELECT ss.student_subject_id, ss.user_student_id, ss.subject_offered_id, ss.status,
                u.first_name, u.last_name, u.student_id,
                s.subject_id, s.subject_code, s.subject_name
         FROM student_subject ss
         JOIN users u ON u.users_id = ss.user_student_id
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         WHERE ss.section_id = ? AND ss.status = 'enrolled'
         ORDER BY u.last_name, u.first_name, s.subject_code",
        [$sectionId]
    );
    echo json_encode(['success' => true, 'data' => $students ?: []]);
}

// ─── List semesters (for section create/edit modal) ────────────────────────

function handleSemesters() {
    $sems = db()->fetchAll(
        "SELECT sem.semester_id, sem.semester_name, sem.academic_year, sem.status,
                st.sem_level
         FROM semester sem
         LEFT JOIN sem_type st ON sem.sem_type_id = st.sem_type_id
         ORDER BY sem.academic_year DESC, st.sem_level"
    );
    echo json_encode(['success' => true, 'data' => $sems]);
}

// ─── List active programs (for section create/edit modal) ──────────────────

function handlePrograms() {
    // Dean: always scope to their department only
    if (Auth::role() === 'dean') {
        $deanUser = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [Auth::id()]);
        $deptId   = (int)($deanUser['department_id'] ?? 0);
    } else {
        $deptId = (int)($_GET['department_id'] ?? 0);
    }

    if ($deptId) {
        $programs = db()->fetchAll(
            "SELECT p.program_id, p.program_code, p.program_name
             FROM program p
             JOIN department_program dp ON dp.program_id = p.program_id
             WHERE p.status = 'active' AND dp.department_id = ?
             ORDER BY p.program_code",
            [$deptId]
        );
    } else {
        $programs = db()->fetchAll(
            "SELECT program_id, program_code, program_name
             FROM program WHERE status = 'active' ORDER BY program_code"
        );
    }
    echo json_encode(['success' => true, 'data' => $programs]);
}

function handleDepartments() {
    // Dean: only return their own department
    if (Auth::role() === 'dean') {
        $deanUser = db()->fetchOne(
            "SELECT d.department_id, d.department_name, d.department_code
             FROM users u JOIN department d ON d.department_id = u.department_id
             WHERE u.users_id = ?",
            [Auth::id()]
        );
        $depts = $deanUser ? [$deanUser] : [];
    } else {
        $depts = db()->fetchAll(
            "SELECT department_id, department_name, department_code
             FROM department WHERE status = 'active' ORDER BY department_name"
        );
    }
    echo json_encode(['success' => true, 'data' => $depts]);
}

// ─── Unenroll a student from a subject in a section ────────────────────────

// ─── Verify instructor can manage a section (optional subject scope) ─────────

function verifyInstructorSectionAccess($sectionId, $userId, $subjectOfferedId = 0) {
    $sectionId = (int)$sectionId;
    $subjectOfferedId = (int)$subjectOfferedId;
    if (!$sectionId) return null;

    $params = [$sectionId, $userId];
    $offeringFilter = '';
    if ($subjectOfferedId > 0) {
        $offeringFilter = ' AND so.subject_offered_id = ?';
        $params[] = $subjectOfferedId;
    }

    return db()->fetchOne(
        "SELECT sec.section_id, sec.section_name, sec.enrollment_code, sec.max_students,
                so.subject_offered_id, so.subject_id,
                (SELECT COUNT(DISTINCT st.user_student_id) FROM student_subject st
                 WHERE st.section_id = sec.section_id AND st.status = 'enrolled') AS current_enrollment
         FROM section sec
         JOIN section_subject ss ON ss.section_id = sec.section_id AND ss.status = 'active'
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE sec.section_id = ? AND so.user_teacher_id = ? AND so.status = 'open' {$offeringFilter}
         LIMIT 1",
        $params
    );
}

function resolveStudentsFromIdentifiers(array $studentIds, array $emails) {
    $resolved = [];
    $notFound = [];

    foreach ($studentIds as $sid) {
        $sid = strtoupper(trim($sid));
        if ($sid === '') continue;
        $user = db()->fetchOne(
            "SELECT users_id, student_id, first_name, last_name, email
             FROM users WHERE role = 'student' AND UPPER(student_id) = ? AND status = 'active' LIMIT 1",
            [$sid]
        );
        if ($user) {
            $resolved[(int)$user['users_id']] = $user;
        } else {
            $notFound[] = ['value' => $sid, 'type' => 'student_id'];
        }
    }

    foreach ($emails as $email) {
        $email = strtolower(trim($email));
        if ($email === '') continue;
        $user = db()->fetchOne(
            "SELECT users_id, student_id, first_name, last_name, email
             FROM users WHERE role = 'student' AND LOWER(email) = ? AND status = 'active' LIMIT 1",
            [$email]
        );
        if ($user) {
            $resolved[(int)$user['users_id']] = $user;
        } else {
            $notFound[] = ['value' => $email, 'type' => 'email'];
        }
    }

    return [$resolved, $notFound];
}

function enrollStudentInSectionOffering($studentUserId, $sectionRow) {
    $sectionId = (int)$sectionRow['section_id'];
    $offeredId = (int)$sectionRow['subject_offered_id'];

    if ($sectionRow['max_students'] > 0 && $sectionRow['current_enrollment'] >= $sectionRow['max_students']) {
        return ['ok' => false, 'reason' => 'Section is full'];
    }

    $exists = db()->fetchOne(
        "SELECT student_subject_id FROM student_subject
         WHERE user_student_id = ? AND subject_offered_id = ? AND section_id = ? AND status = 'enrolled'",
        [$studentUserId, $offeredId, $sectionId]
    );
    if ($exists) {
        return ['ok' => false, 'reason' => 'Already enrolled'];
    }

    $otherSubject = db()->fetchOne(
        "SELECT ss2.student_subject_id FROM student_subject ss2
         JOIN subject_offered so2 ON so2.subject_offered_id = ss2.subject_offered_id
         WHERE ss2.user_student_id = ? AND so2.subject_id = ? AND ss2.status = 'enrolled'",
        [$studentUserId, $sectionRow['subject_id']]
    );
    if ($otherSubject) {
        return ['ok' => false, 'reason' => 'Already enrolled in this subject (another section)'];
    }

    pdo()->prepare(
        "INSERT INTO student_subject (user_student_id, subject_offered_id, section_id, status, enrollment_date)
         VALUES (?, ?, ?, 'enrolled', NOW())"
    )->execute([$studentUserId, $offeredId, $sectionId]);

    return ['ok' => true];
}

function handlePreviewImportStudents() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $sectionId = (int)($_POST['section_id'] ?? 0);
    $subjectOfferedId = (int)($_POST['subject_offered_id'] ?? 0);
    $userId = Auth::id();

    $section = verifyInstructorSectionAccess($sectionId, $userId, $subjectOfferedId);
    if (!$section) {
        echo json_encode(['success' => false, 'message' => 'Section not found or access denied']);
        return;
    }

    try {
        $parsed = selfParseStudentListInput();
        [$resolved, $notFound] = resolveStudentsFromIdentifiers($parsed['student_ids'], $parsed['emails']);

        $preview = [];
        foreach ($resolved as $u) {
            $preview[] = [
                'users_id'    => (int)$u['users_id'],
                'student_id'  => $u['student_id'],
                'name'        => trim($u['first_name'] . ' ' . $u['last_name']),
                'email'       => $u['email'],
            ];
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'section_name'     => $section['section_name'],
                'enrollment_code'  => $section['enrollment_code'],
                'parsed_count'     => count($parsed['student_ids']) + count($parsed['emails']),
                'parsed_ids'       => $parsed['student_ids'] ?? [],
                'parsed_emails'    => $parsed['emails'] ?? [],
                'sources'          => $parsed['sources'] ?? [],
                'matched'          => $preview,
                'not_found'        => $notFound,
            ]
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function handleBulkImportStudents() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $sectionId = (int)($_POST['section_id'] ?? 0);
    $subjectOfferedId = (int)($_POST['subject_offered_id'] ?? 0);
    $userId = Auth::id();

    $section = verifyInstructorSectionAccess($sectionId, $userId, $subjectOfferedId);
    if (!$section) {
        echo json_encode(['success' => false, 'message' => 'Section not found or access denied']);
        return;
    }

    try {
        $parsed = selfParseStudentListInput();
        [$resolved, $notFound] = resolveStudentsFromIdentifiers($parsed['student_ids'], $parsed['emails']);

        $added = [];
        $skipped = [];

        $pdo = pdo();
        $pdo->beginTransaction();

        foreach ($resolved as $studentUserId => $u) {
            $freshSection = verifyInstructorSectionAccess($sectionId, $userId, $subjectOfferedId);
            $result = enrollStudentInSectionOffering($studentUserId, $freshSection ?: $section);
            if ($result['ok']) {
                $added[] = [
                    'users_id'   => $studentUserId,
                    'student_id' => $u['student_id'],
                    'name'       => trim($u['first_name'] . ' ' . $u['last_name']),
                ];
                $section['current_enrollment'] = ($section['current_enrollment'] ?? 0) + 1;
            } else {
                $skipped[] = [
                    'student_id' => $u['student_id'],
                    'name'       => trim($u['first_name'] . ' ' . $u['last_name']),
                    'reason'     => $result['reason'],
                ];
            }
        }

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => count($added) . ' student(s) added' . (count($skipped) ? ', ' . count($skipped) . ' skipped' : ''),
            'data' => [
                'added'      => $added,
                'skipped'    => $skipped,
                'not_found'  => $notFound,
            ]
        ]);
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function selfParseStudentListInput() {
    $combined = ['student_ids' => [], 'emails' => [], 'raw_lines' => 0, 'sources' => []];
    $hasInput = false;

    if (!empty($_FILES['file']['tmp_name']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $fileParsed = StudentListParser::parseUploadedFile($_FILES['file']);
        $combined = StudentListParser::mergeParsed($combined, $fileParsed);
        $combined['sources'][] = [
            'type' => 'file',
            'name' => $fileParsed['source_file'] ?? ($_FILES['file']['name'] ?? ''),
            'format' => $fileParsed['source_type'] ?? '',
            'ids_found' => count($fileParsed['student_ids'] ?? []) + count($fileParsed['emails'] ?? []),
        ];
        $hasInput = true;
    }

    $paste = trim($_POST['student_list'] ?? '');
    if ($paste !== '') {
        $textParsed = StudentListParser::parseText($paste);
        $combined = StudentListParser::mergeParsed($combined, $textParsed);
        $combined['sources'][] = [
            'type' => 'paste',
            'name' => 'Pasted list',
            'format' => 'text',
            'ids_found' => count($textParsed['student_ids'] ?? []) + count($textParsed['emails'] ?? []),
        ];
        $hasInput = true;
    }

    $manual = array_filter(array_map('trim', explode(',', $_POST['student_ids'] ?? '')));
    if (!empty($manual)) {
        $manualParsed = StudentListParser::parseText(implode("\n", $manual));
        $combined = StudentListParser::mergeParsed($combined, $manualParsed);
        $hasInput = true;
    }

    if (!$hasInput) {
        throw new InvalidArgumentException('Upload a file or paste a student list');
    }

    if (empty($combined['student_ids']) && empty($combined['emails'])) {
        throw new InvalidArgumentException('No student IDs or emails were found in the file. Check the format and try again.');
    }

    return $combined;
}

function handleUnenroll() {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $studentSubjectId = (int)($data['student_subject_id'] ?? 0);

    if (!$studentSubjectId) { echo json_encode(['success' => false, 'message' => 'student_subject_id required']); return; }

    try {
        pdo()->prepare("DELETE FROM student_subject WHERE student_subject_id = ?")->execute([$studentSubjectId]);
        echo json_encode(['success' => true, 'message' => 'Student unenrolled']);
    } catch (Exception $e) {
        error_log('Unenroll: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to unenroll']);
    }
}
