<?php
/**
 * ReportsAPI.php
 * Provides report data for instructors and admins.
 * Dean reports use DashboardAPI?action=dean instead.
 */
require_once __DIR__ . '/../config/cors.php';
ob_start();
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ClassworkAccessHelper.php';
ob_clean();

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// RBAC: was Auth::requireRole(), which redirects on failure instead of
// returning JSON — breaks a fetch().then(r => r.json()) caller. reports.view
// is granted to admin/dean/program_head/instructor (added instructor here
// to match this file's own existing "for instructors and admins" scope).
if (!Auth::can('reports.view')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permission denied: reports.view']);
    exit;
}

switch ($action) {
    case 'instructor':
        handleInstructorReport();
        break;
    case 'admin':
        if (Auth::role() !== 'admin') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Admin only']);
            break;
        }
        handleAdminReport();
        break;
    case 'struggling-students':
        handleStrugglingStudents();
        break;
    case 'struggling-trend':
        handleStrugglingTrend();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Instructor report — summary of their own classes, quizzes, student performance
 */
function handleInstructorReport() {
    $userId = Auth::id();

    // Subjects this instructor teaches
    $subjects = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name,
                so.subject_offered_id,
                COUNT(DISTINCT ss.user_student_id) as student_count,
                COUNT(DISTINCT q.quiz_id)           as quiz_count,
                COUNT(DISTINCT l.lessons_id)        as lesson_count,
                AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END) as avg_score,
                COUNT(CASE WHEN sqa.status = 'completed' AND sqa.passed = 1 THEN 1 END) as passed_count,
                COUNT(CASE WHEN sqa.status = 'completed' AND sqa.passed = 0 THEN 1 END) as failed_count
         FROM subject_offered so
         JOIN subject s ON so.subject_id = s.subject_id
         LEFT JOIN student_subject ss   ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
         LEFT JOIN quiz q               ON q.subject_id = s.subject_id AND " . classworkTeacherSql('q', 'so') . "
         LEFT JOIN lessons l            ON l.subject_id = s.subject_id AND " . classworkTeacherSql('l', 'so') . "
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.status = 'completed'
         WHERE so.user_teacher_id = ? AND so.status = 'open'
         GROUP BY so.subject_offered_id
         ORDER BY s.subject_code",
        [$userId]
    );

    // Recent quiz attempts across all their subjects
    $recentAttempts = db()->fetchAll(
        "SELECT sqa.attempt_id, sqa.percentage, sqa.passed, sqa.completed_at,
                q.quiz_title, s.subject_code,
                u.first_name, u.last_name, u.student_id
         FROM student_quiz_attempts sqa
         JOIN quiz q   ON sqa.quiz_id   = q.quiz_id
         JOIN subject s ON q.subject_id  = s.subject_id
         JOIN users u   ON sqa.user_student_id = u.users_id
         WHERE q.user_teacher_id = ? AND sqa.status = 'completed'
         ORDER BY sqa.completed_at DESC
         LIMIT 20",
        [$userId]
    );

    // Overall stats
    $totals = db()->fetchOne(
        "SELECT
            COUNT(DISTINCT so.subject_offered_id)  as total_subjects,
            COUNT(DISTINCT ss.user_student_id)     as total_students,
            COUNT(DISTINCT q.quiz_id)              as total_quizzes,
            COUNT(DISTINCT l.lessons_id)           as total_lessons,
            COUNT(DISTINCT sqa.attempt_id)         as total_attempts,
            AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END) as avg_score,
            COUNT(CASE WHEN sqa.status = 'completed' AND sqa.passed = 1 THEN 1 END) as total_passed,
            COUNT(CASE WHEN sqa.status = 'completed' AND sqa.passed = 0 AND sqa.has_pending_grades = 0 THEN 1 END) as total_failed
         FROM subject_offered so
         LEFT JOIN student_subject ss   ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
         LEFT JOIN quiz q               ON q.subject_id = so.subject_id AND " . classworkTeacherSql('q', 'so') . "
         LEFT JOIN lessons l            ON l.subject_id = so.subject_id AND " . classworkTeacherSql('l', 'so') . "
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id
         WHERE so.user_teacher_id = ? AND so.status = 'open'",
        [$userId]
    );

    // Pending essay grading count
    $pendingGrading = db()->fetchOne(
        "SELECT COUNT(DISTINCT sqa.attempt_id) as count
         FROM student_quiz_attempts sqa
         JOIN quiz q ON sqa.quiz_id = q.quiz_id
         WHERE q.user_teacher_id = ? AND sqa.has_pending_grades = 1",
        [$userId]
    )['count'] ?? 0;

    echo json_encode([
        'success' => true,
        'data' => [
            'totals' => [
                'subjects'       => (int)($totals['total_subjects']  ?? 0),
                'students'       => (int)($totals['total_students']  ?? 0),
                'quizzes'        => (int)($totals['total_quizzes']   ?? 0),
                'lessons'        => (int)($totals['total_lessons']   ?? 0),
                'attempts'       => (int)($totals['total_attempts']  ?? 0),
                'avg_score'      => round((float)($totals['avg_score'] ?? 0), 1),
                'passed'         => (int)($totals['total_passed']    ?? 0),
                'failed'         => (int)($totals['total_failed']    ?? 0),
                'pending_grading'=> (int)$pendingGrading,
            ],
            'subjects'       => $subjects       ?: [],
            'recent_attempts'=> $recentAttempts ?: [],
        ]
    ]);
}

