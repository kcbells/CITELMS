<?php
/**
 * CIT-LMS Instructor - Quizzes Management
 * View, filter, and manage course assessments with performance tracking
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('instructor');

$userId = Auth::id();
$pageTitle = 'Manage Quizzes';
$currentPage = 'quizzes';
$subjectId = !empty($_GET['subject_id']) ? (int)$_GET['subject_id'] : null;

// Handle Quiz Deletion
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_id'])) {
    $id = (int)$_POST['delete_id'];
    
    // Cascading deletion order to respect foreign key constraints
    db()->execute("DELETE FROM student_quiz_answers WHERE attempt_id IN (SELECT attempt_id FROM student_quiz_attempts WHERE quiz_id = ?)", [$id]);
    db()->execute("DELETE FROM student_quiz_attempts WHERE quiz_id = ?", [$id]);
    db()->execute("DELETE FROM question_option WHERE questions_id IN (SELECT questions_id FROM quiz_questions WHERE quiz_id = ?)", [$id]);
    // Delete questions from master table (cascades to quiz_questions via fk_qq_question)
    db()->execute("DELETE FROM questions WHERE questions_id IN (SELECT questions_id FROM quiz_questions WHERE quiz_id = ?)", [$id]);
    db()->execute("DELETE FROM quiz_questions WHERE quiz_id = ?", [$id]);
    db()->execute("DELETE FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?", [$id, $userId]);
    
    header("Location: quizzes.php" . ($subjectId ? "?subject_id=$subjectId&" : "?") . "deleted=1"); 
    exit;
}

// 1. Fetch instructor's active subjects for the filter dropdown
$mySubjects = db()->fetchAll(
    "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name 
     FROM faculty_subject fs 
     JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id 
     JOIN subject s ON so.subject_id = s.subject_id 
     WHERE fs.user_teacher_id = ? AND fs.status = 'active' 
     ORDER BY s.subject_code ASC", 
    [$userId]
);

// 2. Build Query for Quizzes with integrated statistics
$where = "WHERE q.user_teacher_id = ?";
$params = [$userId];
if ($subjectId) { 
    $where .= " AND q.subject_id = ?"; 
    $params[] = $subjectId; 
}

$quizSql = "SELECT q.*, s.subject_code, s.subject_name,
    (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.quiz_id) as q_count,
    (SELECT COUNT(*) FROM student_quiz_attempts sqa WHERE sqa.quiz_id = q.quiz_id AND sqa.status = 'completed') as attempts,
    (SELECT AVG(sqa.percentage) FROM student_quiz_attempts sqa WHERE sqa.quiz_id = q.quiz_id AND sqa.status = 'completed') as avg_score
    FROM quiz q
    JOIN subject s ON q.subject_id = s.subject_id
    $where
    ORDER BY q.created_at DESC";

try {
    $stmt = pdo()->prepare($quizSql);
    $stmt->execute($params);
    $quizzes = $stmt->fetchAll();
} catch (PDOException $e) {
    $quizzes = [];
    $quizError = $e->getMessage();
}

// 3. Grouping Logic by subject
$grouped = [];
foreach ($quizzes as $q) {
    $sid = $q['subject_id'];
    if (!isset($grouped[$sid])) {
        $grouped[$sid] = [
            'code' => $q['subject_code'],
            'name' => $q['subject_name'],
            'quizzes' => []
        ];
    }
    $grouped[$sid]['quizzes'][] = $q;
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/instructor_sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">

        <?php if (!empty($quizError)): ?>
            <div class="alert alert-error" style="background:#fee2e2;color:#b91c1c;padding:16px;border-radius:8px;margin-bottom:20px;">
                Query Error: <?= e($quizError) ?>
            </div>
        <?php endif; ?>

        <?php if (isset($_GET['deleted'])): ?>
            <div class="alert alert-success">
                ✓ Quiz and all associated data have been permanently removed.
            </div>
        <?php endif; ?>

        <?php if (isset($_GET['saved'])): ?>
            <div class="alert alert-success">
                ✓ Quiz configuration has been successfully saved.
            </div>
        <?php endif; ?>

        <!-- Page Header -->
        <div class="page-header">
            <div>
                <h2>Assessment Center</h2>
                <p class="text-muted">Create, manage, and monitor quiz performance across your classes</p>
            </div>
            <div class="header-actions">
                <div class="header-stat">
                    <span class="stat-value"><?= count($quizzes) ?></span>
                    <span class="stat-label">Total Quizzes</span>
                </div>
                <a href="quiz-ai-generate.php<?= $subjectId ? '?subject_id='.$subjectId : '' ?>" class="btn btn-ai">AI Generate</a>
                <a href="quiz-edit.php<?= $subjectId ? '?subject_id='.$subjectId : '' ?>" class="btn btn-success">+ Create Quiz</a>
            </div>
        </div>

        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group flex-grow">
                    <label>Subject</label>
                    <select name="subject_id" class="form-control" onchange="this.form.submit()">
                        <option value="">All Subjects</option>
                        <?php foreach ($mySubjects as $s): ?>
                            <option value="<?= $s['subject_id'] ?>" <?= $subjectId == $s['subject_id'] ? 'selected' : '' ?>>
                                <?= e($s['subject_code']) ?> - <?= e($s['subject_name']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <?php if ($subjectId): ?>
                <div class="filter-group">
                    <a href="quizzes.php" class="btn btn-outline">Clear</a>
                </div>
                <?php endif; ?>
            </form>
        </div>

        <!-- Quizzes List -->
        <?php if (empty($quizzes)): ?>
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <h3>No Quizzes Found</h3>
                <p>You haven't created any assessments for this selection yet.</p>
            </div>
        <?php else: ?>
            <?php foreach ($grouped as $sid => $data): ?>
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">
                        📚 <?= e($data['code']) ?> - <?= e($data['name']) ?>
                        <span class="badge badge-primary"><?= count($data['quizzes']) ?> quizzes</span>
                    </h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Quiz Title</th>
                                <th>Status</th>
                                <th>Questions</th>
                                <th>Time</th>
                                <th>Passing</th>
                                <th>Attempts</th>
                                <th>Avg Score</th>
                                <th>Due Date</th>
                                <th style="width: 60px; text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($data['quizzes'] as $q): ?>
                            <tr>
                                <td>
                                    <div class="quiz-title"><?= e($q['quiz_title']) ?></div>
                                </td>
                                <td>
                                    <span class="tag-status <?= $q['status'] === 'published' ? 'status-published' : 'status-draft' ?>">
                                        <?= ucfirst($q['status']) ?>
                                    </span>
                                </td>
                                <td>
                                    <span class="tag-topics"><?= $q['q_count'] ?> items</span>
                                </td>
                                <td>
                                    <span class="text-muted"><?= $q['time_limit'] ?> min</span>
                                </td>
                                <td>
                                    <span class="score-badge"><?= (int)$q['passing_rate'] ?>%</span>
                                </td>
                                <td>
                                    <span class="completions-count"><?= $q['attempts'] ?></span>
                                </td>
                                <td>
                                    <?php if ($q['avg_score']): ?>
                                        <span class="score-badge <?= round($q['avg_score']) >= $q['passing_rate'] ? 'passed' : 'failed' ?>">
                                            <?= round($q['avg_score']) ?>%
                                        </span>
                                    <?php else: ?>
                                        <span class="text-muted">&mdash;</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?php if ($q['due_date']): ?>
                                        <small class="text-muted"><?= date('M d, Y', strtotime($q['due_date'])) ?></small>
                                    <?php else: ?>
                                        <span class="text-muted">&mdash;</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <div class="actions-cell">
                                        <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                                        </button>
                                        <div class="actions-dropdown">
                                            <a href="quiz-questions.php?quiz_id=<?= $q['quiz_id'] ?>" class="action-item">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                                Manage Questions
                                            </a>
                                            <a href="quiz-edit.php?id=<?= $q['quiz_id'] ?>" class="action-item">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                Edit Quiz
                                            </a>
                                            <div class="action-divider"></div>
                                            <form method="POST" onsubmit="return confirm('Are you sure you want to delete this quiz? All questions and student attempts will be permanently removed.');">
                                                <input type="hidden" name="delete_id" value="<?= $q['quiz_id'] ?>">
                                                <button type="submit" class="action-item action-danger">
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                    Delete Quiz
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>
</main>

<style>
/* Override card/table overflow to allow dropdown to show */
.card {
    overflow: visible;
}

