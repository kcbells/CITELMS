<?php
/**
 * CIT-LMS Instructor - Announcements Management
 * Post and manage class-specific or general announcements
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/auth.php';

Auth::requireRole('instructor');

$userId = Auth::id();
$pageTitle = 'Announcements';
$currentPage = 'announcements';

// Fetch instructor's active class offerings for the target dropdown
$myOfferings = db()->fetchAll(
    "SELECT so.subject_offered_id, s.subject_code, s.subject_name
     FROM faculty_subject fs
     JOIN subject_offered so ON fs.subject_offered_id = so.subject_offered_id
     JOIN subject s ON so.subject_id = s.subject_id
     WHERE fs.user_teacher_id = ? AND fs.status = 'active'
     ORDER BY s.subject_code",
    [$userId]
);

// Handle Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Create New Announcement
    if (isset($_POST['create'])) {
        $title = trim($_POST['title'] ?? '');
        $content = trim($_POST['content'] ?? '');
        $offeredId = !empty($_POST['subject_offered_id']) ? (int)$_POST['subject_offered_id'] : null;
        $status = $_POST['status'] ?? 'published';

        if (!empty($title) && !empty($content)) {
            db()->execute(
                "INSERT INTO announcement (user_id, subject_offered_id, title, content, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
                [$userId, $offeredId, $title, $content, $status]
            );
            header("Location: announcements.php?created=1");
            exit;
        }
    }

    // Delete Announcement
    if (isset($_POST['delete_id'])) {
        db()->execute(
            "DELETE FROM announcement WHERE announcement_id = ? AND user_id = ?",
            [(int)$_POST['delete_id'], $userId]
        );
        header("Location: announcements.php?deleted=1");
        exit;
    }
}

// Fetch existing announcements with subject context
$announcements = db()->fetchAll(
    "SELECT a.*, s.subject_code
     FROM announcement a
     LEFT JOIN subject_offered so ON a.subject_offered_id = so.subject_offered_id
     LEFT JOIN subject s ON so.subject_id = s.subject_id
     WHERE a.user_id = ?
     ORDER BY a.created_at DESC",
    [$userId]
);

include __DIR__ . '/../../includes/header.php';
include __DIR__ . '/../../includes/instructor_sidebar.php';
?>

<main class="main-content">
    <?php include __DIR__ . '/../../includes/topbar.php'; ?>

    <div class="page-content">

        <!-- Header Banner -->
        <div class="ann-header">
            <div class="ann-header-left">
                <h1>Announcements</h1>
                <p>Broadcast important updates, deadlines, or general news to your students</p>
            </div>
            <div class="ann-header-actions">
                <button class="ann-btn-new" onclick="document.getElementById('annModal').classList.add('active')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    New Announcement
                </button>
            </div>
        </div>

        <?php if (isset($_GET['created'])): ?>
            <div class="ann-alert ann-alert-success">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                Announcement has been successfully posted.
            </div>
        <?php endif; ?>

        <?php if (isset($_GET['deleted'])): ?>
            <div class="ann-alert ann-alert-success">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                Announcement has been removed.
            </div>
        <?php endif; ?>

        <!-- Filter Bar -->
        <?php if (!empty($announcements)): ?>
        <div class="ann-filter-bar">
            <div class="ann-filter-left">
                <div class="ann-filter-group">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    <select id="filterSubject" class="ann-filter-select" onchange="filterAnnouncements()">
                        <option value="all">All Subjects</option>
                        <option value="general">All Classes (General)</option>
                        <?php
                        $usedCodes = array_unique(array_filter(array_column($announcements, 'subject_code')));
                        sort($usedCodes);
                        foreach ($usedCodes as $code):
                        ?>
                            <option value="<?= e($code) ?>"><?= e($code) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="ann-status-pills">
                    <button class="ann-pill active" data-status="all" onclick="filterByStatus(this, 'all')">All</button>
                    <button class="ann-pill" data-status="published" onclick="filterByStatus(this, 'published')">Published</button>
                    <button class="ann-pill" data-status="draft" onclick="filterByStatus(this, 'draft')">Draft</button>
                </div>
            </div>
            <div class="ann-filter-count">
                <span id="annVisibleCount"><?= count($announcements) ?></span> of <?= count($announcements) ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- Announcements Feed -->
        <div class="ann-feed" id="annFeed">
            <?php if (empty($announcements)): ?>
                <div class="ann-panel">
                    <div class="ann-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
                        <h3>No Announcements Yet</h3>
                        <p>Click "New Announcement" to communicate with your students.</p>
                    </div>
                </div>
            <?php else: ?>
                <?php foreach ($announcements as $a): ?>
                    <div class="ann-card" data-subject="<?= $a['subject_code'] ? e($a['subject_code']) : 'general' ?>" data-status="<?= e($a['status']) ?>">
                        <div class="ann-card-top">
                            <div class="ann-card-meta">
                                <span class="ann-tag <?= $a['subject_code'] ? 'ann-tag-class' : 'ann-tag-all' ?>">
                                    <?= $a['subject_code'] ? e($a['subject_code']) : 'All Classes' ?>
                                </span>
                                <span class="ann-badge ann-badge-<?= $a['status'] ?>"><?= ucfirst($a['status']) ?></span>
                            </div>
                            <form method="POST" onsubmit="return confirm('Delete this announcement?')" style="margin:0;">
                                <input type="hidden" name="delete_id" value="<?= $a['announcement_id'] ?>">
                                <button type="submit" class="ann-btn-del" title="Delete">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </form>
                        </div>
                        <h3 class="ann-card-title"><?= e($a['title']) ?></h3>
                        <div class="ann-card-body"><?= nl2br(e($a['content'])) ?></div>
                        <div class="ann-card-footer">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <?= date('M d, Y \a\t g:i A', strtotime($a['created_at'])) ?>
                        </div>
                    </div>
                <?php endforeach; ?>

                <!-- No results message (hidden by default) -->
                <div class="ann-panel ann-no-results" id="annNoResults" style="display:none;">
                    <div class="ann-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <h3>No matching announcements</h3>
                        <p>Try changing your filters to see more results.</p>
                    </div>
                </div>
            <?php endif; ?>
        </div>
    </div>
</main>

<!-- New Announcement Modal -->
<div class="ann-modal-overlay" id="annModal">
    <div class="ann-modal">
        <div class="ann-modal-head">
            <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
                New Announcement
            </h3>
            <button class="ann-modal-close" onclick="document.getElementById('annModal').classList.remove('active')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <form method="POST">
            <div class="ann-modal-body">
                <div class="ann-form-group">
                    <label class="ann-label">Announcement Title <span class="ann-req">*</span></label>
                    <input type="text" name="title" class="ann-input" placeholder="e.g., Final Exam Schedule" required>
                </div>
                <div class="ann-form-group">
                    <label class="ann-label">Target Audience</label>
                    <select name="subject_offered_id" class="ann-input">
                        <option value="">All My Classes</option>
                        <?php foreach ($myOfferings as $o): ?>
                            <option value="<?= $o['subject_offered_id'] ?>">
                                <?= e($o['subject_code']) ?> - <?= e($o['subject_name']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <span class="ann-hint">Leave as "All My Classes" to post to every class you teach</span>
                </div>
                <div class="ann-form-group">
                    <label class="ann-label">Status</label>
                    <select name="status" class="ann-input">
                        <option value="published">Published (visible to students)</option>
                        <option value="draft">Draft (hidden)</option>
                    </select>
                </div>
                <div class="ann-form-group">
                    <label class="ann-label">Message Content <span class="ann-req">*</span></label>
                    <textarea name="content" class="ann-input ann-textarea" rows="5" placeholder="Write your announcement here..." required></textarea>
                </div>
            </div>
            <div class="ann-modal-foot">
                <button type="button" class="ann-btn-cancel" onclick="document.getElementById('annModal').classList.remove('active')">Cancel</button>
                <button type="submit" name="create" class="ann-btn-post">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                    Post Announcement
                </button>
            </div>
        </form>
    </div>
</div>

<style>
/* ============================================
   Announcements - Instructor Dashboard Style
   ============================================ */

