-- ============================================================
-- Drop unused tables that have no API or UI references
-- Run this in phpMyAdmin on the cit_lms database
-- ============================================================

-- 1. remedial_assignment — schema exists but no API or UI ever uses it
DROP TABLE IF EXISTS `remedial_assignment`;

-- 2. course — created but never referenced in any API or page
DROP TABLE IF EXISTS `course`;

-- 3. lesson_offered — junction table that was superseded by direct subject_id links on lessons
DROP TABLE IF EXISTS `lesson_offered`;

-- 4. student_scores — duplicate of student_quiz_attempts;
--    confirmed: zero API files reference this table (grep verified 2026-04-19).
--    student_quiz_attempts is the single source of truth.
DROP TABLE IF EXISTS `student_scores`;
