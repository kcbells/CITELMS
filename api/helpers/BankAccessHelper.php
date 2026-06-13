<?php
/**
 * Shared subject scope for Open Resources / Content Bank.
 * Instructors only see materials for subjects they currently handle.
 */

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

function instructorTeachesSubject($userId, $subjectId) {
    if (!$subjectId) return false;
    return in_array((int)$subjectId, getInstructorHandledSubjectIds($userId), true);
}

function bankSubjectInClause($userId) {
    $ids = getInstructorHandledSubjectIds($userId);
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
    return instructorTeachesSubject($userId, $subjectId);
}