/* Header Banner */
.ann-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 28px 32px;
    background: linear-gradient(135deg, #1B4D3E 0%, #2D6A4F 100%);
    border-radius: 14px;
    color: #fff;
}
.ann-header h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.3px; }
.ann-header p { margin: 0; opacity: 0.8; font-size: 14px; }
.ann-btn-new {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    background: #fff;
    color: #1B4D3E;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}
.ann-btn-new:hover { background: #E8F5E9; }

/* Alert */
.ann-alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 13px;
    font-weight: 500;
}
.ann-alert-success {
    background: #E8F5E9;
    color: #1B4D3E;
    }

/* Stats Summary */
.ann-stats-row {
    display: flex;
    gap: 14px;
    margin-bottom: 24px;
}
.ann-stat {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.ann-stat-num {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a1a;
}
.ann-stat-lbl {
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

/* Feed */
.ann-feed { display: flex; flex-direction: column; gap: 16px; }

/* Announcement Card */
.ann-card {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    padding: 20px 24px;
    transition: border-color 0.2s;
}
.ann-card:hover { border-color: #1B4D3E; }

.ann-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}
.ann-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
}

/* Tags */
.ann-tag {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 6px;
    letter-spacing: 0.03em;
}
.ann-tag-class { background: #E8F5E9; color: #1B4D3E; }
.ann-tag-all { background: #E3F2FD; color: #1565C0; }

/* Badges */
.ann-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 6px;
}
.ann-badge-published { background: #E8F5E9; color: #1B4D3E; }
.ann-badge-draft { background: #F3F4F6; color: #6B7280; }

/* Delete Button */
.ann-btn-del {
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 5px;
    cursor: pointer;
    color: #9ca3af;
    display: flex;
    align-items: center;
    transition: all 0.15s;
}
.ann-btn-del:hover {
    background: #FEF2F2;
    border-color: #fca5a5;
    color: #b91c1c;
}

.ann-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 10px;
    line-height: 1.3;
}

.ann-card-body {
    color: #374151;
    line-height: 1.7;
    font-size: 14px;
    padding-top: 12px;
    border-top: 1px solid #f3f4f6;
}

.ann-card-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
    font-size: 12px;
    color: #9ca3af;
}

/* Empty State */
.ann-panel {
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
}
.ann-empty {
    text-align: center;
    padding: 48px 20px;
    color: #9ca3af;
}
.ann-empty svg { margin-bottom: 12px; opacity: 0.4; }
.ann-empty h3 { margin: 0 0 4px; font-size: 15px; color: #6b7280; font-weight: 600; }
.ann-empty p { margin: 0; font-size: 13px; }

/* ============================================
   Modal
   ============================================ */
.ann-modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(3px);
}
.ann-modal-overlay.active { display: flex; }

.ann-modal {
    background: #fff;
    border-radius: 14px;
    width: 100%;
    max-width: 520px;
    overflow: hidden;
    box-shadow: 0 20px 40px -8px rgba(0,0,0,0.15);
    animation: annModalIn 0.2s ease;
}
@keyframes annModalIn {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
}

.ann-modal-head {
    padding: 18px 24px;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.ann-modal-head h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    display: flex;
    align-items: center;
    gap: 8px;
}
.ann-modal-head h3 svg { color: #1B4D3E; }

.ann-modal-close {
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 5px;
    cursor: pointer;
    color: #9ca3af;
    display: flex;
    align-items: center;
    transition: all 0.15s;
}
.ann-modal-close:hover {
    background: #FEF2F2;
    border-color: #fca5a5;
    color: #b91c1c;
}

.ann-modal-body { padding: 24px; }

.ann-form-group { margin-bottom: 18px; }
.ann-form-group:last-child { margin-bottom: 0; }
.ann-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}
.ann-req { color: #b91c1c; }
.ann-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #1a1a1a;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    font-family: inherit;
    box-sizing: border-box;
}
.ann-input:focus {
    border-color: #1B4D3E;
    box-shadow: 0 0 0 3px rgba(27, 77, 62, 0.08);
}
.ann-textarea { resize: vertical; min-height: 100px; }
.ann-hint {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #9ca3af;
}

.ann-modal-foot {
    padding: 14px 24px;
    background: #fafafa;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    border-top: 1px solid #f0f0f0;
}
.ann-btn-cancel {
    background: none;
    border: 1px solid #e5e7eb;
    padding: 9px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
}
.ann-btn-cancel:hover { background: #f3f4f6; }
.ann-btn-post {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #1B4D3E;
    color: #fff;
    border: none;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}
.ann-btn-post:hover { background: #2D6A4F; }

/* Filter Bar */
.ann-filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px 18px;
    margin-bottom: 20px;
    gap: 16px;
}
.ann-filter-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}
.ann-filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #6b7280;
}
.ann-filter-select {
    padding: 7px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
    color: #1a1a1a;
    background: #fff;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s;
}
.ann-filter-select:focus { border-color: #1B4D3E; }

.ann-status-pills {
    display: flex;
    gap: 4px;
    background: #f3f4f6;
    border-radius: 6px;
    padding: 3px;
}
.ann-pill {
    padding: 5px 14px;
    border: none;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    background: transparent;
    cursor: pointer;
    transition: all 0.15s;
}
.ann-pill:hover { color: #1a1a1a; }
.ann-pill.active {
    background: #fff;
    color: #1B4D3E;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.ann-filter-count {
    font-size: 12px;
    color: #9ca3af;
    white-space: nowrap;
}
.ann-filter-count span {
    font-weight: 700;
    color: #1B4D3E;
}

.ann-card.ann-hidden { display: none; }

/* Responsive */
@media (max-width: 768px) {
    .ann-header { flex-direction: column; text-align: center; gap: 16px; padding: 24px 20px; }
    .ann-header h1 { font-size: 18px; }
    .ann-stats-row { flex-wrap: wrap; }
    .ann-stat { flex: 1; min-width: 100px; }
    .ann-card { padding: 16px 18px; }
    .ann-modal { margin: 16px; }
    .ann-filter-bar { flex-direction: column; align-items: stretch; gap: 10px; }
    .ann-filter-left { flex-direction: column; gap: 10px; }
    .ann-filter-count { text-align: center; }
}
@media (max-width: 480px) {
    .ann-stats-row { flex-direction: column; }
}
</style>

<script>
var currentSubject = 'all';
var currentStatus = 'all';

function filterByStatus(btn, status) {
    document.querySelectorAll('.ann-pill').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    currentStatus = status;
    filterAnnouncements();
}

function filterAnnouncements() {
    currentSubject = document.getElementById('filterSubject').value;
    var cards = document.querySelectorAll('.ann-card');
    var visible = 0;

    cards.forEach(function(card) {
        var subj = card.getAttribute('data-subject');
        var stat = card.getAttribute('data-status');
        var showSubj = (currentSubject === 'all') || (subj === currentSubject);
        var showStat = (currentStatus === 'all') || (stat === currentStatus);

        if (showSubj && showStat) {
            card.classList.remove('ann-hidden');
            visible++;
        } else {
            card.classList.add('ann-hidden');
        }
    });

    var countEl = document.getElementById('annVisibleCount');
    if (countEl) countEl.textContent = visible;

    var noResults = document.getElementById('annNoResults');
    if (noResults) noResults.style.display = (visible === 0) ? 'block' : 'none';
}
</script>

<?php include __DIR__ . '/../../includes/footer.php'; ?>
