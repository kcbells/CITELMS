<?php
/**
 * Archive API — read-only access to semesters closed by the archiver.
 *
 * Phase 1 (helpers/SemesterArchiveHelper.php) captures a semester when the
 * admin switches which one is active. This is the reading side of that: dean
 * and program head browse past semesters, the subjects that ran in them, and
 * the lesson materials / quizzes / announcements captured at the time.
 *
 * Scoping — a dean sees the programs in their department, a program head sees
 * only their own program. Both are applied in SQL, never in the UI.
 *
 * Everything here is read-only. Nothing in this file writes to the archive or
 * restores anything back into a live subject.
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ScopeHelper.php';
require_once __DIR__ . '/helpers/SemesterArchiveHelper.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$role = Auth::role();
if (!in_array($role, ['dean', 'program_head', 'admin'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied']);
    exit;
}

ensureSemesterArchiveTables();

switch ($_GET['action'] ?? '') {
    case 'semesters': handleSemesters(); break;
    case 'subjects':  handleSubjects();  break;
    case 'subject':   handleSubject();   break;
    case 'archived-subjects': handleArchivedSubjects(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * The program ids this user may see, or null for "everything" (admin).
 * An empty array means the account has no program/department attached — it
 * sees nothing rather than everything, which is the safe way to fail.
 *
 * @return int[]|null
 */
function archiveProgramScope(): ?array
{
    $role = Auth::role();
    if ($role === 'admin') return null;
    if ($role === 'dean') return array_map('intval', deanProgramIds());
    $scope = programHeadScope();
    return $scope['program_id'] ? [(int)$scope['program_id']] : [];
}

/** Builds the "subject belongs to my scope" SQL fragment + params. */
function archiveScopeClause(?array $programIds, string $subjectAlias = 's'): array
{
    if ($programIds === null) return ['', []];
    if (!$programIds) return [' AND 1 = 0', []]; // no scope -> nothing
    $ph = implode(',', array_fill(0, count($programIds), '?'));
    return [" AND {$subjectAlias}.program_id IN ($ph)", $programIds];
}

/** GET ?action=semesters — archived semesters that contain anything this user may see. */
function handleSemesters(): void
{
    $programIds = archiveProgramScope();
    [$clause, $params] = archiveScopeClause($programIds);

    // Counted per-semester through the subjects in scope, so a dean never sees
    // a semester whose content belongs entirely to another department.
    $rows = db()->fetchAll(
        "SELECT a.archive_id, a.semester_id, a.archived_at, a.grades_locked,
                sem.semester_name, sem.academic_year, sem.start_date, sem.end_date,
                (SELECT COUNT(DISTINCT d.subject_id)
                   FROM archived_module_documents d
                   JOIN subject s ON s.subject_id = d.subject_id
                  WHERE d.archive_id = a.archive_id $clause) AS subject_count,
                (SELECT COUNT(*)
                   FROM archived_module_documents d
                   JOIN subject s ON s.subject_id = d.subject_id
                  WHERE d.archive_id = a.archive_id $clause) AS docs_count,
                (SELECT COUNT(*)
                   FROM archived_quizzes q
                   JOIN subject s ON s.subject_id = q.subject_id
                  WHERE q.archive_id = a.archive_id $clause) AS quizzes_count
           FROM semester_archive a
           JOIN semester sem ON sem.semester_id = a.semester_id
          ORDER BY sem.academic_year DESC, a.archived_at DESC",
        array_merge($params, $params, $params)
    );

    echo json_encode(['success' => true, 'semesters' => array_map(fn($r) => [
        'archive_id'    => (int)$r['archive_id'],
        'semester_id'   => (int)$r['semester_id'],
        'semester_name' => $r['semester_name'],
        'academic_year' => $r['academic_year'],
        'start_date'    => $r['start_date'],
        'end_date'      => $r['end_date'],
        'archived_at'   => $r['archived_at'],
        'grades_locked' => (int)$r['grades_locked'] === 1,
        'subject_count' => (int)$r['subject_count'],
        'docs_count'    => (int)$r['docs_count'],
        'quizzes_count' => (int)$r['quizzes_count'],
    ], $rows)]);
}

/** GET ?action=subjects&archive_id=X — subjects captured in one archived semester. */
function handleSubjects(): void
{
    $archiveId = (int)($_GET['archive_id'] ?? 0);
    if (!$archiveId) {
        echo json_encode(['success' => false, 'message' => 'archive_id required']);
        return;
    }
    $programIds = archiveProgramScope();
    [$clause, $params] = archiveScopeClause($programIds);

    $rows = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name,
                COUNT(DISTINCT d.archive_doc_id) AS docs,
                COUNT(DISTINCT q.archive_quiz_id) AS quizzes
           FROM subject s
           LEFT JOIN archived_module_documents d ON d.subject_id = s.subject_id AND d.archive_id = ?
           LEFT JOIN archived_quizzes q          ON q.subject_id = s.subject_id AND q.archive_id = ?
          WHERE (d.archive_doc_id IS NOT NULL OR q.archive_quiz_id IS NOT NULL) $clause
          GROUP BY s.subject_id, s.subject_code, s.subject_name
          ORDER BY s.subject_code",
        array_merge([$archiveId, $archiveId], $params)
    );

    echo json_encode(['success' => true, 'subjects' => array_map(fn($r) => [
        'subject_id'   => (int)$r['subject_id'],
        'subject_code' => $r['subject_code'],
        'subject_name' => $r['subject_name'],
        'docs'         => (int)$r['docs'],
        'quizzes'      => (int)$r['quizzes'],
    ], $rows)]);
}

