<?php
/**
 * Admin - Subject Offerings
 * Manage semester offerings (Updated to use semester table)
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Subject Offerings';
$currentPage = 'subject-offerings';

$action = $_GET['action'] ?? 'list';
$offeringId = $_GET['id'] ?? '';
$semesterFilter = $_GET['semester_id'] ?? '';
$error = '';
$success = '';

// Get subjects and instructors
$subjects = db()->fetchAll("SELECT subject_id, subject_code, subject_name FROM subject WHERE status = 'active' ORDER BY subject_code");
$instructors = db()->fetchAll("SELECT users_id, first_name, last_name, employee_id FROM users WHERE role = 'instructor' AND status = 'active' ORDER BY last_name");

// Get semesters from the new semester table
$semesters = db()->fetchAll(
    "SELECT s.semester_id, s.semester_name, s.academic_year, s.status, st.sem_level
     FROM semester s
     JOIN sem_type st ON s.sem_type_id = st.sem_type_id
     ORDER BY s.academic_year DESC, st.sem_level"
);

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';

    if ($postAction === 'create' || $postAction === 'update') {
        $subjectId = $_POST['subject_id'] ?? '';
        $semesterId = $_POST['semester_id'] ?? '';
        $status = $_POST['status'] ?? 'open';

        if (empty($subjectId) || empty($semesterId)) {
            $error = 'Please fill in all required fields.';
        } else {
            // Check if already exists
            $existing = db()->fetchOne(
                "SELECT subject_offered_id FROM subject_offered WHERE subject_id = ? AND semester_id = ? AND subject_offered_id != ?",
                [$subjectId, $semesterId, $_POST['offering_id'] ?? 0]
            );

            if ($existing) {
                $error = 'This subject is already offered for this semester.';
            } else {
                if ($postAction === 'create') {
                    db()->execute(
                        "INSERT INTO subject_offered (subject_id, semester_id, status, created_at, updated_at)
                         VALUES (?, ?, ?, NOW(), NOW())",
                        [$subjectId, $semesterId, $status]
                    );
                    header("Location: subject-offerings.php?success=created");
                    exit;
                } else {
                    db()->execute(
                        "UPDATE subject_offered SET subject_id = ?, semester_id = ?, status = ?, updated_at = NOW() WHERE subject_offered_id = ?",
                        [$subjectId, $semesterId, $status, $_POST['offering_id']]
                    );
                    header("Location: subject-offerings.php?success=updated");
                    exit;
                }
            }
        }
    }

    if ($postAction === 'delete') {
        $deleteId = (int)$_POST['offering_id'];
        $hasSections = db()->fetchOne("SELECT COUNT(*) as count FROM section WHERE subject_offered_id = ? AND status = 'active'", [$deleteId])['count'];
        if ($hasSections > 0) {
            $error = "Cannot delete offering with $hasSections active sections.";
        } else {
            db()->execute("UPDATE faculty_subject SET status = 'inactive' WHERE subject_offered_id = ?", [$deleteId]);
            db()->execute("UPDATE subject_offered SET status = 'cancelled', updated_at = NOW() WHERE subject_offered_id = ?", [$deleteId]);
            header("Location: subject-offerings.php?success=deleted");
            exit;
        }
    }
}

if (isset($_GET['success'])) {
    $successMessages = ['created' => 'Offering created!', 'updated' => 'Offering updated!', 'deleted' => 'Offering deleted!'];
    $success = $successMessages[$_GET['success']] ?? '';
}

$editOffering = null;
if ($action === 'edit' && $offeringId) {
    $editOffering = db()->fetchOne("SELECT * FROM subject_offered WHERE subject_offered_id = ?", [$offeringId]);
    if (!$editOffering) { header("Location: subject-offerings.php"); exit; }
}

// Build query with semester join
$whereClause = "WHERE 1=1";
$params = [];
if ($semesterFilter) { $whereClause .= " AND so.semester_id = ?"; $params[] = $semesterFilter; }

$offerings = db()->fetchAll(
    "SELECT so.*, s.subject_code, s.subject_name, s.units,
        sem.semester_name, sem.academic_year, st.sem_level,
        (SELECT COUNT(*) FROM section sec WHERE sec.subject_offered_id = so.subject_offered_id) as section_count,
        (SELECT COUNT(*) FROM faculty_subject fs WHERE fs.subject_offered_id = so.subject_offered_id AND fs.status = 'active') as instructor_count,
        (SELECT COUNT(*) FROM student_subject ss JOIN section sec ON ss.section_id = sec.section_id WHERE sec.subject_offered_id = so.subject_offered_id) as student_count
     FROM subject_offered so
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     LEFT JOIN sem_type st ON sem.sem_type_id = st.sem_type_id
     $whereClause
     ORDER BY sem.academic_year DESC, st.sem_level, s.subject_code",
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
                <h2>Subject Offerings</h2>
                <p class="text-muted">Manage semester subject offerings</p>
            </div>
            <a href="?action=create" class="btn btn-success">+ Add Offering</a>
        </div>

        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>

        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group" style="flex:1">
                    <label>Semester</label>
                    <select name="semester_id" class="form-control" onchange="this.form.submit()">
                        <option value="">All Semesters</option>
                        <?php foreach ($semesters as $sem): ?>
                        <option value="<?= $sem['semester_id'] ?>" <?= $semesterFilter == $sem['semester_id'] ? 'selected' : '' ?>>
                            <?= e($sem['semester_name']) ?> (<?= e($sem['academic_year']) ?>)
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <?php if ($semesterFilter): ?>
                <div class="filter-group">
                    <a href="subject-offerings.php" class="btn btn-outline">Clear</a>
                </div>
                <?php endif; ?>
            </form>
        </div>

        <!-- Offerings Table -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">All Offerings <span class="badge-count"><?= count($offerings) ?></span></h3>
            </div>
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Semester</th>
                            <th>Academic Year</th>
                            <th>Units</th>
                            <th>Sections</th>
                            <th>Instructors</th>
                            <th>Students</th>
                            <th>Status</th>
                            <th style="width:60px;text-align:center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($offerings)): ?>
                        <tr><td colspan="9" class="text-center text-muted" style="padding:40px;">No offerings found</td></tr>
                        <?php else: ?>
                        <?php foreach ($offerings as $offering): ?>
                        <tr>
                            <td>
                                <span class="subject-code"><?= e($offering['subject_code']) ?></span>
                                <span class="subject-name"><?= e($offering['subject_name']) ?></span>
                            </td>
                            <td><span class="semester-badge"><?= e($offering['semester_name'] ?? 'N/A') ?></span></td>
                            <td><span class="meta-text"><?= e($offering['academic_year'] ?? 'N/A') ?></span></td>
                            <td><span class="meta-text"><?= $offering['units'] ?></span></td>
                            <td><span class="count-badge"><?= $offering['section_count'] ?></span></td>
                            <td><span class="count-badge"><?= $offering['instructor_count'] ?></span></td>
                            <td><span class="meta-text"><?= $offering['student_count'] ?></span></td>
                            <td><span class="status-badge status-<?= $offering['status'] ?>"><?= ucfirst($offering['status']) ?></span></td>
                            <td>
                                <div class="actions-cell">
                                    <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                                    </button>
                                    <div class="actions-dropdown">
                                        <a href="sections.php?offering_id=<?= $offering['subject_offered_id'] ?>" class="action-item">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                            View Sections
                                        </a>
                                        <a href="?action=edit&id=<?= $offering['subject_offered_id'] ?>" class="action-item">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            Edit Offering
                                        </a>
                                        <div class="action-divider"></div>
                                        <form method="POST" onsubmit="return confirm('Are you sure you want to cancel this offering?')">
                                            <input type="hidden" name="action" value="delete">
                                            <input type="hidden" name="offering_id" value="<?= $offering['subject_offered_id'] ?>">
                                            <button type="submit" class="action-item action-danger">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                Cancel Offering
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
                <a href="subject-offerings.php" class="back-link">← Back to Offerings</a>
                <h2><?= $action === 'create' ? 'Add New Offering' : 'Edit Offering' ?></h2>
            </div>
        </div>

        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>

        <form method="POST" class="form-card">
            <input type="hidden" name="action" value="<?= $action === 'create' ? 'create' : 'update' ?>">
            <?php if ($editOffering): ?><input type="hidden" name="offering_id" value="<?= $editOffering['subject_offered_id'] ?>"><?php endif; ?>

            <div class="form-section">
                <h3>📅 Offering Details</h3>

                <div class="form-group">
                    <label class="form-label">Subject <span class="required">*</span></label>
                    <select name="subject_id" class="form-control" required>
                        <option value="">-- Select Subject --</option>
                        <?php if (empty($subjects)): ?>
                        <option value="" disabled>No active subjects found. Please add subjects first.</option>
                        <?php else: ?>
                        <?php foreach ($subjects as $subj): ?>
                        <option value="<?= $subj['subject_id'] ?>" <?= ($editOffering['subject_id'] ?? '') == $subj['subject_id'] ? 'selected' : '' ?>>
                            <?= e($subj['subject_code']) ?> - <?= e($subj['subject_name']) ?>
                        </option>
                        <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                    <?php if (empty($subjects)): ?>
                    <small style="color:#dc2626;margin-top:8px;display:block">⚠️ No subjects available. Please <a href="subjects.php">add subjects</a> first.</small>
                    <?php endif; ?>
                </div>

                <div class="form-group">
                    <label class="form-label">Semester <span class="required">*</span></label>
                    <select name="semester_id" class="form-control" required>
                        <option value="">-- Select Semester --</option>
                        <?php foreach ($semesters as $sem): ?>
                        <option value="<?= $sem['semester_id'] ?>" <?= ($editOffering['semester_id'] ?? '') == $sem['semester_id'] ? 'selected' : '' ?>>
                            <?= e($sem['semester_name']) ?> (<?= e($sem['academic_year']) ?>) <?= $sem['status'] === 'active' ? '- ACTIVE' : '' ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                    <?php if (empty($semesters)): ?>
                    <small style="color:#dc2626;margin-top:8px;display:block">⚠️ No semesters found. Please add semesters first.</small>
                    <?php endif; ?>
                </div>

                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="status" value="open" <?= ($editOffering['status'] ?? 'open') === 'open' ? 'checked' : '' ?>> Open</label>
                        <label class="radio-label"><input type="radio" name="status" value="closed" <?= ($editOffering['status'] ?? '') === 'closed' ? 'checked' : '' ?>> Closed</label>
                    </div>
                </div>
            </div>

            <div class="form-actions">
                <a href="subject-offerings.php" class="btn btn-outline">Cancel</a>
                <button type="submit" class="btn btn-success">💾 <?= $action === 'create' ? 'Create Offering' : 'Save Changes' ?></button>
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

/* Filters */
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
    flex-wrap: wrap;
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

/* Subject display */
.subject-code {
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 5px 12px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 12px;
    display: inline-block;
}

.subject-name {
    display: block;
    font-size: 13px;
    color: #6b7280;
    margin-top: 5px;
    font-weight: 500;
}

.semester-badge {
    background: #EDE9FE;
    color: #5B21B6;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
}

.meta-text {
    color: #6b7280;
    font-size: 13px;
}

.count-badge {
    background: #f3f4f6;
    color: #374151;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 12px;
    display: inline-block;
}

/* Status Badges */
.status-badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
}

.status-open {
    background: #E8F5E9;
    color: #1B4D3E;
}

.status-closed {
    background: #FEE2E2;
    color: #b91c1c;
}

.status-cancelled {
    background: #f3f4f6;
    color: #6b7280;
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
    grid-template-columns: 1fr 1fr;
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
