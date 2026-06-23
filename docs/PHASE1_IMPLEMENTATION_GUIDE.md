# Phase 1: Quiz Improvements - Implementation Guide

## 🎯 Overview

This guide walks you through implementing the **Phase 1 Migration** which transforms your quiz system from basic to professional-level.

---

## 📦 What You're Getting

### **3 New Tables:**
1. `quiz_questions` - Individual questions for each quiz
2. `question_option` - Multiple choice options
3. `student_quiz_answers` - Track individual answers

### **3 Views:**
1. `vw_quiz_summary` - Quiz statistics
2. `vw_question_difficulty_analysis` - Question analytics
3. `vw_student_quiz_performance` - Student performance

### **2 Stored Procedures:**
1. `sp_calculate_quiz_points` - Auto-calculate quiz totals
2. `sp_grade_quiz_attempt` - Auto-grade quiz attempts

### **3 Triggers:**
1. Auto-update question counts
2. Auto-update total points
3. Auto-grade multiple choice answers

---

## 🚀 STEP-BY-STEP INSTALLATION

### Step 1: Backup Your Database (5 minutes)

**CRITICAL: Do this first!**

```bash
# Via command line
cd C:\xampp\mysql\bin
mysqldump -u root cit_lms > C:\xamppfinal\htdocs\COC-LMS\database\backups\cit_lms_backup_before_phase1.sql

# Or via phpMyAdmin
# 1. Open http://localhost/phpmyadmin
# 2. Select 'cit_lms' database
# 3. Click 'Export' tab
# 4. Click 'Go'
# 5. Save file as 'cit_lms_backup_before_phase1.sql'
```

---

### Step 2: Run the Migration Script (2 minutes)

**Option A: Via phpMyAdmin (Recommended)**

1. Open `http://localhost/phpmyadmin`
2. Select `cit_lms` database
3. Click **SQL** tab
4. Click **Import** or paste the SQL file content
5. Locate: `database/migrations/phase1_quiz_improvements.sql`
6. Click **Go**

**Option B: Via Command Line**

```bash
cd C:\xampp\mysql\bin
mysql -u root cit_lms < C:\xamppfinal\htdocs\COC-LMS\database\migrations\phase1_quiz_improvements.sql
```

**Expected Output:**
```
Query OK, 0 rows affected (0.05 sec)
Query OK, 0 rows affected (0.03 sec)
Query OK, 0 rows affected (0.04 sec)
...
Tables Created: 3
Views Created: 3
Procedures Created: 2
```

---

### Step 3: Verify Installation (3 minutes)

Run these verification queries in phpMyAdmin:

```sql
-- Check if tables exist
SHOW TABLES LIKE 'quiz_%';
-- Should show: quiz, quiz_questions

SHOW TABLES LIKE 'question_%';
-- Should show: question_option

SHOW TABLES LIKE 'student_quiz_%';
-- Should show: student_quiz_attempts, student_quiz_answers

-- Check if views exist
SHOW FULL TABLES WHERE Table_type = 'VIEW';
-- Should show: vw_quiz_summary, vw_question_difficulty_analysis, vw_student_quiz_performance

-- Check if procedures exist
SHOW PROCEDURE STATUS WHERE Db = 'cit_lms';
-- Should show: sp_calculate_quiz_points, sp_grade_quiz_attempt

-- Check table structure
DESCRIBE quiz_questions;
DESCRIBE question_option;
DESCRIBE student_quiz_answers;
```

**All queries should return results without errors.**

---

## 📊 NEW DATABASE STRUCTURE

### **Table: quiz_questions**

```
+------------------+------------------+------+
| Field            | Type             | Null |
+------------------+------------------+------+
| question_id      | int(11)          | NO   | PK, Auto Increment
| quiz_id          | int(11)          | NO   | FK to quiz
| question_text    | text             | NO   |
| question_type    | enum             | YES  | multiple_choice, true_false, short_answer, essay
| correct_answer   | text             | YES  | For true/false and short answer
| points           | int(11)          | YES  | Default: 1
| order_number     | int(11)          | YES  | Default: 0
| explanation      | text             | YES  | Shown after answering
| difficulty       | enum             | YES  | easy, medium, hard
| created_at       | timestamp        | NO   |
| updated_at       | timestamp        | NO   |
+------------------+------------------+------+
```

