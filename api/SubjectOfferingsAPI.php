<?php
/**
 * Subject Offerings API - CRUD for subject offerings
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
$_soPerms = [
    'list'                => 'subject_offerings.view',
    'list-multi'          => 'subject_offerings.view',
    'instructors'         => 'subject_offerings.view',
    'subjects'            => 'subject_offerings.view',
    'semesters'           => 'subject_offerings.view',
    'departments'         => 'subject_offerings.view',
    'programs'            => 'subject_offerings.view',
    'create'              => 'subject_offerings.create',
    'generate-offerings'  => 'subject_offerings.create',
    'assign'              => 'faculty_assignments.create',
    'bulk-assign'         => 'faculty_assignments.create',
    'update'              => 'subject_offerings.edit',
    'delete'              => 'subject_offerings.delete',
    // Faculty Assignments — per-section instructor view + manual transfer
    'subject-section-instructors' => 'faculty_assignments.view',
    'reassign-section'            => 'faculty_assignments.edit',
];
// Dean has intrinsic access to subject offerings (scoped by dept)
$isDeanSO = Auth::role() === 'dean';
if (!$isDeanSO && isset($_soPerms[$action]) && !Auth::can($_soPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_soPerms[$action]}"]);
    exit;
}

/** Returns the dean's {campus_id, campus_ids, program_id, department_id} (cached per request) */
function deanScope(): array {
    static $s = null;
    if ($s === null) {
        $row = db()->fetchOne("SELECT campus_id, program_id, department_id FROM users WHERE users_id = ?", [Auth::id()]);

        $multiRows = db()->fetchAll("SELECT campus_id FROM dean_campus_scope WHERE dean_id = ?", [Auth::id()]);
        $campusIds = array_map('intval', array_column($multiRows, 'campus_id'));
        $primaryId = (int)($row['campus_id'] ?? 0);
        if (empty($campusIds) && $primaryId) $campusIds = [$primaryId];

        $s = [
            'campus_id'     => $primaryId,
            'campus_ids'    => $campusIds,
            'program_id'    => (int)($row['program_id']    ?? 0),
            'department_id' => (int)($row['department_id'] ?? 0),
        ];
    }
    return $s;
}

/**
 * All program_ids the dean manages — a department can oversee several programs
 * (e.g. College of Education: BEEd, BSEdEng, BECEd, BSEdFil, BSEdMath), so this
 * must NOT be narrowed to the dean's own single users.program_id column, or
 * every program besides their "primary" one silently disappears from views
 * like Faculty Assignments even though Curriculum management already lets
 * them manage all of them (see CurriculumAPI.php's deanCanAccessProgram()).
 */
function deanProgramIds(): array {
    static $ids = null;
    if ($ids === null) {
        $scope = deanScope();
        $ids = [];
        if ($scope['department_id']) {
            $rows = db()->fetchAll(
                "SELECT program_id FROM department_program WHERE department_id = ?",
                [$scope['department_id']]
            );
            $ids = array_map(fn($r) => (int)$r['program_id'], $rows);
        }
        if (!$ids && $scope['program_id']) {
            $ids = [$scope['program_id']];
        }
    }
    return $ids;
}
function deanCampusId(): int { return deanScope()['campus_id']; }

switch ($action) {
    case 'list':                 handleList();                break;
    case 'list-multi':           handleListMulti();           break;
    case 'create':               handleCreate();              break;
    case 'open-all-term':        handleOpenAllTerm();          break;
    case 'update':               handleUpdate();              break;
    case 'delete':               handleDelete();              break;
    case 'assign':               handleAssign();              break;
    case 'bulk-assign':          handleBulkAssign();          break;
    case 'instructor-subjects':  handleInstructorSubjects();  break;
    case 'dean-assign':          handleDeanAssign();          break;
    // Faculty Assignments — see every section of a subject with its current
    // instructor (if any) across ALL offerings, not just one, so a dean can
    // spot a specific section and transfer it to a different instructor.
    case 'subject-section-instructors': handleSubjectSectionInstructors(); break;
    case 'reassign-section':            handleReassignSection();           break;
    case 'subject-instructors':  handleSubjectInstructors();  break;
    case 'subject-assign':       handleSubjectAssign();       break;
    case 'set-grading-type':     handleSetGradingType();      break;
    case 'set-ph-scope':         handleSetProgramHeadScope(); break;
    case 'instructors':          handleInstructors();         break;
    case 'generate-offerings':   handleGenerateOfferings();   break;
    case 'subjects':             handleSubjects();            break;
    case 'semesters':            handleSemesters();           break;
    case 'departments':          handleDepartments();         break;
    case 'programs':        handlePrograms();       break;
    case 'offered-list':    handleOfferedList();    break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function handleList() {
    $semesterId   = $_GET['semester_id'] ?? '';
    $programId    = (int)($_GET['program_id']  ?? 0);
    $instrId      = (int)($_GET['instructor_id'] ?? 0);
    $statusFilter = $_GET['status'] ?? '';

    // Build the correlated subquery that picks the best matching subject_offered per subject
    // Match by academic_year + sem_type_id instead of exact semester_id to handle duplicate semester rows
    $joinParams   = [];
    $semCondition = '';   // uses alias so2 — for the LIMIT 1 subquery
    if ($semesterId) {
        $intSemId = (int)$semesterId;
        $semCondition = "AND so2.semester_id IN (
                SELECT s2.semester_id FROM semester s2
                JOIN semester s3 ON s3.semester_id = $intSemId
                WHERE s2.academic_year = s3.academic_year AND s2.semester_name = s3.semester_name
            )";
    }

    $whereConditions = [];
    $whereParams     = [];
    if ($programId) {
        $whereConditions[] = 's.program_id = ?';
        $whereParams[]     = $programId;
    }
    // Dean: scope to all programs their department manages (not just their single
    // primary program_id) — see deanProgramIds() doc comment.
    if (Auth::role() === 'dean') {
        $progIds = deanProgramIds();
        if ($progIds) {
            $whereConditions[] = 's.program_id IN (' . implode(',', array_fill(0, count($progIds), '?')) . ')';
            $whereParams       = array_merge($whereParams, $progIds);
        }
    }
    // Status filter (open/closed/cancelled) — filter on the joined offering
    $statusCondition = '';
    $statusParam = null;
    if ($statusFilter && in_array($statusFilter, ['open', 'closed', 'cancelled', 'archived'], true)) {
        $statusCondition = 'AND so.status = ?';
        $statusParam = $statusFilter;
    }
    $where  = $whereConditions ? 'WHERE ' . implode(' AND ', $whereConditions) : '';
    $params = array_merge($joinParams, $whereParams);
    if ($statusParam !== null) {
        $params[] = $statusParam;
    }

    // Start from `subject` (the curriculum) and LEFT JOIN to the best offering
    $offerings = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester AS subject_semester,
                s.program_id, p.program_code, p.program_name,
                d.department_id, d.department_name,
                so.subject_offered_id, so.semester_id, so.user_teacher_id, so.status, so.batch,
                so.grading_type,
                sem.semester_name, sem.academic_year,
                CONCAT(u.first_name, ' ', u.last_name) AS instructor_name,
                (SELECT COUNT(*) FROM section_subject ss2
                 WHERE ss2.subject_offered_id = so.subject_offered_id
                   AND ss2.status = 'active') AS section_count,
                (SELECT COUNT(*) FROM student_subject ss
                 WHERE ss.subject_offered_id = so.subject_offered_id
                   AND ss.status = 'enrolled') AS student_count,
                -- True if this instructor has ANY non-cancelled offering for this subject
                -- (regardless of which offering LIMIT 1 picks above)
                CASE WHEN $instrId > 0 AND EXISTS (
                    SELECT 1 FROM section_subject ss_chk
                    JOIN subject_offered so3 ON so3.subject_offered_id = ss_chk.subject_offered_id
                    WHERE so3.subject_id = s.subject_id
                      AND so3.user_teacher_id = $instrId
                      AND so3.status != 'cancelled'
                      AND ss_chk.status = 'active'
                ) THEN 1 ELSE 0 END AS is_assigned_to_instructor
         FROM subject s
         LEFT JOIN program p  ON s.program_id    = p.program_id
         LEFT JOIN department d ON p.department_id = d.department_id
         LEFT JOIN subject_offered so ON so.subject_offered_id = (
             SELECT so2.subject_offered_id
             FROM subject_offered so2
             WHERE so2.subject_id = s.subject_id
               $semCondition
               AND so2.status != 'cancelled'
             ORDER BY (so2.user_teacher_id = $instrId) DESC,
                      (so2.user_teacher_id IS NOT NULL) DESC,
                      so2.semester_id DESC
             LIMIT 1
         )
         LEFT JOIN semester sem ON so.semester_id  = sem.semester_id
         LEFT JOIN users u      ON u.users_id       = so.user_teacher_id
         $where
         HAVING 1=1 $statusCondition
         ORDER BY p.program_code, s.year_level, s.semester, s.subject_code",
        $params
    );
    echo json_encode(['success' => true, 'data' => $offerings]);
}

