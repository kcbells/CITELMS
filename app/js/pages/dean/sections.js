/**
 * Sections Page — "Struggling Students" report (shared by Dean and Program
 * Head via alias). A program head sees this scoped to their own program and
 * the year level(s) their account handles; a dean sees every program in
 * their department, all year levels.
 */
import { Api } from '../../api.js';

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

const SLICE_PALETTE = ['#00461B', '#C8941A', '#1E3A8A', '#9A3412', '#5B21B6', '#0E7490', '#9D174D', '#065F46'];
const SLICE_OTHER_COLOR = '#9CA3AF';

function sliceColor(i) {
    return SLICE_PALETTE[i % SLICE_PALETTE.length];
}

/**
 * Donut chart of struggling-student counts by subject, built as plain SVG
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
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ss-donut" role="img" aria-label="Struggling students by subject">
                <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#F3F4F6" stroke-width="${thickness}"></circle>
                ${arcs}
                <text x="${size / 2}" y="${size / 2 - 3}" text-anchor="middle" class="ss-donut-total">${total}</text>
                <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" class="ss-donut-total-lbl">flagged</text>
            </svg>
        </div>`;
}

function scoreColor(score) {
    if (score < 40) return { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5' };
    if (score < 55) return { bg: '#FFEDD5', fg: '#C2410C', border: '#FDBA74' };
    return { bg: '#FEF9C3', fg: '#A16207', border: '#FDE68A' }; // 55–<60, borderline
}

let _data = null;
let _search = '';
let _subjectFilter = '';

export async function render(container) {
    container.innerHTML = `<div class="ss-loading">Loading struggling-students report…</div><style>${css()}</style>`;

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

function renderPage(container) {
    const { students = [], by_subject: bySubject = [], scope = {}, unscoped } = _data;

    if (unscoped) {
        container.innerHTML = `<style>${css()}</style>${emptyState(
            'No program/year scope set',
            'Your account isn\'t assigned a program yet, so there\'s nothing to report on. Ask your dean to set your program and handled year level(s).'
        )}`;
        return;
    }

    const totalStudents = students.length;
    const totalFlags = students.reduce((n, s) => n + s.subjects.length, 0);
    const worstSubject = bySubject[0];
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
                    <h1>Struggling Students</h1>
                    <p>Students below the struggling cutoff in at least one subject &mdash; 80% for Global Gradebook grades, 60% for quiz-only subjects &mdash; ${esc(scopeLabel)}.</p>
                </div>
            </div>

            <div class="ss-stat-row">
                <div class="ss-stat">
                    <span class="ss-stat-num">${totalStudents}</span>
                    <span class="ss-stat-lbl">Student${totalStudents !== 1 ? 's' : ''} flagged</span>
                </div>
                <div class="ss-stat">
                    <span class="ss-stat-num">${totalFlags}</span>
                    <span class="ss-stat-lbl">Subject${totalFlags !== 1 ? 's' : ''} flagged</span>
                </div>
                <div class="ss-stat">
                    <span class="ss-stat-num">${worstSubject ? esc(worstSubject.subject_code) : '—'}</span>
                    <span class="ss-stat-lbl">${worstSubject ? `Hardest hit &middot; ${worstSubject.count} student${worstSubject.count !== 1 ? 's' : ''}` : 'No subjects flagged'}</span>
                </div>
            </div>

            ${totalStudents === 0 ? emptyState(
                'No struggling students right now',
                'Nobody in your scope is currently below the struggling cutoff (80% for Global Gradebook grades, 60% for quiz-only subjects) in any subject. This report updates as grades and quiz attempts come in.'
            ) : `
                <div class="ss-layout">
                    <aside class="ss-subjects">
                        <h3>By subject</h3>
                        ${renderDonut(bySubject)}
                        <p class="ss-subjects-hint">Click a subject to filter the list</p>
                        <div class="ss-subject-list">
                            <button type="button" class="ss-subject-chip ${_subjectFilter === '' ? 'active' : ''}" data-subject="">
                                <span>All subjects</span><span class="ss-subject-count">${totalStudents}</span>
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
                        <div class="ss-table-wrap">
                            <table class="ss-table">
                                <thead><tr><th>Student</th><th>Year</th><th>Struggling in</th></tr></thead>
                                <tbody id="ss-tbody"></tbody>
                            </table>
                            <p class="ss-no-results" id="ss-no-results" hidden>No students match.</p>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;

    if (totalStudents === 0) return;

    renderRows(container, students);

    container.querySelector('#ss-search')?.addEventListener('input', (e) => {
        _search = e.target.value;
        renderRows(container, students);
    });
    container.querySelectorAll('.ss-subject-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            _subjectFilter = btn.dataset.subject || '';
            renderPage(container); // re-render fully so the chip active-state updates too
        });
    });
}

function renderRows(container, students) {
    const q = _search.trim().toLowerCase();
    const filtered = students.filter(s => {
        const matchesSubject = !_subjectFilter || s.subjects.some(sub => sub.subject_code === _subjectFilter);
        if (!matchesSubject) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || String(s.student_id || '').toLowerCase().includes(q);
    });

    const tbody = container.querySelector('#ss-tbody');
    const noResults = container.querySelector('#ss-no-results');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (noResults) noResults.hidden = false;
        return;
    }
    if (noResults) noResults.hidden = true;

    tbody.innerHTML = filtered.map(s => {
        const subjectsToShow = _subjectFilter ? s.subjects.filter(sub => sub.subject_code === _subjectFilter) : s.subjects;
        return `
            <tr>
                <td>
                    <div class="ss-student">
                        <span class="ss-student-name">${esc(s.name)}</span>
                        <span class="ss-student-id">${esc(s.student_id || '—')}</span>
                    </div>
                </td>
                <td><span class="ss-year-badge">${s.year_level ? `${ordinal(s.year_level)} yr` : '—'}</span></td>
                <td>
                    <div class="ss-subject-chips">
                        ${subjectsToShow.map(sub => {
                            const c = scoreColor(sub.score);
                            return `<span class="ss-score-chip" style="background:${c.bg};color:${c.fg};border-color:${c.border}"
                                        title="${esc(sub.subject_name)} &mdash; ${sub.source === 'grade' ? 'Gradebook average' : 'Quiz average'}">
                                ${esc(sub.subject_code)} · ${sub.score}%
                            </span>`;
                        }).join('')}
                    </div>
                </td>
            </tr>`;
    }).join('');
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
        .ss-head h1 { margin:0 0 4px; font-size:21px; font-weight:800; color:#111827; }
        .ss-head p { margin:0; font-size:13px; color:#6B7280; }

        .ss-stat-row { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:22px; }
        .ss-stat { background:#fff; border:1.5px solid #E5E7EB; border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; gap:4px; }
        .ss-stat-num { font-size:24px; font-weight:800; color:#111827; }
        .ss-stat-lbl { font-size:12px; font-weight:600; color:#6B7280; }

        .ss-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:70px 20px; min-height:280px; }
        .ss-empty-icon { width:64px; height:64px; border-radius:18px; background:#E8F5E9; color:#1B4D3E; display:flex; align-items:center; justify-content:center; margin-bottom:16px; }
        .ss-empty h2 { margin:0 0 6px; font-size:18px; font-weight:800; color:#1f2937; }
        .ss-empty p { margin:0; font-size:13.5px; color:#6b7280; max-width:380px; }

        .ss-layout { display:grid; grid-template-columns:220px 1fr; gap:20px; align-items:start; }
        .ss-subjects { background:#fff; border:1.5px solid #E5E7EB; border-radius:12px; padding:14px; position:sticky; top:16px; }
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
        .ss-subject-chip:hover { background:#F9FAFB; }
        .ss-subject-chip.active { background:#E8F5E9; border-color:#1B4D2E; color:#1B4D2E; }
        .ss-subject-chip-label { display:flex; align-items:center; gap:7px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ss-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .ss-subject-count { font-size:11px; font-weight:800; color:#9CA3AF; flex-shrink:0; }
        .ss-subject-chip.active .ss-subject-count { color:#1B4D2E; }

        .ss-main { min-width:0; }
        .ss-toolbar { margin-bottom:12px; }
        .ss-search-wrap { position:relative; max-width:320px; }
        .ss-search-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9CA3AF; pointer-events:none; }
        .ss-search { width:100%; padding:9px 12px 9px 34px; border:1.5px solid #E5E7EB; border-radius:9px; font-size:13px; font-family:inherit; outline:none; transition:border-color .15s; }
        .ss-search:focus { border-color:#1B4D2E; }

        .ss-table-wrap { background:#fff; border:1.5px solid #E5E7EB; border-radius:12px; overflow:hidden; }
        .ss-table { width:100%; border-collapse:collapse; font-size:13px; }
        .ss-table th { background:#F9FAFB; color:#374151; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; padding:11px 16px; border-bottom:1.5px solid #E5E7EB; text-align:left; }
        .ss-table td { padding:11px 16px; vertical-align:top; border-bottom:1px solid #F3F4F6; }
        .ss-table tr:last-child td { border-bottom:none; }
        .ss-student { display:flex; flex-direction:column; gap:1px; }
        .ss-student-name { font-weight:700; color:#111827; }
        .ss-student-id { font-size:11.5px; color:#9CA3AF; font-family:ui-monospace,monospace; }
        .ss-year-badge { display:inline-block; background:#F3F4F6; color:#4B5563; font-size:11px; font-weight:700; padding:3px 9px; border-radius:20px; }
        .ss-subject-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .ss-score-chip { font-size:11.5px; font-weight:700; padding:4px 9px; border-radius:7px; border:1.5px solid; white-space:nowrap; }
        .ss-no-results { padding:30px; text-align:center; color:#9CA3AF; font-size:13px; }

        @media(max-width:860px) {
            .ss-stat-row { grid-template-columns:1fr; }
            .ss-layout { grid-template-columns:1fr; }
            .ss-subjects { position:static; }
            .ss-subject-list { flex-direction:row; flex-wrap:wrap; }
            .ss-subject-chip { width:auto; }
        }
    `;
}
