/**
 * Dean Analytics — department teaching & student performance summary
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

const G = '#00461B';

export async function render(container) {
    container.innerHTML = '<div style="padding:48px;text-align:center;color:#737373">Loading analytics…</div>';

    const res = await Api.get('/DashboardAPI.php?action=dean');
    const data = res.success ? res.data : {};
    const stats = data.stats || {};
    const dept = data.department || {};
    const faculty = data.faculty || [];
    const subjectStats = data.subject_stats || [];

    const lowSubjects = [...subjectStats]
        .filter(s => s.avg_score != null && parseFloat(s.avg_score) < 75)
        .sort((a, b) => parseFloat(a.avg_score) - parseFloat(b.avg_score))
        .slice(0, 8);

    container.innerHTML = `
        <style>
            .da-hero { background:${G}; color:#fff; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .da-hero h1 { font-size:24px; font-weight:800; margin:0 0 6px; }
            .da-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:14px; margin-bottom:24px; }
            .da-stat { background:#fff; border-radius:14px; padding:18px; }
            .da-stat-val { font-size:24px; font-weight:800; }
            .da-stat-lbl { font-size:12px; color:#6B7280; margin-top:4px; }
            .da-card { background:#fff; border-radius:14px; padding:22px 24px; margin-bottom:20px; }
            .da-card h2 { font-size:16px; font-weight:800; margin:0 0 14px; display:flex; align-items:center; gap:8px; }
            .da-row { display:grid; grid-template-columns:1fr 80px 80px; gap:10px; padding:10px 0; border-bottom:1px solid #F3F4F6; font-size:13px; align-items:center; }
            .da-th { font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase; }
        </style>
        <div class="da-hero">
            <h1>Department Analytics</h1>
            <p>${esc(dept.department_name || 'Your department')} — performance at a glance</p>
        </div>
        <div class="da-grid">
            <div class="da-stat"><div class="da-stat-val">${stats.instructors ?? 0}</div><div class="da-stat-lbl">Instructors</div></div>
            <div class="da-stat"><div class="da-stat-val">${stats.students ?? 0}</div><div class="da-stat-lbl">Students</div></div>
            <div class="da-stat"><div class="da-stat-val">${stats.subjects ?? 0}</div><div class="da-stat-lbl">Subjects</div></div>
            <div class="da-stat"><div class="da-stat-val">${stats.passed ?? 0}</div><div class="da-stat-lbl">Quiz Passes</div></div>
        </div>
        <div class="da-card">
            <h2>${icon('instructor', { size: 18 })} Faculty Activity</h2>
            <div class="da-row da-th"><span>Instructor</span><span>Quizzes</span><span>Lessons</span></div>
            ${faculty.slice(0, 10).map(f => `
                <div class="da-row">
                    <span>${esc(f.first_name)} ${esc(f.last_name)}</span>
                    <span>${f.quiz_count || 0}</span>
                    <span>${f.lesson_count || 0}</span>
                </div>`).join('') || '<p style="color:#9CA3AF">No faculty data.</p>'}
        </div>
        ${lowSubjects.length ? `
        <div class="da-card" style="background:#FDF2F4">
            <h2 style="color:#6B0F1A">${icon('warning', { size: 18 })} Subjects Below 75% Avg</h2>
            ${lowSubjects.map(s => `
                <div class="da-row">
                    <span><strong>${esc(s.subject_code)}</strong> ${esc(s.subject_name)}</span>
                    <span>${s.student_count || 0} students</span>
                    <span style="color:#6B0F1A;font-weight:700">${s.avg_score}%</span>
                </div>`).join('')}
        </div>` : ''}
        <p style="font-size:13px;color:#6B7280"><a href="#dean/reports" style="color:${G};font-weight:700">View full department reports →</a></p>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
