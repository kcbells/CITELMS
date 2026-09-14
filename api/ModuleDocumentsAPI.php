<?php
/**
 * Module Documents API — Teaching Guide / Student Activity Sheet (SAS)
 *
 * Per-subject, per-module (1-14) curriculum documents.
 *   teaching_guide -> admin + instructor + dean + program_head only, never students
 *   sas            -> Student Activity Sheet, visible to everyone with access to the subject
 *
 * Table: subject_module_documents (auto-created below, same guard pattern as
 * GlobalGradebookAPI.php — safe even if migrations/012_module_documents.sql
 * hasn't been run yet on a given environment).
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ScopeHelper.php';
require_once __DIR__ . '/helpers/DocxTableReader.php';
require_once __DIR__ . '/helpers/XlsxReader.php';

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

// 'serve' streams file bytes (not JSON) and authenticates via session, JWT
// header, or ?token= — same pattern as LessonsAPI.php's serve-material, so
// direct <a href> downloads work even when the session cookie isn't sent.
if ($action === 'serve') {
    require_once __DIR__ . '/../config/jwt.php';
    serveDocument();
    exit;
}

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

try {
    $__db = Database::getInstance()->getConnection();
    $__db->exec("CREATE TABLE IF NOT EXISTS `subject_module_documents` (
        `doc_id`        INT          NOT NULL AUTO_INCREMENT,
        `subject_id`    INT          NOT NULL,
        `module_number` TINYINT      NOT NULL,
        `doc_type`      ENUM('teaching_guide','sas') NOT NULL,
        `file_name`     VARCHAR(255) NOT NULL,
        `original_name` VARCHAR(255) NOT NULL,
        `file_path`     VARCHAR(500) NOT NULL,
        `file_size`     INT          NOT NULL DEFAULT 0,
        `uploaded_by`   INT          NULL,
        `uploaded_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`doc_id`),
        UNIQUE KEY `uq_smd` (`subject_id`, `module_number`, `doc_type`),
        KEY `idx_smd_subject` (`subject_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
    // One row per (subject, module) — whether the instructor requires ALL
    // THREE Global Gradebook components (Let's Practice, Reflection, Wrap Up
    // Quiz) answered before that module counts as complete for a student,
    // vs. each staying independent (the default). Absence of a row means
    // "not required" — only written when actually turned on.
    $__db->exec("CREATE TABLE IF NOT EXISTS `module_requirements` (
        `subject_id`        INT     NOT NULL,
        `module_number`     TINYINT NOT NULL,
        `require_all_parts` TINYINT(1) NOT NULL DEFAULT 0,
        `due_date`          DATE    NULL,
        `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`subject_id`, `module_number`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
    // due_date was added after the table shipped — bring existing installs up
    // to date without touching their rows.
    try {
        $__has = $__db->query("SHOW COLUMNS FROM `module_requirements` LIKE 'due_date'")->fetch();
        if (!$__has) {
            $__db->exec("ALTER TABLE `module_requirements` ADD COLUMN `due_date` DATETIME NULL AFTER `require_all_parts`");
        } elseif (stripos((string)$__has['Type'], 'datetime') === false) {
            // Same DATE -> DATETIME widening as quiz.due_date, and for the
            // same reason: a bare date meant end-of-day, so preserve that
            // rather than collapsing it to midnight.
            $__db->exec("UPDATE `module_requirements` SET due_date = CONCAT(due_date, ' 23:59:59') WHERE due_date IS NOT NULL");
            $__db->exec("ALTER TABLE `module_requirements` MODIFY COLUMN `due_date` DATETIME NULL");
        }
    } catch (Exception $__e2) {
        error_log('ModuleDocuments due_date column guard: ' . $__e2->getMessage());
    }
    unset($__db);
} catch (Exception $__e) {
    error_log('ModuleDocuments migration guard: ' . $__e->getMessage());
    unset($__e);
}
ensurePublishColumns();

switch ($action) {
    case 'list':        handleList();        break;
    case 'upload':      handleUpload();      break;
    case 'delete':      handleDelete();      break;
    case 'set_publish': handleSetPublish();  break;
    case 'match_subject': handleMatchSubject(); break;
    case 'detect':        handleDetect();        break;
    case 'set_module_requirement': handleSetModuleRequirement(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Publish gate — a document is hidden from students until the instructor/
 * dean/program head who manages that subject explicitly publishes it, or
 * schedules a future publish_at moment (checked against NOW() at read time,
 * not a cron — see the WHERE clauses in handleList()/serveDocument()).
 */
