/**
 * Instructor Subjective Grading (SPA module)
 *
 * A grading WORKSPACE, not a list plus a dialog.
 *
 * It used to be: a centred list of pending submissions, click one, a modal
 * opened over the page, grade, Finalize, modal closes, you are back at the
 * list, hunt for the next student, repeat. Marking a class of forty meant
 * forty round trips through a list.
 *
 * Now the queue lives in a rail down the LEFT and the student's answers fill
 * the pane beside it, so both are on screen together. The instructor moves
 * with Next / Prev (or Finalize & Next, which saves and advances in one
 * click) straight down the queue - ordered from the FIRST student who
 * submitted to the last, which is also why QuizAttemptsAPI's pending-grading
 * query now sorts completed_at ASC instead of DESC.
 *
 * Deliberate choices worth knowing:
 *   - A finalized row STAYS in the rail with a tick rather than vanishing.
 *     Removing rows made "3 of 17" renumber underneath the person using it.
 *   - Navigating away with an unsaved score is blocked and asks first. With
 *     a modal, closing was deliberate; with Next it is one stray click.
 *   - The rail collapses to a drawer under 900px, where side-by-side cannot
 *     fit, and Next / Prev keep working one-handed.
 */
import { Api } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';
import { notify } from '../../utils/notify.js';

import { esc } from '../../utils/classroom-ui.js';
const inl = { size: 14, className: 'ui-icon-inline' };

/** The flat, chronological grading queue and where we are in it. */
let _queue = [];
let _index = -1;
let _subjectId = '';
let _container = null;
/** answer_id -> true while an edited score/feedback has not been saved. */
let _dirty = new Set();
let _keyHandler = null;

