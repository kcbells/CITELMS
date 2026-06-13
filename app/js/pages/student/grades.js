/**
 * Student Grades Page
 * Clean subject-picker layout — one subject at a time via dropdown
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { icon } from '../../utils/icons.js';
import { curriculumTableCss } from '../../utils/classroom-ui.js';
import { getFullName } from '../../utils/user-display.js';
import {
    GRADING_PERIODS, buildPeriodGroups, periodQuizSubtotal, isItemMissing,
    gradingPeriodTableCss, periodMeta,
} from '../../utils/gradebook-periods.js';

export async function render(container) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId = hashParams.get('subject_id') || '';
    await renderGradesView(container, { subjectId });
}

/** Embed student grades inside a subject tab */
export async function mountStudentGrades(host, { subjectId } = {}) {
    await renderGradesView(host, { subjectId, embedded: true });
}

async function renderGradesView(container, { subjectId = '', embedded = false } = {}) {
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:${embedded ? '24px' : '60px'}">
        <div style="width:36px;height:36px;border:3px solid #e8e8e8;border-top-color:#1B4D3E;border-radius:50%;animation:spin .8s linear infinite"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>`;

    await Auth.getUser?.();
    const me = Auth.user?.() || {};
    const myName = getFullName(me) || 'My scores';

    const res = await Api.get('/ProgressAPI.php?action=grades');
    if (!res.success) {
        container.innerHTML = `
            <div class="empty-state" style="padding:${embedded ? '24px' : '48px'};text-align:center">
                <div class="empty-state-icon">!</div>
                <h3>Could not load grades</h3>
                <p>${esc(res.message || 'Please refresh and try again.')}</p>
            </div>`;
        return;
    }
    let subjects = res.data || [];
    if (subjectId) {
        subjects = subjects.filter(s => String(s.subject_id) === String(subjectId));
    }
    const lockSubject = !!subjectId;

    /* ── Overall stats (raw points — addition only) ─────────────── */
    let totalQuizzes = 0, totalPassed = 0, totalEarned = 0, totalPossible = 0;
    subjects.forEach(s => {
        s.quizzes.forEach(q => {
            totalQuizzes++;
            if (q.passed == 1) totalPassed++;
            if (q.earned_points != null && q.total_points != null) {
                totalEarned += parseFloat(q.earned_points) || 0;
                totalPossible += parseFloat(q.total_points) || 0;
            }
        });
    });
    const totalRawLabel = totalPossible > 0 ? `${totalEarned} / ${totalPossible}` : '—';

  const activeSubject = subjects[0] || null;
  const activeTotals = activeSubject ? rawTotals(activeSubject.quizzes) : { earned: 0, possible: 0 };

    /* ── Shell ─────────────────────────────────────────────────────── */
    container.innerHTML = `
        <style>
            ${curriculumTableCss()}
            ${gradingPeriodTableCss()}
            .gc-cur-badge-raw { font-size:12px; font-weight:700; color:#111827; }
            .gc-cur-badge-missing { display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; background:#FEF3C7; color:#B45309; }
            .gb-record-table { min-width:640px; }
            .gb-period-subtotal-cell { background:#f8fdf9 !important; }
            .gb-at-risk { background:#FEF2F2 !important; }
            .gb-risk-tag { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px;
                border-radius:50%; background:#FEE2E2; color:#B91C1C; font-size:10px; font-weight:800; margin-left:4px; }
            .gr-period-legend {
                padding:12px 22px; font-size:12px; color:#00461B; background:#E8F5EC;
                border-bottom:1px solid #f1f5f9;
            }
            .gr-panel-periods .gb-period-section { margin:0; }
            .gr-panel-periods .gb-period-section-hdr { border-radius:0; }
            .gr-panel-periods .gb-period-panel { border-left:none; border-right:none; border-radius:0; }
            .gr-panel-periods .gb-period-section:last-of-type .gb-period-panel { border-bottom:none; }
            .gr-grand-total {
                display:flex; justify-content:space-between; align-items:center;
                padding:16px 22px; background:#f9fafb; border-top:2px solid #e5e7eb;
                font-size:13px; font-weight:600; color:#374151;
            }
            .gr-grand-total strong { font-size:18px; color:#1B4D3E; }
            .gb-table-scroll { overflow-x:auto; }
            .gr-cell-link { color:#1B4D3E; text-decoration:none; font-weight:700; }
            .gr-cell-link:hover { text-decoration:underline; }
            .gr-panel-periods .gc-cur-wrap { margin:0; }
            .gr-embedded .gr-banner { border-radius:12px; margin-bottom:14px; padding:18px 20px; }
            .gr-embedded .gr-banner-left h2 { font-size:18px; }
            .gr-role-badge {
                display:inline-flex; align-items:center; gap:5px;
                padding:4px 10px; border-radius:20px; font-size:10px; font-weight:700;
                text-transform:uppercase; letter-spacing:.5px;
                background:rgba(255,255,255,.18); color:#fff; margin-bottom:6px;
            }
            .gr-embed-stats {
                display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;
            }
            .gr-embed-stat {
                flex:1; min-width:100px; background:#fff; border:1px solid #e8e8e8;
                border-radius:12px; padding:12px 14px; text-align:center;
            }
            .gr-embed-stat strong { display:block; font-size:20px; font-weight:800; color:#111827; }
            .gr-embed-stat span { font-size:11px; color:#9CA3AF; font-weight:600; text-transform:uppercase; }
            /* Banner */
            .gr-banner { background:linear-gradient(135deg,#1B4D3E 0%,#2D6A4F 60%,#40916C 100%); border-radius:16px; padding:24px 28px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; position:relative; overflow:hidden; }
            .gr-banner::before { content:''; position:absolute; right:-30px; top:-30px; width:160px; height:160px; border-radius:50%; background:rgba(255,255,255,.05); }
            .gr-banner-left { position:relative; z-index:1; }
            .gr-banner-left h2 { font-size:22px; font-weight:800; color:#fff; margin:0 0 4px; }
            .gr-banner-left p  { font-size:13px; color:rgba(255,255,255,.7); margin:0; }
            .gr-banner-right { position:relative; z-index:1; }
            .gr-banner-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:9px; font-size:13px; font-weight:600; text-decoration:none; background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.25); transition:all .15s; }
            .gr-banner-btn:hover { background:rgba(255,255,255,.25); }

            /* Summary cards */
            .gr-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
            .gr-sum-card { background:#fff; border:1px solid #f1f5f9; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.07); padding:18px 20px; display:flex; align-items:center; gap:14px; }
            .gr-sum-icon { width:44px; height:44px; border-radius:12px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
            .gr-sum-val { font-size:24px; font-weight:800; color:#111827; line-height:1; }
            .gr-sum-lbl { font-size:12px; color:#9CA3AF; margin-top:3px; font-weight:500; }

            /* Subject selector bar */
            .gr-selector-bar { background:#fff; border:1px solid #e8e8e8; border-radius:14px; padding:16px 20px; margin-bottom:20px; display:flex; align-items:center; gap:14px; box-shadow:0 1px 3px rgba(0,0,0,.05); }
            .gr-selector-label { font-size:13px; font-weight:700; color:#374151; white-space:nowrap; }
            .gr-selector-wrap { position:relative; flex:1; max-width:380px; }
            .gr-selector-wrap svg.gr-chevron { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; color:#6b7280; }
            .gr-subject-select { width:100%; padding:10px 38px 10px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:14px; font-weight:600; color:#111827; background:#fff; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; transition:border-color .15s; }
            .gr-subject-select:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }
            .gr-selector-info { margin-left:auto; display:flex; align-items:center; gap:8px; }
            .gr-sel-avg-badge { padding:5px 14px; border-radius:20px; font-size:12px; font-weight:700; }

            /* Quiz panel */
            .gr-panel { background:#fff; border:1px solid #e8e8e8; border-radius:16px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.06); }
            .gr-panel-head { padding:16px 22px; background:linear-gradient(90deg,#f9fafb,#fff); border-bottom:1px solid #f1f5f9; display:flex; align-items:center; gap:12px; }
            .gr-panel-code { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:800; font-family:monospace; letter-spacing:.5px; }
            .gr-panel-name { font-size:15px; font-weight:700; color:#111827; }
            .gr-panel-count { margin-left:auto; font-size:12px; color:#9CA3AF; font-weight:600; }

            /* Table */
            .gr-table { width:100%; border-collapse:collapse; }
            .gr-table thead tr { background:#fafafa; }
            .gr-table th { text-align:left; padding:11px 20px; font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #f1f5f9; }
            .gr-table tbody tr { border-bottom:1px solid #f7f7f7; transition:background .12s; }
            .gr-table tbody tr:last-child { border-bottom:none; }
            .gr-table tbody tr:hover { background:#f9fffe; }
            .gr-table td { padding:13px 20px; font-size:13px; vertical-align:middle; }

            .gr-quiz-name { font-weight:600; color:#111827; font-size:14px; }
            .gr-type { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
            .gr-type.quiz { background:#f1f5f9; color:#475569; }
            .gr-type.pre  { background:#DBEAFE; color:#1E40AF; }
            .gr-type.post { background:#EDE9FE; color:#6D28D9; }

            .gr-score-cell { display:flex; align-items:center; gap:10px; }
            .gr-score-track { flex:1; max-width:110px; height:7px; background:#f1f5f9; border-radius:99px; overflow:hidden; }
            .gr-score-fill  { height:100%; border-radius:99px; }
            .gr-score-num   { font-size:14px; font-weight:800; white-space:nowrap; min-width:48px; }
            .gr-score-none  { font-size:13px; color:#9CA3AF; }

            .gr-status { display:inline-flex; align-items:center; gap:5px; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; }
            .gr-status.passed    { background:#DCFCE7; color:#15803D; }
            .gr-status.failed    { background:#FEE2E2; color:#B91C1C; }
            .gr-status.nottaken  { background:#f1f5f9; color:#9CA3AF; }
            .gr-status.missing   { background:#FEF3C7; color:#B45309; }
            .gr-status.submitted { background:#DBEAFE; color:#1D4ED8; }
            .gr-status.graded    { background:#E0E7FF; color:#4338CA; }

            .gr-total-row td { background:#f9fafb; border-top:2px solid #e5e7eb; font-weight:700; }
            .gr-points { font-size:13px; font-weight:700; color:#374151; white-space:nowrap; }

            .gr-progress-block { padding:16px 22px; border-bottom:1px solid #f1f5f9; background:#fafafa; }
            .gr-progress-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:12px; font-weight:600; color:#6b7280; }
            .gr-progress-top strong { color:#1B4D3E; font-size:14px; }
            .gr-progress-track { height:8px; background:#e5e7eb; border-radius:99px; overflow:hidden; }
            .gr-progress-fill { height:100%; background:linear-gradient(90deg,#1B4D3E,#40916C); border-radius:99px; transition:width .3s; }

            .gr-view-btn { display:inline-flex; align-items:center; gap:4px; padding:5px 12px; border-radius:8px;
                font-size:11px; font-weight:700; color:#1B4D3E; background:#E8F5E9; text-decoration:none; border:none; cursor:pointer; }
            .gr-view-btn:hover { background:#d1fae5; }

            .gr-attempts { display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:28px; padding:0 8px; border-radius:8px; background:#f8fafc; color:#64748b; font-size:13px; font-weight:700; }

            /* No quizzes */
            .gr-no-quizzes { padding:48px 20px; text-align:center; }
            .gr-no-quizzes-icon { width:52px; height:52px; background:#f3f4f6; border-radius:14px; display:flex; align-items:center; justify-content:center; margin:0 auto 14px; font-size:24px; }
            .gr-no-quizzes p { font-size:13px; color:#9CA3AF; margin:0; }

            /* Empty state */
            .gr-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:260px; text-align:center; background:#fff; border-radius:16px; border:2px dashed #e2e8f0; color:#9CA3AF; padding:40px; }

            @keyframes gr-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
            .gr-panel { animation:gr-fadein .2s ease; }

            @media(max-width:900px) { .gr-summary { grid-template-columns:1fr 1fr; } }
            @media(max-width:640px) {
                .gr-summary { grid-template-columns:1fr 1fr; }
                .gr-score-track { display:none; }
                .gr-selector-bar { flex-wrap:wrap; }
                .gr-selector-info { margin-left:0; }
            }
        </style>

        <div class="${embedded ? 'gr-embedded' : ''}">
        ${embedded ? `
        <div class="gr-banner">
            <div class="gr-banner-left">
                <span class="gr-role-badge">${icon('graduation', { size: 12, className: 'ui-icon-inline' })} Student view</span>
                <h2>My Grades${activeSubject ? ` · ${esc(activeSubject.subject_code)}` : ''}</h2>
                <p>${activeSubject ? esc(activeSubject.subject_name) : 'Your scores for this subject'}</p>
            </div>
        </div>
        ${activeSubject ? `
        <div class="gr-embed-stats">
            <div class="gr-embed-stat"><strong>${activeSubject.quizzes.length}</strong><span>Assessments</span></div>
            <div class="gr-embed-stat"><strong style="color:#15803D">${activeSubject.quizzes.filter(q => q.passed == 1).length}</strong><span>Passed</span></div>
            <div class="gr-embed-stat"><strong>${activeTotals.possible > 0 ? `${activeTotals.earned} / ${activeTotals.possible}` : '—'}</strong><span>Total score</span></div>
        </div>` : ''}
        ` : `
        <!-- Banner -->
        <div class="gr-banner">
            <div class="gr-banner-left">
                <span class="gr-role-badge">${icon('graduation', { size: 12, className: 'ui-icon-inline' })} Student view</span>
                <h2>My Grades</h2>
                <p>Your quiz performance across all enrolled subjects</p>
            </div>
            <div class="gr-banner-right">
                <a href="#student/messages" class="gr-banner-btn">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
                    Messages
                </a>
            </div>
        </div>

        <!-- Summary cards -->
        <div class="gr-summary">
            <div class="gr-sum-card">
                <div class="gr-sum-icon" style="background:#E8F5E9;color:#1B4D3E">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
                </div>
                <div><div class="gr-sum-val">${subjects.length}</div><div class="gr-sum-lbl">Subjects</div></div>
            </div>
            <div class="gr-sum-card">
                <div class="gr-sum-icon" style="background:#DBEAFE;color:#1E40AF">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/></svg>
                </div>
                <div><div class="gr-sum-val">${totalQuizzes}</div><div class="gr-sum-lbl">Quizzes Taken</div></div>
            </div>
            <div class="gr-sum-card">
                <div class="gr-sum-icon" style="background:#DCFCE7;color:#15803D">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div><div class="gr-sum-val" style="color:#15803D">${totalPassed}</div><div class="gr-sum-lbl">Passed</div></div>
            </div>
            <div class="gr-sum-card">
                <div class="gr-sum-icon" style="background:#E8F5E9;color:#1B4D3E">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-3h6"/></svg>
                </div>
                <div>
                    <div class="gr-sum-val" style="color:#1B4D3E">${totalRawLabel}</div>
                    <div class="gr-sum-lbl">Total Score</div>
                </div>
            </div>
        </div>
        `}

        ${subjects.length === 0
            ? `<div class="gr-empty">
                <div style="font-size:36px;margin-bottom:14px">📋</div>
                <h3 style="font-size:16px;font-weight:700;color:#374151;margin:0 0 6px">No grades yet</h3>
                <p style="font-size:13px;margin:0">${lockSubject ? 'No quiz scores recorded for this subject yet.' : 'Enroll in subjects and take quizzes to see your scores here.'}</p>
               </div>`
            : `${!embedded && !lockSubject ? `<!-- Subject selector bar -->
               <div class="gr-selector-bar">
                   <span class="gr-selector-label">📚 Subject</span>
                   <div class="gr-selector-wrap">
                       <select class="gr-subject-select" id="gr-subject-select">
                           ${subjects.map((s, i) =>
                               `<option value="${i}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`
                           ).join('')}
                       </select>
                       <svg class="gr-chevron" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                   </div>
                   <div class="gr-selector-info" id="gr-sel-info"></div>
               </div>` : ''}

               <!-- Quiz panel (swapped by JS) -->
               <div id="gr-panel-wrap"></div>`
        }
        </div>
    `;

    if (subjects.length === 0) return;

    /* ── Render one subject's grades by period ───────────────────── */
    function renderSubject(idx) {
        const s   = subjects[idx];
        const quizzes = s.quizzes || [];
        const lessons = s.lessons || [];
        const periodGroups = buildPeriodGroups(quizzes, lessons, 0);
        const current = periodMeta(s.current_period || 'P1');
        const periods = GRADING_PERIODS.filter(p => p.code === current.code);
        const dispItems = periods.flatMap(p => periodGroups.groups[p.code]);

        const quizScoreMap = {};
        for (const q of quizzes) {
            if (q.earned_points != null && q.total_points != null) {
                quizScoreMap[q.quiz_id] = {
                    earned: parseFloat(q.earned_points) || 0,
                    total: parseFloat(q.total_points) || 0,
                };
            }
        }

        /* Current-term subtotal (only the released period counts) */
        let dispEarned = 0;
        let dispPossible = 0;
        for (const period of periods) {
            const sub = periodQuizSubtotal(quizScoreMap, periodGroups.groups[period.code]);
            dispEarned += sub.earned;
            dispPossible += sub.possible;
        }

        const infoEl = container.querySelector('#gr-sel-info');
        if (infoEl) {
            infoEl.innerHTML = dispPossible > 0
                ? `<span class="gr-sel-avg-badge" style="background:#E8F5E9;color:#1B4D3E">${current.label} total: ${dispEarned} / ${dispPossible}</span>`
                : `<span class="gr-sel-avg-badge" style="background:#f1f5f9;color:#9CA3AF">No ${current.label} scores yet</span>`;
        }

        const wrap = container.querySelector('#gr-panel-wrap');
        if (!wrap) return;

        const totalItems = dispItems.length;
        if (periodGroups.flat.length === 0) {
            wrap.innerHTML = `
                <div class="gr-panel">
                    <div class="gr-panel-head">
                        <span class="gr-panel-code">${esc(s.subject_code)}</span>
                        <span class="gr-panel-name">${esc(s.subject_name)}</span>
                    </div>
                    <div class="gr-no-quizzes">
                        <div class="gr-no-quizzes-icon">📝</div>
                        <p>No activities or quizzes published for this subject yet.</p>
                    </div>
                </div>`;
            return;
        }

        const lessonStatusMap = {};
        for (const l of lessons) {
            lessonStatusMap[l.lessons_id] = l.progress_status;
        }

        /* Two-row header: current period + its items underneath */
        let periodRow = `<th rowspan="2" class="th-left">Assessment</th>`;
        let itemRow = '';
        const periodSubtotals = {};
        for (const period of periods) {
            const items = periodGroups.groups[period.code];
            const colCount = Math.max(items.length, 1);
            periodRow += `<th colspan="${colCount}" class="gb-period-th gb-period-th--${period.code.toLowerCase()}">${period.label}<span class="gb-period-sub">${period.title}</span></th>`;
            periodRow += `<th rowspan="2" class="gb-period-subtotal-th">${period.label} &Sigma;</th>`;
            if (items.length) {
                for (const item of items) {
                    const typeLabel = item.kind === 'quiz' ? 'Quiz' : 'Activity';
                    const short = item.title.length > 16 ? `${item.title.slice(0, 14)}…` : item.title;
                    const pts = item.kind === 'quiz' && item.totalPoints ? ` · ${item.totalPoints}pts` : '';
                    itemRow += `<th class="gb-item-th" title="${esc(item.title)} (${typeLabel})${pts}">
                        <span class="gb-item-type ${item.kind === 'quiz' ? 'quiz' : 'activity'}">${typeLabel}</span>
                        <span class="gb-item-name">${esc(short)}</span>
                    </th>`;
                }
            } else {
                itemRow += `<th class="gb-item-th gb-item-th--empty">No items yet</th>`;
            }
            periodSubtotals[period.code] = periodQuizSubtotal(quizScoreMap, items);
        }
        periodRow += `<th rowspan="2">Total</th><th rowspan="2">Remarks</th>`;

        /* Single student row, mirroring the instructor class record */
        let itemCells = '';
        let missingCount = 0;
        const quizItemsDisp = dispItems.filter(i => i.kind === 'quiz');
        for (const period of periods) {
            const items = periodGroups.groups[period.code];
            if (items.length) {
                itemCells += items.map(item => {
                    if (item.kind === 'quiz') {
                        const cell = quizScoreMap[item.id];
                        const q = quizzes.find(x => String(x.quiz_id) === String(item.id));
                        if (!cell) {
                            const missing = isItemMissing(item);
                            if (missing) missingCount++;
                            const label = missing ? 'Missing' : '—';
                            const cls = missing ? 'gc-cur-badge-missing' : 'gc-cur-badge-none';
                            return `<td class="td-num"><span class="${cls}">${label}</span></td>`;
                        }
                        const scoreHtml = `${cell.earned}${cell.total ? ` / ${cell.total}` : ''}`;
                        const inner = q?.best_attempt_id
                            ? `<a href="#student/quiz-result?attempt_id=${q.best_attempt_id}" class="gr-cell-link" title="View result">${scoreHtml}</a>`
                            : scoreHtml;
                        return `<td class="td-num"><span class="gc-cur-badge-raw">${inner}</span></td>`;
                    }
                    const done = lessonStatusMap[item.id] === 'completed';
                    if (done) return `<td class="td-num"><span class="gc-cur-badge-pass">Done</span></td>`;
                    if (isItemMissing(item)) { missingCount++; return `<td class="td-num"><span class="gc-cur-badge-missing">Missing</span></td>`; }
                    return `<td class="td-num"><span class="gc-cur-badge-none">—</span></td>`;
                }).join('');
            } else {
                itemCells += `<td class="td-num"><span class="gc-cur-badge-none">—</span></td>`;
            }
            const sub = periodSubtotals[period.code];
            const subLabel = sub.possible > 0
                ? `<strong>${sub.earned} / ${sub.possible}</strong>`
                : '<span class="gc-cur-badge-none">—</span>';
            itemCells += `<td class="td-num gb-period-subtotal-cell">${subLabel}</td>`;
        }

        const totalLabel = dispPossible > 0
            ? `<strong>${dispEarned} / ${dispPossible}</strong>`
            : '<span class="gc-cur-badge-none">—</span>';
        const anyScore = dispPossible > 0;
        const allPassed = quizItemsDisp.length > 0 && quizItemsDisp.every(q => quizzes.find(x => String(x.quiz_id) === String(q.id))?.passed == 1);
        const belowPass = anyScore && dispEarned / dispPossible < 0.6;
        const atRisk = belowPass || missingCount >= 2;
        const remark = !anyScore && missingCount > 0 ? 'At risk'
            : !anyScore ? '—'
            : allPassed ? 'Passed'
            : atRisk ? 'At risk' : 'In progress';

        const studentRow = `
            <tr class="${atRisk ? 'gb-at-risk' : ''}">
                <td class="td-name"><strong>${esc(myName)}</strong></td>
                ${itemCells}
                <td class="td-num">${totalLabel}</td>
                <td class="td-pass"><span class="${atRisk && anyScore ? 'gc-cur-badge-fail' : 'gc-cur-badge-pass'}">${remark}</span></td>
            </tr>`;

        wrap.innerHTML = `
            <div class="gr-panel gr-panel-periods">
                <div class="gr-panel-head">
                    <span class="gr-panel-code">${esc(s.subject_code)}</span>
                    <span class="gr-panel-name">${esc(s.subject_name)}</span>
                    <span class="gr-panel-count">${totalItems} item${totalItems !== 1 ? 's' : ''} in ${current.label}</span>
                </div>
                <div class="gr-period-legend">Showing <strong>${current.label} — ${current.title}</strong> only (current term set by your instructor). Activities show completion; quizzes show raw points.</div>
                <div class="gc-cur-wrap">
                    <div class="gc-cur-label">MY CLASS RECORD — ${esc(s.subject_code)} · ${current.label} ${current.title}</div>
                    <div class="gb-table-scroll">
                        <table class="gc-cur-table gb-record-table gb-period-table">
                            <thead>
                                <tr>${periodRow}</tr>
                                <tr>${itemRow}</tr>
                            </thead>
                            <tbody>${studentRow}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    // Initial render — first subject
    renderSubject(0);

    // Dropdown change
    const sel = container.querySelector('#gr-subject-select');
    sel?.addEventListener('change', () => renderSubject(parseInt(sel.value, 10)));
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

/** Sum raw earned / possible points (addition only, no weighting) */
function rawTotals(quizzes) {
    let earned = 0, possible = 0;
    for (const q of quizzes) {
        if (q.earned_points != null && q.total_points != null) {
            earned += parseFloat(q.earned_points) || 0;
            possible += parseFloat(q.total_points) || 0;
        }
    }
    return { earned, possible };
}

/** Derive submission status from score, due date, and grading state */
function quizStatus(q) {
    const score = q.best_score !== null ? parseFloat(q.best_score) : null;
    const hasAttempt = (q.attempts || 0) > 0;

    if (hasAttempt && (q.has_pending_grades == 1 || q.has_pending_grades === true)) {
        return { key: 'submitted', label: 'Submitted' };
    }
    if (score !== null) {
        if (q.has_feedback > 0) return { key: 'graded', label: q.passed == 1 ? 'Graded · Passed' : 'Graded' };
        if (q.passed == 1) return { key: 'passed', label: 'Passed' };
        return { key: 'failed', label: 'Failed' };
    }
    if (q.due_date) {
        const due = new Date(q.due_date);
        due.setHours(23, 59, 59, 999);
        if (Date.now() > due.getTime()) return { key: 'missing', label: 'Missing' };
    }
    return { key: 'nottaken', label: 'Not Taken' };
}
