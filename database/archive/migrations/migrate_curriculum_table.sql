-- ============================================================
-- Migration: Populate curriculum table from subject placement data
-- Date: 2026-02-26 (v3 - semester column already removed from curriculum)
-- ============================================================
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- Safe to re-run — uses INSERT IGNORE.
-- ============================================================

-- ── Step 1: Add semester_id column to curriculum if not already there ────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'curriculum'
      AND COLUMN_NAME = 'semester_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE `curriculum` ADD COLUMN `semester_id` INT(11) NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 2: Add unique constraint on (program_id, course_id) ────────────────
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'curriculum'
      AND INDEX_NAME = 'uq_curriculum_program_course');
SET @sql = IF(@idx = 0,
    'ALTER TABLE `curriculum` ADD UNIQUE INDEX uq_curriculum_program_course (program_id, course_id)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 3: Populate curriculum from all active subjects ────────────────────
INSERT IGNORE INTO curriculum
    (program_id, course_id, course_code, year_level, semester_id, academic_year, status, created_at)
SELECT
    s.program_id,
    s.subject_id,
    s.subject_code,
    s.year_level,
    s.semester,
    '2024-2025',
    'active',
    NOW()
FROM subject s
WHERE s.program_id IS NOT NULL
  AND s.status = 'active';

-- ── Verification: shows rows inserted per program/year/semester ──────────────
SELECT
    p.program_code,
    c.year_level,
    c.semester_id,
    COUNT(*) AS subject_count
FROM curriculum c
JOIN program p ON p.program_id = c.program_id
WHERE c.status = 'active'
GROUP BY p.program_code, c.year_level, c.semester_id
ORDER BY p.program_code, c.year_level, c.semester_id;
