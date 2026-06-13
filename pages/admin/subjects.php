<?php
/**
 * Admin - Subjects Management
 * Manage subjects/courses
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Subjects';
$currentPage = 'subjects';

$action = $_GET['action'] ?? 'list';
$subjectId = $_GET['id'] ?? '';
$search = $_GET['search'] ?? '';
$error = '';
$success = '';

// Get programs
$programs = db()->fetchAll("SELECT program_id, program_code, program_name FROM program ORDER BY program_code");

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    
    if ($postAction === 'create' || $postAction === 'update') {
        $programId = $_POST['program_id'] ?: null;
        $subjectCode = trim($_POST['subject_code'] ?? '');
        $subjectName = trim($_POST['subject_name'] ?? '');
        $units = (int)($_POST['units'] ?? 3);
        $yearLevel = $_POST['year_level'] ?: null;
        $semester = $_POST['semester'] ?: null;
        $description = trim($_POST['description'] ?? '');
        $status = $_POST['status'] ?? 'active';

        if (empty($subjectCode) || empty($subjectName)) {
            $error = 'Please fill in all required fields.';
        } else {
            $existing = db()->fetchOne(
                "SELECT subject_id FROM subject WHERE subject_code = ? AND subject_id != ?",
                [$subjectCode, $_POST['subject_id'] ?? 0]
            );

            if ($existing) {
                $error = 'Subject code already exists.';
            } else {
                if ($postAction === 'create') {
                    db()->execute(
                        "INSERT INTO subject (program_id, subject_code, subject_name, units, year_level, semester, description, status, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                        [$programId, $subjectCode, $subjectName, $units, $yearLevel, $semester, $description, $status]
                    );
                    header("Location: subjects.php?success=created");
                    exit;
                } else {
                    db()->execute(
                        "UPDATE subject SET program_id = ?, subject_code = ?, subject_name = ?, units = ?, year_level = ?, semester = ?, description = ?, status = ?, updated_at = NOW() WHERE subject_id = ?",
                        [$programId, $subjectCode, $subjectName, $units, $yearLevel, $semester, $description, $status, $_POST['subject_id']]
                    );
                    header("Location: subjects.php?success=updated");
                    exit;
                }
            }
        }
    }
    
    if ($postAction === 'delete') {
        $deleteId = (int)$_POST['subject_id'];
        $hasOfferings = db()->fetchOne("SELECT COUNT(*) as count FROM subject_offered WHERE subject_id = ? AND status = 'open'", [$deleteId])['count'];
        if ($hasOfferings > 0) {
            $error = "Cannot delete subject with $hasOfferings active offerings.";
        } else {
            // Soft delete - set status to inactive instead of removing record
            db()->execute("UPDATE subject SET status = 'inactive', updated_at = NOW() WHERE subject_id = ?", [$deleteId]);
            header("Location: subjects.php?success=deleted");
            exit;
        }
    }
}

if (isset($_GET['success'])) {
    $successMessages = ['created' => 'Subject created!', 'updated' => 'Subject updated!', 'deleted' => 'Subject deleted!'];
    $success = $successMessages[$_GET['success']] ?? '';
}

$editSubject = null;
if ($action === 'edit' && $subjectId) {
    $editSubject = db()->fetchOne("SELECT * FROM subject WHERE subject_id = ?", [$subjectId]);
    if (!$editSubject) { header("Location: subjects.php"); exit; }
}

// Build query
$whereClause = "WHERE 1=1";
$params = [];
if ($search) {
    $whereClause .= " AND (s.subject_code LIKE ? OR s.subject_name LIKE ?)";
    $params = ["%$search%", "%$search%"];
}

$subjects = db()->fetchAll(
    "SELECT s.*, p.program_code,
        (SELECT COUNT(*) FROM subject_offered so WHERE so.subject_id = s.subject_id) as offering_count,
        (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id) as lesson_count
     FROM subject s 
     LEFT JOIN program p ON s.program_id = p.program_id
     $whereClause
     ORDER BY s.subject_code",
    $params
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <?php if ($action === 'list'): ?>
        <div class="page-header">
            <div>
                <h2>Subjects</h2>
                <p class="text-muted">Manage course subjects</p>
            </div>
            <a href="?action=create" class="btn btn-success">+ Add Subject</a>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <!-- Search -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group" style="flex:1">
                    <label>Search</label>
                    <input type="text" name="search" class="form-control" placeholder="Subject code or name..." value="<?= e($search) ?>">
                </div>
                <div class="filter-group">
                    <button type="submit" class="btn btn-primary">Search</button>
                    <?php if ($search): ?><a href="subjects.php" class="btn btn-outline">Clear</a><?php endif; ?>
                </div>
            </form>
        </div>
        
        <!-- Subjects Table -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">All Subjects <span class="badge-count"><?= count($subjects) ?></span></h3>
            </div>
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Subject Name</th>
                            <th>Program</th>
                            <th>Year</th>
                            <th>Semester</th>
                            <th>Units</th>
                            <th>Status</th>
                            <th style="width: 60px; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($subjects)): ?>
                        <tr><td colspan="8" class="text-center text-muted" style="padding:40px;">No subjects found</td></tr>
                        <?php else: ?>
                        <?php foreach ($subjects as $subject): ?>
                        <tr>
                            <td><span class="subject-code"><?= e($subject['subject_code']) ?></span></td>
                            <td><span class="subject-name"><?= e($subject['subject_name']) ?></span></td>
                            <td><span class="program-text"><?= e($subject['program_code'] ?? 'General') ?></span></td>
                            <td><span class="meta-text"><?= $subject['year_level'] ? $subject['year_level'] . 'Y' : '-' ?></span></td>
                            <td><span class="meta-text"><?= $subject['semester'] ? ($subject['semester'] == 1 ? '1st' : ($subject['semester'] == 2 ? '2nd' : 'Summer')) : '-' ?></span></td>
                            <td><span class="units-badge"><?= $subject['units'] ?></span></td>
                            <td><span class="status-badge status-<?= $subject['status'] ?>"><?= ucfirst($subject['status']) ?></span></td>
                            <td>
                                <div class="actions-cell">
                                    <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                                    </button>
                                    <div class="actions-dropdown">
                                        <a href="?action=edit&id=<?= $subject['subject_id'] ?>" class="action-item">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            Edit Subject
                                        </a>
                                        <div class="action-divider"></div>
                                        <form method="POST" onsubmit="return confirm('Are you sure you want to deactivate this subject?')">
                                            <input type="hidden" name="action" value="delete">
                                            <input type="hidden" name="subject_id" value="<?= $subject['subject_id'] ?>">
                                            <button type="submit" class="action-item action-danger">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                Deactivate
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
        
        <?php else: ?>
        <!-- CREATE/EDIT VIEW -->
        <div class="page-header">
            <div>
                <a href="subjects.php" class="back-link">← Back to Subjects</a>
                <h2><?= $action === 'create' ? 'Add New Subject' : 'Edit Subject' ?></h2>
            </div>
        </div>
        
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <form method="POST" class="form-card">
            <input type="hidden" name="action" value="<?= $action === 'create' ? 'create' : 'update' ?>">
            <?php if ($editSubject): ?><input type="hidden" name="subject_id" value="<?= $editSubject['subject_id'] ?>"><?php endif; ?>
            
            <div class="form-section">
                <h3>📖 Subject Details</h3>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Subject Code <span class="required">*</span></label>
                        <input type="text" name="subject_code" class="form-control" required value="<?= e($editSubject['subject_code'] ?? '') ?>" placeholder="e.g., IT101">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Units</label>
                        <input type="number" name="units" class="form-control" value="<?= e($editSubject['units'] ?? 3) ?>" min="1" max="12">
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Subject Name <span class="required">*</span></label>
                    <input type="text" name="subject_name" class="form-control" required value="<?= e($editSubject['subject_name'] ?? '') ?>" placeholder="e.g., Introduction to Computing">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Program</label>
                    <select name="program_id" class="form-control">
                        <option value="">General (All Programs)</option>
                        <?php foreach ($programs as $prog): ?>
                        <option value="<?= $prog['program_id'] ?>" <?= ($editSubject['program_id'] ?? '') == $prog['program_id'] ? 'selected' : '' ?>><?= e($prog['program_code']) ?> - <?= e($prog['program_name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Year Level</label>
                        <select name="year_level" class="form-control">
                            <option value="">Not Set</option>
                            <option value="1" <?= ($editSubject['year_level'] ?? '') == 1 ? 'selected' : '' ?>>1st Year</option>
                            <option value="2" <?= ($editSubject['year_level'] ?? '') == 2 ? 'selected' : '' ?>>2nd Year</option>
                            <option value="3" <?= ($editSubject['year_level'] ?? '') == 3 ? 'selected' : '' ?>>3rd Year</option>
                            <option value="4" <?= ($editSubject['year_level'] ?? '') == 4 ? 'selected' : '' ?>>4th Year</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Semester</label>
                        <select name="semester" class="form-control">
                            <option value="">Not Set</option>
                            <option value="1" <?= ($editSubject['semester'] ?? '') == 1 ? 'selected' : '' ?>>1st Semester</option>
                            <option value="2" <?= ($editSubject['semester'] ?? '') == 2 ? 'selected' : '' ?>>2nd Semester</option>
                            <option value="3" <?= ($editSubject['semester'] ?? '') == 3 ? 'selected' : '' ?>>Summer</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea name="description" class="form-control" rows="3"><?= e($editSubject['description'] ?? '') ?></textarea>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="status" value="active" <?= ($editSubject['status'] ?? 'active') === 'active' ? 'checked' : '' ?>> Active</label>
                        <label class="radio-label"><input type="radio" name="status" value="inactive" <?= ($editSubject['status'] ?? '') === 'inactive' ? 'checked' : '' ?>> Inactive</label>
                    </div>
                </div>
            </div>
            
            <div class="form-actions">
                <a href="subjects.php" class="btn btn-outline">Cancel</a>
                <button type="submit" class="btn btn-success">💾 <?= $action === 'create' ? 'Create Subject' : 'Save Changes' ?></button>
            </div>
        </form>
        <?php endif; ?>
        
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
    font-size: 24px;
    font-weight: 700;
    color: #1B4D3E;
    margin: 0 0 4px;
}

.text-muted {
    color: #6b7280;
    margin: 0;
    font-size: 14px;
}

.back-link {
    color: #1B4D3E;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
}

.back-link:hover {
    gap: 8px;
    color: #2D6A4F;
}

/* Search / Filters */
.filters-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
}

