<?php
/**
 * Content Bank API — social comments on shared materials & full quizzes
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/BankAccessHelper.php';
require_once __DIR__ . '/helpers/Sanitize.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action. Previously a hardcoded
// Auth::requireRole(['instructor','program_head','dean']) gated this whole
// file — that silently excluded admin (who does hold content_bank.* per
// RBAC) and used a page-redirect on failure, which breaks a JSON API's
// fetch().then(r => r.json()) on the frontend instead of returning 403 JSON.
$_cbPerms = [
    'comments'        => 'content_bank.view',
    'add-comment'     => 'content_bank.create',
    'comment-counts'  => 'content_bank.view',
];
if (isset($_cbPerms[$action]) && !Auth::can($_cbPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_cbPerms[$action]}"]);
    exit;
}

ensureBankCommentsTable();

switch ($action) {
    case 'comments':       getComments();      break;
    case 'add-comment':    addComment();       break;
    case 'comment-counts': getCommentCounts(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function ensureBankCommentsTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS bank_comments (
            comment_id INT AUTO_INCREMENT PRIMARY KEY,
            post_type ENUM('material','question','quiz') NOT NULL,
            post_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT NOT NULL,
            parent_comment_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_post (post_type, post_id),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {
        // Table may already exist
    }
}

function resolveBankPost($postType, $postId, $userId) {
    $postId = (int)$postId;
    if (!$postId) return null;

    if ($postType === 'material') {
        $row = db()->fetchOne(
            "SELECT lb.bank_id AS post_id, lb.subject_id, lb.visibility, lb.created_by
             FROM lesson_bank lb WHERE lb.bank_id = ?",
            [$postId]
        );
    } elseif ($postType === 'question') {
        $row = db()->fetchOne(
            "SELECT qb.qbank_id AS post_id, qb.subject_id, qb.visibility, qb.created_by
             FROM question_bank qb WHERE qb.qbank_id = ?",
            [$postId]
        );
    } elseif ($postType === 'quiz') {
        $row = db()->fetchOne(
            "SELECT q.quiz_id AS post_id, q.subject_id, q.status, q.user_teacher_id AS created_by
             FROM quiz q WHERE q.quiz_id = ?",
            [$postId]
        );
        if ($row) {
            $row['visibility'] = ($row['status'] ?? '') === 'published' ? 'public' : 'private';
        }
    } else {
        return null;
    }

    if (!$row) return null;

    if (!canAccessBankItem($userId, $row['created_by'], $row['visibility'], (int)$row['subject_id'])) {
        return null;
    }

    return $row;
}

function getComments() {
    $userId   = Auth::id();
    $postType = trim($_GET['post_type'] ?? '');
    $postId   = (int)($_GET['post_id'] ?? 0);

    if (!in_array($postType, ['material', 'question', 'quiz'], true) || !$postId) {
        echo json_encode(['success' => false, 'message' => 'post_type and post_id are required']);
        return;
    }

    if (!resolveBankPost($postType, $postId, $userId)) {
        echo json_encode(['success' => false, 'message' => 'Post not found or access denied']);
        return;
    }

    try {
        $comments = db()->fetchAll(
            "SELECT c.comment_id, c.post_type, c.post_id, c.user_id, c.content,
                    c.parent_comment_id, c.created_at,
                    u.first_name, u.last_name, u.role,
                    CONCAT(u.first_name, ' ', u.last_name) AS author_name,
                    (c.user_id = ?) AS is_mine
             FROM bank_comments c
             JOIN users u ON u.users_id = c.user_id
             WHERE c.post_type = ? AND c.post_id = ?
             ORDER BY c.created_at ASC",
            [$userId, $postType, $postId]
        );
        echo json_encode(['success' => true, 'data' => $comments ?: []]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function addComment() {
    $input    = json_decode(file_get_contents('php://input'), true) ?: [];
    $userId   = Auth::id();
    $postType = trim($input['post_type'] ?? '');
    $postId   = (int)($input['post_id'] ?? 0);
    $content  = Sanitize::text($input['content'] ?? '');
    $parentId = (int)($input['parent_comment_id'] ?? 0) ?: null;

    if (!in_array($postType, ['material', 'question', 'quiz'], true) || !$postId || !$content) {
        echo json_encode(['success' => false, 'message' => 'post_type, post_id, and content are required']);
        return;
    }

    if (!resolveBankPost($postType, $postId, $userId)) {
        echo json_encode(['success' => false, 'message' => 'Post not found or access denied']);
        return;
    }

    if ($parentId) {
        $parent = db()->fetchOne(
            "SELECT comment_id FROM bank_comments
             WHERE comment_id = ? AND post_type = ? AND post_id = ?",
            [$parentId, $postType, $postId]
        );
        if (!$parent) {
            echo json_encode(['success' => false, 'message' => 'Parent comment not found']);
            return;
        }
    }

    try {
        pdo()->prepare(
            "INSERT INTO bank_comments (post_type, post_id, user_id, content, parent_comment_id)
             VALUES (?, ?, ?, ?, ?)"
        )->execute([$postType, $postId, $userId, $content, $parentId]);

        $commentId = (int)pdo()->lastInsertId();
        $comment = db()->fetchOne(
            "SELECT c.comment_id, c.post_type, c.post_id, c.user_id, c.content,
                    c.parent_comment_id, c.created_at,
                    u.first_name, u.last_name, u.role,
                    CONCAT(u.first_name, ' ', u.last_name) AS author_name,
                    1 AS is_mine
             FROM bank_comments c
             JOIN users u ON u.users_id = c.user_id
             WHERE c.comment_id = ?",
            [$commentId]
        );

        echo json_encode(['success' => true, 'data' => $comment]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function getCommentCounts() {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $posts = $input['posts'] ?? [];
    $userId = Auth::id();

    if (!is_array($posts) || empty($posts)) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    $counts = [];
    $valid = [];

    foreach ($posts as $p) {
        $type = trim($p['post_type'] ?? '');
        $id   = (int)($p['post_id'] ?? 0);
        if (!in_array($type, ['material', 'question', 'quiz'], true) || !$id) continue;
        if (!resolveBankPost($type, $id, $userId)) continue;
        $key = $type . ':' . $id;
        $valid[$key] = ['post_type' => $type, 'post_id' => $id];
    }

    if (empty($valid)) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    try {
        $conditions = [];
        $params = [];
        foreach ($valid as $v) {
            $conditions[] = '(post_type = ? AND post_id = ?)';
            $params[] = $v['post_type'];
            $params[] = $v['post_id'];
        }

        $rows = db()->fetchAll(
            "SELECT post_type, post_id, COUNT(*) AS cnt
             FROM bank_comments
             WHERE " . implode(' OR ', $conditions) . "
             GROUP BY post_type, post_id",
            $params
        );

        foreach ($rows as $r) {
            $counts[$r['post_type'] . ':' . $r['post_id']] = (int)$r['cnt'];
        }

        echo json_encode(['success' => true, 'data' => $counts]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}
