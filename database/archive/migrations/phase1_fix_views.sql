-- ============================================================
-- PHASE 1 FIX: Correct the views with proper column names
-- ============================================================
-- This fixes the column name issues in the views
-- ============================================================

-- Select the database
USE cit_lms;

-- ============================================================
-- Drop existing views first
-- ============================================================

DROP VIEW IF EXISTS `vw_student_quiz_performance`;
DROP VIEW IF EXISTS `vw_question_difficulty_analysis`;
DROP VIEW IF EXISTS `vw_quiz_summary`;

-- ============================================================
-- Create corrected views
-- ============================================================

-- View: Quiz with question count and statistics
CREATE OR REPLACE VIEW `vw_quiz_summary` AS
SELECT
    q.quiz_id,
    q.quiz_title,
    q.subject_id,
    q.lesson_id,
    q.quiz_description,
    q.total_points,
    q.time_limit,
    q.max_attempts,
    q.passing_score,
    q.status,
    COUNT(DISTINCT qq.question_id) as total_questions,
    SUM(qq.points) as calculated_points,
    COUNT(DISTINCT sqa.attempt_id) as total_attempts,
    AVG(sqa.points_earned) as avg_points_per_question
FROM quiz q
LEFT JOIN quiz_questions qq ON q.quiz_id = qq.quiz_id
LEFT JOIN student_quiz_answers sqa ON q.quiz_id = sqa.quiz_id
GROUP BY q.quiz_id;

-- View: Question difficulty analysis
CREATE OR REPLACE VIEW `vw_question_difficulty_analysis` AS
SELECT
    qq.question_id,
    qq.quiz_id,
    qq.question_text,
    qq.question_type,
    qq.difficulty,
    qq.points,
    COUNT(DISTINCT sqa.student_quiz_answer_id) as times_answered,
    SUM(CASE WHEN sqa.is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
    SUM(CASE WHEN sqa.is_correct = 0 THEN 1 ELSE 0 END) as incorrect_count,
    ROUND(
        (SUM(CASE WHEN sqa.is_correct = 1 THEN 1 ELSE 0 END) /
        NULLIF(COUNT(DISTINCT sqa.student_quiz_answer_id), 0)) * 100, 2
    ) as success_rate_percentage
FROM quiz_questions qq
LEFT JOIN student_quiz_answers sqa ON qq.question_id = sqa.question_id
GROUP BY qq.question_id;

-- View: Student quiz performance detail
CREATE OR REPLACE VIEW `vw_student_quiz_performance` AS
SELECT
    sqa.user_student_id,
    u.first_name,
    u.last_name,
    sqa.quiz_id,
    q.quiz_title,
    sqa.attempt_id,
    COUNT(sqa.question_id) as questions_answered,
    SUM(sqa.points_earned) as total_points_earned,
    SUM(qq.points) as total_possible_points,
    ROUND((SUM(sqa.points_earned) / NULLIF(SUM(qq.points), 0)) * 100, 2) as percentage,
    SUM(CASE WHEN sqa.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers,
    SUM(CASE WHEN sqa.is_correct = 0 THEN 1 ELSE 0 END) as incorrect_answers,
    AVG(sqa.time_spent_seconds) as avg_time_per_question
FROM student_quiz_answers sqa
JOIN users u ON sqa.user_student_id = u.users_id
JOIN quiz q ON sqa.quiz_id = q.quiz_id
JOIN quiz_questions qq ON sqa.question_id = qq.question_id
GROUP BY sqa.user_student_id, sqa.quiz_id, sqa.attempt_id;

-- ============================================================
-- Verification
-- ============================================================

-- Check if views were created
SELECT
    'Views Fixed' as Status,
    COUNT(*) as ViewCount
FROM information_schema.views
WHERE table_schema = DATABASE()
AND table_name IN ('vw_quiz_summary', 'vw_question_difficulty_analysis', 'vw_student_quiz_performance');

SELECT '✅ Views have been fixed successfully!' as Status;