.filters-form {
    display: flex;
    gap: 14px;
    align-items: flex-end;
}

.filter-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.filter-group label {
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.025em;
}

/* Table Card */
.card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    overflow: hidden;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 24px;
    border-bottom: 1px solid #f0f0f0;
}

.card-title {
    font-size: 16px;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.badge-count {
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
}

.table-responsive {
    overflow-x: auto;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
}

.data-table th,
.data-table td {
    padding: 14px 20px;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
}

.data-table th {
    background: #f9fafb;
    font-weight: 700;
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.data-table tbody tr {
    transition: background 0.15s;
}

.data-table tbody tr:hover {
    background: #f9fafb;
}

.data-table tbody tr:last-child td {
    border-bottom: none;
}

/* Subject Code Badge */
.subject-code {
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 5px 12px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 12px;
    white-space: nowrap;
}

.subject-name {
    font-weight: 600;
    color: #1f2937;
}

.program-text {
    color: #6b7280;
    font-size: 13px;
}

.meta-text {
    color: #6b7280;
    font-size: 13px;
}

.units-badge {
    background: #f3f4f6;
    color: #374151;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 12px;
}

/* Status Badges */
.status-badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
}

.status-active {
    background: #E8F5E9;
    color: #1B4D3E;
}

.status-inactive {
    background: #FEE2E2;
    color: #b91c1c;
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
    width: 34px;
    height: 34px;
    border: 1px solid #e8e8e8;
    background: #fff;
    border-radius: 8px;
    cursor: pointer;
    color: #9ca3af;
    transition: all 0.2s;
}

.btn-actions-toggle:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    color: #374151;
}

