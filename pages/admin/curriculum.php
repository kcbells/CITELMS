<?php
/**
 * Admin - Curriculum Management
 * Manage program curricula by year and semester
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('admin');

$pageTitle = 'Curriculum';
$currentPage = 'curriculum';

$error = '';
$success = '';

// Get all programs with department info
$programs = db()->fetchAll(
    "SELECT p.program_id, p.program_name, p.program_code, p.total_units, p.duration_years, p.degree_level,
            d.department_name, d.department_code
     FROM program p
     LEFT JOIN department_program dp ON dp.program_id = p.program_id
     LEFT JOIN department d ON d.department_id = dp.department_id
     WHERE p.status = 'active'
     ORDER BY d.department_code, p.program_code"
);

// Group programs by department for dropdown
$programsByDept = [];
foreach ($programs as $p) {
    $dept = $p['department_code'] ?: 'Other';
    if (!isset($programsByDept[$dept])) {
        $programsByDept[$dept] = ['name' => $p['department_name'] ?: 'Other', 'programs' => []];
    }
    $programsByDept[$dept]['programs'][] = $p;
}

// Get selected program
$selectedProgramId = $_GET['program_id'] ?? null;
$selectedProgram = null;

if ($selectedProgramId) {
    foreach ($programs as $p) {
        if ($p['program_id'] == $selectedProgramId) {
            $selectedProgram = $p;
            break;
        }
    }
}

// Get subjects for selected program
$subjects = [];
$totalLecHours = 0;
$totalLabHours = 0;
$totalUnitsActual = 0;
$majorCount = 0;
$geCount = 0;

if ($selectedProgramId) {
    $subjects = db()->fetchAll(
        "SELECT s.*,
            CASE
                WHEN s.year_level = 1 THEN '1st Year'
                WHEN s.year_level = 2 THEN '2nd Year'
                WHEN s.year_level = 3 THEN '3rd Year'
                WHEN s.year_level = 4 THEN '4th Year'
                ELSE 'General'
            END as year_label,
            CASE
                WHEN s.semester = '1st' THEN '1st Semester'
                WHEN s.semester = '2nd' THEN '2nd Semester'
                WHEN s.semester = 'summer' THEN 'Summer'
                ELSE 'Any Semester'
            END as semester_label
         FROM subject s
         WHERE s.program_id = ? AND s.status = 'active'
         ORDER BY s.year_level, FIELD(s.semester, '1st', '2nd', 'summer'), s.subject_code",
        [$selectedProgramId]
    );

    foreach ($subjects as $s) {
        $totalLecHours += (int)$s['lecture_hours'];
        $totalLabHours += (int)$s['lab_hours'];
        $totalUnitsActual += (int)$s['units'];
        if (str_starts_with($s['subject_code'], 'GE')) {
            $geCount++;
        } else {
            $majorCount++;
        }
    }
}

// Organize subjects by year and semester
$curriculum = [];
foreach ($subjects as $subject) {
    $year = $subject['year_level'] ?: 0;
    $semester = $subject['semester'] ?: '0';

    if (!isset($curriculum[$year])) {
        $curriculum[$year] = [];
    }
    if (!isset($curriculum[$year][$semester])) {
        $curriculum[$year][$semester] = [
            'subjects' => [],
            'total_units' => 0,
            'total_lec' => 0,
            'total_lab' => 0
        ];
    }

    $curriculum[$year][$semester]['subjects'][] = $subject;
    $curriculum[$year][$semester]['total_units'] += $subject['units'];
    $curriculum[$year][$semester]['total_lec'] += (int)$subject['lecture_hours'];
    $curriculum[$year][$semester]['total_lab'] += (int)$subject['lab_hours'];
}

// Sort by year
ksort($curriculum);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">

        <?php if ($success): ?><div class="cur-alert cur-alert-success"><?= e($success) ?></div><?php endif; ?>
        <?php if ($error): ?><div class="cur-alert cur-alert-danger"><?= e($error) ?></div><?php endif; ?>

        <!-- Banner -->
        <div class="cur-banner">
            <div class="cur-banner-content">
                <div class="cur-banner-icon">
                    <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
                    </svg>
                </div>
                <div>
                    <h2 class="cur-banner-title">Curriculum Management</h2>
                    <p class="cur-banner-sub">View and manage program curricula organized by year level and semester</p>
                </div>
            </div>
            <a href="subjects.php" class="cur-banner-btn">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Manage Subjects
            </a>
        </div>

        <!-- Program Selector -->
        <div class="cur-selector-card">
            <form method="GET" class="cur-selector-form">
                <div class="cur-selector-label">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342"/></svg>
                    Select Program
                </div>
                <select name="program_id" class="cur-select" onchange="this.form.submit()">
                    <option value="">-- Choose a Program --</option>
                    <?php foreach ($programsByDept as $deptCode => $deptData): ?>
                    <optgroup label="<?= e($deptData['name']) ?>">
                        <?php foreach ($deptData['programs'] as $program): ?>
                        <option value="<?= $program['program_id'] ?>" <?= $selectedProgramId == $program['program_id'] ? 'selected' : '' ?>>
                            <?= e($program['program_code']) ?> - <?= e($program['program_name']) ?>
                        </option>
                        <?php endforeach; ?>
                    </optgroup>
                    <?php endforeach; ?>
                </select>
            </form>
        </div>

        <?php if ($selectedProgram): ?>

        <!-- Program Header Card -->
        <div class="cur-program-card">
            <div class="cur-program-top">
                <div class="cur-program-info">
                    <span class="cur-program-badge"><?= e($selectedProgram['program_code']) ?></span>
                    <div>
                        <h3 class="cur-program-name"><?= e($selectedProgram['program_name']) ?></h3>
                        <p class="cur-program-dept"><?= e($selectedProgram['department_name'] ?? '') ?></p>
                    </div>
                </div>
                <div class="cur-program-degree">
                    <?= $selectedProgram['duration_years'] ?>-Year <?= ucfirst($selectedProgram['degree_level'] ?? 'bachelor') ?>'s Degree
                </div>
            </div>

            <!-- Stats Row -->
            <div class="cur-stats-row">
                <div class="cur-stat">
                    <div class="cur-stat-value"><?= count($subjects) ?></div>
                    <div class="cur-stat-label">Total Subjects</div>
                </div>
                <div class="cur-stat-divider"></div>
                <div class="cur-stat">
                    <div class="cur-stat-value"><?= $totalUnitsActual ?></div>
                    <div class="cur-stat-label">Total Units</div>
                </div>
                <div class="cur-stat-divider"></div>
                <div class="cur-stat">
                    <div class="cur-stat-value"><?= $majorCount ?></div>
                    <div class="cur-stat-label">Major Subjects</div>
                </div>
                <div class="cur-stat-divider"></div>
                <div class="cur-stat">
                    <div class="cur-stat-value"><?= $geCount ?></div>
                    <div class="cur-stat-label">GE Subjects</div>
                </div>
                <div class="cur-stat-divider"></div>
                <div class="cur-stat">
                    <div class="cur-stat-value"><?= $totalLecHours ?></div>
                    <div class="cur-stat-label">Lecture Hours</div>
                </div>
                <div class="cur-stat-divider"></div>
                <div class="cur-stat">
                    <div class="cur-stat-value"><?= $totalLabHours ?></div>
                    <div class="cur-stat-label">Lab Hours</div>
                </div>
            </div>
        </div>

        <!-- Curriculum Grid -->
        <?php if (!empty($curriculum)): ?>
        <div class="cur-grid">

            <?php
            $yearLabels = [1 => '1st Year', 2 => '2nd Year', 3 => '3rd Year', 4 => '4th Year', 0 => 'General'];
            $yearIcons = [1 => 'I', 2 => 'II', 3 => 'III', 4 => 'IV', 0 => 'G'];
            $semesterLabels = ['1st' => '1st Semester', '2nd' => '2nd Semester', 'summer' => 'Summer', '0' => 'Any Semester'];
            $yearIdx = 0;

            foreach ($curriculum as $year => $semesters):
                if (empty($semesters)) continue;
                $yearIdx++;
                $yearSubjectCount = 0;
                $yearUnits = 0;
                foreach ($semesters as $semData) {
                    $yearSubjectCount += count($semData['subjects']);
                    $yearUnits += $semData['total_units'];
                }
            ?>

            <div class="cur-year-block">
                <div class="cur-year-header">
                    <div class="cur-year-left">
                        <span class="cur-year-num"><?= $yearIcons[$year] ?? $year ?></span>
                        <div>
                            <h3 class="cur-year-title"><?= $yearLabels[$year] ?? 'Year ' . $year ?></h3>
                            <span class="cur-year-meta"><?= $yearSubjectCount ?> subjects &middot; <?= $yearUnits ?> units</span>
                        </div>
                    </div>
                </div>

                <div class="cur-semester-grid">
                    <?php foreach ($semesters as $semester => $data): ?>
                    <div class="cur-sem-card">
                        <div class="cur-sem-header">
                            <div class="cur-sem-title"><?= $semesterLabels[$semester] ?? 'Semester ' . $semester ?></div>
                            <div class="cur-sem-badges">
                                <span class="cur-sem-badge"><?= count($data['subjects']) ?> subjects</span>
                                <span class="cur-sem-badge cur-sem-badge-units"><?= $data['total_units'] ?> units</span>
                            </div>
                        </div>

                        <!-- Table header -->
                        <div class="cur-table-head">
                            <span class="cur-th cur-th-code">Code</span>
                            <span class="cur-th cur-th-name">Subject Name</span>
                            <span class="cur-th cur-th-hours">Lec</span>
                            <span class="cur-th cur-th-hours">Lab</span>
                            <span class="cur-th cur-th-units">Units</span>
                            <span class="cur-th cur-th-prereq">Pre-requisite</span>
                        </div>

                        <!-- Subject rows -->
                        <div class="cur-table-body">
                            <?php foreach ($data['subjects'] as $idx => $subject): ?>
                            <div class="cur-row <?= $idx % 2 === 0 ? '' : 'cur-row-alt' ?>">
                                <span class="cur-td cur-td-code">
                                    <span class="cur-code-tag <?= str_starts_with($subject['subject_code'], 'GE') ? 'cur-code-ge' : 'cur-code-major' ?>">
                                        <?= e($subject['subject_code']) ?>
                                    </span>
                                </span>
                                <span class="cur-td cur-td-name">
                                    <?= e($subject['subject_name']) ?>
                                    <?php if ($subject['description']): ?>
                                    <span class="cur-desc-tooltip" title="<?= e($subject['description']) ?>">
                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>
                                    </span>
                                    <?php endif; ?>
                                </span>
                                <span class="cur-td cur-td-hours"><?= $subject['lecture_hours'] ?></span>
                                <span class="cur-td cur-td-hours"><?= $subject['lab_hours'] ?></span>
                                <span class="cur-td cur-td-units"><?= $subject['units'] ?></span>
                                <span class="cur-td cur-td-prereq">
                                    <?php if ($subject['pre_requisite']): ?>
                                    <span class="cur-prereq-tag"><?= e($subject['pre_requisite']) ?></span>
                                    <?php else: ?>
                                    <span class="cur-prereq-none">None</span>
                                    <?php endif; ?>
                                </span>
                            </div>
                            <?php endforeach; ?>
                        </div>

                        <!-- Semester totals -->
                        <div class="cur-sem-footer">
                            <span class="cur-sem-footer-label">Semester Total</span>
                            <div class="cur-sem-footer-values">
                                <span><?= $data['total_lec'] ?> lec</span>
                                <span><?= $data['total_lab'] ?> lab</span>
                                <strong><?= $data['total_units'] ?> units</strong>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>

            <?php endforeach; ?>

        </div>

        <!-- Summary Footer -->
        <div class="cur-summary">
            <div class="cur-summary-item">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342"/></svg>
                <strong><?= $selectedProgram['program_code'] ?></strong> curriculum covers <strong><?= count($curriculum) ?> year levels</strong> with <strong><?= count($subjects) ?> subjects</strong> totalling <strong><?= $totalUnitsActual ?> units</strong>
            </div>
        </div>

        <?php else: ?>
        <div class="cur-empty">
            <div class="cur-empty-icon">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
            </div>
            <h3>No Subjects Found</h3>
            <p>No subjects have been added to this program's curriculum yet.</p>
            <a href="subjects.php" class="cur-empty-btn">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Add Subjects
            </a>
        </div>
        <?php endif; ?>

        <?php else: ?>
        <div class="cur-empty">
            <div class="cur-empty-icon">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
            </div>
            <h3>Select a Program</h3>
            <p>Choose a program from the dropdown above to view its curriculum.</p>
        </div>
        <?php endif; ?>

    </div>
</main>

<style>
/* ============ Banner ============ */
.cur-banner {
    background: linear-gradient(135deg, #1B4D3E 0%, #2D6A4F 60%, #40916C 100%);
    border-radius: 16px;
    padding: 28px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
}
.cur-banner-content {
    display: flex;
    align-items: center;
    gap: 16px;
}
.cur-banner-icon {
    width: 52px; height: 52px;
    background: rgba(255,255,255,0.15);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    flex-shrink: 0;
}
.cur-banner-title {
    margin: 0; font-size: 22px; font-weight: 800; color: #fff;
}
.cur-banner-sub {
    margin: 4px 0 0; font-size: 14px; color: rgba(255,255,255,0.75);
}
.cur-banner-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.18); color: #fff;
    padding: 10px 20px; border-radius: 10px;
    font-size: 13px; font-weight: 700;
    text-decoration: none; transition: all 0.2s;
    border: 1px solid rgba(255,255,255,0.25);
}
.cur-banner-btn:hover {
    background: rgba(255,255,255,0.3);
}

