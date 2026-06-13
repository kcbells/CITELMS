<?php
/**
 * Quizzes Page - Clean Green Theme
 * Shows all quizzes grouped by subject with collapsible sections
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('student');

$userId = Auth::id();
$subjectOfferingId = $_GET['id'] ?? null;


if (!$subjectOfferingId) {
    // Get all quizzes from all enrolled subjects
    $quizzes = db()->fetchAll(
        "SELECT
            q.quiz_id,
            q.quiz_title as title,
            q.quiz_description as description,
            q.time_limit,
            q.passing_rate,
            q.max_attempts,
            q.subject_id,
            q.created_at,
            q.quiz_type,
            q.linked_quiz_id,
            s.subject_code,
            s.subject_name,
            so.subject_offered_id,
            (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.quiz_id) as no_of_items,
            (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ?) as attempts_used,
            (SELECT MAX(percentage) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ? AND status = 'completed') as best_score,
            (SELECT attempt_id FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ? AND status = 'completed' ORDER BY percentage DESC LIMIT 1) as best_attempt_id
        FROM quiz q
        JOIN subject s ON q.subject_id = s.subject_id
        JOIN subject_offered so ON so.subject_id = s.subject_id
        JOIN student_subject ss ON ss.subject_offered_id = so.subject_offered_id
        WHERE ss.user_student_id = ? AND ss.status = 'enrolled' AND q.status = 'published'
        ORDER BY s.subject_code, q.quiz_type, q.created_at ASC",
        [$userId, $userId, $userId, $userId]
    );

    $pageTitle = 'All Quizzes';
    $currentPage = 'quizzes';
    $subject = null;
    $subjectId = null;

    // Group quizzes by subject
    $quizzesBySubject = [];
    foreach ($quizzes as $quiz) {
        $key = $quiz['subject_offered_id'];
        if (!isset($quizzesBySubject[$key])) {
            $quizzesBySubject[$key] = [
                'subject_code' => $quiz['subject_code'],
                'subject_name' => $quiz['subject_name'],
                'subject_id' => $quiz['subject_id'],
                'subject_offered_id' => $quiz['subject_offered_id'],
                'quizzes' => []
            ];
        }
        $quizzesBySubject[$key]['quizzes'][] = $quiz;
    }

} else {
    // Show quizzes for specific subject
    $enrollment = db()->fetchOne(
        "SELECT ss.*, so.subject_id FROM student_subject ss
         JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
         WHERE ss.user_student_id = ? AND ss.subject_offered_id = ? AND ss.status = 'enrolled'",
        [$userId, $subjectOfferingId]
    );

    if (!$enrollment) {
        header('Location: my-subjects.php');
        exit;
    }

    $subjectId = $enrollment['subject_id'];

    $subject = db()->fetchOne(
        "SELECT s.*, CONCAT(u.first_name, ' ', u.last_name) as instructor_name
         FROM subject s
         LEFT JOIN faculty_subject fs ON fs.subject_offered_id = ?
         LEFT JOIN users u ON fs.user_teacher_id = u.users_id
         WHERE s.subject_id = ?",
        [$subjectOfferingId, $subjectId]
    );

    if (!$subject) {
        header('Location: my-subjects.php');
        exit;
    }

    $quizzes = db()->fetchAll(
        "SELECT
            q.quiz_id,
            q.quiz_title as title,
            q.quiz_description as description,
            q.time_limit,
            q.passing_rate,
            q.max_attempts,
            q.subject_id,
            q.created_at,
            q.quiz_type,
            q.linked_quiz_id,
            (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.quiz_id) as no_of_items,
            (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ?) as attempts_used,
            (SELECT MAX(percentage) FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ? AND status = 'completed') as best_score,
            (SELECT attempt_id FROM student_quiz_attempts WHERE quiz_id = q.quiz_id AND user_student_id = ? AND status = 'completed' ORDER BY percentage DESC LIMIT 1) as best_attempt_id
        FROM quiz q
        WHERE q.subject_id = ? AND q.status = 'published'
        ORDER BY
            CASE q.quiz_type
                WHEN 'pre_test' THEN 1
                WHEN 'post_test' THEN 3
                ELSE 2
            END,
            q.created_at ASC",
        [$userId, $userId, $userId, $subjectId]
    );

    $pageTitle = $subject['subject_code'] . ' - Quizzes';
    $currentPage = 'quizzes';
}

// Calculate progress for subject view
$totalQuizzes = count($quizzes);
$completedQuizzes = count(array_filter($quizzes, fn($q) => $q['attempts_used'] > 0));
$passedQuizzes = count(array_filter($quizzes, fn($q) => isset($q['best_score']) && $q['best_score'] >= $q['passing_rate']));

// Get lesson completion data for post-test unlock logic
function getLessonProgress($userId, $subjectId) {
    $totalLessons = db()->fetchOne(
        "SELECT COUNT(*) as count FROM lessons WHERE subject_id = ? AND status = 'published'",
        [$subjectId]
    )['count'] ?? 0;

    $completedLessons = db()->fetchOne(
        "SELECT COUNT(*) as count FROM student_progress sp
         JOIN lessons l ON sp.lessons_id = l.lessons_id
         WHERE sp.user_student_id = ? AND l.subject_id = ? AND sp.status = 'completed'",
        [$userId, $subjectId]
    )['count'] ?? 0;

    return [
        'total' => $totalLessons,
        'completed' => $completedLessons,
        'all_done' => $totalLessons > 0 && $completedLessons >= $totalLessons
    ];
}

// Get pre-test status for a subject
function getPreTestStatus($userId, $subjectId, $quizzes) {
    foreach ($quizzes as $q) {
        if (($q['quiz_type'] ?? '') === 'pre_test' && ($q['subject_id'] ?? 0) == $subjectId) {
            $passed = isset($q['best_score']) && $q['best_score'] >= $q['passing_rate'];
            return [
                'exists' => true,
                'taken' => $q['attempts_used'] > 0,
                'passed' => $passed,
                'score' => $q['best_score'] ?? 0
            ];
        }
    }
    return ['exists' => false, 'taken' => false, 'passed' => false, 'score' => 0];
}

// Calculate subject quiz stats
function getSubjectQuizStats($quizzes) {
    $total = count($quizzes);
    $completed = count(array_filter($quizzes, fn($q) => $q['attempts_used'] > 0));
    $passed = count(array_filter($quizzes, fn($q) => isset($q['best_score']) && $q['best_score'] >= $q['passing_rate']));
    return ['total' => $total, 'completed' => $completed, 'passed' => $passed];
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="quizzes-wrap">

        <?php if ($subject): ?>
            <!-- Back Link -->
            <a href="my-subjects.php" class="back-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back to Subjects
            </a>

            <!-- Subject Header -->
            <div class="subject-header">
                <div class="header-info">
                    <span class="subject-code"><?= e($subject['subject_code']) ?></span>
                    <h1><?= e($subject['subject_name']) ?></h1>
                    <div class="instructor">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <?= e($subject['instructor_name'] ?? 'TBA') ?>
                    </div>
                </div>
                <a href="learning-hub.php?id=<?= $subjectOfferingId ?>" class="btn-hub">
                    View Learning Path
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </a>
            </div>

            <!-- Navigation Tabs -->
            <div class="nav-tabs">
                <a href="learning-hub.php?id=<?= $subjectOfferingId ?>" class="tab">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    Learning Hub
                </a>
                <a href="lessons.php?id=<?= $subjectOfferingId ?>" class="tab">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    Lessons
                </a>
                <a href="quizzes.php?id=<?= $subjectOfferingId ?>" class="tab active">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 11l3 3L22 4"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    Quizzes
                </a>
                <a href="announcements.php?id=<?= $subjectOfferingId ?>" class="tab">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    Announcements
                </a>
            </div>

            <!-- Learning Flow Notice -->
            <?php
            $lessonProgress = getLessonProgress($userId, $subjectId);
            $preTestStatus = getPreTestStatus($userId, $subjectId, $quizzes);
            ?>
            <?php if ($preTestStatus['exists'] && !$preTestStatus['taken']): ?>
            <div class="flow-notice info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4M12 8h.01"/>
                </svg>
                <div class="notice-content">
                    <strong>Start with the Pre-Test!</strong>
                    <span>Take the pre-test first to assess your knowledge. If you pass, you can skip the lessons and go directly to the post-test.</span>
                </div>
            </div>
            <?php elseif ($preTestStatus['exists'] && $preTestStatus['taken'] && !$preTestStatus['passed'] && !$lessonProgress['all_done']): ?>
            <div class="flow-notice warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <div class="notice-content">
                    <strong>Complete the Lessons</strong>
                    <span>You need to complete all <?= $lessonProgress['total'] ?> lessons (<?= $lessonProgress['completed'] ?> done) to unlock the Post-Test.</span>
                    <a href="lessons.php?id=<?= $subjectOfferingId ?>">Go to Lessons</a>
                </div>
            </div>
            <?php endif; ?>

            <!-- Single Subject Quizzes -->
            <?php if (empty($quizzes)): ?>
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 11l3 3L22 4"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    <h3>No Quizzes Available</h3>
                    <p>Your instructor hasn't posted any quizzes yet.</p>
                </div>
            <?php else: ?>
                <div class="quizzes-list">
                    <?php foreach ($quizzes as $quiz): ?>
                        <?php echo renderQuizCard($quiz, $userId, $quizzes, $subjectId); ?>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>

        <?php else: ?>
            <!-- All Quizzes View - Organized by Subject -->
            <div class="page-header">
                <h1>All Quizzes</h1>
                <p>View all quizzes from your enrolled subjects</p>
            </div>

            <?php if (empty($quizzesBySubject)): ?>
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 11l3 3L22 4"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    <h3>No Quizzes Available</h3>
                    <p>Your instructors haven't posted any quizzes yet.</p>
                </div>
            <?php else: ?>
                <div class="subjects-accordion">
                    <?php foreach ($quizzesBySubject as $subjectData):
                        $stats = getSubjectQuizStats($subjectData['quizzes']);
                    ?>
                    <div class="subject-section">
                        <div class="section-header" onclick="toggleSection(this)">
                            <div class="section-info">
                                <span class="subject-badge"><?= e($subjectData['subject_code']) ?></span>
                                <span class="subject-name"><?= e($subjectData['subject_name']) ?></span>
                            </div>
                            <div class="section-stats">
                                <span class="stat-pill"><?= $stats['total'] ?> Quiz<?= $stats['total'] != 1 ? 'zes' : '' ?></span>
                                <?php if ($stats['passed'] > 0): ?>
                                <span class="stat-pill passed"><?= $stats['passed'] ?> Passed</span>
                                <?php endif; ?>
                                <?php if ($stats['completed'] > 0 && $stats['completed'] != $stats['passed']): ?>
                                <span class="stat-pill attempted"><?= $stats['completed'] - $stats['passed'] ?> Attempted</span>
                                <?php endif; ?>
                            </div>
                            <div class="section-actions">
                                <a href="learning-hub.php?id=<?= $subjectData['subject_offered_id'] ?>" class="hub-link" onclick="event.stopPropagation()">View Learning Path</a>
                                <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M6 9l6 6 6-6"/>
                                </svg>
                            </div>
                        </div>
                        <div class="section-content">
                            <div class="quizzes-list">
                                <?php foreach ($subjectData['quizzes'] as $quiz): ?>
                                    <?php echo renderQuizCard($quiz, $userId, $subjectData['quizzes'], $subjectData['subject_id']); ?>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        <?php endif; ?>
    </div>
</main>

<?php
// Helper function to render quiz card
function renderQuizCard($quiz, $userId, $allQuizzes, $subjectId) {
    $attemptsLeft = ($quiz['max_attempts'] ?? 3) - $quiz['attempts_used'];
    $hasPassed = isset($quiz['best_score']) && $quiz['best_score'] >= $quiz['passing_rate'];
    $canTake = $attemptsLeft > 0;
    $quizType = $quiz['quiz_type'] ?? 'regular';

    // Determine quiz status
    if ($hasPassed) { $status = 'passed'; $statusText = 'Passed'; }
    elseif ($quiz['attempts_used'] > 0) { $status = 'attempted'; $statusText = 'Attempted'; }
    else { $status = 'available'; $statusText = 'Available'; }

    // Check if post-test is locked
    $isLocked = false;
    $lockReason = '';
    if ($quizType === 'post_test') {
        $subjectLessonProgress = getLessonProgress($userId, $subjectId);
        $subjectPreTestStatus = getPreTestStatus($userId, $subjectId, $allQuizzes);

        if (!$subjectPreTestStatus['passed'] && !$subjectLessonProgress['all_done']) {
            $isLocked = true;
            if (!$subjectPreTestStatus['taken']) {
                $lockReason = 'Take the Pre-Test first or complete all lessons';
            } else {
                $lockReason = 'Complete all ' . $subjectLessonProgress['total'] . ' lessons (' . $subjectLessonProgress['completed'] . ' done)';
            }
        }
    }

    ob_start();
    ?>
    <div class="quiz-card <?= $status ?> <?= $isLocked ? 'locked' : '' ?> type-<?= $quizType ?>">
        <div class="quiz-main">
            <div class="quiz-top">
                <div class="quiz-badges">
                    <?php if ($quizType === 'pre_test'): ?>
                        <span class="type-badge pretest">PRE-TEST</span>
                    <?php elseif ($quizType === 'post_test'): ?>
                        <span class="type-badge posttest">POST-TEST</span>
                    <?php endif; ?>
                    <span class="status-badge <?= $status ?> <?= $isLocked ? 'locked' : '' ?>">
                        <?php if ($isLocked): ?>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            Locked
                        <?php else: ?>
                            <?= $statusText ?>
                        <?php endif; ?>
                    </span>
                </div>
                <h3><?= e($quiz['title']) ?></h3>
            </div>

            <?php if (!empty($quiz['description'])): ?>
                <p class="quiz-desc"><?= e($quiz['description']) ?></p>
            <?php endif; ?>

            <?php if ($isLocked): ?>
                <div class="lock-msg">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <?= e($lockReason) ?>
                </div>
            <?php endif; ?>

            <div class="quiz-meta">
                <span class="meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <?= $quiz['no_of_items'] ?> Questions
                </span>
                <span class="meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <?= $quiz['time_limit'] ?> Minutes
                </span>
                <span class="meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    Passing: <?= $quiz['passing_rate'] ?>%
                </span>
            </div>
        </div>

        <div class="quiz-side">
            <?php if ($quiz['attempts_used'] > 0): ?>
            <div class="score-box <?= $hasPassed ? 'passed' : 'failed' ?>">
                <span class="score-label">Best Score</span>
                <span class="score-value"><?= round($quiz['best_score']) ?>%</span>
            </div>
            <?php endif; ?>

            <div class="attempts-info">
                <?= $quiz['attempts_used'] ?>/<?= $quiz['max_attempts'] ?? 3 ?> Attempts Used
            </div>

            <div class="quiz-actions">
                <?php if ($isLocked): ?>
                    <span class="btn-locked">Locked</span>
                <?php elseif ($quizType === 'pre_test' && $quiz['attempts_used'] > 0): ?>
                    <span class="btn-completed">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        Completed
                    </span>
                <?php elseif ($canTake): ?>
                    <a href="take-quiz.php?id=<?= $quiz['quiz_id'] ?>" class="btn-take">
                        <?= $quiz['attempts_used'] > 0 ? 'Retry Quiz' : ($quizType === 'pre_test' ? 'Take Pre-Test' : 'Take Quiz') ?>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </a>
                <?php else: ?>
                    <span class="btn-disabled">Max attempts reached</span>
                <?php endif; ?>

                <?php if ($quiz['best_attempt_id']): ?>
                <a href="quiz-result.php?id=<?= $quiz['best_attempt_id'] ?>" class="btn-results">
                    View Results
                </a>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <?php
    return ob_get_clean();
}
?>

<style>
/* Quizzes Page - Green/Cream Theme */
.quizzes-wrap {
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
}