.table-container {
    overflow: visible;
}

/* Page Header */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}

.page-header h2 {
    font-size: 24px;
    font-weight: 700;
    color: var(--gray-800);
    margin: 0 0 4px;
}

.text-muted {
    color: var(--gray-500);
    margin: 0;
}

/* Header Actions */
.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.header-stat {
    text-align: center;
    padding: 12px 24px;
    background: var(--cream-light);
    border-radius: var(--border-radius);
}

.stat-value {
    display: block;
    font-size: 28px;
    font-weight: 800;
    color: var(--primary);
}

.stat-label {
    font-size: 12px;
    color: var(--gray-500);
}

/* AI Generate Button */
.btn-ai {
    background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
    color: #fff !important;
    border: none;
}

.btn-ai:hover {
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    transform: translateY(-1px);
}

/* Filters */
.filters-card {
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--border-radius-lg);
    padding: 20px;
    margin-bottom: 24px;
}

.filters-form {
    display: flex;
    gap: 16px;
    align-items: flex-end;
    flex-wrap: wrap;
}

.filter-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.filter-group label {
    font-size: 13px;
    font-weight: 600;
    color: var(--gray-700);
}

.flex-grow {
    flex: 1;
    min-width: 250px;
}

/* Card margin */
.mb-3 {
    margin-bottom: 24px;
}

