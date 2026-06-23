# Database Column Reference Guide

## Critical Column Names to Remember

This document lists commonly confused or critical column names to prevent errors.

---

## ⚠️ MOST COMMON MISTAKES

### 1. student_subject Table

**❌ WRONG**: `enrolled_at`
**✅ CORRECT**: `enrollment_date`

```sql
-- WRONG
SELECT ss.enrolled_at FROM student_subject ss

-- CORRECT
SELECT ss.enrollment_date FROM student_subject ss
```

**Where This Error Occurred:**
- ✅ Fixed: `pages/student/enroll.php` (lines 65, 91, 210)
- ✅ Fixed: `pages/instructor/students.php` (lines 103, 260)

---

### 2. quiz Table

**Column**: `lesson_id`
**Type**: `INT(11) NULL` (nullable)
**Important**: Can be NULL for independent quizzes not linked to lessons

```sql
-- Independent quiz (no lesson)
INSERT INTO quiz (..., lesson_id, ...) VALUES (..., NULL, ...)

-- Lesson-linked quiz
INSERT INTO quiz (..., lesson_id, ...) VALUES (..., 5, ...)
```

**Where This Was Fixed:**
- ✅ Fixed: Database schema (made column nullable)
- ✅ Fixed: `pages/instructor/quiz-edit.php` (line 65)

---

## Complete Table Structures

