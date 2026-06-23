-- ============================================================
-- Seed: Test Accounts for All Roles
-- Date: 2026-02-26
-- Password for ALL accounts: password123
-- Hash: $2y$10$WA71CcQreDR5DH4mwavFnuQefCWE07ot5xG1e34MaZhpyfWk8jZiW
--
-- Run AFTER the main cit_lms.sql seed.
-- Safe to re-run (uses ON DUPLICATE KEY UPDATE).
-- ============================================================

-- ── Admin ──────────────────────────────────────────────────
INSERT INTO users (users_id, first_name, last_name, email, password, role, employee_id, status, created_at)
VALUES (1, 'System', 'Administrator', 'admin@cit-lms.edu.ph',
        '$2y$10$WA71CcQreDR5DH4mwavFnuQefCWE07ot5xG1e34MaZhpyfWk8jZiW',
        'admin', 'ADMIN-001', 'active', NOW())
ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), role = 'admin', employee_id = 'ADMIN-001', status = 'active';

-- ── Dean ───────────────────────────────────────────────────
INSERT INTO users (first_name, last_name, email, password, role, employee_id, department_id, status, created_at)
SELECT 'College', 'Dean', 'dean@cit-lms.edu.ph',
       '$2y$10$WA71CcQreDR5DH4mwavFnuQefCWE07ot5xG1e34MaZhpyfWk8jZiW',
       'dean', 'EMP-2024-000',
       (SELECT department_id FROM department ORDER BY department_id LIMIT 1),
       'active', NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'dean@cit-lms.edu.ph');

-- ── Instructor ─────────────────────────────────────────────
INSERT INTO users (first_name, last_name, email, password, role, employee_id, department_id, status, created_at)
SELECT 'Juan', 'Dela Cruz', 'juan.delacruz@cit-lms.edu.ph',
       '$2y$10$WA71CcQreDR5DH4mwavFnuQefCWE07ot5xG1e34MaZhpyfWk8jZiW',
       'instructor', 'EMP-2024-001',
       (SELECT department_id FROM department ORDER BY department_id LIMIT 1),
       'active', NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'juan.delacruz@cit-lms.edu.ph');

-- ── Student ────────────────────────────────────────────────
INSERT INTO users (first_name, last_name, email, password, role, student_id, program_id, year_level, status, created_at)
SELECT 'Maria', 'Santos', 'maria.santos@student.cit-lms.edu.ph',
       '$2y$10$WA71CcQreDR5DH4mwavFnuQefCWE07ot5xG1e34MaZhpyfWk8jZiW',
       'student', '2024-00001',
       (SELECT program_id FROM program WHERE status = 'active' ORDER BY program_id LIMIT 1),
       1, 'active', NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'maria.santos@student.cit-lms.edu.ph');

-- ── Verify ─────────────────────────────────────────────────
SELECT users_id, CONCAT(first_name, ' ', last_name) AS name, email, role, status
FROM users
WHERE email IN (
    'admin@cit-lms.edu.ph',
    'dean@cit-lms.edu.ph',
    'juan.delacruz@cit-lms.edu.ph',
    'maria.santos@student.cit-lms.edu.ph'
)
ORDER BY FIELD(role, 'admin', 'dean', 'instructor', 'student');
