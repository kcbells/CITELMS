-- Migration: Create quiz_lessons junction table
-- This replaces the direct quiz.lessons_id column with a many-to-many relationship
-- Run this in phpMyAdmin

-- 1. Create the quiz_lessons junction table
CREATE TABLE IF NOT EXISTS `quiz_lessons` (
    `quiz_lessons_id` INT(11) NOT NULL AUTO_INCREMENT,
    `lessons_id` INT(11) NOT NULL,
    `quiz_id` INT(11) NOT NULL,
    PRIMARY KEY (`quiz_lessons_id`),
    KEY `idx_quiz_lessons_lesson` (`lessons_id`),
    KEY `idx_quiz_lessons_quiz` (`quiz_id`),
    CONSTRAINT `fk_quiz_lessons_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_quiz_lessons_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quiz` (`quiz_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Migrate existing data from quiz.lessons_id into the junction table
INSERT INTO `quiz_lessons` (`lessons_id`, `quiz_id`)
SELECT `lessons_id`, `quiz_id`
FROM `quiz`
WHERE `lessons_id` IS NOT NULL;

-- 3. Drop the foreign key constraint on quiz.lessons_id (if it exists)
-- Note: The constraint name may vary. Check your DB if this fails.
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME LIKE '%lessons%');

-- Try common FK names - run whichever applies to your DB:
-- ALTER TABLE `quiz` DROP FOREIGN KEY `fk_quiz_lessons`;
-- ALTER TABLE `quiz` DROP FOREIGN KEY `quiz_ibfk_1`;

-- 4. Drop the lessons_id column from quiz table
-- ALTER TABLE `quiz` DROP COLUMN `lessons_id`;
-- NOTE: Uncomment line above AFTER confirming the migration worked correctly
