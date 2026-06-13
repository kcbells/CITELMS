<?php
/**
 * Admin - Enrollments Management
 * Manage student enrollments in sections
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Enrollments';
$currentPage = 'enrollments';

$action = $_GET['action'] ?? 'list';
$sectionFilter = $_GET['section_id'] ?? '';
$search = $_GET['search'] ?? '';
$error = '';
$success = '';

// Get sections for filter (with semester table join)
$sections = db()->fetchAll(
    "SELECT sec.section_id, sec.section_name, s.subject_code, s.subject_name, sem.academic_year, sem.semester_name
     FROM section sec
     JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     WHERE sec.status = 'active'
     ORDER BY sem.academic_year DESC, s.subject_code, sec.section_name"
);

// Get students for enrollment form
$students = db()->fetchAll(
    "SELECT users_id, first_name, last_name, student_id, email 
     FROM users WHERE role = 'student' AND status = 'active' 
     ORDER BY last_name, first_name"
);

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    
    if ($postAction === 'enroll') {
        $sectionId = (int)$_POST['section_id'];
        $studentIds = $_POST['student_ids'] ?? [];
        
        if (empty($sectionId) || empty($studentIds)) {
            $error = 'Please select a section and at least one student.';
        } else {
            // Check section capacity
            $section = db()->fetchOne(
                "SELECT sec.*, (SELECT COUNT(*) FROM student_subject ss WHERE ss.section_id = sec.section_id) as enrolled
                 FROM section sec WHERE section_id = ?", 
                [$sectionId]
            );
            
            $available = $section['max_students'] - $section['enrolled'];
            
            if (count($studentIds) > $available) {
                $error = "Only $available slots available in this section.";
            } else {
                // Get subject_offered_id from section
                $sectionData = db()->fetchOne("SELECT subject_offered_id FROM section WHERE section_id = ?", [$sectionId]);
                $subjectOfferedId = $sectionData['subject_offered_id'];

                $enrolled = 0;
                foreach ($studentIds as $studentId) {
                    // Check if already enrolled
                    $exists = db()->fetchOne(
                        "SELECT student_subject_id FROM student_subject WHERE subject_offered_id = ? AND user_student_id = ?",
                        [$subjectOfferedId, $studentId]
                    );

                    if (!$exists) {
                        db()->execute(
                            "INSERT INTO student_subject (user_student_id, subject_offered_id, section_id, status, enrollment_date, updated_at)
                             VALUES (?, ?, ?, 'enrolled', NOW(), NOW())",
                            [$studentId, $subjectOfferedId, $sectionId]
                        );
                        $enrolled++;
                    }
                }
                $success = "$enrolled student(s) enrolled successfully!";
            }
        }
    }
    
    if ($postAction === 'unenroll') {
        $enrollmentId = (int)$_POST['enrollment_id'];
        // Soft delete - set status to dropped instead of removing record
        db()->execute("UPDATE student_subject SET status = 'dropped', updated_at = NOW() WHERE student_subject_id = ?", [$enrollmentId]);
        header("Location: enrollments.php?section_id=" . $_POST['redirect_section'] . "&success=unenrolled");
        exit;
    }

    if ($postAction === 'update_status') {
        $enrollmentId = (int)$_POST['enrollment_id'];
        $status = $_POST['status'];
        db()->execute("UPDATE student_subject SET status = ?, updated_at = NOW() WHERE student_subject_id = ?", [$status, $enrollmentId]);
        $success = 'Status updated!';
    }
}

if (isset($_GET['success'])) {
    $success = $_GET['success'] === 'unenrolled' ? 'Student unenrolled!' : $success;
}

// Get enrollments
$whereClause = "WHERE 1=1";
$params = [];

if ($sectionFilter) {
    $whereClause .= " AND ss.section_id = ?";
    $params[] = $sectionFilter;
}

if ($search) {
    $whereClause .= " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.student_id LIKE ?)";
    $searchTerm = "%$search%";
    $params = array_merge($params, [$searchTerm, $searchTerm, $searchTerm]);
}

$enrollments = db()->fetchAll(
    "SELECT ss.*, u.first_name, u.last_name, u.student_id as student_number, u.email,
        sec.section_name, s.subject_code, s.subject_name, sem.academic_year, sem.semester_name
     FROM student_subject ss
     JOIN users u ON ss.user_student_id = u.users_id
     LEFT JOIN section sec ON ss.section_id = sec.section_id
     JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     $whereClause
     ORDER BY sem.academic_year DESC, s.subject_code, sec.section_name, u.last_name",
    $params
);

// Get section details if filtered
$currentSection = null;
if ($sectionFilter) {
    $currentSection = db()->fetchOne(
        "SELECT sec.*, s.subject_code, s.subject_name, sem.academic_year, sem.semester_name,
            (SELECT COUNT(*) FROM student_subject ss WHERE ss.section_id = sec.section_id) as enrolled
         FROM section sec
         JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         LEFT JOIN semester sem ON so.semester_id = sem.semester_id
         WHERE sec.section_id = ?",
        [$sectionFilter]
    );
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <div class="page-header">
            <div>
                <h2>Enrollments</h2>
                <p class="text-muted">Manage student enrollments</p>
            </div>
            <button onclick="document.getElementById('enrollModal').style.display='flex'" class="btn btn-success">+ Enroll Students</button>
        </div>
        
        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
        
        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group" style="flex:2">
                    <label>Filter by Section</label>
                    <select name="section_id" class="form-control" onchange="this.form.submit()">
                        <option value="">All Sections</option>
                        <?php foreach ($sections as $sec): ?>
                        <option value="<?= $sec['section_id'] ?>" <?= $sectionFilter == $sec['section_id'] ? 'selected' : '' ?>>
                            <?= e($sec['subject_code']) ?> - <?= e($sec['section_name']) ?> (<?= e($sec['academic_year'] ?? 'N/A') ?>)
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="filter-group" style="flex:1">
                    <label>Search Student</label>
                    <input type="text" name="search" class="form-control" placeholder="Name or ID..." value="<?= e($search) ?>">
                </div>
                <div class="filter-group">
                    <button type="submit" class="btn btn-primary">Filter</button>
                    <a href="enrollments.php" class="btn btn-outline">Reset</a>
                </div>
            </form>
        </div>
        
        <?php if ($currentSection): ?>
        <!-- Section Info Card -->
        <div class="section-info-card">
            <div class="section-info-header">
                <span class="subject-code"><?= e($currentSection['subject_code']) ?></span>
                <h3><?= e($currentSection['subject_name']) ?></h3>
            </div>
            <div class="section-info-details">
                <span>📅 <?= e($currentSection['academic_year'] ?? 'N/A') ?> - <?= e($currentSection['semester_name'] ?? 'N/A') ?></span>
                <span>🏫 Section <?= e($currentSection['section_name']) ?></span>
                <span>👥 <?= $currentSection['enrolled'] ?>/<?= $currentSection['max_students'] ?> enrolled</span>
            </div>
            <div class="enrollment-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: <?= min(100, ($currentSection['enrolled'] / $currentSection['max_students']) * 100) ?>%"></div>
                </div>
            </div>
        </div>
        <?php endif; ?>
        
        <!-- Enrollments Table -->
        <div class="card">
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Student ID</th>
                            <?php if (!$sectionFilter): ?><th>Subject/Section</th><?php endif; ?>
                            <th>Enrolled Date</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($enrollments)): ?>
                        <tr><td colspan="<?= $sectionFilter ? 5 : 6 ?>" class="text-center text-muted">No enrollments found</td></tr>
                        <?php else: ?>
                        <?php foreach ($enrollments as $enrollment): ?>
                        <tr>
                            <td>
                                <div class="student-cell">
                                    <div class="student-avatar"><?= strtoupper(substr($enrollment['first_name'], 0, 1) . substr($enrollment['last_name'], 0, 1)) ?></div>
                                    <div>
                                        <span class="student-name"><?= e($enrollment['first_name'] . ' ' . $enrollment['last_name']) ?></span>
                                        <span class="student-email"><?= e($enrollment['email']) ?></span>
                                    </div>
                                </div>
                            </td>
                            <td><?= e($enrollment['student_number'] ?? '—') ?></td>
                            <?php if (!$sectionFilter): ?>
                            <td>
                                <span class="subject-code"><?= e($enrollment['subject_code']) ?></span>
                                <span class="section-label">Section <?= e($enrollment['section_name']) ?></span>
                            </td>
                            <?php endif; ?>
                            <td><?= date('M d, Y', strtotime($enrollment['created_at'])) ?></td>
                            <td>
                                <form method="POST" style="display:inline">
                                    <input type="hidden" name="action" value="update_status">
                                    <input type="hidden" name="enrollment_id" value="<?= $enrollment['student_subject_id'] ?>">
                                    <select name="status" class="status-select status-<?= $enrollment['status'] ?>" onchange="this.form.submit()">
                                        <option value="enrolled" <?= $enrollment['status'] === 'enrolled' ? 'selected' : '' ?>>Enrolled</option>
                                        <option value="dropped" <?= $enrollment['status'] === 'dropped' ? 'selected' : '' ?>>Dropped</option>
                                        <option value="completed" <?= $enrollment['status'] === 'completed' ? 'selected' : '' ?>>Completed</option>
                                    </select>
                                </form>
                            </td>
                            <td>
                                <form method="POST" style="display:inline" onsubmit="return confirm('Unenroll this student?')">
                                    <input type="hidden" name="action" value="unenroll">
                                    <input type="hidden" name="enrollment_id" value="<?= $enrollment['student_subject_id'] ?>">
                                    <input type="hidden" name="redirect_section" value="<?= $sectionFilter ?>">
                                    <button type="submit" class="btn btn-danger btn-sm">Unenroll</button>
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

<!-- Enroll Modal -->
<div id="enrollModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3>Enroll Students</h3>
            <button onclick="document.getElementById('enrollModal').style.display='none'" class="modal-close">&times;</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="enroll">
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Select Section <span class="required">*</span></label>
                    <select name="section_id" class="form-control" required>
                        <option value="">Choose a section...</option>
                        <?php foreach ($sections as $sec): ?>
                        <option value="<?= $sec['section_id'] ?>"><?= e($sec['subject_code']) ?> - <?= e($sec['subject_name']) ?> (<?= e($sec['section_name']) ?>) [<?= e($sec['academic_year'] ?? 'N/A') ?>]</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Select Students <span class="required">*</span></label>
                    <div class="student-select-list">
                        <?php foreach ($students as $student): ?>
                        <label class="student-checkbox">
                            <input type="checkbox" name="student_ids[]" value="<?= $student['users_id'] ?>">
                            <span class="student-info">
                                <span class="name"><?= e($student['last_name'] . ', ' . $student['first_name']) ?></span>
                                <span class="id"><?= e($student['student_id'] ?? $student['email']) ?></span>
                            </span>
                        </label>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" onclick="document.getElementById('enrollModal').style.display='none'" class="btn btn-outline">Cancel</button>
                <button type="submit" class="btn btn-success">Enroll Selected</button>
            </div>
        </form>
    </div>
</div>

<style>
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.page-header h2{font-size:28px;font-weight:800;margin:0 0 6px;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.text-muted{color:var(--gray-500);margin:0;font-size:15px}

.filters-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.filters-form{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
.filter-group{display:flex;flex-direction:column;gap:8px}
.filter-group label{font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.025em}

.section-info-card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;padding:28px;margin-bottom:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.section-info-header{display:flex;align-items:center;gap:18px;margin-bottom:20px}
.section-info-header h3{margin:0;font-size:20px;font-weight:800;color:#111827}
.section-info-details{display:flex;gap:28px;color:#6b7280;font-size:15px;margin-bottom:20px;font-weight:500}
.enrollment-progress{background:linear-gradient(135deg,#f3f4f6 0%,#e5e7eb 100%);border-radius:10px;overflow:hidden}
.progress-bar{height:10px}
.progress-fill{height:100%;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);border-radius:10px;box-shadow:0 0 10px rgba(59,130,246,0.5)}

.card{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -1px rgba(0,0,0,0.03);transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}
.card:hover{box-shadow:0 10px 15px -3px rgba(0,0,0,0.08),0 4px 6px -2px rgba(0,0,0,0.04)}
.table-responsive{overflow-x:auto}
.data-table{width:100%;border-collapse:collapse}
.data-table th,.data-table td{padding:18px 20px;text-align:left;border-bottom:1px solid #f3f4f6}
.data-table th{background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);font-weight:700;font-size:13px;color:#1f2937;text-transform:uppercase;letter-spacing:0.05em}
.data-table tbody tr{transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
.data-table tbody tr:hover{background:linear-gradient(135deg,#fef3c7 0%,rgba(254,243,199,0.3) 100%);transform:scale(1.002)}

.student-cell{display:flex;align-items:center;gap:14px}
.student-avatar{width:44px;height:44px;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;box-shadow:0 4px 6px -1px rgba(30,58,138,0.3)}
.student-name{display:block;font-weight:700;color:#111827;font-size:15px}
.student-email{font-size:13px;color:#6b7280;margin-top:2px}

.subject-code{background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);color:#1e3a8a;padding:6px 14px;border-radius:20px;font-weight:700;font-size:13px;box-shadow:0 2px 4px rgba(0,0,0,0.08)}
.section-label{display:block;font-size:13px;color:#6b7280;margin-top:6px;font-weight:500}

.status-select{padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;transition:all 0.2s}
.status-enrolled{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);color:#065f46;border-color:#10b981}
.status-dropped{background:linear-gradient(135deg,#fee2e2 0%,#fecaca 100%);color:#991b1b;border-color:#ef4444}
.status-completed{background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);color:#1e3a8a;border-color:#3b82f6}

/* Modal */
.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);justify-content:center;align-items:center;z-index:1000;backdrop-filter:blur(4px)}
.modal-content{background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);border-radius:20px;width:100%;max-width:650px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 25px -5px rgba(0,0,0,0.15),0 10px 10px -5px rgba(0,0,0,0.08)}
.modal-header{display:flex;justify-content:space-between;align-items:center;padding:24px 28px;border-bottom:2px solid #f3f4f6;background:linear-gradient(135deg,#fef3c7 0%,rgba(254,243,199,0.3) 100%)}
.modal-header h3{margin:0;font-size:22px;font-weight:800;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.modal-close{background:none;border:none;font-size:28px;cursor:pointer;color:#6b7280;transition:all 0.2s;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.modal-close:hover{background:#f3f4f6;color:#1e3a8a}
.modal-body{padding:28px;overflow-y:auto;flex:1}
.modal-footer{padding:20px 28px;border-top:2px solid #f3f4f6;display:flex;justify-content:flex-end;gap:14px;background:linear-gradient(135deg,#f9fafb 0%,#f3f4f6 100%)}

.student-select-list{max-height:350px;overflow-y:auto;border:2px solid #e5e7eb;border-radius:12px;padding:12px;background:linear-gradient(135deg,#ffffff 0%,#fafafa 100%)}
.student-checkbox{display:flex;align-items:center;gap:14px;padding:12px;cursor:pointer;border-radius:10px;transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
.student-checkbox:hover{background:linear-gradient(135deg,#fef3c7 0%,rgba(254,243,199,0.5) 100%);transform:translateX(4px)}
.student-checkbox input{width:20px;height:20px;cursor:pointer}
.student-info .name{display:block;font-weight:700;color:#111827;font-size:15px}
.student-info .id{font-size:13px;color:#6b7280;margin-top:2px}

.form-group{margin-bottom:24px}
.form-label{display:block;font-size:14px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.025em;font-size:12px}
.required{color:#dc2626;font-weight:700}

.alert{padding:18px 24px;border-radius:12px;margin-bottom:24px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.alert-success{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);color:#065f46;color:#991b1b;margin:20px}}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>