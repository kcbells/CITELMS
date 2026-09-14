<?php
/**
 * CIT-LMS Announcements API
 * CRUD for instructor announcements
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/NotificationEmailHelper.php';
require_once __DIR__ . '/helpers/Sanitize.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// RBAC: enforce permission per action — instructors (who own their
// announcements), program heads and deans co-managing a subject, and
// admins may create/edit/delete announcements or their materials;
// everyone (including students) can view.
$_annPerms = [
    'instructor-list'   => 'announcements.view',
    'student-list'      => 'announcements.view',
    'new-announcements' => 'announcements.view',
    'serve-material'    => 'announcements.view',
    'create'            => 'announcements.create',
    'update'            => 'announcements.edit',
    'upload-material'   => 'announcements.edit',
    'add-link'          => 'announcements.edit',
    'delete'            => 'announcements.delete',
];
if (isset($_annPerms[$action]) && !Auth::can($_annPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_annPerms[$action]}"]);
    exit;
}

// Resolves which subject_offered row an announcement should attach to.
// Instructors must be the assigned teacher of that offering. Program heads
// and deans have oversight authority over the whole subject regardless of
// which instructor is assigned to it, so they resolve to any open offering
// for that subject — otherwise this silently returned nothing for them and
// the announcement got created/updated with no subject/section attached.
function resolveAnnouncementOffering($subjectId, $userId, $role) {
    if (!$subjectId) return null;
    if (in_array($role, ['program_head', 'dean'], true)) {
        $offering = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
             WHERE subject_id = ? AND status = 'open'
             ORDER BY subject_offered_id DESC LIMIT 1",
            [$subjectId]
        );
    } else {
        $offering = db()->fetchOne(
            "SELECT subject_offered_id FROM subject_offered
             WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open'
             ORDER BY subject_offered_id DESC LIMIT 1",
            [$subjectId, $userId]
        );
    }
    return $offering ? $offering['subject_offered_id'] : null;
}

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
                material_type VARCHAR(20) NOT NULL DEFAULT 'file',
                file_size INT DEFAULT NULL,
                uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (material_id),
                KEY idx_ann_materials (announcement_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $hasCol = db()->fetchOne("SHOW COLUMNS FROM announcement_materials LIKE 'material_type'");
        if (!$hasCol) {
            pdo()->exec("ALTER TABLE announcement_materials ADD COLUMN material_type VARCHAR(20) NOT NULL DEFAULT 'file' AFTER file_type");
        }
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
        "SELECT material_id, announcement_id, original_name, file_path, file_type, material_type, file_size
         FROM announcement_materials WHERE announcement_id IN ($placeholders)
         ORDER BY uploaded_at ASC",
        $ids
    );
    $byAnn = [];
    foreach ($materials as $m) {
        $m['source'] = 'announcement';
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
    case 'add-link':          addAnnouncementLinkMaterial(); break;
    case 'serve-material':    serveAnnouncementMaterial();  break;
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
    $title = Sanitize::text($input['title'] ?? '');
    $content = Sanitize::text($input['content'] ?? '');
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
        $subjectOfferedId = resolveAnnouncementOffering($subjectId, $userId, Auth::role());

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
    $title = Sanitize::text($input['title'] ?? '');
    $content = Sanitize::text($input['content'] ?? '');
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
        $subjectOfferedId = resolveAnnouncementOffering($subjectId, $userId, Auth::role());

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

    // The query below references announcement_section and announcement_student
    // for targeting checks — but those tables are only ever CREATEd lazily, on
    // the write path (attachAnnouncementSections/attachAnnouncementStudents),
    // never here on the read path. If no announcement had used per-section or
    // per-student targeting yet, this table simply didn't exist, the query
    // below threw, and the catch block silently returned "Database error" —
    // which is exactly why announcements never showed up on the student side
    // at all, for every student, regardless of targeting.
    ensureAnnouncementSectionTable();
    ensureAnnouncementStudentTable();

    try {
        // A subject can have several open subject_offered rows at once (one per
        // teacher/section). A regular instructor's announcement is correctly
        // scoped to just their own offering (their own class). But a dean or
        // program_head posting "All students" to a subject means the WHOLE
        // subject, not whichever one offering the code happened to attach it
        // to — so for those two roles, match by subject_id (any offering the
        // student is enrolled in for that subject), not the exact offering.
        $sql = "SELECT a.*, s.subject_id, s.subject_code, s.subject_name,
                    u.first_name as author_first, u.last_name as author_last
                FROM announcement a
                LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
                LEFT JOIN subject s ON so.subject_id = s.subject_id
                JOIN users u ON a.user_id = u.users_id
                WHERE a.status = 'published'
                AND (a.subject_offered_id IS NULL
                     OR (
                         (
                             (u.role IN ('dean', 'program_head')
                              AND EXISTS (
                                  SELECT 1 FROM student_subject ssw
                                  JOIN subject_offered sow ON sow.subject_offered_id = ssw.subject_offered_id
                                  WHERE ssw.user_student_id = ? AND ssw.status = 'enrolled'
                                    AND sow.subject_id = so.subject_id
                              ))
                             OR
                             (u.role NOT IN ('dean', 'program_head')
                              AND a.subject_offered_id IN (
                                  SELECT ss.subject_offered_id FROM student_subject ss
                                  WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
                              ))
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
        $params = [$userId, $userId, $userId, $userId];

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
        'image/webp' => 'image', 'image/bmp' => 'image',
        // SVG deliberately excluded — it can carry <script>/event-handler XSS,
        // and this endpoint serves files back inline by default (see below).
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

    // Extension is derived from the *validated* MIME type, not the client-supplied
    // filename — otherwise a file whose content passes MIME sniffing but is named
    // e.g. "shell.php" would be saved with a .php extension.
    $mimeToExt = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif',
        'image/webp' => 'webp', 'image/bmp' => 'bmp',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'text/plain' => 'txt', 'text/csv' => 'csv', 'application/csv' => 'csv',
        'application/rtf' => 'rtf', 'text/rtf' => 'rtf',
        'application/zip' => 'zip', 'application/x-rar-compressed' => 'rar', 'application/vnd.rar' => 'rar',
        'audio/mpeg' => 'mp3', 'audio/mp3' => 'mp3', 'audio/wav' => 'wav', 'audio/ogg' => 'ogg',
        'audio/mp4' => 'm4a', 'audio/aac' => 'aac', 'audio/flac' => 'flac',
        'audio/x-wav' => 'wav', 'audio/x-m4a' => 'm4a',
        'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov',
    ];
    $ext = $mimeToExt[$mimeType] ?? 'bin';
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

/**
 * Attach a link (URL) to an announcement as a proper clickable material row.
 */
