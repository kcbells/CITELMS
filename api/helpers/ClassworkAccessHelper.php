<?php
/**
 * Who may manage a subject's classwork after it has changed hands.
 *
 * THE PROBLEM
 * -----------
 * A class is transferred one SECTION at a time (SubjectOfferingsAPI.php
 * action=reassign-section). That moves the section, its enrolments and its
 * grades onto an offering owned by the new instructor — but lessons and
 * quizzes are keyed on (subject_id, user_teacher_id), not on the offering,
 * so they do not move and cannot move without rewriting authorship. Every
 * edit gate in QuizzesAPI/LessonsAPI asks "user_teacher_id = me?", which the
 * new instructor fails, so they inherit a class whose material they can see
 * but not touch.
 *
 * THE FIX
 * -------
 * subject_transfer_log records every handover. A teacher may manage a
 * subject's classwork when they own it OR when the log says they received it.
 *
 * ADDITIVE, NOT A HANDOVER
 * ------------------------
 * The previous instructor is NOT revoked. They keep the lessons and quizzes
 * they wrote, which matters because ~half the offerings in this system carry
 * more than one section — transferring one section does not mean they stopped
 * teaching the subject. Student-facing visibility is scoped per section by
 * lesson_section/quiz_section, so this grants nothing to the wrong students.
 * To make transfers strict instead, delete the row in recordSubjectTransfer()
 * and revoke there; canManageClasswork() needs no change.
 *
 * CHAINS ARE FLATTENED
 * --------------------
 * A -> B -> C would otherwise leave A's material stranded, because the A->B
 * row points at B's offering, not C's. recordSubjectTransfer() copies every
 * earlier origin forward onto the new offering, so one non-recursive lookup
 * always sees the whole history.
 *
 * require_once this file, then:
 *   ensureSubjectTransferLog()                      -> void
 *   recordSubjectTransfer(...)                      -> void
 *   canManageClasswork($userId, $subjectId)         -> bool
 *   inheritedSubjectIds($userId)                    -> int[]
 *   classworkTeacherSql($classworkAlias, $soAlias)  -> string (SQL fragment)
 */

