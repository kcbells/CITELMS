-- ============================================================
-- Migration: Add quiz behavior flags
-- Run in phpMyAdmin on the cit_lms database
-- ============================================================

-- is_randomized may already exist; use IF NOT EXISTS pattern
ALTER TABLE quiz
    ADD COLUMN IF NOT EXISTS is_randomized   TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Shuffle question order and answer choices per attempt',
    ADD COLUMN IF NOT EXISTS one_at_a_time   TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Show one question at a time; student cannot go back';
