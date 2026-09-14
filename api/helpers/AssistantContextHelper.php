<?php
/**
 * Ali assistant — lesson context, safety filter, prompt building.
 */
require_once __DIR__ . '/ScopeHelper.php';

function stripHtmlForAssistant(string $html): string {
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
    return trim($text);
}

function truncateAssistantText(string $text, int $max = 12000): string {
    if (mb_strlen($text) <= $max) {
        return $text;
    }
    return mb_substr($text, 0, $max) . '… [truncated]';
}

/**
 * Block harmful, security, or academic-integrity violations before calling the AI.
 * Returns a user-facing refusal message, or null if allowed.
 */
function assistantSafetyCheck(string $message): ?string {
    $m = mb_strtolower($message);

    $patterns = [
        '/\b(hack|hacking|cracker|cracking|exploit|ddos|malware|ransomware|keylogger|phishing)\b/u',
        '/\b(sql\s*inject|inject\s*sql|bypass\s*(auth|login|security)|steal\s*(password|credential)|database\s*password|admin\s*password|api\s*key\s*leak)\b/u',
        '/\b(kill|murder|assassin|bomb|weapon|terror|suicide|self[\s-]?harm)\b/u',
        '/\b(how\s+to\s+(make|build)\s+(a\s+)?(bomb|weapon|drug))\b/u',
        '/\b(give\s+me\s+(all\s+)?(the\s+)?quiz\s+answers|answer\s+(this|the)\s+quiz\s+for\s+me|cheat\s+on\s+(the\s+)?(quiz|exam|test))\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $m)) {
            return 'I can\'t help with that request. I\'m here to help you learn your coursework safely — ask me to explain a lesson, summarize a topic, or clarify something you highlighted.';
        }
    }

    return null;
}

/**
 * Load lesson material the student is allowed to see (enrollment-checked).
 */
function loadLessonContextForAssistant(int $lessonId, int $userId): ?array {
    if ($lessonId < 1) {
        return null;
    }

    $lesson = db()->fetchOne(
        "SELECT l.lessons_id, l.lesson_title, l.lesson_description, l.lesson_content,
                l.lesson_order, l.learning_objectives, l.subject_id,
                s.subject_code, s.subject_name
         FROM lessons l
         JOIN subject s ON s.subject_id = l.subject_id
         WHERE l.lessons_id = ? AND l.status = 'published'",
        [$lessonId]
    );

    if (!$lesson) {
        return null;
    }

    $enrollment = db()->fetchOne(
        "SELECT ss.student_subject_id FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
         LIMIT 1",
        [$userId, $lesson['subject_id']]
    );

    if (!$enrollment && Auth::role() === 'student') {
        return null;
    }

    $materials = db()->fetchAll(
        "SELECT original_name, material_type, file_type
         FROM lesson_materials WHERE lessons_id = ?
         ORDER BY material_id ASC LIMIT 20",
        [$lessonId]
    );

    $content = stripHtmlForAssistant((string)($lesson['lesson_content'] ?? ''));
    $description = stripHtmlForAssistant((string)($lesson['lesson_description'] ?? ''));
    $objectives = stripHtmlForAssistant((string)($lesson['learning_objectives'] ?? ''));

    return [
        'lessons_id'    => (int)$lesson['lessons_id'],
        'lesson_title'  => (string)$lesson['lesson_title'],
        'lesson_order'  => (int)($lesson['lesson_order'] ?? 0),
        'subject_code'  => (string)$lesson['subject_code'],
        'subject_name'  => (string)$lesson['subject_name'],
        'description'   => $description,
        'objectives'    => $objectives,
        'content'       => truncateAssistantText($content, 10000),
        'materials'     => array_map(fn($r) => [
            'name' => $r['original_name'] ?? '',
            'type' => $r['material_type'] ?? '',
        ], $materials),
    ];
}