function ensurePublishColumns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $pdo = pdo();
        $has = fn($col) => (bool)$pdo->query("SHOW COLUMNS FROM subject_module_documents LIKE '$col'")->fetchAll();
        if (!$has('is_published')) {
            $pdo->exec("ALTER TABLE subject_module_documents ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER uploaded_by");
        }
        if (!$has('publish_at')) {
            $pdo->exec("ALTER TABLE subject_module_documents ADD COLUMN publish_at DATETIME NULL AFTER is_published");
        }
    } catch (Exception $e) {
        error_log('ModuleDocuments ensurePublishColumns: ' . $e->getMessage());
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the requesting user for JSON actions — plain wrapper around the
 * session (Auth::check() already gated these actions before this runs).
 */
function currentUser(): array
{
    return ['id' => (int)Auth::id(), 'role' => Auth::role()];
}

/**
 * Resolve the requesting user for the 'serve' (file-stream) action, which
 * runs before the session-only Auth::check() gate so direct <a href> / new-tab
 * downloads still work via a JWT ?token= — same approach as
 * LessonsAPI.php's resolveMaterialUserId(). Role isn't in the JWT payload,
 * so it's looked up from the users table once we have the id.
 */
function resolveServeUser(): ?array
{
    if (Auth::check()) {
        return ['id' => (int)Auth::id(), 'role' => Auth::role()];
    }
    $payload = null;
    $token = $_GET['token'] ?? null;
    if ($token) {
        $payload = JWT::validate($token);
    }
    if (!$payload) {
        $payload = JWT::authenticate();
    }
    if (!$payload || empty($payload['sub'])) {
        return null;
    }
    $uid = (int)$payload['sub'];
    $row = db()->fetchOne("SELECT role FROM users WHERE users_id = ?", [$uid]);
    if (!$row) return null;
    return ['id' => $uid, 'role' => $row['role']];
}

/** Does this user have staff-level access (upload/see Teaching Guide) to this subject? */
function userCanManageSubject(int $subjectId, array $user): bool
{
    $role = $user['role'];
    if ($role === 'admin') return true;

    if ($role === 'instructor') {
        $row = db()->fetchOne(
            "SELECT 1 FROM subject_offered WHERE subject_id = ? AND user_teacher_id = ? LIMIT 1",
            [$subjectId, $user['id']]
        );
        return (bool)$row;
    }

    if ($role === 'dean') {
        // deanProgramIds()/programHeadScope() are keyed off the SESSION user
        // (Auth::id()) — accurate for the normal in-app session flow. The
        // 'serve' action's JWT-token fallback exists for direct-link
        // downloads, where the session is typically still present anyway.
        $subj = db()->fetchOne("SELECT program_id FROM subject WHERE subject_id = ?", [$subjectId]);
        return $subj && in_array((int)$subj['program_id'], deanProgramIds(), true);
    }

    if ($role === 'program_head') {
        $subj = db()->fetchOne("SELECT program_id FROM subject WHERE subject_id = ?", [$subjectId]);
        $scope = programHeadScope();
        return $subj && (int)$subj['program_id'] === $scope['program_id'];
    }

    return false;
}

/** Does this student have any enrollment (any offering) in this subject? */
function studentEnrolledInSubject(int $subjectId, int $userId): bool
{
    $row = db()->fetchOne(
        "SELECT 1 FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE so.subject_id = ? AND ss.user_student_id = ? AND ss.status = 'enrolled' LIMIT 1",
        [$subjectId, $userId]
    );
    return (bool)$row;
}

/** True when this document was most recently uploaded by an admin and the
 *  acting user isn't one themselves — admin-provided material is
 *  authoritative and staff below admin may view it but never replace or
 *  remove it (see the matching `locked` flag in handleList()). */
function isDocLockedForUser(array $doc, array $user): bool
{
    if ($user['role'] === 'admin') return false;
    if (empty($doc['uploaded_by'])) return false;
    $uploader = db()->fetchOne("SELECT role FROM users WHERE users_id = ?", [$doc['uploaded_by']]);
    return $uploader && $uploader['role'] === 'admin';
}

/**
 * GET ?action=list&subject_id=X
 * Students only ever receive `sas` rows; staff roles with subject access get both.
 */
function handleList(): void
{
    $subjectId = (int)($_GET['subject_id'] ?? 0);
    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }

    $user = currentUser();
    $role = $user['role'];
    $canManage = in_array($role, ['admin', 'instructor', 'dean', 'program_head'], true) && userCanManageSubject($subjectId, $user);

    if ($role === 'student') {
        if (!studentEnrolledInSubject($subjectId, $user['id'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Not enrolled in this subject']);
            return;
        }
    } elseif (!$canManage) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $docTypes = ($role === 'student') ? "('sas')" : "('teaching_guide','sas')";
    // Students only ever see a document once it's published or its scheduled
    // publish_at has arrived — checked live against NOW() here, not a cron.
    $visibilityClause = ($role === 'student') ? "AND (is_published = 1 OR (publish_at IS NOT NULL AND publish_at <= NOW()))" : '';
    $rows = db()->fetchAll(
        "SELECT d.doc_id, d.module_number, d.doc_type, d.original_name, d.file_size, d.uploaded_at,
                d.is_published, d.publish_at, u.role AS uploader_role
         FROM subject_module_documents d
         LEFT JOIN users u ON u.users_id = d.uploaded_by
         WHERE d.subject_id = ? AND d.doc_type IN {$docTypes} {$visibilityClause}
         ORDER BY d.module_number, d.doc_type",
        [$subjectId]
    );

    $docs = []; // docs[module_number][doc_type] = row
    foreach ($rows as $r) {
        // Admin-uploaded material is authoritative — staff below admin can
        // view/replace-nothing about it, only see it, so students always get
        // the same file regardless of who's teaching. Meaningless for the
        // student role itself (they never get a Replace/Delete control at
        // all), but computed uniformly here rather than duplicated in every
        // caller.
        $docs[(int)$r['module_number']][$r['doc_type']] = [
            'doc_id'        => (int)$r['doc_id'],
            'original_name' => $r['original_name'],
            'file_size'     => (int)$r['file_size'],
            'uploaded_at'   => $r['uploaded_at'],
            'is_published'  => (bool)$r['is_published'],
            'publish_at'    => $r['publish_at'],
            'locked'        => $r['uploader_role'] === 'admin' && $role !== 'admin',
        ];
    }

    // Module quizzes (Let's Practice / Reflection / Wrap Up Quiz) built from
    // this subject's SAS/Teaching Guide — see AIQuizAPI.php's
    // generate-from-module-docs + save. Surfaced here so the same modal can
    // offer "Build/Manage Quiz" (staff) or "Answer now" (student).
    $quizzes = [];
    try {
        $quizRows = db()->fetchAll(
            "SELECT quiz_id, module_number, gradebook_component, status, quiz_title
             FROM quiz WHERE subject_id = ? AND module_number IS NOT NULL AND gradebook_component IS NOT NULL",
            [$subjectId]
        );
        $myAttempts = [];
        if ($role === 'student' && $quizRows) {
            $quizIds = array_map(fn($q) => (int)$q['quiz_id'], $quizRows);
            $placeholders = implode(',', array_fill(0, count($quizIds), '?'));
            $attemptRows = db()->fetchAll(
                "SELECT quiz_id, status, percentage, passed FROM student_quiz_attempts
                 WHERE user_student_id = ? AND quiz_id IN ({$placeholders}) ORDER BY attempt_id DESC",
                array_merge([$user['id']], $quizIds)
            );
            foreach ($attemptRows as $a) {
                if (!isset($myAttempts[(int)$a['quiz_id']])) $myAttempts[(int)$a['quiz_id']] = $a; // latest first
            }
        }
        foreach ($quizRows as $q) {
            if ($role === 'student' && $q['status'] !== 'published') continue; // hide drafts-in-progress from students
            $quizzes[(int)$q['module_number']][$q['gradebook_component']] = [
                'quiz_id'     => (int)$q['quiz_id'],
                'status'      => $q['status'],
                'quiz_title'  => $q['quiz_title'],
                'my_attempt'  => $myAttempts[(int)$q['quiz_id']] ?? null,
            ];
        }
    } catch (Exception $e) {
        error_log('ModuleDocuments list quizzes: ' . $e->getMessage());
    }

    // Whether the instructor requires ALL THREE Global Gradebook components
    // answered before a module counts as complete, and — for a student —
    // how far they've actually gotten against that requirement. Modules
    // with no module_requirements row default to "not required" (each
    // component just stays independent, same as before this existed).
    $requirements = [];
    $moduleDueDates = [];
    // The student's own raw scores — Let's Practice/Reflection on the Global
    // Gradebook's 0-3 rubric, Wrap Up Quiz on its own percentage scale.
    // Populated for every module that has a grade, independent of whether
    // "require all parts" is on — a student can see their actual score
    // either way, the requirement toggle only affects completion status.
    $myScores = [];
    try {
        $reqRows = db()->fetchAll(
            "SELECT module_number, require_all_parts, due_date FROM module_requirements WHERE subject_id = ?",
            [$subjectId]
        );
        foreach ($reqRows as $r) {
            $requirements[(int)$r['module_number']] = (bool)$r['require_all_parts'];
            if (!empty($r['due_date'])) {
                $moduleDueDates[(int)$r['module_number']] = substr((string)$r['due_date'], 0, 10);
            }
        }

        if ($role === 'student') {
            $offering = db()->fetchOne(
                "SELECT ss.subject_offered_id FROM student_subject ss
                 JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
                 WHERE so.subject_id = ? AND ss.user_student_id = ? AND ss.status = 'enrolled' LIMIT 1",
                [$subjectId, $user['id']]
            );
            if ($offering) {
                $gradeRows = db()->fetchAll(
                    "SELECT module_number, lets_practice, reflection, wrap_up_quiz
                     FROM global_module_grades WHERE subject_offered_id = ? AND student_id = ?",
                    [(int)$offering['subject_offered_id'], $user['id']]
                );
                foreach ($gradeRows as $g) {
                    $mod = (int)$g['module_number'];
                    $myScores[$mod] = [
                        'lets_practice' => $g['lets_practice'] !== null ? (int)$g['lets_practice'] : null,
                        'reflection'    => $g['reflection']    !== null ? (int)$g['reflection']    : null,
                        'wrap_up_quiz'  => $g['wrap_up_quiz']   !== null ? (float)$g['wrap_up_quiz'] : null,
                    ];
                    if (empty($requirements[$mod])) continue; // not required for this module — no completion status to compute
                    $doneCount = (int)($g['lets_practice'] !== null) + (int)($g['reflection'] !== null) + (int)($g['wrap_up_quiz'] !== null);
                    $requirements[$mod] = [
                        'required'   => true,
                        'parts_done' => $doneCount,
                        'complete'   => $doneCount >= 3,
                    ];
                }
            }
        }
        // Normalize: any module still holding a bare bool (required=false, or
        // required=true but the student has no global_module_grades row yet
        // i.e. zero parts done) into the same shape callers can rely on.
        foreach ($requirements as $mod => $val) {
            if (is_bool($val)) {
                $requirements[$mod] = $val
                    ? ['required' => true, 'parts_done' => 0, 'complete' => false]
                    : ['required' => false, 'parts_done' => 0, 'complete' => false];
            }
        }
    } catch (Exception $e) {
        error_log('ModuleDocuments list requirements: ' . $e->getMessage());
    }

    echo json_encode(['success' => true, 'data' => $docs, 'quizzes' => $quizzes, 'requirements' => $requirements, 'module_due_dates' => $moduleDueDates, 'my_scores' => $myScores, 'can_upload' => $canManage]);
}

/**
 * POST ?action=set_module_requirement
 * Body: { subject_id, module_number, require_all_parts }
 */
function handleSetModuleRequirement(): void
{
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId = (int)($data['subject_id'] ?? 0);
    $moduleNum = (int)($data['module_number'] ?? 0);
    $require   = !empty($data['require_all_parts']);

    // The module-level deadline every part of this module falls back to. Only
    // touched when the caller explicitly says so, so saving the toggle alone
    // never wipes a date that's already set.
    $setDue = array_key_exists('due_date', $data);
    $due    = str_replace('T', ' ', trim((string)($data['due_date'] ?? '')));
    if ($setDue && $due !== '') {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $due)) {
            echo json_encode(['success' => false, 'message' => 'Invalid due date']);
            return;
        }
        // A bare date still means the end of that day.
        if (!preg_match('/\d{2}:\d{2}/', $due)) $due .= ' 23:59:59';
        elseif (substr_count($due, ':') === 1) $due .= ':00';
    }

    if (!$subjectId || $moduleNum < 1 || $moduleNum > 14) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        return;
    }

    $user = currentUser();
    if (!userCanManageSubject($subjectId, $user)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    try {
        if ($setDue) {
            pdo()->prepare(
                "INSERT INTO module_requirements (subject_id, module_number, require_all_parts, due_date)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE require_all_parts = VALUES(require_all_parts),
                                         due_date = VALUES(due_date)"
            )->execute([$subjectId, $moduleNum, $require ? 1 : 0, $due !== '' ? $due : null]);
        } else {
            pdo()->prepare(
                "INSERT INTO module_requirements (subject_id, module_number, require_all_parts)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE require_all_parts = VALUES(require_all_parts)"
            )->execute([$subjectId, $moduleNum, $require ? 1 : 0]);
        }
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('ModuleDocuments set_module_requirement: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Could not save']);
    }
}

