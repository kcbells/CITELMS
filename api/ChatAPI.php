<?php
/**
 * CIT-LMS Chat API
 * Real-time messaging via AJAX polling
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ContentFilter.php';
require_once __DIR__ . '/helpers/ActivityLog.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'conversations': getConversations(); break;
    case 'messages': getMessages(); break;
    case 'send': sendMessage(); break;
    case 'start-conversation': startConversation(); break;
    case 'contacts': getContacts(); break;
    case 'unread-count': getUnreadCount(); break;
    case 'mark-read': markRead(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * Get user's conversations with last message and unread count
 */
function getConversations() {
    $userId = Auth::id();

    $conversations = db()->fetchAll(
        "SELECT c.conversation_id, c.type, c.name, c.subject_offered_id,
            (SELECT content FROM chat_messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message,
            (SELECT created_at FROM chat_messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message_at,
            (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE users_id = (SELECT sender_id FROM chat_messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1)) as last_sender,
            (SELECT COUNT(*) FROM chat_messages cm WHERE cm.conversation_id = c.conversation_id AND cm.created_at > IFNULL(cp.last_read_at, '1970-01-01') AND cm.sender_id != ?) as unread_count
         FROM chat_conversations c
         JOIN chat_participants cp ON c.conversation_id = cp.conversation_id AND cp.user_id = ?
         HAVING last_message_at IS NOT NULL
         ORDER BY last_message_at DESC",
        [$userId, $userId]
    );

    // For direct conversations, get the other participant's name
    foreach ($conversations as &$conv) {
        if ($conv['type'] === 'direct') {
            $other = db()->fetchOne(
                "SELECT u.first_name, u.last_name, u.role FROM chat_participants cp
                 JOIN users u ON cp.user_id = u.users_id
                 WHERE cp.conversation_id = ? AND cp.user_id != ?",
                [$conv['conversation_id'], $userId]
            );
            if ($other) {
                $conv['name'] = $other['first_name'] . ' ' . $other['last_name'];
                $conv['other_role'] = $other['role'];
            }
        }
    }

    echo json_encode(['success' => true, 'data' => $conversations ?: []]);
}

/**
 * Get messages for a conversation (supports polling with `since` param)
 */
function getMessages() {
    $userId = Auth::id();
    $convId = (int)($_GET['conversation_id'] ?? 0);
    $since = $_GET['since'] ?? null;

    if (!$convId) {
        echo json_encode(['success' => false, 'message' => 'Conversation ID required']);
        return;
    }

    // Verify user is participant
    $participant = db()->fetchOne(
        "SELECT * FROM chat_participants WHERE conversation_id = ? AND user_id = ?",
        [$convId, $userId]
    );
    if (!$participant) {
        echo json_encode(['success' => false, 'message' => 'Not a participant']);
        return;
    }

    $params = [$convId];
    $whereExtra = '';
    if ($since) {
        $whereExtra = 'AND m.created_at > ?';
        $params[] = $since;
    }

    $messages = db()->fetchAll(
        "SELECT m.message_id, m.sender_id, m.content, m.created_at,
                CONCAT(u.first_name, ' ', u.last_name) as sender_name, u.role as sender_role
         FROM chat_messages m
         JOIN users u ON m.sender_id = u.users_id
         WHERE m.conversation_id = ? $whereExtra
         ORDER BY m.created_at ASC",
        $params
    );

    echo json_encode(['success' => true, 'data' => $messages ?: []]);
}

/**
 * Send a message
 */
function sendMessage() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $userId = Auth::id();
    $data = json_decode(file_get_contents('php://input'), true);
    $convId = (int)($data['conversation_id'] ?? 0);
    $content = trim($data['content'] ?? '');

    if (!$convId || !$content) {
        echo json_encode(['success' => false, 'message' => 'Conversation ID and content required']);
        return;
    }
    if (contentFilterReject($content)) return;

    // Verify participant
    $participant = db()->fetchOne(
        "SELECT * FROM chat_participants WHERE conversation_id = ? AND user_id = ?",
        [$convId, $userId]
    );
    if (!$participant) {
        echo json_encode(['success' => false, 'message' => 'Not a participant']);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)"
        )->execute([$convId, $userId, $content]);

        // Update sender's last_read_at
        pdo()->prepare(
            "UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?"
        )->execute([$convId, $userId]);

        echo json_encode(['success' => true, 'message' => 'Sent', 'data' => ['message_id' => pdo()->lastInsertId()]]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to send']);
    }
}

