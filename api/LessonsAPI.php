<?php
/**
 * CIT-LMS Lessons API
 * Fixed to match actual database schema: student_subject, user_student_id, lessons
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ClassworkDueHelper.php';
require_once __DIR__ . '/helpers/BankAccessHelper.php';
require_once __DIR__ . '/helpers/NotificationEmailHelper.php';
require_once __DIR__ . '/helpers/GradingPeriodHelper.php';

$action = $_GET['action'] ?? '';

// Stream file bytes (not JSON) — auth via session, JWT header, or ?token=
if ($action === 'serve-material') {
    require_once __DIR__ . '/../config/jwt.php';
    serveMaterial();
    exit;
}

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

function ensureLessonMaterialsColumns() {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        $cols = db()->fetchAll('SHOW COLUMNS FROM lesson_materials');
        if (!$cols) {
            return;
        }
        $names = array_column($cols, 'Field');
        if (in_array('lesson_id', $names, true) && !in_array('lessons_id', $names, true)) {
            pdo()->exec('ALTER TABLE lesson_materials CHANGE lesson_id lessons_id INT(11) NOT NULL');
        }
    } catch (Exception $e) {
        error_log('lesson_materials schema: ' . $e->getMessage());
    }
}

function materialLessonId(array $material): int {
    return (int)($material['lessons_id'] ?? $material['lesson_id'] ?? 0);
}

function ensureLessonSectionTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec(
            "CREATE TABLE IF NOT EXISTS lesson_section (
                lessons_id INT UNSIGNED NOT NULL,
                section_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (lessons_id, section_id),
                KEY idx_lesson_section (section_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    } catch (Exception $e) {
        error_log('lesson_section table: ' . $e->getMessage());
    }
}

function attachLessonSections($lessonId, array $sectionIds) {
    ensureLessonSectionTable();
    $pdo = pdo();
    $pdo->prepare("DELETE FROM lesson_section WHERE lessons_id = ?")->execute([$lessonId]);
    if (empty($sectionIds)) return;
    $stmt = $pdo->prepare("INSERT INTO lesson_section (lessons_id, section_id) VALUES (?, ?)");
    foreach ($sectionIds as $sid) {
        $sid = (int)$sid;
        if ($sid > 0) {
            $stmt->execute([$lessonId, $sid]);
        }
    }
}

function getLessonSectionIds($lessonId) {
    ensureLessonSectionTable();
    $rows = db()->fetchAll(
        "SELECT section_id FROM lesson_section WHERE lessons_id = ?",
        [$lessonId]
    );
    return array_map(fn($r) => (int)$r['section_id'], $rows);
}

function enrichLessonsWithSections(array &$rows) {
    foreach ($rows as &$row) {
        $ids = getLessonSectionIds((int)$row['lessons_id']);
        $row['section_ids'] = $ids;
        $row['all_sections'] = empty($ids);
        if (!empty($ids)) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $names = db()->fetchAll(
                "SELECT section_id, section_name FROM section WHERE section_id IN ($placeholders)",
                $ids
            );
            $row['section_names'] = implode(', ', array_column($names, 'section_name'));
        } else {
            $row['section_names'] = '';
        }
    }
    unset($row);
}

function lessonVisibleToSectionSql($lessonAlias = 'l', $sectionIdParam = '?') {
    return "(
        NOT EXISTS (SELECT 1 FROM lesson_section ls0 WHERE ls0.lessons_id = {$lessonAlias}.lessons_id)
        OR EXISTS (
            SELECT 1 FROM lesson_section ls1
            WHERE ls1.lessons_id = {$lessonAlias}.lessons_id
            AND ls1.section_id = {$sectionIdParam}
        )
    )";
}

/**
 * Determine if the lesson is unlocked for this student.
 * Only explicit prerequisite_lessons_id gates access (classwork posts are open by default).
 */
function evaluateLessonUnlock($userId, array $lesson, int $sectionId = 0): array {
    $explicitPrereqId = (int)($lesson['prerequisite_lessons_id'] ?? 0);
    if ($explicitPrereqId <= 0) {
        return [true, null];
    }

    $prerequisiteLesson = db()->fetchOne(
        "SELECT lessons_id, lesson_title FROM lessons WHERE lessons_id = ?",
        [$explicitPrereqId]
    );
    $prereqProgress = db()->fetchOne(
        "SELECT 1 FROM student_progress
         WHERE user_student_id = ? AND lessons_id = ? AND status = 'completed'
         LIMIT 1",
        [$userId, $explicitPrereqId]
    );
    return [!empty($prereqProgress), $prerequisiteLesson];
}