export async function render(container) {
    _container = container;
    const subjRes = await Api.get('/QuizzesAPI.php?action=instructor-subjects');
    const subjects = subjRes.success ? subjRes.data : [];

    container.innerHTML = `
        <style>
            .eg-wrap { display:flex; flex-direction:column; min-height:0; }
            .btn-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#555; text-decoration:none; margin-bottom:14px; }
            .btn-back:hover { color:#00461B; }
            .eg-header { background:#00461B; border-radius:16px; padding:20px 24px; color:#fff; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
            .eg-header h2 { font-size:20px; font-weight:700; margin:0; }
            .eg-header p { font-size:13px; opacity:.85; margin:4px 0 0; }
            .eg-filter { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
            .eg-filter select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; min-width:220px; cursor:pointer; }

            /* ── The workspace: rail + pane, side by side ─────────────── */
            .eg-work { display:grid; grid-template-columns:288px 1fr; gap:16px; align-items:start; }

            .eg-rail { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden;
                       position:sticky; top:16px; display:flex; flex-direction:column; max-height:calc(100dvh - 190px); }
            .eg-rail-head { padding:12px 14px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; justify-content:space-between; gap:8px; }
            .eg-rail-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
            .eg-rail-count { background:#00461B; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; }
            .eg-rail-list { overflow-y:auto; flex:1; overscroll-behavior:contain; }
            .eg-qrow { display:flex; gap:10px; align-items:flex-start; padding:11px 13px; border-bottom:1px solid #f5f5f5;
                       cursor:pointer; transition:background .12s; border-left:3px solid transparent; }
            .eg-qrow:hover { background:#f0fdf4; }
            .eg-qrow.active { background:#f0fdf4; border-left-color:#00461B; }
            .eg-qrow.done .eg-qrow-name { color:#9ca3af; }
            .eg-qrow-idx { font-size:10px; font-weight:700; color:#9ca3af; min-width:18px; padding-top:2px; }
            .eg-qrow-main { min-width:0; flex:1; }
            .eg-qrow-name { font-size:13px; font-weight:600; color:#111827; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .eg-qrow-sub { font-size:11px; color:#9ca3af; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .eg-qrow-tag { flex-shrink:0; font-size:10px; font-weight:700; padding:2px 6px; border-radius:5px; background:#FEF3C7; color:#92400E; }
            .eg-qrow-tag.ok { background:#DCFCE7; color:#166534; }
            .eg-qrow-flag { color:#b91c1c; flex-shrink:0; }

            .eg-pane { background:#fff; border:1px solid #e8e8e8; border-radius:14px; display:flex; flex-direction:column; min-height:520px; }
            .eg-pane-head { padding:16px 20px; border-bottom:1px solid #e8e8e8; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
            .eg-pane-head h3 { margin:0; font-size:16px; font-weight:700; color:#111827; }
            .eg-pane-head p { margin:3px 0 0; font-size:12.5px; color:#6b7280; }
            .eg-pane-body { flex:1; overflow-y:auto; padding:20px; }
            .eg-pane-foot { padding:12px 18px; border-top:1px solid #e8e8e8; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
            .eg-nav { display:flex; align-items:center; gap:8px; }
            .eg-pos { font-size:12.5px; color:#6b7280; font-weight:600; min-width:74px; text-align:center; }
            .eg-navbtn { padding:8px 13px; background:#fff; border:1px solid #ddd; border-radius:8px; font-size:13px; font-weight:600;
                         cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
            .eg-navbtn:hover:not(:disabled) { border-color:#00461B; color:#00461B; }
            .eg-navbtn:disabled { opacity:.4; cursor:not-allowed; }
            .eg-hint { font-size:11px; color:#9ca3af; }

            .empty-state { text-align:center; padding:56px 20px; color:#666; }
            .empty-state h3 { font-size:17px; font-weight:600; color:#333; margin:0 0 6px; }
            .empty-state p { font-size:13.5px; color:#666; margin:0; }

            .attempt-meta { display:flex; gap:20px; flex-wrap:wrap; background:#f8f9fa; border-radius:10px; padding:14px 16px; margin-bottom:18px; font-size:13px; color:#555; }
            .attempt-meta strong { display:block; font-size:15px; color:#222; font-weight:700; }

            .qblock { border:1px solid #e8e8e8; border-radius:10px; margin-bottom:14px; overflow:hidden; transition:border-color .2s; }
            .qblock.graded { border-color:#bbf7d0; }
            .qblock-head { background:#f8f9fa; padding:11px 15px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e8e8e8; }
            .qnum { font-size:11px; font-weight:700; color:#1B4D3E; text-transform:uppercase; }
            .qtype-badge { font-size:11px; padding:2px 8px; border-radius:4px; font-weight:600; }
            .qtype-badge.essay        { background:#EDE9FE; color:#7C3AED; }
            .qtype-badge.short_answer { background:#B45309; color:#fff; }
            .qtype-badge.multiple_choice,.qtype-badge.true_false,.qtype-badge.fill_blank { background:#00461B; color:#fff; }
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
            .save-btn.unsaved { background:#B45309; }
            .graded-badge { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; background:#00461B; color:#fff; border-radius:6px; font-size:12px; font-weight:600; }
            .mc-row { display:flex; gap:8px; align-items:center; font-size:13px; color:#555; margin-bottom:6px; }
            .icon-ok  { color:#1B4D3E; }
            .icon-bad { color:#b91c1c; }

            .btn-green  { padding:9px 18px; background:#1B4D3E; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:7px; }
            .btn-green:hover:not(:disabled) { background:#2D6A4F; }
            .btn-green:disabled { opacity:.5; cursor:not-allowed; }

            .spin { animation:spin 1s linear infinite; }
            @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

            .eg-drawer-btn { display:none; }

            /* Side-by-side needs roughly 900px. Below that the rail becomes a
               drawer over the pane, and Next/Prev carry the workflow. */
            @media (max-width:900px) {
                .eg-work { grid-template-columns:1fr; }
                .eg-rail { position:fixed; top:0; bottom:0; left:0; width:280px; max-height:none; z-index:900;
                           border-radius:0; transform:translateX(-100%); transition:transform .22s ease; }
                .eg-rail.open { transform:translateX(0); box-shadow:4px 0 28px rgba(0,0,0,.18); }
                .eg-drawer-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 13px; background:#fff;
                                 border:1px solid #ddd; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
                .eg-scrim { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:899; display:none; }
                .eg-scrim.open { display:block; }
                .eg-pane-foot { justify-content:stretch; }
                .eg-nav { flex:1; justify-content:space-between; }
            }
            @media (max-width:560px) {
                .eg-header { padding:16px; }
                .eg-pane-body { padding:14px; }
                .grade-row { flex-direction:column; }
                .pts-input { width:100%; }
            }
        </style>

        <div class="eg-wrap">
            <a href="#instructor/gradebook" class="btn-back">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                Back to Gradebook
            </a>
            <div class="eg-header">
                <div>
                    <h2>Subjective Grading</h2>
                    <p>Grade each submission in turn — oldest first. Use Next to move down the queue.</p>
                </div>
            </div>

            <div class="eg-filter">
                <select id="eg-subject-filter">
                    <option value="">All Subjects</option>
                    ${subjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                </select>
                <button class="eg-drawer-btn" id="eg-drawer-toggle">${icon('menu', inl)} Queue</button>
            </div>

            <div class="eg-work">
                <aside class="eg-rail" id="eg-rail">
                    <div class="eg-rail-head">
                        <span class="eg-rail-title">Submissions</span>
                        <span class="eg-rail-count" id="eg-rail-count">0</span>
                    </div>
                    <div class="eg-rail-list" id="eg-rail-list"></div>
                </aside>
                <section class="eg-pane" id="eg-pane">
                    <div class="eg-pane-body"><div class="empty-state">Loading…</div></div>
                </section>
            </div>
        </div>
        <div class="eg-scrim" id="eg-scrim"></div>
    `;

    container.querySelector('#eg-subject-filter').addEventListener('change', e => loadQueue(e.target.value));

    const rail = container.querySelector('#eg-rail');
    const scrim = container.querySelector('#eg-scrim');
    const closeDrawer = () => { rail.classList.remove('open'); scrim.classList.remove('open'); };
    container.querySelector('#eg-drawer-toggle').addEventListener('click', () => {
        rail.classList.toggle('open'); scrim.classList.toggle('open');
    });
    scrim.addEventListener('click', closeDrawer);

    bindKeys();
    await loadQueue('');
}

