<?php
/**
 * Dean - Dashboard
 * Academic oversight and department statistics
 * Shows data ONLY for the dean's assigned department
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('dean');

$pageTitle = 'Dean Dashboard';
$currentPage = 'dashboard';
$userId = Auth::id();

// Get dean's department
$dean = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [$userId]);
$deptId = $dean['department_id'] ?? 0;

// Get department info
$department = null;
if ($deptId) {
    $department = db()->fetchOne("SELECT * FROM department WHERE department_id = ?", [$deptId]);
}

// Get academic statistics - FILTERED BY DEPARTMENT
$totalInstructors = db()->fetchOne(
    "SELECT COUNT(*) as count FROM users WHERE role = 'instructor' AND status = 'active' AND department_id = ?",
    [$deptId]
)['count'] ?? 0;

$totalStudents = db()->fetchOne(
    "SELECT COUNT(DISTINCT ss.user_student_id) as count
     FROM student_subject ss
     JOIN section sec ON ss.section_id = sec.section_id
     JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     JOIN department_program dp ON s.program_id = dp.program_id
     WHERE dp.department_id = ? AND ss.status = 'enrolled'",
    [$deptId]
)['count'] ?? 0;

$totalSubjects = db()->fetchOne(
    "SELECT COUNT(*) as count FROM subject s
     JOIN department_program dp ON s.program_id = dp.program_id
     WHERE s.status = 'active' AND dp.department_id = ?",
    [$deptId]
)['count'] ?? 0;

$totalSections = db()->fetchOne(
    "SELECT COUNT(*) as count FROM section sec
     JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     JOIN department_program dp ON s.program_id = dp.program_id
     WHERE sec.status = 'active' AND dp.department_id = ?",
    [$deptId]
)['count'] ?? 0;

// Subject offerings for current semester - FILTERED BY DEPARTMENT
$currentYear = date('Y');
$academicYear = "$currentYear-" . ($currentYear + 1);
$currentSemester = (date('n') >= 6 && date('n') <= 10) ? '1st' : '2nd';

$activeOfferings = db()->fetchOne(
    "SELECT COUNT(*) as count FROM subject_offered so
     JOIN subject s ON so.subject_id = s.subject_id
     JOIN department_program dp ON s.program_id = dp.program_id
     LEFT JOIN semester sem ON so.semester_id = sem.semester_id
     WHERE dp.department_id = ? AND so.status IN ('active', 'open')",
    [$deptId]
)['count'] ?? 0;

// Enrollment stats - FILTERED BY DEPARTMENT
$totalEnrollments = db()->fetchOne(
    "SELECT COUNT(*) as count FROM student_subject ss
     JOIN section sec ON ss.section_id = sec.section_id
     JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     JOIN department_program dp ON s.program_id = dp.program_id
     WHERE ss.status = 'enrolled' AND dp.department_id = ?",
    [$deptId]
)['count'] ?? 0;
$avgEnrollmentPerSection = $totalSections > 0 ? round($totalEnrollments / $totalSections, 1) : 0;

// Faculty workload - FILTERED BY DEPARTMENT
$facultyWorkload = db()->fetchAll(
    "SELECT u.users_id, u.first_name, u.last_name, u.employee_id,
        COUNT(DISTINCT fs.faculty_subject_id) as subjects_count,
        COUNT(DISTINCT sec.section_id) as sections_count,
        (SELECT COUNT(*) FROM student_subject ss
         JOIN section sec2 ON ss.section_id = sec2.section_id
         JOIN subject_offered so2 ON sec2.subject_offered_id = so2.subject_offered_id
         JOIN subject s2 ON so2.subject_id = s2.subject_id
         JOIN department_program dp2 ON s2.program_id = dp2.program_id
         JOIN faculty_subject fs2 ON fs2.section_id = sec2.section_id
         WHERE fs2.user_teacher_id = u.users_id AND ss.status = 'enrolled' AND dp2.department_id = ?) as students_count
     FROM users u
     LEFT JOIN faculty_subject fs ON u.users_id = fs.user_teacher_id AND fs.status = 'active'
     LEFT JOIN section sec ON fs.section_id = sec.section_id AND sec.status = 'active'
     WHERE u.role = 'instructor' AND u.status = 'active' AND u.department_id = ?
     GROUP BY u.users_id
     ORDER BY subjects_count DESC, students_count DESC
     LIMIT 6",
    [$deptId, $deptId]
);

// Subject performance overview - FILTERED BY DEPARTMENT
$subjectPerformance = db()->fetchAll(
    "SELECT s.subject_code, s.subject_name,
        COUNT(DISTINCT ss.user_student_id) as enrolled_students,
        COUNT(DISTINCT sec.section_id) as section_count,
        (SELECT AVG(sqa.percentage)
         FROM student_quiz_attempts sqa
         JOIN quiz q ON sqa.quiz_id = q.quiz_id
         WHERE q.subject_id = s.subject_id AND sqa.status = 'completed') as avg_quiz_score
     FROM subject s
     LEFT JOIN subject_offered so ON s.subject_id = so.subject_id
     LEFT JOIN section sec ON so.subject_offered_id = sec.subject_offered_id AND sec.status = 'active'
     LEFT JOIN student_subject ss ON sec.section_id = ss.section_id AND ss.status = 'enrolled'
     JOIN department_program dp ON s.program_id = dp.program_id
     WHERE s.status = 'active' AND dp.department_id = ?
     GROUP BY s.subject_id
     HAVING section_count > 0
     ORDER BY enrolled_students DESC
     LIMIT 6",
    [$deptId]
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="dashboard-container">

        <?php if (!$department): ?>
        <div class="alert-banner">
            <span class="alert-icon">!</span>
            <span>No department assigned. Please contact the administrator.</span>
        </div>
        <?php endif; ?>

        <!-- Header Section -->
        <div class="dash-header">
            <div class="dash-title">
                <h1>Dashboard</h1>
                <p>Academic Overview</p>
            </div>
            <div class="dash-meta">
                <?php if ($department): ?>
                <div class="dept-badge">
                    <span class="dept-name"><?= e($department['department_name']) ?></span>
                </div>
                <?php endif; ?>
                <div class="sem-badge"><?= $academicYear ?> | <?= $currentSemester ?> Sem</div>
            </div>
        </div>

        <!-- Stats Row -->
        <div class="stats-row">
            <div class="stat-box">
                <div class="stat-number"><?= $totalInstructors ?></div>
                <div class="stat-label">Instructors</div>
            </div>
            <div class="stat-box">
                <div class="stat-number"><?= $totalStudents ?></div>
                <div class="stat-label">Students</div>
            </div>
            <div class="stat-box">
                <div class="stat-number"><?= $totalSubjects ?></div>
                <div class="stat-label">Subjects</div>
            </div>
            <div class="stat-box">
                <div class="stat-number"><?= $totalSections ?></div>
                <div class="stat-label">Sections</div>
            </div>
        </div>

        <!-- Quick Info -->
        <div class="info-row">
            <div class="info-item">
                <span class="info-val"><?= $activeOfferings ?></span>
                <span class="info-text">Active Offerings</span>
            </div>
            <div class="info-item">
                <span class="info-val"><?= $totalEnrollments ?></span>
                <span class="info-text">Total Enrollments</span>
            </div>
            <div class="info-item">
                <span class="info-val"><?= $avgEnrollmentPerSection ?></span>
                <span class="info-text">Avg per Section</span>
            </div>
        </div>

        <!-- Content Grid -->
        <div class="content-grid">

            <!-- Faculty Panel -->
            <div class="panel">
                <div class="panel-head">
                    <h3>Faculty Overview</h3>
                    <a href="instructors.php">View All</a>
                </div>
                <div class="panel-body">
                    <?php if (empty($facultyWorkload)): ?>
                        <p class="no-data">No faculty data</p>
                    <?php else: ?>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Subjects</th>
                                    <th>Sections</th>
                                    <th>Students</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($facultyWorkload as $f): ?>
                                <tr>
                                    <td>
                                        <div class="name-cell">
                                            <span class="avatar"><?= strtoupper(substr($f['first_name'], 0, 1)) ?></span>
                                            <span><?= e($f['first_name'] . ' ' . $f['last_name']) ?></span>
                                        </div>
                                    </td>
                                    <td><?= $f['subjects_count'] ?></td>
                                    <td><?= $f['sections_count'] ?></td>
                                    <td><?= $f['students_count'] ?></td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Subjects Panel -->
            <div class="panel">
                <div class="panel-head">
                    <h3>Subject Performance</h3>
                    <a href="subjects.php">View All</a>
                </div>
                <div class="panel-body">
                    <?php if (empty($subjectPerformance)): ?>
                        <p class="no-data">No subject data</p>
                    <?php else: ?>
                        <div class="subject-list">
                            <?php foreach ($subjectPerformance as $s): ?>
                            <div class="subject-row">
                                <div class="subject-main">
                                    <span class="code"><?= e($s['subject_code']) ?></span>
                                    <span class="name"><?= e($s['subject_name']) ?></span>
                                </div>
                                <div class="subject-meta">
                                    <span><?= $s['enrolled_students'] ?> students</span>
                                    <span><?= $s['section_count'] ?> sec</span>
                                    <?php if ($s['avg_quiz_score']): ?>
                                    <span class="score <?= $s['avg_quiz_score'] >= 75 ? 'good' : 'low' ?>"><?= round($s['avg_quiz_score']) ?>%</span>
                                    <?php endif; ?>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>

        </div>

    </div>
</main>

<style>
/* COC Theme - Clean Professional Design */
:root {
    --coc-green: #1B4D3E;
    --coc-green-light: #2D6A4F;
    --coc-gold: #B8A44A;
    --coc-gold-light: #D4C67A;
    --gray-50: #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-400: #9ca3af;
    --gray-600: #4b5563;
    --gray-800: #1f2937;
}

