/**
 * Dean Dashboard — academic overview with at-risk alerts and faculty oversight
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { icon } from '../../utils/icons.js';

const G      = '#00461B';
const GL     = '#E8F5EC';
const BORDER = '#E5E7EB';

export async function render(container) {
    container.innerHTML = `<div class="dn-loading"><div class="dn-spin"></div></div>`;

    const [res, semRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=dean'),
        Api.get('/SemesterAPI.php?action=list'),
    ]);

    await Auth.getUser();
    const user  = Auth.user() || {};
    const data  = res.success ? (res.data || {}) : {};
    const stats = data.stats || {};
    const dept  = data.department || {};

    const faculty           = data.faculty            || [];
    const programs          = data.programs           || [];
    const subjectStats      = data.subject_stats      || [];
    const enrollByYear      = data.enrollment_by_year || [];
    const subjectEnrollment = data.subject_enrollment || [];
    const progPerformance   = data.program_performance || [];
    const atRiskStudents    = data.at_risk_students   || [];
    const nonEngaging       = data.non_engaging       || [];

    const semesters = semRes.success ? (semRes.data || []) : [];
    const activeSem = semesters.find(s => s.status === 'active') || null;
    const semName   = activeSem?.semester_name || semesters.find(s => s.status === 'upcoming')?.semester_name || 'No active semester';
    const acadYear  = activeSem?.academic_year || '—';

    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const totalAttempts = +(stats.total_attempts || 0);
    const passed        = +(stats.passed || 0);
    const failed        = +(stats.failed || 0);
    const passRate      = totalAttempts > 0 ? Math.round((passed / totalAttempts) * 100) : 0;
    const avgScore      = stats.avg_score ? Math.round(+stats.avg_score) : 0;

    const maxYear   = Math.max(...enrollByYear.map(r => +r.count), 1);
    const maxEnroll = Math.max(...subjectEnrollment.map(r => +r.enrolled_count), 1);
    const topSubjects = subjectStats.filter(s => +s.attempts > 0).slice(0, 8);

    const YEAR_LABELS = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };

    const scoreColor = v => v >= 75 ? G : v >= 50 ? '#B45309' : '#b91c1c';
    const scoreBg    = v => v >= 75 ? GL : v >= 50 ? '#FEF3C7' : '#FEE2E2';

    const firstName = user.first_name || user.name?.split(' ')[0] || 'Dean';

    container.innerHTML = `
    <style>
        .dn-loading { display:flex; justify-content:center; padding:80px; }
        .dn-spin { width:40px; height:40px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:dnSpin .8s linear infinite; }
        @keyframes dnSpin { to { transform:rotate(360deg); } }

        /* ── Typography helpers ── */
        .dn-text-primary { color:#111827; }
        .dn-text-muted   { color:#6B7280; }
        .dn-text-subtle  { color:#374151; }
        .dn-track        { background:#F0F0F0; border-radius:5px; overflow:hidden; }

        /* ── Header ── */
        .dn-header {
            background:#fff; border:1px solid #EBEBEB; border-radius:16px;
            padding:28px 32px; margin-bottom:22px;
            display:flex; justify-content:space-between; align-items:flex-start; gap:24px; flex-wrap:wrap;
            box-shadow:0 2px 12px rgba(0,70,27,.06);
        }
        .dn-header h1 { font-size:26px; font-weight:800; color:#111; margin:0 0 4px; letter-spacing:-.4px; }
        .dn-header-sub { font-size:14px; color:#6B7280; margin:0 0 14px; }
        .dn-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .dn-chip { font-size:12px; font-weight:600; padding:5px 12px; border-radius:4px; background:#fff; color:${G}; border:1px solid ${G}; }
        .dn-chip--muted { color:#374151; border-color:${BORDER}; }
        .dn-chip--dept  { background:${G}; color:#fff; border-color:${G}; font-size:13px; padding:7px 16px; border-radius:8px; }
        .dn-meta { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding-top:16px; border-top:1px solid ${BORDER}; margin-top:4px; }
        .dn-meta-item  { background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 14px; }
        .dn-meta-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#9CA3AF; margin-bottom:4px; }
        .dn-meta-value { display:block; font-size:14px; font-weight:700; color:${G}; line-height:1.35; }

        /* ── Stat cards ── */
        .dn-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px; }
        .dn-stat {
            background:#fff; border:1px solid ${BORDER}; border-radius:14px; padding:18px 16px;
            display:flex; flex-direction:column; gap:6px;
            box-shadow:0 1px 4px rgba(0,0,0,.04); transition:box-shadow .15s,border-color .15s;
        }
        .dn-stat:hover { box-shadow:0 4px 12px rgba(0,70,27,.09); border-color:#C5D9CB; }
        .dn-stat-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .dn-stat-val  { font-size:28px; font-weight:800; color:#111; line-height:1.1; }
        .dn-stat-lbl  { font-size:12px; color:#9CA3AF; font-weight:500; }
        .dn-stat-sub  { font-size:11px; font-weight:600; color:${G}; }

        /* ── Panel ── */
        .dn-panel { background:#fff; border:1px solid #EBEBEB; border-radius:14px; box-shadow:0 1px 6px rgba(0,0,0,.04); overflow:hidden; }
        .dn-panel-hdr {
            padding:14px 20px; border-bottom:1px solid #F0F0F0;
            display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
        }
        .dn-panel-hdr h3 { font-size:15px; font-weight:700; color:#111; margin:0; }
        .dn-panel-hdr a  { font-size:12px; font-weight:600; color:${G}; text-decoration:none; }
        .dn-panel-hdr a:hover { text-decoration:underline; }
        .dn-panel-body { padding:18px 20px; }

        /* ── Analytics row (3-col) ── */
        .dn-charts { display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; margin-bottom:22px; }

        /* Year bars */
        .dn-year-bars { display:flex; flex-direction:column; gap:10px; }
        .dn-year-row  { display:flex; align-items:center; gap:10px; }
        .dn-year-lbl  { font-size:12px; color:#374151; font-weight:600; width:64px; flex-shrink:0; text-align:right; }
        .dn-year-track { flex:1; background:#F0F0F0; border-radius:6px; height:18px; overflow:hidden; }
        .dn-year-fill  { height:100%; border-radius:6px; background:${G}; display:flex; align-items:center; justify-content:flex-end; padding-right:6px; min-width:2px; }
        .dn-year-fill span { font-size:10px; font-weight:700; color:rgba(255,255,255,.9); }
        .dn-year-count { font-size:12px; font-weight:700; color:${G}; width:28px; flex-shrink:0; text-align:right; }

        /* Subject enroll items */
        .dn-enroll-item { margin-bottom:9px; }
        .dn-enroll-top  { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
        .dn-enroll-code { font-size:11px; font-weight:700; color:${G}; font-family:ui-monospace,monospace; }
        .dn-enroll-cnt  { font-size:11px; font-weight:700; color:#111; }
        .dn-enroll-label{ font-weight:400; color:#9CA3AF; }
        .dn-enroll-track{ background:#F0F0F0; border-radius:5px; height:6px; overflow:hidden; }
        .dn-enroll-fill { height:100%; border-radius:5px; background:${G}; }
        .dn-enroll-name { font-size:10px; color:#9CA3AF; margin-top:1px; }

        /* Program perf bars */
        .dn-prog-bars  { display:flex; flex-direction:column; gap:11px; }
        .dn-prog-row   { display:flex; flex-direction:column; gap:3px; }
        .dn-prog-meta  { display:flex; justify-content:space-between; align-items:center; }
        .dn-prog-name  { font-size:12px; font-weight:600; color:#374151; }
        .dn-prog-score { font-size:12px; font-weight:700; }
        .dn-prog-track { background:#F0F0F0; border-radius:5px; height:7px; overflow:hidden; }
        .dn-prog-fill  { height:100%; border-radius:5px; transition:width .5s ease; }
        .dn-prog-sub   { font-size:10px; color:#9CA3AF; }

        /* ── Alerts + Oversight (2-col) ── */
        .dn-mid { display:grid; grid-template-columns:1.5fr 1fr; gap:18px; margin-bottom:22px; }

        /* Tabs */
        .dn-tabs { display:flex; gap:6px; flex-wrap:wrap; }
        .dn-tab-btn {
            padding:5px 12px; border-radius:6px; border:1px solid ${BORDER};
            background:#fff; font-size:12px; font-weight:600; color:#374151;
            cursor:pointer; transition:background .15s,color .15s,border-color .15s; white-space:nowrap;
        }
        .dn-tab-btn.dn-tab-active { background:${G}; color:#fff; border-color:${G}; }
        .dn-tab-count { border-radius:10px; padding:0 6px; font-size:10px; margin-left:3px; }

        /* Alert badges */
        .dn-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; }
        .dn-badge-red   { background:#FEE2E2; color:#b91c1c; }
        .dn-badge-amber { background:#FEF3C7; color:#92400E; }
        .dn-badge-green { background:${GL}; color:${G}; }
        .dn-badge-gray  { background:#F3F4F6; color:#374151; }

        /* ── Table ── */
        .dn-table { width:100%; border-collapse:collapse; }
        .dn-table th { padding:8px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#6B7280; background:#FAFAFA; border-bottom:1px solid #F0F0F0; text-align:left; }
        .dn-table td { padding:10px 14px; border-bottom:1px solid #F5F5F5; font-size:13px; vertical-align:middle; color:#374151; }
        .dn-table td.dn-td-muted { color:#6B7280; }
        .dn-table tr:last-child td { border-bottom:none; }
        .dn-table tr:hover td { background:#FAFFFE; }

        /* Avatars & cells */
        .dn-av      { width:32px; height:32px; border-radius:50%; background:${G}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
        .dn-av-red  { background:#FEE2E2; color:#b91c1c; }
        .dn-av-amb  { background:#FEF3C7; color:#92400E; }
        .dn-cell    { display:flex; align-items:center; gap:10px; }
        .dn-name    { font-weight:600; color:#111; font-size:13px; }
        .dn-sub     { font-size:11px; color:#9CA3AF; }

        /* Pills */
        .dn-pill       { display:inline-block; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600; }
        .dn-pill-green { background:${GL}; color:${G}; }
        .dn-pill-blue  { background:#DBEAFE; color:#1E40AF; }
        .dn-pill-amber { background:#FEF3C7; color:#92400E; }
        .dn-pill-red   { background:#FEE2E2; color:#b91c1c; }

        /* Subject code */
        .dn-code     { background:${GL}; color:${G}; padding:2px 8px; border-radius:4px; font-family:ui-monospace,monospace; font-size:11px; font-weight:700; }
        .dn-subj-name{ color:#374151; font-size:12px; }
        .dn-mini-bar { height:4px; border-radius:3px; background:#F0F0F0; overflow:hidden; width:56px; margin-top:3px; }
        .dn-mini-fill{ height:100%; border-radius:3px; }

        /* ── Bottom row (2-col) ── */
        .dn-bottom { display:grid; grid-template-columns:1.4fr 1fr; gap:18px; margin-bottom:22px; }

        /* Programs grid */
        .dn-prog-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .dn-prog-card {
            border:1px solid ${BORDER}; border-radius:12px; padding:13px;
            display:flex; flex-direction:column; gap:4px; transition:border-color .15s,box-shadow .15s;
        }
        .dn-prog-card:hover { border-color:#C5D9CB; box-shadow:0 4px 12px rgba(0,70,27,.08); }
        .dn-prog-code  { font-size:11px; font-weight:700; color:${G}; background:${GL}; padding:2px 8px; border-radius:4px; width:fit-content; font-family:ui-monospace,monospace; }
        .dn-prog-full  { font-size:12px; font-weight:600; color:#111; line-height:1.3; }
        .dn-prog-cnts  { display:flex; gap:8px; margin-top:4px; }
        .dn-prog-cnt   { font-size:11px; color:#6B7280; display:flex; align-items:center; gap:3px; }

        /* Quick actions */
        .dn-quick { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .dn-ql {
            display:flex; align-items:center; gap:10px; padding:13px 14px;
            border:1px solid ${BORDER}; border-radius:10px; text-decoration:none;
            color:#374151; font-weight:600; font-size:13px; background:#fff;
            transition:background .15s,border-color .15s,color .15s;
        }
        .dn-ql:hover { background:${GL}; color:${G}; border-color:#C5D9CB; }
        .dn-ql-icon { width:32px; height:32px; border-radius:8px; background:#F3F4F6; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }
        .dn-ql:hover .dn-ql-icon { background:#C8E6C9; }

        /* Misc */
        .dn-empty   { text-align:center; padding:28px 20px; color:#9CA3AF; font-size:13px; }
        .dn-ok-msg  { text-align:center; padding:20px; color:#16a34a; font-size:13px; font-weight:600; }
        .dn-section { font-size:15px; font-weight:700; color:#111; margin:0 0 14px; display:flex; align-items:center; gap:8px; }
        .dn-section::after { content:''; flex:1; height:1px; background:#F0F0F0; }
        .dn-scroll  { max-height:230px; overflow-y:auto; }

        @media(max-width:1100px) { .dn-charts { grid-template-columns:1fr 1fr; } .dn-mid { grid-template-columns:1fr; } }
        @media(max-width:800px)  {
            .dn-charts { grid-template-columns:1fr; }
            .dn-mid    { grid-template-columns:1fr; }
            .dn-bottom { grid-template-columns:1fr; }
            .dn-meta   { grid-template-columns:1fr 1fr; }
            .dn-stats  { grid-template-columns:1fr 1fr !important; }
            .dn-prog-grid { grid-template-columns:1fr; }
        }
    </style>

    <!-- ── Header ── -->
    <div class="dn-header">
        <div style="flex:1;min-width:0;">
            <h1>${greeting}, ${esc(firstName)}</h1>
            <p class="dn-header-sub">${todayStr}</p>
            <div class="dn-chips">
                <span class="dn-chip dn-chip--muted">${esc(user.employee_id || '—')}</span>
                <span class="dn-chip">${esc(dept.department_name || user.department_name || 'Department')}</span>
                <span class="dn-chip dn-chip--muted">Dean</span>
            </div>
            <div class="dn-meta">
                <div class="dn-meta-item">
                    <span class="dn-meta-label">Department</span>
                    <span class="dn-meta-value">${esc(dept.department_code || '—')}</span>
                </div>
                <div class="dn-meta-item">
                    <span class="dn-meta-label">Academic Year</span>
                    <span class="dn-meta-value">${esc(acadYear)}</span>
                </div>
                <div class="dn-meta-item">
                    <span class="dn-meta-label">Semester</span>
                    <span class="dn-meta-value">${esc(semName)}</span>
                </div>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;">
            <div class="dn-chip dn-chip--dept">${esc(dept.department_code || 'DEPT')}</div>
        </div>
    </div>

    <!-- ── Key Stats ── -->
    <div class="dn-stats">
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#DBEAFE;">${icon('graduation', { size: 20 })}</div>
            <div class="dn-stat-val">${stats.students || 0}</div>
            <div class="dn-stat-lbl">Enrolled Students</div>
            <div class="dn-stat-sub">${enrollByYear.length > 0 ? `${enrollByYear.length} year level${enrollByYear.length !== 1 ? 's' : ''}` : 'in department'}</div>
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:${GL};">${icon('book', { size: 20 })}</div>
            <div class="dn-stat-val">${stats.offerings || 0}</div>
            <div class="dn-stat-lbl">Active Courses</div>
            <div class="dn-stat-sub">${stats.subjects || 0} total subjects</div>
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:#FEF3C7;">${icon('instructor', { size: 20 })}</div>
            <div class="dn-stat-val">${stats.instructors || 0}</div>
            <div class="dn-stat-lbl">Faculty Members</div>
            <div class="dn-stat-sub">${faculty.filter(f => +f.subject_count > 0).length} actively teaching</div>
        </div>
        <div class="dn-stat">
            <div class="dn-stat-icon" style="background:${scoreBg(passRate)};">${icon('chart', { size: 20 })}</div>
            <div class="dn-stat-val" style="color:${scoreColor(passRate)};">${totalAttempts > 0 ? passRate + '%' : '—'}</div>
            <div class="dn-stat-lbl">Quiz Pass Rate</div>
            <div class="dn-stat-sub">${totalAttempts > 0 ? `${passed} passed · ${failed} failed` : 'No attempts yet'}</div>
        </div>
    </div>

    <!-- ── Enrollment & Performance ── -->
    <div class="dn-section">${icon('chart', { size: 14, className: 'ui-icon-inline' })} Enrollment &amp; Performance</div>
    <div class="dn-charts">

        <!-- Enrollment by Year Level -->
        <div class="dn-panel">
            <div class="dn-panel-hdr"><h3>Enrollment by Year</h3></div>
            <div class="dn-panel-body">
                ${enrollByYear.length === 0
                    ? '<div class="dn-empty">No year-level data yet</div>'
                    : `<div class="dn-year-bars">
                        ${enrollByYear.map(r => {
                            const pct = Math.round((+r.count / maxYear) * 100);
                            return `
                            <div class="dn-year-row">
                                <div class="dn-year-lbl">${esc(YEAR_LABELS[r.year_level] || 'Yr ' + r.year_level)}</div>
                                <div class="dn-year-track">
                                    <div class="dn-year-fill" style="width:${Math.max(pct, 2)}%">
                                        ${pct >= 18 ? `<span>${r.count}</span>` : ''}
                                    </div>
                                </div>
                                <div class="dn-year-count">${r.count}</div>
                            </div>`;
                        }).join('')}
                       </div>`}
            </div>
        </div>

        <!-- Subject Enrollment -->
        <div class="dn-panel">
            <div class="dn-panel-hdr"><h3>Subject Enrollment</h3></div>
            <div class="dn-panel-body">
                ${subjectEnrollment.length === 0
                    ? '<div class="dn-empty">No enrollment data yet</div>'
                    : `<div class="dn-scroll" style="display:flex;flex-direction:column;gap:9px;">
                        ${subjectEnrollment.map(r => {
                            const pct = Math.round((+r.enrolled_count / maxEnroll) * 100);
                            return `
                            <div class="dn-enroll-item">
                                <div class="dn-enroll-top">
                                    <span class="dn-enroll-code">${esc(r.subject_code)}</span>
                                    <span class="dn-enroll-cnt">${r.enrolled_count} <span class="dn-enroll-label">enrolled</span></span>
                                </div>
                                <div class="dn-enroll-track">
                                    <div class="dn-enroll-fill" style="width:${Math.max(pct, 2)}%;"></div>
                                </div>
                                <div class="dn-enroll-name">${esc(r.subject_name)}</div>
                            </div>`;
                        }).join('')}
                       </div>`}
            </div>
        </div>

        <!-- Program Performance -->
        <div class="dn-panel">
            <div class="dn-panel-hdr"><h3>Program Performance</h3></div>
            <div class="dn-panel-body">
                ${progPerformance.length === 0
                    ? '<div class="dn-empty">No quiz data yet</div>'
                    : `<div class="dn-prog-bars">
                        ${progPerformance.map(p => {
                            const score = Math.round(+(p.avg_score || 0));
                            const fill  = score >= 75 ? G : score >= 50 ? '#FBBF24' : '#FCA5A5';
                            return `
                            <div class="dn-prog-row">
                                <div class="dn-prog-meta">
                                    <span class="dn-prog-name">${esc(p.program_code)}</span>
                                    <span class="dn-prog-score" style="color:${scoreColor(score)};">${score ? score + '%' : '—'}</span>
                                </div>
                                <div class="dn-prog-track">
                                    <div class="dn-prog-fill" style="width:${score}%;background:${fill};"></div>
                                </div>
                                <div class="dn-prog-sub">${p.attempts || 0} attempts · ${p.passed || 0} passed</div>
                            </div>`;
                        }).join('')}
                       </div>`}
            </div>
        </div>
    </div>

    <!-- ── At-Risk Alerts + Faculty Oversight ── -->
    <div class="dn-section">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:#FEE2E2;border-radius:4px;"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#b91c1c" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg></span>
        Alerts &amp; Oversight
    </div>
    <div class="dn-mid">

        <!-- At-Risk Alerts (tabbed) -->
        <div class="dn-panel">
            <div class="dn-panel-hdr">
                <h3>At-Risk Students</h3>
                <div class="dn-tabs">
                    <button class="dn-tab-btn dn-tab-active" data-tab-group="risk" data-tab-btn="low-score">
                        Low Scores
                        <span class="dn-tab-count" style="background:#FEE2E2;color:#b91c1c;">${atRiskStudents.length}</span>
                    </button>
                    <button class="dn-tab-btn" data-tab-group="risk" data-tab-btn="no-engage">
                        Not Engaging
                        <span class="dn-tab-count" style="background:#FEF3C7;color:#92400E;">${nonEngaging.length}</span>
                    </button>
                </div>
            </div>

            <!-- Low Scores pane -->
            <div data-tab-pane="risk" data-tab-id="low-score">
                ${atRiskStudents.length === 0
                    ? '<div class="dn-ok-msg">✓ No students scoring below 60% — looking great!</div>'
                    : `<div style="overflow-x:auto;">
                        <table class="dn-table">
                            <thead><tr>
                                <th>Student</th><th>Program</th><th>Avg Score</th><th>Attempts</th>
                            </tr></thead>
                            <tbody>
                                ${atRiskStudents.map(s => {
                                    const score = Math.round(+(s.avg_score || 0));
                                    const init  = ((s.first_name||'?')[0] + (s.last_name||'?')[0]).toUpperCase();
                                    return `
                                    <tr>
                                        <td>
                                            <div class="dn-cell">
                                                <div class="dn-av dn-av-red">${init}</div>
                                                <div>
                                                    <div class="dn-name">${esc(s.first_name)} ${esc(s.last_name)}</div>
                                                    <div class="dn-sub">${esc(s.student_id || '—')}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span class="dn-pill dn-pill-blue">${esc(s.program_code)}</span></td>
                                        <td><span class="dn-badge dn-badge-red">${score}%</span></td>
                                        <td class="dn-td-muted">${s.attempts}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                       </div>`}
            </div>

            <!-- Not Engaging pane -->
            <div data-tab-pane="risk" data-tab-id="no-engage" style="display:none;">
                ${nonEngaging.length === 0
                    ? '<div class="dn-ok-msg">✓ All enrolled students are engaging with quizzes!</div>'
                    : `<div style="overflow-x:auto;">
                        <table class="dn-table">
                            <thead><tr>
                                <th>Student</th><th>Program</th><th>Enrolled In</th><th>Quiz Attempts</th>
                            </tr></thead>
                            <tbody>
                                ${nonEngaging.map(s => {
                                    const init = ((s.first_name||'?')[0] + (s.last_name||'?')[0]).toUpperCase();
                                    return `
                                    <tr>
                                        <td>
                                            <div class="dn-cell">
                                                <div class="dn-av dn-av-amb">${init}</div>
                                                <div>
                                                    <div class="dn-name">${esc(s.first_name)} ${esc(s.last_name)}</div>
                                                    <div class="dn-sub">${esc(s.student_id || '—')}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span class="dn-pill dn-pill-blue">${esc(s.program_code)}</span></td>
                                        <td class="dn-td-muted">${s.enrolled_subjects} subject${+s.enrolled_subjects !== 1 ? 's' : ''}</td>
                                        <td><span class="dn-badge dn-badge-amber">0</span></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                       </div>`}
            </div>
        </div>

        <!-- Faculty Oversight -->
        <div class="dn-panel">
            <div class="dn-panel-hdr">
                <h3>Faculty Oversight</h3>
                <a href="#dean/instructors">View all</a>
            </div>
            ${faculty.length === 0
                ? '<div class="dn-empty">No instructors in department</div>'
                : `<div style="overflow-x:auto;">
                    <table class="dn-table">
                        <thead><tr>
                            <th>Instructor</th><th>Subj</th><th>Materials</th><th>Status</th>
                        </tr></thead>
                        <tbody>
                            ${faculty.slice(0, 7).map(f => {
                                const init = ((f.first_name||'?')[0] + (f.last_name||'?')[0]).toUpperCase();
                                const hasSubj = +f.subject_count > 0;
                                const hasLess = +f.lesson_count > 0;
                                const [statusLabel, statusClass] = !hasSubj
                                    ? ['Unassigned', 'dn-pill-amber']
                                    : !hasLess
                                    ? ['No Materials', 'dn-pill-red']
                                    : ['Active', 'dn-pill-green'];
                                return `
                                <tr>
                                    <td>
                                        <div class="dn-cell">
                                            <div class="dn-av">${init}</div>
                                            <div>
                                                <div class="dn-name">${esc(f.first_name)} ${esc(f.last_name)}</div>
                                                <div class="dn-sub">${esc(f.employee_id || '—')}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><span class="dn-pill dn-pill-green">${f.subject_count}</span></td>
                                    <td class="dn-td-muted" style="font-size:11px;white-space:nowrap;">${f.lesson_count || 0}L · ${f.quiz_count || 0}Q</td>
                                    <td><span class="dn-pill ${statusClass}">${statusLabel}</span></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                   </div>`}
        </div>
    </div>

    <!-- ── Subject Performance + Programs / Quick Actions ── -->
    <div class="dn-bottom">

        <!-- Subject Performance table -->
        <div class="dn-panel">
            <div class="dn-panel-hdr">
                <h3>Subject Performance</h3>
                <a href="#dean/subjects">View all</a>
            </div>
            ${topSubjects.length === 0
                ? '<div class="dn-empty">No quiz activity yet across subjects</div>'
                : `<div style="overflow-x:auto;">
                    <table class="dn-table">
                        <thead><tr>
                            <th>Subject</th><th>Enrolled</th><th>Avg Score</th><th>Attempts</th>
                        </tr></thead>
                        <tbody>
                            ${topSubjects.map(s => {
                                const score = Math.round(+(s.avg_score || 0));
                                return `
                                <tr>
                                    <td>
                                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                            <span class="dn-code">${esc(s.subject_code)}</span>
                                            <span class="dn-subj-name">${esc(s.subject_name)}</span>
                                        </div>
                                    </td>
                                    <td class="dn-td-muted">${s.student_count || 0}</td>
                                    <td>
                                        <div style="font-weight:700;color:${scoreColor(score)};">${score ? score + '%' : '—'}</div>
                                        <div class="dn-mini-bar">
                                            <div class="dn-mini-fill" style="width:${score}%;background:${score >= 75 ? G : score >= 50 ? '#FBBF24' : '#FCA5A5'};"></div>
                                        </div>
                                    </td>
                                    <td class="dn-td-muted">${s.attempts || 0}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                   </div>`}
        </div>

        <!-- Right: Programs + Quick Actions -->
        <div style="display:flex;flex-direction:column;gap:18px;">

            ${programs.length > 0 ? `
            <div class="dn-panel">
                <div class="dn-panel-hdr">
                    <h3>Programs</h3>
                    <a href="#dean/subjects">Subjects →</a>
                </div>
                <div class="dn-panel-body">
                    <div class="dn-prog-grid">
                        ${programs.map(p => `
                        <div class="dn-prog-card">
                            <span class="dn-prog-code">${esc(p.program_code)}</span>
                            <span class="dn-prog-full">${esc(p.program_name)}</span>
                            <div class="dn-prog-cnts">
                                <span class="dn-prog-cnt">${icon('graduation', { size: 11 })} ${p.student_count || 0}</span>
                                <span class="dn-prog-cnt">${icon('book', { size: 11 })} ${p.subject_count || 0} subj</span>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>` : ''}

            <div class="dn-panel">
                <div class="dn-panel-hdr"><h3>Quick Actions</h3></div>
                <div class="dn-panel-body">
                    <div class="dn-quick">
                        <a class="dn-ql" href="#dean/instructors">
                            <div class="dn-ql-icon">${icon('instructor', { size: 18 })}</div>Faculty
                        </a>
                        <a class="dn-ql" href="#dean/sections">
                            <div class="dn-ql-icon">${icon('school', { size: 18 })}</div>Sections
                        </a>
                        <a class="dn-ql" href="#dean/subjects">
                            <div class="dn-ql-icon">${icon('book', { size: 18 })}</div>Subjects
                        </a>
                        <a class="dn-ql" href="#dean/faculty-assignments">
                            <div class="dn-ql-icon">${icon('clipboard', { size: 18 })}</div>Assignments
                        </a>
                    </div>
                </div>
            </div>

        </div>
    </div>
    `;

    // Tab switching for at-risk panel
    container.querySelectorAll('[data-tab-btn]').forEach(btn => {
        btn.addEventListener('click', () => {
            const group  = btn.dataset.tabGroup;
            const target = btn.dataset.tabBtn;
            container.querySelectorAll(`[data-tab-group="${group}"]`).forEach(b =>
                b.classList.toggle('dn-tab-active', b.dataset.tabBtn === target)
            );
            container.querySelectorAll(`[data-tab-pane="${group}"]`).forEach(p =>
                p.style.display = p.dataset.tabId === target ? '' : 'none'
            );
        });
    });

    container.style.background = '#F9FAFB';
    const pageContent = container.closest('.page-content');
    if (pageContent) pageContent.style.background = '#F9FAFB';
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}
