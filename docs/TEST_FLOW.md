# COC-LMS — Complete System Test Flow

> Run `database/migrations/seed_test_accounts.sql` in phpMyAdmin first.
> Password for **all** accounts: `password123`

---

## Test Accounts

| Role | Email | Name |
|------|-------|------|
| **Admin** | admin@cit-lms.edu.ph | System Administrator |
| **Dean** | dean@cit-lms.edu.ph | College Dean |
| **Instructor** | juan.delacruz@cit-lms.edu.ph | Juan Dela Cruz |
| **Student** | maria.santos@student.cit-lms.edu.ph | Maria Santos |

---

## Flow Overview

```
ADMIN SETUP
    │
    ▼
1. Settings → Set Active Semester
2. Departments → Verify
3. Subjects → Create / Verify
4. Curriculum → Assign subjects to program
    │
    ▼
SCHEDULING
5. Sections → Create section (with Program + Year)
6. Faculty Assignments → Assign instructor to subjects
    │
    ┌────────────────┴────────────────┐
    ▼                                 ▼
INSTRUCTOR                        STUDENT
7. My Classes → See subjects      7. Enroll in Section
8. Lessons → Upload content       8. My Subjects → Open subject
9. Quiz → Create quiz             9. Lessons → Read
10. Gradebook → View scores       10. Quizzes → Take quiz
                                  11. My Grades → View results
    │                                 │
    └────────────────┬────────────────┘
                     ▼
                   DEAN
             12. Reports / Oversight
```

---

## PHASE 1 — Admin Setup

### Step 1 · Login as Admin
- URL: `localhost/COC-LMS/app/`
- Email: `admin@cit-lms.edu.ph` · Password: `password123`
- ✅ Expect: Admin dashboard with statistics cards

---

### Step 2 · Settings → School Year
- Navigate: **System → Settings → School Year**
- ✅ Verify: Active semester banner shows (green card at top)
- If no active semester:
  - Click **+ Add Semester**
  - Academic Year: `2024-2025`, Semester: `1st Semester`
  - Status: **Active**, add dates
  - Click **Create Semester**
- ✅ Expect: Green "1st Semester · AY 2024-2025" card appears at top

---

### Step 3 · Departments
- Navigate: **Academic → Departments**
- ✅ Verify: At least one department exists (e.g., CIT, CCS)
- If empty: Click **+ Add Department**, fill in code + name

---

### Step 4 · Subjects
- Navigate: **Academic → Subjects**
- ✅ Verify: Subjects appear in the table (loaded from seed data)
- Filter by department → program to narrow down
- Filter by **1st Semester** → only 1st sem subjects show
- ✅ "This Semester" column shows **Not Offered** (no offerings created yet)

---

### Step 5 · Curriculum
- Navigate: **Academic → Curriculum**
- Select a Department (e.g., CIT)
- Select a Program (e.g., BSIT)
- ✅ Expect: Year-by-year, 1st & 2nd semester tables appear side-by-side
- Try **+ Add Subject** → pick a subject, set Year Level + Semester → Save

---

### Step 6 · Sections
- Navigate: **Scheduling → Sections**
- Click **+ Add Section**
- Fill in:
  - Section Name: `BSIT-1A`
  - Program: `BSIT`
  - Year Level: `1st Year`
  - Max Students: `40`
- Click **Create**
- ✅ Expect: Card appears with program/year context pills

---

### Step 7 · Faculty Assignments
- Navigate: **Scheduling → Faculty Assignments**
- Select Semester and Program filters
- ✅ Expect: Subject rows appear grouped by year level
- Each row has an **instructor dropdown** — select `Juan Dela Cruz` for a subject
- ✅ Expect: Status pill flips from ⚠️ Unassigned → ✅ Assigned instantly (no page reload)

---

### Step 8 · Verify Subjects "This Semester" Column
- Navigate back to **Academic → Subjects**
- ✅ Now subjects with offerings show **Offered** badge + instructor name + section count

---

## PHASE 2 — Instructor Flow

### Step 1 · Login as Instructor
- Email: `juan.delacruz@cit-lms.edu.ph` · Password: `password123`
- ✅ Expect: Instructor dashboard showing assigned subjects