/**
 * POST ?action=upload (multipart/form-data)
 * Fields: subject_id, module_number (1-14), doc_type (teaching_guide|sas), file
 * Re-uploading the same subject/module/doc_type replaces the previous file.
 */
function handleUpload(): void
{
    $user = currentUser();
    if (!in_array($user['role'], ['admin', 'instructor', 'dean', 'program_head'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $subjectId = (int)($_POST['subject_id'] ?? 0);
    $moduleNum = (int)($_POST['module_number'] ?? 0);
    $docType   = $_POST['doc_type'] ?? '';

    if (!$subjectId || $moduleNum < 1 || $moduleNum > 14 || !in_array($docType, ['teaching_guide', 'sas'], true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        return;
    }

    if (!userCanManageSubject($subjectId, $user)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have access to this subject']);
        return;
    }

    // Checked before we even touch $_FILES — no point accepting and saving a
    // replacement file to disk only to reject it after the fact.
    $existing = db()->fetchOne(
        "SELECT file_path, uploaded_by FROM subject_module_documents WHERE subject_id = ? AND module_number = ? AND doc_type = ?",
        [$subjectId, $moduleNum, $docType]
    );
    if ($existing && isDocLockedForUser($existing, $user)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'This document was uploaded by admin and can\'t be replaced.']);
        return;
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        return;
    }

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'Upload failed (error code: ' . $file['error'] . ')']);
        return;
    }

    $maxFileSize = 25 * 1024 * 1024; // 25MB
    if ($file['size'] > $maxFileSize) {
        echo json_encode(['success' => false, 'message' => 'File too large. Maximum size is 25MB.']);
        return;
    }

    $allowedTypes = [
        'application/pdf' => 'pdf',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'text/plain' => 'txt',
        'text/csv' => 'csv',
    ];
    $mimeType = mime_content_type($file['tmp_name']);
    if (!isset($allowedTypes[$mimeType])) {
        echo json_encode(['success' => false, 'message' => 'Only PDF, Word, Excel, or text files are allowed.']);
        return;
    }

    $uploadDir = __DIR__ . '/../uploads/module_documents/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    // Extension comes from the *validated* MIME type, not the client-supplied
    // filename — otherwise a file whose content passes MIME sniffing but is
    // named e.g. "shell.php" would be saved with a .php extension.
    $ext = $allowedTypes[$mimeType];
    $fileName = 'moddoc_' . $subjectId . '_' . $moduleNum . '_' . $docType . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $filePath = $uploadDir . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        echo json_encode(['success' => false, 'message' => 'Failed to save file']);
        return;
    }

    try {
        // Remove the previous file on disk for this slot (replaced, not accumulated)
        if ($existing) {
            $old = realpath(__DIR__ . '/../' . ltrim($existing['file_path'], '/'));
            $uploadsRoot = realpath(__DIR__ . '/../uploads');
            if ($old && $uploadsRoot && strpos($old, $uploadsRoot) === 0 && is_file($old)) {
                unlink($old);
            }
        }

        // A replaced file resets to unpublished — the instructor/dean should
        // consciously re-publish a changed document rather than have the old
        // one's publish state silently carry over to different content.
        pdo()->prepare(
            "INSERT INTO subject_module_documents
                (subject_id, module_number, doc_type, file_name, original_name, file_path, file_size, uploaded_by, uploaded_at, is_published, publish_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, NULL)
             ON DUPLICATE KEY UPDATE
                file_name = VALUES(file_name), original_name = VALUES(original_name),
                file_path = VALUES(file_path), file_size = VALUES(file_size),
                uploaded_by = VALUES(uploaded_by), uploaded_at = NOW(),
                is_published = 0, publish_at = NULL"
        )->execute([
            $subjectId, $moduleNum, $docType,
            $fileName, $file['name'], 'uploads/module_documents/' . $fileName, $file['size'], $user['id'],
        ]);

        $docId = (int)db()->fetchOne(
            "SELECT doc_id FROM subject_module_documents WHERE subject_id = ? AND module_number = ? AND doc_type = ?",
            [$subjectId, $moduleNum, $docType]
        )['doc_id'];

        echo json_encode(['success' => true, 'message' => 'File uploaded', 'data' => ['doc_id' => $docId]]);
    } catch (Exception $e) {
        if (file_exists($filePath)) unlink($filePath);
        error_log('ModuleDocuments upload: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save upload']);
    }
}

