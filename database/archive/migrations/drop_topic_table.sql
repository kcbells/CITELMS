-- ============================================================
-- Migration: Drop topic table
-- ============================================================
-- The topic subtopic layer has been removed from the codebase.
-- Lessons now use lesson_content directly instead of having
-- a separate topic table for subtopics.
--
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- IMPORTANT: Run this AFTER verifying the code changes work.
-- ============================================================

-- Step 1: Detach any lesson_materials that were linked to topics
-- (They remain attached to the lesson via lessons_id)
UPDATE lesson_materials SET topic_id = NULL WHERE topic_id IS NOT NULL;

-- Step 2: Drop foreign key on lesson_materials.topic_id (if it exists)
-- Note: The constraint name may vary. Check your DB if this fails.
-- Common FK names to try:
-- ALTER TABLE lesson_materials DROP FOREIGN KEY fk_lesson_materials_topic;
-- ALTER TABLE lesson_materials DROP FOREIGN KEY lesson_materials_ibfk_2;

-- Step 3: Drop the topic_id column from lesson_materials
-- ALTER TABLE lesson_materials DROP COLUMN topic_id;
-- NOTE: Uncomment line above AFTER confirming step 1 worked correctly

-- Step 4: Drop the topic_attachment table (depends on topic, must be dropped first)
DROP TABLE IF EXISTS topic_attachments;

-- Step 5: Drop the topic table
DROP TABLE IF EXISTS topic;
