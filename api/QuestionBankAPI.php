<?php
/**
 * Question Bank API
 * Shared question repository — instructors can publish, browse, and copy questions
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/BankAccessHelper.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

Auth::requireRole('instructor');

// Auto-migrate: add lessons_id to question_bank if it doesn't exist yet
(function() {
    $exists = db()->fetchOne(
        "SELECT COUNT(*) AS cnt FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'question_bank' AND column_name = 'lessons_id'"
    )['cnt'] ?? 0;
    if (!$exists) {
        try {
            pdo()->exec("ALTER TABLE `question_bank` ADD COLUMN `lessons_id` INT NULL AFTER `subject_id`");
            pdo()->exec("ALTER TABLE `question_bank` ADD CONSTRAINT `fk_qbank_lesson`
                         FOREIGN KEY (`lessons_id`) REFERENCES `lessons`(`lessons_id`) ON DELETE SET NULL");
        } catch (PDOException $e) { /* already exists or FK conflict — safe to ignore */ }
    }
})();

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action
$_qbPerms = [
    'browse'     => 'question_bank.view',
    'my-bank'    => 'question_bank.view',
    'my-quizzes' => 'question_bank.view',
    'subjects'   => 'question_bank.view',
    'publish'    => 'question_bank.create',
    'copy'       => 'question_bank.create',
    'delete'     => 'question_bank.delete',
];
if (isset($_qbPerms[$action]) && !Auth::can($_qbPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_qbPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'browse':   browseBank();    break;
    case 'my-bank':  myBank();        break;
    case 'my-quizzes': myQuizzes();   break;
    case 'publish':  publishQuestion(); break;
    case 'copy':     copyQuestion();  break;
    case 'delete':   deleteQuestion(); break;
    case 'subjects': bankSubjects();   break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Browse all public questions (+ own private ones) ─────────────────────────

function browseBank() {
    $userId    = Auth::id();
    $search    = trim($_GET['search']    ?? '');
    $subjectId = (int)($_GET['subject_id'] ?? 0);
    $type      = trim($_GET['type']      ?? '');

    $handled = bankSubjectInClause($userId);
    if ($handled['sql'] === '0') {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    $where  = "qb.visibility = 'public' AND qb.subject_id IN ({$handled['sql']})";
    $params = $handled['params'];

    if ($search) {
        $where  .= " AND qb.question_text LIKE ?";
        $params[] = "%$search%";
    }
    if ($subjectId) {
        $where  .= " AND qb.subject_id = ?";
        $params[] = $subjectId;
    }
    if ($type) {
        $where  .= " AND qb.question_type = ?";
        $params[] = $type;
    }

    $questions = db()->fetchAll(
        "SELECT qb.qbank_id, qb.question_text, qb.question_type, qb.points,
                qb.subject_id, qb.lessons_id, qb.visibility, qb.copy_count, qb.created_at,
                s.subject_code, s.subject_name,
                l.lesson_title,
                u.first_name, u.last_name,
                (qb.created_by = ?) AS is_own
         FROM question_bank qb
         LEFT JOIN subject s ON qb.subject_id = s.subject_id
         LEFT JOIN lessons l ON qb.lessons_id = l.lessons_id
         JOIN users u ON qb.created_by = u.users_id
         WHERE $where
         ORDER BY qb.copy_count DESC, qb.created_at DESC",
        array_merge([$userId], $params)
    );

    // Attach options to each question
    foreach ($questions as &$q) {
        $q['options'] = db()->fetchAll(
            "SELECT option_text, is_correct, option_order
             FROM question_bank_options WHERE qbank_id = ? ORDER BY option_order",
            [$q['qbank_id']]
        );
    }

    echo json_encode(['success' => true, 'data' => $questions ?: []]);
}

// ─── My Bank: only own questions ──────────────────────────────────────────────

function myBank() {
    $userId = Auth::id();

    $questions = db()->fetchAll(
        "SELECT qb.qbank_id, qb.question_text, qb.question_type, qb.points,
                qb.subject_id, qb.lessons_id, qb.visibility, qb.copy_count, qb.created_at, qb.updated_at,
                s.subject_code, s.subject_name,
                l.lesson_title
         FROM question_bank qb
         LEFT JOIN subject s ON qb.subject_id = s.subject_id
         LEFT JOIN lessons l ON qb.lessons_id = l.lessons_id
         WHERE qb.created_by = ?
         ORDER BY qb.updated_at DESC",
        [$userId]
    );

    foreach ($questions as &$q) {
        $q['options'] = db()->fetchAll(
            "SELECT option_text, is_correct, option_order
             FROM question_bank_options WHERE qbank_id = ? ORDER BY option_order",
            [$q['qbank_id']]
        );
    }

    echo json_encode(['success' => true, 'data' => $questions ?: []]);
}

// ─── My Quizzes: for copy-to-quiz dropdown ────────────────────────────────────

function myQuizzes() {
    $userId = Auth::id();

    $quizzes = db()->fetchAll(
        "SELECT q.quiz_id, q.quiz_title,
                s.subject_code, s.subject_name
         FROM quiz q
         LEFT JOIN subject s ON q.subject_id = s.subject_id
         WHERE q.user_teacher_id = ?
         ORDER BY q.created_at DESC",
        [$userId]
    );

    echo json_encode(['success' => true, 'data' => $quizzes ?: []]);
}

// ─── Publish: create a new bank question ─────────────────────────────────────

function publishQuestion() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data    = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId  = Auth::id();

    $text = trim($data['question_text'] ?? '');
    if (!$text) {
        echo json_encode(['success' => false, 'message' => 'Question text is required']);
        return;
    }

    $type    = in_array($data['question_type'] ?? '', ['multiple_choice','true_false','short_answer','essay'])
               ? $data['question_type'] : 'multiple_choice';
    $points  = max(1, (int)($data['points'] ?? 1));
    $subjectId  = !empty($data['subject_id'])  ? (int)$data['subject_id']  : null;
    $lessonsId  = !empty($data['lessons_id'])  ? (int)$data['lessons_id']  : null;
    $visibility = in_array($data['visibility'] ?? 'public', ['public','private'])
                  ? $data['visibility'] : 'public';
    $options = $data['options'] ?? [];

    // Validate options for MC/TF
    if (in_array($type, ['multiple_choice','true_false'])) {
        $hasCorrect = false;
        foreach ($options as $opt) {
            if (!empty($opt['is_correct'])) { $hasCorrect = true; break; }
        }
        if (empty($options) || !$hasCorrect) {
            echo json_encode(['success' => false, 'message' => 'Please add at least one option and mark the correct answer.']);
            return;
        }
    }

    try {
        $pdo = pdo();
        $pdo->prepare(
            "INSERT INTO question_bank (question_text, question_type, points, subject_id, lessons_id, created_by, visibility)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )->execute([$text, $type, $points, $subjectId, $lessonsId, $userId, $visibility]);

        $qbankId = $pdo->lastInsertId();

        foreach ($options as $i => $opt) {
            $optText = trim($opt['option_text'] ?? '');
            if (!$optText) continue;
            $pdo->prepare(
                "INSERT INTO question_bank_options (qbank_id, option_text, is_correct, option_order)
                 VALUES (?, ?, ?, ?)"
            )->execute([$qbankId, $optText, !empty($opt['is_correct']) ? 1 : 0, $i + 1]);
        }

        echo json_encode(['success' => true, 'message' => 'Question published to bank', 'qbank_id' => $qbankId]);
    } catch (PDOException $e) {
        error_log('QuestionBank publish: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to publish question']);
    }
}

// ─── Copy: duplicate a bank question into a quiz ──────────────────────────────

function copyQuestion() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data    = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId  = Auth::id();
    $qbankId = (int)($data['qbank_id'] ?? 0);
    $quizId  = (int)($data['quiz_id']  ?? 0);

    if (!$qbankId || !$quizId) {
        echo json_encode(['success' => false, 'message' => 'qbank_id and quiz_id are required']);
        return;
    }

    $bankQ = db()->fetchOne("SELECT * FROM question_bank WHERE qbank_id = ?", [$qbankId]);
    if (!$bankQ || !canAccessBankItem($userId, $bankQ['created_by'], $bankQ['visibility'], $bankQ['subject_id'])) {
        echo json_encode(['success' => false, 'message' => 'Question not found or not shared for your subjects']);
        return;
    }

    // Verify instructor owns the quiz
    $quiz = db()->fetchOne(
        "SELECT quiz_id FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?",
        [$quizId, $userId]
    );
    if (!$quiz) {
        echo json_encode(['success' => false, 'message' => 'Quiz not found or not yours']);
        return;
    }

    try {
        $pdo = pdo();

        // Get next question order for this quiz
        $maxOrder = db()->fetchOne(
            "SELECT COALESCE(MAX(q.question_order), 0) + 1 AS next_order
             FROM quiz_questions qq JOIN questions q ON qq.questions_id = q.questions_id
             WHERE qq.quiz_id = ?",
            [$quizId]
        )['next_order'] ?? 1;

        // Insert into questions master table
        $pdo->prepare(
            "INSERT INTO questions (question_text, question_type, points, question_order, users_id, lessons_id)
             VALUES (?, ?, ?, ?, ?, NULL)"
        )->execute([
            $bankQ['question_text'],
            $bankQ['question_type'],
            $bankQ['points'],
            $maxOrder,
            $userId
        ]);
        $newQuestionId = $pdo->lastInsertId();

        // Copy options
        $options = db()->fetchAll(
            "SELECT option_text, is_correct, option_order FROM question_bank_options WHERE qbank_id = ? ORDER BY option_order",
            [$qbankId]
        );
        foreach ($options as $opt) {
            $pdo->prepare(
                "INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number)
                 VALUES (?, ?, ?, ?)"
            )->execute([$newQuestionId, $opt['option_text'], $opt['is_correct'], $opt['option_order']]);
        }

        // Link to quiz
        $pdo->prepare(
            "INSERT INTO quiz_questions (quiz_id, questions_id) VALUES (?, ?)"
        )->execute([$quizId, $newQuestionId]);

        // Increment copy count
        $pdo->prepare("UPDATE question_bank SET copy_count = copy_count + 1 WHERE qbank_id = ?")
            ->execute([$qbankId]);

        echo json_encode([
            'success'     => true,
            'message'     => 'Question copied to your quiz',
            'question_id' => $newQuestionId
        ]);
    } catch (PDOException $e) {
        error_log('QuestionBank copy: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to copy question']);
    }
}

