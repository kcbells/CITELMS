/**
 * Instructor Essay Grading Page (SPA module)
 * Grade essay and short answer responses from students
 */
import { Api } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    // Fetch instructor's subjects for the filter dropdown
    const subjRes = await Api.get('/LessonsAPI.php?action=subjects');
    const subjects = subjRes.success ? subjRes.data : [];

    container.innerHTML = `
        <style>
            .eg-header { background:#00461B; border-radius:16px; padding:24px 28px; color:#fff; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
            .eg-header h2 { font-size:20px; font-weight:700; margin:0; }
            .eg-header p { font-size:13px; opacity:.85; margin:4px 0 0; }
            .btn-back { display:inline-flex; align-items:center; gap:6px; color:#1B4D3E; font-size:13px; font-weight:600; text-decoration:none; margin-bottom:16px; }
            .btn-back:hover { text-decoration:underline; }

            .eg-stats { display:flex; gap:14px; margin-bottom:24px; flex-wrap:wrap; }
            .eg-stat { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:14px 18px; display:flex; align-items:center; gap:12px; min-width:150px; }
            .eg-stat-icon { width:38px; height:38px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:18px; }
            .eg-stat-icon.warn { background:#FEF3C7; }
            .eg-stat-icon.ok   { background:#E8F5E9; }
            .eg-stat-num { font-size:20px; font-weight:700; color:#222; display:block; }
            .eg-stat-lbl { font-size:11px; color:#777; display:block; }

            .eg-filter { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .eg-filter select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; min-width:220px; cursor:pointer; }

            .eg-list { display:flex; flex-direction:column; gap:10px; }
            .eg-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:16px 20px; display:grid; grid-template-columns:auto 1fr auto auto; align-items:center; gap:16px; cursor:pointer; transition:all .15s; }
            .eg-card:hover { border-color:#1B4D3E; box-shadow:0 2px 8px rgba(0,0,0,.05); }
            .eg-avatar { width:42px; height:42px; border-radius:50%; background:#1B4D3E; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0; }
            .eg-info .eg-student { font-size:15px; font-weight:600; color:#222; }
            .eg-info .eg-meta { font-size:12px; color:#888; margin-top:3px; }
            .eg-info .eg-subject { display:inline-block; background:#1B4D3E; color:#fff; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600; margin-top:4px; }
            .eg-progress { min-width:140px; }
            .eg-prog-label { display:flex; justify-content:space-between; font-size:11px; color:#888; margin-bottom:5px; }
            .eg-prog-bar { height:5px; background:#e8e8e8; border-radius:3px; overflow:hidden; }
            .eg-prog-fill { height:100%; background:#1B4D3E; border-radius:3px; transition:width .3s; }
            .eg-pending-count { background:#FEF3C7; color:#B45309; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; white-space:nowrap; }
            .eg-btn { padding:8px 16px; background:#1B4D3E; color:#fff; border:none; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px; }
            .eg-btn:hover { background:#2D6A4F; }

            .empty-state { text-align:center; padding:60px 24px; background:#fafafa; border:1px dashed #ddd; border-radius:12px; }
            .empty-state h3 { font-size:18px; font-weight:600; color:#333; margin:0 0 8px; }
            .empty-state p { font-size:14px; color:#666; margin:0; }

            /* Student group card */
            .eg-student-group { background:#fff; border:1px solid #e8e8e8; border-radius:12px; margin-bottom:10px; overflow:hidden; }
            .eg-student-header { display:grid; grid-template-columns:auto 1fr auto auto; align-items:center; gap:16px; padding:16px 20px; cursor:pointer; transition:background .15s; }
            .eg-student-header:hover { background:#f0fdf4; }
            .eg-expand-icon { font-size:11px; color:#737373; transition:transform .2s; }
            .eg-expand-icon.open { transform:rotate(90deg); }
            .eg-attempts-list { display:none; border-top:1px solid #f0f0f0; }
            .eg-attempts-list.open { display:block; }
            .eg-attempt-row { display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:14px; padding:12px 20px 12px 60px; border-bottom:1px solid #f5f5f5; background:#fafffe; }
            .eg-attempt-row:last-child { border-bottom:none; }
            .eg-attempt-row:hover { background:#f0fdf4; }
            .eg-attempt-meta { font-size:12px; color:#888; }
            .eg-attempt-meta strong { color:#333; font-size:13px; display:block; }

            /* Grading Panel */
            .eg-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1000; display:flex; justify-content:flex-end; }
            .eg-panel { background:#fff; width:700px; max-width:100vw; height:100%; display:flex; flex-direction:column; box-shadow:-4px 0 32px rgba(0,0,0,.15); animation:slideIn .25s ease-out; }
            @keyframes slideIn { from { transform:translateX(40px); opacity:0; } to { transform:translateX(0); opacity:1; } }
            .eg-panel-header { display:flex; justify-content:space-between; align-items:flex-start; padding:20px 24px; border-bottom:1px solid #e8e8e8; }
            .eg-panel-header h3 { margin:0; font-size:17px; font-weight:700; color:#222; }
            .eg-panel-header p { margin:4px 0 0; font-size:13px; color:#888; }
            .eg-panel-close { background:none; border:none; font-size:24px; color:#999; cursor:pointer; padding:0; line-height:1; }
            .eg-panel-close:hover { color:#333; }
            .eg-panel-body { flex:1; overflow-y:auto; padding:24px; }
            .eg-panel-footer { padding:16px 24px; border-top:1px solid #e8e8e8; display:flex; justify-content:flex-end; gap:10px; }

            .attempt-meta { display:flex; gap:20px; flex-wrap:wrap; background:#f8f9fa; border-radius:10px; padding:14px 16px; margin-bottom:20px; font-size:13px; color:#555; }
            .attempt-meta strong { display:block; font-size:15px; color:#222; font-weight:700; }

            .qblock { border:1px solid #e8e8e8; border-radius:10px; margin-bottom:14px; overflow:hidden; transition:border-color .2s; }
            .qblock.graded { border-color:#bbf7d0; }
            .qblock-head { background:#f8f9fa; padding:11px 15px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e8e8e8; }
            .qnum { font-size:11px; font-weight:700; color:#1B4D3E; text-transform:uppercase; }
            .qtype-badge { font-size:11px; padding:2px 8px; border-radius:4px; font-weight:600; }
            .qtype-badge.essay        { background:#EDE9FE; color:#7C3AED; }
            .qtype-badge.short_answer { background:#FEF3C7; color:#B45309; }
            .qtype-badge.multiple_choice,.qtype-badge.true_false,.qtype-badge.fill_blank { background:#E8F5E9; color:#1B4D3E; }
            .qblock-body { padding:15px; }
            .q-text { font-size:14px; font-weight:600; color:#222; margin-bottom:10px; line-height:1.5; }
            .student-ans { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; font-size:13px; color:#333; line-height:1.6; margin-bottom:12px; white-space:pre-wrap; }
            .student-ans.empty { background:#fef9f0; border-color:#fde68a; color:#92400e; font-style:italic; }
            .grade-row { display:flex; gap:12px; align-items:flex-start; }
            .pts-wrap { flex-shrink:0; }
            .pts-label { font-size:11px; font-weight:600; color:#555; margin-bottom:4px; display:block; }
            .pts-input { width:70px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; font-size:14px; font-weight:600; text-align:center; }
            .pts-input:focus { outline:none; border-color:#1B4D3E; }
            .pts-max { font-size:11px; color:#999; text-align:center; margin-top:3px; }
            .fb-wrap { flex:1; }
            .fb-input { width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:8px; font-size:13px; resize:vertical; min-height:58px; font-family:inherit; box-sizing:border-box; }
            .fb-input:focus { outline:none; border-color:#1B4D3E; }
            .save-btn { margin-top:10px; padding:7px 14px; background:#1B4D3E; color:#fff; border:none; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; transition:background .2s; }
            .save-btn:hover { background:#2D6A4F; }
            .save-btn.saved { background:#10b981; }
            .save-btn:disabled { opacity:.6; cursor:not-allowed; }
            .graded-badge { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; background:#E8F5E9; color:#1B4D3E; border-radius:6px; font-size:12px; font-weight:600; }
            .mc-row { display:flex; gap:8px; align-items:center; font-size:13px; color:#555; margin-bottom:6px; }
            .icon-ok  { color:#1B4D3E; }
            .icon-bad { color:#b91c1c; }

            .btn-outline { padding:9px 18px; background:#fff; border:1px solid #ddd; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
            .btn-green  { padding:9px 18px; background:#1B4D3E; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:7px; }
            .btn-green:hover { background:#2D6A4F; }
            .btn-green:disabled { opacity:.5; cursor:not-allowed; }

            .spin { animation:spin 1s linear infinite; }
            @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        </style>

        <a href="#instructor/gradebook" class="btn-back">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Back to Gradebook
        </a>
        <div class="eg-header">
            <div>
                <h2>Subjective Grading</h2>
                <p>Review and grade essay, short answer, and fill-in-the-blank responses from students</p>
            </div>
        </div>

        <div class="eg-stats" id="eg-stats"></div>

        <div class="eg-filter">
            <select id="eg-subject-filter">
                <option value="">All Subjects</option>
                ${subjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
            </select>
        </div>

        <div id="eg-list-wrap"></div>
    `;

    document.getElementById('eg-subject-filter').addEventListener('change', e => loadList(container, e.target.value));
    loadList(container, '');
}

