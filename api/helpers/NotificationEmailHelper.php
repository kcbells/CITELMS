<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/EmailHelper.php';
require_once __DIR__ . '/EmailQueueHelper.php';
require_once __DIR__ . '/EmailDigestHelper.php';

/**
 * Classroom + OTP notification emails via Gmail SMTP.
 */
class NotificationEmailHelper {

    public static function queueNewLesson(int $lessonId) {
        $lesson = db()->fetchOne(
            "SELECT l.lessons_id, l.lesson_title, l.subject_id, s.subject_code, s.subject_name
             FROM lessons l
             JOIN subject s ON s.subject_id = l.subject_id
             WHERE l.lessons_id = ? AND l.status = 'published'
             LIMIT 1",
            [$lessonId]
        );
        if (!$lesson) {
            return 0;
        }

        return self::notifyStudents(
            self::fetchTargetStudents((int)$lesson['subject_id'], 'lesson', $lessonId),
            [
                'kind' => 'new_lesson',
                'ref_type' => 'lesson',
                'ref_id' => $lessonId,
                'title' => $lesson['lesson_title'] ?? 'Class activity',
                'subject_code' => $lesson['subject_code'] ?? '',
                'detail_text' => 'New class activity posted',
                'link_url' => self::lessonLink($lessonId),
                'email_subject' => 'New activity: ' . ($lesson['lesson_title'] ?? 'Classwork'),
                'headline' => 'New class activity',
                'body_html' => self::lessonBody($lesson),
            ]
        );
    }

    public static function queueNewQuiz(int $quizId) {
        $quiz = db()->fetchOne(
            "SELECT q.quiz_id, q.quiz_title, q.subject_id, q.due_date, s.subject_code, s.subject_name
             FROM quiz q
             JOIN subject s ON s.subject_id = q.subject_id
             WHERE q.quiz_id = ? AND q.status = 'published'
             LIMIT 1",
            [$quizId]
        );
        if (!$quiz) {
            return 0;
        }

        $dueDetail = !empty($quiz['due_date'])
            ? 'Due ' . date('M j, Y', strtotime($quiz['due_date']))
            : 'New quiz available';

        return self::notifyStudents(
            self::fetchTargetStudents((int)$quiz['subject_id'], 'quiz', $quizId),
            [
                'kind' => 'new_quiz',
                'ref_type' => 'quiz',
                'ref_id' => $quizId,
                'title' => $quiz['quiz_title'] ?? 'Quiz',
                'subject_code' => $quiz['subject_code'] ?? '',
                'detail_text' => $dueDetail,
                'link_url' => self::quizLink($quizId),
                'email_subject' => 'New quiz: ' . ($quiz['quiz_title'] ?? 'Quiz'),
                'headline' => 'New quiz available',
                'body_html' => self::quizBody($quiz),
            ]
        );
    }

    public static function queueNewAnnouncement(int $announcementId) {
        $ann = db()->fetchOne(
            "SELECT a.announcement_id, a.title, a.content, a.subject_offered_id,
                    s.subject_id, s.subject_code, s.subject_name,
                    CONCAT(u.first_name, ' ', u.last_name) AS author_name
             FROM announcement a
             LEFT JOIN subject_offered so ON so.subject_offered_id = a.subject_offered_id
             LEFT JOIN subject s ON s.subject_id = so.subject_id
             JOIN users u ON u.users_id = a.user_id
             WHERE a.announcement_id = ? AND a.status = 'published'
             LIMIT 1",
            [$announcementId]
        );
        if (!$ann) {
            return 0;
        }

        $students = empty($ann['subject_offered_id'])
            ? self::fetchAllStudents()
            : self::fetchAnnouncementStudents((int)$ann['subject_offered_id'], $announcementId);

        $code = $ann['subject_code'] ?? 'All subjects';
        $preview = self::textPreview($ann['content'] ?? '');

        return self::notifyStudents($students, [
            'kind' => 'new_announcement',
            'ref_type' => 'announcement',
            'ref_id' => $announcementId,
            'title' => $ann['title'] ?? 'Announcement',
            'subject_code' => $code,
            'detail_text' => $preview,
            'link_url' => self::announcementLink($ann['subject_id'] ?? null),
            'email_subject' => 'New announcement: ' . ($ann['title'] ?? 'Update'),
            'headline' => 'New announcement',
            'body_html' => self::announcementBody($ann),
        ]);
    }

    /** Send queued classroom emails right after publish. */
    public static function dispatchAfterPublish() {
        if (MAIL_DIGEST_MODE) {
            return EmailDigestHelper::processDigests(true);
        }
        return EmailQueueHelper::processQueue(min((int)MAIL_BATCH_SIZE, 50));
    }

