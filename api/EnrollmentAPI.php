<?php
/**
 * CIT-LMS Enrollment API
 * Student enrollment via subject code + section
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ClassCodeHelper.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// RBAC: every action here is self-service (scoped to Auth::id(), never an
// arbitrary target user) — enroll/preview/my-subjects/drop all just need
// enrollment.view, which every role holds by default.
if (!Auth::can('enrollment.view')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permission denied: enrollment.view']);
    exit;
}

switch ($action) {
    case 'enroll':          enrollByCode();      break;
    case 'preview':         previewCode();       break;
    case 'my-subjects':     getMySubjects();     break;
    case 'drop':            dropSubject();       break;
    case 'my-pending':      getMyPendingJoins(); break;
    case 'cancel-pending':  cancelPendingJoin(); break;
    case 'version':         getEnrollmentVersion(); break;
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
    if ($legacy !== '' && preg_match('/^([A-Z0-9]{8}|[A-Z0-9]{3}-[A-Z0-9]{4})$/', $legacy)) {
        $subjectIdHint = (int)($input['subject_id'] ?? 0);
        previewByEnrollmentCode($userId, $legacy, $subjectIdHint);
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

function previewByEnrollmentCode($userId, $code, $subjectId = 0) {
    // The code itself is unique per (section, subject) pairing now — resolve
    // that FIRST, which is inherently unambiguous. Only a code minted before
    // this existed falls through to the legacy section-wide lookup below.
    $resolved = resolveClassCode($code);
    if (!$resolved) {
        echo json_encode(['success' => false, 'message' => 'Invalid or inactive enrollment code']);
        return;
    }
    if ($resolved['type'] === 'subject' && $resolved['subject_offered_id']) {
        $offering = db()->fetchOne("SELECT subject_id FROM subject_offered WHERE subject_offered_id = ?", [$resolved['subject_offered_id']]);
        $subjectId = $offering ? (int)$offering['subject_id'] : 0;
    }

    $section = db()->fetchOne(
        "SELECT section_id, section_name, max_students, program_id,
                (SELECT COUNT(DISTINCT user_student_id) FROM student_subject
                 WHERE section_id = section.section_id AND status = 'enrolled') AS current_enrollment
         FROM section WHERE section_id = ? AND status = 'active'",
        [$resolved['section_id']]
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

    // A LEGACY section-wide code (resolveClassCode() found no per-subject
    // match) otherwise joins EVERY subject taught to that section at once.
    // $subjectId here is either the ONE subject the new per-subject code
    // resolved to, or — for an old code paired with a subject_id hint from
    // before this fix existed — still scopes down to just that subject.
    $subjectFilter = $subjectId ? 'AND s.subject_id = ?' : '';
    $subjectParams = $subjectId ? [$section['section_id'], $subjectId] : [$section['section_id']];
    $rawSubjects = db()->fetchAll(
        "SELECT ss.subject_offered_id, ss.schedule, ss.room,
                s.subject_id, s.subject_code, s.subject_name, s.units,
                CONCAT(u.first_name, ' ', u.last_name) AS instructor_name
         FROM section_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN users u ON u.users_id = so.user_teacher_id
         WHERE ss.section_id = ? AND ss.status = 'active' {$subjectFilter}
         ORDER BY s.subject_code, (so.user_teacher_id IS NOT NULL) DESC",
        $subjectParams
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
    if ($legacy !== '' && preg_match('/^([A-Z0-9]{8}|[A-Z0-9]{3}-[A-Z0-9]{4})$/', $legacy)) {
        $subjectIdHint = (int)($input['subject_id'] ?? 0);
        enrollByLegacyCode($userId, $legacy, $subjectIdHint);
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

    if (hasPendingJoinRequest($userId, $match['subject_id'], $match['section_id'])) {
        echo json_encode(['success' => false, 'message' => 'You already requested to join ' . $match['subject_code'] . ' — waiting for the instructor to approve.']);
        return;
    }

    // Joining by QR/code no longer enrolls immediately — it creates a
    // pending request the instructor must approve first (see
    // handlePendingJoins/handleApproveJoin/handleRejectJoin in
    // SectionsAPI.php). Nothing is written to student_subject here at all,
    // so this request is invisible to every existing roster/gradebook query
    // until an instructor actually approves it.
    try {
        pdo()->prepare(
            "INSERT INTO class_join_requests (user_student_id, subject_id, section_id, subject_offered_id, status, requested_at)
             VALUES (?, ?, ?, ?, 'pending', NOW())"
        )->execute([$userId, $match['subject_id'], $match['section_id'], $match['subject_offered_id']]);

        echo json_encode([
            'success' => true,
            'message' => 'Requested to join ' . $match['subject_code'] . ' — ' . $match['section_name'] . '. Waiting for the instructor to approve.',
            'pending' => 1,
            'section_id' => $match['section_id'],
            'subject_id' => $match['subject_id'],
        ]);
    } catch (PDOException $e) {
        error_log('Join request error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Could not send join request. Please try again.']);
    }
}

/** True if this student already has an undecided request for this exact subject+section. */
function hasPendingJoinRequest($userId, $subjectId, $sectionId): bool {
    return (bool)db()->fetchOne(
        "SELECT 1 FROM class_join_requests
         WHERE user_student_id = ? AND subject_id = ? AND section_id = ? AND status = 'pending'",
        [$userId, $subjectId, $sectionId]
    );
}

