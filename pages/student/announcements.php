<?php
/**
 * Announcements Page - Clean Green Theme
 */
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('student');

$userId = Auth::id();
$subjectOfferingId = $_GET['id'] ?? null;
$pageTitle = 'Announcements';
$currentPage = 'announcements';

// Get enrolled subjects for filter
$enrolledSubjects = db()->fetchAll(
    "SELECT so.subject_offered_id as subject_offering_id, s.subject_code, s.subject_name
     FROM student_subject ss
     JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     WHERE ss.user_student_id = ? AND ss.status = 'enrolled'
     ORDER BY s.subject_code",
    [$userId]
);

// Build query based on filter
if ($subjectOfferingId) {
    $announcements = db()->fetchAll(
        "SELECT
            a.*,
            s.subject_code,
            s.subject_name,
            CONCAT(u.first_name, ' ', u.last_name) as author_name
         FROM announcement a
         LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
         LEFT JOIN subject s ON so.subject_id = s.subject_id
         LEFT JOIN users u ON a.user_id = u.users_id
         WHERE a.status = 'published' AND a.subject_offered_id = ?
         ORDER BY a.created_at DESC",
        [$subjectOfferingId]
    );

    $currentSubject = db()->fetchOne(
        "SELECT so.subject_offered_id, s.subject_code, s.subject_name
         FROM subject_offered so
         JOIN subject s ON so.subject_id = s.subject_id
         WHERE so.subject_offered_id = ?",
        [$subjectOfferingId]
    );
} else {
    $announcements = db()->fetchAll(
        "SELECT
            a.*,
            s.subject_code,
            s.subject_name,
            CONCAT(u.first_name, ' ', u.last_name) as author_name
         FROM announcement a
         LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
         LEFT JOIN subject s ON so.subject_id = s.subject_id
         LEFT JOIN users u ON a.user_id = u.users_id
         WHERE a.status = 'published'
         AND (
             a.subject_offered_id IN (
                 SELECT subject_offered_id FROM student_subject
                 WHERE user_student_id = ? AND status = 'enrolled'
             )
             OR a.subject_offered_id IS NULL
         )
         ORDER BY a.created_at DESC",
        [$userId]
    );
    $currentSubject = null;
}

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="announcements-wrap">

        <!-- Page Header -->
        <div class="page-header">
            <div class="header-left">
                <div class="header-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                </div>
                <div>
                    <h1>Announcements</h1>
                    <p><?= $currentSubject ? e($currentSubject['subject_code'] . ' - ' . $currentSubject['subject_name']) : 'All enrolled subjects' ?></p>
                </div>
            </div>

            <!-- Filter Dropdown -->
            <div class="filter-section">
                <select id="subjectFilter" onchange="filterBySubject(this.value)">
                    <option value="">All Subjects</option>
                    <?php foreach ($enrolledSubjects as $subj): ?>
                    <option value="<?= $subj['subject_offering_id'] ?>" <?= $subjectOfferingId == $subj['subject_offering_id'] ? 'selected' : '' ?>>
                        <?= e($subj['subject_code']) ?> - <?= e($subj['subject_name']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <!-- Back link if filtered -->
        <?php if ($subjectOfferingId): ?>
        <a href="announcements.php" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            View All Announcements
        </a>
        <?php endif; ?>

        <!-- Stats Summary -->
        <div class="stats-bar">
            <div class="stat-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                </svg>
                <span><strong><?= count($announcements) ?></strong> announcement<?= count($announcements) != 1 ? 's' : '' ?></span>
            </div>
            <div class="stat-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span><strong><?= count($enrolledSubjects) ?></strong> subject<?= count($enrolledSubjects) != 1 ? 's' : '' ?></span>
            </div>
        </div>

        <!-- Announcements List -->
        <div class="announcements-container">
            <?php if (empty($announcements)): ?>
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <h3>No Announcements</h3>
                    <p>There are no announcements from your enrolled subjects yet.</p>
                </div>
            <?php else: ?>
                <div class="announcements-list">
                    <?php foreach ($announcements as $ann):
                        $isNew = strtotime($ann['created_at']) > strtotime('-3 days');
                    ?>
                    <div class="announcement-card <?= $isNew ? 'is-new' : '' ?>">
                        <div class="card-header">
                            <div class="header-left-info">
                                <?php if ($ann['subject_code']): ?>
                                <span class="subject-badge"><?= e($ann['subject_code']) ?></span>
                                <?php else: ?>
                                <span class="subject-badge general">General</span>
                                <?php endif; ?>
                                <?php if ($isNew): ?>
                                <span class="new-badge">New</span>
                                <?php endif; ?>
                            </div>
                            <span class="ann-date">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                    <line x1="16" y1="2" x2="16" y2="6"/>
                                    <line x1="8" y1="2" x2="8" y2="6"/>
                                    <line x1="3" y1="10" x2="21" y2="10"/>
                                </svg>
                                <?= date('M d, Y', strtotime($ann['created_at'])) ?>
                            </span>
                        </div>

                        <h2 class="ann-title"><?= e($ann['title']) ?></h2>

                        <div class="ann-content">
                            <?= nl2br(e($ann['content'])) ?>
                        </div>

                        <div class="ann-footer">
                            <div class="author-info">
                                <div class="author-avatar">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                        <circle cx="12" cy="7" r="4"/>
                                    </svg>
                                </div>
                                <div>
                                    <span class="author-name"><?= e($ann['author_name'] ?? 'Instructor') ?></span>
                                    <span class="post-time"><?= date('g:i A', strtotime($ann['created_at'])) ?></span>
                                </div>
                            </div>
                            <?php if ($ann['subject_name']): ?>
                            <span class="subject-name"><?= e($ann['subject_name']) ?></span>
                            <?php endif; ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

    </div>
</main>

<style>
/* Announcements - Green/Cream Theme */
.announcements-wrap {
    padding: 24px;
    max-width: 900px;
    margin: 0 auto;
}

/* Page Header */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 20px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 14px;
}

