<?php
/**
 * Profile Page - Clean Green Theme
 */
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('student');

$userId = Auth::id();
$pageTitle = 'My Profile';
$currentPage = 'profile';
$success = '';
$error = '';

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'update_profile') {
        $firstName = trim($_POST['first_name'] ?? '');
        $lastName = trim($_POST['last_name'] ?? '');
        $contactNumber = trim($_POST['contact_number'] ?? '');

        if (empty($firstName) || empty($lastName)) {
            $error = 'First name and last name are required.';
        } else {
            try {
                db()->execute(
                    "UPDATE users SET first_name = ?, last_name = ?, contact_number = ?, updated_at = NOW() WHERE users_id = ?",
                    [$firstName, $lastName, $contactNumber, $userId]
                );

                $_SESSION['user_name'] = $firstName . ' ' . $lastName;
                $_SESSION['first_name'] = $firstName;
                $_SESSION['last_name'] = $lastName;

                $success = 'Profile updated successfully!';
            } catch (Exception $e) {
                $error = 'Failed to update profile.';
            }
        }
    }

    if ($action === 'change_password') {
        $currentPassword = $_POST['current_password'] ?? '';
        $newPassword = $_POST['new_password'] ?? '';
        $confirmPassword = $_POST['confirm_password'] ?? '';

        if (empty($currentPassword) || empty($newPassword) || empty($confirmPassword)) {
            $error = 'All password fields are required.';
        } elseif ($newPassword !== $confirmPassword) {
            $error = 'New passwords do not match.';
        } elseif (strlen($newPassword) < 6) {
            $error = $_pwErr;
        } else {
            $user = db()->fetchOne("SELECT password FROM users WHERE users_id = ?", [$userId]);

            if (!password_verify($currentPassword, $user['password'])) {
                $error = 'Current password is incorrect.';
            } else {
                try {
                    $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
                    db()->execute(
                        "UPDATE users SET password = ?, updated_at = NOW() WHERE users_id = ?",
                        [$hashedPassword, $userId]
                    );
                    $success = 'Password changed successfully!';
                } catch (Exception $e) {
                    $error = 'Failed to change password.';
                }
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
// Get user data with department (AFTER includes so $user isn't overwritten by sidebar/topbar)
$user = db()->fetchOne(
    "SELECT u.*, p.program_code, p.program_name,
        d.department_name, d.department_code
     FROM users u
     LEFT JOIN program p ON u.program_id = p.program_id
     LEFT JOIN department_program dp ON p.program_id = dp.program_id
     LEFT JOIN department d ON dp.department_id = d.department_id
     WHERE u.users_id = ?",
    [$userId]
);

// Get student stats
$stats = db()->fetchOne(
    "SELECT
        (SELECT COUNT(*) FROM student_subject WHERE user_student_id = ? AND status = 'enrolled') as subjects,
        (SELECT COUNT(*) FROM student_progress WHERE user_student_id = ? AND status = 'completed') as lessons,
        (SELECT COUNT(*) FROM student_quiz_attempts WHERE user_student_id = ? AND status = 'completed') as quizzes
    ",
    [$userId, $userId, $userId]
);
?>

    <div class="profile-wrap">

        <!-- Page Header -->
        <div class="page-header">
            <div class="header-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            </div>
            <div>
                <h1>My Profile</h1>
                <p>View and manage your account information</p>
            </div>
        </div>

        <!-- Messages -->
        <?php if ($success): ?>
        <div class="alert alert-success">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <?= e($success) ?>
        </div>
        <?php endif; ?>
        <?php if ($error): ?>
        <div class="alert alert-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <?= e($error) ?>
        </div>
        <?php endif; ?>

        <div class="profile-grid">

            <!-- Profile Card -->
            <div class="profile-card">
                <div class="profile-avatar">
                    <?= strtoupper(substr($user['first_name'] ?? '', 0, 1) . substr($user['last_name'] ?? '', 0, 1)) ?>
                </div>
                <h2><?= e(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?></h2>
                <span class="profile-role">Student</span>

                <div class="profile-stats">
                    <div class="pstat">
                        <span class="pstat-value"><?= $stats['subjects'] ?? 0 ?></span>
                        <span class="pstat-label">Subjects</span>
                    </div>
                    <div class="pstat">
                        <span class="pstat-value"><?= $stats['lessons'] ?? 0 ?></span>
                        <span class="pstat-label">Lessons</span>
                    </div>
                    <div class="pstat">
                        <span class="pstat-value"><?= $stats['quizzes'] ?? 0 ?></span>
                        <span class="pstat-label">Quizzes</span>
                    </div>
                </div>

                <div class="profile-info">
                    <div class="info-row">
                        <span class="info-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                            </svg>
                            Email
                        </span>
                        <span class="info-value"><?= e($user['email'] ?? '') ?></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                <polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                            Department
                        </span>
                        <span class="info-value"><?= e($user['department_name'] ?? 'N/A') ?></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                            </svg>
                            Program
                        </span>
                        <span class="info-value"><?= e($user['program_code'] ?? 'N/A') ?></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            Section
                        </span>
                        <span class="info-value"><?= e($user['section'] ?? 'N/A') ?></span>
                    </div>
                    <?php if (!empty($user['contact_number'])): ?>
                    <div class="info-row">
                        <span class="info-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            Phone
                        </span>
                        <span class="info-value"><?= e($user['contact_number']) ?></span>
                    </div>
                    <?php endif; ?>
                    <?php if (!empty($user['created_at'])): ?>
                    <div class="info-row">
                        <span class="info-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            Joined
                        </span>
                        <span class="info-value"><?= date('M d, Y', strtotime($user['created_at'])) ?></span>
                    </div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Edit Forms -->
            <div class="profile-forms">

                <!-- Edit Profile -->
                <div class="form-card">
                    <div class="form-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        <h3>Edit Profile</h3>
                    </div>
                    <form method="POST">
                        <input type="hidden" name="action" value="update_profile">

                        <div class="form-row">
                            <div class="form-group">
                                <label>First Name</label>
                                <input type="text" name="first_name" value="<?= e($user['first_name'] ?? '') ?>" required>
                            </div>
                            <div class="form-group">
                                <label>Last Name</label>
                                <input type="text" name="last_name" value="<?= e($user['last_name'] ?? '') ?>" required>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" value="<?= e($user['email'] ?? '') ?>" disabled>
                            <small>Contact admin to change email</small>
                        </div>

                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="text" name="contact_number" value="<?= e($user['contact_number'] ?? '') ?>" placeholder="09XX XXX XXXX">
                        </div>

                        <button type="submit" class="btn-save">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Save Changes
                        </button>
                    </form>
                </div>

                <!-- Change Password -->
                <div class="form-card">
                    <div class="form-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <h3>Change Password</h3>
                    </div>
                    <form method="POST">
                        <input type="hidden" name="action" value="change_password">

                        <div class="form-group">
                            <label>Current Password</label>
                            <input type="password" name="current_password" required>
                        </div>

                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" name="new_password" required minlength="8">
                        </div>

                        <div class="form-group">
                            <label>Confirm New Password</label>
                            <input type="password" name="confirm_password" required>
                        </div>

                        <button type="submit" class="btn-save">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            Change Password
                        </button>
                    </form>
                </div>

            </div>
        </div>

    </div>
</main>

<style>
/* Profile - Green/Cream Theme */
.profile-wrap {
    padding: 24px;
    max-width: 1100px;
    margin: 0 auto;
}

/* Page Header */
.page-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
}

.header-icon {
    width: 48px;
    height: 48px;
    background: #E8F5E9;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1B4D3E;
}

.page-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1B4D3E;
    margin: 0 0 4px;
}

.page-header p {
    font-size: 14px;
    color: #666;
    margin: 0;
}

/* Alerts */
.alert {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-radius: 10px;
    margin-bottom: 20px;
    font-size: 14px;
}

.alert-success {
    background: #E8F5E9;
    color: #1B4D3E;
    border: 1px solid #c8e6c9;
}

.alert-error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
}

/* Profile Grid */
.profile-grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
}

