<?php
/**
 * Process queued LMS notification emails + scheduled quiz alerts.
 *
 * CLI:
 *   php cron/process-email-queue.php
 *
 * HTTP (Windows Task Scheduler):
 *   http://localhost/COC_LMS(2)/cron/process-email-queue.php?token=YOUR_MAIL_CRON_TOKEN
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/email.php';
require_once __DIR__ . '/../api/helpers/EmailHelper.php';
require_once __DIR__ . '/../api/helpers/EmailQueueHelper.php';
require_once __DIR__ . '/../api/helpers/NotificationEmailHelper.php';
require_once __DIR__ . '/../api/helpers/EmailDigestHelper.php';
require_once __DIR__ . '/../api/helpers/QuizSectionHelper.php';

ensureQuizScheduleColumns();

if (PHP_SAPI !== 'cli') {
    $token = $_GET['token'] ?? '';
    if ($token === '' || !hash_equals(MAIL_CRON_TOKEN, $token)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Forbidden']);
        exit;
    }
    header('Content-Type: application/json');
}

$scheduled = queueScheduledQuizNotifications();
$digest = EmailDigestHelper::processDigests(!empty($_GET['force_digest']));
$result = MAIL_DIGEST_MODE
    ? ['digest_mode' => true, 'skipped_queue' => true]
    : EmailQueueHelper::processQueue(MAIL_BATCH_SIZE);

$output = [
    'success' => true,
    'scheduled_quizzes_queued' => $scheduled,
    'digest' => $digest,
    'queue' => $result,
    'sent_today' => class_exists('EmailHelper') ? EmailHelper::countSentToday() : 0,
    'daily_limit' => MAIL_DAILY_LIMIT,
    'at' => date('c'),
];

if (PHP_SAPI === 'cli') {
    echo json_encode($output, JSON_PRETTY_PRINT) . PHP_EOL;
} else {
    echo json_encode($output);
}

function queueScheduledQuizNotifications() {
    $rows = db()->fetchAll(
        "SELECT q.quiz_id
         FROM quiz q
         WHERE q.status = 'published'
           AND q.availability_start IS NOT NULL
           AND q.availability_start <= NOW()"
    ) ?: [];

    $queued = 0;
    foreach ($rows as $row) {
        $queued += NotificationEmailHelper::queueNewQuiz((int)$row['quiz_id']);
    }
    return $queued;
}