/** GET ?action=my-pending — the student's own still-undecided join requests, so "My Subjects" can show a waiting state instead of the request silently vanishing after the one-time toast. */
function getMyPendingJoins() {
    $userId = Auth::id();
    $rows = db()->fetchAll(
        "SELECT r.request_id, r.requested_at, s.subject_code, s.subject_name, sec.section_name
         FROM class_join_requests r
         JOIN subject s ON s.subject_id = r.subject_id
         JOIN section sec ON sec.section_id = r.section_id
         WHERE r.user_student_id = ? AND r.status = 'pending'
         ORDER BY r.requested_at DESC",
        [$userId]
    );
    echo json_encode(['success' => true, 'data' => $rows]);
}

/** POST ?action=cancel-pending {request_id} — student withdraws their own not-yet-decided request. */
function cancelPendingJoin() {
    $userId = Auth::id();
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $requestId = (int)($data['request_id'] ?? 0);
    if (!$requestId) { echo json_encode(['success' => false, 'message' => 'request_id required']); return; }

    $req = db()->fetchOne(
        "SELECT request_id FROM class_join_requests WHERE request_id = ? AND user_student_id = ? AND status = 'pending'",
        [$requestId, $userId]
    );
    if (!$req) { echo json_encode(['success' => false, 'message' => 'Request not found or already decided']); return; }

    // Deleted rather than marked — the student withdrew it themselves, there's
    // nothing an instructor needs to see or act on for this one anymore.
    pdo()->prepare("DELETE FROM class_join_requests WHERE request_id = ?")->execute([$requestId]);
    echo json_encode(['success' => true, 'message' => 'Join request cancelled']);
}

