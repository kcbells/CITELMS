/**
 * Instructor Subject Hub — pure render/formatting helpers.
 *
 * Extracted out of subject.js (render() was previously one ~2,244-line function
 * with ~60 nested closures — a genuine maintainability problem flagged in a
 * system audit). Everything here takes its data as plain parameters and
 * returns a value — no closure over subject.js's `state`, `container`, or any
 * other page-level variable — which is exactly what made these safe to move:
 * moving a function that DOES close over that shared state would require
 * rewiring dozens of cross-references by hand with no compiler or test suite
 * to catch a mistake, which is a real risk on a live grading page. These
 * functions have none of that risk, since their only inputs are their own
 * arguments.
 */
import { esc, icon } from '../../utils/classroom-ui.js';
import { resolveMaterialUrl } from '../../utils/material-files.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export function formatPosted(dateStr) {
    if (!dateStr) return '';
    const d = new Date(String(dateStr).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

export function formatDue(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T23:59:59');
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(d);
    due.setHours(0, 0, 0, 0);
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (due < now) return { label, late: true };
    if (due.getTime() === now.getTime()) return { label: 'Today', late: false };
    return { label, late: false };
}

export function classworkPostedTime(data) {
    const raw = data?.created_at || data?.updated_at || data?.posted_at || '';
    const t = new Date(String(raw).replace(' ', 'T')).getTime();
    return Number.isNaN(t) ? 0 : t;
}

export function formatQType(t) {
    const m = { multiple_choice:'Multiple Choice', true_false:'True/False', fill_blank:'Fill in Blank', fill_in_the_blank:'Fill in Blank', short_answer:'Short Answer', essay:'Essay', checkboxes:'Checkboxes', dropdown:'Dropdown' };
    return m[t] || t;
}

export function groupStudentSubmissions(files) {
    const map = new Map();
    for (const f of files) {
        const key = String(f.user_student_id);
        if (!map.has(key)) {
            map.set(key, {
                user_student_id: f.user_student_id,
                student_name: f.student_name || 'Student',
                student_id: f.student_id || '',
                submitted_at: f.submitted_at || null,
                points_earned: f.points_earned != null ? f.points_earned : null,
                files: [],
            });
        }
        const g = map.get(key);
        g.files.push(f);
        if (f.submitted_at && (!g.submitted_at || f.submitted_at < g.submitted_at)) {
            g.submitted_at = f.submitted_at;
        }
        if (f.points_earned != null) g.points_earned = f.points_earned;
    }
    return [...map.values()].sort((a, b) => {
        const ta = a.submitted_at ? new Date(String(a.submitted_at).replace(' ', 'T')).getTime() : Infinity;
        const tb = b.submitted_at ? new Date(String(b.submitted_at).replace(' ', 'T')).getTime() : Infinity;
        return ta - tb;
    });
}

export function renderStudentSubmissionRow(group, index) {
    const submittedLbl = group.submitted_at ? formatPosted(group.submitted_at) : '';
    const ini = group.student_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const filesHtml = group.files.map(f => {
        const name = f.original_name || f.file_name || 'File';
        const href = resolveMaterialUrl(f.file_path);
        return `
            <a class="gc-work-attach" href="${esc(href)}" target="_blank" rel="noopener">
                <span class="gc-work-attach-icon">${icon('document', { size: 20 })}</span>
                <span class="gc-work-attach-text">
                    <span class="gc-work-attach-name">${esc(name)}</span>
                </span>
            </a>`;
    }).join('');

    return `
        <article class="gc-student-submission">
            <div class="gc-student-submission-hdr">
                <span class="gc-submission-order">#${index + 1}</span>
                <div class="sc-avatar sm">${esc(ini)}</div>
                <div class="gc-student-submission-meta">
                    <span class="gc-student-submission-name">${esc(group.student_name)}</span>
                    ${group.student_id ? `<span class="gc-student-submission-id">${esc(group.student_id)}</span>` : ''}
                    ${submittedLbl ? `<span class="gc-student-submission-time">${icon('clock', { size: 12, className: 'ui-icon-inline' })} ${esc(submittedLbl)}</span>` : ''}
                </div>
            </div>
            <div class="gc-student-submission-files">${filesHtml}</div>
        </article>`;
}

export function renderDetailSubmissionRow(group, index, totalPoints) {
    const submittedLbl = group.submitted_at ? formatPosted(group.submitted_at) : '';
    const ini = group.student_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const pointsEarned = group.points_earned != null ? group.points_earned : '';
    const filesHtml = group.files.map(f => {
        const name = f.original_name || f.file_name || 'File';
        const href = resolveMaterialUrl(f.file_path);
        return `<a class="gc-work-attach" href="${esc(href)}" target="_blank" rel="noopener">
            <span class="gc-work-attach-icon">${icon('document', { size: 16 })}</span>
            <span class="gc-work-attach-name gc-work-attach-text">${esc(name)}</span>
        </a>`;
    }).join('');

    return `
        <article class="gc-sub-row" data-student-id="${group.user_student_id}">
            <div class="gc-sub-row-hdr">
                <div class="sc-avatar sm">${esc(ini)}</div>
                <div class="gc-sub-row-meta">
                    <span class="gc-sub-row-name">${esc(group.student_name)}</span>
                    ${submittedLbl ? `<span class="gc-sub-row-time">${esc(submittedLbl)}</span>` : ''}
                </div>
                ${pointsEarned !== '' ? `<span class="gc-sub-row-grade-badge">${pointsEarned}${totalPoints != null ? '/' + totalPoints : ''} pts</span>` : ''}
            </div>
            ${filesHtml ? `<div class="gc-sub-row-files">${filesHtml}</div>` : ''}
            <div class="gc-sub-row-grade-row">
                <input type="number" class="gc-sub-grade-input" min="0"
                    ${totalPoints != null ? `max="${totalPoints}"` : ''}
                    step="0.5" placeholder="${totalPoints != null ? `/ ${totalPoints} pts` : 'Points'}"
                    value="${esc(String(pointsEarned))}">
                <button type="button" class="gc-sub-grade-save" data-student-id="${group.user_student_id}">Save Grade</button>
            </div>
        </article>`;
}

export function renderCwKebabMenu(type, id, published, title) {
    const pubLabel = published ? 'Save as draft' : 'Publish';
    const pubStatus = published ? 'draft' : 'published';
    const typeItems = type === 'quiz'
        ? `<button type="button" class="gc-cw-kebab-item" data-cw-action="edit" data-cw-type="quiz" data-cw-id="${id}">${icon('edit', inl)} Edit quiz</button>
           <button type="button" class="gc-cw-kebab-item" data-cw-action="questions" data-cw-type="quiz" data-cw-id="${id}">${icon('clipboard', inl)} Edit questions</button>`
        : '';
    return `
        <div class="gc-cw-kebab-wrap">
            <button type="button" class="gc-cw-kebab" title="Actions" aria-label="More actions">${icon('menu', { size: 18 })}</button>
            <div class="gc-cw-kebab-menu">
                <button type="button" class="gc-cw-kebab-item" data-cw-action="status" data-cw-type="${type}" data-cw-id="${id}" data-cw-status="${pubStatus}">${icon(published ? 'folder' : 'check', inl)} ${pubLabel}</button>
                ${typeItems}
                <button type="button" class="gc-cw-kebab-item danger" data-cw-action="delete" data-cw-type="${type}" data-cw-id="${id}" data-cw-name="${esc(title)}">${icon('trash', inl)} Delete</button>
                    </div>
        </div>`;
}

export function listQuizSubmissionsInOrder(rows) {
    const map = new Map();
    for (const r of rows || []) {
        const key = r.student_id || `${r.first_name}-${r.last_name}`;
        const pct = parseFloat(r.percentage) || 0;
        const earned = parseFloat(r.earned_points) || 0;
        const total = parseFloat(r.total_points) || 0;
        const completed = r.completed_at || '';
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Student';
        if (!map.has(key)) {
            map.set(key, {
                student_id: r.student_id || '',
                name,
                score: pct,
                earned,
                total,
                attempts: 1,
                passed: Number(r.passed) === 1,
                first_completed: completed,
                attempt_id: r.attempt_id,
            });
        } else {
            const g = map.get(key);
            g.attempts += 1;
            if (completed && (!g.first_completed || completed < g.first_completed)) {
                g.first_completed = completed;
                g.score = pct;
                g.earned = earned;
                g.total = total;
                g.passed = Number(r.passed) === 1;
                g.attempt_id = r.attempt_id;
            }
        }
    }
    return [...map.values()].sort((a, b) => {
        const ta = a.first_completed ? new Date(String(a.first_completed).replace(' ', 'T')).getTime() : Infinity;
        const tb = b.first_completed ? new Date(String(b.first_completed).replace(' ', 'T')).getTime() : Infinity;
        return ta - tb;
    });
}

export function renderQuizScoresTable(scores) {
    const rows = listQuizSubmissionsInOrder(scores);
    if (!rows.length) {
        return `<div class="gc-cur-empty">No student attempts yet.</div>`;
    }
    const fmtDate = (ts) => {
        if (!ts) return '—';
        const d = new Date(String(ts).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };
    return `
        <div class="gc-cur-wrap">
            <div class="gc-cur-label">Student submissions — first to last turned in</div>
            <table class="gc-cur-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th class="th-left">Student ID</th>
                        <th class="th-left">Name</th>
                        <th>Score</th>
                        <th>%</th>
                        <th>Attempts</th>
                        <th>Status</th>
                        <th>Turned in</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((s, i) => `
                        <tr>
                            <td class="td-rank">${i + 1}</td>
                            <td class="td-id">${esc(s.student_id || '—')}</td>
                            <td class="td-name">${esc(s.name)}</td>
                            <td class="td-num"><strong>${s.earned}/${s.total || '—'}</strong></td>
                            <td class="td-num">${s.score.toFixed(0)}%</td>
                            <td class="td-num">${s.attempts}</td>
                            <td class="td-pass">
                                <span class="${s.passed ? 'gc-cur-badge-pass' : 'gc-cur-badge-fail'}">${s.passed ? 'Passed' : 'Failed'}</span>
                            </td>
                            <td class="td-num" style="font-weight:400;font-size:11px;color:#5F6368;">${esc(fmtDate(s.first_completed))}</td>
                            <td><button class="gc-grade-btn" data-attempt="${s.attempt_id}" style="padding:5px 12px;background:#00461B;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Check / Grade</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

export function renderQuestionDifficultyPanel(stats) {
    const rows = (stats || []).filter(s => Number(s.responses) > 0);
    if (!rows.length) {
        return `<div class="gc-focus-card gc-focus-card--analysis">
            <h3 class="gc-focus-card-title">${icon('chart', inl)} Where students struggle</h3>
            <p class="gc-focus-card-note gc-focus-card-note--muted">No completed attempts yet — stats appear after students submit.</p>
        </div>`;
    }
    const top = rows.slice(0, 8);
    return `
        <div class="gc-focus-card gc-focus-card--analysis">
            <h3 class="gc-focus-card-title">${icon('chart', inl)} Where students struggle</h3>
            <p class="gc-focus-card-note gc-focus-card-note--muted">Questions ranked by how often students miss full points.</p>
            <div class="gc-qstats-list">
                ${top.map((q, i) => {
                    const miss = Number(q.miss_count) || 0;
                    const resp = Number(q.responses) || 0;
                    const pct = resp > 0 ? Math.round((miss / resp) * 100) : 0;
                    const preview = String(q.question_text || '').replace(/<[^>]+>/g, '').slice(0, 120);
                    return `
                        <div class="gc-qstat-row">
                            <div class="gc-qstat-rank">${i + 1}</div>
                            <div class="gc-qstat-body">
                                <div class="gc-qstat-text">${esc(preview)}${preview.length >= 120 ? '…' : ''}</div>
                                <div class="gc-qstat-meta">${esc(q.question_type || 'question')} · ${q.max_points || 0} pts · avg ${q.avg_earned ?? 0}/${q.max_points || 0}</div>
                </div>
                            <div class="gc-qstat-bar-wrap">
                                <div class="gc-qstat-bar" style="width:${pct}%"></div>
                                <span class="gc-qstat-pct">${miss}/${resp} missed</span>
            </div>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
}

export function renderDetailSubmissionsPanel(w, studentSubmissions, quizScores) {
    const submissionGroups = groupStudentSubmissions(studentSubmissions || []);
    const quizRows = w.type === 'quiz' ? listQuizSubmissionsInOrder(quizScores) : [];
    const totalPoints = w.type === 'lesson'
        ? (w.data.total_points != null && w.data.total_points !== '' ? Number(w.data.total_points) : null)
        : null;

    const totalCount = w.type === 'quiz'
        ? quizRows.length + submissionGroups.length
        : submissionGroups.length;

    const lessonSubmissionsHtml = w.type === 'lesson'
        ? (submissionGroups.length === 0
            ? `<p class="gc-sub-panel-empty">No students have turned in work yet.</p>`
            : submissionGroups.map((g, i) => renderDetailSubmissionRow(g, i, totalPoints)).join(''))
        : '';

    const quizSubmissionsHtml = w.type === 'quiz' ? `
        <div class="gc-sub-panel-quiz">
            ${renderQuizScoresTable(quizScores)}
            ${submissionGroups.length ? `
                <h4 class="gc-sub-panel-subtitle">${icon('document', inl)} File attachments</h4>
                ${submissionGroups.map((g, i) => renderStudentSubmissionRow(g, i)).join('')}` : ''}
        </div>` : '';

    const showDueDate = w.type === 'quiz' || totalPoints != null;

    const dueRaw = w.data.due_date ? String(w.data.due_date).slice(0, 10) : '';
    const dueDisplay = (() => {
        if (!dueRaw) return null;
        const d = new Date(dueRaw + 'T00:00:00');
        if (isNaN(d)) return null;
        const late = d.getTime() < Date.now();
        return {
            label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            late,
        };
    })();

    const calIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const dueBtnHtml = !showDueDate ? '' : dueDisplay
        ? `<button type="button" class="gc-sub-due-btn gc-sub-due-btn--set ${dueDisplay.late ? 'late' : ''}" id="gc-open-due-modal">
               ${calIcon} ${dueDisplay.late ? 'Past due · ' : 'Due · '}${esc(dueDisplay.label)}
           </button>`
        : `<button type="button" class="gc-sub-due-btn" id="gc-open-due-modal">
               ${calIcon} Set due date
           </button>`;

    return `
        <div class="gc-sub-panel">
            <div class="gc-sub-panel-hdr">
                <h3 class="gc-sub-panel-title">${icon('users', { size: 16, className: 'ui-icon-inline' })} Student Submissions <span class="gc-sub-panel-count">${totalCount}</span></h3>
                ${dueBtnHtml}
            </div>
            <div class="gc-sub-panel-body" id="gc-sub-panel-body">
                ${lessonSubmissionsHtml}
                ${quizSubmissionsHtml}
            </div>
        </div>`;
}
