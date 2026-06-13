<?php
/**
 * Lesson Bank API
 * Shared lesson repository — instructors can publish, browse, and copy lessons
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/BankAccessHelper.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

Auth::requireRole('instructor');

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action
$_lbPerms = [
    'browse'   => 'lessons.view',
    'my-bank'  => 'lessons.view',
    'subjects' => 'lessons.view',
    'publish'  => 'lessons.create',
    'copy'     => 'lessons.create',
    'delete'   => 'lessons.delete',
];
if (isset($_lbPerms[$action]) && !Auth::can($_lbPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_lbPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'browse':    browseBank();    break;
    case 'my-bank':   myBank();        break;
    case 'publish':   publishLesson(); break;
    case 'copy':      copyLesson();    break;
    case 'delete':    deleteLesson();  break;
    case 'subjects':  bankSubjects();  break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Browse all public lessons (+ own private ones) ──────────────────────────

function browseBank() {
    $userId   = Auth::id();
    $search   = trim($_GET['search']   ?? '');
    $subjectId = (int)($_GET['subject_id'] ?? 0);

    $handled = bankSubjectInClause($userId);
    if ($handled['sql'] === '0') {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    $where  = "lb.visibility = 'public' AND lb.subject_id IN ({$handled['sql']})";
    $params = $handled['params'];

    if ($search) {
        $where  .= " AND (lb.lesson_title LIKE ? OR lb.lesson_description LIKE ? OR lb.tags LIKE ?)";
        $like    = "%$search%";
        $params  = array_merge($params, [$like, $like, $like]);
    }

    if ($subjectId) {
        $where  .= " AND lb.subject_id = ?";
        $params[] = $subjectId;
    }

    $lessons = db()->fetchAll(
        "SELECT lb.bank_id, lb.lesson_title, lb.lesson_description, lb.lesson_content,
                lb.subject_id, lb.visibility, lb.tags, lb.copy_count,
                lb.attachment_type, lb.attachment_path, lb.attachment_name,
                lb.created_at,
                s.subject_code, s.subject_name,
                u.first_name, u.last_name,
                (lb.created_by = ?) AS is_own
         FROM lesson_bank lb
         LEFT JOIN subject s ON lb.subject_id = s.subject_id
         JOIN users u ON lb.created_by = u.users_id
         WHERE $where
         ORDER BY lb.copy_count DESC, lb.created_at DESC",
        array_merge([$userId], $params)
    );

    echo json_encode(['success' => true, 'data' => $lessons ?: []]);
}

// ─── My Bank: only own lessons ───────────────────────────────────────────────

function myBank() {
    $userId = Auth::id();

    $lessons = db()->fetchAll(
        "SELECT lb.bank_id, lb.lesson_title, lb.lesson_description, lb.lesson_content,
                lb.subject_id, lb.visibility, lb.tags, lb.copy_count,
                lb.attachment_type, lb.attachment_path, lb.attachment_name,
                lb.created_at, lb.updated_at,
                s.subject_code, s.subject_name
         FROM lesson_bank lb
         LEFT JOIN subject s ON lb.subject_id = s.subject_id
         WHERE lb.created_by = ?
         ORDER BY lb.updated_at DESC",
        [$userId]
    );

    echo json_encode(['success' => true, 'data' => $lessons ?: []]);
}

// ─── Publish: create a new bank lesson (or publish from existing lesson) ─────

function publishLesson() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $userId = Auth::id();

    // Detect multipart (file upload) vs JSON
    $isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart') !== false;
    $data = $isMultipart ? $_POST : (json_decode(file_get_contents('php://input'), true) ?? []);

    // Support publishing from an existing lessons_id
    if (!empty($data['lessons_id'])) {
        $lessonId = (int)$data['lessons_id'];
        $existing = db()->fetchOne(
            "SELECT * FROM lessons WHERE lessons_id = ? AND user_teacher_id = ?",
            [$lessonId, $userId]
        );
        if (!$existing) {
            echo json_encode(['success' => false, 'message' => 'Lesson not found or not yours']);
            return;
        }
        $title       = $existing['lesson_title'];
        $description = $existing['lesson_description'] ?? '';
        $content     = $existing['lesson_content'] ?? '';
        $subjectId   = $existing['subject_id'] ?? null;
    } else {
        $title = trim($data['lesson_title'] ?? '');
        if (!$title) {
            echo json_encode(['success' => false, 'message' => 'Title is required']);
            return;
        }
        $description = trim($data['lesson_description'] ?? '');
        $content     = trim($data['lesson_content']     ?? '');
        $subjectId   = !empty($data['subject_id']) ? (int)$data['subject_id'] : null;
    }

    $visibility = in_array($data['visibility'] ?? 'public', ['public', 'private'])
                  ? $data['visibility'] : 'public';
    $tags = trim($data['tags'] ?? '');

    // ── Handle attachment ────────────────────────────────────────────────────
    $attachmentType = 'none';
    $attachmentPath = null;
    $attachmentName = null;

    $inputAttType = $data['attachment_type'] ?? 'none';

    if ($inputAttType === 'link') {
        $link = trim($data['attachment_url'] ?? '');
        if ($link) {
            $attachmentType = 'link';
            $attachmentPath = $link;
            $attachmentName = trim($data['attachment_name'] ?? '') ?: $link;
        }
    } elseif ($inputAttType === 'file' && isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
        $file    = $_FILES['attachment'];
        $allowed = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif'];
        $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        if (!in_array($ext, $allowed)) {
            echo json_encode(['success' => false, 'message' => 'File type not allowed. Use PDF, Word, or image files.']);
            return;
        }
        if ($file['size'] > 10 * 1024 * 1024) {
            echo json_encode(['success' => false, 'message' => 'File too large. Maximum 10MB allowed.']);
            return;
        }

        $uploadDir = __DIR__ . '/../uploads/lesson_bank/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $filename = uniqid('lb_') . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
        if (move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
            $attachmentType = 'file';
            $attachmentPath = '/COC-LMS/uploads/lesson_bank/' . $filename;
            $attachmentName = $file['name'];
        } else {
            echo json_encode(['success' => false, 'message' => 'Failed to save uploaded file.']);
            return;
        }
    }

    try {
        $pdo = pdo();
        $pdo->prepare(
            "INSERT INTO lesson_bank
             (lesson_title, lesson_description, lesson_content, subject_id, created_by, visibility, tags,
              attachment_type, attachment_path, attachment_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $title, $description ?: null, $content ?: null,
            $subjectId, $userId, $visibility, $tags ?: null,
            $attachmentType, $attachmentPath, $attachmentName
        ]);

        echo json_encode(['success' => true, 'message' => 'Lesson published to bank', 'bank_id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        error_log('LessonBank publish: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to publish lesson']);
    }
}

// ─── Copy: duplicate a bank lesson into instructor's subject ─────────────────

function copyLesson() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId    = Auth::id();
    $bankId    = (int)($data['bank_id']    ?? 0);
    $subjectId = (int)($data['subject_id'] ?? 0);

    if (!$bankId || !$subjectId) {
        echo json_encode(['success' => false, 'message' => 'bank_id and subject_id are required']);
        return;
    }

    $bankLesson = db()->fetchOne("SELECT * FROM lesson_bank WHERE bank_id = ?", [$bankId]);
    if (!$bankLesson || !canAccessBankItem($userId, $bankLesson['created_by'], $bankLesson['visibility'], $bankLesson['subject_id'])) {
        echo json_encode(['success' => false, 'message' => 'Lesson not found or not shared for your subjects']);
        return;
    }

    // Verify the instructor teaches this subject
    $subjectCheck = db()->fetchOne(
        "SELECT subject_offered_id FROM subject_offered
         WHERE user_teacher_id = ? AND subject_id = ?
         LIMIT 1",
        [$userId, $subjectId]
    );
    if (!$subjectCheck) {
        echo json_encode(['success' => false, 'message' => 'You do not teach this subject']);
        return;
    }

    try {
        $pdo = pdo();

        // Get the next lesson order for that subject
        $maxOrder = db()->fetchOne(
            "SELECT COALESCE(MAX(lesson_order), 0) + 1 AS next_order FROM lessons WHERE subject_id = ? AND user_teacher_id = ?",
            [$subjectId, $userId]
        )['next_order'] ?? 1;

        $pdo->prepare(
            "INSERT INTO lessons
             (subject_id, user_teacher_id, lesson_title, lesson_description, lesson_content, lesson_order, status)
             VALUES (?, ?, ?, ?, ?, ?, 'draft')"
        )->execute([
            $subjectId,
            $userId,
            $bankLesson['lesson_title'] . ' (copied)',
            $bankLesson['lesson_description'],
            $bankLesson['lesson_content'],
            $maxOrder
        ]);

        $newLessonId = $pdo->lastInsertId();

        // Increment copy count
        $pdo->prepare("UPDATE lesson_bank SET copy_count = copy_count + 1 WHERE bank_id = ?")
            ->execute([$bankId]);

        echo json_encode([
            'success'    => true,
            'message'    => 'Lesson copied to your classes',
            'lesson_id'  => $newLessonId
        ]);
    } catch (PDOException $e) {
        error_log('LessonBank copy: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to copy lesson']);
    }
}

// ─── Subjects: distinct subjects visible in lesson bank ──────────────────────

function bankSubjects() {
    $userId = Auth::id();
    $handled = bankSubjectInClause($userId);
    if ($handled['sql'] === '0') {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }
    $subjects = db()->fetchAll(
        "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name
         FROM lesson_bank lb
         JOIN subject s ON lb.subject_id = s.subject_id
         WHERE lb.visibility = 'public' AND lb.subject_id IN ({$handled['sql']})
         ORDER BY s.subject_code",
        $handled['params']
    );
    echo json_encode(['success' => true, 'data' => $subjects ?: []]);
}

// ─── Delete: remove own bank lesson ─────────────────────────────────────────

function deleteLesson() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data   = json_decode(file_get_contents('php://input'), true) ?? [];
    $userId = Auth::id();
    $bankId = (int)($data['bank_id'] ?? 0);

    if (!$bankId) {
        echo json_encode(['success' => false, 'message' => 'bank_id required']);
        return;
    }

    $lesson = db()->fetchOne(
        "SELECT bank_id FROM lesson_bank WHERE bank_id = ? AND created_by = ?",
        [$bankId, $userId]
    );
    if (!$lesson) {
        echo json_encode(['success' => false, 'message' => 'Lesson not found or not yours']);
        return;
    }

    try {
        pdo()->prepare("DELETE FROM lesson_bank WHERE bank_id = ?")->execute([$bankId]);
        echo json_encode(['success' => true, 'message' => 'Lesson removed from bank']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to delete lesson']);
    }
}
