/**
 * Student Dashboard — white background, compact to-do boxes
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };
const G  = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

let _todoPollTimer = null;

export async function render(container) {
    container.innerHTML = `<div class="sd-loading"><div class="sd-spin"></div></div>`;

    const [res, semRes, annRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=student'),
        Api.get('/SemesterAPI.php?action=list'),
        Api.get('/AnnouncementsAPI.php?action=student-list')
    ]);

    await Auth.getUser();
    const user = Auth.user() || {};
    const data = res.success ? res.data : {};
    const stats = data.stats || {};
    const subjects = data.subjects || [];
    const todos = data.todos || { due_today: [], no_due_date: [], missing: [], done: [] };
    const allAnnouncements = annRes.success ? annRes.data : [];
    const annBySubject = groupAnnouncements(allAnnouncements);

    const semesters = semRes.success ? semRes.data : [];
    const activeSem = semesters.find(s => s.status === 'active') || null;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const lessonPct = stats.total_lessons > 0
        ? Math.round((stats.lessons_completed / stats.total_lessons) * 100) : 0;

    const pendingTotal = (todos.due_today?.length || 0) + (todos.no_due_date?.length || 0) + (todos.missing?.length || 0);

    const programDisplay = user.program_name
        ? (user.program_code ? `${user.program_name} (${user.program_code})` : user.program_name)
        : (user.program_code || '—');
    const academicYear = activeSem?.academic_year || '—';
    const semesterName = activeSem?.semester_name || (semesters.find(s => s.status === 'upcoming')?.semester_name) || 'No active semester';
    const yearLevel    = user.year_level ? `Year ${user.year_level}` : '—';

    container.innerHTML = `
        <style>
            .sd-wrap { background:#fff; min-height:100%; }
            .page-content.sd-page-white { background:#fff !important; }

            .sd-loading { display:flex; justify-content:center; padding:80px; background:#fff; }
            .sd-spin {
                width:40px; height:40px; border:3px solid #eee; border-top-color:${G};
                border-radius:50%; animation:sdSpin .8s linear infinite;
            }
            @keyframes sdSpin { to { transform:rotate(360deg); } }

            /* ── Header card ── */
            .sd-header {
                background:#fff; border:1px solid #EBEBEB; border-radius:16px;
                padding:28px 32px; margin-bottom:24px;
                display:flex; justify-content:space-between; align-items:center; gap:24px; flex-wrap:wrap;
                box-shadow:0 2px 12px rgba(0,70,27,.06);
            }
            .sd-header h1 { font-size:26px; font-weight:800; color:#111; margin:0 0 4px; letter-spacing:-.4px; }
            .sd-header-sub { font-size:14px; color:#6B7280; margin:0 0 16px; }

            .sd-academic {
                display:grid; grid-template-columns:repeat(3,1fr); gap:12px;
                padding-top:16px; border-top:1px solid ${BORDER}; margin-top:4px;
            }
            .sd-academic-item {
                background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 14px;
            }
            .sd-academic-label {
                display:block; font-size:10px; font-weight:700; text-transform:uppercase;
                letter-spacing:.8px; color:#9CA3AF; margin-bottom:4px;
            }
            .sd-academic-value {
                display:block; font-size:14px; font-weight:700; color:${G}; line-height:1.35;
            }
            .sd-academic-value--sm { font-size:13px; color:#374151; font-weight:600; }

            .sd-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
            .sd-chip {
                font-size:12px; font-weight:600; padding:5px 12px; border-radius:4px;
                background:#fff; color:${G}; border:1px solid ${G};
            }
            .sd-chip--muted { color:#374151; border-color:${BORDER}; }

            .sd-ring {
                width:72px; height:72px; position:relative; flex-shrink:0;
            }
            .sd-ring svg { transform:rotate(-90deg); }
            .sd-ring-val {
                position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
                font-size:15px; font-weight:800; color:${G};
            }

            /* ── To-Do compact boxes ── */
            .sd-todo-section {
                margin-bottom:22px;
                background:#fff; border:1px solid ${BORDER}; border-radius:12px;
                padding:14px 16px 16px;
                box-shadow:0 1px 4px rgba(0,0,0,.04);
            }
            .sd-todo-hdr {
                display:flex; align-items:center; justify-content:space-between;
                margin-bottom:10px;
            }
            .sd-todo-hdr h2 { font-size:15px; font-weight:800; color:#111; margin:0; }
            .sd-todo-hdr span { font-size:12px; color:#6B7280; }

            .sd-todo-boxes {
                display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;
                margin-bottom:10px;
            }
            .sd-todo-box {
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                gap:2px; padding:8px 6px; min-height:52px;
                background:#FAFAFA; border:1px solid ${BORDER}; border-radius:8px;
                cursor:pointer; font-family:inherit; text-align:center;
                transition:border-color .15s, background .15s;
            }
            .sd-todo-box:hover { border-color:#C5D9CB; background:#fff; }
            .sd-todo-box.active {
                border-color:${G}; background:${GL};
            }
            .sd-todo-box-count {
                font-size:18px; font-weight:800; color:#111; line-height:1;
            }
            .sd-todo-box.active .sd-todo-box-count { color:${G}; }
            .sd-todo-box-label {
                font-size:10px; font-weight:600; color:#6B7280;
                line-height:1.2;
            }
            .sd-todo-box.active .sd-todo-box-label { color:${G}; }
            .sd-todo-box--miss.active { border-color:#B91C1C; background:#FEF2F2; }
            .sd-todo-box--miss.active .sd-todo-box-count,
            .sd-todo-box--miss.active .sd-todo-box-label { color:#B91C1C; }
            .sd-todo-box--done.active { border-color:#0369A1; background:#F0F9FF; }
            .sd-todo-box--done.active .sd-todo-box-count,
            .sd-todo-box--done.active .sd-todo-box-label { color:#0369A1; }

            .sd-todo-list {
                display:flex; flex-direction:column; gap:5px;
                max-height:200px; overflow-y:auto;
            }
            .sd-todo-list[hidden] { display:none !important; }
            .sd-todo-row {
                display:flex; align-items:center; justify-content:space-between; gap:8px;
                padding:8px 10px; background:#FAFAFA;
                border:1px solid ${BORDER}; border-radius:10px;
                text-decoration:none; color:inherit;
                transition:border-color .15s, box-shadow .15s;
            }
            .sd-todo-row:hover { border-color:#C5D9CB; box-shadow:0 2px 8px rgba(0,70,27,.06); }
            .sd-todo-row-main { flex:1; min-width:0; }
            .sd-todo-row-top {
                display:flex; align-items:center; gap:8px; margin-bottom:2px;
            }
            .sd-todo-row-code {
                font-size:10px; font-weight:800; font-family:monospace;
                color:${G}; background:#E8F5EC; padding:2px 6px; border-radius:4px;
                flex-shrink:0;
            }
            .sd-todo-row-title {
                font-size:13px; font-weight:600; color:#111;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
            }
            .sd-todo-row-sub { font-size:11px; color:#9CA3AF; }
            .sd-todo-row-end { display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex-shrink:0; }
            .sd-todo-row-due { font-size:11px; font-weight:600; color:#6B7280; }
            .sd-todo-row-due--late, .sd-todo-row-due--today { color:${G}; }
            .sd-todo-row-action { font-size:11px; font-weight:700; color:${G}; }
            .sd-todo-row-score { font-size:12px; font-weight:800; color:${G}; }
            .sd-todo-empty {
                padding:24px 12px; text-align:center; font-size:13px; color:#9CA3AF;
                background:#fff; border:1px dashed ${BORDER}; border-radius:10px;
            }

            /* ── Subjects ── */
            .sd-panel {
                background:#fff; border:1px solid #EBEBEB; border-radius:14px;
                box-shadow:0 1px 6px rgba(0,0,0,.04); overflow:hidden;
            }
            .sd-panel-hdr {
                padding:16px 20px; border-bottom:1px solid #F0F0F0;
                display:flex; align-items:center; justify-content:space-between;
            }
            .sd-panel-hdr h3 { font-size:15px; font-weight:700; color:#111; margin:0; }
            .sd-panel-hdr a { font-size:12px; font-weight:600; color:${G}; text-decoration:none; }
            .sd-panel-hdr a:hover { text-decoration:underline; }

            .sd-subj-grid {
                display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
                gap:16px; padding:16px 20px 20px; align-items:stretch;
            }
            .sd-subj {
                display:flex; flex-direction:column; min-height:260px; height:100%;
                text-decoration:none; color:inherit; cursor:pointer;
                border-radius:14px; overflow:hidden; background:#fff;
                border:1px solid #E5E7EB;
                box-shadow:0 1px 3px rgba(0,0,0,.06);
                transition:transform .2s, box-shadow .2s, border-color .2s;
            }
            .sd-subj:hover {
                transform:translateY(-3px);
                border-color:#C5D9CB;
                box-shadow:0 8px 20px rgba(0,70,27,.1);
            }
            .sd-subj-band {
                padding:16px 16px 14px; min-height:96px;
                display:flex; flex-direction:column; justify-content:flex-end;
                position:relative;
            }
            .sd-subj-code {
                font-size:10px; font-weight:700; font-family:ui-monospace, monospace;
                color:rgba(255,255,255,.9); margin-bottom:4px; position:relative;
            }
            .sd-subj-name {
                font-size:15px; font-weight:700; color:#fff; line-height:1.3;
                display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
                overflow:hidden; position:relative; margin:0;
            }
            .sd-subj-body {
                flex:1; padding:12px 14px 14px; display:flex; flex-direction:column; gap:4px;
            }
            .sd-subj-teacher {
                font-size:12px; font-weight:600; color:#374151;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
            }
            .sd-subj-meta {
                font-size:11px; color:#6B7280; line-height:1.35;
            }
            .sd-subj-ann { margin-top:auto; padding-top:10px; border-top:1px solid #F0F0F0; min-height:48px; }
            .sd-subj-ann-label {
                font-size:9px; font-weight:700; text-transform:uppercase;
                letter-spacing:.6px; color:#9CA3AF; margin-bottom:4px;
            }
            .sd-subj-ann-msg {
                font-size:11px; color:#6B7280; line-height:1.4; margin:0;
                display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
            }
            .sd-subj-ann-msg strong { color:#111827; font-weight:600; }

            .sd-empty { padding:32px; text-align:center; color:#9CA3AF; font-size:13px; }
            .sd-empty a { color:${G}; font-weight:600; }

            @media(max-width:700px){
                .sd-academic { grid-template-columns:1fr; }
                .sd-todo-boxes { grid-template-columns:repeat(2, 1fr); }
            }
        </style>

        <div class="sd-wrap">

            <!-- Header -->
            <div class="sd-header">
                <div style="flex:1">
                    <h1>${greeting}, ${esc(user.first_name || 'Student')}</h1>
                    <p class="sd-header-sub">${todayStr}</p>
                    <div class="sd-chips">
                        <span class="sd-chip sd-chip--muted">Student ID: ${esc(user.student_id || '—')}</span>
                        <span class="sd-chip">${esc(yearLevel)}</span>
                    </div>
                    <div class="sd-academic">
                        <div class="sd-academic-item">
                            <span class="sd-academic-label">Program / Course</span>
                            <span class="sd-academic-value">${esc(programDisplay)}</span>
                        </div>
                        <div class="sd-academic-item">
                            <span class="sd-academic-label">Academic Year</span>
                            <span class="sd-academic-value">${esc(academicYear)}</span>
                </div>
                        <div class="sd-academic-item">
                            <span class="sd-academic-label">Current Semester</span>
                            <span class="sd-academic-value">${esc(semesterName)}</span>
            </div>
        </div>
                </div>
                <div class="sd-ring">
                    <svg width="72" height="72" viewBox="0 0 72 72">
                        <circle cx="36" cy="36" r="30" fill="none" stroke="#F0F0F0" stroke-width="6"/>
                        <circle cx="36" cy="36" r="30" fill="none" stroke="${G}" stroke-width="6"
                            stroke-dasharray="${lessonPct * 1.885} 188.5" stroke-linecap="round"/>
                    </svg>
                    <div class="sd-ring-val">${lessonPct}%</div>
                </div>
            </div>

            <!-- To-Do -->
            <div class="sd-todo-section" id="sd-todo-section">
                <div class="sd-todo-hdr">
                    <h2>My To-Do</h2>
                    <span>${pendingTotal} pending</span>
                </div>
                <div class="sd-todo-boxes" id="sd-todo-boxes">
                    ${todoBox('today', 'Due Today', todos.due_today)}
                    ${todoBox('miss', 'Missing', todos.missing, 'miss')}
                    ${todoBox('nodue', 'Assigned', todos.no_due_date)}
                    ${todoBox('done', 'Done', todos.done, 'done')}
                </div>
                <div id="sd-todo-lists">
                    ${todoList('today', todos.due_today)}
                    ${todoList('miss', todos.missing)}
                    ${todoList('nodue', todos.no_due_date)}
                    ${todoList('done', todos.done, true)}
                </div>
            </div>

            <!-- Subjects -->
            <div class="sd-panel">
                <div class="sd-panel-hdr">
                    <h3>My Subjects</h3>
                    <a href="#student/my-subjects">View all</a>
                </div>
                ${subjects.length === 0
                    ? `<div class="sd-empty">No subjects enrolled. <a href="#student/my-subjects?join=1">Join a subject</a></div>`
                    : `<div class="sd-subj-grid">${subjects.map(s => subjCard(s, annBySubject)).join('')}</div>`
                }
            </div>
        </div>
    `;

    // To-do: tap a box to show its list
    const todoBoxes = container.querySelectorAll('.sd-todo-box');

    function showTodoList(key) {
        container.querySelectorAll('.sd-todo-list').forEach(el => {
            el.hidden = el.dataset.col !== key;
        });
        todoBoxes.forEach(box => {
            box.classList.toggle('active', box.dataset.col === key);
        });
    }

    const defaultKey = firstTodoGroupWithItems(todos);
    showTodoList(defaultKey);

    todoBoxes.forEach(box => {
        box.addEventListener('click', () => showTodoList(box.dataset.col));
    });

    // Force white page background (overrides app cream)
    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) {
        pageContent.style.background = '#fff';
        pageContent.classList.add('sd-page-white');
    }

    clearInterval(_todoPollTimer);
    _todoPollTimer = setInterval(async () => {
        if (!document.getElementById('sd-todo-section')) return;
        const fresh = await Api.get('/DashboardAPI.php?action=student');
        if (!fresh.success) return;
        refreshTodoSection(container, fresh.data.todos || {});
    }, 15000);
}

function refreshTodoSection(container, todos) {
    const pendingTotal = (todos.due_today?.length || 0) + (todos.no_due_date?.length || 0) + (todos.missing?.length || 0);
    const hdrSpan = container.querySelector('.sd-todo-hdr span');
    if (hdrSpan) hdrSpan.textContent = `${pendingTotal} pending`;

    TODO_GROUPS.forEach(g => {
        const key = todoListKey(g.key);
        const items = todos[key] || [];
        const countEl = container.querySelector(`.sd-todo-box[data-col="${g.key}"] .sd-todo-box-count`);
        if (countEl) countEl.textContent = items.length;
        const listEl = container.querySelector(`.sd-todo-list[data-col="${g.key}"]`);
        if (listEl) {
            listEl.innerHTML = items.length
                ? items.map(item => todoRow(item, g.key === 'done')).join('')
                : `<div class="sd-todo-empty">Nothing in this list</div>`;
        }
    });
}

/* ── Helpers ── */

function groupAnnouncements(list) {
    const bySubject = {};
    for (const a of list) {
        const sid = a.subject_id;
        if (!sid) continue;
        if (!bySubject[sid]) bySubject[sid] = [];
        bySubject[sid].push(a);
    }
    return bySubject;
}

const TODO_GROUPS = [
    { key: 'today', label: 'Due Today' },
    { key: 'miss', label: 'Missing' },
    { key: 'nodue', label: 'Assigned' },
    { key: 'done', label: 'Done' },
];

function todoListKey(groupKey) {
    return groupKey === 'nodue' ? 'no_due_date' : groupKey;
}

function firstTodoGroupWithItems(todos) {
    for (const g of TODO_GROUPS) {
        if ((todos[todoListKey(g.key)] || []).length > 0) return g.key;
    }
    return 'today';
}

function todoBox(key, label, items, variant = '') {
    const count = (items || []).length;
    const cls = variant ? ` sd-todo-box--${variant}` : '';
    return `<button type="button" class="sd-todo-box${cls}" data-col="${key}" aria-label="${label}, ${count} items">
        <span class="sd-todo-box-count">${count}</span>
        <span class="sd-todo-box-label">${label}</span>
    </button>`;
}

function todoList(key, items, isDone = false) {
    const list = items || [];
    const body = list.length === 0
        ? `<div class="sd-todo-empty">Nothing in this list</div>`
        : list.map(item => todoRow(item, isDone)).join('');
    return `<div class="sd-todo-list" data-col="${key}" hidden>${body}</div>`;
}

function todoRow(item, isDone) {
    const href = item.subject_id
        ? `#student/subject?subject_id=${item.subject_id}&work=quiz&work_id=${item.quiz_id}`
        : `#student/take-quiz?quiz_id=${item.quiz_id}`;

    if (isDone) {
        return `<a class="sd-todo-row" href="${href}">
            <div class="sd-todo-row-main">
                <div class="sd-todo-row-top">
                    <span class="sd-todo-row-code">${esc(item.subject_code)}</span>
                    <span class="sd-todo-row-title">${esc(item.quiz_title)}</span>
                </div>
                <span class="sd-todo-row-sub">Completed ${formatDate(item.completed_at)}</span>
                </div>
            <div class="sd-todo-row-end">
                <span class="sd-todo-row-score">${item.last_score != null ? item.last_score + '%' : 'Done'}</span>
                </div>
        </a>`;
    }

    const due = item.due_date;
    let dueLabel = 'No due date';
    let dueCls = '';
    if (due) {
        const d = new Date(due + 'T00:00:00');
        const now = new Date(); now.setHours(0, 0, 0, 0);
        dueLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (d < now) { dueCls = 'sd-todo-row-due--late'; dueLabel = 'Overdue'; }
        else if (d.getTime() === now.getTime()) { dueCls = 'sd-todo-row-due--today'; dueLabel = 'Due today'; }
    }

    return `<a class="sd-todo-row" href="${href}">
        <div class="sd-todo-row-main">
            <div class="sd-todo-row-top">
                <span class="sd-todo-row-code">${esc(item.subject_code)}</span>
                <span class="sd-todo-row-title">${esc(item.quiz_title)}</span>
                </div>
            <span class="sd-todo-row-sub">${item.time_limit ? item.time_limit + ' min' : 'No time limit'}</span>
                </div>
        <div class="sd-todo-row-end">
            <span class="sd-todo-row-due ${dueCls}">${dueLabel}</span>
            <span class="sd-todo-row-action">Start →</span>
        </div>
    </a>`;
}

function subjCard(s, annBySubject) {
    const color = subjectColor(s.subject_id);
    const anns = annBySubject[s.subject_id] || [];
    const latest = anns[0];

    const annHtml = latest
        ? `<div class="sd-subj-ann">
            <div class="sd-subj-ann-label">Announcement</div>
            <p class="sd-subj-ann-msg"><strong>${esc(latest.title)}</strong> — ${esc(truncate(latest.content, 60))}</p>
           </div>`
        : `<div class="sd-subj-ann"><p class="sd-subj-ann-msg" style="font-style:italic;color:#BDC1C6">No announcements</p></div>`;

    return `<a class="sd-subj" href="#student/subject?subject_id=${s.subject_id}">
        <div class="sd-subj-band" style="background:${color}">
            <div class="sd-subj-code">${esc(s.subject_code)}</div>
            <div class="sd-subj-name">${esc(s.subject_name)}</div>
        </div>
        <div class="sd-subj-body">
            <div class="sd-subj-teacher">${icon('user', inl)} ${esc(s.instructor_name || 'Instructor TBA')}</div>
            ${s.schedule ? `<div class="sd-subj-meta">${icon('clock', inl)} ${esc(s.schedule)}</div>` : ''}
            ${s.room ? `<div class="sd-subj-meta">${icon('pin', inl)} ${esc(s.room)}</div>` : ''}
            ${annHtml}
        </div>
    </a>`;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function truncate(s, n) { const t = (s||'').replace(/\s+/g,' ').trim(); return t.length > n ? t.slice(0,n)+'…' : t; }
function formatDate(dt) {
    if (!dt) return '';
    return new Date(dt).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