/**
 * Returns every curriculum subject with ALL assigned instructors as a nested array.
 * Each subject appears once; its `instructors` key is an array of {subject_offered_id,
 * user_teacher_id, instructor_name, section_count, offering_status}.
 * Subjects with no assigned instructor have an empty `instructors` array.
 */
function handleListMulti() {
    $semesterId = $_GET['semester_id'] ?? '';
    $programId  = (int)($_GET['program_id'] ?? 0);

    $semJoin = '';
    if ($semesterId) {
        $intSemId = (int)$semesterId;
        $semJoin  = "AND so.semester_id IN (
            SELECT s2.semester_id FROM semester s2
            JOIN  semester s3 ON s3.semester_id = $intSemId
            WHERE s2.academic_year  = s3.academic_year
              AND s2.semester_name = s3.semester_name
        )";
    }

    $whereConditions = [];
    $whereParams     = [];
    if ($programId) {
        $whereConditions[] = 's.program_id = ?';
        $whereParams[]     = $programId;
    }
    if (Auth::role() === 'dean') {
        $progIds = deanProgramIds();
        if ($progIds) {
            $whereConditions[] = 's.program_id IN (' . implode(',', array_fill(0, count($progIds), '?')) . ')';
            $whereParams       = array_merge($whereParams, $progIds);
        }
    }
    $where = $whereConditions ? 'WHERE ' . implode(' AND ', $whereConditions) : '';

    // One row per (subject × instructor). Subjects with no assigned instructor
    // still appear once (all so.* and u.* columns are NULL).
    $rows = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester AS subject_semester,
                s.program_id, p.program_code, p.program_name,
                so.subject_offered_id,
                so.user_teacher_id,
                so.status AS offering_status,
                CONCAT(u.first_name, ' ', u.last_name) AS instructor_name,
                (SELECT COUNT(*) FROM section_subject ss2
                 WHERE ss2.subject_offered_id = so.subject_offered_id
                   AND ss2.status = 'active') AS section_count
         FROM subject s
         LEFT JOIN program    p  ON s.program_id     = p.program_id
         LEFT JOIN department d  ON p.department_id  = d.department_id
         LEFT JOIN subject_offered so
               ON  so.subject_id          = s.subject_id
               AND so.status             != 'cancelled'
               AND so.user_teacher_id    IS NOT NULL
               $semJoin
         LEFT JOIN users u ON u.users_id = so.user_teacher_id
         $where
         ORDER BY p.program_code, s.year_level, s.semester, s.subject_code, u.last_name, u.first_name",
        $whereParams
    );

    // Group into subject → instructors[]
    $subjects   = [];
    $subjectIdx = [];
    foreach ($rows as $row) {
        $sid = $row['subject_id'];
        if (!isset($subjectIdx[$sid])) {
            $subjectIdx[$sid] = count($subjects);
            $subjects[] = [
                'subject_id'       => $row['subject_id'],
                'subject_code'     => $row['subject_code'],
                'subject_name'     => $row['subject_name'],
                'units'            => $row['units'],
                'year_level'       => $row['year_level'],
                'subject_semester' => $row['subject_semester'],
                'program_id'       => $row['program_id'],
                'program_code'     => $row['program_code'],
                'program_name'     => $row['program_name'],
                'instructors'      => [],
            ];
        }
        if ($row['subject_offered_id']) {
            $subjects[$subjectIdx[$sid]]['instructors'][] = [
                'subject_offered_id' => $row['subject_offered_id'],
                'user_teacher_id'    => $row['user_teacher_id'],
                'instructor_name'    => $row['instructor_name'],
                'section_count'      => (int)($row['section_count'] ?? 0),
                'offering_status'    => $row['offering_status'],
            ];
        }
    }

    echo json_encode(['success' => true, 'data' => $subjects]);
}

function handleCreate() {
    $data = json_decode(file_get_contents('php://input'), true);
    $subjectId  = (int)($data['subject_id']  ?? 0);
    $status     = $data['status'] ?? 'open';
    $validBatch = ['1st Year','2nd Year','3rd Year','4th Year'];
    $batch      = in_array($data['batch'] ?? '', $validBatch) ? $data['batch'] : null;

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'Subject is required']);
        return;
    }

    // Dean: only allow offering subjects in their own department's programs
    if (Auth::role() === 'dean') {
        $scope  = deanScope();
        $deptId = $scope['department_id'];
        $owns   = null;
        if ($deptId) {
            $owns = db()->fetchOne(
                "SELECT s.subject_id FROM subject s
                 JOIN department_program dp ON dp.program_id = s.program_id AND dp.department_id = ?
                 WHERE s.subject_id = ? LIMIT 1",
                [$deptId, $subjectId]
            );
        } elseif ($scope['program_id']) {
            $owns = db()->fetchOne(
                "SELECT subject_id FROM subject WHERE subject_id = ? AND program_id = ? LIMIT 1",
                [$subjectId, $scope['program_id']]
            );
        }
        if (!$owns) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: subject is not in your department']);
            return;
        }
    }

    $semesterId = isset($data['semester_id']) && $data['semester_id'] ? (int)$data['semester_id'] : null;

    // One offering per subject PER SCHOOL SEMESTER — matched by academic_year +
    // sem_type_id (not raw semester_id, since duplicate semester rows exist).
    // A subject offered in a past/other semester must not block opening it
    // again for the current one.
    if ($semesterId) {
        $exists = db()->fetchOne(
            "SELECT so.subject_offered_id FROM subject_offered so
             JOIN semester sx ON so.semester_id = sx.semester_id
             JOIN semester sy ON sy.semester_id = ?
             WHERE so.subject_id = ?
               AND so.status NOT IN ('cancelled','archived')
               AND sx.academic_year  = sy.academic_year
               AND sx.semester_name = sy.semester_name",
            [$semesterId, $subjectId]
        );
    } else {
        // No semester given — fall back to the old semester-agnostic check.
        $exists = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered WHERE subject_id = ? AND semester_id IS NULL AND status NOT IN ('cancelled','archived')",
            [$subjectId]
        );
    }
    if ($exists) {
        echo json_encode(['success' => false, 'message' => 'This subject is already offered for this semester']);
        return;
    }

    try {
        pdo()->prepare("INSERT INTO subject_offered (subject_id, semester_id, batch, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())")
            ->execute([$subjectId, $semesterId, $batch, $status]);
        echo json_encode(['success' => true, 'message' => 'Subject offering created', 'data' => ['id' => pdo()->lastInsertId()]]);
    } catch (Exception $e) {
        error_log('Create offering: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create offering']);
    }
}

