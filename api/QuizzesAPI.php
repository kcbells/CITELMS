<?php
/**
 * ============================================================
 * CIT-LMS Quizzes API
 * ============================================================
 * Endpoints:
 *   GET ?action=list&subject_id=X  - Get quizzes for subject
 *   GET ?action=get&id=X           - Get single quiz details
 *   GET ?action=questions&id=X     - Get quiz questions (for taking)
 * ============================================================
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/QuizSectionHelper.php';
require_once __DIR__ . '/helpers/GradingPeriodHelper.php';
require_once __DIR__ . '/helpers/NotificationEmailHelper.php';
require_once __DIR__ . '/helpers/BankAccessHelper.php';
require_once __DIR__ . '/helpers/QuizProctorHelper.php';

header('Content-Type: application/json');
ini_set('display_errors', '0');

ensureQuizBehaviorColumns();
ensureQuizSectionTable();
ensureQuizScheduleColumns();
ensureGradingPeriodColumns();

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action
$_quizPerms = [
    'list'            => 'quizzes.view',
    'get'             => 'quizzes.view',
    'questions'       => 'quizzes.view',
    'instructor-list' => 'quizzes.view',
    'list-questions'  => 'quizzes.view',
    'create'          => 'quizzes.create',
    'update'          => 'quizzes.edit',
    'add-question'    => 'quizzes.edit',
    'update-question' => 'quizzes.edit',
    'delete'          => 'quizzes.delete',
    'delete-question' => 'quizzes.delete',
    'set-status'      => 'quizzes.edit',
    'browse-shared'   => 'quizzes.view',
    'shared-preview'  => 'quizzes.view',
    'copy-shared'     => 'quizzes.create',
    'shared-subjects' => 'quizzes.view',
];
if (isset($_quizPerms[$action]) && !Auth::can($_quizPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_quizPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'list':
        getQuizzes();
        break;
    case 'by-lesson':
        getQuizzesByLesson();
        break;
    case 'get':
        getQuiz();
        break;
    case 'questions':
        getQuestions();
        break;
    case 'instructor-list':
        getInstructorQuizzes();
        break;
    case 'create':
        createQuiz();
        break;
    case 'update':
        updateQuiz();
        break;
    case 'delete':
        deleteQuiz();
        break;
    case 'set-status':
        setQuizStatus();
        break;
    case 'list-questions':
        listQuestionsForInstructor();
        break;
    case 'add-question':
        addQuestion();
        break;
    case 'update-question':
        updateQuestion();
        break;
    case 'delete-question':
        deleteQuestion();
        break;
    case 'browse-shared':
        browseSharedQuizzes();
        break;
    case 'shared-preview':
        sharedQuizPreview();
        break;
    case 'copy-shared':
        copySharedQuiz();
        break;
    case 'shared-subjects':
        sharedQuizSubjects();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Get quizzes for a subject
 */
