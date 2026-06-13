<?php
/**
 * CIT-LMS Instructor - Quiz Editor
 * Create or edit quiz configurations
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('instructor');

$userId = Auth::id();
$quizId = !empty($_GET['id']) ? (int)$_GET['id'] : null;
$subjectId = !empty($_GET['subject_id']) ? (int)$_GET['subject_id'] : null;
$isEdit = !empty($quizId);

$pageTitle = $isEdit ? 'Edit Quiz Settings' : 'Create New Quiz';
$currentPage = 'quizzes';
$error = '';

// Initialize quiz defaults
$quiz = [
    'subject_id' => $subjectId,
    'lessons_id' => null,
    'quiz_title' => '',
    'description' => '',
    'time_limit' => 30,
    'passing_rate' => 60,
    'due_date' => '',
    'status' => 'published',
    'quiz_type' => 'graded',
    'linked_quiz_id' => null,
    'require_lessons' => 0,
    'no_of_items' => 0
];

// Fetch instructor's active subjects for the dropdown
$mySubjects = db()->fetchAll(
    "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name
     FROM faculty_subject fs
     JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     WHERE fs.user_teacher_id = ? AND fs.status = 'active'
     ORDER BY s.subject_code",
    [$userId]
);

// If editing, load current quiz data
if ($isEdit) {
    $quizData = db()->fetchOne("SELECT * FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?", [$quizId, $userId]);
    if (!$quizData) {
        header('Location: quizzes.php');
        exit;
    }
    // Merge with defaults to ensure all keys exist
    $quiz = array_merge($quiz, $quizData);
    $subjectId = $quiz['subject_id'];

    // Load linked lesson from quiz_lessons junction table
    $linkedLesson = db()->fetchOne(
        "SELECT lessons_id FROM quiz_lessons WHERE quiz_id = ? LIMIT 1",
        [$quizId]
    );
    $quiz['lessons_id'] = $linkedLesson['lessons_id'] ?? null;
}

// Fetch lessons for the selected subject to allow linking a quiz to a module
$lessons = $subjectId ? db()->fetchAll(
    "SELECT lessons_id, lesson_title, lesson_order FROM lessons
     WHERE subject_id = ? AND user_teacher_id = ?
     ORDER BY lesson_order",
    [$subjectId, $userId]
) : [];

// Fetch existing pre-tests and post-tests for linking
$existingPreTests = [];
$existingPostTests = [];
if ($subjectId) {
    $existingPreTests = db()->fetchAll(
        "SELECT quiz_id, quiz_title FROM quiz
         WHERE subject_id = ? AND user_teacher_id = ? AND quiz_type = 'pre_test'
         AND linked_quiz_id IS NULL
         ORDER BY quiz_title",
        [$subjectId, $userId]
    ) ?: [];

    $existingPostTests = db()->fetchAll(
        "SELECT quiz_id, quiz_title FROM quiz
         WHERE subject_id = ? AND user_teacher_id = ? AND quiz_type = 'post_test'
         AND linked_quiz_id IS NULL
         ORDER BY quiz_title",
        [$subjectId, $userId]
    ) ?: [];
}

// Handle Form Submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $quiz['subject_id'] = $_POST['subject_id'] ?? '';
    // lessons_id has foreign key constraint - use NULL for independent quizzes (not 0)
    $quiz['lessons_id'] = !empty($_POST['lessons_id']) ? (int)$_POST['lessons_id'] : null;
    $quiz['quiz_title'] = trim($_POST['quiz_title'] ?? '');
    $quiz['description'] = trim($_POST['description'] ?? '');
    $quiz['time_limit'] = (int)($_POST['time_limit'] ?? 30);
    $quiz['passing_rate'] = (int)($_POST['passing_rate'] ?? 60);
    $quiz['due_date'] = !empty($_POST['due_date']) ? $_POST['due_date'] : null;
    $quiz['status'] = $_POST['status'] ?? 'published';
    $quiz['quiz_type'] = $_POST['quiz_type'] ?? 'graded';
    $quiz['linked_quiz_id'] = !empty($_POST['linked_quiz_id']) ? (int)$_POST['linked_quiz_id'] : null;
    $quiz['require_lessons'] = isset($_POST['require_lessons']) ? 1 : 0;
    $quiz['no_of_items'] = (int)($_POST['no_of_items'] ?? 0);

    if (empty($quiz['subject_id']) || empty($quiz['quiz_title'])) {
        $error = 'Subject selection and Quiz Title are required.';
    } else {
        // Pre-test = 1 attempt only, Post-test = 3 attempts (for improvement)
        $maxAttempts = 3;
        if ($quiz['quiz_type'] === 'pre_test') {
            $maxAttempts = 1;  // Pre-test: ONE attempt only
        }

        // Build SQL columns and values
        $baseColumns = ['subject_id', 'quiz_title', 'quiz_description', 'time_limit', 'passing_rate', 'max_attempts', 'due_date', 'status', 'quiz_type', 'linked_quiz_id', 'require_lessons', 'no_of_items'];
        $baseValues = [$quiz['subject_id'], $quiz['quiz_title'], $quiz['description'], $quiz['time_limit'], $quiz['passing_rate'], $maxAttempts, $quiz['due_date'], $quiz['status'], $quiz['quiz_type'], $quiz['linked_quiz_id'], $quiz['require_lessons'], $quiz['no_of_items']];

        if ($isEdit) {
            // Build UPDATE query
            $setParts = array_map(fn($col) => "$col = ?", $baseColumns);
            $setParts[] = "updated_at = NOW()";
            $sql = "UPDATE quiz SET " . implode(', ', $setParts) . " WHERE quiz_id = ? AND user_teacher_id = ?";
            $params = array_merge($baseValues, [$quizId, $userId]);

            try {
                $stmt = pdo()->prepare($sql);
                $updateSuccess = $stmt->execute($params);
            } catch (PDOException $e) {
                $updateSuccess = false;
                $error = 'Failed to update quiz: ' . $e->getMessage();
            }

            if (!$updateSuccess && empty($error)) {
                $error = 'Failed to update quiz. Please try again.';
            } elseif ($updateSuccess) {
                // Update quiz_lessons junction table
                db()->execute("DELETE FROM quiz_lessons WHERE quiz_id = ?", [$quizId]);
                if ($quiz['lessons_id']) {
                    db()->execute(
                        "INSERT INTO quiz_lessons (quiz_id, lessons_id) VALUES (?, ?)",
                        [$quizId, $quiz['lessons_id']]
                    );
                }

                // If this quiz is linked, update the linked quiz to point back
                if ($quiz['linked_quiz_id']) {
                    db()->execute(
                        "UPDATE quiz SET linked_quiz_id = ? WHERE quiz_id = ?",
                        [$quizId, $quiz['linked_quiz_id']]
                    );
                }
                header("Location: quizzes.php?subject_id={$quiz['subject_id']}&saved=1");
                exit;
            }
        } else {
            // Build INSERT query
            $insertColumns = array_merge(['user_teacher_id'], $baseColumns, ['created_at', 'updated_at']);
            $insertValues = array_merge([$userId], $baseValues);
            $placeholders = array_fill(0, count($insertValues), '?');
            $placeholders[] = 'NOW()';
            $placeholders[] = 'NOW()';

            $sql = "INSERT INTO quiz (" . implode(', ', $insertColumns) . ") VALUES (" . implode(', ', $placeholders) . ")";

            try {
                $stmt = pdo()->prepare($sql);
                $insertSuccess = $stmt->execute($insertValues);
            } catch (PDOException $e) {
                $insertSuccess = false;
                $error = 'Database error: ' . $e->getMessage();
            }

            if (!$insertSuccess && empty($error)) {
                $error = 'Failed to create quiz. Please check database connection and try again.';
            } elseif ($insertSuccess) {
                $newQuizId = db()->lastInsertId();

                // Insert into quiz_lessons junction table
                if ($quiz['lessons_id'] && $newQuizId) {
                    db()->execute(
                        "INSERT INTO quiz_lessons (quiz_id, lessons_id) VALUES (?, ?)",
                        [$newQuizId, $quiz['lessons_id']]
                    );
                }

                // If this quiz is linked to another, update the linked quiz to point back
                if ($quiz['linked_quiz_id'] && $newQuizId) {
                    db()->execute(
                        "UPDATE quiz SET linked_quiz_id = ? WHERE quiz_id = ?",
                        [$newQuizId, $quiz['linked_quiz_id']]
                    );
                }

                header("Location: quiz-questions.php?quiz_id=" . $newQuizId);
                exit;
            }
        }
    }
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/instructor_sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <div class="page-header">
            <div>
                <a href="quizzes.php" class="back-link">Back to Quizzes</a>
                <h2><?= $isEdit ? 'Edit Quiz Settings' : 'Create New Quiz' ?></h2>
                <p class="text-muted">Define timing, passing criteria, and availability for your assessment.</p>
            </div>
            <?php if ($isEdit): ?>
                <div>
                    <a href="quiz-questions.php?quiz_id=<?= $quizId ?>" class="btn btn-success">Manage Questions</a>
                </div>
            <?php endif; ?>
        </div>

        <?php if ($error): ?>
            <div class="alert alert-error"><?= e($error) ?></div>
        <?php endif; ?>

        <form method="POST" class="form-container">
            <div class="panel">
                <div class="panel-head"><h3>Quiz Information</h3></div>
                <div class="panel-body">
                    <div class="grid-2col">
                        <div class="form-group">
                            <label class="field-label">Subject <span class="required">*</span></label>
                            <select name="subject_id" class="field-input" required <?= $isEdit ? '' : 'onchange="location=\'quiz-edit.php?subject_id=\'+this.value"' ?>>
                                <option value="">-- Select Subject --</option>
                                <?php foreach ($mySubjects as $s): ?>
                                    <option value="<?= $s['subject_id'] ?>" <?= $quiz['subject_id'] == $s['subject_id'] ? 'selected' : '' ?>>
                                        <?= e($s['subject_code']) ?> - <?= e($s['subject_name']) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="field-label">Linked Lesson (Optional)</label>
                            <select name="lessons_id" class="field-input">
                                <option value="">Independent Quiz (Not tied to a lesson)</option>
                                <?php foreach ($lessons as $l): ?>
                                    <option value="<?= $l['lessons_id'] ?>" <?= $quiz['lessons_id'] == $l['lessons_id'] ? 'selected' : '' ?>>
                                        Module <?= $l['lesson_order'] ?>: <?= e($l['lesson_title']) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="field-label">Quiz Title <span class="required">*</span></label>
                        <input type="text" name="quiz_title" class="field-input" placeholder="e.g. Preliminary Exam or Unit 1 Checkpoint" required value="<?= e($quiz['quiz_title']) ?>">
                    </div>

                    <div class="form-group">
                        <label class="field-label">Instructions / Description</label>
                        <textarea name="description" class="field-input" rows="4" placeholder="Enter instructions for the students..."><?= e($quiz['description'] ?? '') ?></textarea>
                    </div>
                </div>
            </div>

            <div class="panel mt-4">
                <div class="panel-head"><h3>Quiz Type & Pre/Post Test Linking</h3></div>
                <div class="panel-body">
                    <div class="grid-2col">
                        <div class="form-group">
                            <label class="field-label">Quiz Type <span class="required">*</span></label>
                            <select name="quiz_type" id="quizType" class="field-input" onchange="toggleLinkingOptions()">
                                <option value="graded" <?= ($quiz['quiz_type'] ?? '') === 'graded' ? 'selected' : '' ?>>Graded Quiz (Standard)</option>
                                <option value="practice" <?= ($quiz['quiz_type'] ?? '') === 'practice' ? 'selected' : '' ?>>Practice Quiz (No Grade)</option>
                                <option value="pre_test" <?= ($quiz['quiz_type'] ?? '') === 'pre_test' ? 'selected' : '' ?>>Pre-Test (Before Lessons)</option>
                                <option value="post_test" <?= ($quiz['quiz_type'] ?? '') === 'post_test' ? 'selected' : '' ?>>Post-Test (After Lessons)</option>
                            </select>
                            <span class="field-hint">Pre-test measures initial knowledge; Post-test measures learning progress</span>
                        </div>
                        <div class="form-group" id="linkedQuizGroup" style="display: none;">
                            <label class="field-label">Link to Pre-Test</label>
                            <select name="linked_quiz_id" id="linkedQuizId" class="field-input">
                                <option value="">-- Select Pre-Test to Link --</option>
                                <?php foreach ($existingPreTests as $pt): ?>
                                    <option value="<?= $pt['quiz_id'] ?>" <?= ($quiz['linked_quiz_id'] ?? '') == $pt['quiz_id'] ? 'selected' : '' ?>>
                                        <?= e($pt['quiz_title']) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <span class="field-hint">The post-test will use the same questions (shuffled) from the linked pre-test</span>
                        </div>
                    </div>

                    <div class="form-group" id="requireLessonsGroup" style="display: none;">
                        <label class="checkbox-item">
                            <input type="checkbox" name="require_lessons" value="1" <?= ($quiz['require_lessons'] ?? 0) ? 'checked' : '' ?>>
                            <span class="checkbox-text">Require students to complete all lessons before taking this quiz</span>
                        </label>
                        <span class="field-hint">If enabled, students who fail the pre-test must complete all lessons before accessing the post-test</span>
                    </div>

                    <div class="info-box" id="pretestInfo" style="display: none;">
                        <strong>Pre-Test Flow:</strong>
                        <ul>
                            <li>Students take the pre-test to assess their initial knowledge</li>
                            <li>If they pass, they can skip directly to the post-test</li>
                            <li>If they fail, they must complete all subject lessons first</li>
                            <li>After completing lessons, they can take the post-test</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="panel mt-4">
                <div class="panel-head"><h3>Examination Settings</h3></div>
                <div class="panel-body">
                    <div class="grid-4col">
                        <div class="form-group">
                            <label class="field-label">Number of Items</label>
                            <input type="number" name="no_of_items" class="field-input" value="<?= (int)($quiz['no_of_items'] ?? 0) ?>" min="0" max="200">
                            <span class="field-hint">Total questions in this quiz</span>
                        </div>
                        <div class="form-group">
                            <label class="field-label">Time Limit (Mins)</label>
                            <input type="number" name="time_limit" class="field-input" value="<?= $quiz['time_limit'] ?>" min="5" max="180">
                            <span class="field-hint">Min 5 - Max 180</span>
                        </div>
                        <div class="form-group">
                            <label class="field-label">Passing Rate (%)</label>
                            <input type="number" name="passing_rate" class="field-input" value="<?= $quiz['passing_rate'] ?>" min="1" max="100">
                            <span class="field-hint">Usually 60% or 75%</span>
                        </div>
                        <div class="form-group">
                            <label class="field-label">Due Date & Time</label>
                            <input type="datetime-local" name="due_date" class="field-input" value="<?= $quiz['due_date'] ? date('Y-m-d\TH:i', strtotime($quiz['due_date'])) : '' ?>">
                            <span class="field-hint">Closing time for student attempts</span>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="field-label">Visibility Status</label>
                        <div class="status-selector">
                            <label class="radio-item">
                                <input type="radio" name="status" value="draft" <?= $quiz['status'] === 'draft' ? 'checked' : '' ?>>
                                <div class="radio-box">Draft (Hidden)</div>
                            </label>
                            <label class="radio-item">
                                <input type="radio" name="status" value="published" <?= $quiz['status'] === 'published' ? 'checked' : '' ?>>
                                <div class="radio-box">Published (Active)</div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-footer">
                <a href="quizzes.php" class="btn-cancel">Discard Changes</a>
                <button type="submit" class="btn-save-quiz">
                    <?= $isEdit ? 'Save Changes' : 'Next: Add Questions' ?>
                </button>
            </div>
        </form>
    </div>
</main>

<style>
/* Page Header */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}
.page-header h2 {
    font-size: 22px;
    font-weight: 700;
    color: var(--gray-800);
    margin: 0 0 4px;
}
.text-muted {
    color: var(--gray-500);
    margin: 0;
    font-size: 14px;
}
.back-link {
    color: var(--primary);
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    display: inline-block;
    margin-bottom: 6px;
}
.back-link:hover {
    text-decoration: underline;
}

