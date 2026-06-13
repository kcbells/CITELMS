<?php
/**
 * ============================================================
 * CIT-LMS Quiz Attempts API
 * Fixed for schema: student_quiz_attempts, quiz_questions, student_quiz_answers
 * ============================================================
 */

// Buffer ALL output — prevents PHP warnings/errors from corrupting JSON
ob_start();

// Convert every PHP error/warning into an exception so we can catch it
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

// On shutdown (fatal errors), emit proper JSON
register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        ob_clean();
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Something went wrong. Please try again.']);
    }
});

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/QuizProctorHelper.php';
require_once __DIR__ . '/helpers/QuizSectionHelper.php';
require_once __DIR__ . '/helpers/ClassworkDueHelper.php';

// Discard any stray output from includes
ob_clean();

ensureTabSwitchColumn();

header('Content-Type: application/json');

/**
 * Log technical errors internally; return a simple message to students.
 */
function friendlyQuizMessage(Throwable $e, string $fallback = 'Something went wrong. Please try again.'): string {
    error_log('QuizAttempts: ' . $e->getMessage());
    return $fallback;
}

$action = $_GET['action'] ?? '';

if (!Auth::check()) {
    if ($action === 'submit') {
        header('Location: ' . BASE_URL . '/pages/auth/login.php');
    } else {
        header('Content-Type: application/json');
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    }
    exit;
}

