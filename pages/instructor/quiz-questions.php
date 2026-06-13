<?php
/**
 * CIT-LMS Instructor - Quiz Questions Manager
 * Manage questions and options for a specific quiz
 */

// Prevent caching - MUST be before any output
header("Cache-Control: no-cache, no-store, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('instructor');

$userId = Auth::id();
$quizId = !empty($_GET['quiz_id']) ? (int)$_GET['quiz_id'] : null;
$pageTitle = 'Quiz Questions';
$currentPage = 'quizzes';
$preventCache = true;

// Redirect if no Quiz ID is provided
if (!$quizId) {
    header('Location: quizzes.php');
    exit;
}

// Fetch Quiz Details to verify ownership and get header info
$quiz = db()->fetchOne(
    "SELECT q.*, s.subject_code 
     FROM quiz q 
     JOIN subject s ON q.subject_id = s.subject_id 
     WHERE q.quiz_id = ? AND q.user_teacher_id = ?", 
    [$quizId, $userId]
);

if (!$quiz) {
    header('Location: quizzes.php');
    exit;
}

// Get lessons_id from quiz_lessons junction table
$linkedLesson = db()->fetchOne("SELECT lessons_id FROM quiz_lessons WHERE quiz_id = ? LIMIT 1", [$quizId]);
$quiz['lessons_id'] = $linkedLesson['lessons_id'] ?? null;

// Handle Form Submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 1. Add New Question Logic
    if (isset($_POST['add_question'])) {
        $text = trim($_POST['question_text'] ?? '');
        $type = $_POST['question_type'] ?? 'multiple_choice';
        $points = (int)($_POST['points'] ?? 1);

        // Handle different option fields based on question type
        if ($type === 'true_false') {
            $options = $_POST['options_tf'] ?? [];
            $correct = (int)($_POST['correct_option_tf'] ?? 0);
        } else {
            $options = $_POST['options'] ?? [];
            $correct = (int)($_POST['correct_option'] ?? 0);
        }

        if (!empty($text)) {
            // Check for duplicate question text in this quiz
            $duplicate = db()->fetchOne(
                "SELECT qq.quiz_questions_id
                 FROM quiz_questions qq
                 JOIN questions qs ON qq.questions_id = qs.questions_id
                 WHERE qq.quiz_id = ? AND qs.question_text = ?",
                [$quizId, $text]
            );

            if ($duplicate) {
                header("Location: quiz-questions.php?quiz_id=$quizId&error=duplicate&t=" . time());
                exit;
            }

            // Get the next question order number
            $maxOrder = db()->fetchOne(
                "SELECT COALESCE(MAX(qs.question_order), 0) as max_order
                 FROM quiz_questions qq
                 JOIN questions qs ON qq.questions_id = qs.questions_id
                 WHERE qq.quiz_id = ?",
                [$quizId]
            );
            $nextOrder = ($maxOrder['max_order'] ?? 0) + 1;

            // Insert into questions master table
            db()->execute(
                "INSERT INTO questions (question_text, question_type, points, question_order, users_id, lessons_id) VALUES (?, ?, ?, ?, ?, ?)",
                [$text, $type, $points, $nextOrder, $userId, $quiz['lessons_id']]
            );

            $qId = db()->lastInsertId();

            // Link question to quiz via quiz_questions junction table
            db()->execute(
                "INSERT INTO quiz_questions (quiz_id, questions_id, lessons_id) VALUES (?, ?, ?)",
                [$quizId, $qId, $quiz['lessons_id']]
            );

            // Insert the multiple choice options
            foreach ($options as $i => $opt) {
                if (!empty(trim($opt))) {
                    db()->execute(
                        "INSERT INTO question_option (questions_id, option_text, is_correct, option_order) VALUES (?, ?, ?, ?)",
                        [$qId, trim($opt), ($i == $correct ? 1 : 0), ($i + 1)]
                    );
                }
            }
            header("Location: quiz-questions.php?quiz_id=$quizId&added=1&t=" . time());
            exit;
        }
    }

    // 2. Delete Question Logic
    if (isset($_POST['delete_question'])) {
        $qId = (int)$_POST['delete_question'];

        // Order matters to avoid foreign key errors
        db()->execute("DELETE FROM question_option WHERE questions_id = ?", [$qId]);
        db()->execute("DELETE FROM quiz_questions WHERE questions_id = ? AND quiz_id = ?", [$qId, $quizId]);
        db()->execute("DELETE FROM questions WHERE questions_id = ?", [$qId]);

        // Re-sequence question orders to prevent gaps
        $remainingQuestions = db()->fetchAll(
            "SELECT qs.questions_id
             FROM quiz_questions qq
             JOIN questions qs ON qq.questions_id = qs.questions_id
             WHERE qq.quiz_id = ?
             ORDER BY qs.question_order ASC, qs.questions_id ASC",
            [$quizId]
        );
        foreach ($remainingQuestions as $index => $q) {
            db()->execute(
                "UPDATE questions SET question_order = ? WHERE questions_id = ?",
                [($index + 1), $q['questions_id']]
            );
        }

        header("Location: quiz-questions.php?quiz_id=$quizId&deleted=1&t=" . time());
        exit;
    }
}