function loadQuizContextForAssistant(int $quizId, int $userId): ?array {
    if ($quizId < 1) {
        return null;
    }

    require_once __DIR__ . '/QuizSectionHelper.php';

    $quiz = db()->fetchOne(
        "SELECT q.quiz_id, q.quiz_title, q.quiz_description, q.subject_id,
                s.subject_code, s.subject_name
         FROM quiz q
         JOIN subject s ON s.subject_id = q.subject_id
         WHERE q.quiz_id = ? AND " . quizPublishedSql('q'),
        [$quizId]
    );

    if (!$quiz) {
        return null;
    }

    if (Auth::role() === 'student') {
        $enrollment = db()->fetchOne(
            "SELECT ss.student_subject_id FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
             LIMIT 1",
            [$userId, $quiz['subject_id']]
        );
        if (!$enrollment) {
            return null;
        }
    }

    return [
        'quiz_id'          => (int)$quiz['quiz_id'],
        'quiz_title'       => (string)$quiz['quiz_title'],
        'quiz_description' => stripHtmlForAssistant((string)($quiz['quiz_description'] ?? '')),
        'subject_code'     => (string)$quiz['subject_code'],
        'subject_name'     => (string)$quiz['subject_name'],
    ];
}

/**
 * Only run the heavier drill-down queries (full struggling-student list,
 * subject-by-subject performance breakdown, attendance) when the message
 * plausibly asks for that level of detail — kept broad on purpose: missing
 * a real question here means the AI falls back to a vague "go check Reports"
 * non-answer, which is the exact complaint this exists to fix. A basic
 * headline count ("how many of my students are active") doesn't need any of
 * these — see the always-on CLASS SNAPSHOT block below instead.
 */
function assistantWantsPerformanceReport(string $message): bool {
    return (bool)preg_match(
        '/\b(report|performance|pass(ing)?\s*rate|statistic|stats|overview|summary|how\s+(is|are|\'?s)\s+.*\s*(doing|perform\w*)|analytics|faculty\s+workload|department|breakdown|score|scores|average|grade|grades|grading)\b/iu',
        $message
    );
}

function assistantWantsStrugglingStudents(string $message): bool {
    return (bool)preg_match(
        '/\b(struggl\w*|at[\s-]?risk|fail(ing|ed)?|low\s*grad\w*|behind|underperform\w*|flagged|lacking|falling\s+behind|need(s|ing)?\s+help|weak\w*|worst|poor(ly)?)\b/iu',
        $message
    );
}

function assistantWantsAttendance(string $message): bool {
    return (bool)preg_match(
        '/\b(absen\w*|attend\w*|present\b|no[\s-]?show\w*|missed\s+class|missing\s+class|cutting\s+class)\b/iu',
        $message
    );
}

/**
 * Always-on, cheap headline counts for instructor/program_head/dean/admin —
 * this is what answers a plain "how many of my students are active" without
 * needing to guess the right keyword first. The heavier blocks above stay
 * keyword-gated since they run more/bigger queries and take more prompt
 * space than every single message needs.
 */
function loadClassSnapshotForAssistant(string $role, int $userId): ?array {
    if ($role === 'instructor') {
        $row = db()->fetchOne(
            "SELECT COUNT(DISTINCT so.subject_offered_id) AS subjects,
                    COUNT(DISTINCT ss.section_id) AS sections,
                    COUNT(DISTINCT CASE WHEN ss.status = 'enrolled' AND u.status = 'active' THEN u.users_id END) AS active_students,
                    COUNT(DISTINCT CASE WHEN ss.status = 'enrolled' THEN u.users_id END) AS enrolled_students
             FROM subject_offered so
             LEFT JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             LEFT JOIN users u ON u.users_id = ss.user_student_id
             WHERE so.user_teacher_id = ? AND so.status = 'open'",
            [$userId]
        );
        return [
            'scope' => 'your classes',
            'subjects' => (int)($row['subjects'] ?? 0), 'sections' => (int)($row['sections'] ?? 0),
            'active_students' => (int)($row['active_students'] ?? 0), 'enrolled_students' => (int)($row['enrolled_students'] ?? 0),
        ];
    }

    if (!in_array($role, ['program_head', 'dean', 'admin'], true)) return null;

    $programIds = [];
    if ($role === 'dean') {
        $programIds = deanProgramIds();
        if (!$programIds) return null;
    } elseif ($role === 'program_head') {
        $scope = programHeadScope();
        if (!$scope['program_id']) return null;
        $programIds = [$scope['program_id']];
    }

    $subjFilter = ''; $subjParams = [];
    $userFilter = ''; $userParams = [];
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $subjFilter = "AND s.program_id IN ($ph)";
        $subjParams = $programIds;
        $userFilter = "AND u.program_id IN ($ph)";
        $userParams = $programIds;
    }

    $instructors = (int)(db()->fetchOne(
        "SELECT COUNT(*) c FROM users u WHERE u.role = 'instructor' AND u.status = 'active' $userFilter", $userParams
    )['c'] ?? 0);

    $studentRow = db()->fetchOne(
        "SELECT COUNT(DISTINCT CASE WHEN ss.status = 'enrolled' AND u.status = 'active' THEN u.users_id END) AS active_students,
                COUNT(DISTINCT CASE WHEN ss.status = 'enrolled' THEN u.users_id END) AS enrolled_students,
                COUNT(DISTINCT s.subject_id) AS subjects
         FROM subject s
         LEFT JOIN subject_offered so ON so.subject_id = s.subject_id
         LEFT JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
         LEFT JOIN users u ON u.users_id = ss.user_student_id
         WHERE 1=1 $subjFilter",
        $subjParams
    );

    return [
        'scope'            => $programIds ? 'your program(s)' : 'the whole system',
        'instructors'      => $instructors,
        'active_students'  => (int)($studentRow['active_students'] ?? 0),
        'enrolled_students'=> (int)($studentRow['enrolled_students'] ?? 0),
        'subjects'         => (int)($studentRow['subjects'] ?? 0),
    ];
}

