-- ============================================================
-- Migration: Add curriculum columns to subject table
-- Date: 2026-02-18
-- Description: Adds program_id, year_level, and semester
--              columns needed for curriculum management.
-- ============================================================
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- Safe to run multiple times (uses IF NOT EXISTS pattern).
-- ============================================================

-- program_id: Links subject to a program (nullable for GE subjects)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'subject' AND column_name = 'program_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `subject` ADD COLUMN `program_id` INT(11) DEFAULT NULL AFTER `subject_id`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- year_level: Which year the subject is taken (1-4)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'subject' AND column_name = 'year_level');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `subject` ADD COLUMN `year_level` INT(11) DEFAULT NULL AFTER `pre_requisite`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- semester: Which semester (1=1st, 2=2nd, 3=Summer)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'subject' AND column_name = 'semester');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `subject` ADD COLUMN `semester` TINYINT(1) DEFAULT NULL AFTER `year_level`',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Assign IT/CS subjects to BSIT program (program_id=1) with year/semester
-- CC101 - Intro to Computing: 1st Year, 1st Semester
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '1st' WHERE subject_code = 'CC101' AND program_id IS NULL;
-- CC102 - Computer Programming 1: 1st Year, 2nd Semester
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '2nd' WHERE subject_code = 'CC102' AND program_id IS NULL;
-- CC103 - Computer Programming 2: 2nd Year, 1st Semester
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '1st' WHERE subject_code = 'CC103' AND program_id IS NULL;
-- CC104 - Data Structures: 2nd Year, 2nd Semester
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '2nd' WHERE subject_code = 'CC104' AND program_id IS NULL;
-- CC105 - Database Management: 2nd Year, 1st Semester
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '1st' WHERE subject_code = 'CC105' AND program_id IS NULL;
-- CC106 - Web Development: 2nd Year, 2nd Semester
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '2nd' WHERE subject_code = 'CC106' AND program_id IS NULL;
-- IT101 - Networking: 3rd Year, 1st Semester
UPDATE `subject` SET program_id = 1, year_level = 3, semester = '1st' WHERE subject_code = 'IT101' AND program_id IS NULL;
-- IT102 - Info Assurance: 3rd Year, 2nd Semester
UPDATE `subject` SET program_id = 1, year_level = 3, semester = '2nd' WHERE subject_code = 'IT102' AND program_id IS NULL;
-- IT103 - Systems Admin: 3rd Year, 2nd Semester
UPDATE `subject` SET program_id = 1, year_level = 3, semester = '2nd' WHERE subject_code = 'IT103' AND program_id IS NULL;
-- IT104 - Capstone 1: 4th Year, 1st Semester
UPDATE `subject` SET program_id = 1, year_level = 4, semester = '1st' WHERE subject_code = 'IT104' AND program_id IS NULL;
-- IT105 - Capstone 2: 4th Year, 2nd Semester
UPDATE `subject` SET program_id = 1, year_level = 4, semester = '2nd' WHERE subject_code = 'IT105' AND program_id IS NULL;

-- GE subjects: assign to BSIT 1st year (shared across programs, but start here)
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '1st' WHERE subject_code = 'GE101' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '1st' WHERE subject_code = 'GE102' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '2nd' WHERE subject_code = 'GE103' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '2nd' WHERE subject_code = 'GE104' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 1, semester = '1st' WHERE subject_code = 'GE105' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '1st' WHERE subject_code = 'GE106' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '1st' WHERE subject_code = 'GE107' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '2nd' WHERE subject_code = 'GE108' AND program_id IS NULL;
UPDATE `subject` SET program_id = 1, year_level = 2, semester = '2nd' WHERE subject_code = 'GE109' AND program_id IS NULL;

-- Verify
SELECT subject_code, subject_name, program_id, year_level, semester FROM subject ORDER BY year_level, semester, subject_code;