/* Profile Card */
.profile-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 32px 24px;
    text-align: center;
    height: fit-content;
}

.profile-avatar {
    width: 100px;
    height: 100px;
    background: #1B4D3E;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    font-weight: 700;
    margin: 0 auto 16px;
}

.profile-card h2 {
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin: 0 0 8px;
}

.profile-role {
    display: inline-block;
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 20px;
}

.profile-stats {
    display: flex;
    justify-content: center;
    gap: 20px;
    padding: 18px 0;
    border-top: 1px solid #f0f0f0;
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 18px;
}

.pstat {
    text-align: center;
}

.pstat-value {
    display: block;
    font-size: 22px;
    font-weight: 700;
    color: #1B4D3E;
}

.pstat-label {
    font-size: 12px;
    color: #999;
}

.profile-info {
    text-align: left;
}

.info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;
}

.info-row:last-child {
    border-bottom: none;
}

.info-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #666;
}

.info-label svg {
    color: #1B4D3E;
}

.info-value {
    font-size: 13px;
    color: #333;
    font-weight: 500;
    text-align: right;
    word-break: break-all;
    max-width: 160px;
}

/* Form Cards */
.profile-forms {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.form-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s ease;
}

.form-card:hover {
    border-color: #1B4D3E;
    box-shadow: 0 4px 12px rgba(27, 77, 62, 0.1);
}

.form-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    color: #1B4D3E;
}

.form-header h3 {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    margin: 0;
}

.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #555;
    margin-bottom: 6px;
}

.form-group input {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    font-size: 14px;
    transition: all 0.2s ease;
}

.form-group input:focus {
    outline: none;
    border-color: #1B4D3E;
    box-shadow: 0 0 0 3px rgba(27, 77, 62, 0.1);
}

.form-group input:disabled {
    background: #fafafa;
    color: #999;
}

.form-group small {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #999;
}

.btn-save {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: #1B4D3E;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-save:hover {
    background: #2D6A4F;
}

/* Responsive */
@media (max-width: 900px) {
    .profile-grid {
        grid-template-columns: 1fr;
    }

    .profile-card {
        max-width: 400px;
        margin: 0 auto;
    }
}

@media (max-width: 500px) {
    .profile-wrap {
        padding: 16px;
    }

    .form-row {
        grid-template-columns: 1fr;
    }

    .profile-stats {
        gap: 14px;
    }

    .pstat-value {
        font-size: 18px;
    }

    .info-value {
        max-width: 120px;
    }
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
