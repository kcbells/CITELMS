<?php
/**
 * Admin - Programs Management
 * Manage academic programs
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Programs';
$currentPage = 'programs';

$action = $_GET['action'] ?? 'list';
$programId = $_GET['id'] ?? '';
$error = '';
$success = '';

// Get departments
$departments = db()->fetchAll("SELECT department_id, department_name FROM department ORDER BY department_name");

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    
    if ($postAction === 'create' || $postAction === 'update') {
        $departmentId = $_POST['department_id'] ?? '';
        $programName = trim($_POST['program_name'] ?? '');
        $programCode = trim($_POST['program_code'] ?? '');
        $totalUnits = (int)($_POST['total_units'] ?? 0);
        $description = trim($_POST['description'] ?? '');
        $status = $_POST['status'] ?? 'active';
        
        if (empty($departmentId) || empty($programName) || empty($programCode)) {
            $error = 'Please fill in all required fields.';
        } else {
            // Check code uniqueness
            $existing = db()->fetchOne(
                "SELECT program_id FROM program WHERE program_code = ? AND program_id != ?",
                [$programCode, $_POST['program_id'] ?? 0]
            );
            
            if ($existing) {
                $error = 'Program code already exists.';
            } else {
                if ($postAction === 'create') {
                    db()->execute(
                        "INSERT INTO program (department_id, program_name, program_code, total_units, description, status, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
                        [$departmentId, $programName, $programCode, $totalUnits, $description, $status]
                    );
                    // Also insert into junction table
                    $newProgId = pdo()->lastInsertId();
                    db()->execute(
                        "INSERT IGNORE INTO department_program (department_id, program_id) VALUES (?, ?)",
                        [$departmentId, $newProgId]
                    );
                    header("Location: programs.php?success=created");
                    exit;
                } else {
                    db()->execute(
                        "UPDATE program SET department_id = ?, program_name = ?, program_code = ?, total_units = ?, description = ?, status = ?, updated_at = NOW() WHERE program_id = ?",
                        [$departmentId, $programName, $programCode, $totalUnits, $description, $status, $_POST['program_id']]
                    );
                    // Also update junction table
                    $updProgId = (int)$_POST['program_id'];
                    db()->execute("DELETE FROM department_program WHERE program_id = ?", [$updProgId]);
                    db()->execute(
                        "INSERT INTO department_program (department_id, program_id) VALUES (?, ?)",
                        [$departmentId, $updProgId]
                    );
                    header("Location: programs.php?success=updated");
                    exit;
                }
            }
        }
    }
    
    if ($postAction === 'delete') {
        $deleteId = (int)$_POST['program_id'];
        // Check if program has active users
        $hasUsers = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE program_id = ? AND status = 'active'", [$deleteId])['count'];
        if ($hasUsers > 0) {
            $error = "Cannot delete program with $hasUsers active enrolled users.";
        } else {
            // Soft delete - set status to inactive instead of removing record
            db()->execute("UPDATE program SET status = 'inactive', updated_at = NOW() WHERE program_id = ?", [$deleteId]);
            header("Location: programs.php?success=deleted");
            exit;
        }
    }
}

// Handle success messages
if (isset($_GET['success'])) {
    $successMessages = ['created' => 'Program created!', 'updated' => 'Program updated!', 'deleted' => 'Program deleted!'];
    $success = $successMessages[$_GET['success']] ?? '';
}

// Get program for editing
$editProgram = null;
if ($action === 'edit' && $programId) {
    $editProgram = db()->fetchOne("SELECT * FROM program WHERE program_id = ?", [$programId]);
    if (!$editProgram) { header("Location: programs.php"); exit; }
    // Get department_id from junction table
    $deptLink = db()->fetchOne("SELECT department_id FROM department_program WHERE program_id = ? LIMIT 1", [$programId]);
    if ($deptLink) $editProgram['department_id'] = $deptLink['department_id'];
}

// Get all programs
$programs = db()->fetchAll(
    "SELECT p.*, d.department_name,
        (SELECT COUNT(*) FROM users u WHERE u.program_id = p.program_id) as student_count
     FROM program p
     LEFT JOIN department_program dp ON p.program_id = dp.program_id
     LEFT JOIN department d ON dp.department_id = d.department_id
     ORDER BY p.program_code"
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
                <h2>Programs</h2>
                <p class="text-muted">Manage academic programs</p>
            </div>
            <a href="?action=create" class="btn btn-success">+ Add Program</a>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <div class="programs-grid">
            <?php if (empty($programs)): ?>
            <div class="empty-state">
                <h3>No Programs Yet</h3>
                <p>Add your first academic program to get started.</p>
                <a href="?action=create" class="btn btn-success" style="margin-top:16px">+ Add Program</a>
            </div>
            <?php else: ?>
            <?php foreach ($programs as $program): ?>
            <div class="program-card">
                <div class="program-top">
                    <div>
                        <span class="program-code"><?= e($program['program_code']) ?></span>
                        <span class="status-badge status-<?= $program['status'] ?>"><?= ucfirst($program['status']) ?></span>
                    </div>
                    <div class="actions-cell">
                        <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                        </button>
                        <div class="actions-dropdown">
                            <a href="?action=edit&id=<?= $program['program_id'] ?>" class="action-item">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Edit Program
                            </a>
                            <div class="action-divider"></div>
                            <form method="POST" onsubmit="return confirm('Are you sure you want to deactivate this program?')">
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="program_id" value="<?= $program['program_id'] ?>">
                                <button type="submit" class="action-item action-danger">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    Deactivate
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
                <h3 class="program-name"><?= e($program['program_name']) ?></h3>
                <p class="program-dept"><?= e($program['department_name'] ?? '—') ?></p>
                <div class="program-stats">
                    <div class="pstat"><span class="pstat-num"><?= $program['student_count'] ?></span><span class="pstat-label">Students</span></div>
                    <div class="pstat"><span class="pstat-num"><?= $program['total_units'] ?></span><span class="pstat-label">Units</span></div>
                </div>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>
        
        <?php else: ?>
        <!-- CREATE/EDIT VIEW -->
        <div class="page-header">
            <div>
                <a href="programs.php" class="back-link">← Back to Programs</a>
                <h2><?= $action === 'create' ? 'Add New Program' : 'Edit Program' ?></h2>
            </div>
        </div>
        
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <form method="POST" class="form-card">
            <input type="hidden" name="action" value="<?= $action === 'create' ? 'create' : 'update' ?>">
            <?php if ($editProgram): ?><input type="hidden" name="program_id" value="<?= $editProgram['program_id'] ?>"><?php endif; ?>
            
            <div class="form-section">
                <h3>📚 Program Details</h3>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Program Code <span class="required">*</span></label>
                        <input type="text" name="program_code" class="form-control" required value="<?= e($editProgram['program_code'] ?? '') ?>" placeholder="e.g., BSIT">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Total Units</label>
                        <input type="number" name="total_units" class="form-control" value="<?= e($editProgram['total_units'] ?? 150) ?>" min="0">
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Program Name <span class="required">*</span></label>
                    <input type="text" name="program_name" class="form-control" required value="<?= e($editProgram['program_name'] ?? '') ?>" placeholder="e.g., Bachelor of Science in Information Technology">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Department <span class="required">*</span></label>
                    <select name="department_id" class="form-control" required>
                        <option value="">Select Department</option>
                        <?php foreach ($departments as $dept): ?>
                        <option value="<?= $dept['department_id'] ?>" <?= ($editProgram['department_id'] ?? '') == $dept['department_id'] ? 'selected' : '' ?>><?= e($dept['department_name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea name="description" class="form-control" rows="3"><?= e($editProgram['description'] ?? '') ?></textarea>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="status" value="active" <?= ($editProgram['status'] ?? 'active') === 'active' ? 'checked' : '' ?>> Active</label>
                        <label class="radio-label"><input type="radio" name="status" value="inactive" <?= ($editProgram['status'] ?? '') === 'inactive' ? 'checked' : '' ?>> Inactive</label>
                    </div>
                </div>
            </div>
            
            <div class="form-actions">
                <a href="programs.php" class="btn btn-outline">Cancel</a>
                <button type="submit" class="btn btn-success">💾 <?= $action === 'create' ? 'Create Program' : 'Save Changes' ?></button>
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
    color: var(--gray-500);
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

/* Programs Grid */
.programs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 20px;
}

.program-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s;
    position: relative;
}

.program-card:hover {
    border-color: #1B4D3E;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.program-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
}

.program-code {
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 700;
}

.program-name {
    margin: 0 0 8px;
    font-size: 17px;
    color: #1f2937;
    font-weight: 700;
    line-height: 1.3;
}

.program-dept {
    margin: 0 0 18px;
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
}

.program-stats {
    display: flex;
    gap: 20px;
    padding: 16px 0 0;
    border-top: 1px solid #f0f0f0;
}

.pstat {
    text-align: center;
    flex: 1;
}

.pstat-num {
    display: block;
    font-size: 24px;
    font-weight: 800;
    color: #1B4D3E;
}

.pstat-label {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
    font-weight: 600;
}

/* Status Badges */
.status-badge {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    display: inline-block;
    margin-left: 8px;
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

/* Empty State */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    grid-column: 1 / -1;
}

.empty-state h3 {
    font-size: 18px;
    color: #374151;
    margin: 0 0 8px;
}

.empty-state p {
    color: #6b7280;
    margin: 0;
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
    .programs-grid { grid-template-columns: 1fr; }
    .page-header h2 { font-size: 20px; }
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