function addAnnouncementLinkMaterial() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $data  = json_decode(file_get_contents('php://input'), true) ?: [];
    $annId = (int)($data['announcement_id'] ?? 0);
    $url   = trim($data['url'] ?? '');
    $title = Sanitize::text($data['title'] ?? '');

    if (!$annId || !$url) {
        echo json_encode(['success' => false, 'message' => 'Announcement ID and URL are required']);
        return;
    }
    if (!preg_match('~^https?://~i', $url)) {
        echo json_encode(['success' => false, 'message' => 'URL must start with http:// or https://']);
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

    if (!$title) {
        if (preg_match('/youtube\.com|youtu\.be/i', $url)) {
            $title = 'YouTube Video';
        } elseif (preg_match('/vimeo\.com/i', $url)) {
            $title = 'Vimeo Video';
        } else {
            $title = 'External Link';
        }
    }

    ensureAnnouncementMaterialsTable();

    try {
        pdo()->prepare(
            "INSERT INTO announcement_materials (announcement_id, file_name, original_name, file_path, file_type, material_type, file_size, uploaded_at)
             VALUES (?, 'link', ?, ?, 'link', 'link', 0, NOW())"
        )->execute([$annId, $title, $url]);

        echo json_encode(['success' => true, 'message' => 'Link added', 'data' => ['material_id' => pdo()->lastInsertId()]]);
    } catch (Exception $e) {
        error_log('Add announcement link material: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add link']);
    }
}

/**
 * True if the current user may view/download an announcement's attachments:
 * either the announcement's author, or (for students) enrolled in its subject
 * — mirrors the visibility rule used by getStudentAnnouncements().
 */
function verifyAnnouncementMaterialAccess($announcementId, $userId, $role) {
    $ann = db()->fetchOne(
        "SELECT announcement_id, user_id, subject_offered_id FROM announcement WHERE announcement_id = ?",
        [$announcementId]
    );
    if (!$ann) return false;
    if ((int)$ann['user_id'] === (int)$userId) return true;
    if ($role !== 'student') return true;
    if (!$ann['subject_offered_id']) return true;

    $enrolled = db()->fetchOne(
        "SELECT 1 FROM student_subject WHERE user_student_id = ? AND subject_offered_id = ? AND status = 'enrolled'",
        [$userId, $ann['subject_offered_id']]
    );
    return (bool)$enrolled;
}

function serveAnnouncementMaterial() {
    ensureAnnouncementMaterialsTable();
    $materialId = (int)($_GET['material_id'] ?? $_GET['id'] ?? 0);
    if (!$materialId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Material ID required']);
        return;
    }

    $material = db()->fetchOne("SELECT * FROM announcement_materials WHERE material_id = ?", [$materialId]);
    if (!$material) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Material not found']);
        return;
    }

    if (!verifyAnnouncementMaterialAccess((int)$material['announcement_id'], Auth::id(), Auth::role())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden']);
        return;
    }

    if ($material['material_type'] === 'link') {
        header('Location: ' . $material['file_path']);
        exit;
    }

    $uploadsRoot = realpath(__DIR__ . '/../uploads');
    $filePath = realpath(__DIR__ . '/../' . $material['file_path']);
    if (!$filePath || !$uploadsRoot || strpos($filePath, $uploadsRoot) !== 0 || !is_file($filePath)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'File not found']);
        return;
    }

    $download = isset($_GET['download']) && $_GET['download'] !== '0';
    $filename = $material['original_name'] ?: $material['file_name'] ?: basename($filePath);
    $mime = mime_content_type($filePath) ?: 'application/octet-stream';
    $safeName = preg_replace('/[^\w.\-() ]+/u', '_', $filename);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($filePath));
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . $safeName . '"');
    header('Cache-Control: private, max-age=3600');
    readfile($filePath);
    exit;
}
