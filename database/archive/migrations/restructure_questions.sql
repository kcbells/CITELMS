-- =============================================
-- FINAL MIGRATION: Restructure questions and quiz_questions tables
-- questions = Master File (stores question data)
-- quiz_questions = Lookup/Junction Table (links questions to lessons)
--
-- INSTRUCTIONS:
-- 1. UNCHECK "Enable foreign key checks" checkbox at bottom of phpMyAdmin
-- 2. Paste this ENTIRE script and click Go
-- =============================================

SET FOREIGN_KEY_CHECKS = 0;

-- Drop the questions table from previous migration attempt
DROP TABLE IF EXISTS `questions`;

-- =============================================
-- TABLE 1: questions (Master File)
-- =============================================
CREATE TABLE `questions` (
    `questions_id` INT(11) NOT NULL AUTO_INCREMENT,
    `question_text` TEXT NOT NULL,
    `question_type` VARCHAR(50) DEFAULT 'multiple_choice',
    `points` INT(11) DEFAULT 1,
    `question_order` INT(11) DEFAULT 1,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `users_id` INT(11) NOT NULL COMMENT 'Teacher who created the question',
    `lessons_id` INT(11) NOT NULL COMMENT 'Related lesson ID',
    PRIMARY KEY (`questions_id`),
    KEY `idx_questions_user` (`users_id`),
    KEY `idx_questions_lesson` (`lessons_id`),
    KEY `idx_questions_type` (`question_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate data from old quiz_questions into new questions
INSERT INTO `questions` (`questions_id`, `question_text`, `question_type`, `points`, `question_order`, `created_at`, `users_id`, `lessons_id`)
SELECT
    qq.question_id,
    qq.question_text,
    qq.question_type,
    qq.points,
    1,
    qq.created_at,
    q.user_teacher_id,
    q.lesson_id
FROM quiz_questions qq
JOIN quiz q ON qq.quiz_id = q.quiz_id;

-- Rename question_id to questions_id in question_option
ALTER TABLE `question_option` CHANGE `question_id` `questions_id` INT(11) NOT NULL;

-- Rename question_id to questions_id in student_quiz_answers
ALTER TABLE `student_quiz_answers` CHANGE `question_id` `questions_id` INT(11) NOT NULL;

-- Drop old quiz_questions table
DROP TABLE IF EXISTS `quiz_questions`;

-- =============================================
-- TABLE 2: quiz_questions (Lookup Table)
-- =============================================
CREATE TABLE `quiz_questions` (
    `quiz_questions_id` INT(11) NOT NULL AUTO_INCREMENT,
    `questions_id` INT(11) NOT NULL COMMENT 'References questions.questions_id',
    `lessons_id` INT(11) NOT NULL COMMENT 'References lessons.lesson_id',
    PRIMARY KEY (`quiz_questions_id`),
    UNIQUE KEY `unique_question_lesson` (`questions_id`, `lessons_id`),
    KEY `idx_qq_question` (`questions_id`),
    KEY `idx_qq_lesson` (`lessons_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Populate quiz_questions lookup from migrated data
INSERT INTO `quiz_questions` (`questions_id`, `lessons_id`)
SELECT DISTINCT questions_id, lessons_id
FROM questions;

-- =============================================
-- Add FK constraints (after all data is in place)
-- =============================================
ALTER TABLE `questions`
    ADD CONSTRAINT `fk_questions_user` FOREIGN KEY (`users_id`) REFERENCES `users` (`users_id`) ON DELETE CASCADE;
ALTER TABLE `questions`
    ADD CONSTRAINT `fk_questions_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lesson_id`) ON DELETE CASCADE;

ALTER TABLE `quiz_questions`
    ADD CONSTRAINT `fk_qq_question` FOREIGN KEY (`questions_id`) REFERENCES `questions` (`questions_id`) ON DELETE CASCADE;
ALTER TABLE `quiz_questions`
    ADD CONSTRAINT `fk_qq_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lesson_id`) ON DELETE CASCADE;

ALTER TABLE `question_option`
    ADD CONSTRAINT `fk_option_question` FOREIGN KEY (`questions_id`) REFERENCES `questions` (`questions_id`) ON DELETE CASCADE;

ALTER TABLE `student_quiz_answers`
    ADD CONSTRAINT `fk_answer_question` FOREIGN KEY (`questions_id`) REFERENCES `questions` (`questions_id`) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
