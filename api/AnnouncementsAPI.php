<?php
/**
 * CIT-LMS Announcements API
 * CRUD for instructor announcements
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/NotificationEmailHelper.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

function ensureAnnouncementSectionTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec(
            "CREATE TABLE IF NOT EXISTS announcement_section (
                announcement_id INT UNSIGNED NOT NULL,
                section_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (announcement_id, section_id),
                KEY idx_ann_section (section_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    } catch (Exception $e) {
        error_log('announcement_section table: ' . $e->getMessage());
    }
}

function ensureAnnouncementStudentTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec(
            "CREATE TABLE IF NOT EXISTS announcement_student (
                announcement_id INT UNSIGNED NOT NULL,
                user_student_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (announcement_id, user_student_id),
                KEY idx_ann_student (user_student_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    } catch (Exception $e) {
        error_log('announcement_student table: ' . $e->getMessage());
    }
}

function ensureAnnouncementMaterialsTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec(
            "CREATE TABLE IF NOT EXISTS announcement_materials (
                material_id INT NOT NULL AUTO_INCREMENT,
                announcement_id INT NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                file_type VARCHAR(50) DEFAULT NULL,
                file_size INT DEFAULT NULL,
                uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (material_id),
                KEY idx_ann_materials (announcement_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    } catch (Exception $e) {
        error_log('announcement_materials table: ' . $e->getMessage());
    }
}

function enrichAnnouncementsWithMaterials(array &$rows) {
    if (!$rows) return;
    ensureAnnouncementMaterialsTable();
    $ids = array_column($rows, 'announcement_id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $materials = db()->fetchAll(
        "SELECT material_id, announcement_id, original_name, file_path, file_type, file_size
         FROM announcement_materials WHERE announcement_id IN ($placeholders)
         ORDER BY uploaded_at ASC",
        $ids
    );
    $byAnn = [];
    foreach ($materials as $m) {
        $byAnn[$m['announcement_id']][] = $m;
    }
    foreach ($rows as &$row) {
        $row['attachments'] = $byAnn[$row['announcement_id']] ?? [];
    }
    unset($row);
}

function attachAnnouncementStudents($announcementId, array $studentIds) {
    ensureAnnouncementStudentTable();
    $pdo = pdo();
    $pdo->prepare("DELETE FROM announcement_student WHERE announcement_id = ?")->execute([$announcementId]);
    if (empty($studentIds)) return;
    $stmt = $pdo->prepare("INSERT IGNORE INTO announcement_student (announcement_id, user_student_id) VALUES (?, ?)");
    foreach ($studentIds as $sid) {
        $sid = (int)$sid;
        if ($sid > 0) $stmt->execute([$announcementId, $sid]);
    }
}

function attachAnnouncementSections($announcementId, array $sectionIds) {
    ensureAnnouncementSectionTable();
    $pdo = pdo();
    $pdo->prepare("DELETE FROM announcement_section WHERE announcement_id = ?")->execute([$announcementId]);
    if (empty($sectionIds)) return;
    $stmt = $pdo->prepare("INSERT INTO announcement_section (announcement_id, section_id) VALUES (?, ?)");
    foreach ($sectionIds as $sid) {
        $sid = (int)$sid;
        if ($sid > 0) {
            $stmt->execute([$announcementId, $sid]);
        }
    }
}

function getAnnouncementSectionIds($announcementId) {
    ensureAnnouncementSectionTable();
    $rows = db()->fetchAll(
        "SELECT section_id FROM announcement_section WHERE announcement_id = ?",
        [$announcementId]
    );
    return array_map(fn($r) => (int)$r['section_id'], $rows);
}

function enrichAnnouncementsWithSections(array &$rows) {
    foreach ($rows as &$row) {
        $ids = getAnnouncementSectionIds((int)$row['announcement_id']);
        $row['section_ids'] = $ids;
        $row['all_sections'] = empty($ids) && !empty($row['subject_offered_id']);
        if (!empty($ids)) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $names = db()->fetchAll(
                "SELECT section_id, section_name FROM section WHERE section_id IN ($placeholders)",
                $ids
            );
            $row['section_names'] = implode(', ', array_column($names, 'section_name'));
        } else {
            $row['section_names'] = '';
        }
    }
    unset($row);
}

switch ($action) {
    case 'instructor-list':   getInstructorAnnouncements(); break;
    case 'create':            createAnnouncement();         break;
    case 'update':            updateAnnouncement();         break;
    case 'delete':            deleteAnnouncement();         break;
    case 'student-list':      getStudentAnnouncements();    break;
    case 'new-announcements': getNewAnnouncements();        break;
    case 'upload-material':   uploadAnnouncementMaterial(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function getInstructorAnnouncements() {
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? '';
    $status = $_GET['status'] ?? '';

    try {
        $sql = "SELECT a.*, s.subject_id, s.subject_code, s.subject_name
                FROM announcement a
                LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
                LEFT JOIN subject s ON so.subject_id = s.subject_id
                WHERE a.user_id = ?";
        $params = [$userId];

        if ($subjectId) {
            $sql .= " AND so.subject_id = ?";
            $params[] = $subjectId;
        }
        if ($status) {
            $sql .= " AND a.status = ?";
            $params[] = $status;
        }

        $sql .= " ORDER BY a.created_at DESC";
        $data = db()->fetchAll($sql, $params);
        enrichAnnouncementsWithSections($data);
        enrichAnnouncementsWithMaterials($data);
        ob_clean();
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        http_response_code(500);
        error_log('[AnnouncementsAPI.php] ' . $e->getMessage());
        ob_clean();
        echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
    }
}

function createAnnouncement() {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = Auth::id();
    $title = trim($input['title'] ?? '');
    $content = trim($input['content'] ?? '');
    $status = $input['status'] ?? 'published';
    $subjectId = $input['subject_id'] ?? null;
    $studentIds = array_values(array_filter(array_map('intval', $input['student_ids'] ?? [])));
    $hasStudentTargeting = !empty($studentIds);
    $allSections = $hasStudentTargeting ? false : !empty($input['all_sections']);
    $sectionIds = $hasStudentTargeting ? [] : array_values(array_filter(array_map('intval', $input['section_ids'] ?? [])));

    if (!$title || !$content) {
        echo json_encode(['success' => false, 'message' => 'Title and content are required']);
        return;
    }

    try {
        $subjectOfferedId = null;
        if ($subjectId) {
            $offering = db()->fetchOne(
                "SELECT so.subject_offered_id
                 FROM subject_offered so
                 WHERE so.subject_id = ? AND so.user_teacher_id = ? AND so.status = 'open'
                 ORDER BY so.subject_offered_id DESC LIMIT 1",
                [$subjectId, $userId]
            );
            if ($offering) {
                $subjectOfferedId = $offering['subject_offered_id'];
            }
        }

        $pdo = pdo();
        $stmt = $pdo->prepare(
            "INSERT INTO announcement (user_id, subject_offered_id, title, content, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())"
        );
        $stmt->execute([$userId, $subjectOfferedId, $title, $content, $status]);
        $annId = (int)$pdo->lastInsertId();

        if ($hasStudentTargeting) {
            attachAnnouncementStudents($annId, $studentIds);
        } elseif ($subjectOfferedId && !$allSections && !empty($sectionIds)) {
            attachAnnouncementSections($annId, $sectionIds);
        }

        if ($status === 'published') {
            try {
                NotificationEmailHelper::queueNewAnnouncement($annId);
                NotificationEmailHelper::dispatchAfterPublish();
            } catch (Throwable $ne) {
                error_log("Announcement notify error: " . $ne->getMessage());
            }
        }

        ob_clean();
        echo json_encode(['success' => true, 'message' => 'Announcement created', 'data' => ['announcement_id' => $annId]]);
    } catch (Throwable $e) {
        error_log("Announcement create error: " . $e->getMessage());
        ob_clean();
        echo json_encode(['success' => false, 'message' => 'Failed to create announcement']);
    }
}

function updateAnnouncement() {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = Auth::id();
    $annId = (int)($input['announcement_id'] ?? 0);
    $title = trim($input['title'] ?? '');
    $content = trim($input['content'] ?? '');
    $status = $input['status'] ?? 'published';
    $subjectId = $input['subject_id'] ?? null;
    $allSections = !empty($input['all_sections']);
    $sectionIds = array_values(array_filter(array_map('intval', $input['section_ids'] ?? [])));

    if (!$annId || !$title || !$content) {
        echo json_encode(['success' => false, 'message' => 'All fields are required']);
        return;
    }

    try {
        $prev = db()->fetchOne(
            "SELECT status FROM announcement WHERE announcement_id = ? AND user_id = ?",
            [$annId, $userId]
        );
        $subjectOfferedId = null;
        if ($subjectId) {
            $offering = db()->fetchOne(
                "SELECT so.subject_offered_id FROM subject_offered so
                 WHERE so.subject_id = ? AND so.user_teacher_id = ? AND so.status = 'open'
                 ORDER BY so.subject_offered_id DESC LIMIT 1",
                [$subjectId, $userId]
            );
            if ($offering) {
                $subjectOfferedId = $offering['subject_offered_id'];
            }
        }

        $stmt = pdo()->prepare(
            "UPDATE announcement SET title = ?, content = ?, status = ?,
                    subject_offered_id = ?, updated_at = NOW()
             WHERE announcement_id = ? AND user_id = ?"
        );
        $stmt->execute([$title, $content, $status, $subjectOfferedId, $annId, $userId]);

        if ($subjectOfferedId && !$allSections && !empty($sectionIds)) {
            attachAnnouncementSections($annId, $sectionIds);
        } else {
            attachAnnouncementSections($annId, []);
        }

        if ($status === 'published' && ($prev['status'] ?? '') !== 'published') {
            try {
                NotificationEmailHelper::queueNewAnnouncement($annId);
                NotificationEmailHelper::dispatchAfterPublish();
            } catch (Throwable $ne) {
                error_log("Announcement notify error: " . $ne->getMessage());
            }
        }

        ob_clean();
        echo json_encode(['success' => true, 'message' => 'Announcement updated']);
    } catch (Throwable $e) {
        error_log("Announcement update error: " . $e->getMessage());
        ob_clean();
        echo json_encode(['success' => false, 'message' => 'Failed to update announcement']);
    }
}

function deleteAnnouncement() {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = Auth::id();
    $annId = $input['announcement_id'] ?? 0;

    if (!$annId) {
        echo json_encode(['success' => false, 'message' => 'Announcement ID required']);
        return;
    }

    try {
        ensureAnnouncementSectionTable();
        pdo()->prepare("DELETE FROM announcement_section WHERE announcement_id = ?")->execute([$annId]);
        $stmt = pdo()->prepare("DELETE FROM announcement WHERE announcement_id = ? AND user_id = ?");
        $stmt->execute([$annId, $userId]);
        ob_clean();
        echo json_encode(['success' => true, 'message' => 'Announcement deleted']);
    } catch (Throwable $e) {
        error_log("Announcement delete error: " . $e->getMessage());
        ob_clean();
        echo json_encode(['success' => false, 'message' => 'Failed to delete announcement']);
    }
}

function getStudentAnnouncements() {
    $userId = Auth::id();
    $subjectId = $_GET['subject_id'] ?? '';

    try {
        $sql = "SELECT a.*, s.subject_id, s.subject_code, s.subject_name,
                    u.first_name as author_first, u.last_name as author_last
                FROM announcement a
                LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
                LEFT JOIN subject s ON so.subject_id = s.subject_id
                JOIN users u ON a.user_id = u.users_id
                WHERE a.status = 'published'
                AND (a.subject_offered_id IS NULL
                     OR (
                         a.subject_offered_id IN (
                             SELECT ss.subject_offered_id FROM student_subject ss
                             WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
                         )
                         AND (
                             (
                                 NOT EXISTS (SELECT 1 FROM announcement_section ans WHERE ans.announcement_id = a.announcement_id)
                                 AND NOT EXISTS (SELECT 1 FROM announcement_student anst WHERE anst.announcement_id = a.announcement_id)
                             )
                             OR EXISTS (
                                 SELECT 1 FROM announcement_section ans
                                 JOIN student_subject ss2 ON ss2.section_id = ans.section_id
                                     AND ss2.user_student_id = ?
                                     AND ss2.subject_offered_id = a.subject_offered_id
                                     AND ss2.status = 'enrolled'
                                 WHERE ans.announcement_id = a.announcement_id
                             )
                             OR EXISTS (
                                 SELECT 1 FROM announcement_student anst2
                                 WHERE anst2.announcement_id = a.announcement_id
                                   AND anst2.user_student_id = ?
                             )
                         )
                     ))";
        $params = [$userId, $userId, $userId];

        if ($subjectId) {
            $sql .= " AND so.subject_id = ?";
            $params[] = $subjectId;
        }

        $sql .= " ORDER BY a.created_at DESC";
        $data = db()->fetchAll($sql, $params);
        enrichAnnouncementsWithMaterials($data);
        ob_clean();
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        http_response_code(500);
        ob_clean();
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
}

/**
 * Returns recent announcements visible to the current user (last 30 days).
 * The frontend uses localStorage to determine which ones are "new".
 */