/**
 * Bulk-open every active-curriculum subject in a program whose own curriculum
 * term (1st/2nd/Summer) matches the currently active school semester's term —
 * one click instead of opening each subject one by one. Subjects already open
 * for this term are skipped; nothing off-term is touched.
 */
function handleOpenAllTerm() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $programId = (int)($data['program_id'] ?? 0);
    if (!$programId) {
        echo json_encode(['success' => false, 'message' => 'Program is required']);
        return;
    }

    // Dean: only their own department's programs
    if (Auth::role() === 'dean') {
        $scope  = deanScope();
        $owns   = null;
        if ($scope['department_id']) {
            $owns = db()->fetchOne(
                "SELECT 1 FROM department_program WHERE program_id = ? AND department_id = ?",
                [$programId, $scope['department_id']]
            );
        } elseif ($scope['program_id']) {
            $owns = ($programId === (int)$scope['program_id']) ? true : null;
        }
        if (!$owns) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: program is not in your department']);
            return;
        }
    }

    $activeSem = db()->fetchOne(
        "SELECT semester_id, academic_year, sem_type_id, semester_name FROM semester WHERE status = 'active' LIMIT 1"
    );
    if (!$activeSem) {
        echo json_encode(['success' => false, 'message' => 'No active school semester. Ask an admin to activate one first.']);
        return;
    }

    $subjects = db()->fetchAll(
        "SELECT DISTINCT s.subject_id
         FROM curriculum c
         JOIN subject s ON s.subject_id = c.course_id
         WHERE c.program_id = ? AND c.status = 'active' AND s.status = 'active'
           AND COALESCE(c.sem_num, s.semester, c.semester_id, 1) = ?",
        [$programId, $activeSem['sem_type_id']]
    );

    $opened = 0;
    foreach ($subjects as $row) {
        $subjectId = (int)$row['subject_id'];

        $exists = db()->fetchOne(
            "SELECT so.subject_offered_id FROM subject_offered so
             JOIN semester sx ON so.semester_id = sx.semester_id
             WHERE so.subject_id = ?
               AND so.status NOT IN ('cancelled','archived')
               AND sx.academic_year = ? AND sx.sem_type_id = ?",
            [$subjectId, $activeSem['academic_year'], $activeSem['sem_type_id']]
        );
        if ($exists) continue;

        pdo()->prepare(
            "INSERT INTO subject_offered (subject_id, semester_id, status, created_at, updated_at) VALUES (?, ?, 'open', NOW(), NOW())"
        )->execute([$subjectId, $activeSem['semester_id']]);
        $opened++;
    }

    echo json_encode([
        'success' => true,
        'message' => $opened
            ? "Opened {$opened} subject" . ($opened === 1 ? '' : 's') . " for {$activeSem['semester_name']}"
            : "Every subject for {$activeSem['semester_name']} was already open",
        'data' => ['opened' => $opened],
    ]);
}

function handleUpdate() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['subject_offered_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'ID required']); return; }

    $status       = $data['status'] ?? 'open';
    $validStatuses = ['open', 'closed', 'cancelled', 'archived'];
    if (!in_array($status, $validStatuses, true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid status']); return;
    }
    $validBatch = ['1st Year','2nd Year','3rd Year','4th Year'];
    $batch      = in_array($data['batch'] ?? '', $validBatch) ? $data['batch'] : null;

    // Optional — only present when the caller is toggling Raw Score <-> Global
    // Gradebook for this class (see the Subject Offered page's grading-type
    // control). Left untouched (not included in the UPDATE at all) when
    // absent, same as every other status-only update this action already
    // handles, so nothing here can silently flip an offering's grading mode
    // as a side effect of an unrelated Open/Close/Archive click.
    $gradingType = $data['grading_type'] ?? null;
    if ($gradingType !== null && !in_array($gradingType, ['raw_score', 'global'], true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid grading_type']); return;
    }

    // Instructors can only archive/open their own offerings
    if (Auth::role() === 'instructor') {
        $owns = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered WHERE subject_offered_id = ? AND user_teacher_id = ?",
            [$id, Auth::id()]
        );
        if (!$owns) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied']); return;
        }
        // Instructors may only toggle between open and archived
        if (!in_array($status, ['open', 'archived'], true)) {
            echo json_encode(['success' => false, 'message' => 'Instructors may only archive or unarchive subjects']); return;
        }
        if ($gradingType !== null) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Only admins and deans can change the grading type']); return;
        }
    }

    try {
        if ($gradingType !== null) {
            pdo()->prepare("UPDATE subject_offered SET status = ?, batch = ?, grading_type = ?, updated_at = NOW() WHERE subject_offered_id = ?")
                ->execute([$status, $batch, $gradingType, $id]);
        } else {
            pdo()->prepare("UPDATE subject_offered SET status = ?, batch = ?, updated_at = NOW() WHERE subject_offered_id = ?")
                ->execute([$status, $batch, $id]);
        }
        echo json_encode(['success' => true, 'message' => 'Offering updated']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to update']);
    }
}

function handleDelete() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['subject_offered_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'ID required']); return; }

    $sections = db()->fetchOne("SELECT COUNT(*) as c FROM section_subject WHERE subject_offered_id = ? AND status = 'active'", [$id])['c'] ?? 0;
    if ($sections > 0) {
        echo json_encode(['success' => false, 'message' => "Cannot cancel offering with $sections active section(s)"]);
        return;
    }

    try {
        pdo()->prepare("UPDATE subject_offered SET status = 'cancelled', updated_at = NOW() WHERE subject_offered_id = ?")->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Offering cancelled']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed']);
    }
}

function handleAssign() {
    $data = json_decode(file_get_contents('php://input'), true);
    $offId  = (int)($data['subject_offered_id'] ?? 0);
    $userId = (int)($data['user_teacher_id']    ?? 0);

    if (!$offId) {
        echo json_encode(['success' => false, 'message' => 'subject_offered_id required']);
        return;
    }

    try {
        pdo()->prepare("UPDATE subject_offered SET user_teacher_id = ?, updated_at = NOW() WHERE subject_offered_id = ?")
            ->execute([$userId ?: null, $offId]);
        echo json_encode(['success' => true, 'message' => 'Instructor assigned']);
    } catch (Exception $e) {
        error_log('Assign instructor: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to assign instructor']);
    }
}

// ─── Get all dept subjects with assignment status for one instructor ──────────
// Returns ONE row per subject (aggregated). A subject may have multiple
// subject_offered rows (one per instructor) — we aggregate to avoid duplicates.

