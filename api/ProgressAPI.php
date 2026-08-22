<?php
/**
 * CIT-LMS Progress API
 * Student progress, grades, and quiz history
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/QuizSectionHelper.php';
require_once __DIR__ . '/helpers/GradingPeriodHelper.php';
require_once __DIR__ . '/helpers/NotificationEmailHelper.php';

ensureQuizScheduleColumns();
ensureGradingPeriodColumns();
ensureStudentPermissions();

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// Students always have access to their own progress data — skip RBAC
// for self-service actions so missing DB seeds never lock a student out.
$studentSelfActions = ['grades', 'subject-progress', 'student-quizzes', 'new-quizzes', 'reminders', 'quiz-result'];
if (Auth::role() !== 'student') {
    // progress.view is granted to every role identically to grades.view/
    // quizzes.view (verified before this change), so this doesn't alter
    // access for anyone — it just makes the "progress" RBAC module (which
    // was otherwise fully decorative) actually mean something.
    $_progPerms = [
        'grades'           => 'progress.view',
        'subject-progress' => 'progress.view',
        'student-quizzes'  => 'progress.view',
        'new-quizzes'      => 'progress.view',
        'reminders'        => 'progress.view',
        'quiz-result'      => 'progress.view',
    ];
    if (isset($_progPerms[$action]) && !Auth::can($_progPerms[$action])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => "Permission denied: {$_progPerms[$action]}"]);
        exit;
    }
}

switch ($action) {
    case 'grades': getGrades(); break;
    case 'subject-progress': getSubjectProgress(); break;
    case 'student-quizzes': getStudentQuizzes(); break;
    case 'new-quizzes': getNewStudentQuizzes(); break;
    case 'reminders': getStudentReminders(); break;
    case 'quiz-result': getQuizResult(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Get grades overview - all quiz scores grouped by subject
 */