function getQuizzes() {
    $subjectOfferingId = $_GET['subject_id'] ?? 0;
    $userId = Auth::id();
    
    if (!$subjectOfferingId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Subject ID required']);
        return;
    }
    
    try {
        $quizzes = db()->fetchAll(
            "SELECT
                q.quiz_id,
                q.quiz_title,
                q.quiz_description,
                q.time_limit,
                q.passing_rate,
                q.max_attempts,
                q.due_date,
                q.created_at,
                (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.quiz_id) as question_count,
                (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ?) as attempts_used,
                (SELECT MAX(percentage) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ?) as best_score,
                (SELECT attempt_id FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ? ORDER BY percentage DESC LIMIT 1) as best_attempt_id
            FROM quiz q
            WHERE q.subject_id = ? AND " . quizVisibleToStudentsSql('q') . "
            ORDER BY q.due_date ASC, q.created_at ASC",
            [$userId, $userId, $userId, $subjectOfferingId]
        );
        
        // Add status to each quiz
        foreach ($quizzes as &$quiz) {
            $now = time();
            $dueDate = $quiz['due_date'] ? strtotime($quiz['due_date']) : null;
            $isOverdue = $dueDate && $now > $dueDate;
            $hasPassed = $quiz['best_score'] !== null && $quiz['best_score'] >= $quiz['passing_rate'];

            $quiz['passed'] = $hasPassed ? 1 : 0;
            if ($hasPassed) {
                $quiz['status'] = 'passed';
            } elseif ($isOverdue) {
                $quiz['status'] = 'overdue';
            } elseif ($quiz['attempts_used'] > 0) {
                $quiz['status'] = 'attempted';
            } else {
                $quiz['status'] = 'available';
            }

            $quiz['quiz_status'] = $quiz['status'];
            enrichQuizAvailability($quiz);
        }
        unset($quiz);
        
        echo json_encode([
            'success' => true,
            'data' => $quizzes,
            'count' => count($quizzes)
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get published quizzes linked to a specific lesson (via quiz_lessons junction)
 */
function getQuizzesByLesson() {
    $lessonId = (int)($_GET['lesson_id'] ?? 0);
    $userId   = Auth::id();

    if (!$lessonId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'lesson_id required']);
        return;
    }

    try {
        $quizzes = db()->fetchAll(
            "SELECT
                q.quiz_id,
                q.quiz_title,
                q.quiz_description,
                q.time_limit,
                q.passing_rate,
                q.max_attempts,
                q.due_date,
                (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.quiz_id) as question_count,
                (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ?) as attempts_used,
                (SELECT MAX(percentage) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ?) as best_score
            FROM quiz q
            JOIN quiz_lessons ql ON ql.quiz_id = q.quiz_id
            WHERE ql.lessons_id = ? AND " . quizVisibleToStudentsSql('q') . "
            ORDER BY q.created_at ASC",
            [$userId, $userId, $lessonId]
        );

        foreach ($quizzes as &$quiz) {
            $now     = time();
            $due     = $quiz['due_date'] ? strtotime($quiz['due_date']) : null;
            $overdue = $due && $now > $due;
            $passed  = $quiz['best_score'] !== null && $quiz['best_score'] >= $quiz['passing_rate'];

            $quiz['passed'] = $passed ? 1 : 0;
            $quiz['status'] = $passed ? 'passed' : ($overdue ? 'overdue' : ($quiz['attempts_used'] > 0 ? 'attempted' : 'available'));
            $quiz['quiz_status'] = $quiz['status'];
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
 * Get single quiz details
 */
function getQuiz() {
    $quizId = $_GET['id'] ?? 0;
    $userId = Auth::id();
    
    if (!$quizId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Quiz ID required']);
        return;
    }
    
    try {
        $quiz = db()->fetchOne(
            "SELECT
                q.*,
                s.subject_code,
                s.subject_name,
                (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.quiz_id) as question_count,
                (SELECT SUM(qs.points) FROM quiz_questions qq2 JOIN questions qs ON qq2.questions_id = qs.questions_id WHERE qq2.quiz_id = q.quiz_id) as total_points,
                (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ? AND status = 'completed') as attempts_used,
                (SELECT MAX(sqa.percentage) FROM student_quiz_attempts sqa WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') as best_score,
                (SELECT sqa.passed FROM student_quiz_attempts sqa WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed' ORDER BY sqa.percentage DESC LIMIT 1) as passed
             FROM quiz q
             JOIN subject s ON q.subject_id = s.subject_id
             JOIN subject_offered so ON so.subject_id = s.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             WHERE q.quiz_id = ? AND ss.user_student_id = ? AND ss.status = 'enrolled'
               AND " . quizPublishedSql('q'),
            [$userId, $userId, $userId, $quizId, $userId]
        );
        
        if (!$quiz) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Quiz not found']);
            return;
        }

        if ($quiz['passed']) {
            $quiz['quiz_status'] = 'passed';
        } elseif ((int)$quiz['attempts_used'] > 0 && quizAttemptsExhausted($quiz, (int)$quiz['attempts_used'])) {
            $quiz['quiz_status'] = 'exhausted';
        } elseif ((int)$quiz['attempts_used'] > 0) {
            $quiz['quiz_status'] = 'attempted';
        } elseif (!isQuizAvailableNow($quiz)) {
            $quiz['quiz_status'] = 'scheduled';
        } else {
            $quiz['quiz_status'] = 'available';
        }
        enrichQuizAvailability($quiz);
        
        echo json_encode([
            'success' => true,
            'data' => $quiz
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Get quiz questions for taking (without correct answers)
 */
function getQuestions() {
    $quizId = $_GET['id'] ?? 0;
    $userId = Auth::id();
    
    if (!$quizId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Quiz ID required']);
        return;
    }
    
    try {
        // Verify quiz exists and student is enrolled
        $quiz = db()->fetchOne(
            "SELECT q.*, ss.student_subject_id, s.subject_code, s.subject_name
             FROM quiz q
             JOIN subject s ON s.subject_id = q.subject_id
             JOIN subject_offered so ON so.subject_id = q.subject_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             WHERE q.quiz_id = ? AND ss.user_student_id = ? AND ss.status = 'enrolled' AND " . quizVisibleToStudentsSql('q'),
            [$quizId, $userId]
        );
        
        if (!$quiz) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Quiz not found or not enrolled']);
            return;
        }

        $existingLock = getQuizProctorLockId();
        if ($existingLock > 0 && (int)$existingLock !== (int)$quizId) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'You already have a quiz in progress. Finish it before starting another one.'
            ]);
            return;
        }

        $quizType = $quiz['quiz_type'] ?? 'graded';
        if (isQuizProctoredType($quizType)) {
            setQuizProctorLock((int)$quizId);
        } else {
            clearQuizProctorLock();
        }
        
        $attemptCount = (int)(db()->fetchOne(
            "SELECT COUNT(*) as count FROM student_quiz_attempts
             WHERE quiz_id = ? AND user_student_id = ? AND status = 'completed'",
            [$quizId, $userId]
        )['count'] ?? 0);

        if (quizAttemptsExhausted($quiz, $attemptCount)) {
            http_response_code(403);
            $limit = quizAttemptLimit($quiz);
            echo json_encode([
                'success' => false,
                'message' => "You have used all {$limit} attempt(s) for this quiz."
            ]);
            return;
        }
        
        // Get questions (shuffle if enabled)
        $orderBy = !empty($quiz['is_randomized']) ? "RAND()" : "q.question_order";
        $questions = db()->fetchAll(
            "SELECT q.questions_id, q.question_text, q.question_type, q.points
             FROM quiz_questions qq
             JOIN questions q ON qq.questions_id = q.questions_id
             WHERE qq.quiz_id = ?
             ORDER BY $orderBy",
            [$quizId]
        );

        // Get choices (without is_correct flag)
        foreach ($questions as &$q) {
            $choiceOrder = !empty($quiz['is_randomized']) ? "RAND()" : "order_number";
            $q['choices'] = db()->fetchAll(
                "SELECT option_id, option_text
                 FROM question_option
                 WHERE quiz_question_id = ?
                 ORDER BY $choiceOrder",
                [$q['questions_id']]
            );
        }
        
        echo json_encode([
            'success' => true,
            'data' => [
                'quiz' => [
                    'quiz_id'       => $quiz['quiz_id'],
                    'title'         => $quiz['quiz_title'],
                    'subject_id'    => $quiz['subject_id'],
                    'subject_code'  => $quiz['subject_code'] ?? '',
                    'subject_name'  => $quiz['subject_name'] ?? '',
                    'quiz_type'     => $quizType,
                    'is_proctored'  => isQuizProctoredType($quizType),
                    'time_limit'    => $quiz['time_limit'],
                    'passing_rate'  => $quiz['passing_rate'],
                    'max_attempts'  => (int)($quiz['max_attempts'] ?? 0),
                    'attempts_used' => $attemptCount,
                    'attempts_remaining' => quizAttemptLimit($quiz) === null
                        ? null
                        : max(0, (int)quizAttemptLimit($quiz) - $attemptCount),
                    'is_randomized' => !empty($quiz['is_randomized']),
                    'one_at_a_time' => !empty($quiz['one_at_a_time']),
                ],
                'questions' => $questions
            ]
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

// ─── Instructor Quiz CRUD ─────────────────────────────────

function getInstructorQuizzes() {
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? '';
    $where = ''; $params = [$userId];
    if ($subjectId) { $where = 'AND q.subject_id = ?'; $params[] = $subjectId; }

    $quizzes = db()->fetchAll(
        "SELECT q.*, s.subject_code, s.subject_name,
            (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) as question_count,
            (SELECT COUNT(*) FROM student_quiz_attempts qa WHERE qa.quiz_id = q.quiz_id AND qa.status = 'completed') as attempt_count,
            (SELECT ROUND(AVG(qa.percentage),1) FROM student_quiz_attempts qa WHERE qa.quiz_id = q.quiz_id AND qa.status = 'completed') as avg_score
         FROM quiz q JOIN subject s ON q.subject_id = s.subject_id
         WHERE q.user_teacher_id = ? $where ORDER BY q.created_at DESC",
        $params
    );
    enrichQuizzesWithSections($quizzes);
    echo json_encode(['success' => true, 'data' => $quizzes]);
}

function createQuiz() {
    $d = json_decode(file_get_contents('php://input'), true) ?: [];
    $subjectId = (int)($d['subject_id'] ?? 0);
    $title = trim($d['quiz_title'] ?? '');
    if (!$subjectId || !$title) {
        echo json_encode(['success' => false, 'message' => 'Subject and title required']);
        return;
    }

    $userId = Auth::id();
    $teaches = db()->fetchOne(
        "SELECT 1 FROM subject_offered WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
        [$subjectId, $userId]
    );
    if (!$teaches) {
        echo json_encode(['success' => false, 'message' => 'You do not teach this subject']);
        return;
    }

    try {
        $pub = parseQuizPublishInput($d);

        $objGrade = normalizeObjectiveGradingMode($d['objective_grading_mode'] ?? 'auto');
        $subGrade = normalizeSubjectiveGradingMode($d['subjective_grading_mode'] ?? 'ai_auto');
        $gradingPeriod = normalizeGradingPeriod($d['grading_period'] ?? 'P1');

        pdo()->prepare(
            "INSERT INTO quiz (subject_id, user_teacher_id, quiz_title, quiz_description, time_limit, passing_rate,
             max_attempts, status, availability_start, due_date, is_randomized, one_at_a_time,
             objective_grading_mode, subjective_grading_mode, quiz_type, grading_period, total_points, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())"
        )->execute([
            $subjectId,
            $userId,
            $title,
            trim($d['quiz_description'] ?? ''),
             (int)($d['time_limit'] ?? 30),
            (int)($d['passing_rate'] ?? 60),
            parseQuizMaxAttempts($d),
            $pub['status'],
            $pub['availability_start'],
            $pub['due_date'],
            empty($d['is_randomized']) ? 0 : 1,
            empty($d['one_at_a_time']) ? 0 : 1,
            $objGrade,
            $subGrade,
            $d['quiz_type'] ?? 'graded',
            $gradingPeriod,
            0,
        ]);
        $quizId = (int)pdo()->lastInsertId();
        if (!$quizId) {
            throw new Exception('Insert did not return quiz_id');
        }

        if (array_key_exists('all_sections', $d) || array_key_exists('section_ids', $d)) {
            $allSections = !empty($d['all_sections']);
            $sectionIds = array_values(array_filter(array_map('intval', $d['section_ids'] ?? [])));
            applyQuizSectionTargeting($quizId, $allSections, $sectionIds);
        }

        $msg = 'Quiz created';
        if ($pub['publish_mode'] === 'now') {
            $msg = 'Quiz created and published to students';
            if ($pub['status'] === 'published') {
                NotificationEmailHelper::queueNewQuiz($quizId);
                NotificationEmailHelper::dispatchAfterPublish();
            }
        } elseif ($pub['publish_mode'] === 'scheduled') {
            $msg = 'Quiz scheduled — students will see it automatically at the chosen time';
        }

        echo json_encode([
            'success' => true,
            'message' => $msg,
            'data' => [
                'id' => $quizId,
                'quiz_id' => $quizId,
                'publish_mode' => $pub['publish_mode'],
                'availability_start' => $pub['availability_start'],
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    } catch (Throwable $e) {
        error_log('createQuiz: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create quiz. Please try again.']);
    }
}

function updateQuiz() {
    $d = json_decode(file_get_contents('php://input'), true);
    $id = (int)($d['quiz_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Quiz ID required']); return; }
    try {
        $pub = parseQuizPublishInput($d);
        $objGrade = normalizeObjectiveGradingMode($d['objective_grading_mode'] ?? 'auto');
        $subGrade = normalizeSubjectiveGradingMode($d['subjective_grading_mode'] ?? 'ai_auto');
        $gradingPeriod = normalizeGradingPeriod($d['grading_period'] ?? 'P1');

        pdo()->prepare(
            "UPDATE quiz SET quiz_title=?, quiz_description=?, time_limit=?, passing_rate=?, max_attempts=?,
             status=?, availability_start=?, due_date=?, is_randomized=?, one_at_a_time=?,
             objective_grading_mode=?, subjective_grading_mode=?, grading_period=?, updated_at=NOW()
             WHERE quiz_id=? AND user_teacher_id=?"
        )->execute([
            trim($d['quiz_title'] ?? ''),
            trim($d['quiz_description'] ?? ''),
            (int)($d['time_limit'] ?? 30),
            (int)($d['passing_rate'] ?? 60),
            parseQuizMaxAttempts($d),
            $pub['status'],
            $pub['availability_start'],
            $pub['due_date'],
            empty($d['is_randomized']) ? 0 : 1,
            empty($d['one_at_a_time']) ? 0 : 1,
            $objGrade,
            $subGrade,
            $gradingPeriod,
            $id,
            Auth::id(),
        ]);
        if (array_key_exists('all_sections', $d) || array_key_exists('section_ids', $d)) {
            $allSections = !empty($d['all_sections']);
            $sectionIds = array_values(array_filter(array_map('intval', $d['section_ids'] ?? [])));
            applyQuizSectionTargeting($id, $allSections, $sectionIds);
        }
        if ($pub['status'] === 'published' && $pub['publish_mode'] === 'now') {
            NotificationEmailHelper::queueNewQuiz($id);
            NotificationEmailHelper::dispatchAfterPublish();
        }
        echo json_encode(['success' => true, 'message' => 'Quiz updated']);
    } catch (InvalidArgumentException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed']);
    }
}

function setQuizStatus() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }
    $d = json_decode(file_get_contents('php://input'), true);
    $id = (int)($d['quiz_id'] ?? 0);
    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Quiz ID required']);
        return;
    }
    $status = (($d['status'] ?? '') === 'published') ? 'published' : 'draft';
    try {
        $owned = db()->fetchOne(
            "SELECT quiz_id FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?",
            [$id, Auth::id()]
        );
        if (!$owned) {
            echo json_encode(['success' => false, 'message' => 'Quiz not found or access denied']);
            return;
        }
        pdo()->prepare(
            "UPDATE quiz SET status = ?, availability_start = NULL, updated_at = NOW()
             WHERE quiz_id = ? AND user_teacher_id = ?"
        )->execute([$status, $id, Auth::id()]);
        if ($status === 'published') {
            NotificationEmailHelper::queueNewQuiz($id);
            NotificationEmailHelper::dispatchAfterPublish();
        }
        echo json_encode([
            'success' => true,
            'message' => $status === 'published' ? 'Quiz published' : 'Quiz saved as draft',
            'data' => ['status' => $status],
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to update status']);
    }
}

function deleteQuiz() {
    $d = json_decode(file_get_contents('php://input'), true);
    $id = (int)($d['quiz_id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Quiz ID required']); return; }
    $attempts = db()->fetchOne("SELECT COUNT(*) as c FROM student_quiz_attempts WHERE quiz_id = ?", [$id])['c'] ?? 0;
    if ($attempts > 0) { echo json_encode(['success' => false, 'message' => "Cannot delete quiz with $attempts attempt(s). Set to draft instead."]); return; }
    try {
        pdo()->prepare("DELETE FROM question_option WHERE quiz_question_id IN (SELECT questions_id FROM quiz_questions WHERE quiz_id = ?)")->execute([$id]);
        pdo()->prepare("DELETE FROM quiz_questions WHERE quiz_id = ?")->execute([$id]);
        pdo()->prepare("DELETE FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?")->execute([$id, Auth::id()]);
        echo json_encode(['success' => true, 'message' => 'Quiz deleted']);
    } catch (Exception $e) { echo json_encode(['success' => false, 'message' => 'Failed']); }
}

// ─── Instructor Question CRUD ────────────────────────────

function listQuestionsForInstructor() {
    $quizId = (int)($_GET['quiz_id'] ?? 0);
    if (!$quizId) { echo json_encode(['success' => false, 'message' => 'Quiz ID required']); return; }

    $quiz = db()->fetchOne("SELECT * FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?", [$quizId, Auth::id()]);
    if (!$quiz) { echo json_encode(['success' => false, 'message' => 'Quiz not found']); return; }

    $questions = db()->fetchAll(
        "SELECT q.questions_id, q.question_text, q.question_type, q.points, q.question_order
         FROM quiz_questions qq
         JOIN questions q ON qq.questions_id = q.questions_id
         WHERE qq.quiz_id = ?
         ORDER BY q.question_order",
        [$quizId]
    );

    foreach ($questions as &$q) {
        $q['options'] = db()->fetchAll(
            "SELECT option_id, option_text, is_correct, order_number
             FROM question_option WHERE quiz_question_id = ? ORDER BY order_number",
            [$q['questions_id']]
        );
    }

    echo json_encode(['success' => true, 'data' => ['quiz' => $quiz, 'questions' => $questions]]);
}

function addQuestion() {
    $d = json_decode(file_get_contents('php://input'), true);
    $quizId = (int)($d['quiz_id'] ?? 0);
    $text = trim($d['question_text'] ?? '');
    $type = $d['question_type'] ?? 'multiple_choice';
    $points = (int)($d['points'] ?? 1);
    $options = $d['options'] ?? [];

    if (!$quizId || !$text) { echo json_encode(['success' => false, 'message' => 'Quiz ID and question text required']); return; }

    $quiz = db()->fetchOne("SELECT * FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?", [$quizId, Auth::id()]);
    if (!$quiz) { echo json_encode(['success' => false, 'message' => 'Quiz not found']); return; }

    if (in_array($type, ['multiple_choice', 'true_false'])) {
        $hasCorrect = false;
        foreach ($options as $opt) { if (!empty($opt['is_correct'])) $hasCorrect = true; }
        if (!$hasCorrect) { echo json_encode(['success' => false, 'message' => 'Select at least one correct answer']); return; }
    }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $maxOrder = db()->fetchOne("SELECT MAX(q.question_order) as m FROM quiz_questions qq JOIN questions q ON qq.questions_id = q.questions_id WHERE qq.quiz_id = ?", [$quizId])['m'] ?? 0;

        $stmt = $pdo->prepare("INSERT INTO questions (question_text, question_type, points, question_order, users_id) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$text, $type, $points, $maxOrder + 1, Auth::id()]);
        $questionId = $pdo->lastInsertId();

        $stmt = $pdo->prepare("INSERT INTO quiz_questions (quiz_id, questions_id) VALUES (?, ?)");
        $stmt->execute([$quizId, $questionId]);

        foreach ($options as $i => $opt) {
            $optText = trim($opt['option_text'] ?? '');
            if ($optText === '') continue;
            $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, ?, ?)")
                ->execute([$questionId, $optText, !empty($opt['is_correct']) ? 1 : 0, $i + 1]);
        }

        if ($pdo->inTransaction()) $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Question added', 'data' => ['questions_id' => $questionId]]);
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Add question: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add question']);
    }
}

function updateQuestion() {
    $d = json_decode(file_get_contents('php://input'), true);
    $questionId = (int)($d['questions_id'] ?? 0);
    $text = trim($d['question_text'] ?? '');
    $type = $d['question_type'] ?? 'multiple_choice';
    $points = (int)($d['points'] ?? 1);
    $options = $d['options'] ?? [];

    if (!$questionId || !$text) { echo json_encode(['success' => false, 'message' => 'Question ID and text required']); return; }

    $quiz = db()->fetchOne("SELECT q.quiz_id FROM quiz q JOIN quiz_questions qq ON q.quiz_id = qq.quiz_id WHERE qq.questions_id = ? AND q.user_teacher_id = ?", [$questionId, Auth::id()]);
    if (!$quiz) { echo json_encode(['success' => false, 'message' => 'Question not found']); return; }

    if (in_array($type, ['multiple_choice', 'true_false'])) {
        $hasCorrect = false;
        foreach ($options as $opt) { if (!empty($opt['is_correct'])) $hasCorrect = true; }
        if (!$hasCorrect) { echo json_encode(['success' => false, 'message' => 'Select at least one correct answer']); return; }
    }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $pdo->prepare("UPDATE questions SET question_text=?, question_type=?, points=? WHERE questions_id=?")
            ->execute([$text, $type, $points, $questionId]);

        $pdo->prepare("DELETE FROM question_option WHERE quiz_question_id = ?")->execute([$questionId]);
        foreach ($options as $i => $opt) {
            $optText = trim($opt['option_text'] ?? '');
            if ($optText === '') continue;
            $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, ?, ?)")
                ->execute([$questionId, $optText, !empty($opt['is_correct']) ? 1 : 0, $i + 1]);
        }

        if ($pdo->inTransaction()) $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Question updated']);
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Failed to update question']);
    }
}

function deleteQuestion() {
    $d = json_decode(file_get_contents('php://input'), true);
    $questionId = (int)($d['questions_id'] ?? 0);
    if (!$questionId) { echo json_encode(['success' => false, 'message' => 'Question ID required']); return; }

    $quiz = db()->fetchOne("SELECT q.quiz_id FROM quiz q JOIN quiz_questions qq ON q.quiz_id = qq.quiz_id WHERE qq.questions_id = ? AND q.user_teacher_id = ?", [$questionId, Auth::id()]);
    if (!$quiz) { echo json_encode(['success' => false, 'message' => 'Question not found']); return; }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM question_option WHERE quiz_question_id = ?")->execute([$questionId]);
        $pdo->prepare("DELETE FROM quiz_questions WHERE questions_id = ?")->execute([$questionId]);
        $pdo->prepare("DELETE FROM questions WHERE questions_id = ?")->execute([$questionId]);
        if ($pdo->inTransaction()) $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Question deleted']);
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Failed to delete question']);
    }
}

function browseSharedQuizzes() {
    $userId = Auth::id();
    $search = trim($_GET['search'] ?? '');
    $subjectId = (int)($_GET['subject_id'] ?? 0);

    $handled = bankSubjectInClause($userId);
    if ($handled['sql'] === '0') {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    $where = "q.status = 'published' AND q.subject_id IN ({$handled['sql']}) AND q.user_teacher_id != ?";
    $params = array_merge($handled['params'], [$userId]);

    if ($search) {
        $where .= " AND (q.quiz_title LIKE ? OR q.quiz_description LIKE ?)";
        $like = "%$search%";
        $params[] = $like;
        $params[] = $like;
    }
    if ($subjectId) {
        $where .= " AND q.subject_id = ?";
        $params[] = $subjectId;
    }

    $quizzes = db()->fetchAll(
        "SELECT q.quiz_id, q.quiz_title, q.quiz_description, q.subject_id, q.time_limit, q.passing_rate,
                q.max_attempts, q.total_points, q.created_at,
                s.subject_code, s.subject_name,
                u.first_name, u.last_name,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) AS question_count
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         JOIN users u ON q.user_teacher_id = u.users_id
         WHERE $where
         ORDER BY q.created_at DESC",
        $params
    );

    enrichQuizzesWithSections($quizzes);
    echo json_encode(['success' => true, 'data' => $quizzes ?: []]);
}

function sharedQuizSubjects() {
    $userId = Auth::id();
    $handled = bankSubjectInClause($userId);
    if ($handled['sql'] === '0') {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }
    $subjects = db()->fetchAll(
        "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         WHERE q.status = 'published' AND q.subject_id IN ({$handled['sql']}) AND q.user_teacher_id != ?
         ORDER BY s.subject_code",
        array_merge($handled['params'], [$userId])
    );
    echo json_encode(['success' => true, 'data' => $subjects ?: []]);
}

function sharedQuizPreview() {
    $userId = Auth::id();
    $quizId = (int)($_GET['id'] ?? 0);
    if (!$quizId) {
        echo json_encode(['success' => false, 'message' => 'Quiz ID required']);
        return;
    }

    $quiz = db()->fetchOne(
        "SELECT q.quiz_id, q.quiz_title, q.quiz_description, q.subject_id, q.time_limit, q.passing_rate,
                q.max_attempts, q.total_points, q.quiz_type, q.status, q.availability_start, q.created_at,
                s.subject_code, s.subject_name,
                u.first_name, u.last_name
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         JOIN users u ON q.user_teacher_id = u.users_id
         WHERE q.quiz_id = ? AND q.status = 'published' AND q.user_teacher_id != ?",
        [$quizId, $userId]
    );

    if (!$quiz || !instructorTeachesSubject($userId, (int)$quiz['subject_id'])) {
        echo json_encode(['success' => false, 'message' => 'Quiz not available for preview']);
        return;
    }

    $questions = db()->fetchAll(
        "SELECT q.questions_id, q.question_text, q.question_type, q.points, q.question_order
         FROM quiz_questions qq
         JOIN questions q ON qq.questions_id = q.questions_id
         WHERE qq.quiz_id = ?
         ORDER BY q.question_order, q.questions_id",
        [$quizId]
    );

    foreach ($questions as &$q) {
        $q['choices'] = db()->fetchAll(
            "SELECT option_id, option_text, is_correct, order_number
             FROM question_option
             WHERE quiz_question_id = ?
             ORDER BY order_number",
            [$q['questions_id']]
        );
    }
    unset($q);

    echo json_encode([
        'success' => true,
        'data' => [
            'quiz' => $quiz,
            'questions' => $questions,
            'question_count' => count($questions),
        ],
    ]);
}

function copySharedQuiz() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = Auth::id();
    $quizId = (int)($data['quiz_id'] ?? 0);
    $subjectId = (int)($data['subject_id'] ?? 0);
    $questionIds = array_values(array_filter(array_map('intval', $data['question_ids'] ?? [])));

    if (!$quizId) {
        echo json_encode(['success' => false, 'message' => 'quiz_id required']);
        return;
    }

    $source = db()->fetchOne(
        "SELECT q.*, s.subject_code FROM quiz q JOIN subject s ON q.subject_id = s.subject_id
         WHERE q.quiz_id = ? AND q.status = 'published' AND q.user_teacher_id != ?",
        [$quizId, $userId]
    );
    if (!$source || !instructorTeachesSubject($userId, $source['subject_id'])) {
        echo json_encode(['success' => false, 'message' => 'Quiz not available for your subjects']);
        return;
    }

    $destSubjectId = $subjectId ?: (int)$source['subject_id'];
    if (!instructorTeachesSubject($userId, $destSubjectId)) {
        echo json_encode(['success' => false, 'message' => 'You do not teach the selected subject']);
        return;
    }

    ensureQuizSectionTable();
    $sourceSectionIds = getQuizSectionIds($quizId);

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $qSql = "SELECT q.questions_id, q.question_text, q.question_type, q.points, q.question_order
             FROM quiz_questions qq JOIN questions q ON qq.questions_id = q.questions_id
             WHERE qq.quiz_id = ?";
        $qParams = [$quizId];
        if (!empty($questionIds)) {
            $placeholders = implode(',', array_fill(0, count($questionIds), '?'));
            $qSql .= " AND q.questions_id IN ($placeholders)";
            $qParams = array_merge($qParams, $questionIds);
        }
        $qSql .= " ORDER BY q.question_order, q.questions_id";

        $questions = db()->fetchAll($qSql, $qParams);
        if (empty($questions)) {
            throw new InvalidArgumentException('No questions selected to copy');
        }

        $copiedPoints = array_sum(array_map(fn($q) => (int)$q['points'], $questions));
        $titleSuffix = empty($questionIds) ? ' (copied)' : ' (' . count($questions) . ' questions)';

        $pdo->prepare(
            "INSERT INTO quiz (user_teacher_id, subject_id, quiz_title, quiz_description, time_limit, passing_rate,
             max_attempts, total_points, status, is_randomized, one_at_a_time, quiz_type, grading_period, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, NOW(), NOW())"
        )->execute([
            $userId,
            $destSubjectId,
            $source['quiz_title'] . $titleSuffix,
            $source['quiz_description'],
            (int)$source['time_limit'],
            (int)$source['passing_rate'],
            (int)$source['max_attempts'],
            $copiedPoints,
            (int)$source['is_randomized'],
            (int)$source['one_at_a_time'],
            $source['quiz_type'] ?? 'graded',
            normalizeGradingPeriod($source['grading_period'] ?? 'P1'),
        ]);
        $newQuizId = (int)$pdo->lastInsertId();

        foreach ($questions as $q) {
            $pdo->prepare(
                "INSERT INTO questions (question_text, question_type, points, question_order, users_id)
                 VALUES (?, ?, ?, ?, ?)"
            )->execute([$q['question_text'], $q['question_type'], $q['points'], $q['question_order'], $userId]);
            $newQid = (int)$pdo->lastInsertId();

            $pdo->prepare("INSERT INTO quiz_questions (quiz_id, questions_id) VALUES (?, ?)")
                ->execute([$newQuizId, $newQid]);

            $opts = db()->fetchAll(
                "SELECT option_text, is_correct, order_number FROM question_option WHERE quiz_question_id = ? ORDER BY order_number",
                [$q['questions_id']]
            );
            foreach ($opts as $opt) {
                $pdo->prepare(
                    "INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, ?, ?)"
                )->execute([$newQid, $opt['option_text'], $opt['is_correct'], $opt['order_number']]);
            }
        }

        if ($pdo->inTransaction()) {
            $pdo->commit();
        }

        if (!empty($sourceSectionIds)) {
            applyQuizSectionTargeting($newQuizId, false, $sourceSectionIds);
        }

        $msg = empty($questionIds)
            ? 'Full quiz copied to your classes as a draft'
            : count($questions) . ' question(s) copied to a new draft quiz';

        echo json_encode([
            'success' => true,
            'message' => $msg,
            'data'    => [
                'quiz_id' => $newQuizId,
                'questions_copied' => count($questions),
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('copySharedQuiz: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to copy quiz']);
    }
}