    public static function sendDueReminder(
        string $toEmail,
        string $studentName,
        string $subjectCode,
        string $title,
        DateTime $due,
        string $type,
        string $stage = 'due_today',
        int $userId = 0,
        int $itemId = 0
    ) {
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $kind = $type === 'quiz' ? 'Quiz' : 'Activity';
        $dueText = $due->format('M j, Y');
        $digestKind = ($stage === 'due_today') ? 'due_today' : 'due_soon';

        if (MAIL_DIGEST_MODE && $userId > 0) {
            $added = EmailDigestHelper::addItem([
                'user_id' => $userId,
                'to_email' => $toEmail,
                'to_name' => $studentName,
                'kind' => $digestKind,
                'title' => $title,
                'subject_code' => $subjectCode,
                'detail_text' => $kind . ' due ' . $dueText,
                'ref_type' => $type,
                'ref_id' => $itemId,
            ]);
            if ($added && in_array($stage, ['due_today', 'due_24h'], true)) {
                EmailDigestHelper::sendForUser($userId);
            }
            return $added;
        }

        $headline = $stage === 'due_today' ? 'Due today' : 'Due soon';
        $subject = "[COC-LMS] {$kind} {$headline}: {$subjectCode}";
        $bodyHtml = '<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#4b5563;">'
            . '<strong>' . htmlspecialchars($kind, ENT_QUOTES, 'UTF-8') . ':</strong> '
            . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '<br>'
            . '<strong>Subject:</strong> ' . htmlspecialchars($subjectCode, ENT_QUOTES, 'UTF-8') . '<br>'
            . '<strong>Due:</strong> ' . htmlspecialchars($dueText, ENT_QUOTES, 'UTF-8')
            . '</p>'
            . '<p style="margin:0;font-size:13px;color:#6b7280;">Please complete it before the deadline.</p>';

        $text = "Hi {$studentName},\n\n{$kind} {$headline}: {$title}\nSubject: {$subjectCode}\nDue: {$dueText}\n";
        $html = EmailHelper::notificationTemplate($studentName, "{$kind} {$headline}", $bodyHtml, null);
        return EmailHelper::send($toEmail, $subject, $html, $text);
    }

    private static function notifyStudents(array $students, array $payload) {
        $queued = 0;
        foreach ($students as $student) {
            $name = trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? '')) ?: 'Student';
            $email = trim((string)($student['email'] ?? ''));
            $userId = (int)($student['users_id'] ?? 0);

            if (MAIL_DIGEST_MODE) {
                if (EmailDigestHelper::addItem([
                    'user_id' => $userId,
                    'to_email' => $email,
                    'to_name' => $name,
                    'kind' => $payload['kind'],
                    'title' => $payload['title'],
                    'subject_code' => $payload['subject_code'],
                    'detail_text' => $payload['detail_text'],
                    'link_url' => $payload['link_url'],
                    'ref_type' => $payload['ref_type'],
                    'ref_id' => $payload['ref_id'],
                ])) {
                    $queued++;
                }
                continue;
            }

            $html = EmailHelper::notificationTemplate(
                $name,
                $payload['headline'],
                $payload['body_html'],
                $payload['link_url']
            );
            $text = self::plainBody($name, $payload);

