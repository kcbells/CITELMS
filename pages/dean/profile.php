<?php
/**
 * CIT-LMS Dean - Profile Management
 * View and update personal information and security settings
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('dean');

$userId = Auth::id();

// Fetch fresh data immediately
$user = db()->fetchOne("SELECT * FROM users WHERE users_id = ?", [$userId]);

$pageTitle = 'My Profile';
$currentPage = 'profile';
$success = $error = '';

// Handle Form Submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // 1. Update Personal Information
    if (isset($_POST['update_profile'])) {
        $firstName = trim($_POST['first_name'] ?? '');
        $lastName = trim($_POST['last_name'] ?? '');
        $email = trim($_POST['email'] ?? '');

        if (empty($firstName) || empty($lastName) || empty($email)) {
            $error = 'Please fill in all required profile fields.';
        } else {
            $updated = db()->execute(
                "UPDATE users SET first_name=?, last_name=?, email=?, updated_at=NOW() WHERE users_id=?",
                [$firstName, $lastName, $email, $userId]
            );

            if ($updated) {
                $success = 'Profile information updated successfully!';
                // Refresh data again after update
                $user = db()->fetchOne("SELECT * FROM users WHERE users_id = ?", [$userId]);
            } else {
                $error = 'Could not update profile. Email might already be in use.';
            }
        }
    }

    // 2. Change Security Settings (Password)
    if (isset($_POST['change_password'])) {
        $current = $_POST['current_password'] ?? '';
        $new = $_POST['new_password'] ?? '';
        $confirm = $_POST['confirm_password'] ?? '';

        if (empty($current) || empty($new)) {
            $error = 'Both current and new passwords are required.';
        } elseif ($new !== $confirm) {
            $error = 'The new password confirmation does not match.';
        } elseif (strlen($new) < 6) {
            $error = 'New password must be at least 6 characters long.';
        } else {
            $currentUser = db()->fetchOne("SELECT password FROM users WHERE users_id = ?", [$userId]);

            if (!password_verify($current, $currentUser['password'])) {
                $error = 'The current password you entered is incorrect.';
            } else {
                db()->execute(
                    "UPDATE users SET password=?, updated_at=NOW() WHERE users_id=?",
                    [password_hash($new, PASSWORD_DEFAULT), $userId]
                );
                $success = 'Your password has been changed successfully!';
            }
        }
    }
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

<?php
// Re-fetch user data AFTER includes (sidebar/topbar overwrite $user with Auth::user())
$user = db()->fetchOne("SELECT * FROM users WHERE users_id = ?", [$userId]);

// Generate Profile Initials
$initials = strtoupper(substr($user['first_name'], 0, 1) . substr($user['last_name'], 0, 1));

// Get department info
$userDept = null;
if (!empty($user['department_id'])) {
    $userDept = db()->fetchOne(
        "SELECT department_name, department_code FROM department WHERE department_id = ?",
        [$user['department_id']]
    );
}

// Get programs under the dean's department
$deptPrograms = [];
if (!empty($user['department_id'])) {
    $deptPrograms = db()->fetchAll(
        "SELECT p.program_code, p.program_name FROM program p
         JOIN department_program dp ON p.program_id = dp.program_id
         WHERE dp.department_id = ? AND p.status = 'active' ORDER BY p.program_code",
        [$user['department_id']]
    );
}
?>

    <div class="page-content">
        <div class="page-header">
            <div>
                <h2>Account Settings</h2>
                <p class="text-muted">Manage your personal information and account security</p>
            </div>
        </div>

        <?php if ($success): ?>
            <div class="alert alert-success"><?= e($success) ?></div>
        <?php endif; ?>

        <?php if ($error): ?>
            <div class="alert alert-error"><?= e($error) ?></div>
        <?php endif; ?>

        <div class="profile-grid">
            <aside class="profile-aside">
                <div class="card summary-card">
                    <div class="avatar-container">
                        <div class="profile-avatar"><?= $initials ?></div>
                    </div>
                    <h2 class="user-full-name"><?= e($user['first_name'] . ' ' . $user['last_name']) ?></h2>
                    <span class="role-badge">Dean</span>

                    <?php if ($userDept): ?>
                    <div class="dept-info">
                        <span class="dept-info-code"><?= e($userDept['department_code']) ?></span>
                        <span class="dept-info-name"><?= e($userDept['department_name']) ?></span>
                    </div>
                    <?php endif; ?>

                    <div class="quick-stats">
                        <div class="q-stat">
                            <span class="qs-label">Employee ID</span>
                            <span class="qs-value"><?= e($user['employee_id'] ?? 'Not Set') ?></span>
                        </div>
                        <div class="q-stat">
                            <span class="qs-label">Email</span>
                            <span class="qs-value"><?= e($user['email']) ?></span>
                        </div>
                        <div class="q-stat">
                            <span class="qs-label">Department</span>
                            <span class="qs-value"><?= $userDept ? e($userDept['department_name']) : 'Not Assigned' ?></span>
                        </div>
                        <div class="q-stat">
                            <span class="qs-label">Programs</span>
                            <span class="qs-value"><?= count($deptPrograms) > 0 ? implode(', ', array_column($deptPrograms, 'program_code')) : 'None' ?></span>
                        </div>
                        <div class="q-stat">
                            <span class="qs-label">Joined</span>
                            <span class="qs-value"><?= !empty($user['created_at']) ? date('M Y', strtotime($user['created_at'])) : 'Recently' ?></span>
                        </div>
                    </div>
                </div>
            </aside>

            <section class="profile-main">
                <div class="panel mb-4">
                    <div class="panel-head"><h3>Personal Details</h3></div>
                    <form method="POST" class="panel-body">
                        <div class="grid-2col">
                            <div class="form-group">
                                <label class="field-label">First Name</label>
                                <input type="text" name="first_name" class="field-input" value="<?= e($user['first_name']) ?>" required>
                            </div>
                            <div class="form-group">
                                <label class="field-label">Last Name</label>
                                <input type="text" name="last_name" class="field-input" value="<?= e($user['last_name']) ?>" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="field-label">Email Address</label>
                            <input type="email" name="email" class="field-input" value="<?= e($user['email']) ?>" required>
                        </div>
                        <button type="submit" name="update_profile" class="btn-primary">Save Changes</button>
                    </form>
                </div>

                <div class="panel">
                    <div class="panel-head"><h3>Security & Password</h3></div>
                    <form method="POST" class="panel-body">
                        <div class="form-group">
                            <label class="field-label">Current Password</label>
                            <input type="password" name="current_password" class="field-input" placeholder="••••••••" required>
                        </div>
                        <div class="grid-2col">
                            <div class="form-group">
                                <label class="field-label">New Password</label>
                                <input type="password" name="new_password" class="field-input" placeholder="Min. 6 characters" required>
                            </div>
                            <div class="form-group">
                                <label class="field-label">Confirm New Password</label>
                                <input type="password" name="confirm_password" class="field-input" placeholder="Repeat new password" required>
                            </div>
                        </div>
                        <button type="submit" name="change_password" class="btn-secondary">Update Password</button>
                    </form>
                </div>
            </section>
        </div>
    </div>
</main>

<style>
/* Clean Professional Profile Page */