/** Alt+Arrow to move, Ctrl+Enter to finalize. Plain arrows would fight the score fields. */
function bindKeys() {
    if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
    _keyHandler = (e) => {
        if (!_container?.isConnected) return;
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goTo(_index + 1); }
        if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goTo(_index - 1); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('eg-finalize')?.click();
        }
    };
    document.addEventListener('keydown', _keyHandler);
}

async function loadQueue(subjectId) {
    _subjectId = subjectId;
    _dirty.clear();
    const listEl = document.getElementById('eg-rail-list');
    const pane = document.getElementById('eg-pane');
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12.5px;">Loading…</div>`;

    const url = '/QuizAttemptsAPI.php?action=pending-grading' + (subjectId ? '&subject_id=' + subjectId : '');
    const res = await Api.get(url, { ttl: 0 });
    const attempts = res.success ? (res.data || []) : [];

    // Flat and chronological: the queue is the order people submitted in, not
    // a per-student grouping. The API already sorts completed_at ASC.
    _queue = attempts.map(a => ({ ...a, finalized: false }));

    document.getElementById('eg-rail-count').textContent = _queue.length;

    if (!_queue.length) {
        listEl.innerHTML = `<div style="padding:22px 14px;text-align:center;color:#9ca3af;font-size:12.5px;">Nothing to grade</div>`;
        pane.innerHTML = `<div class="eg-pane-body"><div class="empty-state">
            <div style="margin-bottom:10px;">${iconLg('quiz')}</div>
            <h3>No Subjective Submissions</h3>
            <p>No students have submitted quizzes with essay or short answer questions yet.</p>
        </div></div>`;
        _index = -1;
        return;
    }

    renderRail();
    await goTo(0, true);
}