// ─── Delete: remove own bank question ────────────────────────────────────────

function deleteQuestion() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data    = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId  = Auth::id();
    $qbankId = (int)($data['qbank_id'] ?? 0);

    if (!$qbankId) {
        echo json_encode(['success' => false, 'message' => 'qbank_id required']);
        return;
    }

    $q = db()->fetchOne(
        "SELECT qbank_id FROM question_bank WHERE qbank_id = ? AND created_by = ?",
        [$qbankId, $userId]
    );
    if (!$q) {
        echo json_encode(['success' => false, 'message' => 'Question not found or not yours']);
        return;
    }

    try {
        pdo()->prepare("DELETE FROM question_bank WHERE qbank_id = ?")->execute([$qbankId]);
        echo json_encode(['success' => true, 'message' => 'Question removed from bank']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to delete question']);
    }
}

// ─── Subjects: distinct subjects visible in question bank ─────────────────────

function bankSubjects() {
    $userId = Auth::id();
    $handled = bankSubjectInClause($userId);
    if ($handled['sql'] === '0') {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }
    $subjects = db()->fetchAll(
        "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name
         FROM question_bank qb
         JOIN subject s ON qb.subject_id = s.subject_id
         WHERE qb.visibility = 'public' AND qb.subject_id IN ({$handled['sql']})
         ORDER BY s.subject_code",
        $handled['params']
    );
    echo json_encode(['success' => true, 'data' => $subjects ?: []]);
}
