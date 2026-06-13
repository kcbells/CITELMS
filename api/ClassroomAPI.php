<?php
/**
 * Classroom API — teacher, classmates, class comments
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ClassworkDueHelper.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

ensureCommentsTable();
ensureWorkFilesTable();
ensureClassworkViewsTable();

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'info':              getClassroomInfo(); break;
    case 'classmates':        getClassmates();    break;
    case 'comments':          getComments();      break;
    case 'add-comment':       addComment();       break;
    case 'submissions':       getSubmissions();   break;
    case 'upload-submission': uploadSubmission(); break;
    case 'delete-submission': deleteSubmission(); break;
    case 'submit-work':       submitWork();       break;
    case 'set-due-date':      setClassworkDueDate(); break;
    case 'record-view':       recordContentView(); break;
    case 'content-views':     getContentViews();  break;
    case 'view-summary':      getViewSummary();   break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function ensureCommentsTable() {
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS class_comments (
            comment_id   INT AUTO_INCREMENT PRIMARY KEY,
            subject_id   INT NOT NULL,
            lessons_id   INT NULL,
            quiz_id      INT NULL,
            user_id      INT NOT NULL,
            content      TEXT NOT NULL,
            is_private   TINYINT(1) NOT NULL DEFAULT 0,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_subject (subject_id),
            INDEX idx_lesson (lessons_id),
            INDEX idx_quiz (quiz_id),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        try {
            pdo()->exec("ALTER TABLE class_comments ADD COLUMN quiz_id INT NULL AFTER lessons_id");
        } catch (Exception $e) { /* column exists */ }
        try {
            pdo()->exec("ALTER TABLE class_comments ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0 AFTER content");
        } catch (Exception $e) { /* column exists */ }
        try {
            pdo()->exec("ALTER TABLE class_comments ADD COLUMN parent_comment_id INT NULL AFTER is_private");
        } catch (Exception $e) { /* column exists */ }
        try {
            pdo()->exec("ALTER TABLE class_comments ADD COLUMN thread_user_id INT NULL COMMENT 'Student owner of private thread' AFTER parent_comment_id");
        } catch (Exception $e) { /* column exists */ }
    } catch (Exception $e) {
        // Table may already exist with different engine — ignore
    }
}

/** Student enrollment or instructor ownership of this subject */
function requireClassAccess($subjectId, $userId) {
    $role = Auth::role();

    if ($role === 'instructor') {
        $row = db()->fetchOne(
            "SELECT so.subject_offered_id, s.subject_id, s.subject_code, s.subject_name, s.units,
                    (SELECT sec.section_id FROM section_subject ss
                     JOIN section sec ON sec.section_id = ss.section_id
                     WHERE ss.subject_offered_id = so.subject_offered_id AND ss.status = 'active'
                     ORDER BY sec.section_name LIMIT 1) AS section_id,
                    (SELECT GROUP_CONCAT(DISTINCT sec.section_name ORDER BY sec.section_name SEPARATOR ', ')
                     FROM section_subject ss
                     JOIN section sec ON sec.section_id = ss.section_id
                     WHERE ss.subject_offered_id = so.subject_offered_id AND ss.status = 'active') AS section_name,
                    (SELECT GROUP_CONCAT(DISTINCT ss.schedule ORDER BY sec.section_name SEPARATOR ', ')
                     FROM section_subject ss
                     JOIN section sec ON sec.section_id = ss.section_id
                     WHERE ss.subject_offered_id = so.subject_offered_id AND ss.status = 'active') AS schedule,
                    (SELECT GROUP_CONCAT(DISTINCT ss.room ORDER BY sec.section_name SEPARATOR ', ')
                     FROM section_subject ss
                     JOIN section sec ON sec.section_id = ss.section_id
                     WHERE ss.subject_offered_id = so.subject_offered_id AND ss.status = 'active') AS room
             FROM subject_offered so
             JOIN subject s ON s.subject_id = so.subject_id
             WHERE so.user_teacher_id = ? AND s.subject_id = ? AND so.status = 'open'
             ORDER BY so.subject_offered_id DESC
             LIMIT 1",
            [$userId, $subjectId]
        );
        if (!$row) {
            echo json_encode(['success' => false, 'message' => 'You are not assigned to this subject']);
            exit;
        }
        $row['is_instructor'] = true;
        return $row;
    }

    $row = db()->fetchOne(
        "SELECT ss.student_subject_id, ss.section_id, ss.subject_offered_id,
                s.subject_id, s.subject_code, s.subject_name, s.units,
                sec.section_name, secsubj.schedule, secsubj.room
         FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         JOIN subject s ON s.subject_id = so.subject_id
         LEFT JOIN section sec ON sec.section_id = ss.section_id
         LEFT JOIN section_subject secsubj ON secsubj.section_id = ss.section_id
                                          AND secsubj.subject_offered_id = ss.subject_offered_id
         WHERE ss.user_student_id = ? AND s.subject_id = ? AND ss.status = 'enrolled'
         LIMIT 1",
        [$userId, $subjectId]
    );
    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'Not enrolled in this subject']);
        exit;
    }
    $row['is_instructor'] = false;
    return $row;
}