/**
 * "Who's absent" — SOC 1/2 (the Global Gradebook's per-module attendance
 * dropdown, P=present/A=absent) is the only real attendance record this LMS
 * keeps. Counts every 'A' mark across all modules in scope, and names the
 * students with the most of them.
 */
function loadAttendanceForAssistant(string $role, int $userId): ?array {
    $teacherId = null; $programIds = [];
    if ($role === 'instructor') {
        $teacherId = $userId;
    } elseif ($role === 'dean') {
        $programIds = deanProgramIds();
        if (!$programIds) return null;
    } elseif ($role === 'program_head') {
        $scope = programHeadScope();
        if (!$scope['program_id']) return null;
        $programIds = [$scope['program_id']];
    } elseif ($role !== 'admin') {
        return null;
    }

    $where = ["u.role = 'student'", "u.status = 'active'", "ss.status = 'enrolled'"];
    $params = [];
    if ($teacherId !== null) { $where[] = "so.user_teacher_id = ?"; $params[] = $teacherId; }
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $where[] = "s.program_id IN ($ph)";
        $params = array_merge($params, $programIds);
    }
    $whereSql = implode(' AND ', $where);

    $rows = db()->fetchAll(
        "SELECT u.first_name, u.last_name, u.student_id, s.subject_code,
                SUM(CASE WHEN gmg.soc1 = 'A' THEN 1 ELSE 0 END + CASE WHEN gmg.soc2 = 'A' THEN 1 ELSE 0 END) AS absences
         FROM users u
         JOIN student_subject ss ON ss.user_student_id = u.users_id
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN global_module_grades gmg ON gmg.subject_offered_id = so.subject_offered_id AND gmg.student_id = u.users_id
         WHERE $whereSql
         GROUP BY u.users_id, s.subject_id
         HAVING absences > 0
         ORDER BY absences DESC
         LIMIT 15",
        $params
    );

    return [
        'students' => array_map(fn($r) => [
            'name' => trim($r['first_name'] . ' ' . $r['last_name']),
            'student_id' => $r['student_id'],
            'subject_code' => $r['subject_code'],
            'absences' => (int)$r['absences'],
        ], $rows),
    ];
}

/**
 * Instructor/program_head/dean/admin — compact "who's struggling" summary.
 * Reuses the exact scope + status cutoffs ReportsAPI.php's Struggling
 * Students report uses (80% cutoff for Global Gradebook subjects, 60% for
 * plain quiz-score subjects), so the assistant's answer always lines up
 * with what that report page itself would show — never a second, differently
 * -tuned definition of "struggling".
 */
