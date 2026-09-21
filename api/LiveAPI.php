<?php
/**
 * CIT-LMS Live API
 *
 * GET ?action=version — a short fingerprint of everything the signed-in user's
 * screens can show. app.js polls it while a page is open and re-renders that
 * page when the fingerprint moves, so work done on another device (a student
 * submitting, an instructor publishing or grading, a dean editing a section)
 * appears without anyone pressing refresh.
 *
 * Scoped, not global: a change in someone else's class must not redraw your
 * page. "Your classes" means the offerings you teach (instructor, and deans or
 * program heads who teach) plus the ones you are enrolled in (student).
 * Management roles additionally watch the catalogue tables they administer.
 *
 * Each part is a row count plus BIT_XOR(CRC32(...)) over the columns that
 * matter, so inserts, edits and deletes all change it. Every table here is
 * small and filtered through an indexed id list, so a poll stays a few
 * milliseconds. A part whose query fails (older schema) just contributes a
 * constant and never breaks the rest.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';
if ($action !== 'version') {
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
    exit;
}

$userId = (int)Auth::id();
$role   = Auth::role();

$parts = [];
$stamp = function (string $label, string $sql, array $args = []) use (&$parts) {
    try {
        $r = db()->fetchOne($sql, $args);
        $parts[] = $label . '=' . ($r['n'] ?? 0) . ':' . ($r['x'] ?? 0);
    } catch (Throwable $e) {
        $parts[] = $label . '=err';
    }
};
$idList = fn(array $ids) => $ids ? implode(',', array_map('intval', $ids)) : '0';

// ── Which classes are "mine" ─────────────────────────────────────────────
$teachOffered = array_column(db()->fetchAll(
    "SELECT subject_offered_id, subject_id FROM subject_offered WHERE user_teacher_id = ?", [$userId]
), null, 'subject_offered_id');
$enrolOffered = [];
if ($role === 'student') {
    $enrolOffered = array_column(db()->fetchAll(
        "SELECT so.subject_offered_id, so.subject_id
           FROM student_subject ss JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
          WHERE ss.user_student_id = ?", [$userId]
    ), null, 'subject_offered_id');
}
$offered  = $teachOffered + $enrolOffered;
$O        = $idList(array_keys($offered));
$S        = $idList(array_unique(array_column($offered, 'subject_id')));
$teaching = !empty($teachOffered);
$student  = $role === 'student';
// Students see only their own attempts/files; teachers see the whole class.
$mine     = fn(string $col) => $student ? " AND {$col} = {$userId}" : '';

// ── Class content ────────────────────────────────────────────────────────
$stamp('off', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', subject_offered_id, status, updated_at))) x
                 FROM subject_offered WHERE subject_offered_id IN ($O)");
$stamp('enr', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', user_student_id, subject_offered_id, section_id, status, updated_at))) x
                 FROM student_subject WHERE subject_offered_id IN ($O)" . $mine('user_student_id'));
$stamp('join', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', request_id, status))) x
                  FROM class_join_requests WHERE " . ($student ? "user_student_id = {$userId}" : "subject_offered_id IN ($O)"));
$stamp('les', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', lessons_id, status, due_date, published_at, updated_at))) x
                 FROM lessons WHERE subject_id IN ($S)");
$stamp('quiz', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', quiz_id, status, due_date, availability_start, availability_end, updated_at))) x
                  FROM quiz WHERE subject_id IN ($S)");
$stamp('ann', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', announcement_id, is_published, is_pinned, status, updated_at))) x
                 FROM announcement WHERE subject_offered_id IN ($O) OR subject_offered_id IS NULL");
$stamp('doc', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', doc_id, is_published, publish_at, updated_at))) x
                 FROM subject_module_documents WHERE subject_id IN ($S)");
$stamp('req', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', subject_id, module_number, require_all_parts, due_date, updated_at))) x
                 FROM module_requirements WHERE subject_id IN ($S)");
$stamp('cmt', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', comment_id, content))) x
                 FROM class_comments WHERE subject_id IN ($S)");

// ── Work and grades ──────────────────────────────────────────────────────
$stamp('att', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', a.attempt_id, a.status, a.score, a.percentage, a.completed_at, a.has_pending_grades))) x
                 FROM student_quiz_attempts a JOIN quiz q ON q.quiz_id = a.quiz_id
                WHERE q.subject_id IN ($S)" . $mine('a.user_student_id'));
$stamp('ans', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', a.student_quiz_answer_id, a.grading_status, a.points_earned, a.graded_at))) x
                 FROM student_quiz_answers a JOIN quiz q ON q.quiz_id = a.quiz_id
                WHERE q.subject_id IN ($S)" . $mine('a.user_student_id'));
$stamp('ovr', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', o.override_id, o.earned_points, o.updated_at))) x
                 FROM quiz_score_overrides o JOIN quiz q ON q.quiz_id = o.quiz_id
                WHERE q.subject_id IN ($S)" . $mine('o.user_student_id'));
$stamp('file', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', file_id, is_submitted, submitted_at, points_earned))) x
                  FROM student_work_files WHERE subject_id IN ($S)" . $mine('user_student_id'));
$stamp('gmod', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', grade_id, soc1, soc2, lets_practice, lets_practice_optional, reflection, wrap_up_quiz, updated_at))) x
                  FROM global_module_grades WHERE subject_offered_id IN ($O)");
$stamp('gprj', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', proj_id, checkin1, checkin2, checkin3, checkin4, final_output, updated_at))) x
                  FROM global_project_grades WHERE subject_offered_id IN ($O)");
$stamp('gret', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', id, status, updated_at))) x
                  FROM global_retry_tracker WHERE subject_offered_id IN ($O)");

// A student's own reading progress and views are caused by the page they are
// on, so they would only make that page redraw itself. Teachers do want to
// see their students' progress and "viewed by" lists move.
if ($teaching) {
    $stamp('prog', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', progress_id, status, completion_percentage, completed_at))) x
                      FROM student_progress WHERE subject_id IN ($S)");
    $stamp('view', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', view_id, view_count))) x
                      FROM classwork_views WHERE subject_id IN ($S)");
}

// ── Catalogue (the roles that administer it) ─────────────────────────────
if (in_array($role, ['admin', 'dean', 'program_head'], true)) {
    $stamp('sec',  "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', section_id, updated_at))) x FROM section");
    $stamp('subj', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', subject_id, updated_at))) x FROM subject");
    $stamp('ssub', "SELECT COUNT(*) n, MAX(created_at) x FROM section_subject");
    $stamp('aoff', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', subject_offered_id, user_teacher_id, status, updated_at))) x FROM subject_offered");
    $stamp('usr',  "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', users_id, updated_at))) x FROM users");
    $stamp('prg',  "SELECT COUNT(*) n, MAX(updated_at) x FROM program");
    $stamp('dep',  "SELECT COUNT(*) n, MAX(updated_at) x FROM department");
    $stamp('cur',  "SELECT COUNT(*) n, MAX(created_at) x FROM curriculum");
    $stamp('curv', "SELECT COUNT(*) n, MAX(created_at) x FROM curriculum_versions");
    $stamp('sem',  "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', start_date, end_date))) x FROM semester");
    $stamp('fac',  "SELECT COUNT(*) n, MAX(updated_at) x FROM faculty_subject");
    $stamp('arch', "SELECT COUNT(*) n, BIT_XOR(CRC32(CONCAT_WS('|', archived_at, unlocked_at))) x FROM semester_archive");
}

echo json_encode(['success' => true, 'data' => [
    'version' => substr(sha1(implode('|', $parts)), 0, 16),
]]);