// RBAC: enforce permission per action
$_lessonPerms = [
    'get'             => 'lessons.view',
    'list'            => 'lessons.view',
    'new-lessons'     => 'lessons.view',
    'materials'       => 'lessons.view',
    'instructor-lessons' => 'lessons.view',
    'students'        => 'lessons.view',
    'subjects'        => 'lessons.view',
    'complete'        => 'lessons.view',
    'create'          => 'lessons.create',
    'update'          => 'lessons.edit',
    'add-link'        => 'lessons.edit',
    'upload-material' => 'lessons.edit',
    'delete-material' => 'lessons.edit',
    'delete'          => 'lessons.delete',
    'set-status'      => 'lessons.edit',
];
if (isset($_lessonPerms[$action]) && !Auth::can($_lessonPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_lessonPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'get':
        getLesson();
        break;
    case 'list':
        getLessons();
        break;
    case 'new-lessons':
        getNewStudentLessons();
        break;
    case 'complete':
        markComplete();
        break;
    case 'instructor-lessons':
        getInstructorLessons();
        break;
    case 'create':
        createLesson();
        break;
    case 'update':
        updateLesson();
        break;
    case 'delete':
        deleteLesson();
        break;
    case 'students':
        getStudentsForOffering();
        break;
    case 'subjects':
        getInstructorSubjects();
        break;
    case 'materials':
        getMaterials();
        break;
    case 'add-link':
        addLinkMaterial();
        break;
    case 'upload-material':
        uploadMaterial();
        break;
    case 'delete-material':
        deleteMaterial();
        break;
    case 'set-status':
        setLessonStatus();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Get a single lesson with full details (for student lesson view)
 */
function getLesson() {
    $lessonId = (int)($_GET['lessons_id'] ?? 0);
    $userId = Auth::id();

    if (!$lessonId) {
        echo json_encode(['success' => false, 'message' => 'Lesson ID required']);
        return;
    }

    try {
        // Get lesson with subject info and instructor name
        $lesson = db()->fetchOne(
            "SELECT l.*, s.subject_code, s.subject_name, so.subject_offered_id,
                CONCAT(u.first_name, ' ', u.last_name) as instructor_name
             FROM lessons l
             JOIN subject s ON l.subject_id = s.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             LEFT JOIN users u ON l.user_teacher_id = u.users_id
             WHERE l.lessons_id = ? AND l.status = 'published' LIMIT 1",
            [$lessonId]
        );

        if (!$lesson) {
            echo json_encode(['success' => false, 'message' => 'Lesson not found']);
            return;
        }

        // Verify enrollment — check if student is enrolled in any offering of this subject
        $enrollment = db()->fetchOne(
            "SELECT ss.student_subject_id FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
             LIMIT 1",
            [$userId, $lesson['subject_id']]
        );
        if (!$enrollment) {
            echo json_encode(['success' => false, 'message' => 'Not enrolled']);
            return;
        }

        ensureLessonSectionTable();
        $studentSection = db()->fetchOne(
            "SELECT ss.section_id FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
             ORDER BY ss.student_subject_id DESC LIMIT 1",
            [$userId, $lesson['subject_id']]
        );
        $sectionId = (int)($studentSection['section_id'] ?? 0);
        $sectionIds = getLessonSectionIds($lessonId);
        if (!empty($sectionIds) && ($sectionId <= 0 || !in_array($sectionId, $sectionIds, true))) {
            echo json_encode(['success' => false, 'message' => 'Lesson not available for your section']);
            return;
        }

        // Check explicit prerequisite only
        [$prerequisiteMet, $prerequisiteLesson] = evaluateLessonUnlock($userId, $lesson, $sectionId);

        // Get progress
        $progress = db()->fetchOne("SELECT * FROM student_progress WHERE user_student_id = ? AND lessons_id = ?", [$userId, $lessonId]);
        $isCompleted = $progress && $progress['status'] == 'completed';

        // Get all lessons for sidebar + prev/next nav (respect section targeting)
        ensureLessonSectionTable();
        $allLessonsSql = "SELECT lessons_id, lesson_title as title, lesson_order as order_number,
                (SELECT CASE WHEN status = 'completed' THEN 1 ELSE 0 END FROM student_progress WHERE lessons_id = l.lessons_id AND user_student_id = ?) as is_completed
             FROM lessons l WHERE subject_id = ? AND status = 'published'";
        $allParams = [$userId, $lesson['subject_id']];
        if ($sectionId > 0) {
            $allLessonsSql .= ' AND ' . lessonVisibleToSectionSql('l', '?');
            $allParams[] = $sectionId;
        }
        $allLessonsSql .= ' ORDER BY lesson_order';
        $allLessons = db()->fetchAll($allLessonsSql, $allParams);

        $currentIndex = null;
        foreach ($allLessons as $i => $item) {
            if ($item['lessons_id'] == $lessonId) { $currentIndex = $i; break; }
        }
        $prevLesson = ($currentIndex !== null && $currentIndex > 0) ? $allLessons[$currentIndex - 1] : null;
        $nextLesson = ($currentIndex !== null && $currentIndex < count($allLessons) - 1) ? $allLessons[$currentIndex + 1] : null;

        // Get materials
        ensureLessonMaterialsColumns();
        $materials = db()->fetchAll(
            "SELECT material_id, lessons_id, file_name, original_name, file_path, file_type,
                    file_size, material_type, uploaded_at
             FROM lesson_materials WHERE lessons_id = ? ORDER BY uploaded_at",
            [$lessonId]
        ) ?: [];

        echo json_encode([
            'success' => true,
            'data' => [
                'lesson' => $lesson,
                'is_completed' => $isCompleted,
                'completed_at' => $progress['completed_at'] ?? null,
                'prerequisite_met' => $prerequisiteMet,
                'prerequisite_lesson' => $prerequisiteLesson,
                'all_lessons' => $allLessons,
                'prev_lesson' => $prevLesson,
                'next_lesson' => $nextLesson,
                'materials' => $materials
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get lessons for a subject
 */
function getLessons() {
    $subjectOfferedId = $_GET['subject_id'] ?? 0;
    $userId = Auth::id();

    try {
        ensureLessonSectionTable();
        ensureLessonDueDateColumn();
        $studentSection = db()->fetchOne(
            "SELECT section_id FROM student_subject
             WHERE user_student_id = ? AND subject_offered_id = ? AND status = 'enrolled'
             ORDER BY student_subject_id DESC LIMIT 1",
            [$userId, $subjectOfferedId]
        );
        $sectionId = (int)($studentSection['section_id'] ?? 0);

        $sql = "SELECT
                l.lessons_id,
                l.lesson_title as title,
                l.lesson_description as description,
                l.lesson_order as order_number,
                l.subject_id,
                l.prerequisite_lessons_id,
                l.due_date,
                l.created_at,
                CASE WHEN sp.status = 'completed' THEN 1 ELSE 0 END as is_completed,
                sp.completed_at,
                (SELECT ql.quiz_id FROM quiz_lessons ql WHERE ql.lessons_id = l.lessons_id LIMIT 1) as linked_quiz_id
            FROM lessons l
            LEFT JOIN student_progress sp
                ON l.lessons_id = sp.lessons_id AND sp.user_student_id = ?
            WHERE l.subject_id = (SELECT subject_id FROM subject_offered WHERE subject_offered_id = ?)
            AND l.status = 'published'";
        $params = [$userId, $subjectOfferedId];
        if ($sectionId > 0) {
            $sql .= ' AND ' . lessonVisibleToSectionSql('l', '?');
            $params[] = $sectionId;
        }
        $sql .= ' ORDER BY l.lesson_order';
        $lessons = db()->fetchAll($sql, $params);

        foreach ($lessons as &$row) {
            [$prerequisiteMet] = evaluateLessonUnlock($userId, $row, $sectionId);
            $row['is_locked'] = $prerequisiteMet ? 0 : 1;
        }
        unset($row);

        echo json_encode(['success' => true, 'data' => $lessons]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Mark lesson as complete
 */
function markComplete() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $lessonId = $input['lessons_id'] ?? 0;
    $userId = Auth::id();
    
    try {
        // 1. FIXED: Verify student is enrolled using 'student_subject'
        $enrollment = db()->fetchOne(
            "SELECT ss.* FROM student_subject ss
             JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
             JOIN lessons l ON so.subject_id = l.subject_id
             WHERE l.lessons_id = ? AND ss.user_student_id = ? AND ss.status = 'enrolled'",
            [$lessonId, $userId]
        );
        
        if (!$enrollment) {
            echo json_encode(['success' => false, 'message' => 'Lesson not found or not enrolled']);
            return;
        }
        
        // 2. FIXED: Check 'student_progress' using 'user_student_id'
        $existing = db()->fetchOne(
            "SELECT * FROM student_progress WHERE user_student_id = ? AND lessons_id = ?",
            [$userId, $lessonId]
        );
        
        if ($existing && $existing['status'] == 'completed') {
            echo json_encode(['success' => true, 'message' => 'Already completed']);
            return;
        }
        
        // Get lesson + subject for unlock checks
        $lesson = db()->fetchOne(
            "SELECT lessons_id, subject_id, lesson_order, prerequisite_lessons_id
             FROM lessons WHERE lessons_id = ?",
            [$lessonId]
        );
        if (!$lesson) {
            echo json_encode(['success' => false, 'message' => 'Lesson not found']);
            return;
        }

        // Prevent forced completion of locked lessons
        ensureLessonSectionTable();
        $sectionId = (int)($enrollment['section_id'] ?? 0);
        [$prerequisiteMet, $prerequisiteLesson] = evaluateLessonUnlock($userId, $lesson, $sectionId);
        if (!$prerequisiteMet) {
            $label = $prerequisiteLesson['lesson_title'] ?? 'the previous lesson';
            echo json_encode([
                'success' => false,
                'message' => 'Lesson is locked. Complete "' . $label . '" first.'
            ]);
            return;
        }

        if ($existing) {
            db()->execute(
                "UPDATE student_progress SET status = 'completed', completed_at = NOW()
                 WHERE user_student_id = ? AND lessons_id = ?",
                [$userId, $lessonId]
            );
        } else {
            db()->execute(
                "INSERT INTO student_progress (user_student_id, lessons_id, subject_id, status, completed_at, started_at)
                 VALUES (?, ?, ?, 'completed', NOW(), NOW())",
                [$userId, $lessonId, $lesson['subject_id']]
            );
        }

        echo json_encode(['success' => true, 'message' => 'Lesson marked as complete']);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
}

/**
 * Lessons newly posted for the current student (since timestamp).
 */
function getNewStudentLessons() {
    $userId = Auth::id();
    $sinceRaw = trim($_GET['since'] ?? '');
    $since = $sinceRaw !== '' ? date('Y-m-d H:i:s', strtotime($sinceRaw)) : date('Y-m-d H:i:s', strtotime('-7 days'));

    try {
        ensureLessonSectionTable();
        $rows = db()->fetchAll(
            "SELECT l.lessons_id, l.lesson_title, l.created_at, l.updated_at, l.subject_id,
                    s.subject_code, s.subject_name,
                    GREATEST(COALESCE(l.updated_at, l.created_at), COALESCE(l.created_at, l.updated_at)) AS notify_at
             FROM lessons l
             JOIN subject s ON s.subject_id = l.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
               AND l.status = 'published'
               AND (
                    NOT EXISTS (SELECT 1 FROM lesson_section ls0 WHERE ls0.lessons_id = l.lessons_id)
                    OR EXISTS (
                        SELECT 1 FROM lesson_section ls1
                        WHERE ls1.lessons_id = l.lessons_id AND ls1.section_id = ss.section_id
                    )
               )
               AND GREATEST(COALESCE(l.updated_at, l.created_at), COALESCE(l.created_at, l.updated_at)) > ?
             GROUP BY l.lessons_id
             ORDER BY notify_at DESC
             LIMIT 25",
            [$userId, $since]
        );
        echo json_encode(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

// ─── Instructor Endpoints ─────────────────────────────────

function getInstructorSubjects() {
    $userId = Auth::id();
    $subjects = db()->fetchAll(
        // Only return subjects actually assigned to at least one active section.
        // Subjects the dean assigned but not yet added to any section are excluded
        // (same rule as the My Classes dashboard HAVING COUNT(DISTINCT sec.section_id) > 0).
        "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name
         FROM subject_offered so
         JOIN subject s          ON s.subject_id          = so.subject_id
         JOIN section_subject ss ON ss.subject_offered_id = so.subject_offered_id
                                AND ss.status = 'active'
         WHERE so.user_teacher_id = ? AND so.status = 'open'
         ORDER BY s.subject_code",
        [$userId]
    );
    echo json_encode(['success' => true, 'data' => $subjects]);
}

function getInstructorLessons() {
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? '';

    $where = '';
    $params = [$userId];
    if ($subjectId) {
        $where = 'AND l.subject_id = ?';
        $params[] = $subjectId;
    }

    $lessons = db()->fetchAll(
        "SELECT l.*, s.subject_code, s.subject_name,
            (SELECT COUNT(*) FROM student_progress sp WHERE sp.lessons_id = l.lessons_id AND sp.status = 'completed') as completions
         FROM lessons l
         JOIN subject s ON l.subject_id = s.subject_id
         WHERE s.subject_id IN (
             SELECT DISTINCT so.subject_id FROM subject_offered so
             WHERE so.user_teacher_id = ? AND so.status = 'open'
         ) $where
         ORDER BY s.subject_code, l.lesson_order",
        $params
    );
    enrichLessonsWithSections($lessons);
    echo json_encode(['success' => true, 'data' => $lessons]);
}

function createLesson() {
    $data = json_decode(file_get_contents('php://input'), true);
    $subjectId = (int)($data['subject_id'] ?? 0);
    $title = trim($data['lesson_title'] ?? '');
    $description = trim($data['lesson_description'] ?? '');
    $content = $data['lesson_content'] ?? '';
    $status = $data['status'] ?? 'draft';
    $hasSectionTargeting = array_key_exists('all_sections', $data) || array_key_exists('section_ids', $data);
    $allSections = $hasSectionTargeting ? !empty($data['all_sections']) : true;
    $sectionIds = $hasSectionTargeting
        ? array_values(array_filter(array_map('intval', $data['section_ids'] ?? [])))
        : [];

    if (!$subjectId || !$title) {
        echo json_encode(['success' => false, 'message' => 'Subject and title are required']);
        return;
    }
    if ($hasSectionTargeting && !$allSections && empty($sectionIds)) {
        echo json_encode(['success' => false, 'message' => 'Select at least one section or choose All sections']);
        return;
    }

    // Get next order
    $maxOrder = db()->fetchOne("SELECT MAX(lesson_order) as m FROM lessons WHERE subject_id = ?", [$subjectId])['m'] ?? 0;

    $teacherId = Auth::id();
    ensureLessonDueDateColumn();
    ensureGradingPeriodColumns();
    $dueDate = normalizeDueDate($data['due_date'] ?? null);
    $gradingPeriod = normalizeGradingPeriod($data['grading_period'] ?? 'P1');

    try {
        pdo()->prepare(
            "INSERT INTO lessons (subject_id, user_teacher_id, lesson_title, lesson_description, lesson_content, lesson_order, status, grading_period, due_date, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
        )->execute([$subjectId, $teacherId, $title, $description, $content, $maxOrder + 1, $status, $gradingPeriod, $dueDate]);
        $lessonId = (int)pdo()->lastInsertId();
        if (!$allSections && !empty($sectionIds)) {
            attachLessonSections($lessonId, $sectionIds);
        }
        if ($status === 'published') {
            NotificationEmailHelper::queueNewLesson($lessonId);
            NotificationEmailHelper::dispatchAfterPublish();
        }
        echo json_encode(['success' => true, 'message' => 'Lesson created', 'data' => ['id' => $lessonId, 'lessons_id' => $lessonId]]);
    } catch (Exception $e) {
        error_log('Create lesson: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create lesson']);
    }
}

function updateLesson() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['lessons_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Lesson ID required']); return; }

    $title = trim($data['lesson_title'] ?? '');
    $description = trim($data['lesson_description'] ?? '');
    $content = $data['lesson_content'] ?? '';
    $status = $data['status'] ?? 'draft';
    $allSections = array_key_exists('all_sections', $data) ? !empty($data['all_sections']) : null;
    $sectionIds = array_key_exists('section_ids', $data)
        ? array_values(array_filter(array_map('intval', $data['section_ids'] ?? [])))
        : null;

    try {
        if (!verifyLessonOwner($id)) {
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            return;
        }
        $prev = db()->fetchOne("SELECT status FROM lessons WHERE lessons_id = ?", [$id]);
        ensureLessonDueDateColumn();
        ensureGradingPeriodColumns();
        $dueDate = array_key_exists('due_date', $data)
            ? normalizeDueDate($data['due_date'])
            : null;
        $gradingPeriod = array_key_exists('grading_period', $data)
            ? normalizeGradingPeriod($data['grading_period'])
            : null;
        $sql = 'UPDATE lessons SET lesson_title=?, lesson_description=?, lesson_content=?, status=?, updated_at=NOW()';
        $params = [$title, $description, $content, $status];
        if ($gradingPeriod !== null) {
            $sql .= ', grading_period=?';
            $params[] = $gradingPeriod;
        }
        if (array_key_exists('due_date', $data)) {
            $sql .= ', due_date=?';
            $params[] = $dueDate;
        }
        $sql .= ' WHERE lessons_id=?';
        $params[] = $id;
        pdo()->prepare($sql)->execute($params);
        if ($allSections !== null) {
            if ($allSections) {
                attachLessonSections($id, []);
            } elseif (!empty($sectionIds)) {
                attachLessonSections($id, $sectionIds);
            } else {
                echo json_encode(['success' => false, 'message' => 'Select at least one section or choose All sections']);
                return;
            }
        }
        if ($status === 'published' && ($prev['status'] ?? '') !== 'published') {
            NotificationEmailHelper::queueNewLesson($id);
            NotificationEmailHelper::dispatchAfterPublish();
        }
        echo json_encode(['success' => true, 'message' => 'Lesson updated']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to update lesson']);
    }
}

function deleteLesson() {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['lessons_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Lesson ID required']); return; }

    try {
        ensureLessonSectionTable();
        pdo()->prepare("DELETE FROM lesson_section WHERE lessons_id = ?")->execute([$id]);
        pdo()->prepare("DELETE FROM student_progress WHERE lessons_id = ?")->execute([$id]);
        pdo()->prepare("DELETE FROM lessons WHERE lessons_id = ?")->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Lesson deleted']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to delete lesson']);
    }
}

function getStudentsForOffering() {
    $offeringId = (int)($_GET['subject_offered_id'] ?? 0);
    if (!$offeringId) { echo json_encode(['success' => true, 'data' => []]); return; }

    // Resolve offering → subject_id + teacher_id so we find students enrolled
    // under ANY offering row for this subject (avoids mismatch when dedup
    // returns a different offering_id than what the student was enrolled through)
    $offering = db()->fetchOne(
        "SELECT subject_id, user_teacher_id FROM subject_offered WHERE subject_offered_id = ?",
        [$offeringId]
    );
    if (!$offering) { echo json_encode(['success' => true, 'data' => []]); return; }

    $subjectId   = (int)$offering['subject_id'];
    $teacherId   = (int)$offering['user_teacher_id'];

    $students = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.last_name, u.email, u.student_id,
            ss.enrollment_date, ss.status as enrollment_status,
            (SELECT COUNT(*) FROM student_progress sp
             JOIN lessons l ON sp.lessons_id = l.lessons_id
             WHERE sp.user_student_id = u.users_id AND l.subject_id = ? AND sp.status = 'completed') as completed_lessons,
            (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = ? AND l.status = 'published') as total_lessons,
            (SELECT ROUND(AVG(qa.percentage),1) FROM student_quiz_attempts qa
             JOIN quiz q ON qa.quiz_id = q.quiz_id
             WHERE qa.user_student_id = u.users_id AND q.subject_id = ? AND qa.status = 'completed') as avg_score
         FROM student_subject ss
         JOIN users u ON ss.user_student_id = u.users_id
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         WHERE so.subject_id = ?
           AND so.user_teacher_id = ?
           AND ss.status = 'enrolled'
         GROUP BY u.users_id, u.first_name, u.last_name, u.email, u.student_id,
                  ss.enrollment_date, ss.status
         ORDER BY u.last_name, u.first_name",
        [$subjectId, $subjectId, $subjectId, $subjectId, $teacherId]
    );

    foreach ($students as &$s) {
        $s['progress'] = $s['total_lessons'] > 0 ? round(($s['completed_lessons'] / $s['total_lessons']) * 100) : 0;
    }

    echo json_encode(['success' => true, 'data' => $students]);
}

// ─── Material Management Endpoints ──────────────────────────

/**
 * Verify instructor owns a lesson
 */
function verifyLessonOwner($lessonId) {
    $lesson = db()->fetchOne(
        "SELECT lessons_id, subject_id FROM lessons WHERE lessons_id = ? AND user_teacher_id = ?",
        [$lessonId, Auth::id()]
    );
    return $lesson;
}

/**
 * Get materials for a lesson
 */
function getMaterials() {
    $lessonId = (int)($_GET['lessons_id'] ?? 0);
    if (!$lessonId) {
        echo json_encode(['success' => false, 'message' => 'Lesson ID required']);
        return;
    }

    ensureLessonMaterialsColumns();
    if (!verifyMaterialAccess($lessonId, (int)Auth::id())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $materials = db()->fetchAll(
        "SELECT material_id, lessons_id, file_name, original_name, file_path, file_type,
                file_size, material_type, uploaded_at
         FROM lesson_materials WHERE lessons_id = ? ORDER BY uploaded_at DESC",
        [$lessonId]
    );
    echo json_encode(['success' => true, 'data' => $materials ?: []]);
}

/**
 * Add a link material (YouTube, Vimeo, external URL)
 */
function addLinkMaterial() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $lessonId = (int)($data['lessons_id'] ?? 0);
    $url = trim($data['url'] ?? '');
    $title = trim($data['title'] ?? '');

    if (!$lessonId || !$url) {
        echo json_encode(['success' => false, 'message' => 'Lesson ID and URL are required']);
        return;
    }

    if (!verifyLessonOwner($lessonId)) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }

    // Auto-detect title from URL if not provided
    if (!$title) {
        if (preg_match('/youtube\.com|youtu\.be/i', $url)) {
            $title = 'YouTube Video';
        } elseif (preg_match('/vimeo\.com/i', $url)) {
            $title = 'Vimeo Video';
        } else {
            $title = 'External Link';
        }
    }

    // Determine link subtype for display
    $fileType = 'link';
    if (preg_match('/youtube\.com|youtu\.be/i', $url)) {
        $fileType = 'youtube';
    } elseif (preg_match('/vimeo\.com/i', $url)) {
        $fileType = 'vimeo';
    }

    try {
        pdo()->prepare(
            "INSERT INTO lesson_materials (lessons_id, file_name, original_name, file_path, file_type, file_size, material_type, uploaded_at)
             VALUES (?, ?, ?, ?, ?, 0, 'link', NOW())"
        )->execute([$lessonId, $fileType, $title, $url, $fileType]);

        echo json_encode(['success' => true, 'message' => 'Link added', 'data' => ['material_id' => pdo()->lastInsertId()]]);
    } catch (Exception $e) {
        error_log('Add link material: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add link']);
    }
}

/**
 * Upload a file material (PDF, image, document)
 */
function uploadMaterial() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    // For file uploads, Content-Type is multipart/form-data, not JSON
    $lessonId = (int)($_POST['lessons_id'] ?? 0);
    if (!$lessonId) {
        echo json_encode(['success' => false, 'message' => 'Lesson ID required']);
        return;
    }

    if (!verifyLessonOwner($lessonId)) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        return;
    }

    $file = $_FILES['file'];
    $maxFileSize = 25 * 1024 * 1024; // 25MB

    $allowedTypes = [
        'application/pdf' => 'document',
        'image/jpeg' => 'image',
        'image/png' => 'image',
        'image/gif' => 'image',
        'image/webp' => 'image',
        'image/bmp' => 'image',
        'image/svg+xml' => 'image',
        'application/msword' => 'document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'document',
        'application/vnd.ms-powerpoint' => 'document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'document',
        'application/vnd.ms-excel' => 'document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'document',
        'text/plain' => 'document',
        'text/csv' => 'document',
        'application/csv' => 'document',
        'application/rtf' => 'document',
        'text/rtf' => 'document',
        'application/zip' => 'other',
        'application/x-rar-compressed' => 'other',
        'application/vnd.rar' => 'other',
        'audio/mpeg' => 'audio',
        'audio/mp3' => 'audio',
        'audio/wav' => 'audio',
        'audio/ogg' => 'audio',
        'audio/mp4' => 'audio',
        'audio/aac' => 'audio',
        'audio/flac' => 'audio',
        'audio/x-wav' => 'audio',
        'audio/x-m4a' => 'audio',
        'video/mp4' => 'video',
        'video/webm' => 'video',
        'video/quicktime' => 'video',
    ];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'Upload failed (error code: ' . $file['error'] . ')']);
        return;
    }

    if ($file['size'] > $maxFileSize) {
        echo json_encode(['success' => false, 'message' => 'File too large. Maximum size is 25MB.']);
        return;
    }

    $mimeType = mime_content_type($file['tmp_name']);
    if (!isset($allowedTypes[$mimeType])) {
        echo json_encode(['success' => false, 'message' => 'File type not allowed: ' . $mimeType]);
        return;
    }

    $materialType = $allowedTypes[$mimeType];
    ensureLessonMaterialsColumns();
    $uploadDir = __DIR__ . '/../uploads/materials/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $fileName = 'material_' . $lessonId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $filePath = $uploadDir . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        echo json_encode(['success' => false, 'message' => 'Failed to save file']);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO lesson_materials (lessons_id, file_name, original_name, file_path, file_type, file_size, material_type, uploaded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())"
        )->execute([$lessonId, $fileName, $file['name'], 'uploads/materials/' . $fileName, $materialType, $file['size'], $materialType]);

        echo json_encode(['success' => true, 'message' => 'File uploaded', 'data' => [
            'material_id' => pdo()->lastInsertId(),
            'original_name' => $file['name'],
            'material_type' => $materialType,
            'file_size' => $file['size']
        ]]);
    } catch (Exception $e) {
        // Clean up file if DB insert fails
        if (file_exists($filePath)) unlink($filePath);
        error_log('Upload material: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save material record']);
    }
}

