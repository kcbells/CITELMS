<?php
/**
 * Video API — WebRTC signaling for LMS online classes
 *
 * GET  ?action=poll&room_key=...&since=0
 * POST ?action=join   { room_key, subject_id }
 * POST ?action=signal { room_key, to_user_id, type, payload }
 * POST ?action=leave  { room_key }
 * POST ?action=end     { room_key }  — instructor ends class for everyone
 * GET  ?action=comments&room_key=...&since=0
 * POST ?action=comment { room_key, content }
 */
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? ($_GET['action'] ?? '') : '');

ensureVideoSchema();

switch ($action) {
    case 'join':   handleJoin();   break;
    case 'poll':   handlePoll();   break;
    case 'signal': handleSignal(); break;
    case 'leave':  handleLeave();  break;
    case 'end':      handleEnd();      break;
    case 'comments': handleComments(); break;
    case 'comment':  handleComment();  break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function ensureVideoSchema() {
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS video_presence (
            room_key     VARCHAR(128) NOT NULL,
            user_id      INT NOT NULL,
            display_name VARCHAR(255) NOT NULL DEFAULT '',
            user_role    VARCHAR(32) NOT NULL DEFAULT 'student',
            is_host      TINYINT(1) NOT NULL DEFAULT 0,
            last_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (room_key, user_id),
            INDEX idx_room_seen (room_key, last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        pdo()->exec("CREATE TABLE IF NOT EXISTS video_signals (
            signal_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
            room_key     VARCHAR(128) NOT NULL,
            from_user_id INT NOT NULL,
            to_user_id   INT NULL,
            signal_type  VARCHAR(32) NOT NULL,
            payload      MEDIUMTEXT NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_room_id (room_key, signal_id),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        pdo()->exec("CREATE TABLE IF NOT EXISTS video_sessions (
            room_key    VARCHAR(128) NOT NULL PRIMARY KEY,
            subject_id  INT NOT NULL DEFAULT 0,
            is_active   TINYINT(1) NOT NULL DEFAULT 1,
            started_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at    TIMESTAMP NULL,
            INDEX idx_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        pdo()->exec("CREATE TABLE IF NOT EXISTS video_comments (
            comment_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
            room_key     VARCHAR(128) NOT NULL,
            user_id      INT NOT NULL,
            display_name VARCHAR(255) NOT NULL DEFAULT '',
            content      TEXT NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_room_comments (room_key, comment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {
        // ignore if tables exist
    }
}

function sanitizeRoomKey($key) {
    return preg_replace('/[^a-zA-Z0-9_-]/', '_', trim((string)$key));
}

function parseSubjectIdFromRoom($roomKey) {
    if (preg_match('/_(\d+)$/', $roomKey, $m)) {
        return (int)$m[1];
    }
    return 0;
}

function isHostRole($role) {
    return in_array($role, ['instructor', 'admin', 'dean'], true);
}

function buildDisplayName($user) {
    $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    if ($name === '' && !empty($user['name'])) {
        $name = trim($user['name']);
    }
    return $name !== '' ? $name : 'User';
}

function getRoomSession($roomKey) {
    return db()->fetchOne(
        "SELECT is_active, started_at FROM video_sessions WHERE room_key = ? LIMIT 1",
        [$roomKey]
    );
}

function isHostPresent($roomKey) {
    $host = db()->fetchOne(
        "SELECT user_id FROM video_presence WHERE room_key = ? AND is_host = 1 LIMIT 1",
        [$roomKey]
    );
    return (bool)$host;
}

function getMaxSignalId($roomKey) {
    $row = db()->fetchOne(
        "SELECT COALESCE(MAX(signal_id), 0) AS max_id FROM video_signals WHERE room_key = ?",
        [$roomKey]
    );
    return (int)($row['max_id'] ?? 0);
}

/** Live video room — host in presence or session flagged active */
function isRoomActive($roomKey) {
    $row = getRoomSession($roomKey);
    if ($row && (int)$row['is_active'] === 1) {
        return true;
    }
    return isHostPresent($roomKey);
}

/** Instructor-started session only — controls comments (strict) */
function isSessionLive($roomKey) {
    $row = getRoomSession($roomKey);
    return $row && (int)$row['is_active'] === 1;
}

/** Permanently remove all class comments for a room */
function purgeRoomComments($roomKey) {
    db()->execute("DELETE FROM video_comments WHERE room_key = ?", [$roomKey]);
}

function activateRoom($roomKey, $subjectId) {
    $existing = getRoomSession($roomKey);
    if ($existing && (int)$existing['is_active'] === 1) {
        db()->execute(
            "UPDATE video_sessions SET subject_id = ? WHERE room_key = ?",
            [$subjectId, $roomKey]
        );
        return;
    }

    db()->execute(
        "INSERT INTO video_sessions (room_key, subject_id, is_active, started_at, ended_at)
         VALUES (?, ?, 1, NOW(), NULL)
         ON DUPLICATE KEY UPDATE
            is_active = 1,
            subject_id = VALUES(subject_id),
            started_at = NOW(),
            ended_at = NULL",
        [$roomKey, $subjectId]
    );
    db()->execute(
        "DELETE FROM video_signals WHERE room_key = ? AND signal_type = 'host-end'",
        [$roomKey]
    );
    // Fresh session — do not carry over comments from a previous class
    purgeRoomComments($roomKey);
}

function endRoom($roomKey) {
    db()->execute(
        "UPDATE video_sessions SET is_active = 0, ended_at = NOW() WHERE room_key = ?",
        [$roomKey]
    );
    purgeRoomComments($roomKey);
}

function requireRoomAccess($subjectId) {
    if ($subjectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid room']);
        exit;
    }

    $userId = Auth::id();
    $role   = Auth::role();

    if ($role === 'instructor') {
        $row = db()->fetchOne(
            "SELECT s.subject_id
             FROM subject_offered so
             JOIN subject s ON s.subject_id = so.subject_id
             WHERE so.user_teacher_id = ? AND s.subject_id = ? AND so.status = 'open'
             LIMIT 1",
            [$userId, $subjectId]
        );
        if ($row) return;
    }

    if ($role === 'student') {
        $row = db()->fetchOne(
            "SELECT s.subject_id
             FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject s ON s.subject_id = so.subject_id
             WHERE ss.user_student_id = ? AND s.subject_id = ? AND ss.status = 'enrolled'
             LIMIT 1",
            [$userId, $subjectId]
        );
        if ($row) return;

        // Fallback: enrolled via subject_id on student_subject join path used elsewhere
        $row = db()->fetchOne(
            "SELECT s.subject_id
             FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             JOIN subject s ON s.subject_id = so.subject_id
             WHERE ss.user_student_id = ? AND s.subject_id = ?
             LIMIT 1",
            [$userId, $subjectId]
        );
        if ($row) return;
    }

    if (in_array($role, ['admin', 'dean'], true)) {
        return;
    }

    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'No access to this class room']);
    exit;
}

function pruneRoom($roomKey) {
    db()->execute(
        "DELETE FROM video_presence WHERE room_key = ? AND last_seen < DATE_SUB(NOW(), INTERVAL 45 SECOND)",
        [$roomKey]
    );
    db()->execute(
        "DELETE FROM video_signals WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)"
    );
}

function getJsonBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function handleJoin() {
    $body     = getJsonBody();
    $roomKey  = sanitizeRoomKey($body['room_key'] ?? '');
    $subjectId = (int)($body['subject_id'] ?? parseSubjectIdFromRoom($roomKey));

    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }

    requireRoomAccess($subjectId);

    $user = Auth::user();
    $role = Auth::role();
    $host = isHostRole($role);

    db()->execute(
        "INSERT INTO video_presence (room_key, user_id, display_name, user_role, is_host, last_seen)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            user_role = VALUES(user_role),
            is_host = VALUES(is_host),
            last_seen = NOW()",
        [$roomKey, Auth::id(), buildDisplayName($user), $role, $host ? 1 : 0]
    );

    if ($host) {
        activateRoom($roomKey, $subjectId);
    }

    pruneRoom($roomKey);

    $signalSince = getMaxSignalId($roomKey);
    $classActive = isSessionLive($roomKey);
    $hostPresent = isHostPresent($roomKey);

    echo json_encode([
        'success' => true,
        'data' => [
            'room_key' => $roomKey,
            'user_id'  => (int)Auth::id(),
            'is_host'  => $host,
            'display_name' => buildDisplayName($user),
            'class_active' => $classActive,
            'host_present' => $hostPresent,
            'signal_since' => $signalSince,
        ],
    ]);
}

function handlePoll() {
    $roomKey = sanitizeRoomKey($_GET['room_key'] ?? '');
    $since         = max(0, (int)($_GET['since'] ?? 0));
    $commentSince  = max(0, (int)($_GET['comment_since'] ?? 0));
    $subjectId = parseSubjectIdFromRoom($roomKey);

    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }

    requireRoomAccess($subjectId);

    $userId = Auth::id();

    db()->execute(
        "INSERT INTO video_presence (room_key, user_id, display_name, user_role, is_host, last_seen)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_seen = NOW()",
        [
            $roomKey,
            $userId,
            buildDisplayName(Auth::user()),
            Auth::role(),
            isHostRole(Auth::role()) ? 1 : 0,
        ]
    );

    pruneRoom($roomKey);

    $participants = db()->fetchAll(
        "SELECT user_id, display_name, user_role, is_host
         FROM video_presence
         WHERE room_key = ?
         ORDER BY is_host DESC, display_name ASC",
        [$roomKey]
    );

    $session = getRoomSession($roomKey);
    $sessionStart = $session['started_at'] ?? null;

    $signalSql = "SELECT signal_id, from_user_id, to_user_id, signal_type, payload, created_at
         FROM video_signals
         WHERE room_key = ? AND signal_id > ?
           AND (to_user_id IS NULL OR to_user_id = ? OR from_user_id = ?)";
    $signalParams = [$roomKey, $since, $userId, $userId];

    if ($sessionStart) {
        $signalSql .= " AND (signal_type != 'host-end' OR created_at >= ?)";
        $signalParams[] = $sessionStart;
    }

    $signalSql .= " ORDER BY signal_id ASC LIMIT 200";
    $signals = db()->fetchAll($signalSql, $signalParams);

    $parsed = array_map(function ($row) {
        $payload = json_decode($row['payload'], true);
        return [
            'id'         => (int)$row['signal_id'],
            'from'       => (int)$row['from_user_id'],
            'to'         => $row['to_user_id'] !== null ? (int)$row['to_user_id'] : null,
            'type'       => $row['signal_type'],
            'payload'    => $payload !== null ? $payload : $row['payload'],
        ];
    }, $signals);

    $lastId = $since;
    foreach ($parsed as $sig) {
        if ($sig['id'] > $lastId) $lastId = $sig['id'];
    }

    $classActive = isSessionLive($roomKey);
    $comments = [];
    $lastCommentId = 0;

    if (!$classActive) {
        purgeRoomComments($roomKey);
    } else {
        $comments = db()->fetchAll(
            "SELECT comment_id, user_id, display_name, content, created_at
             FROM video_comments
             WHERE room_key = ? AND comment_id > ?
             ORDER BY comment_id ASC
             LIMIT 100",
            [$roomKey, $commentSince]
        );

        $lastCommentId = $commentSince;
        foreach ($comments as $c) {
            if ((int)$c['comment_id'] > $lastCommentId) {
                $lastCommentId = (int)$c['comment_id'];
            }
        }
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'participants' => array_map(function ($p) {
                return [
                    'user_id'      => (int)$p['user_id'],
                    'display_name' => buildDisplayNameFromStored($p['display_name']),
                    'role'         => $p['user_role'],
                    'is_host'      => (bool)$p['is_host'],
                ];
            }, $participants),
            'signals' => $parsed,
            'since'   => $lastId,
            'class_active' => $classActive,
            'comments' => array_map(function ($c) {
                return [
                    'id'           => (int)$c['comment_id'],
                    'user_id'      => (int)$c['user_id'],
                    'display_name' => buildDisplayNameFromStored($c['display_name']),
                    'content'      => $c['content'],
                    'created_at'   => $c['created_at'],
                ];
            }, $comments),
            'comment_since' => $lastCommentId,
        ],
    ]);
}

/** Strip legacy "Name (ID)" format stored before name-only display */
function buildDisplayNameFromStored($name) {
    $name = trim((string)$name);
    if (preg_match('/^(.+?)\s*\([^)]+\)\s*$/', $name, $m)) {
        return trim($m[1]) ?: 'User';
    }
    return $name !== '' ? $name : 'User';
}

function handleSignal() {
    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');
    $type    = trim((string)($body['type'] ?? ''));
    $toUser  = isset($body['to_user_id']) ? (int)$body['to_user_id'] : null;
    $payload = $body['payload'] ?? null;

    if ($roomKey === '' || $type === '' || $payload === null) {
        echo json_encode(['success' => false, 'message' => 'Invalid signal']);
        return;
    }

    requireRoomAccess(parseSubjectIdFromRoom($roomKey));

    $allowed = ['offer', 'answer', 'ice', 'host-end'];
    if (!in_array($type, $allowed, true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid signal type']);
        return;
    }

    if ($type === 'host-end' && !isHostRole(Auth::role())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Only instructor can end class']);
        return;
    }

    db()->execute(
        "INSERT INTO video_signals (room_key, from_user_id, to_user_id, signal_type, payload)
         VALUES (?, ?, ?, ?, ?)",
        [
            $roomKey,
            Auth::id(),
            $toUser ?: null,
            $type,
            json_encode($payload),
        ]
    );

    if ($type === 'host-end') {
        db()->execute("DELETE FROM video_presence WHERE room_key = ?", [$roomKey]);
        endRoom($roomKey);
    }

    echo json_encode(['success' => true]);
}

function handleLeave() {
    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');

    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }

    db()->execute(
        "DELETE FROM video_presence WHERE room_key = ? AND user_id = ?",
        [$roomKey, Auth::id()]
    );

    echo json_encode(['success' => true]);
}

function handleEnd() {
    if (!isHostRole(Auth::role())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Only instructor can end class']);
        return;
    }

    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');

    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }

    db()->execute(
        "INSERT INTO video_signals (room_key, from_user_id, to_user_id, signal_type, payload)
         VALUES (?, ?, NULL, 'host-end', ?)",
        [$roomKey, Auth::id(), json_encode(['ended' => true])]
    );

    db()->execute("DELETE FROM video_presence WHERE room_key = ?", [$roomKey]);
    endRoom($roomKey);

    echo json_encode(['success' => true]);
}