/* ============ Program Selector ============ */
.cur-selector-card {
    background: #fff; border: 1px solid #e8e8e8; border-radius: 14px;
    padding: 20px 24px; margin-bottom: 24px;
}
.cur-selector-form {
    display: flex; align-items: center; gap: 14px;
}
.cur-selector-label {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 700; color: #374151;
    text-transform: uppercase; letter-spacing: 0.03em;
    white-space: nowrap;
}
.cur-selector-label svg { color: #1B4D3E; }
.cur-select {
    flex: 1; padding: 11px 16px; border: 1px solid #d1d5db; border-radius: 10px;
    font-size: 14px; background: #f9fafb; color: #1f2937;
    transition: all 0.2s; cursor: pointer;
}
.cur-select:focus { outline: none; border-color: #1B4D3E; background: #fff; box-shadow: 0 0 0 3px rgba(27,77,62,0.1); }

/* ============ Program Card ============ */
.cur-program-card {
    background: #fff; border: 1px solid #e8e8e8; border-radius: 14px;
    margin-bottom: 24px; overflow: hidden;
}
.cur-program-top {
    padding: 24px 28px; display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 12px;
}
.cur-program-info { display: flex; align-items: center; gap: 16px; }
.cur-program-badge {
    background: linear-gradient(135deg, #1B4D3E, #2D6A4F); color: #fff;
    padding: 10px 20px; border-radius: 12px;
    font-size: 16px; font-weight: 800; letter-spacing: 0.03em;
}
.cur-program-name { margin: 0; font-size: 19px; font-weight: 700; color: #1f2937; }
.cur-program-dept { margin: 3px 0 0; font-size: 13px; color: #6b7280; }
.cur-program-degree {
    font-size: 13px; color: #6b7280; background: #f3f4f6;
    padding: 8px 16px; border-radius: 8px; font-weight: 600;
}

/* Stats Row */
.cur-stats-row {
    display: flex; align-items: center; justify-content: center;
    padding: 18px 28px; background: #fafbfc; border-top: 1px solid #f0f0f0;
    flex-wrap: wrap; gap: 0;
}
.cur-stat { text-align: center; padding: 4px 24px; }
.cur-stat-value { font-size: 22px; font-weight: 800; color: #1B4D3E; }
.cur-stat-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
.cur-stat-divider { width: 1px; height: 36px; background: #e5e7eb; }

/* ============ Year Blocks ============ */
.cur-grid { display: flex; flex-direction: column; gap: 28px; }

.cur-year-block {
    background: #fff; border: 1px solid #e8e8e8; border-radius: 16px;
    overflow: hidden;
}
.cur-year-header {
    padding: 20px 28px; display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #f0f0f0; background: #fafbfc;
}
.cur-year-left { display: flex; align-items: center; gap: 16px; }
.cur-year-num {
    width: 44px; height: 44px;
    background: linear-gradient(135deg, #1B4D3E, #2D6A4F);
    color: #fff; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 800;
}
.cur-year-title { margin: 0; font-size: 17px; font-weight: 700; color: #1f2937; }
.cur-year-meta { font-size: 13px; color: #6b7280; margin-top: 2px; }

/* Semester Grid */
.cur-semester-grid { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

.cur-sem-card {
    border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;
    background: #fff;
}
.cur-sem-header {
    background: linear-gradient(135deg, #1B4D3E 0%, #2D6A4F 100%);
    padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;
}
.cur-sem-title { color: #fff; font-size: 15px; font-weight: 700; }
.cur-sem-badges { display: flex; gap: 8px; }
.cur-sem-badge {
    background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9);
    padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
}
.cur-sem-badge-units { background: rgba(255,255,255,0.28); color: #fff; }

/* Table Head */
.cur-table-head {
    display: grid;
    grid-template-columns: 90px 1fr 50px 50px 55px 120px;
    padding: 10px 20px; background: #f9fafb; border-bottom: 1px solid #f0f0f0;
}
.cur-th {
    font-size: 10px; font-weight: 700; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.06em;
}
.cur-th-hours, .cur-th-units { text-align: center; }
.cur-th-prereq { text-align: right; }

/* Table Body */
.cur-table-body { }
.cur-row {
    display: grid;
    grid-template-columns: 90px 1fr 50px 50px 55px 120px;
    padding: 12px 20px; align-items: center;
    border-bottom: 1px solid #f8f8f8;
    transition: background 0.15s;
}
.cur-row:last-child { border-bottom: none; }
.cur-row:hover { background: #f0fdf4; }
.cur-row-alt { background: #fafbfc; }
.cur-row-alt:hover { background: #f0fdf4; }

.cur-td { font-size: 13px; color: #374151; }
.cur-td-hours { text-align: center; font-weight: 600; color: #6b7280; }
.cur-td-units { text-align: center; font-weight: 700; color: #1B4D3E; font-size: 14px; }
.cur-td-name { font-weight: 500; display: flex; align-items: center; gap: 6px; }
.cur-td-prereq { text-align: right; }

.cur-code-tag {
    display: inline-block; padding: 3px 8px; border-radius: 6px;
    font-size: 12px; font-weight: 700; font-family: 'Consolas', 'Monaco', monospace;
}
.cur-code-major { background: #E8F5E9; color: #1B4D3E; }
.cur-code-ge { background: #EDE9FE; color: #5B21B6; }

.cur-prereq-tag {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 600; font-family: monospace;
    background: #FEF3C7; color: #92400E;
}
.cur-prereq-none { font-size: 12px; color: #d1d5db; }

.cur-desc-tooltip {
    color: #9ca3af; cursor: help; display: inline-flex;
    transition: color 0.15s;
}
.cur-desc-tooltip:hover { color: #1B4D3E; }

/* Semester Footer */
.cur-sem-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 20px; background: #f9fafb; border-top: 1px solid #f0f0f0;
}
.cur-sem-footer-label { font-size: 12px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.03em; }
.cur-sem-footer-values { display: flex; gap: 16px; font-size: 13px; color: #6b7280; }
.cur-sem-footer-values strong { color: #1B4D3E; }

/* ============ Summary Footer ============ */
.cur-summary {
    margin-top: 24px; padding: 18px 24px;
    background: #fff; border: 1px solid #e8e8e8; border-radius: 12px;
}
.cur-summary-item {
    display: flex; align-items: center; gap: 10px;
    font-size: 14px; color: #374151;
}
.cur-summary-item svg { color: #1B4D3E; flex-shrink: 0; }
.cur-summary-item strong { color: #1B4D3E; }

/* ============ Empty State ============ */
.cur-empty {
    text-align: center; padding: 80px 24px;
    background: #fff; border: 2px dashed #e5e7eb; border-radius: 16px;
}
.cur-empty-icon { color: #d1d5db; margin-bottom: 16px; }
.cur-empty h3 { margin: 0 0 8px; font-size: 18px; color: #374151; font-weight: 700; }
.cur-empty p { margin: 0; color: #6b7280; font-size: 14px; }
.cur-empty-btn {
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: 20px; padding: 10px 24px;
    background: #1B4D3E; color: #fff; border-radius: 10px;
    font-size: 14px; font-weight: 600; text-decoration: none;
    transition: background 0.2s;
}
.cur-empty-btn:hover { background: #2D6A4F; }

/* ============ Alerts ============ */
.cur-alert {
    padding: 16px 20px; border-radius: 10px; margin-bottom: 20px; font-weight: 600;
}
.cur-alert-success {
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    color: #065f46; }
.cur-alert-danger {
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    color: #991b1b; }

/* ============ Responsive ============ */
@media (max-width: 900px) {
    .cur-table-head, .cur-row {
        grid-template-columns: 80px 1fr 40px 40px 45px 90px;
    }
}
@media (max-width: 768px) {
    .cur-banner { padding: 20px; }
    .cur-banner-title { font-size: 18px; }
    .cur-stats-row { justify-content: flex-start; }
    .cur-stat { padding: 4px 14px; }
    .cur-stat-divider { display: none; }
    .cur-table-head, .cur-row {
        grid-template-columns: 70px 1fr 50px;
    }
    .cur-th-hours, .cur-td-hours,
    .cur-th-prereq, .cur-td-prereq { display: none; }
    .cur-program-top { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 480px) {
    .cur-selector-form { flex-direction: column; align-items: stretch; }
    .cur-program-info { flex-direction: column; align-items: flex-start; }
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