/**
 * Delete a material (file + DB record)
 */
function deleteMaterial() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $materialId = (int)($data['material_id'] ?? 0);
    if (!$materialId) {
        echo json_encode(['success' => false, 'message' => 'Material ID required']);
        return;
    }

    // Get the material and verify ownership
    $material = db()->fetchOne("SELECT * FROM lesson_materials WHERE material_id = ?", [$materialId]);
    if (!$material) {
        echo json_encode(['success' => false, 'message' => 'Material not found']);
        return;
    }

    if (!verifyLessonOwner(materialLessonId($material))) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }

    // Delete physical file if it's not a link
    if ($material['material_type'] !== 'link' && !empty($material['file_path'])) {
        $filePath = __DIR__ . '/../' . $material['file_path'];
        if (file_exists($filePath)) {
            unlink($filePath);
        }
    }

    try {
        pdo()->prepare("DELETE FROM lesson_materials WHERE material_id = ?")->execute([$materialId]);
        echo json_encode(['success' => true, 'message' => 'Material deleted']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to delete material']);
    }
}

/**
 * Quick publish / draft toggle for classwork menu
 */
function setLessonStatus() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }
    $d = json_decode(file_get_contents('php://input'), true);
    $id = (int)($d['lessons_id'] ?? 0);
    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Lesson ID required']);
        return;
    }
    if (!verifyLessonOwner($id)) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    $status = (($d['status'] ?? '') === 'published') ? 'published' : 'draft';
    try {
        pdo()->prepare("UPDATE lessons SET status = ?, updated_at = NOW() WHERE lessons_id = ?")
            ->execute([$status, $id]);
        if ($status === 'published') {
            NotificationEmailHelper::queueNewLesson($id);
            NotificationEmailHelper::dispatchAfterPublish();
        }
        echo json_encode([
            'success' => true,
            'message' => $status === 'published' ? 'Lesson published' : 'Lesson saved as draft',
            'data' => ['status' => $status],
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to update status']);
    }
}

/**
 * Resolve user ID for file streaming (session cookie, JWT header, or ?token=)
 */
function resolveMaterialUserId() {
    if (Auth::check()) {
        return (int)Auth::id();
    }
    $token = $_GET['token'] ?? null;
    if ($token) {
        $payload = JWT::validate($token);
        if ($payload && !empty($payload['sub'])) {
            return (int)$payload['sub'];
        }
    }
    $jwtUser = JWT::authenticate();
    return $jwtUser ? (int)$jwtUser['sub'] : 0;
}

/**
 * Verify student/instructor may access lesson materials
 */
function verifyMaterialAccess($lessonId, $userId) {
    $lesson = db()->fetchOne("SELECT * FROM lessons WHERE lessons_id = ?", [$lessonId]);
    if (!$lesson) {
        return false;
    }

    $user = db()->fetchOne("SELECT role FROM users WHERE users_id = ?", [$userId]);
    $role = $user['role'] ?? '';

    if (in_array($role, ['admin', 'dean'], true)) {
        return true;
    }
    if ($role === 'instructor') {
        if (verifyLessonOwner($lessonId)) {
            return true;
        }
        return instructorTeachesSubject($userId, (int)($lesson['subject_id'] ?? 0));
    }

    if ($lesson['status'] !== 'published') {
        return false;
    }

    $enrollment = db()->fetchOne(
        "SELECT ss.student_subject_id FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
         LIMIT 1",
        [$userId, $lesson['subject_id']]
    );
    if (!$enrollment) {
        return false;
    }

    ensureLessonSectionTable();
    $studentSection = db()->fetchOne(
        "SELECT ss.section_id FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
         ORDER BY ss.student_subject_id DESC LIMIT 1",
        [$userId, $lesson['subject_id']]
    );
    $sectionId = (int)($studentSection['section_id'] ?? 0);
    $sectionIds = getLessonSectionIds($lessonId);
    if (!empty($sectionIds) && ($sectionId <= 0 || !in_array($sectionId, $sectionIds, true))) {
        return false;
    }

    return true;
}

/**
 * Best-guess MIME type for lesson material streaming.
 */
function guessMaterialMime(string $filePath, string $originalName = ''): string {
    $mime = @mime_content_type($filePath) ?: '';
    if ($mime && $mime !== 'application/octet-stream' && $mime !== 'application/zip') {
        return $mime;
    }

    $ext = strtolower(pathinfo($originalName ?: $filePath, PATHINFO_EXTENSION));
    $map = [
        'pdf'  => 'application/pdf',
        'doc'  => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls'  => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt'  => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt'  => 'text/plain',
        'csv'  => 'text/csv',
        'rtf'  => 'application/rtf',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png'  => 'image/png',
        'gif'  => 'image/gif',
        'webp' => 'image/webp',
        'mp3'  => 'audio/mpeg',
        'wav'  => 'audio/wav',
        'ogg'  => 'audio/ogg',
        'm4a'  => 'audio/mp4',
        'aac'  => 'audio/aac',
        'flac' => 'audio/flac',
        'mp4'  => 'video/mp4',
        'webm' => 'video/webm',
        'mov'  => 'video/quicktime',
        'mkv'  => 'video/x-matroska',
    ];

    return $map[$ext] ?? ($mime ?: 'application/octet-stream');
}

/**
 * Resolve on-disk path for an uploaded lesson material.
 */
function resolveMaterialFilePath(array $material): ?string {
    $uploadsRoot = realpath(__DIR__ . '/../uploads');
    if (!$uploadsRoot) {
        return null;
    }

    $candidates = [];
    $relative = str_replace('\\', '/', (string)($material['file_path'] ?? ''));
    if ($relative !== '' && strpos($relative, '..') === false) {
        $candidates[] = realpath(__DIR__ . '/../' . ltrim($relative, '/'));
    }
    if (!empty($material['file_name'])) {
        $candidates[] = realpath($uploadsRoot . '/materials/' . basename((string)$material['file_name']));
    }

    foreach ($candidates as $path) {
        if ($path && strpos($path, $uploadsRoot) === 0 && is_file($path)) {
            return $path;
        }
    }
    return null;
}

/**
 * Stream a lesson material file (inline or download)
 */
function serveMaterial() {
    ensureLessonMaterialsColumns();
    $materialId = (int)($_GET['material_id'] ?? $_GET['id'] ?? 0);
    if (!$materialId) {
        http_response_code(400);
        header('Content-Type: text/plain');
        echo 'Material ID required';
        return;
    }

    $userId = resolveMaterialUserId();
    if (!$userId) {
        http_response_code(401);
        header('Content-Type: text/plain');
        echo 'Unauthorized';
        return;
    }

    $material = db()->fetchOne("SELECT * FROM lesson_materials WHERE material_id = ?", [$materialId]);
    if (!$material) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'Material not found';
        return;
    }

    $lessonId = materialLessonId($material);
    if ($lessonId <= 0 || !verifyMaterialAccess($lessonId, $userId)) {
        http_response_code(403);
        header('Content-Type: text/plain');
        echo 'Access denied';
        return;
    }

    if ($material['material_type'] === 'link') {
        header('Location: ' . $material['file_path']);
        exit;
    }

    $filePath = resolveMaterialFilePath($material);
    if (!$filePath) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'File not found';
        return;
    }

    $download = isset($_GET['download']) && $_GET['download'] !== '0';
    $filename = $material['original_name'] ?: $material['file_name'] ?: basename($filePath);
    $mime = guessMaterialMime($filePath, $filename);
    $safeName = preg_replace('/[^\w.\-() ]+/u', '_', $filename);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($filePath));
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . $safeName . '"');
    header('Cache-Control: private, max-age=3600');
    readfile($filePath);
}