<?php
/**
 * Shared subject scope for Open Resources / Content Bank — this is the
 * *shared* materials/questions/quizzes repository for instructors, deans,
 * and program heads alike, so "what subjects can this user see Content
 * Bank items for" has to mean something for all three roles, not just
 * "subjects this instructor currently teaches" (which is all it used to
 * check — a dean or program head, who never appears as a subject's
 * user_teacher_id, got an empty scope and could only ever see items they
 * personally authored, never any instructor's shared public content).
 *
 *   instructor    -> subjects they currently teach (subject_offered)
 *   program_head  -> every subject in their one program
 *   dean          -> every subject in every program their department manages
 *   admin         -> every active subject, system-wide
 */
require_once __DIR__ . '/ScopeHelper.php';

function getActiveSemesterId() {
    $row = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
    return $row ? (int)$row['semester_id'] : 0;
}

function getInstructorHandledSubjectIds($userId) {
    $semId = getActiveSemesterId();
    $rows = db()->fetchAll(
        "SELECT DISTINCT so.subject_id
         FROM subject_offered so
         WHERE so.user_teacher_id = ? AND so.status = 'open'
           AND (? = 0 OR so.semester_id = ?)",
        [(int)$userId, $semId, $semId]
    );
    return array_values(array_map(fn($r) => (int)$r['subject_id'], $rows));
}

/** The full set of subject_ids this user's role should see shared Content Bank items for. */
function getBankScopedSubjectIds($userId, $role = null) {
    $role = $role ?? Auth::role();

    if ($role === 'dean') {
        $progIds = deanProgramIds();
        if (!$progIds) return [];
        $ph = implode(',', array_fill(0, count($progIds), '?'));
        $rows = db()->fetchAll("SELECT subject_id FROM subject WHERE program_id IN ($ph) AND status = 'active'", $progIds);
        return array_values(array_map(fn($r) => (int)$r['subject_id'], $rows));
    }
    if ($role === 'program_head') {
        $scope = programHeadScope();
        if (!$scope['program_id']) return [];
        $rows = db()->fetchAll("SELECT subject_id FROM subject WHERE program_id = ? AND status = 'active'", [$scope['program_id']]);
        return array_values(array_map(fn($r) => (int)$r['subject_id'], $rows));
    }
    if ($role === 'admin') {
        $rows = db()->fetchAll("SELECT subject_id FROM subject WHERE status = 'active'");
        return array_values(array_map(fn($r) => (int)$r['subject_id'], $rows));
    }
    // instructor (default/fallback)
    return getInstructorHandledSubjectIds($userId);
}

/** Name kept as-is (many call sites) — despite the name, this now checks
 *  the asking user's full role-based bank scope, not literally "teaches". */
function instructorTeachesSubject($userId, $subjectId) {
    if (!$subjectId) return false;
    return in_array((int)$subjectId, getBankScopedSubjectIds($userId), true);
}

function bankSubjectInClause($userId) {
    $ids = getBankScopedSubjectIds($userId);
    if (empty($ids)) {
        return ['sql' => '0', 'params' => []];
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    return ['sql' => $placeholders, 'params' => $ids];
}

function canAccessBankItem($userId, $createdBy, $visibility, $subjectId) {
    if ((int)$createdBy === (int)$userId) {
        return true;
    }
    if ($visibility !== 'public') {
        return false;
    }
    // A general resource with no subject attached (lesson_bank/question_bank
    // both allow a null subject_id) isn't "out of scope" — it's not scoped
    // to any subject at all, so a public one is meant for everyone, not
    // nobody. instructorTeachesSubject(..., null) would otherwise always
    // say no, silently making every subject-less "public" item unreachable
    // by anyone but its own author.
    if (!$subjectId) {
        return true;
    }
    return instructorTeachesSubject($userId, $subjectId);
}