.header-icon {
    width: 48px;
    height: 48px;
    background: #E8F5E9;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1B4D3E;
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

/* Filter */
.filter-section select {
    padding: 10px 16px;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    font-size: 14px;
    color: #333;
    background: #fff;
    cursor: pointer;
    min-width: 200px;
    transition: all 0.2s ease;
}

.filter-section select:focus {
    outline: none;
    border-color: #1B4D3E;
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
    margin-bottom: 16px;
    transition: all 0.2s ease;
}

.back-link:hover {
    color: #2D6A4F;
}

/* Stats Bar */
.stats-bar {
    display: flex;
    gap: 24px;
    padding: 14px 20px;
    background: #E8F5E9;
    border-radius: 10px;
    margin-bottom: 20px;
}

.stat-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #1B4D3E;
}

.stat-item svg {
    opacity: 0.7;
}

.stat-item strong {
    font-weight: 700;
}

/* Announcements List */
.announcements-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.announcement-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s ease;
}

.announcement-card:hover {
    border-color: #1B4D3E;
    box-shadow: 0 4px 12px rgba(27, 77, 62, 0.1);
}

.announcement-card.is-new {
    }

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
}

.header-left-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.subject-badge {
    background: #1B4D3E;
    color: #fff;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
}

.subject-badge.general {
    background: #666;
}

.new-badge {
    background: #E8F5E9;
    color: #1B4D3E;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}

.ann-date {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #999;
}

.ann-title {
    font-size: 18px;
    font-weight: 600;
    color: #333;
    margin: 0 0 16px;
    line-height: 1.4;
}

.ann-content {
    font-size: 15px;
    color: #555;
    line-height: 1.7;
    padding: 16px;
    background: #fafafa;
    border-radius: 8px;
    margin-bottom: 16px;
}

.ann-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 14px;
    border-top: 1px solid #f0f0f0;
}

.author-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.author-avatar {
    width: 36px;
    height: 36px;
    background: #E8F5E9;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1B4D3E;
}

.author-name {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #333;
}

.post-time {
    display: block;
    font-size: 12px;
    color: #999;
}

.subject-name {
    font-size: 13px;
    color: #666;
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
@media (max-width: 768px) {
    .announcements-wrap {
        padding: 16px;
    }

    .page-header {
        flex-direction: column;
    }

    .filter-section select {
        width: 100%;
    }

    .stats-bar {
        flex-direction: column;
        gap: 12px;
    }

    .ann-footer {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .subject-name {
        padding-left: 46px;
    }
}
</style>

<script>
function filterBySubject(subjectId) {
    if (subjectId) {
        window.location.href = 'announcements.php?id=' + subjectId;
    } else {
        window.location.href = 'announcements.php';
    }
}
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
