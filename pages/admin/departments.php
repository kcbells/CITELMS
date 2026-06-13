<?php
/**
 * Admin - Departments Management
 * Manage academic departments
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Departments';
$currentPage = 'departments';

$action = $_GET['action'] ?? 'list';
$departmentId = $_GET['id'] ?? '';
$error = '';
$success = '';

// Get campuses
$campuses = db()->fetchAll("SELECT campus_id, campus_name FROM campus ORDER BY campus_name");

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';

    if ($postAction === 'create' || $postAction === 'update') {
        $campusId = $_POST['campus_id'] ?? '';
        $departmentName = trim($_POST['department_name'] ?? '');
        $departmentCode = trim($_POST['department_code'] ?? '');
        $description = trim($_POST['description'] ?? '');
        $status = $_POST['status'] ?? 'active';

        if (empty($campusId) || empty($departmentName) || empty($departmentCode)) {
            $error = 'Please fill in all required fields.';
        } else {
            // Check code uniqueness
            $existing = db()->fetchOne(
                "SELECT department_id FROM department WHERE department_code = ? AND department_id != ?",
                [$departmentCode, $_POST['department_id'] ?? 0]
            );

            if ($existing) {
                $error = 'Department code already exists.';
            } else {
                if ($postAction === 'create') {
                    db()->execute(
                        "INSERT INTO department (campus_id, department_name, department_code, description, status, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
                        [$campusId, $departmentName, $departmentCode, $description, $status]
                    );
                    header("Location: departments.php?success=created");
                    exit;
                } else {
                    db()->execute(
                        "UPDATE department SET campus_id = ?, department_name = ?, department_code = ?, description = ?, status = ?, updated_at = NOW()
                         WHERE department_id = ?",
                        [$campusId, $departmentName, $departmentCode, $description, $status, $_POST['department_id']]
                    );
                    header("Location: departments.php?success=updated");
                    exit;
                }
            }
        }
    }

    if ($postAction === 'delete') {
        $deleteId = (int)$_POST['department_id'];
        // Check if department has active programs
        $hasPrograms = db()->fetchOne("SELECT COUNT(*) as count FROM department_program dp JOIN program p ON dp.program_id = p.program_id WHERE dp.department_id = ? AND p.status = 'active'", [$deleteId])['count'];
        if ($hasPrograms > 0) {
            $error = "Cannot delete department with $hasPrograms active programs.";
        } else {
            // Soft delete - set status to inactive instead of removing record
            db()->execute("UPDATE department SET status = 'inactive', updated_at = NOW() WHERE department_id = ?", [$deleteId]);
            header("Location: departments.php?success=deleted");
            exit;
        }
    }
}

// Handle success messages
if (isset($_GET['success'])) {
    $successMessages = [
        'created' => 'Department created successfully!',
        'updated' => 'Department updated successfully!',
        'deleted' => 'Department deleted successfully!'
    ];
    $success = $successMessages[$_GET['success']] ?? '';
}

// Get department for editing
$editDepartment = null;
if ($action === 'edit' && $departmentId) {
    $editDepartment = db()->fetchOne("SELECT * FROM department WHERE department_id = ?", [$departmentId]);
    if (!$editDepartment) {
        header("Location: departments.php");
        exit;
    }
}

// Get all departments with campus info and program count
$departments = db()->fetchAll(
    "SELECT d.*, c.campus_name,
        (SELECT COUNT(*) FROM department_program dp WHERE dp.department_id = d.department_id) as program_count
     FROM department d
     LEFT JOIN campus c ON d.campus_id = c.campus_id
     ORDER BY d.department_name"
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">

        <div class="page-header">
            <div>
                <h2>Departments</h2>
                <p class="text-muted">Manage academic departments and organizational units</p>
            </div>
            <button class="btn btn-success" onclick="openModal()">+ Add Department</button>
        </div>

        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>

        <!-- Departments Table -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">All Departments <span class="badge-count"><?= count($departments) ?></span></h3>
            </div>
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Department</th>
                            <th>Campus</th>
                            <th>Programs</th>
                            <th>Status</th>
                            <th style="width: 60px; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($departments)): ?>
                        <tr><td colspan="6" class="text-center text-muted" style="padding:40px;">No departments found</td></tr>
                        <?php else: ?>
                        <?php foreach ($departments as $dept): ?>
                        <tr>
                            <td><span class="dept-code"><?= e($dept['department_code']) ?></span></td>
                            <td>
                                <div class="dept-name"><?= e($dept['department_name']) ?></div>
                                <?php if ($dept['description']): ?>
                                <div class="dept-desc"><?= e($dept['description']) ?></div>
                                <?php endif; ?>
                            </td>
                            <td><span class="campus-text"><?= e($dept['campus_name'] ?? '—') ?></span></td>
                            <td><span class="program-badge"><?= $dept['program_count'] ?> programs</span></td>
                            <td><span class="status-badge status-<?= $dept['status'] ?>"><?= ucfirst($dept['status']) ?></span></td>
                            <td>
                                <div class="actions-cell">
                                    <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                                    </button>
                                    <div class="actions-dropdown">
                                        <button class="action-item" onclick='editDepartment(<?= json_encode($dept) ?>)'>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            Edit Department
                                        </button>
                                        <div class="action-divider"></div>
                                        <button class="action-item action-danger" onclick="confirmDelete(<?= $dept['department_id'] ?>, '<?= e($dept['department_name']) ?>')">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                            Deactivate
                                        </button>
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

    </div>
</main>

<!-- Create/Edit Modal -->
<div class="modal" id="departmentModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="modalTitle">Add Department</h3>
            <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <form method="POST" id="departmentForm">
            <input type="hidden" name="action" id="formAction" value="create">
            <input type="hidden" name="department_id" id="departmentId">

            <div class="modal-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="campus_id">Campus <span class="required">*</span></label>
                        <select name="campus_id" id="campus_id" class="form-control" required>
                            <option value="">-- Select Campus --</option>
                            <?php foreach ($campuses as $campus): ?>
                            <option value="<?= $campus['campus_id'] ?>"><?= e($campus['campus_name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="department_code">Department Code <span class="required">*</span></label>
                        <input type="text" name="department_code" id="department_code" class="form-control" placeholder="e.g., CIT" required>
                    </div>
                </div>

                <div class="form-group">
                    <label for="department_name">Department Name <span class="required">*</span></label>
                    <input type="text" name="department_name" id="department_name" class="form-control" placeholder="e.g., College of Information Technology" required>
                </div>

                <div class="form-group">
                    <label for="description">Description</label>
                    <textarea name="description" id="description" class="form-control" rows="3" placeholder="Brief description of the department"></textarea>
                </div>

                <div class="form-group">
                    <label for="status">Status</label>
                    <select name="status" id="status" class="form-control">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-success">Save Department</button>
            </div>
        </form>
    </div>
</div>

<!-- Delete Confirmation Modal -->
<form method="POST" id="deleteForm">
    <input type="hidden" name="action" value="delete">
    <input type="hidden" name="department_id" id="deleteDepartmentId">
</form>

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
.text-muted { color: #6b7280; margin: 0; font-size: 14px; }

/* Card & Table */
.card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    overflow: visible;
}
.card-header {
    padding: 16px 20px;
    border-bottom: 1px solid #e8e8e8;
}
.card-title {
    font-size: 15px;
    font-weight: 600;
    color: #1B4D3E;
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
.table-responsive { overflow-x: auto; overflow-y: visible; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 14px 18px; text-align: left; border-bottom: 1px solid #f3f4f6; }
.data-table th {
    background: #f8faf9;
    font-weight: 600;
    font-size: 12px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.data-table tbody tr { transition: background 0.15s ease; }
.data-table tbody tr:hover { background: #f8faf9; }
.data-table tbody tr:last-child td { border-bottom: none; }

/* Department cells */
.dept-code {
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: monospace;
    letter-spacing: 0.03em;
}
.dept-name { font-weight: 600; color: #111827; font-size: 14px; }
.dept-desc { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.campus-text { font-size: 13px; color: #374151; }
.program-badge {
    background: #DBEAFE;
    color: #1e40af;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    display: inline-block;
}

/* Status Badges */
.status-badge {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    display: inline-block;
}
.status-active { background: #E8F5E9; color: #15803d; }
.status-inactive { background: #FEE2E2; color: #b91c1c; }

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
    border: 1px solid #e8e8e8;
    background: #fff;
    border-radius: 8px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.2s;
}
.btn-actions-toggle:hover { background: #f3f4f6; border-color: #d1d5db; color: #374151; }
.btn-actions-toggle.active { background: #f3f4f6; border-color: #1B4D3E; color: #1B4D3E; }
.actions-dropdown {
    display: none;
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    min-width: 180px;
    z-index: 100;
    padding: 6px;
}
.actions-dropdown.show { display: block; }
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
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    transition: background 0.15s;
}
.action-item:hover { background: #f3f4f6; color: #111827; }
.action-item svg { flex-shrink: 0; opacity: 0.6; }
.action-item:hover svg { opacity: 1; }
.action-divider { height: 1px; background: #e8e8e8; margin: 4px 0; }
.action-item.action-danger { color: #dc2626; }
.action-item.action-danger:hover { background: #fef2f2; }
.action-item.action-danger svg { stroke: #dc2626; }

/* Modal */
.modal {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4);
    z-index: 9999;
    align-items: center;
    justify-content: center;
}
.modal.active { display: flex; }
.modal-content {
    background: #fff;
    border-radius: 12px;
    width: 90%;
    max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
}
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e8e8e8;
}
.modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #1B4D3E;
}
.modal-close {
    background: transparent;
    border: none;
    font-size: 24px;
    color: #9ca3af;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
}
.modal-close:hover { background: #f3f4f6; color: #374151; }
.modal-body { padding: 24px; }
.modal-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 16px 24px;
    border-top: 1px solid #e8e8e8;
    background: #f8faf9;
    border-radius: 0 0 12px 12px;
}

/* Form */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.form-group label {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}
.required { color: #dc2626; font-weight: 700; }
textarea.form-control { resize: vertical; min-height: 80px; }

/* Alerts */
.alert {
    padding: 14px 20px;
    border-radius: 10px;
    margin-bottom: 20px;
    font-weight: 600;
    font-size: 14px;
}
.alert-success { background: #E8F5E9; color: #1B4D3E; }
.alert-danger { background: #FEE2E2; color: #991b1b; }

@media (max-width: 768px) {
    .form-grid { grid-template-columns: 1fr; }
    .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>

<script>
/* Actions dropdown toggle */
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

function openModal() {
    document.getElementById('departmentModal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Add Department';
    document.getElementById('formAction').value = 'create';
    document.getElementById('departmentForm').reset();
    document.getElementById('departmentId').value = '';
}

function closeModal() {
    document.getElementById('departmentModal').classList.remove('active');
}

function editDepartment(dept) {
    document.getElementById('departmentModal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Edit Department';
    document.getElementById('formAction').value = 'update';
    document.getElementById('departmentId').value = dept.department_id;
    document.getElementById('campus_id').value = dept.campus_id;
    document.getElementById('department_code').value = dept.department_code;
    document.getElementById('department_name').value = dept.department_name;
    document.getElementById('description').value = dept.description || '';
    document.getElementById('status').value = dept.status;
}

function confirmDelete(id, name) {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        document.getElementById('deleteDepartmentId').value = id;
        document.getElementById('deleteForm').submit();
    }
}

window.onclick = function(event) {
    const modal = document.getElementById('departmentModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Open edit modal if editing
<?php if ($editDepartment): ?>
editDepartment(<?= json_encode($editDepartment) ?>);
<?php endif; ?>
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
