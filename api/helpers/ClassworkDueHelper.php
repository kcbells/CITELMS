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
        if (!db()->fetchOne("SHOW COLUMNS FROM lessons LIKE 'due_date'")) {
            pdo()->exec(
                "ALTER TABLE lessons ADD COLUMN due_date DATE NULL DEFAULT NULL
                 COMMENT 'Last day students can turn in work' AFTER status"
            );
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
    $ts = strtotime($raw);
    return $ts !== false ? date('Y-m-d', $ts) : null;
}

function isPastDueDate(?string $dueDate): bool {
    if (!$dueDate) {
        return false;
    }
    $dueTs = strtotime($dueDate . ' 23:59:59');
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
