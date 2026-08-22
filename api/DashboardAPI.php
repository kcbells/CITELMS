<?php
/**
 * Dashboard API
 * Returns statistics for dashboard pages
 */

require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/QuizSectionHelper.php';

ensureQuizScheduleColumns();

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

/**
 * Dean's full scope: campus_ids (multi-campus via dean_campus_scope) and program_ids
 * (every program the dean's department manages — a department can have several).
 * Mirrors SubjectOfferingsAPI.php's deanScope()/deanProgramIds().
 */
function deanFullScope(): array {
    static $s = null;
    if ($s !== null) return $s;

    $row = db()->fetchOne("SELECT campus_id, program_id, department_id FROM users WHERE users_id = ?", [Auth::id()]);
    $campusId = (int)($row['campus_id'] ?? 0);
    $progId   = (int)($row['program_id'] ?? 0);
    $deptId   = (int)($row['department_id'] ?? 0);

    $multiRows = db()->fetchAll("SELECT campus_id FROM dean_campus_scope WHERE dean_id = ?", [Auth::id()]);
    $campusIds = array_map('intval', array_column($multiRows, 'campus_id'));
    if (empty($campusIds) && $campusId) $campusIds = [$campusId];

    // If dean has no program_id but has department_id, pick the first active program in that department
    if (!$progId && $deptId) {
        $firstProg = db()->fetchOne(
            "SELECT p.program_id FROM program p
             JOIN department_program dp ON dp.program_id = p.program_id
             WHERE dp.department_id = ? AND p.status = 'active'
             LIMIT 1",
            [$deptId]
        );
        if ($firstProg) $progId = (int)$firstProg['program_id'];
    }

    $progIds = [];
    if ($deptId) {
        $progRows = db()->fetchAll("SELECT program_id FROM department_program WHERE department_id = ?", [$deptId]);
        $progIds  = array_map(fn($r) => (int)$r['program_id'], $progRows);
    }
    if (!$progIds && $progId) $progIds = [$progId];

    $s = [
        'campus_id'     => $campusId,
        'campus_ids'    => $campusIds,
        'program_id'    => $progId,
        'program_ids'   => $progIds,
        'department_id' => $deptId,
    ];
    return $s;
}

$action = $_GET['action'] ?? 'admin';

// Each dashboard action returns that role's own stats — nothing here was
// previously checking the caller's role at all, so any authenticated user
// (including a student) could call ?action=admin directly and get
// full system-wide counts. Not tied to the analytics.view permission
// specifically — the "admin" action also feeds the plain admin home
// Dashboard and a Settings widget, not just the Analytics page, so gating
// it behind one feature's permission would incorrectly couple all three.
$_dashRoleMap = ['admin' => 'admin', 'instructor' => 'instructor', 'student' => 'student', 'dean' => 'dean'];
if (isset($_dashRoleMap[$action]) && Auth::role() !== $_dashRoleMap[$action]) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permission denied']);
    exit;
}