/* Back Link */
.back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #1B4D3E;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 20px;
}
.back-link:hover { text-decoration: underline; }

/* Page Header */
.page-header {
    margin-bottom: 24px;
}
.page-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1B4D3E;
    margin: 0 0 4px;
}
.page-header p {
    font-size: 14px;
    color: #666;
    margin: 0;
}

/* Subject Header */
.subject-header {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
}
.subject-header:hover {
    border-color: #1B4D3E;
}
.header-info h1 {
    font-size: 20px;
    font-weight: 700;
    color: #333;
    margin: 8px 0;
}
.subject-code {
    background: #1B4D3E;
    color: #fff;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
}
.instructor {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #666;
}
.instructor svg { color: #1B4D3E; }
.btn-hub {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 12px 20px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.2s;
}
.btn-hub:hover {
    background: #1B4D3E;
    color: #fff;
}

/* Navigation Tabs */
.nav-tabs {
    display: flex;
    gap: 4px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 4px;
    margin-bottom: 20px;
}
.tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    color: #666;
    transition: all 0.2s;
}
.tab:hover { background: #f5f5f5; color: #1B4D3E; }
.tab.active { background: #1B4D3E; color: #fff; }
.tab.active svg { stroke: #fff; }

/* Flow Notice */
.flow-notice {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px 20px;
    border-radius: 10px;
    margin-bottom: 20px;
}
.flow-notice.info {
    background: #E8F5E9;
    border: 1px solid #A5D6A7;
}
.flow-notice.info svg { color: #1B4D3E; }
.flow-notice.warning {
    background: #FFF8E1;
    border: 1px solid #FFE082;
}
.flow-notice.warning svg { color: #F9A825; }
.notice-content {
    font-size: 14px;
    color: #333;
    line-height: 1.5;
}
.notice-content strong {
    display: block;
    margin-bottom: 4px;
    color: #1B4D3E;
}
.notice-content a {
    color: #1B4D3E;
    font-weight: 600;
    text-decoration: none;
    margin-left: 8px;
}
.notice-content a:hover { text-decoration: underline; }

/* Subject Accordion */
.subjects-accordion {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.subject-section {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.2s;
}
.subject-section:hover {
    border-color: #1B4D3E;
}
.subject-section.collapsed .section-content {
    display: none;
}
.subject-section.collapsed .chevron {
    transform: rotate(-90deg);
}
.section-header {
    display: flex;
    align-items: center;
    padding: 18px 20px;
    background: #fafafa;
    cursor: pointer;
    gap: 16px;
    transition: all 0.2s;
}
.section-header:hover { background: #f0f0f0; }
.section-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
}
.subject-badge {
    background: #1B4D3E;
    color: #fff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
}
.subject-name {
    font-size: 16px;
    font-weight: 600;
    color: #333;
}
.section-stats {
    display: flex;
    gap: 8px;
}
.stat-pill {
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    background: #f0f0f0;
    color: #666;
}
.stat-pill.passed { background: #E8F5E9; color: #1B4D3E; }
.stat-pill.attempted { background: #FFF8E1; color: #F9A825; }
.section-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}
.hub-link {
    color: #1B4D3E;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
}
.hub-link:hover { text-decoration: underline; }
.chevron {
    color: #999;
    transition: transform 0.2s;
}
.section-content {
    padding: 20px;
    border-top: 1px solid #e8e8e8;
    background: #fff;
}

/* Quiz Cards */
.quizzes-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.quiz-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    display: flex;
    overflow: hidden;
    transition: all 0.2s;
}
.quiz-card:hover {
    border-color: #1B4D3E;
    box-shadow: 0 4px 12px rgba(27, 77, 62, 0.1);
}
.quiz-card.locked {
    opacity: 0.85;
    background: #fafafa;
}
.quiz-card.locked:hover {
    border-color: #e8e8e8;
    box-shadow: none;
}

/* Quiz Type Borders */
.quiz-card.type-pre_test { }
.quiz-card.type-post_test { }
.quiz-card.passed { border-left-color: #1B4D3E; }

.quiz-main {
    flex: 1;
    padding: 20px;
}
.quiz-top {
    margin-bottom: 10px;
}
.quiz-badges {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
}
.type-badge {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
}
.type-badge.pretest { background: #E3F2FD; color: #1565C0; }
.type-badge.posttest { background: #F3E5F5; color: #7B1FA2; }

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
}
.status-badge.available { background: #E8F5E9; color: #1B4D3E; }
.status-badge.passed { background: #E8F5E9; color: #1B4D3E; }
.status-badge.attempted { background: #FFF8E1; color: #F9A825; }
.status-badge.locked { background: #f0f0f0; color: #999; }

.quiz-top h3 {
    font-size: 16px;
    color: #333;
    margin: 0;
    font-weight: 600;
}
.quiz-desc {
    color: #666;
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.5;
}
.lock-msg {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #f5f5f5;
    border-radius: 6px;
    font-size: 12px;
    color: #666;
    margin-bottom: 12px;
}
.quiz-meta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}
.meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #666;
}
.meta-item svg { color: #1B4D3E; }

.quiz-side {
    width: 200px;
    padding: 20px;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 10px;
    border-left: 1px solid #e8e8e8;
}
.score-box {
    text-align: center;
    padding: 14px;
    border-radius: 8px;
}
.score-box.passed { background: #E8F5E9; }
.score-box.failed { background: #FFEBEE; }
.score-label {
    display: block;
    font-size: 10px;
    color: #666;
    margin-bottom: 4px;
    font-weight: 600;
    text-transform: uppercase;
}
.score-value {
    font-size: 24px;
    font-weight: 700;
    display: block;
    color: #1B4D3E;
}
.score-box.failed .score-value { color: #C62828; }

.attempts-info {
    text-align: center;
    font-size: 11px;
    color: #666;
}
.quiz-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.btn-take {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 16px;
    background: #1B4D3E;
    color: #fff;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 13px;
    transition: all 0.2s;
}
.btn-take:hover { background: #2D6A4F; }
.btn-locked, .btn-disabled {
    display: block;
    padding: 12px 16px;
    background: #e8e8e8;
    color: #999;
    border-radius: 8px;
    font-weight: 600;
    font-size: 12px;
    text-align: center;
    cursor: not-allowed;
}
.btn-completed {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 16px;
    background: #E8F5E9;
    color: #1B4D3E;
    border-radius: 8px;
    font-weight: 600;
    font-size: 12px;
}
.btn-results {
    display: block;
    padding: 10px 16px;
    background: #fff;
    border: 1px solid #e8e8e8;
    color: #666;
    border-radius: 8px;
    text-decoration: none;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
}
.btn-results:hover {
    border-color: #1B4D3E;
    color: #1B4D3E;
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 60px 24px;
    background: #fafafa;
    border: 1px dashed #ddd;
    border-radius: 12px;
}
.empty-state svg {
    color: #ccc;
    margin-bottom: 16px;
}
.empty-state h3 {
    font-size: 18px;
    font-weight: 600;
    color: #333;
    margin: 0 0 8px;
}
.empty-state p {
    font-size: 14px;
    color: #666;
    margin: 0;
}

/* Responsive */
@media (max-width: 900px) {
    .quizzes-wrap { padding: 16px; }
    .subject-header { flex-direction: column; text-align: center; }
    .btn-hub { width: 100%; justify-content: center; }
    .section-header { flex-direction: column; align-items: flex-start; }
    .section-stats { margin-top: 10px; }
    .section-actions { width: 100%; justify-content: space-between; margin-top: 10px; }
    .quiz-card { flex-direction: column; }
    .quiz-side { width: 100%; border-left: none; border-top: 1px solid #e8e8e8; }
    .nav-tabs { flex-wrap: wrap; }
    .tab { min-width: 45%; }
}
</style>

<script>
function toggleSection(header) {
    const section = header.closest('.subject-section');
    section.classList.toggle('collapsed');
}
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