/**
 * Admin report — system-wide stats
 */
function handleAdminReport() {
    $stats = db()->fetchOne(
        "SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'student'    AND status = 'active') as total_students,
            (SELECT COUNT(*) FROM users WHERE role = 'instructor' AND status = 'active') as total_instructors,
            (SELECT COUNT(*) FROM subject WHERE status = 'active')                       as total_subjects,
            (SELECT COUNT(*) FROM subject_offered WHERE status = 'open')                 as active_offerings,
            (SELECT COUNT(*) FROM quiz WHERE status = 'published')                       as published_quizzes,
            (SELECT COUNT(*) FROM lessons WHERE status = 'published')                    as published_lessons,
            (SELECT COUNT(*) FROM student_quiz_attempts WHERE status = 'completed')      as total_attempts,
            (SELECT AVG(percentage) FROM student_quiz_attempts WHERE status = 'completed') as avg_score,
            (SELECT COUNT(*) FROM student_quiz_attempts WHERE status = 'completed' AND passed = 1) as total_passed,
            (SELECT COUNT(*) FROM student_quiz_attempts WHERE status = 'completed' AND passed = 0 AND has_pending_grades = 0) as total_failed"
    );

    $topSubjects = db()->fetchAll(
        "SELECT s.subject_code, s.subject_name,
                COUNT(DISTINCT ss.user_student_id) as students,
                COUNT(DISTINCT q.quiz_id) as quizzes,
                AVG(CASE WHEN sqa.status='completed' THEN sqa.percentage END) as avg_score
         FROM subject s
         LEFT JOIN subject_offered so ON so.subject_id = s.subject_id
         LEFT JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
         LEFT JOIN quiz q ON q.subject_id = s.subject_id
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id
         WHERE s.status = 'active'
         GROUP BY s.subject_id
         ORDER BY students DESC
         LIMIT 10"
    );

    echo json_encode([
        'success' => true,
        'data' => [
            'stats'        => $stats,
            'top_subjects' => $topSubjects ?: [],
        ]
    ]);
}

/**
 * Class Performance / Struggling Students — for a program head's "Reports"
 * page, scoped to their own program and the year level(s) their account is
 * assigned to handle (users.year_level_from/to, set by their dean). A dean
 * sees every program in their department instead, with no year-level
 * narrowing. An instructor sees only the subjects they're assigned to teach
 * (subject_offered.user_teacher_id), across every section of those subjects.
 *
 * Organized as Subject → Section → students, so a viewer can see the whole
 * roster shape (who's enrolled, per section) not just a flat problem list.
 * Per student per subject, one of two signals decides their status:
 *   - grade average: for Global Gradebook offerings, the average wrap-up
 *     quiz score across their entered modules (the closest single number
 *     to an overall grade without re-deriving the full EL/Mastery weighted
 *     formula server-side); for Raw Score offerings there is no separate
 *     stored "grade" — the class record IS built from quiz scores — so
 *     that signal simply isn't available and quiz average carries it alone.
 *   - quiz average: completed attempt percentage across that subject's quizzes.
 * Status per student per subject:
 *   - 'lacking'  — enrolled but zero quiz attempts AND zero module grade
 *                  entries. Previously silently dropped from this report;
 *                  now surfaced as its own remark instead of vanishing.
 *   - 'critical' — has data, but score is more than 20 points under cutoff
 *                  (cutoff: 80 for a Global Gradebook grade average, 60 for
 *                  a quiz average) — i.e. below 60/40 respectively.
 *   - 'at_risk'  — has data, below cutoff but not by more than 20 points.
 *   - 'good'     — at or above cutoff — counted in the section's totals but
 *                  not included in the per-student flagged list.
 */
