/**
 * Student Lessons Page — Redesigned
 */
import { Api } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const filterSubject = params.get('subject_id') || '';

    container.innerHTML = `<style>${css()}</style><div class="lp-spinner"><div class="spinner"></div></div>`;

    const subjRes = await Api.get('/EnrollmentAPI.php?action=my-subjects');
    const subjects = subjRes.success ? subjRes.data : [];

    // Pre-fetch all lesson groups in parallel
    const groups = await Promise.all(
        subjects.map(s =>
            Api.get('/LessonsAPI.php?action=list&subject_id=' + s.subject_offered_id)
                .then(r => ({ subject: s, lessons: r.success ? r.data : [] }))
                .catch(() => ({ subject: s, lessons: [] }))
        )
    );

    // Overall stats
    const totalLessons    = groups.reduce((n, g) => n + g.lessons.length, 0);
    const totalCompleted  = groups.reduce((n, g) => n + g.lessons.filter(l => l.is_completed == 1).length, 0);
    const overallPct      = totalLessons > 0 ? Math.round(totalCompleted / totalLessons * 100) : 0;

    container.innerHTML = `<style>${css()}</style>

        <!-- Banner -->
        <div class="lp-banner">
            <div class="lp-banner-left">
                <div class="lp-banner-icon">
                    <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
                    </svg>
                </div>
                <div>
                    <h2 class="lp-banner-title">My Lessons</h2>
                    <p class="lp-banner-sub">Track your progress across all enrolled subjects</p>
                </div>
            </div>
            <div class="lp-stats-strip">
                <div class="lp-stat"><span class="lp-stat-val">${subjects.length}</span><span class="lp-stat-lbl">Subjects</span></div>
                <div class="lp-stat"><span class="lp-stat-val">${totalLessons}</span><span class="lp-stat-lbl">Total Lessons</span></div>
                <div class="lp-stat"><span class="lp-stat-val">${totalCompleted}</span><span class="lp-stat-lbl">Completed</span></div>
                <div class="lp-stat"><span class="lp-stat-val">${overallPct}%</span><span class="lp-stat-lbl">Overall</span></div>
            </div>
        </div>

        <!-- Subject filter tabs -->
        <div class="lp-tabs">
            <button class="lp-tab ${!filterSubject ? 'active' : ''}" data-id="">All Subjects</button>
            ${subjects.map(s => `
                <button class="lp-tab ${filterSubject == s.subject_id ? 'active' : ''}" data-id="${s.subject_id}">
                    ${esc(s.subject_code)}
                </button>
            `).join('')}
        </div>

        <!-- Content -->
        <div id="lp-content"></div>
    `;

    let currentFilter = filterSubject;

    container.querySelectorAll('.lp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.lp-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.id;
            renderGroups(container.querySelector('#lp-content'), groups, currentFilter);
        });
    });

    renderGroups(container.querySelector('#lp-content'), groups, currentFilter);

    // Mark complete — delegated
    container.addEventListener('click', async e => {
        const btn = e.target.closest('.lp-btn-complete');
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        const lessonId = btn.dataset.lesson;
        btn.disabled = true;
        btn.innerHTML = `<svg class="spin-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>`;
        const res = await Api.post('/LessonsAPI.php?action=complete', { lessons_id: parseInt(lessonId) });
        if (res.success) {
            // Refresh data and re-render
            const updated = await Promise.all(
                groups.map(async g => {
                    const r = await Api.get('/LessonsAPI.php?action=list&subject_id=' + g.subject.subject_offered_id).catch(() => ({ success: false }));
                    return { subject: g.subject, lessons: r.success ? r.data : g.lessons };
                })
            );
            groups.forEach((g, i) => g.lessons = updated[i].lessons);
            renderGroups(container.querySelector('#lp-content'), groups, currentFilter);
        } else {
            btn.disabled = false;
            btn.textContent = 'Mark Complete';
        }
    });
}