function enrollByLegacyCode($userId, $code, $subjectId = 0) {
    $pdo = null;
    try {
        // Same resolution order as previewByEnrollmentCode(): the unique
        // per-subject code first (unambiguous by construction), the old
        // section-wide code only as a fallback for codes minted before it.
        $resolved = resolveClassCode($code);
        if (!$resolved) {
            echo json_encode(['success' => false, 'message' => 'Invalid enrollment code']);
            return;
        }
        if ($resolved['type'] === 'subject' && $resolved['subject_offered_id']) {
            $offering = db()->fetchOne("SELECT subject_id FROM subject_offered WHERE subject_offered_id = ?", [$resolved['subject_offered_id']]);
            $subjectId = $offering ? (int)$offering['subject_id'] : 0;
        }

        $section = db()->fetchOne(
            "SELECT section_id, section_name, max_students, program_id,
                    (SELECT COUNT(DISTINCT user_student_id) FROM student_subject
                     WHERE section_id = section.section_id AND status = 'enrolled') AS current_enrollment
             FROM section WHERE section_id = ? AND status = 'active'",
            [$resolved['section_id']]
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

        // See the matching comment in previewByEnrollmentCode() — scope to one
        // subject when we know which subject's own QR this code came from,
        // instead of requesting every subject taught to the section at once.
        $subjectFilter = $subjectId ? 'AND s.subject_id = ?' : '';
        $subjectParams = $subjectId ? [$section['section_id'], $subjectId] : [$section['section_id']];
        $rawSubjects = db()->fetchAll(
            "SELECT ss.subject_offered_id, so.subject_id, s.subject_code
             FROM section_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject s ON s.subject_id = so.subject_id
             WHERE ss.section_id = ? AND ss.status = 'active' {$subjectFilter}
             ORDER BY (so.user_teacher_id IS NOT NULL) DESC",
            $subjectParams
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

        // Same approval gate as enrollBySubjectCode() — a request per
        // not-yet-enrolled, not-already-pending subject in this section,
        // nothing written to student_subject until an instructor approves.
        $requested = 0;
        $skipped   = 0;

        foreach ($subjects as $subj) {
            if (isSubjectAlreadyEnrolled($userId, $subj['subject_id'])
                || hasPendingJoinRequest($userId, $subj['subject_id'], $section['section_id'])) {
                $skipped++;
                continue;
            }

            $pdo->prepare(
                "INSERT INTO class_join_requests (user_student_id, subject_id, section_id, subject_offered_id, status, requested_at)
                 VALUES (?, ?, ?, ?, 'pending', NOW())"
            )->execute([$userId, $subj['subject_id'], $section['section_id'], $subj['subject_offered_id']]);
            $requested++;
        }

        if ($requested === 0) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'You already have a request or enrollment for every subject in this section.']);
            return;
        }

        $pdo->commit();

        $msg = $skipped > 0
            ? "Requested {$requested} new subject" . ($requested !== 1 ? 's' : '') . ' — waiting for instructor approval.'
            : "Requested to join {$section['section_name']} — {$requested} subject" . ($requested !== 1 ? 's' : '') . '. Waiting for instructor approval.';

        echo json_encode(['success' => true, 'message' => $msg, 'pending' => $requested]);
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
                p.program_code,
                so.status AS offering_status,
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
             LEFT JOIN program p ON p.program_id = s.program_id
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


/**
 * Fingerprint of everything the student's My Subjects screen shows, so the
 * open page can notice a change instead of sitting stale until a reload.
 *
 * The case that made this necessary: an instructor approves a join request,
 * but the student's screen keeps showing "Waiting for instructor approval"
 * until they hard-refresh. The approval only ever changed a row in
 * class_join_requests, and nothing told the already-rendered page.
 *
 * Scoped to the signed-in student, so it stays a couple of indexed lookups
 * no matter how large the tables get.
 *
 * GET ?action=version
 */
function getEnrollmentVersion(): void
{
    $studentId = (int)Auth::id();
    if ($studentId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Not signed in']);
        return;
    }

    $parts = [];
    $stamp = function (string $sql, array $args) use (&$parts) {
        try {
            $r = db()->fetchOne($sql, $args);
            $parts[] = ($r['n'] ?? 0) . ':' . ($r['t'] ?? '0');
        } catch (Throwable $e) {
            $parts[] = '0:0';
        }
    };

    // Join requests: status flipping pending -> approved/rejected is exactly
    // the event that was being missed. decided_at moves when it happens.
    $stamp("SELECT COUNT(*) n,
                   CONCAT(MAX(COALESCE(decided_at, requested_at)), '/', GROUP_CONCAT(status ORDER BY request_id)) t
              FROM class_join_requests WHERE user_student_id = ?", [$studentId]);

    // Enrolments themselves - approval creates one, a drop removes one.
    $stamp("SELECT COUNT(*) n, MAX(COALESCE(updated_at, enrollment_date)) t
              FROM student_subject WHERE user_student_id = ?", [$studentId]);

    // Announcements the card previews.
    $stamp("SELECT COUNT(*) n, MAX(COALESCE(a.updated_at, a.created_at)) t
              FROM announcement a
              JOIN student_subject ss ON ss.user_student_id = ?
             WHERE a.is_published = 1
               AND (a.subject_offered_id IS NULL OR a.subject_offered_id = ss.subject_offered_id)", [$studentId]);

    echo json_encode(['success' => true, 'data' => [
        'version' => substr(sha1(implode('|', $parts)), 0, 16),
    ]]);
}