### **Table: question_option**

```
+-------------------+-------------+------+
| Field             | Type        | Null |
+-------------------+-------------+------+
| option_id         | int(11)     | NO   | PK, Auto Increment
| quiz_question_id  | int(11)     | NO   | FK to quiz_questions
| option_text       | text        | NO   |
| is_correct        | tinyint(1)  | YES  | Default: FALSE
| order_number      | int(11)     | YES  | Default: 0
| created_at        | timestamp   | NO   |
+-------------------+-------------+------+
```

### **Table: student_quiz_answers**

```
+-------------------------+-------------+------+
| Field                   | Type        | Null |
+-------------------------+-------------+------+
| student_quiz_answer_id  | int(11)     | NO   | PK, Auto Increment
| attempt_id              | int(11)     | NO   | FK to student_quiz_attempts
| quiz_id                 | int(11)     | NO   | FK to quiz
| question_id             | int(11)     | NO   | FK to quiz_questions
| user_student_id         | int(11)     | NO   | FK to users
| selected_option_id      | int(11)     | YES  | FK to question_option (for MC)
| answer_text             | text        | YES  | For short answer/essay
| is_correct              | tinyint(1)  | YES  |
| points_earned           | decimal(5,2)| YES  | Default: 0.00
| time_spent_seconds      | int(11)     | YES  | Default: 0
| answered_at             | timestamp   | NO   |
+-------------------------+-------------+------+
```

---

## 💻 CODE CHANGES REQUIRED

Now you need to update your PHP pages to use the new structure.

### 1️⃣ Quiz Creation Page

**File:** `pages/instructor/quiz-create.php` (or quiz-questions.php)

**Current Flow:**
```
Create Quiz → Done
```

**New Flow:**
```
Create Quiz → Add Questions → Add Options for Each Question → Done
```

**Example Code:**

```php
<?php
// After creating quiz, redirect to add questions
if (isset($_POST['create_quiz'])) {
    // ... existing quiz creation code ...

    $quizId = db()->lastInsertId();

    // Redirect to add questions
    header("Location: quiz-questions.php?quiz_id=$quizId");
    exit;
}
?>
```

**New Page Needed:** `pages/instructor/quiz-questions.php`