.btn-actions-toggle.active {
    background: #f3f4f6;
    border-color: #1B4D3E;
    color: #1B4D3E;
}

.actions-dropdown {
    display: none;
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    min-width: 170px;
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
    color: #374151;
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
    background: #f0fdf4;
    color: #1f2937;
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
    background: #f0f0f0;
    margin: 4px 0;
}

.action-item.action-danger {
    color: #dc2626;
}

.action-item.action-danger:hover {
    background: #fef2f2;
    color: #dc2626;
}

.action-item.action-danger svg {
    stroke: #dc2626;
}

/* Form Card */
.form-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
}

.form-section {
    padding: 28px;
}

.form-section h3 {
    margin: 0 0 24px;
    font-size: 18px;
    color: #1B4D3E;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 10px;
}

.form-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
}

.form-group {
    margin-bottom: 20px;
}

.form-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.025em;
}

.required {
    color: #dc2626;
    font-weight: 700;
}

.radio-group {
    display: flex;
    gap: 24px;
}

.radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 600;
    color: #374151;
    transition: color 0.2s;
}

.radio-label:hover {
    color: #1B4D3E;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 28px;
    background: #f9fafb;
    border-top: 1px solid #e8e8e8;
    border-radius: 0 0 12px 12px;
}

/* Alerts */
.alert {
    padding: 16px 20px;
    border-radius: 10px;
    margin-bottom: 20px;
    font-weight: 600;
}

.alert-success {
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    color: #065f46;
    }

.alert-danger {
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    color: #991b1b;
    }

@media (max-width: 768px) {
    .form-row { grid-template-columns: 1fr; }
    .filters-form { flex-direction: column; }
    .page-header h2 { font-size: 20px; }
}
</style>

<script>
function toggleActions(btn) {
    const dropdown = btn.nextElementSibling;
    const isOpen = dropdown.classList.contains('show');

    document.querySelectorAll('.actions-dropdown.show').forEach(d => {
        d.classList.remove('show');
        d.previousElementSibling.classList.remove('active');
    });

    if (!isOpen) {
        dropdown.classList.add('show');
        btn.classList.add('active');
    }
}

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