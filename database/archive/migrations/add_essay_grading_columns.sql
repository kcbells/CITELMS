-- Add essay/subjective grading support columns
-- Run in phpMyAdmin on cit_lms database

-- Add grading columns to student_quiz_answers
ALTER TABLE student_quiz_answers
  ADD COLUMN grading_status ENUM('auto_graded','pending','graded') DEFAULT 'auto_graded' AFTER points_earned,
  ADD COLUMN grader_feedback TEXT NULL AFTER grading_status,
  ADD COLUMN graded_by INT NULL AFTER grader_feedback,
  ADD COLUMN graded_at TIMESTAMP NULL AFTER graded_by;

-- Add pending grading flag to student_quiz_attempts
ALTER TABLE student_quiz_attempts
  ADD COLUMN has_pending_grades TINYINT(1) DEFAULT 0 AFTER status;
