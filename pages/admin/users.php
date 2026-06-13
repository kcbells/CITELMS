<?php
/**
 * Admin - Users Management
 * CRUD operations for all user roles
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'User Management';
$currentPage = 'users';

$action = $_GET['action'] ?? 'list';
$userId = $_GET['id'] ?? '';
$search = $_GET['search'] ?? '';
$roleFilter = $_GET['role'] ?? '';
$statusFilter = $_GET['status'] ?? '';

$error = '';
$success = '';

// Get departments and programs for forms
$departments = db()->fetchAll("SELECT department_id, department_name FROM department ORDER BY department_name");
$programs = db()->fetchAll(
    "SELECT p.program_id, p.program_code, p.program_name, dp.department_id
     FROM program p
     LEFT JOIN department_program dp ON p.program_id = dp.program_id
     ORDER BY p.program_code"
);

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    
    if ($postAction === 'create' || $postAction === 'update') {
        $firstName = trim($_POST['first_name'] ?? '');
        $lastName = trim($_POST['last_name'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $role = $_POST['role'] ?? 'student';
        $status = $_POST['status'] ?? 'active';
        $departmentId = $_POST['department_id'] ?: null;
        $programId = $_POST['program_id'] ?: null;
        $employeeId = trim($_POST['employee_id'] ?? '') ?: null;
        $studentId = trim($_POST['student_id'] ?? '') ?: null;
        $password = $_POST['password'] ?? '';

        // Auto-sync department from program's department
        if ($programId) {
            $progDept = db()->fetchOne(
                "SELECT dp.department_id FROM department_program dp WHERE dp.program_id = ? LIMIT 1",
                [$programId]
            );
            if ($progDept) $departmentId = $progDept['department_id'];
        }

        if (empty($firstName) || empty($lastName) || empty($email)) {
            $error = 'Please fill in all required fields.';
        } elseif ($postAction === 'create' && empty($password)) {
            $error = 'Password is required for new users.';
        } elseif (($role === 'dean' || $role === 'instructor') && empty($departmentId)) {
            $error = 'Department is required for Dean and Instructor roles.';
        } else {
            // Check email uniqueness
            $existing = db()->fetchOne(
                "SELECT users_id FROM users WHERE email = ? AND users_id != ?",
                [$email, $_POST['user_id'] ?? 0]
            );
            
            if ($existing) {
                $error = 'Email already exists.';
            } else {
                if ($postAction === 'create') {
                    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
                    db()->execute(
                        "INSERT INTO users (first_name, last_name, email, password, role, status, department_id, program_id, employee_id, student_id, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                        [$firstName, $lastName, $email, $hashedPassword, $role, $status, $departmentId, $programId, $employeeId, $studentId]
                    );
                    header("Location: users.php?success=created");
                    exit;
                } else {
                    $updateQuery = "UPDATE users SET first_name = ?, last_name = ?, email = ?, role = ?, status = ?, department_id = ?, program_id = ?, employee_id = ?, student_id = ?, updated_at = NOW()";
                    $params = [$firstName, $lastName, $email, $role, $status, $departmentId, $programId, $employeeId, $studentId];
                    
                    if (!empty($password)) {
                        $updateQuery .= ", password = ?";
                        $params[] = password_hash($password, PASSWORD_DEFAULT);
                    }
                    
                    $updateQuery .= " WHERE users_id = ?";
                    $params[] = $_POST['user_id'];
                    
                    db()->execute($updateQuery, $params);
                    header("Location: users.php?success=updated");
                    exit;
                }
            }
        }
    }
    
    if ($postAction === 'delete') {
        $deleteId = (int)$_POST['user_id'];
        // Don't allow deleting yourself
        if ($deleteId !== Auth::id()) {
            // Soft delete - set status to inactive instead of removing record
            db()->execute("UPDATE users SET status = 'inactive', updated_at = NOW() WHERE users_id = ?", [$deleteId]);
            header("Location: users.php?success=deleted");
            exit;
        } else {
            $error = 'You cannot delete your own account.';
        }
    }
}

// Handle success messages
if (isset($_GET['success'])) {
    $successMessages = ['created' => 'User created successfully!', 'updated' => 'User updated successfully!', 'deleted' => 'User deleted successfully!'];
    $success = $successMessages[$_GET['success']] ?? '';
}

// Get user for editing
$editUser = null;
if ($action === 'edit' && $userId) {
    $editUser = db()->fetchOne("SELECT * FROM users WHERE users_id = ?", [$userId]);
    if (!$editUser) { header("Location: users.php"); exit; }
}

// Build query for listing
$whereClause = "WHERE 1=1";
$params = [];

if ($search) {
    $whereClause .= " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ? OR u.student_id LIKE ?)";
    $searchTerm = "%$search%";
    $params = array_merge($params, [$searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm]);
}
if ($roleFilter) {
    $whereClause .= " AND u.role = ?";
    $params[] = $roleFilter;
}
if ($statusFilter) {
    $whereClause .= " AND u.status = ?";
    $params[] = $statusFilter;
}

$users = db()->fetchAll(
    "SELECT u.*, d.department_name, p.program_code 
     FROM users u 
     LEFT JOIN department d ON u.department_id = d.department_id
     LEFT JOIN program p ON u.program_id = p.program_id
     $whereClause 
     ORDER BY u.created_at DESC",
    $params
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <?php if ($action === 'list'): ?>
        <!-- LIST VIEW -->
        <div class="page-header">
            <div>
                <h2>User Management</h2>
                <p class="text-muted">Manage all system users</p>
            </div>
            <a href="?action=create" class="btn btn-success">+ Add User</a>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group">
                    <label>Search</label>
                    <input type="text" name="search" class="form-control" placeholder="Name, email, ID..." value="<?= e($search) ?>">
                </div>
                <div class="filter-group">
                    <label>Role</label>
                    <select name="role" class="form-control" onchange="this.form.submit()">
                        <option value="">All Roles</option>
                        <option value="admin" <?= $roleFilter === 'admin' ? 'selected' : '' ?>>Admin</option>
                        <option value="dean" <?= $roleFilter === 'dean' ? 'selected' : '' ?>>Dean</option>
                        <option value="instructor" <?= $roleFilter === 'instructor' ? 'selected' : '' ?>>Instructor</option>
                        <option value="student" <?= $roleFilter === 'student' ? 'selected' : '' ?>>Student</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Status</label>
                    <select name="status" class="form-control" onchange="this.form.submit()">
                        <option value="">All Status</option>
                        <option value="active" <?= $statusFilter === 'active' ? 'selected' : '' ?>>Active</option>
                        <option value="inactive" <?= $statusFilter === 'inactive' ? 'selected' : '' ?>>Inactive</option>
                        <option value="pending" <?= $statusFilter === 'pending' ? 'selected' : '' ?>>Pending</option>
                    </select>
                </div>
                <?php if ($search || $roleFilter || $statusFilter): ?>
                <div class="filter-group">
                    <a href="users.php" class="btn btn-outline">Clear</a>
                </div>
                <?php endif; ?>
            </form>
        </div>
        
        <!-- Users Table -->
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">All Users <span class="badge badge-count"><?= count($users) ?></span></h3>
            </div>
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>ID</th>
                            <th>Role</th>
                            <th>Department/Program</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th style="width: 60px; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($users)): ?>
                        <tr><td colspan="7" class="text-center text-muted">No users found</td></tr>
                        <?php else: ?>
                        <?php foreach ($users as $user): ?>
                        <tr>
                            <td>
                                <div class="user-cell">
                                    <div class="user-avatar avatar-<?= $user['role'] ?>"><?= strtoupper(substr($user['first_name'], 0, 1) . substr($user['last_name'], 0, 1)) ?></div>
                                    <div>
                                        <span class="user-name"><?= e($user['first_name'] . ' ' . $user['last_name']) ?></span>
                                        <span class="user-email"><?= e($user['email']) ?></span>
                                    </div>
                                </div>
                            </td>
                            <td><span class="user-id-text"><?= e($user['employee_id'] ?? $user['student_id'] ?? '—') ?></span></td>
                            <td><span class="role-badge role-<?= $user['role'] ?>"><?= ucfirst($user['role']) ?></span></td>
                            <td><span class="dept-text"><?= e($user['department_name'] ?? $user['program_code'] ?? '—') ?></span></td>
                            <td><span class="status-badge status-<?= $user['status'] ?>"><?= ucfirst($user['status']) ?></span></td>
                            <td><span class="date-text"><?= date('M d, Y', strtotime($user['created_at'])) ?></span></td>
                            <td>
                                <div class="actions-cell">
                                    <button class="btn-actions-toggle" onclick="toggleActions(this)" title="Actions">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="13" r="1.5" fill="currentColor"/></svg>
                                    </button>
                                    <div class="actions-dropdown">
                                        <a href="?action=edit&id=<?= $user['users_id'] ?>" class="action-item">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            Edit User
                                        </a>
                                        <?php if ($user['users_id'] !== Auth::id()): ?>
                                        <div class="action-divider"></div>
                                        <form method="POST" onsubmit="return confirm('Are you sure you want to deactivate this user?')">
                                            <input type="hidden" name="action" value="delete">
                                            <input type="hidden" name="user_id" value="<?= $user['users_id'] ?>">
                                            <button type="submit" class="action-item action-danger">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                                Deactivate
                                            </button>
                                        </form>
                                        <?php endif; ?>
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
                <a href="users.php" class="back-link">← Back to Users</a>
                <h2><?= $action === 'create' ? 'Add New User' : 'Edit User' ?></h2>
            </div>
        </div>
        
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <form method="POST" class="form-card">
            <input type="hidden" name="action" value="<?= $action === 'create' ? 'create' : 'update' ?>">
            <?php if ($editUser): ?><input type="hidden" name="user_id" value="<?= $editUser['users_id'] ?>"><?php endif; ?>
            
            <div class="form-section">
                <h3>👤 Personal Information</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">First Name <span class="required">*</span></label>
                        <input type="text" name="first_name" class="form-control" required value="<?= e($editUser['first_name'] ?? $_POST['first_name'] ?? '') ?>">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name <span class="required">*</span></label>
                        <input type="text" name="last_name" class="form-control" required value="<?= e($editUser['last_name'] ?? $_POST['last_name'] ?? '') ?>">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Email <span class="required">*</span></label>
                    <input type="email" name="email" class="form-control" required value="<?= e($editUser['email'] ?? $_POST['email'] ?? '') ?>">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Password <?= $action === 'create' ? '<span class="required">*</span>' : '(leave blank to keep current)' ?></label>
                        <input type="password" name="password" class="form-control" <?= $action === 'create' ? 'required' : '' ?>>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Role <span class="required">*</span></label>
                        <select name="role" class="form-control" required id="roleSelect">
                            <option value="student" <?= ($editUser['role'] ?? '') === 'student' ? 'selected' : '' ?>>Student</option>
                            <option value="instructor" <?= ($editUser['role'] ?? '') === 'instructor' ? 'selected' : '' ?>>Instructor</option>
                            <option value="dean" <?= ($editUser['role'] ?? '') === 'dean' ? 'selected' : '' ?>>Dean</option>
                            <option value="admin" <?= ($editUser['role'] ?? '') === 'admin' ? 'selected' : '' ?>>Admin</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="form-section">
                <h3>🏫 Academic Information</h3>
                <div class="form-row">
                    <div class="form-group" id="employeeIdGroup">
                        <label class="form-label">Employee ID</label>
                        <input type="text" name="employee_id" class="form-control" value="<?= e($editUser['employee_id'] ?? '') ?>" placeholder="For instructors/admins">
                    </div>
                    <div class="form-group" id="studentIdGroup">
                        <label class="form-label">Student ID</label>
                        <input type="text" name="student_id" class="form-control" value="<?= e($editUser['student_id'] ?? '') ?>" placeholder="For students">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group" id="departmentGroup">
                        <label class="form-label">Department <span class="required dept-required" style="display:none">*</span></label>
                        <select name="department_id" class="form-control" id="departmentSelect">
                            <option value="">Select Department</option>
                            <?php foreach ($departments as $dept): ?>
                            <option value="<?= $dept['department_id'] ?>" <?= ($editUser['department_id'] ?? '') == $dept['department_id'] ? 'selected' : '' ?>><?= e($dept['department_name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <small class="dept-hint" style="display:none;color:#d97706;margin-top:6px;">Required for Dean & Instructor roles. Dean will oversee this department.</small>
                    </div>
                    <div class="form-group" id="programGroup">
                        <label class="form-label">Program <span class="required program-required" style="display:none">*</span></label>
                        <select name="program_id" class="form-control" id="programSelect">
                            <option value="">Select Program</option>
                            <?php foreach ($programs as $prog): ?>
                            <option value="<?= $prog['program_id'] ?>" data-dept="<?= $prog['department_id'] ?>" <?= ($editUser['program_id'] ?? '') == $prog['program_id'] ? 'selected' : '' ?>><?= e($prog['program_code']) ?> - <?= e($prog['program_name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <small class="program-hint" style="display:none;color:#3b82f6;margin-top:6px;">Required for Students to enroll in courses.</small>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="status" value="active" <?= ($editUser['status'] ?? 'active') === 'active' ? 'checked' : '' ?>> Active</label>
                        <label class="radio-label"><input type="radio" name="status" value="inactive" <?= ($editUser['status'] ?? '') === 'inactive' ? 'checked' : '' ?>> Inactive</label>
                        <label class="radio-label"><input type="radio" name="status" value="pending" <?= ($editUser['status'] ?? '') === 'pending' ? 'checked' : '' ?>> Pending</label>
                    </div>
                </div>
            </div>
            
            <div class="form-actions">
                <a href="users.php" class="btn btn-outline">Cancel</a>
                <button type="submit" class="btn btn-success">💾 <?= $action === 'create' ? 'Create User' : 'Save Changes' ?></button>
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
.text-muted { color: #6b7280; margin: 0; font-size: 14px; }
.back-link {
    color: #1B4D3E;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    font-weight: 600;
    text-decoration: none;
}
.back-link:hover { color: #2D6A4F; gap: 8px; }

/* Filters */
.filters-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
}
.filters-form { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 6px; }
.filter-group label { font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.03em; }

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
    display: flex;
    align-items: center;
    justify-content: space-between;
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

