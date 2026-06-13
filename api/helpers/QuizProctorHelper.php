<?php
/**
 * Server-side quiz proctor lock — blocks AI assistant while a graded quiz is active.
 */

function isQuizProctoredType(?string $quizType): bool {
    $t = strtolower(trim((string)$quizType));
    return $t !== 'practice';
}

function setQuizProctorLock(int $quizId): void {
    if ($quizId < 1) return;
    $_SESSION['quiz_proctor_lock'] = $quizId;
    $_SESSION['quiz_proctor_started'] = time();
}

function clearQuizProctorLock(): void {
    unset($_SESSION['quiz_proctor_lock'], $_SESSION['quiz_proctor_started']);
}

function getQuizProctorLockId(): int {
    return (int)($_SESSION['quiz_proctor_lock'] ?? 0);
}

function isQuizProctorLocked(): bool {
    return getQuizProctorLockId() > 0;
}
