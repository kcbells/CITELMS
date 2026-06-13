<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/email.php';
require_once __DIR__ . '/EmailHelper.php';

/**
 * Queues bulk LMS notifications and processes them in batches (cron-safe).
 */
class EmailQueueHelper {

    public static function ensureTable() {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        try {
            pdo()->exec(
                "CREATE TABLE IF NOT EXISTS email_queue (
                    queue_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    to_email VARCHAR(190) NOT NULL,
                    to_name VARCHAR(120) NULL,
                    subject VARCHAR(255) NOT NULL,
                    html_body MEDIUMTEXT NOT NULL,
                    text_body TEXT NULL,
                    notification_type VARCHAR(40) NULL,
                    item_type VARCHAR(20) NULL,
                    item_id INT UNSIGNED NULL,
                    user_id INT UNSIGNED NULL,
                    status ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
                    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                    error_text VARCHAR(255) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    sent_at TIMESTAMP NULL DEFAULT NULL,
                    KEY idx_status_created (status, created_at),
                    KEY idx_dedup (notification_type, item_type, item_id, user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Exception $e) {
            error_log('email_queue table: ' . $e->getMessage());
        }
    }

    public static function enqueue($toEmail, $subject, $htmlBody, $textBody = '', array $meta = []) {
        self::ensureTable();
        $toEmail = trim((string)$toEmail);
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $type = $meta['notification_type'] ?? null;
        $itemType = $meta['item_type'] ?? null;
        $itemId = isset($meta['item_id']) ? (int)$meta['item_id'] : null;
        $userId = isset($meta['user_id']) ? (int)$meta['user_id'] : null;

        if ($type && $itemType && $itemId && $userId) {
            $exists = db()->fetchOne(
                "SELECT queue_id FROM email_queue
                 WHERE notification_type = ? AND item_type = ? AND item_id = ? AND user_id = ?
                   AND status IN ('pending','sent')
                 LIMIT 1",
                [$type, $itemType, $itemId, $userId]
            );
            if ($exists) {
                return true;
            }
        }

        db()->execute(
            "INSERT INTO email_queue
                (to_email, to_name, subject, html_body, text_body, notification_type, item_type, item_id, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $toEmail,
                $meta['to_name'] ?? null,
                $subject,
                $htmlBody,
                $textBody !== '' ? $textBody : null,
                $type,
                $itemType,
                $itemId,
                $userId,
            ]
        );

        return true;
    }

    public static function processQueue($limit = null) {
        self::ensureTable();
        $limit = max(1, (int)($limit ?? MAIL_BATCH_SIZE));
        $dailyCap = max(0, (int)MAIL_DAILY_LIMIT);
        if ($dailyCap > 0 && !EmailHelper::canSendMore()) {
            return ['processed' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0, 'cap_reached' => true];
        }

        $sentToday = EmailHelper::countSentToday();
        if ($dailyCap > 0) {
            $limit = min($limit, $dailyCap - $sentToday);
        }

        $rows = db()->fetchAll(
            "SELECT * FROM email_queue
             WHERE status = 'pending' AND attempts < 3
             ORDER BY created_at ASC
             LIMIT {$limit}"
        ) ?: [];

        $sent = 0;
        $failed = 0;
        foreach ($rows as $row) {
            $ok = EmailHelper::send(
                $row['to_email'],
                $row['subject'],
                $row['html_body'],
                (string)($row['text_body'] ?? '')
            );

            if ($ok) {
                $sent++;
                db()->execute(
                    "UPDATE email_queue SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE queue_id = ?",
                    [(int)$row['queue_id']]
                );
            } else {
                $failed++;
                db()->execute(
                    "UPDATE email_queue
                     SET status = IF(attempts >= 2, 'failed', 'pending'),
                         attempts = attempts + 1,
                         error_text = 'send failed'
                     WHERE queue_id = ?",
                    [(int)$row['queue_id']]
                );
            }
        }

        return [
            'processed' => count($rows),
            'sent' => $sent,
            'failed' => $failed,
            'skipped' => 0,
            'cap_reached' => false,
        ];
    }
}
