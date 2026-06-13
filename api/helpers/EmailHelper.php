<?php
require_once __DIR__ . '/../../config/constants.php';
require_once __DIR__ . '/../../config/email.php';
require_once __DIR__ . '/GoogleMailHelper.php';
require_once __DIR__ . '/GmailSmtpHelper.php';
require_once __DIR__ . '/SesSmtpHelper.php';

class EmailHelper {

    public static function appBaseUrl() {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return $scheme . '://' . $host . BASE_URL;
    }

    public static function logoUrl() {
        return self::appBaseUrl() . '/assets/images/phinma_logo2.png';
    }

    /**
     * Inline logo CID for emails (embedded attachment — works in Gmail).
     */
    public static function logoCidSrc() {
        return 'cid:phinma_logo';
    }

    public static function logoInlineAttachment() {
        $path = dirname(__DIR__, 2) . '/assets/images/phinma_logo2.png';
        if (!is_readable($path)) {
            return null;
        }
        return [
            'cid'  => 'phinma_logo',
            'path' => $path,
            'mime' => 'image/png',
            'name' => 'phinma_logo.png',
        ];
    }

    /** @deprecated Use logoCidSrc() for emails */
    public static function logoEmbedSrc() {
        return self::logoCidSrc();
    }

    public static function isGmailReady() {
        return GmailSmtpHelper::isConfigured();
    }

    public static function sendPasswordOtp($toEmail, $firstName, $otp) {
        $ttl = max(30, (int)(defined('PASSWORD_OTP_TTL') ? PASSWORD_OTP_TTL : 60));
        $mins = $ttl >= 60 ? '1 minute' : $ttl . ' seconds';
        $subject = 'Your COC-LMS password verification code';
        $html = self::passwordOtpTemplate($firstName, $otp, $mins);
        $text = "Hello {$firstName},\n\nYour COC-LMS password verification code is: {$otp}\n\nThis code expires in {$mins}.\n\nIf you did not request this, ignore this email.";

        return self::send($toEmail, $subject, $html, $text, ['priority' => true, 'require_delivery' => true]);
    }

