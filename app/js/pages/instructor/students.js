/**
 * Instructor Students Page
 * View enrolled students across assigned classes
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';

export async function render(container) {
    // Get instructor's classes first
    const classRes = await Api.get('/DashboardAPI.php?action=instructor');
    const classes = classRes.success ? classRes.data.classes : [];

    container.innerHTML = `
        <style>
            .st-banner { background:#fff; border:1px solid #E5E7EB; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .st-banner::before { content:''; position:absolute; top:-40px; right:-40px; width:180px; height:180px; border-radius:50%; background:rgba(255,255,255,.07); pointer-events:none; }
            .st-banner::after { content:''; position:absolute; bottom:-60px; left:60px; width:220px; height:220px; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
            .st-banner-inner { display:flex; align-items:center; justify-content:flex-end; gap:16px; flex-wrap:wrap; position:relative; z-index:1; }
            .st-banner-title { font-size:26px; font-weight:800; color:#111; margin:0 0 4px; }
            .st-banner-sub { font-size:14px; color:#6B7280; margin:0; }
            .st-back-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; background:#E8F5EC; color:#00461B; border:1px solid #E5E7EB; border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; transition:all .15s; }
            .st-back-btn:hover { background:#d9efe0; }

            .st-filter-bar { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
            .st-filter-bar input, .st-filter-bar select { padding:9px 14px; border:1px solid #e8ecef; border-radius:10px; font-size:13px; background:#fff; color:#374151; outline:none; transition:border-color .15s; box-shadow:0 1px 2px rgba(0,0,0,.04); }
            .st-filter-bar input { min-width:240px; flex:1; }
            .st-filter-bar input:focus, .st-filter-bar select:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }

            .subject-group { margin-bottom:28px; }
            .subject-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:2px solid #f1f5f9; }
            .subj-code { background:#E8F5E9; color:#1B4D3E; padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:700; font-size:13px; }
            .subj-name { font-size:16px; font-weight:700; color:#111827; }
            .subj-count { font-size:13px; color:#9ca3af; }

            .data-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; border:1.5px solid #374151; }
            .data-table th { background:#2d6a4f; color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:8px 14px; border:1px solid #155534; text-align:left; }
            .data-table tbody tr:nth-child(even) { background:#f9fafb; }
            .data-table tbody tr:hover { background:#f0fdf4; }
            .data-table td { border:1px solid #d1d5db; padding:8px 12px; vertical-align:middle; font-size:13px; color:#374151; }

            .user-cell { display:flex; align-items:center; gap:10px; }
            .user-av { width:36px; height:36px; border-radius:50%; background:#1B4D3E; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0; }
            .user-av--risk { color:#FF8A8A; }
            .user-av--inactive { color:#FFCE7A; }
            .user-name { font-weight:600; color:#111827; }

            .progress-bar { background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; width:80px; display:inline-block; vertical-align:middle; margin-right:6px; }
            .progress-fill { height:100%; border-radius:3px; background:#1B4D3E; }
            .progress-text { font-size:12px; color:#9ca3af; }

            .score-badge { padding:3px 8px; border-radius:12px; font-size:12px; font-weight:600; }
            .score-pass { background:#dcfce7; color:#16a34a; }
            .score-fail { background:#FEE2E2; color:#b91c1c; }
            .score-na { background:#f1f5f9; color:#9ca3af; }

            .flag-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:12px; font-size:11.5px; font-weight:700; white-space:nowrap; }
            .flag-risk { background:#FEE2E2; color:#b91c1c; }
            .flag-inactive { background:#FEF3C7; color:#b45309; }
            .flag-good { background:#dcfce7; color:#15803d; }
            .flag-ok { color:#d1d5db; font-size:12px; }

            .st-flag-only { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:#374151; font-weight:600; white-space:nowrap; }

            .subj-nocontent { display:flex; align-items:center; gap:8px; padding:10px 14px; margin-bottom:10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; font-size:12.5px; color:#6b7280; }
            .cell-muted { color:#9ca3af; font-size:12.5px; font-style:italic; }
            .cell-submeta { font-size:11px; color:#9ca3af; margin-left:4px; white-space:nowrap; }

            .empty-state-sm { text-align:center; padding:40px; color:#9ca3af; }
            @media(max-width:768px) { .st-filter-bar { flex-direction:column; } }
        </style>

        <div class="st-banner">
            <div class="st-banner-inner">
                <a href="#instructor/my-classes" class="st-back-btn">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                    My Classes
                </a>
            </div>
        </div>

        <div class="st-filter-bar">
            <input type="text" id="search" placeholder="Search student name, ID, or email...">
            <select id="filter-subject">
                <option value="">All Subjects</option>
                ${classes.map(c => `<option value="${c.subject_offered_id}">${esc(c.subject_code)} - ${esc(c.subject_name)}</option>`).join('')}
            </select>
            <label class="st-flag-only">
                <input type="checkbox" id="filter-flagged">
                ⚠️ Needs attention only
            </label>
        </div>

        <div id="students-content">
            <div style="text-align:center;padding:40px;color:#737373">Loading students...</div>
        </div>
    `;

    async function loadStudents(search = '', subjectFilter = '', flaggedOnly = false) {
        const content = container.querySelector('#students-content');

        if (classes.length === 0) {
            content.innerHTML = '<div class="empty-state-sm">No classes assigned. Students will appear when you have assigned classes.</div>';
            return;
        }

        // Get students for each class
        let allStudents = [];
        for (const cls of classes) {
            if (subjectFilter && cls.subject_offered_id != subjectFilter) continue;

            const studRes = await Api.get('/LessonsAPI.php?action=students&subject_offered_id=' + cls.subject_offered_id);
            if (studRes.success && studRes.data) {
                studRes.data.forEach(s => {
                    s._subject_code = cls.subject_code;
                    s._subject_name = cls.subject_name;
                    s._subject_offered_id = cls.subject_offered_id;
                    s._flag = studentFlag(s);
                });
                allStudents = allStudents.concat(studRes.data);
            }
        }

        if (search) {
            const q = search.toLowerCase();
            allStudents = allStudents.filter(s =>
                ((s.first_name||'') + ' ' + (s.last_name||'') + ' ' + (s.student_id||'') + ' ' + (s.email||'')).toLowerCase().includes(q)
            );
        }

        if (flaggedOnly) {
            allStudents = allStudents.filter(s => s._flag);
        }

        if (allStudents.length === 0) {
            content.innerHTML = `<div class="empty-state-sm">${flaggedOnly ? 'No students currently need attention 🎉' : 'No students found'}</div>`;
            return;
        }

        // Group by subject
        const grouped = {};
        allStudents.forEach(s => {
            const key = s._subject_offered_id;
            if (!grouped[key]) grouped[key] = { code: s._subject_code, name: s._subject_name, students: [] };
            grouped[key].students.push(s);
        });

        let html = '';
        for (const [key, group] of Object.entries(grouped)) {
            const totalLessons = group.students[0]?.total_lessons || 0;
            const totalQuizzes = group.students[0]?.total_quizzes || 0;
            const noContentYet = totalLessons === 0 && totalQuizzes === 0;

            html += `
                <div class="subject-group">
                    <div class="subject-header">
                        <span class="subj-code">${esc(group.code)}</span>
                        <span class="subj-name">${esc(group.name)}</span>
                        <span class="subj-count">(${group.students.length} students)</span>
                    </div>
                    ${noContentYet ? `
                    <div class="subj-nocontent">
                        No lessons or quizzes published yet for this subject — student progress and quiz averages can't be tracked until content is added.
                    </div>` : ''}
                    <table class="data-table">
                        <thead><tr><th>Student</th><th>Student ID</th><th>Progress</th><th>Avg Score</th><th>Status</th></tr></thead>
                        <tbody>
                            ${group.students.map(s => {
                                const initials = ((s.first_name||'?')[0] + (s.last_name||'?')[0]).toUpperCase();
                                const progress = s.progress || 0;
                                const totalLes = s.total_lessons || 0;
                                const totalQz = s.total_quizzes || 0;
                                const quizzesTaken = s.quizzes_taken || 0;
                                const avgScore = s.avg_score != null ? parseFloat(s.avg_score) : null;
                                const scoreClass = avgScore === null ? 'score-na' : avgScore >= 70 ? 'score-pass' : 'score-fail';

                                const progressCell = totalLes === 0
                                    ? '<span class="cell-muted">No lessons yet</span>'
                                    : `<div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div><span class="progress-text">${progress}% &middot; ${s.completed_lessons || 0}/${totalLes}</span>`;

                                const scoreCell = totalQz === 0
                                    ? '<span class="cell-muted">No quizzes yet</span>'
                                    : quizzesTaken === 0
                                        ? `<span class="cell-muted">Not attempted &middot; 0/${totalQz}</span>`
                                        : `<span class="score-badge ${scoreClass}">${avgScore.toFixed(1)}%</span> <span class="cell-submeta">${quizzesTaken}/${totalQz} taken</span>`;

                                return `<tr>
                                    <td><div class="user-cell"><div class="user-av ${s._flag ? 'user-av--' + s._flag : ''}">${initials}</div><span class="user-name">${esc(s.first_name)} ${esc(s.last_name)}</span></div></td>
                                    <td style="color:#737373">${esc(s.student_id||'—')}</td>
                                    <td>${progressCell}</td>
                                    <td>${scoreCell}</td>
                                    <td>${flagBadge(s._flag, totalLes === 0 && totalQz === 0)}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        }
        content.innerHTML = html;
    }

    function currentFilters() {
        return [
            container.querySelector('#search').value,
            container.querySelector('#filter-subject').value,
            container.querySelector('#filter-flagged').checked,
        ];
    }

    let debounce;
    container.querySelector('#search').addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => loadStudents(...currentFilters()), 400);
    });
    container.querySelector('#filter-subject').addEventListener('change', () => loadStudents(...currentFilters()));
    container.querySelector('#filter-flagged').addEventListener('change', () => loadStudents(...currentFilters()));

    loadStudents();
}

/**
 * Flags a student as needing attention: a low quiz average ("at risk"), or
 * no engagement with lessons/quizzes that actually exist ("inactive").
 * A subject with no published content yet is never flagged — there's
 * nothing for the student to have engaged with.
 * Mirrors the at-risk threshold used on the instructor/dean dashboards.
 */
function studentFlag(s) {
    const totalLessons = s.total_lessons || 0;
    const totalQuizzes = s.total_quizzes || 0;
    if (totalLessons === 0 && totalQuizzes === 0) return null;

    const avgScore = s.avg_score != null ? parseFloat(s.avg_score) : null;
    if (avgScore !== null && avgScore < 60) return 'risk';

    const noQuizActivity = totalQuizzes > 0 && (s.quizzes_taken || 0) === 0;
    const noLessonProgress = totalLessons > 0 && (s.progress || 0) === 0;
    if (noQuizActivity || noLessonProgress) return 'inactive';

    return null;
}

function flagBadge(flag, noContent) {
    if (flag === 'risk') return '<span class="flag-badge flag-risk">⚠️ At Risk</span>';
    if (flag === 'inactive') return '<span class="flag-badge flag-inactive">🚫 Inactive</span>';
    if (noContent) return '<span class="flag-ok cell-muted">No data yet</span>';
    return '<span class="flag-badge flag-good">✓ On track</span>';
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
