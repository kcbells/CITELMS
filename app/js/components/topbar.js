/**
 * Topbar Component
 * Renders the top navigation bar
 */

import { Auth } from '../auth.js';
import { Api }  from '../api.js';
import { icon, resolveIcon } from '../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let _notifPollTimer       = null;
let _cachedAnnouncements  = [];   // recent announcements fetched from API
let _cachedNewQuizzes     = [];   // newly available quizzes (students)
let _cachedNewLessons     = [];   // newly posted lessons (students)
let _cachedReminders      = [];   // due-soon reminders (students)
let _cachedTeachingAlerts = [];   // instructor dashboard alerts
let _topbarRole           = null;
let _topbarUserId         = null;

export function renderTopbar(container) {
    const user = Auth.user();
    const role = user.role;

    container.innerHTML = `
        <!-- Left Side -->
        <div class="topbar-left">
            <button class="topbar-btn mobile-menu-btn" id="sidebar-toggle" title="Toggle Menu">${icon('menu')}</button>
            <h1 class="page-title">Dashboard</h1>
        </div>

        <!-- Right Side -->
        <div class="topbar-right">
            <!-- Search -->
            <button class="topbar-btn" id="search-btn" title="Search  (Ctrl+K)">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
            </button>

            <!-- Notifications -->
            <div class="dropdown" id="notification-dropdown">
                <button class="topbar-btn" title="Notifications" id="notification-toggle">
                    ${icon('bell')}
                    <span class="badge" id="notif-badge" style="display:none">0</span>
                </button>
                <div class="dropdown-menu notification-dropdown">
                    <div class="dropdown-header">
                        <strong>Notifications</strong>
                        <a href="javascript:void(0)" id="notif-mark-all">Mark all read</a>
                    </div>
                    <div class="dropdown-body" id="notif-body">
                        <div class="notif-loading">Loading...</div>
                    </div>
                    <div class="dropdown-footer" style="display:flex;justify-content:space-between;gap:8px;">
                        <a href="#${role}/${role === 'student' ? 'dashboard' : 'announcements'}" id="notif-view-ann">${role === 'student' ? 'Dashboard' : 'All announcements'}</a>
                        <a href="#${role}/messages" id="notif-view-all">All messages</a>
                    </div>
                </div>
            </div>

            <!-- User Dropdown -->
            <div class="dropdown" id="user-dropdown">
                <div class="topbar-user" id="user-toggle">
                    <div class="topbar-user-avatar">${Auth.initials()}</div>
                    <div class="topbar-user-info">
                        <span class="topbar-user-name">${escapeHtml(user.name)}</span>
                        <span class="topbar-user-role">${Auth.roleName(role)}</span>
                    </div>
                    <span class="dropdown-arrow">${icon('chevronDown', { size: 12 })}</span>
                </div>
                <div class="dropdown-menu user-dropdown">
                    <a href="#${role}/profile" class="dropdown-item">
                        <span>${icon('user', { size: 16 })}</span><span>My Profile</span>
                    </a>
                    ${role === 'admin' ? `
                    <a href="#admin/settings" class="dropdown-item">
                        <span>${icon('settings', { size: 16 })}</span><span>Settings</span>
                    </a>` : ''}
                    <div class="dropdown-divider"></div>
                    <a href="javascript:void(0)" class="dropdown-item danger" id="topbar-logout">
                        <span>${icon('logout', { size: 16 })}</span><span>Logout</span>
                    </a>
                </div>
            </div>
        </div>
    `;

    // Add topbar styles (dropdown etc.)
    addTopbarStyles();

    // Event listeners
    // Sidebar toggle (mobile)
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('active');
    });

    // Dropdown toggles
    ['notification', 'user'].forEach(id => {
        const toggle   = document.getElementById(`${id}-toggle`);
        const dropdown = document.getElementById(`${id}-dropdown`);
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.dropdown.active').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            const opening = !dropdown.classList.contains('active');
            dropdown.classList.toggle('active');
            if (opening && id === 'notification') loadNotifications(role);
        });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
    });

    // Mark all read
    document.getElementById('notif-mark-all').addEventListener('click', async (e) => {
        e.stopPropagation();                      // keep dropdown open
        const link = e.currentTarget;
        if (link.dataset.loading) return;         // prevent double-click

        // visual feedback
        const original = link.textContent;
        link.dataset.loading = '1';
        link.textContent = 'Marking…';
        link.style.opacity = '0.6';

        try {
            const res = await Api.post('/MessagingAPI.php?action=mark_all_read', {});
            // Also mark announcements as seen
            markAnnLastSeen();
            markQuizLastSeen();
            if (res.success) {
                updateNotifBadge(0);
                await loadNotifications(role);
                link.innerHTML = `${icon('check', inl)} All read`;
                setTimeout(() => { link.textContent = original; }, 2000);
            } else {
                link.textContent = 'Failed';
                setTimeout(() => { link.textContent = original; }, 2000);
            }
        } catch (_) {
            link.textContent = 'Error';
            setTimeout(() => { link.textContent = original; }, 2000);
        } finally {
            link.style.opacity = '';
            delete link.dataset.loading;
        }
    });

    // Search
    document.getElementById('search-btn').addEventListener('click', () => openSearch());
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    });

    // Logout — custom modal
    document.getElementById('topbar-logout').addEventListener('click', () => {
        showLogoutModal();
    });

    // Cache role/userId for helpers
    _topbarRole   = role;
    _topbarUserId = user.id;

    // Start polling unread count
    pollUnreadCount();
    clearInterval(_notifPollTimer);
    const pollMs = role === 'student' ? 12000 : 30000;
    _notifPollTimer = setInterval(pollUnreadCount, pollMs);
}

