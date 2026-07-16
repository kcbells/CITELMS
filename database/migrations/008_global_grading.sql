-- ============================================================
-- Migration 008: Global Grading System
-- Adds grading_type to subject_offered and creates the two
-- tables needed to store per-module and per-period grades
-- for the Effortful-Learning / Mastery model (14 modules).
-- Safe to re-run (IF NOT EXISTS / ALTER IF COLUMN NOT EXISTS).
-- ============================================================

-- 1. Add grading_type to subject_offered
--    raw_score = existing gradebook (quiz/lesson-completion model)
--    global    = 14-module EL/Mastery rubric model
ALTER TABLE `subject_offered`
    ADD COLUMN IF NOT EXISTS `grading_type`
        ENUM('raw_score','global') NOT NULL DEFAULT 'raw_score'
        COMMENT 'Grading model: raw_score (default) or global (EL/Mastery rubric)';

-- 2. Per-module inputs (14 modules × student × offering)
CREATE TABLE IF NOT EXISTS `global_module_grades` (
    `grade_id`               INT          NOT NULL AUTO_INCREMENT,
    `subject_offered_id`     INT          NOT NULL,
    `student_id`             INT          NOT NULL,
    `module_number`          TINYINT      NOT NULL COMMENT '1–14',

    -- Start of Class attendance
    `soc1`                   ENUM('P','A') NULL,
    `soc2`                   ENUM('P','A') NULL,

    -- Effortful Learning rubric scores (0-3)
    `lets_practice`          TINYINT      NULL COMMENT '0-3 rubric',
    `lets_practice_optional` TINYINT      NULL COMMENT '0-3 rubric (optional retry)',
    `reflection`             TINYINT      NULL COMMENT '0-3 rubric',

    -- Mastery: Wrap-Up Quiz as raw percentage (0-100)
    `wrap_up_quiz`           DECIMAL(6,2) NULL COMMENT '0.00–100.00',

    `updated_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`grade_id`),
    UNIQUE KEY `uq_gmg` (`subject_offered_id`, `student_id`, `module_number`),
    KEY `idx_gmg_offering` (`subject_offered_id`),
    KEY `idx_gmg_student`  (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Per-module EL/Mastery grade inputs for the global grading model';

-- 3. Per-period project / final-output grades (P1, P2, Final × student × offering)
CREATE TABLE IF NOT EXISTS `global_project_grades` (
    `proj_id`            INT          NOT NULL AUTO_INCREMENT,
    `subject_offered_id` INT          NOT NULL,
    `student_id`         INT          NOT NULL,
    `period`             ENUM('P1','P2','Final') NOT NULL,

    -- Up to 4 check-in grades and one final output (all 0-100)
    `checkin1`           DECIMAL(6,2) NULL,
    `checkin2`           DECIMAL(6,2) NULL,
    `checkin3`           DECIMAL(6,2) NULL,
    `checkin4`           DECIMAL(6,2) NULL,
    `final_output`       DECIMAL(6,2) NULL,

    `updated_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`proj_id`),
    UNIQUE KEY `uq_gpg` (`subject_offered_id`, `student_id`, `period`),
    KEY `idx_gpg_offering` (`subject_offered_id`),
    KEY `idx_gpg_student`  (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Per-period project/final-output grades for the global grading model';

-- Verify
SELECT CONCAT('global_module_grades rows: ', COUNT(*)) AS result FROM `global_module_grades`;
SELECT CONCAT('global_project_grades rows: ', COUNT(*)) AS result FROM `global_project_grades`;
