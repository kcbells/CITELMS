<?php
/**
 * Quiz ↔ section targeting (same pattern as lessons / announcements).
 */

function ensureQuizBehaviorColumns() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $hasOneAtATime = db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'one_at_a_time'");
        if (!$hasOneAtATime) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN one_at_a_time TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT 'Show one question at a time; student cannot go back'"
            );
        }
        $hasRandomized = db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'is_randomized'");
        if (!$hasRandomized) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN is_randomized TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT 'Shuffle question order and answer choices per attempt'"
            );
        }
        ensureQuizGradingColumns();
    } catch (Exception $e) {
        error_log('quiz behavior columns: ' . $e->getMessage());
    }
}

/**
 * How objective / subjective answers are checked when students submit.
 */
function ensureQuizGradingColumns() {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'objective_grading_mode'")) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN objective_grading_mode VARCHAR(20) NOT NULL DEFAULT 'auto'
                 COMMENT 'auto|ai_auto|ai_review|manual — MC/TF always auto-scored'"
            );
        }
        if (!db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'subjective_grading_mode'")) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN subjective_grading_mode VARCHAR(20) NOT NULL DEFAULT 'ai_auto'
                 COMMENT 'manual|ai_auto|ai_review|answer_key'"
            );
        }
    } catch (Exception $e) {
        error_log('quiz grading columns: ' . $e->getMessage());
    }
}

function normalizeObjectiveGradingMode(?string $mode): string {
    $allowed = ['auto', 'ai_auto', 'ai_review', 'manual'];
    $mode = strtolower(trim((string)$mode));
    return in_array($mode, $allowed, true) ? $mode : 'auto';
}

function normalizeSubjectiveGradingMode(?string $mode): string {
    $allowed = ['manual', 'ai_auto', 'ai_review', 'answer_key'];
    $mode = strtolower(trim((string)$mode));
    return in_array($mode, $allowed, true) ? $mode : 'ai_auto';
}

function ensureQuizSectionTable() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec(
            "CREATE TABLE IF NOT EXISTS quiz_section (
                quiz_id INT UNSIGNED NOT NULL,
                section_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (quiz_id, section_id),
                KEY idx_quiz_section (section_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    } catch (Exception $e) {
        error_log('quiz_section table: ' . $e->getMessage());
    }
}

function attachQuizSections($quizId, array $sectionIds) {
    ensureQuizSectionTable();
    $pdo = pdo();
    $pdo->prepare("DELETE FROM quiz_section WHERE quiz_id = ?")->execute([(int)$quizId]);
    if (empty($sectionIds)) return;
    $stmt = $pdo->prepare("INSERT INTO quiz_section (quiz_id, section_id) VALUES (?, ?)");
    foreach ($sectionIds as $sid) {
        $sid = (int)$sid;
        if ($sid > 0) {
            $stmt->execute([(int)$quizId, $sid]);
        }
    }
}

function getQuizSectionIds($quizId) {
    ensureQuizSectionTable();
    $rows = db()->fetchAll(
        "SELECT section_id FROM quiz_section WHERE quiz_id = ?",
        [(int)$quizId]
    );
    return array_map(fn($r) => (int)$r['section_id'], $rows);
}

function enrichQuizzesWithSections(array &$rows) {
    foreach ($rows as &$row) {
        $ids = getQuizSectionIds((int)$row['quiz_id']);
        $row['section_ids'] = $ids;
        $row['all_sections'] = empty($ids);
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

function applyQuizSectionTargeting($quizId, $allSections, array $sectionIds) {
    if ($allSections) {
        attachQuizSections($quizId, []);
        return;
    }
    attachQuizSections($quizId, $sectionIds);
}

/**
 * Ensure scheduling columns exist on quiz table.
 */
function ensureTabSwitchColumn() {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM student_quiz_attempts LIKE 'tab_switch_count'")) {
            pdo()->exec(
                "ALTER TABLE student_quiz_attempts
                 ADD COLUMN tab_switch_count INT NOT NULL DEFAULT 0
                 COMMENT 'Tab/window switches detected during attempt'"
            );
        }
    } catch (Exception $e) {
        error_log('tab_switch_count column: ' . $e->getMessage());
    }
}

function ensureQuizScheduleColumns() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'availability_start'")) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN availability_start TIMESTAMP NULL DEFAULT NULL
                 COMMENT 'When quiz becomes visible to students' AFTER status"
            );
        }
        if (!db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'due_date'")) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN due_date DATE NULL DEFAULT NULL AFTER availability_start"
            );
        }
    } catch (Exception $e) {
        error_log('quiz schedule columns: ' . $e->getMessage());
    }
}

/**
 * SQL fragment: quiz is published (may still be scheduled for later).
 */
function quizPublishedSql(string $alias = 'q'): string {
    return "{$alias}.status = 'published'";
}

/**
 * SQL fragment: quiz is visible to students (published and schedule has passed).
 */
