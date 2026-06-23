/**
 * Student quiz review modal — see where you went wrong
 */
import { Api } from '../api.js';
import { icon } from '../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

const MODAL_STYLES = `
    .sqr-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2600; padding:20px; animation:sqrFadeIn .2s ease;
        overflow:hidden; overscroll-behavior:contain; }
    @keyframes sqrFadeIn { from { opacity:0; } to { opacity:1; } }
    .sqr-modal { background:#fff; border-radius:18px; width:100%; max-width:640px; max-height:min(92vh, 900px); height:min(92vh, 900px);
        overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.18);
        animation:sqrSlideUp .25s ease; }
    @keyframes sqrSlideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    .sqr-hdr { padding:22px 24px; background:#00461B; color:#fff; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-shrink:0; }
    .sqr-hdr h3 { font-size:18px; font-weight:800; margin:0 0 4px; }
    .sqr-hdr p { font-size:12px; margin:0; opacity:.85; }
    .sqr-close { background:rgba(255,255,255,.15); border:none; color:#fff; width:32px; height:32px;
        border-radius:8px; font-size:20px; cursor:pointer; flex-shrink:0; line-height:1; }
    .sqr-close:hover { background:rgba(255,255,255,.25); }
    .sqr-summary { display:flex; flex-wrap:wrap; gap:10px; padding:14px 24px; background:#F8FDF9; border-bottom:1px solid #E8EAED; flex-shrink:0; }
    .sqr-pill { font-size:12px; font-weight:700; padding:6px 12px; border-radius:20px; background:#fff; border:1px solid #E2E8F0; color:#374151; }
    .sqr-pill strong { color:#00461B; }
    .sqr-pill.warn { background:#FEF3C7; border-color:#FDE68A; color:#92400E; }
    .sqr-pill.bad { background:#FEE2E2; border-color:#FECACA; color:#B91C1C; }
    .sqr-tabs { display:flex; gap:8px; padding:12px 24px 0; border-bottom:1px solid #f0f0f0; flex-shrink:0; }
    .sqr-tab { border:none; background:none; padding:10px 4px; font-size:13px; font-weight:700; color:#6B7280;
        cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; font-family:inherit; }
    .sqr-tab.active { color:#00461B; border-bottom-color:#00461B; }
    .sqr-content { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    .sqr-review-host { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    .sqr-body { padding:16px 24px 20px; overflow-y:auto; overflow-x:hidden; flex:1; min-height:0;
        -webkit-overflow-scrolling:touch; overscroll-behavior:contain; touch-action:pan-y; }
    .sqr-empty { text-align:center; padding:32px 16px; color:#6B7280; font-size:14px; }
    .sqr-card { border:1px solid #E5E7EB; border-radius:12px; padding:14px 16px; margin-bottom:12px; background:#fff; }
    .sqr-card.wrong { border-color:#FECACA; background:#FFFBFB; }
    .sqr-card.pending { border-color:#FDE68A; background:#FFFBEB; }
    .sqr-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px; }
    .sqr-qnum { font-size:11px; font-weight:700; color:#6B7280; text-transform:uppercase; }
    .sqr-badge { font-size:10px; font-weight:800; padding:3px 8px; border-radius:20px; text-transform:uppercase; }
    .sqr-badge.ok { background:#DCFCE7; color:#15803D; }
    .sqr-badge.no { background:#FEE2E2; color:#B91C1C; }
    .sqr-badge.wait { background:#FEF3C7; color:#B45309; }
    .sqr-qtext { font-size:14px; font-weight:600; color:#111827; margin-bottom:10px; line-height:1.45; }
    .sqr-row { margin-bottom:8px; font-size:13px; }
    .sqr-row:last-child { margin-bottom:0; }
    .sqr-lbl { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.4px;
        color:#6B7280; margin-bottom:4px; }
    .sqr-val { padding:8px 10px; border-radius:8px; background:#F9FAFB; border:1px solid #E5E7EB; color:#111827; line-height:1.45; }
    .sqr-val.yours-wrong { background:#DC2626; border-color:#DC2626; color:#fff; }
    .sqr-val.correct { background:#16A34A; border-color:#16A34A; color:#fff; }
    .sqr-opt { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px;
        border-radius:8px; font-size:12px; margin-bottom:4px; border:1px solid #E5E7EB; background:#FAFAFA; }
    .sqr-opt.sel-wrong { background:#DC2626; border-color:#DC2626; color:#fff; }
    .sqr-opt.sel-right { background:#16A34A; border-color:#16A34A; color:#fff; }
    .sqr-opt.is-correct { background:#16A34A; border-color:#16A34A; color:#fff; }
    .sqr-feedback { font-size:12px; color:#374151; font-style:italic; margin-top:6px; padding:8px 10px;
        background:#F3F4F6; border-radius:8px; border-left:3px solid #00461B; }
    .sqr-ft { padding:14px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:10px; background:#fafafa; flex-shrink:0; }
    .sqr-btn { padding:10px 18px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; border:none; }
    .sqr-btn-ghost { background:#fff; color:#374151; border:1px solid #e5e7eb; }
    .sqr-btn-primary { background:#00461B; color:#fff; }
    .sqr-btn-primary:hover { background:#006428; }
    .sqr-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
        padding:48px 24px; color:#6B7280; font-size:13px; }
    .sqr-spin { width:32px; height:32px; border:3px solid #eee; border-top-color:#00461B; border-radius:50%;
        animation:sqrSpin .75s linear infinite; }
    @keyframes sqrSpin { to { transform:rotate(360deg); } }
    @media (max-width:640px) {
        .sqr-overlay { padding:12px; align-items:flex-end; }
        .sqr-modal { max-height:94vh; height:94vh; border-radius:18px 18px 0 0; }
    }
`;

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function injectStyles() {
    const id = 'sqr-modal-styles-v3';
    if (document.getElementById(id)) return;
    document.getElementById('sqr-modal-styles')?.remove();
    const s = document.createElement('style');
    s.id = id;
    s.textContent = MODAL_STYLES;
    document.head.appendChild(s);
}

