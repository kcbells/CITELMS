-- =============================================
-- Fix: Make lessons_id nullable in quiz table
-- This allows creating "Independent Quizzes" not tied to any lesson
-- =============================================

SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing foreign key constraint
ALTER TABLE `quiz` DROP FOREIGN KEY `fk_quiz_lesson`;

-- Make lessons_id nullable
ALTER TABLE `quiz` MODIFY `lessons_id` INT(11) NULL DEFAULT NULL;

-- Re-add foreign key constraint (now allows NULL)
ALTER TABLE `quiz`
    ADD CONSTRAINT `fk_quiz_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