            if (EmailQueueHelper::enqueue($email, $payload['email_subject'], $html, $text, [
                'to_name' => $name,
                'notification_type' => $payload['kind'],
                'item_type' => $payload['ref_type'],
                'item_id' => $payload['ref_id'],
                'user_id' => $userId,
            ])) {
                $queued++;
            }
        }
        return $queued;
    }

    private static function fetchTargetStudents(int $subjectId, string $itemType, int $itemId) {
        $sectionTable = $itemType === 'lesson' ? 'lesson_section' : 'quiz_section';
        $idCol = $itemType === 'lesson' ? 'lessons_id' : 'quiz_id';

        return db()->fetchAll(
            "SELECT DISTINCT u.users_id, u.email, u.first_name, u.last_name
             FROM student_subject ss
             JOIN users u ON u.users_id = ss.user_student_id
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             WHERE ss.status = 'enrolled'
               AND so.subject_id = ?
               AND u.status = 'active'
               AND u.email IS NOT NULL AND TRIM(u.email) <> ''
               AND (
                    NOT EXISTS (SELECT 1 FROM {$sectionTable} t0 WHERE t0.{$idCol} = ?)
                    OR EXISTS (
                        SELECT 1 FROM {$sectionTable} t1
                        WHERE t1.{$idCol} = ? AND t1.section_id = ss.section_id
                    )
               )",
            [$subjectId, $itemId, $itemId]
        ) ?: [];
    }

    private static function fetchAnnouncementStudents(int $subjectOfferedId, int $announcementId) {
        return db()->fetchAll(
            "SELECT DISTINCT u.users_id, u.email, u.first_name, u.last_name
             FROM student_subject ss
             JOIN users u ON u.users_id = ss.user_student_id
             WHERE ss.status = 'enrolled'
               AND ss.subject_offered_id = ?
               AND u.status = 'active'
               AND u.email IS NOT NULL AND TRIM(u.email) <> ''
               AND (
                    NOT EXISTS (
                        SELECT 1 FROM announcement_section ans0
                        WHERE ans0.announcement_id = ?
                    )
                    OR EXISTS (
                        SELECT 1 FROM announcement_section ans1
                        WHERE ans1.announcement_id = ?
                          AND ans1.section_id = ss.section_id
                    )
               )",
            [$subjectOfferedId, $announcementId, $announcementId]
        ) ?: [];
    }

    private static function fetchAllStudents() {
        return db()->fetchAll(
            "SELECT u.users_id, u.email, u.first_name, u.last_name
             FROM users u
             WHERE u.role = 'student'
               AND u.status = 'active'
               AND u.email IS NOT NULL AND TRIM(u.email) <> ''"
        ) ?: [];
    }

    private static function lessonBody(array $lesson) {
        $title = htmlspecialchars($lesson['lesson_title'] ?? 'Activity', ENT_QUOTES, 'UTF-8');
        $code = htmlspecialchars($lesson['subject_code'] ?? '', ENT_QUOTES, 'UTF-8');
        $name = htmlspecialchars($lesson['subject_name'] ?? '', ENT_QUOTES, 'UTF-8');
        return '<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#4b5563;">'
            . 'Your instructor posted new classwork in <strong>' . $code . '</strong> (' . $name . ').'
            . '</p>'
            . '<p style="margin:0;font-size:15px;color:#111827;"><strong>' . $title . '</strong></p>';
    }

    private static function quizBody(array $quiz) {
        $title = htmlspecialchars($quiz['quiz_title'] ?? 'Quiz', ENT_QUOTES, 'UTF-8');
        $code = htmlspecialchars($quiz['subject_code'] ?? '', ENT_QUOTES, 'UTF-8');
        $due = !empty($quiz['due_date'])
            ? '<br><strong>Due:</strong> ' . htmlspecialchars(date('M j, Y', strtotime($quiz['due_date'])), ENT_QUOTES, 'UTF-8')
            : '';
        return '<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#4b5563;">'
            . 'A new quiz is available in <strong>' . $code . '</strong>.'
            . '</p>'
            . '<p style="margin:0;font-size:15px;color:#111827;"><strong>' . $title . '</strong>' . $due . '</p>';
    }

    private static function announcementBody(array $ann) {
        $title = htmlspecialchars($ann['title'] ?? 'Announcement', ENT_QUOTES, 'UTF-8');
        $author = htmlspecialchars($ann['author_name'] ?? 'Instructor', ENT_QUOTES, 'UTF-8');
        $code = htmlspecialchars($ann['subject_code'] ?? 'All subjects', ENT_QUOTES, 'UTF-8');
        $preview = htmlspecialchars(self::textPreview($ann['content'] ?? ''), ENT_QUOTES, 'UTF-8');
        return '<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#4b5563;">'
            . '<strong>' . $author . '</strong> posted an announcement'
            . ($code !== 'All subjects' ? ' in <strong>' . $code . '</strong>' : '')
            . '.</p>'
            . '<p style="margin:0 0 8px;font-size:15px;color:#111827;"><strong>' . $title . '</strong></p>'
            . '<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">' . $preview . '</p>';
    }

    private static function plainBody(string $name, array $payload) {
        return "Hi {$name},\n\n{$payload['headline']}: {$payload['title']}\n"
            . ($payload['subject_code'] ? "Subject: {$payload['subject_code']}\n" : '')
            . "\nOpen COC-LMS to view it.\n";
    }

    private static function textPreview(string $html, int $max = 120) {
        $text = trim(preg_replace('/\s+/', ' ', strip_tags($html)));
        if (strlen($text) <= $max) {
            return $text;
        }
        return substr($text, 0, $max - 3) . '...';
    }

    private static function lessonLink(int $lessonId) {
        return EmailHelper::appBaseUrl() . '/app/dashboard.html#student/lesson-view?id=' . $lessonId;
    }

    private static function quizLink(int $quizId) {
        return EmailHelper::appBaseUrl() . '/app/dashboard.html#student/take-quiz?id=' . $quizId;
    }

    private static function announcementLink($subjectId) {
        if ($subjectId) {
            return EmailHelper::appBaseUrl() . '/app/dashboard.html#student/subject?id=' . (int)$subjectId . '&tab=classwork';
        }
        return EmailHelper::appBaseUrl() . '/app/dashboard.html#student/announcements';
    }
}
