-- ================================================================
-- Add Program Context to Section Table
-- Sections become semester-specific cohorts with program + year_level
-- Database: cit_lms
-- Run entire script in phpMyAdmin — safe to re-run
-- ================================================================

-- ── 1. Add program_id (nullable FK to program) ──────────────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'program_id');
SET @sql = IF(@col = 0,
  'ALTER TABLE `section` ADD COLUMN `program_id` INT(11) NULL AFTER `section_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Add year_level (1-4, matching subject.year_level) ─────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'year_level');
SET @sql = IF(@col = 0,
  'ALTER TABLE `section` ADD COLUMN `year_level` TINYINT(1) NULL AFTER `program_id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Add semester_id (FK to semester table) ────────────────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'semester_id');
SET @sql = IF(@col = 0,
  'ALTER TABLE `section` ADD COLUMN `semester_id` INT(11) NULL AFTER `year_level`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. Index on program_id ───────────────────────────────────────
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND INDEX_NAME = 'idx_section_program');
SET @sql = IF(@idx = 0,
  'ALTER TABLE `section` ADD INDEX `idx_section_program` (`program_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5. Index on semester_id ──────────────────────────────────────
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND INDEX_NAME = 'idx_section_semester');
SET @sql = IF(@idx = 0,
  'ALTER TABLE `section` ADD INDEX `idx_section_semester` (`semester_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6. Auto-populate semester_id on existing sections ────────────
-- Assigns the currently active semester to all sections that have none
UPDATE `section`
SET `semester_id` = (
    SELECT `semester_id` FROM `semester` WHERE `status` = 'active' LIMIT 1
)
WHERE `semester_id` IS NULL;

-- ================================================================
-- Done! section table now has:
--   section_id, section_name, program_id, year_level, semester_id,
--   enrollment_code, max_students, status, created_at, updated_at
-- ================================================================
