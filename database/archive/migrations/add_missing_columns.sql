-- ============================================================
-- Migration: Add missing columns to quiz, lessons, and topic tables
-- ============================================================
-- These columns are used by the codebase but were never added
-- to the base schema. Currently detected via information_schema
-- checks at runtime — after running this migration, those checks
-- can be removed for better performance.
--
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- Safe to run multiple times (uses IF NOT EXISTS pattern).
-- ============================================================

-- -----------------------------------------------
-- 1. Quiz table: linked_quiz_id, require_lessons, no_of_items
-- -----------------------------------------------

-- linked_quiz_id: Links a pre-test to its post-test (and vice versa)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'quiz' AND column_name = 'linked_quiz_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `quiz` ADD COLUMN `linked_quiz_id` INT(11) DEFAULT NULL AFTER `quiz_type`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- require_lessons: Whether all lessons must be completed before taking this quiz
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'quiz' AND column_name = 'require_lessons');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `quiz` ADD COLUMN `require_lessons` TINYINT(1) NOT NULL DEFAULT 0 AFTER `linked_quiz_id`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- no_of_items: Number of questions to show from the pool (0 = show all)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'quiz' AND column_name = 'no_of_items');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `quiz` ADD COLUMN `no_of_items` INT(11) NOT NULL DEFAULT 0 AFTER `require_lessons`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------
-- 2. Lessons table: learning_objectives, prerequisite_lessons_id, difficulty
-- -----------------------------------------------

-- learning_objectives: Text field for lesson objectives
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'learning_objectives');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `lessons` ADD COLUMN `learning_objectives` TEXT DEFAULT NULL AFTER `lesson_content`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- prerequisite_lessons_id: FK to another lesson that must be completed first
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'prerequisite_lessons_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `lessons` ADD COLUMN `prerequisite_lessons_id` INT(11) DEFAULT NULL AFTER `learning_objectives`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- difficulty: Lesson difficulty level
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'lessons' AND column_name = 'difficulty');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `lessons` ADD COLUMN `difficulty` ENUM(''beginner'',''intermediate'',''advanced'') DEFAULT ''beginner'' AFTER `prerequisite_lessons_id`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------
-- 3. Topic table: video_url
-- -----------------------------------------------

-- video_url: Optional video URL for the topic
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'topic' AND column_name = 'video_url');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `topic` ADD COLUMN `video_url` VARCHAR(500) DEFAULT NULL AFTER `topic_content`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
