<?php
/**
 * CIT-LMS Enrollment API
 * Student enrollment via subject code + section
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'enroll':      enrollByCode();   break;
    case 'preview':     previewCode();    break;
    case 'my-subjects': getMySubjects();  break;
    case 'drop':        dropSubject();    break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function normalizeSubjectCode($code) {
    return strtoupper(trim(preg_replace('/\s+/', '', (string)$code)));
}

function getStudentProgramId($userId) {
    $student = db()->fetchOne('SELECT program_id FROM users WHERE users_id = ?', [$userId]);
    return $student['program_id'] ?? null;
}

function getActiveSemesterId() {
    $semRow = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
    return $semRow ? (int)$semRow['semester_id'] : 0;
}

function subjectCodeSqlMatch() {
    return "REPLACE(UPPER(TRIM(s.subject_code)), ' ', '')";
}

function findSubjectSectionMatches($subjectCode, $sectionId, $userId, $requireActiveSemester = true) {
    $subjectCode = normalizeSubjectCode($subjectCode);
    if ($subjectCode === '') {
        return [];
    }

    $studentProgramId = getStudentProgramId($userId);
    $semId = $requireActiveSemester ? getActiveSemesterId() : 0;

    $matches = querySubjectSectionMatches($subjectCode, $sectionId, $semId);

    // If active-semester filter is too strict, retry across open offerings
    if (empty($matches) && $requireActiveSemester && getActiveSemesterId() > 0) {
        $matches = querySubjectSectionMatches($subjectCode, $sectionId, 0);
    }

    if ($studentProgramId) {
        $matches = array_values(array_filter($matches, static function ($row) use ($studentProgramId) {
            $sectionOk = empty($row['program_id']) || (int)$row['program_id'] === (int)$studentProgramId;
            $subjectOk = empty($row['subject_program_id']) || (int)$row['subject_program_id'] === (int)$studentProgramId;
            return $sectionOk || $subjectOk;
        }));
    }

    return $matches;
}

function querySubjectSectionMatches($subjectCode, $sectionId, $semId) {
    $sql = "
        SELECT sec.section_id, sec.section_name, sec.max_students, sec.program_id,
               ss.subject_offered_id, ss.schedule, ss.room,
               s.subject_id, s.subject_code, s.subject_name, s.units, s.program_id AS subject_program_id,
               CONCAT(u.first_name, ' ', u.last_name) AS instructor_name,
               (SELECT COUNT(DISTINCT st.user_student_id)
                FROM student_subject st
                WHERE st.section_id = sec.section_id AND st.status = 'enrolled') AS current_enrollment
        FROM section_subject ss
        JOIN section sec ON sec.section_id = ss.section_id
        JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
        JOIN subject s ON s.subject_id = so.subject_id
        LEFT JOIN users u ON u.users_id = so.user_teacher_id
        WHERE " . subjectCodeSqlMatch() . " = ?
          AND sec.status = 'active'
          AND ss.status = 'active'
          AND so.status = 'open'
    ";
    $params = [$subjectCode];

    if ($semId > 0) {
        $sql .= ' AND so.semester_id = ?';
        $params[] = $semId;
    }
    if ($sectionId > 0) {
        $sql .= ' AND sec.section_id = ?';
        $params[] = $sectionId;
    }

    $sql .= ' ORDER BY sec.section_name, (so.user_teacher_id IS NOT NULL) DESC';

    return db()->fetchAll($sql, $params);
}

function isSubjectAlreadyEnrolled($userId, $subjectId) {
    return (bool)db()->fetchOne(
        "SELECT 1 FROM student_subject ss2
         JOIN subject_offered so2 ON so2.subject_offered_id = ss2.subject_offered_id
         WHERE ss2.user_student_id = ? AND so2.subject_id = ? AND ss2.status = 'enrolled'",
        [$userId, $subjectId]
    );
}

function buildSubjectPreviewPayload($userId, $match) {
    $already = isSubjectAlreadyEnrolled($userId, $match['subject_id']);
    $spots = $match['max_students'] > 0
        ? max(0, $match['max_students'] - $match['current_enrollment'])
        : PHP_INT_MAX;

    $subject = [
        'subject_offered_id' => $match['subject_offered_id'],
        'subject_id'         => $match['subject_id'],
        'subject_code'       => $match['subject_code'],
        'subject_name'       => $match['subject_name'],
        'units'              => $match['units'],
        'instructor_name'    => $match['instructor_name'],
        'schedule'           => $match['schedule'],
        'room'               => $match['room'],
        'already_enrolled'   => $already,
    ];

    return [
        'section_id'         => $match['section_id'],
        'section_name'       => $match['section_name'],
        'subject_code'       => $match['subject_code'],
        'subject_name'       => $match['subject_name'],
        'max_students'       => $match['max_students'],
        'current_enrollment' => $match['current_enrollment'],
        'spots_left'         => $spots === PHP_INT_MAX ? null : $spots,
        'subjects'           => [$subject],
        'new_count'          => $already ? 0 : 1,
    ];
}

// ─── Preview ────────────────────────────────────────────────────────────────

function previewCode() {
    $input  = json_decode(file_get_contents('php://input'), true) ?: [];
    $userId = Auth::id();

    $subjectCode = normalizeSubjectCode($input['subject_code'] ?? '');
    $sectionId   = (int)($input['section_id'] ?? 0);

    if ($subjectCode !== '') {
        previewBySubjectCode($userId, $subjectCode, $sectionId);
        return;
    }

    // Legacy: enrollment_code still supported
    $legacy = strtoupper(trim($input['enrollment_code'] ?? ''));
    if ($legacy !== '' && preg_match('/^[A-Z0-9]{3}-[A-Z0-9]{4}$/', $legacy)) {
        previewByEnrollmentCode($userId, $legacy);
        return;
    }

    echo json_encode(['success' => false, 'message' => 'Enter a subject code (e.g. IT101)']);
}

function previewBySubjectCode($userId, $subjectCode, $sectionId) {
    $matches = findSubjectSectionMatches($subjectCode, $sectionId, $userId);

    if (empty($matches)) {
        echo json_encode([
            'success' => false,
            'message' => 'No class found for subject code "' . $subjectCode . '". Use the exact code from your instructor (e.g. IT 202 or IT202).',
        ]);
        return;
    }

    if ($sectionId <= 0 && count($matches) > 1) {
        echo json_encode([
            'success' => true,
            'data' => [
                'needs_section' => true,
                'subject_code'  => $subjectCode,
                'sections'      => array_map(static function ($m) {
                    return [
                        'section_id'         => $m['section_id'],
                        'section_name'       => $m['section_name'],
                        'schedule'           => $m['schedule'],
                        'room'               => $m['room'],
                        'instructor_name'    => $m['instructor_name'],
                        'current_enrollment' => $m['current_enrollment'],
                        'max_students'       => $m['max_students'],
                    ];
                }, $matches),
            ],
        ]);
        return;
    }

    echo json_encode([
        'success' => true,
        'data'    => buildSubjectPreviewPayload($userId, $matches[0]),
    ]);
}

function previewByEnrollmentCode($userId, $code) {
    $section = db()->fetchOne(
        "SELECT section_id, section_name, max_students, program_id,
                (SELECT COUNT(DISTINCT user_student_id) FROM student_subject
                 WHERE section_id = section.section_id AND status = 'enrolled') AS current_enrollment
         FROM section WHERE enrollment_code = ? AND status = 'active'",
        [$code]
    );

    if (!$section) {
        echo json_encode(['success' => false, 'message' => 'Invalid or inactive enrollment code']);
        return;
    }

    if ($section['program_id']) {
        $studentProgramId = getStudentProgramId($userId);
        if ($studentProgramId && (int)$section['program_id'] !== (int)$studentProgramId) {
            echo json_encode(['success' => false, 'message' => 'This class is for a different program.']);
            return;
        }
    }

    $rawSubjects = db()->fetchAll(
        "SELECT ss.subject_offered_id, ss.schedule, ss.room,
                s.subject_id, s.subject_code, s.subject_name, s.units,
                CONCAT(u.first_name, ' ', u.last_name) AS instructor_name
         FROM section_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN users u ON u.users_id = so.user_teacher_id
         WHERE ss.section_id = ? AND ss.status = 'active'
         ORDER BY s.subject_code, (so.user_teacher_id IS NOT NULL) DESC",
        [$section['section_id']]
    );

    $seen = [];
    $subjects = [];
    foreach ($rawSubjects as $row) {
        if (!isset($seen[$row['subject_id']])) {
            $seen[$row['subject_id']] = true;
            $subjects[] = $row;
        }
    }

    $newCount = 0;
    foreach ($subjects as &$subj) {
        $subj['already_enrolled'] = isSubjectAlreadyEnrolled($userId, $subj['subject_id']);
        if (!$subj['already_enrolled']) {
            $newCount++;
        }
    }
    unset($subj);

    echo json_encode([
        'success' => true,
        'data' => [
            'section_id'         => $section['section_id'],
            'section_name'       => $section['section_name'],
            'subject_code'       => $subjects[0]['subject_code'] ?? '',
            'enrollment_code'    => $code,
            'max_students'       => $section['max_students'],
            'current_enrollment' => $section['current_enrollment'],
            'subjects'           => $subjects,
            'new_count'          => $newCount,
        ],
    ]);
}

// ─── Enroll ─────────────────────────────────────────────────────────────────

function enrollByCode() {
    $input  = json_decode(file_get_contents('php://input'), true) ?: [];
    $userId = Auth::id();

    $subjectCode = normalizeSubjectCode($input['subject_code'] ?? '');
    $sectionId   = (int)($input['section_id'] ?? 0);

    if ($subjectCode !== '') {
        enrollBySubjectCode($userId, $subjectCode, $sectionId);
        return;
    }

    $legacy = strtoupper(trim($input['enrollment_code'] ?? ''));
    if ($legacy !== '' && preg_match('/^[A-Z0-9]{3}-[A-Z0-9]{4}$/', $legacy)) {
        enrollByLegacyCode($userId, $legacy);
        return;
    }

    echo json_encode(['success' => false, 'message' => 'Subject code is required']);
}

function enrollBySubjectCode($userId, $subjectCode, $sectionId) {
    if ($sectionId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Please select a section for this subject.']);
        return;
    }

    $matches = findSubjectSectionMatches($subjectCode, $sectionId, $userId);
    if (empty($matches)) {
        echo json_encode(['success' => false, 'message' => 'Subject not found in this section.']);
        return;
    }

    $match = $matches[0];

    if ($match['program_id'] || !empty($match['subject_program_id'])) {
        $studentProgramId = getStudentProgramId($userId);
        if ($studentProgramId) {
            $sectionOk = empty($match['program_id']) || (int)$match['program_id'] === (int)$studentProgramId;
            $subjectOk = empty($match['subject_program_id']) || (int)$match['subject_program_id'] === (int)$studentProgramId;
            if (!$sectionOk && !$subjectOk) {
                echo json_encode(['success' => false, 'message' => 'This class is for a different program.']);
                return;
            }
        }
    }

    if ($match['max_students'] > 0 && $match['current_enrollment'] >= $match['max_students']) {
        echo json_encode(['success' => false, 'message' => 'This section is full.']);
        return;
    }

    if (isSubjectAlreadyEnrolled($userId, $match['subject_id'])) {
        echo json_encode(['success' => false, 'message' => 'You are already enrolled in ' . $match['subject_code'] . '.']);
        return;
    }

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $pdo->prepare(
            "INSERT INTO student_subject (user_student_id, subject_offered_id, section_id, status, enrollment_date)
             VALUES (?, ?, ?, 'enrolled', NOW())"
        )->execute([$userId, $match['subject_offered_id'], $match['section_id']]);

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Joined ' . $match['subject_code'] . ' — ' . $match['section_name'] . '.',
            'enrolled' => 1,
            'section_id' => $match['section_id'],
            'subject_id' => $match['subject_id'],
        ]);
    } catch (PDOException $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Enrollment error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Enrollment failed. Please try again.']);
    }
}

function enrollByLegacyCode($userId, $code) {
    $pdo = null;
    try {
        $section = db()->fetchOne(
            "SELECT section_id, section_name, max_students, program_id,
                    (SELECT COUNT(DISTINCT user_student_id) FROM student_subject
                     WHERE section_id = section.section_id AND status = 'enrolled') AS current_enrollment
             FROM section WHERE enrollment_code = ? AND status = 'active'",
            [$code]
        );

        if (!$section) {
            echo json_encode(['success' => false, 'message' => 'Invalid enrollment code']);
            return;
        }

        if ($section['program_id']) {
            $studentProgramId = getStudentProgramId($userId);
            if ($studentProgramId && (int)$section['program_id'] !== (int)$studentProgramId) {
                echo json_encode(['success' => false, 'message' => 'This enrollment code is for a different program.']);
                return;
            }
        }

        if ($section['max_students'] > 0 && $section['current_enrollment'] >= $section['max_students']) {
            echo json_encode(['success' => false, 'message' => 'Section is full']);
            return;
        }

        $rawSubjects = db()->fetchAll(
            "SELECT ss.subject_offered_id, so.subject_id, s.subject_code
             FROM section_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject s ON s.subject_id = so.subject_id
             WHERE ss.section_id = ? AND ss.status = 'active'
             ORDER BY (so.user_teacher_id IS NOT NULL) DESC",
            [$section['section_id']]
        );

        $seen = [];
        $subjects = [];
        foreach ($rawSubjects as $row) {
            if (!isset($seen[$row['subject_id']])) {
                $seen[$row['subject_id']] = true;
                $subjects[] = $row;
            }
        }

        if (empty($subjects)) {
            echo json_encode(['success' => false, 'message' => 'This section has no subjects yet.']);
            return;
        }

        $pdo = pdo();
        $pdo->beginTransaction();

        $enrolled = 0;
        $skipped  = 0;

        foreach ($subjects as $subj) {
            if (isSubjectAlreadyEnrolled($userId, $subj['subject_id'])) {
                $skipped++;
                continue;
            }

            $pdo->prepare(
                "INSERT INTO student_subject (user_student_id, subject_offered_id, section_id, status, enrollment_date)
                 VALUES (?, ?, ?, 'enrolled', NOW())"
            )->execute([$userId, $subj['subject_offered_id'], $section['section_id']]);
            $enrolled++;
        }

        if ($enrolled === 0) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'You are already enrolled in all subjects of this section.']);
            return;
        }

        $pdo->commit();

        $msg = $skipped > 0
            ? "Added {$enrolled} new subject" . ($enrolled !== 1 ? 's' : '') . ' to your enrollment.'
            : "Enrolled in {$section['section_name']} — {$enrolled} subject" . ($enrolled !== 1 ? 's' : '') . '.';

        echo json_encode(['success' => true, 'message' => $msg, 'enrolled' => $enrolled]);
    } catch (PDOException $e) {
        if ($pdo && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Enrollment error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Enrollment failed. Please try again.']);
    }
}

function getMySubjects() {
    $userId = Auth::id();

    try {
        $subjects = db()->fetchAll(
            "SELECT ss.student_subject_id, ss.subject_offered_id, ss.section_id, ss.enrollment_date, ss.status,
                s.subject_id, s.subject_code, s.subject_name, s.units,
                sec.section_name, sec.enrollment_code,
                secsubj.schedule, secsubj.room,
                CONCAT(u2.first_name, ' ', u2.last_name) AS instructor_name,
                (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id AND l.status = 'published') as total_lessons,
                (SELECT COUNT(*) FROM student_progress sp JOIN lessons l2 ON sp.lessons_id = l2.lessons_id
                 WHERE sp.user_student_id = ? AND l2.subject_id = s.subject_id AND sp.status = 'completed') as completed_lessons,
                (SELECT COUNT(*) FROM quiz q WHERE q.subject_id = s.subject_id AND q.status = 'published') as total_quizzes,
                (SELECT COUNT(DISTINCT sqa.quiz_id) FROM student_quiz_attempts sqa
                 JOIN quiz q2 ON sqa.quiz_id = q2.quiz_id
                 WHERE sqa.user_student_id = ? AND q2.subject_id = s.subject_id AND sqa.passed = 1 AND sqa.status = 'completed') as completed_quizzes
             FROM student_subject ss
             JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
             JOIN subject s ON so.subject_id = s.subject_id
             LEFT JOIN users u2 ON u2.users_id = so.user_teacher_id
             LEFT JOIN section sec ON ss.section_id = sec.section_id
             LEFT JOIN section_subject secsubj ON secsubj.section_id = ss.section_id
                                              AND secsubj.subject_offered_id = ss.subject_offered_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
             ORDER BY s.subject_code",
            [$userId, $userId, $userId]
        );

        foreach ($subjects as &$s) {
            $s['progress'] = $s['total_lessons'] > 0 ? round(($s['completed_lessons'] / $s['total_lessons']) * 100) : 0;
        }

        echo json_encode(['success' => true, 'data' => $subjects]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function dropSubject() {
    $input = json_decode(file_get_contents('php://input'), true);
    $ssId = (int)($input['student_subject_id'] ?? 0);
    $userId = Auth::id();

    if (!$ssId) {
        echo json_encode(['success' => false, 'message' => 'Subject enrollment ID required']);
        return;
    }

    try {
        $record = db()->fetchOne(
            "SELECT section_id FROM student_subject WHERE student_subject_id = ? AND user_student_id = ?",
            [$ssId, $userId]
        );
        if (!$record) {
            echo json_encode(['success' => false, 'message' => 'Enrollment not found']);
            return;
        }

        $stmt = pdo()->prepare("UPDATE student_subject SET status = 'dropped' WHERE student_subject_id = ? AND user_student_id = ?");
        $stmt->execute([$ssId, $userId]);

        echo json_encode(['success' => true, 'message' => 'Subject dropped']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to drop subject']);
    }
}
