<?php
/**
 * Global Search API
 * Returns role-scoped, categorised search results.
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$q = trim($_GET['q'] ?? '');
if (mb_strlen($q) < 2) {
    echo json_encode(['success' => true, 'data' => []]);
    exit;
}

$role = Auth::role();
$like = '%' . $q . '%';
$results = [];

/* ─── helper ─────────────────────────────────────────────── */
function rows($sql, $params = []) {
    return db()->fetchAll($sql, $params) ?: [];
}

/* ─── ADMIN ──────────────────────────────────────────────── */
if ($role === 'admin') {

    // Users
    $users = rows(
        "SELECT users_id, first_name, last_name, email, role
         FROM users
         WHERE (CONCAT(first_name,' ',last_name) LIKE ? OR email LIKE ?)
           AND status = 'active'
         ORDER BY first_name LIMIT 6",
        [$like, $like]
    );
    if ($users) $results[] = [
        'category' => 'Users', 'icon' => 'user',
        'items' => array_map(fn($u) => [
            'label' => $u['first_name'] . ' ' . $u['last_name'],
            'sub'   => ucfirst($u['role']) . ' · ' . $u['email'],
            'url'   => '#admin/users',
            'icon'  => 'user',
        ], $users)
    ];

    // Departments
    $depts = rows(
        "SELECT department_code, department_name
         FROM department
         WHERE department_name LIKE ? OR department_code LIKE ?
         ORDER BY department_name LIMIT 5",
        [$like, $like]
    );
    if ($depts) $results[] = [
        'category' => 'Departments', 'icon' => 'building',
        'items' => array_map(fn($d) => [
            'label' => $d['department_name'],
            'sub'   => $d['department_code'],
            'url'   => '#admin/departments',
            'icon'  => 'building',
        ], $depts)
    ];

    // Programs
    $progs = rows(
        "SELECT program_code, program_name
         FROM program
         WHERE (program_name LIKE ? OR program_code LIKE ?) AND status = 'active'
         ORDER BY program_name LIMIT 5",
        [$like, $like]
    );
    if ($progs) $results[] = [
        'category' => 'Programs', 'icon' => 'graduation',
        'items' => array_map(fn($p) => [
            'label' => $p['program_name'],
            'sub'   => $p['program_code'],
            'url'   => '#admin/programs',
            'icon'  => 'graduation',
        ], $progs)
    ];

    // Subjects
    $subjs = rows(
        "SELECT subject_code, subject_name
         FROM subject
         WHERE (subject_name LIKE ? OR subject_code LIKE ?) AND status = 'active'
         ORDER BY subject_code LIMIT 5",
        [$like, $like]
    );
    if ($subjs) $results[] = [
        'category' => 'Subjects', 'icon' => 'book',
        'items' => array_map(fn($s) => [
            'label' => $s['subject_name'],
            'sub'   => $s['subject_code'],
            'url'   => '#admin/subjects',
            'icon'  => 'book',
        ], $subjs)
    ];

    // Sections
    $sects = rows(
        "SELECT section_name, enrollment_code
         FROM section
         WHERE section_name LIKE ? AND status = 'active'
         ORDER BY section_name LIMIT 5",
        [$like]
    );
    if ($sects) $results[] = [
        'category' => 'Sections', 'icon' => 'school',
        'items' => array_map(fn($s) => [
            'label' => $s['section_name'],
            'sub'   => $s['enrollment_code'] ? 'Code: ' . $s['enrollment_code'] : '',
            'url'   => '#admin/sections',
            'icon'  => 'school',
        ], $sects)
    ];
}

/* ─── DEAN ───────────────────────────────────────────────── */
elseif ($role === 'dean') {
    $deptId = Auth::user()['department_id'] ?? null;
    if (!$deptId) {
        $u = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [Auth::id()]);
        $deptId = $u['department_id'] ?? null;
    }

    // Instructors in dept
    $instr = rows(
        "SELECT first_name, last_name, email, employee_id
         FROM users
         WHERE role = 'instructor' AND department_id = ?
           AND (CONCAT(first_name,' ',last_name) LIKE ? OR email LIKE ?) AND status = 'active'
         ORDER BY first_name LIMIT 6",
        [$deptId, $like, $like]
    );
    if ($instr) $results[] = [
        'category' => 'Instructors', 'icon' => 'instructor',
        'items' => array_map(fn($u) => [
            'label' => $u['first_name'] . ' ' . $u['last_name'],
            'sub'   => $u['employee_id'] ?? $u['email'],
            'url'   => '#dean/instructors',
            'icon'  => 'instructor',
        ], $instr)
    ];

    // Subjects in dept
    $subjs = rows(
        "SELECT s.subject_code, s.subject_name
         FROM subject s
         JOIN program p ON s.program_id = p.program_id
         JOIN department_program dp ON p.program_id = dp.program_id
         WHERE dp.department_id = ? AND (s.subject_name LIKE ? OR s.subject_code LIKE ?) AND s.status='active'
         ORDER BY s.subject_code LIMIT 6",
        [$deptId, $like, $like]
    );
    if ($subjs) $results[] = [
        'category' => 'Subjects', 'icon' => 'book',
        'items' => array_map(fn($s) => [
            'label' => $s['subject_name'],
            'sub'   => $s['subject_code'],
            'url'   => '#dean/subjects',
            'icon'  => 'book',
        ], $subjs)
    ];

    // Sections in dept
    $sects = rows(
        "SELECT DISTINCT sec.section_name
         FROM section sec
         JOIN section_subject ss ON ss.section_id = sec.section_id
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         JOIN program p ON s.program_id = p.program_id
         JOIN department_program dp ON p.program_id = dp.program_id
         WHERE dp.department_id = ? AND sec.section_name LIKE ? AND sec.status='active'
         ORDER BY sec.section_name LIMIT 5",
        [$deptId, $like]
    );
    if ($sects) $results[] = [
        'category' => 'Sections', 'icon' => 'school',
        'items' => array_map(fn($s) => [
            'label' => $s['section_name'],
            'sub'   => '',
            'url'   => '#dean/sections',
            'icon'  => 'school',
        ], $sects)
    ];
}

