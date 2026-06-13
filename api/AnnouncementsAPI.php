<?php
/**
 * CIT-LMS Announcements API
 * CRUD for instructor announcements
 */
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
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
}

function createAnnouncement() {
    $input = json_decode(file_get_contents('php://input'), true);
    $userId = Auth::id();
    $title = trim($input['title'] ?? '');
    $content = trim($input['content'] ?? '');
    $status = $input['status'] ?? 'published';
    $subjectId = $input['subject_id'] ?? null;
    $allSections = !empty($input['all_sections']);
    $sectionIds = array_values(array_filter(array_map('intval', $input['section_ids'] ?? [])));

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

        if ($subjectOfferedId && !$allSections && !empty($sectionIds)) {
            attachAnnouncementSections($annId, $sectionIds);
        }

        if ($status === 'published') {
            NotificationEmailHelper::queueNewAnnouncement($annId);
            NotificationEmailHelper::dispatchAfterPublish();
        }

        echo json_encode(['success' => true, 'message' => 'Announcement created']);
    } catch (PDOException $e) {
        error_log("Announcement create error: " . $e->getMessage());
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
            NotificationEmailHelper::queueNewAnnouncement($annId);
            NotificationEmailHelper::dispatchAfterPublish();
        }

        echo json_encode(['success' => true, 'message' => 'Announcement updated']);
    } catch (PDOException $e) {
        error_log("Announcement update error: " . $e->getMessage());
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
        echo json_encode(['success' => true, 'message' => 'Announcement deleted']);
    } catch (PDOException $e) {
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
                     ))";
        $params = [$userId, $userId];

        if ($subjectId) {
            $sql .= " AND so.subject_id = ?";
            $params[] = $subjectId;
        }

        $sql .= " ORDER BY a.created_at DESC";
        $data = db()->fetchAll($sql, $params);
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        http_response_code(500);
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
