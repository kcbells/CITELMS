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
        "SELECT doc_id, module_number, doc_type, original_name, file_size, uploaded_at, is_published, publish_at
         FROM subject_module_documents
         WHERE subject_id = ? AND doc_type IN {$docTypes} {$visibilityClause}
         ORDER BY module_number, doc_type",
        [$subjectId]
    );

    $docs = []; // docs[module_number][doc_type] = row
    foreach ($rows as $r) {
        $docs[(int)$r['module_number']][$r['doc_type']] = [
            'doc_id'        => (int)$r['doc_id'],
            'original_name' => $r['original_name'],
            'file_size'     => (int)$r['file_size'],
            'uploaded_at'   => $r['uploaded_at'],
            'is_published'  => (bool)$r['is_published'],
            'publish_at'    => $r['publish_at'],
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

    echo json_encode(['success' => true, 'data' => $docs, 'quizzes' => $quizzes, 'can_upload' => $canManage]);
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

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: $allowedTypes[$mimeType];
    $fileName = 'moddoc_' . $subjectId . '_' . $moduleNum . '_' . $docType . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $filePath = $uploadDir . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        echo json_encode(['success' => false, 'message' => 'Failed to save file']);
        return;
    }

    try {
        // Remove the previous file on disk for this slot (replaced, not accumulated)
        $existing = db()->fetchOne(
            "SELECT file_path FROM subject_module_documents WHERE subject_id = ? AND module_number = ? AND doc_type = ?",
            [$subjectId, $moduleNum, $docType]
        );
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

    if (!userCanManageSubject((int)$doc['subject_id'], currentUser())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
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
    if ($exact) {
        echo json_encode(['success' => true, 'data' => $exact, 'exact' => true]);
    } elseif (count($partial) === 1) {
        echo json_encode(['success' => true, 'data' => $partial[0], 'exact' => false]);
    } else {
        echo json_encode(['success' => true, 'data' => null, 'candidates' => array_slice($partial, 0, 5)]);
    }
}