function renderMcOptions(a, showAnswers) {
    const opts = a.options || [];
    if (!opts.length) {
        const yours = a.selected_option_text || '(no answer)';
        return `<div class="sqr-row"><span class="sqr-lbl">Your answer</span>
            <div class="sqr-val ${a.is_wrong ? 'yours-wrong' : ''}">${esc(yours)}</div></div>`;
    }
    return opts.map(o => {
        const isSel = String(o.option_id) === String(a.selected_option_id);
        const isCor = o.is_correct == 1;
        let cls = 'sqr-opt';
        if (isSel && isCor) cls += ' sel-right';
        else if (isSel) cls += ' sel-wrong';
        else if (isCor) cls += ' is-correct';
        const tag = isSel ? (isCor ? 'Your answer ✓' : 'Your answer ✗') : (isCor ? 'Correct answer' : '');
        return `<div class="${cls}"><span>${esc(o.option_text)}</span>${tag ? `<strong>${tag}</strong>` : ''}</div>`;
    }).join('');
}

function renderTextAnswer(a, showAnswers) {
    const yours = a.your_answer_text || a.answer_text || '(no answer)';
    let html = `<div class="sqr-row"><span class="sqr-lbl">Your answer</span>
        <div class="sqr-val ${a.is_wrong ? 'yours-wrong' : ''}">${esc(yours)}</div></div>`;
    if (a.correct_answer_text) {
        html += `<div class="sqr-row"><span class="sqr-lbl">Correct answer</span>
            <div class="sqr-val correct">${esc(a.correct_answer_text)}</div></div>`;
    }
    return html;
}

function answerCard(a, idx, showAnswers) {
    const qType = (a.question_type || '').toLowerCase();
    const isMc = ['multiple_choice', 'true_false'].includes(qType);
    const pending = a.is_pending;
    const wrong = a.is_wrong;
    const cardCls = pending ? 'pending' : (wrong ? 'wrong' : '');
    const badge = pending
        ? '<span class="sqr-badge wait">Pending review</span>'
        : wrong
            ? '<span class="sqr-badge no">Needs improvement</span>'
            : '<span class="sqr-badge ok">Correct</span>';

    let body = isMc ? renderMcOptions(a, showAnswers) : renderTextAnswer(a, showAnswers);
    if (a.grader_feedback) {
        body += `<div class="sqr-feedback">${icon('info', inl)} ${esc(a.grader_feedback)}</div>`;
    }

    return `
        <article class="sqr-card ${cardCls}">
            <div class="sqr-card-head">
                <span class="sqr-qnum">Question ${idx + 1}</span>
                ${badge}
            </div>
            <div class="sqr-qtext">${esc(a.question_text)}</div>
            ${body}
            <div class="sqr-row" style="margin-top:8px;font-size:11px;color:#6B7280">
                Points: <strong>${a.points_earned ?? 0} / ${a.max_points ?? 0}</strong>
            </div>
        </article>`;
}

