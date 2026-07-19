/**
 * Admin Dashboard
 * Styled to match dean / instructor dashboard pattern.
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { icon } from '../../utils/icons.js';

const G      = '#00461B';
const GL     = '#E8F5EC';
const BORDER = '#E5E7EB';

export async function render(container) {
    container.innerHTML = `<div class="ad-boot"><div class="ad-spin"></div></div>`;

    const [result, semRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=admin'),
        Api.get('/SemesterAPI.php?action=list'),
    ]);

    await Auth.getUser();
    const user = Auth.user() || {};

    if (!result.success) {
        container.innerHTML = `<div class="ad-err">Failed to load dashboard data.</div>`;
        return;
    }

    const s                 = result.data.stats            || {};
    const recentUsers       = result.data.recent_users     || [];
    const enrollmentByDept  = result.data.enrollment_by_dept  || [];
    const programEnrollment = result.data.program_enrollment   || [];

    const semesters = semRes.success ? (semRes.data || []) : [];
    const activeSem = semesters.find(s => s.status === 'active') || null;
    const semName   = activeSem?.semester_name || semesters.find(s => s.status === 'upcoming')?.semester_name || 'No active semester';
    const acadYear  = activeSem?.academic_year || '—';

    const hour      = new Date().getHours();
    const greeting  = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const todayStr  = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const firstName = user.first_name || user.name?.split(' ')[0] || 'Admin';

    container.innerHTML = `
    <style>
        .ad-boot { display:flex;align-items:center;justify-content:center;padding:80px; }
        .ad-spin { width:36px;height:36px;border:3px solid #eee;border-top-color:${G};border-radius:50%;animation:adSpin .8s linear infinite; }
        .ad-err  { padding:32px;color:#b91c1c;text-align:center; }
        @keyframes adSpin { to { transform:rotate(360deg); } }

        /* ── Header card (matches dn-header / sd-header) ── */
        .ad-header {
            background:#fff; border:1px solid #EBEBEB; border-radius:16px;
            padding:28px 32px; margin-bottom:22px;
            display:flex; justify-content:space-between; align-items:flex-start; gap:24px; flex-wrap:wrap;
            box-shadow:0 2px 12px rgba(0,70,27,.06);
        }
        .ad-header h1 { font-size:26px; font-weight:800; color:#111; margin:0 0 4px; letter-spacing:-.4px; }
        .ad-header-sub { font-size:14px; color:#6B7280; margin:0 0 14px; }
        .ad-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
        .ad-chip { font-size:12px; font-weight:600; padding:5px 12px; border-radius:4px; background:#fff; color:${G}; border:1px solid ${G}; }
        .ad-chip--muted { color:#374151; border-color:${BORDER}; }
        .ad-chip--role  { background:${G}; color:#fff; border-color:${G}; font-size:13px; padding:7px 16px; border-radius:8px; letter-spacing:.5px; }

        .ad-meta { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding-top:16px; border-top:1px solid ${BORDER}; }
        .ad-meta-item { background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 14px; }
        .ad-meta-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#9CA3AF; margin-bottom:4px; }
        .ad-meta-value { display:block; font-size:14px; font-weight:700; color:${G}; line-height:1.35; }

        /* Ring */
        .ad-ring-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; flex-shrink:0; }
        .ad-ring-val  { font-size:13px; font-weight:800; color:#111; }
        .ad-ring-lbl  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9CA3AF; text-align:center; }

        /* ── Stat cards ── */
        .ad-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:22px; }
        .ad-stat {
            background:#fff; border:1px solid ${BORDER}; border-radius:14px; padding:22px 20px;
            box-shadow:0 1px 4px rgba(0,0,0,.04); transition:box-shadow .15s,transform .15s;
        }
        .ad-stat:hover { box-shadow:0 6px 20px rgba(0,0,0,.08); transform:translateY(-2px); }
        .ad-stat-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .ad-stat-label { font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase; letter-spacing:.06em; }
        .ad-stat-icon { width:36px; height:36px; border-radius:10px; background:#F3F4F6; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ad-stat-num { font-size:34px; font-weight:800; color:#111; line-height:1; margin-bottom:14px; }
        .ad-stat-divider { height:1px; background:#F3F4F6; margin-bottom:12px; }
        .ad-pills { display:flex; flex-wrap:wrap; gap:5px; }
        .ad-pill { padding:3px 9px; border-radius:20px; font-size:11px; font-weight:600; background:#F3F4F6; color:#374151; }
        .ad-pill-green  { background:#F3F4F6; color:#374151; }
        .ad-pill-amber  { background:#F3F4F6; color:#374151; }
        .ad-pill-blue   { background:#F3F4F6; color:#374151; }
        .ad-pill-purple { background:#F3F4F6; color:#374151; }
        .ad-pill-muted  { background:#F3F4F6; color:#6b7280; }

        /* ── Panel ── */
        .ad-panel {
            background:#fff; border:1px solid #EBEBEB; border-radius:14px;
            box-shadow:0 1px 6px rgba(0,0,0,.04); overflow:hidden;
        }
        .ad-panel-hdr {
            padding:16px 20px; border-bottom:1px solid #F0F0F0;
            display:flex; align-items:center; justify-content:space-between;
        }
        .ad-panel-hdr h3 { font-size:15px; font-weight:700; color:#111; margin:0; }
        .ad-panel-hdr a  { font-size:12px; font-weight:600; color:${G}; text-decoration:none; }
        .ad-panel-hdr a:hover { text-decoration:underline; }
        .ad-panel-body { padding:20px; }

        /* ── Middle layout ── */
        .ad-mid { display:grid; grid-template-columns:1fr 300px; gap:18px; margin-bottom:22px; }

        /* ── User table ── */
        .ad-table { width:100%; border-collapse:collapse; }
        .ad-table th { padding:10px 16px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#6B7280; background:#FAFAFA; border-bottom:1px solid #F0F0F0; text-align:left; }
        .ad-table td { padding:11px 16px; border-bottom:1px solid #F5F5F5; font-size:13px; vertical-align:middle; }
        .ad-table tr:last-child td { border-bottom:none; }
        .ad-table tr:hover td { background:#FAFFFE; }
        .ad-av { width:38px; height:38px; border-radius:50%; font-weight:700; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:#1B4D3E; color:#fff; }
        .ad-av.admin      { background:#1B4D3E; color:#fff; }
        .ad-av.instructor { background:#1B4D3E; color:#fff; }
        .ad-av.student    { background:#1B4D3E; color:#fff; }
        .ad-av.dean       { background:#1B4D3E; color:#fff; }
        .ad-user-name  { font-weight:600; font-size:13px; color:#111; }
        .ad-user-email { font-size:11px; color:#9CA3AF; }
        .ad-role-badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; display:inline-block; background:#E8F5E9; color:#1B4D3E; }
        .ad-role-badge.admin      { background:#E8F5E9; color:#1B4D3E; }
        .ad-role-badge.instructor { background:#E8F5E9; color:#1B4D3E; }
        .ad-role-badge.student    { background:#E8F5E9; color:#1B4D3E; }
        .ad-role-badge.dean       { background:#E8F5E9; color:#1B4D3E; }
        .ad-status { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:500; color:#6B7280; }
        .ad-status::before { content:''; width:7px; height:7px; border-radius:50%; background:#d1d5db; }
        .ad-status.active::before   { background:#22c55e; }
        .ad-status.inactive::before { background:#ef4444; }

        /* ── Quick Actions (2-col grid like dean) ── */
        .ad-quick { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:16px; }
        .ad-ql {
            display:flex; align-items:center; gap:10px; padding:13px 12px;
            border:1px solid ${BORDER}; border-radius:10px; text-decoration:none;
            color:#374151; font-weight:600; font-size:12.5px; background:#fff;
            transition:background .15s, border-color .15s, color .15s;
        }
        .ad-ql:hover { background:${GL}; color:${G}; border-color:#C5D9CB; }
        .ad-ql-icon { width:30px; height:30px; border-radius:8px; background:#F3F4F6; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }
        .ad-ql:hover .ad-ql-icon { background:#C8E6C9; }

        /* ── Enrollment panel ── */
        .ad-enroll-hdr {
            display:grid; grid-template-columns:36px 1fr 90px 80px 80px 28px;
            align-items:center; gap:12px; padding:8px 20px;
            background:#FAFBFC; border-bottom:1px solid #F3F4F6;
        }
        .ad-enroll-hdr span { font-size:10.5px; font-weight:700; color:#9CA3AF; text-transform:uppercase; letter-spacing:.06em; }
        .ad-enroll-hdr span:nth-child(3),
        .ad-enroll-hdr span:nth-child(4),
        .ad-enroll-hdr span:nth-child(5) { text-align:center; }
        .ad-dept-row { border-bottom:1px solid #F9FAFB; }
        .ad-dept-row:last-child { border-bottom:none; }
        .ad-dept-main {
            display:grid; grid-template-columns:36px 1fr 90px 80px 80px 28px;
            align-items:center; gap:12px; padding:13px 20px; cursor:pointer; user-select:none;
        }
        .ad-dept-row:hover .ad-dept-main { background:#FAFBFC; }
        .ad-dept-rank { width:28px; height:28px; border-radius:8px; background:#F3F4F6; color:#6B7280; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ad-dept-rank.top { background:${GL}; color:${G}; }
        .ad-dept-name { font-size:13.5px; font-weight:700; color:#111; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ad-dept-code { font-size:11.5px; color:#9CA3AF; margin-top:1px; }
        .ad-dept-bar { display:flex; align-items:center; gap:8px; }
        .ad-dept-bar-track { flex:1; height:6px; background:#F0F0F0; border-radius:10px; overflow:hidden; }
        .ad-dept-bar-fill { height:100%; border-radius:10px; background:${G}; transition:width .5s ease; min-width:3px; }
        .ad-dept-bar-fill.zero { background:#E5E7EB; }
        .ad-dept-count { text-align:center; font-size:18px; font-weight:800; color:${G}; }
        .ad-dept-count.zero { color:#D1D5DB; }
        .ad-dept-num { text-align:center; font-size:13px; font-weight:600; color:#374151; }
        .ad-dept-chevron { color:#D1D5DB; transition:transform .2s,color .15s; display:flex; align-items:center; }
        .ad-dept-row.open .ad-dept-chevron { transform:rotate(90deg); color:${G}; }
        .ad-prog-expand { display:none; padding:0 20px 14px 68px; flex-wrap:wrap; gap:7px; }
        .ad-dept-row.open .ad-prog-expand { display:flex; }
        .ad-prog-chip { display:inline-flex; align-items:center; gap:6px; background:#F3F4F6; border-radius:20px; padding:4px 11px; font-size:12px; border:1px solid #E5E7EB; }
        .ad-prog-chip-code  { font-weight:700; color:#374151; }
        .ad-prog-chip-count { background:${GL}; color:${G}; font-weight:700; font-size:11px; padding:1px 7px; border-radius:20px; }
        .ad-prog-chip-count.zero { background:#F3F4F6; color:#9CA3AF; }

        /* Section heading */
        .ad-section-hdr { font-size:15px; font-weight:700; color:#111; margin:0 0 14px; display:flex; align-items:center; gap:8px; }
        .ad-section-hdr::after { content:''; flex:1; height:1px; background:#F0F0F0; }

        .ad-empty { text-align:center; padding:32px; color:#9CA3AF; font-size:13px; }

        @media(max-width:1100px) { .ad-stats { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:900px)  {
            .ad-mid { grid-template-columns:1fr; }
            .ad-enroll-hdr { display:none; }
            .ad-dept-main { grid-template-columns:36px 1fr auto 28px; }
            .ad-dept-num  { display:none; }
        }
        @media(max-width:600px)  { .ad-stats { grid-template-columns:1fr; } .ad-meta { grid-template-columns:1fr 1fr; } }
    </style>

    <!-- ── Header card ── -->
    <div class="ad-header">
        <div style="flex:1;min-width:0;">
            <h1>${greeting}, ${esc(firstName)}</h1>
            <p class="ad-header-sub">${todayStr}</p>
            <div class="ad-chips">
                ${user.employee_id ? `<span class="ad-chip ad-chip--muted">${esc(user.employee_id)}</span>` : ''}
                <span class="ad-chip ad-chip--role">System Administrator</span>
            </div>
            <div class="ad-meta">
                <div class="ad-meta-item">
                    <span class="ad-meta-label">Role</span>
                    <span class="ad-meta-value">Administrator</span>
                </div>
                <div class="ad-meta-item">
                    <span class="ad-meta-label">Academic Year</span>
                    <span class="ad-meta-value">${esc(acadYear)}</span>
                </div>
                <div class="ad-meta-item">
                    <span class="ad-meta-label">Active Semester</span>
                    <span class="ad-meta-value">${esc(semName)}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- ── Stat cards ── -->
    <div class="ad-stats">
        <div class="ad-stat">
            <div class="ad-stat-top">
                <span class="ad-stat-label">Total Users</span>
                <div class="ad-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
            </div>
            <div class="ad-stat-num">${s.total_users ?? 0}</div>
            <div class="ad-stat-divider"></div>
            <div class="ad-pills">
                <span class="ad-pill ad-pill-green">${s.total_students ?? 0} Students</span>
                <span class="ad-pill ad-pill-amber">${s.total_instructors ?? 0} Instructors</span>
                <span class="ad-pill ad-pill-purple">${s.total_deans ?? 0} Deans</span>
            </div>
        </div>

        <div class="ad-stat">
            <div class="ad-stat-top">
                <span class="ad-stat-label">Programs</span>
                <div class="ad-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </div>
            </div>
            <div class="ad-stat-num">${s.total_programs ?? 0}</div>
            <div class="ad-stat-divider"></div>
            <div class="ad-pills">
                <span class="ad-pill ad-pill-muted">${s.total_departments ?? 0} Departments</span>
                <span class="ad-pill ad-pill-muted">${s.total_subjects ?? 0} Subjects</span>
            </div>
        </div>

        <div class="ad-stat">
            <div class="ad-stat-top">
                <span class="ad-stat-label">Content</span>
                <div class="ad-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
            </div>
            <div class="ad-stat-num">${s.total_lessons ?? 0}</div>
            <div class="ad-stat-divider"></div>
            <div class="ad-pills">
                <span class="ad-pill ad-pill-muted">${s.total_quizzes ?? 0} Quizzes</span>
                <span class="ad-pill ad-pill-muted">${s.total_offerings ?? 0} Offerings</span>
            </div>
        </div>

        <div class="ad-stat">
            <div class="ad-stat-top">
                <span class="ad-stat-label">Active Sections</span>
                <div class="ad-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </div>
            </div>
            <div class="ad-stat-num">${s.total_sections ?? 0}</div>
            <div class="ad-stat-divider"></div>
            <div class="ad-pills">
                <span class="ad-pill ad-pill-green">${s.total_enrolled ?? 0} Enrolled</span>
                <span class="ad-pill ad-pill-blue">${s.total_faculty_assigned ?? 0} Faculty Assigned</span>
            </div>
        </div>
    </div>

    <!-- ── Middle: Recent Users + Quick Actions ── -->
    <div class="ad-mid">

        <!-- Recent Users -->
        <div class="ad-panel">
            <div class="ad-panel-hdr">
                <h3>Recent Users</h3>
                <a href="#admin/users">View all →</a>
            </div>
            <div style="overflow-x:auto;">
                <table class="ad-table">
                    <thead><tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Joined</th>
                    </tr></thead>
                    <tbody>
                    ${recentUsers.length === 0
                        ? `<tr><td colspan="4" class="ad-empty">No users yet</td></tr>`
                        : recentUsers.map(u => {
                            const init = ((u.first_name||'?')[0] + (u.last_name||'?')[0]).toUpperCase();
                            const date = new Date(u.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
                            return `
                            <tr>
                                <td>
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <div class="ad-av ${u.role}">${init}</div>
                                        <div>
                                            <div class="ad-user-name">${esc(u.first_name + ' ' + u.last_name)}</div>
                                            <div class="ad-user-email">${esc(u.email)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="ad-role-badge ${u.role}">${u.role}</span></td>
                                <td><span class="ad-status ${u.status}">${u.status}</span></td>
                                <td style="font-size:12px;color:#9CA3AF;white-space:nowrap;">${date}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="ad-panel">
            <div class="ad-panel-hdr"><h3>Quick Actions</h3></div>
            <div class="ad-quick">
                <a class="ad-ql" href="#admin/users">
                    <div class="ad-ql-icon">${icon('users', { size: 16 })}</div>Users
                </a>
                <a class="ad-ql" href="#admin/departments">
                    <div class="ad-ql-icon">${icon('building', { size: 16 })}</div>Departments
                </a>
                <a class="ad-ql" href="#admin/subjects">
                    <div class="ad-ql-icon">${icon('book', { size: 16 })}</div>Subjects
                </a>
                <a class="ad-ql" href="#admin/subject-offerings">
                    <div class="ad-ql-icon">${icon('clipboard', { size: 16 })}</div>Offerings
                </a>
                <a class="ad-ql" href="#admin/settings">
                    <div class="ad-ql-icon">${icon('settings', { size: 16 })}</div>Settings
                </a>
            </div>
        </div>

    </div>

    <!-- ── Department Enrollment Overview ── -->
    <div class="ad-section-hdr">${icon('chart', { size: 14, className: 'ui-icon-inline' })} Department Enrollment Overview</div>
    <div class="ad-panel" style="margin-bottom:24px;">
        <div class="ad-panel-hdr">
            <div>
                <h3 style="margin-bottom:2px;">Enrollment by Department</h3>
                <p style="font-size:12px;color:#9CA3AF;margin:0;">Click a row to see program breakdown</p>
            </div>
            <span style="background:${GL};color:${G};font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;">${s.total_enrolled ?? 0} Total Enrolled</span>
        </div>

        ${enrollmentByDept.length === 0
            ? `<div class="ad-empty">No active departments found.</div>`
            : (() => {
                const maxEnrolled = Math.max(1, ...enrollmentByDept.map(d => parseInt(d.enrolled_count) || 0));
                return `
                <div class="ad-enroll-hdr">
                    <span></span><span>Department</span>
                    <span>Enrolled</span><span>Programs</span><span>Sections</span><span></span>
                </div>
                ${enrollmentByDept.map((dept, i) => {
                    const count    = parseInt(dept.enrolled_count) || 0;
                    const pct      = Math.round((count / maxEnrolled) * 100);
                    const isTop    = i === 0 && count > 0;
                    const deptProgs = programEnrollment.filter(p => p.department_id == dept.department_id);
                    return `
                    <div class="ad-dept-row" data-dept="${dept.department_id}">
                        <div class="ad-dept-main">
                            <div class="ad-dept-rank ${isTop ? 'top' : ''}">${i + 1}</div>
                            <div>
                                <div class="ad-dept-name">${esc(dept.department_name)}</div>
                                <div class="ad-dept-code">${esc(dept.department_code || '')}</div>
                            </div>
                            <div class="ad-dept-bar">
                                <div class="ad-dept-bar-track">
                                    <div class="ad-dept-bar-fill ${count === 0 ? 'zero' : ''}" style="width:${pct}%"></div>
                                </div>
                                <span class="ad-dept-count ${count === 0 ? 'zero' : ''}">${count}</span>
                            </div>
                            <div class="ad-dept-num">${dept.program_count}</div>
                            <div class="ad-dept-num">${dept.section_count}</div>
                            <div class="ad-dept-chevron">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                            </div>
                        </div>
                        <div class="ad-prog-expand">
                            ${deptProgs.length > 0
                                ? deptProgs.map(p => `
                                    <span class="ad-prog-chip" title="${esc(p.program_name)}">
                                        <span class="ad-prog-chip-code">${esc(p.program_code)}</span>
                                        <span class="ad-prog-chip-count ${parseInt(p.enrolled_count) === 0 ? 'zero' : ''}">${p.enrolled_count}</span>
                                    </span>`).join('')
                                : `<span style="font-size:12px;color:#9CA3AF;font-style:italic;">No programs linked</span>`}
                        </div>
                    </div>`;
                }).join('')}`;
            })()}
    </div>`;

    // Toggle dept row expand
    container.querySelectorAll('.ad-dept-row').forEach(row => {
        row.querySelector('.ad-dept-main').addEventListener('click', () => row.classList.toggle('open'));
    });

    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) pageContent.style.background = '#fff';
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}