/* Panels */
.panel {
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--border-radius-lg);
    overflow: hidden;
}
.panel-head {
    padding: 14px 20px;
    background: var(--gray-50);
    border-bottom: 1px solid var(--gray-200);
}
.panel-head h3 {
    font-size: 14px;
    font-weight: 700;
    margin: 0;
    color: var(--gray-800);
}
.panel-body {
    padding: 20px;
}

/* Grid Layouts */
.grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.grid-4col { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

/* Form Elements */
.form-group {
    margin-bottom: 16px;
}
.field-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-600);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}
.required { color: #dc2626; }
.field-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--gray-200);
    border-radius: var(--border-radius);
    font-size: 14px;
    color: var(--gray-800);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}
.field-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(0, 70, 27, 0.08);
}
.field-hint {
    font-size: 11px;
    color: var(--gray-400);
    margin-top: 4px;
    display: block;
}

/* Status Selector */
.status-selector { display: flex; gap: 10px; }
.radio-item { flex: 1; cursor: pointer; }
.radio-item input { display: none; }
.radio-box {
    text-align: center;
    padding: 10px;
    border: 1px solid var(--gray-200);
    border-radius: var(--border-radius);
    font-size: 13px;
    color: var(--gray-500);
    transition: 0.2s;
}
.radio-item input:checked + .radio-box {
    background: var(--cream-light);
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 600;
}