async function loadList(container, subjectId) {
    const wrap = document.getElementById('eg-list-wrap');
    const statsEl = document.getElementById('eg-stats');
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Loading...</div>';

    const url = '/QuizAttemptsAPI.php?action=pending-grading' + (subjectId ? '&subject_id=' + subjectId : '');
    const res = await Api.get(url);
    const attempts = res.success ? res.data : [];

    // Stats — count only attempts that still have ungraded answers
    const pendingAttempts  = attempts.filter(a => parseInt(a.pending_count || 0) > 0);
    const totalAnswers     = pendingAttempts.reduce((s, a) => s + parseInt(a.pending_count || 0), 0);
    const flaggedAttempts  = attempts.filter(a => parseInt(a.tab_switch_count || 0) > 0);
    statsEl.innerHTML = `
        <div class="eg-stat">
            <div class="eg-stat-icon warn">${icon('edit', { size: 22 })}</div>
            <div><span class="eg-stat-num">${pendingAttempts.length}</span><span class="eg-stat-lbl">Submissions Pending</span></div>
        </div>
        <div class="eg-stat">
            <div class="eg-stat-icon ok">${icon('checkCircle', { size: 22 })}</div>
            <div><span class="eg-stat-num">${totalAnswers}</span><span class="eg-stat-lbl">Answers to Grade</span></div>
        </div>
        ${flaggedAttempts.length > 0 ? `
        <div class="eg-stat" style="border-color:#FCA5A5;">
            <div class="eg-stat-icon" style="background:#FEE2E2;">${icon('siren', { size: 22 })}</div>
            <div><span class="eg-stat-num" style="color:#b91c1c;">${flaggedAttempts.length}</span><span class="eg-stat-lbl">Integrity Flags</span></div>
        </div>` : ''}`;

    if (attempts.length === 0) {
        wrap.innerHTML = `<div class="empty-state">
            <div style="margin-bottom:12px;">${iconLg('quiz')}</div>
            <h3>No Subjective Submissions</h3>
            <p>No students have submitted quizzes with essay or short answer questions yet.</p>
        </div>`;
        return;
    }

    // Group attempts by student
    const byStudent = new Map();
    attempts.forEach(a => {
        const key = a.first_name + '_' + a.last_name;
        if (!byStudent.has(key)) byStudent.set(key, { first_name: a.first_name, last_name: a.last_name, attempts: [] });
        byStudent.get(key).attempts.push(a);
    });

    let html = '';
    let gid = 0;
    for (const [, st] of byStudent) {
        gid++;
        const groupId = `sg-${gid}`;
        const initials = (st.first_name?.[0] || '') + (st.last_name?.[0] || '');
        const totalPending = st.attempts.reduce((s, a) => s + parseInt(a.pending_count || 0), 0);
        const totalAttempts = st.attempts.length;

        html += `
        <div class="eg-student-group">
            <div class="eg-student-header" data-group="${groupId}">
                <span class="eg-expand-icon">▶</span>
                <div class="eg-info" style="display:flex;align-items:center;gap:12px;">
                    <div class="eg-avatar">${esc(initials)}</div>
                    <div>
                        <div class="eg-student">${esc(st.first_name)} ${esc(st.last_name)}</div>
                        <div class="eg-meta">${totalAttempts} submission${totalAttempts!==1?'s':''}</div>
                    </div>
                </div>
                ${totalPending > 0
                    ? `<span class="eg-pending-count">${totalPending} pending</span>`
                    : `<span class="eg-pending-count" style="background:#E8F5E9;color:#1B4D3E;">${icon('check', inl)} all graded</span>`
                }
                <span style="font-size:12px;color:#9ca3af;">${totalAttempts} attempt${totalAttempts!==1?'s':''}</span>
            </div>
            <div class="eg-attempts-list" id="${groupId}">
                ${st.attempts.map(a => {
                    const total  = parseInt(a.pending_count || 0) + parseInt(a.graded_count || 0);
                    const graded = parseInt(a.graded_count || 0);
                    const pct    = total > 0 ? Math.round(graded / total * 100) : 0;
                    const date   = a.completed_at ? new Date(a.completed_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '';
                    return `
                    <div class="eg-attempt-row">
                        <div class="eg-attempt-meta">
                            <strong>${esc(a.quiz_title)}</strong>
                            <span>${esc(a.subject_code)} &bull; ${date}</span>
                            ${parseInt(a.tab_switch_count || 0) > 0
                                ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#FEE2E2;color:#b91c1c;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-top:3px;">
                                    ${icon('siren', inl)} ${a.tab_switch_count} tab switch${parseInt(a.tab_switch_count)>1?'es':''}
                                   </span>`
                                : ''}
                        </div>
                        <div class="eg-progress" style="min-width:120px;">
                            <div class="eg-prog-label"><span style="font-size:11px;color:#888;">${graded}/${total} graded</span></div>
                            <div class="eg-prog-bar"><div class="eg-prog-fill" style="width:${pct}%"></div></div>
                        </div>
                        ${parseInt(a.pending_count) > 0
                            ? `<span class="eg-pending-count" style="font-size:11px;">${a.pending_count} pending</span>`
                            : `<span class="eg-pending-count" style="font-size:11px;background:#E8F5E9;color:#1B4D3E;">${icon('check', inl)} graded</span>`
                        }
                        <button class="eg-btn grade-btn" data-attempt="${a.attempt_id}" data-switches="${a.tab_switch_count || 0}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            ${parseInt(a.pending_count) > 0 ? 'Grade' : 'Review'}
                        </button>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    wrap.innerHTML = html;

    // Toggle expand/collapse
    wrap.querySelectorAll('.eg-student-header').forEach(hdr => {
        hdr.addEventListener('click', () => {
            const list = document.getElementById(hdr.dataset.group);
            const icon = hdr.querySelector('.eg-expand-icon');
            const isOpen = list.classList.toggle('open');
            icon.classList.toggle('open', isOpen);
        });
    });

    // Grade button opens panel
    wrap.querySelectorAll('.grade-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPanel(container, btn.dataset.attempt, subjectId, parseInt(btn.dataset.switches || 0));
        });
    });
}

async function openPanel(container, attemptId, subjectId, tabSwitches = 0) {
    const overlay = document.createElement('div');
    overlay.className = 'eg-overlay';
    overlay.innerHTML = `<div class="eg-panel">
        <div class="eg-panel-header">
            <div><h3 id="panel-title">Loading...</h3><p id="panel-sub"></p></div>
            <button class="eg-panel-close">&times;</button>
        </div>
        <div class="eg-panel-body" id="panel-body">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:12px;color:#888;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B4D3E" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                <p>Loading submission...</p>
            </div>
        </div>
        <div class="eg-panel-footer">
            <button class="btn-outline panel-cancel">Close</button>
            <button class="btn-green" id="panel-finalize" disabled style="opacity:.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Finalize &amp; Save
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.eg-panel-close').addEventListener('click', close);
    overlay.querySelector('.panel-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const res = await Api.get('/QuizAttemptsAPI.php?action=attempt-answers&attempt_id=' + attemptId);
    if (!res.success) {
        document.getElementById('panel-body').innerHTML = `<div style="color:#b91c1c;text-align:center;padding:40px;">${esc(res.message || 'Failed to load')}</div>`;
        return;
    }

    const { attempt, answers } = res.data;
    document.getElementById('panel-title').textContent = attempt.quiz_title;
    document.getElementById('panel-sub').textContent =
        `${attempt.first_name} ${attempt.last_name}${attempt.student_id ? ' (' + attempt.student_id + ')' : ''} — ${attempt.subject_code}`;

    // Integrity alert — shown at top of panel if student switched tabs
    const switches = parseInt(attempt.tab_switch_count || tabSwitches || 0);
    const integrityHtml = switches > 0 ? `
        <div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;">
            <span style="flex-shrink:0;">${icon('siren', { size: 22 })}</span>
            <div>
                <div style="font-size:13px;font-weight:700;color:#991B1B;margin-bottom:2px;">
                    Integrity Flag — ${switches} tab switch${switches > 1 ? 'es' : ''} detected
                </div>
                <div style="font-size:12px;color:#b91c1c;">
                    This student left the quiz tab ${switches} time${switches > 1 ? 's' : ''} while taking this quiz.
                    ${switches >= 3 ? ' <strong>Multiple violations — consider reviewing this submission carefully.</strong>' : ''}
                </div>
            </div>
        </div>` : '';

    let html = `${integrityHtml}<div class="attempt-meta">
        <div><strong>${attempt.earned_points}/${attempt.total_points} pts</strong>Current Score</div>
        <div><strong>${attempt.percentage}%</strong>Percentage</div>
        <div><strong>${attempt.passing_rate}%</strong>Passing Rate</div>
    </div>`;

    let qn = 0;
    answers.forEach(a => {
        qn++;
        const isSubj     = ['essay','short_answer','fill_blank','fill_in_the_blank'].includes(a.question_type);
        const isPending  = a.grading_status === 'pending';
        const isAiGraded = a.grading_status === 'auto_graded';
        const isGraded   = a.grading_status === 'graded';
        const studentText = (a.answer_text || '').trim();

        html += `<div class="qblock${isGraded ? ' graded' : ''}" id="qb_${a.answer_id}">
            <div class="qblock-head">
                <span class="qnum">Question ${qn}</span>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="qtype-badge ${a.question_type}">${formatType(a.question_type)}</span>
                    <span style="font-size:11px;color:#999;">${a.max_points} pt${a.max_points != 1 ? 's' : ''}</span>
                    ${isAiGraded ? `<span style="font-size:10px;background:#EDE9FE;color:#7C3AED;padding:2px 7px;border-radius:4px;font-weight:600;">${L.aiGraded}</span>` : ''}
                </div>
            </div>
            <div class="qblock-body">
                <div class="q-text">${esc(a.question_text)}</div>`;

        if (isSubj) {
            html += `<div class="student-ans${!studentText ? ' empty' : ''}">${studentText ? esc(studentText) : '(No answer provided)'}</div>`;
            if (isPending || isAiGraded) {
                // Show grade form — for AI graded, pre-fill with AI score so instructor can review/override
                const currentPts = isAiGraded ? (parseFloat(a.points_earned) || 0) : 0;
                const currentFb  = isAiGraded ? (a.grader_feedback || '') : '';
                html += `
                ${isAiGraded ? `<div style="background:#EDE9FE;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:#5B21B6;">
                    ${icon('robot', inl)} <strong>AI Score: ${currentPts}/${a.max_points} pts</strong>${currentFb ? ` — <em>${esc(currentFb)}</em>` : ''}<br>
                    <span style="opacity:.75">Review and adjust below if needed.</span>
                </div>` : `<div id="ai-hint-${a.answer_id}" style="background:#F5F3FF;border:1px dashed #C4B5FD;border-radius:8px;padding:9px 14px;margin-bottom:10px;font-size:12px;color:#7C3AED;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                    <span>${icon('robot', inl)} AI grading didn't run for this answer.</span>
                    <button class="ai-grade-btn" id="aibtn_${a.answer_id}" data-answer="${a.answer_id}" data-max="${a.max_points}"
                        style="background:#7C3AED;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;">
                        ${L.aiGenerate}
                    </button>
                </div>`}
                <div class="grade-row">
                    <div class="pts-wrap">
                        <span class="pts-label">Points</span>
                        <input type="number" class="pts-input" id="pts_${a.answer_id}" min="0" max="${a.max_points}" step="0.5" value="${currentPts}">
                        <div class="pts-max">/ ${a.max_points}</div>
                    </div>
                    <div class="fb-wrap">
                        <span class="pts-label">Feedback (optional)</span>
                        <textarea class="fb-input" id="fb_${a.answer_id}" placeholder="Add feedback...">${esc(currentFb)}</textarea>
                    </div>
                </div>
                <button class="save-btn" id="sbtn_${a.answer_id}" data-answer="${a.answer_id}" data-max="${a.max_points}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                    ${isAiGraded ? 'Override / Confirm Grade' : 'Save Grade'}
                </button>`;
            } else {
                html += `<div class="graded-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Graded: ${a.points_earned}/${a.max_points} pts
                    ${a.grader_feedback ? `&nbsp;&mdash; <em style="font-weight:400;">${esc(a.grader_feedback)}</em>` : ''}
                </div>`;
            }
        } else {
            const correct = a.is_correct == 1;
            html += `<div class="mc-row">
                <span class="${correct ? 'icon-ok' : 'icon-bad'}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${correct ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}
                    </svg>
                </span>
                <span>${correct ? 'Correct' : 'Incorrect'} &mdash; ${a.points_earned}/${a.max_points} pts</span>
            </div>
            ${a.selected_option_text ? `<div style="font-size:12px;color:#999;">Student: <em>${esc(a.selected_option_text)}</em></div>` : ''}
            ${a.correct_answer_text && !correct ? `<div style="font-size:12px;color:#1B4D3E;margin-top:3px;">Correct: <strong>${esc(a.correct_answer_text)}</strong></div>` : ''}`;
        }

        html += '</div></div>';
    });

    document.getElementById('panel-body').innerHTML = html;

    // Wire up AI grade buttons
    overlay.querySelectorAll('.ai-grade-btn').forEach(btn => {
        btn.addEventListener('click', () => runAiGrade(overlay, btn.dataset.answer, parseFloat(btn.dataset.max)));
    });

    // Wire up save buttons
    overlay.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveAnswer(overlay, btn.dataset.answer, parseFloat(btn.dataset.max)));
    });

    checkFinalize(overlay, attemptId, close, subjectId, container);
}

