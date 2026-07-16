-- ============================================================
-- Migration 009: Fix departments and programs to match
--                COC official college/program structure
--
-- 6 Colleges:
--   1. CIT  - College of Information Technology
--   2. CEA  - College of Engineering and Architecture
--   3. COE  - College of Education
--   4. CAHS - College of Allied Health Sciences
--   5. CMA  - College of Management and Accountancy
--   6. SCCJ - School of Criminology and Criminal Justice
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix active departments (rename/clean up codes)
-- ─────────────────────────────────────────────────────────────

-- CIT (dept 1) — already correct
UPDATE department SET department_code = 'CIT', status = 'active'
WHERE department_id = 1;

-- CEA (dept 2) — already correct
UPDATE department SET department_code = 'CEA', status = 'active'
WHERE department_id = 2;

-- COE (dept 4) — fix code from CED → COE
UPDATE department
SET department_name = 'College of Education',
    department_code = 'COE',
    status = 'active'
WHERE department_id = 4;

-- CMA (dept 5) — already correct
UPDATE department SET department_code = 'CMA', status = 'active'
WHERE department_id = 5;

-- CAHS (dept 10) — already correct
UPDATE department
SET department_name = 'College of Allied Health Sciences',
    department_code = 'CAHS',
    status = 'active'
WHERE department_id = 10;

-- SCCJ (dept 11) — already correct
UPDATE department
SET department_name = 'School of Criminology and Criminal Justice',
    department_code = 'SCCJ',
    status = 'active'
WHERE department_id = 11;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Deactivate obsolete / duplicate departments
-- ─────────────────────────────────────────────────────────────

-- dept 3 (College of Criminal Justice) — replaced by SCCJ (11)
UPDATE department SET status = 'inactive' WHERE department_id = 3;

-- dept 6 (College of Nursing) — merged into CAHS (10)
UPDATE department SET status = 'inactive' WHERE department_id = 6;

-- dept 7 (College of Arts and Sciences) — merged into CAHS (10)
UPDATE department SET status = 'inactive' WHERE department_id = 7;

-- dept 8 (PHAR) — merged into CAHS (10)
UPDATE department SET status = 'inactive' WHERE department_id = 8;

-- dept 9 (College of Maritime) — not in school structure
UPDATE department SET status = 'inactive' WHERE department_id = 9;

-- dept 12 (College of Education duplicate) — merged into COE (4)
UPDATE department SET status = 'inactive' WHERE department_id = 12;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Fix program names, codes, and primary department_id
-- ─────────────────────────────────────────────────────────────

-- BSIT (1) — correct, just confirm CIT
UPDATE program SET department_id = 1, status = 'active'
WHERE program_id = 1;

-- BSCS (2) — not in structure, deactivate
UPDATE program SET status = 'inactive' WHERE program_id = 2;

-- CEA programs (3-7) — already correct
UPDATE program SET department_id = 2, status = 'active'
WHERE program_id IN (3, 4, 5, 6, 7);

-- BSCrim (8) — move primary dept to SCCJ
UPDATE program SET department_id = 11, status = 'active'
WHERE program_id = 8;

-- BEEd (9) — Bachelor of Elementary Education under COE
UPDATE program
SET department_id = 4,
    program_name = 'Bachelor of Elementary Education',
    program_code = 'BEEd',
    status = 'active'
WHERE program_id = 9;

-- BSEd (10) — rename to BSEd Major in English
UPDATE program
SET department_id = 4,
    program_name = 'Bachelor of Secondary Education Major in English',
    program_code = 'BSEdEng',
    status = 'active'
WHERE program_id = 10;

-- CMA programs: BSA, BSBA, BSMA, BSHM, BSTM
UPDATE program SET department_id = 5, status = 'active'
WHERE program_id IN (11, 12, 13, 14, 15);

-- BSBA (12) — rename to BSBA Major in Financial Management
UPDATE program
SET program_name = 'Bachelor of Science in Business Administration Major in Financial Management',
    program_code = 'BSBA-FM'
WHERE program_id = 12;

-- BSN (16) — move to CAHS
UPDATE program SET department_id = 10, status = 'active'
WHERE program_id = 16;

