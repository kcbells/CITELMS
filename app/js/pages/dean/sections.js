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

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

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
const GRAY_BG = '#F3F4F6';
const GRAY_FG = '#4B5563';
const GRAY_BD = '#D1D5DB';

const SLICE_PALETTE = [G, '#C8941A', '#1E3A8A', G2, '#5B21B6', '#0E7490', '#9D174D', '#065F46'];
const SLICE_OTHER_COLOR = '#9CA3AF';

function sliceColor(i) {
    return SLICE_PALETTE[i % SLICE_PALETTE.length];
}

const STATUS_META = {
    critical: { label: 'Critical', bg: RED_BG,   fg: RED_FG,   bd: RED_BD },
    at_risk:  { label: 'At Risk',  bg: AMBER_BG, fg: AMBER_FG, bd: AMBER_BD },
    lacking:  { label: 'Lacking',  bg: GRAY_BG,  fg: GRAY_FG,  bd: GRAY_BD },
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

let _data = null;
let _search = '';
let _subjectFilter = '';

export async function render(container) {
    container.innerHTML = `<div class="ss-loading">Loading report…</div><style>${css()}</style>`;

    const res = await Api.get('/ReportsAPI.php?action=struggling-students');
    if (!res.success) {
        container.innerHTML = `<style>${css()}</style>${emptyState('Could not load this report', res.message || 'Please try again.')}`;
        return;
    }

    _data = res.data;
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
            return `
                <div class="ss-section">
                    <div class="ss-section-head">
                        <span class="ss-section-name">${esc(sec.section_name)}</span>
                        <span class="ss-section-mini">${sec.enrolled_count} enrolled</span>
                        <span class="ss-section-mini ss-mini-ok">${sec.submitted_count} submitted</span>
                        ${sec.lacking_count > 0 ? `<span class="ss-section-mini ss-mini-lacking">${sec.lacking_count} lacking</span>` : ''}
                    </div>
                    ${students.length === 0
                        ? `<p class="ss-section-clean">No flagged students in this section.</p>`
                        : `<table class="ss-table">
                            <thead><tr><th>Student</th><th>Year</th><th>Score</th><th>Remarks</th></tr></thead>
                            <tbody>
                                ${students.map(s => {
                                    const meta = STATUS_META[s.status];
                                    return `<tr>
                                        <td>
                                            <div class="ss-student">
                                                <span class="ss-student-name">${esc(s.name)}</span>
                                                <span class="ss-student-id">${esc(s.student_id || '—')}</span>
                                            </div>
                                        </td>
                                        <td><span class="ss-year-badge">${s.year_level ? `${ordinal(s.year_level)} yr` : '—'}</span></td>
                                        <td>${s.score !== null ? `<span class="ss-score">${s.score}%</span><span class="ss-score-src">${s.source === 'grade' ? 'gradebook avg' : 'quiz avg'}</span>` : '<span class="ss-score-none">No submissions</span>'}</td>
                                        <td><span class="ss-remark" style="background:${meta.bg};color:${meta.fg};border-color:${meta.bd}">${meta.label}</span></td>
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
        .ss-loading { padding:60px 20px; text-align:center; color:#6B7280; font-size:14px; }
        .ss-page { padding:4px 0 40px; }
        .ss-head { margin-bottom:20px; }
        .ss-head h1 { margin:0 0 4px; font-size:21px; font-weight:800; color:${G}; }
        .ss-head p { margin:0; font-size:13px; color:#6B7280; }

        .ss-stat-row { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px; }
        .ss-stat { background:#fff; border:1.5px solid ${BORDER}; border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; gap:4px; }
        .ss-stat-num { font-size:24px; font-weight:800; color:#111827; }
        .ss-stat-lbl { font-size:12px; font-weight:600; color:#6B7280; }
        .ss-stat-lacking { border-color:${GRAY_BD}; background:${GRAY_BG}; }
        .ss-stat-lacking .ss-stat-num { color:${GRAY_FG}; }
        .ss-stat-flagged { border-color:${RED_BD}; background:${RED_BG}; }
        .ss-stat-flagged .ss-stat-num { color:${RED_FG}; }

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
        .ss-toolbar { margin-bottom:12px; }
        .ss-search-wrap { position:relative; max-width:320px; }
        .ss-search-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9CA3AF; pointer-events:none; }
        .ss-search { width:100%; padding:9px 12px 9px 34px; border:1.5px solid ${BORDER}; border-radius:9px; font-size:13px; font-family:inherit; outline:none; transition:border-color .15s; }
        .ss-search:focus { border-color:${G}; }

        .ss-subject-block { margin-bottom:22px; }
        .ss-subject-title { margin:0 0 10px; font-size:14px; font-weight:800; color:${G}; }
        .ss-subject-title span { font-weight:600; color:#6B7280; margin-left:6px; }

        .ss-section { background:#fff; border:1.5px solid ${BORDER}; border-radius:12px; overflow:hidden; margin-bottom:12px; }
        .ss-section-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 16px; background:${GL}; border-bottom:1.5px solid ${BORDER}; }
        .ss-section-name { font-weight:800; color:${G}; font-size:13px; margin-right:auto; }
        .ss-section-mini { font-size:11px; font-weight:700; color:#4B5563; background:#fff; border:1px solid ${BORDER}; border-radius:20px; padding:2px 10px; }
        .ss-mini-ok { color:${G}; border-color:${G}; }
        .ss-mini-lacking { color:${GRAY_FG}; background:${GRAY_BG}; border-color:${GRAY_BD}; }
        .ss-section-clean { margin:0; padding:14px 16px; font-size:12.5px; color:#9CA3AF; font-style:italic; }

        .ss-table { width:100%; border-collapse:collapse; font-size:13px; }
        .ss-table th { background:#F9FAFB; color:#374151; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; padding:9px 16px; border-bottom:1.5px solid ${BORDER}; text-align:left; }
        .ss-table td { padding:9px 16px; vertical-align:top; border-bottom:1px solid #F3F4F6; }
        .ss-table tr:last-child td { border-bottom:none; }
        .ss-student { display:flex; flex-direction:column; gap:1px; }
        .ss-student-name { font-weight:700; color:#111827; }
        .ss-student-id { font-size:11.5px; color:#9CA3AF; font-family:ui-monospace,monospace; }
        .ss-year-badge { display:inline-block; background:#F3F4F6; color:#4B5563; font-size:11px; font-weight:700; padding:3px 9px; border-radius:20px; }
        .ss-score { font-weight:800; color:#111827; }
        .ss-score-src { display:block; font-size:10.5px; color:#9CA3AF; font-weight:600; }
        .ss-score-none { font-size:12px; color:#9CA3AF; font-style:italic; }
        .ss-remark { display:inline-block; font-size:11px; font-weight:800; padding:4px 10px; border-radius:7px; border:1.5px solid; white-space:nowrap; }
        .ss-no-results { padding:30px; text-align:center; color:#9CA3AF; font-size:13px; }

        @media(max-width:860px) {
            .ss-stat-row { grid-template-columns:1fr 1fr; }
            .ss-layout { grid-template-columns:1fr; }
            .ss-subjects { position:static; }
            .ss-subject-list { flex-direction:row; flex-wrap:wrap; }
            .ss-subject-chip { width:auto; }
            .ss-section-head { flex-direction:column; align-items:flex-start; }
            .ss-section-name { margin-right:0; }
        }
    `;
}