function checkFinalize(overlay, attemptId, closePanel, subjectId, container) {
    const finalBtn = document.getElementById('panel-finalize');
    const pendingBtns = overlay.querySelectorAll('.save-btn:not(.saved)');
    if (pendingBtns.length === 0) {
        finalBtn.disabled = false;
        finalBtn.style.opacity = '1';
    }

    finalBtn.onclick = async () => {
        finalBtn.disabled = true;
        finalBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Finalizing...';

        const res = await Api.post('/QuizAttemptsAPI.php?action=finalize-grading', { attempt_id: parseInt(attemptId) });
        if (res.success) {
            closePanel();
            loadList(container, subjectId);
        } else {
            finalBtn.disabled = false;
            finalBtn.innerHTML = 'Finalize &amp; Save';
            alert(res.message || 'Failed to finalize');
        }
    };
}

async function runAiGrade(overlay, answerId, maxPts) {
    const btn  = document.getElementById('aibtn_' + answerId);
    const hint = document.getElementById('ai-hint-' + answerId);
    const saveBtn = document.getElementById('sbtn_' + answerId);

    btn.disabled = true;
    btn.textContent = '⏳ Grading…';

    const res = await Api.post('/QuizAttemptsAPI.php?action=ai-grade-answer', {
        answer_id: parseInt(answerId)
    });

    if (res.success) {
        // Pre-fill the score and feedback inputs
        const ptsInput = document.getElementById('pts_' + answerId);
        const fbInput  = document.getElementById('fb_'  + answerId);
        if (ptsInput) ptsInput.value = res.score;
        if (fbInput)  fbInput.value  = res.feedback || '';

        // Replace the hint box with the purple AI result summary
        if (hint) {
            hint.style.background  = '#EDE9FE';
            hint.style.border      = 'none';
            hint.style.color       = '#5B21B6';
            hint.innerHTML = `${icon('robot', inl)} <strong>AI Score: ${res.score}/${maxPts} pts</strong>${res.feedback ? ` — <em>${esc(res.feedback)}</em>` : ''}<br><span style="opacity:.75">Review and adjust below if needed.</span>`;
        }

        // Update save button label to "Override / Confirm Grade"
        if (saveBtn) {
            saveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Override / Confirm Grade';
        }
    } else {
        btn.disabled = false;
        btn.innerHTML = `${icon('robot', inl)} Retry AI grade`;
        if (hint) {
            const msgEl = hint.querySelector('span');
            if (msgEl) msgEl.textContent = res.message || 'AI grading failed. Check Groq API key in Settings.';
            hint.style.background = '#FEE2E2';
            hint.style.border     = '1px dashed #FCA5A5';
            hint.style.color      = '#b91c1c';
        }
    }
}

