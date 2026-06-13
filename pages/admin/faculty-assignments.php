<?php
/**
 * Admin - Faculty Assignments
 * Assign instructors to subject offerings
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Faculty Assignments';
$currentPage = 'faculty-assignments';

$semesterFilter = $_GET['semester_id'] ?? '';
$error = '';
$success = '';

// Get instructors
$instructors = db()->fetchAll(
    "SELECT users_id, first_name, last_name, employee_id, email
     FROM users WHERE role = 'instructor' AND status = 'active'
     ORDER BY last_name, first_name"
);

// Get semesters from semester table
$semesters = db()->fetchAll(
    "SELECT s.semester_id, s.semester_name, s.academic_year, s.status
     FROM semester s
     JOIN sem_type st ON s.sem_type_id = st.sem_type_id
     ORDER BY s.academic_year DESC, st.sem_level"
);

// Get sections grouped by subject_offered_id
$allSections = db()->fetchAll(
    "SELECT sec.section_id, sec.section_name, sec.subject_offered_id
     FROM section sec
     WHERE sec.status = 'active'
     ORDER BY sec.section_name"
);
$sectionsByOffering = [];
foreach ($allSections as $sec) {
    $sectionsByOffering[$sec['subject_offered_id']][] = $sec;
}

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    
    if ($postAction === 'assign') {
        $subjectOfferedId = (int)$_POST['subject_offered_id'];
        $instructorId = (int)$_POST['instructor_id'];
        $sectionId = (int)$_POST['section_id'];

        if ($subjectOfferedId && $instructorId && $sectionId) {
            // Check if already assigned to this section
            $exists = db()->fetchOne(
                "SELECT faculty_subject_id FROM faculty_subject WHERE subject_offered_id = ? AND user_teacher_id = ? AND section_id = ?",
                [$subjectOfferedId, $instructorId, $sectionId]
            );

            if ($exists) {
                db()->execute(
                    "UPDATE faculty_subject SET status = 'active', updated_at = NOW() WHERE faculty_subject_id = ?",
                    [$exists['faculty_subject_id']]
                );
            } else {
                db()->execute(
                    "INSERT INTO faculty_subject (subject_offered_id, user_teacher_id, section_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'active', NOW(), NOW())",
                    [$subjectOfferedId, $instructorId, $sectionId]
                );
            }
            $success = 'Instructor assigned successfully!';
        } else {
            $error = 'Please select an instructor and a section.';
        }
    }
    
    if ($postAction === 'unassign') {
        $assignmentId = (int)$_POST['assignment_id'];
        // Soft delete - set status to inactive instead of removing record
        db()->execute("UPDATE faculty_subject SET status = 'inactive', assigned_at = NOW() WHERE faculty_subject_id = ?", [$assignmentId]);
        $success = 'Assignment removed!';
    }
    
    if ($postAction === 'update_status') {
        $assignmentId = (int)$_POST['assignment_id'];
        $status = $_POST['status'];
        db()->execute("UPDATE faculty_subject SET status = ?, updated_at = NOW() WHERE faculty_subject_id = ?", [$status, $assignmentId]);
        $success = 'Status updated!';
    }
}

// Build query for offerings with assignments (using semester table)
$whereClause = "WHERE so.status IN ('open', 'active')";
$params = [];

if ($semesterFilter) { $whereClause .= " AND so.semester_id = ?"; $params[] = $semesterFilter; }

$offerings = db()->fetchAll(
    "SELECT so.*, s.subject_code, s.subject_name, s.units, sem.academic_year, sem.semester_name,
        (SELECT COUNT(*) FROM section sec WHERE sec.subject_offered_id = so.subject_offered_id) as section_count,
        (SELECT COUNT(*) FROM faculty_subject fs WHERE fs.subject_offered_id = so.subject_offered_id AND fs.status = 'active') as instructor_count
     FROM subject_offered so
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     $whereClause
     ORDER BY sem.academic_year DESC, s.subject_code",
    $params
);

// Get all assignments (with semester table and section info)
$assignments = db()->fetchAll(
    "SELECT fs.*, sem.academic_year, sem.semester_name, s.subject_code, s.subject_name,
        u.first_name, u.last_name, u.employee_id, u.email,
        sec.section_name
     FROM faculty_subject fs
     JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     JOIN users u ON fs.user_teacher_id = u.users_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     LEFT JOIN section sec ON fs.section_id = sec.section_id
     ORDER BY sem.academic_year DESC, s.subject_code, u.last_name"
);

// Group assignments by offering
$assignmentsByOffering = [];
foreach ($assignments as $a) {
    $assignmentsByOffering[$a['subject_offered_id']][] = $a;
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <div class="page-header">
            <div>
                <h2>Faculty Assignments</h2>
                <p class="text-muted">Assign instructors to subject offerings</p>
            </div>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group">
                    <label>Semester</label>
                    <select name="semester_id" class="form-control">
                        <option value="">All Semesters</option>
                        <?php foreach ($semesters as $sem): ?>
                        <option value="<?= $sem['semester_id'] ?>" <?= $semesterFilter == $sem['semester_id'] ? 'selected' : '' ?>>
                            <?= e($sem['semester_name']) ?> (<?= e($sem['academic_year']) ?>)
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="filter-group">
                    <button type="submit" class="btn btn-primary">Filter</button>
                    <a href="faculty-assignments.php" class="btn btn-outline">Reset</a>
                </div>
            </form>
        </div>
        
        <!-- Offerings with Assignments -->
        <?php if (empty($offerings)): ?>
        <div class="empty-state">
            <div class="empty-state-icon">👨‍🏫</div>
            <h3>No Subject Offerings</h3>
            <p>Create subject offerings first to assign instructors.</p>
            <a href="subject-offerings.php?action=create" class="btn btn-success" style="margin-top:16px">+ Add Offering</a>
        </div>
        <?php else: ?>
        <div class="offerings-list">
            <?php foreach ($offerings as $offering): ?>
            <div class="offering-card">
                <div class="offering-header">
                    <div class="offering-info">
                        <span class="subject-code"><?= e($offering['subject_code']) ?></span>
                        <h3><?= e($offering['subject_name']) ?></h3>
                        <div class="offering-meta">
                            <span>📅 <?= e($offering['academic_year'] ?? 'N/A') ?></span>
                            <span>📚 <?= e($offering['semester_name'] ?? 'N/A') ?></span>
                            <span>📊 <?= $offering['units'] ?> units</span>
                            <span>🏫 <?= $offering['section_count'] ?> sections</span>
                        </div>
                    </div>
                    <div class="offering-stats">
                        <span class="instructor-count"><?= $offering['instructor_count'] ?></span>
                        <span class="instructor-label">Instructor(s)</span>
                    </div>
                </div>
                
                <!-- Current Assignments -->
                <?php if (!empty($assignmentsByOffering[$offering['subject_offered_id']])): ?>
                <div class="assignments-list">
                    <?php foreach ($assignmentsByOffering[$offering['subject_offered_id']] as $assignment): ?>
                    <div class="assignment-item">
                        <div class="instructor-avatar"><?= strtoupper(substr($assignment['first_name'], 0, 1) . substr($assignment['last_name'], 0, 1)) ?></div>
                        <div class="instructor-info">
                            <span class="instructor-name"><?= e($assignment['first_name'] . ' ' . $assignment['last_name']) ?></span>
                            <span class="instructor-id"><?= e($assignment['employee_id'] ?? $assignment['email']) ?> · Section <?= e($assignment['section_name'] ?? 'N/A') ?></span>
                        </div>
                        <form method="POST" style="display:flex;gap:8px;align-items:center">
                            <input type="hidden" name="assignment_id" value="<?= $assignment['faculty_subject_id'] ?>">
                            <select name="status" class="status-select status-<?= $assignment['status'] ?>" onchange="this.form.querySelector('[name=action]').value='update_status';this.form.submit()">
                                <option value="active" <?= $assignment['status'] === 'active' ? 'selected' : '' ?>>Active</option>
                                <option value="inactive" <?= $assignment['status'] === 'inactive' ? 'selected' : '' ?>>Inactive</option>
                            </select>
                            <input type="hidden" name="action" value="unassign">
                            <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Remove this assignment?')">✕</button>
                        </form>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
                
                <!-- Add Assignment Form -->
                <form method="POST" class="add-assignment-form">
                    <input type="hidden" name="action" value="assign">
                    <input type="hidden" name="subject_offered_id" value="<?= $offering['subject_offered_id'] ?>">
                    <select name="instructor_id" class="form-control" required>
                        <option value="">+ Assign instructor...</option>
                        <?php foreach ($instructors as $inst): ?>
                        <option value="<?= $inst['users_id'] ?>"><?= e($inst['last_name'] . ', ' . $inst['first_name']) ?> (<?= e($inst['employee_id'] ?? $inst['email']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                    <select name="section_id" class="form-control" required>
                        <option value="">Select section...</option>
                        <?php if (!empty($sectionsByOffering[$offering['subject_offered_id']])): ?>
                            <?php foreach ($sectionsByOffering[$offering['subject_offered_id']] as $sec): ?>
                            <option value="<?= $sec['section_id'] ?>">Section <?= e($sec['section_name']) ?></option>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                    <button type="submit" class="btn btn-success btn-sm">Assign</button>
                </form>
                <?php if (empty($sectionsByOffering[$offering['subject_offered_id']])): ?>
                <p class="no-sections-note">No sections created yet. <a href="sections.php">Create sections</a> first.</p>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
        
        <!-- Summary Card -->
        <div class="summary-card">
            <h3>📊 Assignment Summary</h3>
            <div class="summary-stats">
                <div class="summary-stat">
                    <span class="summary-value"><?= count($offerings) ?></span>
                    <span class="summary-label">Subject Offerings</span>
                </div>
                <div class="summary-stat">
                    <span class="summary-value"><?= count($instructors) ?></span>
                    <span class="summary-label">Available Instructors</span>
                </div>
                <div class="summary-stat">
                    <span class="summary-value"><?= count($assignments) ?></span>
                    <span class="summary-label">Total Assignments</span>
                </div>
            </div>
        </div>
        
    </div>
</main>

<style>
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.page-header h2{font-size:28px;font-weight:800;margin:0 0 6px;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.text-muted{color:var(--gray-500);margin:0;font-size:15px}

.filters-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.filters-form{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
.filter-group{display:flex;flex-direction:column;gap:8px}
.filter-group label{font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.025em}

.offerings-list{display:flex;flex-direction:column;gap:24px;margin-bottom:28px}
.offering-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05);transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}
.offering-card:hover{box-shadow:0 10px 15px -3px rgba(0,0,0,0.08),0 4px 6px -2px rgba(0,0,0,0.04);border-color:#3b82f6}
.offering-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.offering-info h3{margin:10px 0;font-size:20px;font-weight:800;color:#111827}
.offering-meta{display:flex;gap:18px;font-size:14px;color:#6b7280;font-weight:500}
.offering-stats{text-align:center;padding:20px;background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-radius:12px;box-shadow:0 2px 4px rgba(0,0,0,0.08)}
.instructor-count{display:block;font-size:36px;font-weight:800;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.instructor-label{font-size:13px;color:#6b7280;margin-top:4px;font-weight:600}

.subject-code{background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);color:#1e3a8a;padding:6px 16px;border-radius:24px;font-size:13px;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,0.08)}

.assignments-list{display:flex;flex-direction:column;gap:14px;padding:20px 0;border-top:2px solid #f3f4f6}
.assignment-item{display:flex;align-items:center;gap:14px;padding:16px;background:linear-gradient(135deg,#f9fafb 0%,#f3f4f6 100%);border-radius:12px;border:1px solid #e5e7eb;transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
.assignment-item:hover{background:linear-gradient(135deg,#fef3c7 0%,rgba(254,243,199,0.3) 100%);border-color:#3b82f6}
.instructor-avatar{width:44px;height:44px;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;box-shadow:0 4px 6px -1px rgba(30,58,138,0.3)}
.instructor-info{flex:1}
.instructor-name{display:block;font-weight:700;color:#111827;font-size:15px}
.instructor-id{font-size:13px;color:#6b7280;margin-top:2px}

.status-select{padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;transition:all 0.2s}
.status-active{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);color:#065f46;border-color:#10b981}
.status-inactive{background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);color:#6b7280;border-color:#9ca3af}

.add-assignment-form{display:flex;gap:14px;padding-top:20px;border-top:2px solid #f3f4f6;align-items:center}
.add-assignment-form select{flex:1}
.no-sections-note{font-size:13px;color:#b91c1c;margin:8px 0 0;font-weight:500}
.no-sections-note a{color:#1e3a8a;text-decoration:underline}

.summary-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.summary-card h3{margin:0 0 20px;font-size:18px;font-weight:800;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.summary-stats{display:flex;gap:40px}
.summary-stat{text-align:center}
.summary-value{display:block;font-size:32px;font-weight:800;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.summary-label{font-size:14px;color:#6b7280;margin-top:4px;font-weight:600}

.alert{padding:18px 24px;border-radius:12px;margin-bottom:24px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.alert-success{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);color:#065f46;color:#991b1b;gap:20px}.summary-stats{flex-direction:column;gap:20px}.page-header h2{font-size:22px}}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>