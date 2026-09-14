/**
 * Topbar Component
 * Renders the top navigation bar
 */

import { Auth } from '../auth.js';
import { Api, BASE_URL } from '../api.js';
import { icon, resolveIcon } from '../utils/icons.js';


const inl = { size: 14, className: 'ui-icon-inline' };

let _notifPollTimer       = null;
let _cachedNewLessons     = [];   // newly posted lessons (students)
let _cachedTeachingAlerts = [];   // instructor dashboard alerts
let _cachedCommentReplies = [];   // private comment replies (students)
let _cachedLackingCount   = 0;    // overdue/not-done quizzes+lessons (students)
let _topbarRole           = null;
let _topbarUserId         = null;

export function renderTopbar(container) {
    const user = Auth.user();
    const role = user.role;

    container.innerHTML = `
        <!-- Left Side -->
        <div class="topbar-left">
            <button class="topbar-btn mobile-menu-btn" id="sidebar-toggle" title="Toggle Menu">${icon('menu')}</button>
        </div>

        <!-- Right Side -->
        <div class="topbar-right">
            <!-- Search -->
            <button class="topbar-btn" id="search-btn" title="Search  (Ctrl+K)">
                ${icon('search', { size: 19 })}
            </button>

            <!-- Ali (AI assistant) -->
            <button class="topbar-btn" id="fa-topbar-btn" title="Ask Ali" aria-label="Ask Ali">
                <img src="${BASE_URL}/assets/images/assistant-ali.png" alt="" class="fa-topbar-img"
                     onerror="this.style.display='none';this.parentElement.querySelector('.fa-topbar-fallback').style.display='inline-flex'">
                <span class="fa-topbar-fallback">${icon('robot', { size: 19 })}</span>
            </button>

            <!-- Messenger -->
            <button class="topbar-btn" id="fm-topbar-btn" title="Messenger">
                ${icon('messenger', { size: 19 })}
                <span class="badge" id="fm-topbar-badge" style="display:none">0</span>
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
                        <a href="#${role}/${role === 'student' ? 'dashboard' : 'announcements'}" id="notif-view-ann">${role === 'student' ? 'Home' : 'All announcements'}</a>
                        <a href="#${role}/messages" id="notif-view-all">All messages</a>
                    </div>
                </div>
            </div>

            <!-- User Dropdown -->
            <div class="dropdown" id="user-dropdown">
                <div class="topbar-user" id="user-toggle">
                    <div class="topbar-user-avatar">${icon('user', { size: 18 })}</div>
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
    const sidebar = document.querySelector('.sidebar');
    let backdrop = document.getElementById('sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }
    const closeSidebar = () => {
        sidebar?.classList.remove('active');
        backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    };
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        const open = !sidebar?.classList.contains('active');
        sidebar?.classList.toggle('active', open);
        backdrop.classList.toggle('active', open);
        document.body.classList.toggle('sidebar-open', open);
    });
    backdrop.addEventListener('click', closeSidebar);
    window.addEventListener('hashchange', closeSidebar);

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
            markLessonLastSeen();
            markReplyLastSeen();
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
    document.getElementById('fa-topbar-btn')?.addEventListener('click', async () => {
        const { toggleAssistant } = await import('./floating-assistant.js');
        toggleAssistant();
    });

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
        ];
        if (_topbarRole === 'instructor') {
            requests.push(Api.get('/DashboardAPI.php?action=instructor'));
        } else if (_topbarRole === 'student') {
            requests.push(Api.get('/LessonsAPI.php?action=new-lessons&since=' + encodeURIComponent(getLessonLastSeen().toISOString())));
            requests.push(Api.get('/ClassroomAPI.php?action=new-replies&since=' + encodeURIComponent(getReplyLastSeen().toISOString())));
            requests.push(Api.get('/GradebookAPI.php?action=my-lacking-work', { ttl: 0 }));
        }

        const results = await Promise.all(requests);
        const msgRes     = results[0];
        const extraRes   = results[1];
        const replyRes   = results[2];
        const lackingRes = results[3];

        const msgCount = msgRes.success ? (msgRes.count || 0) : 0;
        // Drive the messenger topbar badge
        const fmBadge = document.getElementById('fm-topbar-badge');
        if (fmBadge) {
            if (msgCount > 0) { fmBadge.textContent = msgCount > 99 ? '99+' : msgCount; fmBadge.style.display = 'flex'; }
            else { fmBadge.style.display = 'none'; }
        }

        if (_topbarRole === 'instructor' && extraRes?.success) {
            _cachedTeachingAlerts = buildTeachingAlerts(extraRes.data || {});
            _cachedNewLessons     = [];
            _cachedCommentReplies = [];
        } else {
            _cachedTeachingAlerts = [];
            _cachedNewLessons     = (_topbarRole === 'student' && extraRes?.success) ? (extraRes.data || [])  : [];
            _cachedCommentReplies = (_topbarRole === 'student' && replyRes?.success) ? (replyRes.data || [])  : [];
            _cachedLackingCount   = (_topbarRole === 'student' && lackingRes?.success)
                ? ((lackingRes.data?.quizzes?.length || 0) + (lackingRes.data?.lessons?.length || 0))
                : 0;
        }

        updateNotifBadge(
            _cachedNewLessons.length
            + _cachedCommentReplies.length
            + _cachedTeachingAlerts.length
            + _cachedLackingCount
        );
    } catch (_) {}
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

function replyLastSeenKey() {
    return `reply_last_seen_${_topbarUserId}`;
}

function getReplyLastSeen() {
    const stored = localStorage.getItem(replyLastSeenKey());
    return stored ? new Date(stored) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function markReplyLastSeen() {
    localStorage.setItem(replyLastSeenKey(), new Date().toISOString());
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
        fetches.push(Api.get('/LessonsAPI.php?action=new-lessons&since=' + encodeURIComponent(getLessonLastSeen().toISOString())));
        fetches.push(Api.get('/ClassroomAPI.php?action=new-replies&since=' + encodeURIComponent(getReplyLastSeen().toISOString())));
        fetches.push(Api.get('/GradebookAPI.php?action=my-lacking-work', { ttl: 0 }));
    }

    const results = await Promise.all(fetches);
    const msgRes  = results[0];

    if (role === 'instructor' && results[1]?.success) {
        _cachedTeachingAlerts = buildTeachingAlerts(results[1].data || {});
    } else if (role === 'student') {
        _cachedNewLessons     = results[1]?.success ? (results[1].data || []) : [];
        _cachedCommentReplies = results[2]?.success ? (results[2].data || []) : [];
    }

    const threads    = msgRes.success ? msgRes.data : [];
    const unreadMsgs = threads.filter(t => parseInt(t.unread) > 0);
    const newLessons = role === 'student' ? _cachedNewLessons     : [];
    const replies    = role === 'student' ? _cachedCommentReplies : [];
    const teachingAlerts = role === 'instructor' ? _cachedTeachingAlerts : [];
    const lackingRes = role === 'student' ? results[3] : null;
    const lackingQuizzes = lackingRes?.success ? (lackingRes.data?.quizzes || []) : [];
    const lackingLessons = lackingRes?.success ? (lackingRes.data?.lessons || []) : [];
    const lackingItems = [...lackingQuizzes, ...lackingLessons];

    if (newLessons.length) {
        markLessonLastSeen();
        setTimeout(pollUnreadCount, 300);
    }
    if (replies.length) {
        markReplyLastSeen();
        setTimeout(pollUnreadCount, 300);
    }

    if (!unreadMsgs.length && !newLessons.length && !replies.length && !teachingAlerts.length && !lackingItems.length) {
        body.innerHTML = `<div class="notif-empty">You're all caught up!</div>`;
        return;
    }

    // Facebook-style rows: round avatar for people, plain text otherwise —
    // no icon boxes. Unread state is shown with a green dot on the right.
    const avatarOf = (name) => {
        const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return `<span class="notif-avatar">${initials}</span>`;
    };

    let html = '';

    // ── Unread Messages (all roles) ────────────────────────────────────
    if (unreadMsgs.length) {
        html += `<div class="notif-section-label">Messages</div>`;
        html += unreadMsgs.map(t => {
            const preview = (t.last_message || '').slice(0, 55);
            return `
                <div class="notification-item unread notif-msg-item" style="cursor:pointer"
                     data-id="${t.other_id}" data-name="${escapeHtml(t.name)}">
                    ${avatarOf(t.name)}
                    <div class="notification-content">
                        <span class="notification-title"><strong>${escapeHtml(t.name)}</strong> sent you a message</span>
                        <span class="notification-preview">${escapeHtml(preview)}</span>
                        <span class="notification-time">${relativeTime(t.last_at)} · ${parseInt(t.unread)} new</span>
                    </div>
                    <span class="notif-dot"></span>
                </div>`;
        }).join('');
    }

    // ── New Lessons (student) ──────────────────────────────────────────
    if (newLessons.length) {
        html += `<div class="notif-section-label">New Lessons</div>`;
        html += newLessons.map(l => {
            const href = `#student/subject?subject_id=${l.subject_id}&work=lesson&work_id=${l.lessons_id}`;
            return `
                <div class="notification-item unread notif-lesson-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    <div class="notification-content">
                        <span class="notification-title">New lesson posted${l.subject_code ? ` in <strong>${escapeHtml(l.subject_code)}</strong>` : ''}: <strong>${escapeHtml(l.lesson_title || 'Untitled')}</strong></span>
                        <span class="notification-time">${relativeTime(l.notify_at || l.updated_at || l.created_at)}</span>
                    </div>
                    <span class="notif-dot"></span>
                </div>`;
        }).join('');
    }

    // ── Private comment replies (student) ─────────────────────────────
    if (replies.length) {
        html += `<div class="notif-section-label">Comment Replies</div>`;
        html += replies.map(r => {
            const href = r.lessons_id
                ? `#student/subject?subject_id=${r.subject_id}&work=lesson&work_id=${r.lessons_id}`
                : r.quiz_id
                    ? `#student/subject?subject_id=${r.subject_id}&work=quiz&work_id=${r.quiz_id}`
                    : `#student/subject?subject_id=${r.subject_id}`;
            const preview = (r.content || '').slice(0, 60);
            return `
                <div class="notification-item unread notif-reply-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    ${avatarOf(r.replier_name)}
                    <div class="notification-content">
                        <span class="notification-title"><strong>${escapeHtml(r.replier_name)}</strong> replied to your comment${r.subject_code ? ` in <strong>${escapeHtml(r.subject_code)}</strong>` : ''}</span>
                        <span class="notification-preview">${escapeHtml(preview)}</span>
                        <span class="notification-time">${relativeTime(r.created_at)}</span>
                    </div>
                    <span class="notif-dot"></span>
                </div>`;
        }).join('');
    }

    // ── Lacking work — overdue quizzes/exams/activities (student) ─────
    if (lackingItems.length) {
        html += `<div class="notif-section-label">Lacking Work</div>`;
        html += lackingQuizzes.map(q => {
            const href = `#student/subject?subject_id=${q.subject_id}&work=quiz&work_id=${q.quiz_id}`;
            return `
                <div class="notification-item unread notif-lacking-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    <div class="notification-content">
                        <span class="notification-title">Overdue quiz${q.subject_code ? ` in <strong>${escapeHtml(q.subject_code)}</strong>` : ''}: <strong>${escapeHtml(q.quiz_title || 'Quiz')}</strong></span>
                        <span class="notification-time">Was due ${relativeTime(q.due_date)}</span>
                    </div>
                    <span class="notif-dot"></span>
                </div>`;
        }).join('');
        html += lackingLessons.map(l => {
            const href = `#student/subject?subject_id=${l.subject_id}&work=lesson&work_id=${l.lessons_id}`;
            return `
                <div class="notification-item unread notif-lacking-item" style="cursor:pointer" data-href="${escapeHtml(href)}">
                    <div class="notification-content">
                        <span class="notification-title">Overdue activity${l.subject_code ? ` in <strong>${escapeHtml(l.subject_code)}</strong>` : ''}: <strong>${escapeHtml(l.lesson_title || 'Activity')}</strong></span>
                        <span class="notification-time">Was due ${relativeTime(l.due_date)}</span>
                    </div>
                    <span class="notif-dot"></span>
                </div>`;
        }).join('');
    }

    // ── Teaching alerts (instructor) ───────────────────────────────────
    if (teachingAlerts.length) {
        html += `<div class="notif-section-label">Teaching Updates</div>`;
        html += teachingAlerts.map(a => `
            <div class="notification-item unread notif-teach-item" style="cursor:pointer" data-href="${escapeHtml(a.href)}">
                <div class="notification-content">
                    <span class="notification-title">${escapeHtml(a.title)}</span>
                    <span class="notification-time">${escapeHtml(a.meta)}</span>
                </div>
                <span class="notif-dot"></span>
            </div>
        `).join('');
    }

    body.innerHTML = html;

    // Message click → open floating messenger
    body.querySelectorAll('.notif-msg-item').forEach(el => {
        el.addEventListener('click', async () => {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            const { openFloatingChat } = await import('./floating-messenger.js');
            openFloatingChat(parseInt(el.dataset.id), el.dataset.name);
            pollUnreadCount();
        });
    });

    // Lesson / reply / teaching alert / lacking-work click → navigate
    body.querySelectorAll('.notif-lesson-item, .notif-reply-item, .notif-teach-item, .notif-lacking-item').forEach(el => {
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

        /* On a phone a 320px menu anchored to the bell hangs off the left edge
           and clips its own text. Break out of the button and span the screen. */
        @media (max-width: 640px) {
            .dropdown-menu {
                position: fixed;
                top: calc(var(--topbar-height, 70px) - 6px);
                left: 8px; right: 8px;
                width: auto; min-width: 0; margin-top: 0;
            }
            .notification-dropdown { width: auto; }
            .dropdown-body { max-height: calc(100dvh - var(--topbar-height, 70px) - 90px); }
        }
        /* Facebook-style notification rows — avatars & text only, no icon boxes */
        .notification-item {
            display: flex; align-items: center; gap: 12px;
            padding: 11px 16px; border-bottom: 1px solid var(--gray-50);
            border-radius: 8px; margin: 2px 6px;
        }
        .notification-item:hover { background: var(--gray-50); }
        .notification-item.unread { background: transparent; }
        .notification-item.unread:hover { background: var(--gray-50); }
        .notif-avatar {
            width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
            background: #1B4D3E; color: #fff; font-size: 14px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
        }
        .notification-content { flex: 1; min-width: 0; }
        .notification-title { display: block; font-size: 13px; font-weight: 400; color: var(--gray-800); line-height: 1.4; }
        .notification-title strong { font-weight: 700; }
        .notification-preview {
            display: block; font-size: 12px; color: #65676B; margin-top: 1px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;
        }
        .notification-time { display: block; font-size: 12px; color: #00461B; font-weight: 600; margin-top: 2px; }
        .notif-dot {
            width: 10px; height: 10px; border-radius: 50%; background: #00461B; flex-shrink: 0;
        }
        .notif-loading, .notif-empty {
            padding: 24px 16px; text-align: center; color: var(--gray-400); font-size: 13px;
        }
        .notif-section-label {
            padding: 10px 16px 4px;
            font-size: 12px; font-weight: 700; color: #374151;
        }
        .topbar-user {
            display: flex; align-items: center; gap: 12px;
            padding: 8px 12px; border-radius: var(--border-radius);
            cursor: pointer; transition: var(--transition);
        }
        .topbar-user:hover { background: var(--gray-100); }
        .topbar-user-avatar {
            width: 38px; height: 38px; background: none; color: var(--gray-500);
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
                background:#F3F4F6; color:#111;
                display:flex; align-items:center; justify-content:center;
                font-size:28px; margin:0 auto 18px;
                box-shadow:0 4px 12px rgba(0,0,0,.08);
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