async function pollUnreadCount() {
    try {
        const requests = [
            Api.get('/MessagingAPI.php?action=unread_count'),
            Api.get('/AnnouncementsAPI.php?action=new-announcements'),
        ];
        if (_topbarRole === 'instructor') {
            requests.push(Api.get('/DashboardAPI.php?action=instructor'));
        } else if (_topbarRole === 'student') {
            requests.push(Api.get('/ProgressAPI.php?action=new-quizzes&since=' + encodeURIComponent(getQuizLastSeen().toISOString())));
            requests.push(Api.get('/LessonsAPI.php?action=new-lessons&since=' + encodeURIComponent(getLessonLastSeen().toISOString())));
            requests.push(Api.get('/ProgressAPI.php?action=reminders&dispatch=1'));
        }

        const results = await Promise.all(requests);
        const msgRes = results[0];
        const annRes = results[1];
        const extraRes = results[2];
        const lessonRes = results[3];
        const reminderRes = results[4];

        const msgCount = msgRes.success ? (msgRes.count || 0) : 0;

        _cachedAnnouncements = annRes.success ? (annRes.data || []) : [];
        const annCount = countNewAnnouncements();

        if (_topbarRole === 'instructor' && extraRes?.success) {
            _cachedTeachingAlerts = buildTeachingAlerts(extraRes.data || {});
            _cachedNewQuizzes = [];
            _cachedNewLessons = [];
            _cachedReminders = [];
        } else {
            _cachedTeachingAlerts = [];
            _cachedNewQuizzes = (_topbarRole === 'student' && extraRes?.success) ? (extraRes.data || []) : [];
            _cachedNewLessons = (_topbarRole === 'student' && lessonRes?.success) ? (lessonRes.data || []) : [];
            _cachedReminders = (_topbarRole === 'student' && reminderRes?.success) ? (reminderRes.data?.reminders || []) : [];
        }

        updateNotifBadge(
            msgCount
            + annCount
            + _cachedNewQuizzes.length
            + _cachedNewLessons.length
            + _cachedReminders.length
            + _cachedTeachingAlerts.length
        );
    } catch (_) {}
}

/** Count announcements newer than the user's last-seen timestamp */
function countNewAnnouncements() {
    const lastSeen = getAnnLastSeen();
    return _cachedAnnouncements.filter(a => new Date(a.created_at) > lastSeen).length;
}

/** localStorage key scoped to current user */
function annLastSeenKey() {
    return `ann_last_seen_${_topbarUserId}`;
}