/* Page Header */
.page-header {
    margin-bottom: 32px;
}
.page-header h2 {
    font-size: 28px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 4px;
}
.text-muted {
    color: #6b7280;
    margin: 0;
    font-size: 14px;
}

/* Profile Grid Layout */
.profile-grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
    align-items: start;
}

/* Profile Sidebar Card */
.profile-aside {
    position: sticky;
    top: 24px;
}
.summary-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
}
.avatar-container {
    margin-bottom: 20px;
}
.profile-avatar {
    width: 100px;
    height: 100px;
    background: #1B4D3E;
    color: #ffffff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    font-weight: 700;
    margin: 0 auto;
}
.user-full-name {
    font-size: 20px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 12px;
}
.role-badge {
    display: inline-block;
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 16px;
}

/* Department Info Badge */
.dept-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
}
.dept-info-code {
    background: #1B4D3E;
    color: #fff;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
}
.dept-info-name {
    font-size: 13px;
    color: #555;
    font-weight: 500;
}

/* Quick Stats */
.quick-stats {
    border-top: 1px solid #e5e7eb;
    padding-top: 20px;
    margin-top: 20px;
}
.q-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 0;
    border-bottom: 1px solid #f3f4f6;
}
.q-stat:last-child {
    border-bottom: none;
}
.qs-label {
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.qs-value {
    font-size: 14px;
    color: #111827;
    font-weight: 500;
    word-break: break-word;
}

/* Main Content Panels */
.profile-main {
    display: flex;
    flex-direction: column;
    gap: 24px;
}
.panel {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
}
.panel-head {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
}
.panel-head h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #111827;
}
.panel-body {
    padding: 24px;
}
.mb-4 {
    margin-bottom: 24px;
}

/* Form Elements */
.form-group {
    margin-bottom: 20px;
}
.field-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
}
.field-input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    color: #111827;
    transition: all 0.2s;
}
.field-input:focus {
    outline: none;
    border-color: #1B4D3E;
    box-shadow: 0 0 0 3px rgba(27, 77, 62, 0.1);
}
.grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

/* Buttons */
.btn-primary,
.btn-secondary {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}
.btn-primary {
    background: #1B4D3E;
    color: #ffffff;
}
.btn-primary:hover {
    background: #2D6A4F;
}
.btn-secondary {
    background: #ffffff;
    color: #374151;
    border: 1px solid #d1d5db;
}
.btn-secondary:hover {
    background: #f9fafb;
    border-color: #9ca3af;
}

/* Alerts */
.alert {
    padding: 16px 20px;
    border-radius: 8px;
    margin-bottom: 24px;
    font-size: 14px;
}
.alert-success {
    background: #dcfce7;
    color: #166534;
    }
.alert-error {
    background: #fee2e2;
    color: #991b1b;
    }

/* Responsive Design */
@media (max-width: 1024px) {
    .profile-grid {
        grid-template-columns: 1fr;
    }
    .profile-aside {
        position: static;
    }
}

@media (max-width: 640px) {
    .grid-2col {
        grid-template-columns: 1fr;
    }
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
