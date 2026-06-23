-- Add attachment support to lesson_bank
-- Run in phpMyAdmin on cit_lms database

ALTER TABLE `lesson_bank`
  ADD COLUMN `attachment_type` ENUM('none','file','link') DEFAULT 'none' AFTER `lesson_content`,
  ADD COLUMN `attachment_path` VARCHAR(500) NULL AFTER `attachment_type`,
  ADD COLUMN `attachment_name` VARCHAR(200) NULL AFTER `attachment_path`;
