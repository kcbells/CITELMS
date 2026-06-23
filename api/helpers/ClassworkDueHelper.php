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

function isPastDueDate(?string $dueDate): bool {
    if (!$dueDate) {
        return false;
    }
    $dueTs = strtotime($dueDate);
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