async function saveAnswer(overlay, answerId, maxPts) {
    const btn = document.getElementById('sbtn_' + answerId);
    const pts = Math.max(0, Math.min(maxPts, parseFloat(document.getElementById('pts_' + answerId)?.value) || 0));
    const feedback = document.getElementById('fb_' + answerId)?.value || '';

    btn.disabled = true;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Saving...';

    const res = await Api.post('/QuizAttemptsAPI.php?action=grade-answer', {
        answer_id: parseInt(answerId),
        points_earned: pts,
        feedback
    });

    if (res.success) {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved!';
        btn.classList.add('saved');
        const block = document.getElementById('qb_' + answerId);
        if (block) block.classList.add('graded');

        // Check if all answers are graded → enable finalize
        const remaining = overlay.querySelectorAll('.save-btn:not(.saved)');
        const finalBtn = document.getElementById('panel-finalize');
        if (remaining.length === 0) {
            finalBtn.disabled = false;
            finalBtn.style.opacity = '1';
        }
    } else {
        btn.disabled = false;
        btn.innerHTML = 'Save Grade (retry)';
        alert(res.message || 'Failed to save grade');
    }
}

function formatType(t) {
    return { essay:'Essay', short_answer:'Short Answer', multiple_choice:'Multiple Choice', true_false:'True/False', fill_blank:'Fill in Blank' }[t] || t;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