.dashboard-container {
    padding: 24px;
}

/* Alert Banner */
.alert-banner {
    background: #fef3c7;
    padding: 12px 16px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: #92400e;
}
.alert-icon {
    width: 20px;
    height: 20px;
    background: #f59e0b;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12px;
}

/* Header */
.dash-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
}
.dash-title h1 {
    font-size: 28px;
    font-weight: 600;
    color: var(--gray-800);
    margin: 0 0 4px;
}
.dash-title p {
    color: var(--gray-400);
    font-size: 14px;
    margin: 0;
}
.dash-meta {
    display: flex;
    gap: 12px;
    align-items: center;
}
.dept-badge {
    background: var(--coc-green);
    color: #fff;
    padding: 10px 18px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 13px;
}
.sem-badge {
    background: var(--gray-100);
    color: var(--gray-600);
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
}

/* Stats Row */
.stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
}
.stat-box {
    background: #fff;
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
}
.stat-number {
    font-size: 36px;
    font-weight: 700;
    color: var(--coc-green);
    line-height: 1;
    margin-bottom: 8px;
}
.stat-label {
    font-size: 13px;
    color: var(--gray-400);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Info Row */
.info-row {
    display: flex;
    gap: 40px;
    margin-bottom: 24px;
    padding: 16px 24px;
    background: var(--gray-50);
    border-radius: 8px;
    border: 1px solid var(--gray-200);
}
.info-item {
    display: flex;
    align-items: center;
    gap: 10px;
}
.info-val {
    font-size: 20px;
    font-weight: 700;
    color: var(--gray-800);
}
.info-text {
    font-size: 13px;
    color: var(--gray-400);
}

/* Content Grid */
.content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

/* Panels */
.panel {
    background: #fff;
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    overflow: hidden;
}
.panel-head {
    padding: 14px 16px;
    border-bottom: 1px solid var(--gray-200);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.panel-head h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--gray-800);
}
.panel-head a {
    font-size: 13px;
    color: var(--coc-green);
    text-decoration: none;
    font-weight: 500;
}
.panel-head a:hover {
    text-decoration: underline;
}
.panel-body {
    padding: 16px;
}

