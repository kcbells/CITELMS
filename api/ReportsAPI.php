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

switch ($action) {
    case 'instructor':
        Auth::requireRole(['admin', 'instructor']);
        handleInstructorReport();
        break;
    case 'admin':
        Auth::requireRole('admin');
        handleAdminReport();
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
                COUNT(CASE WHEN sqa.status = 'completed' AND sqa.percentage >= so.passing_rate THEN 1 END) as passed_count,
                COUNT(CASE WHEN sqa.status = 'completed' AND sqa.percentage < so.passing_rate  THEN 1 END) as failed_count
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
