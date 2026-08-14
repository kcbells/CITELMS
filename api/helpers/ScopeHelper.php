<?php
/**
 * Shared dean / program_head scoping helpers.
 *
 * A dean's own users.program_id is only their "primary" program — a dean can
 * actually oversee several programs at once via the department_program
 * junction table (multi-program departments). Comparing against that single
 * program_id directly was a recurring bug across the API (Sections, Quizzes,
 * Lessons, ...): every real dean in this system has program_id EMPTY on
 * their own row, so a naive `$deanProg && $deanProg === $x` check silently
 * failed for every dean, every time. Use deanProgramIds() instead.
 *
 * A program head is scoped to their OWN single program, further narrowed to
 * the year level range the dean assigned them (users.year_level_from/to,
 * set via SubjectOfferingsAPI.php action=set-ph-scope). No range configured
 * = unrestricted within their program.
 *
 * require_once this file, then call:
 *   deanProgramIds()             -> int[]
 *   programHeadScope()           -> ['program_id'=>int,'year_from'=>?int,'year_to'=>?int]
 *   programHeadYearAllowed($scope, $yearLevel) -> bool
 */

function deanProgramIds(): array {
    static $ids = null;
    if ($ids === null) {
        $row = db()->fetchOne("SELECT program_id, department_id FROM users WHERE users_id = ?", [Auth::id()]);
        $ids = [];
        if (!empty($row['department_id'])) {
            $rows = db()->fetchAll(
                "SELECT program_id FROM department_program WHERE department_id = ?",
                [$row['department_id']]
            );
            $ids = array_map(fn($r) => (int)$r['program_id'], $rows);
        }
        if (!$ids && !empty($row['program_id'])) {
            $ids = [(int)$row['program_id']];
        }
    }
    return $ids;
}

function programHeadScope(): array {
    static $scope = null;
    if ($scope === null) {
        $user = db()->fetchOne(
            "SELECT program_id, year_level_from, year_level_to FROM users WHERE users_id = ?",
            [Auth::id()]
        );
        $scope = [
            'program_id' => (int)($user['program_id'] ?? 0),
            'year_from'  => $user['year_level_from'] !== null ? (int)$user['year_level_from'] : null,
            'year_to'    => $user['year_level_to']   !== null ? (int)$user['year_level_to']   : null,
        ];
    }
    return $scope;
}

function programHeadYearAllowed(array $scope, $yearLevel): bool {
    if ($scope['year_from'] === null && $scope['year_to'] === null) return true;
    $y = (int)$yearLevel;
    if ($scope['year_from'] !== null && $y < $scope['year_from']) return false;
    if ($scope['year_to']   !== null && $y > $scope['year_to'])   return false;
    return true;
}
