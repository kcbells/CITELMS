-- ============================================================
-- Migration: Add tab switch count to quiz attempts
-- Run in phpMyAdmin on the cit_lms database
-- ============================================================

ALTER TABLE student_quiz_attempts
    ADD COLUMN tab_switch_count INT NOT NULL DEFAULT 0
        COMMENT 'Number of times student switched tabs or alt-tabbed during the quiz'
    AFTER has_pending_grades;