/**
 * POST ?action=delete
 * Body: { doc_id }
 */
function handleDelete(): void
{
    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $docId = (int)($data['doc_id'] ?? $_POST['doc_id'] ?? 0);
    if (!$docId) {
        echo json_encode(['success' => false, 'message' => 'doc_id required']);
        return;
    }

    $doc = db()->fetchOne("SELECT * FROM subject_module_documents WHERE doc_id = ?", [$docId]);
    if (!$doc) {
        echo json_encode(['success' => false, 'message' => 'Document not found']);
        return;
    }

    $user = currentUser();
    if (!userCanManageSubject((int)$doc['subject_id'], $user)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }
    if (isDocLockedForUser($doc, $user)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'This document was uploaded by admin and can\'t be removed.']);
        return;
    }

    try {
        pdo()->prepare("DELETE FROM subject_module_documents WHERE doc_id = ?")->execute([$docId]);
        $path = realpath(__DIR__ . '/../' . ltrim($doc['file_path'], '/'));
        $uploadsRoot = realpath(__DIR__ . '/../uploads');
        if ($path && $uploadsRoot && strpos($path, $uploadsRoot) === 0 && is_file($path)) {
            unlink($path);
        }
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('ModuleDocuments delete: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Delete failed']);
    }
}

/**
 * GET ?action=serve&doc_id=X
 * Streams the file inline. Students may only ever fetch `sas` documents.
 */
