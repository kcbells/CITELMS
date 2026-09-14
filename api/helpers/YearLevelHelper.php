<?php
/**
 * Derives a student's year level from their student ID's embedded enrollment
 * batch year (e.g. "02-2324-00766" enrolled in AY 2023-2024), relative to
 * whichever academic year is currently active — NOT a fixed/stored value
 * that goes stale every year. A dean can still lock a specific student's
 * year_level manually (irregular standing) via UsersAPI.php's
 * set-year-standing action; a locked student is skipped by the automatic
 * recompute below.
 */

/** users.year_level_locked — set once a dean manually overrides a student's standing. */
function ensureYearLevelLockColumn(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM users LIKE 'year_level_locked'")) {
            pdo()->exec("ALTER TABLE users ADD COLUMN year_level_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Set by a dean overriding an irregular student — skip automatic year-level recompute' AFTER year_level");
        }
    } catch (Exception $e) {
        error_log('ensureYearLevelLockColumn: ' . $e->getMessage());
    }
}

/**
 * The calendar year an academic year starts in, from whichever semester row
 * is currently marked active (e.g. "2026-2027" -> 2026). Falls back to the
 * most recent semester on record, then the current calendar year, so this
 * never hard-fails just because no semester has been marked active yet.
 */
function getCurrentAcademicYearStart(): int {
    $row = db()->fetchOne("SELECT academic_year FROM semester WHERE status = 'active' ORDER BY start_date DESC LIMIT 1");
    if (!$row) {
        $row = db()->fetchOne("SELECT academic_year FROM semester ORDER BY start_date DESC LIMIT 1");
    }
    if ($row && preg_match('/(\d{4})/', $row['academic_year'], $m)) {
        return (int)$m[1];
    }
    return (int)date('Y');
}

/**
 * Scans a student ID for a 2-digit/2-digit consecutive-year pair (e.g. "23"
 * then "24" inside "2324") and returns the full 4-digit start year (2023).
 * Deliberately a substring scan rather than assuming a fixed ID shape —
 * real IDs in this system vary ("02-2324-00766" vs a stray "02-02324-0766")
 * but the 4-digit batch code itself is always a contiguous substring either
 * way, so scanning finds it regardless of surrounding formatting noise.
 */
function deriveBatchStartYear(string $studentId): ?int {
    $digits = preg_replace('/\D/', '', $studentId);
    for ($i = 0; $i + 4 <= strlen($digits); $i++) {
        $window = substr($digits, $i, 4);
        $a = (int)substr($window, 0, 2);
        $b = (int)substr($window, 2, 2);
        if ($b === ($a + 1) % 100) {
            return 2000 + $a;
        }
    }
    return null;
}

/**
 * Full year level derivation: batch start year -> (current AY start - batch
 * start) + 1, floored at 1 (never negative/zero for a not-yet-started or
 * mid-parsed id). No upper cap — a student past their expected 4th year
 * simply computes higher, which is itself a signal worth a dean's look
 * (or an explicit irregular-standing override, which stops recompute
 * touching them at all).
 */
function deriveYearLevel(string $studentId, ?int $currentAcademicYearStart = null): ?int {
    $batchStart = deriveBatchStartYear($studentId);
    if ($batchStart === null) return null;
    $currentAcademicYearStart ??= getCurrentAcademicYearStart();
    return max(1, ($currentAcademicYearStart - $batchStart) + 1);
}