-- BSPsych (17) — move to CAHS
UPDATE program SET department_id = 10, status = 'active'
WHERE program_id = 17;

-- BSPHARMA (18) — bad record (typo name), deactivate
UPDATE program SET status = 'inactive' WHERE program_id = 18;

-- try (19) — junk, deactivate
UPDATE program SET status = 'inactive' WHERE program_id = 19;

-- BSP (20) — rename to BS Pharmacy, keep under CAHS
UPDATE program
SET department_id = 10,
    program_name = 'Bachelor of Science in Pharmacy',
    program_code = 'BSPharm',
    status = 'active'
WHERE program_id = 20;

-- BSMT (21) — rename to BS Medical Technology, keep under CAHS
UPDATE program
SET department_id = 10,
    program_name = 'Bachelor of Science in Medical Technology',
    program_code = 'BSMT',
    status = 'active'
WHERE program_id = 21;

-- BSAR (22) — duplicate of BSArch (7), deactivate
UPDATE program SET status = 'inactive' WHERE program_id = 22;

-- BSECE (23) — rename to BECEd, move to COE
UPDATE program
SET department_id = 4,
    program_name = 'Bachelor in Early Childhood Education',
    program_code = 'BECEd',
    status = 'active'
WHERE program_id = 23;

-- ─────────────────────────────────────────────────────────────
-- STEP 4: Add missing programs
-- ─────────────────────────────────────────────────────────────

-- BSEd Major in Filipino (COE)
INSERT IGNORE INTO program (department_id, program_name, program_code, degree_level, duration_years, status)
VALUES (4, 'Bachelor of Secondary Education Major in Filipino', 'BSEdFil', 'bachelor', 4, 'active');

-- BSEd Major in Math (COE)
INSERT IGNORE INTO program (department_id, program_name, program_code, degree_level, duration_years, status)
VALUES (4, 'Bachelor of Secondary Education Major in Math', 'BSEdMath', 'bachelor', 4, 'active');

-- BSBA Major in Marketing Management (CMA)
INSERT IGNORE INTO program (department_id, program_name, program_code, degree_level, duration_years, status)
VALUES (5, 'Bachelor of Science in Business Administration Major in Marketing Management', 'BSBA-MM', 'bachelor', 4, 'active');

-- ─────────────────────────────────────────────────────────────
-- STEP 5: Rebuild department_program table (clean slate)
-- ─────────────────────────────────────────────────────────────

DELETE FROM department_program;

-- CIT (1): BSIT
INSERT INTO department_program (department_id, program_id) VALUES (1, 1);

-- CEA (2): BSArch, BSCE, BSCpE, BSEE, BSME
INSERT INTO department_program (department_id, program_id) VALUES
    (2, 3), (2, 4), (2, 5), (2, 6), (2, 7);

-- COE (4): BECEd, BEEd, BSEdEng, BSEdFil, BSEdMath
INSERT INTO department_program (department_id, program_id)
SELECT 4, program_id FROM program
WHERE program_code IN ('BECEd','BEEd','BSEdEng','BSEdFil','BSEdMath');

-- CAHS (10): BSMT, BSN, BSPharm, BSPsych
INSERT INTO department_program (department_id, program_id) VALUES
    (10, 16), (10, 17), (10, 20), (10, 21);

-- CMA (5): BSA, BSBA-FM, BSBA-MM, BSHM, BSMA, BSTM
INSERT INTO department_program (department_id, program_id)
SELECT 5, program_id FROM program
WHERE program_code IN ('BSA','BSBA-FM','BSBA-MM','BSHM','BSMA','BSTM');

-- SCCJ (11): BSCrim
INSERT INTO department_program (department_id, program_id) VALUES (11, 8);

SET FOREIGN_KEY_CHECKS = 1;

-- ─────────────────────────────────────────────────────────────
-- VERIFY
-- ─────────────────────────────────────────────────────────────
SELECT d.department_code, d.department_name, p.program_code, p.program_name, p.status AS prog_status
FROM department d
JOIN department_program dp ON dp.department_id = d.department_id
JOIN program p ON p.program_id = dp.program_id
WHERE d.status = 'active'
ORDER BY d.department_code, p.program_code;
