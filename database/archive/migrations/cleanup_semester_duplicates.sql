-- ============================================================
-- Cleanup: Remove duplicate semester rows
-- Date: 2026-02-26
-- Why: Migrations were run multiple times, inserting duplicates
--      because the semester table had no UNIQUE constraint.
--
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- Step 2 will throw an error if the index already exists — safe to ignore.
-- ============================================================

-- Step 1: Keep one row per (academic_year, sem_type_id)
--         Prefers the 'active' row; falls back to smallest ID
DELETE FROM `semester`
WHERE `semester_id` NOT IN (
    SELECT `keep_id` FROM (
        SELECT COALESCE(
            MIN(CASE WHEN `status` = 'active' THEN `semester_id` END),
            MIN(`semester_id`)
        ) AS `keep_id`
        FROM `semester`
        GROUP BY `academic_year`, `sem_type_id`
    ) AS `_keep`
);

-- Step 2: Add unique constraint to prevent future duplicates
--         (Skip / ignore error if the index already exists)
ALTER TABLE `semester`
    ADD UNIQUE INDEX `uq_semester_ay_type` (`academic_year`, `sem_type_id`);

-- Verify: should show one row per (academic_year, sem_type)
SELECT s.semester_id, s.semester_name, s.academic_year, s.status, st.sem_level
FROM semester s
LEFT JOIN sem_type st ON st.sem_type_id = s.sem_type_id
ORDER BY s.academic_year DESC, st.sem_level;