switch ($action) {
    case 'admin':
        handleAdminDashboard();
        break;
    case 'instructor':
        handleInstructorDashboard();
        break;
    case 'student':
        handleStudentDashboard();
        break;
    case 'dean':
        handleDeanDashboard();
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function handleAdminDashboard() {
    $totalUsers = db()->fetchOne("SELECT COUNT(*) as count FROM users")['count'] ?? 0;
    $totalStudents = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE role = 'student'")['count'] ?? 0;
    $totalInstructors = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE role = 'instructor'")['count'] ?? 0;
    $totalDeans = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE role = 'dean'")['count'] ?? 0;

    $totalDepartments = db()->fetchOne("SELECT COUNT(*) as count FROM department WHERE status = 'active'")['count'] ?? 0;
    $totalPrograms = db()->fetchOne("SELECT COUNT(*) as count FROM program WHERE status = 'active'")['count'] ?? 0;
    $totalSubjects = db()->fetchOne("SELECT COUNT(*) as count FROM subject WHERE status = 'active'")['count'] ?? 0;
    $totalOfferings = db()->fetchOne("SELECT COUNT(*) as count FROM subject_offered")['count'] ?? 0;
    $totalLessons = db()->fetchOne("SELECT COUNT(*) as count FROM lessons")['count'] ?? 0;
    $totalQuizzes = db()->fetchOne("SELECT COUNT(*) as count FROM quiz")['count'] ?? 0;

    $totalSections         = db()->fetchOne("SELECT COUNT(*) as count FROM section")['count'] ?? 0;
    $totalEnrolled         = db()->fetchOne("SELECT COUNT(*) as count FROM student_subject WHERE status = 'enrolled'")['count'] ?? 0;
    $totalFacultyAssigned  = db()->fetchOne("SELECT COUNT(DISTINCT user_teacher_id) as count FROM subject_offered WHERE user_teacher_id IS NOT NULL AND status = 'open'")['count'] ?? 0;

    $recentUsers = db()->fetchAll(
        "SELECT users_id, first_name, last_name, email, role, status, created_at
         FROM users ORDER BY created_at DESC LIMIT 6"
    );

    // Enrollment by department (students currently enrolled via subject offerings)
    $enrollmentByDept = db()->fetchAll(
        "SELECT
            d.department_id,
            d.department_name,
            d.department_code,
            COUNT(DISTINCT ss.user_student_id) AS enrolled_count,
            COUNT(DISTINCT p.program_id)        AS program_count,
            COUNT(DISTINCT sec.section_id)      AS section_count
         FROM department d
         LEFT JOIN department_program dp   ON dp.department_id = d.department_id
         LEFT JOIN program p               ON p.program_id = dp.program_id     AND p.status = 'active'
         LEFT JOIN subject s               ON s.program_id  = p.program_id     AND s.status = 'active'
         LEFT JOIN subject_offered so      ON so.subject_id = s.subject_id     AND so.status = 'open'
         LEFT JOIN student_subject ss      ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
         LEFT JOIN section_subject ssec    ON ssec.subject_offered_id = so.subject_offered_id
         LEFT JOIN section sec             ON sec.section_id = ssec.section_id  AND sec.status = 'active'
         WHERE d.status = 'active'
         GROUP BY d.department_id, d.department_name, d.department_code
         ORDER BY enrolled_count DESC"
    );

    // Per-program enrollment breakdown (for the department cards)
    $programEnrollment = db()->fetchAll(
        "SELECT
            dp.department_id,
            p.program_id,
            p.program_code,
            p.program_name,
            COUNT(DISTINCT ss.user_student_id) AS enrolled_count
         FROM department_program dp
         JOIN program p               ON dp.program_id = p.program_id            AND p.status = 'active'
         LEFT JOIN subject s          ON s.program_id  = p.program_id            AND s.status = 'active'
         LEFT JOIN subject_offered so ON so.subject_id = s.subject_id            AND so.status = 'open'
         LEFT JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
         GROUP BY dp.department_id, p.program_id, p.program_code, p.program_name
         ORDER BY dp.department_id, enrolled_count DESC"
    );

    echo json_encode([
        'success' => true,
        'data' => [
            'stats' => [
                'total_users' => (int)$totalUsers,
                'total_students' => (int)$totalStudents,
                'total_instructors' => (int)$totalInstructors,
                'total_deans' => (int)$totalDeans,
                'total_departments' => (int)$totalDepartments,
                'total_programs' => (int)$totalPrograms,
                'total_subjects' => (int)$totalSubjects,
                'total_offerings' => (int)$totalOfferings,
                'total_lessons' => (int)$totalLessons,
                'total_quizzes' => (int)$totalQuizzes,
                'total_sections'        => (int)$totalSections,
                'total_enrolled'        => (int)$totalEnrolled,
                'total_faculty_assigned' => (int)$totalFacultyAssigned
            ],
            'recent_users'       => $recentUsers,
            'enrollment_by_dept' => $enrollmentByDept,
            'program_enrollment' => $programEnrollment
        ]
    ]);
}

function handleInstructorDashboard() {
    $userId = Auth::id();

    // Get instructor's subject IDs (via subject_offered.user_teacher_id)
    $subjectIds = db()->fetchAll(
        "SELECT DISTINCT s.subject_id FROM subject_offered so
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE so.user_teacher_id = ? AND so.status = 'open'",
        [$userId]
    );
    $sIds = array_map(fn($r) => $r['subject_id'], $subjectIds);
    $sPlaceholders = $sIds ? implode(',', array_fill(0, count($sIds), '?')) : '0';

    // Classes assigned — ONE card per subject (deduplicated by subject_id).
    // When the instructor has multiple subject_offered rows for the same subject
    // (multi-instructor scenario), prefer the offering that is already assigned
    // to a section; fall back to the most recently created orphaned offering.
    // This prevents duplicate cards appearing in My Classes.
    $classes = db()->fetchAll(
        "SELECT
            -- Pick the section-assigned offering if one exists, else the newest orphaned one
            COALESCE(
                MAX(CASE WHEN ss2.section_subject_id IS NOT NULL THEN so.subject_offered_id ELSE NULL END),
                MAX(so.subject_offered_id)
            ) AS subject_offered_id,
            s.subject_id, s.subject_code, s.subject_name, s.units,
            MAX(so.grading_type) AS grading_type,
            GROUP_CONCAT(DISTINCT sec.section_name ORDER BY sec.section_name SEPARATOR ', ') AS section_name,
            GROUP_CONCAT(DISTINCT ss2.schedule     ORDER BY sec.section_name SEPARATOR ', ') AS schedule,
            GROUP_CONCAT(DISTINCT ss2.room         ORDER BY sec.section_name SEPARATOR ', ') AS room,
            (SELECT COUNT(DISTINCT ss.user_student_id)
             FROM student_subject ss
             JOIN subject_offered so2 ON so2.subject_offered_id = ss.subject_offered_id
             WHERE so2.subject_id = s.subject_id
               AND so2.user_teacher_id = $userId
               AND ss.status = 'enrolled') AS student_count,
            (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id AND l.status = 'published') AS published_lessons,
            (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id) AS total_lessons,
            (SELECT COUNT(*) FROM quiz q WHERE q.subject_id = s.subject_id AND q.status = 'published') AS published_quizzes,
            (SELECT COUNT(*) FROM quiz q WHERE q.subject_id = s.subject_id) AS total_quizzes
         FROM subject_offered so
         JOIN subject s ON so.subject_id = s.subject_id
         LEFT JOIN section_subject ss2 ON ss2.subject_offered_id = so.subject_offered_id AND ss2.status = 'active'
         LEFT JOIN section sec ON sec.section_id = ss2.section_id
         WHERE so.user_teacher_id = ? AND so.status = 'open'
         GROUP BY s.subject_id, s.subject_code, s.subject_name, s.units
         HAVING COUNT(DISTINCT sec.section_id) > 0
         ORDER BY s.subject_code",
        [$userId]
    );

    $totalStudents = 0;
    $totalLessons = 0;
    $totalQuizzes = 0;
    foreach ($classes as $c) {
        $totalStudents += (int)$c['student_count'];
        $totalLessons += (int)$c['total_lessons'];
        $totalQuizzes += (int)$c['total_quizzes'];
    }

    // Average quiz score across instructor's subjects
    $avgScore = 0;
    $completionRate = 0;
    $recentActivity = [];
    $quizPerformance = [];
    $atRiskStudents = [];
    if ($sIds) {
        $avgRow = db()->fetchOne(
            "SELECT ROUND(AVG(sqa.percentage), 1) as avg_score
             FROM student_quiz_attempts sqa
             JOIN quiz q ON sqa.quiz_id = q.quiz_id
             WHERE q.subject_id IN ($sPlaceholders) AND sqa.status = 'completed'",
            $sIds
        );
        $avgScore = (float)($avgRow['avg_score'] ?? 0);

        // Lesson completion rate
        $compRow = db()->fetchOne(
            "SELECT
                (SELECT COUNT(*) FROM student_progress sp WHERE sp.subject_id IN ($sPlaceholders) AND sp.status = 'completed') as done,
                (SELECT COUNT(*) FROM student_progress sp WHERE sp.subject_id IN ($sPlaceholders)) as total",
            array_merge($sIds, $sIds)
        );
        $completionRate = ($compRow['total'] > 0) ? round(($compRow['done'] / $compRow['total']) * 100) : 0;

        // Recent quiz attempts
        $recentQuizzes = db()->fetchAll(
            "SELECT sqa.attempt_id, sqa.percentage, sqa.passed, sqa.completed_at,
                q.quiz_title, s.subject_code,
                u.first_name, u.last_name
             FROM student_quiz_attempts sqa
             JOIN quiz q ON sqa.quiz_id = q.quiz_id
             JOIN subject s ON q.subject_id = s.subject_id
             JOIN users u ON sqa.user_student_id = u.users_id
             WHERE q.subject_id IN ($sPlaceholders) AND sqa.status = 'completed'
             ORDER BY sqa.completed_at DESC LIMIT 5",
            $sIds
        );
        foreach ($recentQuizzes as $rq) {
            $recentActivity[] = [
                'type' => 'quiz',
                'student' => $rq['first_name'] . ' ' . $rq['last_name'],
                'detail' => $rq['quiz_title'],
                'subject' => $rq['subject_code'],
                'score' => (float)$rq['percentage'],
                'passed' => (bool)$rq['passed'],
                'time' => $rq['completed_at']
            ];
        }

        // Recent lesson completions
        $recentLessons = db()->fetchAll(
            "SELECT sp.completed_at, l.lesson_title, s.subject_code,
                u.first_name, u.last_name
             FROM student_progress sp
             JOIN lessons l ON sp.lessons_id = l.lessons_id
             JOIN subject s ON sp.subject_id = s.subject_id
             JOIN users u ON sp.user_student_id = u.users_id
             WHERE sp.subject_id IN ($sPlaceholders) AND sp.status = 'completed'
             ORDER BY sp.completed_at DESC LIMIT 5",
            $sIds
        );
        foreach ($recentLessons as $rl) {
            $recentActivity[] = [
                'type' => 'lesson',
                'student' => $rl['first_name'] . ' ' . $rl['last_name'],
                'detail' => $rl['lesson_title'],
                'subject' => $rl['subject_code'],
                'time' => $rl['completed_at']
            ];
        }

        // Sort by time descending, take top 8
        usort($recentActivity, fn($a, $b) => strtotime($b['time'] ?? '0') - strtotime($a['time'] ?? '0'));
        $recentActivity = array_slice($recentActivity, 0, 8);

        // Per-quiz performance
        $quizPerformance = db()->fetchAll(
            "SELECT q.quiz_id, q.quiz_title, s.subject_code,
                ROUND(AVG(sqa.percentage), 1) as avg_score,
                COUNT(sqa.attempt_id) as attempts,
                SUM(sqa.passed) as passed_count
             FROM quiz q
             JOIN subject s ON q.subject_id = s.subject_id
             LEFT JOIN student_quiz_attempts sqa ON q.quiz_id = sqa.quiz_id AND sqa.status = 'completed'
             WHERE q.subject_id IN ($sPlaceholders) AND q.status = 'published'
             GROUP BY q.quiz_id, q.quiz_title, s.subject_code
             ORDER BY q.quiz_title
             LIMIT 10",
            $sIds
        );

        // At-risk students (avg score < 60%)
        $atRiskStudents = db()->fetchAll(
            "SELECT u.users_id, u.first_name, u.last_name,
                ROUND(AVG(sqa.percentage), 1) as avg_score,
                COUNT(sqa.attempt_id) as quiz_count
             FROM student_quiz_attempts sqa
             JOIN quiz q ON sqa.quiz_id = q.quiz_id
             JOIN users u ON sqa.user_student_id = u.users_id
             WHERE q.subject_id IN ($sPlaceholders) AND sqa.status = 'completed'
             GROUP BY u.users_id, u.first_name, u.last_name
             HAVING avg_score < 60
             ORDER BY avg_score ASC
             LIMIT 5",
            $sIds
        );

    }

    echo json_encode([
        'success' => true,
        'data' => [
            'stats' => [
                'classes' => count($classes),
                'students' => $totalStudents,
                'lessons' => $totalLessons,
                'quizzes' => $totalQuizzes,
                'avg_score' => $avgScore,
                'completion_rate' => $completionRate,
            ],
            'classes' => $classes,
            'recent_activity' => $recentActivity,
            'quiz_performance' => $quizPerformance,
            'at_risk_students' => $atRiskStudents,
        ]
    ]);
}

function handleStudentDashboard() {
    $userId = Auth::id();

    // Enrolled subjects with details
    $subjects = db()->fetchAll(
        "SELECT ss.student_subject_id, ss.subject_offered_id, ss.section_id,
            s.subject_id, s.subject_code, s.subject_name, s.units,
            sec.section_name,
            secsubj.schedule, secsubj.room,
            CONCAT(u2.first_name, ' ', u2.last_name) as instructor_name,
            (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id AND l.status = 'published') as total_lessons,
            (SELECT COUNT(*) FROM student_progress sp JOIN lessons l2 ON sp.lessons_id = l2.lessons_id
             WHERE sp.user_student_id = ? AND l2.subject_id = s.subject_id AND sp.status = 'completed') as completed_lessons,
            (SELECT COUNT(*) FROM quiz q WHERE q.subject_id = s.subject_id AND " . quizVisibleToStudentsSql('q') . ") as total_quizzes,
            (SELECT COUNT(DISTINCT qa.quiz_id) FROM student_quiz_attempts qa
             JOIN quiz q2 ON qa.quiz_id = q2.quiz_id
             WHERE qa.user_student_id = ? AND q2.subject_id = s.subject_id AND qa.status = 'completed') as completed_quizzes
         FROM student_subject ss
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         LEFT JOIN users u2 ON u2.users_id = so.user_teacher_id
         LEFT JOIN section sec ON sec.section_id = ss.section_id
         LEFT JOIN section_subject secsubj ON secsubj.section_id = ss.section_id
                                          AND secsubj.subject_offered_id = ss.subject_offered_id
         WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
         ORDER BY s.subject_code",
        [$userId, $userId, $userId]
    );

    // Aggregate stats
    $totalSubjects = count($subjects);
    $totalLessonsCompleted = 0;
    $totalLessons = 0;
    $totalQuizzes = 0;
    foreach ($subjects as &$subj) {
        $totalLessons += (int)$subj['total_lessons'];
        $totalLessonsCompleted += (int)$subj['completed_lessons'];
        $totalQuizzes += (int)$subj['total_quizzes'];
        $subj['progress'] = $subj['total_lessons'] > 0
            ? round(($subj['completed_lessons'] / $subj['total_lessons']) * 100)
            : 0;
    }

    $avgScore = db()->fetchOne(
        "SELECT ROUND(AVG(percentage),1) as avg FROM student_quiz_attempts WHERE user_student_id = ? AND status = 'completed'",
        [$userId]
    )['avg'] ?? 0;

    // Quiz to-do lists categorized by due date / completion
    $subjectIds = array_map(fn($s) => $s['subject_id'], $subjects);
    $pendingQuizzes = [];
    $todos = ['due_today' => [], 'no_due_date' => [], 'missing' => [], 'done' => []];

    if ($subjectIds) {
        $placeholders = implode(',', array_fill(0, count($subjectIds), '?'));
        $quizItems = db()->fetchAll(
            "SELECT q.quiz_id, q.quiz_title, q.due_date, q.time_limit,
                    s.subject_id, s.subject_code, s.subject_name,
                    (SELECT COUNT(*) FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed') AS is_done,
                    (SELECT ROUND(sqa.percentage, 1) FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.completed_at DESC LIMIT 1) AS last_score,
                    (SELECT sqa.completed_at FROM student_quiz_attempts sqa
                     WHERE sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ? AND sqa.status = 'completed'
                     ORDER BY sqa.completed_at DESC LIMIT 1) AS completed_at
             FROM quiz q
             JOIN subject s ON q.subject_id = s.subject_id
             WHERE q.subject_id IN ($placeholders) AND " . quizVisibleToStudentsSql('q') . "
             ORDER BY q.due_date ASC, s.subject_code, q.quiz_title",
            array_merge([$userId, $userId, $userId], $subjectIds)
        );

        $today = date('Y-m-d');

        foreach ($quizItems as $q) {
            $item = [
                'quiz_id'      => $q['quiz_id'],
                'quiz_title'   => $q['quiz_title'],
                'subject_id'   => $q['subject_id'],
                'subject_code' => $q['subject_code'],
                'subject_name' => $q['subject_name'],
                'due_date'     => $q['due_date'],
                'time_limit'   => $q['time_limit'],
                'last_score'   => $q['last_score'],
                'completed_at' => $q['completed_at'],
            ];

            if ((int)$q['is_done'] > 0) {
                $todos['done'][] = $item;
                continue;
            }

            $pendingQuizzes[] = $item;
            $due = $q['due_date'];

            if ($due && $due < $today) {
                $todos['missing'][] = $item;
            } elseif ($due && $due === $today) {
                $todos['due_today'][] = $item;
            } elseif (!$due) {
                $todos['no_due_date'][] = $item;
            }
            // Future-due quizzes are omitted from the board (visible per subject)
        }

        // Most recently completed first
        usort($todos['done'], fn($a, $b) => strtotime($b['completed_at'] ?? '0') - strtotime($a['completed_at'] ?? '0'));
        $todos['done'] = array_slice($todos['done'], 0, 10);
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'stats' => [
                'subjects' => $totalSubjects,
                'lessons_completed' => $totalLessonsCompleted,
                'total_lessons' => $totalLessons,
                'total_quizzes' => $totalQuizzes,
                'avg_score' => round((float)$avgScore, 1),
            ],
            'subjects' => $subjects,
            'pending_quizzes' => $pendingQuizzes,
            'todos' => $todos,
        ]
    ]);
}