```php
<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('instructor');

$quizId = $_GET['quiz_id'] ?? null;
$quiz = db()->fetchOne("SELECT * FROM quiz WHERE quiz_id = ?", [$quizId]);

if (!$quiz) {
    header("Location: quizzes.php");
    exit;
}

// Handle add question
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_question'])) {
    $questionText = $_POST['question_text'];
    $questionType = $_POST['question_type'];
    $points = (int)$_POST['points'];

    // Insert question
    db()->execute(
        "INSERT INTO quiz_questions (quiz_id, question_text, question_type, points, order_number)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(order_number), 0) + 1 FROM quiz_questions WHERE quiz_id = ?))",
        [$quizId, $questionText, $questionType, $points, $quizId]
    );

    $questionId = db()->lastInsertId();

    // If multiple choice, add options
    if ($questionType === 'multiple_choice' && isset($_POST['options'])) {
        foreach ($_POST['options'] as $index => $option) {
            $isCorrect = isset($_POST['correct_option']) && $_POST['correct_option'] == $index;

            db()->execute(
                "INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number)
                 VALUES (?, ?, ?, ?)",
                [$questionId, $option, $isCorrect, $index]
            );
        }
    }

    // If true/false or short answer, store correct answer
    if ($questionType === 'true_false' || $questionType === 'short_answer') {
        $correctAnswer = $_POST['correct_answer'] ?? '';
        db()->execute(
            "UPDATE quiz_questions SET correct_answer = ? WHERE question_id = ?",
            [$correctAnswer, $questionId]
        );
    }

    $success = 'Question added successfully!';
}

// Get existing questions
$questions = db()->fetchAll(
    "SELECT qq.*, COUNT(qo.option_id) as option_count
     FROM quiz_questions qq
     LEFT JOIN question_option qo ON qq.question_id = qo.quiz_question_id
     WHERE qq.quiz_id = ?
     GROUP BY qq.question_id
     ORDER BY qq.order_number",
    [$quizId]
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">
        <div class="page-header">
            <div>
                <a href="quizzes.php" class="back-link">← Back to Quizzes</a>
                <h2><?= e($quiz['quiz_title']) ?> - Manage Questions</h2>
                <p class="text-muted">Add and edit questions for this quiz</p>
            </div>
            <a href="quizzes.php" class="btn btn-success">Finish & Save Quiz</a>
        </div>

        <?php if (isset($success)): ?>
        <div class="alert alert-success"><?= $success ?></div>
        <?php endif; ?>

        <!-- Add Question Form -->
        <div class="card">
            <div class="card-header">
                <h3>Add New Question</h3>
            </div>
            <div class="card-body">
                <form method="POST" id="questionForm">
                    <input type="hidden" name="add_question" value="1">

                    <div class="form-group">
                        <label>Question Type</label>
                        <select name="question_type" id="questionType" class="form-control" required onchange="updateQuestionForm()">
                            <option value="multiple_choice">Multiple Choice</option>
                            <option value="true_false">True/False</option>
                            <option value="short_answer">Short Answer</option>
                            <option value="essay">Essay</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Question Text *</label>
                        <textarea name="question_text" class="form-control" rows="3" required></textarea>
                    </div>

                    <div class="form-group">
                        <label>Points</label>
                        <input type="number" name="points" class="form-control" value="1" min="1" required>
                    </div>

                    <!-- Multiple Choice Options -->
                    <div id="mcOptionsContainer">
                        <label>Answer Options</label>
                        <div class="options-list">
                            <div class="option-item">
                                <input type="radio" name="correct_option" value="0" required>
                                <input type="text" name="options[]" class="form-control" placeholder="Option A" required>
                            </div>
                            <div class="option-item">
                                <input type="radio" name="correct_option" value="1" required>
                                <input type="text" name="options[]" class="form-control" placeholder="Option B" required>
                            </div>
                            <div class="option-item">
                                <input type="radio" name="correct_option" value="2" required>
                                <input type="text" name="options[]" class="form-control" placeholder="Option C" required>
                            </div>
                            <div class="option-item">
                                <input type="radio" name="correct_option" value="3" required>
                                <input type="text" name="options[]" class="form-control" placeholder="Option D" required>
                            </div>
                        </div>
                        <button type="button" class="btn btn-outline" onclick="addOption()">+ Add Option</button>
                    </div>

                    <!-- True/False / Short Answer -->
                    <div id="correctAnswerContainer" style="display:none;">
                        <div class="form-group">
                            <label>Correct Answer</label>
                            <input type="text" name="correct_answer" class="form-control">
                        </div>
                    </div>

                    <button type="submit" class="btn btn-primary">Add Question</button>
                </form>
            </div>
        </div>

        <!-- Existing Questions List -->
        <div class="card" style="margin-top: 24px;">
            <div class="card-header">
                <h3>Questions (<?= count($questions) ?>)</h3>
            </div>
            <div class="card-body">
                <?php if (empty($questions)): ?>
                <p class="text-muted">No questions yet. Add your first question above.</p>
                <?php else: ?>
                <div class="questions-list">
                    <?php foreach ($questions as $index => $question): ?>
                    <div class="question-card">
                        <div class="question-header">
                            <span class="question-number">Q<?= $index + 1 ?></span>
                            <span class="question-type badge"><?= ucfirst(str_replace('_', ' ', $question['question_type'])) ?></span>
                            <span class="question-points"><?= $question['points'] ?> pts</span>
                        </div>
                        <div class="question-text"><?= e($question['question_text']) ?></div>
                        <?php if ($question['question_type'] === 'multiple_choice'): ?>
                        <div class="question-options">
                            <?php
                            $options = db()->fetchAll(
                                "SELECT * FROM question_option WHERE quiz_question_id = ? ORDER BY order_number",
                                [$question['question_id']]
                            );
                            foreach ($options as $option):
                            ?>
                            <div class="option <?= $option['is_correct'] ? 'correct' : '' ?>">
                                <?= $option['is_correct'] ? '✓' : '○' ?> <?= e($option['option_text']) ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>
                        <div class="question-actions">
                            <a href="quiz-question-edit.php?question_id=<?= $question['question_id'] ?>" class="btn btn-sm btn-outline">Edit</a>
                            <form method="POST" style="display:inline;" onsubmit="return confirm('Delete this question?')">
                                <input type="hidden" name="delete_question" value="<?= $question['question_id'] ?>">
                                <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                            </form>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</main>

<script>
function updateQuestionForm() {
    const type = document.getElementById('questionType').value;
    const mcContainer = document.getElementById('mcOptionsContainer');
    const answerContainer = document.getElementById('correctAnswerContainer');

    if (type === 'multiple_choice') {
        mcContainer.style.display = 'block';
        answerContainer.style.display = 'none';
    } else if (type === 'true_false' || type === 'short_answer') {
        mcContainer.style.display = 'none';
        answerContainer.style.display = 'block';
    } else {
        mcContainer.style.display = 'none';
        answerContainer.style.display = 'none';
    }
}

let optionCount = 4;
function addOption() {
    const container = document.querySelector('.options-list');
    const newOption = document.createElement('div');
    newOption.className = 'option-item';
    newOption.innerHTML = `
        <input type="radio" name="correct_option" value="${optionCount}" required>
        <input type="text" name="options[]" class="form-control" placeholder="Option ${String.fromCharCode(65 + optionCount)}" required>
        <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(newOption);
    optionCount++;
}

