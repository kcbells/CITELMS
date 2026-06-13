/**
 * Admin Analytics — system-wide usage and enrollment overview
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

const G = '#00461B';

export async function render(container) {
    container.innerHTML = '<div style="padding:48px;text-align:center;color:#737373">Loading analytics…</div>';

    const res = await Api.get('/DashboardAPI.php?action=admin');
    const d = res.success ? res.data : {};
    const stats = d.stats || {};
    const enrollmentByDept = d.enrollment_by_department || [];

    container.innerHTML = `
        <style>
            .aa-hero { background:${G}; color:#fff; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .aa-hero h1 { font-size:24px; font-weight:800; margin:0 0 6px; }
            .aa-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:24px; }
            .aa-stat { background:#fff; border-radius:14px; padding:18px; }
            .aa-stat-val { font-size:26px; font-weight:800; color:#111; }
            .aa-stat-lbl { font-size:12px; color:#6B7280; margin-top:4px; }
            .aa-card { background:#fff; border-radius:14px; padding:22px 24px; margin-bottom:20px; }
            .aa-card h2 { font-size:16px; font-weight:800; margin:0 0 16px; display:flex; align-items:center; gap:8px; }
            .aa-row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #F3F4F6; font-size:14px; }
            .aa-row:last-child { border-bottom:none; }
            .aa-bar { height:10px; background:#F3F4F6; border-radius:5px; overflow:hidden; flex:1; margin:0 12px; }
            .aa-fill { height:100%; background:${G}; border-radius:5px; }
        </style>
        <div class="aa-hero">
            <h1>System Analytics</h1>
            <p>Overview of users, content, and enrollment across the institution.</p>
        </div>
        <div class="aa-grid">
            <div class="aa-stat"><div class="aa-stat-val">${stats.total_users ?? 0}</div><div class="aa-stat-lbl">Total Users</div></div>
            <div class="aa-stat"><div class="aa-stat-val">${stats.total_students ?? 0}</div><div class="aa-stat-lbl">Students</div></div>
            <div class="aa-stat"><div class="aa-stat-val">${stats.total_instructors ?? 0}</div><div class="aa-stat-lbl">Instructors</div></div>
            <div class="aa-stat"><div class="aa-stat-val">${stats.total_enrolled ?? 0}</div><div class="aa-stat-lbl">Enrollments</div></div>
            <div class="aa-stat"><div class="aa-stat-val">${stats.total_lessons ?? 0}</div><div class="aa-stat-lbl">Lessons</div></div>
            <div class="aa-stat"><div class="aa-stat-val">${stats.total_quizzes ?? 0}</div><div class="aa-stat-lbl">Quizzes</div></div>
        </div>
        <div class="aa-card">
            <h2>${icon('building', { size: 18 })} Enrollment by Department</h2>
            ${enrollmentByDept.length === 0 ? '<p style="color:#9CA3AF">No enrollment data.</p>' :
            enrollmentByDept.map(dept => {
                const max = Math.max(...enrollmentByDept.map(x => parseInt(x.enrolled_count || 0, 10)), 1);
                const n = parseInt(dept.enrolled_count || 0, 10);
                const pct = Math.round((n / max) * 100);
                return `<div class="aa-row">
                    <span style="min-width:140px;font-weight:600">${esc(dept.department_code || dept.department_name)}</span>
                    <div class="aa-bar"><div class="aa-fill" style="width:${pct}%"></div></div>
                    <strong style="min-width:40px;text-align:right">${n}</strong>
                </div>`;
            }).join('')}
        </div>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
