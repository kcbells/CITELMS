<?php
/**
 * Gradebook API — lesson completion matrix for class records
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/GradingPeriodHelper.php';
require_once __DIR__ . '/helpers/QuizSectionHelper.php';

ensureGradingPeriodColumns();
ensureCurrentPeriodColumn();

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

if ($action === 'lesson-progress' && !Auth::can('grades.view')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permission denied: grades.view']);
    exit;
}

switch ($action) {
    case 'lesson-progress':
        handleLessonProgress();
        break;
    case 'set-current-period':
        handleSetCurrentPeriod();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Resolve the subject_offered for a subject+section, preferring the active link.
 */
function resolveOfferedId(int $subjectId, int $sectionId): int
{
    $row = db()->fetchOne(
        "SELECT ss.subject_offered_id FROM section_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.section_id = ? AND so.subject_id = ? AND ss.status = 'active'
         ORDER BY ss.section_subject_id DESC LIMIT 1",
        [$sectionId, $subjectId]
    );
    if ($row) {
        return (int)$row['subject_offered_id'];
    }
    $fallback = db()->fetchOne(
        "SELECT subject_offered_id FROM subject_offered
         WHERE subject_id = ? AND status = 'open'
         ORDER BY subject_offered_id DESC LIMIT 1",
        [$subjectId]
    );
    return $fallback ? (int)$fallback['subject_offered_id'] : 0;
}

/**
 * Instructor advances the released grading period (current term) for a class.
 */
function handleSetCurrentPeriod(): void
{
    try {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId = (int)($body['subject_id'] ?? 0);
    $sectionId = (int)($body['section_id'] ?? 0);
    $period = normalizeGradingPeriod($body['period'] ?? 'P1');

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }

    $userId = Auth::id();
    $offeredId = $sectionId ? resolveOfferedId($subjectId, $sectionId) : 0;
    if (!$offeredId) {
        $row = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
             WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open'
             ORDER BY subject_offered_id DESC LIMIT 1",
            [$subjectId, $userId]
        );
        $offeredId = $row ? (int)$row['subject_offered_id'] : 0;
    }

    if (!$offeredId) {
        echo json_encode(['success' => false, 'message' => 'No offering found for this subject']);
        return;
    }

    // Permission: instructor must own the offering; otherwise require grades.edit
    if (Auth::role() === 'instructor') {
        $owns = db()->fetchOne(
            "SELECT 1 FROM subject_offered WHERE subject_offered_id = ? AND user_teacher_id = ? LIMIT 1",
            [$offeredId, $userId]
        );
        if (!$owns) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'You do not teach this subject']);
            return;
        }
    } elseif (!Auth::can('grades.edit')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Permission denied: grades.edit']);
        return;
    }

    db()->execute(
        "UPDATE subject_offered SET current_period = ? WHERE subject_offered_id = ?",
        [$period, $offeredId]
    );

    echo json_encode(['success' => true, 'data' => ['current_period' => $period]]);
    } catch (Throwable $e) {
        error_log('GradebookAPI set-current-period: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not update the current term. Please try again.']);
    }
}

function handleLessonProgress(): void
{
    try {
        $subjectId = (int)($_GET['subject_id'] ?? 0);
    $sectionId = (int)($_GET['section_id'] ?? 0);
    if (!$subjectId || !$sectionId) {
        echo json_encode(['success' => false, 'message' => 'subject_id and section_id required']);
        return;
    }

    $userId = Auth::id();
    if (Auth::role() === 'instructor') {
        $teaches = db()->fetchOne(
            "SELECT 1 FROM subject_offered
             WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
            [$subjectId, $userId]
        );
        if (!$teaches) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'You do not teach this subject']);
            return;
        }
    } elseif (!Auth::can('grades.view')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Permission denied']);
        return;
    }

    $lessons = db()->fetchAll(
        "SELECT l.lessons_id, l.lesson_title, l.grading_period, l.due_date, l.status, l.lesson_order
         FROM lessons l
         WHERE l.subject_id = ? AND l.status = 'published'
         ORDER BY l.lesson_order, l.lessons_id",
        [$subjectId]
    );
    enrichLessonRowsWithSections($lessons);

    $offeredRow = db()->fetchOne(
        "SELECT ss.subject_offered_id FROM section_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.section_id = ? AND so.subject_id = ? AND ss.status = 'active'
         ORDER BY ss.section_subject_id DESC LIMIT 1",
        [$sectionId, $subjectId]
    );
    $offeredId = $offeredRow ? (int)$offeredRow['subject_offered_id'] : 0;

    $students = db()->fetchAll(
        "SELECT DISTINCT u.users_id AS user_student_id
         FROM student_subject ss
         JOIN users u ON u.users_id = ss.user_student_id
         WHERE ss.section_id = ? AND ss.status = 'enrolled'
           AND (? = 0 OR ss.subject_offered_id = ?)",
        [$sectionId, $offeredId, $offeredId]
    );
    $studentIds = array_map(fn($r) => (int)$r['user_student_id'], $students);

    $progress = [];
    if ($studentIds && $lessons) {
        $lessonIds = array_map(fn($l) => (int)$l['lessons_id'], $lessons);
        $phStudents = implode(',', array_fill(0, count($studentIds), '?'));
        $phLessons = implode(',', array_fill(0, count($lessonIds), '?'));
        $rows = db()->fetchAll(
            "SELECT sp.user_student_id, sp.lessons_id, sp.status
             FROM student_progress sp
             WHERE sp.user_student_id IN ($phStudents) AND sp.lessons_id IN ($phLessons)",
            array_merge($studentIds, $lessonIds)
        );
        foreach ($rows as $row) {
            $uid = (int)$row['user_student_id'];
            $lid = (int)$row['lessons_id'];
            if (!isset($progress[$uid])) {
                $progress[$uid] = [];
            }
            $progress[$uid][$lid] = $row['status'];
        }
    }

    foreach ($lessons as &$lesson) {
        $lesson['grading_period'] = normalizeGradingPeriod($lesson['grading_period'] ?? 'P1');
    }
    unset($lesson);

    $currentPeriod = 'P1';
    if ($offeredId) {
        $cp = db()->fetchOne(
            "SELECT current_period FROM subject_offered WHERE subject_offered_id = ?",
            [$offeredId]
        );
        $currentPeriod = normalizeGradingPeriod($cp['current_period'] ?? 'P1');
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'lessons' => $lessons,
            'progress' => $progress,
            'current_period' => $currentPeriod,
            'subject_offered_id' => $offeredId,
        ],
    ]);
    } catch (Throwable $e) {
        error_log('GradebookAPI lesson-progress: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not load class record data. Please try again.']);
    }
}

function enrichLessonRowsWithSections(array &$rows): void
{
    foreach ($rows as &$row) {
        $secRows = db()->fetchAll(
            'SELECT section_id FROM lesson_section WHERE lessons_id = ?',
            [(int)$row['lessons_id']]
        );
        $ids = array_map(fn($r) => (int)$r['section_id'], $secRows);
        $row['section_ids'] = $ids;
        $row['all_sections'] = empty($ids);
    }
    unset($row);
}