function handleDeanDashboard() {
    $scope     = deanFullScope();
    $campusIds = $scope['campus_ids'];
    $progIds   = $scope['program_ids'];
    $deptId    = $scope['department_id'];

    // Resolve department: prefer explicit department_id, fall back to program's department
    $department = null;
    if ($deptId) {
        $department = db()->fetchOne(
            "SELECT d.department_id, d.department_name, d.department_code
             FROM department d WHERE d.department_id = ?",
            [$deptId]
        );
    } elseif ($scope['program_id']) {
        $department = db()->fetchOne(
            "SELECT d.department_id, d.department_name, d.department_code
             FROM department d
             JOIN department_program dp ON dp.department_id = d.department_id
             WHERE dp.program_id = ? LIMIT 1",
            [$scope['program_id']]
        );
    }

    $program = $department; // keep alias for response key

    if (empty($progIds) || empty($campusIds)) {
        echo json_encode([
            'success' => true,
            'data' => [
                'department' => $department,
                'stats' => [
                    'instructors' => 0, 'students' => 0, 'subjects' => 0, 'sections' => 0,
                    'offerings' => 0, 'total_quizzes' => 0, 'total_attempts' => 0, 'avg_score' => 0,
                    'passed' => 0, 'failed' => 0, 'total_lessons' => 0, 'published_lessons' => 0,
                ],
                'faculty' => [], 'programs' => [], 'subject_stats' => [],
                'enrollment_by_year' => [], 'subject_enrollment' => [],
                'at_risk_students' => [], 'non_engaging' => [], 'program_performance' => [],
            ]
        ]);
        return;
    }

    $progPh    = implode(',', array_fill(0, count($progIds), '?'));
    $campusPh  = implode(',', array_fill(0, count($campusIds), '?'));

    // Counts filtered by all of the dean's programs
    $instructors = db()->fetchOne(
        "SELECT COUNT(*) as c FROM users WHERE role = 'instructor' AND campus_id IN ($campusPh) AND program_id IN ($progPh) AND status = 'active'",
        array_merge($campusIds, $progIds)
    )['c'] ?? 0;

    $students = db()->fetchOne(
        "SELECT COUNT(DISTINCT ss.user_student_id) as c
         FROM student_subject ss
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE s.program_id IN ($progPh) AND ss.status = 'enrolled'",
        $progIds
    )['c'] ?? 0;

    $subjects = db()->fetchOne(
        "SELECT COUNT(*) as c FROM subject WHERE program_id IN ($progPh) AND status = 'active'",
        $progIds
    )['c'] ?? 0;

    $sections = db()->fetchOne(
        "SELECT COUNT(DISTINCT sec.section_id) as c FROM section sec
         WHERE sec.program_id IN ($progPh) AND sec.status = 'active'",
        $progIds
    )['c'] ?? 0;

    $offerings = db()->fetchOne(
        "SELECT COUNT(*) as c FROM subject_offered so
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE s.program_id IN ($progPh) AND so.status = 'open'",
        $progIds
    )['c'] ?? 0;

    // Faculty workload (instructors across all of the dean's programs/campuses)
    $faculty = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.last_name, u.employee_id,
            (SELECT COUNT(DISTINCT so2.subject_offered_id) FROM subject_offered so2 WHERE so2.user_teacher_id = u.users_id AND so2.status = 'open') as subject_count,
            (SELECT COUNT(DISTINCT ss2.section_id) FROM section_subject ss2 JOIN subject_offered so2 ON so2.subject_offered_id = ss2.subject_offered_id WHERE so2.user_teacher_id = u.users_id AND ss2.status = 'active') as section_count,
            (SELECT COUNT(DISTINCT stud.user_student_id) FROM student_subject stud WHERE stud.subject_offered_id IN (SELECT so3.subject_offered_id FROM subject_offered so3 WHERE so3.user_teacher_id = u.users_id AND so3.status = 'open') AND stud.status = 'enrolled') as student_count,
            (SELECT COUNT(*) FROM quiz q WHERE q.user_teacher_id = u.users_id) as quiz_count,
            (SELECT COUNT(*) FROM lessons l WHERE l.user_teacher_id = u.users_id) as lesson_count
         FROM users u
         WHERE u.role = 'instructor' AND u.campus_id IN ($campusPh) AND u.program_id IN ($progPh) AND u.status = 'active'
         ORDER BY subject_count DESC",
        array_merge($campusIds, $progIds)
    );

    // Programs list (every program the dean's department manages)
    $programs = db()->fetchAll(
        "SELECT p.program_id, p.program_code, p.program_name,
            (SELECT COUNT(*) FROM users u2 WHERE u2.program_id = p.program_id AND u2.role = 'student' AND u2.status = 'active') as student_count,
            (SELECT COUNT(*) FROM subject s2 WHERE s2.program_id = p.program_id AND s2.status = 'active') as subject_count
         FROM program p WHERE p.program_id IN ($progPh) AND p.status = 'active'",
        $progIds
    );

    // Quiz performance across the dean's programs
    $quizStats = db()->fetchOne(
        "SELECT
            COUNT(DISTINCT q.quiz_id) as total_quizzes,
            COUNT(CASE WHEN sqa.status = 'completed' THEN 1 END) as total_attempts,
            AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END) as avg_score,
            COUNT(CASE WHEN sqa.status = 'completed' AND sqa.percentage >= 75 THEN 1 END) as passed,
            COUNT(CASE WHEN sqa.status = 'completed' AND sqa.percentage < 75 THEN 1 END) as failed
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         LEFT JOIN student_quiz_attempts sqa ON q.quiz_id = sqa.quiz_id
         WHERE s.program_id IN ($progPh)",
        $progIds
    );

    // Subject performance
    $subjectStats = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name,
            p.program_id, p.program_code, p.program_name,
            COUNT(DISTINCT q.quiz_id) as quiz_count,
            COUNT(CASE WHEN sqa.status = 'completed' THEN 1 END) as attempts,
            AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END) as avg_score,
            COUNT(DISTINCT sqa.user_student_id) as student_count
         FROM subject s
         JOIN program p ON p.program_id = s.program_id
         LEFT JOIN quiz q ON q.subject_id = s.subject_id
         LEFT JOIN student_quiz_attempts sqa ON q.quiz_id = sqa.quiz_id
         WHERE s.program_id IN ($progPh) AND s.status = 'active'
         GROUP BY s.subject_id, p.program_id
         ORDER BY attempts DESC",
        $progIds
    );

    // Lesson stats
    $lessonStats = db()->fetchOne(
        "SELECT COUNT(*) as total_lessons,
            SUM(CASE WHEN l.status = 'published' THEN 1 ELSE 0 END) as published
         FROM lessons l
         JOIN subject s ON l.subject_id = s.subject_id
         WHERE s.program_id IN ($progPh)",
        $progIds
    );

    // Enrollment by year level
    $enrollmentByYear = db()->fetchAll(
        "SELECT u.year_level, COUNT(*) as count
         FROM users u
         WHERE u.program_id IN ($progPh) AND u.role = 'student' AND u.status = 'active' AND u.year_level IS NOT NULL
         GROUP BY u.year_level
         ORDER BY u.year_level",
        $progIds
    );

    // Enrollment per subject
    $subjectEnrollment = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, p.program_code,
            COUNT(DISTINCT ss.user_student_id) as enrolled_count
         FROM subject s
         JOIN program p ON p.program_id = s.program_id
         LEFT JOIN subject_offered so ON so.subject_id = s.subject_id AND so.status = 'open'
         LEFT JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
         WHERE s.program_id IN ($progPh) AND s.status = 'active'
         GROUP BY s.subject_id
         ORDER BY enrolled_count DESC, s.subject_code
         LIMIT 12",
        $progIds
    );

    // At-risk students
    $atRiskStudents = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.last_name, u.student_id,
            p.program_code,
            ROUND(AVG(sqa.percentage), 1) as avg_score,
            COUNT(DISTINCT sqa.attempt_id) as attempts
         FROM users u
         JOIN student_subject ss ON ss.user_student_id = u.users_id AND ss.status = 'enrolled'
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         JOIN program p ON p.program_id = s.program_id
         LEFT JOIN quiz q ON q.subject_id = s.subject_id
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.user_student_id = u.users_id AND sqa.status = 'completed'
         WHERE s.program_id IN ($progPh) AND u.role = 'student' AND u.status = 'active'
         GROUP BY u.users_id, p.program_id
         HAVING COUNT(DISTINCT sqa.attempt_id) > 0 AND AVG(sqa.percentage) < 60
         ORDER BY AVG(sqa.percentage) ASC
         LIMIT 10",
        $progIds
    );

    // Non-engaging students
    $nonEngaging = db()->fetchAll(
        "SELECT u.users_id, u.first_name, u.last_name, u.student_id,
            p.program_code,
            COUNT(DISTINCT ss.subject_offered_id) as enrolled_subjects
         FROM users u
         JOIN student_subject ss ON ss.user_student_id = u.users_id AND ss.status = 'enrolled'
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         JOIN program p ON p.program_id = s.program_id
         WHERE s.program_id IN ($progPh) AND u.role = 'student' AND u.status = 'active'
           AND NOT EXISTS (
               SELECT 1 FROM student_quiz_attempts sqa2
               JOIN quiz q2 ON sqa2.quiz_id = q2.quiz_id
               JOIN subject s2 ON q2.subject_id = s2.subject_id
               WHERE sqa2.user_student_id = u.users_id
                 AND s2.program_id IN ($progPh)
                 AND sqa2.status = 'completed'
           )
         GROUP BY u.users_id, p.program_id
         ORDER BY enrolled_subjects DESC
         LIMIT 10",
        array_merge($progIds, $progIds)
    );

    // Per-program quiz performance (across the dean's programs)
    $programPerformance = db()->fetchAll(
        "SELECT p.program_code, p.program_name,
            COUNT(DISTINCT sqa.attempt_id) as attempts,
            AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END) as avg_score,
            COUNT(CASE WHEN sqa.status = 'completed' AND sqa.percentage >= 75 THEN 1 END) as passed,
            COUNT(CASE WHEN sqa.status = 'completed' AND sqa.percentage < 75 THEN 1 END) as failed
         FROM program p
         LEFT JOIN subject s2 ON s2.program_id = p.program_id
         LEFT JOIN quiz q2 ON q2.subject_id = s2.subject_id
         LEFT JOIN student_quiz_attempts sqa ON q2.quiz_id = sqa.quiz_id
         WHERE p.program_id IN ($progPh) AND p.status = 'active'
         GROUP BY p.program_id",
        $progIds
    );

    echo json_encode([
        'success' => true,
        'data' => [
            'department' => $department,
            'stats' => [
                'instructors' => (int)$instructors,
                'students' => (int)$students,
                'subjects' => (int)$subjects,
                'sections' => (int)$sections,
                'offerings' => (int)$offerings,
                'total_quizzes' => (int)($quizStats['total_quizzes'] ?? 0),
                'total_attempts' => (int)($quizStats['total_attempts'] ?? 0),
                'avg_score' => round((float)($quizStats['avg_score'] ?? 0), 1),
                'passed' => (int)($quizStats['passed'] ?? 0),
                'failed' => (int)($quizStats['failed'] ?? 0),
                'total_lessons' => (int)($lessonStats['total_lessons'] ?? 0),
                'published_lessons' => (int)($lessonStats['published'] ?? 0),
            ],
            'faculty' => $faculty,
            'programs' => $programs,
            'subject_stats' => $subjectStats,
            'enrollment_by_year' => $enrollmentByYear,
            'subject_enrollment'  => $subjectEnrollment,
            'at_risk_students'    => $atRiskStudents,
            'non_engaging'        => $nonEngaging,
            'program_performance' => $programPerformance
        ]
    ]);
}
