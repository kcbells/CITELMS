-- Migration: add media attachment columns to questions table
-- Run once: adds media_type, media_url, media_name to support
-- image / audio / link attachments on quiz questions

ALTER TABLE `questions`
  ADD COLUMN `media_type` ENUM('none','image','audio','link') NOT NULL DEFAULT 'none' AFTER `lessons_id`,
  ADD COLUMN `media_url`  VARCHAR(500) DEFAULT NULL AFTER `media_type`,
  ADD COLUMN `media_name` VARCHAR(200) DEFAULT NULL AFTER `media_url`;
