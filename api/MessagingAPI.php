<?php
/**
 * Messaging API — student ↔ instructor direct messaging
 *
 * Actions:
 *   GET  ?action=contacts      — people I can start a chat with
 *   GET  ?action=threads       — my conversation threads (last msg + unread)
 *   GET  ?action=messages&with=USER_ID   — messages in a thread
 *   GET  ?action=unread_count  — total unread for badge
 *   POST ?action=send          — {receiver_id, content} or multipart + attachment (max 2MB)
 *   POST ?action=mark_read     — {other_user_id}
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? ($_GET['action'] ?? 'threads') : 'threads');

if ($action === 'attachment') {
    if (!Auth::check()) {
        http_response_code(401);
        exit('Unauthorized');
    }
    ensureMessageSchema();
    serveAttachment();
    exit;
}

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

ensureMessageSchema();

switch ($action) {
    case 'contacts':      handleContacts();     break;
    case 'threads':       handleThreads();      break;
    case 'messages':      handleMessages();     break;
    case 'unread_count':  handleUnreadCount();  break;
    case 'send':          handleSend();         break;
    case 'mark_read':     handleMarkRead();     break;
    case 'mark_all_read': handleMarkAllRead();  break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Contacts: who can I message? ─────────────────────────────────────────

function handleContacts() {
    $me   = Auth::id();
    $role = Auth::role();

    if ($role === 'student') {
        // Instructors + classmates in the same section/subject
        $contacts = db()->fetchAll(
            "SELECT DISTINCT u.users_id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.role,
                    s.subject_code, s.subject_name
             FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject         s  ON s.subject_id          = so.subject_id
             JOIN users           u  ON u.users_id            = so.user_teacher_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled' AND u.users_id IS NOT NULL
             UNION
             SELECT DISTINCT u2.users_id, CONCAT(u2.first_name, ' ', u2.last_name) AS name, u2.role,
                    s2.subject_code, s2.subject_name
             FROM student_subject ss1
             JOIN student_subject ss2 ON ss2.section_id = ss1.section_id
                                     AND ss2.subject_offered_id = ss1.subject_offered_id
                                     AND ss2.status = 'enrolled'
                                     AND ss2.user_student_id != ?
             JOIN subject_offered so2 ON so2.subject_offered_id = ss1.subject_offered_id
             JOIN subject s2 ON s2.subject_id = so2.subject_id
             JOIN users u2 ON u2.users_id = ss2.user_student_id AND u2.role = 'student'
             WHERE ss1.user_student_id = ? AND ss1.status = 'enrolled'
             ORDER BY name",
            [$me, $me, $me]
        );
    } elseif ($role === 'instructor') {
        // Students enrolled in this instructor's subject offerings
        $contacts = db()->fetchAll(
            "SELECT DISTINCT u.users_id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.role,
                    s.subject_code, s.subject_name
             FROM subject_offered so
             JOIN student_subject stss ON stss.subject_offered_id = so.subject_offered_id
                                      AND stss.status = 'enrolled'
             JOIN users           u    ON u.users_id = stss.user_student_id
             JOIN subject         s    ON s.subject_id = so.subject_id
             WHERE so.user_teacher_id = ?
             ORDER BY u.last_name, u.first_name",
            [$me]
        );
    } else {
        // Admin / Dean can see all users
        $contacts = db()->fetchAll(
            "SELECT users_id, CONCAT(first_name, ' ', last_name) AS name, role,
                    '' AS subject_code, '' AS subject_name
             FROM users WHERE users_id != ? AND status = 'active' ORDER BY last_name, first_name",
            [$me]
        );
    }

    echo json_encode(['success' => true, 'data' => $contacts ?? []]);
}

// ─── Threads: all my conversations ────────────────────────────────────────

function handleThreads() {
    $me = Auth::id();

    $threads = db()->fetchAll(
        "SELECT
             u.users_id AS other_id,
             CONCAT(u.first_name, ' ', u.last_name) AS name,
             u.role,
             (SELECT m2.content
              FROM messages m2
              WHERE (m2.sender_id = ? AND m2.receiver_id = u.users_id)
                 OR (m2.sender_id = u.users_id AND m2.receiver_id = ?)
              ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
             (SELECT m3.created_at
              FROM messages m3
              WHERE (m3.sender_id = ? AND m3.receiver_id = u.users_id)
                 OR (m3.sender_id = u.users_id AND m3.receiver_id = ?)
              ORDER BY m3.created_at DESC LIMIT 1) AS last_at,
             (SELECT COUNT(*)
              FROM messages m4
              WHERE m4.sender_id = u.users_id AND m4.receiver_id = ? AND m4.is_read = 0) AS unread
         FROM users u
         WHERE u.users_id IN (
             SELECT DISTINCT
                 CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
             FROM messages m
             WHERE m.sender_id = ? OR m.receiver_id = ?
         )
         ORDER BY last_at DESC",
        [$me, $me, $me, $me, $me, $me, $me, $me]
    );

    echo json_encode(['success' => true, 'data' => $threads ?? []]);
}

// ─── Messages in a thread ─────────────────────────────────────────────────

function handleMessages() {
    $me    = Auth::id();
    $other = (int)($_GET['with'] ?? 0);
    $since = trim($_GET['since'] ?? '');

    if (!$other) {
        echo json_encode(['success' => false, 'message' => 'with= required']);
        return;
    }

    $baseSql = "SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
                       m.attachment_path, m.attachment_name, m.attachment_type,
                       CONCAT(u.first_name, ' ', u.last_name) AS sender_name
                FROM messages m
                JOIN users u ON u.users_id = m.sender_id
                WHERE ((m.sender_id = ? AND m.receiver_id = ?)
                    OR (m.sender_id = ? AND m.receiver_id = ?))";
    $params = [$me, $other, $other, $me];

    if ($since !== '') {
        $baseSql .= " AND m.created_at > ?";
        $params[] = $since;
        $baseSql .= " ORDER BY m.created_at ASC";
        $messages = db()->fetchAll($baseSql, $params);
    } else {
        // Initial load: last 60 messages only (performance)
        $baseSql .= " ORDER BY m.created_at DESC LIMIT 60";
        $rows = db()->fetchAll($baseSql, $params) ?: [];
        $messages = array_reverse($rows);
    }

    echo json_encode(['success' => true, 'data' => $messages ?? []]);
}

// ─── Unread count ──────────────────────────────────────────────────────────

function handleUnreadCount() {
    $me  = Auth::id();
    $row = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM messages WHERE receiver_id = ? AND is_read = 0",
        [$me]
    );
    echo json_encode(['success' => true, 'count' => (int)($row['c'] ?? 0)]);
}

// ─── Send a message ────────────────────────────────────────────────────────

function handleSend() {
    $me   = Auth::id();
    $input = parseSendInput();

    $receiverId = (int)($input['receiver_id'] ?? 0);
    $content    = trim($input['content'] ?? '');
    $file       = $input['file'] ?? null;

    $attachmentPath = null;
    $attachmentName = null;
    $attachmentType = null;

    if ($file && ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $saved = saveMessageAttachment($file);
        if (!$saved['success']) {
            echo json_encode(['success' => false, 'message' => $saved['message']]);
            return;
        }
        $attachmentPath = $saved['path'];
        $attachmentName = $saved['name'];
        $attachmentType = $saved['type'];
        if ($content === '') {
            $content = '[Attachment] ' . $attachmentName;
        }
    }

    if (!$receiverId || ($content === '' && !$attachmentPath)) {
        echo json_encode(['success' => false, 'message' => 'Message or attachment required']);
        return;
    }

    if ($receiverId === $me) {
        echo json_encode(['success' => false, 'message' => 'Cannot message yourself']);
        return;
    }

    $receiver = db()->fetchOne("SELECT users_id FROM users WHERE users_id = ? AND status = 'active'", [$receiverId]);
    if (!$receiver) {
        echo json_encode(['success' => false, 'message' => 'Recipient not found']);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO messages (sender_id, receiver_id, content, attachment_path, attachment_name, attachment_type)
             VALUES (?, ?, ?, ?, ?, ?)"
        )->execute([$me, $receiverId, $content, $attachmentPath, $attachmentName, $attachmentType]);

        $msgId = pdo()->lastInsertId();

        $msg = db()->fetchOne(
            "SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
                    m.attachment_path, m.attachment_name, m.attachment_type,
                    CONCAT(u.first_name, ' ', u.last_name) AS sender_name
             FROM messages m JOIN users u ON u.users_id = m.sender_id
             WHERE m.message_id = ?",
            [$msgId]
        );

        echo json_encode(['success' => true, 'message' => 'Message sent', 'data' => $msg]);
    } catch (Exception $e) {
        error_log('MessagingAPI send: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to send message']);
    }
}

function parseSendInput() {
    $ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'multipart/form-data') !== false) {
        return [
            'receiver_id' => $_POST['receiver_id'] ?? 0,
            'content'     => $_POST['content'] ?? '',
            'file'        => $_FILES['attachment'] ?? null,
        ];
    }
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    return [
        'receiver_id' => $data['receiver_id'] ?? 0,
        'content'     => $data['content'] ?? '',
        'file'        => null,
    ];
}

function saveMessageAttachment(array $file) {
    $maxBytes = 2 * 1024 * 1024;
    $allowed  = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

    if (($file['size'] ?? 0) > $maxBytes) {
        return ['success' => false, 'message' => 'File too large (max 2MB)'];
    }

    $ext = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) {
        return ['success' => false, 'message' => 'Allowed: JPG, PNG, GIF, WEBP, PDF only'];
    }

    $uploadDir = __DIR__ . '/../uploads/messages/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $safeName = bin2hex(random_bytes(8)) . '_' . time() . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $uploadDir . $safeName)) {
        return ['success' => false, 'message' => 'Failed to save file'];
    }

    $isImage = in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true);

    return [
        'success' => true,
        'path'    => 'uploads/messages/' . $safeName,
        'name'    => $file['name'],
        'type'    => $isImage ? 'image' : 'file',
    ];
}

function serveAttachment() {
    $msgId = (int)($_GET['message_id'] ?? 0);
    $me    = Auth::id();

    if (!$msgId) {
        http_response_code(400);
        exit('Invalid message');
    }

    $msg = db()->fetchOne(
        "SELECT message_id, sender_id, receiver_id, attachment_path, attachment_name, attachment_type
         FROM messages WHERE message_id = ?",
        [$msgId]
    );

    if (!$msg || empty($msg['attachment_path'])) {
        http_response_code(404);
        exit('Not found');
    }

    if ((int)$msg['sender_id'] !== (int)$me && (int)$msg['receiver_id'] !== (int)$me) {
        http_response_code(403);
        exit('Forbidden');
    }

    $rel  = ltrim(str_replace(['..', '\\'], '', $msg['attachment_path']), '/');
    $file = realpath(__DIR__ . '/../' . $rel);
    $base = realpath(__DIR__ . '/../uploads/messages');

    if (!$file || !$base || strpos($file, $base) !== 0 || !is_file($file)) {
        http_response_code(404);
        exit('File not found');
    }

    $name = $msg['attachment_name'] ?: basename($file);
    $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $mime = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png', 'gif' => 'image/gif',
        'webp' => 'image/webp', 'pdf' => 'application/pdf',
    ][$ext] ?? 'application/octet-stream';

    $inline = in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'], true);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($file));
    $safeName = preg_replace('/[^\w.\-() ]/', '_', basename($name));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $safeName . '"');
    header('Cache-Control: private, max-age=3600');
    readfile($file);
    exit;
}

function ensureMessageSchema() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $col = db()->fetchOne("SHOW COLUMNS FROM messages LIKE 'attachment_path'");
        if (!$col) {
            pdo()->exec(
                "ALTER TABLE messages
                 ADD COLUMN attachment_path VARCHAR(500) NULL AFTER content,
                 ADD COLUMN attachment_name VARCHAR(200) NULL AFTER attachment_path,
                 ADD COLUMN attachment_type VARCHAR(20) NULL AFTER attachment_name"
            );
        }
    } catch (Exception $e) {
        error_log('MessagingAPI ensureMessageSchema: ' . $e->getMessage());
    }
}

// ─── Mark one conversation as read ────────────────────────────────────────

function handleMarkRead() {
    $me   = Auth::id();
    $data = json_decode(file_get_contents('php://input'), true) ?? [];

    $otherId = (int)($data['other_user_id'] ?? 0);
    if (!$otherId) {
        echo json_encode(['success' => false, 'message' => 'other_user_id required']);
        return;
    }

    try {
        pdo()->prepare(
            "UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0"
        )->execute([$otherId, $me]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to mark as read']);
    }
}

// ─── Mark ALL unread messages as read (single query) ──────────────────────

function handleMarkAllRead() {
    $me = Auth::id();
    try {
        $stmt = pdo()->prepare(
            "UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND is_read = 0"
        );
        $stmt->execute([$me]);
        $affected = $stmt->rowCount();
        echo json_encode(['success' => true, 'marked' => $affected]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to mark all as read']);
    }
}