function renderRail() {
    const listEl = document.getElementById('eg-rail-list');
    if (!listEl) return;
    listEl.innerHTML = _queue.map((a, i) => {
        const pending = parseInt(a.pending_count || 0);
        const flags = parseInt(a.tab_switch_count || 0);
        const when = a.completed_at ? new Date(a.completed_at.replace(' ', 'T')) : null;
        const whenTxt = when && !isNaN(when) ? when.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return `
        <div class="eg-qrow${i === _index ? ' active' : ''}${a.finalized ? ' done' : ''}" data-i="${i}">
            <span class="eg-qrow-idx">${i + 1}</span>
            <div class="eg-qrow-main">
                <div class="eg-qrow-name">${esc(a.last_name || '')}, ${esc(a.first_name || '')}</div>
                <div class="eg-qrow-sub">${esc(a.subject_code)} · ${esc(a.quiz_title)}</div>
                <div class="eg-qrow-sub">${esc(whenTxt)}</div>
            </div>
            ${flags > 0 ? `<span class="eg-qrow-flag" title="${flags} tab switch(es)">${icon('siren', { size: 13 })}</span>` : ''}
            <span class="eg-qrow-tag${a.finalized || pending === 0 ? ' ok' : ''}">${a.finalized ? '✓' : (pending || '✓')}</span>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.eg-qrow').forEach(row => {
        row.addEventListener('click', () => goTo(parseInt(row.dataset.i)));
    });
}

/** True when it is safe to leave the current submission. */
async function confirmLeave() {
    if (!_dirty.size) return true;
    return notify.confirm(
        `${_dirty.size} grade${_dirty.size > 1 ? 's' : ''} on this submission ${_dirty.size > 1 ? 'have' : 'has'} not been saved. Leave anyway?`,
        { confirmText: 'Leave' }
    );
}

async function goTo(i, skipGuard = false) {
    if (i < 0 || i >= _queue.length || i === _index) return;
    if (!skipGuard && !(await confirmLeave())) return;

    _dirty.clear();
    _index = i;
    renderRail();
    document.getElementById('eg-rail')?.classList.remove('open');
    document.getElementById('eg-scrim')?.classList.remove('open');
    await openAt(i);

    // Keep the active row in view when moving by keyboard.
    document.querySelector('.eg-qrow.active')?.scrollIntoView({ block: 'nearest' });
}

async function openAt(i) {
    const entry = _queue[i];
    const pane = document.getElementById('eg-pane');
    pane.innerHTML = `<div class="eg-pane-body"><div class="empty-state">Loading submission…</div></div>`;

    const res = await Api.get('/QuizAttemptsAPI.php?action=attempt-answers&attempt_id=' + entry.attempt_id, { ttl: 0 });
    if (!res.success) {
        pane.innerHTML = `<div class="eg-pane-body"><div class="empty-state" style="color:#b91c1c;">${esc(res.message || 'Failed to load')}</div></div>`;
        return;
    }

    const { attempt, answers } = res.data;
    const switches = parseInt(attempt.tab_switch_count || entry.tab_switch_count || 0);

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

    let body = `${integrityHtml}<div class="attempt-meta">
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

        body += `<div class="qblock${isGraded ? ' graded' : ''}" id="qb_${a.answer_id}">
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
            body += `<div class="student-ans${!studentText ? ' empty' : ''}">${studentText ? esc(studentText) : '(No answer provided)'}</div>`;
            if (isPending || isAiGraded) {
                const currentPts = isAiGraded ? (parseFloat(a.points_earned) || 0) : 0;
                const currentFb  = isAiGraded ? (a.grader_feedback || '') : '';
                body += `
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
                        <input type="number" class="pts-input" id="pts_${a.answer_id}" data-answer="${a.answer_id}" min="0" max="${a.max_points}" step="0.5" value="${currentPts}">
                        <div class="pts-max">/ ${a.max_points}</div>
                    </div>
                    <div class="fb-wrap">
                        <span class="pts-label">Feedback (optional)</span>
                        <textarea class="fb-input" id="fb_${a.answer_id}" data-answer="${a.answer_id}" placeholder="Add feedback...">${esc(currentFb)}</textarea>
                    </div>
                </div>
                <button class="save-btn" id="sbtn_${a.answer_id}" data-answer="${a.answer_id}" data-max="${a.max_points}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                    ${isAiGraded ? 'Override / Confirm Grade' : 'Save Grade'}
                </button>`;
            } else {
                body += `<div class="graded-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Graded: ${a.points_earned}/${a.max_points} pts
                    ${a.grader_feedback ? `&nbsp;&mdash; <em style="font-weight:400;">${esc(a.grader_feedback)}</em>` : ''}
                </div>`;
            }
        } else {
            const correct = a.is_correct == 1;
            body += `<div class="mc-row">
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

        body += '</div></div>';
    });

    const last = _index >= _queue.length - 1;
    pane.innerHTML = `
        <div class="eg-pane-head">
            <div>
                <h3>${esc(attempt.first_name)} ${esc(attempt.last_name)}${attempt.student_id ? ` <span style="font-weight:500;color:#9ca3af;">(${esc(attempt.student_id)})</span>` : ''}</h3>
                <p>${esc(attempt.quiz_title)} — ${esc(attempt.subject_code)}</p>
            </div>
        </div>
        <div class="eg-pane-body" id="eg-pane-body">${body}</div>
        <div class="eg-pane-foot">
            <div class="eg-nav">
                <button class="eg-navbtn" id="eg-prev" ${_index <= 0 ? 'disabled' : ''}>← Prev</button>
                <span class="eg-pos">${_index + 1} of ${_queue.length}</span>
                <button class="eg-navbtn" id="eg-next" ${last ? 'disabled' : ''}>Next →</button>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span class="eg-hint">Alt+← / Alt+→ · Ctrl+Enter</span>
                <button class="btn-green" id="eg-finalize">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    ${last ? 'Finalize' : 'Finalize &amp; Next'}
                </button>
            </div>
        </div>`;

    pane.querySelectorAll('.ai-grade-btn').forEach(btn => {
        btn.addEventListener('click', () => runAiGrade(btn.dataset.answer, parseFloat(btn.dataset.max)));
    });
    pane.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveAnswer(btn.dataset.answer, parseFloat(btn.dataset.max)));
    });
    // Track edits so Next can warn instead of losing them silently.
    pane.querySelectorAll('.pts-input, .fb-input').forEach(el => {
        el.addEventListener('input', () => {
            _dirty.add(el.dataset.answer);
            const sb = document.getElementById('sbtn_' + el.dataset.answer);
            if (sb) { sb.classList.remove('saved'); sb.classList.add('unsaved'); }
        });
    });

    document.getElementById('eg-prev').addEventListener('click', () => goTo(_index - 1));
    document.getElementById('eg-next').addEventListener('click', () => goTo(_index + 1));
    document.getElementById('eg-finalize').addEventListener('click', finalizeAndNext);
}