function getNewAnnouncements() {
    $userId = Auth::id();
    $role   = Auth::role();
    $cutoff = date('Y-m-d H:i:s', strtotime('-30 days'));

    try {
        if ($role === 'student') {
            // Student sees: global + their enrolled-subject announcements
            $data = db()->fetchAll(
                "SELECT a.announcement_id, a.title, a.announcement_type,
                        a.is_pinned, a.created_at,
                        s.subject_code,
                        CONCAT(u.first_name, ' ', u.last_name) AS author_name
                 FROM announcement a
                 LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
                 LEFT JOIN subject s ON so.subject_id = s.subject_id
                 JOIN users u ON a.user_id = u.users_id
                 WHERE a.status = 'published'
                   AND a.created_at > ?
                   AND (a.subject_offered_id IS NULL
                        OR (
                            a.subject_offered_id IN (
                                SELECT ss.subject_offered_id FROM student_subject ss
                                WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
                            )
                            AND (
                                NOT EXISTS (
                                    SELECT 1 FROM announcement_section ans
                                    WHERE ans.announcement_id = a.announcement_id
                                )
                                OR EXISTS (
                                    SELECT 1 FROM announcement_section ans
                                    JOIN student_subject ss2 ON ss2.section_id = ans.section_id
                                        AND ss2.user_student_id = ?
                                        AND ss2.subject_offered_id = a.subject_offered_id
                                        AND ss2.status = 'enrolled'
                                    WHERE ans.announcement_id = a.announcement_id
                                )
                            )
                        ))
                 ORDER BY a.created_at DESC
                 LIMIT 20",
                [$cutoff, $userId, $userId]
            );
        } else {
            // Instructors / dean / admin — only global announcements not posted by themselves
            $data = db()->fetchAll(
                "SELECT a.announcement_id, a.title, a.announcement_type,
                        a.is_pinned, a.created_at,
                        NULL AS subject_code,
                        CONCAT(u.first_name, ' ', u.last_name) AS author_name
                 FROM announcement a
                 JOIN users u ON a.user_id = u.users_id
                 WHERE a.status = 'published'
                   AND a.subject_offered_id IS NULL
                   AND a.created_at > ?
                   AND a.user_id != ?
                 ORDER BY a.created_at DESC
                 LIMIT 20",
                [$cutoff, $userId]
            );
        }
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        echo json_encode(['success' => true, 'data' => []]);
    }
}

