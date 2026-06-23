-- ============================================================
-- LESSON ENHANCEMENTS MIGRATION
-- Adds: Learning Objectives, Prerequisites, Video Support
-- ============================================================

-- Add columns to lessons table (if not exist)
ALTER TABLE `lessons`
ADD COLUMN IF NOT EXISTS `learning_objectives` TEXT NULL COMMENT 'JSON array of objectives' AFTER `lesson_description`,
ADD COLUMN IF NOT EXISTS `prerequisite_lesson_id` INT(11) NULL COMMENT 'Must complete this lesson first' AFTER `learning_objectives`,
ADD COLUMN IF NOT EXISTS `difficulty` ENUM('beginner','intermediate','advanced') DEFAULT 'beginner' AFTER `estimated_time`;

-- Add video_url to topics table
ALTER TABLE `topic`
ADD COLUMN IF NOT EXISTS `video_url` VARCHAR(500) NULL COMMENT 'YouTube/Vimeo embed URL' AFTER `topic_content`,
ADD COLUMN IF NOT EXISTS `content_type` ENUM('text','video','mixed') DEFAULT 'text' AFTER `video_url`;

-- Add index for prerequisite lookups
CREATE INDEX IF NOT EXISTS `idx_prerequisite` ON `lessons`(`prerequisite_lesson_id`);

-- Verification
SELECT 'Migration completed successfully' AS status;
