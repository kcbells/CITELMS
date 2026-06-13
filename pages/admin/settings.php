<?php
/**
 * Admin - System Settings
 * Configure system settings
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Settings';
$currentPage = 'settings';

$success = '';
$error = '';

// Get current settings
$settings = [];
$settingsRows = db()->fetchAll("SELECT setting_key, setting_value FROM system_settings");
foreach ($settingsRows as $row) {
    $settings[$row['setting_key']] = $row['setting_value'];
}

// Default values
$defaults = [
    'site_name' => 'CIT Learning Management System',
    'site_tagline' => 'College of Information Technology',
    'academic_year' => date('Y') . '-' . (date('Y') + 1),
    'current_semester' => '1st',
    'enrollment_open' => '1',
    'quiz_time_limit' => '60',
    'passing_rate' => '60',
    'max_file_size' => '10',
    'allowed_extensions' => 'pdf,doc,docx,ppt,pptx,xls,xlsx,jpg,png,gif',
    'maintenance_mode' => '0',
    'maintenance_message' => 'System is under maintenance. Please try again later.',
    'groq_api_key' => '',
    'ai_model' => 'llama-3.1-8b-instant'
];

foreach ($defaults as $key => $value) {
    if (!isset($settings[$key])) {
        $settings[$key] = $value;
    }
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'save_settings') {
        $updateKeys = [
            'site_name', 'site_tagline', 'academic_year', 'current_semester',
            'enrollment_open', 'quiz_time_limit', 'passing_rate', 'max_file_size',
            'allowed_extensions', 'maintenance_mode', 'maintenance_message',
            'groq_api_key', 'ai_model'
        ];
        
        foreach ($updateKeys as $key) {
            if (isset($_POST[$key])) {
                $value = trim($_POST[$key]);
                db()->execute(
                    "INSERT INTO system_settings (setting_key, setting_value, updated_at) 
                     VALUES (?, ?, NOW()) 
                     ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()",
                    [$key, $value, $value]
                );
                $settings[$key] = $value;
            }
        }
        
        $success = 'Settings saved successfully!';
    }
    
    if ($action === 'add_department') {
        $deptName = trim($_POST['department_name'] ?? '');
        $deptCode = trim($_POST['department_code'] ?? '');
        if ($deptName && $deptCode) {
            db()->execute(
                "INSERT INTO department (department_name, department_code, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
                [$deptName, $deptCode]
            );
            $success = 'Department added!';
        }
    }
    
    if ($action === 'delete_department') {
        $deptId = (int)$_POST['department_id'];
        // Check if department has active programs via junction table
        $hasPrograms = db()->fetchOne("SELECT COUNT(*) as count FROM department_program dp JOIN program p ON dp.program_id = p.program_id WHERE dp.department_id = ? AND p.status = 'active'", [$deptId])['count'];
        if ($hasPrograms > 0) {
            $error = "Cannot delete department with active programs.";
        } else {
            // Soft delete - set status to inactive instead of removing record
            db()->execute("UPDATE department SET status = 'inactive', updated_at = NOW() WHERE department_id = ?", [$deptId]);
            $success = 'Department deleted!';
        }
    }
}

// Get departments
$departments = db()->fetchAll(
    "SELECT d.*,
        (SELECT COUNT(*) FROM department_program dp WHERE dp.department_id = d.department_id) as program_count,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.department_id) as user_count
     FROM department d ORDER BY d.department_name"
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <div class="page-header">
            <div>
                <h2>System Settings</h2>
                <p class="text-muted">Configure system preferences</p>
            </div>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <div class="settings-grid">
            <!-- General Settings -->
            <form method="POST" class="card">
                <input type="hidden" name="action" value="save_settings">
                <div class="card-header"><h3>General Settings</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Site Name</label>
                        <input type="text" name="site_name" class="form-control" value="<?= e($settings['site_name']) ?>">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Site Tagline</label>
                        <input type="text" name="site_tagline" class="form-control" value="<?= e($settings['site_tagline']) ?>">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Academic Year</label>
                            <input type="text" name="academic_year" class="form-control" value="<?= e($settings['academic_year']) ?>" placeholder="e.g., 2024-2025">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Current Semester</label>
                            <select name="current_semester" class="form-control">
                                <option value="1st" <?= $settings['current_semester'] === '1st' ? 'selected' : '' ?>>1st Semester</option>
                                <option value="2nd" <?= $settings['current_semester'] === '2nd' ? 'selected' : '' ?>>2nd Semester</option>
                                <option value="summer" <?= $settings['current_semester'] === 'summer' ? 'selected' : '' ?>>Summer</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Enrollment Status</label>
                        <div class="radio-group">
                            <label class="radio-label"><input type="radio" name="enrollment_open" value="1" <?= $settings['enrollment_open'] === '1' ? 'checked' : '' ?>> Open</label>
                            <label class="radio-label"><input type="radio" name="enrollment_open" value="0" <?= $settings['enrollment_open'] === '0' ? 'checked' : '' ?>> Closed</label>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <button type="submit" class="btn btn-primary">Save Settings</button>
                </div>
            </form>

            <!-- Quiz Settings -->
            <form method="POST" class="card">
                <input type="hidden" name="action" value="save_settings">
                <div class="card-header"><h3>Quiz Settings</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Default Time Limit (minutes)</label>
                        <input type="number" name="quiz_time_limit" class="form-control" value="<?= e($settings['quiz_time_limit']) ?>" min="5" max="180">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Default Passing Rate (%)</label>
                        <input type="number" name="passing_rate" class="form-control" value="<?= e($settings['passing_rate']) ?>" min="1" max="100">
                    </div>
                </div>
                <div class="card-footer">
                    <button type="submit" class="btn btn-primary">Save Settings</button>
                </div>
            </form>

            <!-- File Upload Settings -->
            <form method="POST" class="card">
                <input type="hidden" name="action" value="save_settings">
                <div class="card-header"><h3>File Upload Settings</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Max File Size (MB)</label>
                        <input type="number" name="max_file_size" class="form-control" value="<?= e($settings['max_file_size']) ?>" min="1" max="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Allowed Extensions</label>
                        <input type="text" name="allowed_extensions" class="form-control" value="<?= e($settings['allowed_extensions']) ?>">
                        <small class="form-hint">Comma-separated list of extensions without dots</small>
                    </div>
                </div>
                <div class="card-footer">
                    <button type="submit" class="btn btn-primary">Save Settings</button>
                </div>
            </form>

            <!-- Maintenance Mode -->
            <form method="POST" class="card">
                <input type="hidden" name="action" value="save_settings">
                <div class="card-header"><h3>Maintenance Mode</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Maintenance Mode</label>
                        <div class="radio-group">
                            <label class="radio-label"><input type="radio" name="maintenance_mode" value="0" <?= $settings['maintenance_mode'] === '0' ? 'checked' : '' ?>> Disabled</label>
                            <label class="radio-label"><input type="radio" name="maintenance_mode" value="1" <?= $settings['maintenance_mode'] === '1' ? 'checked' : '' ?>> Enabled</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Maintenance Message</label>
                        <textarea name="maintenance_message" class="form-control" rows="3"><?= e($settings['maintenance_message']) ?></textarea>
                    </div>
                </div>
                <div class="card-footer">
                    <button type="submit" class="btn btn-primary">Save Settings</button>
                </div>
            </form>

            <!-- AI Quiz Generator Settings (Groq) -->
            <form method="POST" class="card">
                <input type="hidden" name="action" value="save_settings">
                <div class="card-header">
                    <h3>AI Quiz Generator</h3>
                </div>
                <div class="card-body">
                    <div class="ai-info-box">
                        <strong>About AI Quiz Generator</strong>
                        <p>The AI Quiz Generator uses Groq's fast AI API to automatically generate quiz questions from PDF documents. Groq offers a generous free tier with fast inference speeds.</p>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Groq API Key</label>
                        <div class="password-input-wrapper">
                            <input type="password" name="groq_api_key" id="groq_api_key" class="form-control"
                                   value="<?= e($settings['groq_api_key'] ?? '') ?>"
                                   placeholder="gsk_xxxxxxxxxxxxxxxxxxxx">
                            <button type="button" class="toggle-password" onclick="toggleApiKeyVisibility()">
                                <span id="eye-icon">Show</span>
                            </button>
                        </div>
                        <small class="form-hint">Get your free API key from <a href="https://console.groq.com/keys" target="_blank">Groq Console</a>. Create an account and generate an API key.</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">AI Model</label>
                        <select name="ai_model" class="form-control">
                            <option value="llama-3.1-8b-instant" <?= ($settings['ai_model'] ?? '') === 'llama-3.1-8b-instant' ? 'selected' : '' ?>>Llama 3.1 8B Instant (Recommended - Fast)</option>
                            <option value="llama-3.3-70b-versatile" <?= ($settings['ai_model'] ?? '') === 'llama-3.3-70b-versatile' ? 'selected' : '' ?>>Llama 3.3 70B Versatile (Best Quality)</option>
                            <option value="mixtral-8x7b-32768" <?= ($settings['ai_model'] ?? '') === 'mixtral-8x7b-32768' ? 'selected' : '' ?>>Mixtral 8x7B (Balanced)</option>
                            <option value="gemma2-9b-it" <?= ($settings['ai_model'] ?? '') === 'gemma2-9b-it' ? 'selected' : '' ?>>Gemma 2 9B</option>
                        </select>
                        <small class="form-hint">Select the AI model to use for generating quiz questions.</small>
                    </div>
                    <?php if (!empty($settings['groq_api_key'])): ?>
                    <div class="api-status-box success">
                        <span class="status-icon">&#10003;</span> Groq API Key Configured
                    </div>
                    <?php else: ?>
                    <div class="api-status-box warning">
                        <span class="status-icon">!</span> No API Key - Instructors will need to enter their own key
                    </div>
                    <?php endif; ?>
                </div>
                <div class="card-footer">
                    <button type="submit" class="btn btn-primary">Save AI Settings</button>
                </div>
            </form>
        </div>

        <!-- Departments -->
        <div class="card" style="margin-top:24px">
            <div class="card-header">
                <h3>Departments</h3>
            </div>
            <div class="card-body">
                <form method="POST" class="add-dept-form">
                    <input type="hidden" name="action" value="add_department">
                    <div class="form-row">
                        <div class="form-group">
                            <input type="text" name="department_code" class="form-control" placeholder="Code (e.g., CIT)" required>
                        </div>
                        <div class="form-group" style="flex:2">
                            <input type="text" name="department_name" class="form-control" placeholder="Department Name" required>
                        </div>
                        <div class="form-group">
                            <button type="submit" class="btn btn-primary">Add Department</button>
                        </div>
                    </div>
                </form>
                
                <table class="data-table" style="margin-top:16px">
                    <thead><tr><th>Code</th><th>Department Name</th><th>Programs</th><th>Users</th><th>Actions</th></tr></thead>
                    <tbody>
                        <?php if (empty($departments)): ?>
                        <tr><td colspan="5" class="text-center text-muted">No departments yet</td></tr>
                        <?php else: ?>
                        <?php foreach ($departments as $dept): ?>
                        <tr>
                            <td><span class="dept-code"><?= e($dept['department_code'] ?? 'N/A') ?></span></td>
                            <td><?= e($dept['department_name']) ?></td>
                            <td><span class="badge badge-primary"><?= $dept['program_count'] ?></span></td>
                            <td><span class="badge badge-info"><?= $dept['user_count'] ?></span></td>
                            <td>
                                <form method="POST" style="display:inline" onsubmit="return confirm('Delete this department?')">
                                    <input type="hidden" name="action" value="delete_department">
                                    <input type="hidden" name="department_id" value="<?= $dept['department_id'] ?>">
                                    <button type="submit" class="btn btn-danger btn-sm">Delete</button>
                                </form>
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

<style>
/* Clean Professional Settings Page */

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

