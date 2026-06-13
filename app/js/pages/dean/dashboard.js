/**
 * Dean Dashboard Page
 * Department overview — enrollment, performance, charts, faculty
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    const res  = await Api.get('/DashboardAPI.php?action=dean');
    const data  = res.success ? res.data : {};
    const stats = data.stats || {};
    const dept  = data.department || {};
    const faculty          = data.faculty          || [];
    const programs         = data.programs         || [];
    const subjectStats     = data.subject_stats    || [];
    const enrollByYear     = data.enrollment_by_year || [];
    const progPerformance  = data.program_performance || [];
    const user = Auth.user();

    /* ── computed helpers ─────────────────────────────────── */
    const totalAttempts = stats.total_attempts || 0;
    const passed        = stats.passed         || 0;
    const failed        = stats.failed         || 0;
    const avgScore      = stats.avg_score      || 0;
    const passRate      = totalAttempts > 0 ? Math.round((passed / totalAttempts) * 100) : 0;

    const pubLessons    = stats.published_lessons || 0;
    const totalLessons  = stats.total_lessons     || 0;

    /* ── enrollment by year chart data ───────────────────── */
    const maxYear = Math.max(...enrollByYear.map(r => +r.count), 1);
    const YEAR_LABELS = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };

    /* ── program performance chart data ──────────────────── */
    const maxProg = Math.max(...progPerformance.map(r => +(r.avg_score || 0)), 1);

    /* ── subject performance (top 8) ─────────────────────── */
    const topSubjects = subjectStats
        .filter(s => s.attempts > 0)
        .slice(0, 8);

    /* ── donut chart (pass / fail) ───────────────────────── */
    const circ     = 2 * Math.PI * 42;
    const passArc  = totalAttempts > 0 ? (passed / totalAttempts) * circ : 0;
    const failArc  = totalAttempts > 0 ? (failed / totalAttempts) * circ : 0;

    container.innerHTML = `
    <style>
        /* ── Banner ── */
        .dn-banner {
            background: #00461B;
            border-radius: 16px; padding: 30px 32px; margin-bottom: 24px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .dn-banner-left { position:relative; z-index:1; }
        .dn-banner-left h2 { font-size:24px; font-weight:800; color:#fff; margin:0 0 4px; }
        .dn-banner-left p  { font-size:14px; color:rgba(255,255,255,.75); margin:0; }
        .dn-banner-right { position:relative; z-index:1; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .dn-dept-badge { background:rgba(255,255,255,.25); border:none; padding:8px 18px; border-radius:10px; font-weight:800; font-size:15px; color:#fff; letter-spacing:.5px; }
        .dn-date { font-size:12px; color:rgba(255,255,255,.65); }

        /* ── Stat cards ── */
        .dn-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:24px; }
        .dn-stat { background:#fff; border:none; border-radius:14px; padding:18px 16px; display:flex; flex-direction:column; align-items:flex-start; gap:6px; transition:background .15s; }
        .dn-stat:hover { background:#F3F4F6; }
        .dn-stat.highlight { background:#E8F5EC; }
        .dn-stat-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
        .dn-stat-val  { font-size:26px; font-weight:800; color:#262626; line-height:1.1; }
        .dn-stat.highlight .dn-stat-val { color:#1B4D3E; }
        .dn-stat-lbl  { font-size:12px; color:#9ca3af; font-weight:500; }
        .dn-stat-sub  { font-size:11px; color:#1B4D3E; font-weight:600; }

        /* ── Section headers ── */
        .dn-section-title { font-size:15px; font-weight:700; color:#262626; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .dn-section-title::after { content:''; flex:1; height:1px; background:#f0f0f0; }

        /* ── Charts grid ── */
        .dn-charts { display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; margin-bottom:24px; }
        .dn-chart-card { background:#fff; border:none; border-radius:14px; padding:20px; }
        .dn-chart-title { font-size:13px; font-weight:700; color:#262626; margin-bottom:4px; }
        .dn-chart-sub   { font-size:11px; color:#9ca3af; margin-bottom:16px; }

        /* Donut chart */
        .dn-donut-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; }
        .dn-donut-legend { width:100%; display:flex; flex-direction:column; gap:7px; }
        .dn-legend-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; }
        .dn-legend-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

        /* Year level horizontal bars */
        .dn-year-bars { display:flex; flex-direction:column; gap:11px; }
        .dn-year-row { display:flex; align-items:center; gap:10px; }
        .dn-year-lbl { font-size:12px; color:#404040; font-weight:600; width:62px; flex-shrink:0; text-align:right; }
        .dn-year-track { flex:1; background:#f0f0f0; border-radius:6px; height:18px; overflow:hidden; position:relative; }
        .dn-year-fill  { height:100%; border-radius:6px; background:#1B4D3E; transition:width .6s ease; display:flex; align-items:center; justify-content:flex-end; padding-right:6px; }
        .dn-year-fill-val { font-size:10px; font-weight:700; color:rgba(255,255,255,.9); white-space:nowrap; }
        .dn-year-fill-val.outside { position:absolute; right:-28px; top:50%; transform:translateY(-50%); color:#404040; }
        .dn-year-count { font-size:12px; font-weight:700; color:#1B4D3E; width:30px; flex-shrink:0; }

        /* Program performance bars */
        .dn-prog-bars { display:flex; flex-direction:column; gap:10px; }
        .dn-prog-row { display:flex; flex-direction:column; gap:4px; }
        .dn-prog-meta { display:flex; justify-content:space-between; align-items:center; }
        .dn-prog-name { font-size:11.5px; font-weight:600; color:#404040; }
        .dn-prog-score { font-size:11.5px; font-weight:700; color:#1B4D3E; }
        .dn-prog-track { background:#f0f0f0; border-radius:5px; height:8px; overflow:hidden; }
        .dn-prog-fill  { height:100%; border-radius:5px; transition:width .6s ease; }
        .dn-prog-attempts { font-size:10px; color:#9ca3af; }

        /* ── Bottom grid ── */
        .dn-bottom { display:grid; grid-template-columns:1.4fr 1fr; gap:18px; margin-bottom:24px; }

        /* Subject performance table */
        .dn-subj-table { width:100%; border-collapse:collapse; }
        .dn-subj-table th { padding:9px 12px; font-size:11px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; text-align:left; }
        .dn-subj-table td { padding:9px 12px; border-bottom:1px solid #f0f0f0; font-size:12px; vertical-align:middle; }
        .dn-subj-table tr:last-child td { border-bottom:none; }
        .dn-subj-table tr:hover td { background:#f9fffe; }
        .dn-subj-code { background:#E8F5E9; color:#1B4D3E; padding:2px 7px; border-radius:4px; font-family:monospace; font-size:11px; font-weight:700; }
        .dn-mini-bar  { height:4px; border-radius:3px; background:#e2e8f0; overflow:hidden; width:60px; margin-top:3px; }
        .dn-mini-fill { height:100%; border-radius:3px; }

        /* Faculty table */
        .dn-fac-table { width:100%; border-collapse:collapse; }
        .dn-fac-table th { padding:9px 12px; font-size:11px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; text-align:left; }
        .dn-fac-table td { padding:10px 12px; border-bottom:1px solid #f0f0f0; font-size:12.5px; vertical-align:middle; }
        .dn-fac-table tr:last-child td { border-bottom:none; }
        .dn-fac-table tr:hover td { background:#f9fffe; }
        .dn-fac-av { width:30px; height:30px; border-radius:50%; background:#1B4D3E; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
        .dn-fac-cell { display:flex; align-items:center; gap:9px; }
        .dn-fac-name { font-weight:600; color:#262626; }
        .dn-fac-id   { font-size:10.5px; color:#9ca3af; }
        .dn-pill { display:inline-block; padding:2px 9px; border-radius:20px; font-size:10.5px; font-weight:600; }
        .dn-pill-green { background:#E8F5E9; color:#1B4D3E; }
        .dn-pill-blue  { background:#DBEAFE; color:#1E40AF; }

        /* Quick links */
        .dn-quick { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .dn-ql { display:flex; align-items:center; gap:11px; padding:13px 15px; border:none; border-radius:12px; text-decoration:none; color:#262626; font-weight:600; font-size:13px; background:#F3F4F6; transition:background .15s; }
        .dn-ql:hover { background:#E8F5EC; color:#1B4D3E; }
        .dn-ql-icon { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:15px; background:#f3f4f6; flex-shrink:0; }
        .dn-ql:hover .dn-ql-icon { background:#C8E6C9; }

        /* Empty states */
        .dn-empty { text-align:center; padding:28px 16px; color:#9ca3af; font-size:13px; }

        @media(max-width:1024px) { .dn-charts { grid-template-columns:1fr 1fr; } }
        @media(max-width:768px)  { .dn-charts { grid-template-columns:1fr; } .dn-bottom { grid-template-columns:1fr; } .dn-quick { grid-template-columns:1fr; } .dn-stats { grid-template-columns:repeat(2,1fr); } }
    </style>

    <!-- Banner -->
    <div class="dn-banner">
        <div class="dn-banner-left">
            <h2>${L.wave} Welcome, ${esc(user.first_name || user.name)}</h2>
            <p>${esc(dept.department_name || 'Department')} · Department Overview</p>
        </div>
        <div class="dn-banner-right">
            <div class="dn-dept-badge">${esc(dept.department_code || 'DEPT')}</div>
        </div>
    </div>

    <!-- Key Stats -->
    <div class="dn-stats">
        <div class="dn-stat highlight">
            <div class="dn-stat-icon" style="background:#E8F5E9;">${icon('graduation', { size: 22 })}</div>
            <div class="dn-stat-val">${stats.students || 0}</div>
            <div class="dn-stat-lbl">Enrolled Students</div>
            ${enrollByYear.length > 0
                ? `<div class="dn-stat-sub">across ${enrollByYear.length} year level${enrollByYear.length !== 1 ? 's' : ''}</div>`
                : ''}
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#DBEAFE;">${icon('instructor', { size: 22 })}</div>
            <div class="dn-stat-val">${stats.instructors || 0}</div>
            <div class="dn-stat-lbl">Instructors</div>
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#FEF3C7;">${icon('book', { size: 22 })}</div>
            <div class="dn-stat-val">${stats.subjects || 0}</div>
            <div class="dn-stat-lbl">Active Subjects</div>
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#EDE9FE;">${icon('school', { size: 22 })}</div>
            <div class="dn-stat-val">${stats.sections || 0}</div>
            <div class="dn-stat-lbl">Sections</div>
        </div>
        <div class="dn-stat ${avgScore >= 75 ? 'highlight' : ''}">
            <div class="dn-stat-icon" style="background:${avgScore >= 75 ? '#E8F5E9' : avgScore >= 50 ? '#FEF3C7' : '#FEE2E2'};">${icon('chart', { size: 22 })}</div>
            <div class="dn-stat-val" style="color:${avgScore >= 75 ? '#1B4D3E' : avgScore >= 50 ? '#B45309' : '#b91c1c'};">${avgScore ? avgScore + '%' : '—'}</div>
            <div class="dn-stat-lbl">Avg Quiz Score</div>
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:${passRate >= 70 ? '#E8F5E9' : '#FEF3C7'};">${icon('checkCircle', { size: 22 })}</div>
            <div class="dn-stat-val" style="color:${passRate >= 70 ? '#1B4D3E' : '#B45309'};">${passRate}%</div>
            <div class="dn-stat-lbl">Pass Rate</div>
            ${totalAttempts > 0 ? `<div class="dn-stat-sub">${totalAttempts} total attempts</div>` : ''}
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#E8F5E9;">${icon('lessons', { size: 22 })}</div>
            <div class="dn-stat-val">${pubLessons}</div>
            <div class="dn-stat-lbl">Published Lessons</div>
            ${totalLessons > pubLessons ? `<div class="dn-stat-sub">${totalLessons - pubLessons} draft</div>` : ''}
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#FEF3C7;">${icon('quiz', { size: 22 })}</div>
            <div class="dn-stat-val">${stats.total_quizzes || 0}</div>
            <div class="dn-stat-lbl">Total Quizzes</div>
        </div>
    </div>

    <!-- Charts Section -->
    <div class="dn-section-title">${icon('chart', inl)} Analytics &amp; Performance</div>
    <div class="dn-charts">

        <!-- Chart 1: Enrollment by Year Level -->
        <div class="dn-chart-card">
            <div class="dn-chart-title">Enrollment by Year Level</div>
            <div class="dn-chart-sub">Students registered per year</div>
            ${enrollByYear.length === 0
                ? '<div class="dn-empty">No year-level data available</div>'
                : `<div class="dn-year-bars">
                    ${enrollByYear.map(r => {
                        const pct = Math.round((+r.count / maxYear) * 100);
                        return `
                        <div class="dn-year-row">
                            <div class="dn-year-lbl">${YEAR_LABELS[r.year_level] || 'Yr ' + r.year_level}</div>
                            <div class="dn-year-track">
                                <div class="dn-year-fill" style="width:${pct}%">
                                    ${pct >= 20 ? `<span class="dn-year-fill-val">${r.count}</span>` : ''}
                                </div>
                                ${pct < 20 ? `<span style="position:absolute;right:-30px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:700;color:#404040;">${r.count}</span>` : ''}
                            </div>
                            <div class="dn-year-count">${r.count}</div>
                        </div>`;
                    }).join('')}
                   </div>`}
        </div>

        <!-- Chart 2: Pass / Fail Donut -->
        <div class="dn-chart-card">
            <div class="dn-chart-title">Quiz Pass / Fail Ratio</div>
            <div class="dn-chart-sub">Based on ${totalAttempts} total attempts</div>
            ${totalAttempts === 0
                ? '<div class="dn-empty">No quiz attempts yet</div>'
                : `<div class="dn-donut-wrap">
                    <svg width="140" height="140" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" stroke-width="14"/>
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#1B4D3E" stroke-width="14"
                            stroke-dasharray="${passArc.toFixed(2)} ${circ.toFixed(2)}"
                            stroke-dashoffset="0"
                            transform="rotate(-90 50 50)"/>
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#fca5a5" stroke-width="14"
                            stroke-dasharray="${failArc.toFixed(2)} ${circ.toFixed(2)}"
                            stroke-dashoffset="${(-passArc).toFixed(2)}"
                            transform="rotate(-90 50 50)"/>
                        <text x="50" y="46" text-anchor="middle" font-size="17" font-weight="800" fill="#262626">${passRate}%</text>
                        <text x="50" y="58" text-anchor="middle" font-size="8" fill="#9ca3af">Pass Rate</text>
                    </svg>
                    <div class="dn-donut-legend">
                        <div class="dn-legend-row">
                            <span style="display:flex;align-items:center;gap:6px;">
                                <span class="dn-legend-dot" style="background:#1B4D3E;"></span>
                                <span style="font-size:12px;color:#404040;">Passed</span>
                            </span>
                            <span style="font-size:13px;font-weight:700;color:#1B4D3E;">${passed}</span>
                        </div>
                        <div class="dn-legend-row">
                            <span style="display:flex;align-items:center;gap:6px;">
                                <span class="dn-legend-dot" style="background:#fca5a5;"></span>
                                <span style="font-size:12px;color:#404040;">Failed</span>
                            </span>
                            <span style="font-size:13px;font-weight:700;color:#b91c1c;">${failed}</span>
                        </div>
                        <div class="dn-legend-row" style="margin-top:4px;padding-top:8px;border-top:1px solid #f0f0f0;">
                            <span style="font-size:11px;color:#9ca3af;">Avg Score</span>
                            <span style="font-size:13px;font-weight:700;color:${avgScore >= 75 ? '#1B4D3E' : '#B45309'};">${avgScore ? avgScore + '%' : '—'}</span>
                        </div>
                    </div>
                   </div>`}
        </div>

        <!-- Chart 3: Program Performance -->
        <div class="dn-chart-card">
            <div class="dn-chart-title">Program Performance</div>
            <div class="dn-chart-sub">Avg quiz score by program</div>
            ${progPerformance.length === 0
                ? '<div class="dn-empty">No program data yet</div>'
                : `<div class="dn-prog-bars">
                    ${progPerformance.map(p => {
                        const score = Math.round(+(p.avg_score || 0));
                        const pct   = Math.round((score / 100) * 100);
                        const color = score >= 75 ? '#1B4D3E' : score >= 50 ? '#d97706' : '#dc2626';
                        const barBg = score >= 75 ? '#1B4D3E' : score >= 50 ? '#fbbf24' : '#fca5a5';
                        return `
                        <div class="dn-prog-row">
                            <div class="dn-prog-meta">
                                <span class="dn-prog-name">${esc(p.program_code)}</span>
                                <span class="dn-prog-score" style="color:${color};">${score ? score + '%' : '—'}</span>
                            </div>
                            <div class="dn-prog-track">
                                <div class="dn-prog-fill" style="width:${pct}%;background:${barBg};"></div>
                            </div>
                            <div class="dn-prog-attempts">${p.attempts || 0} attempts · ${p.passed || 0} passed</div>
                        </div>`;
                    }).join('')}
                   </div>`}
        </div>
    </div>

    <!-- Bottom: Subject Table + Faculty -->
    <div class="dn-bottom">

        <!-- Subject Performance Table -->
        <div class="dn-chart-card">
            <div class="dn-chart-title" style="margin-bottom:14px;">Subject Performance</div>
            ${topSubjects.length === 0
                ? '<div class="dn-empty">No quiz activity yet</div>'
                : `<div style="border:2px solid #1B4D3E;border-radius:10px;overflow:hidden;">
                    <table class="dn-subj-table">
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Avg Score</th>
                                <th>Attempts</th>
                                <th>Students</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topSubjects.map(s => {
                                const score = Math.round(+(s.avg_score || 0));
                                const pct   = score;
                                const color = score >= 75 ? '#1B4D3E' : score >= 50 ? '#d97706' : '#dc2626';
                                const fill  = score >= 75 ? '#1B4D3E' : score >= 50 ? '#fbbf24' : '#fca5a5';
                                return `
                                <tr>
                                    <td>
                                        <div style="display:flex;align-items:center;gap:7px;">
                                            <span class="dn-subj-code">${esc(s.subject_code)}</span>
                                            <span style="font-size:12px;color:#404040;font-weight:500;">${esc(s.subject_name)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div style="font-size:13px;font-weight:700;color:${color};">${score ? score + '%' : '—'}</div>
                                        <div class="dn-mini-bar"><div class="dn-mini-fill" style="width:${pct}%;background:${fill};"></div></div>
                                    </td>
                                    <td style="color:#737373;">${s.attempts || 0}</td>
                                    <td style="color:#737373;">${s.student_count || 0}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                   </div>`}
        </div>

        <!-- Faculty + Quick Actions stacked -->
        <div style="display:flex;flex-direction:column;gap:18px;">

            <!-- Faculty Overview -->
            <div class="dn-chart-card" style="flex:1;">
                <div class="dn-chart-title" style="margin-bottom:14px;">Faculty Workload</div>
                ${faculty.length === 0
                    ? '<div class="dn-empty">No instructors in department</div>'
                    : `<div style="border:2px solid #1B4D3E;border-radius:10px;overflow:hidden;">
                        <table class="dn-fac-table">
                            <thead>
                                <tr>
                                    <th>Instructor</th>
                                    <th>Subj</th>
                                    <th>Students</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${faculty.slice(0,6).map(f => {
                                    const initials = ((f.first_name||'?')[0] + (f.last_name||'?')[0]).toUpperCase();
                                    return `
                                    <tr>
                                        <td>
                                            <div class="dn-fac-cell">
                                                <div class="dn-fac-av">${initials}</div>
                                                <div>
                                                    <div class="dn-fac-name">${esc(f.first_name)} ${esc(f.last_name)}</div>
                                                    <div class="dn-fac-id">${esc(f.employee_id || '—')}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span class="dn-pill dn-pill-green">${f.subject_count}</span></td>
                                        <td><span class="dn-pill dn-pill-blue">${f.student_count}</span></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                       </div>`}
            </div>

            <!-- Quick Actions -->
            <div class="dn-chart-card">
                <div class="dn-chart-title" style="margin-bottom:12px;">Quick Actions</div>
                <div class="dn-quick">
                    <a class="dn-ql" href="#dean/curriculum">
                        <div class="dn-ql-icon">${icon('clipboard', { size: 20 })}</div>Curriculum
                    </a>
                    <a class="dn-ql" href="#dean/faculty-assignments">
                        <div class="dn-ql-icon">${icon('users', { size: 20 })}</div>Faculty
                    </a>
                    <a class="dn-ql" href="#dean/reports">
                        <div class="dn-ql-icon">${icon('chart', { size: 20 })}</div>Reports
                    </a>
                    <a class="dn-ql" href="#dean/dashboard">
                        <div class="dn-ql-icon">${icon('dashboard', { size: 20 })}</div>Overview
                    </a>
                </div>
            </div>

        </div>
    </div>
    `;
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