/**
 * GET ?action=archived-subjects — subjects retired from the curriculum.
 *
 * This is a DIFFERENT kind of archive from the semester capture above, and the
 * two were never joined up. A semester archive is automatic: it snapshots
 * materials when the admin switches the active semester. This one is manual -
 * someone pressed Archive on a subject in the curriculum, which flips
 * subject.status to 'inactive' (CurriculumAPI's ?action=archive).
 *
 * Until now that second kind went nowhere visible: the subject dropped out of
 * the curriculum and appeared in no archive, so the only way to find one again
 * was to read the database. Same program scoping as everything else here.
 */
function handleArchivedSubjects(): void
{
    $programIds = archiveProgramScope();
    [$clause, $params] = archiveScopeClause($programIds);

    $rows = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.year_level, s.semester, s.updated_at,
                p.program_id, p.program_code, p.program_name,
                (SELECT COUNT(*) FROM subject_offered o
                  WHERE o.subject_id = s.subject_id AND o.status != 'cancelled') AS live_offerings
           FROM subject s
           LEFT JOIN program p ON p.program_id = s.program_id
          WHERE s.status = 'inactive' $clause
          ORDER BY s.updated_at DESC, s.subject_code",
        $params
    );

    echo json_encode(['success' => true,
        // The page cannot ask Auth::can() for itself, so say here whether to
        // offer Restore at all rather than showing a button that always 403s.
        'can_restore' => Auth::can('curriculum.edit'),
        'subjects' => array_map(fn($r) => [
            'subject_id'     => (int)$r['subject_id'],
            'subject_code'   => $r['subject_code'],
            'subject_name'   => $r['subject_name'],
            'units'          => $r['units'] !== null ? (int)$r['units'] : null,
            'year_level'     => $r['year_level'] !== null ? (int)$r['year_level'] : null,
            'semester'       => $r['semester'] !== null ? (int)$r['semester'] : null,
            'program_id'     => $r['program_id'] !== null ? (int)$r['program_id'] : null,
            'program_code'   => $r['program_code'],
            'program_name'   => $r['program_name'],
            'live_offerings' => (int)$r['live_offerings'],
            'archived_at'    => $r['updated_at'],
        ], $rows)]);
}

/** GET ?action=subject&archive_id=X&subject_id=Y — one subject's captured contents. */
function handleSubject(): void
{
    $archiveId = (int)($_GET['archive_id'] ?? 0);
    $subjectId = (int)($_GET['subject_id'] ?? 0);
    if (!$archiveId || !$subjectId) {
        echo json_encode(['success' => false, 'message' => 'archive_id and subject_id required']);
        return;
    }

    // Re-check scope for THIS subject rather than trusting the id that came in.
    $programIds = archiveProgramScope();
    if ($programIds !== null) {
        if (!$programIds) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied']);
            return;
        }
        $ph = implode(',', array_fill(0, count($programIds), '?'));
        $ok = db()->fetchOne(
            "SELECT 1 FROM subject WHERE subject_id = ? AND program_id IN ($ph)",
            array_merge([$subjectId], $programIds)
        );
        if (!$ok) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied']);
            return;
        }
    }

    $subject = db()->fetchOne("SELECT subject_code, subject_name FROM subject WHERE subject_id = ?", [$subjectId]);

    $docs = db()->fetchAll(
        "SELECT archive_doc_id, module_number, doc_type, original_name, file_size, uploaded_at
           FROM archived_module_documents
          WHERE archive_id = ? AND subject_id = ?
          ORDER BY module_number, doc_type",
        [$archiveId, $subjectId]
    );

    $quizzes = db()->fetchAll(
        "SELECT archive_quiz_id, quiz_title, module_number, gradebook_component, total_points, questions_json
           FROM archived_quizzes
          WHERE archive_id = ? AND subject_id = ?
          ORDER BY module_number",
        [$archiveId, $subjectId]
    );

    $announcements = db()->fetchAll(
        "SELECT title, content, announcement_type, created_at
           FROM archived_announcements
          WHERE archive_id = ? AND subject_id = ?
          ORDER BY created_at DESC",
        [$archiveId, $subjectId]
    );

    echo json_encode(['success' => true, 'data' => [
        'subject_code' => $subject['subject_code'] ?? '',
        'subject_name' => $subject['subject_name'] ?? '',
        'documents'    => array_map(fn($d) => [
            'archive_doc_id' => (int)$d['archive_doc_id'],
            'module_number'  => (int)$d['module_number'],
            'doc_type'       => $d['doc_type'],
            'original_name'  => $d['original_name'],
            'file_size'      => (int)$d['file_size'],
            'uploaded_at'    => $d['uploaded_at'],
        ], $docs),
        'quizzes'      => array_map(fn($q) => [
            'quiz_title'          => $q['quiz_title'],
            'module_number'       => $q['module_number'] !== null ? (int)$q['module_number'] : null,
            'gradebook_component' => $q['gradebook_component'],
            'total_points'        => (int)$q['total_points'],
            'question_count'      => count(json_decode((string)$q['questions_json'], true) ?: []),
        ], $quizzes),
        'announcements' => $announcements,
    ]]);
}