function handleInstructorSubjects() {
    if (!in_array(Auth::role(), ['dean','admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $instrId = (int)($_GET['instructor_id'] ?? 0);
    $semId   = (int)($_GET['semester_id']   ?? 0);

    // Resolve active semester if none given
    if (!$semId) {
        $act   = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        $semId = $act ? (int)$act['semester_id'] : 0;
    }

    // Scope to every program the dean's department manages — a department can
    // oversee multiple programs, so this must not collapse to just one.
    $progIds = deanProgramIds();
    if (!$progIds) {
        echo json_encode(['success' => true, 'data' => [], 'semester_id' => $semId]);
        return;
    }
    $progIdList = implode(',', $progIds);

    $instrParam = $instrId ?: 0;
    // Aggregate: one row per subject.
    // is_assigned    = 1 if THIS instructor has any offering for this subject
    // taken_by_other = 1 if ANY OTHER instructor also has an offering (informational — does NOT block)
    // other_instructor_names = comma-separated names of other assigned instructors
    $subjects = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester AS subject_semester,
                p.program_id, p.program_code, p.program_name,
                MAX(CASE WHEN so.user_teacher_id = $instrParam AND $instrParam > 0 THEN 1 ELSE 0 END) AS is_assigned,
                MAX(CASE WHEN so.subject_offered_id IS NOT NULL THEN 1 ELSE 0 END) AS has_offering,
                MAX(CASE WHEN so.user_teacher_id IS NOT NULL AND so.user_teacher_id != $instrParam THEN 1 ELSE 0 END) AS taken_by_other,
                GROUP_CONCAT(DISTINCT
                    CASE WHEN so.user_teacher_id IS NOT NULL AND so.user_teacher_id != $instrParam
                         THEN CONCAT(ou.first_name,' ',ou.last_name)
                         ELSE NULL END
                    ORDER BY ou.last_name SEPARATOR ', ')
                AS other_instructor_names,
                -- Which section(s) THIS instructor teaches this subject in —
                -- Manage Faculty's what-section-do-they-handle view needs
                -- this; the checklist view above just ignores the column.
                GROUP_CONCAT(DISTINCT
                    CASE WHEN so.user_teacher_id = $instrParam AND $instrParam > 0
                         THEN sec.section_name ELSE NULL END
                    ORDER BY sec.section_name SEPARATOR ', ')
                AS assigned_sections
         FROM subject s
         JOIN program p ON p.program_id = s.program_id
         LEFT JOIN subject_offered so
               ON so.subject_id = s.subject_id
              AND so.semester_id = $semId
              AND so.status != 'cancelled'
         LEFT JOIN users ou
               ON ou.users_id = so.user_teacher_id
              AND so.user_teacher_id != $instrParam
         LEFT JOIN section_subject ssub
               ON ssub.subject_offered_id = so.subject_offered_id
              AND ssub.status != 'cancelled'
         LEFT JOIN section sec ON sec.section_id = ssub.section_id
         WHERE s.program_id IN ($progIdList) AND s.status = 'active'
         GROUP BY s.subject_id, s.subject_code, s.subject_name, s.units,
                  s.year_level, s.semester,
                  p.program_id, p.program_code, p.program_name
         ORDER BY p.program_code, s.year_level, s.semester, s.subject_code",
        []
    );

    echo json_encode(['success' => true, 'data' => $subjects, 'semester_id' => $semId]);
}

// ─── Batch assign subjects to an instructor (dean only) ───────────────────────
// Multi-instructor aware: never overwrites another instructor's offering.
// Works with subject_ids (not subject_offered_ids) so multiple offerings per
// subject are handled by creating new rows, not by clobbering existing ones.
//
// POST body: { instructor_id, semester_id?,
//              assign_subject_ids: int[],   ← subject_ids to assign
//              unassign_subject_ids: int[]  ← subject_ids to unassign }

function handleDeanAssign() {
    if (!in_array(Auth::role(), ['dean','admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $instrId   = (int)($data['instructor_id'] ?? 0);
    $semId     = (int)($data['semester_id']   ?? 0);
    $assignIds = array_filter(array_map('intval', $data['assign_subject_ids']   ?? []), fn($x) => $x > 0);
    $unassignIds = array_filter(array_map('intval', $data['unassign_subject_ids'] ?? []), fn($x) => $x > 0);

    if (!$instrId) {
        echo json_encode(['success' => false, 'message' => 'instructor_id required']);
        return;
    }
    if (empty($assignIds) && empty($unassignIds)) {
        echo json_encode(['success' => false, 'message' => 'No changes to apply']);
        return;
    }
    if (!$semId) {
        $act   = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        $semId = $act ? (int)$act['semester_id'] : 0;
    }

    // Verify instructor is on dean's campus in dean's department.
    // Exception: a dean may assign themselves (instrId == their own users_id).
    $scope    = deanScope();
    $deptId   = $scope['department_id'];
    $isSelf   = ($instrId === Auth::id() && Auth::role() === 'dean');

    if (!$isSelf && empty($scope['campus_ids'])) {
        echo json_encode(['success' => false, 'message' => 'Your account is not assigned to a campus.']);
        return;
    }

    if (!$isSelf) {
        $campusPlaceholders = implode(',', array_fill(0, count($scope['campus_ids']), '?'));
        // Program Heads can hold subject assignments too, not just plain
        // instructors — subject-assign (the other assignment endpoint) never
        // restricted the target's role at all, so this one requiring
        // role='instructor' specifically was a real gap that would silently
        // reject a valid Program Head assignment with "not in your department".
        if ($deptId) {
            $instrCheck = db()->fetchOne(
                "SELECT u.users_id FROM users u
                 WHERE u.users_id = ? AND u.campus_id IN ($campusPlaceholders)
                   AND (u.department_id = ? OR (u.program_id IS NOT NULL AND EXISTS (
                       SELECT 1 FROM department_program dp WHERE dp.program_id = u.program_id AND dp.department_id = ?
                   )))
                   AND u.role IN ('instructor', 'program_head') AND u.status = 'active'",
                array_merge([$instrId], $scope['campus_ids'], [$deptId, $deptId])
            );
        } else {
            $instrCheck = db()->fetchOne(
                "SELECT u.users_id FROM users u
                 WHERE u.users_id = ? AND u.campus_id IN ($campusPlaceholders) AND u.role IN ('instructor', 'program_head') AND u.status = 'active'",
                array_merge([$instrId], $scope['campus_ids'])
            );
        }
        if (!$instrCheck) {
            echo json_encode(['success' => false, 'message' => 'Instructor not in your department']);
            return;
        }
    }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        // ── Assign: find-or-create this instructor's own offering row ─────────
        foreach ($assignIds as $subjectId) {
            // Already have their own offering? Skip.
            $mine = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
                [$subjectId, $semId, $instrId]
            );
            if ($mine) continue;

            // Unclaimed offering exists? Claim it.
            $empty = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id IS NULL AND status = 'open' LIMIT 1",
                [$subjectId, $semId]
            );
            if ($empty) {
                $pdo->prepare("UPDATE subject_offered SET user_teacher_id = ?, updated_at = NOW() WHERE subject_offered_id = ?")
                    ->execute([$instrId, $empty['subject_offered_id']]);
            } else {
                // All existing offerings belong to other instructors — create a new one.
                $pdo->prepare(
                    "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'open', NOW(), NOW())"
                )->execute([$subjectId, $semId, $instrId]);
            }
        }

        // ── Unassign: only touch this instructor's own row ────────────────────
        foreach ($unassignIds as $subjectId) {
            $pdo->prepare(
                "UPDATE subject_offered SET user_teacher_id = NULL, updated_at = NOW()
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id = ? AND status = 'open'"
            )->execute([$subjectId, $semId, $instrId]);
        }

        $pdo->commit();
        $total = count($assignIds) + count($unassignIds);
        echo json_encode(['success' => true, 'message' => "Updated $total subject(s)"]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('DeanAssign: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save assignments']);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-section instructor view + transfer — a subject can have several
// sections, and each section's subject_offered can carry a DIFFERENT
// instructor (linkOffering()/dean-assign both find-or-create one offering
// PER instructor, not one shared offering per subject) — handleSubjectSections()
// above only ever looks at the single latest offering, which silently hides
// any section attached to an older/different instructor's offering. These
// two actions look across ALL of a subject's offerings for one semester.
// ─────────────────────────────────────────────────────────────────────────────

/** GET ?action=subject-section-instructors&subject_id=&semester_id= — every section + its current instructor, across all offerings. */
function handleSubjectSectionInstructors() {
    if (!in_array(Auth::role(), ['dean', 'admin'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $subjectId = (int)($_GET['subject_id'] ?? 0);
    $semId     = (int)($_GET['semester_id'] ?? 0);
    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }
    if (!$semId) {
        $act   = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        $semId = $act ? (int)$act['semester_id'] : 0;
    }

    if (Auth::role() === 'dean') {
        $progIds = deanProgramIds();
        $subj = db()->fetchOne("SELECT program_id FROM subject WHERE subject_id = ?", [$subjectId]);
        if ($progIds && $subj && !in_array((int)$subj['program_id'], $progIds, true)) {
            echo json_encode(['success' => false, 'message' => 'Subject not in your program']);
            return;
        }
    }

    $rows = db()->fetchAll(
        "SELECT sec.section_id, sec.section_name, ss.section_subject_id, ss.subject_offered_id,
                so.user_teacher_id, u.first_name AS instr_first, u.last_name AS instr_last
         FROM section_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN section sec ON sec.section_id = ss.section_id
         LEFT JOIN users u ON u.users_id = so.user_teacher_id
         WHERE so.subject_id = ? AND so.semester_id = ? AND so.status != 'cancelled' AND ss.status != 'cancelled'
         ORDER BY sec.section_name",
        [$subjectId, $semId]
    );

    $sections = array_map(function ($r) {
        return [
            'section_id'         => (int)$r['section_id'],
            'section_name'       => $r['section_name'],
            'section_subject_id' => (int)$r['section_subject_id'],
            'subject_offered_id' => (int)$r['subject_offered_id'],
            'instructor_id'      => $r['user_teacher_id'] ? (int)$r['user_teacher_id'] : null,
            'instructor_name'    => $r['user_teacher_id'] ? trim($r['instr_first'] . ' ' . $r['instr_last']) : null,
        ];
    }, $rows);

    echo json_encode(['success' => true, 'data' => ['sections' => $sections, 'semester_id' => $semId]]);
}

/** POST ?action=reassign-section — move one section from its current instructor to a different one. */
function handleReassignSection() {
    if (!in_array(Auth::role(), ['dean', 'admin'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $data       = json_decode(file_get_contents('php://input'), true) ?? [];
    $sectSubjId = (int)($data['section_subject_id'] ?? 0);
    $newInstrId = (int)($data['new_instructor_id']  ?? 0);
    if (!$sectSubjId || !$newInstrId) {
        echo json_encode(['success' => false, 'message' => 'section_subject_id and new_instructor_id are required']);
        return;
    }

    $current = db()->fetchOne(
        "SELECT ss.section_subject_id, ss.section_id, so.subject_offered_id, so.subject_id, so.semester_id, so.user_teacher_id
         FROM section_subject ss JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.section_subject_id = ?",
        [$sectSubjId]
    );
    if (!$current) {
        echo json_encode(['success' => false, 'message' => 'Section assignment not found']);
        return;
    }

    // Dean scope check — same "in my department" rule dean-assign uses,
    // applied to the NEW instructor being handed this section.
    if (Auth::role() === 'dean') {
        $scope  = deanScope();
        $deptId = $scope['department_id'];
        if (empty($scope['campus_ids'])) {
            echo json_encode(['success' => false, 'message' => 'Your account is not assigned to a campus.']);
            return;
        }
        $campusPlaceholders = implode(',', array_fill(0, count($scope['campus_ids']), '?'));
        $params = array_merge([$newInstrId], $scope['campus_ids']);
        $deptCond = '';
        if ($deptId) {
            $deptCond = "AND (u.department_id = ? OR (u.program_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM department_program dp WHERE dp.program_id = u.program_id AND dp.department_id = ?
            )))";
            $params[] = $deptId; $params[] = $deptId;
        }
        $check = db()->fetchOne(
            "SELECT u.users_id FROM users u WHERE u.users_id = ? AND u.campus_id IN ($campusPlaceholders)
             $deptCond AND u.role IN ('instructor','program_head') AND u.status = 'active'",
            $params
        );
        if (!$check) {
            echo json_encode(['success' => false, 'message' => 'Instructor not in your department']);
            return;
        }
    }

    if ((int)$current['user_teacher_id'] === $newInstrId) {
        echo json_encode(['success' => false, 'message' => 'Already assigned to that instructor']);
        return;
    }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        // Find-or-create the new instructor's own offering for this subject
        // + semester — identical logic to dean-assign's "assign" branch,
        // just reused here for a single section transfer instead of a whole
        // subject.
        $mine = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
              WHERE subject_id = ? AND semester_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
            [$current['subject_id'], $current['semester_id'], $newInstrId]
        );
        if ($mine) {
            $targetOfferingId = (int)$mine['subject_offered_id'];
        } else {
            $empty = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id IS NULL AND status = 'open' LIMIT 1",
                [$current['subject_id'], $current['semester_id']]
            );
            if ($empty) {
                $pdo->prepare("UPDATE subject_offered SET user_teacher_id = ?, updated_at = NOW() WHERE subject_offered_id = ?")
                    ->execute([$newInstrId, $empty['subject_offered_id']]);
                $targetOfferingId = (int)$empty['subject_offered_id'];
            } else {
                $pdo->prepare(
                    "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'open', NOW(), NOW())"
                )->execute([$current['subject_id'], $current['semester_id'], $newInstrId]);
                $targetOfferingId = (int)$pdo->lastInsertId();
            }
        }

        // Only the INSTRUCTOR changes here — every student's existing grades
        // and progress must survive the move untouched, not reset to zero.
        // Figure out who's actually in this section BEFORE moving anything,
        // since global_module_grades/global_project_grades/global_retry_tracker
        // are keyed by (subject_offered_id, student_id) — moving the section
        // without also moving these would leave real, already-entered grades
        // orphaned under the old offering, invisible from the student's new
        // (post-transfer) enrollment.
        $studentIds = array_column(
            db()->fetchAll(
                "SELECT user_student_id FROM student_subject WHERE section_id = ? AND subject_offered_id = ?",
                [$current['section_id'], $current['subject_offered_id']]
            ),
            'user_student_id'
        );

        // Move just this one section over to the new instructor's offering —
        // every other section on the old offering is untouched.
        $pdo->prepare("UPDATE section_subject SET subject_offered_id = ? WHERE section_subject_id = ?")
            ->execute([$targetOfferingId, $sectSubjId]);

        // Carry the student enrollments for this section along with it —
        // otherwise they'd stay pointed at the old instructor's offering.
        // final_grade/status/remarks live on this same row, so they move too.
        $pdo->prepare(
            "UPDATE student_subject SET subject_offered_id = ?, updated_at = NOW()
             WHERE section_id = ? AND subject_offered_id = ?"
        )->execute([$targetOfferingId, $current['section_id'], $current['subject_offered_id']]);

        // Carry each moved student's Global Gradebook records along too — a
        // NOT EXISTS guard so a student who (unusually) already has a row
        // under the target offering keeps that one intact instead of a raw
        // UPDATE hitting a duplicate-key conflict or silently overwriting it.
        foreach ($studentIds as $sid) {
            $pdo->prepare(
                "UPDATE global_module_grades SET subject_offered_id = ?
                 WHERE subject_offered_id = ? AND student_id = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM (SELECT * FROM global_module_grades) g2
                     WHERE g2.subject_offered_id = ? AND g2.student_id = ?
                       AND g2.module_number = global_module_grades.module_number
                   )"
            )->execute([$targetOfferingId, $current['subject_offered_id'], $sid, $targetOfferingId, $sid]);

            $pdo->prepare(
                "UPDATE global_project_grades SET subject_offered_id = ?
                 WHERE subject_offered_id = ? AND student_id = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM (SELECT * FROM global_project_grades) g2
                     WHERE g2.subject_offered_id = ? AND g2.student_id = ?
                   )"
            )->execute([$targetOfferingId, $current['subject_offered_id'], $sid, $targetOfferingId, $sid]);

            $pdo->prepare(
                "UPDATE global_retry_tracker SET subject_offered_id = ?
                 WHERE subject_offered_id = ? AND student_id = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM (SELECT * FROM global_retry_tracker) g2
                     WHERE g2.subject_offered_id = ? AND g2.student_id = ?
                   )"
            )->execute([$targetOfferingId, $current['subject_offered_id'], $sid, $targetOfferingId, $sid]);
        }

        $pdo->commit();

        $newInstr = db()->fetchOne("SELECT first_name, last_name FROM users WHERE users_id = ?", [$newInstrId]);
        echo json_encode(['success' => true, 'message' => 'Section transferred', 'data' => [
            'section_subject_id' => $sectSubjId,
            'subject_offered_id' => $targetOfferingId,
            'instructor_name'    => $newInstr ? trim($newInstr['first_name'] . ' ' . $newInstr['last_name']) : null,
        ]]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('ReassignSection: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to transfer section']);
    }
}

