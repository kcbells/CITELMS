# COC-LMS — Core Transactions Flow

> Password for **all** test accounts: `password123`

---

## Core Transactions Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    COC-LMS CORE TRANSACTIONS                    │
├─────────────────────────────────────────────────────────────────┤
│  1. Instructional Content Processing                            │
│  2. AI-Assisted Assessment Generation                           │
│  3. Student Assessment & Mastery Validation                     │
│  4. Messaging (Student ↔ Instructor Communication)              │
│  5. Analytical Report Generation                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## CT-1 · Instructional Content Processing

**Who:** Instructor creates → Student consumes

```
INSTRUCTOR                          STUDENT
─────────                           ───────
Login as Instructor                 Login as Student
  │                                   │
  ▼                                   │
My Classes → select class             │
  │                                   │
  ▼                                   │
Lessons → + Create Lesson             │
  │  • Title                          │
  │  • Description / Content          │
  │  • Attach file or link            │
  │  • Set order number               │
  │                                   │
  ▼                                   │
Publish Lesson (status = Published)   │
  │                                   ▼
  │                             My Subjects → select subject
  │                                   │
  │                                   ▼
  │                             Lessons (subject context)
  │                                   │
  │                                   ▼
  │                             Click lesson card → Lesson View
  │                                   │  • Read content
  │                                   │  • Download materials
  │                                   │
  │                                   ▼
  │                             Click "Mark as Complete"
  │                                   │
  │                                   ▼
  │                             ✅ Progress saved → next lesson unlocked
  │                             (Sequential lock enforced)
  ▼
Instructor sees "1 student" under Completions
```

**Key Rules:**
- Lessons are sequentially locked — student must complete lesson N before N+1 unlocks
- Only **Published** lessons are visible to students (Draft = hidden)
- Deleting a lesson also removes all student progress records for it

---

## CT-2 · AI-Assisted Assessment Generation

**Who:** Instructor generates quiz using AI → Student takes it

```
INSTRUCTOR                          STUDENT
─────────                           ───────
My Classes → select class             │
  │                                   │
  ▼                                   │
Quizzes → + New Quiz                  │
  │                                   │
  ▼                                   │
Choose: Manual OR AI Generate         │
  │                                   │
  ├─ [AI Generate] ──────────────────►│
  │     • Enter topic / lesson        │
  │     • Set number of questions     │
  │     • Select question types       │
  │       (MC, T/F, Essay)            │
  │     • Click Generate              │
  │     • Review AI questions         │
  │     • Edit / remove if needed     │
  │     • Save Quiz                   │
  │                                   │
  ▼                                   │
Set Quiz Settings:                    │
  • Time limit                        │
  • Passing score (%)                 │
  • Publish quiz                      │
  │                                   ▼
  │                             My Subjects → select subject
  │                                   │
  │                                   ▼
  │                             Quizzes → see available quiz
  │                                   │
  │                                   ▼
  │                             Start Quiz
  │                                   │  • Answer questions
  │                                   │  • Timer counts down
  │                                   │
  │                                   ▼
  │                             Submit → Score shown instantly
  │                                   │  (MC / T/F auto-graded)
  │                                   │  (Essay → pending review)
  ▼
Instructor → Gradebook → sees score
```

**Key Rules:**
- AI generation uses Groq API (configured in `setup_groq_key.php`)
- Essay answers require manual grading by instructor (Essay Grading page)
- Students can attempt quiz multiple times (if instructor allows retakes)

---

## CT-3 · Student Assessment & Mastery Validation

**Who:** Student attempts quiz → System validates mastery → Instructor reviews

```
STUDENT                    SYSTEM                    INSTRUCTOR
───────                    ──────                    ──────────
Takes quiz                   │                           │
  │                          │                           │
  ▼                          │                           │
Submits answers              │                           │
  │                          ▼                           │
  │               Auto-grade MC & T/F                    │
  │               Score = (correct/total) × 100          │
  │                          │                           │
  │               ┌──────────▼──────────┐                │
  │               │  Score ≥ Passing %  │                │
  │               └────┬──────────┬─────┘                │
  │                  YES          NO                      │
  │                   │           │                       │
  │                   ▼           ▼                       │
  │              ✅ PASSED    ❌ FAILED                    │
  │              Mastery       Remedial                   │
  │              validated     recommended                │
  │                   │           │                       │
  ▼                   │           ▼                       │
My Grades              │     Remedials page               │
  • See score          │     • View remedial              │
  • See status         │       materials assigned         │
  • Pass/Fail badge    │                                  │
                       │                                  ▼
                       │                     Gradebook → per-student scores
                       │                     Essay Grading → review essays
                       │                     Analytics → class performance
                       ▼
               Progress tracked in
               student_progress table
```