function getGrades() {
    $userId = Auth::id();

    try {
        ensureCurrentPeriodColumn();

        // Get subjects with class context — include dropped enrollments so historical grades remain visible.
        // Order by enrolled first so PHP dedup keeps the active enrollment when duplicates exist.
        $rawSubjects = db()->fetchAll(
            "SELECT s.subject_id, s.subject_code, s.subject_name,
                sec.section_name, sec.section_id,
                so.subject_offered_id, so.grading_type,
                so.current_period,
                ss.status AS enrollment_status,
                CONCAT(u2.first_name, ' ', u2.last_name) AS instructor_name,
                (SELECT COUNT(*) FROM lessons l
                 WHERE l.subject_id = s.subject_id AND l.status = 'published') AS total_lessons,
                (SELECT COUNT(*) FROM student_progress sp
                 JOIN lessons l ON l.lessons_id = sp.lessons_id
                 WHERE sp.user_student_id = ? AND l.subject_id = s.subject_id AND sp.status = 'completed') AS completed_lessons
             FROM student_subject ss
             JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
             JOIN subject s ON so.subject_id = s.subject_id
             LEFT JOIN section sec ON ss.section_id = sec.section_id
             LEFT JOIN users u2 ON u2.users_id = so.user_teacher_id
             WHERE ss.user_student_id = ? AND ss.status IN ('enrolled', 'dropped')
             ORDER BY (ss.status = 'enrolled') DESC, s.subject_code",
            [$userId, $userId]
        );
        // Deduplicate by subject_id — prefer enrolled over dropped
        $seen = [];
        $subjects = [];
        foreach ($rawSubjects as $row) {
            if (!isset($seen[$row['subject_id']])) {
                $seen[$row['subject_id']] = true;
                $subjects[] = $row;
            }
        }

        // Fallback: also include subjects the student has quiz attempts for, even with no enrollment record
        if (empty($subjects)) {
            $subjects = db()->fetchAll(
                "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name,
                    NULL AS section_name, NULL AS section_id,
                    NULL AS subject_offered_id, NULL AS grading_type,
                    'P1' AS current_period, 'historical' AS enrollment_status,
                    NULL AS instructor_name,
                    (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id AND l.status = 'published') AS total_lessons,
                    (SELECT COUNT(*) FROM student_progress sp
                     JOIN lessons l ON l.lessons_id = sp.lessons_id
                     WHERE sp.user_student_id = ? AND l.subject_id = s.subject_id AND sp.status = 'completed') AS completed_lessons
                 FROM student_quiz_attempts sqa
                 JOIN quiz q ON q.quiz_id = sqa.quiz_id
                 JOIN subject s ON s.subject_id = q.subject_id
                 WHERE sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY s.subject_code",
                [$userId, $userId]
            );
        }

        $result = [];
        foreach ($subjects as $subj) {
            $quizzes = db()->fetchAll(
                "SELECT q.quiz_id, q.quiz_title, q.quiz_type, q.grading_period, q.passing_rate, q.due_date,
                    COALESCE(
                        NULLIF(q.total_points, 0),
                        (SELECT SUM(qs.points) FROM quiz_questions qq2
                         JOIN questions qs ON qq2.questions_id = qs.questions_id
                         WHERE qq2.quiz_id = q.quiz_id),
                        0
                    ) AS total_points,
                    (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) as question_count,
                    (SELECT MAX(sqa.percentage) FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as best_score,
                    (SELECT sqa.passed FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.percentage DESC LIMIT 1) as passed,
                    (SELECT sqa.earned_points FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.percentage DESC LIMIT 1) as earned_points,
                    (SELECT sqa.attempt_id FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.percentage DESC LIMIT 1) as best_attempt_id,
                    (SELECT sqa.has_pending_grades FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.percentage DESC LIMIT 1) as has_pending_grades,
                    (SELECT COUNT(*) FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as attempts,
                    (SELECT sqa.completed_at FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.percentage DESC LIMIT 1) as completed_at,
                    (SELECT COUNT(*) FROM student_quiz_answers sqa2
                     JOIN student_quiz_attempts sqa3 ON sqa3.attempt_id = sqa2.attempt_id
                     WHERE sqa3.quiz_id = q.quiz_id AND sqa3.user_student_id = ?
                       AND sqa3.status = 'completed'
                       AND TRIM(COALESCE(sqa2.grader_feedback, '')) != '') as has_feedback
                 FROM quiz q
                 WHERE q.subject_id = ?
                   AND (q.status = 'published'
                        OR EXISTS (
                            SELECT 1 FROM student_quiz_attempts sqa2
                            WHERE sqa2.quiz_id = q.quiz_id AND sqa2.user_student_id = ? AND sqa2.status = 'completed'
                        ))
                 ORDER BY q.created_at",
                [$userId, $userId, $userId, $userId, $userId, $userId, $userId, $userId, $subj['subject_id'], $userId]
            );

            $lessons = db()->fetchAll(
                "SELECT l.lessons_id, l.lesson_title, l.grading_period, l.due_date,
                    (SELECT sp.status FROM student_progress sp
                     WHERE sp.lessons_id = l.lessons_id AND sp.user_student_id = ?
                     ORDER BY sp.updated_at DESC LIMIT 1) AS progress_status
                 FROM lessons l
                 WHERE l.subject_id = ? AND l.status = 'published'
                 ORDER BY l.lesson_order, l.lessons_id",
                [$userId, $subj['subject_id']]
            );
            foreach ($lessons as &$lesson) {
                $lesson['grading_period'] = normalizeGradingPeriod($lesson['grading_period'] ?? 'P1');
            }
            unset($lesson);

            $subj['quizzes'] = $quizzes;
            foreach ($subj['quizzes'] as &$quiz) {
                $quiz['grading_period'] = normalizeGradingPeriod($quiz['grading_period'] ?? 'P1');
            }
            unset($quiz);
            $subj['lessons'] = $lessons;
            $scores = array_filter(array_column($quizzes, 'best_score'), fn($s) => $s !== null);
            $subj['avg_score'] = count($scores) > 0 ? round(array_sum($scores) / count($scores), 1) : null;
            $subj['quizzes_passed'] = count(array_filter($quizzes, fn($q) => $q['passed'] == 1));
            $subj['quizzes_attempted'] = count($scores);
            $subj['total_quizzes'] = count($quizzes);
            $subj['lesson_progress'] = $subj['total_lessons'] > 0
                ? round(($subj['completed_lessons'] / $subj['total_lessons']) * 100) : 0;
            $subj['current_period'] = normalizeGradingPeriod($subj['current_period'] ?? 'P1');
            $result[] = $subj;
        }

        echo json_encode(['success' => true, 'data' => $result]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get detailed progress for a single subject (lessons + quizzes)
 */
function getSubjectProgress() {
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? 0;

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'Subject ID required']);
        return;
    }

    try {
        // Subject info
        $subject = db()->fetchOne(
            "SELECT s.subject_id, s.subject_code, s.subject_name
             FROM subject s WHERE s.subject_id = ?",
            [$subjectId]
        );

        // Lessons with completion
        $lessons = db()->fetchAll(
            "SELECT l.lessons_id, l.lesson_title, l.lesson_order, l.lesson_description,
                CASE WHEN sp.status = 'completed' THEN 1 ELSE 0 END as is_completed,
                sp.completed_at
             FROM lessons l
             LEFT JOIN student_progress sp ON l.lessons_id = sp.lessons_id AND sp.user_student_id = ?
             WHERE l.subject_id = ? AND l.status = 'published'
             ORDER BY l.lesson_order",
            [$userId, $subjectId]
        );

        // Quizzes with best scores + attempt count + earned/total points
        $quizzes = db()->fetchAll(
            "SELECT q.quiz_id, q.quiz_title, q.quiz_type, q.passing_rate, q.max_attempts, q.time_limit,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) as question_count,
                (SELECT MAX(sqa.percentage) FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as best_score,
                (SELECT sqa.earned_points FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY sqa.percentage DESC LIMIT 1) as best_earned,
                (SELECT sqa.total_points FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY sqa.percentage DESC LIMIT 1) as best_total,
                (SELECT COUNT(*) FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as attempts_used,
                (SELECT sqa.completed_at FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY sqa.percentage DESC LIMIT 1) as best_attempt_date
             FROM quiz q
             WHERE q.subject_id = ? AND q.status = 'published'
             ORDER BY q.quiz_type, q.created_at",
            [$userId, $userId, $userId, $userId, $userId, $subjectId]
        );

        $completedLessons = count(array_filter($lessons, fn($l) => $l['is_completed']));
        $totalLessons = count($lessons);
        $quizzesAttempted = count(array_filter($quizzes, fn($q) => $q['best_score'] !== null));
        $quizzesPassed = count(array_filter($quizzes, fn($q) => $q['best_score'] !== null && (float)$q['best_score'] >= (float)$q['passing_rate']));
        $scores = array_filter(array_column($quizzes, 'best_score'), fn($s) => $s !== null);
        $avgScore = count($scores) > 0 ? round(array_sum($scores) / count($scores), 1) : null;

        // Overall progress: weight lessons 50%, quizzes 50%
        $lessonPct = $totalLessons > 0 ? ($completedLessons / $totalLessons) * 100 : 0;
        $quizPct = count($quizzes) > 0 ? ($quizzesPassed / count($quizzes)) * 100 : 0;
        $overallProgress = $totalLessons > 0 && count($quizzes) > 0
            ? round(($lessonPct + $quizPct) / 2)
            : round($lessonPct > 0 ? $lessonPct : $quizPct);

        echo json_encode([
            'success' => true,
            'data' => [
                'subject' => $subject,
                'lessons' => $lessons,
                'quizzes' => $quizzes,
                'completed_lessons' => $completedLessons,
                'total_lessons' => $totalLessons,
                'quizzes_attempted' => $quizzesAttempted,
                'quizzes_passed' => $quizzesPassed,
                'total_quizzes' => count($quizzes),
                'avg_score' => $avgScore,
                'lesson_progress' => $totalLessons > 0 ? round(($completedLessons / $totalLessons) * 100) : 0,
                'progress' => $overallProgress
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get all quizzes for a student across all enrolled subjects
 */
function getStudentQuizzes() {
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? '';

    try {
        $where = '';
        $params = [$userId, $userId, $userId, $userId, $userId, $userId];
        if ($subjectId) {
            $where = 'AND q.subject_id = ?';
            $params[] = $subjectId;
        }

        $quizzes = db()->fetchAll(
            "SELECT q.quiz_id, q.quiz_title, q.quiz_description, q.quiz_type, q.time_limit,
                q.passing_rate, q.max_attempts, q.subject_id, q.due_date, q.availability_start,
                q.status, q.created_at, q.updated_at,
                s.subject_code, s.subject_name,
                COALESCE(
                    NULLIF(q.total_points, 0),
                    (SELECT SUM(qs.points) FROM quiz_questions qq2 JOIN questions qs ON qq2.questions_id = qs.questions_id WHERE qq2.quiz_id = q.quiz_id),
                    0
                ) AS total_points,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) as question_count,
                (SELECT COUNT(*) FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as attempts_used,
                (SELECT MAX(sqa.percentage) FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as best_score,
                (SELECT sqa.passed FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY sqa.percentage DESC LIMIT 1) as passed,
                (SELECT sqa.earned_points FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY sqa.percentage DESC LIMIT 1) as earned_points,
                (SELECT sqa.attempt_id FROM student_quiz_attempts sqa
                 WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                 ORDER BY sqa.percentage DESC LIMIT 1) as best_attempt_id
             FROM quiz q
             JOIN subject s ON q.subject_id = s.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled' AND " . quizPublishedSql('q') . "
             $where
             GROUP BY q.quiz_id
             ORDER BY s.subject_code, q.quiz_type, q.created_at",
            $params
        );

        foreach ($quizzes as &$quiz) {
            if ($quiz['passed']) {
                $quiz['quiz_status'] = 'passed';
            } elseif ((int)$quiz['attempts_used'] > 0 && quizAttemptsExhausted($quiz, (int)$quiz['attempts_used'])) {
                $quiz['quiz_status'] = 'exhausted';
            } elseif ($quiz['attempts_used'] > 0) {
                $quiz['quiz_status'] = 'attempted';
            } elseif (!isQuizAvailableNow($quiz)) {
                $quiz['quiz_status'] = 'scheduled';
            } else {
                $quiz['quiz_status'] = 'available';
            }
            enrichQuizAvailability($quiz);
        }
        unset($quiz);

        echo json_encode(['success' => true, 'data' => $quizzes]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Quizzes newly available for student notifications (since timestamp).
 */
function getNewStudentQuizzes() {
    $userId = Auth::id();
    $sinceRaw = trim($_GET['since'] ?? '');
    $since = $sinceRaw !== '' ? date('Y-m-d H:i:s', strtotime($sinceRaw)) : date('Y-m-d H:i:s', strtotime('-7 days'));

    try {
        $quizzes = db()->fetchAll(
            "SELECT q.quiz_id, q.quiz_title, q.quiz_type, q.due_date, q.time_limit,
                    q.availability_start, q.created_at, q.updated_at,
                    s.subject_id, s.subject_code, s.subject_name,
                    GREATEST(
                        COALESCE(q.availability_start, q.created_at),
                        COALESCE(q.updated_at, q.created_at)
                    ) AS notify_at
             FROM quiz q
             JOIN subject s ON q.subject_id = s.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
               AND " . quizVisibleToStudentsSql('q') . "
               AND NOT EXISTS (
                   SELECT 1 FROM student_quiz_attempts sqa
                   WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ?
                     AND sqa.status = 'completed'
               )
               AND GREATEST(
                       COALESCE(q.availability_start, q.created_at),
                       COALESCE(q.updated_at, q.created_at)
                   ) > ?
             GROUP BY q.quiz_id
             ORDER BY notify_at DESC
             LIMIT 25",
            [$userId, $userId, $since]
        );

        echo json_encode(['success' => true, 'data' => $quizzes ?: []]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Auto-seed the minimum permissions required by students if the RBAC tables
 * exist but the student role has never been seeded.  Safe to call on every
 * request — the static guard + INSERT IGNORE make it a no-op after the first run.
 */
function ensureStudentPermissions(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $pdo = Database::getInstance()->getConnection();
        $needed = ['grades.view', 'quizzes.view', 'lessons.view', 'subjects.view', 'remedials.view'];
        $placeholders = implode(',', array_fill(0, count($needed), '?'));
        $pdo->prepare(
            "INSERT IGNORE INTO role_permissions (role, permission_id)
             SELECT 'student', id FROM permissions WHERE name IN ($placeholders)"
        )->execute($needed);
        // Refresh session cache so the current request sees the new grants
        if (Auth::role() === 'student') {
            Auth::refreshPermissions();
        }
    } catch (Exception $e) {
        // Tables may not exist yet — silently skip
    }
}

function ensureReminderLogTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec(
            "CREATE TABLE IF NOT EXISTS student_reminder_log (
                reminder_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_student_id INT UNSIGNED NOT NULL,
                item_type ENUM('lesson','quiz','post') NOT NULL,
                item_id INT UNSIGNED NOT NULL,
                stage_key VARCHAR(64) NOT NULL,
                subject_id INT UNSIGNED NULL,
                due_date DATETIME NULL,
                sent_at TIMESTAMP NULL DEFAULT NULL,
                email_to VARCHAR(190) NULL,
                status ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
                error_text VARCHAR(255) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_student_item_stage (user_student_id, item_type, item_id, stage_key),
                KEY idx_student_status (user_student_id, status, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    } catch (Exception $e) {
        error_log('student_reminder_log table: ' . $e->getMessage());
    }
}

function reminderStageKey(DateTime $due, DateTime $now): string {
    $seconds = $due->getTimestamp() - $now->getTimestamp();
    if ($seconds < 0) {
        return 'overdue';
    }
    if ($due->format('Y-m-d') === $now->format('Y-m-d')) {
        return 'due_today';
    }
    $hours = (int)floor($seconds / 3600);
    if ($hours <= 24) return 'due_24h';
    if ($hours <= 72) return 'due_72h';
    return 'upcoming';
}

function sendReminderEmail(string $toEmail, string $studentName, string $subjectCode, string $title, DateTime $due, string $type, string $stage = 'due_24h', int $userId = 0, int $itemId = 0): bool {
    return NotificationEmailHelper::sendDueReminder($toEmail, $studentName, $subjectCode, $title, $due, $type, $stage, $userId, $itemId);
}

/**
 * Student reminder feed for calendar + optional email dispatch.
 * Returns due-soon lessons/quizzes and sends emails once per reminder stage.
 */
function getStudentReminders() {
    $userId = Auth::id();
    $dispatch = ($_GET['dispatch'] ?? '1') !== '0';

    try {
        ensureReminderLogTable();
        $now = new DateTime('now');
        $windowEnd = new DateTime('now');
        $windowEnd = $windowEnd->modify('+7 days')->format('Y-m-d H:i:s');
        $windowStart = new DateTime('now');
        $windowStart = $windowStart->modify('-2 days')->format('Y-m-d H:i:s');

        $student = db()->fetchOne(
            "SELECT users_id, first_name, last_name, email FROM users WHERE users_id = ? LIMIT 1",
            [$userId]
        ) ?: [];
        $studentName = trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? '')) ?: 'Student';
        $studentEmail = trim((string)($student['email'] ?? ''));

        $lessonRows = db()->fetchAll(
            "SELECT l.lessons_id AS item_id, 'lesson' AS item_type, l.lesson_title AS title,
                    CONCAT(l.due_date, ' 23:59:59') AS due_at,
                    s.subject_id, s.subject_code, s.subject_name
             FROM lessons l
             JOIN subject s ON s.subject_id = l.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             LEFT JOIN student_progress sp ON sp.lessons_id = l.lessons_id AND sp.user_student_id = ss.user_student_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
               AND l.status = 'published'
               AND l.due_date IS NOT NULL
               AND (sp.status IS NULL OR sp.status <> 'completed')
               AND (
                    NOT EXISTS (SELECT 1 FROM lesson_section ls0 WHERE ls0.lessons_id = l.lessons_id)
                    OR EXISTS (
                        SELECT 1 FROM lesson_section ls1
                        WHERE ls1.lessons_id = l.lessons_id AND ls1.section_id = ss.section_id
                    )
               )
               AND CONCAT(l.due_date, ' 23:59:59') BETWEEN ? AND ?
             GROUP BY l.lessons_id
             ORDER BY due_at ASC",
            [$userId, $windowStart, $windowEnd]
        );

        $quizRows = db()->fetchAll(
            "SELECT q.quiz_id AS item_id, 'quiz' AS item_type, q.quiz_title AS title,
                    CONCAT(q.due_date, ' 23:59:59') AS due_at,
                    s.subject_id, s.subject_code, s.subject_name
             FROM quiz q
             JOIN subject s ON s.subject_id = q.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             LEFT JOIN student_quiz_attempts sqa
               ON sqa.quiz_id = q.quiz_id
              AND sqa.user_student_id = ss.user_student_id
              AND sqa.status = 'completed'
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
               AND " . quizPublishedSql('q') . "
               AND q.due_date IS NOT NULL
               AND sqa.attempt_id IS NULL
               AND (
                    NOT EXISTS (SELECT 1 FROM quiz_section qs0 WHERE qs0.quiz_id = q.quiz_id)
                    OR EXISTS (
                        SELECT 1 FROM quiz_section qs1
                        WHERE qs1.quiz_id = q.quiz_id AND qs1.section_id = ss.section_id
                    )
               )
               AND CONCAT(q.due_date, ' 23:59:59') BETWEEN ? AND ?
             GROUP BY q.quiz_id
             ORDER BY due_at ASC",
            [$userId, $windowStart, $windowEnd]
        );

        $items = array_merge($lessonRows ?: [], $quizRows ?: []);
        usort($items, static fn($a, $b) => strcmp((string)$a['due_at'], (string)$b['due_at']));

        $emailSent = 0;
        $emailFailed = 0;
        $prepared = [];
        foreach ($items as $row) {
            $dueAt = new DateTime((string)$row['due_at']);
            $stage = reminderStageKey($dueAt, $now);
            $prepared[] = [
                'item_type' => $row['item_type'],
                'item_id' => (int)$row['item_id'],
                'title' => $row['title'] ?? '',
                'due_at' => $row['due_at'],
                'subject_id' => (int)$row['subject_id'],
                'subject_code' => $row['subject_code'] ?? '',
                'subject_name' => $row['subject_name'] ?? '',
                'stage' => $stage,
            ];

            if (!$dispatch || $stage === 'upcoming') {
                continue;
            }

            $exists = db()->fetchOne(
                "SELECT reminder_id FROM student_reminder_log
                 WHERE user_student_id = ? AND item_type = ? AND item_id = ? AND stage_key = ?
                 LIMIT 1",
                [$userId, $row['item_type'], (int)$row['item_id'], $stage]
            );
            if ($exists) {
                continue;
            }

            $sent = sendReminderEmail(
                $studentEmail,
                $studentName,
                (string)($row['subject_code'] ?? ''),
                (string)($row['title'] ?? ''),
                $dueAt,
                (string)$row['item_type'],
                $stage,
                $userId,
                (int)$row['item_id']
            );
            if ($sent) {
                $emailSent++;
            } else {
                $emailFailed++;
            }
            db()->execute(
                "INSERT INTO student_reminder_log
                    (user_student_id, item_type, item_id, stage_key, subject_id, due_date, sent_at, email_to, status, error_text)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)",
                [
                    $userId,
                    $row['item_type'],
                    (int)$row['item_id'],
                    $stage,
                    (int)$row['subject_id'],
                    $row['due_at'],
                    $studentEmail ?: null,
                    $sent ? 'sent' : 'failed',
                    $sent ? null : 'mail() returned false or invalid address',
                ]
            );
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'reminders' => $prepared,
                'email_sent' => $emailSent,
                'email_failed' => $emailFailed,
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get detailed quiz result with answers
 */
function getQuizResult() {
    $attemptId = $_GET['attempt_id'] ?? 0;
    $userId = Auth::id();

    if (!$attemptId) {
        echo json_encode(['success' => false, 'message' => 'Attempt ID required']);
        return;
    }

    try {
        $attempt = db()->fetchOne(
            "SELECT sqa.*, q.quiz_title, q.passing_rate, q.show_answers, q.quiz_type,
                q.subject_id, s.subject_code, s.subject_name
             FROM student_quiz_attempts sqa
             JOIN quiz q ON sqa.quiz_id = q.quiz_id
             JOIN subject s ON q.subject_id = s.subject_id
             WHERE sqa.attempt_id = ? AND sqa.user_student_id = ?",
            [$attemptId, $userId]
        );

        if (!$attempt) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Attempt not found']);
            return;
        }

        // Always load this student's answers (for review / where you went wrong)
        $showAnswers = !empty($attempt['show_answers']);
        $quizId = (int)$attempt['quiz_id'];

        $answers = db()->fetchAll(
            "SELECT sa.student_quiz_answer_id, sa.questions_id, sa.selected_option_id, sa.answer_text,
                    sa.is_correct, sa.points_earned, sa.grading_status, sa.grader_feedback,
                    q.question_text, q.question_type, q.points AS max_points,
                    q.question_order
             FROM student_quiz_answers sa
             JOIN questions q ON sa.questions_id = q.questions_id
             JOIN quiz_questions qq ON qq.questions_id = q.questions_id AND qq.quiz_id = ?
             WHERE sa.attempt_id = ? AND sa.user_student_id = ?
             ORDER BY q.question_order, q.questions_id",
            [$quizId, $attemptId, $userId]
        );

        foreach ($answers as &$a) {
            $maxPts = (float)($a['max_points'] ?? 0);
            $earned = (float)($a['points_earned'] ?? 0);
            $pending = ($a['grading_status'] ?? '') === 'pending';
            $a['is_wrong'] = !$pending && ((int)($a['is_correct'] ?? 0) !== 1 || $earned < $maxPts);
            $a['is_pending'] = $pending;

            $qType = strtolower((string)($a['question_type'] ?? ''));
            $isMcType = in_array($qType, ['multiple_choice', 'true_false', 'checkboxes', 'dropdown'], true);

            // Always expose the raw text answer as fallback for all types
            $a['your_answer_text'] = trim((string)($a['answer_text'] ?? ''));

            // Always load selected option text when student picked an option
            if (!empty($a['selected_option_id'])) {
                $sel = db()->fetchOne(
                    "SELECT option_text FROM question_option WHERE option_id = ?",
                    [$a['selected_option_id']]
                );
                $a['selected_option_text'] = $sel['option_text'] ?? '';
            } else {
                $a['selected_option_text'] = '';
            }

            if ($isMcType) {
                $a['options'] = db()->fetchAll(
                    "SELECT option_id, option_text, is_correct
                     FROM question_option
                     WHERE quiz_question_id = ?
                     ORDER BY order_number",
                    [$a['questions_id']]
                );
            } else {
                $a['options'] = [];
            }

            // Always load correct answer text (student needs to see what was right)
            $cor = db()->fetchOne(
                "SELECT option_text FROM question_option
                 WHERE quiz_question_id = ? AND is_correct = 1
                 ORDER BY order_number LIMIT 1",
                [$a['questions_id']]
            );
            $a['correct_answer_text'] = $cor['option_text'] ?? '';
        }
        unset($a);

        $wrongAnswers = array_values(array_filter($answers, fn($a) => !empty($a['is_wrong'])));
        $pendingAnswers = array_values(array_filter($answers, fn($a) => !empty($a['is_pending'])));

        // Get linked lesson — must belong to the same subject as the quiz
        $linkedLessonsId = null;
        $linkedLessonTitle = null;
        $subjectId = (int)($attempt['subject_id'] ?? 0);

        // 1. Try quiz_lessons but only if the lesson belongs to the same subject
        $linkedLesson = db()->fetchOne(
            "SELECT ql.lessons_id, l.lesson_title
             FROM quiz_lessons ql
             JOIN lessons l ON ql.lessons_id = l.lessons_id
             WHERE ql.quiz_id = ? AND l.subject_id = ?
             LIMIT 1",
            [$attempt['quiz_id'], $subjectId]
        );

        // 2. Fallback: first published lesson for the quiz's subject
        if (!$linkedLesson && $subjectId) {
            $linkedLesson = db()->fetchOne(
                "SELECT lessons_id, lesson_title
                 FROM lessons
                 WHERE subject_id = ? AND status = 'published'
                 ORDER BY lesson_order ASC
                 LIMIT 1",
                [$subjectId]
            );
        }

        if ($linkedLesson) {
            $linkedLessonsId = $linkedLesson['lessons_id'];
            $linkedLessonTitle = $linkedLesson['lesson_title'];
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'attempt'        => $attempt,
                'answers'        => $answers,
                'wrong_answers'  => $wrongAnswers,
                'pending_answers'=> $pendingAnswers,
                'show_answers'   => $showAnswers,
                'lessons_id'     => $linkedLessonsId,
                'lesson_title'   => $linkedLessonTitle,
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}