### student_subject
```sql
student_subject_id       INT(11) PRIMARY KEY AUTO_INCREMENT
user_student_id          INT(11) NOT NULL FK->users.users_id
subject_offered_id       INT(11) NOT NULL FK->subject_offered.subject_offered_id
section_id               INT(11) NULL FK->section.section_id
enrollment_date          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP  ⚠️
status                   ENUM('enrolled','dropped','completed','failed') DEFAULT 'enrolled'
final_grade              DECIMAL(5,2) NULL
remarks                  TEXT NULL
updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### section
```sql
section_id               INT(11) PRIMARY KEY AUTO_INCREMENT
subject_offered_id       INT(11) NOT NULL FK->subject_offered.subject_offered_id
section_name             VARCHAR(50) NOT NULL
enrollment_code          VARCHAR(20) UNIQUE NOT NULL  ⚠️
schedule                 VARCHAR(100) NULL
room                     VARCHAR(50) NULL
max_students             INT(11) DEFAULT 40
status                   ENUM('active','inactive') DEFAULT 'active'
created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### quiz
```sql
quiz_id                  INT(11) PRIMARY KEY AUTO_INCREMENT
lesson_id                INT(11) NULL FK->lessons.lesson_id  ⚠️
subject_id               INT(11) NOT NULL FK->subject.subject_id
user_teacher_id          INT(11) NOT NULL FK->users.users_id
quiz_title               VARCHAR(200) NOT NULL
quiz_description         TEXT NULL
quiz_type                ENUM('pre_test','post_test','practice','graded') DEFAULT 'graded'
time_limit               INT(11) DEFAULT 30
passing_rate             DECIMAL(5,2) DEFAULT 60.00
max_attempts             INT(11) DEFAULT 3
total_points             INT(11) DEFAULT 0
is_randomized            TINYINT(1) DEFAULT 0
show_answers             TINYINT(1) DEFAULT 1
show_score               TINYINT(1) DEFAULT 1
availability_start       TIMESTAMP NULL
availability_end         TIMESTAMP NULL
due_date                 DATE NULL  ⚠️
status                   ENUM('draft','published','closed','archived') DEFAULT 'draft'
created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### faculty_subject
```sql
faculty_subject_id       INT(11) PRIMARY KEY AUTO_INCREMENT
user_teacher_id          INT(11) NOT NULL FK->users.users_id
subject_offered_id       INT(11) NOT NULL FK->subject_offered.subject_offered_id
section_id               INT(11) NOT NULL FK->section.section_id  ⚠️
status                   ENUM('active','inactive') DEFAULT 'active'
assigned_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### users
```sql
users_id                 INT(11) PRIMARY KEY AUTO_INCREMENT  ⚠️
student_id               VARCHAR(50) NULL UNIQUE
email                    VARCHAR(100) NOT NULL UNIQUE
password_hash            VARCHAR(255) NOT NULL
first_name               VARCHAR(100) NOT NULL
last_name                VARCHAR(100) NOT NULL
middle_name              VARCHAR(100) NULL
role                     ENUM('student','instructor','admin') NOT NULL
profile_image            VARCHAR(255) NULL
status                   ENUM('active','inactive','suspended') DEFAULT 'active'
created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

---

## Naming Patterns

### Timestamp Columns
The database uses **TWO different patterns** (inconsistent):

**Pattern 1: `_at` suffix**
- `created_at`
- `updated_at`
- `assigned_at`
- `enrolled_at` ❌ (DOES NOT EXIST - use `enrollment_date`)

**Pattern 2: `_date` suffix**
- `enrollment_date` ✅
- `due_date`

### Foreign Keys
- Always use full column name: `user_student_id`, `user_teacher_id`
- Never shortened: ~~`user_id`~~, ~~`teacher_id`~~
- Primary key in `users` table is `users_id` (not `user_id`)

### Status Columns
All status columns use ENUM type:
```sql
status ENUM('active','inactive')
status ENUM('enrolled','dropped','completed','failed')
status ENUM('draft','published','closed','archived')
status ENUM('pending','completed','graded')
```

---

## Join Patterns

### Getting Students in Instructor's Sections
```sql
SELECT u.*, s.*, sec.*
FROM student_subject ss
JOIN users u ON ss.user_student_id = u.users_id
JOIN section sec ON ss.section_id = sec.section_id
JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
JOIN subject s ON so.subject_id = s.subject_id
JOIN faculty_subject fs ON sec.section_id = fs.section_id
WHERE fs.user_teacher_id = ? AND ss.status = 'enrolled'
```

### Getting Student's Enrolled Subjects
```sql
SELECT s.*, sec.*, so.*
FROM student_subject ss
JOIN section sec ON ss.section_id = sec.section_id
JOIN subject_offered so ON sec.subject_offered_id = so.subject_offered_id
JOIN subject s ON so.subject_id = s.subject_id
WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
```

### Getting Instructor for a Section
```sql
SELECT u.first_name, u.last_name
FROM faculty_subject fs
JOIN users u ON fs.user_teacher_id = u.users_id
WHERE fs.section_id = ? AND fs.status = 'active'
LIMIT 1
```

---

## Quick Reference Checklist

When writing queries for:

### student_subject table:
- ✅ Use `enrollment_date` (NOT `enrolled_at`)
- ✅ `section_id` can be NULL (for legacy data)
- ✅ Status values: 'enrolled', 'dropped', 'completed', 'failed'

### section table:
- ✅ `enrollment_code` is unique (format: XXX-9999)
- ✅ `max_students` defaults to 40
- ✅ Always join through this table for section-based queries

### quiz table:
- ✅ `lesson_id` can be NULL (for independent quizzes)
- ✅ `due_date` is DATE type (not DATETIME)
- ✅ `time_limit` in minutes (default 30)
- ✅ `passing_rate` is DECIMAL percentage (default 60.00)

### users table:
- ✅ Primary key is `users_id` (NOT `user_id`)
- ✅ `student_id` is for display (can be NULL for instructors)
- ✅ `email` is unique and used for login

---

## Common Query Errors

### ❌ Error 1: Unknown column 'enrolled_at'
```sql
-- WRONG
SELECT ss.enrolled_at FROM student_subject ss

-- CORRECT
SELECT ss.enrollment_date FROM student_subject ss
```

### ❌ Error 2: Foreign key constraint for lesson_id
```sql
-- WRONG (when creating independent quiz)
INSERT INTO quiz (lesson_id, ...) VALUES (0, ...)

-- CORRECT
INSERT INTO quiz (lesson_id, ...) VALUES (NULL, ...)
```

### ❌ Error 3: Wrong primary key name
```sql
-- WRONG
WHERE u.user_id = ?

-- CORRECT
WHERE u.users_id = ?
```

---

## Files That Reference These Tables

### student_subject table:
- `pages/student/enroll.php` ✅
- `pages/student/my-subjects.php` ✅
- `pages/instructor/students.php` ✅
- Migration scripts: `fix_old_enrollments.php`, `create_sections_for_old_enrollments.php`

### quiz table:
- `pages/instructor/quiz-edit.php` ✅
- `pages/instructor/quiz-questions.php` ✅
- `pages/instructor/quizzes.php` ✅

### section table:
- `pages/student/enroll.php` ✅
- `pages/instructor/manage-sections.php`
- All enrollment-related queries

---

## Last Updated
2026-01-10 - After fixing students.php enrolled_at error

