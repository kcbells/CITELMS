/**
 * Quiz Integrity — embedded in the Subject page (Classwork / People / Gradebook / Integrity)
 * Scoped to this one subject. Every flagged quiz attempt is labeled with the
 * quiz it belongs to, the student who took it, and exactly which not-allowed
 * actions were detected (tab switching, pasting, copying, screenshot attempts)
 * — not lumped together as a single generic count.
 */
import { Api } from '../../api.js';

const VIOLATION_LABELS = {
    tab_switch_count: { label: 'tab switches',        singular: 'tab switch' },
    paste_count:      { label: 'paste attempts',      singular: 'paste attempt' },
    copy_count:       { label: 'copy attempts',       singular: 'copy attempt' },
    screenshot_count: { label: 'screenshot attempts', singular: 'screenshot attempt' },
};

export async function mountQuizIntegrityTab(host, subjectId) {
    host.innerHTML = `<div class="sqi-loading">Loading…</div>`;

    const res = await Api.get(`/QuizAttemptsAPI.php?action=flagged-attempts&subject_id=${subjectId}`);
    const attempts = res.success ? res.data : [];

    host.innerHTML = `
        <style>
            .sqi-wrap { padding: 4px 0 24px; }
            .sqi-loading { text-align:center; padding:60px; color:#9ca3af; }
            .sqi-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
            .sqi-header h3 { font-size:16px; font-weight:800; color:#1B4D2E; margin:0; }
            .sqi-header p { font-size:12.5px; color:#737373; margin:3px 0 0; }
            .sqi-count { background:#FEE2E2; color:#B91C1C; padding:5px 14px; border-radius:20px; font-size:12.5px; font-weight:700; }

            .sqi-table-wrap { background:#fff; border:1px solid #E5E7EB; border-radius:14px; overflow:hidden; }
            .sqi-table { width:100%; border-collapse:collapse; font-size:13px; }
            .sqi-table th { background:#FAFBFC; color:#9CA3AF; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:12px 18px; border-bottom:1px solid #E5E7EB; text-align:left; }
            .sqi-table tbody tr { border-bottom:1px solid #F3F4F6; }
            .sqi-table tbody tr:last-child { border-bottom:none; }
            .sqi-table tbody tr:hover { background:#FAFBFC; }
            .sqi-table td { padding:13px 18px; vertical-align:middle; color:#374151; }

            .sqi-student { display:flex; align-items:center; gap:10px; }
            .sqi-avatar { width:32px; height:32px; border-radius:50%; background:#1B4D3E; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11.5px; flex-shrink:0; }
            .sqi-name { font-weight:700; color:#1f2937; font-size:13px; }
            .sqi-id { font-size:11px; color:#9CA3AF; }

            .sqi-quiz { font-weight:600; color:#262626; }

            .sqi-actions-list { display:flex; flex-wrap:wrap; gap:5px; }
            .sqi-action-pill { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; padding:3px 9px; border-radius:20px; background:#FEF3C7; color:#92400E; white-space:nowrap; }
            .sqi-action-pill.severe { background:#FEE2E2; color:#B91C1C; }

            .sqi-score { font-weight:700; color:#374151; }
            .sqi-date { color:#9CA3AF; font-size:12px; }

            .sqi-empty { text-align:center; padding:48px 20px; color:#9CA3AF; }
        </style>

        <div class="sqi-wrap">
            <div class="sqi-header">
                <div>
                    <h3>Quiz Integrity</h3>
                    <p>Students flagged for not-allowed actions while taking a quiz in this subject</p>
                </div>
                <div class="sqi-count">${attempts.length} flagged</div>
            </div>

            ${attempts.length === 0
                ? `<div class="sqi-empty">
                        <div>No flagged attempts in this subject. Nothing to review.</div>
                   </div>`
                : `<div class="sqi-table-wrap">
                    <table class="sqi-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Quiz</th>
                                <th>Not-Allowed Actions</th>
                                <th>Score</th>
                                <th>Completed</th>
                            </tr>
                        </thead>
                        <tbody>${attempts.map(renderRow).join('')}</tbody>
                    </table>
                </div>`}
        </div>
    `;
}

function renderRow(a) {
    const initials = ((a.first_name || '?')[0] + (a.last_name || '?')[0]).toUpperCase();
    const date = a.completed_at
        ? new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
    const score = (a.total_points > 0)
        ? `${a.earned_points ?? 0}/${a.total_points} (${Math.round(a.percentage ?? 0)}%)`
        : '—';

    const pills = Object.entries(VIOLATION_LABELS)
        .map(([field, meta]) => {
            const n = parseInt(a[field] || 0, 10);
            if (!n) return '';
            const severe = n >= 3;
            const label = n === 1 ? meta.singular : meta.label;
            return `<span class="sqi-action-pill${severe ? ' severe' : ''}">${n} ${esc(label)}</span>`;
        })
        .join('');

    return `
        <tr>
            <td>
                <div class="sqi-student">
                    <div class="sqi-avatar">${esc(initials)}</div>
                    <div>
                        <div class="sqi-name">${esc(a.first_name)} ${esc(a.last_name)}</div>
                        <div class="sqi-id">${esc(a.student_id || '—')}</div>
                    </div>
                </div>
            </td>
            <td class="sqi-quiz">${esc(a.quiz_title)}</td>
            <td><div class="sqi-actions-list">${pills}</div></td>
            <td class="sqi-score">${score}</td>
            <td class="sqi-date">${date}</td>
        </tr>`;
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