function loadStrugglingStudentsForAssistant(string $role, int $userId): ?array {
    if (!in_array($role, ['instructor', 'program_head', 'dean', 'admin'], true)) return null;

    $programIds = []; $yearFrom = null; $yearTo = null; $teacherId = null;
    if ($role === 'instructor') {
        $teacherId = $userId;
    } elseif ($role === 'program_head') {
        $scope = programHeadScope();
        if (!$scope['program_id']) return null;
        $programIds = [$scope['program_id']];
        $yearFrom = $scope['year_from'];
        $yearTo   = $scope['year_to'];
    } elseif ($role === 'dean') {
        $programIds = deanProgramIds();
        if (!$programIds) return null;
    }
    // admin: no program filter (every program) when it asks unprompted.

    $where = ["u.role = 'student'", "u.status = 'active'"];
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

    $rows = db()->fetchAll(
        "SELECT
            u.first_name, u.last_name, u.student_id,
            s.subject_code, sec.section_name,
            ROUND(AVG(CASE WHEN sqa.status = 'completed' THEN sqa.percentage END), 1) AS quiz_avg,
            COUNT(DISTINCT CASE WHEN sqa.status = 'completed' THEN sqa.attempt_id END) AS quiz_attempts,
            ROUND(AVG(gmg.wrap_up_quiz), 1) AS module_avg,
            COUNT(DISTINCT CASE WHEN gmg.wrap_up_quiz IS NOT NULL THEN gmg.grade_id END) AS scored_entries
         FROM users u
         JOIN student_subject ss  ON ss.user_student_id = u.users_id AND ss.status = 'enrolled'
         JOIN subject_offered so  ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s           ON s.subject_id = so.subject_id
         LEFT JOIN section sec               ON sec.section_id = ss.section_id
         LEFT JOIN quiz q                    ON q.subject_id = s.subject_id AND q.user_teacher_id = so.user_teacher_id
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.user_student_id = u.users_id AND sqa.status = 'completed'
         LEFT JOIN global_module_grades gmg  ON gmg.subject_offered_id = so.subject_offered_id AND gmg.student_id = u.users_id
         WHERE $whereSql
         GROUP BY u.users_id, s.subject_id, so.subject_offered_id, ss.section_id
         LIMIT 500",
        $params
    );

    $flagged = [];
    $totalEnrolled = count($rows);
    foreach ($rows as $r) {
        $hasScore = (int)$r['scored_entries'] > 0;
        $hasQuiz  = (int)$r['quiz_attempts'] > 0;
        if (!$hasScore && !$hasQuiz) continue; // no graded data yet — not "struggling", just not started
        $score  = $hasScore ? (float)$r['module_avg'] : (float)$r['quiz_avg'];
        $cutoff = $hasScore ? 80 : 60;
        if ($score >= $cutoff) continue; // meets the bar — not flagged
        $flagged[] = [
            'name'         => trim($r['first_name'] . ' ' . $r['last_name']),
            'student_id'   => $r['student_id'],
            'subject_code' => $r['subject_code'],
            'section'      => $r['section_name'],
            'score'        => $score,
            'status'       => $score >= $cutoff - 20 ? 'at_risk' : 'critical',
        ];
    }

    // Worst-first, capped — this feeds an LLM prompt, not a paginated table,
    // so keep it to a short, genuinely actionable list rather than everyone.
    usort($flagged, fn($a, $b) => $a['score'] <=> $b['score']);
    return [
        'total_enrolled' => $totalEnrolled,
        'total_flagged'  => count($flagged),
        'students'       => array_slice($flagged, 0, 15),
    ];
}

/**
 * Instructor gets a per-class snapshot; program_head/dean/admin get a
 * program-scoped one — headline counts, quiz pass rate, and the weakest few
 * subjects, so "how is my department doing" has real numbers behind it
 * instead of the AI guessing.
 */
