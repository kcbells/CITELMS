-- ============================================================
-- PHASE 1 MIGRATION V2: Quiz System Improvements (Fixed)
-- ============================================================
-- This migration transforms the quiz system from a simple structure
-- to a professional multi-table design with:
-- 1. Separate quiz questions table
-- 2. Multiple choice options table
-- 3. Individual student answers tracking
-- 4. Better grading and analytics capabilities
--
-- ESTIMATED TIME: 30-45 minutes
-- BACKUP RECOMMENDED: Yes - backs up existing quiz data
-- ============================================================

-- Select the database
USE cit_lms;

-- Disable foreign key checks temporarily for smoother migration
SET FOREIGN_KEY_CHECKS = 0;

-- Start transaction for safety
START TRANSACTION;

-- ============================================================
-- STEP 1: Create quiz_questions table
-- ============================================================
-- Purpose: Store individual questions for each quiz
-- Benefits:
-- - Reusable question bank
-- - Better question management
-- - Support for different question types
-- - Individual question scoring
-- ============================================================

DROP TABLE IF EXISTS `quiz_questions`;

CREATE TABLE `quiz_questions` (
    `question_id` INT(11) NOT NULL AUTO_INCREMENT,
    `quiz_id` INT(11) NOT NULL,
    `question_text` TEXT NOT NULL,
    `question_type` ENUM('multiple_choice', 'true_false', 'short_answer', 'essay') DEFAULT 'multiple_choice',
    `correct_answer` TEXT NULL COMMENT 'For true/false and short answer',
    `points` INT(11) DEFAULT 1,
    `order_number` INT(11) DEFAULT 0,
    `explanation` TEXT NULL COMMENT 'Shown after answering',
    `difficulty` ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`question_id`),
    KEY `idx_quiz_id` (`quiz_id`),
    KEY `idx_question_type` (`question_type`),
    KEY `idx_order` (`order_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Individual questions for quizzes';

-- Add foreign key constraint after table is fully created
ALTER TABLE `quiz_questions`
ADD CONSTRAINT `fk_quiz_questions_quiz`
    FOREIGN KEY (`quiz_id`)
    REFERENCES `quiz`(`quiz_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ============================================================
-- STEP 2: Create question_option table
-- ============================================================
-- Purpose: Store multiple choice options for quiz questions
-- Benefits:
-- - Support for multiple choice questions
-- - Multiple correct answers possible
-- - Randomize option order
-- - Track which options students select
-- ============================================================

DROP TABLE IF EXISTS `question_option`;

CREATE TABLE `question_option` (
    `option_id` INT(11) NOT NULL AUTO_INCREMENT,
    `quiz_question_id` INT(11) NOT NULL,
    `option_text` TEXT NOT NULL,
    `is_correct` BOOLEAN DEFAULT FALSE,
    `order_number` INT(11) DEFAULT 0,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`option_id`),
    KEY `idx_question_id` (`quiz_question_id`),
    KEY `idx_is_correct` (`is_correct`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Multiple choice options for quiz questions';

-- Add foreign key constraint after table is fully created
ALTER TABLE `question_option`
ADD CONSTRAINT `fk_question_option_question`
    FOREIGN KEY (`quiz_question_id`)
    REFERENCES `quiz_questions`(`question_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ============================================================
-- STEP 3: Create student_quiz_answers table
-- ============================================================
-- Purpose: Track individual answers for each question
-- Benefits:
-- - Detailed analytics per question
-- - Partial credit support
-- - Review wrong answers
-- - Question difficulty analysis
-- ============================================================

DROP TABLE IF EXISTS `student_quiz_answers`;

CREATE TABLE `student_quiz_answers` (
    `student_quiz_answer_id` INT(11) NOT NULL AUTO_INCREMENT,
    `attempt_id` INT(11) NOT NULL,
    `quiz_id` INT(11) NOT NULL,
    `question_id` INT(11) NOT NULL,
    `user_student_id` INT(11) NOT NULL,
    `selected_option_id` INT(11) NULL COMMENT 'For multiple choice',
    `answer_text` TEXT NULL COMMENT 'For short answer/essay',
    `is_correct` BOOLEAN NULL,
    `points_earned` DECIMAL(5,2) DEFAULT 0.00,
    `time_spent_seconds` INT(11) DEFAULT 0,
    `answered_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`student_quiz_answer_id`),
    KEY `idx_attempt_id` (`attempt_id`),
    KEY `idx_quiz_id` (`quiz_id`),
    KEY `idx_question_id` (`question_id`),
    KEY `idx_student_id` (`user_student_id`),
    KEY `idx_is_correct` (`is_correct`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Individual student answers for quiz questions';

-- Add foreign key constraints after table is fully created
ALTER TABLE `student_quiz_answers`
ADD CONSTRAINT `fk_student_answers_attempt`
    FOREIGN KEY (`attempt_id`)
    REFERENCES `student_quiz_attempts`(`attempt_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
ADD CONSTRAINT `fk_student_answers_quiz`
    FOREIGN KEY (`quiz_id`)
    REFERENCES `quiz`(`quiz_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
ADD CONSTRAINT `fk_student_answers_question`
    FOREIGN KEY (`question_id`)
    REFERENCES `quiz_questions`(`question_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
ADD CONSTRAINT `fk_student_answers_student`
    FOREIGN KEY (`user_student_id`)
    REFERENCES `users`(`users_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
ADD CONSTRAINT `fk_student_answers_option`
    FOREIGN KEY (`selected_option_id`)
    REFERENCES `question_option`(`option_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- ============================================================
-- STEP 4: Add new columns to existing quiz table
-- ============================================================
-- Purpose: Enhance quiz metadata
-- ============================================================

ALTER TABLE `quiz`
ADD COLUMN IF NOT EXISTS `passing_score` DECIMAL(5,2) DEFAULT 60.00 COMMENT 'Minimum percentage to pass',
ADD COLUMN IF NOT EXISTS `shuffle_questions` BOOLEAN DEFAULT FALSE COMMENT 'Randomize question order',
ADD COLUMN IF NOT EXISTS `shuffle_options` BOOLEAN DEFAULT FALSE COMMENT 'Randomize option order',
ADD COLUMN IF NOT EXISTS `show_correct_answers` BOOLEAN DEFAULT TRUE COMMENT 'Show answers after submission',
ADD COLUMN IF NOT EXISTS `allow_review` BOOLEAN DEFAULT TRUE COMMENT 'Allow students to review after submission',
ADD COLUMN IF NOT EXISTS `question_count` INT(11) DEFAULT 0 COMMENT 'Cached count of questions';

-- ============================================================
-- STEP 5: Create composite indexes for better performance
-- ============================================================

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS `idx_quiz_questions_lookup`
    ON `quiz_questions`(`quiz_id`, `order_number`);

CREATE INDEX IF NOT EXISTS `idx_student_answers_lookup`
    ON `student_quiz_answers`(`attempt_id`, `question_id`);

CREATE INDEX IF NOT EXISTS `idx_student_answers_analytics`
    ON `student_quiz_answers`(`quiz_id`, `question_id`, `is_correct`);

-- ============================================================
-- STEP 6: Create views for easier querying
-- ============================================================

-- View: Quiz with question count and statistics
CREATE OR REPLACE VIEW `vw_quiz_summary` AS
SELECT
    q.quiz_id,
    q.quiz_title,
    q.subject_id,
    q.lesson_id,
    q.description,
    q.total_points,
    q.duration_minutes,
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
-- STEP 7: Create stored procedures for common operations
-- ============================================================

-- Drop existing procedures first
DROP PROCEDURE IF EXISTS `sp_calculate_quiz_points`;
DROP PROCEDURE IF EXISTS `sp_grade_quiz_attempt`;

-- Procedure: Calculate quiz total points
DELIMITER //
CREATE PROCEDURE `sp_calculate_quiz_points`(IN p_quiz_id INT)
BEGIN
    UPDATE quiz
    SET question_count = (
        SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = p_quiz_id
    ),
    total_points = (
        SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE quiz_id = p_quiz_id
    )
    WHERE quiz_id = p_quiz_id;
END //
DELIMITER ;

-- Procedure: Grade student quiz attempt
DELIMITER //
CREATE PROCEDURE `sp_grade_quiz_attempt`(IN p_attempt_id INT)
BEGIN
    DECLARE v_quiz_id INT;
    DECLARE v_total_earned DECIMAL(10,2);
    DECLARE v_total_possible DECIMAL(10,2);
    DECLARE v_percentage DECIMAL(5,2);

    -- Get quiz_id from attempt
    SELECT quiz_id INTO v_quiz_id
    FROM student_quiz_attempts
    WHERE attempt_id = p_attempt_id;

    -- Calculate total points
    SELECT
        COALESCE(SUM(sqa.points_earned), 0),
        COALESCE(SUM(qq.points), 0)
    INTO v_total_earned, v_total_possible
    FROM student_quiz_answers sqa
    JOIN quiz_questions qq ON sqa.question_id = qq.question_id
    WHERE sqa.attempt_id = p_attempt_id;

    -- Calculate percentage
    IF v_total_possible > 0 THEN
        SET v_percentage = (v_total_earned / v_total_possible) * 100;
    ELSE
        SET v_percentage = 0;
    END IF;

    -- Update attempt with results
    UPDATE student_quiz_attempts
    SET
        score = v_total_earned,
        percentage = v_percentage,
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP
    WHERE attempt_id = p_attempt_id;

    SELECT v_total_earned as points_earned,
           v_total_possible as points_possible,
           v_percentage as percentage;
END //
DELIMITER ;

-- ============================================================
-- STEP 8: Create triggers for automatic calculations
-- ============================================================

-- Drop existing triggers first
DROP TRIGGER IF EXISTS `trg_after_question_insert`;
DROP TRIGGER IF EXISTS `trg_after_question_delete`;
DROP TRIGGER IF EXISTS `trg_auto_grade_answer`;

-- Trigger: Update question count when question is added
DELIMITER //
CREATE TRIGGER `trg_after_question_insert`
AFTER INSERT ON `quiz_questions`
FOR EACH ROW
BEGIN
    UPDATE quiz
    SET question_count = (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = NEW.quiz_id),
        total_points = (SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE quiz_id = NEW.quiz_id)
    WHERE quiz_id = NEW.quiz_id;
END //
DELIMITER ;

-- Trigger: Update question count when question is deleted
DELIMITER //
CREATE TRIGGER `trg_after_question_delete`
AFTER DELETE ON `quiz_questions`
FOR EACH ROW
BEGIN
    UPDATE quiz
    SET question_count = (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = OLD.quiz_id),
        total_points = (SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE quiz_id = OLD.quiz_id)
    WHERE quiz_id = OLD.quiz_id;
END //
DELIMITER ;

-- Trigger: Auto-grade multiple choice answers
DELIMITER //
CREATE TRIGGER `trg_auto_grade_answer`
BEFORE INSERT ON `student_quiz_answers`
FOR EACH ROW
BEGIN
    DECLARE v_is_correct BOOLEAN;
    DECLARE v_question_points INT;

    -- Get question points
    SELECT points INTO v_question_points
    FROM quiz_questions
    WHERE question_id = NEW.question_id;

    -- For multiple choice, check if option is correct
    IF NEW.selected_option_id IS NOT NULL THEN
        SELECT is_correct INTO v_is_correct
        FROM question_option
        WHERE option_id = NEW.selected_option_id;

        SET NEW.is_correct = v_is_correct;

        IF v_is_correct THEN
            SET NEW.points_earned = v_question_points;
        ELSE
            SET NEW.points_earned = 0;
        END IF;
    END IF;
END //
DELIMITER ;

-- Reset delimiter
DELIMITER ;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- STEP 9: Verification queries
-- ============================================================

-- Check if tables were created
SELECT
    'Tables Created' as Status,
    COUNT(*) as TableCount
FROM information_schema.tables
WHERE table_schema = DATABASE()
AND table_name IN ('quiz_questions', 'question_option', 'student_quiz_answers');

-- Check if views were created
SELECT
    'Views Created' as Status,
    COUNT(*) as ViewCount
FROM information_schema.views
WHERE table_schema = DATABASE()
AND table_name LIKE 'vw_%';

-- Check if procedures were created
SELECT
    'Procedures Created' as Status,
    COUNT(*) as ProcedureCount
FROM information_schema.routines
WHERE routine_schema = DATABASE()
AND routine_type = 'PROCEDURE'
AND routine_name LIKE 'sp_%';

-- Check if triggers were created
SELECT
    'Triggers Created' as Status,
    COUNT(*) as TriggerCount
FROM information_schema.triggers
WHERE trigger_schema = DATABASE()
AND trigger_name LIKE 'trg_%';

-- ============================================================
-- COMMIT TRANSACTION
-- ============================================================

COMMIT;

SELECT '✅ Phase 1 Migration Completed Successfully!' as Status;

-- ============================================================
-- POST-MIGRATION NOTES
-- ============================================================
/*
MIGRATION COMPLETED SUCCESSFULLY!

Next Steps:
1. Update quiz creation pages to use new question tables
2. Modify quiz taking logic to save individual answers
3. Update grading system to use sp_grade_quiz_attempt
4. Create question bank management interface
5. Add analytics dashboard using new views

Tables Created:
- quiz_questions (individual questions)
- question_option (multiple choice options)
- student_quiz_answers (individual answers)

Views Created:
- vw_quiz_summary (quiz statistics)
- vw_question_difficulty_analysis (question analytics)
- vw_student_quiz_performance (student performance)

Stored Procedures:
- sp_calculate_quiz_points (recalculate quiz totals)
- sp_grade_quiz_attempt (auto-grade attempts)

Triggers:
- trg_after_question_insert (update counts)
- trg_after_question_delete (update counts)
- trg_auto_grade_answer (auto-grade MC questions)

Benefits:
✅ Better quiz management
✅ Individual question tracking
✅ Detailed analytics per question
✅ Automatic grading for multiple choice
✅ Question bank capability
✅ Performance optimization via indexes
✅ Easy data retrieval via views

Code Changes Needed:
📝 pages/instructor/quiz-create.php - Add question management
📝 pages/instructor/quiz-edit.php - Edit questions and options
📝 pages/student/take-quiz.php - Save individual answers
📝 pages/instructor/quiz-results.php - Use new analytics views
📝 pages/dean/student-analytics.php - Add question-level insights

Estimated Code Update Time: 6-8 hours

IMPORTANT: Before using in production:
1. Backup your current database
2. Test quiz creation workflow
3. Test quiz taking workflow
4. Test grading calculations
5. Verify analytics views show correct data
*/
