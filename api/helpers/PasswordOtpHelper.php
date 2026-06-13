<?php
require_once __DIR__ . '/EmailHelper.php';

class PasswordOtpHelper {

    public static function ensureTable() {
        static $ready = false;
        if ($ready) {
            return;
        }

        try {
            pdo()->exec(
                "CREATE TABLE IF NOT EXISTS password_otp (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    users_id INT UNSIGNED NOT NULL,
                    otp_hash VARCHAR(255) NOT NULL,
                    new_password_hash VARCHAR(255) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    used_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_password_otp_user (users_id),
                    INDEX idx_password_otp_expires (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
            $ready = true;
        } catch (Exception $e) {
            error_log('password_otp table: ' . $e->getMessage());
            throw $e;
        }
    }

    public static function create($userId, $email, $firstName, $newPasswordHash) {
        self::ensureTable();
        self::invalidateForUser($userId);

        $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $ttl = max(30, (int)(defined('PASSWORD_OTP_TTL') ? PASSWORD_OTP_TTL : 60));
        $expiresAt = date('Y-m-d H:i:s', time() + $ttl);

        pdo()->prepare(
            "INSERT INTO password_otp (users_id, otp_hash, new_password_hash, expires_at)
             VALUES (?, ?, ?, ?)"
        )->execute([
            $userId,
            password_hash($otp, PASSWORD_DEFAULT),
            $newPasswordHash,
            $expiresAt,
        ]);

        $sent = EmailHelper::sendPasswordOtp($email, $firstName, $otp);

        return ['sent' => $sent, 'expires_at' => $expiresAt, 'expires_in' => $ttl];
    }

    public static function verifyAndApply($userId, $otp) {
        self::ensureTable();

        $otp = trim((string)$otp);
        if (!preg_match('/^\d{6}$/', $otp)) {
            return ['ok' => false, 'message' => 'Enter the 6-digit code from your email.'];
        }

        $row = db()->fetchOne(
            "SELECT id, otp_hash, new_password_hash, expires_at, used_at
             FROM password_otp
             WHERE users_id = ?
             ORDER BY id DESC
             LIMIT 1",
            [$userId]
        );

        if (!$row) {
            return ['ok' => false, 'message' => 'No verification code found. Request a new code first.'];
        }

        if (!empty($row['used_at'])) {
            return ['ok' => false, 'message' => 'This code was already used. Request a new one.'];
        }

        if (strtotime($row['expires_at']) < time()) {
            return ['ok' => false, 'message' => 'Verification code expired. Request a new code.'];
        }

        if (!password_verify($otp, $row['otp_hash'])) {
            return ['ok' => false, 'message' => 'Incorrect verification code.'];
        }

        $pdo = pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                "UPDATE users SET password = ?, updated_at = NOW() WHERE users_id = ?"
            )->execute([$row['new_password_hash'], $userId]);

            $pdo->prepare(
                "UPDATE password_otp SET used_at = NOW() WHERE id = ?"
            )->execute([$row['id']]);

            $pdo->commit();
            return ['ok' => true, 'message' => 'Password changed successfully.'];
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('OTP apply password: ' . $e->getMessage());
            return ['ok' => false, 'message' => 'Could not update password. Please try again.'];
        }
    }

    private static function invalidateForUser($userId) {
        pdo()->prepare(
            "UPDATE password_otp SET used_at = NOW() WHERE users_id = ? AND used_at IS NULL"
        )->execute([$userId]);
    }
}