function fmtAttemptDate(str) {
    if (!str) return null;
    const d = new Date(str);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(secs) {
    if (!secs || isNaN(secs)) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function renderReviewContent(data, tab = 'wrong') {
    const { attempt, answers, wrong_answers, pending_answers, show_answers } = data;
    const wrong = wrong_answers || [];
    const pending = pending_answers || [];
    const all = answers || [];

    let list = all;
    let emptyMsg = 'No answers recorded for this attempt.';
    if (tab === 'wrong') {
        list = wrong;
        emptyMsg = pending.length
            ? 'No scored mistakes yet — some answers are still pending instructor review.'
            : 'Great work! You got every scored question correct.';
    } else if (tab === 'pending') {
        list = pending;
        emptyMsg = 'No answers waiting for review.';
    }

    const pct = parseFloat(attempt.percentage || 0).toFixed(1);
    const submittedAt = fmtAttemptDate(attempt.submitted_at || attempt.created_at);
    const duration = fmtDuration(attempt.time_spent);

    return `
        <div class="sqr-content">
        <div class="sqr-summary">
            <span class="sqr-pill"><strong>${attempt.earned_points}/${attempt.total_points}</strong> points</span>
            <span class="sqr-pill"><strong>${pct}%</strong> score</span>
            <span class="sqr-pill ${wrong.length ? 'bad' : ''}"><strong>${wrong.length}</strong> to review</span>
            ${pending.length ? `<span class="sqr-pill warn"><strong>${pending.length}</strong> pending</span>` : ''}
            ${submittedAt ? `<span class="sqr-pill">${submittedAt}</span>` : ''}
            ${duration ? `<span class="sqr-pill"><strong>${duration}</strong> spent</span>` : ''}
        </div>
        <div class="sqr-tabs" role="tablist">
            <button type="button" class="sqr-tab ${tab === 'wrong' ? 'active' : ''}" data-sqr-tab="wrong">Where I went wrong (${wrong.length})</button>
            ${pending.length ? `<button type="button" class="sqr-tab ${tab === 'pending' ? 'active' : ''}" data-sqr-tab="pending">Pending (${pending.length})</button>` : ''}
            <button type="button" class="sqr-tab ${tab === 'all' ? 'active' : ''}" data-sqr-tab="all">All (${all.length})</button>
        </div>
        <div class="sqr-body" id="sqr-body">
            ${list.length
                ? list.map((a) => answerCard(a, Math.max(0, all.indexOf(a)), show_answers)).join('')
                : `<div class="sqr-empty">${emptyMsg}</div>`}
            ${!show_answers && list.length ? `<p style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:8px">Instructor has hidden correct answers for this quiz.</p>` : ''}
        </div>
        </div>
    `;
}

/**
 * Open modal showing where the student went wrong on a quiz attempt.
 * @param {number|string} attemptId
 */
export async function openStudentQuizReviewModal(attemptId) {
    if (!attemptId) return;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'sqr-overlay';
    overlay.innerHTML = `
        <div class="sqr-modal" role="dialog" aria-modal="true" aria-labelledby="sqr-title">
            <div class="sqr-hdr">
                <div>
                    <h3 id="sqr-title">Where you went wrong</h3>
                    <p>Loading your submission…</p>
                </div>
                <button type="button" class="sqr-close" aria-label="Close">&times;</button>
            </div>
            <div class="sqr-loading"><div class="sqr-spin"></div><span>Loading review…</span></div>
            <div class="sqr-ft" hidden>
                <button type="button" class="sqr-btn sqr-btn-ghost sqr-close-ft">Close</button>
                <a class="sqr-btn sqr-btn-primary sqr-full-link" href="#" hidden>Full result page</a>
            </div>
        </div>
    `;

    const close = () => {
        document.body.style.overflow = '';
        overlay.remove();
    };
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.sqr-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);

    const res = await Api.get(`/ProgressAPI.php?action=quiz-result&attempt_id=${attemptId}`);
    if (!res.success) {
        overlay.querySelector('.sqr-loading').innerHTML = `<p style="color:#B91C1C">${esc(res.message || 'Could not load review')}</p>`;
        return;
    }

    const data = res.data;
    const attempt = data.attempt;
    let activeTab = 'wrong';

    const paint = () => {
        const loading = overlay.querySelector('.sqr-loading');
        const ft = overlay.querySelector('.sqr-ft');
        if (loading) loading.remove();

        let host = overlay.querySelector('#sqr-review-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'sqr-review-host';
            host.className = 'sqr-review-host';
            overlay.querySelector('.sqr-modal').insertBefore(host, ft);
        }
        host.innerHTML = renderReviewContent(data, activeTab);

        overlay.querySelector('.sqr-hdr p').textContent =
            `${attempt.quiz_title || 'Quiz'} · ${attempt.subject_code || ''}`;

        const fullLink = overlay.querySelector('.sqr-full-link');
        if (fullLink) {
            fullLink.href = `#student/quiz-result?attempt_id=${attemptId}`;
            fullLink.hidden = false;
        }
        ft.hidden = false;

        host.querySelectorAll('[data-sqr-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.sqrTab;
                paint();
            });
        });
    };

    overlay.querySelector('.sqr-close-ft')?.addEventListener('click', close);
    paint();
}

/** Bind click handlers for elements with data-quiz-review="attemptId" — navigates to quiz result page */
export function bindQuizReviewTriggers(root = document) {
    root.querySelectorAll('[data-quiz-review]').forEach(el => {
        if (el.dataset.sqrBound) return;
        el.dataset.sqrBound = '1';
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.hash = `#student/quiz-result?attempt_id=${el.dataset.quizReview}`;
        });
    });
}