/** Get Date of last time the user acknowledged announcements (default: 7 days ago) */
function getAnnLastSeen() {
    const stored = localStorage.getItem(annLastSeenKey());
    return stored ? new Date(stored) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/** Mark all announcements as seen right now */
function markAnnLastSeen() {
    localStorage.setItem(annLastSeenKey(), new Date().toISOString());
}

function quizLastSeenKey() {
    return `quiz_last_seen_${_topbarUserId}`;
}

function getQuizLastSeen() {
    const stored = localStorage.getItem(quizLastSeenKey());
    return stored ? new Date(stored) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function markQuizLastSeen() {
    localStorage.setItem(quizLastSeenKey(), new Date().toISOString());
}

function lessonLastSeenKey() {
    return `lesson_last_seen_${_topbarUserId}`;
}

function getLessonLastSeen() {
    const stored = localStorage.getItem(lessonLastSeenKey());
    return stored ? new Date(stored) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function markLessonLastSeen() {
    localStorage.setItem(lessonLastSeenKey(), new Date().toISOString());
}

function updateNotifBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent   = count > 99 ? '99+' : count;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

async function loadNotifications(role) {
    const body = document.getElementById('notif-body');
    if (!body) return;
    body.innerHTML = '<div class="notif-loading">Loading...</div>';

    const fetches = [Api.get('/MessagingAPI.php?action=threads')];
    if (role === 'instructor') {
        fetches.push(Api.get('/DashboardAPI.php?action=instructor'));
    } else if (role === 'student') {
        fetches.push(Api.get('/ProgressAPI.php?action=new-quizzes&since=' + encodeURIComponent(getQuizLastSeen().toISOString())));
        fetches.push(Api.get('/LessonsAPI.php?action=new-lessons&since=' + encodeURIComponent(getLessonLastSeen().toISOString())));
        fetches.push(Api.get('/ProgressAPI.php?action=reminders&dispatch=1'));
    }

    const results = await Promise.all(fetches);
    const msgRes = results[0];
    if (role === 'instructor' && results[1]?.success) {
        _cachedTeachingAlerts = buildTeachingAlerts(results[1].data || {});
    } else if (role === 'student' && results[1]?.success) {
        _cachedNewQuizzes = results[1].data || [];
        _cachedNewLessons = results[2]?.success ? (results[2].data || []) : [];
        _cachedReminders = results[3]?.success ? (results[3].data?.reminders || []) : [];
    }

    const threads     = msgRes.success ? msgRes.data : [];
    const unreadMsgs  = threads.filter(t => parseInt(t.unread) > 0);

    const lastSeen    = getAnnLastSeen();
    const newAnns     = _cachedAnnouncements.filter(a => new Date(a.created_at) > lastSeen);
    const newQuizzes  = role === 'student' ? _cachedNewQuizzes : [];
    const newLessons  = role === 'student' ? _cachedNewLessons : [];
    const reminders   = role === 'student' ? _cachedReminders : [];

    if (newAnns.length) {
        markAnnLastSeen();
        setTimeout(pollUnreadCount, 300);
    }
    if (newQuizzes.length) {
        markQuizLastSeen();
        setTimeout(pollUnreadCount, 300);
    }
    if (newLessons.length) {
        markLessonLastSeen();
        setTimeout(pollUnreadCount, 300);
    }

    const teachingAlerts = _topbarRole === 'instructor' ? _cachedTeachingAlerts : [];

    if (!unreadMsgs.length && !newAnns.length && !newQuizzes.length && !newLessons.length && !reminders.length && !teachingAlerts.length) {
        body.innerHTML = `<div class="notif-empty">${icon('checkCircle', { size: 20 })} You're all caught up!</div>`;
        return;
    }

    let html = '';

    // ── Teaching alerts (instructor) ───────────────────────────────────
    if (teachingAlerts.length) {
        html += `<div class="notif-section-label">${icon('clipboard', { size: 14, className: 'ui-icon-inline' })} Teaching Updates</div>`;
        html += teachingAlerts.map(a => `
            <div class="notification-item unread notif-teach-item" style="cursor:pointer" data-href="${escapeHtml(a.href)}">
                <span class="notification-icon">
                    <span class="notif-teach-icon notif-teach-icon--${a.tone}">
                        ${icon(a.icon, { size: 18 })}
                    </span>
                </span>
                <div class="notification-content">
                    <span class="notification-title">${escapeHtml(a.title)}</span>
                    <span class="notification-time">${escapeHtml(a.meta)}</span>
                </div>
            </div>
        `).join('');
    }

    // ── New quizzes (student) ──────────────────────────────────────────
    if (newQuizzes.length) {
        html += `<div class="notif-section-label">${icon('quiz', { size: 14, className: 'ui-icon-inline' })} New Quizzes</div>`;
        html += newQuizzes.map(q => {
            const subLabel = q.subject_code
                ? `<span style="font-size:10px;background:#DBEAFE;color:#1E40AF;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:4px;">${escapeHtml(q.subject_code)}</span>`
                : '';
            const href = `#student/subject?subject_id=${q.subject_id}&work=quiz&work_id=${q.quiz_id}`;
            return `
                <div class="notification-item unread notif-quiz-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    <span class="notification-icon">
                        <span style="width:36px;height:36px;border-radius:10px;background:#E8F5E9;display:flex;align-items:center;justify-content:center;">
                            ${icon('quiz', { size: 18 })}
                        </span>
                    </span>
                    <div class="notification-content">
                        <span class="notification-title">${escapeHtml(q.quiz_title || 'New quiz')}${subLabel}</span>
                        <span class="notification-time">Available now · ${relativeTime(q.notify_at || q.availability_start || q.created_at)}</span>
                    </div>
                </div>`;
        }).join('');
    }

    // ── New lessons (student) ─────────────────────────────────────────
    if (newLessons.length) {
        html += `<div class="notif-section-label">${icon('document', { size: 14, className: 'ui-icon-inline' })} New Lessons</div>`;
        html += newLessons.map(l => {
            const subLabel = l.subject_code
                ? `<span style="font-size:10px;background:#DBEAFE;color:#1E40AF;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:4px;">${escapeHtml(l.subject_code)}</span>`
                : '';
            const href = `#student/subject?subject_id=${l.subject_id}&work=lesson&work_id=${l.lessons_id}`;
            return `
                <div class="notification-item unread notif-lesson-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    <span class="notification-icon">
                        <span style="width:36px;height:36px;border-radius:10px;background:#E8F5E9;display:flex;align-items:center;justify-content:center;">
                            ${icon('document', { size: 18 })}
                        </span>
                    </span>
                    <div class="notification-content">
                        <span class="notification-title">${escapeHtml(l.lesson_title || 'New lesson')}${subLabel}</span>
                        <span class="notification-time">Posted · ${relativeTime(l.notify_at || l.updated_at || l.created_at)}</span>
                    </div>
                </div>`;
        }).join('');
    }

    // ── Due reminders (student) ───────────────────────────────────────
    if (reminders.length) {
        html += `<div class="notif-section-label">${icon('clock', { size: 14, className: 'ui-icon-inline' })} Due Reminders</div>`;
        html += reminders.map(r => {
            const href = `#student/subject?subject_id=${r.subject_id}&work=${r.item_type}&work_id=${r.item_id}`;
            const due = r.due_at ? relativeOrUpcoming(r.due_at) : 'soon';
            const kind = r.item_type === 'quiz' ? 'Quiz' : 'Lesson';
            return `
                <div class="notification-item unread notif-rem-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    <span class="notification-icon">
                        <span style="width:36px;height:36px;border-radius:10px;background:#FEF3C7;display:flex;align-items:center;justify-content:center;">
                            ${icon('clock', { size: 18 })}
                        </span>
                    </span>
                    <div class="notification-content">
                        <span class="notification-title">${escapeHtml(kind)} due: ${escapeHtml(r.title || '')}</span>
                        <span class="notification-time">${escapeHtml(r.subject_code || '')} · ${escapeHtml(due)}</span>
                    </div>
                </div>`;
        }).join('');
    }

    // ── Announcement section ───────────────────────────────────────────
    if (newAnns.length) {
        html += `<div class="notif-section-label">${icon('announce', { size: 14, className: 'ui-icon-inline' })} New Announcements</div>`;
        html += newAnns.map(a => {
            const typeIconName = { urgent: 'siren', reminder: 'clock', event: 'calendar', general: 'megaphone' }[a.announcement_type] || 'megaphone';
            const typeIcon = icon(typeIconName, { size: 18 });
            const subLabel = a.subject_code ? `<span style="font-size:10px;background:#DBEAFE;color:#1E40AF;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:4px;">${escapeHtml(a.subject_code)}</span>` : '';
            return `
                <div class="notification-item unread notif-ann-item" style="cursor:pointer"
                     data-id="${a.announcement_id}">
                    <span class="notification-icon">
                        <span style="width:36px;height:36px;border-radius:10px;
                                     background:#E8F5E9;
                                     font-size:18px;display:flex;align-items:center;justify-content:center;">
                            ${typeIcon}
                        </span>
                    </span>
                    <div class="notification-content">
                        <span class="notification-title">${escapeHtml(a.title)}${subLabel}</span>
                        <span class="notification-time">By ${escapeHtml(a.author_name)} · ${relativeTime(a.created_at)}</span>
                    </div>
                </div>`;
        }).join('');
    }

    // ── Messages section ───────────────────────────────────────────────
    if (unreadMsgs.length) {
        html += `<div class="notif-section-label">${icon('messages', { size: 14, className: 'ui-icon-inline' })} Unread Messages</div>`;
        html += unreadMsgs.map(t => {
            const initials = (t.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const preview  = (t.last_message || '').slice(0, 55);
            const time     = relativeTime(t.last_at);
            return `
                <div class="notification-item unread notif-msg-item" style="cursor:pointer"
                     data-id="${t.other_id}" data-name="${escapeHtml(t.name)}">
                    <span class="notification-icon">
                        <span style="width:36px;height:36px;border-radius:50%;
                                     background:#1B4D3E;
                                     color:#fff;font-size:13px;font-weight:700;
                                     display:flex;align-items:center;justify-content:center;">
                            ${initials}
                        </span>
                    </span>
                    <div class="notification-content">
                        <span class="notification-title">${escapeHtml(t.name)}</span>
                        <span class="notification-time" style="display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;font-size:12px;color:#555">
                            ${escapeHtml(preview)}
                        </span>
                        <span class="notification-time">${time} · ${parseInt(t.unread)} new</span>
                    </div>
                </div>`;
        }).join('');
    }

    body.innerHTML = html;

    // Announcement click → student goes to dashboard (announcements live on subjects)
    body.querySelectorAll('.notif-ann-item').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            window.location.hash = role === 'student' ? '#student/dashboard' : `#${role}/announcements`;
        });
    });

    // Message click → go to thread
    body.querySelectorAll('.notif-msg-item').forEach(el => {
        el.addEventListener('click', async () => {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            await Api.post('/MessagingAPI.php?action=mark_read', { other_user_id: parseInt(el.dataset.id) });
            window.location.hash = `#${role}/messages?with=${el.dataset.id}&name=${encodeURIComponent(el.dataset.name)}`;
            pollUnreadCount();
        });
    });

    // Teaching alert click
    body.querySelectorAll('.notif-teach-item').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            const href = el.dataset.href;
            if (href) window.location.hash = href;
        });
    });

    body.querySelectorAll('.notif-quiz-item').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            const href = el.dataset.href;
            if (href) window.location.hash = href;
        });
    });

    body.querySelectorAll('.notif-lesson-item, .notif-rem-item').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            const href = el.dataset.href;
            if (href) window.location.hash = href;
        });
    });
}

