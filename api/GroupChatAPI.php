<?php
/**
 * Group Chat API
 *
 * Actions:
 *   GET  ?action=my_groups           — groups I belong to
 *   GET  ?action=group_messages&group_id=X  — messages in group
 *   GET  ?action=group_members&group_id=X   — members of group
 *   POST ?action=create_group         — {name, member_ids:[]}
 *   POST ?action=send_group_message   — {group_id, content}
 *   POST ?action=mark_group_read      — {group_id}
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

ensureGroupSchema();

$action = $_GET['action'] ?? 'my_groups';

switch ($action) {
    case 'my_groups':          handleMyGroups();        break;
    case 'group_messages':     handleGroupMessages();   break;
    case 'group_members':      handleGroupMembers();    break;
    case 'create_group':       handleCreateGroup();     break;
    case 'send_group_message': handleSendGroupMessage();break;
    case 'mark_group_read':    handleMarkGroupRead();   break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Schema setup ──────────────────────────────────────────────────────────

function ensureGroupSchema() {
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS group_chats (
            group_id    INT AUTO_INCREMENT PRIMARY KEY,
            group_name  VARCHAR(120) NOT NULL,
            created_by  INT NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created_by (created_by)
        )");
        pdo()->exec("CREATE TABLE IF NOT EXISTS group_chat_members (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            group_id    INT NOT NULL,
            user_id     INT NOT NULL,
            joined_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_read   TIMESTAMP NULL DEFAULT NULL,
            UNIQUE KEY uq_member (group_id, user_id),
            INDEX idx_group (group_id),
            INDEX idx_user (user_id)
        )");
        pdo()->exec("CREATE TABLE IF NOT EXISTS group_messages (
            message_id  INT AUTO_INCREMENT PRIMARY KEY,
            group_id    INT NOT NULL,
            sender_id   INT NOT NULL,
            content     TEXT NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_group (group_id),
            INDEX idx_sender (sender_id)
        )");
    } catch (Exception $e) {
        // Tables already exist — ignore
    }
}

// ─── My groups ─────────────────────────────────────────────────────────────

function handleMyGroups() {
    $me = Auth::id();

    $groups = db()->fetchAll(
        "SELECT g.group_id, g.group_name, g.created_by, g.created_at,
                (SELECT gm2.content FROM group_messages gm2 WHERE gm2.group_id = g.group_id ORDER BY gm2.created_at DESC LIMIT 1) AS last_message,
                (SELECT gm3.created_at FROM group_messages gm3 WHERE gm3.group_id = g.group_id ORDER BY gm3.created_at DESC LIMIT 1) AS last_at,
                (SELECT COUNT(*) FROM group_messages gm4 WHERE gm4.group_id = g.group_id AND gm4.sender_id != ? AND gm4.created_at > IFNULL((SELECT gcm2.last_read FROM group_chat_members gcm2 WHERE gcm2.group_id = g.group_id AND gcm2.user_id = ?), '1970-01-01')) AS unread,
                (SELECT COUNT(*) FROM group_chat_members gcm3 WHERE gcm3.group_id = g.group_id) AS member_count
         FROM group_chats g
         JOIN group_chat_members gcm ON gcm.group_id = g.group_id AND gcm.user_id = ?
         ORDER BY last_at DESC, g.created_at DESC",
        [$me, $me, $me]
    );

    echo json_encode(['success' => true, 'data' => $groups ?? []]);
}

// ─── Messages in a group ───────────────────────────────────────────────────

function handleGroupMessages() {
    $me      = Auth::id();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) { echo json_encode(['success' => false, 'message' => 'group_id required']); return; }

    // Must be a member
    $member = db()->fetchOne(
        "SELECT 1 FROM group_chat_members WHERE group_id = ? AND user_id = ?",
        [$groupId, $me]
    );
    if (!$member) { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Not a member']); return; }

    $messages = db()->fetchAll(
        "SELECT gm.message_id, gm.group_id, gm.sender_id, gm.content, gm.created_at,
                CONCAT(u.first_name, ' ', u.last_name) AS sender_name
         FROM group_messages gm
         JOIN users u ON u.users_id = gm.sender_id
         WHERE gm.group_id = ?
         ORDER BY gm.created_at DESC
         LIMIT 80",
        [$groupId]
    );
    $messages = array_reverse($messages ?: []);

    echo json_encode(['success' => true, 'data' => $messages]);
}

// ─── Group members ─────────────────────────────────────────────────────────

function handleGroupMembers() {
    $me      = Auth::id();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) { echo json_encode(['success' => false, 'message' => 'group_id required']); return; }

    $member = db()->fetchOne(
        "SELECT 1 FROM group_chat_members WHERE group_id = ? AND user_id = ?",
        [$groupId, $me]
    );
    if (!$member) { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Not a member']); return; }

    $members = db()->fetchAll(
        "SELECT u.users_id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.role
         FROM group_chat_members gcm
         JOIN users u ON u.users_id = gcm.user_id
         WHERE gcm.group_id = ?
         ORDER BY u.first_name, u.last_name",
        [$groupId]
    );

    echo json_encode(['success' => true, 'data' => $members ?? []]);
}

// ─── Create group ──────────────────────────────────────────────────────────

function handleCreateGroup() {
    $me    = Auth::id();
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $name      = trim($input['name'] ?? '');
    $memberIds = array_filter(array_map('intval', $input['member_ids'] ?? []));

    if (!$name) { echo json_encode(['success' => false, 'message' => 'Group name required']); return; }
    if (count($memberIds) < 1) { echo json_encode(['success' => false, 'message' => 'Select at least one member']); return; }

    try {
        $pdo = pdo();
        $pdo->prepare("INSERT INTO group_chats (group_name, created_by) VALUES (?, ?)")
            ->execute([$name, $me]);
        $groupId = (int)$pdo->lastInsertId();

        // Always add creator
        $allMembers = array_unique(array_merge([$me], $memberIds));
        $stmt = $pdo->prepare("INSERT IGNORE INTO group_chat_members (group_id, user_id) VALUES (?, ?)");
        foreach ($allMembers as $uid) {
            $stmt->execute([$groupId, $uid]);
        }

        echo json_encode(['success' => true, 'group_id' => $groupId, 'message' => 'Group created']);
    } catch (Exception $e) {
        error_log('GroupChatAPI create: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create group']);
    }
}

// ─── Send a message to a group ─────────────────────────────────────────────

function handleSendGroupMessage() {
    $me    = Auth::id();
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $groupId = (int)($input['group_id'] ?? 0);
    $content = trim($input['content'] ?? '');

    if (!$groupId || !$content) { echo json_encode(['success' => false, 'message' => 'group_id and content required']); return; }

    $member = db()->fetchOne(
        "SELECT 1 FROM group_chat_members WHERE group_id = ? AND user_id = ?",
        [$groupId, $me]
    );
    if (!$member) { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Not a member']); return; }

    try {
        pdo()->prepare("INSERT INTO group_messages (group_id, sender_id, content) VALUES (?, ?, ?)")
            ->execute([$groupId, $me, $content]);
        // Update last_read for sender immediately
        pdo()->prepare("UPDATE group_chat_members SET last_read = NOW() WHERE group_id = ? AND user_id = ?")
            ->execute([$groupId, $me]);

        echo json_encode(['success' => true, 'message' => 'Message sent']);
    } catch (Exception $e) {
        error_log('GroupChatAPI send: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to send message']);
    }
}

// ─── Mark group messages as read ───────────────────────────────────────────

function handleMarkGroupRead() {
    $me    = Auth::id();
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $groupId = (int)($input['group_id'] ?? 0);
    if (!$groupId) { echo json_encode(['success' => false, 'message' => 'group_id required']); return; }

    pdo()->prepare("UPDATE group_chat_members SET last_read = NOW() WHERE group_id = ? AND user_id = ?")
        ->execute([$groupId, $me]);

    echo json_encode(['success' => true]);
}
