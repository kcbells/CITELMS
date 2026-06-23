-- Question Bank
-- Shared question repository: instructors can publish questions and copy them into their quizzes
-- Run in phpMyAdmin on cit_lms database

CREATE TABLE IF NOT EXISTS question_bank (
    qbank_id      INT AUTO_INCREMENT PRIMARY KEY,
    question_text TEXT          NOT NULL,
    question_type VARCHAR(50)   DEFAULT 'multiple_choice',
    points        INT           DEFAULT 1,
    subject_id    INT           NULL,
    created_by    INT           NOT NULL,
    visibility    ENUM('public','private') DEFAULT 'public',
    copy_count    INT           DEFAULT 0,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by) REFERENCES users(users_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS question_bank_options (
    option_id     INT AUTO_INCREMENT PRIMARY KEY,
    qbank_id      INT           NOT NULL,
    option_text   TEXT          NOT NULL,
    is_correct    TINYINT(1)    DEFAULT 0,
    option_order  INT           DEFAULT 1,

    FOREIGN KEY (qbank_id) REFERENCES question_bank(qbank_id) ON DELETE CASCADE
);