function loadPerformanceReportForAssistant(string $role, int $userId): ?array {
    if ($role === 'instructor') {
        $t = db()->fetchOne(
            "SELECT COUNT(DISTINCT so.subject_offered_id) AS subjects,
                    COUNT(DISTINCT ss.user_student_id) AS students,
                    COUNT(DISTINCT q.quiz_id) AS quizzes,
                    AVG(CASE WHEN sqa.status='completed' THEN sqa.percentage END) AS avg_score,
                    COUNT(CASE WHEN sqa.status='completed' AND sqa.passed=1 THEN 1 END) AS passed,
                    COUNT(CASE WHEN sqa.status='completed' AND sqa.passed=0 THEN 1 END) AS failed
             FROM subject_offered so
             LEFT JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
             LEFT JOIN quiz q ON q.subject_id = so.subject_id AND q.user_teacher_id = so.user_teacher_id
             LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id
             WHERE so.user_teacher_id = ? AND so.status = 'open'",
            [$userId]
        );
        return [
            'scope' => 'your classes', 'subjects' => (int)($t['subjects'] ?? 0), 'students' => (int)($t['students'] ?? 0),
            'quizzes' => (int)($t['quizzes'] ?? 0), 'avg_score' => round((float)($t['avg_score'] ?? 0), 1),
            'passed' => (int)($t['passed'] ?? 0), 'failed' => (int)($t['failed'] ?? 0),
        ];
    }

    if (!in_array($role, ['program_head', 'dean', 'admin'], true)) return null;

    $programIds = [];
    if ($role === 'dean') {
        $programIds = deanProgramIds();
        if (!$programIds) return null;
    } elseif ($role === 'program_head') {
        $scope = programHeadScope();
        if (!$scope['program_id']) return null;
        $programIds = [$scope['program_id']];
    }
    // admin with no programs resolved = system-wide, no filter.

    $subjFilter = ''; $subjParams = [];
    $userFilter = ''; $userParams = [];
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $subjFilter = "AND s.program_id IN ($ph)";
        $subjParams = $programIds;
        $userFilter = "AND u.program_id IN ($ph)";
        $userParams = $programIds;
    }

    $instructors = (int)(db()->fetchOne(
        "SELECT COUNT(*) c FROM users u WHERE u.role = 'instructor' AND u.status = 'active' $userFilter",
        $userParams
    )['c'] ?? 0);

    $students = (int)(db()->fetchOne(
        "SELECT COUNT(DISTINCT ss.user_student_id) c
         FROM student_subject ss
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE ss.status = 'enrolled' $subjFilter",
        $subjParams
    )['c'] ?? 0);

    $quizStats = db()->fetchOne(
        "SELECT COUNT(DISTINCT q.quiz_id) quizzes,
                AVG(CASE WHEN sqa.status='completed' THEN sqa.percentage END) avg_score,
                COUNT(CASE WHEN sqa.status='completed' AND sqa.percentage>=75 THEN 1 END) passed,
                COUNT(CASE WHEN sqa.status='completed' AND sqa.percentage<75 THEN 1 END) failed
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         LEFT JOIN student_quiz_attempts sqa ON q.quiz_id = sqa.quiz_id
         WHERE 1=1 $subjFilter",
        $subjParams
    );

    $weakSubjects = db()->fetchAll(
        "SELECT s.subject_code, s.subject_name,
                ROUND(AVG(CASE WHEN sqa.status='completed' THEN sqa.percentage END), 1) avg_score,
                COUNT(CASE WHEN sqa.status='completed' THEN 1 END) attempts
         FROM subject s
         LEFT JOIN quiz q ON q.subject_id = s.subject_id
         LEFT JOIN student_quiz_attempts sqa ON q.quiz_id = sqa.quiz_id
         WHERE s.status = 'active' $subjFilter
         GROUP BY s.subject_id
         HAVING attempts > 0
         ORDER BY avg_score ASC
         LIMIT 5",
        $subjParams
    );

    return [
        'scope'            => $programIds ? 'your programs' : 'the whole system',
        'instructors'      => $instructors,
        'students'         => $students,
        'quizzes'          => (int)($quizStats['quizzes'] ?? 0),
        'avg_score'        => round((float)($quizStats['avg_score'] ?? 0), 1),
        'passed'           => (int)($quizStats['passed'] ?? 0),
        'failed'           => (int)($quizStats['failed'] ?? 0),
        'weakest_subjects' => $weakSubjects ?: [],
    ];
}

/**
 * "How is Juan doing?" — a student who ISN'T flagged has no entry in
 * STRUGGLING STUDENTS DATA (that block only lists below-cutoff students on
 * purpose), and PERFORMANCE REPORT DATA is aggregate-only — so a normal,
 * in-good-standing student had nowhere to come from at all, and the AI could
 * only say "I don't have individual student data" even though it's right
 * there in the database. This looks for a real enrolled student (in the
 * asking role's scope) whose full name or student ID is literally present
 * in the message — deterministic substring matching against the real
 * roster, not asking the AI to guess a name out of free text — and returns
 * that ONE student's real per-subject scores and attendance. Ambiguous
 * (matches more than one person) or no match at all returns null rather
 * than guessing wrong.
 */