/**
 * Save anything still edited, finalize the attempt, then move on.
 *
 * The old panel disabled Finalize until every answer had been saved by hand,
 * which with a Next button would just be a dead button the person cannot
 * explain. Saving first is the same end state with one less thing to get
 * wrong.
 */
async function finalizeAndNext() {
    const btn = document.getElementById('eg-finalize');
    const entry = _queue[_index];
    if (!entry) return;

    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Saving…';

    for (const answerId of [...document.querySelectorAll('.save-btn:not(.saved)')].map(b => b.dataset.answer)) {
        const maxEl = document.getElementById('sbtn_' + answerId);
        await saveAnswer(answerId, parseFloat(maxEl?.dataset.max || 0), true);
    }

    const res = await Api.post('/QuizAttemptsAPI.php?action=finalize-grading', { attempt_id: parseInt(entry.attempt_id) });
    btn.disabled = false;
    btn.innerHTML = orig;

    if (!res.success) {
        notify.error(res.message || 'Failed to finalize');
        return;
    }

    // Keep the row, mark it done - see the note at the top about not letting
    // the queue renumber under the person using it.
    entry.finalized = true;
    entry.pending_count = 0;
    _dirty.clear();
    renderRail();

    if (_index < _queue.length - 1) {
        await goTo(_index + 1, true);
    } else {
        notify.success?.('All submissions graded.');
        await openAt(_index);
    }
}