/**
 * Shared role scope resolution for both the Struggling Students report and
 * the per-period trend below — same rule everywhere: instructor sees only
 * their own subjects, program head sees their program + dean-assigned year
 * range, dean sees every program in their department, admin sees everything
 * (or one explicit program via ?program_id=). Returns null when the caller
 * should respond with the "unscoped" empty-state instead of running a query.
 */
function resolveReportScope(): ?array {
    $role = Auth::role();
    $programIds = [];
    $yearFrom = null;
    $yearTo   = null;
    $teacherId = null;

    if ($role === 'instructor') {
        $teacherId = (int)Auth::id();
    } elseif ($role === 'program_head') {
        $me = db()->fetchOne(
            "SELECT program_id, year_level_from, year_level_to FROM users WHERE users_id = ?",
            [Auth::id()]
        );
        if (empty($me['program_id'])) return null;
        $programIds = [(int)$me['program_id']];
        $yearFrom = $me['year_level_from'] !== null ? (int)$me['year_level_from'] : null;
        $yearTo   = $me['year_level_to']   !== null ? (int)$me['year_level_to']   : null;
    } elseif ($role === 'dean') {
        $me = db()->fetchOne("SELECT department_id, program_id FROM users WHERE users_id = ?", [Auth::id()]);
        if (!empty($me['department_id'])) {
            $rows = db()->fetchAll("SELECT program_id FROM department_program WHERE department_id = ?", [$me['department_id']]);
            $programIds = array_map(fn($r) => (int)$r['program_id'], $rows);
        }
        if (!$programIds && !empty($me['program_id'])) $programIds = [(int)$me['program_id']];
    } else { // admin — optional explicit filter, otherwise every program
        $requested = (int)($_GET['program_id'] ?? 0);
        if ($requested) $programIds = [$requested];
    }

    if ($role !== 'admin' && $role !== 'instructor' && !$programIds) return null;

    return ['programIds' => $programIds, 'yearFrom' => $yearFrom, 'yearTo' => $yearTo, 'teacherId' => $teacherId];
}