/* Form Footer */
.form-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--gray-200);
}
.btn-save-quiz {
    background: var(--primary);
    color: var(--white);
    border: none;
    padding: 10px 24px;
    border-radius: var(--border-radius);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: 0.2s;
}
.btn-save-quiz:hover {
    background: var(--primary-light);
}
.btn-cancel {
    color: var(--gray-500);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    padding: 10px 16px;
}
.btn-cancel:hover {
    color: var(--gray-700);
}

/* Alert */
.alert-error {
    background: #fee2e2;
    color: #b91c1c;
    padding: 12px 16px;
    border-radius: var(--border-radius);
    margin-bottom: 16px;
    font-size: 14px;
}

.mt-4 { margin-top: 20px; }

/* Checkbox */
.checkbox-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
}
.checkbox-item input[type="checkbox"] {
    margin-top: 2px;
    width: 16px;
    height: 16px;
    accent-color: var(--primary);
}
.checkbox-text {
    font-size: 14px;
    color: var(--gray-800);
}

/* Info Box */
.info-box {
    background: var(--cream-light);
    border: 1px solid var(--cream-dark);
    border-radius: var(--border-radius);
    padding: 14px 16px;
    margin-top: 14px;
}
.info-box strong {
    color: var(--primary);
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
}
.info-box ul {
    margin: 0;
    padding-left: 18px;
    color: var(--gray-700);
    font-size: 13px;
}
.info-box ul li { margin-bottom: 4px; }

