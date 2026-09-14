/**
 * Reports — "Struggling Students" / class performance report, shared by
 * Dean, Program Head, and Instructor (all via alias — see app.js's
 * PAGE_ALIASES for 'program_head/sections' and 'instructor/reports').
 * Scope differs per role:
 *   - Instructor: only the subjects they're assigned to teach.
 *   - Program Head: only their own program + the year level(s) their dean
 *     assigned them to handle.
 *   - Dean: every program in their department, all year levels.
 * Organized Subject → Section → students, so enrolled/submitted/lacking
 * counts are visible per section, not just a flat problem list. Colors
 * intentionally match the Global Gradebook's exact palette (green pass,
 * amber single-issue, red critical) — no separate light pastel scheme.
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { notify } from '../../utils/notify.js';
import { curriculumTableCss, esc } from '../../utils/classroom-ui.js';
import { icon } from '../../utils/icons.js';

// esc() imported from classroom-ui.js (see import above)

// ── Same palette as instructor/global-gradebook.js — reused verbatim ──────
const G       = '#00461B';
const G2      = '#006428';
const GL      = '#E8F5EC';
const BORDER  = '#E5E7EB';
const AMBER_BG = '#FEF3C7';
const AMBER_FG = '#92400E';
const AMBER_BD = '#FDE68A';
const RED_BG  = '#FEE2E2';
const RED_FG  = '#7F1D1D';
const RED_BD  = '#FCA5A5';

const SLICE_PALETTE = [G, '#C8941A', '#1E3A8A', G2, '#5B21B6', '#0E7490', '#9D174D', '#065F46'];
const SLICE_OTHER_COLOR = '#9CA3AF';

function sliceColor(i) {
    return SLICE_PALETTE[i % SLICE_PALETTE.length];
}

const STATUS_META = {
    critical: { label: 'Critical', bg: RED_BG,   fg: RED_FG,   bd: RED_BD },
    at_risk:  { label: 'At Risk',  bg: AMBER_BG, fg: AMBER_FG, bd: AMBER_BD },
    lacking:  { label: 'Lacking',  bg: RED_BG,   fg: RED_FG,   bd: RED_BD },
};

/**
 * Donut chart of flagged-student counts by subject, built as plain SVG
 * (stacked <circle> arcs via stroke-dasharray) — no charting library, same
 * dependency-free approach as the rest of this app's custom SVG art. Caps
 * at the top 7 subjects individually and folds the rest into one "Other"
 * slice so the legend never grows unreadably long for a program with many
 * subjects flagged.
 */
function renderDonut(bySubject) {
    const total = bySubject.reduce((n, s) => n + s.count, 0);
    if (!total) return '';

    const TOP_N = 7;
    const sorted = [...bySubject].sort((a, b) => b.count - a.count);
    const shown = sorted.slice(0, TOP_N);
    const restCount = sorted.slice(TOP_N).reduce((n, s) => n + s.count, 0);
    const slices = restCount > 0
        ? [...shown, { subject_code: 'Other', subject_name: 'Other subjects', count: restCount, isOther: true }]
        : shown;

    const size = 148, thickness = 24;
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;

    const arcs = slices.map((s, i) => {
        const len = (s.count / total) * c;
        const dashoffset = -offset;
        offset += len;
        const color = s.isOther ? SLICE_OTHER_COLOR : sliceColor(i);
        return `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${thickness}"
            stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${dashoffset}"
            transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.subject_name)}: ${s.count}</title></circle>`;
    }).join('');

    return `
        <div class="ss-donut-wrap">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ss-donut" role="img" aria-label="Flagged students by subject">
                <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#F3F4F6" stroke-width="${thickness}"></circle>
                ${arcs}
                <text x="${size / 2}" y="${size / 2 - 3}" text-anchor="middle" class="ss-donut-total">${total}</text>
                <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" class="ss-donut-total-lbl">flagged</text>
            </svg>
        </div>`;
}

