-- =============================================
-- Fix: Make lessons_id nullable for independent quizzes
--
-- INSTRUCTIONS:
-- 1. UNCHECK "Enable foreign key checks" in phpMyAdmin
-- 2. Paste this entire script and click Go
-- =============================================

SET FOREIGN_KEY_CHECKS = 0;

-- Make lessons_id nullable in quiz_questions
ALTER TABLE `quiz_questions`
    MODIFY `lessons_id` INT(11) NULL DEFAULT NULL;

-- Make lessons_id nullable in questions master table
ALTER TABLE `questions`
    MODIFY `lessons_id` INT(11) NULL DEFAULT NULL;

SET FOREIGN_KEY_CHECKS = 1;