// RBAC: enforce permission per action
$_attemptPerms = [
    'submit'           => 'quizzes.view',
    'proctor-unlock'   => 'quizzes.view',
    'get'              => 'quizzes.view',
    'history'          => 'quizzes.view',
    'quiz-scores'      => 'grades.view',
    'pending-grading'  => 'quizzes.grade',
    'attempt-answers'  => 'quizzes.grade',
    'grade-answer'     => 'quizzes.grade',
    'ai-grade-answer'  => 'quizzes.grade',
    'finalize-grading' => 'quizzes.grade',
];
if (isset($_attemptPerms[$action]) && !Auth::can($_attemptPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_attemptPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'proctor-unlock':
        header('Content-Type: application/json');
        clearQuizProctorLock();
        echo json_encode(['success' => true]);
        break;
    case 'submit':
        submitQuiz();
        break;
    case 'get':
        header('Content-Type: application/json');
        getAttempt();
        break;
    case 'history':
        header('Content-Type: application/json');
        getHistory();
        break;
    case 'quiz-scores':
        header('Content-Type: application/json');
        getQuizScores();
        break;
    case 'pending-grading':
        header('Content-Type: application/json');
        getPendingGrading();
        break;
    case 'attempt-answers':
        header('Content-Type: application/json');
        getAttemptAnswers();
        break;
    case 'grade-answer':
        header('Content-Type: application/json');
        gradeAnswer();
        break;
    case 'ai-grade-answer':
        header('Content-Type: application/json');
        aiGradeAnswerById();
        break;
    case 'finalize-grading':
        header('Content-Type: application/json');
        finalizeGrading();
        break;
    default:
        header('Content-Type: application/json');
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Submit quiz answers and calculate score
 */
function submitQuiz() {
    header('Content-Type: application/json');
    $userId = Auth::id();

    // Support both JSON body and form POST
    $input = json_decode(file_get_contents('php://input'), true);
    if ($input) {
        $quizId       = (int)($input['quiz_id']      ?? 0);
        $answers      = $input['answers']             ?? [];
        $timeTaken    = (int)($input['time_taken']    ?? 0);
        $tabSwitches  = max(0, (int)($input['tab_switches'] ?? 0));
        $endedReason  = trim((string)($input['ended_reason'] ?? ''));
    } else {
        $quizId       = (int)($_POST['quiz_id']      ?? 0);
        $answers      = $_POST['answers']             ?? [];
        $timeTaken    = (int)($_POST['time_taken']    ?? 0);
        $tabSwitches  = max(0, (int)($_POST['tab_switches'] ?? 0));
        $endedReason  = trim((string)($_POST['ended_reason'] ?? ''));
    }

    // ── Input validation ─────────────────────────────────────
    if (!$quizId || $quizId < 1) {
        echo json_encode(['success' => false, 'message' => 'Invalid quiz ID']);
        return;
    }
    if (!is_array($answers)) {
        echo json_encode(['success' => false, 'message' => 'Answers must be an array']);
        return;
    }
    if ($timeTaken < 0 || $timeTaken > 86400) {
        echo json_encode(['success' => false, 'message' => 'Invalid time value']);
        return;
    }
    // Sanitise answer keys — only allow integer question IDs
    $cleanAnswers = [];
    foreach ($answers as $qId => $val) {
        $cleanId = (int)$qId;
        if ($cleanId < 1) continue;
        // MC/TF: option_id must be a positive int; essay/fill: string, max 5000 chars
        if (is_string($val)) {
            $cleanAnswers[$cleanId] = mb_substr(strip_tags(trim($val)), 0, 5000);
        } elseif (is_numeric($val)) {
            $cleanAnswers[$cleanId] = (int)$val;
        }
        // drop anything else (arrays, objects, booleans)
    }
    $answers = $cleanAnswers;

    try {
        $quiz = db()->fetchOne(
            "SELECT q.*, s.subject_id FROM quiz q
             JOIN subject s ON q.subject_id = s.subject_id
             WHERE q.quiz_id = ? AND " . quizVisibleToStudentsSql('q'),
            [$quizId]
        );

        if (!$quiz) {
            echo json_encode(['success' => false, 'message' => 'Quiz not found']);
            return;
        }

        $enrollment = db()->fetchOne(
            "SELECT ss.* FROM student_subject ss
             JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
             WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'",
            [$userId, $quiz['subject_id']]
        );

        if (!$enrollment) {
            echo json_encode(['success' => false, 'message' => 'Not enrolled in this subject']);
            return;
        }

        ensureQuizScheduleColumns();
        ensureQuizBehaviorColumns();
        if (!empty($quiz['due_date']) && isPastDueDate((string)$quiz['due_date'])) {
            echo json_encode(['success' => false, 'message' => 'This quiz is past its due date. Contact your instructor for an extension.']);
            return;
        }

        $attemptCount = (int)(db()->fetchOne(
            "SELECT COUNT(*) as count FROM student_quiz_attempts
             WHERE quiz_id = ? AND user_student_id = ? AND status = 'completed'",
            [$quizId, $userId]
        )['count'] ?? 0);

        if (quizAttemptsExhausted($quiz, $attemptCount)) {
            $limit = quizAttemptLimit($quiz);
            echo json_encode([
                'success' => false,
                'message' => "You have used all {$limit} attempt(s) for this quiz."
            ]);
            return;
        }

        // Get questions from `questions` table via `quiz_questions` junction
        // NOTE: question_option.quiz_question_id is the FK column name (points to questions.questions_id)
        $questions = db()->fetchAll(
            "SELECT q.questions_id, q.question_text, q.question_type, q.points,
                    (SELECT option_id   FROM question_option WHERE quiz_question_id = q.questions_id AND is_correct = 1 LIMIT 1) as correct_option_id,
                    (SELECT option_text FROM question_option WHERE quiz_question_id = q.questions_id AND is_correct = 1 LIMIT 1) as expected_answer
             FROM quiz_questions qq
             JOIN questions q ON qq.questions_id = q.questions_id
             WHERE qq.quiz_id = ?",
            [$quizId]
        );

        // Ownership check: strip any submitted answer whose question_id is not in this quiz
        $validQuestionIds = array_column($questions, 'questions_id');
        $answers = array_intersect_key($answers, array_flip($validQuestionIds));

        $totalPoints = 0;
        $earnedPoints = 0;
        $answerRecords = [];

        $hasPendingGrades = false;
        $objGradingMode = normalizeObjectiveGradingMode($quiz['objective_grading_mode'] ?? 'auto');
        $subGradingMode = normalizeSubjectiveGradingMode($quiz['subjective_grading_mode'] ?? 'ai_auto');

        foreach ($questions as $q) {
            $totalPoints += (int)$q['points'];
            $userAnswer = $answers[$q['questions_id']] ?? null;
            $isCorrect = false;
            $pointsEarned = 0;
            $gradingStatus = 'auto_graded';
            $answerText = null;

            if (in_array($q['question_type'], ['multiple_choice', 'true_false'])) {
                $isCorrect = $userAnswer !== null && $userAnswer == $q['correct_option_id'];
                if ($isCorrect) {
                    $pointsEarned = (int)$q['points'];
                    $earnedPoints += $pointsEarned;
                }
            } elseif (in_array($q['question_type'], ['essay', 'short_answer'])) {
                $answerText    = is_string($userAnswer) ? trim($userAnswer) : '';
                $expectedAnswer = trim($q['expected_answer'] ?? ''); // from main query — no extra DB call

                if (!empty($answerText)) {
                    if ($subGradingMode === 'manual') {
                        $gradingStatus = 'pending';
                        $hasPendingGrades = true;
                    } elseif ($subGradingMode === 'answer_key' && $expectedAnswer === '') {
                        $gradingStatus = 'pending';
                        $hasPendingGrades = true;
                    } else {
                        $ai = aiGradeAnswer($q['question_text'], $expectedAnswer, $answerText, (int)$q['points'], $q['question_type']);
                        $pointsEarned = $ai['score'];
                        $earnedPoints += $pointsEarned;
                        $isCorrect = $pointsEarned >= $q['points'];
                        $q['_ai_feedback'] = $ai['feedback'];
                        if ($subGradingMode === 'ai_review') {
                            $gradingStatus = 'pending';
                            $hasPendingGrades = true;
                        } else {
                            $gradingStatus = $ai['status'];
                            if ($gradingStatus === 'pending') {
                                $hasPendingGrades = true;
                            }
                        }
                    }
                } else {
                    $gradingStatus = 'auto_graded'; // blank = 0 pts, not pending
                }
            } elseif ($q['question_type'] === 'fill_blank' || $q['question_type'] === 'fill_in_the_blank') {
                $answerText = is_string($userAnswer) ? trim($userAnswer) : '';
                $correct    = trim($q['expected_answer'] ?? ''); // from main query — no extra DB call

                if ($answerText !== '' && $correct !== '') {
                    // Exact match first (case-insensitive)
                    if (strtolower($answerText) === strtolower($correct)) {
                        $isCorrect    = true;
                        $pointsEarned = (int)$q['points'];
                        $earnedPoints += $pointsEarned;
                        $gradingStatus = 'auto_graded';
                    } elseif ($objGradingMode === 'manual') {
                        $gradingStatus = 'pending';
                        $hasPendingGrades = true;
                    } elseif (in_array($objGradingMode, ['ai_auto', 'ai_review'], true)) {
                        $ai = aiGradeAnswer($q['question_text'], $correct, $answerText, (int)$q['points'], 'fill_blank');
                        $pointsEarned = $ai['score'];
                        $earnedPoints += $pointsEarned;
                        $isCorrect = $pointsEarned >= $q['points'];
                        $q['_ai_feedback'] = $ai['feedback'];
                        if ($objGradingMode === 'ai_review') {
                            $gradingStatus = 'pending';
                            $hasPendingGrades = true;
                        } else {
                            $gradingStatus = $ai['status'];
                        }
                    } else {
                        // auto / answer_key — no partial credit without exact match
                        $gradingStatus = 'auto_graded';
                    }
                } elseif ($answerText !== '' && $correct === '') {
                    // Answer given but no correct answer configured — mark pending for manual review
                    $gradingStatus   = 'pending';
                    $hasPendingGrades = true;
                }
            }

            $answerRecords[] = [
                'questions_id'     => $q['questions_id'],
                'selected_option_id' => in_array($q['question_type'], ['essay','short_answer','fill_blank','fill_in_the_blank']) ? null : $userAnswer,
                'answer_text'      => $answerText,
                'is_correct'       => $isCorrect ? 1 : 0,
                'points_earned'    => $pointsEarned,
                'grading_status'   => $gradingStatus,
                'grader_feedback'  => $q['_ai_feedback'] ?? null
            ];
        }

        $percentage = $totalPoints > 0 ? ($earnedPoints / $totalPoints) * 100 : 0;
        $passed = $hasPendingGrades ? false : ($percentage >= $quiz['passing_rate']);

        // Use pdo() so errors propagate
        $pdo = pdo();

        // Get linked lesson BEFORE starting transaction (read-only, safe outside)
        $linkedLessonsId = null;
        $linkedLesson = db()->fetchOne(
            "SELECT ql.lessons_id, l.subject_id FROM quiz_lessons ql JOIN lessons l ON ql.lessons_id = l.lessons_id WHERE ql.quiz_id = ? LIMIT 1",
            [$quizId]
        );
        if ($linkedLesson) {
            $linkedLessonsId = $linkedLesson['lessons_id'];
        }

        // Wrap all writes in a single transaction — if any insert fails, nothing is partially saved
        $pdo->beginTransaction();

        $stmt = $pdo->prepare(
            "INSERT INTO student_quiz_attempts
             (quiz_id, user_student_id, attempt_number, total_points, earned_points, percentage, passed, time_spent, started_at, completed_at, status, has_pending_grades, tab_switch_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 'completed', ?, ?)"
        );
        $stmt->execute([$quizId, $userId, $attemptCount + 1, $totalPoints, $earnedPoints, round($percentage, 2), $passed ? 1 : 0, $timeTaken, $hasPendingGrades ? 1 : 0, $tabSwitches]);
        $attemptId = $pdo->lastInsertId();

        // Save individual answers
        foreach ($answerRecords as $record) {
            $pdo->prepare(
                "INSERT INTO student_quiz_answers
                 (attempt_id, quiz_id, questions_id, user_student_id, selected_option_id, answer_text, is_correct, points_earned, grading_status, grader_feedback)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([
                $attemptId, $quizId, $record['questions_id'], $userId,
                $record['selected_option_id'], $record['answer_text'],
                $record['is_correct'], $record['points_earned'], $record['grading_status'],
                $record['grader_feedback'] ?? null
            ]);
        }

        // Auto-complete linked lesson if passed
        if ($passed && $linkedLessonsId) {
            $existingProgress = db()->fetchOne(
                "SELECT progress_id FROM student_progress WHERE user_student_id = ? AND lessons_id = ?",
                [$userId, $linkedLessonsId]
            );
            if ($existingProgress) {
                $pdo->prepare("UPDATE student_progress SET status='completed', completed_at=NOW() WHERE user_student_id=? AND lessons_id=?")
                    ->execute([$userId, $linkedLessonsId]);
            } else {
                $pdo->prepare("INSERT INTO student_progress (user_student_id, lessons_id, subject_id, status, completed_at, started_at) VALUES (?,?,?,'completed',NOW(),NOW())")
                    ->execute([$userId, $linkedLessonsId, $linkedLesson['subject_id']]);
            }
        }

        $pdo->commit();
        clearQuizProctorLock();

        $message = 'Quiz submitted';
        if ($endedReason === 'tab_switch') {
            $message = 'Quiz ended — you left the quiz tab.';
        }

        echo json_encode([
            'success' => true,
            'message' => $message,
            'data' => [
                'attempt_id'   => $attemptId,
                'percentage'   => round($percentage, 1),
                'passed'       => $passed,
                'earned_points'=> $earnedPoints,
                'total_points' => $totalPoints,
                'lessons_id'   => $linkedLessonsId,
                'ended_reason' => $endedReason ?: null,
            ]
        ]);

    } catch (Exception $e) {
        try { if ($pdo?->inTransaction()) $pdo->rollBack(); } catch (Exception $_) {}
        $msg = 'We could not submit your quiz. Please try again.';
        if ($endedReason === 'tab_switch') {
            $msg = 'Your quiz was ended because you left this page.';
        }
        echo json_encode(['success' => false, 'message' => friendlyQuizMessage($e, $msg)]);
    }
}

/**
 * Get attempt details
 */
function getAttempt() {
    $attemptId = $_GET['id'] ?? 0;
    $userId = Auth::id();
    
    try {
        // FIXED: Column 'passing_rate'
        $attempt = db()->fetchOne(
            "SELECT qa.*, q.quiz_title as title, q.passing_rate,
                    s.subject_code, s.subject_name
             FROM student_quiz_attempts qa
             JOIN quiz q ON qa.quiz_id = q.quiz_id
             JOIN subject s ON q.subject_id = s.subject_id
             WHERE qa.attempt_id = ? AND qa.user_student_id = ?",
            [$attemptId, $userId]
        );
        
        if (!$attempt) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Attempt not found']);
            return;
        }
        
        echo json_encode(['success' => true, 'data' => $attempt]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get user's attempt history
 */
function getHistory() {
    $quizId = $_GET['quiz_id'] ?? 0;
    $userId = Auth::id();
    
    try {
        $attempts = db()->fetchAll(
            "SELECT attempt_id, percentage as score, time_spent as time_taken, completed_at as submitted_at
             FROM student_quiz_attempts
             WHERE quiz_id = ? AND user_student_id = ?
             ORDER BY completed_at DESC",
            [$quizId, $userId]
        );
        
        echo json_encode(['success' => true, 'data' => $attempts, 'count' => count($attempts)]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get all scores for a quiz (instructor gradebook)
 */
function getQuizScores() {
    $quizId = $_GET['quiz_id'] ?? 0;

    if (!$quizId) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    try {
        $scores = db()->fetchAll(
            "SELECT sqa.attempt_id, sqa.attempt_number, sqa.total_points, sqa.earned_points,
                    sqa.percentage, sqa.passed, sqa.completed_at,
                    COALESCE(sqa.tab_switch_count, 0) AS tab_switch_count,
                    u.first_name, u.last_name, u.student_id
             FROM student_quiz_attempts sqa
             JOIN users u ON sqa.user_student_id = u.users_id
             WHERE sqa.quiz_id = ? AND sqa.status = 'completed'
             ORDER BY u.last_name, u.first_name, sqa.attempt_number",
            [$quizId]
        );
        echo json_encode(['success' => true, 'data' => $scores]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

// ─── Essay/Subjective Grading Endpoints ─────────────────────

/**
 * Get attempts with pending essay grades for instructor
 */
function getPendingGrading() {
    Auth::requireRole('instructor');
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? '';

    $where = '';
    $params = [$userId];
    if ($subjectId) {
        $where = 'AND q.subject_id = ?';
        $params[] = $subjectId;
    }

    $attempts = db()->fetchAll(
        "SELECT sqa.attempt_id, sqa.quiz_id, sqa.earned_points, sqa.total_points, sqa.percentage,
                sqa.completed_at, sqa.has_pending_grades, COALESCE(sqa.tab_switch_count, 0) AS tab_switch_count,
                COALESCE(NULLIF(TRIM(q.quiz_title),''), '(Untitled Quiz)') AS quiz_title,
                COALESCE(NULLIF(TRIM(s.subject_code),''), '—') AS subject_code,
                s.subject_name,
                u.first_name, u.last_name, u.student_id,
                (SELECT COUNT(*) FROM student_quiz_answers a
                 JOIN questions q2 ON a.questions_id = q2.questions_id
                 WHERE a.attempt_id = sqa.attempt_id
                 AND q2.question_type IN ('essay','short_answer','fill_blank','fill_in_the_blank')
                 AND a.grading_status IN ('pending','auto_graded')
                 AND TRIM(COALESCE(a.answer_text,'')) != '') as pending_count,
                (SELECT COUNT(*) FROM student_quiz_answers a
                 JOIN questions q2 ON a.questions_id = q2.questions_id
                 WHERE a.attempt_id = sqa.attempt_id
                 AND q2.question_type IN ('essay','short_answer','fill_blank','fill_in_the_blank')
                 AND a.grading_status = 'graded') as graded_count
         FROM student_quiz_attempts sqa
         JOIN quiz q ON sqa.quiz_id = q.quiz_id
         JOIN subject s ON q.subject_id = s.subject_id
         JOIN users u ON sqa.user_student_id = u.users_id
         WHERE q.subject_id IN (
             SELECT DISTINCT so.subject_id FROM subject_offered so
             WHERE so.user_teacher_id = ?
         ) $where
         AND sqa.status = 'completed'
         AND (SELECT COUNT(*) FROM student_quiz_answers a
              JOIN questions q2 ON a.questions_id = q2.questions_id
              WHERE a.attempt_id = sqa.attempt_id
              AND q2.question_type IN ('essay','short_answer','fill_blank','fill_in_the_blank')
              AND TRIM(COALESCE(a.answer_text,'')) != '') > 0
         ORDER BY sqa.completed_at DESC",
        $params
    );
    echo json_encode(['success' => true, 'data' => $attempts ?: []]);
}

/**
 * Get full attempt details with all answers for grading
 */
function getAttemptAnswers() {
    Auth::requireRole('instructor');
    $attemptId = (int)($_GET['attempt_id'] ?? 0);
    if (!$attemptId) {
        echo json_encode(['success' => false, 'message' => 'Attempt ID required']);
        return;
    }

    $attempt = db()->fetchOne(
        "SELECT sqa.*, q.quiz_title, q.passing_rate, s.subject_code,
                u.first_name, u.last_name, u.student_id
         FROM student_quiz_attempts sqa
         JOIN quiz q ON sqa.quiz_id = q.quiz_id
         JOIN subject s ON q.subject_id = s.subject_id
         JOIN users u ON sqa.user_student_id = u.users_id
         WHERE sqa.attempt_id = ?",
        [$attemptId]
    );
    if (!$attempt) {
        echo json_encode(['success' => false, 'message' => 'Attempt not found']);
        return;
    }

    $answers = db()->fetchAll(
        "SELECT a.*, a.student_quiz_answer_id AS answer_id,
                q.question_text, q.question_type, q.points as max_points,
                (SELECT option_text FROM question_option WHERE option_id = a.selected_option_id LIMIT 1) as selected_option_text,
                (SELECT option_text FROM question_option WHERE quiz_question_id = q.questions_id AND is_correct = 1 LIMIT 1) as correct_answer_text
         FROM student_quiz_answers a
         JOIN questions q ON a.questions_id = q.questions_id
         WHERE a.attempt_id = ?
         ORDER BY q.question_order, q.questions_id",
        [$attemptId]
    );

    echo json_encode(['success' => true, 'data' => ['attempt' => $attempt, 'answers' => $answers ?: []]]);
}

/**
 * Grade a single answer (essay/short answer)
 */
function gradeAnswer() {
    Auth::requireRole('instructor');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $answerId = (int)($data['answer_id'] ?? 0);
    $pointsEarned = (float)($data['points_earned'] ?? 0);
    $feedback = trim($data['feedback'] ?? '');

    if (!$answerId) {
        echo json_encode(['success' => false, 'message' => 'Answer ID required']);
        return;
    }

    try {
        pdo()->prepare(
            "UPDATE student_quiz_answers
             SET points_earned = ?, grading_status = 'graded', grader_feedback = ?,
                 graded_by = ?, graded_at = NOW()
             WHERE student_quiz_answer_id = ?"
        )->execute([$pointsEarned, $feedback ?: null, Auth::id(), $answerId]);

        echo json_encode(['success' => true, 'message' => 'Answer graded']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to grade answer']);
    }
}

/**
 * Finalize grading: recalculate attempt score after all essays graded
 */
function finalizeGrading() {
    Auth::requireRole('instructor');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $attemptId = (int)($data['attempt_id'] ?? 0);
    if (!$attemptId) {
        echo json_encode(['success' => false, 'message' => 'Attempt ID required']);
        return;
    }

    try {
        // Recalculate total earned points
        $totals = db()->fetchOne(
            "SELECT SUM(points_earned) as earned FROM student_quiz_answers WHERE attempt_id = ?",
            [$attemptId]
        );
        $earnedPoints = (float)($totals['earned'] ?? 0);

        $attempt = db()->fetchOne(
            "SELECT sqa.*, q.passing_rate, q.user_teacher_id, sqa.user_student_id, sqa.quiz_id
             FROM student_quiz_attempts sqa
             JOIN quiz q ON sqa.quiz_id = q.quiz_id
             WHERE sqa.attempt_id = ?",
            [$attemptId]
        );
        if (!$attempt) {
            echo json_encode(['success' => false, 'message' => 'Attempt not found']);
            return;
        }

        $totalPoints = (int)$attempt['total_points'];
        $percentage = $totalPoints > 0 ? ($earnedPoints / $totalPoints) * 100 : 0;
        $passed = $percentage >= $attempt['passing_rate'];

        pdo()->prepare(
            "UPDATE student_quiz_attempts
             SET earned_points = ?, percentage = ?, passed = ?, has_pending_grades = 0
             WHERE attempt_id = ?"
        )->execute([$earnedPoints, round($percentage, 2), $passed ? 1 : 0, $attemptId]);

        echo json_encode([
            'success' => true,
            'message' => 'Grading finalized',
            'data' => ['percentage' => round($percentage, 1), 'passed' => $passed, 'earned_points' => $earnedPoints]
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to finalize grading']);
    }
}

// ── Trigger AI grading for a single answer (instructor-initiated) ────────────

function aiGradeAnswerById() {
    Auth::requireRole('instructor');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data     = json_decode(file_get_contents('php://input'), true);
    $answerId = (int)($data['answer_id'] ?? 0);
    if (!$answerId) {
        echo json_encode(['success' => false, 'message' => 'answer_id required']);
        return;
    }

    // Fetch the answer row + question details
    // NOTE: expected answer lives in question_option (is_correct=1) via quiz_question_id FK
    $row = db()->fetchOne(
        "SELECT a.student_quiz_answer_id, a.answer_text, a.max_points, a.grading_status,
                q.question_text, q.question_type,
                (SELECT option_text FROM question_option
                 WHERE quiz_question_id = q.questions_id AND is_correct = 1 LIMIT 1) as expected_answer
         FROM student_quiz_answers a
         JOIN questions q ON a.questions_id = q.questions_id
         WHERE a.student_quiz_answer_id = ?",
        [$answerId]
    );

    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'Answer not found']);
        return;
    }

    $answerText  = trim($row['answer_text'] ?? '');
    $questionText = $row['question_text'] ?? '';
    $expected    = $row['expected_answer'] ?? '';
    $maxPoints   = (float)($row['max_points'] ?? 1);
    $qType       = $row['question_type'] ?? 'essay';

    if (empty($answerText)) {
        echo json_encode(['success' => false, 'message' => 'Student left this question blank']);
        return;
    }

    $result = aiGradeAnswer($questionText, $expected, $answerText, $maxPoints, $qType);

    if ($result['status'] === 'pending') {
        // AI call failed (no API key, network error, etc.)
        echo json_encode(['success' => false, 'message' => 'AI grading unavailable. Check that a Groq API key is configured in Settings.']);
        return;
    }

    // Save the AI result
    try {
        pdo()->prepare(
            "UPDATE student_quiz_answers
             SET points_earned = ?, grading_status = 'auto_graded', grader_feedback = ?,
                 graded_by = NULL, graded_at = NOW()
             WHERE student_quiz_answer_id = ?"
        )->execute([$result['score'], $result['feedback'] ?: null, $answerId]);

        echo json_encode([
            'success'  => true,
            'score'    => $result['score'],
            'feedback' => $result['feedback'],
            'max'      => $maxPoints,
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to save AI grade']);
    }
}

// ── AI-powered grading for essay / short_answer / fill_blank ────────────────

function aiGradeAnswer($questionText, $expectedAnswer, $studentAnswer, $maxPoints, $questionType) {
    $fallback = ['score' => 0, 'feedback' => '', 'status' => 'pending'];

    $keySetting = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'groq_api_key'");
    if (!$keySetting || empty($keySetting['setting_value'])) return $fallback;
    $apiKey = $keySetting['setting_value'];

    $model = 'llama-3.3-70b-versatile';
    $modelSetting = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'ai_model'");
    if ($modelSetting && !empty($modelSetting['setting_value'])) {
        $model = $modelSetting['setting_value'];
    }

    $studentText = trim($studentAnswer);

    // Hard rule: blank answer — no need to call AI
    if (empty($studentText)) {
        return ['score' => 0, 'feedback' => 'No answer was provided.', 'status' => 'auto_graded'];
    }

    // Hard rule: clearly off (single random word / pure gibberish < 4 chars for essay)
    if ($questionType === 'essay' && strlen($studentText) < 8) {
        return ['score' => 0, 'feedback' => 'Answer is too brief to evaluate. Please write a complete response.', 'status' => 'auto_graded'];
    }

    // ── Type-specific scoring context ──────────────────────────
    if ($questionType === 'essay') {
        $typeContext = <<<TXT
ESSAY — reward understanding expressed in any form. Award credit for:
  • Correctly identifying the main concept or idea (even simply stated)
  • Relevant supporting points, examples, or explanations
  • Accurate paraphrasing of key terms
Partial credit: award proportionally for each key concept the student covers.
A short but accurate answer can earn significant credit — brevity ≠ wrong.
TXT;
    } elseif ($questionType === 'short_answer') {
        $typeContext = <<<TXT
SHORT ANSWER — award full credit if the core concept is correct, even if briefly stated.
Accept synonyms and informal phrasing. Deduct only if the student's answer is factually wrong or entirely off-topic.
TXT;
    } elseif ($questionType === 'fill_blank' || $questionType === 'fill_in_the_blank') {
        $typeContext = <<<TXT
FILL IN THE BLANK — accept the exact answer OR clear synonyms / alternate correct phrasings.
Minor spelling errors that don't change the meaning should still receive credit.
TXT;
    } else {
        $typeContext = "Grade proportionally based on correctness and relevance. Partial credit for partially correct responses.";
    }

    $referenceBlock = !empty($expectedAnswer)
        ? "REFERENCE ANSWER (the key concepts / facts the student should cover):\n\"{$expectedAnswer}\""
        : "No reference answer provided. Use your subject knowledge to judge whether the student's answer correctly addresses the question.";

    $prompt = <<<PROMPT
You are an experienced, fair educational grader with deep subject knowledge. Your job is to assess a student's understanding — not their writing style.

GOLDEN RULE: A simple, correct answer earns full credit. A long but wrong answer earns nothing.

━━━━━━━━━━━━━━━━━━━━━━
QUESTION:
{$questionText}

{$referenceBlock}

STUDENT'S ANSWER:
"{$studentText}"

MAXIMUM SCORE: {$maxPoints} points
━━━━━━━━━━━━━━━━━━━━━━

QUESTION TYPE GUIDANCE:
{$typeContext}

━━━━ GRADING METHOD (think through each step) ━━━━

STEP 1 — Extract key concepts:
  List the 2–4 main facts/ideas/concepts the reference answer covers.
  (If no reference answer, use the question itself to identify what must be addressed.)

STEP 2 — Match student answer to each concept:
  For each concept, ask: Did the student express this idea correctly?
  ACCEPT: exact match · synonym · paraphrase · simplified but accurate version
  REJECT: factually wrong · completely unrelated · random filler text

STEP 3 — Compute score:
  score = (number of concepts correctly covered / total concepts) × {$maxPoints}
  Round to nearest 0.5. Minimum 0, maximum {$maxPoints}.

STEP 4 — Write feedback (1–2 sentences):
  • If full credit: confirm what the student got right.
  • If partial: name what was correct AND what key concept(s) were missing.
  • If zero: explain briefly why the answer did not address the question.
  Tone: constructive and educational, not harsh.

━━━━ IMPORTANT RULES ━━━━
✅ Reward correct understanding even if expressed simply or informally
✅ Accept synonyms, paraphrasing, or alternate correct wording
✅ Give partial credit — don't make it all-or-nothing unless the answer is completely wrong
❌ Do NOT penalize for grammar, spelling, or writing style
❌ Do NOT require the student to copy exact wording from the reference
❌ Do NOT give points for: completely off-topic answers, random words, "I don't know", pure filler

Respond ONLY with valid JSON — no extra text, no markdown:
{"score": <number 0 to {$maxPoints}>, "feedback": "<1-2 sentences>"}
PROMPT;

    $payload = [
        'model'    => $model,
        'messages' => [
            [
                'role'    => 'system',
                'content' => 'You are an expert educational grader. You evaluate student answers fairly and accurately — rewarding genuine understanding regardless of how simply it is expressed. You think through the key concepts step by step before scoring. You respond ONLY with valid JSON: {"score": number, "feedback": "string"}. No markdown, no explanation outside the JSON.'
            ],
            ['role' => 'user', 'content' => $prompt]
        ],
        'max_tokens'  => 350,
        'temperature' => 0.1
    ];

    require_once __DIR__ . '/helpers/GroqCurl.php';
    $ch = curl_init("https://api.groq.com/openai/v1/chat/completions");
    curl_setopt_array($ch, applyGroqCurlSsl([
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer $apiKey", 'Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 25,
    ]));
    $response = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    unset($ch); // curl_close() deprecated in PHP 8.5 — let destructor handle it

    if ($httpCode !== 200 || !$response) return $fallback;

    $data    = json_decode($response, true);
    $content = trim($data['choices'][0]['message']['content'] ?? '');

    // Strip markdown fences if model wraps the JSON
    $content = preg_replace('/^```(?:json)?\s*/i', '', $content);
    $content = preg_replace('/\s*```$/', '', $content);

    // Extract first JSON object in case there is surrounding text
    if (preg_match('/\{.*\}/s', $content, $m)) $content = $m[0];
    $result = json_decode($content, true);

    if (!$result || !array_key_exists('score', $result)) return $fallback;

    $score = max(0, min((float)$maxPoints, round(floatval($result['score']) * 2) / 2)); // round to 0.5
    return [
        'score'    => $score,
        'feedback' => isset($result['feedback']) ? trim($result['feedback']) : '',
        'status'   => 'auto_graded'
    ];
}