/**
 * Start a new direct conversation
 */
function startConversation() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $userId = Auth::id();
    $data = json_decode(file_get_contents('php://input'), true);
    $targetUserId = (int)($data['user_id'] ?? 0);
    $type = $data['type'] ?? 'direct';

    if ($type === 'direct') {
        if (!$targetUserId) {
            echo json_encode(['success' => false, 'message' => 'Target user required']);
            return;
        }

        // Check if direct conversation already exists
        $existing = db()->fetchOne(
            "SELECT c.conversation_id FROM chat_conversations c
             JOIN chat_participants cp1 ON c.conversation_id = cp1.conversation_id AND cp1.user_id = ?
             JOIN chat_participants cp2 ON c.conversation_id = cp2.conversation_id AND cp2.user_id = ?
             WHERE c.type = 'direct'",
            [$userId, $targetUserId]
        );

        if ($existing) {
            echo json_encode(['success' => true, 'data' => ['conversation_id' => $existing['conversation_id'], 'existing' => true]]);
            return;
        }

        try {
            $pdo = pdo();
            $pdo->prepare("INSERT INTO chat_conversations (type, created_by) VALUES ('direct', ?)")->execute([$userId]);
            $convId = $pdo->lastInsertId();

            $pdo->prepare("INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)")->execute([$convId, $userId]);
            $pdo->prepare("INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)")->execute([$convId, $targetUserId]);

            echo json_encode(['success' => true, 'data' => ['conversation_id' => $convId]]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to create conversation']);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Only direct chats supported currently']);
    }
}

/**
 * Get available contacts (students see instructors, instructors see students)
 */
function getContacts() {
    $userId = Auth::id();
    $role = Auth::user()['role'];

    if ($role === 'student') {
        // Students see instructors of their enrolled subjects
        $contacts = db()->fetchAll(
            "SELECT DISTINCT u.users_id, u.first_name, u.last_name, u.role, s.subject_code
             FROM faculty_subject fs
             JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
             JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
             JOIN users u ON fs.user_teacher_id = u.users_id
             JOIN subject s ON so.subject_id = s.subject_id
             WHERE ss.user_student_id = ? AND ss.status = 'enrolled' AND fs.status = 'active'
             ORDER BY u.last_name, u.first_name",
            [$userId]
        );
    } elseif ($role === 'instructor') {
        // Instructors see students enrolled in their subjects
        $contacts = db()->fetchAll(
            "SELECT DISTINCT u.users_id, u.first_name, u.last_name, u.role, s.subject_code
             FROM student_subject ss
             JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
             JOIN faculty_subject fs ON fs.subject_offered_id = so.subject_offered_id
             JOIN users u ON ss.user_student_id = u.users_id
             JOIN subject s ON so.subject_id = s.subject_id
             WHERE fs.user_teacher_id = ? AND ss.status = 'enrolled' AND fs.status = 'active'
             ORDER BY u.last_name, u.first_name",
            [$userId]
        );
    } else {
        $contacts = [];
    }

    echo json_encode(['success' => true, 'data' => $contacts ?: []]);
}

/**
 * Get total unread message count
 */
function getUnreadCount() {
    $userId = Auth::id();

    $result = db()->fetchOne(
        "SELECT COALESCE(SUM(unread), 0) as total FROM (
            SELECT COUNT(*) as unread
            FROM chat_messages cm
            JOIN chat_participants cp ON cm.conversation_id = cp.conversation_id AND cp.user_id = ?
            WHERE cm.sender_id != ? AND cm.created_at > IFNULL(cp.last_read_at, '1970-01-01')
         ) t",
        [$userId, $userId]
    );

    echo json_encode(['success' => true, 'data' => ['count' => (int)($result['total'] ?? 0)]]);
}

/**
 * Mark conversation as read
 */
function markRead() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $userId = Auth::id();
    $data = json_decode(file_get_contents('php://input'), true);
    $convId = (int)($data['conversation_id'] ?? 0);

    if (!$convId) {
        echo json_encode(['success' => false, 'message' => 'Conversation ID required']);
        return;
    }

    try {
        pdo()->prepare(
            "UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?"
        )->execute([$convId, $userId]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed']);
    }
}