function quizVisibleToStudentsSql(string $alias = 'q'): string {
    return quizPublishedSql($alias) . "
            AND ({$alias}.availability_start IS NULL OR {$alias}.availability_start <= NOW())";
}

/**
 * Whether a quiz row is currently available for students to take.
 */
function isQuizAvailableNow(array $quiz): bool {
    if (($quiz['status'] ?? '') !== 'published') {
        return false;
    }
    $start = $quiz['availability_start'] ?? null;
    if ($start === null || $start === '') {
        return true;
    }
    return strtotime((string)$start) <= time();
}

/**
 * Max attempts configured for a quiz (null = unlimited).
 */
function quizAttemptLimit(array $quiz): ?int {
    $max = (int)($quiz['max_attempts'] ?? 0);
    return $max > 0 ? $max : null;
}

/**
 * Parse max_attempts from instructor create/update payload.
 */
function parseQuizMaxAttempts(array $d): int {
    if (!empty($d['unlimited_attempts'])) {
        return 0;
    }
    if (array_key_exists('max_attempts', $d) && (int)$d['max_attempts'] === 0) {
        return 0;
    }
    $n = (int)($d['max_attempts'] ?? 3);
    if ($n < 1) {
        $n = 3;
    }
    return min($n, 99);
}

/**
 * Whether the student has used all allowed attempts.
 */
function quizAttemptsExhausted(array $quiz, int $attemptsUsed): bool {
    $limit = quizAttemptLimit($quiz);
    return $limit !== null && $attemptsUsed >= $limit;
}

/**
 * Apply attempt limits to student-facing quiz rows.
 */
function enrichQuizAttemptAccess(array &$quiz): void {
    $used = (int)($quiz['attempts_used'] ?? 0);
    $limit = quizAttemptLimit($quiz);

    $passed = !empty($quiz['passed']);
    if (!$passed && isset($quiz['best_score'], $quiz['passing_rate']) && $quiz['best_score'] !== null) {
        $passed = (float)$quiz['best_score'] >= (float)$quiz['passing_rate'];
    }

    if ($limit === null) {
        $quiz['attempts_remaining'] = null;
        $quiz['has_attempts_left'] = true;
    } else {
        $quiz['attempts_remaining'] = max(0, $limit - $used);
        $quiz['has_attempts_left'] = $used < $limit;
    }

    $overdue = false;
    if (!empty($quiz['due_date'])) {
        $dueTs = strtotime((string)$quiz['due_date'] . ' 23:59:59');
        $overdue = $dueTs !== false && $dueTs < time();
    }

    $available = !empty($quiz['is_available']) || isQuizAvailableNow($quiz);

    if ($passed) {
        $quiz['can_take'] = false;
    } elseif ($overdue) {
        $quiz['can_take'] = false;
    } else {
        $quiz['can_take'] = $available && !empty($quiz['has_attempts_left']);
    }

    if (!$passed && !$quiz['has_attempts_left'] && $used > 0 && isset($quiz['quiz_status'])) {
        $quiz['quiz_status'] = 'exhausted';
    }
}

/**
 * Enrich quiz rows with availability flags for student UI.
 */
function enrichQuizAvailability(array &$quiz): void {
    $quiz['is_available'] = isQuizAvailableNow($quiz);
    enrichQuizAttemptAccess($quiz);
}

/**
 * Parse publish_mode from create/update payload.
 *
 * @return array{status:string,availability_start:?string,due_date:?string,publish_mode:string}
 */
function parseQuizPublishInput(array $d): array {
    $mode = $d['publish_mode'] ?? null;
    if (!$mode && isset($d['status'])) {
        $mode = ($d['status'] === 'published') ? 'now' : 'draft';
    }
    if (!in_array($mode, ['draft', 'now', 'scheduled'], true)) {
        $mode = 'draft';
    }

    $status = 'draft';
    $availabilityStart = null;

    if ($mode === 'now') {
        $status = 'published';
    } elseif ($mode === 'scheduled') {
        $raw = trim((string)($d['availability_start'] ?? ''));
        if ($raw === '') {
            throw new InvalidArgumentException('Please choose a date and time for the scheduled release.');
        }
        $ts = strtotime($raw);
        if ($ts === false) {
            throw new InvalidArgumentException('Invalid schedule date/time.');
        }
        if ($ts <= time()) {
            throw new InvalidArgumentException('Scheduled time must be in the future.');
        }
        $status = 'published';
        $availabilityStart = date('Y-m-d H:i:s', $ts);
    }

    $dueDate = null;
    $dueRaw = trim((string)($d['due_date'] ?? ''));
    if ($dueRaw !== '') {
        $dueTs = strtotime($dueRaw);
        if ($dueTs !== false) {
            $dueDate = date('Y-m-d', $dueTs);
        }
    }

    return [
        'status'             => $status,
        'availability_start' => $availabilityStart,
        'due_date'           => $dueDate,
        'publish_mode'       => $mode,
    ];
}