// Fetch all existing questions with their options for this quiz
$questions = db()->fetchAll(
    "SELECT qs.* FROM quiz_questions qq
     JOIN questions qs ON qq.questions_id = qs.questions_id
     WHERE qq.quiz_id = ?
     ORDER BY qs.question_order ASC, qs.questions_id ASC",
    [$quizId]
);

foreach ($questions as &$q) {
    $q['options'] = db()->fetchAll("SELECT * FROM question_option WHERE questions_id = ? ORDER BY option_order ASC", [$q['questions_id']]);
}
unset($q); // CRITICAL: Destroy the reference to prevent bugs in subsequent loops

$totalPts = array_sum(array_column($questions, 'points'));

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/instructor_sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">
        
        <div class="welcome-section">
            <div class="welcome-text">
                <a href="quizzes.php" class="back-link">← Back to Quizzes</a>
                <h1><?= e($quiz['quiz_title']) ?></h1>
                <p><?= e($quiz['subject_code']) ?> • <?= count($questions) ?> Questions • <?= $totalPts ?> Total Points</p>
            </div>
            <div class="welcome-actions">
                <a href="quiz-edit.php?id=<?= $quizId ?>" class="btn-secondary">Quiz Settings</a>
            </div>
        </div>

        <?php if (isset($_GET['added'])): ?>
            <div class="alert alert-success">Question added successfully!</div>
        <?php endif; ?>

        <?php if (isset($_GET['deleted'])): ?>
            <div class="alert alert-success">Question has been removed.</div>
        <?php endif; ?>

        <?php if (isset($_GET['error']) && $_GET['error'] === 'duplicate'): ?>
            <div class="alert alert-error">⚠️ This question already exists in this quiz. Please enter a different question.</div>
        <?php endif; ?>

        <div class="q-manager-grid">
            
            <div class="form-side">
                <div class="panel sticky-panel">
                    <div class="panel-head">
                        <h3>➕ Add New Question</h3>
                    </div>
                    <form method="POST" class="panel-body">
                        <div class="form-group">
                            <label class="field-label">Question Text</label>
                            <textarea name="question_text" class="field-input" rows="3" placeholder="Enter the question here..." required></textarea>
                        </div>

                        <div class="grid-2col">
                            <div class="form-group">
                                <label class="field-label">Type</label>
                                <select name="question_type" id="questionType" class="field-select" onchange="toggleQuestionType()">
                                    <option value="multiple_choice">Multiple Choice</option>
                                    <option value="true_false">True/False</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="field-label">Points</label>
                                <input type="number" name="points" class="field-input" value="1" min="1">
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="field-label">Options <span class="hint">(Select the correct answer)</span></label>

                            <!-- Multiple Choice Options (4 options) -->
                            <div class="options-input-list" id="mcOptions">
                                <?php for ($i = 0; $i < 4; $i++): ?>
                                <div class="opt-input-row">
                                    <input type="radio" name="correct_option" value="<?= $i ?>" <?= $i === 0 ? 'checked' : '' ?>>
                                    <input type="text" name="options[]" class="field-input" placeholder="Option <?= $i + 1 ?>">
                                </div>
                                <?php endfor; ?>
                            </div>

                            <!-- True/False Options (2 options) -->
                            <div class="options-input-list" id="tfOptions" style="display: none;">
                                <div class="opt-input-row">
                                    <input type="radio" name="correct_option_tf" value="0" checked>
                                    <input type="text" name="options_tf[]" class="field-input" value="True" readonly style="background: #f5f5f5;">
                                </div>
                                <div class="opt-input-row">
                                    <input type="radio" name="correct_option_tf" value="1">
                                    <input type="text" name="options_tf[]" class="field-input" value="False" readonly style="background: #f5f5f5;">
                                </div>
                            </div>
                        </div>

                        <button type="submit" name="add_question" class="btn-submit-q">+ Save Question</button>

                        <script>
                        function toggleQuestionType() {
                            const type = document.getElementById('questionType').value;
                            const mcOptions = document.getElementById('mcOptions');
                            const tfOptions = document.getElementById('tfOptions');

                            if (type === 'true_false') {
                                mcOptions.style.display = 'none';
                                tfOptions.style.display = 'flex';
                                // Disable MC inputs
                                mcOptions.querySelectorAll('input').forEach(input => input.disabled = true);
                                // Enable TF inputs
                                tfOptions.querySelectorAll('input').forEach(input => input.disabled = false);
                            } else {
                                mcOptions.style.display = 'flex';
                                tfOptions.style.display = 'none';
                                // Enable MC inputs
                                mcOptions.querySelectorAll('input').forEach(input => input.disabled = false);
                                // Disable TF inputs
                                tfOptions.querySelectorAll('input').forEach(input => input.disabled = true);
                            }
                        }
                        </script>
                    </form>
                </div>
            </div>

            <div class="list-side">
                <div class="section-title">
                    <h3>📋 Current Questions (<?= count($questions) ?>)</h3>
                </div>

                <?php if (empty($questions)): ?>
                    <div class="empty-box">
                        <span>📝</span>
                        <h3>No Questions Yet</h3>
                        <p>Use the form on the left to start building your assessment.</p>
                    </div>
                <?php else: ?>
                    <?php foreach ($questions as $index => $q): ?>
                    <div class="question-card">
                        <div class="q-card-header">
                            <div class="q-badge">Question <?= $index + 1 ?></div>
                            <div class="q-meta-tags">
                                <span class="tag-pts"><?= $q['points'] ?> Points</span>
                                <span class="tag-type"><?= str_replace('_', ' ', ucfirst($q['question_type'])) ?></span>
                            </div>
                        </div>

                        <p class="q-body-text"><?= e($q['question_text']) ?></p>

                        <div class="display-options">
                            <?php foreach ($q['options'] as $opt): ?>
                            <div class="opt-item <?= $opt['is_correct'] ? 'is-correct' : '' ?>">
                                <span class="opt-indicator"><?= $opt['is_correct'] ? '●' : '○' ?></span>
                                <span class="opt-text"><?= e($opt['option_text']) ?></span>
                                <?php if ($opt['is_correct']): ?>
                                    <span class="correct-label">Correct Answer</span>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>

                        <div class="q-card-footer">
                            <form method="POST" onsubmit="return confirm('Permanently remove this question?')">
                                <input type="hidden" name="delete_question" value="<?= $q['questions_id'] ?>">
                                <button class="btn-delete-q">Delete Question</button>
                            </form>
                        </div>
                    </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>

        </div>
    </div>
