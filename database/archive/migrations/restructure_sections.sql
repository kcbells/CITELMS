-- ================================================================
-- Restructure Sections: One Section → Multiple Subjects
-- Database: cit_lms
-- Run the ENTIRE script at once in phpMyAdmin
-- Safe to re-run — every step checks before executing
-- ================================================================


-- ── 1. Add enrollment_code column (skip if already exists) ──────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'enrollment_code');
SET @sql = IF(@col = 0,
  'ALTER TABLE `section` ADD COLUMN `enrollment_code` VARCHAR(20) NULL AFTER `section_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Add updated_at column (skip if already exists) ───────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'updated_at');
SET @sql = IF(@col = 0,
  'ALTER TABLE `section` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Fill in missing enrollment codes ─────────────────────────
UPDATE `section`
SET `enrollment_code` = CONCAT(
  CHAR(65 + FLOOR(RAND() * 26)),
  CHAR(65 + FLOOR(RAND() * 26)),
  CHAR(65 + FLOOR(RAND() * 26)),
  '-',
  LPAD(FLOOR(1000 + RAND() * 9000), 4, '0')
)
WHERE `enrollment_code` IS NULL OR `enrollment_code` = '';

-- ── 4. Make enrollment_code NOT NULL ────────────────────────────
ALTER TABLE `section`
  MODIFY COLUMN `enrollment_code` VARCHAR(20) NOT NULL;

-- ── 5. Add unique index on enrollment_code (skip if exists) ─────
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND INDEX_NAME = 'uq_enrollment_code');
SET @sql = IF(@idx = 0,
  'ALTER TABLE `section` ADD UNIQUE KEY `uq_enrollment_code` (`enrollment_code`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 6. Create section_subject junction table ────────────────────
CREATE TABLE IF NOT EXISTS `section_subject` (
  `section_subject_id` INT(11)      NOT NULL AUTO_INCREMENT,
  `section_id`         INT(11)      NOT NULL,
  `subject_offered_id` INT(11)      NOT NULL,
  `schedule`           VARCHAR(100) DEFAULT NULL,
  `room`               VARCHAR(50)  DEFAULT NULL,
  `status`             ENUM('active','inactive') DEFAULT 'active',
  `created_at`         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`section_subject_id`),
  UNIQUE KEY `uq_sec_subj` (`section_id`, `subject_offered_id`),
  KEY `fk_secsubj_section` (`section_id`),
  KEY `fk_secsubj_offered` (`subject_offered_id`),
  CONSTRAINT `fk_secsubj_section` FOREIGN KEY (`section_id`)
    REFERENCES `section` (`section_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_secsubj_offered` FOREIGN KEY (`subject_offered_id`)
    REFERENCES `subject_offered` (`subject_offered_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 7. Migrate old data: each section had one subject_offered_id ─
-- INSERT IGNORE skips rows that already exist in section_subject
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'subject_offered_id');
SET @sql = IF(@col > 0,
  'INSERT IGNORE INTO `section_subject` (`section_id`, `subject_offered_id`, `schedule`, `room`)
   SELECT `section_id`, `subject_offered_id`, `schedule`, `room`
   FROM `section`
   WHERE `subject_offered_id` IS NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 8. Drop old FK on subject_offered_id (name varies per install)
SET @fk = (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'section'
    AND COLUMN_NAME = 'subject_offered_id'
    AND REFERENCED_TABLE_NAME = 'subject_offered'
  LIMIT 1
);
SET @sql = IF(@fk IS NOT NULL,
  CONCAT('ALTER TABLE `section` DROP FOREIGN KEY `', @fk, '`'),
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 9. Drop subject_offered_id column (skip if already removed) ─
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'subject_offered_id');
SET @sql = IF(@col > 0, 'ALTER TABLE `section` DROP COLUMN `subject_offered_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 10. Drop schedule column (skip if already removed) ──────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'schedule');
SET @sql = IF(@col > 0, 'ALTER TABLE `section` DROP COLUMN `schedule`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 11. Drop room column (skip if already removed) ──────────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'section' AND COLUMN_NAME = 'room');
SET @sql = IF(@col > 0, 'ALTER TABLE `section` DROP COLUMN `room`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ================================================================
-- Done! Final section table should have:
--   section_id, section_name, enrollment_code, max_students,
--   status, created_at, updated_at
-- And section_subject table links sections to multiple subjects.
-- ================================================================