/**
 * Line graph of % flagged students across grading periods (P1/P2/P3) — plain
 * SVG, same dependency-free approach as the donut chart above. Each point
 * uses ReportsAPI.php's own severity thresholds for its dot color, so the
 * chart reads consistently with every badge/remark elsewhere in the report.
 */
function renderTrendChart(periods) {
    if (!periods || !periods.length) return '';

    const W = 520, H = 160, padL = 34, padR = 16, padT = 16, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = periods.length;
    const x = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (pct) => padT + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

    const dotColor = (pct) => pct >= 50 ? RED_FG : pct >= 20 ? AMBER_FG : G;

    const points = periods.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ');
    const gridLines = [0, 25, 50, 75, 100].map(v => `
        <line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="#F3F4F6" stroke-width="1"/>
        <text x="${padL - 8}" y="${y(v) + 3}" text-anchor="end" class="ss-trend-axis">${v}%</text>
    `).join('');

    const dots = periods.map((p, i) => `
        <circle cx="${x(i)}" cy="${y(p.pct)}" r="4.5" fill="${dotColor(p.pct)}" stroke="#fff" stroke-width="1.5"/>
        <text x="${x(i)}" y="${y(p.pct) - 11}" text-anchor="middle" class="ss-trend-val" fill="${dotColor(p.pct)}">${p.pct}%</text>
        <text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ss-trend-axis">${esc(p.period)}</text>
    `).join('');

    return `
        <div class="ss-trend-card">
            <div class="ss-trend-head">
                <h3>Flagged students by grading period</h3>
                <p>Same students, same cutoffs (80% Global Gradebook / 60% quiz-only) — just narrowed to each period's modules/quizzes as they accumulate.</p>
            </div>
            <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" class="ss-trend-svg" role="img" aria-label="Flagged student percentage by grading period">
                ${gridLines}
                <polyline points="${points}" fill="none" stroke="${G}" stroke-width="2"/>
                ${dots}
            </svg>
        </div>`;
}

let _data = null;
let _trend = null;
let _search = '';
let _subjectFilter = '';

export async function render(container) {
    container.innerHTML = `<div class="ss-loading">Loading report…</div><style>${css()}</style>`;

    const [res, trendRes] = await Promise.all([
        Api.get('/ReportsAPI.php?action=struggling-students'),
        Api.get('/ReportsAPI.php?action=struggling-trend'),
    ]);
    if (!res.success) {
        container.innerHTML = `<style>${css()}</style>${emptyState('Could not load this report', res.message || 'Please try again.')}`;
        return;
    }

    _data = res.data;
    _trend = trendRes.success ? (trendRes.data.periods || []) : [];
    _search = '';
    _subjectFilter = '';
    renderPage(container);
}

