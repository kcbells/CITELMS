# Database Table Reference

## ⚠️ IMPORTANT: Correct Table & Column Names

### Tables (Use These Names)
```
✅ student_subject          ❌ NOT enrollment
✅ student_quiz_attempts     ❌ NOT quiz_attempt
✅ student_progress          ❌ NOT student_lesson_progress
✅ subject_offered           ❌ NOT subject_offering
✅ users                     ✓ Correct
✅ subject                   ✓ Correct
✅ lesson                    ✓ Correct
✅ quiz                      ✓ Correct
```

### Key Columns

#### student_subject table
```sql
- student_subject_id (PK)
- user_student_id         ❌ NOT users_id
- subject_offered_id      ❌ NOT subject_offering_id
- section_id
- enrollment_date
- status ('enrolled', 'dropped', 'completed', 'failed')
- final_grade
- remarks
```

#### subject_offered table
```sql
- subject_offered_id (PK)  ❌ NOT subject_offering_id
- subject_id
- academic_year
- semester
- user_teacher_id
- status
```

#### users table
```sql
- users_id (PK)
- first_name
- last_name
- email
- password                ❌ NOT password_hash
- contact_number          ❌ NOT phone
- section (varchar)       ❌ NOT section_id
- program_id
- department_id
```

#### student_quiz_attempts table
```sql
- attempt_id (PK)
- quiz_id
- user_id
- score
- started_at
- submitted_at
```

#### student_progress table
```sql
- progress_id (PK)
- user_id
- lesson_id
- is_completed
- completed_at
```

## Common Query Patterns

### Get Student's Enrolled Subjects
```sql
SELECT s.*, so.subject_offered_id
FROM student_subject ss
JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
JOIN subject s ON so.subject_id = s.subject_id
WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
```

### Get Student's Quiz Attempts
```sql
SELECT qa.*, q.title
FROM student_quiz_attempts qa
JOIN quiz q ON qa.quiz_id = q.quiz_id
WHERE qa.user_id = ?
```

### Get Student's Lesson Progress
```sql
SELECT sp.*, l.title
FROM student_progress sp
JOIN lesson l ON sp.lesson_id = l.lesson_id
WHERE sp.user_id = ? AND sp.is_completed = 1
```
