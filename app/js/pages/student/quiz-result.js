/**
 * Student Quiz Result Page — full review with tabs, deep colors, attempt date/time
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { subjectHash } from './quizzes.js';
import { armScreenshotGuard, disarmScreenshotGuard } from '../../utils/screenshot-guard.js';

import { esc } from '../../utils/classroom-ui.js';
const inl = { size: 14, className: 'ui-icon-inline' };

// esc() imported from classroom-ui.js (see import above)


function fmtDate(str) {
    if (!str) return null;
    const d = new Date(str);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(secs) {
    if (!secs) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const attemptId = params.get('attempt_id');

    if (!attemptId) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">No attempt selected. <a href="#student/my-subjects" style="color:#00461B">Go to My Subjects</a></div>';
        return;
    }

    container.innerHTML = `<style>${css()}</style><div class="qr-loading"><div class="qr-spin"></div></div>`;

    const res = await Api.get('/ProgressAPI.php?action=quiz-result&attempt_id=' + attemptId);
    if (!res.success) {
        container.innerHTML = `<style>${css()}</style><div style="text-align:center;padding:60px;color:#b91c1c">${esc(res.message || 'Failed to load result')}</div>`;
        return;
    }

    const data       = res.data;
    const attempt    = data.attempt;
    const answers    = data.answers || [];
    const showAns    = !!data.show_answers;
    const lessonsId  = data.lessons_id || null;
    const pct        = parseFloat(attempt.percentage || 0);
    const passed     = attempt.passed == 1;
    const duration   = fmtDuration(parseInt(attempt.time_spent || 0));
    const dateStr    = fmtDate(attempt.submitted_at || attempt.created_at);

    // Let's Practice/Reflection/Wrap Up Quiz are Global Gradebook components —
    // show the same raw score the gradebook records (0-3 rubric, or a %)
    // instead of this attempt's own points/percentage, so this page always
    // matches what the instructor's gradebook shows (which can differ from
    // one attempt once an instructor overrides it).
    const rubricComponents = ['lets_practice', 'lets_practice_optional', 'reflection'];
    const gbComponent = data.gradebook_component;
    const rawGbScore  = data.raw_gradebook_score;
    const isRubric     = rubricComponents.includes(gbComponent);
    const isWrapUp      = gbComponent === 'wrap_up_quiz';
    const ringPct = isRubric && rawGbScore != null ? (rawGbScore / 3 * 100)
        : (isWrapUp && rawGbScore != null ? rawGbScore : pct);
    const ringLabel = isRubric && rawGbScore != null ? `${rawGbScore}<span class="qr-ring-sym">/3</span>`
        : `${ringPct.toFixed(isRubric || isWrapUp ? 0 : 1)}<span class="qr-ring-sym">%</span>`;
    const gbStatVal = isRubric
        ? `${rawGbScore ?? '—'}<span class="qr-stat-denom">/3</span>`
        : `${rawGbScore != null ? Math.round(rawGbScore) : '—'}<span class="qr-stat-denom">%</span>`;

    const wrongAnswers   = answers.filter(a => a.is_wrong);
    const pendingAnswers = answers.filter(a => a.is_pending);
    const hasPending     = pendingAnswers.length > 0;

    container.innerHTML = `
        <style>${css()}</style>
        <div class="qr-wrap">

            <!-- Hero -->
            <div class="qr-hero ${passed ? 'pass' : 'fail'}">
                <div class="qr-ring">
                    <svg class="qr-ring-svg" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="10"/>
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="10"
                            stroke-dasharray="${(ringPct / 100 * 314).toFixed(1)} 314"
                            stroke-linecap="round" transform="rotate(-90 60 60)"/>
                    </svg>
                    <div class="qr-ring-pct">${ringLabel}</div>
                </div>
                <div class="qr-hero-info">
                    <div class="qr-verdict">${passed ? 'Congratulations! 🎉' : 'Keep it up!'}</div>
                    <div class="qr-quiz-name">${esc(attempt.quiz_title)}</div>
                    <div class="qr-subject-code">${esc(attempt.subject_code || '')}</div>
                    ${dateStr ? `<div class="qr-datetime">${icon('calendar', inl)} Submitted ${dateStr}</div>` : ''}
                </div>
            </div>

            <!-- Stats strip -->
            <div class="qr-stats">
                ${(isRubric || isWrapUp) ? `
                <div class="qr-stat">
                    <div class="qr-stat-val">${gbStatVal}</div>
                    <div class="qr-stat-lbl">Gradebook Score</div>
                </div>` : `
                <div class="qr-stat">
                    <div class="qr-stat-val">${attempt.earned_points}<span class="qr-stat-denom">/${attempt.total_points}</span></div>
                    <div class="qr-stat-lbl">Points</div>
                </div>
                <div class="qr-stat">
                    <div class="qr-stat-val">${pct.toFixed(1)}<span class="qr-stat-denom">%</span></div>
                    <div class="qr-stat-lbl">Score</div>
                </div>`}
                <div class="qr-stat ${wrongAnswers.length > 0 ? 'qr-stat--bad' : wrongAnswers.length === 0 && answers.length > 0 ? 'qr-stat--good' : ''}">
                    <div class="qr-stat-val">${wrongAnswers.length}</div>
                    <div class="qr-stat-lbl">Wrong</div>
                </div>
                <div class="qr-stat">
                    <div class="qr-stat-val">${attempt.passing_rate}<span class="qr-stat-denom">%</span></div>
                    <div class="qr-stat-lbl">Passing Rate</div>
                </div>
                ${duration ? `<div class="qr-stat">
                    <div class="qr-stat-val">${duration}</div>
                    <div class="qr-stat-lbl">Time Taken</div>
                </div>` : ''}
            </div>

            <!-- Action buttons -->
            <div class="qr-actions">
                ${attempt.subject_id ? `<a class="qr-btn" href="${subjectHash(attempt.subject_id, 'classwork', { type: 'quiz', id: attempt.quiz_id })}">${icon('quiz', inl)} Back to Classwork</a>` : ''}
                ${passed && lessonsId ? `<a class="qr-btn qr-btn--primary" href="#student/lessons">${icon('checkCircle', inl)} Continue to Next Lesson</a>` : ''}
            </div>

            <!-- Review -->
            ${answers.length ? `
            <div class="qr-review">
                <div class="qr-review-hdr">
                    <div class="qr-tabs" role="tablist">
                        <button class="qr-tab ${wrongAnswers.length > 0 ? 'active' : ''}" data-tab="wrong">
                            Where I Went Wrong
                            <span class="qr-tab-ct">${wrongAnswers.length}</span>
                        </button>
                        ${hasPending ? `<button class="qr-tab" data-tab="pending">
                            Pending Review
                            <span class="qr-tab-ct">${pendingAnswers.length}</span>
                        </button>` : ''}
                        <button class="qr-tab ${wrongAnswers.length === 0 ? 'active' : ''}" data-tab="all">
                            All Questions
                            <span class="qr-tab-ct">${answers.length}</span>
                        </button>
                    </div>
                </div>
                <div class="qr-cards-wrap" id="qr-cards-wrap">
                    ${answers.map((a, i) => renderAnswerCard(a, i, showAns)).join('')}
                    <div class="qr-empty-filter" id="qr-empty-filter" style="display:none">
                        No answers in this category.
                    </div>
                </div>
                ${!showAns ? `<p class="qr-hidden-note">${icon('info', inl)} Correct answers are hidden by instructor settings.</p>` : ''}
            </div>` : '<div class="qr-no-review">Answer review is not available for this quiz.</div>'}
        </div>
    `;

    const wrap = container.querySelector('.qr-wrap');
    if (wrap) {
        armScreenshotGuard(wrap);
        window.addEventListener('hashchange', disarmScreenshotGuard, { once: true });
    }

    // Initial filter: show only wrong by default (or all if no wrong answers)
    const allCards = [...container.querySelectorAll('.qr-card')];
    const emptyMsg = container.querySelector('#qr-empty-filter');

    function applyFilter(tab) {
        let visible = 0;
        allCards.forEach(card => {
            const t = card.dataset.cardType;
            const show = tab === 'all' || t === tab;
            card.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        if (emptyMsg) emptyMsg.style.display = visible === 0 ? '' : 'none';
    }

    // Set default tab
    const defaultTab = wrongAnswers.length > 0 ? 'wrong' : 'all';
    applyFilter(defaultTab);

    container.querySelectorAll('.qr-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.qr-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            applyFilter(btn.dataset.tab);
        });
    });
}

function renderAnswerCard(a, index, showAns) {
    const qType     = (a.question_type || '').toLowerCase();
    const isMc      = ['multiple_choice', 'true_false', 'dropdown'].includes(qType);
    const isChk     = qType === 'checkboxes';
    const pending   = a.is_pending;
    const wrong     = a.is_wrong;
    const cardType  = pending ? 'pending' : wrong ? 'wrong' : 'correct';

    const badge = pending
        ? `<span class="qr-badge qr-badge--pending">Pending · ${a.points_earned ?? 0}/${a.max_points ?? 0} pts</span>`
        : wrong
            ? `<span class="qr-badge qr-badge--wrong">Wrong · ${a.points_earned ?? 0}/${a.max_points ?? 0} pts</span>`
            : `<span class="qr-badge qr-badge--correct">Correct · ${a.points_earned ?? 0}/${a.max_points ?? 0} pts</span>`;

    const opts = a.options || [];
    let body = '';

    if ((isMc || isChk) && opts.length) {
        // Show option list with highlighting
        const selIds = isChk ? (a.answer_text || '').split(',').map(s => s.trim()).filter(Boolean) : [];
        body = `<div class="qr-opts">${opts.map(o => {
            const isSel = isChk ? selIds.includes(String(o.option_id)) : String(o.option_id) === String(a.selected_option_id);
            const isCor = o.is_correct == 1;
            let cls = 'neutral', tag = '';
            if (isSel && isCor)  { cls = 'sel-right'; tag = 'Your answer ✓'; }
            else if (isSel)      { cls = 'sel-wrong';  tag = 'Your answer ✗'; }
            else if (isCor)      { cls = 'is-correct'; tag = 'Correct answer'; }
            return `<div class="qr-opt ${cls}"><span>${esc(o.option_text)}</span>${tag ? `<strong class="qr-opt-tag">${tag}</strong>` : ''}</div>`;
        }).join('')}</div>`;
    } else {
        // Text answer fallback (essay, short answer, or MC with missing options)
        const yours = a.selected_option_text || a.your_answer_text || a.answer_text || '';
        body = `<div class="qr-ans-row"><div class="qr-ans-lbl">Your answer</div>
            <div class="qr-ans-val ${wrong ? 'bad' : yours ? '' : 'empty'}">${yours ? esc(yours) : '<em style="opacity:.6">No answer provided</em>'}</div></div>`;
        if (a.correct_answer_text) {
            body += `<div class="qr-ans-row"><div class="qr-ans-lbl">Correct answer</div>
                <div class="qr-ans-val good">${esc(a.correct_answer_text)}</div></div>`;
        }
    }

    if (a.grader_feedback) {
        body += `<div class="qr-feedback">${icon('info', inl)} ${esc(a.grader_feedback)}</div>`;
    }

    return `
        <div class="qr-card qr-card--${cardType}" data-card-type="${cardType}">
            <div class="qr-card-hd">
                <span class="qr-qnum">Question ${index + 1}</span>
                ${badge}
            </div>
            <div class="qr-qtext">${esc(a.question_text)}</div>
            ${body}
        </div>`;
}

function css() {
    return `
        .qr-loading { display:flex; justify-content:center; align-items:center; min-height:240px; }
        .qr-spin { width:36px; height:36px; border:3px solid #eee; border-top-color:#00461B; border-radius:50%; animation:qrSpin .75s linear infinite; }
        @keyframes qrSpin { to { transform:rotate(360deg); } }

        .qr-wrap { max-width:800px; margin:0 auto; padding:4px 0 32px; }

        /* ── Hero ── */
        .qr-hero { border-radius:18px; padding:32px 32px 28px; margin-bottom:20px; color:#fff;
            display:flex; align-items:center; gap:28px; flex-wrap:wrap; }
        .qr-hero.pass { background:linear-gradient(135deg,#00461B 0%,#006428 100%); }
        .qr-hero.fail { background:linear-gradient(135deg,#991B1B 0%,#B91C1C 100%); }
        .qr-ring { position:relative; width:110px; height:110px; flex-shrink:0; }
        .qr-ring-svg { width:110px; height:110px; }
        .qr-ring-pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
            font-size:26px; font-weight:900; color:#fff; }
        .qr-ring-sym { font-size:14px; font-weight:700; margin-left:1px; }
        .qr-hero-info { flex:1; min-width:200px; }
        .qr-verdict { font-size:22px; font-weight:900; margin-bottom:4px; }
        .qr-quiz-name { font-size:15px; font-weight:700; opacity:.9; margin-bottom:2px; }
        .qr-subject-code { font-size:13px; opacity:.7; margin-bottom:6px; }
        .qr-datetime { font-size:12px; opacity:.8; display:flex; align-items:center; gap:5px; }

        /* ── Stats ── */
        .qr-stats { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
        .qr-stat { flex:1; min-width:100px; background:#fff; border:1px solid #E5E7EB; border-radius:14px;
            padding:14px 16px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.05); }
        .qr-stat--bad { border-color:#DC2626; background:#FFF5F5; }
        .qr-stat--good { border-color:#16A34A; background:#F0FDF4; }
        .qr-stat-val { font-size:22px; font-weight:900; color:#111827; line-height:1; }
        .qr-stat--bad .qr-stat-val { color:#DC2626; }
        .qr-stat--good .qr-stat-val { color:#16A34A; }
        .qr-stat-denom { font-size:13px; font-weight:600; color:#9CA3AF; }
        .qr-stat-lbl { font-size:11px; color:#6B7280; margin-top:5px; text-transform:uppercase; letter-spacing:.4px; font-weight:600; }

        /* ── Actions ── */
        .qr-actions { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; }
        .qr-btn { display:inline-flex; align-items:center; gap:7px; padding:10px 18px; border-radius:10px;
            font-size:13px; font-weight:700; text-decoration:none; border:1.5px solid #E5E7EB;
            background:#fff; color:#374151; cursor:pointer; font-family:inherit; }
        .qr-btn:hover { background:#f5f5f5; }
        .qr-btn--primary { background:#00461B; color:#fff; border-color:#00461B; }
        .qr-btn--primary:hover { background:#006428; }

        /* ── Review ── */
        .qr-review { background:#fff; border:1px solid #E5E7EB; border-radius:16px; overflow:hidden;
            box-shadow:0 2px 8px rgba(0,0,0,.05); }
        .qr-review-hdr { border-bottom:1px solid #F0F0F0; }
        .qr-tabs { display:flex; gap:0; padding:0 20px; }
        .qr-tab { background:none; border:none; border-bottom:3px solid transparent; padding:14px 4px;
            margin-right:20px; font-size:13px; font-weight:700; color:#6B7280; cursor:pointer; font-family:inherit;
            display:flex; align-items:center; gap:7px; margin-bottom:-1px; }
        .qr-tab.active { color:#00461B; border-bottom-color:#00461B; }
        .qr-tab-ct { background:#F3F4F6; color:#374151; font-size:11px; font-weight:800;
            padding:2px 7px; border-radius:20px; }
        .qr-tab.active .qr-tab-ct { background:#00461B; color:#fff; }

        .qr-cards-wrap { padding:16px 20px 20px; display:flex; flex-direction:column; gap:12px; }

        /* ── Answer cards ── */
        .qr-card { border:1.5px solid #E5E7EB; border-radius:14px; padding:16px 18px; background:#fff; }
        .qr-card--wrong   { border-color:#DC2626; background:#FFFAFA; }
        .qr-card--pending { border-color:#D97706; background:#FFFBEB; }
        .qr-card--correct { border-color:#16A34A; background:#F0FDF4; }
        .qr-card-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; }
        .qr-qnum { font-size:11px; font-weight:800; color:#6B7280; text-transform:uppercase; letter-spacing:.5px; }
        .qr-qtext { font-size:14px; font-weight:600; color:#111827; margin-bottom:12px; line-height:1.5; }

        /* Badges */
        .qr-badge { display:inline-block; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:800;
            text-transform:uppercase; letter-spacing:.3px; }
        .qr-badge--wrong   { background:#DC2626; color:#fff; }
        .qr-badge--correct { background:#16A34A; color:#fff; }
        .qr-badge--pending { background:#D97706; color:#fff; }

        /* MC options */
        .qr-opts { display:flex; flex-direction:column; gap:6px; }
        .qr-opt { display:flex; align-items:center; justify-content:space-between; gap:10px;
            padding:9px 12px; border-radius:9px; font-size:13px; border:1.5px solid #E5E7EB; background:#FAFAFA; }
        .qr-opt.sel-wrong  { background:#DC2626; border-color:#DC2626; color:#fff; }
        .qr-opt.sel-right  { background:#16A34A; border-color:#16A34A; color:#fff; }
        .qr-opt.is-correct { background:#16A34A; border-color:#16A34A; color:#fff; }
        .qr-opt.neutral    { background:#FAFAFA; }
        .qr-opt-tag { font-size:11px; font-weight:800; white-space:nowrap; flex-shrink:0; }
        .qr-opt.sel-wrong .qr-opt-tag,
        .qr-opt.sel-right .qr-opt-tag,
        .qr-opt.is-correct .qr-opt-tag { color:rgba(255,255,255,.9); }

        /* Text answers */
        .qr-ans-row { margin-bottom:8px; }
        .qr-ans-row:last-child { margin-bottom:0; }
        .qr-ans-lbl { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.4px;
            color:#6B7280; margin-bottom:4px; }
        .qr-ans-val { padding:9px 12px; border-radius:9px; font-size:13px; background:#F9FAFB;
            border:1.5px solid #E5E7EB; color:#111827; line-height:1.5; }
        .qr-ans-val.bad   { background:#DC2626; border-color:#DC2626; color:#fff; }
        .qr-ans-val.good  { background:#16A34A; border-color:#16A34A; color:#fff; }
        .qr-ans-val.empty { background:#F3F4F6; border-color:#D1D5DB; color:#9CA3AF; }

        /* Feedback */
        .qr-feedback { font-size:12px; color:#374151; font-style:italic; margin-top:10px;
            padding:8px 12px; background:#F3F4F6; border-radius:8px; border-left:3px solid #00461B;
            display:flex; align-items:flex-start; gap:6px; }

        /* Empty / notes */
        .qr-empty-filter { text-align:center; padding:28px 16px; color:#9CA3AF; font-size:14px; }
        .qr-hidden-note  { font-size:12px; color:#9CA3AF; text-align:center; margin:0; padding:12px 20px;
            border-top:1px solid #F0F0F0; }
        .qr-no-review { text-align:center; padding:32px; color:#9CA3AF; font-size:14px; }

        @media(max-width:600px) {
            .qr-hero { padding:24px 20px; }
            .qr-ring { width:88px; height:88px; }
            .qr-ring-svg { width:88px; height:88px; }
            .qr-ring-pct { font-size:20px; }
            .qr-stats { gap:8px; }
            .qr-stat { padding:10px 12px; }
            .qr-stat-val { font-size:18px; }
        }
    `;
}
