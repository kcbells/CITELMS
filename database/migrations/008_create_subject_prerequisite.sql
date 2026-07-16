-- Migration 008: Create subject_prerequisite table
-- This table was missing after database restore (migration 007 assumed it existed).

CREATE TABLE IF NOT EXISTS `subject_prerequisite` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `subject_id` INT(11) NOT NULL,
    `prerequisite_subject_id` INT(11) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_subject_prereq` (`subject_id`, `prerequisite_subject_id`),
    KEY `idx_subject_id` (`subject_id`),
    KEY `idx_prereq_subject_id` (`prerequisite_subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
