<?php
/**
 * CIT-LMS - Quiz Result Page
 * Shows quiz attempt results with score and answer review
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('student');

$userId = Auth::id();
$attemptId = $_GET['id'] ?? 0;

if (!$attemptId) {
    header('Location: my-subjects.php');
    exit;
}

// Get attempt with quiz info
$attempt = db()->fetchOne(
    "SELECT
        qa.*,
        q.quiz_id,
        q.quiz_title,
        q.passing_rate,
        q.show_answers,
        ss.subject_offered_id as subject_offering_id,
        s.subject_code,
        s.subject_name
    FROM student_quiz_attempts qa
    JOIN quiz q ON qa.quiz_id = q.quiz_id
    JOIN subject s ON q.subject_id = s.subject_id
    JOIN subject_offered so ON so.subject_id = s.subject_id
    JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.user_student_id = qa.user_student_id
    WHERE qa.attempt_id = ? AND qa.user_student_id = ? AND ss.status = 'enrolled'
    LIMIT 1",
    [$attemptId, $userId]
);

if (!$attempt) {
    header('Location: my-subjects.php');
    exit;
}

// Get subject_offering_id - always use the one from the query
$subjectOfferingId = $attempt['subject_offering_id'] ?? null;

// If still not available, force fetch
if (!$subjectOfferingId) {
    $subjectOffering = db()->fetchOne(
        "SELECT ss.subject_offered_id
         FROM quiz q
         JOIN subject s ON q.subject_id = s.subject_id
         JOIN subject_offered so ON so.subject_id = s.subject_id
         JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
         WHERE q.quiz_id = ? AND ss.user_student_id = ? AND ss.status = 'enrolled'
         LIMIT 1",
        [$attempt['quiz_id'], $userId]
    );
    if ($subjectOffering) {
        $subjectOfferingId = $subjectOffering['subject_offered_id'];
    }
}

$passed = $attempt['percentage'] >= $attempt['passing_rate'];

// Check if this is a pre-test or post-test and get linked quiz info
$quizInfo = db()->fetchOne(
    "SELECT quiz_type, linked_quiz_id, require_lessons FROM quiz WHERE quiz_id = ?",
    [$attempt['quiz_id']]
);

$isPreTest = ($quizInfo['quiz_type'] ?? '') === 'pre_test';
$isPostTest = ($quizInfo['quiz_type'] ?? '') === 'post_test';
$linkedQuizId = $quizInfo['linked_quiz_id'] ?? null;

// If this is a pre-test and there's a linked post-test, get comparison data
$preTestComparison = null;
if ($isPostTest && $linkedQuizId) {
    $preTestAttempt = db()->fetchOne(
        "SELECT percentage, passed FROM student_quiz_attempts
         WHERE quiz_id = ? AND user_student_id = ? AND status = 'completed'
         ORDER BY attempt_number ASC LIMIT 1",
        [$linkedQuizId, $userId]
    );
    if ($preTestAttempt) {
        $preTestComparison = [
            'pretest_score' => $preTestAttempt['percentage'],
            'posttest_score' => $attempt['percentage'],
            'improvement' => $attempt['percentage'] - $preTestAttempt['percentage']
        ];
    }
}

// If this is a pre-test, check what the student needs to do next
$nextSteps = null;
if ($isPreTest) {
    if ($passed) {
        // Passed pre-test, can go directly to post-test
        if ($linkedQuizId) {
            $postTest = db()->fetchOne("SELECT quiz_id, quiz_title FROM quiz WHERE quiz_id = ?", [$linkedQuizId]);
            $nextSteps = [
                'type' => 'post_test_available',
                'quiz_id' => $postTest['quiz_id'],
                'quiz_title' => $postTest['quiz_title']
            ];
        }
    } else {
        // Failed pre-test, needs to complete lessons first
        $totalLessons = db()->fetchOne(
            "SELECT COUNT(*) as count FROM lessons WHERE subject_id = (SELECT subject_id FROM quiz WHERE quiz_id = ?)",
            [$attempt['quiz_id']]
        )['count'] ?? 0;

        $completedLessons = db()->fetchOne(
            "SELECT COUNT(*) as count FROM student_progress sp
             JOIN lessons l ON sp.lessons_id = l.lessons_id
             WHERE sp.user_student_id = ? AND sp.status = 'completed'
             AND l.subject_id = (SELECT subject_id FROM quiz WHERE quiz_id = ?)",
            [$userId, $attempt['quiz_id']]
        )['count'] ?? 0;

        $nextSteps = [
            'type' => 'lessons_required',
            'completed' => $completedLessons,
            'total' => $totalLessons
        ];
    }
}

// Get questions with user's answers (matches Phase 1 migration structure)
$questions = db()->fetchAll(
    "SELECT
        q.questions_id,
        q.question_text,
        q.question_type,
        q.points,
        q.order_number as question_order,
        sqa.selected_option_id as selected_choice_id,
        sqa.answer_text,
        (sqa.points_earned > 0) as is_correct,
        sqa.points_earned
    FROM quiz_questions q
    LEFT JOIN student_quiz_answers sqa ON q.questions_id = sqa.questions_id AND sqa.attempt_id = ?
    WHERE q.quiz_id = ?
    ORDER BY q.order_number",
    [$attemptId, $attempt['quiz_id']]
);

// Get choices for each question (matches Phase 1 migration structure)
foreach ($questions as &$q) {
    $q['choices'] = db()->fetchAll(
        "SELECT option_id as choice_id, option_text as choice_text, is_correct
         FROM question_option
         WHERE quiz_question_id = ?
         ORDER BY order_number",
        [$q['questions_id']]
    );
}
unset($q); // Destroy reference to prevent bugs

// Calculate stats
$totalQuestions = count($questions);
$correctCount = count(array_filter($questions, fn($q) => $q['is_correct']));
$totalPoints = $attempt['total_points'];
$earnedPoints = $attempt['earned_points'];

// Format time taken
$timeTaken = $attempt['time_spent'];
$minutes = floor($timeTaken / 60);
$seconds = $timeTaken % 60;
$timeFormatted = $minutes . ':' . str_pad($seconds, 2, '0', STR_PAD_LEFT);

$pageTitle = 'Quiz Result';
$currentPage = 'quizzes';

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>
    
    <div class="page-content">
        
        <!-- Back Link -->
        <div class="page-top">
            <a href="quizzes.php" class="back-link">
                ← Back to Quizzes
            </a>
        </div>
        
        <!-- Result Header -->
        <div class="result-header <?= $passed ? 'passed' : 'failed' ?>">
            <div class="result-icon">
                <?= $passed ? '🎉' : '📝' ?>
            </div>
            <div class="result-info">
                <span class="subj-code"><?= e($attempt['subject_code']) ?></span>
                <h1><?= e($attempt['quiz_title']) ?></h1>
                <p class="result-status">
                    <?= $passed ? 'Congratulations! You passed!' : 'You did not pass. Keep trying!' ?>
                </p>
            </div>
            <div class="result-score">
                <div class="score-circle <?= $passed ? 'passed' : 'failed' ?>">
                    <span class="score-value"><?= round($attempt['percentage']) ?>%</span>
                    <span class="score-label">Score</span>
                </div>
            </div>
        </div>
        
        <!-- Stats Cards -->
        <div class="stats-row">
            <div class="stat-card">
                <span class="stat-icon">✅</span>
                <div class="stat-info">
                    <span class="stat-value"><?= $correctCount ?>/<?= $totalQuestions ?></span>
                    <span class="stat-label">Correct Answers</span>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">⭐</span>
                <div class="stat-info">
                    <span class="stat-value"><?= $earnedPoints ?>/<?= $totalPoints ?></span>
                    <span class="stat-label">Points Earned</span>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">⏱️</span>
                <div class="stat-info">
                    <span class="stat-value"><?= $timeFormatted ?></span>
                    <span class="stat-label">Time Taken</span>
                </div>
            </div>
            <div class="stat-card">
                <span class="stat-icon">🎯</span>
                <div class="stat-info">
                    <span class="stat-value"><?= $attempt['passing_rate'] ?>%</span>
                    <span class="stat-label">Passing Score</span>
                </div>
            </div>
        </div>
        
        <!-- Pre-Test/Post-Test Context -->
        <?php if ($isPreTest && $nextSteps): ?>
        <div class="next-steps-section">
            <?php if ($nextSteps['type'] === 'post_test_available'): ?>
                <div class="next-steps-card success">
                    <div class="next-icon">🎯</div>
                    <div class="next-info">
                        <h3>Great Job! You can proceed to the Post-Test</h3>
                        <p>Since you passed the pre-test, you can go directly to the post-test without completing the lessons.</p>
                    </div>
                    <a href="take-quiz.php?id=<?= $nextSteps['quiz_id'] ?>" class="btn-next">
                        Take Post-Test →
                    </a>
                </div>
            <?php elseif ($nextSteps['type'] === 'lessons_required'): ?>
                <div class="next-steps-card warning">
                    <div class="next-icon">📚</div>
                    <div class="next-info">
                        <h3>Complete the Lessons to Unlock the Post-Test</h3>
                        <p>Study the subject lessons to prepare for the post-test and improve your score.</p>
                        <div class="lessons-progress-mini">
                            <div class="progress-bar-mini">
                                <div class="progress-fill-mini" style="width: <?= $nextSteps['total'] > 0 ? ($nextSteps['completed'] / $nextSteps['total'] * 100) : 0 ?>%"></div>
                            </div>
                            <span><?= $nextSteps['completed'] ?> / <?= $nextSteps['total'] ?> Lessons Completed</span>
                        </div>
                    </div>
                    <a href="lessons.php?id=<?= $subjectOfferingId ?>" class="btn-next warning">
                        Go to Lessons →
                    </a>
                </div>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <?php if ($isPostTest && $preTestComparison): ?>
        <div class="comparison-section">
            <h2>📊 Your Learning Progress</h2>
            <div class="comparison-box">
                <div class="comparison-item">
                    <span class="comp-label">Pre-Test Score</span>
                    <span class="comp-score"><?= number_format($preTestComparison['pretest_score'], 1) ?>%</span>
                </div>
                <div class="comparison-arrow">
                    <?php if ($preTestComparison['improvement'] > 0): ?>
                        <span class="arrow-icon up">↑</span>
                        <span class="improvement-value positive">+<?= number_format($preTestComparison['improvement'], 1) ?>%</span>
                    <?php elseif ($preTestComparison['improvement'] < 0): ?>
                        <span class="arrow-icon down">↓</span>
                        <span class="improvement-value negative"><?= number_format($preTestComparison['improvement'], 1) ?>%</span>
                    <?php else: ?>
                        <span class="arrow-icon">→</span>
                        <span class="improvement-value">No Change</span>
                    <?php endif; ?>
                </div>
                <div class="comparison-item">
                    <span class="comp-label">Post-Test Score</span>
                    <span class="comp-score highlight"><?= number_format($preTestComparison['posttest_score'], 1) ?>%</span>
                </div>
            </div>
            <?php if ($preTestComparison['improvement'] > 0): ?>
            <div class="improvement-message success">
                Excellent! You improved by <?= number_format($preTestComparison['improvement'], 1) ?>% after completing the lessons!
            </div>
            <?php endif; ?>
            <a href="progress-comparison.php?id=<?= $subjectOfferingId ?>" class="view-progress-link">
                View Full Progress Report →
            </a>
        </div>
        <?php endif; ?>

        <!-- Answer Review -->
        <?php if ($attempt['show_answers']): ?>
        <div class="review-section">
            <h2>📋 Answer Review</h2>
            
            <div class="questions-list">
                <?php foreach ($questions as $index => $q): 
                    $isCorrect = $q['is_correct'];
                ?>
                <div class="question-card <?= $isCorrect ? 'correct' : 'incorrect' ?>">
                    <div class="question-header">
                        <span class="question-num">Question <?= $index + 1 ?></span>
                        <span class="question-result <?= $isCorrect ? 'correct' : 'incorrect' ?>">
                            <?= $isCorrect ? '✓ Correct' : '✗ Incorrect' ?>
                            <span class="points">(<?= $q['points_earned'] ?? 0 ?>/<?= $q['points'] ?> pts)</span>
                        </span>
                    </div>
                    
                    <div class="question-text">
                        <?= nl2br(e($q['question_text'])) ?>
                    </div>
                    
                    <div class="choices-list">
                        <?php foreach ($q['choices'] as $choice): 
                            $isSelected = $choice['choice_id'] == $q['selected_choice_id'];
                            $isCorrectChoice = $choice['is_correct'];
                            
                            $choiceClass = '';
                            if ($isSelected && $isCorrectChoice) {
                                $choiceClass = 'selected-correct';
                            } elseif ($isSelected && !$isCorrectChoice) {
                                $choiceClass = 'selected-incorrect';
                            } elseif ($isCorrectChoice) {
                                $choiceClass = 'correct-answer';
                            }
                        ?>
                        <div class="choice-item <?= $choiceClass ?>">
                            <span class="choice-marker">
                                <?php if ($isSelected && $isCorrectChoice): ?>
                                    ✓
                                <?php elseif ($isSelected && !$isCorrectChoice): ?>
                                    ✗
                                <?php elseif ($isCorrectChoice): ?>
                                    ✓
                                <?php else: ?>
                                    ○
                                <?php endif; ?>
                            </span>
                            <span class="choice-text"><?= e($choice['choice_text']) ?></span>
                            <?php if ($isSelected): ?>
                                <span class="your-answer">Your answer</span>
                            <?php endif; ?>
                            <?php if ($isCorrectChoice && !$isSelected): ?>
                                <span class="correct-label">Correct answer</span>
                            <?php endif; ?>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php else: ?>
        <div class="no-review-msg">
            <span>🔒</span>
            <p>Answer review is not available for this quiz.</p>
        </div>
        <?php endif; ?>
        
        <!-- Actions -->
        <div class="result-actions">
            <a href="quizzes.php" class="btn-secondary">
                Back to Quizzes
            </a>
            <?php if (!$passed): ?>
            <a href="take-quiz.php?id=<?= $attempt['quiz_id'] ?>" class="btn-primary">
                Try Again →
            </a>
            <?php endif; ?>
        </div>
        
    </div>
</main>

<style>
/* Quiz Result Page Styles */