/* Data Table */
.data-table {
    width: 100%;
    border-collapse: collapse;
}
.data-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--gray-400);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 12px 10px;
    border-bottom: 1px solid var(--gray-100);
}
.data-table td {
    padding: 10px 12px;
    font-size: 14px;
    color: var(--gray-600);
    border-bottom: 1px solid var(--gray-100);
}
.data-table tr:last-child td {
    border-bottom: none;
}
.name-cell {
    display: flex;
    align-items: center;
    gap: 10px;
}
.avatar {
    width: 28px;
    height: 28px;
    background: var(--coc-green-light);
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
}

/* Subject List */
.subject-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.subject-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--gray-50);
    border-radius: 6px;
}
.subject-main {
    display: flex;
    align-items: center;
    gap: 12px;
}
.subject-main .code {
    background: var(--coc-green);
    color: #fff;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
}
.subject-main .name {
    font-size: 14px;
    color: var(--gray-800);
}
.subject-meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--gray-400);
}
.subject-meta .score {
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
}
.subject-meta .score.good {
    background: #dcfce7;
    color: #166534;
}
.subject-meta .score.low {
    background: #fee2e2;
    color: #991b1b;
}

/* No Data */
.no-data {
    text-align: center;
    color: var(--gray-400);
    padding: 40px 0;
    font-size: 14px;
}

/* Responsive */
@media (max-width: 1024px) {
    .content-grid {
        grid-template-columns: 1fr;
    }
    .stats-row {
        grid-template-columns: repeat(2, 1fr);
    }
}
@media (max-width: 768px) {
    .dashboard-container {
        padding: 12px;
    }
    .dash-header {
        flex-direction: column;
        gap: 16px;
    }
    .dash-meta {
        flex-direction: column;
        align-items: flex-start;
    }
    .stats-row {
        grid-template-columns: 1fr 1fr;
    }
    .info-row {
        flex-direction: column;
        gap: 16px;
    }
}
@media (max-width: 480px) {
    .stats-row {
        grid-template-columns: 1fr;
    }
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