// ─── Get all dept instructors with is_assigned flag for one subject ───────────
// GET: subject_id, semester_id
function handleSubjectInstructors() {
    if (Auth::role() !== 'dean') {
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $subjectId = (int)($_GET['subject_id'] ?? 0);
    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }

    $scope = deanScope();
    if (empty($scope['campus_ids'])) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    $deptId = $scope['department_id'];
    $campusPlaceholders = implode(',', array_fill(0, count($scope['campus_ids']), '?'));
    $qParams = array_merge([$subjectId], $scope['campus_ids']);
    $deptCond = '';
    if ($deptId) {
        $deptCond = "AND (u.department_id = ? OR (u.program_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM department_program dp WHERE dp.program_id = u.program_id AND dp.department_id = ?
        )))";
        $qParams[] = $deptId;
        $qParams[] = $deptId;
    }
    // Deans may only appear in the list as themselves (not other deans in the same dept)
    $qParams[] = Auth::id();

    // is_assigned = has any active offering for this subject
    // Candidates: instructors + program heads in the dean's dept/campus, plus the dean themselves.
    $instructors = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.last_name, u.employee_id, u.email,
                u.role, u.year_level_from, u.year_level_to,
                p.program_code, p.program_name,
                CASE WHEN so.subject_offered_id IS NOT NULL THEN 1 ELSE 0 END AS is_assigned,
                so.subject_offered_id AS assigned_offering_id,
                so.grading_type
         FROM users u
         LEFT JOIN program p ON p.program_id = u.program_id
         LEFT JOIN subject_offered so
               ON so.subject_id = ? AND so.user_teacher_id = u.users_id
              AND so.status NOT IN ('cancelled','archived')
         WHERE u.campus_id IN ($campusPlaceholders) $deptCond
           AND u.role IN ('instructor', 'program_head', 'dean')
           AND (u.role != 'dean' OR u.users_id = ?)
           AND u.status = 'active'
         ORDER BY FIELD(u.role, 'dean', 'program_head', 'instructor'), u.last_name, u.first_name",
        $qParams
    );

    echo json_encode(['success' => true, 'data' => $instructors]);
}

