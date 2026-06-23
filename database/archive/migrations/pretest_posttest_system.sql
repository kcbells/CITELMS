-- ============================================================
-- PRE-TEST/POST-TEST SYSTEM MIGRATION
-- ============================================================
-- This migration adds the infrastructure for pre-test → lessons → post-test workflow
--
-- Features:
-- 1. Link pre-test and post-test quizzes together
-- 2. Track lesson progression and completion
-- 3. Enforce workflow: must pass pre-test OR complete lessons before post-test
-- 4. Compare pre-test vs post-test results
-- ============================================================

USE cit_lms;

START TRANSACTION;

-- ============================================================
-- STEP 1: Add post_test_id to quiz table (link pre-test to post-test)
-- ============================================================

ALTER TABLE quiz
ADD COLUMN IF NOT EXISTS `linked_quiz_id` INT(11) NULL COMMENT 'Links pre-test to its post-test (or vice versa)' AFTER quiz_type,
ADD COLUMN IF NOT EXISTS `require_lessons` TINYINT(1) DEFAULT 0 COMMENT 'If 1, student must complete lessons before taking this quiz' AFTER linked_quiz_id;

-- Add foreign key for linked quiz
ALTER TABLE quiz
ADD CONSTRAINT IF NOT EXISTS `fk_quiz_linked`
    FOREIGN KEY (`linked_quiz_id`)
    REFERENCES quiz(`quiz_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- ============================================================
-- STEP 2: Create lesson_progress table
-- ============================================================

CREATE TABLE IF NOT EXISTS `lesson_progress` (
    `progress_id` INT(11) NOT NULL AUTO_INCREMENT,
    `user_student_id` INT(11) NOT NULL,
    `lesson_id` INT(11) NOT NULL,
    `subject_offered_id` INT(11) NOT NULL,
    `completion_percentage` DECIMAL(5,2) DEFAULT 0.00,
    `time_spent_seconds` INT(11) DEFAULT 0,
    `is_completed` TINYINT(1) DEFAULT 0,
    `first_accessed` TIMESTAMP NULL,
    `last_accessed` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `completed_at` TIMESTAMP NULL,
    PRIMARY KEY (`progress_id`),
    UNIQUE KEY `unique_student_lesson` (`user_student_id`, `lesson_id`),
    KEY `idx_student` (`user_student_id`),
    KEY `idx_lesson` (`lesson_id`),
    KEY `idx_subject_offered` (`subject_offered_id`),
    KEY `idx_completed` (`is_completed`),
    CONSTRAINT `fk_lesson_progress_student`
        FOREIGN KEY (`user_student_id`)
        REFERENCES users(`users_id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT `fk_lesson_progress_lesson`
        FOREIGN KEY (`lesson_id`)
        REFERENCES lessons(`lesson_id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT `fk_lesson_progress_subject_offered`
        FOREIGN KEY (`subject_offered_id`)
        REFERENCES subject_offered(`subject_offered_id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Track student progress through lessons';

-- ============================================================
-- STEP 3: Create quiz_access_requirements table (track what students need before taking quiz)
-- ============================================================

CREATE TABLE IF NOT EXISTS `quiz_access_log` (
    `log_id` INT(11) NOT NULL AUTO_INCREMENT,
    `user_student_id` INT(11) NOT NULL,
    `quiz_id` INT(11) NOT NULL,
    `access_attempt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `was_granted` TINYINT(1) DEFAULT 0,
    `denial_reason` VARCHAR(255) NULL COMMENT 'Why access was denied',
    `pre_test_score` DECIMAL(5,2) NULL COMMENT 'Score from pre-test if applicable',
    `lessons_completed` INT(11) DEFAULT 0 COMMENT 'Number of lessons completed',
    PRIMARY KEY (`log_id`),
    KEY `idx_student_quiz` (`user_student_id`, `quiz_id`),
    CONSTRAINT `fk_access_log_student`
        FOREIGN KEY (`user_student_id`)
        REFERENCES users(`users_id`)
        ON DELETE CASCADE,
    CONSTRAINT `fk_access_log_quiz`
        FOREIGN KEY (`quiz_id`)
        REFERENCES quiz(`quiz_id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log when students try to access quizzes and whether they were allowed';

-- ============================================================
-- STEP 4: Create view for pre-test/post-test comparison
-- ============================================================

CREATE OR REPLACE VIEW `vw_pretest_posttest_comparison` AS
SELECT
    pre.user_student_id,
    u.first_name,
    u.last_name,
    u.student_id,
    pre.quiz_id as pretest_quiz_id,
    q_pre.quiz_title as pretest_title,
    q_pre.subject_id,
    s.subject_code,
    s.subject_name,
    pre.attempt_id as pretest_attempt_id,
    pre.percentage as pretest_percentage,
    pre.passed as pretest_passed,
    pre.completed_at as pretest_date,
    post.attempt_id as posttest_attempt_id,
    post.percentage as posttest_percentage,
    post.passed as posttest_passed,
    post.completed_at as posttest_date,
    (post.percentage - pre.percentage) as improvement,
    CASE
        WHEN post.percentage IS NULL THEN 'Not Taken'
        WHEN post.percentage > pre.percentage THEN 'Improved'
        WHEN post.percentage = pre.percentage THEN 'No Change'
        ELSE 'Declined'
    END as progress_status
FROM student_quiz_attempts pre
JOIN quiz q_pre ON pre.quiz_id = q_pre.quiz_id
JOIN subject s ON q_pre.subject_id = s.subject_id
JOIN users u ON pre.user_student_id = u.users_id
LEFT JOIN student_quiz_attempts post ON
    post.user_student_id = pre.user_student_id
    AND post.quiz_id = q_pre.linked_quiz_id
    AND post.attempt_number = 1  -- Only compare first attempts
WHERE q_pre.quiz_type = 'pre_test'
AND pre.attempt_number = 1  -- Only first attempt of pre-test
ORDER BY pre.completed_at DESC;

-- ============================================================
-- STEP 5: Create stored procedure to check quiz access
-- ============================================================

DROP PROCEDURE IF EXISTS `sp_check_quiz_access`;

DELIMITER //
CREATE PROCEDURE `sp_check_quiz_access`(
    IN p_user_student_id INT,
    IN p_quiz_id INT,
    OUT p_can_access BOOLEAN,
    OUT p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_quiz_type VARCHAR(50);
    DECLARE v_linked_quiz_id INT;
    DECLARE v_require_lessons BOOLEAN;
    DECLARE v_subject_id INT;
    DECLARE v_pretest_passed BOOLEAN;
    DECLARE v_pretest_taken BOOLEAN;
    DECLARE v_lessons_completed INT;
    DECLARE v_total_lessons INT;

    -- Get quiz info
    SELECT quiz_type, linked_quiz_id, require_lessons, subject_id
    INTO v_quiz_type, v_linked_quiz_id, v_require_lessons, v_subject_id
    FROM quiz
    WHERE quiz_id = p_quiz_id;

    -- Default: access granted
    SET p_can_access = TRUE;
    SET p_reason = 'Access granted';

    -- If it's a POST-TEST, check requirements
    IF v_quiz_type = 'post_test' THEN

        -- Check if pre-test exists and was taken
        IF v_linked_quiz_id IS NOT NULL THEN
            SELECT
                COUNT(*) > 0,
                MAX(passed) = 1
            INTO v_pretest_taken, v_pretest_passed
            FROM student_quiz_attempts
            WHERE user_student_id = p_user_student_id
            AND quiz_id = v_linked_quiz_id
            AND status = 'completed';

            -- If pre-test not taken
            IF NOT v_pretest_taken THEN
                SET p_can_access = FALSE;
                SET p_reason = 'You must take the Pre-Test first';
                -- Log the denial
                INSERT INTO quiz_access_log (user_student_id, quiz_id, was_granted, denial_reason)
                VALUES (p_user_student_id, p_quiz_id, 0, p_reason);
                LEAVE proc_label;
            END IF;

            -- If pre-test was passed, allow post-test (no need for lessons)
            IF v_pretest_passed THEN
                SET p_can_access = TRUE;
                SET p_reason = 'Pre-test passed - access granted';
                -- Log the access
                INSERT INTO quiz_access_log (user_student_id, quiz_id, was_granted, pre_test_score)
                VALUES (p_user_student_id, p_quiz_id, 1,
                    (SELECT percentage FROM student_quiz_attempts
                     WHERE user_student_id = p_user_student_id
                     AND quiz_id = v_linked_quiz_id
                     ORDER BY completed_at DESC LIMIT 1));
                LEAVE proc_label;
            END IF;
        END IF;

        -- If require_lessons is set OR pre-test was failed, check lesson completion
        IF v_require_lessons OR (v_pretest_taken AND NOT v_pretest_passed) THEN
            -- Count total lessons for this subject
            SELECT COUNT(*) INTO v_total_lessons
            FROM lessons
            WHERE subject_id = v_subject_id;

            -- Count completed lessons
            SELECT COUNT(*) INTO v_lessons_completed
            FROM lesson_progress
            WHERE user_student_id = p_user_student_id
            AND is_completed = 1
            AND lesson_id IN (SELECT lesson_id FROM lessons WHERE subject_id = v_subject_id);

            -- Check if all lessons completed
            IF v_lessons_completed < v_total_lessons THEN
                SET p_can_access = FALSE;
                SET p_reason = CONCAT('You must complete all lessons first (', v_lessons_completed, '/', v_total_lessons, ' completed)');
                -- Log the denial
                INSERT INTO quiz_access_log (user_student_id, quiz_id, was_granted, denial_reason, lessons_completed)
                VALUES (p_user_student_id, p_quiz_id, 0, p_reason, v_lessons_completed);
                LEAVE proc_label;
            END IF;
        END IF;
    END IF;

    -- Log successful access
    proc_label: BEGIN END;
    IF p_can_access THEN
        INSERT INTO quiz_access_log (user_student_id, quiz_id, was_granted)
        VALUES (p_user_student_id, p_quiz_id, 1);
    END IF;

END //
DELIMITER ;

-- ============================================================
-- STEP 6: Create function to calculate overall subject progress
-- ============================================================

DROP FUNCTION IF EXISTS `fn_subject_progress_percentage`;

DELIMITER //
CREATE FUNCTION `fn_subject_progress_percentage`(
    p_user_student_id INT,
    p_subject_id INT
) RETURNS DECIMAL(5,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_total_lessons INT;
    DECLARE v_completed_lessons INT;
    DECLARE v_percentage DECIMAL(5,2);

    -- Count total lessons
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons
    WHERE subject_id = p_subject_id;

    -- Count completed lessons
    SELECT COUNT(*) INTO v_completed_lessons
    FROM lesson_progress lp
    JOIN lessons l ON lp.lesson_id = l.lesson_id
    WHERE lp.user_student_id = p_user_student_id
    AND l.subject_id = p_subject_id
    AND lp.is_completed = 1;

    -- Calculate percentage
    IF v_total_lessons > 0 THEN
        SET v_percentage = (v_completed_lessons / v_total_lessons) * 100;
    ELSE
        SET v_percentage = 0;
    END IF;

    RETURN v_percentage;
END //
DELIMITER ;

-- ============================================================
-- Verification Queries
-- ============================================================

-- Check new columns
SELECT
    'Quiz columns added' as Status,
    COUNT(*) as ColumnCount
FROM information_schema.columns
WHERE table_schema = DATABASE()
AND table_name = 'quiz'
AND column_name IN ('linked_quiz_id', 'require_lessons');

-- Check new table
SELECT
    'Tables created' as Status,
    COUNT(*) as TableCount
FROM information_schema.tables
WHERE table_schema = DATABASE()
AND table_name IN ('lesson_progress', 'quiz_access_log');

-- Check view
SELECT
    'Views created' as Status,
    COUNT(*) as ViewCount
FROM information_schema.views
WHERE table_schema = DATABASE()
AND table_name = 'vw_pretest_posttest_comparison';

-- Check stored procedure
SELECT
    'Procedures created' as Status,
    COUNT(*) as ProcCount
FROM information_schema.routines
WHERE routine_schema = DATABASE()
AND routine_name = 'sp_check_quiz_access';

COMMIT;

SELECT '✅ Pre-Test/Post-Test system migration complete!' as Status;

-- ============================================================
-- USAGE EXAMPLES
-- ============================================================
/*

-- 1. Create a linked pre-test and post-test
INSERT INTO quiz (subject_id, user_teacher_id, quiz_title, quiz_type, require_lessons, status)
VALUES (1, 2, 'Introduction to Programming - Pre-Test', 'pre_test', 0, 'published');

SET @pretest_id = LAST_INSERT_ID();

INSERT INTO quiz (subject_id, user_teacher_id, quiz_title, quiz_type, linked_quiz_id, require_lessons, status)
VALUES (1, 2, 'Introduction to Programming - Post-Test', 'post_test', @pretest_id, 1, 'published');

SET @posttest_id = LAST_INSERT_ID();

-- Link them together (bidirectional)
UPDATE quiz SET linked_quiz_id = @posttest_id WHERE quiz_id = @pretest_id;

-- 2. Check if student can access post-test
CALL sp_check_quiz_access(4, @posttest_id, @can_access, @reason);
SELECT @can_access as CanAccess, @reason as Reason;

-- 3. Mark lesson as completed
INSERT INTO lesson_progress (user_student_id, lesson_id, subject_offered_id, completion_percentage, is_completed, completed_at)
VALUES (4, 1, 1, 100.00, 1, NOW())
ON DUPLICATE KEY UPDATE
    completion_percentage = 100.00,
    is_completed = 1,
    completed_at = NOW();

-- 4. View pre-test vs post-test comparison
SELECT * FROM vw_pretest_posttest_comparison WHERE user_student_id = 4;

-- 5. Get subject progress
SELECT fn_subject_progress_percentage(4, 1) as progress_percentage;

*/
