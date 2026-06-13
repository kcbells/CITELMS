<?php
require_once __DIR__ . '/../../config/email.php';

/**
 * Send mail via Gmail API (OAuth2 refresh token).
 * @see https://developers.google.com/gmail/api/guides/sending
 */
class GoogleMailHelper {

    public static function isConfigured() {
        return GOOGLE_CLIENT_ID !== ''
            && GOOGLE_CLIENT_SECRET !== ''
            && GOOGLE_REFRESH_TOKEN !== ''
            && GOOGLE_SENDER_EMAIL !== '';
    }

    public static function send($toEmail, $subject, $htmlBody, $textBody = '') {
        if (!self::isConfigured()) {
            return false;
        }

        $token = self::fetchAccessToken();
        if (!$token) {
            return false;
        }

        $raw = self::buildMimeMessage($toEmail, $subject, $htmlBody, $textBody);
        $payload = json_encode(['raw' => self::base64UrlEncode($raw)]);

        $ch = curl_init('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_TIMEOUT        => 25,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            error_log('Gmail API curl error: ' . $err);
            return false;
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            return true;
        }

        error_log('Gmail API error ' . $httpCode . ': ' . $response);
        return false;
    }

    private static function fetchAccessToken() {
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS     => http_build_query([
                'client_id'     => GOOGLE_CLIENT_ID,
                'client_secret' => GOOGLE_CLIENT_SECRET,
                'refresh_token' => GOOGLE_REFRESH_TOKEN,
                'grant_type'    => 'refresh_token',
            ]),
            CURLOPT_TIMEOUT        => 20,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            error_log('Google OAuth curl error: ' . $err);
            return null;
        }

        $data = json_decode($response, true);
        if ($httpCode < 200 || $httpCode >= 300 || empty($data['access_token'])) {
            error_log('Google OAuth error ' . $httpCode . ': ' . $response);
            return null;
        }

        return $data['access_token'];
    }

    private static function buildMimeMessage($toEmail, $subject, $htmlBody, $textBody) {
        $fromName = MAIL_FROM_NAME;
        $fromEmail = GOOGLE_SENDER_EMAIL;
        $encodedSubject = self::encodeHeader($subject);
        $plain = $textBody !== '' ? $textBody : strip_tags($htmlBody);

        $boundary = 'b_' . bin2hex(random_bytes(8));

        $lines = [
            'From: ' . self::encodeAddress($fromName, $fromEmail),
            'To: ' . $toEmail,
            'Subject: ' . $encodedSubject,
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
            '',
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
        ];

        return implode("\r\n", $lines);
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

    private static function base64UrlEncode($raw) {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