// ─── Toggle raw_score / global grading for one subject offering ───────────────
// POST body: { subject_offered_id, grading_type: 'raw_score'|'global' }
function handleSetGradingType() {
    if (!in_array(Auth::role(), ['dean', 'admin'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $offeredId = (int)($data['subject_offered_id'] ?? 0);
    $type      = $data['grading_type'] ?? '';

    if (!$offeredId || !in_array($type, ['raw_score', 'global'], true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        return;
    }

    if (Auth::role() === 'dean') {
        $scope = deanScope();
        $owns = db()->fetchOne(
            "SELECT so.subject_offered_id FROM subject_offered so
             JOIN subject s ON s.subject_id = so.subject_id
             LEFT JOIN department_program dp ON dp.program_id = s.program_id
             WHERE so.subject_offered_id = ?
               AND (dp.department_id = ? OR s.program_id = ?) LIMIT 1",
            [$offeredId, $scope['department_id'], $scope['program_id']]
        );
        if (!$owns) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: offering is not in your department']);
            return;
        }
    }

    try {
        pdo()->prepare("UPDATE subject_offered SET grading_type = ?, updated_at = NOW() WHERE subject_offered_id = ?")
            ->execute([$type, $offeredId]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('SetGradingType: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update grading type']);
    }
}

// ─── Set a Program Head's year-level supervision scope ────────────────────────
// POST body: { users_id, year_level_from, year_level_to } (either may be null to clear)
function handleSetProgramHeadScope() {
    if (Auth::role() !== 'dean') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $data   = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = (int)($data['users_id'] ?? 0);
    $from   = $data['year_level_from'] ?? null;
    $to     = $data['year_level_to']   ?? null;
    $from   = ($from !== null && $from !== '') ? max(1, min(4, (int)$from)) : null;
    $to     = ($to   !== null && $to   !== '') ? max(1, min(4, (int)$to))   : null;

    if (!$userId) {
        echo json_encode(['success' => false, 'message' => 'users_id required']);
        return;
    }

    $scope = deanScope();
    if (empty($scope['campus_ids'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: not a program head in your department']);
        return;
    }
    $campusPlaceholders = implode(',', array_fill(0, count($scope['campus_ids']), '?'));
    $target = db()->fetchOne(
        "SELECT users_id FROM users
         WHERE users_id = ? AND role = 'program_head' AND campus_id IN ($campusPlaceholders)
           AND (department_id = ? OR program_id = ?) LIMIT 1",
        array_merge([$userId], $scope['campus_ids'], [$scope['department_id'], $scope['program_id']])
    );
    if (!$target) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: not a program head in your department']);
        return;
    }

    try {
        pdo()->prepare("UPDATE users SET year_level_from = ?, year_level_to = ?, updated_at = NOW() WHERE users_id = ?")
            ->execute([$from, $to, $userId]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('SetProgramHeadScope: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update scope']);
    }
}

// ─── Assign/unassign multiple instructors to one subject ──────────────────────
// POST body: { subject_id, semester_id?, assign_instructor_ids: [], unassign_instructor_ids: [] }
function handleSubjectAssign() {
    if (!in_array(Auth::role(), ['dean', 'admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $data        = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId   = (int)($data['subject_id']   ?? 0);
    $assignIds   = array_values(array_filter(array_map('intval', $data['assign_instructor_ids']   ?? []), fn($x) => $x > 0));
    $unassignIds = array_values(array_filter(array_map('intval', $data['unassign_instructor_ids'] ?? []), fn($x) => $x > 0));

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }
    if (empty($assignIds) && empty($unassignIds)) {
        echo json_encode(['success' => false, 'message' => 'No changes to apply']);
        return;
    }

    // Scope: subject must be in dean's department's programs
    if (Auth::role() === 'dean') {
        $scope  = deanScope();
        $deptId = $scope['department_id'];
        $owns   = null;
        if ($deptId) {
            $owns = db()->fetchOne(
                "SELECT s.subject_id FROM subject s
                 JOIN department_program dp ON dp.program_id = s.program_id AND dp.department_id = ?
                 WHERE s.subject_id = ? LIMIT 1",
                [$deptId, $subjectId]
            );
        } elseif ($scope['program_id']) {
            $owns = db()->fetchOne(
                "SELECT subject_id FROM subject WHERE subject_id = ? AND program_id = ? LIMIT 1",
                [$subjectId, $scope['program_id']]
            );
        }
        if (!$owns) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: subject is not in your department']);
            return;
        }
    }

    // Assignments should target the row for the CURRENT active semester —
    // a subject can carry old rows from past semesters (see handleCreate's
    // semester-scoped "already offered" check for why those must not be
    // touched here).
    $activeSem = db()->fetchOne("SELECT semester_id, academic_year, semester_name FROM semester WHERE status = 'active' LIMIT 1");

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        foreach ($assignIds as $instrId) {
            // Already assigned? Skip.
            $mine = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                  WHERE subject_id = ? AND user_teacher_id = ? AND status NOT IN ('cancelled','archived') LIMIT 1",
                [$subjectId, $instrId]
            );
            if ($mine) continue;

            // Unclaimed offering for the ACTIVE semester exists? Claim it.
            if ($activeSem) {
                $empty = db()->fetchOne(
                    "SELECT so.subject_offered_id FROM subject_offered so
                     JOIN semester sx ON so.semester_id = sx.semester_id
                     WHERE so.subject_id = ? AND so.user_teacher_id IS NULL AND so.status = 'open'
                       AND sx.academic_year = ? AND sx.semester_name = ? LIMIT 1",
                    [$subjectId, $activeSem['academic_year'], $activeSem['semester_name']]
                );
            } else {
                $empty = db()->fetchOne(
                    "SELECT subject_offered_id FROM subject_offered
                      WHERE subject_id = ? AND user_teacher_id IS NULL AND status = 'open' AND semester_id IS NULL LIMIT 1",
                    [$subjectId]
                );
            }
            if ($empty) {
                $pdo->prepare("UPDATE subject_offered SET user_teacher_id = ?, updated_at = NOW() WHERE subject_offered_id = ?")
                    ->execute([$instrId, $empty['subject_offered_id']]);
            } else {
                $pdo->prepare(
                    "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'open', NOW(), NOW())"
                )->execute([$subjectId, $activeSem['semester_id'] ?? null, $instrId]);
            }
        }

        foreach ($unassignIds as $instrId) {
            $pdo->prepare(
                "UPDATE subject_offered SET user_teacher_id = NULL, updated_at = NOW()
                  WHERE subject_id = ? AND user_teacher_id = ? AND status NOT IN ('cancelled','archived')"
            )->execute([$subjectId, $instrId]);
        }

        $pdo->commit();
        $total = count($assignIds) + count($unassignIds);
        echo json_encode(['success' => true, 'message' => "Updated $total instructor(s)"]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('SubjectAssign: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save assignments']);
    }
}

function handleInstructors() {
    $where  = ["u.role = 'instructor'", "u.status = 'active'"];
    $params = [];

    // Dean: scope to their own campus/campuses — this endpoint bypasses the RBAC
    // permission check for deans (see $isDeanSO above), so it must self-scope.
    if (Auth::role() === 'dean') {
        $scope = deanScope();
        if (empty($scope['campus_ids'])) {
            echo json_encode(['success' => true, 'data' => []]);
            return;
        }
        $where[] = 'u.campus_id IN (' . implode(',', array_fill(0, count($scope['campus_ids']), '?')) . ')';
        $params  = array_merge($params, $scope['campus_ids']);
    }

    $instructors = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.last_name, u.email, u.employee_id,
                u.department_id, u.program_id,
                d.department_name, d.department_code,
                p.program_name, p.program_code
         FROM users u
         LEFT JOIN department d ON u.department_id = d.department_id
         LEFT JOIN program    p ON u.program_id    = p.program_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY u.last_name, u.first_name",
        $params
    );
    echo json_encode(['success' => true, 'data' => $instructors]);
}

function handleSubjects() {
    $programId = (int)($_GET['program_id'] ?? 0);
    if ($programId) {
        $subjects = db()->fetchAll(
            "SELECT subject_id, subject_code, subject_name, units FROM subject WHERE status = 'active' AND program_id = ? ORDER BY subject_code",
            [$programId]
        );
    } else {
        $subjects = db()->fetchAll("SELECT subject_id, subject_code, subject_name, units FROM subject WHERE status = 'active' ORDER BY subject_code");
    }
    echo json_encode(['success' => true, 'data' => $subjects]);
}

function handleDepartments() {
    // Dean: return only their own department (which may manage several programs)
    if (Auth::role() === 'dean') {
        $scope = deanScope();
        $depts = $scope['department_id'] ? db()->fetchAll(
            "SELECT department_id, department_name, department_code
             FROM department WHERE department_id = ? AND status = 'active'",
            [$scope['department_id']]
        ) : [];
    } else {
        $depts = db()->fetchAll(
            "SELECT department_id, department_name, department_code FROM department WHERE status = 'active' ORDER BY department_name"
        );
    }
    echo json_encode(['success' => true, 'data' => $depts]);
}

function handlePrograms() {
    if (Auth::role() === 'dean') {
        // Dean: return only their own program
        $scope = deanScope();
        $programs = $scope['program_id'] ? db()->fetchAll(
            "SELECT program_id, program_code, program_name, department_id
             FROM program WHERE program_id = ? AND status = 'active'",
            [$scope['program_id']]
        ) : [];
    } else {
        $deptId = (int)($_GET['department_id'] ?? 0);
        if ($deptId) {
            $programs = db()->fetchAll(
                "SELECT program_id, program_code, program_name, department_id FROM program
                  WHERE status = 'active' AND department_id = ? ORDER BY program_code",
                [$deptId]
            );
        } else {
            $programs = db()->fetchAll(
                "SELECT program_id, program_code, program_name, department_id FROM program WHERE status = 'active' ORDER BY program_code"
            );
        }
    }
    echo json_encode(['success' => true, 'data' => $programs]);
}

/**
 * Returns subjects that have been opened as offerings for a given semester,
 * scoped to the dean's department/programs. Used by Faculty Assignments.
 */
function handleOfferedList() {
    $semId  = (int)($_GET['semester_id'] ?? 0);
    // A subject_offered row can outlive the curriculum it came from (e.g. a
    // program's curriculum gets replaced and the old subjects retired) — only
    // surface offerings whose subject is still part of an active curriculum,
    // so retired subjects never show up as assignable in Faculty Assignments.
    $where  = [
        "so.status NOT IN ('cancelled','archived')",
        "EXISTS (SELECT 1 FROM curriculum c WHERE c.course_id = s.subject_id AND c.status = 'active')",
    ];
    $params = [];

    // Semester filter: match by academic_year + sem_type_id (handles duplicate
    // semester rows). This is what "only current-semester subjects" means —
    // an offering counts if it was opened FOR this school semester period,
    // whether it's an on-term subject or one the dean opened off-term via the
    // "Open Anyway" override on Subject Offered (both get tagged with the
    // active semester_id at the moment they're opened).
    if ($semId) {
        $sem = db()->fetchOne(
            "SELECT academic_year, sem_type_id FROM semester WHERE semester_id = ?", [$semId]
        );
        if ($sem) {
            $where[]  = "sem.academic_year = ?";
            $where[]  = "sem.sem_type_id = ?";
            $params[] = $sem['academic_year'];
            $params[] = $sem['sem_type_id'];
        }
    }

    // Dean scope: restrict to their department's programs
    if (Auth::role() === 'dean') {
        $scope = deanScope();
        if ($scope['department_id']) {
            $where[]  = "EXISTS (SELECT 1 FROM department_program dp WHERE dp.program_id = s.program_id AND dp.department_id = ?)";
            $params[] = $scope['department_id'];
        } elseif ($scope['program_id']) {
            $where[]  = "s.program_id = ?";
            $params[] = $scope['program_id'];
        }
    }

    $whereSQL = 'WHERE ' . implode(' AND ', $where);

    $rows = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester AS subject_semester, s.status,
                p.program_code, p.program_name, p.program_id,
                so.subject_offered_id, so.status AS offering_status, so.grading_type
         FROM subject_offered so
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN program p ON p.program_id = s.program_id
         LEFT JOIN semester sem ON sem.semester_id = so.semester_id
         $whereSQL
         ORDER BY p.program_code, s.year_level, s.semester, s.subject_code",
        $params
    );

    echo json_encode(['success' => true, 'data' => $rows]);
}

function handleSemesters() {
    $semesters = db()->fetchAll(
        "SELECT MIN(sem.semester_id) AS semester_id, sem.semester_name, sem.academic_year,
                st.sem_level,
                MAX(CASE sem.status WHEN 'active' THEN 'active' ELSE 'inactive' END) AS status
         FROM semester sem LEFT JOIN sem_type st ON sem.sem_type_id = st.sem_type_id
         GROUP BY sem.academic_year, sem.sem_type_id, sem.semester_name, st.sem_level
         ORDER BY sem.academic_year DESC, st.sem_level"
    );
    echo json_encode(['success' => true, 'data' => $semesters]);
}

function handleBulkAssign() {
    $data         = json_decode(file_get_contents('php://input'), true);
    $instructorId = (int)($data['instructor_id'] ?? 0);
    $semesterId   = (int)($data['semester_id']   ?? 0);
    $assignIds    = array_map('intval', $data['assign_subject_ids']   ?? []);
    $unassignIds  = array_map('intval', $data['unassign_subject_ids'] ?? []);

    if (!$instructorId) {
        echo json_encode(['success' => false, 'message' => 'instructor_id required']);
        return;
    }
    if (empty($assignIds) && empty($unassignIds)) {
        echo json_encode(['success' => false, 'message' => 'No changes to apply']);
        return;
    }

    // Resolve which semester to use for new offerings
    if (!$semesterId) {
        $latest = db()->fetchOne(
            "SELECT semester_id FROM semester ORDER BY academic_year DESC, semester_id DESC LIMIT 1"
        );
        $semesterId = $latest ? (int)$latest['semester_id'] : 0;
    }
    if (!$semesterId) {
        echo json_encode(['success' => false, 'message' => 'No semester found']);
        return;
    }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $assigned = 0;
        foreach ($assignIds as $subjectId) {
            // 1. Already have their own offering for this subject+semester? Skip.
            $mine = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
                [$subjectId, $semesterId, $instructorId]
            );
            if ($mine) { $assigned++; continue; }

            // 2. Is there an unassigned offering? Claim it.
            $empty = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id IS NULL AND status = 'open' LIMIT 1",
                [$subjectId, $semesterId]
            );
            if ($empty) {
                $pdo->prepare(
                    "UPDATE subject_offered SET user_teacher_id = ?, updated_at = NOW()
                      WHERE subject_offered_id = ?"
                )->execute([$instructorId, $empty['subject_offered_id']]);
            } else {
                // Another instructor owns all offerings — create a new one for this instructor
                $pdo->prepare(
                    "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'open', NOW(), NOW())"
                )->execute([$subjectId, $semesterId, $instructorId]);
            }
            $assigned++;
        }

        $unassigned = 0;
        foreach ($unassignIds as $subjectId) {
            // Only clear if still owned by this instructor (safety)
            $pdo->prepare(
                "UPDATE subject_offered SET user_teacher_id = NULL, updated_at = NOW()
                  WHERE subject_id = ? AND semester_id = ? AND user_teacher_id = ? AND status = 'open'"
            )->execute([$subjectId, $semesterId, $instructorId]);
            $unassigned++;
        }

        $pdo->commit();
        $total = $assigned + $unassigned;
        echo json_encode(['success' => true, 'message' => "Updated $total subject(s)"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        error_log('Bulk assign: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to apply changes']);
    }
}