function loadIndividualStudentForAssistant(string $role, int $userId, string $message): ?array {
    $teacherId = null; $programIds = [];
    if ($role === 'instructor') {
        $teacherId = $userId;
    } elseif ($role === 'dean') {
        $programIds = deanProgramIds();
        if (!$programIds) return null;
    } elseif ($role === 'program_head') {
        $scope = programHeadScope();
        if (!$scope['program_id']) return null;
        $programIds = [$scope['program_id']];
    } elseif ($role !== 'admin') {
        return null;
    }

    $where = ["u.role = 'student'", "u.status = 'active'", "ss.status = 'enrolled'"];
    $params = [];
    if ($teacherId !== null) { $where[] = "so.user_teacher_id = ?"; $params[] = $teacherId; }
    if ($programIds) {
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $where[] = "s.program_id IN ($ph)";
        $params = array_merge($params, $programIds);
    }
    $whereSql = implode(' AND ', $where);

    $roster = db()->fetchAll(
        "SELECT DISTINCT u.users_id, u.first_name, u.last_name, u.student_id
         FROM users u
         JOIN student_subject ss ON ss.user_student_id = u.users_id
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         WHERE $whereSql
         LIMIT 1000",
        $params
    );
    if (!$roster) return null;

    $needle = mb_strtolower($message);
    $matches = [];
    foreach ($roster as $r) {
        $first = mb_strtolower(trim((string)$r['first_name']));
        $last  = mb_strtolower(trim((string)$r['last_name']));
        $sid   = mb_strtolower(trim((string)($r['student_id'] ?? '')));
        $full  = trim("$first $last");
        $rev   = trim("$last $first");
        $nameHit = ($full !== '' && str_contains($needle, $full)) || ($rev !== '' && str_contains($needle, $rev))
            || ($first !== '' && $last !== '' && mb_strlen($last) >= 3
                && preg_match('/\b' . preg_quote($first, '/') . '\b/u', $needle)
                && preg_match('/\b' . preg_quote($last, '/') . '\b/u', $needle));
        $idHit = $sid !== '' && str_contains($needle, $sid);
        if ($nameHit || $idHit) $matches[$r['users_id']] = $r;
    }
    if (count($matches) !== 1) return null;

    $student = reset($matches);
    $studentId = (int)$student['users_id'];

    $sql = "SELECT s.subject_code,
                ROUND(AVG(CASE WHEN sqa.status='completed' THEN sqa.percentage END), 1) AS quiz_avg,
                COUNT(DISTINCT CASE WHEN sqa.status='completed' THEN sqa.attempt_id END) AS quiz_attempts,
                ROUND(AVG(gmg.wrap_up_quiz), 1) AS module_avg,
                COUNT(DISTINCT CASE WHEN gmg.wrap_up_quiz IS NOT NULL THEN gmg.grade_id END) AS scored_entries,
                SUM(CASE WHEN gmg.soc1 = 'A' THEN 1 ELSE 0 END + CASE WHEN gmg.soc2 = 'A' THEN 1 ELSE 0 END) AS absences
         FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN quiz q ON q.subject_id = s.subject_id AND q.user_teacher_id = so.user_teacher_id
         LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.quiz_id AND sqa.user_student_id = ss.user_student_id AND sqa.status = 'completed'
         LEFT JOIN global_module_grades gmg ON gmg.subject_offered_id = so.subject_offered_id AND gmg.student_id = ss.user_student_id
         WHERE ss.user_student_id = ? AND ss.status = 'enrolled'" . ($teacherId !== null ? " AND so.user_teacher_id = ?" : '') . "
         GROUP BY s.subject_id, so.subject_offered_id";
    $subjRows = db()->fetchAll($sql, $teacherId !== null ? [$studentId, $teacherId] : [$studentId]);

    return [
        'name'       => trim($student['first_name'] . ' ' . $student['last_name']),
        'student_id' => $student['student_id'],
        'subjects'   => array_map(function ($r) {
            $hasScore = (int)$r['scored_entries'] > 0;
            $hasQuiz  = (int)$r['quiz_attempts'] > 0;
            return [
                'subject_code' => $r['subject_code'],
                'score'        => $hasScore ? (float)$r['module_avg'] : ($hasQuiz ? (float)$r['quiz_avg'] : null),
                'source'       => $hasScore ? 'module grade average' : ($hasQuiz ? 'quiz average' : 'no graded work yet'),
                'absences'     => (int)$r['absences'],
            ];
        }, $subjRows),
    ];
}

