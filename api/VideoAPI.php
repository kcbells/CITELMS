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
 * POST ?action=hand    { room_key, raised, user_id? } — raise/lower hand (host may lower anyone's)
 * POST ?action=react   { room_key, emoji }            — emoji reaction everyone sees
 * POST ?action=media   { room_key, cam_off, mic_off }  — my camera / mic state
 * GET  ?action=roster&room_key=...                     — host: enrolled students, in class or not
 * POST ?action=notify_absent { room_key, user_ids? }   — host: message students who have not joined
 * POST ?action=host_cmd { room_key, user_id?, cmd }    — host: mute / mute_all / cam_request
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/ContentFilter.php';
require_once __DIR__ . '/helpers/ActivityLog.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? ($_GET['action'] ?? '') : '');

ensureVideoSchema();

// RBAC: video.view (join/participate) is granted to every role; video.host
// (end a session for everyone) is enforced separately inside isHostRole().
$_videoPerms = [
    'join'     => 'video.view',
    'poll'     => 'video.view',
    'signal'   => 'video.view',
    'leave'    => 'video.view',
    'comments' => 'video.view',
    'comment'  => 'video.view',
    'hand'     => 'video.view',
    'react'    => 'video.view',
    'media'    => 'video.view',
    'roster'   => 'video.view',
    'notify_absent' => 'video.view',
    'host_cmd' => 'video.view',
];
if (isset($_videoPerms[$action]) && !Auth::can($_videoPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_videoPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'join':   handleJoin();   break;
    case 'poll':   handlePoll();   break;
    case 'signal': handleSignal(); break;
    case 'leave':  handleLeave();  break;
    case 'end':      handleEnd();      break;
    case 'comments': handleComments(); break;
    case 'comment':  handleComment();  break;
    case 'hand':     handleHand();     break;
    case 'react':    handleReact();    break;
    case 'media':    handleMedia();    break;
    case 'roster':   handleRoster();   break;
    case 'notify_absent': handleNotifyAbsent(); break;
    case 'host_cmd': handleHostCmd();  break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function ensureVideoSchema() {
    static $done = false;
    if ($done) return;
    $done = true;
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

        // Raise-hand state lives with presence so late joiners see it too.
        $cols = array_column(db()->fetchAll('SHOW COLUMNS FROM video_presence'), 'Field');
        if (!in_array('hand_raised', $cols, true)) {
            pdo()->exec("ALTER TABLE video_presence ADD COLUMN hand_raised TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN hand_at TIMESTAMP NULL DEFAULT NULL");
        }
        // Camera on/off is told to everyone directly: a switched-off camera
        // cannot be reliably detected from the video stream on every browser.
        if (!in_array('cam_off', $cols, true)) {
            pdo()->exec("ALTER TABLE video_presence ADD COLUMN cam_off TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!in_array('mic_off', $cols, true)) {
            pdo()->exec("ALTER TABLE video_presence ADD COLUMN mic_off TINYINT(1) NOT NULL DEFAULT 0");
        }
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

// $role is unused now but kept in the signature — every call site passes
// Auth::role() (the current session's own role; there's no "check some
// other user's role" caller here), so this just reads live off RBAC
// instead of a hardcoded ['instructor','admin','dean'] list that silently
// excluded program_head even though they hold video.host per role_permissions.
function isHostRole($role) {
    return Auth::can('video.host');
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
            hand_raised = 0,
            hand_at = NULL,
            cam_off = 0,
            mic_off = 0,
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
            'ice_servers'  => videoIceServers(),
        ],
    ]);
}

/**
 * STUN finds a direct path between two devices. On mobile data and many
 * school/home routers there is none, and video only flows through a TURN
 * relay. TURN needs an account, so it is read from .env:
 *   TURN_URLS=turn:host:3478,turns:host:443?transport=tcp
 *   TURN_USERNAME=...
 *   TURN_CREDENTIAL=...
 */
function videoIceServers(): array {
    $servers = [
        ['urls' => ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478']],
    ];
    $turn = trim((string)(envValue('TURN_URLS') ?: ''));
    if ($turn !== '') {
        $servers[] = [
            'urls'       => array_values(array_filter(array_map('trim', explode(',', $turn)))),
            'username'   => (string)(envValue('TURN_USERNAME') ?: ''),
            'credential' => (string)(envValue('TURN_CREDENTIAL') ?: ''),
        ];
    }
    return $servers;
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
        "SELECT user_id, display_name, user_role, is_host, hand_raised, hand_at, cam_off, mic_off
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
                    'hand_raised'  => !empty($p['hand_raised']),
                    'hand_at'      => $p['hand_at'] ?? null,
                    'cam_off'      => !empty($p['cam_off']),
                    'mic_off'      => !empty($p['mic_off']),
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

    if (contentFilterReject($content)) return;

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

function handleHand() {
    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');
    $raised  = !empty($body['raised']);
    $target  = isset($body['user_id']) ? (int)$body['user_id'] : (int)Auth::id();

    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }
    requireRoomAccess(parseSubjectIdFromRoom($roomKey));

    // Anyone can raise or lower their own hand; only the host lowers someone else's.
    if ($target !== (int)Auth::id() && ($raised || !isHostRole(Auth::role()))) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Only the instructor can lower another hand']);
        return;
    }

    db()->execute(
        "UPDATE video_presence SET hand_raised = ?, hand_at = " . ($raised ? 'NOW()' : 'NULL') . "
         WHERE room_key = ? AND user_id = ?",
        [$raised ? 1 : 0, $roomKey, $target]
    );
    echo json_encode(['success' => true, 'data' => ['raised' => $raised]]);
}

function handleReact() {
    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');
    $emoji   = (string)($body['emoji'] ?? '');

    // A fixed set: reactions are shown to everyone, so nothing free-typed.
    $allowed = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🙏', '🤔'];
    if ($roomKey === '' || !in_array($emoji, $allowed, true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid reaction']);
        return;
    }
    requireRoomAccess(parseSubjectIdFromRoom($roomKey));

    // Rate limit: one reaction per ~0.7s per person is plenty.
    $recent = db()->fetchOne(
        "SELECT COUNT(*) n FROM video_signals
         WHERE room_key = ? AND from_user_id = ? AND signal_type = 'react'
           AND created_at >= DATE_SUB(NOW(), INTERVAL 3 SECOND)",
        [$roomKey, Auth::id()]
    );
    if ((int)($recent['n'] ?? 0) >= 4) {
        echo json_encode(['success' => true, 'data' => ['throttled' => true]]);
        return;
    }

    db()->execute(
        "INSERT INTO video_signals (room_key, from_user_id, to_user_id, signal_type, payload)
         VALUES (?, ?, NULL, 'react', ?)",
        [$roomKey, Auth::id(), json_encode(['emoji' => $emoji], JSON_UNESCAPED_UNICODE)]
    );
    echo json_encode(['success' => true]);
}
function handleMedia() {
    $body    = getJsonBody();
    $roomKey = sanitizeRoomKey($body['room_key'] ?? '');
    if ($roomKey === '') {
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        return;
    }
    requireRoomAccess(parseSubjectIdFromRoom($roomKey));
    $sets = []; $params = [];
    if (array_key_exists('cam_off', $body)) { $sets[] = 'cam_off = ?'; $params[] = !empty($body['cam_off']) ? 1 : 0; }
    if (array_key_exists('mic_off', $body)) { $sets[] = 'mic_off = ?'; $params[] = !empty($body['mic_off']) ? 1 : 0; }
    if ($sets) {
        $params[] = $roomKey; $params[] = Auth::id();
        db()->execute("UPDATE video_presence SET " . implode(', ', $sets) . " WHERE room_key = ? AND user_id = ?", $params);
    }
    echo json_encode(['success' => true]);
}
/** Host-only guard for the class controls below. Returns the subject id. */
function requireRoomHost(string $roomKey): int {
    if ($roomKey === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'room_key required']);
        exit;
    }
    $subjectId = parseSubjectIdFromRoom($roomKey);
    requireRoomAccess($subjectId);
    if (!isHostRole(Auth::role())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Only the instructor can do this']);
        exit;
    }
    return $subjectId;
}

/**
 * Students enrolled in this subject under the host, each marked in class or
 * not. An instructor sees their own sections; admin/dean see every section.
 */
function classRoster(string $roomKey, int $subjectId): array {
    $sql = "SELECT DISTINCT u.users_id, u.first_name, u.last_name, sec.section_name
            FROM student_subject ss
            JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
            JOIN users u ON u.users_id = ss.user_student_id
            LEFT JOIN section sec ON sec.section_id = ss.section_id
            WHERE so.subject_id = ? AND so.status = 'open' AND ss.status = 'enrolled'
              AND u.status = 'active'";
    $params = [$subjectId];
    if (Auth::role() === 'instructor') {
        $sql .= " AND so.user_teacher_id = ?";
        $params[] = Auth::id();
    }
    $sql .= " ORDER BY u.last_name, u.first_name";
    $students = db()->fetchAll($sql, $params);

    $present = array_flip(array_map('intval', array_column(
        db()->fetchAll("SELECT user_id FROM video_presence WHERE room_key = ?", [$roomKey]), 'user_id'
    )));

    return array_map(fn($st) => [
        'user_id'   => (int)$st['users_id'],
        'name'      => trim($st['first_name'] . ' ' . $st['last_name']),
        'section'   => $st['section_name'] ?? '',
        'in_class'  => isset($present[(int)$st['users_id']]),
    ], $students);
}

function handleRoster() {
    $roomKey   = sanitizeRoomKey($_GET['room_key'] ?? '');
    $subjectId = requireRoomHost($roomKey);
    pruneRoom($roomKey);
    $roster = classRoster($roomKey, $subjectId);
    echo json_encode(['success' => true, 'data' => [
        'students' => $roster,
        'absent'   => count(array_filter($roster, fn($r) => !$r['in_class'])),
    ]]);
}

/**
 * "Notify all": a direct message from the instructor to every enrolled
 * student who has not joined. Messages show up in the student's Messages
 * with the unread badge, which refreshes on its own.
 */
function handleNotifyAbsent() {
    $body      = getJsonBody();
    $roomKey   = sanitizeRoomKey($body['room_key'] ?? '');
    $subjectId = requireRoomHost($roomKey);
    $only      = array_map('intval', (array)($body['user_ids'] ?? []));

    $absent = array_filter(classRoster($roomKey, $subjectId), fn($r) => !$r['in_class']);
    if ($only) $absent = array_filter($absent, fn($r) => in_array($r['user_id'], $only, true));

    // No double-pinging: skip anyone already notified for this room in the last 5 minutes.
    $subject = db()->fetchOne("SELECT subject_code, subject_name FROM subject WHERE subject_id = ?", [$subjectId]);
    $label   = trim(($subject['subject_code'] ?? '') . ' ' . ($subject['subject_name'] ?? '')) ?: 'our subject';
    $text    = "📹 Our online class for {$label} is live now. Please join: open the subject and tap Join class.";

    $sent = 0; $skipped = 0;
    foreach ($absent as $st) {
        $recent = db()->fetchOne(
            "SELECT message_id FROM messages
             WHERE sender_id = ? AND receiver_id = ? AND content = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1",
            [Auth::id(), $st['user_id'], $text]
        );
        if ($recent) { $skipped++; continue; }
        db()->execute("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
            [Auth::id(), $st['user_id'], $text]);
        $sent++;
    }
    echo json_encode(['success' => true, 'data' => ['sent' => $sent, 'skipped' => $skipped],
        'message' => $sent ? "Notified {$sent} student" . ($sent > 1 ? 's' : '') . '.' : 'Everyone was already notified in the last 5 minutes.']);
}

/**
 * Instructor controls. The student's browser carries them out:
 *   mute        — their microphone turns off (only they can turn it back on)
 *   mute_all    — everyone's microphone except the host's
 *   cam_request — they are ASKED to turn on the camera; nobody's camera is
 *                 ever switched on remotely
 */
function handleHostCmd() {
    $body      = getJsonBody();
    $roomKey   = sanitizeRoomKey($body['room_key'] ?? '');
    requireRoomHost($roomKey);
    $cmd       = (string)($body['cmd'] ?? '');
    $target    = (int)($body['user_id'] ?? 0);

    if (!in_array($cmd, ['mute', 'mute_all', 'cam_request'], true)) {
        echo json_encode(['success' => false, 'message' => 'Unknown command']);
        return;
    }
    if ($cmd !== 'mute_all' && $target <= 0) {
        echo json_encode(['success' => false, 'message' => 'Choose a student']);
        return;
    }

    $name = buildDisplayName(Auth::user());
    db()->execute(
        "INSERT INTO video_signals (room_key, from_user_id, to_user_id, signal_type, payload) VALUES (?, ?, ?, 'cmd', ?)",
        [$roomKey, Auth::id(), $cmd === 'mute_all' ? null : $target, json_encode(['cmd' => $cmd, 'by' => $name], JSON_UNESCAPED_UNICODE)]
    );
    if ($cmd === 'mute') {
        db()->execute("UPDATE video_presence SET mic_off = 1 WHERE room_key = ? AND user_id = ?", [$roomKey, $target]);
    } elseif ($cmd === 'mute_all') {
        db()->execute("UPDATE video_presence SET mic_off = 1 WHERE room_key = ? AND is_host = 0", [$roomKey]);
    }
    echo json_encode(['success' => true]);
}