function serveDocument(): void
{
    $docId = (int)($_GET['doc_id'] ?? 0);
    if (!$docId) {
        http_response_code(400);
        header('Content-Type: text/plain');
        echo 'doc_id required';
        return;
    }

    $user = resolveServeUser();
    if (!$user) {
        http_response_code(401);
        header('Content-Type: text/plain');
        echo 'Unauthorized';
        return;
    }

    $doc = db()->fetchOne("SELECT * FROM subject_module_documents WHERE doc_id = ?", [$docId]);
    if (!$doc) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'Not found';
        return;
    }

    $role = $user['role'];
    if ($role === 'student') {
        $published = (bool)$doc['is_published']
            || ($doc['publish_at'] !== null && strtotime($doc['publish_at']) <= time());
        if ($doc['doc_type'] !== 'sas' || !$published || !studentEnrolledInSubject((int)$doc['subject_id'], $user['id'])) {
            http_response_code(403);
            header('Content-Type: text/plain');
            echo 'Access denied';
            return;
        }
    } elseif (!in_array($role, ['admin', 'instructor', 'dean', 'program_head'], true) || !userCanManageSubject((int)$doc['subject_id'], $user)) {
        http_response_code(403);
        header('Content-Type: text/plain');
        echo 'Access denied';
        return;
    }

    $path = realpath(__DIR__ . '/../' . ltrim($doc['file_path'], '/'));
    $uploadsRoot = realpath(__DIR__ . '/../uploads');
    if (!$path || !$uploadsRoot || strpos($path, $uploadsRoot) !== 0 || !is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'File missing on server';
        return;
    }

    $mime = mime_content_type($path) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: inline; filename="' . basename($doc['original_name']) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
}