/**
 * Auto-create subject_offered rows for every curriculum subject that
 * does not yet have an 'open' offering for the given semester.
 *
 * POST /SubjectOfferingsAPI.php?action=generate-offerings
 * Body: { semester_id: int, program_id?: int }
 */
function handleGenerateOfferings() {
    $data       = json_decode(file_get_contents('php://input'), true);
    $semesterId = (int)($data['semester_id'] ?? 0);
    $programId  = (int)($data['program_id']  ?? 0);

    if (!$semesterId) {
        echo json_encode(['success' => false, 'message' => 'semester_id required']);
        return;
    }

    // Fetch all subjects (optionally filtered by program) that have no open
    // offering for the target semester yet.
    // IMPORTANT: $programId params go into WHERE (before NOT EXISTS),
    // $semesterId goes last (for the NOT EXISTS subquery's ? placeholder).
    $conditions = [];
    $params     = [];
    if ($programId) {
        $conditions[] = 's.program_id = ?';
        $params[]     = $programId;
    }
    $params[] = $semesterId; // used by NOT EXISTS subquery
    // Use "WHERE 1=1" so that optional AND conditions are always valid SQL
    $condStr = $conditions ? 'AND ' . implode(' AND ', $conditions) : '';

    $missing = db()->fetchAll(
        "SELECT s.subject_id
         FROM subject s
         WHERE 1=1 $condStr
           AND NOT EXISTS (
               SELECT 1 FROM subject_offered so
               JOIN semester sx ON so.semester_id = sx.semester_id
               JOIN semester sy ON sy.semester_id = ?
               WHERE so.subject_id = s.subject_id
                 AND sx.academic_year  = sy.academic_year
                 AND sx.semester_name = sy.semester_name
                 AND so.status        = 'open'
           )",
        $params
    );

    if (empty($missing)) {
        echo json_encode(['success' => true, 'created' => 0,
                          'message' => 'All subjects already have offerings for this semester']);
        return;
    }

    try {
        $pdo  = pdo();
        $stmt = $pdo->prepare(
            "INSERT INTO subject_offered (subject_id, semester_id, status, created_at, updated_at)
             VALUES (?, ?, 'open', NOW(), NOW())"
        );
        $pdo->beginTransaction();
        foreach ($missing as $row) {
            $stmt->execute([$row['subject_id'], $semesterId]);
        }
        $pdo->commit();
        $created = count($missing);
        echo json_encode(['success' => true, 'created' => $created,
                          'message' => "Created $created offering(s)"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        error_log('generate-offerings: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to generate offerings']);
    }
}