function handleComments() {
    $roomKey = sanitizeRoomKey($_GET['room_key'] ?? '');
    $since   = max(0, (int)($_GET['since'] ?? 0));

    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }

    requireRoomAccess(parseSubjectIdFromRoom($roomKey));

    $classActive = isSessionLive($roomKey);
    $comments = [];
    $lastId = 0;

    if (!$classActive) {
        purgeRoomComments($roomKey);
    } else {
        $comments = db()->fetchAll(
            "SELECT comment_id, user_id, display_name, content, created_at
             FROM video_comments
             WHERE room_key = ? AND comment_id > ?
             ORDER BY comment_id ASC
             LIMIT 100",
            [$roomKey, $since]
        );

        $lastId = $since;
        foreach ($comments as $c) {
            if ((int)$c['comment_id'] > $lastId) $lastId = (int)$c['comment_id'];
        }
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'class_active' => $classActive,
            'comments' => array_map(function ($c) {
                return [
                    'id'           => (int)$c['comment_id'],
                    'user_id'      => (int)$c['user_id'],
                    'display_name' => buildDisplayNameFromStored($c['display_name']),
                    'content'      => $c['content'],
                    'created_at'   => $c['created_at'],
                ];
            }, $comments),
            'since' => $lastId,
        ],
    ]);
}

function handleComment() {
    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');
    $content = trim((string)($body['content'] ?? ''));

    if ($roomKey === '' || $content === '') {
        echo json_encode(['success' => false, 'message' => 'Comment cannot be empty']);
        return;
    }

    if (mb_strlen($content) > 500) {
        echo json_encode(['success' => false, 'message' => 'Comment is too long (max 500 characters)']);
        return;
    }

    requireRoomAccess(parseSubjectIdFromRoom($roomKey));

    if (!isSessionLive($roomKey)) {
        purgeRoomComments($roomKey);
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Class has ended. Comments are closed.']);
        return;
    }

    $user = Auth::user();
    db()->execute(
        "INSERT INTO video_comments (room_key, user_id, display_name, content)
         VALUES (?, ?, ?, ?)",
        [$roomKey, Auth::id(), buildDisplayName($user), $content]
    );

    echo json_encode([
        'success' => true,
        'data' => [
            'id' => (int)db()->lastInsertId(),
        ],
    ]);
}