// Initialize on page load
updateQuestionForm();
</script>

<style>
.question-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}
.question-header {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
}
.question-number {
    font-weight: 700;
    color: #2563eb;
}
.question-type {
    background: #e0e7ff;
    color: #3730a3;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
}
.question-points {
    margin-left: auto;
    font-weight: 600;
    color: #059669;
}
.question-text {
    font-size: 15px;
    margin-bottom: 12px;
    line-height: 1.6;
}
.question-options {
    padding-left: 24px;
    margin-bottom: 12px;
}
.option {
    padding: 8px 0;
    color: #374151;
}
.option.correct {
    color: #059669;
    font-weight: 600;
}
.question-actions {
    display: flex;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
}
.option-item {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
}
.option-item input[type="radio"] {
    flex-shrink: 0;
}
.option-item input[type="text"] {
    flex: 1;
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
```

---

### 2️⃣ Quiz Taking Page

**File:** `pages/student/take-quiz.php`

**Update to save individual answers:**

```php
<?php
// When student submits quiz
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['submit_quiz'])) {
    $attemptId = $_POST['attempt_id'];
    $quizId = $_POST['quiz_id'];
    $studentId = Auth::id();

    // Get all questions for this quiz
    $questions = db()->fetchAll(
        "SELECT question_id, question_type, points FROM quiz_questions WHERE quiz_id = ? ORDER BY order_number",
        [$quizId]
    );

    // Save each answer
    foreach ($questions as $question) {
        $questionId = $question['question_id'];
        $answerKey = "question_" . $questionId;

        if (isset($_POST[$answerKey])) {
            $answer = $_POST[$answerKey];

            if ($question['question_type'] === 'multiple_choice') {
                // Answer is option_id
                db()->execute(
                    "INSERT INTO student_quiz_answers
                     (attempt_id, quiz_id, question_id, user_student_id, selected_option_id, answered_at)
                     VALUES (?, ?, ?, ?, ?, NOW())",
                    [$attemptId, $quizId, $questionId, $studentId, $answer]
                );
            } else {
                // Answer is text
                db()->execute(
                    "INSERT INTO student_quiz_answers
                     (attempt_id, quiz_id, question_id, user_student_id, answer_text, answered_at)
                     VALUES (?, ?, ?, ?, ?, NOW())",
                    [$attemptId, $quizId, $questionId, $studentId, $answer]
                );
            }
        }
    }

    // Grade the attempt using stored procedure
    db()->execute("CALL sp_grade_quiz_attempt(?)", [$attemptId]);

    header("Location: quiz-result.php?attempt_id=$attemptId");
    exit;
}
?>
```

---

### 3️⃣ Quiz Results Page

**File:** `pages/instructor/quiz-results.php`

**Use new views for analytics:**

```php
<?php
$quizId = $_GET['quiz_id'] ?? null;