/* Settings Grid */
.settings-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    margin-bottom: 24px;
}

/* Cards */
.card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
}
.card-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
}
.card-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #111827;
}
.card-body {
    padding: 24px;
}
.card-footer {
    padding: 16px 24px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    text-align: right;
}

/* Form Elements */
.form-group {
    margin-bottom: 20px;
}
.form-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
}
.form-control {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    color: #111827;
    transition: all 0.2s;
}
.form-control:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.form-hint {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #6b7280;
}
.form-row {
    display: flex;
    gap: 16px;
    align-items: flex-end;
}
.form-row .form-group {
    flex: 1;
}

/* Radio Groups */
.radio-group {
    display: flex;
    gap: 24px;
}
.radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #374151;
}
.radio-label input[type="radio"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

/* Buttons */
.btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}
.btn-primary {
    background: #2563eb;
    color: #ffffff;
}
.btn-primary:hover {
    background: #1d4ed8;
}
.btn-danger {
    background: #ef4444;
    color: #ffffff;
}
.btn-danger:hover {
    background: #dc2626;
}
.btn-sm {
    padding: 6px 12px;
    font-size: 13px;
}

/* Department Form */
.add-dept-form .form-row {
    margin-bottom: 0;
}
.add-dept-form .form-group {
    margin-bottom: 0;
    flex: 1;
}