function buildTeachingAlerts(data) {
    const alerts = [];
    const activity = data.recent_activity || [];
    const atRisk = data.at_risk_students || [];
    const quizPerf = data.quiz_performance || [];

    activity.slice(0, 4).forEach(item => {
        const action = item.type === 'quiz' ? 'completed' : 'finished';
        const score = item.type === 'quiz' && item.score != null ? ` · Score ${item.score}%` : '';
        alerts.push({
            icon: item.type === 'quiz' ? 'quiz' : 'lessons',
            tone: 'info',
            title: `${item.student || 'Student'} ${action} ${item.detail || 'an activity'}`,
            meta: `${item.subject || 'Class'}${score} · ${relativeTime(item.time)}`,
            href: '#instructor/gradebook'
        });
    });

    atRisk.slice(0, 5).forEach(item => {
        alerts.push({
            icon: 'warning',
            tone: 'danger',
            title: `${item.first_name || ''} ${item.last_name || ''} needs attention`,
            meta: `Avg score ${Number(item.avg_score || 0)}% · ${Number(item.quiz_count || 0)} quiz attempt(s)`,
            href: '#instructor/gradebook'
        });
    });

    (quizPerf || [])
        .filter(q => Number(q.attempts || 0) === 0)
        .slice(0, 3)
        .forEach(q => {
            alerts.push({
                icon: 'quiz',
                tone: 'warn',
                title: `No attempts yet: ${q.quiz_title || 'Untitled Quiz'}`,
                meta: `${q.subject_code || 'Quiz'} · Published quiz has no completed attempts`,
                href: '#instructor/gradebook'
            });
        });

    (quizPerf || [])
        .filter(q => Number(q.attempts || 0) > 0 && Number(q.avg_score || 0) < 60)
        .slice(0, 3)
        .forEach(q => {
            alerts.push({
                icon: 'chart',
                tone: 'danger',
                title: `Low quiz average: ${q.quiz_title || 'Untitled Quiz'}`,
                meta: `${q.subject_code || 'Quiz'} · Avg ${Number(q.avg_score || 0)}% across ${Number(q.attempts || 0)} attempt(s)`,
                href: '#instructor/gradebook'
            });
        });

    return alerts.slice(0, 12);
}

