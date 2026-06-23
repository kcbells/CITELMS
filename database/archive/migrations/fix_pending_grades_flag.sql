-- Fix stale has_pending_grades=1 on attempts that have no actual pending answers
UPDATE student_quiz_attempts sqa
SET has_pending_grades = 0
WHERE has_pending_grades = 1
AND (SELECT COUNT(*) FROM student_quiz_answers a
     WHERE a.attempt_id = sqa.attempt_id AND a.grading_status = 'pending') = 0;