    public static function notificationTemplate($firstName, $headline, $bodyHtml, $ctaUrl = null) {
        $name = htmlspecialchars(trim($firstName) ?: 'Student', ENT_QUOTES, 'UTF-8');
        $title = htmlspecialchars($headline, ENT_QUOTES, 'UTF-8');
        $logo = self::logoCidSrc();
        $school = htmlspecialchars(SCHOOL_NAME, ENT_QUOTES, 'UTF-8');
        $year = date('Y');
        $cta = '';
        if ($ctaUrl) {
            $href = htmlspecialchars($ctaUrl, ENT_QUOTES, 'UTF-8');
            $cta = '<div style="text-align:center;margin:24px 0 8px;">'
                . '<a href="' . $href . '" style="display:inline-block;background:#00461B;color:#fff;text-decoration:none;'
                . 'padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open in COC-LMS</a>'
                . '</div>';
        }

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,70,27,0.10);">
        <tr>
          <td style="background:linear-gradient(135deg,#00461B 0%,#1B4D3E 100%);padding:24px 32px;text-align:center;">
            <img src="{$logo}" alt="PHINMA Cagayan de Oro College" width="64" height="64" style="display:block;margin:0 auto 12px;border-radius:12px;background:#fff;padding:6px;">
            <div style="color:#fff;font-size:17px;font-weight:700;">PHINMA COC-LMS</div>
            <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:4px;">{$school}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1B4D3E;text-transform:uppercase;letter-spacing:0.5px;">{$title}</p>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hello <strong>{$name}</strong>,</p>
            {$bodyHtml}
            {$cta}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">&copy; {$year} {$school} — automated notification</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
    }

    public static function passwordOtpTemplate($firstName, $otp, $validFor = '1 minute') {
        $name = htmlspecialchars(trim($firstName) ?: 'User', ENT_QUOTES, 'UTF-8');
        $code = htmlspecialchars($otp, ENT_QUOTES, 'UTF-8');
        $valid = htmlspecialchars($validFor, ENT_QUOTES, 'UTF-8');
        $logo = self::logoCidSrc();
        $school = htmlspecialchars(SCHOOL_NAME, ENT_QUOTES, 'UTF-8');
        $app = htmlspecialchars(APP_FULL_NAME, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Verification</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,70,27,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg,#00461B 0%,#1B4D3E 100%);padding:28px 32px;text-align:center;">
              <img src="{$logo}" alt="PHINMA Cagayan de Oro College" width="72" height="72" style="display:block;margin:0 auto 14px;border-radius:12px;background:#fff;padding:6px;">
              <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">PHINMA COC-LMS</div>
              <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:6px;">{$school}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hello <strong>{$name}</strong>,</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#4b5563;">
                You requested to change your password on the <strong>{$app}</strong>.
                Use the verification code below to confirm your new password. This code is valid for <strong>{$valid}</strong>.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <div style="display:inline-block;background:#E8F5E9;border:2px dashed #1B4D3E;border-radius:12px;padding:18px 36px;">
                  <div style="font-size:11px;font-weight:700;color:#1B4D3E;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Verification Code</div>
                  <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#00461B;font-family:Consolas,monospace;">{$code}</div>
                </div>
              </div>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
                Enter this code on the password change screen to complete the update.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
                If you did not request a password change, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">
                &copy; {$year} {$school} &mdash; Learning Management System<br>
                This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }

    public static function canSendMore() {
        $cap = (int)MAIL_DAILY_LIMIT;
        if ($cap <= 0) {
            return true;
        }
        return self::countSentToday() < $cap;
    }

    public static function countSentToday() {
        self::ensureSendLogTable();
        $row = db()->fetchOne(
            "SELECT COUNT(*) AS c FROM email_send_log WHERE sent_at >= CURDATE()"
        );
        return (int)($row['c'] ?? 0);
    }

    private static function ensureSendLogTable() {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        try {
            if (!function_exists('pdo')) {
                require_once __DIR__ . '/../../config/database.php';
            }
            pdo()->exec(
                "CREATE TABLE IF NOT EXISTS email_send_log (
                    log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    to_email VARCHAR(190) NOT NULL,
                    subject VARCHAR(255) NOT NULL,
                    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_sent_day (sent_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Throwable $e) {
            error_log('email_send_log table: ' . $e->getMessage());
        }
    }

    private static function recordSend($toEmail, $subject) {
        try {
            self::ensureSendLogTable();
            db()->execute(
                "INSERT INTO email_send_log (to_email, subject) VALUES (?, ?)",
                [$toEmail, $subject]
            );
        } catch (Throwable $e) {
            error_log('email_send_log insert: ' . $e->getMessage());
        }
    }

    public static function send($toEmail, $subject, $htmlBody, $textBody = '', array $options = []) {
        $toEmail = trim($toEmail);
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $priority = !empty($options['priority']);
        $requireDelivery = !empty($options['require_delivery']);
        $inlineImages = $options['inline_images'] ?? [];
        if ($inlineImages === [] && str_contains($htmlBody, 'cid:phinma_logo')) {
            $logoAtt = self::logoInlineAttachment();
            if ($logoAtt) {
                $inlineImages = [$logoAtt];
            }
        }
        if (!$priority && !self::canSendMore()) {
            error_log("Daily email cap reached ({$subject} -> {$toEmail})");
            return false;
        }

        $provider = strtolower(trim(MAIL_PROVIDER ?: 'auto'));
        $ok = false;

        if ($provider === 'log') {
            $ok = !$requireDelivery && MAIL_DEV_LOG && self::logDevEmail($toEmail, $subject, $htmlBody, $textBody);
        } elseif ($provider === 'brevo') {
            $ok = BREVO_API_KEY !== ''
                ? self::sendViaBrevo($toEmail, $subject, $htmlBody, $textBody)
                : (!$requireDelivery && MAIL_DEV_LOG && self::logDevEmail($toEmail, $subject, $htmlBody, $textBody));
        } elseif ($provider === 'google') {
            $ok = self::sendViaGoogle($toEmail, $subject, $htmlBody, $textBody, $inlineImages);
            if (!$ok && MAIL_DEV_LOG && !$requireDelivery) {
                $ok = self::logDevEmail($toEmail, $subject, $htmlBody, $textBody);
            }
        } elseif ($provider === 'ses') {
            $ok = self::sendViaSes($toEmail, $subject, $htmlBody, $textBody);
        } else {
            if (self::sendViaGoogle($toEmail, $subject, $htmlBody, $textBody, $inlineImages)) {
                $ok = true;
            } elseif (BREVO_API_KEY !== '' && self::sendViaBrevo($toEmail, $subject, $htmlBody, $textBody)) {
                $ok = true;
            } elseif (self::sendViaSes($toEmail, $subject, $htmlBody, $textBody)) {
                $ok = true;
            } elseif (MAIL_DEV_LOG && !$requireDelivery) {
                $ok = self::logDevEmail($toEmail, $subject, $htmlBody, $textBody);
            }
        }

        if (!$ok && !$requireDelivery && $provider !== 'log' && $provider !== 'brevo' && MAIL_DEV_LOG) {
            $ok = self::logDevEmail($toEmail, $subject, $htmlBody, $textBody);
        }

        if (!$ok) {
            error_log("Email not sent ({$subject} -> {$toEmail}) provider={$provider} gmail=" . (self::isGmailReady() ? 'yes' : 'no'));
        }

        if ($ok) {
            self::recordSend($toEmail, $subject);
        }

        return $ok;
    }

    private static function sendViaSes($toEmail, $subject, $htmlBody, $textBody) {
        return SesSmtpHelper::isConfigured()
            && SesSmtpHelper::send($toEmail, $subject, $htmlBody, $textBody);
    }

    private static function sendViaGoogle($toEmail, $subject, $htmlBody, $textBody, array $inlineImages = []) {
        if (GmailSmtpHelper::isConfigured() && GmailSmtpHelper::send($toEmail, $subject, $htmlBody, $textBody, $inlineImages)) {
            return true;
        }
        if (GoogleMailHelper::isConfigured() && GoogleMailHelper::send($toEmail, $subject, $htmlBody, $textBody)) {
            return true;
        }
        return false;
    }

    private static function sendViaBrevo($toEmail, $subject, $htmlBody, $textBody) {
        $payload = [
            'sender'      => ['name' => MAIL_FROM_NAME, 'email' => MAIL_FROM_EMAIL],
            'to'          => [['email' => $toEmail]],
            'subject'     => $subject,
            'htmlContent' => $htmlBody,
        ];
        if ($textBody !== '') {
            $payload['textContent'] = $textBody;
        }

        $ch = curl_init('https://api.brevo.com/v3/smtp/email');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'accept: application/json',
                'api-key: ' . BREVO_API_KEY,
                'content-type: application/json',
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_TIMEOUT        => 20,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            error_log('Brevo curl error: ' . $err);
            return false;
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            return true;
        }

        error_log('Brevo API error ' . $httpCode . ': ' . $response);
        return false;
    }

    private static function logDevEmail($toEmail, $subject, $htmlBody, $textBody) {
        $dir = dirname(__DIR__, 2) . '/storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $line = str_repeat('=', 60) . "\n"
            . date('Y-m-d H:i:s') . " | {$subject}\n"
            . "To: {$toEmail}\n"
            . ($textBody !== '' ? $textBody . "\n" : strip_tags($htmlBody) . "\n");
        @file_put_contents($dir . '/mail.log', $line, FILE_APPEND | LOCK_EX);
        return true;
    }
}