function renderGroups(content, groups, filterSubject) {
    const filtered = filterSubject ? groups.filter(g => g.subject.subject_id == filterSubject) : groups;

    if (filtered.length === 0) {
        content.innerHTML = `
            <div class="lp-empty">
                <div class="lp-empty-icon">${iconLg('book')}</div>
                <h3>No subjects enrolled</h3>
                <p><a href="#student/my-subjects?join=1">Join a subject</a> to start learning.</p>
            </div>`;
        return;
    }

    content.innerHTML = filtered.map(g => {
        const total     = g.lessons.length;
        const completed = g.lessons.filter(l => l.is_completed == 1).length;
        const pct       = total > 0 ? Math.round(completed / total * 100) : 0;
        const radius    = 26, circ = 2 * Math.PI * radius;
        const dash      = ((100 - pct) / 100) * circ;

        return `
        <div class="lp-group">
            <!-- Subject header card -->
            <div class="lp-group-hdr">
                <div class="lp-group-hdr-left">
                    <span class="lp-subj-code">${esc(g.subject.subject_code)}</span>
                    <div>
                        <div class="lp-subj-name">${esc(g.subject.subject_name)}</div>
                        <div class="lp-subj-meta">
                            ${g.subject.instructor_name ? `<span>${esc(g.subject.instructor_name)}</span><span class="lp-dot">·</span>` : ''}
                            <span>${total} lesson${total !== 1 ? 's' : ''}</span>
                            ${g.subject.section_name ? `<span class="lp-dot">·</span><span>${esc(g.subject.section_name)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="lp-ring-wrap">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="${radius}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="5"/>
                        <circle cx="32" cy="32" r="${radius}" fill="none" stroke="#fff" stroke-width="5"
                            stroke-dasharray="${circ}" stroke-dashoffset="${dash}"
                            stroke-linecap="round" transform="rotate(-90 32 32)"/>
                    </svg>
                    <div class="lp-ring-text">${pct}%</div>
                </div>
            </div>

            <!-- Progress bar -->
            <div class="lp-prog-bar"><div class="lp-prog-fill" style="width:${pct}%"></div></div>
            <div class="lp-prog-label">${completed} of ${total} lesson${total !== 1 ? 's' : ''} completed</div>

            <!-- Lesson list -->
            ${total === 0
                ? `<div class="lp-no-lessons">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
                    No lessons published yet.
                   </div>`
                : `<div class="lp-lessons">
                    ${g.lessons.map((l, idx) => {
                        const done   = l.is_completed == 1;
                        const locked = l.is_locked == 1;
                        const state  = done ? 'done' : locked ? 'locked' : 'available';
                        const date   = l.completed_at
                            ? new Date(l.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '';
                        const isLast = idx === g.lessons.length - 1;

                        return `
                        <div class="lp-lesson-row ${state} ${isLast ? 'last' : ''}">
                            <!-- Timeline dot -->
                            <div class="lp-tl">
                                <div class="lp-dot-wrap">
                                    <div class="lp-tl-dot ${state}">
                                        ${done
                                            ? `<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>`
                                            : locked
                                                ? `<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>`
                                                : `<span>${l.order_number || idx + 1}</span>`
                                        }
                                    </div>
                                </div>
                                ${!isLast ? '<div class="lp-tl-line"></div>' : ''}
                            </div>

                            <!-- Card -->
                            <a class="lp-card ${state}" ${!locked ? `href="#student/lesson-view?id=${l.lessons_id}"` : ''}>
                                <div class="lp-card-body">
                                    <div class="lp-card-title">${esc(l.title)}</div>
                                    <div class="lp-card-meta">
                                        ${l.estimated_time ? `<span class="lp-meta-chip">${icon('timer', inl)} ${l.estimated_time} min</span>` : ''}
                                        ${l.difficulty ? `<span class="lp-meta-chip diff-${l.difficulty}">${l.difficulty.charAt(0).toUpperCase() + l.difficulty.slice(1)}</span>` : ''}
                                        ${l.description ? `<span class="lp-card-desc">${esc(l.description)}</span>` : ''}
                                    </div>
                                    ${locked ? `<div class="lp-lock-msg">
                                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>
                                        Complete the previous lesson to unlock
                                    </div>` : ''}
                                </div>
                                <div class="lp-card-right">
                                    ${done ? `
                                        <span class="lp-status-badge done">
                                            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                                            Completed
                                        </span>
                                        ${date ? `<span class="lp-date">${date}</span>` : ''}
                                    ` : locked ? `
                                        <span class="lp-status-badge locked">
                                            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                                            Locked
                                        </span>
                                    ` : l.linked_quiz_id ? `
                                        <span class="lp-status-badge quiz">${L.hasQuiz}</span>
                                        <span class="lp-open-arrow">→</span>
                                    ` : `
                                        <button class="lp-btn-complete" data-lesson="${l.lessons_id}">Mark Complete</button>
                                    `}
                                </div>
                            </a>
                        </div>`;
                    }).join('')}
                   </div>`
            }
        </div>`;
    }).join('');
}

function css() {
    return `
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin-icon { animation: spin .7s linear infinite; }
    .lp-spinner { display:flex; justify-content:center; padding:80px; }
    .spinner { width:36px; height:36px; border:3px solid #e8e8e8; border-top-color:#1B4D3E; border-radius:50%; animation:spin .8s linear infinite; }

    /* Banner */
    .lp-banner {
        background: #00461B;
        border-radius: 18px; padding: 0; margin-bottom: 24px;
        overflow: hidden; box-shadow: 0 4px 20px rgba(0,70,27,.18);
    }
    .lp-banner-left {
        display: flex; align-items: center; gap: 16px;
        padding: 24px 28px 20px; flex-wrap: wrap;
    }
    .lp-banner-icon {
        width: 52px; height: 52px; border-radius: 14px;
        background: rgba(255,255,255,.15); display: flex;
        align-items: center; justify-content: center; flex-shrink: 0;
    }
    .lp-banner-title { font-size: 22px; font-weight: 800; color: #fff; margin: 0 0 3px; }
    .lp-banner-sub   { font-size: 13px; color: rgba(255,255,255,.7); margin: 0; }
    .lp-stats-strip  {
        display: grid; grid-template-columns: repeat(4,1fr);
        border-top: 1px solid rgba(255,255,255,.12);
    }
    .lp-stat {
        display: flex; flex-direction: column; align-items: center;
        padding: 14px 8px; border-right: 1px solid rgba(255,255,255,.1); text-align: center;
    }
    .lp-stat:last-child { border-right: none; }
    .lp-stat-val { font-size: 22px; font-weight: 800; color: #fff; line-height: 1; margin-bottom: 3px; }
    .lp-stat-lbl { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.6); text-transform: uppercase; letter-spacing: .6px; }

    /* Tabs */
    .lp-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
    .lp-tab {
        padding: 7px 18px; border-radius: 20px; font-size: 13px; font-weight: 600;
        border: 1.5px solid #e5e7eb; color: #6b7280; background: #fff;
        cursor: pointer; transition: all .15s;
    }
    .lp-tab:hover  { border-color: #1B4D3E; color: #1B4D3E; background: #f0fdf4; }
    .lp-tab.active { background: #1B4D3E; color: #fff; border-color: #1B4D3E; }

    /* Subject group */
    .lp-group { margin-bottom: 32px; }

    .lp-group-hdr {
        background: #00461B;
        border-radius: 14px 14px 0 0; padding: 20px 24px;
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
    }
    .lp-group-hdr-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .lp-subj-code {
        background: rgba(255,255,255,.2); color: #fff;
        padding: 5px 12px; border-radius: 8px; font-size: 12px;
        font-weight: 800; font-family: monospace; letter-spacing: .5px; flex-shrink: 0;
    }
    .lp-subj-name { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .lp-subj-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,.7); flex-wrap: wrap; }
    .lp-dot { color: rgba(255,255,255,.4); }

    /* Progress ring */
    .lp-ring-wrap { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
    .lp-ring-text {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
        font-size: 13px; font-weight: 800; color: #fff;
    }

    /* Progress bar */
    .lp-prog-bar  { height: 5px; background: #e8e8e8; border-radius: 0; overflow: hidden; }
    .lp-prog-fill { height: 100%; background: #1B4D3E; transition: width .6s ease; }
    .lp-prog-label { font-size: 12px; color: #9ca3af; padding: 6px 24px 14px; background: #fff; border-left: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; }

    /* Lessons container */
    .lp-lessons {
        background: #fff; border: 1px solid #f1f5f9; border-top: none;
        border-radius: 0 0 14px 14px; overflow: hidden;
    }
    .lp-no-lessons {
        background: #fff; border: 1px solid #f1f5f9; border-top: none;
        border-radius: 0 0 14px 14px; padding: 24px;
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; color: #9ca3af;
    }

    /* Lesson row */
    .lp-lesson-row {
        display: flex; gap: 0; padding: 0 20px;
        border-bottom: 1px solid #f8fafc;
    }
    .lp-lesson-row.last { border-bottom: none; }

    /* Timeline column */
    .lp-tl { display: flex; flex-direction: column; align-items: center; width: 36px; flex-shrink: 0; padding-top: 20px; }
    .lp-dot-wrap { position: relative; z-index: 1; }
    .lp-tl-dot {
        width: 32px; height: 32px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; border: 2px solid transparent;
        flex-shrink: 0;
    }
    .lp-tl-dot.done      { background: #1B4D3E; color: #fff; border-color: #1B4D3E; }
    .lp-tl-dot.available { background: #fff; color: #1B4D3E; border-color: #1B4D3E; }
    .lp-tl-dot.locked    { background: #f9fafb; color: #d1d5db; border-color: #e5e7eb; }
    .lp-tl-line { width: 2px; flex: 1; min-height: 16px; margin: 4px 0; }
    .lp-lesson-row.done .lp-tl-line      { background: #bbf7d0; }
    .lp-lesson-row.available .lp-tl-line { background: #e5e7eb; }
    .lp-lesson-row.locked .lp-tl-line    { background: #f3f4f6; }

    /* Card */
    .lp-card {
        flex: 1; margin-left: 14px; padding: 16px 4px;
        display: flex; align-items: center; gap: 16px;
        text-decoration: none; color: inherit; cursor: pointer;
        transition: none;
    }
    .lp-card.locked { opacity: .65; cursor: not-allowed; pointer-events: none; }
    .lp-card.available:hover .lp-card-title,
    .lp-card.done:hover .lp-card-title { color: #1B4D3E; }

    .lp-card-body  { flex: 1; min-width: 0; }
    .lp-card-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 5px; transition: color .15s; }
    .lp-card-meta  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .lp-card-desc  { font-size: 12px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lp-meta-chip  { font-size: 11px; font-weight: 600; color: #6b7280; background: #f3f4f6; padding: 2px 8px; border-radius: 10px; }
    .diff-beginner     { background: #dcfce7; color: #15803d; }
    .diff-intermediate { background: #fef3c7; color: #b45309; }
    .diff-advanced     { background: #fee2e2; color: #b91c1c; }
    .lp-lock-msg { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: #b45309; margin-top: 6px; }

    .lp-card-right { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }

    .lp-status-badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;
    }
    .lp-status-badge.done   { background: #dcfce7; color: #15803d; }
    .lp-status-badge.locked { background: #f3f4f6; color: #9ca3af; }
    .lp-status-badge.quiz   { background: #fef3c7; color: #b45309; }
    .lp-date { font-size: 11px; color: #9ca3af; }
    .lp-open-arrow { font-size: 16px; color: #1B4D3E; font-weight: 700; }

    .lp-btn-complete {
        padding: 7px 16px; background: #1B4D3E; color: #fff;
        border: none; border-radius: 8px; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: background .15s; white-space: nowrap;
        display: inline-flex; align-items: center; gap: 6px;
    }
    .lp-btn-complete:hover    { background: #2D6A4F; }
    .lp-btn-complete:disabled { opacity: .6; cursor: not-allowed; }

    /* Empty */
    .lp-empty {
        display: flex; flex-direction: column; align-items: center;
        padding: 80px 24px; text-align: center; color: #9ca3af;
    }
    .lp-empty-icon { font-size: 48px; margin-bottom: 16px; }
    .lp-empty h3   { font-size: 16px; font-weight: 700; color: #374151; margin: 0 0 8px; }
    .lp-empty p    { font-size: 13px; margin: 0; }
    .lp-empty a    { color: #1B4D3E; font-weight: 600; text-decoration: none; }

    @media (max-width: 640px) {
        .lp-stats-strip { grid-template-columns: repeat(2,1fr); }
        .lp-group-hdr   { flex-wrap: wrap; }
        .lp-ring-wrap   { display: none; }
    }
    `;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