</main>

<style>
/* Dashboard Aesthetic Framework */
.welcome-section { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 24px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); border-radius: 16px; color: #fff; }
.back-link { color: rgba(255,255,255,0.8); text-decoration: none; font-size: 13px; display: block; margin-bottom: 5px; }
.back-link:hover { color: #fff; text-decoration: underline; }
.btn-secondary { background: rgba(255,255,255,0.2); color: #fff; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; border: 1px solid rgba(255,255,255,0.3); }

.q-manager-grid { display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }

/* Sticky Form Styling */
.panel { background: #fff; border: 1px solid #f5f0e8; border-radius: 12px; overflow: hidden; }
.sticky-panel { position: sticky; top: 24px; }
.panel-head { padding: 16px 20px; background: #fdfbf7; border-bottom: 1px solid #f5f0e8; }
.panel-head h3 { font-size: 15px; margin: 0; color: #1c1917; }
.panel-body { padding: 20px; }

.field-label { display: block; font-size: 12px; font-weight: 700; color: #78716c; margin-bottom: 8px; text-transform: uppercase; }
.field-input, .field-select { width: 100%; padding: 10px; border: 1px solid #e7e5e4; border-radius: 8px; font-size: 14px; outline: none; }
.field-input:focus { border-color: #16a34a; }
.hint { font-weight: 400; text-transform: none; opacity: 0.7; }

.grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.options-input-list { display: flex; flex-direction: column; gap: 10px; }
.opt-input-row { display: flex; align-items: center; gap: 10px; }

.btn-submit-q { width: 100%; padding: 12px; background: #16a34a; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 10px; }

/* List Side Styling */
.section-title h3 { font-size: 18px; color: #1c1917; margin: 0 0 16px; }
.question-card { background: #fff; border: 1px solid #f5f0e8; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.q-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.q-badge { background: #f5f0e8; color: #57534e; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
.tag-pts { background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.q-body-text { font-size: 16px; color: #1c1917; line-height: 1.5; margin-bottom: 20px; font-weight: 500; }

.display-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.opt-item { display: flex; align-items: center; padding: 12px 16px; background: #fafaf9; border-radius: 8px; border: 1px solid #f5f0e8; gap: 12px; }
.opt-item.is-correct { background: #f0fdf4; border-color: #bbf7d0; color: #166534; font-weight: 600; }
.correct-label { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-left: auto; }

.btn-delete-q { background: none; border: none; color: #dc2626; font-size: 13px; font-weight: 600; cursor: pointer; }
.alert { padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; background: #dcfce7; color: #166534; }
.alert-error { background: #fee2e2; color: #b91c1c; }
.empty-box { text-align: center; padding: 60px; background: #fff; border: 1px solid #f5f0e8; border-radius: 12px; }

@media (max-width: 1024px) {
    .q-manager-grid { grid-template-columns: 1fr; }
    .sticky-panel { position: static; }
}
</style>

<script>
// Force page reload on browser back/forward navigation to prevent stale cache
window.addEventListener('pageshow', function(event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        window.location.reload();
    }
});

// Clear form on successful submission to prevent resubmission
if (window.location.search.includes('added=1') || window.location.search.includes('deleted=1')) {
    if (window.history.replaceState) {
        const url = new URL(window.location);
        url.searchParams.delete('added');
        url.searchParams.delete('deleted');
        url.searchParams.delete('error');
        url.searchParams.delete('t');
        window.history.replaceState({}, document.title, url);
    }
}
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>