/* ─── INSTRUCTOR ─────────────────────────────────────────── */
elseif ($role === 'instructor') {
    $uid = Auth::id();

    // Classes / subjects taught
    $classes = rows(
        "SELECT DISTINCT s.subject_code, s.subject_name
         FROM subject_offered so
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE so.user_teacher_id = ? AND so.status = 'open'
           AND (s.subject_name LIKE ? OR s.subject_code LIKE ?)
         ORDER BY s.subject_code LIMIT 6",
        [$uid, $like, $like]
    );
    if ($classes) $results[] = [
        'category' => 'My Classes', 'icon' => 'school',
        'items' => array_map(fn($c) => [
            'label' => $c['subject_name'],
            'sub'   => $c['subject_code'],
            'url'   => '#instructor/my-classes',
            'icon'  => 'school',
        ], $classes)
    ];

    // Students enrolled in their subjects
    $students = rows(
        "SELECT DISTINCT u.first_name, u.last_name, u.student_id
         FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN users u ON u.users_id = ss.user_student_id
         WHERE so.user_teacher_id = ? AND ss.status = 'enrolled'
           AND CONCAT(u.first_name,' ',u.last_name) LIKE ?
         ORDER BY u.first_name LIMIT 6",
        [$uid, $like]
    );
    if ($students) $results[] = [
        'category' => 'Students', 'icon' => 'user',
        'items' => array_map(fn($u) => [
            'label' => $u['first_name'] . ' ' . $u['last_name'],
            'sub'   => $u['student_id'] ?? '',
            'url'   => '#instructor/gradebook',
            'icon'  => 'user',
        ], $students)
    ];

    // Quizzes
    $quizzes = rows(
        "SELECT q.quiz_title, s.subject_code
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         WHERE q.user_teacher_id = ? AND q.quiz_title LIKE ?
         ORDER BY q.quiz_title LIMIT 5",
        [$uid, $like]
    );
    if ($quizzes) $results[] = [
        'category' => 'Quizzes', 'icon' => 'quiz',
        'items' => array_map(fn($q) => [
            'label' => $q['quiz_title'],
            'sub'   => $q['subject_code'],
            'url'   => '#instructor/quizzes',
            'icon'  => 'quiz',
        ], $quizzes)
    ];
}

/* ─── STUDENT ────────────────────────────────────────────── */
elseif ($role === 'student') {
    $uid = Auth::id();

    // Enrolled subjects
    $subjs = rows(
        "SELECT s.subject_code, s.subject_name
         FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
           AND (s.subject_name LIKE ? OR s.subject_code LIKE ?)
         ORDER BY s.subject_code LIMIT 6",
        [$uid, $like, $like]
    );
    if ($subjs) $results[] = [
        'category' => 'My Subjects', 'icon' => 'book',
        'items' => array_map(fn($s) => [
            'label' => $s['subject_name'],
            'sub'   => $s['subject_code'],
            'url'   => '#student/my-subjects',
            'icon'  => 'book',
        ], $subjs)
    ];

    // Lessons
    $lessons = rows(
        "SELECT l.lesson_title, s.subject_code
         FROM lessons l
         JOIN subject s ON l.subject_id = s.subject_id
         JOIN student_subject ss2 ON ss2.subject_offered_id IN (
             SELECT so.subject_offered_id FROM subject_offered so WHERE so.subject_id = s.subject_id
         )
         WHERE ss2.user_student_id = ? AND l.status = 'published' AND l.lesson_title LIKE ?
         ORDER BY l.lesson_title LIMIT 6",
        [$uid, $like]
    );
    if ($lessons) $results[] = [
        'category' => 'Lessons', 'icon' => 'lessons',
        'items' => array_map(fn($l) => [
            'label' => $l['lesson_title'],
            'sub'   => $l['subject_code'],
            'url'   => '#student/my-subjects',
            'icon'  => 'lessons',
        ], $lessons)
    ];

    // Quizzes
    $quizzes = rows(
        "SELECT q.quiz_id, q.quiz_title, s.subject_code
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         JOIN student_subject ss ON ss.subject_offered_id IN (
             SELECT so.subject_offered_id FROM subject_offered so WHERE so.subject_id = s.subject_id
         )
         WHERE ss.user_student_id = ? AND q.status = 'published' AND q.quiz_title LIKE ?
         ORDER BY q.quiz_title LIMIT 5",
        [$uid, $like]
    );
    if ($quizzes) $results[] = [
        'category' => 'Quizzes', 'icon' => 'quiz',
        'items' => array_map(fn($q) => [
            'label' => $q['quiz_title'],
            'sub'   => $q['subject_code'],
            'url'   => '#student/quizzes',
            'icon'  => 'quiz',
        ], $quizzes)
    ];
}

echo json_encode(['success' => true, 'data' => $results]);
