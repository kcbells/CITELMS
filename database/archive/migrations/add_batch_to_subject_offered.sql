-- Add batch (year level) column to subject_offered
-- Run this in phpMyAdmin on the cit_lms database

ALTER TABLE `subject_offered`
ADD COLUMN `batch` ENUM('1st Year','2nd Year','3rd Year','4th Year') DEFAULT NULL
AFTER `semester_id`;
