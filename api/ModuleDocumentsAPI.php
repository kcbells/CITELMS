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

switch ($action) {
    case 'list':   handleList();   break;
    case 'upload': handleUpload(); break;
    case 'delete': handleDelete(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
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
    $rows = db()->fetchAll(
        "SELECT doc_id, module_number, doc_type, original_name, file_size, uploaded_at
         FROM subject_module_documents
         WHERE subject_id = ? AND doc_type IN {$docTypes}
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
        ];
    }

    echo json_encode(['success' => true, 'data' => $docs, 'can_upload' => $canManage]);
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
    ];
    $mimeType = mime_content_type($file['tmp_name']);
    if (!isset($allowedTypes[$mimeType])) {
        echo json_encode(['success' => false, 'message' => 'Only PDF, Word, or PowerPoint files are allowed.']);
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

        pdo()->prepare(
            "INSERT INTO subject_module_documents
                (subject_id, module_number, doc_type, file_name, original_name, file_path, file_size, uploaded_by, uploaded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                file_name = VALUES(file_name), original_name = VALUES(original_name),
                file_path = VALUES(file_path), file_size = VALUES(file_size),
                uploaded_by = VALUES(uploaded_by), uploaded_at = NOW()"
        )->execute([
            $subjectId, $moduleNum, $docType,
            $fileName, $file['name'], 'uploads/module_documents/' . $fileName, $file['size'], $user['id'],
        ]);

        echo json_encode(['success' => true, 'message' => 'File uploaded']);
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
        if ($doc['doc_type'] !== 'sas' || !studentEnrolledInSubject((int)$doc['subject_id'], $user['id'])) {
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
