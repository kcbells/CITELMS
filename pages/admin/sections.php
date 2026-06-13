<?php
/**
 * Admin - Sections Management
 * Manage class sections
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Sections';
$currentPage = 'sections';

$action = $_GET['action'] ?? 'list';
$sectionId = $_GET['id'] ?? '';
$offeringFilter = $_GET['offering_id'] ?? '';
$error = '';
$success = '';

// Get offerings and instructors (with semester table join)
$offerings = db()->fetchAll(
    "SELECT so.subject_offered_id, sem.academic_year, sem.semester_name, s.subject_code, s.subject_name
     FROM subject_offered so
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     WHERE so.status IN ('open', 'active')
     ORDER BY sem.academic_year DESC, s.subject_code"
);
$instructors = db()->fetchAll("SELECT users_id, first_name, last_name, employee_id FROM users WHERE role = 'instructor' AND status = 'active' ORDER BY last_name");

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    
    if ($postAction === 'create' || $postAction === 'update') {
        $subjectOfferedId = $_POST['subject_offered_id'] ?? '';
        $sectionName = trim($_POST['section_name'] ?? '');
        $schedule = trim($_POST['schedule'] ?? '');
        $room = trim($_POST['room'] ?? '');
        $maxStudents = (int)($_POST['max_students'] ?? 40);
        $instructorId = $_POST['instructor_id'] ?: null;
        $status = $_POST['status'] ?? 'active';
        
        if (empty($subjectOfferedId) || empty($sectionName)) {
            $error = 'Please fill in all required fields.';
        } else {
            if ($postAction === 'create') {
                // Generate unique enrollment code
                $enrollmentCode = null;
                $attempts = 0;
                while ($attempts < 10) {
                    // Generate code: XXX-9999 format
                    $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                    $numbers = '0123456789';
                    $code = '';
                    for ($i = 0; $i < 3; $i++) {
                        $code .= $letters[random_int(0, strlen($letters) - 1)];
                    }
                    $code .= '-';
                    for ($i = 0; $i < 4; $i++) {
                        $code .= $numbers[random_int(0, strlen($numbers) - 1)];
                    }

                    // Check if code is unique
                    $existing = db()->fetchOne("SELECT section_id FROM section WHERE enrollment_code = ?", [$code]);
                    if (!$existing) {
                        $enrollmentCode = $code;
                        break;
                    }
                    $attempts++;
                }

                db()->execute(
                    "INSERT INTO section (subject_offered_id, section_name, enrollment_code, schedule, room, max_students, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                    [$subjectOfferedId, $sectionName, $enrollmentCode, $schedule, $room, $maxStudents, $status]
                );
                $newSectionId = db()->lastInsertId();

                // Assign instructor to section
                if ($instructorId) {
                    db()->execute(
                        "INSERT INTO faculty_subject (user_teacher_id, subject_offered_id, section_id, status, assigned_at, updated_at)
                         VALUES (?, ?, ?, 'active', NOW(), NOW())",
                        [$instructorId, $subjectOfferedId, $newSectionId]
                    );
                }

                header("Location: sections.php?success=created");
                exit;
            } else {
                db()->execute(
                    "UPDATE section SET subject_offered_id = ?, section_name = ?, schedule = ?, room = ?, max_students = ?, status = ?, updated_at = NOW() WHERE section_id = ?",
                    [$subjectOfferedId, $sectionName, $schedule, $room, $maxStudents, $status, $_POST['section_id']]
                );

                // Update instructor if provided
                if ($instructorId) {
                    // Check if assignment exists
                    $existing = db()->fetchOne(
                        "SELECT faculty_subject_id FROM faculty_subject WHERE section_id = ?",
                        [$_POST['section_id']]
                    );

                    if ($existing) {
                        db()->execute(
                            "UPDATE faculty_subject SET user_teacher_id = ?, subject_offered_id = ?, status = 'active', updated_at = NOW() WHERE section_id = ?",
                            [$instructorId, $subjectOfferedId, $_POST['section_id']]
                        );
                    } else {
                        db()->execute(
                            "INSERT INTO faculty_subject (user_teacher_id, subject_offered_id, section_id, status, assigned_at, updated_at)
                             VALUES (?, ?, ?, 'active', NOW(), NOW())",
                            [$instructorId, $subjectOfferedId, $_POST['section_id']]
                        );
                    }
                }

                header("Location: sections.php?success=updated");
                exit;
            }
        }
    }
    
    if ($postAction === 'delete') {
        $deleteId = (int)$_POST['section_id'];
        $hasStudents = db()->fetchOne("SELECT COUNT(*) as count FROM student_subject WHERE section_id = ? AND status = 'enrolled'", [$deleteId])['count'];
        if ($hasStudents > 0) {
            $error = "Cannot delete section with $hasStudents enrolled students.";
        } else {
            // Soft delete - set status to inactive instead of removing record
            db()->execute("UPDATE section SET status = 'inactive' WHERE section_id = ?", [$deleteId]);
            header("Location: sections.php?success=deleted");
            exit;
        }
    }
}

if (isset($_GET['success'])) {
    $successMessages = ['created' => 'Section created!', 'updated' => 'Section updated!', 'deleted' => 'Section deleted!'];
    $success = $successMessages[$_GET['success']] ?? '';
}

$editSection = null;
$editInstructor = null;
if ($action === 'edit' && $sectionId) {
    $editSection = db()->fetchOne("SELECT * FROM section WHERE section_id = ?", [$sectionId]);
    if (!$editSection) { header("Location: sections.php"); exit; }

    // Get current instructor for this section
    $editInstructor = db()->fetchOne(
        "SELECT user_teacher_id FROM faculty_subject WHERE section_id = ? AND status = 'active' LIMIT 1",
        [$sectionId]
    );
}

// Build query
$whereClause = "WHERE 1=1";
$params = [];
if ($offeringFilter) { $whereClause .= " AND sec.subject_offered_id = ?"; $params[] = $offeringFilter; }

$sections = db()->fetchAll(
    "SELECT sec.*, sem.academic_year, sem.semester_name, s.subject_code, s.subject_name,
        (SELECT COUNT(*) FROM student_subject ss WHERE ss.section_id = sec.section_id AND ss.status = 'enrolled') as student_count,
        (SELECT CONCAT(u.first_name, ' ', u.last_name) FROM faculty_subject fs JOIN users u ON fs.user_teacher_id = u.users_id WHERE fs.section_id = sec.section_id AND fs.status = 'active' LIMIT 1) as instructor_name
     FROM section sec
     JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     $whereClause
     ORDER BY sem.academic_year DESC, s.subject_code, sec.section_name",
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
                <h2>Sections</h2>
                <p class="text-muted">Manage class sections</p>
            </div>
            <a href="?action=create<?= $offeringFilter ? '&offering_id='.$offeringFilter : '' ?>" class="btn btn-success">+ Add Section</a>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group" style="flex:1">
                    <label>Filter by Subject Offering</label>
                    <select name="offering_id" class="form-control" onchange="this.form.submit()">
                        <option value="">All Offerings</option>
                        <?php foreach ($offerings as $off): ?>
                        <option value="<?= $off['subject_offered_id'] ?>" <?= $offeringFilter == $off['subject_offered_id'] ? 'selected' : '' ?>>
                            <?= e($off['subject_code']) ?> - <?= e($off['academic_year'] ?? 'N/A') ?> (<?= e($off['semester_name'] ?? 'N/A') ?>)
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <?php if ($offeringFilter): ?>
                <div class="filter-group"><a href="sections.php" class="btn btn-outline">Show All</a></div>
                <?php endif; ?>
            </form>
        </div>
        
        <!-- Sections Grid -->
        <?php if (empty($sections)): ?>
        <div class="empty-state">
            <div class="empty-state-icon">🏫</div>
            <h3>No Sections Yet</h3>
            <p>Add your first section.</p>
            <a href="?action=create" class="btn btn-success" style="margin-top:16px">+ Add Section</a>
        </div>
        <?php else: ?>
        <div class="sections-grid">
            <?php foreach ($sections as $section): ?>
            <div class="section-card">
                <div class="section-header">
                    <span class="section-subject"><?= e($section['subject_code']) ?></span>
                    <span class="badge badge-<?= $section['status'] === 'active' ? 'success' : 'secondary' ?>"><?= ucfirst($section['status']) ?></span>
                </div>
                <h3 class="section-name"><?= e($section['section_name']) ?></h3>
                <p class="section-subject-name"><?= e($section['subject_name']) ?></p>
                
                <div class="enrollment-code-box">
                    <span class="code-label">Enrollment Code:</span>
                    <span class="code-value"><?= e($section['enrollment_code'] ?? 'N/A') ?></span>
                    <button class="btn-copy" onclick="copyCode('<?= e($section['enrollment_code']) ?>')" title="Copy code">📋</button>
                </div>

                <div class="section-details">
                    <div class="detail"><span class="detail-icon">📅</span><?= e($section['academic_year'] ?? 'N/A') ?> - <?= e($section['semester_name'] ?? 'N/A') ?></div>
                    <?php if ($section['schedule']): ?><div class="detail"><span class="detail-icon">🕐</span><?= e($section['schedule']) ?></div><?php endif; ?>
                    <?php if ($section['room']): ?><div class="detail"><span class="detail-icon">🚪</span><?= e($section['room']) ?></div><?php endif; ?>
                    <?php if ($section['instructor_name']): ?><div class="detail"><span class="detail-icon">👨‍🏫</span><?= e($section['instructor_name']) ?></div><?php endif; ?>
                </div>
                
                <div class="section-stats">
                    <div class="enrollment">
                        <span class="enrollment-num"><?= $section['student_count'] ?>/<?= $section['max_students'] ?></span>
                        <span class="enrollment-label">Enrolled</span>
                        <div class="enrollment-bar">
                            <div class="enrollment-fill" style="width: <?= min(100, ($section['student_count'] / $section['max_students']) * 100) ?>%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="section-actions">
                    <a href="?action=edit&id=<?= $section['section_id'] ?>" class="btn btn-outline btn-sm">Edit</a>
                    <form method="POST" style="display:inline" onsubmit="return confirm('Delete this section?')">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="section_id" value="<?= $section['section_id'] ?>">
                        <button type="submit" class="btn btn-danger btn-sm">Delete</button>
                    </form>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
        
        <?php else: ?>
        <!-- CREATE/EDIT VIEW -->
        <div class="page-header">
            <div>
                <a href="sections.php" class="back-link">← Back to Sections</a>
                <h2><?= $action === 'create' ? 'Add New Section' : 'Edit Section' ?></h2>
            </div>
        </div>
        
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <form method="POST" class="form-card">
            <input type="hidden" name="action" value="<?= $action === 'create' ? 'create' : 'update' ?>">
            <?php if ($editSection): ?><input type="hidden" name="section_id" value="<?= $editSection['section_id'] ?>"><?php endif; ?>
            
            <div class="form-section">
                <h3>🏫 Section Details</h3>
                
                <div class="form-group">
                    <label class="form-label">Subject Offering <span class="required">*</span></label>
                    <select name="subject_offered_id" class="form-control" required>
                        <option value="">-- Select Subject Offering --</option>
                        <?php if (empty($offerings)): ?>
                        <option value="" disabled>No offerings available. Please create subject offerings first.</option>
                        <?php else: ?>
                        <?php foreach ($offerings as $off): ?>
                        <option value="<?= $off['subject_offered_id'] ?>" <?= ($editSection['subject_offered_id'] ?? $offeringFilter) == $off['subject_offered_id'] ? 'selected' : '' ?>>
                            <?= e($off['subject_code']) ?> - <?= e($off['subject_name']) ?> (<?= e($off['academic_year'] ?? 'N/A') ?> - <?= e($off['semester_name'] ?? 'N/A') ?>)
                        </option>
                        <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                    <?php if (empty($offerings)): ?>
                    <small style="color:#dc2626;margin-top:8px;display:block">⚠️ No subject offerings available. Please <a href="subject-offerings.php">create subject offerings</a> first.</small>
                    <?php endif; ?>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Section Name <span class="required">*</span></label>
                        <input type="text" name="section_name" class="form-control" required value="<?= e($editSection['section_name'] ?? '') ?>" placeholder="e.g., A, B, or BSIT-3A">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Students</label>
                        <input type="number" name="max_students" class="form-control" value="<?= e($editSection['max_students'] ?? 40) ?>" min="1" max="100">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Schedule</label>
                        <input type="text" name="schedule" class="form-control" value="<?= e($editSection['schedule'] ?? '') ?>" placeholder="e.g., MWF 8:00-9:30 AM">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Room</label>
                        <input type="text" name="room" class="form-control" value="<?= e($editSection['room'] ?? '') ?>" placeholder="e.g., CL-301">
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Assign Instructor</label>
                    <select name="instructor_id" class="form-control">
                        <option value="">No Instructor</option>
                        <?php foreach ($instructors as $inst): ?>
                        <option value="<?= $inst['users_id'] ?>" <?= ($editInstructor['user_teacher_id'] ?? '') == $inst['users_id'] ? 'selected' : '' ?>><?= e($inst['last_name'] . ', ' . $inst['first_name']) ?> (<?= e($inst['employee_id'] ?? 'N/A') ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="status" value="active" <?= ($editSection['status'] ?? 'active') === 'active' ? 'checked' : '' ?>> Active</label>
                        <label class="radio-label"><input type="radio" name="status" value="inactive" <?= ($editSection['status'] ?? '') === 'inactive' ? 'checked' : '' ?>> Inactive</label>
                    </div>
                </div>
            </div>
            
            <div class="form-actions">
                <a href="sections.php" class="btn btn-outline">Cancel</a>
                <button type="submit" class="btn btn-success">💾 <?= $action === 'create' ? 'Create Section' : 'Save Changes' ?></button>
            </div>
        </form>
        <?php endif; ?>
        
    </div>
</main>

<style>
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.page-header h2{font-size:28px;font-weight:800;margin:0 0 6px;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.text-muted{color:var(--gray-500);margin:0;font-size:15px}
.back-link{color:var(--primary);font-size:14px;display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;font-weight:600;transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
.back-link:hover{gap:8px;color:#1e3a8a}

.filters-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.filters-form{display:flex;gap:16px;align-items:flex-end}
.filter-group{display:flex;flex-direction:column;gap:8px}
.filter-group label{font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.025em}

.sections-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px}
.section-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:2px solid #e5e7eb;border-radius:16px;padding:28px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.section-card:hover{border-color:#3b82f6;box-shadow:0 8px 16px rgba(59,130,246,0.15);transform:translateY(-4px)}
.section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.section-subject{background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);color:#1e3a8a;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:800;box-shadow:0 2px 4px rgba(0,0,0,0.08)}
.section-name{margin:0 0 6px;font-size:22px;font-weight:800;color:#111827}
.section-subject-name{margin:0 0 20px;font-size:14px;color:#6b7280;font-weight:500}

.enrollment-code-box{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-radius:10px;margin-bottom:16px;border:2px solid #fbbf24}
.code-label{font-size:12px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.05em}
.code-value{font-size:18px;font-weight:900;color:#1e3a8a;font-family:monospace;letter-spacing:2px}
.btn-copy{background:#ffffff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;transition:all 0.2s;font-size:16px}
.btn-copy:hover{background:#1e3a8a;transform:scale(1.1)}

.section-details{display:flex;flex-direction:column;gap:10px;margin-bottom:20px;padding:16px;background:linear-gradient(135deg,#f9fafb 0%,#ffffff 100%);border-radius:12px}
.detail{display:flex;align-items:center;gap:10px;font-size:14px;color:#374151;font-weight:500}
.detail-icon{font-size:18px;width:24px;text-align:center}

.section-stats{padding:20px 0;border-top:2px solid #f3f4f6;border-bottom:2px solid #f3f4f6;margin-bottom:20px}
.enrollment{display:flex;flex-direction:column;gap:8px}
.enrollment-num{font-size:28px;font-weight:800;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.enrollment-label{font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
.enrollment-bar{height:10px;background:#e5e7eb;border-radius:6px;overflow:hidden;box-shadow:inset 0 2px 4px rgba(0,0,0,0.06)}
.enrollment-fill{height:100%;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);border-radius:6px;transition:width 0.5s cubic-bezier(0.4,0,0.2,1);box-shadow:0 0 8px rgba(59,130,246,0.4)}

.section-actions{display:flex;gap:10px}

.empty-state{text-align:center;padding:80px 24px;background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:2px dashed #e5e7eb;border-radius:16px}
.empty-state-icon{font-size:64px;margin-bottom:16px;opacity:0.5}
.empty-state h3{margin:0 0 8px;font-size:22px;color:#374151;font-weight:700}
.empty-state p{margin:0;color:#6b7280;font-size:15px}

.form-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)}
.form-section{padding:28px}
.form-section h3{margin:0 0 28px;font-size:20px;color:#111827;font-weight:800;display:flex;align-items:center;gap:10px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.form-group{margin-bottom:24px}
.form-label{display:block;font-size:14px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.025em;font-size:12px}
.required{color:#dc2626;font-weight:700}
.radio-group{display:flex;gap:28px}
.radio-label{display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;color:#374151;transition:color 0.2s}
.radio-label:hover{color:#1e3a8a}
.form-actions{display:flex;justify-content:flex-end;gap:14px;padding:24px 28px;background:linear-gradient(135deg,#f9fafb 0%,#f3f4f6 100%);border-top:1px solid #e5e7eb}

.badge{display:inline-block;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700}
.badge-success{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);color:#065f46}
.badge-secondary{background:#e5e7eb;color:#6b7280}

.alert{padding:18px 24px;border-radius:12px;margin-bottom:24px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.alert-success{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);color:#065f46;color:#991b1b;tempMsg.textContent = '✓ Code ' + code + ' copied!';
        tempMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white;padding:16px 24px;border-radius:10px;font-weight:600;z-index:10000;box-shadow:0 4px 12px rgba(16,185,129,0.3);animation:slideIn 0.3s ease;';
        document.body.appendChild(tempMsg);

        setTimeout(function() {
            tempMsg.style.animation = 'slideOut 0.3s ease';
            setTimeout(function() {
                document.body.removeChild(tempMsg);
            }, 300);
        }, 2000);
    }).catch(function(err) {
        alert('Failed to copy code. Please copy manually: ' + code);
        console.error('Copy failed:', err);
    });
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>