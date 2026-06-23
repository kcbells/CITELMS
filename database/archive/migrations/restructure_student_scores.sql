-- ============================================================
-- Migration: Restructure student_scores table to match ERD
-- ============================================================
-- Drops the old student_scores table and recreates it
-- with the new structure per ERD requirements.
--
-- WARNING: This will DELETE all existing data in student_scores.
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- ============================================================

-- 1. Drop the old table
DROP TABLE IF EXISTS `student_scores`;

-- 2. Create the new student_scores table matching the ERD
CREATE TABLE `student_scores` (
    `student_scores_id` INT(11) NOT NULL AUTO_INCREMENT,
    `subject_offered_id` INT(11) NOT NULL,
    `quiz_id` INT(11) NOT NULL,
    `raw_score` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `remarks` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `user_id` INT(11) NOT NULL,
    `status` ENUM('pending', 'graded', 'returned', 'excused') NOT NULL DEFAULT 'pending',
    `remedial_required` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`student_scores_id`),
    KEY `idx_scores_user` (`user_id`),
    KEY `idx_scores_subject_offered` (`subject_offered_id`),
    KEY `idx_scores_quiz` (`quiz_id`),
    CONSTRAINT `fk_scores_subject_offered` FOREIGN KEY (`subject_offered_id`)
        REFERENCES `subject_offered` (`subject_offered_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_scores_quiz` FOREIGN KEY (`quiz_id`)
        REFERENCES `quiz` (`quiz_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_scores_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`users_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
