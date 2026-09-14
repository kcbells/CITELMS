<?php
/**
 * Shared due-date helpers for lessons and quizzes.
 */

function ensureLessonDueDateColumn(): void {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        $col = db()->fetchOne("SHOW COLUMNS FROM lessons LIKE 'due_date'");
        if (!$col) {
            pdo()->exec(
                "ALTER TABLE lessons ADD COLUMN due_date DATETIME NULL DEFAULT NULL
                 COMMENT 'Exact deadline students must turn in by' AFTER status"
            );
        } elseif (stripos($col['Type'] ?? '', 'date') !== false && stripos($col['Type'] ?? '', 'datetime') === false) {
            pdo()->exec("ALTER TABLE lessons MODIFY COLUMN due_date DATETIME NULL DEFAULT NULL");
        }
    } catch (Exception $e) {
        error_log('lesson due_date column: ' . $e->getMessage());
    }
}

function normalizeDueDate($raw): ?string {
    $raw = trim((string)($raw ?? ''));
    if ($raw === '') {
        return null;
    }
    // Accept HTML datetime-local format: "2025-06-20T23:00" → "2025-06-20 23:00:00"
    $raw = str_replace('T', ' ', $raw);
    $ts = strtotime($raw);
    if ($ts === false) {
        return null;
    }
    // If no time component was given (bare date), default to end of day
    return (preg_match('/\d{1,2}:\d{2}/', $raw))
        ? date('Y-m-d H:i:s', $ts)
        : date('Y-m-d 23:59:59', $ts);
}

/**
 * The deadline that actually applies to a quiz: its own due_date if set,
 * otherwise the module-level default the instructor put on the module card
 * (module_requirements.due_date). Returns null when neither is set.
 */
function effectiveQuizDueDate(array $quiz): ?string {
    if (!empty($quiz['due_date'])) {
        return (string)$quiz['due_date'];
    }
    if (empty($quiz['subject_id']) || empty($quiz['module_number'])) {
        return null;
    }
    ensureModuleRequirementsDueDate();
    try {
        $row = db()->fetchOne(
            "SELECT due_date FROM module_requirements WHERE subject_id = ? AND module_number = ?",
            [(int)$quiz['subject_id'], (int)$quiz['module_number']]
        );
    } catch (Exception $e) {
        return null;
    }
    return !empty($row['due_date']) ? (string)$row['due_date'] : null;
}

/**
 * module_requirements is created by ModuleDocumentsAPI's bootstrap, but the
 * deadline is READ from here — on a student's quiz-start request, which never
 * loads that file. Without this guard the module-level deadline would be
 * silently ignored until some instructor happened to open Module Documents.
 */
function ensureModuleRequirementsDueDate(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS `module_requirements` (
            `subject_id`        INT     NOT NULL,
            `module_number`     TINYINT NOT NULL,
            `require_all_parts` TINYINT(1) NOT NULL DEFAULT 0,
            `due_date`          DATETIME NULL,
            `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`subject_id`, `module_number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
        $col = db()->fetchOne("SHOW COLUMNS FROM `module_requirements` LIKE 'due_date'");
        if (!$col) {
            pdo()->exec("ALTER TABLE `module_requirements` ADD COLUMN `due_date` DATETIME NULL AFTER `require_all_parts`");
        } elseif (stripos((string)$col['Type'], 'datetime') === false) {
            pdo()->exec("UPDATE `module_requirements` SET due_date = CONCAT(due_date, ' 23:59:59') WHERE due_date IS NOT NULL");
            pdo()->exec("ALTER TABLE `module_requirements` MODIFY COLUMN `due_date` DATETIME NULL");
        }
    } catch (Exception $e) {
        error_log('ensureModuleRequirementsDueDate: ' . $e->getMessage());
    }
}

function isPastDueDate(?string $dueDate): bool {
    if (!$dueDate) {
        return false;
    }
    $raw = str_replace('T', ' ', trim($dueDate));
    // A bare date means the END of that day, matching normalizeDueDate() above.
    // quiz.due_date is a DATE column, so without this a quiz due "Dec 1" was
    // treated as due at 00:00 and locked students out for the whole of Dec 1 —
    // a day earlier than the instructor meant. lessons.due_date carries a real
    // time and is unaffected.
    if (!preg_match('/\d{1,2}:\d{2}/', $raw)) {
        $raw .= ' 23:59:59';
    }
    $dueTs = strtotime($raw);
    return $dueTs !== false && $dueTs < time();
}

function fetchLessonDueDate(int $lessonsId): ?string {
    ensureLessonDueDateColumn();
    $row = db()->fetchOne('SELECT due_date FROM lessons WHERE lessons_id = ?', [$lessonsId]);
    return !empty($row['due_date']) ? (string)$row['due_date'] : null;
}

function fetchQuizDueDate(int $quizId): ?string {
    require_once __DIR__ . '/QuizSectionHelper.php';
    ensureQuizScheduleColumns();
    $row = db()->fetchOne('SELECT due_date FROM quiz WHERE quiz_id = ?', [$quizId]);
    return !empty($row['due_date']) ? (string)$row['due_date'] : null;
}

/**
 * Block student turn-in after due date (instructors may always extend due dates).
 */
function assertStudentCanTurnIn(int $subjectId, ?int $lessonsId, ?int $quizId, int $userId): void {
    $access = requireClassAccess($subjectId, $userId);
    if (!empty($access['is_instructor'])) {
        return;
    }

    $due = $lessonsId ? fetchLessonDueDate($lessonsId) : fetchQuizDueDate((int)$quizId);
    if (isPastDueDate($due)) {
        throw new InvalidArgumentException('This assignment is past its due date. Contact your instructor if you need an extension.');
    }
}
