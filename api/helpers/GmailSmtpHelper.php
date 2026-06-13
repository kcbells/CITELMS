<?php
require_once __DIR__ . '/../../config/email.php';

/**
 * Send mail via Gmail SMTP (App Password).
 * Easier setup than Gmail API — still uses your Google account.
 */
class GmailSmtpHelper {

    public static function isConfigured() {
        return GMAIL_SMTP_USER !== '' && GMAIL_SMTP_APP_PASSWORD !== '';
    }

    public static function send($toEmail, $subject, $htmlBody, $textBody = '', array $inlineImages = []) {
        if (!self::isConfigured()) {
            return false;
        }

        $plain = $textBody !== '' ? $textBody : strip_tags($htmlBody);
        $fromName = MAIL_FROM_NAME;
        $fromEmail = GMAIL_SMTP_USER;

        $message = self::buildMimeMessage($fromName, $fromEmail, $toEmail, $subject, $plain, $htmlBody, $inlineImages);
        $message = str_replace(["\r\n.", "\n."], ["\r\n..", "\n.."], $message);

        try {
            return self::smtpSend($fromEmail, $toEmail, $message);
        } catch (Throwable $e) {
            error_log('Gmail SMTP error: ' . $e->getMessage());
            return false;
        }
    }

    private static function buildMimeMessage($fromName, $fromEmail, $toEmail, $subject, $plain, $htmlBody, array $inlineImages) {
        $altBoundary = 'alt_' . bin2hex(random_bytes(6));
        $altParts = [
            '--' . $altBoundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($plain)),
            '--' . $altBoundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($htmlBody)),
            '--' . $altBoundary . '--',
        ];
        $altBody = implode("\r\n", $altParts);

        $headers = [
            'From: ' . self::encodeAddress($fromName, $fromEmail),
            'To: ' . $toEmail,
            'Subject: ' . self::encodeHeader($subject),
            'MIME-Version: 1.0',
        ];

        $inlineImages = array_values(array_filter($inlineImages));
        if ($inlineImages === []) {
            $headers[] = 'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"';
            return implode("\r\n", $headers) . "\r\n\r\n" . $altBody;
        }

        $relatedBoundary = 'rel_' . bin2hex(random_bytes(6));
        $headers[] = 'Content-Type: multipart/related; boundary="' . $relatedBoundary . '"';

        $parts = [
            '--' . $relatedBoundary,
            'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"',
            '',
            $altBody,
        ];

        foreach ($inlineImages as $img) {
            $path = $img['path'] ?? '';
            $cid = $img['cid'] ?? '';
            if ($cid === '' || !is_readable($path)) {
                continue;
            }
            $mime = $img['mime'] ?? 'image/png';
            $filename = $img['name'] ?? basename($path);
            $parts[] = '--' . $relatedBoundary;
            $parts[] = 'Content-Type: ' . $mime;
            $parts[] = 'Content-Transfer-Encoding: base64';
            $parts[] = 'Content-ID: <' . $cid . '>';
            $parts[] = 'Content-Disposition: inline; filename="' . $filename . '"';
            $parts[] = '';
            $parts[] = chunk_split(base64_encode((string)file_get_contents($path)));
        }

        $parts[] = '--' . $relatedBoundary . '--';
        return implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
    }

    private static function smtpSend($fromEmail, $toEmail, $message) {
        $socket = @stream_socket_client(
            'tcp://smtp.gmail.com:587',
            $errno,
            $errstr,
            20,
            STREAM_CLIENT_CONNECT
        );

        if (!$socket) {
            throw new RuntimeException("Connect failed: {$errstr} ({$errno})");
        }

        stream_set_timeout($socket, 20);
        self::expect($socket, 220);
        self::cmd($socket, 'EHLO localhost', 250);

        self::cmd($socket, 'STARTTLS', 220);
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
            $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        }
        if (!stream_socket_enable_crypto($socket, true, $crypto)) {
            throw new RuntimeException('STARTTLS failed');
        }

        self::cmd($socket, 'EHLO localhost', 250);
        self::cmd($socket, 'AUTH LOGIN', 334);
        self::cmd($socket, base64_encode(GMAIL_SMTP_USER), 334);
        self::cmd($socket, base64_encode(str_replace(' ', '', GMAIL_SMTP_APP_PASSWORD)), 235);
        self::cmd($socket, 'MAIL FROM:<' . GMAIL_SMTP_USER . '>', 250);
        self::cmd($socket, 'RCPT TO:<' . $toEmail . '>', 250);
        self::cmd($socket, 'DATA', 354);

        fwrite($socket, $message . "\r\n.\r\n");
        self::expect($socket, 250);
        self::cmd($socket, 'QUIT', 221);
        fclose($socket);

        return true;
    }

    private static function cmd($socket, $command, $expectCode) {
        fwrite($socket, $command . "\r\n");
        self::expect($socket, $expectCode);
    }

    private static function expect($socket, $code) {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }

        $got = (int)substr(trim($response), 0, 3);
        if ($got !== $code) {
            throw new RuntimeException("Expected SMTP {$code}, got {$got}: {$response}");
        }
    }

    private static function encodeAddress($name, $email) {
        return self::encodeHeader($name) . ' <' . $email . '>';
    }

    private static function encodeHeader($value) {
        if (preg_match('/[^\x20-\x7E]/', $value)) {
            return '=?UTF-8?B?' . base64_encode($value) . '?=';
        }
        return $value;
    }
}
