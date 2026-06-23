-- COC grading periods: P1 Midterms, P2 Prefinals, P3 Finals
ALTER TABLE quiz
    ADD COLUMN IF NOT EXISTS grading_period VARCHAR(2) NOT NULL DEFAULT 'P1'
    COMMENT 'P1=Midterms P2=Prefinals P3=Finals' AFTER quiz_type;

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS grading_period VARCHAR(2) NOT NULL DEFAULT 'P1'
    COMMENT 'P1=Midterms P2=Prefinals P3=Finals' AFTER status;