// Get quiz summary with new statistics
$quizSummary = db()->fetchOne(
    "SELECT * FROM vw_quiz_summary WHERE quiz_id = ?",
    [$quizId]
);

// Get question difficulty analysis
$questionAnalysis = db()->fetchAll(
    "SELECT * FROM vw_question_difficulty_analysis WHERE quiz_id = ? ORDER BY success_rate_percentage ASC",
    [$quizId]
);

// Get student performance
$studentPerformance = db()->fetchAll(
    "SELECT * FROM vw_student_quiz_performance WHERE quiz_id = ? ORDER BY percentage DESC",
    [$quizId]
);
?>

<!-- Display analytics -->
<div class="analytics-grid">
    <div class="stat-card">
        <h3>Total Questions</h3>
        <p class="stat-value"><?= $quizSummary['total_questions'] ?></p>
    </div>
    <div class="stat-card">
        <h3>Total Attempts</h3>
        <p class="stat-value"><?= $quizSummary['total_attempts'] ?></p>
    </div>
    <div class="stat-card">
        <h3>Average Score</h3>
        <p class="stat-value"><?= round($quizSummary['avg_points_per_question'], 2) ?></p>
    </div>
</div>

<!-- Question Difficulty Chart -->
<div class="card">
    <div class="card-header">
        <h3>Question Difficulty Analysis</h3>
    </div>
    <div class="card-body">
        <?php foreach ($questionAnalysis as $q): ?>
        <div class="question-stat">
            <div class="question-text"><?= e(substr($q['question_text'], 0, 80)) ?>...</div>
            <div class="stat-bar">
                <div class="stat-fill" style="width: <?= $q['success_rate_percentage'] ?>%"></div>
            </div>
            <div class="stat-label"><?= round($q['success_rate_percentage']) ?>% success rate</div>
        </div>
        <?php endforeach; ?>
    </div>
</div>
```

---

## 📈 BENEFITS YOU GET

### For Instructors:
✅ Create detailed quizzes with multiple question types
✅ Question bank (reuse questions)
✅ See which questions are too hard/easy
✅ Auto-grading for multiple choice
✅ Detailed student performance analytics

### For Students:
✅ Better quiz experience
✅ See which questions you got wrong
✅ Learn from explanations (future feature)
✅ Fair grading

### For Deans:
✅ Analytics on quiz performance across department
✅ Identify struggling students early
✅ Monitor teaching effectiveness

### For Your Capstone:
✅ Professional-level database design
✅ Complex relationships (FK constraints)
✅ Stored procedures & triggers
✅ Views for analytics
✅ Data integrity via transactions

---

## ⏱️ TIME ESTIMATES

| Task | Time |
|------|------|
| Database migration | 5 min |
| Test migration | 5 min |
| Create quiz-questions.php | 2 hours |
| Update take-quiz.php | 1 hour |
| Update quiz-results.php | 1 hour |
| Testing | 1 hour |
| **Total** | **5-6 hours** |

---

## 🧪 TESTING CHECKLIST

After implementation, test:

- [ ] Create a new quiz with 5 questions
- [ ] Add multiple choice questions with 4 options
- [ ] Add true/false questions
- [ ] Add short answer questions
- [ ] Take the quiz as a student
- [ ] Verify auto-grading works for MC
- [ ] Check quiz results show correct score
- [ ] Verify question analytics view works
- [ ] Check triggers updated question_count
- [ ] Test stored procedure sp_grade_quiz_attempt

---

## 🎉 YOU'RE DONE!

Your quiz system is now **capstone-level quality**!

**Next Steps:**
1. Run the migration
2. Update the PHP pages
3. Test thoroughly
4. Move to Phase 2 (Progress Tracking)

**Questions?** Check the comments in the migration SQL file or refer to the new table structures above.
