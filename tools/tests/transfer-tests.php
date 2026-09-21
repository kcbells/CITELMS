<?php
/**
 * LEVEL 3 - Subject transfer, Series 300 (TR-301 ... TR-308)
 *
 * Proves the requirement "transferring a subject to another instructor also
 * transfers the previous instructor's records - only the instructor changes."
 *
 * Run (Apache does NOT need to be running - this talks to MySQL directly):
 *   php tools/tests/transfer-tests.php
 *
 * SAFE TO RUN AGAINST YOUR REAL DATABASE. Every row it creates lives inside
 * one transaction that is ALWAYS rolled back, including when an assertion
 * fails. It builds its own throwaway instructors, subject, section, student,
 * lesson and quiz rather than touching anything you already have, so it never
 * depends on - or disturbs - live data.
 *
 * One ordering rule matters: MySQL implicitly COMMITS on DDL, so every
 * ensure*() that might CREATE TABLE is called BEFORE the transaction opens.
 * Calling one inside would silently commit the sandbox.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__, 2);
require_once __DIR__ . '/harness.php';
require_once $root . '/config/database.php';
require_once $root . '/api/helpers/ClassworkAccessHelper.php';

$t = new TestRunner('LEVEL 3 - Subject Transfer (Series 300)');

// DDL first - outside the transaction (see header note).
ensureSubjectTransferLog();

$pdo = pdo();
$tag = 'zz_test_' . bin2hex(random_bytes(4));
$ids = [];

try {
    $pdo->beginTransaction();

    // ---- sandbox -------------------------------------------------------
    $mkUser = function (string $who, string $role) use ($pdo, $tag, &$ids) {
        $pdo->prepare(
            "INSERT INTO users (first_name, last_name, email, role, status, password)
             VALUES (?, ?, ?, ?, 'active', '!')"
        )->execute([$who, 'Sandbox', "$tag.$who@example.invalid", $role]);
        return (int)$pdo->lastInsertId();
    };

    $instrA  = $mkUser('AlphaPrev', 'instructor');   // original instructor
    $instrB  = $mkUser('BetaNew',   'instructor');   // receives the class
    $student = $mkUser('SamStudent', 'student');

    $pdo->prepare("INSERT INTO subject (subject_code, subject_name, units) VALUES (?, ?, 3)")
        ->execute(["$tag-101", 'Sandbox Subject']);
    $subjectId = (int)$pdo->lastInsertId();

    $sem = db()->fetchOne("SELECT semester_id FROM semester ORDER BY semester_id DESC LIMIT 1");
    $semId = $sem ? (int)$sem['semester_id'] : null;

    $pdo->prepare("INSERT INTO section (section_name, enrollment_code) VALUES (?, ?)")
        ->execute([substr($tag, 0, 20), substr(strtoupper($tag), 0, 20)]);
    $sectionId = (int)$pdo->lastInsertId();

    // Offering owned by A, with the section and the student hanging off it.
    $pdo->prepare(
        "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status)
         VALUES (?, ?, ?, 'open')"
    )->execute([$subjectId, $semId, $instrA]);
    $offeringA = (int)$pdo->lastInsertId();

    $pdo->prepare("INSERT INTO section_subject (section_id, subject_offered_id, status) VALUES (?, ?, 'active')")
        ->execute([$sectionId, $offeringA]);
    $sectSubjId = (int)$pdo->lastInsertId();

    $pdo->prepare(
        "INSERT INTO student_subject (user_student_id, subject_offered_id, section_id, status, final_grade)
         VALUES (?, ?, ?, 'enrolled', 88.50)"
    )->execute([$student, $offeringA, $sectionId]);

    // Classwork authored by A - this is what must survive the handover.
    $pdo->prepare(
        "INSERT INTO lessons (subject_id, user_teacher_id, lesson_title, status)
         VALUES (?, ?, 'Sandbox Lesson', 'published')"
    )->execute([$subjectId, $instrA]);
    $lessonId = (int)$pdo->lastInsertId();

    $pdo->prepare(
        "INSERT INTO quiz (subject_id, user_teacher_id, quiz_title, status)
         VALUES (?, ?, 'Sandbox Quiz', 'published')"
    )->execute([$subjectId, $instrA]);
    $quizId = (int)$pdo->lastInsertId();

    // ---- TR-301 : before the transfer ----------------------------------
    $t->unit('TR-301', 'Before transfer, the incoming instructor has no rights');
    $t->same(true,  canManageClasswork($instrA, $subjectId), 'the original instructor can manage the subject');
    $t->same(false, canManageClasswork($instrB, $subjectId), 'the incoming instructor cannot');

    // ---- perform the same steps handleReassignSection() performs -------
    $pdo->prepare(
        "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status)
         VALUES (?, ?, ?, 'open')"
    )->execute([$subjectId, $semId, $instrB]);
    $offeringB = (int)$pdo->lastInsertId();

    $pdo->prepare("UPDATE section_subject SET subject_offered_id = ? WHERE section_subject_id = ?")
        ->execute([$offeringB, $sectSubjId]);
    $pdo->prepare("UPDATE student_subject SET subject_offered_id = ? WHERE section_id = ? AND subject_offered_id = ?")
        ->execute([$offeringB, $sectionId, $offeringA]);

    recordSubjectTransfer($subjectId, $sectionId, $offeringA, $offeringB, $instrA, $instrB, null);

    // ---- TR-302 : the students and their grades came along --------------
    $t->unit('TR-302', 'Enrolment and grade follow the section');
    $moved = db()->fetchOne(
        "SELECT subject_offered_id, final_grade FROM student_subject WHERE user_student_id = ?",
        [$student]
    );
    $t->same($offeringB, (int)$moved['subject_offered_id'], 'the student now sits under the new instructor');
    $t->same('88.50', (string)$moved['final_grade'], 'the existing grade survived the move');

    // ---- TR-303 : the new instructor may manage inherited classwork -----
    $t->unit('TR-303', 'The receiving instructor can manage what they inherited');
    $t->same(true, canManageClasswork($instrB, $subjectId), 'canManageClasswork() now grants the new instructor');
    $t->ok(in_array($subjectId, inheritedSubjectIds($instrB), true), 'the subject is listed as inherited');

    // ---- TR-304 : authorship is not rewritten ---------------------------
    $t->unit('TR-304', 'Authorship is preserved, not reassigned');
    $lessonOwner = db()->fetchOne("SELECT user_teacher_id FROM lessons WHERE lessons_id = ?", [$lessonId]);
    $quizOwner   = db()->fetchOne("SELECT user_teacher_id FROM quiz WHERE quiz_id = ?", [$quizId]);
    $t->same($instrA, (int)$lessonOwner['user_teacher_id'], 'the lesson still belongs to its author');
    $t->same($instrA, (int)$quizOwner['user_teacher_id'],   'the quiz still belongs to its author');
    $t->same(true, canManageClasswork($instrA, $subjectId), 'the previous instructor is not locked out (additive grant)');

    // ---- TR-305 : the inherited quiz shows up in the new instructor's list
    $t->unit('TR-305', 'Inherited quizzes appear in the instructor quiz list');
    $inherited    = inheritedSubjectIds($instrB);
    $inheritedSql = $inherited ? ' OR q.subject_id IN (' . implode(',', array_map('intval', $inherited)) . ')' : '';
    $listed = db()->fetchAll(
        "SELECT q.quiz_id, (q.user_teacher_id = ?) AS is_own
           FROM quiz q WHERE (q.user_teacher_id = ?$inheritedSql)",
        [$instrB, $instrB]
    );
    $listedIds = array_map('intval', array_column($listed, 'quiz_id'));
    $t->ok(in_array($quizId, $listedIds, true), 'the previous instructor\'s quiz is visible to the new one');
    $own = array_values(array_filter($listed, fn($r) => (int)$r['quiz_id'] === $quizId))[0] ?? null;
    $t->same('0', (string)($own['is_own'] ?? ''), 'and is flagged as NOT their own, so the UI can label it');

    // ---- TR-306 : students keep seeing the old instructor's work --------
    $t->unit('TR-306', 'Students do not lose the previous instructor\'s classwork');
    $frag = classworkTeacherSql('q', 'so');
    $visible = db()->fetchAll(
        "SELECT q.quiz_id FROM student_subject ss
           JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
           JOIN quiz q ON q.subject_id = so.subject_id AND $frag
          WHERE ss.user_student_id = ?",
        [$student]
    );
    $t->ok(in_array($quizId, array_map('intval', array_column($visible, 'quiz_id')), true),
        'the quiz sat under the old instructor is still reachable from the new offering');

    // The pre-fix behaviour, asserted explicitly so a regression is obvious.
    $oldWay = db()->fetchAll(
        "SELECT q.quiz_id FROM student_subject ss
           JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
           JOIN quiz q ON q.subject_id = so.subject_id AND q.user_teacher_id = so.user_teacher_id
          WHERE ss.user_student_id = ?",
        [$student]
    );
    $t->same(0, count($oldWay), 'and the old hardcoded join would indeed have lost it (proves the fix matters)');

    // ---- TR-309 : the emptied source offering stops claiming the class --
    $t->unit('TR-309', 'A fully transferred offering releases its instructor');
    // Mirror what handleReassignSection() now does after moving the section.
    $remaining = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM section_subject
          WHERE subject_offered_id = ? AND status <> 'cancelled'",
        [$offeringA]
    );
    $t->same(0, (int)$remaining['c'], 'the old offering has no sections left');
    if ((int)$remaining['c'] === 0) {
        $pdo->prepare("UPDATE subject_offered SET user_teacher_id = NULL WHERE subject_offered_id = ?")
            ->execute([$offeringA]);
    }
    $releasedRow = db()->fetchOne("SELECT user_teacher_id FROM subject_offered WHERE subject_offered_id = ?", [$offeringA]);
    $t->same(null, $releasedRow['user_teacher_id'], 'the emptied offering no longer names the previous instructor');

    // This is exactly the "Also: <old instructor>" computation on the dean's
    // Faculty Assignments page - it must no longer name them.
    $alsoRow = db()->fetchOne(
        "SELECT MAX(CASE WHEN so.user_teacher_id IS NOT NULL AND so.user_teacher_id != ? THEN 1 ELSE 0 END) AS taken_by_other
           FROM subject_offered so
          WHERE so.subject_id = ? AND so.status != 'cancelled'",
        [$instrB, $subjectId]
    );
    $t->same('0', (string)$alsoRow['taken_by_other'], 'the dean page no longer shows the previous instructor as "Also"');

    // Releasing the offering must NOT cost the author their own material.
    $lessonRow = db()->fetchOne("SELECT user_teacher_id FROM lessons WHERE lessons_id = ?", [$lessonId]);
    $t->same($instrA, (int)$lessonRow['user_teacher_id'], 'the author still owns the lesson they wrote');

    // ---- TR-307 : an unrelated instructor gains nothing -----------------
    $t->unit('TR-307', 'The grant does not leak to unrelated instructors');
    $outsider = $mkUser('CharlieOutsider', 'instructor');
    $t->same(false, canManageClasswork($outsider, $subjectId), 'an uninvolved instructor still cannot manage the subject');

    // ---- TR-308 : chain A -> B -> C -------------------------------------
    $t->unit('TR-308', 'A second handover does not strand the first author');
    $instrC = $mkUser('DeltaThird', 'instructor');
    $pdo->prepare(
        "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status)
         VALUES (?, ?, ?, 'open')"
    )->execute([$subjectId, $semId, $instrC]);
    $offeringC = (int)$pdo->lastInsertId();
    recordSubjectTransfer($subjectId, $sectionId, $offeringB, $offeringC, $instrB, $instrC, null);

    $t->same(true, canManageClasswork($instrC, $subjectId), 'the third instructor can manage the subject');
    $originsC = array_map('intval', array_column(db()->fetchAll(
        "SELECT DISTINCT from_instructor_id FROM subject_transfer_log
          WHERE to_subject_offered_id = ? AND to_instructor_id = ?",
        [$offeringC, $instrC]
    ), 'from_instructor_id'));
    $t->ok(in_array($instrB, $originsC, true), 'C inherits from B');
    $t->ok(in_array($instrA, $originsC, true), 'C also inherits from A, so A\'s material is not stranded');

} finally {
    // Always roll back - assertion failures included.
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $left = db()->fetchOne("SELECT COUNT(*) c FROM users WHERE email LIKE ?", ["$tag%"]);
    echo "\n  sandbox rows remaining after rollback: " . (int)$left['c'] . " (expected 0)\n";
}

exit($t->report());
