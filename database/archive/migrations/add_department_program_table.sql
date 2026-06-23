-- ============================================================
-- Migration: Create department_program lookup/junction table
-- ============================================================
-- Changes one-to-many (program.department_id) to many-to-many
-- via a junction table as per ERD requirements.
--
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- ============================================================

-- 1. Create the department_program junction table
CREATE TABLE IF NOT EXISTS `department_program` (
    `dept_program_id` INT(11) NOT NULL AUTO_INCREMENT,
    `department_id` INT(11) NOT NULL,
    `program_id` INT(11) NOT NULL,
    PRIMARY KEY (`dept_program_id`),
    UNIQUE KEY `uq_dept_program` (`department_id`, `program_id`),
    CONSTRAINT `fk_dp_department` FOREIGN KEY (`department_id`)
        REFERENCES `department` (`department_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_dp_program` FOREIGN KEY (`program_id`)
        REFERENCES `program` (`program_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Migrate existing data from program.department_id into the junction table
INSERT IGNORE INTO `department_program` (`department_id`, `program_id`)
SELECT `department_id`, `program_id`
FROM `program`
WHERE `department_id` IS NOT NULL;

-- 3. Verify migration
SELECT
    dp.dept_program_id,
    d.department_code,
    d.department_name,
    p.program_code,
    p.program_name
FROM department_program dp
JOIN department d ON dp.department_id = d.department_id
JOIN program p ON dp.program_id = p.program_id
ORDER BY d.department_code, p.program_code;
