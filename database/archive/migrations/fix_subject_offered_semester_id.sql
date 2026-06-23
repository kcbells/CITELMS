-- ============================================================
-- Fix: Properly add semester_id to subject_offered
-- Date: 2026-02-26
-- Why this is needed:
--   add_semester_tables.sql contained a bug: it tried to UPDATE
--   subject_offered.semester_id before the column existed. Running
--   it in phpMyAdmin silently skipped the UPDATE but still dropped
--   the old academic_year and semester ENUM columns, leaving
--   subject_offered with no semester tracking at all.
--   This migration corrects that.
--
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- Safe to run multiple times.
-- ============================================================

-- ── Step 1: Ensure sem_type table exists ────────────────────
CREATE TABLE IF NOT EXISTS `sem_type` (
    `sem_type_id` INT(11) NOT NULL AUTO_INCREMENT,
    `sem_level`   INT(11) NOT NULL,
    PRIMARY KEY (`sem_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `sem_type` (`sem_type_id`, `sem_level`) VALUES
    (1, 1), (2, 2), (3, 3)
ON DUPLICATE KEY UPDATE `sem_level` = VALUES(`sem_level`);

-- ── Step 2: Ensure semester table exists ────────────────────
CREATE TABLE IF NOT EXISTS `semester` (
    `semester_id`   INT(11)      NOT NULL AUTO_INCREMENT,
    `semester_name` VARCHAR(100) NOT NULL,
    `academic_year` VARCHAR(20)  NOT NULL,
    `start_date`    DATE         NULL,
    `end_date`      DATE         NULL,
    `status`        ENUM('active','inactive','upcoming') DEFAULT 'inactive',
    `sem_type_id`   INT(11)      NOT NULL,
    PRIMARY KEY (`semester_id`),
    FOREIGN KEY (`sem_type_id`) REFERENCES `sem_type`(`sem_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default semesters (safe to re-run)
INSERT INTO `semester` (`semester_name`, `academic_year`, `start_date`, `end_date`, `status`, `sem_type_id`) VALUES
    ('1st Semester', '2024-2025', '2024-08-15', '2024-12-20', 'active',   1),
    ('2nd Semester', '2024-2025', '2025-01-06', '2025-05-30', 'inactive', 2),
    ('Summer',       '2024-2025', '2025-06-01', '2025-07-31', 'inactive', 3)
ON DUPLICATE KEY UPDATE `semester_name` = VALUES(`semester_name`);

-- ── Step 3: Add semester_id to subject_offered if missing ───
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_offered'
      AND COLUMN_NAME = 'semester_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE `subject_offered` ADD COLUMN `semester_id` INT(11) NULL AFTER `user_teacher_id`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 4: Populate semester_id using old ENUM column if it still exists,
--           otherwise assign to the active semester ─────────────────────

-- Case A: old 'semester' ENUM column still exists — map it
SET @semColExists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_offered'
      AND COLUMN_NAME = 'semester');
SET @sql = IF(@semColExists > 0,
    "UPDATE `subject_offered` so
     LEFT JOIN `semester` sem ON (
         (so.semester = '1st'    AND sem.sem_type_id = 1) OR
         (so.semester = '2nd'    AND sem.sem_type_id = 2) OR
         (so.semester = 'summer' AND sem.sem_type_id = 3)
     )
     SET so.semester_id = COALESCE(sem.semester_id,
         (SELECT s2.semester_id FROM semester s2 WHERE s2.status = 'active' LIMIT 1))
     WHERE so.semester_id IS NULL",
    "UPDATE `subject_offered`
     SET semester_id = (SELECT s.semester_id FROM semester s WHERE s.status = 'active' LIMIT 1)
     WHERE semester_id IS NULL"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 5: Drop old academic_year column if it still exists ─
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_offered'
      AND COLUMN_NAME = 'academic_year');
SET @sql = IF(@col > 0,
    'ALTER TABLE `subject_offered` DROP COLUMN `academic_year`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 6: Drop old semester ENUM column if it still exists ─
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_offered'
      AND COLUMN_NAME = 'semester');
SET @sql = IF(@col > 0,
    'ALTER TABLE `subject_offered` DROP COLUMN `semester`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 7: Add batch column if not exists (year level of offering) ─
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subject_offered'
      AND COLUMN_NAME = 'batch');
SET @sql = IF(@col = 0,
    "ALTER TABLE `subject_offered` ADD COLUMN `batch` ENUM('1st Year','2nd Year','3rd Year','4th Year') DEFAULT NULL AFTER `semester_id`",
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Verify ────────────────────────────────────────────────────
SELECT
    so.subject_offered_id,
    so.semester_id,
    so.batch,
    sem.semester_name,
    sem.academic_year,
    sem.status
FROM subject_offered so
LEFT JOIN semester sem ON sem.semester_id = so.semester_id
LIMIT 10;