/* User Cell */
.user-cell { display: flex; align-items: center; gap: 12px; }
.user-avatar {
    width: 40px;
    height: 40px;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
}
.avatar-admin { background: linear-gradient(135deg, #1B4D3E, #2D6A4F); }
.avatar-dean { background: linear-gradient(135deg, #B45309, #D97706); }
.avatar-instructor { background: linear-gradient(135deg, #1e40af, #3b82f6); }
.avatar-student { background: linear-gradient(135deg, #6d28d9, #8b5cf6); }
.user-name { display: block; font-weight: 600; color: #111827; font-size: 14px; }
.user-email { display: block; font-size: 12px; color: #9ca3af; margin-top: 1px; }
.user-id-text { font-size: 13px; color: #374151; font-family: monospace; }
.dept-text { font-size: 13px; color: #374151; }
.date-text { font-size: 13px; color: #6b7280; }

/* Role Badges */
.role-badge {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    display: inline-block;
}
.role-admin { background: #E8F5E9; color: #1B4D3E; }
.role-dean { background: #FEF3C7; color: #B45309; }
.role-instructor { background: #DBEAFE; color: #1e40af; }
.role-student { background: #EDE9FE; color: #6d28d9; }

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
.status-pending { background: #FEF3C7; color: #B45309; }

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
    min-width: 170px;
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

/* Form Card */
.form-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
}
.form-section { padding: 24px; border-bottom: 1px solid #f3f4f6; }
.form-section:last-of-type { border-bottom: none; }
.form-section h3 {
    margin: 0 0 24px;
    font-size: 16px;
    color: #1B4D3E;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-group { margin-bottom: 20px; }
.form-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}
.required { color: #dc2626; font-weight: 700; }
.radio-group { display: flex; gap: 24px; }
.radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 500;
    color: #374151;
    font-size: 14px;
}
.radio-label:hover { color: #1B4D3E; }
.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    background: #f8faf9;
    border-top: 1px solid #e8e8e8;
    border-radius: 0 0 12px 12px;
}

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
    .form-row { grid-template-columns: 1fr; }
    .filters-form { flex-direction: column; }
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

document.addEventListener('DOMContentLoaded', function() {
    const roleSelect = document.getElementById('roleSelect');
    const departmentSelect = document.getElementById('departmentSelect');
    const programSelect = document.getElementById('programSelect');
    const deptRequired = document.querySelector('.dept-required');
    const deptHint = document.querySelector('.dept-hint');
    const programRequired = document.querySelector('.program-required');
    const programHint = document.querySelector('.program-hint');
    const employeeIdGroup = document.getElementById('employeeIdGroup');
    const studentIdGroup = document.getElementById('studentIdGroup');
    const programGroup = document.getElementById('programGroup');

    function updateFormFields() {
        const role = roleSelect ? roleSelect.value : '';

        // Department required for dean and instructor
        if (role === 'dean' || role === 'instructor') {
            if (deptRequired) deptRequired.style.display = 'inline';
            if (deptHint) deptHint.style.display = 'block';
            if (departmentSelect) departmentSelect.required = true;
        } else {
            if (deptRequired) deptRequired.style.display = 'none';
            if (deptHint) deptHint.style.display = 'none';
            if (departmentSelect) departmentSelect.required = false;
        }

        // Program required for students
        if (role === 'student') {
            if (programRequired) programRequired.style.display = 'inline';
            if (programHint) programHint.style.display = 'block';
            if (programGroup) programGroup.style.display = 'block';
        } else {
            if (programRequired) programRequired.style.display = 'none';
            if (programHint) programHint.style.display = 'none';
            if (programGroup) programGroup.style.display = role === 'student' ? 'block' : 'none';
        }

        // Show/hide employee ID vs student ID
        if (employeeIdGroup && studentIdGroup) {
            if (role === 'student') {
                employeeIdGroup.style.display = 'none';
                studentIdGroup.style.display = 'block';
            } else {
                employeeIdGroup.style.display = 'block';
                studentIdGroup.style.display = role === 'student' ? 'block' : 'none';
            }
        }
    }

    if (roleSelect) {
        roleSelect.addEventListener('change', updateFormFields);
        updateFormFields(); // Initial call
    }
});
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>