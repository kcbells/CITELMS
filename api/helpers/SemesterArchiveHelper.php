<?php
/**
 * Semester archiving — Phase 1 (capture + freeze).
 *
 * Runs when an admin switches which semester is active: the outgoing semester
 * is snapshotted so nothing is lost when subjects are emptied for the new term.
 *
 * What happens to each kind of content, and why it differs:
 *
 *   - Lesson materials (subject_module_documents) are snapshotted, then the
 *     live rows are DELETED so each subject starts the new term empty. The
 *     files on disk are deliberately left alone — the archive rows still point
 *     at them, so deleting the file would empty the archive too.
 *
 *   - Quizzes are snapshotted but LEFT IN PLACE. The instructor decides per
 *     subject whether to reuse or start empty, and that choice happens at the
 *     start of the new term, not here.
 *
 *   - Announcements are snapshotted only. They hang off subject_offered, which
 *     is already per-semester, so they never leak into the new term by themselves.
 *
 *   - Grades are NOT copied. A gradebook is the academic record — duplicating it
 *     invites the copy and the original to disagree. Instead the semester is
 *     marked grades_locked, and the gradebook write paths refuse edits for it
 *     until an admin unlocks it.
 */

require_once __DIR__ . '/../../config/database.php';

/**
 * Archives any semester whose end date has already passed and that hasn't
 * been archived yet — first semester, second semester, summer, all the same.
 *
 * The admin switching the active semester is the other trigger, but a term
 * simply ending is the more reliable one: nobody has to remember to do
 * anything for a subject's materials to be captured and cleared.
 *
 * Deliberately skips the semester that is still marked 'active'. An end date
 * can pass while the term is genuinely still running (extended finals, late
 * grade submission), and pulling a live class's materials out from under it
 * would be much worse than archiving a few days late — the admin switching
 * semesters will catch that one.
 *
 * @return array<int,array> keyed by semester_id, whatever each archive run reported
 */
function archiveEndedSemesters(): array
{
    ensureSemesterArchiveTables();
    $results = [];
    try {
        $due = db()->fetchAll(
            "SELECT s.semester_id, s.semester_name, s.academic_year
               FROM semester s
          LEFT JOIN semester_archive a ON a.semester_id = s.semester_id
              WHERE s.end_date IS NOT NULL
                AND s.end_date < CURDATE()
                AND s.status != 'active'
                AND a.archive_id IS NULL"
        );
        foreach ($due as $s) {
            $results[(int)$s['semester_id']] = archiveSemester((int)$s['semester_id'], null);
        }
    } catch (Throwable $e) {
        error_log('archiveEndedSemesters: ' . $e->getMessage());
    }
    return $results;
}