function relativeTime(ts) {
    if (!ts) return '';
    const d    = new Date(ts.replace(' ', 'T'));
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return d.toLocaleDateString();
}

function relativeOrUpcoming(ts) {
    if (!ts) return '';
    const d = new Date(String(ts).replace(' ', 'T'));
    const delta = d.getTime() - Date.now();
    if (Number.isNaN(delta)) return '';
    if (delta <= 0) return 'overdue';
    const mins = Math.floor(delta / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `in ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `in ${days}d`;
}

function addTopbarStyles() {
    if (document.getElementById('topbar-styles')) return;
    const style = document.createElement('style');
    style.id = 'topbar-styles';
    style.textContent = `
        .mobile-menu-btn { display: none; }
        @media (max-width: 1024px) { .mobile-menu-btn { display: flex !important; } }

        .dropdown { position: relative; }
        .dropdown-menu {
            position: absolute; top: 100%; right: 0; min-width: 200px;
            background: var(--white); border-radius: var(--border-radius);
            box-shadow: var(--shadow-lg); border: 1px solid var(--gray-200);
            display: none;
            z-index: 1000; margin-top: 8px;
        }
        .dropdown.active .dropdown-menu {
            display: block;
        }
        .dropdown-header {
            padding: 12px 16px; border-bottom: 1px solid var(--gray-100);
            display: flex; justify-content: space-between; align-items: center;
        }
        .dropdown-header a { font-size: 12px; color: var(--primary); }
        .dropdown-body { max-height: 420px; overflow-y: auto; }
        .dropdown-footer {
            padding: 12px 16px; border-top: 1px solid var(--gray-100); text-align: center;
        }
        .dropdown-footer a { font-size: 13px; color: var(--primary); font-weight: 500; }
        .dropdown-item {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 16px; color: var(--gray-700); font-size: 14px;
            transition: var(--transition-fast); cursor: pointer; text-decoration: none;
        }
        .dropdown-item:hover { background: var(--gray-50); color: var(--primary); }
        .dropdown-item.danger:hover { background: var(--danger-bg); color: var(--danger); }
        .dropdown-divider { height: 1px; background: var(--gray-100); margin: 4px 0; }
        .notification-dropdown { width: 320px; }
        .notification-item {
            display: flex; align-items: flex-start; gap: 12px;
            padding: 12px 16px; border-bottom: 1px solid var(--gray-50);
        }
        .notification-item:hover { background: var(--gray-50); }
        .notification-item.unread { background: var(--cream-light); }
        .notification-icon { font-size: 20px; flex-shrink: 0; }
        .notification-content { flex: 1; }
        .notification-title { display: block; font-size: 13px; font-weight: 500; color: var(--gray-800); }
        .notification-time { font-size: 11px; color: var(--gray-500); }
        .notif-loading, .notif-empty {
            padding: 24px 16px; text-align: center; color: var(--gray-400); font-size: 13px;
        }
        .notif-section-label {
            padding: 8px 16px 4px;
            font-size: 10px; font-weight: 800; color: #9ca3af;
            text-transform: uppercase; letter-spacing: .06em;
            border-top: 1px solid #f3f4f6;
        }
        .notif-section-label:first-child { border-top: none; }
        .notif-teach-icon {
            width: 36px; height: 36px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
        }
        .notif-teach-icon--info {
            background: #E8F5E9; color: #00461B;
        }
        .notif-teach-icon--warn {
            background: #FEF3C7; color: #92400E;
        }
        .notif-teach-icon--danger {
            background: #FEE2E2; color: #B91C1C;
        }
        .topbar-user {
            display: flex; align-items: center; gap: 12px;
            padding: 8px 12px; border-radius: var(--border-radius);
            cursor: pointer; transition: var(--transition);
        }
        .topbar-user:hover { background: var(--gray-100); }
        .topbar-user-avatar {
            width: 38px; height: 38px; background: var(--primary); color: var(--white);
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 14px;
        }
        .topbar-user-info { display: flex; flex-direction: column; }
        .topbar-user-name { font-size: 14px; font-weight: 600; color: var(--gray-800); }
        .topbar-user-role { font-size: 12px; color: var(--gray-500); }
        .dropdown-arrow { font-size: 10px; color: var(--gray-400); margin-left: 4px; }
        .user-dropdown { width: 200px; }
        @media (max-width: 768px) { .topbar-user-info, .dropdown-arrow { display: none; } }
    `;
    document.head.appendChild(style);
}

function openSearch() {
    document.getElementById('search-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.innerHTML = `
        <style>
            #search-overlay {
                position:fixed; inset:0; background:rgba(0,0,0,.45);
                display:flex; align-items:flex-start; justify-content:center;
                padding-top:90px; z-index:9999;
                animation:srFadeIn .15s ease;
            }
            @keyframes srFadeIn { from{opacity:0} to{opacity:1} }
            @keyframes srSlideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
            #search-box {
                background:#fff; border-radius:16px; width:600px; max-width:94vw;
                box-shadow:0 24px 72px rgba(0,0,0,.28);
                overflow:hidden; animation:srSlideDown .18s cubic-bezier(.4,0,.2,1);
            }
            #search-input-row {
                display:flex; align-items:center; gap:12px;
                padding:16px 20px; border-bottom:1px solid #f0f0f0;
            }
            #search-input-row svg { flex-shrink:0; color:#9ca3af; }
            #search-input {
                flex:1; border:none; outline:none; font-size:16px;
                color:#111827; background:transparent; font-family:inherit;
            }
            #search-input::placeholder { color:#c5cdd6; }
            #search-kbd {
                font-size:11px; color:#9ca3af; background:#f3f4f6;
                border:1px solid #e5e7eb; border-radius:5px;
                padding:2px 7px; flex-shrink:0; white-space:nowrap;
            }
            #search-results { max-height:420px; overflow-y:auto; }
            .sr-category {
                padding:12px 20px 5px; font-size:10.5px; font-weight:700;
                color:#9ca3af; text-transform:uppercase; letter-spacing:.07em;
            }
            .sr-item {
                display:flex; align-items:center; gap:12px;
                padding:9px 20px; cursor:pointer; text-decoration:none;
                transition:background .1s; border-radius:0;
            }
            .sr-item:hover, .sr-item.sr-active { background:#f0fdf4; }
            .sr-item-icon {
                width:34px; height:34px; border-radius:9px; background:#f3f4f6;
                display:flex; align-items:center; justify-content:center;
                font-size:15px; flex-shrink:0;
            }
            .sr-item.sr-active .sr-item-icon { background:#E8F5E9; }
            .sr-item-body { flex:1; min-width:0; }
            .sr-item-label { font-size:13.5px; font-weight:600; color:#111827; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sr-item-sub   { font-size:12px; color:#9ca3af; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sr-item-arrow { color:#d1d5db; font-size:14px; flex-shrink:0; }
            .sr-item:hover .sr-item-arrow, .sr-item.sr-active .sr-item-arrow { color:#1B4D3E; }
            #search-empty { padding:36px 20px; text-align:center; color:#9ca3af; font-size:14px; }
            #search-empty span { display:block; font-size:28px; margin-bottom:8px; }
            #search-hint {
                padding:9px 20px; font-size:11.5px; color:#9ca3af;
                border-top:1px solid #f3f4f6;
                display:flex; gap:16px;
            }
            #search-hint kbd {
                background:#f3f4f6; border:1px solid #e5e7eb; border-radius:4px;
                padding:1px 6px; font-size:11px; color:#6b7280; font-family:inherit;
            }
            #search-loading { padding:28px 20px; text-align:center; color:#9ca3af; font-size:13px; }
        </style>
        <div id="search-box">
            <div id="search-input-row">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="search-input" type="text" placeholder="Search users, subjects, sections…" autocomplete="off" spellcheck="false">
                <span id="search-kbd">Esc to close</span>
            </div>
            <div id="search-results">
                <div id="search-empty"><span>${icon('search', { size: 20 })}</span>Start typing to search…</div>
            </div>
            <div id="search-hint">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>Enter</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input   = overlay.querySelector('#search-input');
    const results = overlay.querySelector('#search-results');
    let debounce  = null;
    let activeIdx = -1;

    input.focus();

    function getItems() { return results.querySelectorAll('.sr-item'); }

    function setActive(idx) {
        const items = getItems();
        items.forEach(el => el.classList.remove('sr-active'));
        activeIdx = Math.max(-1, Math.min(idx, items.length - 1));
        if (activeIdx >= 0) {
            items[activeIdx].classList.add('sr-active');
            items[activeIdx].scrollIntoView({ block: 'nearest' });
        }
    }

    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    }

    function navigateTo(url) { close(); window.location.hash = url.replace(/^#/, ''); }

    async function doSearch(q) {
        results.innerHTML = '<div id="search-loading">Searching…</div>';
        activeIdx = -1;
        try {
            const res = await Api.get('/SearchAPI.php?q=' + encodeURIComponent(q));
            if (!res.success || !res.data.length) {
                results.innerHTML = '<div id="search-empty"><span>' + icon('search', { size: 20 }) + '</span>No results for "' + escapeHtml(q) + '"</div>';
                return;
            }
            results.innerHTML = res.data.map(group => `
                <div class="sr-category">${escapeHtml(group.category)}</div>
                ${group.items.map(item => `
                    <div class="sr-item" data-url="${escapeHtml(item.url)}">
                        <div class="sr-item-icon">${resolveIcon(item.icon, 20)}</div>
                        <div class="sr-item-body">
                            <span class="sr-item-label">${escapeHtml(item.label)}</span>
                            ${item.sub ? `<span class="sr-item-sub">${escapeHtml(item.sub)}</span>` : ''}
                        </div>
                        <span class="sr-item-arrow">›</span>
                    </div>`).join('')}
            `).join('');

            results.querySelectorAll('.sr-item').forEach(el => {
                el.addEventListener('click', () => navigateTo(el.dataset.url));
                el.addEventListener('mouseenter', () => {
                    getItems().forEach(i => i.classList.remove('sr-active'));
                    el.classList.add('sr-active');
                    activeIdx = [...getItems()].indexOf(el);
                });
            });
        } catch (_) {
            results.innerHTML = '<div id="search-empty">Search unavailable. Try again.</div>';
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        const q = input.value.trim();
        if (q.length < 2) {
            results.innerHTML = `<div id="search-empty"><span>${icon('search', inl)}</span>Start typing to search…</div>`;
            activeIdx = -1;
            return;
        }
        debounce = setTimeout(() => doSearch(q), 280);
    });

    function onKey(e) {
        if (e.key === 'Escape') { close(); return; }
        const items = getItems();
        if (!items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(activeIdx - 1); }
        if (e.key === 'Enter' && activeIdx >= 0) {
            navigateTo(items[activeIdx].dataset.url);
        }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

export function showLogoutModal() {
    document.getElementById('logout-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'logout-modal-overlay';
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center;
        z-index:9999;
    `;
    overlay.innerHTML = `
        <style>
            @keyframes lmFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes lmSlideUp { from{transform:translateY(18px);opacity:0} to{transform:translateY(0);opacity:1} }
            #logout-modal {
                background:#fff; border-radius:18px; padding:36px 32px 28px;
                width:380px; max-width:92vw; text-align:center;
                box-shadow:0 32px 80px rgba(0,0,0,.2);
                animation:lmSlideUp .22s cubic-bezier(.4,0,.2,1);
            }
            #logout-modal .lm-icon-wrap {
                width:60px; height:60px; border-radius:16px;
                background:#E8F5E9;
                display:flex; align-items:center; justify-content:center;
                font-size:28px; margin:0 auto 18px;
                box-shadow:0 4px 12px rgba(27,77,62,.12);
            }
            #logout-modal h3 {
                font-size:19px; font-weight:800; color:#111827; margin:0 0 8px;
                letter-spacing:-.3px;
            }
            #logout-modal p {
                font-size:14px; color:#6B7280; margin:0 0 28px; line-height:1.55;
            }
            #logout-modal .lm-actions { display:flex; gap:10px; }
            #logout-modal .lm-cancel {
                flex:1; padding:12px; border-radius:10px;
                border:1.5px solid #E5E7EB; background:#fff;
                font-size:14px; font-weight:600; color:#374151;
                cursor:pointer; transition:all .15s;
            }
            #logout-modal .lm-cancel:hover { background:#F9FAFB; border-color:#D1D5DB; }
            #logout-modal .lm-confirm {
                flex:1; padding:12px; border-radius:10px;
                border:none; background:#1B4D3E;
                font-size:14px; font-weight:600; color:#fff;
                cursor:pointer; transition:background .15s;
            }
            #logout-modal .lm-confirm:hover { background:#2D6A4F; }
        </style>
        <div id="logout-modal">
            <div class="lm-icon-wrap">${icon('logout', { size: 28 })}</div>
            <h3>Logging out?</h3>
            <p>You'll need to sign in again to access your account.</p>
            <div class="lm-actions">
                <button class="lm-cancel" id="lm-cancel">Stay</button>
                <button class="lm-confirm" id="lm-confirm">Yes, Logout</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('lm-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('lm-confirm').addEventListener('click', () => {
        overlay.remove();
        Auth.logout();
    });
    const onKey = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