/** Sum flagged-student counts per subject, for the donut + subject chip list. */
function computeBySubject(subjects) {
    return subjects
        .map(subj => ({
            subject_code: subj.subject_code,
            subject_name: subj.subject_name,
            count: subj.sections.reduce((n, sec) => n + sec.students.length, 0),
        }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count);
}

function renderPage(container) {
    const { subjects = [], totals, scope = {}, unscoped } = _data;

    if (unscoped) {
        container.innerHTML = `<style>${css()}</style>${emptyState(
            'No program/year scope set',
            'Your account isn\'t assigned a program yet, so there\'s nothing to report on. Ask your dean to set your program and handled year level(s).'
        )}`;
        return;
    }

    const bySubject = computeBySubject(subjects);
    const scopeLabel = scope.year_from && scope.year_to
        ? (scope.year_from === scope.year_to
            ? `${ordinal(scope.year_from)} year only`
            : `${ordinal(scope.year_from)}–${ordinal(scope.year_to)} year`)
        : 'All year levels';

    container.innerHTML = `
        <style>${css()}</style>
        <div class="ss-page">
            <div class="ss-head">
                <div>
                    <h1>Reports</h1>
                    <p>Subjects, sections, and enrolled students — flagged when below the struggling cutoff (80% for Global Gradebook grades, 60% for quiz-only subjects), or lacking any submitted work at all &mdash; ${esc(scopeLabel)}.</p>
                </div>
                <button type="button" class="ss-export-btn ss-print-btn" onclick="window.print()">${icon('document', { size: 13, className: 'ui-icon-inline' })} Export PDF</button>
            </div>

            <div class="ss-stat-row">
                <div class="ss-stat">
                    <span class="ss-stat-num">${totals.enrolled}</span>
                    <span class="ss-stat-lbl">Enrolled</span>
                </div>
                <div class="ss-stat">
                    <span class="ss-stat-num">${totals.submitted}</span>
                    <span class="ss-stat-lbl">Submitted work</span>
                </div>
                <div class="ss-stat ss-stat-lacking">
                    <span class="ss-stat-num">${totals.lacking}</span>
                    <span class="ss-stat-lbl">Lacking</span>
                </div>
                <div class="ss-stat ss-stat-flagged">
                    <span class="ss-stat-num">${totals.flagged}</span>
                    <span class="ss-stat-lbl">Flagged</span>
                </div>
            </div>

            ${renderTrendChart(_trend)}

            ${subjects.length === 0 ? emptyState(
                'Nothing to report yet',
                'No subjects/sections found in your scope.'
            ) : `
                <div class="ss-layout">
                    <aside class="ss-subjects">
                        <h3>By subject</h3>
                        ${renderDonut(bySubject)}
                        <p class="ss-subjects-hint">Click a subject to filter the list</p>
                        <div class="ss-subject-list">
                            <button type="button" class="ss-subject-chip ${_subjectFilter === '' ? 'active' : ''}" data-subject="">
                                <span>All subjects</span><span class="ss-subject-count">${totals.flagged}</span>
                            </button>
                            ${bySubject.map((s, i) => `
                                <button type="button" class="ss-subject-chip ${_subjectFilter === s.subject_code ? 'active' : ''}" data-subject="${esc(s.subject_code)}" title="${esc(s.subject_name)}">
                                    <span class="ss-subject-chip-label"><span class="ss-dot" style="background:${i < 7 ? sliceColor(i) : SLICE_OTHER_COLOR}"></span>${esc(s.subject_code)}</span>
                                    <span class="ss-subject-count">${s.count}</span>
                                </button>
                            `).join('')}
                        </div>
                    </aside>

                    <div class="ss-main">
                        <div class="ss-toolbar">
                            <div class="ss-search-wrap">
                                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                                <input type="search" id="ss-search" class="ss-search" placeholder="Search student name or ID…" autocomplete="off" value="${esc(_search)}">
                            </div>
                        </div>
                        <div id="ss-subject-blocks"></div>
                    </div>
                </div>
            `}
        </div>
    `;

    if (subjects.length === 0) return;

    renderSubjectBlocks(container, subjects);

    container.querySelector('#ss-search')?.addEventListener('input', (e) => {
        _search = e.target.value;
        renderSubjectBlocks(container, subjects);
    });
    container.querySelectorAll('.ss-subject-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            _subjectFilter = btn.dataset.subject || '';
            renderPage(container); // re-render fully so the chip active-state updates too
        });
    });
}