.page-top { margin-bottom: 16px; }
.back-link {
    color: #16a34a;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
}
.back-link:hover { text-decoration: underline; }

/* Result Header */
.result-header {
    background: #fff;
    border: 1px solid #f5f0e8;
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 24px;
}
.result-header.passed {
    background: linear-gradient(135deg, #dcfce7 0%, #fff 100%);
    border-color: #bbf7d0;
}
.result-header.failed {
    background: linear-gradient(135deg, #fee2e2 0%, #fff 100%);
    border-color: #fecaca;
}

.result-icon {
    font-size: 64px;
}

.result-info { flex: 1; }
.subj-code {
    display: inline-block;
    background: #16a34a;
    color: #fff;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
}
.result-info h1 {
    font-size: 24px;
    color: #1c1917;
    margin: 0 0 8px;
}
.result-status {
    font-size: 16px;
    margin: 0;
}
.result-header.passed .result-status { color: #16a34a; }
.result-header.failed .result-status { color: #dc2626; }

.score-circle {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}
.score-circle.passed {
    background: #16a34a;
    box-shadow: 0 8px 24px rgba(22, 163, 74, 0.3);
}
.score-circle.failed {
    background: #dc2626;
    box-shadow: 0 8px 24px rgba(220, 38, 38, 0.3);
}
.score-value {
    font-size: 32px;
    font-weight: 700;
    color: #fff;
}
.score-label {
    font-size: 12px;
    color: rgba(255,255,255,0.8);
}

/* Stats Row */
.stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}
.stat-card {
    background: #fff;
    border: 1px solid #f5f0e8;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 14px;
}
.stat-icon {
    font-size: 28px;
}
.stat-value {
    display: block;
    font-size: 22px;
    font-weight: 700;
    color: #1c1917;
}
.stat-label {
    font-size: 13px;
    color: #78716c;
}

/* Review Section */
.review-section {
    margin-bottom: 24px;
}
.review-section h2 {
    font-size: 18px;
    color: #1c1917;
    margin-bottom: 16px;
}

.questions-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.question-card {
    background: #fff;
    border: 1px solid #f5f0e8;
    border-radius: 12px;
    padding: 24px;
    }
.question-card.correct { border-left-color: #16a34a; }
.question-card.incorrect { border-left-color: #dc2626; }

.question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}
.question-num {
    font-weight: 600;
    color: #57534e;
    font-size: 14px;
}
.question-result {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
}
.question-result.correct { color: #16a34a; }
.question-result.incorrect { color: #dc2626; }
.question-result .points {
    font-weight: 400;
    color: #78716c;
}

.question-text {
    font-size: 15px;
    color: #1c1917;
    line-height: 1.6;
    margin-bottom: 16px;
}

.choices-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.choice-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #fdfbf7;
    border: 1px solid #f5f0e8;
    border-radius: 8px;
    font-size: 14px;
}
.choice-item.selected-correct {
    background: #dcfce7;
    border-color: #16a34a;
}
.choice-item.selected-incorrect {
    background: #fee2e2;
    border-color: #dc2626;
}
.choice-item.correct-answer {
    background: #dcfce7;
    border-color: #bbf7d0;
}

.choice-marker {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    background: #e7e5e4;
    color: #78716c;
}
.selected-correct .choice-marker {
    background: #16a34a;
    color: #fff;
}
.selected-incorrect .choice-marker {
    background: #dc2626;
    color: #fff;
}
.correct-answer .choice-marker {
    background: #16a34a;
    color: #fff;
}

.choice-text { flex: 1; color: #1c1917; }

.your-answer {
    font-size: 11px;
    padding: 2px 8px;
    background: #1c1917;
    color: #fff;
    border-radius: 4px;
}
.correct-label {
    font-size: 11px;
    padding: 2px 8px;
    background: #16a34a;
    color: #fff;
    border-radius: 4px;
}

/* No Review Message */
.no-review-msg {
    text-align: center;
    padding: 48px;
    background: #fff;
    border: 1px solid #f5f0e8;
    border-radius: 12px;
    margin-bottom: 24px;
}
.no-review-msg span {
    font-size: 48px;
    display: block;
    margin-bottom: 12px;
    opacity: 0.5;
}
.no-review-msg p {
    color: #78716c;
    margin: 0;
}

/* Actions */
.result-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
}
.btn-secondary {
    padding: 14px 28px;
    background: #fff;
    border: 1px solid #e7e5e4;
    border-radius: 10px;
    font-size: 15px;
    color: #57534e;
    text-decoration: none;
    transition: all 0.2s;
}
.btn-secondary:hover { border-color: #16a34a; color: #16a34a; }
.btn-primary {
    padding: 14px 28px;
    background: #16a34a;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    text-decoration: none;
    transition: all 0.2s;
}
.btn-primary:hover { background: #15803d; }

/* Responsive */
@media (max-width: 768px) {
    .result-header {
        flex-direction: column;
        text-align: center;
    }
    .stats-row {
        grid-template-columns: repeat(2, 1fr);
    }
    .result-actions {
        flex-direction: column;
    }
    .btn-secondary, .btn-primary {
        text-align: center;
    }
}
@media (max-width: 480px) {
    .stats-row {
        grid-template-columns: 1fr;
    }
}

/* Pre-Test/Post-Test Next Steps */
.next-steps-section {
    margin-bottom: 24px;
}
.next-steps-card {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #f5f0e8;
}
.next-steps-card.success {
    background: linear-gradient(135deg, #dcfce7 0%, #fff 100%);
    border-color: #bbf7d0;
}
.next-steps-card.warning {
    background: linear-gradient(135deg, #fef3c7 0%, #fff 100%);
    border-color: #fde68a;
}
.next-icon {
    font-size: 48px;
    flex-shrink: 0;
}
.next-info {
    flex: 1;
}
.next-info h3 {
    font-size: 16px;
    margin: 0 0 8px;
    color: #1c1917;
}
.next-info p {
    font-size: 14px;
    color: #57534e;
    margin: 0;
}
.lessons-progress-mini {
    margin-top: 12px;
}
.progress-bar-mini {
    height: 8px;
    background: #e7e5e4;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 6px;
}
.progress-fill-mini {
    height: 100%;
    background: linear-gradient(90deg, #16a34a, #22c55e);
}
.lessons-progress-mini span {
    font-size: 12px;
    color: #16a34a;
    font-weight: 600;
}
.btn-next {
    background: #16a34a;
    color: #fff;
    padding: 14px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition: 0.2s;
}
.btn-next:hover {
    background: #15803d;
}
.btn-next.warning {
    background: #f59e0b;
}
.btn-next.warning:hover {
    background: #d97706;
}

/* Post-Test Comparison */
.comparison-section {
    background: #fff;
    border: 1px solid #f5f0e8;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    text-align: center;
}
.comparison-section h2 {
    font-size: 18px;
    margin: 0 0 20px;
    color: #1c1917;
}
.comparison-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 32px;
    margin-bottom: 16px;
}
.comparison-item {
    text-align: center;
}
.comp-label {
    display: block;
    font-size: 12px;
    color: #78716c;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 8px;
}
.comp-score {
    font-size: 36px;
    font-weight: 700;
    color: #57534e;
}
.comp-score.highlight {
    color: #16a34a;
}
.comparison-arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
.arrow-icon {
    font-size: 28px;
    font-weight: bold;
}
.arrow-icon.up { color: #16a34a; }
.arrow-icon.down { color: #dc2626; }
.improvement-value {
    font-size: 14px;
    font-weight: 600;
}
.improvement-value.positive { color: #16a34a; }
.improvement-value.negative { color: #dc2626; }
.improvement-message {
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 16px;
}
.improvement-message.success {
    background: #dcfce7;
    color: #16a34a;
}
.view-progress-link {
    color: #16a34a;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
}
.view-progress-link:hover {
    text-decoration: underline;
}

@media (max-width: 600px) {
    .next-steps-card {
        flex-direction: column;
        text-align: center;
    }
    .comparison-box {
        flex-direction: column;
        gap: 16px;
    }
    .comparison-arrow {
        transform: rotate(90deg);
    }
}
</style>

<?php include __DIR__ . '/../../includes/footer.php'; ?>