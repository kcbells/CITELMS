SET FOREIGN_KEY_CHECKS = 0;

-- Rename columns (some may already be done - --force will skip errors)
ALTER TABLE `lessons` CHANGE `lesson_id` `lessons_id` INT(11) NOT NULL AUTO_INCREMENT;
ALTER TABLE `lesson_materials` CHANGE `lesson_id` `lessons_id` INT(11) NOT NULL;
ALTER TABLE `quiz` CHANGE `lesson_id` `lessons_id` INT(11) NOT NULL;
ALTER TABLE `student_progress` CHANGE `lesson_id` `lessons_id` INT(11) NOT NULL;
ALTER TABLE `topic` CHANGE `lesson_id` `lessons_id` INT(11) NOT NULL;

-- Create quiz_questions
DROP TABLE IF EXISTS `quiz_questions_new`;

CREATE TABLE `quiz_questions_new` (
    `quiz_questions_id` INT(11) NOT NULL AUTO_INCREMENT,
    `questions_id` INT(11) NOT NULL,
    `lessons_id` INT(11) NOT NULL,
    PRIMARY KEY (`quiz_questions_id`),
    UNIQUE KEY `unique_question_lesson` (`questions_id`, `lessons_id`),
    KEY `idx_qq_question` (`questions_id`),
    KEY `idx_qq_lesson` (`lessons_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_questions_new` (`questions_id`, `lessons_id`)
SELECT DISTINCT questions_id, lessons_id FROM questions;

RENAME TABLE `quiz_questions_new` TO `quiz_questions`;

-- Add FK constraints (some may fail if already exist - --force will skip)
ALTER TABLE `lesson_materials`
    ADD CONSTRAINT `fk_materials_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

ALTER TABLE `quiz`
    ADD CONSTRAINT `fk_quiz_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

ALTER TABLE `student_progress`
    ADD CONSTRAINT `fk_progress_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

ALTER TABLE `topic`
    ADD CONSTRAINT `fk_topic_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

ALTER TABLE `questions`
    ADD CONSTRAINT `fk_questions_user` FOREIGN KEY (`users_id`) REFERENCES `users` (`users_id`) ON DELETE CASCADE;
ALTER TABLE `questions`
    ADD CONSTRAINT `fk_questions_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

ALTER TABLE `quiz_questions`
    ADD CONSTRAINT `fk_qq_question` FOREIGN KEY (`questions_id`) REFERENCES `questions` (`questions_id`) ON DELETE CASCADE;
ALTER TABLE `quiz_questions`
    ADD CONSTRAINT `fk_qq_lesson` FOREIGN KEY (`lessons_id`) REFERENCES `lessons` (`lessons_id`) ON DELETE CASCADE;

ALTER TABLE `question_option`
    ADD CONSTRAINT `fk_option_question` FOREIGN KEY (`questions_id`) REFERENCES `questions` (`questions_id`) ON DELETE CASCADE;

ALTER TABLE `student_quiz_answers`
    ADD CONSTRAINT `fk_answer_question` FOREIGN KEY (`questions_id`) REFERENCES `questions` (`questions_id`) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
