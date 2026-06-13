<?php
require_once __DIR__ . '/../../config/email.php';

/**
 * Amazon SES SMTP — supports 1,000–2,000+ emails/day at ~$0.10 per 1,000.
 * @see https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html
 */
class SesSmtpHelper {

    public static function isConfigured() {
        return SES_SMTP_USER !== ''
            && SES_SMTP_PASSWORD !== ''
            && SES_REGION !== '';
    }

    public static function send($toEmail, $subject, $htmlBody, $textBody = '') {
        if (!self::isConfigured()) {
            return false;
        }

        $plain = $textBody !== '' ? $textBody : strip_tags($htmlBody);
        $boundary = 'b_' . bin2hex(random_bytes(8));
        $fromName = MAIL_FROM_NAME;
        $fromEmail = MAIL_FROM_EMAIL;

        $headers = [
            'From: ' . self::encodeAddress($fromName, $fromEmail),
            'To: ' . $toEmail,
            'Subject: ' . self::encodeHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        $body = implode("\r\n", [
            '--' . $boundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($plain)),
            '--' . $boundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($htmlBody)),
            '--' . $boundary . '--',
        ]);

        $message = implode("\r\n", $headers) . "\r\n\r\n" . $body;
        $message = str_replace(["\r\n.", "\n."], ["\r\n..", "\n.."], $message);

        try {
            return self::smtpSend($fromEmail, $toEmail, $message);
        } catch (Throwable $e) {
            error_log('SES SMTP error: ' . $e->getMessage());
            return false;
        }
    }

    private static function smtpHost() {
        return 'email-smtp.' . SES_REGION . '.amazonaws.com';
    }

    private static function smtpSend($fromEmail, $toEmail, $message) {
        $socket = @stream_socket_client(
            'tcp://' . self::smtpHost() . ':587',
            $errno,
            $errstr,
            25,
            STREAM_CLIENT_CONNECT
        );

        if (!$socket) {
            throw new RuntimeException("SES connect failed: {$errstr} ({$errno})");
        }

        stream_set_timeout($socket, 25);
        self::expect($socket, 220);
        self::cmd($socket, 'EHLO localhost', 250);
        self::cmd($socket, 'STARTTLS', 220);

        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('SES STARTTLS failed');
        }

        self::cmd($socket, 'EHLO localhost', 250);
        self::cmd($socket, 'AUTH LOGIN', 334);
        self::cmd($socket, base64_encode(SES_SMTP_USER), 334);
        self::cmd($socket, base64_encode(SES_SMTP_PASSWORD), 235);
        self::cmd($socket, 'MAIL FROM:<' . $fromEmail . '>', 250);
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
            throw new RuntimeException("SES expected {$code}, got {$got}: {$response}");
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
