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
            .st-banner { background:#00461B; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .st-banner::before { content:''; position:absolute; top:-40px; right:-40px; width:180px; height:180px; border-radius:50%; background:rgba(255,255,255,.07); pointer-events:none; }
            .st-banner::after { content:''; position:absolute; bottom:-60px; left:60px; width:220px; height:220px; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
            .st-banner-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; position:relative; z-index:1; }
            .st-banner-title { font-size:26px; font-weight:800; color:#fff; margin:0 0 4px; }
            .st-banner-sub { font-size:14px; color:rgba(255,255,255,.75); margin:0; }
            .st-back-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.25); border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; transition:all .15s; }
            .st-back-btn:hover { background:rgba(255,255,255,.25); }

            .st-filter-bar { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
            .st-filter-bar input, .st-filter-bar select { padding:9px 14px; border:1px solid #e8ecef; border-radius:10px; font-size:13px; background:#fff; color:#374151; outline:none; transition:border-color .15s; box-shadow:0 1px 2px rgba(0,0,0,.04); }
            .st-filter-bar input { min-width:240px; flex:1; }
            .st-filter-bar input:focus, .st-filter-bar select:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }

            .subject-group { margin-bottom:28px; }
            .subject-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:2px solid #f1f5f9; }
            .subj-code { background:#E8F5E9; color:#1B4D3E; padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:700; font-size:13px; }
            .subj-name { font-size:16px; font-weight:700; color:#111827; }
            .subj-count { font-size:13px; color:#9ca3af; }

            .data-table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; border:2px solid #1B4D3E; }
            .data-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .data-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .data-table tr:last-child td { border-bottom:none; }
            .data-table tr:hover td { background:#f9fffe; }

            .user-cell { display:flex; align-items:center; gap:10px; }
            .user-av { width:36px; height:36px; border-radius:50%; background:#1B4D3E; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0; }
            .user-name { font-weight:600; color:#111827; }

            .progress-bar { background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; width:80px; display:inline-block; vertical-align:middle; margin-right:6px; }
            .progress-fill { height:100%; border-radius:3px; background:#1B4D3E; }
            .progress-text { font-size:12px; color:#9ca3af; }

            .score-badge { padding:3px 8px; border-radius:12px; font-size:12px; font-weight:600; }
            .score-pass { background:#dcfce7; color:#16a34a; }
            .score-fail { background:#FEE2E2; color:#b91c1c; }
            .score-na { background:#f1f5f9; color:#9ca3af; }

            .empty-state-sm { text-align:center; padding:40px; color:#9ca3af; }
            @media(max-width:768px) { .st-filter-bar { flex-direction:column; } }
        </style>

        <div class="st-banner">
            <div class="st-banner-inner">
                <div>
                    <h2 class="st-banner-title">Students</h2>
                    <p class="st-banner-sub">View enrolled students across your assigned classes</p>
                </div>
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
        </div>

        <div id="students-content">
            <div style="text-align:center;padding:40px;color:#737373">Loading students...</div>
        </div>
    `;

    async function loadStudents(search = '', subjectFilter = '') {
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

        if (allStudents.length === 0) {
            content.innerHTML = '<div class="empty-state-sm">No students found</div>';
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
            html += `
                <div class="subject-group">
                    <div class="subject-header">
                        <span class="subj-code">${esc(group.code)}</span>
                        <span class="subj-name">${esc(group.name)}</span>
                        <span class="subj-count">(${group.students.length} students)</span>
                    </div>
                    <table class="data-table">
                        <thead><tr><th>Student</th><th>Student ID</th><th>Progress</th><th>Avg Score</th></tr></thead>
                        <tbody>
                            ${group.students.map(s => {
                                const initials = ((s.first_name||'?')[0] + (s.last_name||'?')[0]).toUpperCase();
                                const progress = s.progress || 0;
                                const avgScore = s.avg_score != null ? parseFloat(s.avg_score) : null;
                                const scoreClass = avgScore === null ? 'score-na' : avgScore >= 70 ? 'score-pass' : 'score-fail';
                                return `<tr>
                                    <td><div class="user-cell"><div class="user-av">${initials}</div><span class="user-name">${esc(s.first_name)} ${esc(s.last_name)}</span></div></td>
                                    <td style="color:#737373">${esc(s.student_id||'—')}</td>
                                    <td><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div><span class="progress-text">${progress}%</span></td>
                                    <td><span class="score-badge ${scoreClass}">${avgScore !== null ? avgScore.toFixed(1) + '%' : 'N/A'}</span></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        }
        content.innerHTML = html;
    }

    let debounce;
    container.querySelector('#search').addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => loadStudents(e.target.value, container.querySelector('#filter-subject').value), 400);
    });
    container.querySelector('#filter-subject').addEventListener('change', (e) => {
        loadStudents(container.querySelector('#search').value, e.target.value);
    });

    loadStudents();
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
