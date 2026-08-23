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
         LEFT JOIN quiz q               ON q.subject_id = s.subject_id AND q.user_teacher_id = so.user_teacher_id
         LEFT JOIN lessons l            ON l.subject_id = s.subject_id AND l.user_teacher_id = so.user_teacher_id
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
         LEFT JOIN quiz q               ON q.subject_id = so.subject_id AND q.user_teacher_id = so.user_teacher_id
         LEFT JOIN lessons l            ON l.subject_id = so.subject_id AND l.user_teacher_id = so.user_teacher_id
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
 * Struggling Students — for a program head's "Reports" page,
 * scoped to their own program and the year level(s) their account is
 * assigned to handle (users.year_level_from/to). A dean sees every program
 * in their department instead, with no year-level narrowing.
 *
 * "Struggling" combines two signals per subject a student is enrolled in:
 *   - grade average: for Global Gradebook offerings, the average wrap-up
 *     quiz score across their entered modules (the closest single number
 *     to an overall grade without re-deriving the full EL/Mastery weighted
 *     formula server-side); for Raw Score offerings there is no separate
 *     stored "grade" — the class record IS built from quiz scores — so
 *     that signal simply isn't available and quiz average carries it alone.
 *   - quiz average: completed attempt percentage across that subject's quizzes.
 * A subject counts as struggling for a student when whichever of those two
 * is available (grade average takes priority when both exist) is below its
 * cutoff — 80 for a Global Gradebook grade average, 60 for a quiz average —
 * and only when there's actually at least one attempt/entry behind it —
 * a student with zero data isn't "struggling", they're just not counted
 * here (non-engagement was deliberately left out of this report's scope).
 */
function handleStrugglingStudents() {
    $role = Auth::role();
    if (!in_array($role, ['program_head', 'dean', 'admin'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Not available for this role']);
        return;
    }

    $programIds = [];
    $yearFrom = null;
    $yearTo   = null;

    if ($role === 'program_head') {
        $me = db()->fetchOne(
            "SELECT program_id, year_level_from, year_level_to FROM users WHERE users_id = ?",
            [Auth::id()]
        );
        if (empty($me['program_id'])) {
            echo json_encode(['success' => true, 'data' => ['students' => [], 'by_subject' => [], 'unscoped' => true]]);
            return;
        }
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

    if ($role !== 'admin' && !$programIds) {
        echo json_encode(['success' => true, 'data' => ['students' => [], 'by_subject' => [], 'unscoped' => true]]);
        return;
    }

    $where  = ["u.role = 'student'", "u.status = 'active'"];
    $params = [];
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $where[] = "s.program_id IN ($ph)";
        $params = array_merge($params, $programIds);
    }
    if ($yearFrom !== null) { $where[] = "u.year_level >= ?"; $params[] = $yearFrom; }
    if ($yearTo   !== null) { $where[] = "u.year_level <= ?"; $params[] = $yearTo; }
    $whereSql = implode(' AND ', $where);

    $rows = db()->fetchAll(
        "SELECT
            u.users_id, u.first_name, u.last_name, u.student_id, u.year_level,
            s.subject_id, s.subject_code, s.subject_name, so.grading_type,
            ROUND(AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END), 1) AS quiz_avg,
            COUNT(DISTINCT CASE WHEN sqa.status = 'completed' THEN sqa.attempt_id END) AS quiz_attempts,
            ROUND(AVG(gmg.wrap_up_quiz), 1) AS module_avg,
            COUNT(DISTINCT gmg.grade_id) AS module_entries
         FROM users u
         JOIN student_subject ss  ON ss.user_student_id = u.users_id AND ss.status = 'enrolled'
         JOIN subject_offered so  ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s           ON s.subject_id = so.subject_id
         LEFT JOIN quiz q                    ON q.subject_id = s.subject_id AND q.user_teacher_id = so.user_teacher_id
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.user_student_id = u.users_id AND sqa.status = 'completed'
         LEFT JOIN global_module_grades gmg  ON gmg.subject_offered_id = so.subject_offered_id AND gmg.student_id = u.users_id AND gmg.wrap_up_quiz IS NOT NULL
         WHERE $whereSql
         GROUP BY u.users_id, s.subject_id, so.subject_offered_id",
        $params
    );

    $byStudent = [];
    $bySubject = [];
    foreach ($rows as $r) {
        $hasModule = (int)$r['module_entries'] > 0;
        $hasQuiz   = (int)$r['quiz_attempts'] > 0;
        if (!$hasModule && !$hasQuiz) continue; // no data at all — not "struggling", just untouched

        $score  = $hasModule ? (float)$r['module_avg'] : (float)$r['quiz_avg'];
        $source = $hasModule ? 'grade' : 'quiz';
        // Global Gradebook subjects use an 80% cutoff (its mastery-based
        // grading norm runs higher than a plain quiz score), quiz-only
        // subjects (Raw Score offerings, no separate stored grade) keep 60%.
        $threshold = $hasModule ? 80 : 60;
        if ($score >= $threshold) continue;

        $sid = (int)$r['users_id'];
        if (!isset($byStudent[$sid])) {
            $byStudent[$sid] = [
                'users_id'   => $sid,
                'name'       => trim($r['first_name'] . ' ' . $r['last_name']),
                'student_id' => $r['student_id'],
                'year_level' => $r['year_level'] !== null ? (int)$r['year_level'] : null,
                'subjects'   => [],
            ];
        }
        $byStudent[$sid]['subjects'][] = [
            'subject_code' => $r['subject_code'],
            'subject_name' => $r['subject_name'],
            'score'        => $score,
            'source'       => $source, // 'grade' (Global Gradebook module avg) or 'quiz'
        ];

        $code = $r['subject_code'];
        if (!isset($bySubject[$code])) {
            $bySubject[$code] = ['subject_code' => $code, 'subject_name' => $r['subject_name'], 'count' => 0, 'score_sum' => 0];
        }
        $bySubject[$code]['count']++;
        $bySubject[$code]['score_sum'] += $score;
    }

    // Worst-first within each student, and worst-average-first across students
    foreach ($byStudent as &$stu) {
        usort($stu['subjects'], fn($a, $b) => $a['score'] <=> $b['score']);
    }
    unset($stu);
    $students = array_values($byStudent);
    usort($students, function ($a, $b) {
        $avgA = array_sum(array_column($a['subjects'], 'score')) / count($a['subjects']);
        $avgB = array_sum(array_column($b['subjects'], 'score')) / count($b['subjects']);
        return $avgA <=> $avgB;
    });

    $bySubjectOut = array_values(array_map(function ($s) {
        return [
            'subject_code' => $s['subject_code'],
            'subject_name' => $s['subject_name'],
            'count'        => $s['count'],
            'avg_score'    => round($s['score_sum'] / $s['count'], 1),
        ];
    }, $bySubject));
    usort($bySubjectOut, fn($a, $b) => $b['count'] <=> $a['count']);

    echo json_encode([
        'success' => true,
        'data' => [
            'students'  => $students,
            'by_subject'=> $bySubjectOut,
            'scope'     => [
                'year_from' => $yearFrom,
                'year_to'   => $yearTo,
            ],
        ]
    ]);
}