/**
 * POST ?action=set_publish
 * Body: { doc_id, is_published?: bool, publish_at?: "YYYY-MM-DD HH:MM"|null }
 * Only whoever can manage the document's subject (admin, the instructor
 * assigned to teach it, its dean, or its program head) may publish/schedule
 * it — this is the "student can see it or not, or on a schedule" control.
 */
function handleSetPublish(): void {
    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $docId = (int)($data['doc_id'] ?? 0);
    if (!$docId) {
        echo json_encode(['success' => false, 'message' => 'doc_id required']);
        return;
    }

    $doc = db()->fetchOne("SELECT subject_id FROM subject_module_documents WHERE doc_id = ?", [$docId]);
    if (!$doc) {
        echo json_encode(['success' => false, 'message' => 'Document not found']);
        return;
    }
    if (!userCanManageSubject((int)$doc['subject_id'], currentUser())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $isPublished = array_key_exists('is_published', $data) ? (int)(bool)$data['is_published'] : null;
    $publishAt   = array_key_exists('publish_at', $data) ? ($data['publish_at'] ?: null) : null;
    if ($publishAt !== null) {
        $ts = strtotime($publishAt);
        if ($ts === false) {
            echo json_encode(['success' => false, 'message' => 'Invalid publish date/time']);
            return;
        }
        $publishAt = date('Y-m-d H:i:s', $ts);
    }

    // Publishing immediately clears any pending schedule (it's redundant); a
    // fresh schedule implies "not published yet" so students don't see it
    // early, unless the caller explicitly also sets is_published.
    if ($isPublished === 1 && !array_key_exists('publish_at', $data)) $publishAt = null;

    try {
        $sets = [];
        $params = [];
        if ($isPublished !== null) { $sets[] = 'is_published = ?'; $params[] = $isPublished; }
        if (array_key_exists('publish_at', $data)) { $sets[] = 'publish_at = ?'; $params[] = $publishAt; }
        if (!$sets) { echo json_encode(['success' => false, 'message' => 'Nothing to update']); return; }
        $params[] = $docId;
        pdo()->prepare("UPDATE subject_module_documents SET " . implode(', ', $sets) . " WHERE doc_id = ?")->execute($params);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('ModuleDocuments set_publish: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update']);
    }
}

