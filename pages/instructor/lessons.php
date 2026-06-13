<?php
/**
 * CIT-LMS Instructor - Lessons Management
 * Fixed: Updated database calls to use execute() for deletion
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('instructor');

$userId = Auth::id();
$pageTitle = 'Manage Lessons';
$currentPage = 'lessons';
$subjectId = !empty($_GET['subject_id']) ? (int)$_GET['subject_id'] : null;

// Handle Lesson Deletion
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_id'])) {
    $id = (int)$_POST['delete_id'];
    
    // FIXED: Changed query() to execute() to match your Database class
    // We delete progress first to respect foreign key constraints
    db()->execute("DELETE FROM student_progress WHERE lessons_id = ?", [$id]);
    db()->execute("DELETE FROM lessons WHERE lessons_id = ? AND user_teacher_id = ?", [$id, $userId]);
    
    // Redirect with the current filter preserved
    $redirectUrl = "lessons.php?deleted=1" . ($subjectId ? "&subject_id=$subjectId" : "");
    header("Location: $redirectUrl"); 
    exit;
}

// 1. Fetch subjects for the filter dropdown (Using fetchAll from your config)
$mySubjects = db()->fetchAll(
    "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name 
     FROM faculty_subject fs 
     JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id 
     JOIN subject s ON so.subject_id = s.subject_id 
     WHERE fs.user_teacher_id = ? AND fs.status = 'active' 
     ORDER BY s.subject_code ASC", 
    [$userId]
);

// 2. Build the Lessons Query
$sql = "SELECT l.*, s.subject_code, s.subject_name,
        (SELECT COUNT(*) FROM student_progress sp WHERE sp.lessons_id = l.lessons_id AND sp.status = 'completed') as completions
        FROM lessons l
        JOIN subject s ON l.subject_id = s.subject_id
        WHERE l.user_teacher_id = ?";

$params = [$userId];

if ($subjectId) { 
    $sql .= " AND l.subject_id = ?"; 
    $params[] = $subjectId; 
}

$sql .= " ORDER BY s.subject_code ASC, l.lesson_order ASC";
$lessons = db()->fetchAll($sql, $params);

// 3. Grouping Logic
$grouped = [];
foreach ($lessons as $l) {
    $sid = $l['subject_id'];
    if (!isset($grouped[$sid])) {
        $grouped[$sid] = [
            'code' => $l['subject_code'],
            'name' => $l['subject_name'],
            'lessons' => []
        ];
    }
    $grouped[$sid]['lessons'][] = $l;
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/instructor_sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">

        <?php if (isset($_GET['deleted'])): ?>
            <div class="alert alert-success">
                ✓ Lesson has been successfully removed.
            </div>
        <?php endif; ?>

        <?php if (isset($_GET['saved'])): ?>
            <div class="alert alert-success">
                ✓ Lesson changes have been saved.
            </div>
        <?php endif; ?>

        <!-- Page Header -->
        <div class="page-header">
            <div>
                <h2>Course Lessons</h2>
                <p class="text-muted">Organize and manage your instructional materials</p>
            </div>
            <div class="header-actions">
                <div class="header-stat">
                    <span class="stat-value"><?= count($lessons) ?></span>
                    <span class="stat-label">Total Lessons</span>
                </div>
                <a href="lesson-edit.php<?= $subjectId ? '?subject_id='.$subjectId : '' ?>" class="btn btn-success">+ Create Lesson</a>
            </div>
        </div>

        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group flex-grow">
                    <label>Subject</label>
                    <select name="subject_id" class="form-control" onchange="this.form.submit()">
                        <option value="">All Assigned Subjects</option>
                        <?php foreach ($mySubjects as $s): ?>
                            <option value="<?= $s['subject_id'] ?>" <?= $subjectId == $s['subject_id'] ? 'selected' : '' ?>>
                                <?= e($s['subject_code']) ?> - <?= e($s['subject_name']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <?php if ($subjectId): ?>
                <div class="filter-group">
                    <a href="lessons.php" class="btn btn-outline">Clear</a>
                </div>
                <?php endif; ?>
            </form>
        </div>

        <!-- Lessons List -->
        <?php if (empty($lessons)): ?>
            <div class="empty-state">
                <div class="empty-state-icon">📖</div>
                <h3>No Lessons Found</h3>
                <p>You haven't created any lessons for this criteria yet.</p>
            </div>
        <?php else: ?>
            <?php foreach ($grouped as $sid => $data): ?>
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">
                        📚 <?= e($data['code']) ?> - <?= e($data['name']) ?>
                        <span class="badge badge-primary"><?= count($data['lessons']) ?> lessons</span>
                    </h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px;">#</th>
                                <th>Lesson</th>
                                <th>Status</th>
                                <th>Completions</th>
                                <th>Updated</th>
                                <th style="width: 60px; text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($data['lessons'] as $l): ?>
                            <tr>
                                <td>
                                    <div class="lesson-order"><?= $l['lesson_order'] ?></div>
                                </td>
                                <td>
                                    <div class="lesson-title"><?= e($l['lesson_title']) ?></div>
                                </td>
                                <td>
                                    <span class="tag-status <?= $l['status'] === 'published' ? 'status-published' : 'status-draft' ?>">
                                        <?= ucfirst($l['status']) ?>
                                    </span>
                                </td>
                                <td>
                                    <span class="completions-count"><?= $l['completions'] ?></span>
                                </td>
                                <td>
                                    <small class="text-muted"><?= date('M d, Y', strtotime($l['updated_at'])) ?></small>
                                </td>
                                <td>
                                    <div class="actions-cell">
                                        <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                                        </button>
                                        <div class="actions-dropdown">
                                            <a href="lesson-edit.php?id=<?= $l['lessons_id'] ?>" class="action-item">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                Edit Lesson
                                            </a>
                                            <div class="action-divider"></div>
                                            <form method="POST" onsubmit="return confirm('Are you sure you want to delete this lesson? All student progress for this lesson will also be removed.');">
                                                <input type="hidden" name="delete_id" value="<?= $l['lessons_id'] ?>">
                                                <button type="submit" class="action-item action-danger">
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                    Delete Lesson
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
    gap: 16px;
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

/* Lesson Order Circle */
.lesson-order {
    width: 32px;
    height: 32px;
    background: var(--cream);
    color: var(--gray-600);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
}

/* Lesson Title */
.lesson-title {
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