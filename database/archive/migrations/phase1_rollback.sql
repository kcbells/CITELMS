-- ============================================================
-- PHASE 1 ROLLBACK: Remove Quiz System Improvements
-- ============================================================
-- This script safely removes all Phase 1 changes
-- Run this if you need to rollback the migration
-- ============================================================

-- Select the database
USE cit_lms;

-- Start transaction for safety
START TRANSACTION;

-- Drop triggers first (they depend on tables)
DROP TRIGGER IF EXISTS `trg_auto_grade_answer`;
DROP TRIGGER IF EXISTS `trg_after_question_delete`;
DROP TRIGGER IF EXISTS `trg_after_question_insert`;

-- Drop stored procedures
DROP PROCEDURE IF EXISTS `sp_grade_quiz_attempt`;
DROP PROCEDURE IF EXISTS `sp_calculate_quiz_points`;

-- Drop views
DROP VIEW IF EXISTS `vw_student_quiz_performance`;
DROP VIEW IF EXISTS `vw_question_difficulty_analysis`;
DROP VIEW IF EXISTS `vw_quiz_summary`;

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS `student_quiz_answers`;
DROP TABLE IF EXISTS `question_option`;
DROP TABLE IF EXISTS `quiz_questions`;

-- Remove added columns from quiz table
ALTER TABLE `quiz`
DROP COLUMN IF EXISTS `question_count`,
DROP COLUMN IF EXISTS `allow_review`,
DROP COLUMN IF EXISTS `show_correct_answers`,
DROP COLUMN IF EXISTS `shuffle_options`,
DROP COLUMN IF EXISTS `shuffle_questions`,
DROP COLUMN IF EXISTS `passing_score`;

-- Commit the rollback
COMMIT;

SELECT 'Phase 1 migration has been rolled back successfully!' as Status;
