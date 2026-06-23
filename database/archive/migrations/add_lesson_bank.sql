-- Lesson Data Bank
-- Shared lesson repository instructors can publish to and copy from
-- Run in phpMyAdmin on cit_lms database

CREATE TABLE IF NOT EXISTS lesson_bank (
    bank_id       INT AUTO_INCREMENT PRIMARY KEY,
    lesson_title  VARCHAR(200)  NOT NULL,
    lesson_description TEXT     NULL,
    lesson_content     LONGTEXT NULL,
    subject_id    INT           NULL,          -- optional subject tag for filtering
    created_by    INT           NOT NULL,      -- FK: users.users_id (instructor)
    visibility    ENUM('public','private') DEFAULT 'public',
    tags          VARCHAR(500)  NULL,          -- comma-separated keywords
    copy_count    INT           DEFAULT 0,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by) REFERENCES users(users_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON DELETE SET NULL
);