function handleStrugglingStudents() {
    $role = Auth::role();
    if (!in_array($role, ['program_head', 'dean', 'admin', 'instructor'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Not available for this role']);
        return;
    }

    $scope = resolveReportScope();
    if ($scope === null) {
        echo json_encode(['success' => true, 'data' => ['subjects' => [], 'totals' => null, 'unscoped' => true]]);
        return;
    }
    ['programIds' => $programIds, 'yearFrom' => $yearFrom, 'yearTo' => $yearTo, 'teacherId' => $teacherId] = $scope;

    $where  = ["u.role = 'student'", "u.status = 'active'"];
    $params = [];
    if ($teacherId !== null) {
        $where[] = "so.user_teacher_id = ?";
        $params[] = $teacherId;
    }
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $where[] = "s.program_id IN ($ph)";
        $params = array_merge($params, $programIds);
    }
    // A student with no year_level set isn't provably outside a program
    // head's scope — treat it as "unknown, include" rather than silently
    // dropping them from oversight.
    if ($yearFrom !== null) { $where[] = "(u.year_level IS NULL OR u.year_level >= ?)"; $params[] = $yearFrom; }
    if ($yearTo   !== null) { $where[] = "(u.year_level IS NULL OR u.year_level <= ?)"; $params[] = $yearTo; }
    $whereSql = implode(' AND ', $where);

    $rows = db()->fetchAll(
        "SELECT
            u.users_id, u.first_name, u.last_name, u.student_id, u.year_level,
            s.subject_id, s.subject_code, s.subject_name, so.subject_offered_id, so.grading_type,
            ss.section_id, sec.section_name,
            ROUND(AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END), 1) AS quiz_avg,
            COUNT(DISTINCT CASE WHEN sqa.status = 'completed' THEN sqa.attempt_id END) AS quiz_attempts,
            ROUND(AVG(gmg.wrap_up_quiz), 1) AS module_avg,
            COUNT(DISTINCT CASE WHEN gmg.wrap_up_quiz IS NOT NULL THEN gmg.grade_id END) AS scored_entries,
            COUNT(DISTINCT CASE WHEN gmg.soc1 IS NOT NULL OR gmg.soc2 IS NOT NULL
                                   OR gmg.lets_practice IS NOT NULL OR gmg.lets_practice_optional IS NOT NULL
                                   OR gmg.reflection IS NOT NULL OR gmg.wrap_up_quiz IS NOT NULL
                              THEN gmg.grade_id END) AS engaged_entries
         FROM users u
         JOIN student_subject ss  ON ss.user_student_id = u.users_id AND ss.status = 'enrolled'
         JOIN subject_offered so  ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s           ON s.subject_id = so.subject_id
         LEFT JOIN section sec               ON sec.section_id = ss.section_id
         LEFT JOIN quiz q                    ON q.subject_id = s.subject_id AND " . classworkTeacherSql('q', 'so') . "
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.user_student_id = u.users_id AND sqa.status = 'completed'
         LEFT JOIN global_module_grades gmg  ON gmg.subject_offered_id = so.subject_offered_id AND gmg.student_id = u.users_id
         WHERE $whereSql
         GROUP BY u.users_id, s.subject_id, so.subject_offered_id, ss.section_id",
        $params
    );

    // subjects[subject_id] -> { ...meta, sections[section_id] -> { ...meta, students[] } }
    $subjects = [];
    $totals = ['enrolled' => 0, 'submitted' => 0, 'lacking' => 0, 'flagged' => 0];

    foreach ($rows as $r) {
        $hasScore      = (int)$r['scored_entries'] > 0;
        $hasQuiz       = (int)$r['quiz_attempts'] > 0;
        // Attendance (soc1/soc2) and the other rubric fields count as real
        // engagement too — a student attending every session but not yet at
        // the Wrap Up Quiz stage of a module was being wrongly flagged
        // "Lacking" before, since only wrap_up_quiz was ever checked.
        $hasEngagement = (int)$r['engaged_entries'] > 0;
        $hasData       = $hasScore || $hasQuiz;

        $score = null; $source = null; $status = 'lacking';
        if ($hasData) {
            $score  = $hasScore ? (float)$r['module_avg'] : (float)$r['quiz_avg'];
            $source = $hasScore ? 'grade' : 'quiz';
            // Global Gradebook subjects use an 80% cutoff (its mastery-based
            // grading norm runs higher than a plain quiz score), quiz-only
            // subjects (Raw Score offerings, no separate stored grade) keep 60%.
            $cutoff = $hasScore ? 80 : 60;
            if ($score >= $cutoff) $status = 'good';
            elseif ($score >= $cutoff - 20) $status = 'at_risk';
            else $status = 'critical';
        } elseif ($hasEngagement) {
            // Attendance/rubric activity recorded but no graded score yet —
            // genuinely "in progress", not lacking and not yet scoreable.
            $status = 'good';
        }

        $subjId = (int)$r['subject_id'];
        if (!isset($subjects[$subjId])) {
            $subjects[$subjId] = [
                'subject_id'   => $subjId,
                'subject_code' => $r['subject_code'],
                'subject_name' => $r['subject_name'],
                'grading_type' => $r['grading_type'],
                'sections'     => [],
            ];
        }
        $secId = $r['section_id'] !== null ? (int)$r['section_id'] : 0;
        if (!isset($subjects[$subjId]['sections'][$secId])) {
            $subjects[$subjId]['sections'][$secId] = [
                'section_id'      => $secId ?: null,
                'section_name'    => $r['section_name'] ?? 'No section',
                'enrolled_count'  => 0,
                'submitted_count' => 0,
                'lacking_count'   => 0,
                'students'        => [],
            ];
        }
        $sec = &$subjects[$subjId]['sections'][$secId];
        $sec['enrolled_count']++;
        $totals['enrolled']++;
        if ($hasData || $hasEngagement) { $sec['submitted_count']++; $totals['submitted']++; }
        else { $sec['lacking_count']++; $totals['lacking']++; }

        if ($status !== 'good') {
            $sec['students'][] = [
                'users_id'   => (int)$r['users_id'],
                'name'       => trim($r['first_name'] . ' ' . $r['last_name']),
                'student_id' => $r['student_id'],
                'year_level' => $r['year_level'] !== null ? (int)$r['year_level'] : null,
                'score'      => $score,
                'source'     => $source,
                'status'     => $status, // 'critical' | 'at_risk' | 'lacking'
            ];
            $totals['flagged']++;
        }
        unset($sec);
    }

    // Sort: worst-first within each section (critical > at_risk > lacking, then by score), sections/subjects alphabetically.
    $statusRank = ['critical' => 0, 'at_risk' => 1, 'lacking' => 2];
    $subjectsOut = [];
    foreach ($subjects as $subj) {
        $sections = array_values($subj['sections']);
        foreach ($sections as &$sec) {
            usort($sec['students'], function ($a, $b) use ($statusRank) {
                $r = $statusRank[$a['status']] <=> $statusRank[$b['status']];
                if ($r !== 0) return $r;
                return ($a['score'] ?? -1) <=> ($b['score'] ?? -1);
            });
        }
        unset($sec);
        usort($sections, fn($a, $b) => strcmp($a['section_name'], $b['section_name']));
        $subj['sections'] = $sections;
        $subjectsOut[] = $subj;
    }
    usort($subjectsOut, fn($a, $b) => strcmp($a['subject_code'], $b['subject_code']));

    echo json_encode([
        'success' => true,
        'data' => [
            'subjects' => $subjectsOut,
            'totals'   => $totals,
            'scope'    => [
                'year_from' => $yearFrom,
                'year_to'   => $yearTo,
            ],
        ]
    ]);
}