/**
 * Append current-page context to the system prompt.
 */
function buildAssistantContextBlock(array $context, int $userId, string $role, string $message = ''): string {
    $parts = [];

    // Staff roles: pull real report/struggling-student data when the
    // question plausibly asks for it, rather than only ever answering from
    // whatever page the user happens to be on (a dean asking "how's my
    // department doing" isn't standing on any one lesson/quiz page).
    if (in_array($role, ['instructor', 'program_head', 'dean', 'admin'], true)) {
        // Always attached, no keyword needed — this is what lets a plain
        // "how many of my students are active" get a real number instead of
        // "go check the Reports page", regardless of exact phrasing.
        $snapshot = loadClassSnapshotForAssistant($role, $userId);
        if ($snapshot) {
            $parts[] = "CLASS SNAPSHOT DATA (real, current — scope: {$snapshot['scope']}):";
            foreach ($snapshot as $k => $v) {
                if ($k === 'scope') continue;
                $parts[] = '- ' . str_replace('_', ' ', $k) . ': ' . $v;
            }
            $parts[] = 'Use these exact figures for any headline question (how many students/subjects/sections/instructors) — never estimate or say to go check a report when the number is already listed here.';
        }
        // A specific named student ("how is Juan Dela Cruz doing?") isn't
        // covered by the aggregate/struggling-only blocks below — try a
        // direct roster match whenever the question is performance-shaped.
        if (assistantWantsPerformanceReport($message) || assistantWantsStrugglingStudents($message)) {
            $individual = loadIndividualStudentForAssistant($role, $userId, $message);
            if ($individual) {
                $parts[] = "INDIVIDUAL STUDENT DATA (real, current — matched from your message to an enrolled student):";
                $parts[] = "{$individual['name']} ({$individual['student_id']}):";
                if ($individual['subjects']) {
                    foreach ($individual['subjects'] as $s) {
                        $scoreTxt = $s['score'] !== null ? "{$s['score']}% ({$s['source']})" : $s['source'];
                        $parts[] = "- {$s['subject_code']}: {$scoreTxt}, {$s['absences']} absence(s)";
                    }
                } else {
                    $parts[] = '- No subjects found in your scope for this student.';
                }
                $parts[] = 'Use this real data to answer questions about this specific student. Do not invent scores not listed here.';
            }
        }
        if (assistantWantsAttendance($message)) {
            $attendance = loadAttendanceForAssistant($role, $userId);
            if ($attendance) {
                if ($attendance['students']) {
                    $parts[] = 'ATTENDANCE DATA (real, current — from Global Gradebook SOC 1/2 marks, most absences first):';
                    foreach ($attendance['students'] as $s) {
                        $parts[] = "- {$s['name']} ({$s['student_id']}), {$s['subject_code']}: {$s['absences']} absence(s) recorded";
                    }
                } else {
                    $parts[] = 'ATTENDANCE DATA: no absences recorded in scope (or attendance has not been marked yet for these classes).';
                }
                $parts[] = 'Use this real data for attendance/absence questions. Do not invent names or counts not listed here.';
            } else {
                $parts[] = 'No attendance data is available for this scope — this LMS only tracks attendance via the Global Gradebook SOC 1/2 marks per module, and none may exist yet for these classes.';
            }
        }
        if (assistantWantsStrugglingStudents($message)) {
            $struggling = loadStrugglingStudentsForAssistant($role, $userId);
            if ($struggling) {
                $parts[] = "STRUGGLING STUDENTS DATA (real, current — {$struggling['total_flagged']} of {$struggling['total_enrolled']} enrollments flagged at_risk/critical):";
                if ($struggling['students']) {
                    foreach ($struggling['students'] as $s) {
                        $parts[] = "- {$s['name']} ({$s['student_id']}), {$s['subject_code']}"
                            . ($s['section'] ? " / {$s['section']}" : '')
                            . ": {$s['score']}% — {$s['status']}";
                    }
                } else {
                    $parts[] = 'No students currently flagged at_risk or critical in scope.';
                }
                $parts[] = 'Use this real data to answer questions about struggling/at-risk/failing students. Do not invent names or scores not listed here. If asked for more detail than is listed, say the full breakdown is in the Reports > Struggling Students page.';
            }
        }
        if (assistantWantsPerformanceReport($message)) {
            $perf = loadPerformanceReportForAssistant($role, $userId);
            if ($perf) {
                $parts[] = "PERFORMANCE REPORT DATA (real, current — scope: {$perf['scope']}):";
                $parts[] = "Instructors: " . ($perf['instructors'] ?? '—') . ", Students: {$perf['students']}, Quizzes: {$perf['quizzes']}, "
                    . "Average score: {$perf['avg_score']}%, Passed: {$perf['passed']}, Failed: {$perf['failed']}.";
                if (!empty($perf['weakest_subjects'])) {
                    $parts[] = 'Weakest-performing subjects (lowest average score first):';
                    foreach ($perf['weakest_subjects'] as $w) {
                        $parts[] = "- {$w['subject_code']} ({$w['subject_name']}): {$w['avg_score']}% avg over {$w['attempts']} attempts";
                    }
                }
                $parts[] = 'Use this real data to answer questions about reports, performance, or statistics. Do not invent numbers not listed here.';
            }
        }
    }

    $page = trim((string)($context['page'] ?? ''));
    if ($page !== '') {
        $parts[] = "Current LMS page context: {$page}.";
    }

    $subjectName = trim((string)($context['subject_name'] ?? ''));
    $subjectCode = trim((string)($context['subject_code'] ?? ''));
    if ($subjectName !== '') {
        $parts[] = 'Subject: ' . ($subjectCode ? "{$subjectCode} — {$subjectName}" : $subjectName) . '.';
    }

    $workTitle = trim((string)($context['work_title'] ?? ''));
    if ($workTitle !== '') {
        $parts[] = "Assignment / activity title: \"{$workTitle}\".";
    }

    $lessonId = (int)($context['lessons_id'] ?? 0);
    if ($lessonId > 0) {
        $lesson = loadLessonContextForAssistant($lessonId, $userId);
        if ($lesson) {
            $order = $lesson['lesson_order'] > 0 ? " (Lesson #{$lesson['lesson_order']})" : '';
            $parts[] = "The student is studying{$order}: \"{$lesson['lesson_title']}\".";
            if ($lesson['description'] !== '') {
                $parts[] = "Lesson overview: {$lesson['description']}";
            }
            if ($lesson['objectives'] !== '') {
                $parts[] = "Learning objectives: {$lesson['objectives']}";
            }
            if ($lesson['content'] !== '') {
                $parts[] = "FULL LESSON CONTENT (base your explanations on this — do not invent facts not supported here):\n---\n{$lesson['content']}\n---";
            }
            if (!empty($lesson['materials'])) {
                $names = array_filter(array_column($lesson['materials'], 'name'));
                if ($names) {
                    $parts[] = 'Attached materials: ' . implode(', ', array_slice($names, 0, 10)) . '.';
                }
            }
            $parts[] = 'When the student asks to explain or summarize this lesson, use the lesson content above. Be accurate and educational.';
        }
    }

    $quizId = (int)($context['quiz_id'] ?? 0);
    if ($quizId > 0 && $lessonId <= 0) {
        $quiz = loadQuizContextForAssistant($quizId, $userId);
        if ($quiz) {
            $parts[] = "The student is viewing quiz/assessment: \"{$quiz['quiz_title']}\".";
            if ($quiz['quiz_description'] !== '') {
                $parts[] = "Quiz description: {$quiz['quiz_description']}";
            }
            if ($role === 'student') {
                $parts[] = 'Do NOT provide direct answers to active quiz questions. Help with concepts and study strategies only.';
            }
        }
    }

    $highlight = trim((string)($context['highlighted_text'] ?? ''));
    if ($highlight !== '') {
        $highlight = truncateAssistantText($highlight, 1500);
        $parts[] = "The student HIGHLIGHTED this passage from the lesson and may ask about it:\n\"{$highlight}\"\nExplain this passage clearly using the lesson content.";
    }

    if (empty($parts)) {
        return '';
    }

    return "\n\n--- STUDENT CONTEXT (use this to personalize your answer) ---\n"
        . implode("\n", $parts)
        . "\n--- END CONTEXT ---\n"
        . 'Prioritize factual accuracy from the lesson content. If unsure, say what the lesson states and suggest asking the instructor.';
}