**Key Rules:**
- Passing threshold is set per quiz by the instructor
- Failed students appear in the Remedials section
- Essay questions are marked **Pending** until instructor grades them
- Instructor can assign remedial materials to struggling students

---

## CT-4 · Messaging (Student ↔ Instructor Communication)

**Who:** Student or Instructor initiates chat

```
STUDENT                                  INSTRUCTOR
───────                                  ──────────
My Grades → 💬 Messages button           Gradebook → 💬 Messages button
  │                                           │
  ▼                                           │
Messages page                          Messages page
  │                                           │
  ▼                                           │
Click "New Message"                    Click "New Message"
  │                                           │
  ▼                                           ▼
Contact Picker modal                   Contact Picker modal
(shows enrolled instructors)           (shows enrolled students)
  │                                           │
  ▼                                           ▼
Select instructor → Chat opens         Select student → Chat opens
  │                                           │
  ▼                                           ▼
Type message → Enter / Send            Type message → Enter / Send
  │                                           │
  └──────────────────┬────────────────────────┘
                     ▼
              Message saved to
              messages table (DB)
                     │
                     ▼ (polling every 3 seconds)
              Recipient sees new message
              appear in real-time
                     │
                     ▼
              Unread badge (🔴) shown
              on Messages button
```

**Key Rules:**
- No WebSocket server needed — JS polls every 3 seconds for new messages
- Students can only message their own subject's instructors
- Instructors can only message students enrolled in their classes
- Unread count badge updates every 30 seconds in sidebar

---

## CT-5 · Analytical Report Generation

**Who:** Instructor monitors class performance → Dean views department-level reports

```
INSTRUCTOR VIEW                        DEAN VIEW
───────────────                        ─────────
Login as Instructor                    Login as Dean
  │                                       │
  ▼                                       │
Gradebook → see all scores               │
  │  • Per student, per quiz              │
  │  • Pass / Fail status                 │
  │                                       │
  ▼                                       │
Analytics page                           │
  │  • Class average score               │
  │  • Pass rate %                        │
  │  • Score distribution chart          │
  │  • At-risk students identified        │
  │                                       │
  ▼                                       ▼
Remedials page                       Reports page
  │  • Flag struggling students       • Department-level analytics
  │  • Assign remedial materials      • Instructor performance
  │  • Track improvement              • Section pass rates
  │
  ▼
Essay Grading
  • Manual score entry for essays
  • Feedback comments
```

**Key Rules:**
- Analytics are real-time (pulled live from quiz attempt records)
- Dean sees aggregated data across all instructors in their department
- Admin has full visibility across all departments

---

## End-to-End Test Scenario

```
1. Admin       → Settings: confirm active semester exists
                 Departments, Programs, Curriculum: verify setup
                 Users: create instructor + student accounts

2. Admin       → Sections: create a section
                 Subject Offerings: assign subject + instructor to section
                 Faculty Assignments: link instructor

3. Student     → My Subjects → Enroll in Section (enter enrollment code)

4. Instructor  → My Classes → select class
                 Lessons → create & publish 2 lessons
                 Quizzes → AI Generate quiz (5 MC questions) → publish

5. Student     → My Subjects → select subject
                 Lessons → complete lesson 1 → complete lesson 2
                 Quizzes → take quiz → submit

6. Instructor  → Gradebook → verify student score appears
                 Analytics → verify class stats updated

7. Student     → My Grades → see pass/fail result
                 Messages → New Message → message instructor

8. Instructor  → Gradebook → Messages → reply to student

9. Student     → sees reply within ~3 seconds (polling)
```

---

*Generated: 2026-02-26 | COC-LMS v1.0*