async function runAiGrade(answerId, maxPts) {
    const btn  = document.getElementById('aibtn_' + answerId);
    const hint = document.getElementById('ai-hint-' + answerId);
    const saveBtn = document.getElementById('sbtn_' + answerId);

    btn.disabled = true;
    btn.textContent = 'Grading…';

    const res = await Api.post('/QuizAttemptsAPI.php?action=ai-grade-answer', { answer_id: parseInt(answerId) });

    if (res.success) {
        const ptsInput = document.getElementById('pts_' + answerId);
        const fbInput  = document.getElementById('fb_'  + answerId);
        if (ptsInput) ptsInput.value = res.score;
        if (fbInput)  fbInput.value  = res.feedback || '';
        _dirty.add(String(answerId));

        if (hint) {
            hint.style.background  = '#EDE9FE';
            hint.style.border      = 'none';
            hint.style.color       = '#5B21B6';
            hint.innerHTML = `${icon('robot', inl)} <strong>AI Score: ${res.score}/${maxPts} pts</strong>${res.feedback ? ` — <em>${esc(res.feedback)}</em>` : ''}<br><span style="opacity:.75">Review and adjust below if needed.</span>`;
        }
        if (saveBtn) {
            saveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Override / Confirm Grade';
        }
    } else {
        btn.disabled = false;
        btn.innerHTML = `${icon('robot', inl)} Retry AI grade`;
        if (hint) {
            const msgEl = hint.querySelector('span');
            if (msgEl) msgEl.textContent = res.message || 'AI grading failed. Check Hugging Face API key in Settings.';
            hint.style.background = '#FEE2E2';
            hint.style.border     = '1px dashed #FCA5A5';
            hint.style.color      = '#b91c1c';
        }
    }
}

async function saveAnswer(answerId, maxPts, quiet = false) {
    const btn = document.getElementById('sbtn_' + answerId);
    if (!btn) return;
    const pts = Math.max(0, Math.min(maxPts, parseFloat(document.getElementById('pts_' + answerId)?.value) || 0));
    const feedback = document.getElementById('fb_' + answerId)?.value || '';

    btn.disabled = true;
    if (!quiet) {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Saving...';
    }

    const res = await Api.post('/QuizAttemptsAPI.php?action=grade-answer', {
        answer_id: parseInt(answerId),
        points_earned: pts,
        feedback
    });

    if (res.success) {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved!';
        btn.classList.remove('unsaved');
        btn.classList.add('saved');
        _dirty.delete(String(answerId));
        document.getElementById('qb_' + answerId)?.classList.add('graded');
    } else {
        btn.disabled = false;
        btn.innerHTML = 'Save Grade (retry)';
        if (!quiet) notify.error(res.message || 'Failed to save grade');
    }
}

function formatType(t) {
    return { essay:'Essay', short_answer:'Short Answer', multiple_choice:'Multiple Choice', true_false:'True/False', fill_blank:'Fill in Blank' }[t] || t;
}
