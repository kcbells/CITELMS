-- ============================================================
-- Migration: Create messages table for real-time chat
-- Date: 2026-02-26
--
-- Enables student ↔ instructor direct messaging.
-- Polling-based "real-time" via JS setInterval.
--
-- Run in phpMyAdmin on the cit_lms database.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS `messages` (
    `message_id`   INT(11)      NOT NULL AUTO_INCREMENT,
    `sender_id`    INT(11)      NOT NULL,
    `receiver_id`  INT(11)      NOT NULL,
    `content`      TEXT         NOT NULL,
    `is_read`      TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`message_id`),
    INDEX `idx_sender`   (`sender_id`),
    INDEX `idx_receiver` (`receiver_id`, `is_read`),
    INDEX `idx_thread`   (`sender_id`, `receiver_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify
SELECT 'messages table ready' AS status;