function requireEnrollment($subjectId, $userId) {
    return requireClassAccess($subjectId, $userId);
}

function getClassroomInfo() {
    $subjectId = (int)($_GET['subject_id'] ?? 0);
    $userId    = Auth::id();

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'Subject ID required']);
        return;
    }

    try {
        $enrollment = requireClassAccess($subjectId, $userId);
        $isInstructor = !empty($enrollment['is_instructor']);

        $teacher = $isInstructor
            ? db()->fetchOne(
                "SELECT users_id, first_name, last_name, email,
                        CONCAT(first_name, ' ', last_name) AS full_name
                 FROM users WHERE users_id = ?",
                [$userId]
            )
            : db()->fetchOne(
                "SELECT u.users_id, u.first_name, u.last_name, u.email,
                        CONCAT(u.first_name, ' ', u.last_name) AS full_name
                 FROM subject_offered so
                 JOIN users u ON u.users_id = so.user_teacher_id
                 WHERE so.subject_offered_id = ?",
                [$enrollment['subject_offered_id']]
            );

        if ($isInstructor) {
            $classmateCount = db()->fetchOne(
                "SELECT COUNT(DISTINCT ss.user_student_id) AS cnt
                 FROM subject_offered so
                 JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
                 JOIN users u ON u.users_id = ss.user_student_id AND u.role = 'student'
                 WHERE so.user_teacher_id = ? AND so.subject_id = ?",
                [$userId, $subjectId]
            );
        } else {
            $classmateCount = db()->fetchOne(
                "SELECT COUNT(*) AS cnt FROM student_subject ss
                 JOIN users u ON u.users_id = ss.user_student_id
                 WHERE ss.section_id = ? AND ss.subject_offered_id = ?
                   AND ss.status = 'enrolled' AND u.role = 'student'",
                [$enrollment['section_id'], $enrollment['subject_offered_id']]
            );
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'subject' => $enrollment,
                'teacher' => $teacher,
                'classmate_count' => (int)($classmateCount['cnt'] ?? 0),
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function getClassmates() {
    $subjectId = (int)($_GET['subject_id'] ?? 0);
    $userId    = Auth::id();

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'Subject ID required']);
        return;
    }

    try {
        $enrollment = requireClassAccess($subjectId, $userId);
        $isInstructor = !empty($enrollment['is_instructor']);

        $sectionFilter = (int)($_GET['section_id'] ?? 0);

        if ($isInstructor) {
            $sql = "SELECT DISTINCT u.users_id, u.first_name, u.last_name, u.student_id, u.email,
                        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
                        sec.section_name, ss.section_id,
                        0 AS is_me
                 FROM subject_offered so
                 JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status = 'enrolled'
                 JOIN users u ON u.users_id = ss.user_student_id AND u.role = 'student'
                 LEFT JOIN section sec ON sec.section_id = ss.section_id
                 WHERE so.user_teacher_id = ? AND so.subject_id = ?";
            $params = [$userId, $subjectId];
            if ($sectionFilter) {
                $sql .= " AND ss.section_id = ?";
                $params[] = $sectionFilter;
            }
            $sql .= " ORDER BY u.last_name, u.first_name";
            $classmates = db()->fetchAll($sql, $params);
        } else {
            $classmates = db()->fetchAll(
                "SELECT u.users_id, u.first_name, u.last_name, u.student_id, u.email,
                        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
                        (u.users_id = ?) AS is_me
                 FROM student_subject ss
                 JOIN users u ON u.users_id = ss.user_student_id
                 WHERE ss.section_id = ? AND ss.subject_offered_id = ?
                   AND ss.status = 'enrolled' AND u.role = 'student'
                 ORDER BY u.last_name, u.first_name",
                [$userId, $enrollment['section_id'], $enrollment['subject_offered_id']]
            );
        }

        echo json_encode(['success' => true, 'data' => $classmates]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function getComments() {
    $subjectId  = (int)($_GET['subject_id'] ?? 0);
    $lessonsId  = isset($_GET['lessons_id']) && $_GET['lessons_id'] !== ''
        ? (int)$_GET['lessons_id'] : null;
    $quizId     = isset($_GET['quiz_id']) && $_GET['quiz_id'] !== ''
        ? (int)$_GET['quiz_id'] : null;
    $visibility = $_GET['visibility'] ?? 'public';
    $userId     = Auth::id();

    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'Subject ID required']);
        return;
    }

    try {
        $access = requireClassAccess($subjectId, $userId);
        $isInstructor = !empty($access['is_instructor']);
        $privateFilter = $isInstructor
            ? 'AND c.is_private = 1'
            : 'AND c.is_private = 1 AND (c.thread_user_id = ? OR (c.thread_user_id IS NULL AND c.user_id = ?))';
        $publicFilter = 'AND c.is_private = 0';
        $visFilter = $visibility === 'private' ? $privateFilter : $publicFilter;
        $visParams = ($visibility === 'private' && !$isInstructor) ? [$userId, $userId] : [];

        $commentSelect = "SELECT c.comment_id, c.subject_id, c.lessons_id, c.quiz_id, c.user_id,
                        c.content, c.is_private, c.parent_comment_id, c.thread_user_id, c.created_at,
                        u.first_name, u.last_name, u.role,
                        CONCAT(u.first_name, ' ', u.last_name) AS author_name,
                        (c.user_id = ?) AS is_mine";

        if ($lessonsId) {
            $comments = db()->fetchAll(
                "{$commentSelect}
                 FROM class_comments c
                 JOIN users u ON u.users_id = c.user_id
                 WHERE c.subject_id = ? AND c.lessons_id = ? $visFilter
                 ORDER BY c.created_at ASC",
                array_merge([$userId, $subjectId, $lessonsId], $visParams)
            );
        } elseif ($quizId) {
            $comments = db()->fetchAll(
                "{$commentSelect}
                 FROM class_comments c
                 JOIN users u ON u.users_id = c.user_id
                 WHERE c.subject_id = ? AND c.quiz_id = ? $visFilter
                 ORDER BY c.created_at ASC",
                array_merge([$userId, $subjectId, $quizId], $visParams)
            );
        } else {
            $comments = db()->fetchAll(
                "{$commentSelect}
                 FROM class_comments c
                 JOIN users u ON u.users_id = c.user_id
                 WHERE c.subject_id = ? AND c.lessons_id IS NULL AND c.quiz_id IS NULL $visFilter
                 ORDER BY c.created_at ASC",
                array_merge([$userId, $subjectId], $visParams)
            );
        }

        echo json_encode(['success' => true, 'data' => $comments]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function addComment() {
    $input     = json_decode(file_get_contents('php://input'), true) ?: [];
    $subjectId = (int)($input['subject_id'] ?? 0);
    $lessonsId = isset($input['lessons_id']) && $input['lessons_id'] !== ''
        ? (int)$input['lessons_id'] : null;
    $quizId    = isset($input['quiz_id']) && $input['quiz_id'] !== ''
        ? (int)$input['quiz_id'] : null;
    $content   = trim($input['content'] ?? '');
    $isPrivate = !empty($input['is_private']);
    $parentId  = (int)($input['parent_comment_id'] ?? 0);
    $userId    = Auth::id();
    $threadUserId = null;

    if (!$subjectId || !$content) {
        echo json_encode(['success' => false, 'message' => 'Subject and comment text are required']);
        return;
    }

    if (strlen($content) > 2000) {
        echo json_encode(['success' => false, 'message' => 'Comment is too long (max 2000 characters)']);
        return;
    }

    try {
        $access = requireClassAccess($subjectId, $userId);
        $isInstructor = !empty($access['is_instructor']);

        if ($isInstructor) {
            if ($parentId) {
                $parent = db()->fetchOne(
                    "SELECT comment_id, user_id, thread_user_id, is_private FROM class_comments WHERE comment_id = ?",
                    [$parentId]
                );
                if (!$parent || !$parent['is_private']) {
                    echo json_encode(['success' => false, 'message' => 'Cannot reply to this comment']);
                    return;
                }
                $threadUserId = (int)($parent['thread_user_id'] ?: $parent['user_id']);
                $isPrivate = true;
            } elseif ($isPrivate) {
                echo json_encode(['success' => false, 'message' => 'Use Reply on a student comment to send a private message']);
                return;
            }
        } elseif ($isPrivate) {
            $threadUserId = $userId;
            if ($parentId) {
                $parent = db()->fetchOne(
                    "SELECT comment_id, user_id, thread_user_id, is_private FROM class_comments WHERE comment_id = ?",
                    [$parentId]
                );
                if (!$parent || !$parent['is_private']) {
                    echo json_encode(['success' => false, 'message' => 'Cannot reply to this comment']);
                    return;
                }
                $threadUserId = (int)($parent['thread_user_id'] ?: $parent['user_id']);
                if ($threadUserId !== $userId) {
                    echo json_encode(['success' => false, 'message' => 'Not allowed to reply in this thread']);
                    return;
                }
            }
        }

        if ($lessonsId) {
            $lessonSql = $isInstructor
                ? "SELECT lessons_id FROM lessons WHERE lessons_id = ? AND subject_id = ?"
                : "SELECT lessons_id FROM lessons WHERE lessons_id = ? AND subject_id = ? AND status = 'published'";
            $lesson = db()->fetchOne($lessonSql, [$lessonsId, $subjectId]);
            if (!$lesson) {
                echo json_encode(['success' => false, 'message' => 'Classwork item not found']);
                return;
            }
        }

        if ($quizId) {
            $quizSql = $isInstructor
                ? "SELECT quiz_id FROM quiz WHERE quiz_id = ? AND subject_id = ?"
                : "SELECT quiz_id FROM quiz WHERE quiz_id = ? AND subject_id = ? AND status = 'published'";
            $quiz = db()->fetchOne($quizSql, [$quizId, $subjectId]);
            if (!$quiz) {
                echo json_encode(['success' => false, 'message' => 'Quiz not found']);
                return;
            }
        }

        pdo()->prepare(
            "INSERT INTO class_comments (subject_id, lessons_id, quiz_id, user_id, content, is_private, parent_comment_id, thread_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $subjectId, $lessonsId, $quizId, $userId, $content, $isPrivate ? 1 : 0,
            $parentId > 0 ? $parentId : null,
            $threadUserId,
        ]);

        $commentId = (int)pdo()->lastInsertId();
        $comment = db()->fetchOne(
            "SELECT c.comment_id, c.subject_id, c.lessons_id, c.quiz_id, c.user_id, c.content, c.is_private,
                    c.parent_comment_id, c.thread_user_id, c.created_at,
                    u.first_name, u.last_name, u.role,
                    CONCAT(u.first_name, ' ', u.last_name) AS author_name,
                    1 AS is_mine
             FROM class_comments c
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

function ensureWorkFilesTable() {
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS student_work_files (
            file_id INT AUTO_INCREMENT PRIMARY KEY,
            user_student_id INT NOT NULL,
            subject_id INT NOT NULL,
            lessons_id INT NULL,
            quiz_id INT NULL,
            file_name VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            file_type VARCHAR(50) DEFAULT 'document',
            file_size INT DEFAULT 0,
            is_submitted TINYINT(1) NOT NULL DEFAULT 0,
            submitted_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_student_lesson (user_student_id, lessons_id),
            INDEX idx_student_quiz (user_student_id, quiz_id),
            INDEX idx_subject (subject_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {
        // Table may already exist
    }
}

function getSubmissions() {
    $subjectId  = (int)($_GET['subject_id'] ?? 0);
    $lessonsId  = isset($_GET['lessons_id']) && $_GET['lessons_id'] !== ''
        ? (int)$_GET['lessons_id'] : null;
    $quizId     = isset($_GET['quiz_id']) && $_GET['quiz_id'] !== ''
        ? (int)$_GET['quiz_id'] : null;
    $userId     = Auth::id();

    if (!$subjectId || (!$lessonsId && !$quizId)) {
        echo json_encode(['success' => false, 'message' => 'Subject and classwork item required']);
        return;
    }

    try {
        $access = requireClassAccess($subjectId, $userId);
        $isInstructor = !empty($access['is_instructor']);

        $where = 'c.subject_id = ?';
        $params = [$subjectId];

        if ($lessonsId) {
            $where .= ' AND c.lessons_id = ?';
            $params[] = $lessonsId;
        } else {
            $where .= ' AND c.quiz_id = ?';
            $params[] = $quizId;
        }

        if (!$isInstructor) {
            $where .= ' AND c.user_student_id = ?';
            $params[] = $userId;
        } elseif (!empty($_GET['submitted_only'])) {
            $where .= ' AND c.is_submitted = 1';
        }

        $orderBy = $isInstructor
            ? 'COALESCE(c.submitted_at, c.created_at) ASC, c.user_student_id ASC, c.file_id ASC'
            : 'c.created_at ASC';

        $files = db()->fetchAll(
            "SELECT c.file_id, c.user_student_id, c.subject_id, c.lessons_id, c.quiz_id,
                    c.file_name, c.original_name, c.file_path, c.file_type, c.file_size,
                    c.is_submitted, c.submitted_at, c.created_at,
                    CONCAT(u.first_name, ' ', u.last_name) AS student_name,
                    u.student_id,
                    (c.user_student_id = ?) AS is_mine
             FROM student_work_files c
             JOIN users u ON u.users_id = c.user_student_id
             WHERE $where
             ORDER BY $orderBy",
            array_merge([$userId], $params)
        );

        echo json_encode(['success' => true, 'data' => $files]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function uploadSubmission() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $subjectId = (int)($_POST['subject_id'] ?? 0);
    $lessonsId = isset($_POST['lessons_id']) && $_POST['lessons_id'] !== ''
        ? (int)$_POST['lessons_id'] : null;
    $quizId    = isset($_POST['quiz_id']) && $_POST['quiz_id'] !== ''
        ? (int)$_POST['quiz_id'] : null;
    $userId    = Auth::id();

    if (!$subjectId || (!$lessonsId && !$quizId)) {
        echo json_encode(['success' => false, 'message' => 'Subject and classwork item required']);
        return;
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        return;
    }

    $file = $_FILES['file'];
    $maxFileSize = 10 * 1024 * 1024;
    $allowedExt = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'zip'];

    if ($file['size'] > $maxFileSize) {
        echo json_encode(['success' => false, 'message' => 'File too large (max 10MB)']);
        return;
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt, true)) {
        echo json_encode(['success' => false, 'message' => 'File type not allowed']);
        return;
    }

    try {
        requireClassAccess($subjectId, $userId);
        assertStudentCanTurnIn($subjectId, $lessonsId, $quizId, $userId);

        if ($lessonsId) {
            $item = db()->fetchOne(
                "SELECT lessons_id FROM lessons WHERE lessons_id = ? AND subject_id = ? AND status = 'published'",
                [$lessonsId, $subjectId]
            );
        } else {
            $item = db()->fetchOne(
                "SELECT quiz_id FROM quiz WHERE quiz_id = ? AND subject_id = ? AND status = 'published'",
                [$quizId, $subjectId]
            );
        }
        if (!$item) {
            echo json_encode(['success' => false, 'message' => 'Classwork item not found']);
            return;
        }

        $submitted = db()->fetchOne(
            "SELECT file_id FROM student_work_files
             WHERE user_student_id = ? AND subject_id = ? AND is_submitted = 1
               AND " . ($lessonsId ? 'lessons_id = ?' : 'quiz_id = ?') . "
             LIMIT 1",
            $lessonsId
                ? [$userId, $subjectId, $lessonsId]
                : [$userId, $subjectId, $quizId]
        );
        if ($submitted) {
            echo json_encode(['success' => false, 'message' => 'Work already submitted — cannot add more files']);
            return;
        }

        $uploadDir = __DIR__ . '/../uploads/submissions/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $storedName = 'sub_' . $userId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $destPath = $uploadDir . $storedName;
        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            echo json_encode(['success' => false, 'message' => 'Failed to save file']);
            return;
        }

        $relPath = 'uploads/submissions/' . $storedName;
        pdo()->prepare(
            "INSERT INTO student_work_files
                (user_student_id, subject_id, lessons_id, quiz_id, file_name, original_name, file_path, file_type, file_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $userId, $subjectId, $lessonsId, $quizId,
            $storedName, $file['name'], $relPath, $ext, (int)$file['size']
        ]);

        $fileId = (int)pdo()->lastInsertId();
        $row = db()->fetchOne(
            "SELECT file_id, user_student_id, subject_id, lessons_id, quiz_id,
                    file_name, original_name, file_path, file_type, file_size,
                    is_submitted, submitted_at, created_at, 1 AS is_mine
             FROM student_work_files WHERE file_id = ?",
            [$fileId]
        );

        echo json_encode(['success' => true, 'data' => $row]);
    } catch (InvalidArgumentException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    } catch (Exception $e) {
        error_log('uploadSubmission: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Upload failed']);
    }
}

function deleteSubmission() {
    $input  = json_decode(file_get_contents('php://input'), true) ?: [];
    $fileId = (int)($input['file_id'] ?? 0);
    $userId = Auth::id();

    if (!$fileId) {
        echo json_encode(['success' => false, 'message' => 'File ID required']);
        return;
    }

    try {
        $file = db()->fetchOne(
            "SELECT * FROM student_work_files WHERE file_id = ? AND user_student_id = ?",
            [$fileId, $userId]
        );
        if (!$file) {
            echo json_encode(['success' => false, 'message' => 'File not found']);
            return;
        }
        if ($file['is_submitted']) {
            echo json_encode(['success' => false, 'message' => 'Cannot remove files after submitting']);
            return;
        }

        $diskPath = __DIR__ . '/../' . ltrim($file['file_path'], '/');
        if (file_exists($diskPath)) {
            @unlink($diskPath);
        }

        pdo()->prepare("DELETE FROM student_work_files WHERE file_id = ?")->execute([$fileId]);
        echo json_encode(['success' => true, 'message' => 'File removed']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function submitWork() {
    $input     = json_decode(file_get_contents('php://input'), true) ?: [];
    $subjectId = (int)($input['subject_id'] ?? 0);
    $lessonsId = isset($input['lessons_id']) && $input['lessons_id'] !== ''
        ? (int)$input['lessons_id'] : null;
    $quizId    = isset($input['quiz_id']) && $input['quiz_id'] !== ''
        ? (int)$input['quiz_id'] : null;
    $userId    = Auth::id();

    if (!$subjectId || (!$lessonsId && !$quizId)) {
        echo json_encode(['success' => false, 'message' => 'Subject and classwork item required']);
        return;
    }

    try {
        requireClassAccess($subjectId, $userId);
        assertStudentCanTurnIn($subjectId, $lessonsId, $quizId, $userId);

        if ($lessonsId) {
            $lesson = db()->fetchOne(
                "SELECT lessons_id, subject_id FROM lessons WHERE lessons_id = ? AND subject_id = ? AND status = 'published'",
                [$lessonsId, $subjectId]
            );
            if (!$lesson) {
                echo json_encode(['success' => false, 'message' => 'Lesson not found']);
                return;
            }

            $existing = db()->fetchOne(
                "SELECT * FROM student_progress WHERE user_student_id = ? AND lessons_id = ?",
                [$userId, $lessonsId]
            );
            if ($existing && $existing['status'] === 'completed') {
                // already done — still mark files submitted
            } elseif ($existing) {
                pdo()->prepare(
                    "UPDATE student_progress SET status = 'completed', completed_at = NOW() WHERE user_student_id = ? AND lessons_id = ?"
                )->execute([$userId, $lessonsId]);
            } else {
                pdo()->prepare(
                    "INSERT INTO student_progress (user_student_id, lessons_id, subject_id, status, completed_at, started_at)
                     VALUES (?, ?, ?, 'completed', NOW(), NOW())"
                )->execute([$userId, $lessonsId, $lesson['subject_id']]);
            }

            pdo()->prepare(
                "UPDATE student_work_files SET is_submitted = 1, submitted_at = NOW()
                 WHERE user_student_id = ? AND subject_id = ? AND lessons_id = ? AND is_submitted = 0"
            )->execute([$userId, $subjectId, $lessonsId]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Use the quiz page to submit assessments']);
            return;
        }

        echo json_encode(['success' => true, 'message' => 'Work submitted to your instructor']);
    } catch (InvalidArgumentException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    } catch (Exception $e) {
        error_log('submitWork: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Submit failed']);
    }
}

function setClassworkDueDate() {
    $input     = json_decode(file_get_contents('php://input'), true) ?: [];
    $subjectId = (int)($input['subject_id'] ?? 0);
    $lessonsId = isset($input['lessons_id']) && $input['lessons_id'] !== ''
        ? (int)$input['lessons_id'] : null;
    $quizId    = isset($input['quiz_id']) && $input['quiz_id'] !== ''
        ? (int)$input['quiz_id'] : null;
    $dueDate   = normalizeDueDate($input['due_date'] ?? null);
    $userId    = Auth::id();

    if (!$subjectId || (!$lessonsId && !$quizId)) {
        echo json_encode(['success' => false, 'message' => 'Subject and classwork item required']);
        return;
    }

    try {
        $access = requireClassAccess($subjectId, $userId);
        if (empty($access['is_instructor'])) {
            echo json_encode(['success' => false, 'message' => 'Only instructors can change due dates']);
            return;
        }

        if ($lessonsId) {
            ensureLessonDueDateColumn();
            $lesson = db()->fetchOne(
                'SELECT lessons_id FROM lessons WHERE lessons_id = ? AND subject_id = ? AND user_teacher_id = ?',
                [$lessonsId, $subjectId, $userId]
            );
            if (!$lesson) {
                echo json_encode(['success' => false, 'message' => 'Lesson not found']);
                return;
            }
            pdo()->prepare('UPDATE lessons SET due_date = ?, updated_at = NOW() WHERE lessons_id = ?')
                ->execute([$dueDate, $lessonsId]);
        } else {
            require_once __DIR__ . '/helpers/QuizSectionHelper.php';
            ensureQuizScheduleColumns();
            $quiz = db()->fetchOne(
                'SELECT quiz_id FROM quiz WHERE quiz_id = ? AND subject_id = ? AND user_teacher_id = ?',
                [$quizId, $subjectId, $userId]
            );
            if (!$quiz) {
                echo json_encode(['success' => false, 'message' => 'Quiz not found']);
                return;
            }
            pdo()->prepare('UPDATE quiz SET due_date = ?, updated_at = NOW() WHERE quiz_id = ?')
                ->execute([$dueDate, $quizId]);
        }

        echo json_encode([
            'success'  => true,
            'message'  => $dueDate ? 'Due date updated' : 'Due date removed',
            'due_date' => $dueDate,
        ]);
    } catch (Exception $e) {
        error_log('setClassworkDueDate: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update due date']);
    }
}

function ensureClassworkViewsTable() {
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS classwork_views (
            view_id INT AUTO_INCREMENT PRIMARY KEY,
            subject_id INT NOT NULL,
            user_student_id INT NOT NULL,
            content_type VARCHAR(20) NOT NULL,
            content_id INT NOT NULL,
            first_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            view_count INT NOT NULL DEFAULT 1,
            UNIQUE KEY uniq_student_content (user_student_id, subject_id, content_type, content_id),
            INDEX idx_subject (subject_id),
            INDEX idx_content (content_type, content_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {
        // ignore
    }
}

function normalizeContentType($type) {
    $t = strtolower(trim((string)$type));
    if (in_array($t, ['lesson', 'lessons'], true)) return 'lesson';
    if (in_array($t, ['quiz', 'quizzes'], true)) return 'quiz';
    if (in_array($t, ['announcement', 'announcements', 'ann'], true)) return 'announcement';
    return '';
}

function recordContentView() {
    if (Auth::role() !== 'student') {
        echo json_encode(['success' => false, 'message' => 'Students only']);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $subjectId = (int)($input['subject_id'] ?? 0);
    $contentType = normalizeContentType($input['content_type'] ?? '');
    $contentId = (int)($input['content_id'] ?? 0);
    $userId = Auth::id();

    if (!$subjectId || !$contentType || !$contentId) {
        echo json_encode(['success' => false, 'message' => 'Subject, content type, and content id required']);
        return;
    }

    try {
        requireClassAccess($subjectId, $userId);
        if (!contentExistsForSubject($subjectId, $contentType, $contentId)) {
            echo json_encode(['success' => false, 'message' => 'Content not found']);
            return;
        }

        pdo()->prepare(
            "INSERT INTO classwork_views (subject_id, user_student_id, content_type, content_id, first_viewed_at, last_viewed_at, view_count)
             VALUES (?, ?, ?, ?, NOW(), NOW(), 1)
             ON DUPLICATE KEY UPDATE last_viewed_at = NOW(), view_count = view_count + 1"
        )->execute([$subjectId, $userId, $contentType, $contentId]);

        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not record view']);
    }
}

function contentExistsForSubject($subjectId, $contentType, $contentId) {
    if ($contentType === 'lesson') {
        return (bool)db()->fetchOne(
            "SELECT lessons_id FROM lessons WHERE lessons_id = ? AND subject_id = ? AND status = 'published'",
            [$contentId, $subjectId]
        );
    }
    if ($contentType === 'quiz') {
        return (bool)db()->fetchOne(
            "SELECT quiz_id FROM quiz WHERE quiz_id = ? AND subject_id = ? AND status = 'published'",
            [$contentId, $subjectId]
        );
    }
    if ($contentType === 'announcement') {
        return (bool)db()->fetchOne(
            "SELECT announcement_id FROM announcement WHERE announcement_id = ? AND subject_id = ?",
            [$contentId, $subjectId]
        );
    }
    return false;
}

function getEnrolledStudentCount($subjectId) {
    $row = db()->fetchOne(
        "SELECT COUNT(DISTINCT ss.user_student_id) AS c
         FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE so.subject_id = ? AND ss.status = 'enrolled'",
        [$subjectId]
    );
    return (int)($row['c'] ?? 0);
}

function getContentViews() {
    if (Auth::role() !== 'instructor') {
        echo json_encode(['success' => false, 'message' => 'Instructors only']);
        return;
    }

    $subjectId = (int)($_GET['subject_id'] ?? 0);
    $contentType = normalizeContentType($_GET['content_type'] ?? '');
    $contentId = (int)($_GET['content_id'] ?? 0);

    if (!$subjectId || !$contentType || !$contentId) {
        echo json_encode(['success' => false, 'message' => 'Subject, content type, and content id required']);
        return;
    }

    try {
        requireClassAccess($subjectId, Auth::id());

        $viewed = db()->fetchAll(
            "SELECT cv.user_student_id, cv.first_viewed_at, cv.last_viewed_at, cv.view_count,
                    u.first_name, u.last_name, u.student_id,
                    CONCAT(u.first_name, ' ', u.last_name) AS student_name
             FROM classwork_views cv
             JOIN users u ON u.users_id = cv.user_student_id
             WHERE cv.subject_id = ? AND cv.content_type = ? AND cv.content_id = ?
             ORDER BY cv.last_viewed_at DESC",
            [$subjectId, $contentType, $contentId]
        );

        $notViewed = db()->fetchAll(
            "SELECT u.users_id AS user_student_id, u.first_name, u.last_name, u.student_id,
                    CONCAT(u.first_name, ' ', u.last_name) AS student_name
             FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN users u ON u.users_id = ss.user_student_id AND u.role = 'student'
             WHERE so.subject_id = ? AND ss.status = 'enrolled'
               AND NOT EXISTS (
                   SELECT 1 FROM classwork_views cv
                   WHERE cv.user_student_id = ss.user_student_id
                     AND cv.subject_id = ?
                     AND cv.content_type = ?
                     AND cv.content_id = ?
               )
             ORDER BY u.last_name, u.first_name",
            [$subjectId, $subjectId, $contentType, $contentId]
        );

        echo json_encode([
            'success' => true,
            'data' => [
                'viewed' => $viewed,
                'not_viewed' => $notViewed,
                'view_count' => count($viewed),
                'enrolled_count' => getEnrolledStudentCount($subjectId),
            ],
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

function getViewSummary() {
    if (Auth::role() !== 'instructor') {
        echo json_encode(['success' => false, 'message' => 'Instructors only']);
        return;
    }

    $subjectId = (int)($_GET['subject_id'] ?? 0);
    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'Subject ID required']);
        return;
    }

    try {
        requireClassAccess($subjectId, Auth::id());

        $rows = db()->fetchAll(
            "SELECT content_type, content_id, COUNT(DISTINCT user_student_id) AS view_count
             FROM classwork_views
             WHERE subject_id = ?
             GROUP BY content_type, content_id",
            [$subjectId]
        );

        $summary = ['lesson' => [], 'quiz' => [], 'announcement' => []];
        foreach ($rows as $row) {
            $type = $row['content_type'];
            if (!isset($summary[$type])) {
                $summary[$type] = [];
            }
            $summary[$type][(string)$row['content_id']] = (int)$row['view_count'];
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'counts' => $summary,
                'enrolled_count' => getEnrolledStudentCount($subjectId),
            ],
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}
