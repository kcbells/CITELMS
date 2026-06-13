<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/email.php';
require_once __DIR__ . '/EmailHelper.php';

/**
 * Batches multiple LMS alerts into one email per student (free-tier friendly).
 */
class EmailDigestHelper {

    public static function ensureTable() {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        try {
            pdo()->exec(
                "CREATE TABLE IF NOT EXISTS notification_digest_items (
                    item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    to_email VARCHAR(190) NOT NULL,
                    to_name VARCHAR(120) NULL,
                    kind VARCHAR(32) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    subject_code VARCHAR(40) NULL,
                    detail_text VARCHAR(255) NULL,
                    link_url VARCHAR(500) NULL,
                    ref_type VARCHAR(20) NULL,
                    ref_id INT UNSIGNED NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    digested_at TIMESTAMP NULL DEFAULT NULL,
                    KEY idx_user_pending (user_id, digested_at),
                    KEY idx_dedup (kind, ref_type, ref_id, user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Exception $e) {
            error_log('notification_digest_items table: ' . $e->getMessage());
        }
    }

    public static function addItem(array $data) {
        if (!MAIL_DIGEST_MODE) {
            return false;
        }

        self::ensureTable();

        $userId = (int)($data['user_id'] ?? 0);
        $email = trim((string)($data['to_email'] ?? ''));
        $kind = trim((string)($data['kind'] ?? ''));
        $refType = $data['ref_type'] ?? null;
        $refId = isset($data['ref_id']) ? (int)$data['ref_id'] : null;

        if (!$userId || !filter_var($email, FILTER_VALIDATE_EMAIL) || $kind === '') {
            return false;
        }

        if ($refType && $refId) {
            $exists = db()->fetchOne(
                "SELECT item_id FROM notification_digest_items
                 WHERE user_id = ? AND kind = ? AND ref_type = ? AND ref_id = ?
                   AND (digested_at IS NULL OR digested_at >= CURDATE())
                 LIMIT 1",
                [$userId, $kind, $refType, $refId]
            );
            if ($exists) {
                return true;
            }
        }

        db()->execute(
            "INSERT INTO notification_digest_items
                (user_id, to_email, to_name, kind, title, subject_code, detail_text, link_url, ref_type, ref_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $userId,
                $email,
                $data['to_name'] ?? null,
                $kind,
                $data['title'] ?? '',
                $data['subject_code'] ?? null,
                $data['detail_text'] ?? null,
                $data['link_url'] ?? null,
                $refType,
                $refId,
            ]
        );

        return true;
    }

    /**
     * Send digest emails when digest hour is reached (or force via cron).
     */
    public static function processDigests($force = false) {
        if (!MAIL_DIGEST_MODE) {
            return ['students' => 0, 'sent' => 0, 'skipped' => 0];
        }

        self::ensureTable();

        if (!$force && (int)date('G') < (int)MAIL_DIGEST_HOUR) {
            return ['students' => 0, 'sent' => 0, 'skipped' => 0, 'waiting' => true];
        }

        $groups = db()->fetchAll(
            "SELECT user_id, to_email, MAX(to_name) AS to_name, COUNT(*) AS item_count
             FROM notification_digest_items
             WHERE digested_at IS NULL
             GROUP BY user_id, to_email
             ORDER BY MIN(created_at) ASC"
        ) ?: [];

        $sent = 0;
        $skipped = 0;
        foreach ($groups as $group) {
            if (!EmailHelper::canSendMore()) {
                $skipped += count($groups) - $sent - $skipped;
                break;
            }

            $userId = (int)$group['user_id'];
            $items = db()->fetchAll(
                "SELECT * FROM notification_digest_items
                 WHERE user_id = ? AND digested_at IS NULL
                 ORDER BY FIELD(kind, 'due_today', 'due_soon', 'new_announcement', 'new_quiz', 'new_lesson'), created_at ASC",
                [$userId]
            ) ?: [];

            if (!$items) {
                continue;
            }

            $name = trim((string)($group['to_name'] ?? '')) ?: 'Student';
            $email = $group['to_email'];
            $subject = 'Your COC-LMS update — ' . count($items) . ' notification' . (count($items) === 1 ? '' : 's');
            $html = self::buildDigestHtml($name, $items);
            $text = self::buildDigestText($name, $items);

            if (EmailHelper::send($email, $subject, $html, $text)) {
                $sent++;
                db()->execute(
                    "UPDATE notification_digest_items SET digested_at = NOW()
                     WHERE user_id = ? AND digested_at IS NULL",
                    [$userId]
                );
            }
        }

        return [
            'students' => count($groups),
            'sent' => $sent,
            'skipped' => $skipped,
        ];
    }

    /** Send pending digest for one student (e.g. due-today reminder). */
    public static function sendForUser(int $userId) {
        if (!MAIL_DIGEST_MODE || $userId <= 0) {
            return false;
        }
        self::ensureTable();
        if (!EmailHelper::canSendMore()) {
            return false;
        }

        $items = db()->fetchAll(
            "SELECT * FROM notification_digest_items
             WHERE user_id = ? AND digested_at IS NULL
             ORDER BY FIELD(kind, 'due_today', 'due_soon', 'new_announcement', 'new_quiz', 'new_lesson'), created_at ASC",
            [$userId]
        ) ?: [];

        if (!$items) {
            return false;
        }

        $email = $items[0]['to_email'];
        $name = trim((string)($items[0]['to_name'] ?? '')) ?: 'Student';
        $subject = 'Your COC-LMS update — ' . count($items) . ' notification' . (count($items) === 1 ? '' : 's');
        $html = self::buildDigestHtml($name, $items);
        $text = self::buildDigestText($name, $items);

        if (!EmailHelper::send($email, $subject, $html, $text)) {
            return false;
        }

        db()->execute(
            "UPDATE notification_digest_items SET digested_at = NOW()
             WHERE user_id = ? AND digested_at IS NULL",
            [$userId]
        );
        return true;
    }

    private static function buildDigestHtml(string $name, array $items) {
        $sections = [
            'due_today' => [],
            'due_soon' => [],
            'new_announcement' => [],
            'new_quiz' => [],
            'new_lesson' => [],
        ];
        foreach ($items as $item) {
            $kind = $item['kind'] ?? 'new_lesson';
            if (!isset($sections[$kind])) {
                $sections[$kind] = [];
            }
            $sections[$kind][] = $item;
        }

        $body = '';
        $labels = [
            'due_today' => 'Due today',
            'due_soon' => 'Due soon',
            'new_announcement' => 'Announcements',
            'new_quiz' => 'New quizzes',
            'new_lesson' => 'New class activities',
        ];

        foreach ($labels as $kind => $label) {
            if (empty($sections[$kind])) {
                continue;
            }
            $body .= '<div style="margin:0 0 18px;">';
            $body .= '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1B4D3E;text-transform:uppercase;">'
                . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</p><ul style="margin:0;padding-left:18px;">';
            foreach ($sections[$kind] as $row) {
                $title = htmlspecialchars($row['title'] ?? '', ENT_QUOTES, 'UTF-8');
                $code = htmlspecialchars($row['subject_code'] ?? '', ENT_QUOTES, 'UTF-8');
                $detail = htmlspecialchars($row['detail_text'] ?? '', ENT_QUOTES, 'UTF-8');
                $line = '<strong>' . $title . '</strong>';
                if ($code !== '') {
                    $line .= ' <span style="color:#6b7280;">(' . $code . ')</span>';
                }
                if ($detail !== '') {
                    $line .= ' — ' . $detail;
                }
                $body .= '<li style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.5;">' . $line . '</li>';
            }
            $body .= '</ul></div>';
        }

        $appUrl = htmlspecialchars(EmailHelper::appBaseUrl() . '/app/index.html', ENT_QUOTES, 'UTF-8');
        $body .= '<p style="margin:0;font-size:13px;color:#6b7280;">'
            . '<a href="' . $appUrl . '" style="color:#00461B;">Open COC-LMS</a> to view everything.</p>';

        return EmailHelper::notificationTemplate($name, 'Daily summary', $body, null);
    }

    private static function buildDigestText(string $name, array $items) {
        $lines = ["Hi {$name},", '', 'Your COC-LMS updates:', ''];
        foreach ($items as $row) {
            $code = $row['subject_code'] ?? '';
            $detail = $row['detail_text'] ?? '';
            $lines[] = '- [' . ($row['kind'] ?? 'alert') . '] ' . ($row['title'] ?? '')
                . ($code ? " ({$code})" : '')
                . ($detail ? " — {$detail}" : '');
        }
        $lines[] = '';
        $lines[] = 'Open COC-LMS to view all items.';
        return implode("\n", $lines);
    }
}
