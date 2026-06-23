CREATE TABLE IF NOT EXISTS password_otp (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    users_id INT UNSIGNED NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    new_password_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_otp_user (users_id),
    INDEX idx_password_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
