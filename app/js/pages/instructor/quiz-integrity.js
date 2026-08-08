/**
 * Instructor Quiz Integrity Report
 * Lists every completed quiz attempt (across all of the instructor's subjects)
 * that was flagged for a proctoring violation (currently: tab-switching).
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    const [subjRes] = await Promise.all([
        Api.get('/LessonsAPI.php?action=subjects'),
    ]);
    const subjects = subjRes.success ? subjRes.data : [];

    renderList(container, subjects, '');
}

async function renderList(container, subjects, subjectId) {
    container.innerHTML = '<div class="qi-loading">Loading…</div>';

    const url = subjectId
        ? `/QuizAttemptsAPI.php?action=flagged-attempts&subject_id=${subjectId}`
        : '/QuizAttemptsAPI.php?action=flagged-attempts';
    const res = await Api.get(url);
    const attempts = res.success ? res.data : [];

    container.innerHTML = `
        <style>
            .qi-header { background:#00461B; border-radius:16px; padding:24px 28px; color:#fff; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
            .qi-header-left { display:flex; align-items:center; gap:14px; }
            .qi-header-icon { width:44px; height:44px; border-radius:10px; background:rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; color:#fff; flex-shrink:0; }
            .qi-header h2 { font-size:20px; font-weight:700; margin:0; }
            .qi-header p { font-size:13px; opacity:.85; margin:4px 0 0; }
            .qi-count-badge { background:rgba(255,255,255,.18); color:#fff; padding:8px 18px; border-radius:10px; font-size:13px; font-weight:700; border:1px solid rgba(255,255,255,.25); }

            .qi-filter { display:flex; gap:12px; margin-bottom:20px; align-items:center; }
            .qi-filter select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:240px; background:#fff; cursor:pointer; }

            .table-wrap { background:#fff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden; }
            .qi-table { width:100%; border-collapse:collapse; font-size:13.5px; background:#fff; }
            .qi-table th {
                background:#fafbfc; color:#9ca3af; font-size:11px; font-weight:700;
                text-transform:uppercase; letter-spacing:0.05em; padding:13px 20px;
                border-bottom:1px solid #e5e7eb; text-align:left;
            }
            .qi-table tbody tr { border-bottom:1px solid #f0f0f0; transition:background .12s; }
            .qi-table tbody tr:last-child { border-bottom:none; }
            .qi-table tbody tr:hover { background:#fafbfc; }
            .qi-table td { padding:14px 20px; vertical-align:middle; color:#374151; }

            .qi-student-cell { display:flex; align-items:center; gap:12px; }
            .qi-avatar { width:36px; height:36px; border-radius:50%; background:#1B4D3E; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12.5px; flex-shrink:0; }
            .qi-name { font-weight:700; color:#1f2937; font-size:13.5px; }
            .qi-id { font-size:11.5px; color:#9ca3af; }

            .qi-severity { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:4px 12px; border-radius:20px; }
            .qi-severity.low  { background:#FEF3C7; color:#92400E; }
            .qi-severity.high { background:#FEE2E2; color:#B91C1C; }

            .qi-subj-code { background:#E8F5E9; color:#1B4D3E; padding:3px 9px; border-radius:6px; font-family:monospace; font-weight:700; font-size:12px; }
            .qi-score { font-weight:700; color:#374151; }

            .qi-empty { text-align:center; padding:60px 20px; color:#9ca3af; }
            .qi-empty-icon { margin-bottom:12px; color:#bbf7d0; }
            .qi-loading { text-align:center; padding:60px; color:#9ca3af; }

            @media(max-width:768px) { .qi-filter select { min-width:100%; } }
        </style>

        <div class="qi-header">
            <div class="qi-header-left">
                <div class="qi-header-icon">${icon('siren', { size: 22 })}</div>
                <div>
                    <h2>Quiz Integrity Report</h2>
                    <p>Attempts flagged for leaving the quiz tab during a proctored quiz</p>
                </div>
            </div>
            <div class="qi-count-badge">${attempts.length} flagged</div>
        </div>

        <div class="qi-filter">
            <select id="qi-subject">
                <option value="">All Subjects</option>
                ${subjects.map(s => `<option value="${s.subject_id}" ${subjectId == s.subject_id ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
            </select>
        </div>

        ${attempts.length === 0
            ? `<div class="qi-empty">
                    <div class="qi-empty-icon">${icon('checkCircle', { size: 40 })}</div>
                    <div>No flagged attempts${subjectId ? ' for this subject' : ''}. Nothing to review.</div>
               </div>`
            : `<div class="table-wrap">
                <table class="qi-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Quiz</th>
                            <th>Subject</th>
                            <th>Violations</th>
                            <th>Score</th>
                            <th>Completed</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${attempts.map(a => {
                            const initials = ((a.first_name || '?')[0] + (a.last_name || '?')[0]).toUpperCase();
                            const switches = parseInt(a.tab_switch_count || 0);
                            const severity = switches >= 3 ? 'high' : 'low';
                            const date = a.completed_at
                                ? new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : '—';
                            const score = (a.total_points > 0)
                                ? `${a.earned_points ?? 0}/${a.total_points} (${Math.round(a.percentage ?? 0)}%)`
                                : '—';
                            return `
                                <tr>
                                    <td>
                                        <div class="qi-student-cell">
                                            <div class="qi-avatar">${esc(initials)}</div>
                                            <div>
                                                <div class="qi-name">${esc(a.first_name)} ${esc(a.last_name)}</div>
                                                <div class="qi-id">${esc(a.student_id || '—')}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${esc(a.quiz_title)}</td>
                                    <td><span class="qi-subj-code">${esc(a.subject_code)}</span></td>
                                    <td>
                                        <span class="qi-severity ${severity}">
                                            ${icon('siren', inl)} ${switches} tab switch${switches !== 1 ? 'es' : ''}
                                        </span>
                                    </td>
                                    <td class="qi-score">${score}</td>
                                    <td style="color:#737373;font-size:13px">${date}</td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}
    `;

    container.querySelector('#qi-subject').addEventListener('change', (e) => {
        renderList(container, subjects, e.target.value);
    });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