/* Data Tables */
.data-table {
    width: 100%;
    border-collapse: collapse;
}
.data-table th,
.data-table td {
    padding: 14px 16px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}
.data-table th {
    font-weight: 600;
    font-size: 12px;
    color: #374151;
    background: #f9fafb;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.data-table tbody tr {
    transition: background 0.2s;
}
.data-table tbody tr:hover {
    background: #f9fafb;
}
.data-table tbody tr:last-child td {
    border-bottom: none;
}

/* Department Code Badge */
.dept-code {
    background: #f3f4f6;
    color: #374151;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 12px;
}

/* Badges */
.badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}
.badge-primary {
    background: #dbeafe;
    color: #1e40af;
}
.badge-info {
    background: #e0e7ff;
    color: #3730a3;
}

/* Alerts */
.alert {
    padding: 16px 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 14px;
}
.alert-success {
    background: #dcfce7;
    color: #166534;
    }
.alert-danger {
    background: #fee2e2;
    color: #991b1b;
    }

/* AI Settings Styles */
.ai-info-box {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
}
.ai-info-box strong {
    display: block;
    color: #0369a1;
    margin-bottom: 8px;
    font-size: 14px;
}
.ai-info-box p {
    color: #0c4a6e;
    font-size: 13px;
    margin: 0;
    line-height: 1.5;
}
.password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}
.password-input-wrapper .form-control {
    padding-right: 70px;
}
.toggle-password {
    position: absolute;
    right: 8px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    color: #374151;
}
.toggle-password:hover {
    background: #e5e7eb;
}
.api-status-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
}
.api-status-box.success {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
}
.api-status-box.warning {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
}
.status-icon {
    font-weight: bold;
    font-size: 16px;
}

/* Responsive Design */
@media (max-width: 1024px) {
    .settings-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 640px) {
    .form-row {
        flex-direction: column;
        align-items: stretch;
    }
}
</style>

<script>
function toggleApiKeyVisibility() {
    const input = document.getElementById('groq_api_key');
    const icon = document.getElementById('eye-icon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'Hide';
    } else {
        input.type = 'password';
        icon.textContent = 'Show';
    }
}
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>