-- Social comments on Content Bank posts (materials, questions, full quizzes)
CREATE TABLE IF NOT EXISTS bank_comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    post_type ENUM('material','question','quiz') NOT NULL,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    parent_comment_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_post (post_type, post_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
