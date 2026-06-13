/**
 * Admin Dashboard Page
 * Shows system overview and statistics
 */

import { Api } from '../../api.js';
import { Auth } from '../../auth.js';

export async function render(container) {
    // Fetch dashboard data from API
    const result = await Api.get('/DashboardAPI.php?action=admin');

    if (!result.success) {
        container.innerHTML = '<div class="alert alert-danger">Failed to load dashboard data.</div>';
        return;
    }

    const s = result.data.stats;
    const users = result.data.recent_users;
    const enrollmentByDept  = result.data.enrollment_by_dept  || [];
    const programEnrollment = result.data.program_enrollment  || [];
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    container.innerHTML = `
        <style>
            .dash-wrap { max-width: 100%; }

            /* ── Banner ── */
            .dash-banner {
                background: #00461B;
                border-radius: 20px; padding: 30px 36px; margin-bottom: 24px;
                display: flex; justify-content: space-between; align-items: center;
                position: relative; overflow: hidden;
                box-shadow: 0 4px 24px rgba(27,77,62,.18);
            }
            .dash-banner::before {
                content:''; position:absolute; top:-50px; right:-50px;
                width:220px; height:220px; border-radius:50%;
                background:rgba(255,255,255,.07); pointer-events:none;
            }
            .dash-banner::after {
                content:''; position:absolute; bottom:-70px; right:160px;
                width:260px; height:260px; border-radius:50%;
                background:rgba(255,255,255,.04); pointer-events:none;
            }
            .banner-left { position:relative; z-index:1; }
            .banner-left h1 { font-size:26px; font-weight:800; color:#fff; margin:0 0 6px; }
            .banner-left p { color:rgba(255,255,255,.78); font-size:14px; margin:0; }
            .banner-right { position:relative; z-index:1; text-align:right; }
            .banner-date {
                color:rgba(255,255,255,.85); font-size:13px; font-weight:500;
                background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18);
                padding:6px 14px; border-radius:20px; display:inline-block;
            }

            /* ── Stat Cards ── */
            .stat-row {
                display: grid; grid-template-columns: repeat(4,1fr);
                gap: 16px; margin-bottom: 24px;
            }
            .stat-card {
                background: #fff; border-radius: 16px; padding: 22px 24px;
                border: 1px solid #edf0f4;
                box-shadow: 0 1px 4px rgba(0,0,0,.05);
                transition: all .2s; position:relative; overflow:hidden;
            }
            .stat-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px rgba(0,0,0,.09); }
            .stat-card-accent {
                position:absolute; top:0; left:0; right:0; height:3px; border-radius:16px 16px 0 0;
            }
            .stat-card-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
            .stat-card-label { font-size:12px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:.06em; }
            .stat-card-badge {
                width:34px; height:34px; border-radius:10px;
                display:flex; align-items:center; justify-content:center; flex-shrink:0;
            }
            .stat-card-badge svg { width:17px; height:17px; }
            .stat-card-num { font-size:34px; font-weight:800; color:#111827; line-height:1; margin-bottom:14px; }
            .stat-card-divider { height:1px; background:#f3f4f6; margin-bottom:12px; }
            .sc-pills { display:flex; flex-wrap:wrap; gap:5px; }
            .pill { padding:3px 9px; border-radius:20px; font-size:11px; font-weight:600; }
            .pill-green  { background:#E8F5E9; color:#1B4D3E; }
            .pill-amber  { background:#FEF3C7; color:#B45309; }
            .pill-blue   { background:#DBEAFE; color:#1E40AF; }
            .pill-purple { background:#EDE9FE; color:#5B21B6; }
            .pill-muted  { background:#F5F5F5; color:#6b7280; }

            /* ── Bottom Grid ── */
            .dash-grid { display:grid; grid-template-columns:1fr 320px; gap:20px; }
            .dash-card {
                background:#fff; border-radius:16px;
                border:1px solid #edf0f4; overflow:hidden;
                box-shadow:0 1px 4px rgba(0,0,0,.05);
            }
            .dash-card-head {
                padding:18px 24px; border-bottom:1px solid #f3f4f6;
                display:flex; justify-content:space-between; align-items:center;
            }
            .dash-card-head h3 { font-size:15px; font-weight:700; color:#111827; margin:0; }
            .dash-card-head a { font-size:13px; color:#1B4D3E; font-weight:600; text-decoration:none; }
            .dash-card-head a:hover { text-decoration:underline; }

            /* ── User table ── */
            .user-table { width:100%; border-collapse:collapse; border-radius:10px; overflow:hidden; border:2px solid #1B4D3E; }
            .user-table th {
                padding:10px 14px; font-size:12px; font-weight:700; color:#404040;
                background:#f7f7f7; border-bottom:1px solid #ccc; text-align:left;
            }
            .user-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; vertical-align:middle; font-size:13px; }
            .user-table tr:last-child td { border-bottom:none; }
            .user-table tr:hover td { background:#f9fffe; }
            .user-av {
                width:36px; height:36px; border-radius:10px; font-weight:700; font-size:12px;
                display:flex; align-items:center; justify-content:center; flex-shrink:0;
            }
            .user-av.admin      { background:#DBEAFE; color:#1E40AF; }
            .user-av.instructor { background:#D1FAE5; color:#065F46; }
            .user-av.student    { background:#FEF3C7; color:#92400E; }
            .user-av.dean       { background:#EDE9FE; color:#5B21B6; }
            .user-meta-name  { font-weight:600; font-size:13.5px; color:#111827; }
            .user-meta-email { font-size:12px; color:#9ca3af; }
            .role-badge {
                padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600;
                text-transform:capitalize; display:inline-block;
            }
            .role-badge.admin      { background:#DBEAFE; color:#1E40AF; }
            .role-badge.instructor { background:#D1FAE5; color:#065F46; }
            .role-badge.student    { background:#FEF3C7; color:#92400E; }
            .role-badge.dean       { background:#EDE9FE; color:#5B21B6; }
            .status-pip {
                display:inline-flex; align-items:center; gap:5px;
                font-size:12px; font-weight:500; color:#6b7280;
            }
            .status-pip::before {
                content:''; width:7px; height:7px; border-radius:50%;
                background:#d1d5db; flex-shrink:0;
            }
            .status-pip.active::before  { background:#22c55e; }
            .status-pip.inactive::before { background:#ef4444; }
            .user-date { font-size:12px; color:#9ca3af; white-space:nowrap; }

            /* ── Quick Actions ── */
            .qa-list { padding:12px 16px; }
            .qa-item {
                display:flex; align-items:center; gap:12px;
                padding:12px 14px; border-radius:12px; margin-bottom:4px;
                text-decoration:none; cursor:pointer; transition:all .15s;
                border:1px solid transparent;
            }
            .qa-item:hover { background:#f0fdf4; border-color:#d1fae5; }
            .qa-icon {
                width:36px; height:36px; border-radius:10px; flex-shrink:0;
                display:flex; align-items:center; justify-content:center;
                background:#f3f4f6;
            }
            .qa-icon svg { width:16px; height:16px; }
            .qa-text { flex:1; font-size:13.5px; font-weight:600; color:#374151; }
            .qa-arrow { color:#9ca3af; font-size:16px; }
            .qa-item:hover .qa-text { color:#1B4D3E; }
            .qa-item:hover .qa-arrow { color:#1B4D3E; }

            /* ── Enrollment Overview ── */
            .enroll-section { margin-top: 24px; }
            .enroll-panel {
                background: #fff; border-radius: 16px;
                border: 1px solid #edf0f4;
                box-shadow: 0 1px 4px rgba(0,0,0,.05);
                overflow: hidden;
            }
            .enroll-panel-head {
                padding: 18px 24px;
                border-bottom: 1px solid #f3f4f6;
                display: flex; align-items: center; justify-content: space-between;
            }
            .enroll-panel-head-left h3 { font-size:15px; font-weight:700; color:#111827; margin:0 0 2px; }
            .enroll-panel-head-left p  { font-size:12.5px; color:#9ca3af; margin:0; }
            .enroll-total-badge {
                background: #E8F5E9; color: #1B4D3E;
                font-size: 12px; font-weight: 700;
                padding: 5px 14px; border-radius: 20px;
            }
            /* column header */
            .enroll-col-head {
                display: grid;
                grid-template-columns: 36px 1fr 90px 80px 80px 28px;
                align-items: center;
                gap: 12px;
                padding: 8px 20px;
                background: #fafbfc;
                border-bottom: 1px solid #f3f4f6;
            }
            .enroll-col-head span {
                font-size: 10.5px; font-weight: 700; color: #9ca3af;
                text-transform: uppercase; letter-spacing: .06em;
            }
            .enroll-col-head span:nth-child(3),
            .enroll-col-head span:nth-child(4),
            .enroll-col-head span:nth-child(5) { text-align: center; }
            /* each department row */
            .dept-row {
                border-bottom: 1px solid #f9fafb;
                transition: background .12s;
            }
            .dept-row:last-child { border-bottom: none; }
            .dept-row-main {
                display: grid;
                grid-template-columns: 36px 1fr 90px 80px 80px 28px;
                align-items: center;
                gap: 12px;
                padding: 13px 20px;
                cursor: pointer;
                user-select: none;
            }
            .dept-row:hover .dept-row-main { background: #fafbfc; }
            .dept-rank {
                width: 28px; height: 28px; border-radius: 8px;
                background: #f3f4f6; color: #6b7280;
                font-size: 12px; font-weight: 700;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }
            .dept-rank.top { background: #E8F5E9; color: #1B4D3E; }
            .dept-row-info { min-width: 0; }
            .dept-row-name {
                font-size: 13.5px; font-weight: 700; color: #111827;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .dept-row-meta { font-size: 11.5px; color: #9ca3af; margin-top: 1px; }
            .dept-row-count {
                text-align: center;
                font-size: 18px; font-weight: 800; color: #1B4D3E;
            }
            .dept-row-count.zero { color: #d1d5db; }
            .dept-row-num {
                text-align: center;
                font-size: 13px; font-weight: 600; color: #374151;
            }
            /* inline bar cell */
            .dept-bar-cell { display: flex; align-items: center; gap: 8px; }
            .dept-bar-track {
                flex: 1; height: 6px; background: #f0f0f0;
                border-radius: 10px; overflow: hidden;
            }
            .dept-bar-fill {
                height: 100%; border-radius: 10px;
                background: #1B4D3E;
                min-width: 3px; transition: width .5s ease;
            }
            .dept-bar-fill.zero { background: #e5e7eb; }
            /* chevron */
            .dept-chevron {
                color: #d1d5db; transition: transform .2s, color .15s;
                display: flex; align-items: center;
            }
            .dept-row.open .dept-chevron { transform: rotate(90deg); color: #1B4D3E; }
            /* expandable program section */
            .dept-prog-expand {
                display: none;
                padding: 0 20px 14px 68px;
                flex-wrap: wrap; gap: 7px;
            }
            .dept-row.open .dept-prog-expand { display: flex; }
            .prog-chip {
                display: inline-flex; align-items: center; gap: 6px;
                background: #f3f4f6; border-radius: 20px;
                padding: 4px 11px; font-size: 12px;
                border: 1px solid #e5e7eb;
            }
            .prog-chip-code { font-weight: 700; color: #374151; }
            .prog-chip-count {
                background: #E8F5E9; color: #1B4D3E;
                font-weight: 700; font-size: 11px;
                padding: 1px 7px; border-radius: 20px;
            }
            .prog-chip-count.zero { background: #f3f4f6; color: #9ca3af; }

            @media(max-width:1100px) { .stat-row { grid-template-columns:repeat(2,1fr); } }
            @media(max-width:900px)  { .dash-grid { grid-template-columns:1fr; } .enroll-col-head { display:none; } .dept-row-main { grid-template-columns:36px 1fr auto 28px; } .dept-row-num { display:none; } }
            @media(max-width:600px)  { .stat-row { grid-template-columns:1fr; } }
        </style>

        <div class="dash-wrap">
            <!-- Banner -->
            <div class="dash-banner">
                <div class="banner-left">
                    <h1>Welcome back, ${escapeHtml(Auth.user().name)}</h1>
                    <p>Here's what's happening across the system today.</p>
                </div>
                <div class="banner-right">
                    <span class="banner-date">${today}</span>
                </div>
            </div>

            <!-- Stat Cards -->
            <div class="stat-row">
                <div class="stat-card">
                    <div class="stat-card-accent" style="background:#1B4D3E"></div>
                    <div class="stat-card-top">
                        <span class="stat-card-label">Total Users</span>
                        <div class="stat-card-badge" style="background:#E8F5E9">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1B4D3E" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-num">${s.total_users}</div>
                    <div class="stat-card-divider"></div>
                    <div class="sc-pills">
                        <span class="pill pill-green">${s.total_students} Students</span>
                        <span class="pill pill-amber">${s.total_instructors} Instructors</span>
                        <span class="pill pill-blue">${s.total_deans} Deans</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-card-accent" style="background:#1E40AF"></div>
                    <div class="stat-card-top">
                        <span class="stat-card-label">Programs</span>
                        <div class="stat-card-badge" style="background:#DBEAFE">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1E40AF" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-num">${s.total_programs}</div>
                    <div class="stat-card-divider"></div>
                    <div class="sc-pills">
                        <span class="pill pill-muted">${s.total_departments} Departments</span>
                        <span class="pill pill-muted">${s.total_subjects} Subjects</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-card-accent" style="background:#B45309"></div>
                    <div class="stat-card-top">
                        <span class="stat-card-label">Lessons</span>
                        <div class="stat-card-badge" style="background:#FEF3C7">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-num">${s.total_lessons}</div>
                    <div class="stat-card-divider"></div>
                    <div class="sc-pills">
                        <span class="pill pill-muted">${s.total_quizzes} Quizzes</span>
                        <span class="pill pill-muted">${s.total_offerings} Offerings</span>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-card-accent" style="background:#5B21B6"></div>
                    <div class="stat-card-top">
                        <span class="stat-card-label">Active Sections</span>
                        <div class="stat-card-badge" style="background:#EDE9FE">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#5B21B6" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        </div>
                    </div>
                    <div class="stat-card-num">${s.total_sections}</div>
                    <div class="stat-card-divider"></div>
                    <div class="sc-pills">
                        <span class="pill pill-green">${s.total_enrolled} Enrolled</span>
                        <span class="pill pill-blue">${s.total_faculty_assigned} Faculty Assigned</span>
                    </div>
                </div>
            </div>

            <!-- Grid: Recent Users + Quick Actions -->
            <div class="dash-grid">
                <div class="dash-card">
                    <div class="dash-card-head">
                        <h3>Recent Users</h3>
                        <a href="#admin/settings">View All →</a>
                    </div>
                    <table class="user-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Joined</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${users.map(u => {
                            const initials = ((u.first_name||'?')[0]+(u.last_name||'?')[0]).toUpperCase();
                            const date = new Date(u.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
                            return `
                            <tr>
                                <td>
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <div class="user-av ${u.role}">${initials}</div>
                                        <div>
                                            <div class="user-meta-name">${escapeHtml(u.first_name+' '+u.last_name)}</div>
                                            <div class="user-meta-email">${escapeHtml(u.email)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="role-badge ${u.role}">${u.role}</span></td>
                                <td><span class="status-pip ${u.status}">${u.status}</span></td>
                                <td class="user-date">${date}</td>
                            </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="dash-card">
                    <div class="dash-card-head">
                        <h3>Quick Actions</h3>
                    </div>
                    <div class="qa-list">
                        <a href="#admin/settings" class="qa-item">
                            <div class="qa-icon" style="background:#E8F5E9">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#1B4D3E" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            </div>
                            <span class="qa-text">Add New User</span>
                            <span class="qa-arrow">›</span>
                        </a>
                        <a href="#admin/programs" class="qa-item">
                            <div class="qa-icon" style="background:#DBEAFE">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#1E40AF" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                            </div>
                            <span class="qa-text">Add Program</span>
                            <span class="qa-arrow">›</span>
                        </a>
                        <a href="#admin/subjects" class="qa-item">
                            <div class="qa-icon" style="background:#FEF3C7">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                            </div>
                            <span class="qa-text">Manage Subjects</span>
                            <span class="qa-arrow">›</span>
                        </a>
                        <a href="#admin/subject-offerings" class="qa-item">
                            <div class="qa-icon" style="background:#EDE9FE">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#5B21B6" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            </div>
                            <span class="qa-text">Subject Offerings</span>
                            <span class="qa-arrow">›</span>
                        </a>
                        <a href="#admin/sections" class="qa-item">
                            <div class="qa-icon" style="background:#FEE2E2">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            </div>
                            <span class="qa-text">Manage Sections</span>
                            <span class="qa-arrow">›</span>
                        </a>
                    </div>
                </div>
            </div>

            <!-- Department Enrollment Overview -->
            <div class="enroll-section">
                <div class="enroll-panel">
                    <div class="enroll-panel-head">
                        <div class="enroll-panel-head-left">
                            <h3>Department Enrollment Overview</h3>
                            <p>Students currently enrolled · click a row to see program breakdown</p>
                        </div>
                        <span class="enroll-total-badge">${s.total_enrolled} Total Enrolled</span>
                    </div>

                    ${enrollmentByDept.length === 0
                        ? `<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px;">No active departments found.</div>`
                        : (() => {
                            const maxEnrolled = Math.max(1, ...enrollmentByDept.map(d => parseInt(d.enrolled_count) || 0));
                            return `
                            <div class="enroll-col-head">
                                <span></span>
                                <span>Department</span>
                                <span>Enrolled</span>
                                <span>Programs</span>
                                <span>Sections</span>
                                <span></span>
                            </div>
                            ${enrollmentByDept.map((dept, i) => {
                                const count   = parseInt(dept.enrolled_count) || 0;
                                const pct     = Math.round((count / maxEnrolled) * 100);
                                const isTop   = i === 0 && count > 0;
                                const deptProgs = programEnrollment.filter(p => p.department_id == dept.department_id);
                                return `
                                <div class="dept-row" data-dept="${dept.department_id}">
                                    <div class="dept-row-main">
                                        <div class="dept-rank ${isTop ? 'top' : ''}">${i + 1}</div>
                                        <div class="dept-row-info">
                                            <div class="dept-row-name">${escapeHtml(dept.department_name)}</div>
                                            <div class="dept-row-meta">${escapeHtml(dept.department_code || '')}</div>
                                        </div>
                                        <div class="dept-bar-cell">
                                            <div class="dept-bar-track">
                                                <div class="dept-bar-fill ${count === 0 ? 'zero' : ''}" style="width:${pct}%"></div>
                                            </div>
                                            <span class="dept-row-count ${count === 0 ? 'zero' : ''}">${count}</span>
                                        </div>
                                        <div class="dept-row-num">${dept.program_count}</div>
                                        <div class="dept-row-num">${dept.section_count}</div>
                                        <div class="dept-chevron">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                                        </div>
                                    </div>
                                    <div class="dept-prog-expand">
                                        ${deptProgs.length > 0
                                            ? deptProgs.map(p => `
                                                <span class="prog-chip" title="${escapeHtml(p.program_name)}">
                                                    <span class="prog-chip-code">${escapeHtml(p.program_code)}</span>
                                                    <span class="prog-chip-count ${parseInt(p.enrolled_count) === 0 ? 'zero' : ''}">${p.enrolled_count}</span>
                                                </span>`).join('')
                                            : `<span style="font-size:12px;color:#9ca3af;font-style:italic;">No programs linked</span>`
                                        }
                                    </div>
                                </div>`;
                            }).join('')}`;
                        })()
                    }
                </div>
            </div>

        </div>
    `;

    // Toggle program breakdown on row click
    container.querySelectorAll('.dept-row').forEach(row => {
        row.querySelector('.dept-row-main').addEventListener('click', () => {
            row.classList.toggle('open');
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