/* Quiz Title in table */
.quiz-title {
    font-weight: 600;
    color: var(--gray-800);
    font-size: 14px;
}

/* Status Tags */
.tag-status {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    display: inline-block;
}

.status-published {
    background: var(--success-bg, #dcfce7);
    color: #15803d;
}

.status-draft {
    background: var(--danger-bg, #fee2e2);
    color: #b91c1c;
}

/* Topics/Items Tag */
.tag-topics {
    background: #dbeafe;
    color: #1d4ed8;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    display: inline-block;
}

/* Score badge */
.score-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
}

.score-badge.passed {
    background: var(--success-bg, #dcfce7);
    color: var(--success);
}

.score-badge.failed {
    background: var(--danger-bg, #fee2e2);
    color: var(--danger);
}

/* Completions */
.completions-count {
    font-weight: 600;
    color: var(--gray-700);
}

/* Alert Messages */
.alert {
    padding: 16px 20px;
    border-radius: var(--border-radius);
    margin-bottom: 20px;
    font-weight: 600;
}

.alert-success {
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    color: #065f46;
    }

/* Actions Dropdown */
.actions-cell {
    position: relative;
    display: flex;
    justify-content: center;
}

.btn-actions-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--gray-200);
    background: var(--white);
    border-radius: 8px;
    cursor: pointer;
    color: var(--gray-500);
    transition: all 0.2s;
}

.btn-actions-toggle:hover {
    background: var(--gray-50);
    border-color: var(--gray-300);
    color: var(--gray-700);
}

.btn-actions-toggle.active {
    background: var(--gray-100);
    border-color: var(--primary);
    color: var(--primary);
    box-shadow: 0 0 0 2px rgba(0, 70, 27, 0.1);
}

.actions-dropdown {
    display: none;
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    min-width: 180px;
    z-index: 100;
    padding: 6px;
    animation: dropdownFadeIn 0.15s ease-out;
}

.actions-dropdown.show {
    display: block;
}

@keyframes dropdownFadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
}

.action-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--gray-700);
    text-decoration: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
}

.action-item:hover {
    background: var(--cream-light);
    color: var(--gray-800);
}

.action-item svg {
    flex-shrink: 0;
    opacity: 0.7;
}

.action-item:hover svg {
    opacity: 1;
}

.action-divider {
    height: 1px;
    background: var(--gray-200);
    margin: 4px 0;
}

.action-item.action-danger {
    color: var(--danger);
}

.action-item.action-danger:hover {
    background: #fef2f2;
    color: #dc2626;
}

.action-item.action-danger svg {
    stroke: var(--danger);
}
</style>

<script>
function toggleActions(btn) {
    const dropdown = btn.nextElementSibling;
    const isOpen = dropdown.classList.contains('show');

    // Close all other dropdowns first
    document.querySelectorAll('.actions-dropdown.show').forEach(d => {
        d.classList.remove('show');
        d.previousElementSibling.classList.remove('active');
    });

    // Toggle current
    if (!isOpen) {
        dropdown.classList.add('show');
        btn.classList.add('active');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.actions-cell')) {
        document.querySelectorAll('.actions-dropdown.show').forEach(d => {
            d.classList.remove('show');
            d.previousElementSibling.classList.remove('active');
        });
    }
});
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>