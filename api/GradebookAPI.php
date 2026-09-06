<?php
/**
 * Gradebook API — lesson completion matrix for class records
 */
require_once __DIR__ . '/../config/cors.php';
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
    case 'get-score-overrides':
        handleGetScoreOverrides();
        break;
    case 'save-score-override':
        handleSaveScoreOverride();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Raw-Score class record — manual override for a quiz cell, same spirit as
 * the Global Gradebook's directly-editable module cells. The computed
 * "best attempt" score stays the default; an override here just changes
 * what's DISPLAYED (and counted in the row total) for that one student on
 * that one quiz, without touching student_quiz_attempts/answers at all —
 * so it never interferes with the student's own attempt history or with
 * AI/manual answer-level grading.
 */
function ensureQuizScoreOverridesTable(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS `quiz_score_overrides` (
            `override_id`   INT NOT NULL AUTO_INCREMENT,
            `quiz_id`       INT NOT NULL,
            `user_student_id` INT NOT NULL,
            `earned_points` DECIMAL(6,2) NOT NULL,
            `updated_by`    INT NULL,
            `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`override_id`),
            UNIQUE KEY `uq_qso` (`quiz_id`, `user_student_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
    } catch (Exception $e) {
        error_log('ensureQuizScoreOverridesTable: ' . $e->getMessage());
    }
}

/**
 * GET ?action=get-score-overrides&quiz_ids=1,2,3
 * Returns { [quiz_id]: { [user_student_id]: earned_points } } for the
 * requested quizzes — the caller already knows which quizzes are in view.
 */
function handleGetScoreOverrides(): void {
    ensureQuizScoreOverridesTable();
    $ids = array_values(array_filter(array_map('intval', explode(',', $_GET['quiz_ids'] ?? ''))));
    if (!$ids) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }
    // Only return overrides for quizzes the requester can actually manage —
    // this is a read of other students' scores, not public class-record data.
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $quizzes = db()->fetchAll("SELECT quiz_id, subject_id FROM quiz WHERE quiz_id IN ($placeholders)", $ids);
    $role = Auth::role();
    $userId = (int)Auth::id();
    $allowedIds = array_values(array_map(
        fn($q) => (int)$q['quiz_id'],
        array_filter($quizzes, fn($q) => canManageQuizSubject((int)$q['subject_id'], $userId, $role))
    ));
    if (!$allowedIds) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }
    $placeholders = implode(',', array_fill(0, count($allowedIds), '?'));
    $rows = db()->fetchAll(
        "SELECT quiz_id, user_student_id, earned_points FROM quiz_score_overrides WHERE quiz_id IN ($placeholders)",
        $allowedIds
    );
    $out = [];
    foreach ($rows as $r) {
        $out[(int)$r['quiz_id']][(int)$r['user_student_id']] = (float)$r['earned_points'];
    }
    echo json_encode(['success' => true, 'data' => $out]);
}

/**
 * POST ?action=save-score-override
 * Body: { quiz_id, user_student_id, earned_points }  — earned_points null/''
 * clears the override, reverting the cell to the computed best-attempt score.
 * Only whoever can manage the quiz's subject (teacher of record, or a
 * dean/program_head in scope) may set one.
 */
function handleSaveScoreOverride(): void {
    ensureQuizScoreOverridesTable();
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $quizId = (int)($data['quiz_id'] ?? 0);
    $studentId = (int)($data['user_student_id'] ?? 0);
    if (!$quizId || !$studentId) {
        echo json_encode(['success' => false, 'message' => 'quiz_id and user_student_id required']);
        return;
    }

    $quiz = db()->fetchOne("SELECT subject_id, total_points FROM quiz WHERE quiz_id = ?", [$quizId]);
    if (!$quiz) {
        echo json_encode(['success' => false, 'message' => 'Quiz not found']);
        return;
    }
    if (!canManageQuizSubject((int)$quiz['subject_id'], (int)Auth::id(), Auth::role())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Permission denied']);
        return;
    }

    $raw = $data['earned_points'] ?? null;
    try {
        if ($raw === null || $raw === '') {
            pdo()->prepare("DELETE FROM quiz_score_overrides WHERE quiz_id = ? AND user_student_id = ?")
                ->execute([$quizId, $studentId]);
            echo json_encode(['success' => true, 'data' => ['cleared' => true]]);
            return;
        }
        $points = max(0, min((float)$quiz['total_points'] ?: 999999, (float)$raw));
        pdo()->prepare(
            "INSERT INTO quiz_score_overrides (quiz_id, user_student_id, earned_points, updated_by)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE earned_points = VALUES(earned_points), updated_by = VALUES(updated_by)"
        )->execute([$quizId, $studentId, $points, Auth::id()]);
        echo json_encode(['success' => true, 'data' => ['earned_points' => $points]]);
    } catch (Exception $e) {
        error_log('save-score-override: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save override']);
    }
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
}

function handleLessonProgress(): void
{
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