/* Responsive */
@media (max-width: 768px) {
    .grid-2col, .grid-3col, .grid-4col { grid-template-columns: 1fr; }
    .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
@media (min-width: 769px) and (max-width: 1024px) {
    .grid-4col { grid-template-columns: repeat(2, 1fr); }
}
</style>

<script>
function toggleLinkingOptions() {
    const quizTypeEl = document.getElementById('quizType');
    if (!quizTypeEl) return;

    const quizType = quizTypeEl.value;
    const linkedQuizGroup = document.getElementById('linkedQuizGroup');
    const requireLessonsGroup = document.getElementById('requireLessonsGroup');
    const pretestInfo = document.getElementById('pretestInfo');

    // Show/hide based on quiz type
    if (quizType === 'post_test') {
        if (linkedQuizGroup) linkedQuizGroup.style.display = 'block';
        if (requireLessonsGroup) requireLessonsGroup.style.display = 'block';
        if (pretestInfo) pretestInfo.style.display = 'block';
    } else if (quizType === 'pre_test') {
        if (linkedQuizGroup) linkedQuizGroup.style.display = 'none';
        if (requireLessonsGroup) requireLessonsGroup.style.display = 'none';
        if (pretestInfo) pretestInfo.style.display = 'block';
    } else {
        if (linkedQuizGroup) linkedQuizGroup.style.display = 'none';
        if (requireLessonsGroup) requireLessonsGroup.style.display = 'none';
        if (pretestInfo) pretestInfo.style.display = 'none';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    toggleLinkingOptions();
});
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>