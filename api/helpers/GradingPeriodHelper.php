<?php
/**
 * COC grading periods — P1 Midterms, P2 Prefinals, P3 Finals
 */

function ensureGradingPeriodColumns(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM quiz LIKE 'grading_period'")) {
            pdo()->exec(
                "ALTER TABLE quiz ADD COLUMN grading_period VARCHAR(2) NOT NULL DEFAULT 'P1'
                 COMMENT 'P1=Midterms P2=Prefinals P3=Finals' AFTER quiz_type"
            );
        }
        if (!db()->fetchOne("SHOW COLUMNS FROM lessons LIKE 'grading_period'")) {
            pdo()->exec(
                "ALTER TABLE lessons ADD COLUMN grading_period VARCHAR(2) NOT NULL DEFAULT 'P1'
                 COMMENT 'P1=Midterms P2=Prefinals P3=Finals' AFTER status"
            );
        }
    } catch (Exception $e) {
        error_log('grading_period columns: ' . $e->getMessage());
    }
}

/**
 * Per-class "current term" — which grading period is currently released/active.
 * Stored on subject_offered so each teaching assignment can advance independently.
 */
function ensureCurrentPeriodColumn(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM subject_offered LIKE 'current_period'")) {
            pdo()->exec(
                "ALTER TABLE subject_offered ADD COLUMN current_period VARCHAR(2) NOT NULL DEFAULT 'P1'
                 COMMENT 'Current released grading period: P1=Midterms P2=Prefinals P3=Finals'"
            );
        }
    } catch (Exception $e) {
        error_log('current_period column: ' . $e->getMessage());
    }
}

function normalizeGradingPeriod(?string $period): string
{
    $p = strtoupper(trim((string)$period));
    return in_array($p, ['P1', 'P2', 'P3'], true) ? $p : 'P1';
}

function gradingPeriodTitle(string $period): string
{
    return match (normalizeGradingPeriod($period)) {
        'P2' => 'Prefinals',
        'P3' => 'Finals',
        default => 'Midterms',
    };
}
