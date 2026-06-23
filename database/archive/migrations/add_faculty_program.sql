-- Migration: Add faculty_program table
-- This table enables direct assignment of instructors to programs
-- Run this SQL in phpMyAdmin or MySQL client

-- Create the faculty_program junction table
CREATE TABLE IF NOT EXISTS `faculty_program` (
    `faculty_program_id` INT(11) NOT NULL AUTO_INCREMENT,
    `user_teacher_id` INT(11) NOT NULL,
    `program_id` INT(11) NOT NULL,
    `role` ENUM('coordinator', 'faculty', 'adjunct') DEFAULT 'faculty' COMMENT 'Role within the program',
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `assigned_by` INT(11) DEFAULT NULL,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`faculty_program_id`),
    UNIQUE KEY `unique_faculty_program` (`user_teacher_id`, `program_id`),
    KEY `idx_faculty_program_teacher` (`user_teacher_id`),
    KEY `idx_faculty_program_program` (`program_id`),
    KEY `idx_faculty_program_status` (`status`),
    CONSTRAINT `fk_faculty_program_teacher` FOREIGN KEY (`user_teacher_id`) REFERENCES `users` (`users_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_faculty_program_program` FOREIGN KEY (`program_id`) REFERENCES `program` (`program_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_faculty_program_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`users_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data: Assign existing instructor (Juan Dela Cruz, id=2) to BSIT and BSCS programs
-- Juan Dela Cruz (id=2) -> BSIT (id=1) and BSCS (id=2)
INSERT INTO `faculty_program` (`user_teacher_id`, `program_id`, `role`, `status`) VALUES
(2, 1, 'faculty', 'active'),
(2, 2, 'faculty', 'active')
ON DUPLICATE KEY UPDATE status = 'active';

-- Useful queries for reference:

-- Get all instructors for a specific program
-- SELECT u.users_id, u.first_name, u.last_name, u.email, fp.role
-- FROM users u
-- JOIN faculty_program fp ON u.users_id = fp.user_teacher_id
-- WHERE fp.program_id = ? AND fp.status = 'active';

-- Get all programs an instructor is assigned to
-- SELECT p.program_id, p.program_code, p.program_name, fp.role
-- FROM program p
-- JOIN faculty_program fp ON p.program_id = fp.program_id
-- WHERE fp.user_teacher_id = ? AND fp.status = 'active';

-- Get instructor count per program
-- SELECT p.program_code, p.program_name, COUNT(fp.user_teacher_id) as instructor_count
-- FROM program p
-- LEFT JOIN faculty_program fp ON p.program_id = fp.program_id AND fp.status = 'active'
-- GROUP BY p.program_id;