/**
 * Flagged-student trend across grading periods (P1 Midterms / P2 Prefinals /
 * P3 Finals) for the same scope Struggling Students uses. Not a stored
 * historical snapshot — each point is computed live from the SAME
 * cumulative data Struggling Students already uses, just narrowed to only
 * the modules/quizzes that belong to that period so far:
 *   - Global Gradebook: wrap_up_quiz average over modules 1-4 (P1), 1-9
 *     (P2), 1-14 (P3) — matches grading-engine.js's PERIOD_MODULES exactly
 *     (its "Final" is this endpoint's "P3").
 *   - Raw Score: quiz average over quizzes tagged grading_period P1, P1+P2,
 *     or P1+P2+P3 respectively (cumulative, since a period's work doesn't
 *     stop counting once the next period starts).
 * "Flagged" here folds critical + at_risk + lacking into one count (a
 * single trend line), matching Struggling Students' own cutoffs (80%/60%).
 */
function handleStrugglingTrend(): void {
    $role = Auth::role();
    if (!in_array($role, ['program_head', 'dean', 'admin', 'instructor'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Not available for this role']);
        return;
    }

    $scope = resolveReportScope();
    if ($scope === null) {
        echo json_encode(['success' => true, 'data' => ['periods' => [], 'unscoped' => true]]);
        return;
    }

    $periodDefs = [
        ['code' => 'P1', 'label' => 'P1 (Midterms)', 'modules' => [1, 2, 3, 4],   'quizPeriods' => ['P1']],
        ['code' => 'P2', 'label' => 'P2 (Prefinals)', 'modules' => range(1, 9),   'quizPeriods' => ['P1', 'P2']],
        ['code' => 'P3', 'label' => 'P3 (Finals)',    'modules' => range(1, 14),  'quizPeriods' => ['P1', 'P2', 'P3']],
    ];

    $periods = [];
    foreach ($periodDefs as $def) {
        $snap = computeStrugglingSnapshot($scope, $def['modules'], $def['quizPeriods']);
        $periods[] = [
            'period'   => $def['code'],
            'label'    => $def['label'],
            'enrolled' => $snap['enrolled'],
            'flagged'  => $snap['flagged'],
            'pct'      => $snap['enrolled'] > 0 ? round($snap['flagged'] / $snap['enrolled'] * 100, 1) : 0,
        ];
    }

    echo json_encode(['success' => true, 'data' => ['periods' => $periods]]);
}

/** One period's {enrolled, flagged} snapshot for handleStrugglingTrend() — see that function's docblock for the exact cumulative-range rule. */
function computeStrugglingSnapshot(array $scope, array $moduleRange, array $quizPeriods): array {
    ['programIds' => $programIds, 'yearFrom' => $yearFrom, 'yearTo' => $yearTo, 'teacherId' => $teacherId] = $scope;

    $where  = ["u.role = 'student'", "u.status = 'active'"];
    $params = [];
    if ($teacherId !== null) { $where[] = "so.user_teacher_id = ?"; $params[] = $teacherId; }
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $where[] = "s.program_id IN ($ph)";
        $params = array_merge($params, $programIds);
    }
    if ($yearFrom !== null) { $where[] = "(u.year_level IS NULL OR u.year_level >= ?)"; $params[] = $yearFrom; }
    if ($yearTo   !== null) { $where[] = "(u.year_level IS NULL OR u.year_level <= ?)"; $params[] = $yearTo; }
    $whereSql = implode(' AND ', $where);

    $quizPh   = implode(',', array_fill(0, count($quizPeriods), '?'));
    $modulePh = implode(',', array_fill(0, count($moduleRange), '?'));

    $rows = db()->fetchAll(
        "SELECT
            u.users_id, s.subject_id, so.subject_offered_id,
            ROUND(AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END), 1) AS quiz_avg,
            COUNT(DISTINCT CASE WHEN sqa.status = 'completed' THEN sqa.attempt_id END) AS quiz_attempts,
            ROUND(AVG(gmg.wrap_up_quiz), 1) AS module_avg,
            COUNT(DISTINCT CASE WHEN gmg.wrap_up_quiz IS NOT NULL THEN gmg.grade_id END) AS scored_entries,
            COUNT(DISTINCT CASE WHEN gmg.soc1 IS NOT NULL OR gmg.soc2 IS NOT NULL
                                   OR gmg.lets_practice IS NOT NULL OR gmg.lets_practice_optional IS NOT NULL
                                   OR gmg.reflection IS NOT NULL OR gmg.wrap_up_quiz IS NOT NULL
                              THEN gmg.grade_id END) AS engaged_entries
         FROM users u
         JOIN student_subject ss  ON ss.user_student_id = u.users_id AND ss.status = 'enrolled'
         JOIN subject_offered so  ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s           ON s.subject_id = so.subject_id
         LEFT JOIN quiz q ON q.subject_id = s.subject_id AND " . classworkTeacherSql('q', 'so') . " AND q.grading_period IN ($quizPh)
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.user_student_id = u.users_id AND sqa.status = 'completed'
         LEFT JOIN global_module_grades gmg ON gmg.subject_offered_id = so.subject_offered_id AND gmg.student_id = u.users_id AND gmg.module_number IN ($modulePh)
         WHERE $whereSql
         GROUP BY u.users_id, s.subject_id, so.subject_offered_id",
        array_merge($quizPeriods, $moduleRange, $params)
    );

    $enrolled = count($rows);
    $flagged = 0;
    foreach ($rows as $r) {
        $hasScore      = (int)$r['scored_entries'] > 0;
        $hasQuiz       = (int)$r['quiz_attempts'] > 0;
        $hasEngagement = (int)$r['engaged_entries'] > 0;
        if (!$hasScore && !$hasQuiz) {
            if (!$hasEngagement) $flagged++; // truly nothing at all — flagged; attendance-only is "in progress", not flagged
            continue;
        }
        $score  = $hasScore ? (float)$r['module_avg'] : (float)$r['quiz_avg'];
        $cutoff = $hasScore ? 80 : 60;
        if ($score < $cutoff) $flagged++;
    }
    return ['enrolled' => $enrolled, 'flagged' => $flagged];
}
