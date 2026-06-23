-- Class comments for subject stream and classwork items
CREATE TABLE IF NOT EXISTS class_comments (
    comment_id   INT AUTO_INCREMENT PRIMARY KEY,
    subject_id   INT NOT NULL,
    lessons_id   INT NULL,
    quiz_id      INT NULL,
    user_id      INT NOT NULL,
    content      TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_subject (subject_id),
    INDEX idx_lesson (lessons_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