function renderSubjectBlocks(container, subjects) {
    const q = _search.trim().toLowerCase();
    const isDean = Auth.user()?.role === 'dean';
    const host = container.querySelector('#ss-subject-blocks');
    if (!host) return;

    const visibleSubjects = subjects.filter(s => !_subjectFilter || s.subject_code === _subjectFilter);

    const blocks = visibleSubjects.map(subj => {
        const sectionsHtml = subj.sections.map(sec => {
            const students = q
                ? sec.students.filter(s => s.name.toLowerCase().includes(q) || String(s.student_id || '').toLowerCase().includes(q))
                : sec.students;
            // Hide a section entirely only when searching AND it has no matches;
            // otherwise always show it so enrolled/submitted/lacking counts stay visible.
            if (q && students.length === 0) return '';
            // Same .gc-cur-wrap/.gc-cur-label/.gc-cur-table chrome as the
            // instructor/Global Gradebook class record tables (classroom-ui.js's
            // curriculumTableCss()) — one table look across the whole app.
            const statsLine = `${sec.enrolled_count} enrolled &middot; ${sec.submitted_count} submitted`
                + (sec.lacking_count > 0 ? ` &middot; <span class="ss-label-lacking">${sec.lacking_count} lacking</span>` : '');
            return `
                <div class="gc-cur-wrap ss-section-wrap">
                    <div class="gc-cur-label">${esc(sec.section_name)} &mdash; ${statsLine}</div>
                    ${students.length === 0
                        ? `<p class="ss-section-clean">No flagged students in this section.</p>`
                        : `<table class="gc-cur-table">
                            <thead><tr><th class="th-left">Student</th><th>Year</th><th>Score</th><th>Remarks</th><th></th></tr></thead>
                            <tbody>
                                ${students.map(s => {
                                    const meta = STATUS_META[s.status];
                                    return `<tr>
                                        <td class="th-left">
                                            <div class="ss-student">
                                                <span class="ss-student-name">${esc(s.name)}</span>
                                                <span class="ss-student-id">${esc(s.student_id || '—')}</span>
                                            </div>
                                        </td>
                                        <td class="td-num">${isDean
                                            ? `<button type="button" class="ss-year-badge ss-year-edit" data-uid="${s.users_id}" data-name="${esc(s.name)}" data-year="${s.year_level ?? ''}" title="Set year standing">${s.year_level ? `${ordinal(s.year_level)} yr` : 'Set year'} ${icon('edit', { size: 10, className: 'ui-icon-inline' })}</button>`
                                            : `<span class="ss-year-badge">${s.year_level ? `${ordinal(s.year_level)} yr` : '—'}</span>`}</td>
                                        <td class="td-num">${s.score !== null ? `<span class="ss-score">${s.score}%</span><span class="ss-score-src">${s.source === 'grade' ? 'gradebook avg' : 'quiz avg'}</span>` : '<span class="ss-score-none">No submissions</span>'}</td>
                                        <td class="td-pass"><span class="ss-remark" style="background:${meta.bg};color:${meta.fg};border-color:${meta.bd}">${meta.label}</span></td>
                                        <td class="td-pass"><button type="button" class="ss-msg-btn" data-uid="${s.users_id}" data-name="${esc(s.name)}"
                                            data-status="${s.status}" data-subject="${esc(subj.subject_code)} - ${esc(subj.subject_name)}" data-section="${esc(sec.section_name)}"
                                            title="Message ${esc(s.name)} about this">${icon('messages', { size: 12, className: 'ui-icon-inline' })} Message</button></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>`}
                </div>`;
        }).join('');

        if (q && !sectionsHtml.trim()) return '';

        return `
            <div class="ss-subject-block">
                <h3 class="ss-subject-title">${esc(subj.subject_code)} <span>${esc(subj.subject_name)}</span></h3>
                ${sectionsHtml || '<p class="ss-section-clean">No sections found.</p>'}
            </div>`;
    }).join('');

    if (!blocks.trim()) {
        host.innerHTML = `<p class="ss-no-results">No students match.</p>`;
        return;
    }
    host.innerHTML = blocks;

    if (isDean) {
        host.querySelectorAll('.ss-year-edit').forEach(btn => {
            btn.addEventListener('click', () => openYearStandingModal(container, {
                usersId: btn.dataset.uid,
                name: btn.dataset.name,
                year: btn.dataset.year,
            }));
        });
    }

    host.querySelectorAll('.ss-msg-btn').forEach(btn => {
        btn.addEventListener('click', () => openMessageModal({
            usersId: btn.dataset.uid,
            name: btn.dataset.name,
            status: btn.dataset.status,
            subject: btn.dataset.subject,
            section: btn.dataset.section,
        }));
    });
}

const DEFAULT_MESSAGE_BY_STATUS = {
    lacking: (subject) => `Hi! I noticed you haven't submitted any work yet in ${subject}. Please check the subject for pending activities/quizzes and complete them as soon as you can. Let me know if you're running into any issues.`,
    critical: (subject) => `Hi! Your current standing in ${subject} is below passing and needs urgent attention. Please reach out so we can talk about a plan to catch up.`,
    at_risk: (subject) => `Hi! Your current standing in ${subject} is a bit below where it should be. Please make sure to complete any pending activities/quizzes — let me know if you need help.`,
};

/**
 * Quick compose, sent straight through the existing student↔staff messaging
 * system (MessagingAPI.php?action=send) — no separate notification channel,
 * so the message shows up in the student's normal Messages inbox and in the
 * sender's own conversation thread with them, same as messaging anyone else.
 */
function openMessageModal({ usersId, name, status, subject, section }) {
    let overlay = document.getElementById('sm-overlay');
    if (overlay) overlay.remove();

    const draft = (DEFAULT_MESSAGE_BY_STATUS[status] || DEFAULT_MESSAGE_BY_STATUS.at_risk)(subject);

    overlay = document.createElement('div');
    overlay.id = 'sm-overlay';
    overlay.innerHTML = `
        <style>${messageModalCss()}</style>
        <div class="sm-modal" role="dialog" aria-label="Message student">
            <h3>Message ${esc(name)}</h3>
            <p class="sm-sub">${esc(subject)} &middot; ${esc(section)}</p>
            <textarea id="sm-text" rows="5">${esc(draft)}</textarea>
            <div class="sm-actions">
                <button type="button" class="ys-btn ys-btn-ghost" id="sm-cancel">Cancel</button>
                <button type="button" class="ys-btn ys-btn-primary" id="sm-send">Send message</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#sm-cancel').addEventListener('click', close);

    overlay.querySelector('#sm-send').addEventListener('click', async () => {
        const content = overlay.querySelector('#sm-text').value.trim();
        if (!content) {
            notify.error('Write a message first.');
            return;
        }
        const btn = overlay.querySelector('#sm-send');
        btn.disabled = true;
        btn.textContent = 'Sending…';
        const res = await Api.post('/MessagingAPI.php?action=send', { receiver_id: usersId, content });
        if (res.success) {
            notify.success(`Message sent to ${name}.`);
            close();
        } else {
            notify.error(res.message || 'Could not send message.');
            btn.disabled = false;
            btn.textContent = 'Send message';
        }
    });
}

/**
 * Shared Cancel/Save button styling for the small utility modals on this
 * page (Message, Year Standing) — each modal only ever has its own CSS in
 * the DOM at a time (the overlay + its <style> tag are removed on close),
 * so these classes MUST be included in every modal's own CSS function
 * rather than defined once in only one of them — a real bug found via
 * screenshot: the Send button rendered as a bare unstyled <button> because
 * .ys-btn-primary only existed in the Year Standing modal's stylesheet.
 */
function modalButtonCss() {
    return `
    .ys-btn { padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; border:1.5px solid transparent; }
    .ys-btn-ghost { background:#fff; border-color:${BORDER}; color:#374151; }
    .ys-btn-ghost:hover { border-color:${G}; color:${G}; }
    .ys-btn-primary { background:${G}; color:#fff; }
    .ys-btn-primary:hover { background:${G2}; }
    .ys-btn:disabled { opacity:.6; cursor:default; }
    `;
}

function messageModalCss() {
    return `
    #sm-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9999;
        display:flex; align-items:center; justify-content:center; padding:20px; }
    .sm-modal { background:#fff; border-radius:14px; width:100%; max-width:420px; padding:22px;
        box-shadow:0 20px 60px rgba(0,0,0,.3); }
    .sm-modal h3 { margin:0 0 4px; font-size:15px; font-weight:800; color:${G}; }
    .sm-sub { margin:0 0 14px; font-size:12px; color:#6b7280; }
    #sm-text { width:100%; box-sizing:border-box; border:1.5px solid ${BORDER}; border-radius:8px; padding:10px 12px;
        font-size:13px; font-family:inherit; resize:vertical; margin-bottom:16px; }
    #sm-text:focus { outline:none; border-color:${G}; box-shadow:0 0 0 2px rgba(0,70,27,.15); }
    .sm-actions { display:flex; justify-content:flex-end; gap:8px; }
    ${modalButtonCss()}
    `;
}

/**
 * Dean-only manual override for a student's year standing — for irregular
 * students who don't fit the "batch year vs current academic year" formula
 * every other student's year level is derived from automatically
 * (see api/helpers/YearLevelHelper.php). Setting a value here locks it
 * (year_level_locked=1) so the automatic recompute leaves them alone;
 * "Reset to automatic" clears the lock and recomputes immediately.
 */
function openYearStandingModal(container, { usersId, name, year }) {
    let overlay = document.getElementById('ys-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'ys-overlay';
    overlay.innerHTML = `
        <style>${yearModalCss()}</style>
        <div class="ys-modal" role="dialog" aria-label="Set year standing">
            <h3>Year standing</h3>
            <p class="ys-sub">${esc(name)} — irregular students can be set manually; everyone else is derived automatically from their student ID each year.</p>
            <label class="ys-field">Year level
                <input type="number" id="ys-year" min="1" max="10" value="${esc(year)}" placeholder="e.g. 4">
            </label>
            <div class="ys-actions">
                <button type="button" class="ys-btn ys-btn-ghost" id="ys-cancel">Cancel</button>
                <button type="button" class="ys-btn ys-btn-ghost" id="ys-auto">Reset to automatic</button>
                <button type="button" class="ys-btn ys-btn-primary" id="ys-save">Save as irregular</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#ys-cancel').addEventListener('click', close);

    overlay.querySelector('#ys-save').addEventListener('click', async () => {
        const yearLevel = parseInt(overlay.querySelector('#ys-year').value, 10);
        if (!yearLevel || yearLevel < 1 || yearLevel > 10) {
            notify.error('Enter a year level between 1 and 10.');
            return;
        }
        const res = await Api.post('/UsersAPI.php?action=set-year-standing', {
            users_id: usersId, is_irregular: true, year_level: yearLevel,
        });
        if (res.success) {
            close();
            render(container); // full reload — simplest way to reflect the new standing everywhere it's used
        } else {
            notify.error(res.message || 'Could not save standing.');
        }
    });

    overlay.querySelector('#ys-auto').addEventListener('click', async () => {
        const res = await Api.post('/UsersAPI.php?action=set-year-standing', {
            users_id: usersId, is_irregular: false,
        });
        if (res.success) {
            close();
            render(container);
        } else {
            notify.error(res.message || 'Could not reset standing.');
        }
    });
}

function yearModalCss() {
    return `
    #ys-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9999;
        display:flex; align-items:center; justify-content:center; padding:20px; }
    .ys-modal { background:#fff; border-radius:14px; width:100%; max-width:380px; padding:22px;
        box-shadow:0 20px 60px rgba(0,0,0,.3); }
    .ys-modal h3 { margin:0 0 6px; font-size:15px; font-weight:800; color:${G}; }
    .ys-sub { margin:0 0 16px; font-size:12px; color:#6b7280; line-height:1.5; }
    .ys-field { display:flex; flex-direction:column; gap:5px; font-size:11px; font-weight:700;
        color:#374151; text-transform:uppercase; letter-spacing:.3px; margin-bottom:18px; }
    .ys-field input { border:1.5px solid ${BORDER}; border-radius:8px; padding:9px 12px; font-size:14px;
        font-family:inherit; font-weight:600; color:#111827; text-transform:none; letter-spacing:normal; }
    .ys-field input:focus { outline:none; border-color:${G}; box-shadow:0 0 0 2px rgba(0,70,27,.15); }
    .ys-actions { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
    ${modalButtonCss()}
    `;
}

function ordinal(n) {
    n = parseInt(n, 10);
    if (Number.isNaN(n)) return n;
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function emptyState(title, sub) {
    return `
        <div class="ss-empty">
            <div class="ss-empty-icon">
                <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75l2.25 2.25 4.5-4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
            </div>
            <h2>${esc(title)}</h2>
            <p>${esc(sub)}</p>
        </div>`;
}

function css() {
    return `
        ${curriculumTableCss()}
        .ss-loading { padding:60px 20px; text-align:center; color:#6B7280; font-size:14px; }
        .ss-page { padding:4px 0 40px; }
        .ss-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:20px; }
        .ss-head h1 { margin:0 0 4px; font-size:21px; font-weight:800; color:${G}; }
        .ss-head p { margin:0; font-size:13px; color:#6B7280; }

        .ss-stat-row { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px; }
        .ss-stat { background:#fff; border:1.5px solid ${BORDER}; border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; gap:4px; }
        .ss-stat-num { font-size:24px; font-weight:800; color:#111827; }
        .ss-stat-lbl { font-size:12px; font-weight:600; color:#6B7280; }
        .ss-stat-lacking { border-color:${RED_BD}; background:${RED_BG}; }
        .ss-stat-lacking .ss-stat-num { color:${RED_FG}; }
        .ss-stat-flagged { border-color:${RED_BD}; background:${RED_BG}; }
        .ss-stat-flagged .ss-stat-num { color:${RED_FG}; }

        .ss-trend-card { background:#fff; border:1.5px solid ${BORDER}; border-radius:12px; padding:16px 20px; margin-bottom:22px; }
        .ss-trend-head h3 { margin:0 0 3px; font-size:13px; font-weight:800; color:#111827; }
        .ss-trend-head p { margin:0 0 8px; font-size:11.5px; color:#9CA3AF; }
        .ss-trend-svg { display:block; overflow:visible; }
        .ss-trend-axis { font-size:9.5px; fill:#9CA3AF; font-family:inherit; }
        .ss-trend-val { font-size:11px; font-weight:800; font-family:inherit; }

        .ss-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:70px 20px; min-height:280px; }
        .ss-empty-icon { width:64px; height:64px; border-radius:18px; background:${GL}; color:${G}; display:flex; align-items:center; justify-content:center; margin-bottom:16px; }
        .ss-empty h2 { margin:0 0 6px; font-size:18px; font-weight:800; color:#1f2937; }
        .ss-empty p { margin:0; font-size:13.5px; color:#6b7280; max-width:380px; }

        .ss-layout { display:grid; grid-template-columns:220px 1fr; gap:20px; align-items:start; }
        .ss-subjects { background:#fff; border:1.5px solid ${BORDER}; border-radius:12px; padding:14px; position:sticky; top:16px; }
        .ss-subjects h3 { margin:0 0 10px; font-size:13px; font-weight:800; color:#111827; }
        .ss-donut-wrap { display:flex; justify-content:center; margin-bottom:12px; }
        .ss-donut { overflow:visible; }
        .ss-donut circle { transition:opacity .15s; }
        .ss-donut-total { font-size:26px; font-weight:800; fill:#111827; font-family:inherit; }
        .ss-donut-total-lbl { font-size:10px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; fill:#9CA3AF; font-family:inherit; }
        .ss-subjects-hint { margin:0 0 10px; font-size:11px; color:#9CA3AF; text-align:center; }
        .ss-subject-list { display:flex; flex-direction:column; gap:4px; }
        .ss-subject-chip {
            display:flex; align-items:center; justify-content:space-between; gap:8px;
            width:100%; padding:7px 10px; border-radius:8px; border:1.5px solid transparent;
            background:none; cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:600;
            color:#374151; text-align:left; transition:background .12s,border-color .12s;
        }
        .ss-subject-chip:hover { background:${GL}; }
        .ss-subject-chip.active { background:${GL}; border-color:${G}; color:${G}; }
        .ss-subject-chip-label { display:flex; align-items:center; gap:7px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ss-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .ss-subject-count { font-size:11px; font-weight:800; color:#9CA3AF; flex-shrink:0; }
        .ss-subject-chip.active .ss-subject-count { color:${G}; }

        .ss-main { min-width:0; }
        .ss-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .ss-search-wrap { position:relative; max-width:320px; flex:1; }
        .ss-search-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9CA3AF; pointer-events:none; }
        .ss-search { width:100%; padding:9px 12px 9px 34px; border:1.5px solid ${BORDER}; border-radius:9px; font-size:13px; font-family:inherit; outline:none; transition:border-color .15s; box-sizing:border-box; }
        .ss-search:focus { border-color:${G}; }
        .ss-export-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:9px;
            border:1.5px solid ${G}; background:#fff; color:${G}; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }
        .ss-export-btn:hover { background:${GL}; }

        .ss-subject-block { margin-bottom:22px; }
        .ss-subject-title { margin:0 0 10px; font-size:14px; font-weight:800; color:${G}; }
        .ss-subject-title span { font-weight:600; color:#6B7280; margin-left:6px; }

        /* Section table chrome now comes from curriculumTableCss() (.gc-cur-wrap
           / .gc-cur-label / .gc-cur-table) — the exact same look as the
           instructor/Global Gradebook tables, just with a bit of spacing
           between one section's table and the next. */
        .ss-section-wrap { margin-bottom:16px; }
        .ss-label-lacking { color:${RED_FG}; font-weight:800; }
        .ss-section-clean { margin:0; padding:14px 16px; font-size:12.5px; color:#9CA3AF; font-style:italic; }
        .ss-student { display:flex; flex-direction:column; gap:1px; }
        .ss-student-name { font-weight:700; color:#111827; }
        .ss-student-id { font-size:11.5px; color:#9CA3AF; font-family:ui-monospace,monospace; }
        .ss-year-badge { display:inline-block; background:#F3F4F6; color:#4B5563; font-size:11px; font-weight:700; padding:3px 9px; border-radius:20px; }
        button.ss-year-edit { border:1.5px dashed #9CA3AF; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:4px; }
        button.ss-year-edit:hover { background:${GL}; border-color:${G}; color:${G}; }
        .ss-score { font-weight:800; color:#111827; }
        .ss-score-src { display:block; font-size:10.5px; color:#9CA3AF; font-weight:600; }
        .ss-score-none { font-size:12px; color:#9CA3AF; font-style:italic; }
        .ss-remark { display:inline-block; font-size:11px; font-weight:800; padding:4px 10px; border-radius:7px; border:1.5px solid; white-space:nowrap; }
        .ss-msg-btn { display:inline-flex; align-items:center; gap:4px; background:#fff; border:1.5px solid ${G};
            color:${G}; font-size:11px; font-weight:700; padding:5px 10px; border-radius:7px; cursor:pointer; font-family:inherit; white-space:nowrap; }
        .ss-msg-btn:hover { background:${GL}; }
        .ss-no-results { padding:30px; text-align:center; color:#9CA3AF; font-size:13px; }

        @media(max-width:860px) {
            .ss-stat-row { grid-template-columns:1fr 1fr; }
            .ss-layout { grid-template-columns:1fr; }
            .ss-subjects { position:static; }
            .ss-subject-list { flex-direction:row; flex-wrap:wrap; }
            .ss-subject-chip { width:auto; }
        }

        /* Export PDF = the browser's own print-to-PDF, no library needed —
           hides the app shell and interactive controls, leaves only the
           report content (stats, trend chart, subject/section tables). */
        @media print {
            .ss-print-btn, .ss-export-btn, .ss-search-wrap, .ss-toolbar,
            .ss-year-edit, .ss-msg-btn, .ss-subjects-hint { display:none !important; }
            .ss-layout { grid-template-columns:1fr; }
            .ss-subjects { position:static; border:none; padding:0; }
            body { background:#fff; }
            #sidebar, .topbar, #nav-spinner, #fa-root, #fm-root { display:none !important; }
            .app-container { display:block !important; }
            .main-content { margin:0 !important; padding:0 !important; }
            .page-content { padding:0 !important; }
        }
    `;
}
