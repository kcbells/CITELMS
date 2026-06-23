-- Add lessons_id to question_bank so questions can be tagged to a specific lesson
-- Run this in phpMyAdmin on the cit_lms database

ALTER TABLE `question_bank`
  ADD COLUMN `lessons_id` INT NULL AFTER `subject_id`,
  ADD CONSTRAINT `fk_qbank_lesson`
    FOREIGN KEY (`lessons_id`) REFERENCES `lessons`(`lessons_id`)
    ON DELETE SET NULL;
