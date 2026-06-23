-- Migration: Remove department_id from subject table
-- Reason: department_id is redundant since it can be resolved via program → department_program → department
-- Date: 2026-02-10

-- Step 1: Verify department_program junction table has all the data we need
-- (This should already be populated from the add_department_program_table migration)
INSERT IGNORE INTO department_program (department_id, program_id)
SELECT DISTINCT s.department_id, s.program_id
FROM subject s
WHERE s.department_id IS NOT NULL
  AND s.program_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM department_program dp
    WHERE dp.department_id = s.department_id AND dp.program_id = s.program_id
  );

-- Step 2: Drop the foreign key constraint if it exists (ignore error if not exists)
-- Note: Run these one at a time in phpMyAdmin. If a constraint doesn't exist, skip it.
-- ALTER TABLE subject DROP FOREIGN KEY fk_subject_department;
-- ALTER TABLE subject DROP INDEX idx_subject_department;

-- Step 3: Drop the department_id column
ALTER TABLE subject DROP COLUMN department_id;