/** Creates the archive tables if they don't exist yet (self-healing, same pattern as BulkImportAPI). */
function ensureSemesterArchiveTables(): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    db()->execute("
        CREATE TABLE IF NOT EXISTS semester_archive (
            archive_id       INT AUTO_INCREMENT PRIMARY KEY,
            semester_id      INT NOT NULL,
            archived_at      DATETIME NOT NULL,
            archived_by      INT NULL,
            docs_count       INT NOT NULL DEFAULT 0,
            quizzes_count    INT NOT NULL DEFAULT 0,
            announcements_count INT NOT NULL DEFAULT 0,
            grades_count     INT NOT NULL DEFAULT 0,
            grades_locked    TINYINT(1) NOT NULL DEFAULT 1,
            unlocked_by      INT NULL,
            unlocked_at      DATETIME NULL,
            UNIQUE KEY uniq_semester (semester_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    db()->execute("
        CREATE TABLE IF NOT EXISTS archived_module_documents (
            archive_doc_id INT AUTO_INCREMENT PRIMARY KEY,
            archive_id     INT NOT NULL,
            semester_id    INT NOT NULL,
            subject_id     INT NOT NULL,
            module_number  TINYINT NOT NULL,
            doc_type       VARCHAR(32) NOT NULL,
            file_name      VARCHAR(255) NOT NULL,
            original_name  VARCHAR(255) NULL,
            file_path      VARCHAR(500) NOT NULL,
            file_size      INT NULL,
            uploaded_by    INT NULL,
            uploaded_at    DATETIME NULL,
            KEY idx_archive (archive_id),
            KEY idx_subject (semester_id, subject_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    db()->execute("
        CREATE TABLE IF NOT EXISTS archived_quizzes (
            archive_quiz_id     INT AUTO_INCREMENT PRIMARY KEY,
            archive_id          INT NOT NULL,
            semester_id         INT NOT NULL,
            quiz_id             INT NOT NULL,
            subject_id          INT NOT NULL,
            user_teacher_id     INT NULL,
            quiz_title          VARCHAR(200) NULL,
            module_number       TINYINT NULL,
            gradebook_component VARCHAR(32) NULL,
            total_points        INT NULL,
            status              VARCHAR(20) NULL,
            questions_json      LONGTEXT NULL,
            created_at          DATETIME NULL,
            KEY idx_archive (archive_id),
            KEY idx_subject (semester_id, subject_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    db()->execute("
        CREATE TABLE IF NOT EXISTS archived_announcements (
            archive_ann_id     INT AUTO_INCREMENT PRIMARY KEY,
            archive_id         INT NOT NULL,
            semester_id        INT NOT NULL,
            announcement_id    INT NOT NULL,
            subject_offered_id INT NULL,
            subject_id         INT NULL,
            user_id            INT NULL,
            title              VARCHAR(200) NULL,
            content            TEXT NULL,
            announcement_type  VARCHAR(32) NULL,
            created_at         DATETIME NULL,
            KEY idx_archive (archive_id),
            KEY idx_subject (semester_id, subject_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

/** True if this semester has already been archived (so we never double-archive). */
function isSemesterArchived(int $semesterId): bool
{
    ensureSemesterArchiveTables();
    return (bool)db()->fetchOne("SELECT archive_id FROM semester_archive WHERE semester_id = ?", [$semesterId]);
}

/**
 * True if the gradebook for this offering is frozen — i.e. its semester has
 * been archived and an admin hasn't unlocked it. Gradebook write paths call
 * this before accepting an edit.
 */
function areGradesLockedForOffering(int $subjectOfferedId): bool
{
    ensureSemesterArchiveTables();
    $row = db()->fetchOne(
        "SELECT a.grades_locked
           FROM subject_offered so
           JOIN semester_archive a ON a.semester_id = so.semester_id
          WHERE so.subject_offered_id = ?",
        [$subjectOfferedId]
    );
    return $row ? (int)$row['grades_locked'] === 1 : false;
}

/**
 * Snapshots one semester and empties each of its subjects' lesson materials.
 * Safe to call more than once — a semester that's already archived is skipped.
 *
 * @return array{archived:bool, reason?:string, docs:int, quizzes:int, announcements:int, grades:int}
 */
function archiveSemester(int $semesterId, ?int $archivedBy = null): array
{
    ensureSemesterArchiveTables();

    if ($semesterId <= 0) {
        return ['archived' => false, 'reason' => 'no semester given', 'docs' => 0, 'quizzes' => 0, 'announcements' => 0, 'grades' => 0];
    }
    if (isSemesterArchived($semesterId)) {
        return ['archived' => false, 'reason' => 'already archived', 'docs' => 0, 'quizzes' => 0, 'announcements' => 0, 'grades' => 0];
    }

    // Every subject that actually ran this semester. Lesson materials and
    // quizzes hang off subject_id (not the semester), so this list is what
    // ties them to the term being closed.
    $subjectIds = array_column(
        db()->fetchAll("SELECT DISTINCT subject_id FROM subject_offered WHERE semester_id = ?", [$semesterId]),
        'subject_id'
    );
    $subjectIds = array_map('intval', $subjectIds);

    db()->beginTransaction();
    try {
        pdo()->prepare("INSERT INTO semester_archive (semester_id, archived_at, archived_by) VALUES (?, NOW(), ?)")
             ->execute([$semesterId, $archivedBy]);
        $archiveId = (int)pdo()->lastInsertId();

        $docs = $quizzes = $announcements = 0;

        if ($subjectIds) {
            $ph = implode(',', array_fill(0, count($subjectIds), '?'));

            // ── Lesson materials: snapshot, then clear so the term starts empty ──
            $docRows = db()->fetchAll("SELECT * FROM subject_module_documents WHERE subject_id IN ($ph)", $subjectIds);
            $insDoc = pdo()->prepare(
                "INSERT INTO archived_module_documents
                    (archive_id, semester_id, subject_id, module_number, doc_type, file_name,
                     original_name, file_path, file_size, uploaded_by, uploaded_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            foreach ($docRows as $d) {
                $insDoc->execute([
                    $archiveId, $semesterId, $d['subject_id'], $d['module_number'], $d['doc_type'],
                    $d['file_name'], $d['original_name'], $d['file_path'], $d['file_size'],
                    $d['uploaded_by'], $d['uploaded_at'],
                ]);
                $docs++;
            }
            // Only the DB rows go — the files stay on disk, because the archive
            // rows above still point at them.
            //
            // But never clear a subject that is ALSO running in a semester
            // that's still active or upcoming: materials are stored per
            // subject, not per semester, so wiping ITE 300 while closing an
            // old term would delete the very materials this term's ITE 300
            // class is using.
            $clearable = subjectsNotInLiveSemesters($subjectIds, $semesterId);
            if ($docs > 0 && $clearable) {
                $cph = implode(',', array_fill(0, count($clearable), '?'));
                pdo()->prepare("DELETE FROM subject_module_documents WHERE subject_id IN ($cph)")->execute($clearable);
            }

            // ── Quizzes: snapshot only; the instructor decides reuse-or-empty later ──
            $quizRows = db()->fetchAll("SELECT * FROM quiz WHERE subject_id IN ($ph)", $subjectIds);
            $insQuiz = pdo()->prepare(
                "INSERT INTO archived_quizzes
                    (archive_id, semester_id, quiz_id, subject_id, user_teacher_id, quiz_title,
                     module_number, gradebook_component, total_points, status, questions_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            foreach ($quizRows as $q) {
                $insQuiz->execute([
                    $archiveId, $semesterId, $q['quiz_id'], $q['subject_id'], $q['user_teacher_id'],
                    $q['quiz_title'], $q['module_number'], $q['gradebook_component'],
                    $q['total_points'], $q['status'], snapshotQuizQuestions((int)$q['quiz_id']), $q['created_at'],
                ]);
                $quizzes++;
            }
        }

        // ── Announcements: reachable through subject_offered, so already per-semester ──
        $annRows = db()->fetchAll(
            "SELECT a.*, so.subject_id
               FROM announcement a
               JOIN subject_offered so ON so.subject_offered_id = a.subject_offered_id
              WHERE so.semester_id = ?",
            [$semesterId]
        );
        $insAnn = pdo()->prepare(
            "INSERT INTO archived_announcements
                (archive_id, semester_id, announcement_id, subject_offered_id, subject_id,
                 user_id, title, content, announcement_type, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        foreach ($annRows as $a) {
            $insAnn->execute([
                $archiveId, $semesterId, $a['announcement_id'], $a['subject_offered_id'], $a['subject_id'],
                $a['user_id'], $a['title'], $a['content'], $a['announcement_type'], $a['created_at'],
            ]);
            $announcements++;
        }

        // ── Grades: counted and frozen, never copied ──
        $gradeRow = db()->fetchOne(
            "SELECT COUNT(*) AS c
               FROM global_module_grades g
               JOIN subject_offered so ON so.subject_offered_id = g.subject_offered_id
              WHERE so.semester_id = ?",
            [$semesterId]
        );
        $grades = (int)($gradeRow['c'] ?? 0);

        pdo()->prepare(
            "UPDATE semester_archive
                SET docs_count = ?, quizzes_count = ?, announcements_count = ?, grades_count = ?
              WHERE archive_id = ?"
        )->execute([$docs, $quizzes, $announcements, $grades, $archiveId]);

        db()->commit();

        return ['archived' => true, 'docs' => $docs, 'quizzes' => $quizzes,
                'announcements' => $announcements, 'grades' => $grades];
    } catch (Throwable $e) {
        db()->rollback();
        error_log('archiveSemester(' . $semesterId . '): ' . $e->getMessage());
        return ['archived' => false, 'reason' => $e->getMessage(), 'docs' => 0, 'quizzes' => 0, 'announcements' => 0, 'grades' => 0];
    }
}

/**
 * Narrows a subject list to those NOT also offered in any semester that's
 * still active or upcoming — i.e. the ones it's safe to empty when closing
 * $closingSemesterId.
 *
 * @param int[] $subjectIds
 * @return int[]
 */
function subjectsNotInLiveSemesters(array $subjectIds, int $closingSemesterId): array
{
    if (!$subjectIds) return [];
    $ph = implode(',', array_fill(0, count($subjectIds), '?'));
    $stillLive = array_column(
        db()->fetchAll(
            "SELECT DISTINCT so.subject_id
               FROM subject_offered so
               JOIN semester s ON s.semester_id = so.semester_id
              WHERE so.subject_id IN ($ph)
                AND so.semester_id != ?
                AND s.status IN ('active', 'upcoming')",
            array_merge($subjectIds, [$closingSemesterId])
        ),
        'subject_id'
    );
    $stillLive = array_map('intval', $stillLive);
    return array_values(array_diff($subjectIds, $stillLive));
}

/** Serialises one quiz's questions + options into JSON for the archive row. */
function snapshotQuizQuestions(int $quizId): string
{
    $questions = db()->fetchAll(
        "SELECT q.questions_id, q.question_text, q.question_type, q.points, q.question_order
           FROM quiz_questions qq
           JOIN questions q ON q.questions_id = qq.questions_id
          WHERE qq.quiz_id = ?
          ORDER BY q.question_order",
        [$quizId]
    );
    foreach ($questions as &$q) {
        // question_option.quiz_question_id stores questions.questions_id — a
        // misleading column name, but the convention throughout this codebase.
        $q['options'] = db()->fetchAll(
            "SELECT option_text, is_correct, order_number FROM question_option
              WHERE quiz_question_id = ? ORDER BY order_number",
            [$q['questions_id']]
        );
    }
    unset($q);
    return json_encode($questions, JSON_INVALID_UTF8_SUBSTITUTE) ?: '[]';
}
