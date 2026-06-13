<?php
/**
 * Dean - Faculty Assignments (Fixed)
 * Assign instructors to subject offerings and sections
 * Only shows data from the dean's department
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('dean');

$pageTitle = 'Faculty Assignments';
$currentPage = 'faculty-assignments';
$userId = Auth::id();

// Get dean's department
$dean = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [$userId]);
$deptId = $dean['department_id'] ?? 0;

if (!$deptId) {
    die("Error: Dean is not assigned to a department.");
}

// Get department info
$department = db()->fetchOne("SELECT department_name FROM department WHERE department_id = ?", [$deptId]);

$yearFilter = $_GET['year'] ?? '';
$semesterFilter = $_GET['semester'] ?? '';
$error = '';
$success = '';

// Get instructors from dean's department only
$instructors = db()->fetchAll(
    "SELECT users_id, first_name, last_name, employee_id, email
     FROM users WHERE role = 'instructor' AND status = 'active' AND department_id = ?
     ORDER BY last_name, first_name",
    [$deptId]
);

// Academic years
$currentYear = date('Y');
$academicYears = [];
for ($i = $currentYear - 2; $i <= $currentYear + 1; $i++) {
    $academicYears[] = "$i-" . ($i + 1);
}

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';

    if ($postAction === 'assign') {
        $subjectOfferedId = (int)$_POST['subject_offered_id'];
        $sectionId = !empty($_POST['section_id']) ? (int)$_POST['section_id'] : null;
        $instructorId = (int)$_POST['instructor_id'];

        // Verify offering belongs to dean's department
        $validOffering = db()->fetchOne(
            "SELECT so.subject_offered_id FROM subject_offered so
             JOIN subject s ON so.subject_id = s.subject_id
             JOIN department_program dp ON s.program_id = dp.program_id
             WHERE so.subject_offered_id = ? AND dp.department_id = ?",
            [$subjectOfferedId, $deptId]
        );

        if ($subjectOfferedId && $instructorId && $validOffering) {
            // Check if already assigned to this section
            if ($sectionId) {
                $exists = db()->fetchOne(
                    "SELECT faculty_subject_id FROM faculty_subject
                     WHERE subject_offered_id = ? AND section_id = ?",
                    [$subjectOfferedId, $sectionId]
                );
            } else {
                $exists = db()->fetchOne(
                    "SELECT faculty_subject_id FROM faculty_subject
                     WHERE subject_offered_id = ? AND user_teacher_id = ? AND section_id IS NULL",
                    [$subjectOfferedId, $instructorId]
                );
            }

            if ($exists) {
                // Update existing assignment
                db()->execute(
                    "UPDATE faculty_subject SET user_teacher_id = ?, status = 'active', updated_at = NOW()
                     WHERE faculty_subject_id = ?",
                    [$instructorId, $exists['faculty_subject_id']]
                );
                $success = 'Assignment updated successfully!';
            } else {
                // Create new assignment
                db()->execute(
                    "INSERT INTO faculty_subject (subject_offered_id, section_id, user_teacher_id, status, assigned_at, updated_at)
                     VALUES (?, ?, ?, 'active', NOW(), NOW())",
                    [$subjectOfferedId, $sectionId, $instructorId]
                );
                $success = 'Instructor assigned successfully!';
            }
        } else {
            $error = 'Invalid assignment data.';
        }
    }

    if ($postAction === 'unassign') {
        $assignmentId = (int)$_POST['assignment_id'];

        // Verify assignment belongs to dean's department
        $validAssignment = db()->fetchOne(
            "SELECT fs.faculty_subject_id FROM faculty_subject fs
             JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
             JOIN subject s ON so.subject_id = s.subject_id
             JOIN department_program dp ON s.program_id = dp.program_id
             WHERE fs.faculty_subject_id = ? AND dp.department_id = ?",
            [$assignmentId, $deptId]
        );

        if ($validAssignment) {
            db()->execute("DELETE FROM faculty_subject WHERE faculty_subject_id = ?", [$assignmentId]);
            $success = 'Assignment removed!';
        }
    }

    if ($postAction === 'update_status') {
        $assignmentId = (int)$_POST['assignment_id'];
        $status = $_POST['status'];

        // Verify assignment belongs to dean's department
        $validAssignment = db()->fetchOne(
            "SELECT fs.faculty_subject_id FROM faculty_subject fs
             JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
             JOIN subject s ON so.subject_id = s.subject_id
             JOIN department_program dp ON s.program_id = dp.program_id
             WHERE fs.faculty_subject_id = ? AND dp.department_id = ?",
            [$assignmentId, $deptId]
        );

        if ($validAssignment) {
            db()->execute("UPDATE faculty_subject SET status = ?, updated_at = NOW() WHERE faculty_subject_id = ?", [$status, $assignmentId]);
            $success = 'Status updated!';
        }
    }
}

// Build query for offerings - FILTER BY DEAN'S DEPARTMENT
$whereClause = "WHERE dp.department_id = ?";
$params = [$deptId];

if ($yearFilter) { $whereClause .= " AND sem.academic_year = ?"; $params[] = $yearFilter; }
if ($semesterFilter) { $whereClause .= " AND sem.semester_name = ?"; $params[] = $semesterFilter; }

$offerings = db()->fetchAll(
    "SELECT so.*, sem.academic_year, sem.semester_name as semester, s.subject_code, s.subject_name, s.units,
        (SELECT COUNT(*) FROM section sec WHERE sec.subject_offered_id = so.subject_offered_id) as section_count,
        (SELECT COUNT(*) FROM faculty_subject fs WHERE fs.subject_offered_id = so.subject_offered_id AND fs.status = 'active') as instructor_count
     FROM subject_offered so
     JOIN subject s ON so.subject_id = s.subject_id
     JOIN department_program dp ON s.program_id = dp.program_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     $whereClause
     ORDER BY sem.academic_year DESC, sem.semester_name DESC, s.subject_code",
    $params
);

// Get sections for each offering
$sectionsByOffering = [];
foreach ($offerings as $off) {
    $sectionsByOffering[$off['subject_offered_id']] = db()->fetchAll(
        "SELECT sec.*,
            (SELECT CONCAT(u.first_name, ' ', u.last_name)
             FROM faculty_subject fs
             JOIN users u ON fs.user_teacher_id = u.users_id
             WHERE fs.section_id = sec.section_id AND fs.status = 'active' LIMIT 1) as instructor_name,
            (SELECT fs.faculty_subject_id
             FROM faculty_subject fs
             WHERE fs.section_id = sec.section_id AND fs.status = 'active' LIMIT 1) as assignment_id,
            (SELECT fs.user_teacher_id
             FROM faculty_subject fs
             WHERE fs.section_id = sec.section_id AND fs.status = 'active' LIMIT 1) as instructor_id
         FROM section sec
         WHERE sec.subject_offered_id = ?
         ORDER BY sec.section_name",
        [$off['subject_offered_id']]
    );
}

// Get all assignments for the dean's department
$assignments = db()->fetchAll(
    "SELECT fs.*, sem.academic_year, sem.semester_name as semester, s.subject_code, s.subject_name,
        u.first_name, u.last_name, u.employee_id, u.email,
        sec.section_name
     FROM faculty_subject fs
     JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     JOIN users u ON fs.user_teacher_id = u.users_id
     LEFT JOIN section sec ON fs.section_id = sec.section_id
     JOIN department_program dp ON s.program_id = dp.program_id
     WHERE dp.department_id = ?
     ORDER BY sem.academic_year DESC, s.subject_code, sec.section_name, u.last_name",
    [$deptId]
);

// Count stats
$totalAssignments = count($assignments);
$sectionsWithoutInstructor = 0;
foreach ($sectionsByOffering as $sections) {
    foreach ($sections as $sec) {
        if (empty($sec['instructor_name'])) {
            $sectionsWithoutInstructor++;
        }
    }
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
                <p class="text-muted"><?= e($department['department_name'] ?? 'Department') ?> - Assign instructors to sections</p>
            </div>
        </div>

        <?php if ($success): ?><div class="alert alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>

        <!-- Filters -->
        <div class="filters-card">
            <form method="GET" class="filters-form">
                <div class="filter-group">
                    <label>Academic Year</label>
                    <select name="year" class="form-control">
                        <option value="">All Years</option>
                        <?php foreach ($academicYears as $year): ?>
                        <option value="<?= $year ?>" <?= $yearFilter === $year ? 'selected' : '' ?>><?= $year ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Semester</label>
                    <select name="semester" class="form-control">
                        <option value="">All Semesters</option>
                        <option value="1st" <?= $semesterFilter === '1st' ? 'selected' : '' ?>>1st Semester</option>
                        <option value="2nd" <?= $semesterFilter === '2nd' ? 'selected' : '' ?>>2nd Semester</option>
                        <option value="summer" <?= $semesterFilter === 'summer' ? 'selected' : '' ?>>Summer</option>
                    </select>
                </div>
                <div class="filter-group">
                    <button type="submit" class="btn btn-primary">Filter</button>
                    <a href="faculty-assignments.php" class="btn btn-outline">Reset</a>
                </div>
            </form>
        </div>

        <!-- Offerings with Sections -->
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
                            <span>📅 <?= e($offering['academic_year']) ?></span>
                            <span>📚 <?= e($offering['semester']) ?> Semester</span>
                            <span>📊 <?= $offering['units'] ?> units</span>
                        </div>
                    </div>
                    <div class="offering-stats">
                        <span class="stat-number"><?= $offering['section_count'] ?></span>
                        <span class="stat-label">Sections</span>
                    </div>
                </div>

                <!-- Sections with Instructor Assignment -->
                <?php $sections = $sectionsByOffering[$offering['subject_offered_id']] ?? []; ?>
                <?php if (empty($sections)): ?>
                <div class="no-sections-msg">
                    <p>No sections created yet. <a href="sections.php?action=create&offering_id=<?= $offering['subject_offered_id'] ?>">Create sections first</a></p>
                </div>
                <?php else: ?>
                <div class="sections-list">
                    <div class="sections-header">
                        <span>Section</span>
                        <span>Instructor</span>
                        <span>Action</span>
                    </div>
                    <?php foreach ($sections as $section): ?>
                    <div class="section-row <?= empty($section['instructor_name']) ? 'no-instructor' : '' ?>">
                        <div class="section-info">
                            <strong><?= e($section['section_name']) ?></strong>
                            <span class="section-meta">
                                <?php if ($section['schedule']): ?><?= e($section['schedule']) ?><?php endif; ?>
                                <?php if ($section['room']): ?> | <?= e($section['room']) ?><?php endif; ?>
                            </span>
                        </div>

                        <div class="instructor-cell">
                            <?php if ($section['instructor_name']): ?>
                            <div class="assigned-instructor">
                                <span class="instructor-avatar-sm"><?= strtoupper(substr($section['instructor_name'], 0, 2)) ?></span>
                                <span><?= e($section['instructor_name']) ?></span>
                            </div>
                            <?php else: ?>
                            <span class="no-instructor-text">Not assigned</span>
                            <?php endif; ?>
                        </div>

                        <div class="action-cell">
                            <form method="POST" class="inline-form">
                                <input type="hidden" name="action" value="assign">
                                <input type="hidden" name="subject_offered_id" value="<?= $offering['subject_offered_id'] ?>">
                                <input type="hidden" name="section_id" value="<?= $section['section_id'] ?>">
                                <select name="instructor_id" class="form-control form-control-sm" onchange="this.form.submit()">
                                    <option value=""><?= $section['instructor_name'] ? 'Change...' : 'Select instructor...' ?></option>
                                    <?php foreach ($instructors as $inst): ?>
                                    <option value="<?= $inst['users_id'] ?>" <?= $section['instructor_id'] == $inst['users_id'] ? 'selected' : '' ?>>
                                        <?= e($inst['last_name'] . ', ' . $inst['first_name']) ?>
                                    </option>
                                    <?php endforeach; ?>
                                </select>
                            </form>
                            <?php if ($section['assignment_id']): ?>
                            <form method="POST" class="inline-form" onsubmit="return confirm('Remove instructor from this section?')">
                                <input type="hidden" name="action" value="unassign">
                                <input type="hidden" name="assignment_id" value="<?= $section['assignment_id'] ?>">
                                <button type="submit" class="btn btn-danger btn-xs" title="Remove">✕</button>
                            </form>
                            <?php endif; ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
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
                    <span class="summary-value"><?= $totalAssignments ?></span>
                    <span class="summary-label">Total Assignments</span>
                </div>
                <div class="summary-stat <?= $sectionsWithoutInstructor > 0 ? 'warning' : '' ?>">
                    <span class="summary-value"><?= $sectionsWithoutInstructor ?></span>
                    <span class="summary-label">Unassigned Sections</span>
                </div>
            </div>
        </div>

    </div>
</main>

<style>
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.page-header h2{font-size:28px;font-weight:800;margin:0 0 6px;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.text-muted{color:#6b7280;margin:0;font-size:15px}

.filters-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:28px}
.filters-form{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
.filter-group{display:flex;flex-direction:column;gap:8px}
.filter-group label{font-size:12px;font-weight:700;color:#374151;text-transform:uppercase}

.offerings-list{display:flex;flex-direction:column;gap:24px;margin-bottom:28px}
.offering-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;transition:all 0.3s}
.offering-card:hover{box-shadow:0 10px 15px -3px rgba(0,0,0,0.08);border-color:#3b82f6}
.offering-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
.offering-info h3{margin:10px 0;font-size:20px;font-weight:800;color:#111827}
.offering-meta{display:flex;gap:18px;font-size:14px;color:#6b7280}
.offering-stats{text-align:center;padding:16px 24px;background:#f0fdf4;border-radius:12px}
.stat-number{display:block;font-size:32px;font-weight:800;color:#16a34a}
.stat-label{font-size:12px;color:#6b7280;font-weight:600}

.subject-code{background:linear-gradient(135deg,#fef3c7,#fde68a);color:#1e3a8a;padding:6px 16px;border-radius:24px;font-size:12px;font-weight:700}

/* Sections Table */
.sections-list{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.sections-header{display:grid;grid-template-columns:1fr 1fr 200px;gap:16px;padding:12px 20px;background:#f9fafb;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase}
.section-row{display:grid;grid-template-columns:1fr 1fr 200px;gap:16px;padding:16px 20px;border-top:1px solid #e5e7eb;align-items:center}
.section-row:hover{background:#f9fafb}
.section-row.no-instructor{background:#fef3c7}
.section-info strong{display:block;font-size:15px;color:#111827}
.section-meta{font-size:13px;color:#6b7280}

.instructor-cell{min-height:40px;display:flex;align-items:center}
.assigned-instructor{display:flex;align-items:center;gap:10px}
.instructor-avatar-sm{width:32px;height:32px;background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.no-instructor-text{color:#d97706;font-style:italic;font-size:13px}

.action-cell{display:flex;gap:8px;align-items:center}
.inline-form{display:inline-flex;align-items:center}
.form-control-sm{padding:6px 10px;font-size:13px;min-width:150px}

.no-sections-msg{padding:20px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:8px}
.no-sections-msg a{color:#3b82f6;font-weight:600}

.summary-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px}
.summary-card h3{margin:0 0 20px;font-size:18px;font-weight:800;color:#111827}
.summary-stats{display:flex;gap:40px;flex-wrap:wrap}
.summary-stat{text-align:center;min-width:120px}
.summary-stat.warning .summary-value{color:#d97706}
.summary-value{display:block;font-size:32px;font-weight:800;color:#1e3a8a}
.summary-label{font-size:13px;color:#6b7280;font-weight:600}

.alert{padding:16px 20px;border-radius:10px;margin-bottom:24px;font-weight:600}
.alert-success{background:#d1fae5;color:#065f46;color:#991b1b;padding:60px;background:#fff;border:2px dashed #e5e7eb;border-radius:16px}
.empty-state-icon{font-size:56px;margin-bottom:16px}
.empty-state h3{margin:0 0 8px;font-size:20px;color:#374151}
.empty-state p{margin:0;color:#6b7280}

.btn{padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;text-decoration:none;border:none;display:inline-flex;align-items:center;gap:6px}
.btn-primary{background:#3b82f6;color:#fff}
.btn-primary:hover{background:#2563eb}
.btn-success{background:#10b981;color:#fff}
.btn-success:hover{background:#059669}
.btn-outline{background:#fff;border:1px solid #d1d5db;color:#374151}
.btn-outline:hover{border-color:#3b82f6;color:#3b82f6}
.btn-danger{background:#ef4444;color:#fff}
.btn-danger:hover{background:#dc2626}
.btn-xs{padding:4px 8px;font-size:12px}

@media(max-width:768px){
    .offering-header{flex-direction:column;gap:20px}
    .sections-header,.section-row{grid-template-columns:1fr;gap:8px}
    .summary-stats{flex-direction:column;gap:16px}
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