/**
 * Upload a file attachment directly onto an announcement (multipart/form-data).
 */
function uploadAnnouncementMaterial() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $annId = (int)($_POST['announcement_id'] ?? 0);
    if (!$annId) {
        echo json_encode(['success' => false, 'message' => 'Announcement ID required']);
        return;
    }

    $owner = db()->fetchOne(
        "SELECT announcement_id FROM announcement WHERE announcement_id = ? AND user_id = ?",
        [$annId, Auth::id()]
    );
    if (!$owner) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        return;
    }

    $file = $_FILES['file'];
    $maxFileSize = 25 * 1024 * 1024; // 25MB

    $allowedTypes = [
        'application/pdf' => 'document',
        'image/jpeg' => 'image', 'image/png' => 'image', 'image/gif' => 'image',
        'image/webp' => 'image', 'image/bmp' => 'image', 'image/svg+xml' => 'image',
        'application/msword' => 'document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'document',
        'application/vnd.ms-powerpoint' => 'document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'document',
        'application/vnd.ms-excel' => 'document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'document',
        'text/plain' => 'document', 'text/csv' => 'document', 'application/csv' => 'document',
        'application/rtf' => 'document', 'text/rtf' => 'document',
        'application/zip' => 'other', 'application/x-rar-compressed' => 'other', 'application/vnd.rar' => 'other',
        'audio/mpeg' => 'audio', 'audio/mp3' => 'audio', 'audio/wav' => 'audio', 'audio/ogg' => 'audio',
        'audio/mp4' => 'audio', 'audio/aac' => 'audio', 'audio/flac' => 'audio',
        'audio/x-wav' => 'audio', 'audio/x-m4a' => 'audio',
        'video/mp4' => 'video', 'video/webm' => 'video', 'video/quicktime' => 'video',
    ];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'Upload failed (error code: ' . $file['error'] . ')']);
        return;
    }
    if ($file['size'] > $maxFileSize) {
        echo json_encode(['success' => false, 'message' => 'File too large. Maximum size is 25MB.']);
        return;
    }

    $mimeType = mime_content_type($file['tmp_name']);
    if (!isset($allowedTypes[$mimeType])) {
        echo json_encode(['success' => false, 'message' => 'File type not allowed: ' . $mimeType]);
        return;
    }

    ensureAnnouncementMaterialsTable();
    $uploadDir = __DIR__ . '/../uploads/materials/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $fileName = 'ann_' . $annId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $filePath = $uploadDir . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        echo json_encode(['success' => false, 'message' => 'Failed to save file']);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO announcement_materials (announcement_id, file_name, original_name, file_path, file_type, file_size, uploaded_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())"
        )->execute([$annId, $fileName, $file['name'], 'uploads/materials/' . $fileName, $allowedTypes[$mimeType], $file['size']]);

        echo json_encode(['success' => true, 'message' => 'File uploaded', 'data' => [
            'material_id' => pdo()->lastInsertId(),
            'original_name' => $file['name'],
            'file_path' => 'uploads/materials/' . $fileName,
            'file_type' => $allowedTypes[$mimeType],
            'file_size' => $file['size'],
        ]]);
    } catch (Exception $e) {
        if (file_exists($filePath)) unlink($filePath);
        error_log('Upload announcement material: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save material record']);
    }
}