/**
 * GET ?action=match_subject&code=ITE300
 * Used by the client-side PDF scanner (bulk Lesson Material upload) to
 * resolve a "Course Name: ITE 300 ..." string it read out of a Teaching
 * Guide/SAS PDF into a real subject_id. Staff-only (same roles as upload).
 */
function handleMatchSubject(): void {
    $user = currentUser();
    if (!in_array($user['role'], ['admin', 'instructor', 'dean', 'program_head'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }
    $code = trim($_GET['code'] ?? '');
    if (!$code) {
        echo json_encode(['success' => false, 'message' => 'code required']);
        return;
    }
    $m = matchSubjectByCode($code);
    if ($m['exact']) {
        echo json_encode(['success' => true, 'data' => $m['exact'], 'exact' => true]);
    } elseif (count($m['partial']) === 1) {
        echo json_encode(['success' => true, 'data' => $m['partial'][0], 'exact' => false]);
    } else {
        echo json_encode(['success' => true, 'data' => null, 'candidates' => array_slice($m['partial'], 0, 5)]);
    }
}

/**
 * Normalize + exact/partial match a single already-extracted code string
 * against the subjects table — the core of handleMatchSubject(), pulled out
 * so detectModuleDocInfo()'s own "Course Name:" fast path can reuse it
 * instead of duplicating the normalize-and-compare logic.
 */
function matchSubjectByCode(string $code): array {
    // Normalize "ITE 300" / "ITE300" / "ite-300" to the same bare form before
    // comparing, since subject_code is stored without spaces (e.g. "ITE300").
    $bare = strtoupper(preg_replace('/[\s\-]+/', '', $code));
    $rows = db()->fetchAll(
        "SELECT subject_id, subject_code, subject_name FROM subject WHERE status = 'active'"
    );
    $exact = null; $partial = [];
    foreach ($rows as $r) {
        $rowBare = strtoupper(preg_replace('/[\s\-]+/', '', $r['subject_code']));
        if ($rowBare === $bare) { $exact = $r; break; }
        if ($bare !== '' && strpos($rowBare, $bare) !== false) $partial[] = $r;
    }
    return ['exact' => $exact, 'partial' => $partial];
}

/**
 * Scans a whole block of free text (a document body, or a file name with its
 * separators turned into spaces) for the occurrence of any REAL subject code
 * from the subjects table — the fallback for files that don't spell out
 * "Course Name:" at all. Only trusts codes with 5+ significant characters
 * (skips very short/generic codes that would false-positive constantly on
 * unrelated text) and, when several codes appear, prefers the longest/most
 * specific match. Tolerates a space or dash between a code's letter prefix
 * and its digits ("ITE 359", "ITE-359", "ITE359" all match a stored
 * "ITE359"), and requires a non-alphanumeric boundary on both sides so
 * "ITE359" doesn't also match inside "ITE3590" or "AITE359".
 */
function findSubjectInText(string $haystack): ?array {
    if (trim($haystack) === '') return null;
    $rows = db()->fetchAll("SELECT subject_id, subject_code, subject_name FROM subject WHERE status = 'active'");
    $best = null; $bestLen = 0;
    foreach ($rows as $r) {
        $code = trim((string)$r['subject_code']);
        if (!preg_match('/^([A-Za-z]+)\s*-?\s*(\d[\dA-Za-z]*)$/', $code, $m)) continue;
        $bareLen = strlen($m[1] . $m[2]);
        if ($bareLen < 5) continue;
        $pattern = '/(?<![A-Za-z0-9])' . preg_quote($m[1], '/') . '\s*-?\s*' . preg_quote($m[2], '/') . '(?![A-Za-z0-9])/i';
        if (preg_match($pattern, $haystack) && $bareLen > $bestLen) {
            $best = $r; $bestLen = $bareLen;
        }
    }
    return $best;
}

function emptyDetectResult(): array {
    return ['course_code' => '', 'subject' => null, 'module_number' => null, 'doc_type' => ''];
}

/**
 * The actual content-sniffing logic, shared across every file type. Looks
 * for the labeled "Course Name: X" / "Module Number: N" fast path first
 * (highest confidence — the exact wording the reference Teaching Guide/SAS
 * template uses), then falls back to looser signals that don't depend on
 * that exact phrasing: scanning the WHOLE text for a real subject code from
 * the subjects table, a bare "Module 3" / "Mod. 3" anywhere, and — if the
 * file body gave up nothing — the same two checks run again against the
 * file's own NAME (e.g. "ITE359_Module3_TG.pdf"), since a human namer often
 * encodes exactly this even when the body doesn't spell it out.
 */
function detectModuleDocInfo(string $text, string $filename): array {
    $result = emptyDetectResult();
    $filenameSpaced = $filename !== '' ? str_replace(['_', '-', '.'], ' ', $filename) : '';

    $courseCode = '';
    $subject = null;
    if (preg_match('/Course\s*(?:Name|Code)\s*:\s*([A-Za-z]{2,6}\s?-?\s?\d{2,4}[A-Za-z]?)/i', $text, $m)) {
        $courseCode = trim(preg_replace('/\s+/', ' ', $m[1]));
        $subject = matchSubjectByCode($courseCode)['exact'];
    }
    if (!$subject) {
        $subject = findSubjectInText($text);
        if ($subject) $courseCode = $subject['subject_code'];
    }
    if (!$subject && $filenameSpaced !== '') {
        $subject = findSubjectInText($filenameSpaced);
        if ($subject) $courseCode = $subject['subject_code'];
    }

    $moduleNumber = null;
    if (preg_match('/Module\s*(?:Number|No\.?|#)?\s*[:\-]?\s*(\d{1,2})\b/i', $text, $m)) {
        $moduleNumber = (int)$m[1];
    } elseif ($filenameSpaced !== '' && preg_match('/Mod(?:ule)?\s*[:\-]?\s*(\d{1,2})\b/i', $filenameSpaced, $m)) {
        $moduleNumber = (int)$m[1];
    }
    if ($moduleNumber !== null && ($moduleNumber < 1 || $moduleNumber > 14)) $moduleNumber = null;

    $docType = '';
    if (preg_match('/\bTeaching\s*Guide\b/i', $text)) {
        $docType = 'teaching_guide';
    } elseif (preg_match('/\bStudent\s*Activity\s*Sheet\b/i', $text) || preg_match('/\bSAS\b/', $text)) {
        $docType = 'sas';
    } elseif ($filenameSpaced !== '') {
        if (preg_match('/\bTeaching\s*Guide\b|\bTG\b/i', $filenameSpaced)) {
            $docType = 'teaching_guide';
        } elseif (preg_match('/\bStudent\s*Activity\s*Sheet\b|\bSAS\b/i', $filenameSpaced)) {
            $docType = 'sas';
        }
    }

    $result['course_code']   = $courseCode;
    $result['subject']       = $subject ? [
        'subject_id'   => (int)$subject['subject_id'],
        'subject_code' => $subject['subject_code'],
        'subject_name' => $subject['subject_name'],
    ] : null;
    $result['module_number'] = $moduleNumber;
    $result['doc_type']      = $docType;
    return $result;
}

/**
 * POST ?action=detect — content-sniffs a Teaching Guide/SAS upload to figure
 * out its subject, module number, and doc type, without requiring the file
 * to spell "Course Name:" / "Module Number:" verbatim, and without needing
 * the caller to have already extracted text.
 *
 * Two ways to call it:
 *   - multipart with `file` (.docx or .xlsx) — extracted server-side with
 *     the same DocxTableReader/XlsxReader helpers BulkImportAPI.php's Class
 *     Density import already trusts.
 *   - form/JSON with `text` + `filename` — for PDF/plain-text callers, which
 *     already have the text (this project has no server-side PDF reader —
 *     pdf.js does that client-side).
 *
 * Never a hard failure for an unreadable/unrecognized file: the scan result
 * just comes back empty and the row falls back to the existing manual
 * subject/module/type picker, exactly like today.
 */
function handleDetect(): void {
    $user = currentUser();
    if (!in_array($user['role'], ['admin', 'instructor', 'dean', 'program_head'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $filename = trim($_POST['filename'] ?? ($_FILES['file']['name'] ?? ''));
    $text = '';

    if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        try {
            if ($ext === 'docx') {
                $text = DocxTableReader::readAllText($_FILES['file']['tmp_name']);
            } elseif ($ext === 'xlsx') {
                $rows = XlsxReader::readFirstSheet($_FILES['file']['tmp_name']);
                $cells = [];
                foreach ($rows as $row) {
                    foreach ($row as $cell) {
                        if (trim((string)$cell) !== '') $cells[] = $cell;
                    }
                }
                $text = implode(' ', $cells);
            } else {
                echo json_encode(['success' => false, 'message' => 'This file type needs its text sent directly, not as an upload.']);
                return;
            }
        } catch (Throwable $e) {
            // Not a hard failure — the file still uploads fine on its own,
            // it just needs a manual subject/module/type pick from here on.
            error_log('ModuleDocuments detect: ' . $e->getMessage());
            echo json_encode(['success' => true, 'data' => emptyDetectResult()]);
            return;
        }
    } else {
        $text = (string)($_POST['text'] ?? '');
    }

    echo json_encode(['success' => true, 'data' => detectModuleDocInfo($text, $filename)]);
}