---

### Step 2 · My Classes
- Navigate: **Teaching → My Classes**
- ✅ Expect: Cards for each assigned subject + section
- Each card shows student count, lesson progress

---

### Step 3 · Content Bank
- Navigate: **Teaching → Content Bank**
- Click **+ Upload**
- Upload a PDF or document file
- ✅ Expect: File appears in content bank list

---

### Step 4 · Create Lessons
- Navigate: **Teaching → My Classes** → click into a subject
- Go to **Lessons** tab
- Click **+ Add Lesson**, fill in title + content
- Set status to **Published**
- ✅ Expect: Lesson appears in the lesson list

---

### Step 5 · Create a Quiz
- From subject view → **Quizzes** tab
- Click **+ Create Quiz**
- Fill in: title, time limit (e.g., 30 min), passing rate (e.g., 60%)
- Add questions (Multiple Choice, True/False)
- Set status to **Published**
- ✅ Expect: Quiz appears in quiz list with question count

---

### Step 6 · Gradebook
- Navigate: **Assessment → Gradebook**
- ✅ Expect: Student grade records (empty until students take quizzes)

---

## PHASE 3 — Student Flow

### Step 1 · Login as Student
- Email: `maria.santos@student.cit-lms.edu.ph` · Password: `password123`
- ✅ Expect: Student dashboard with enrollment prompt (if not enrolled)

---

### Step 2 · Enroll in Section
- Navigate: **Learning → Enroll in Section**
- Search for `BSIT-1A`
- Click **Enroll**
- ✅ Expect: Success message, section appears in enrolled list

---

### Step 3 · My Subjects
- Navigate: **Learning → My Subjects**
- ✅ Expect: Subject cards for enrolled section appear
- Each card shows: instructor name, lesson progress, quiz progress

---

### Step 4 · View Lessons
- Click a subject card → **Lessons**
- ✅ Expect: Published lessons appear in order
- Click a lesson → read content
- ✅ Expect: Lesson marked as completed, progress bar updates

---

### Step 5 · Take a Quiz
- From subject view → **Quizzes**
- Click **Start Quiz**
- Answer questions within the time limit
- Submit
- ✅ Expect: Score shown, pass/fail result displayed
- ✅ Expect: Attempt recorded in gradebook

---

### Step 6 · My Grades
- Navigate: **Progress → My Grades**
- ✅ Expect: Quiz scores, subject grades summary
- Click **📌 Remedials** button → view remedial subjects (if any)
- ✅ Back to My Grades button returns correctly

---

## PHASE 4 — Dean Oversight

### Step 1 · Login as Dean
- Email: `dean@cit-lms.edu.ph` · Password: `password123`
- ✅ Expect: Dean dashboard

---

### Step 2 · Instructors
- Navigate: **Academic → Instructors**
- ✅ Expect: Faculty list with assignment counts

---

### Step 3 · Subject Offerings
- Navigate: **Academic → Subjects**
- Filter by semester
- ✅ Expect: See which subjects are offered, who teaches them

---

### Step 4 · Sections
- Navigate: **Academic → Sections**
- ✅ Expect: All sections with enrollment counts

---

### Step 5 · Reports
- Navigate: **Academic → Reports**
- ✅ Expect: Summary statistics, grade distributions

---

## Quick Sanity Checks

| Check | How to verify |
|-------|--------------|
| Active semester propagates | Admin sets active → Subjects page "This Semester" column updates |
| Offering status | After Faculty Assignment → Subjects page shows instructor name |
| Enrollment cap | Try to enroll a 2nd student when max = 1 → should reject |
| Delete active semester | Settings → School Year → 🗑 on active row → should show error |
| Semester filter | Subjects page → select "1st Semester" → only 1st sem subjects show |
| Department → Program cascade | Curriculum page → select dept → program list narrows |

---

## Known Pre-requisites (run in phpMyAdmin first)

```
1. database/migrations/fix_subject_offered_semester_id.sql   ← adds semester_id to subject_offered
2. database/migrations/cleanup_semester_duplicates.sql        ← removes duplicate semester rows
3. database/migrations/seed_test_accounts.sql                 ← creates test users for all 4 roles
```