function ensureSubjectTransferLog(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        pdo()->exec("CREATE TABLE IF NOT EXISTS subject_transfer_log (
            transfer_id          INT AUTO_INCREMENT PRIMARY KEY,
            subject_id           INT NOT NULL,
            section_id           INT NULL,
            from_subject_offered_id INT NULL,
            to_subject_offered_id   INT NOT NULL,
            from_instructor_id   INT NULL,
            to_instructor_id     INT NOT NULL,
            transferred_by       INT NULL,
            transferred_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_stl_subject_to   (subject_id, to_instructor_id),
            KEY idx_stl_to_offering  (to_subject_offered_id),
            KEY idx_stl_from_instr   (from_instructor_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('ensureSubjectTransferLog: ' . $e->getMessage());
    }
}

/**
 * Write one handover, then flatten the chain onto the target offering.
 *
 * Call INSIDE the caller's transaction — it deliberately does not commit, so
 * a failed transfer leaves no orphan log row claiming a move that never
 * happened.
 */
function recordSubjectTransfer(
    int $subjectId,
    ?int $sectionId,
    ?int $fromOfferingId,
    int $toOfferingId,
    ?int $fromInstructorId,
    int $toInstructorId,
    ?int $actorId
): void {
    ensureSubjectTransferLog();
    $pdo = pdo();

    // A transfer from an unassigned offering has no previous instructor to
    // inherit from; the row is still worth keeping as audit history.
    $pdo->prepare(
        "INSERT INTO subject_transfer_log
            (subject_id, section_id, from_subject_offered_id, to_subject_offered_id,
             from_instructor_id, to_instructor_id, transferred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )->execute([$subjectId, $sectionId, $fromOfferingId, $toOfferingId,
                $fromInstructorId, $toInstructorId, $actorId]);

    // Carry every earlier origin of the SOURCE offering onto the target, so
    // the grant survives a second hop. NOT EXISTS keeps it idempotent when a
    // subject is transferred back and forth.
    if ($fromOfferingId !== null) {
        $pdo->prepare(
            "INSERT INTO subject_transfer_log
                (subject_id, section_id, from_subject_offered_id, to_subject_offered_id,
                 from_instructor_id, to_instructor_id, transferred_by)
             SELECT prior.subject_id, ?, prior.from_subject_offered_id, ?,
                    prior.from_instructor_id, ?, ?
               FROM (SELECT * FROM subject_transfer_log) prior
              WHERE prior.to_subject_offered_id = ?
                AND prior.from_instructor_id IS NOT NULL
                AND prior.from_instructor_id <> ?
                AND NOT EXISTS (
                    SELECT 1 FROM (SELECT * FROM subject_transfer_log) dup
                     WHERE dup.to_subject_offered_id = ?
                       AND dup.to_instructor_id = ?
                       AND dup.from_instructor_id = prior.from_instructor_id
                )"
        )->execute([$sectionId, $toOfferingId, $toInstructorId, $actorId,
                    $fromOfferingId, $toInstructorId, $toOfferingId, $toInstructorId]);
    }
}

/**
 * True when $userId owns an open offering for the subject, or inherited the
 * subject through a transfer. This is the single question every edit gate in
 * QuizzesAPI/LessonsAPI/ClassroomAPI should be asking.
 */
function canManageClasswork(int $userId, int $subjectId): bool
{
    if ($userId <= 0 || $subjectId <= 0) return false;

    $own = db()->fetchOne(
        "SELECT 1 FROM subject_offered
          WHERE subject_id = ? AND user_teacher_id = ? AND status = 'open' LIMIT 1",
        [$subjectId, $userId]
    );
    if ($own) return true;

    ensureSubjectTransferLog();
    try {
        $inherited = db()->fetchOne(
            "SELECT 1 FROM subject_transfer_log
              WHERE subject_id = ? AND to_instructor_id = ? LIMIT 1",
            [$subjectId, $userId]
        );
        return (bool)$inherited;
    } catch (Throwable $e) {
        // Never fail closed into a 500 if the log is missing — an instructor
        // who owns nothing simply has no inherited rights.
        error_log('canManageClasswork: ' . $e->getMessage());
        return false;
    }
}

/** Subject ids this user received via transfer (never their own). */
function inheritedSubjectIds(int $userId): array
{
    if ($userId <= 0) return [];
    ensureSubjectTransferLog();
    try {
        $rows = db()->fetchAll(
            "SELECT DISTINCT subject_id FROM subject_transfer_log WHERE to_instructor_id = ?",
            [$userId]
        );
        return array_map('intval', array_column($rows, 'subject_id'));
    } catch (Throwable $e) {
        error_log('inheritedSubjectIds: ' . $e->getMessage());
        return [];
    }
}

/**
 * SQL fragment replacing the hardcoded
 *   `<classwork>.user_teacher_id = <so>.user_teacher_id`
 * join condition used on the STUDENT side (gradebook, reports).
 *
 * That condition ties a class's lessons/quizzes to whoever currently holds
 * the offering, so the moment a section is transferred every piece of work
 * the students already did under the previous instructor drops out of their
 * missing-work lists and their reports. Widen it to the offering's history.
 *
 * Both arguments are caller-supplied table aliases, never user input.
 */
function classworkTeacherSql(string $classworkAlias, string $soAlias): string
{
    $c  = preg_replace('/[^a-zA-Z0-9_]/', '', $classworkAlias);
    $so = preg_replace('/[^a-zA-Z0-9_]/', '', $soAlias);
    return "($c.user_teacher_id = $so.user_teacher_id
             OR EXISTS (SELECT 1 FROM subject_transfer_log stl
                         WHERE stl.to_subject_offered_id = $so.subject_offered_id
                           AND stl.from_instructor_id = $c.user_teacher_id))";
}
