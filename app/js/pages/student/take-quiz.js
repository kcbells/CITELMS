/**
 * Student Take Quiz Page
 * Professional quiz-taking interface with timer, navigator, and submit
 */
import { Api } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';
import { subjectHash } from './quizzes.js';
import {
    setQuizProctoring,
    clearQuizProctoring,
    setQuizInProgress,
    formatQuizAttemptWarning,
    registerQuizLeaveHandlers,
} from '../../utils/quiz-guard.js';

const inl = { size: 14, className: 'ui-icon-inline' };

function injectPreQuizStyles() {
    if (document.getElementById('tq-pre-styles')) return;
    const el = document.createElement('style');
    el.id = 'tq-pre-styles';
    el.textContent = `
        .tq-pre { max-width:640px; margin:32px auto 48px; }
        .tq-pre-hero { background:#00461B; border-radius:20px 20px 0 0; padding:28px 32px 24px; color:#fff; text-align:center; }
        .tq-pre-hero-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,.2); border:none; padding:5px 14px; border-radius:999px; font-size:11px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; margin-bottom:14px; }
        .tq-pre-hero h2 { font-size:24px; font-weight:800; margin:0 0 6px; letter-spacing:-.3px; }
        .tq-pre-hero p { font-size:14px; opacity:.9; margin:0; line-height:1.5; }
        .tq-pre-card { background:#fff; border:none; border-top:none; border-radius:0 0 20px 20px; box-shadow:none; overflow:hidden; }
        .tq-pre-body { padding:28px 32px 32px; }
        .tq-pre-meta { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:22px; }
        .tq-pre-meta-item { flex:1; min-width:120px; background:#E8F5EC; border:none; border-radius:12px; padding:12px 14px; text-align:center; }
        .tq-pre-meta-val { font-size:18px; font-weight:800; color:#00461B; display:block; }
        .tq-pre-meta-lbl { font-size:11px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; display:block; }
        .tq-pre-section-title { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; margin:0 0 14px; display:flex; align-items:center; gap:8px; }
        .tq-pre-section-title.do-title { color:#00461B; }
        .tq-pre-section-title.dont-title { color:#6B0F1A; }
        .tq-pre-rules { list-style:none; margin:0 0 24px; padding:0; display:flex; flex-direction:column; gap:10px; }
        .tq-pre-rule { display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border-radius:12px; font-size:13.5px; line-height:1.45; }
        .tq-pre-rule.do { background:#E8F5EC; border:none; color:#00461B; }
        .tq-pre-rule.dont { background:#FDF2F4; border:none; color:#6B0F1A; }
        .tq-pre-rule.warn { background:#FEF9C3; border:none; color:#92400E; }
        .tq-pre-rule-icon { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:14px; font-weight:800; }
        .tq-pre-rule.do .tq-pre-rule-icon { background:#00461B; color:#fff; }
        .tq-pre-rule.dont .tq-pre-rule-icon { background:#6B0F1A; color:#fff; }
        .tq-pre-rule.warn .tq-pre-rule-icon { background:#F59E0B; color:#fff; }
        .tq-pre-rule strong { display:block; font-size:13px; margin-bottom:2px; }
        .tq-pre-agree { display:flex; align-items:flex-start; gap:12px; padding:14px 16px; background:#FEF9C3; border:none; border-radius:12px; margin-bottom:20px; cursor:pointer; }
        .tq-pre-agree input { width:18px; height:18px; margin-top:2px; accent-color:#00461B; flex-shrink:0; cursor:pointer; }
        .tq-pre-agree label { font-size:13px; color:#92400E; line-height:1.5; cursor:pointer; font-weight:600; }
        .tq-pre-actions { display:flex; gap:12px; flex-wrap:wrap; }
        .tq-pre-btn { flex:1; min-width:140px; padding:13px 20px; border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; border:none; transition:all .15s; text-align:center; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
        .tq-pre-btn.ghost { background:#F3F4F6; color:#404040; border:none; }
        .tq-pre-btn.ghost:hover { background:#e5e7eb; }
        .tq-pre-btn.primary { background:#00461B; color:#fff; box-shadow:0 4px 14px rgba(0,70,27,.25); }
        .tq-pre-btn.primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 18px rgba(0,70,27,.32); }
        .tq-pre-btn:disabled { opacity:.45; cursor:not-allowed; transform:none !important; box-shadow:none !important; }
        .tq-cd-panel { text-align:center; padding:8px 0 4px; }
        .tq-cd-ring-wrap { position:relative; width:152px; height:152px; margin:0 auto 20px; }
        .tq-cd-ring-wrap svg { width:100%; height:100%; transform:rotate(-90deg); }
        .tq-cd-ring-bg { fill:none; stroke:#e8f0ec; stroke-width:8; }
        .tq-cd-ring-fg { fill:none; stroke:#1B4D3E; stroke-width:8; stroke-linecap:round; transition:stroke-dashoffset .9s linear; }
        .tq-cd-ring-num { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .tq-cd-ring-num span { font-size:52px; font-weight:800; color:#1B4D3E; line-height:1; font-variant-numeric:tabular-nums; }
        .tq-cd-ring-num small { font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.8px; margin-top:4px; }
        .tq-cd-status { font-size:15px; font-weight:600; color:#404040; margin-bottom:6px; }
        .tq-cd-sub { font-size:13px; color:#737373; margin-bottom:18px; }
        .tq-cd-warn-strip { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 16px; background:#fef3c7; border:1px solid #fcd34d; border-radius:10px; font-size:12.5px; font-weight:600; color:#92400e; margin-top:8px; }
        .tq-notice { max-width:520px; margin:48px auto; text-align:center; }
        .tq-notice-icon { width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 18px; font-size:32px; }
        .tq-notice-icon.warn { background:#fef3c7; color:#b45309; border:2px solid #fcd34d; }
        .tq-notice-icon.danger { background:#fdf2f4; color:#6B0F1A; border:2px solid #d4a0a8; }
        .tq-notice-icon.info { background:#ecfdf5; color:#1B4D3E; border:2px solid #86efac; }
        .tq-notice h3 { font-size:20px; font-weight:800; color:#1a1a1a; margin:0 0 10px; }
        .tq-notice p { font-size:14px; color:#6b7280; line-height:1.6; margin:0 0 16px; }
        .tq-notice-detail { background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:14px 18px; text-align:left; margin-bottom:22px; }
        .tq-notice-detail li { font-size:13px; color:#525252; line-height:1.5; margin-bottom:6px; padding-left:4px; }
        .tq-notice-detail li:last-child { margin-bottom:0; }
        .tq-notice-actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .tq-notice-link { display:inline-flex; align-items:center; gap:6px; padding:12px 22px; border-radius:12px; background:#6B0F1A; color:#fff; font-size:14px; font-weight:700; text-decoration:none; }
        .tq-notice-link.ghost { background:#f3f4f6; color:#404040; border:1px solid #e5e7eb; }
        .tq-action-toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%) translateY(24px); min-width:280px; max-width:90vw; background:#1e293b; color:#fff; padding:14px 18px; border-radius:14px; font-size:13px; font-weight:600; display:flex; align-items:flex-start; gap:12px; z-index:9999; opacity:0; transition:opacity .25s, transform .25s; pointer-events:none; box-shadow:0 8px 32px rgba(0,0,0,.2); }
        .tq-action-toast.danger { background:#7f1d1d; }
        .tq-action-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
        .tq-action-toast-icon { flex-shrink:0; margin-top:1px; }
        .tq-action-toast-body strong { display:block; font-size:13px; margin-bottom:2px; }
        .tq-action-toast-body span { font-size:12px; font-weight:500; opacity:.85; line-height:1.4; }
        .tq-violation-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:10002; padding:20px; animation:tq-fadein .2s ease; }
        @keyframes tq-fadein { from{opacity:0} to{opacity:1} }
        .tq-violation-modal { background:#fff; border-radius:20px; max-width:440px; width:100%; overflow:hidden; box-shadow:0 24px 64px rgba(61,12,17,.45); }
        .tq-violation-hero { background:#6B0F1A; padding:20px 24px; text-align:center; color:#fff; }
        .tq-violation-hero-icon { width:56px; height:56px; border-radius:50%; background:rgba(255,255,255,.12); border:2px solid rgba(255,255,255,.22); display:flex; align-items:center; justify-content:center; margin:0 auto 12px; }
        .tq-violation-label { font-size:22px; font-weight:800; margin:0 0 4px; letter-spacing:-.2px; }
        .tq-violation-sub { font-size:13.5px; opacity:.88; margin:0; }
        .tq-violation-body { padding:22px 26px 26px; }
        .tq-violation-msg { font-size:14px; color:#404040; line-height:1.55; margin:0 0 18px; text-align:center; }
        .tq-violation-msg strong { color:#6B0F1A; }
        .tq-violation-cd-wrap { text-align:center; margin-bottom:18px; }
        .tq-violation-cd-num { display:inline-flex; align-items:center; justify-content:center; width:64px; height:64px; border-radius:50%; background:#fdf2f4; border:3px solid #6B0F1A; font-size:28px; font-weight:800; color:#6B0F1A; font-variant-numeric:tabular-nums; margin-bottom:8px; }
        .tq-violation-cd-hint { font-size:12px; color:#7B1E1E; font-weight:600; }
        .tq-violation-actions { display:flex; flex-direction:column; gap:10px; }
        .tq-violation-btn { width:100%; padding:13px 18px; border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; border:none; transition:all .15s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .tq-violation-btn.stay { background:#6B0F1A; color:#fff; box-shadow:0 4px 16px rgba(107,15,26,.25); }
        .tq-violation-btn.stay:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(107,15,26,.42); }
        .tq-violation-btn.leave { background:#fff; color:#6B0F1A; border:2px solid #d4a0a8; }
        .tq-violation-btn.leave:hover { background:#fdf2f4; }
        .tq-violation-flash { position:fixed; inset:0; z-index:10003; display:flex; align-items:center; justify-content:center; background:rgba(45,8,12,.85); animation:tq-fadein .15s ease; pointer-events:none; }
        .tq-violation-flash-inner { text-align:center; color:#fff; }
        .tq-violation-flash-inner .tq-violation-label { font-size:28px; margin-bottom:6px; }
        .tq-violation-flash-inner .tq-violation-sub { font-size:15px; opacity:.9; }
        .tq-prevention-freeze { position:fixed; inset:0; z-index:10001; background:rgba(45,8,12,.92); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; padding:24px; animation:tq-freeze-in .18s ease; }
        @keyframes tq-freeze-in { from{opacity:0} to{opacity:1} }
        .tq-prevention-inner { text-align:center; color:#fff; max-width:360px; }
        .tq-prevention-badge { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.14); border:2px solid rgba(255,255,255,.35); color:#fff; font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; padding:8px 16px; border-radius:999px; margin-bottom:16px; animation:tq-hold-pulse 1.2s ease infinite; }
        @keyframes tq-hold-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.25)} 50%{box-shadow:0 0 0 10px rgba(255,255,255,0)} }
        .tq-prevention-title { font-size:28px; font-weight:800; margin:0 0 10px; letter-spacing:-.3px; }
        .tq-prevention-action { display:inline-block; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.2); border-radius:10px; padding:10px 16px; font-size:14px; font-weight:600; margin-bottom:12px; }
        .tq-prevention-hint { font-size:13px; opacity:.85; line-height:1.5; margin:0; }
        .tq-violation-held-badge { display:inline-flex; align-items:center; gap:6px; background:#fdf2f4; color:#6B0F1A; border:1.5px solid #d4a0a8; font-size:10px; font-weight:800; letter-spacing:.9px; text-transform:uppercase; padding:5px 12px; border-radius:999px; margin-bottom:12px; }
        .tq-violation-prevent-box { background:#fdf2f4; border:1.5px solid #e8c4ca; border-radius:12px; padding:12px 14px; margin-bottom:16px; text-align:left; }
        .tq-violation-prevent-box strong { display:block; font-size:13px; color:#6B0F1A; margin-bottom:4px; }
        .tq-violation-prevent-box span { font-size:12.5px; color:#7B1E1E; line-height:1.45; }
        body.tq-proctor-frozen #page-content,
        body.tq-proctor-frozen .tq-wrap,
        body.tq-proctor-frozen .tq-pre { pointer-events:none !important; user-select:none !important; }
        @media(max-width:600px) {
            .tq-pre-hero, .tq-pre-body { padding-left:20px; padding-right:20px; }
            .tq-pre-meta { flex-direction:column; }
        }
    `;
    document.head.appendChild(el);
}

function showProctorNotice(container, { variant = 'warn', title, message, details = [], backHref, backLabel = 'Back to Quizzes' }) {
    injectPreQuizStyles();
    const iconMap = { warn: 'warning', danger: 'siren', info: 'eyeOff' };
    container.innerHTML = `
        <div class="tq-notice">
            <div class="tq-notice-icon ${variant}">${icon(iconMap[variant] || 'warning', { size: 32 })}</div>
            <h3>${esc(title)}</h3>
            <p>${esc(message)}</p>
            ${details.length ? `<ul class="tq-notice-detail">${details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
            <div class="tq-notice-actions">
                <a href="${esc(backHref)}" class="tq-notice-link">${esc(backLabel)}</a>
            </div>
        </div>`;
}

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const quizId = params.get('quiz_id');

    if (!quizId) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">No quiz selected. <a href="#student/my-subjects" style="color:#1B4D3E">Go to My Subjects</a></div>';
        return;
    }

    container.innerHTML = '<div style="text-align:center;padding:80px;color:#737373">Loading quiz...</div>';

    const res = await Api.get('/QuizzesAPI.php?action=questions&id=' + quizId);
    if (!res.success) {
        container.innerHTML = `<div style="text-align:center;padding:60px;color:#b91c1c">${res.message || 'Failed to load quiz'}</div>`;
        return;
    }

    const quiz       = res.data.quiz;
    if (quiz.subject_id) {
        Api.post('/ClassroomAPI.php?action=record-view', {
            subject_id: parseInt(quiz.subject_id, 10),
            content_type: 'quiz',
            content_id: parseInt(quiz.quiz_id, 10),
        }).catch(() => {});
    }
    const isProctored = quiz.is_proctored ?? (quiz.quiz_type !== 'practice');
    const isPractice  = quiz.quiz_type === 'practice';
    setQuizProctoring(isProctored, {
        practice: isPractice,
        quizId: quiz.quiz_id,
        attemptsRemaining: quiz.attempts_remaining,
        maxAttempts: quiz.max_attempts,
    });

    const subjectId  = quiz.subject_id || '';
    const subjectCode = quiz.subject_code || '';
    const quizSubtitle = subjectCode ? `${quiz.title} · ${subjectCode}` : quiz.title;
    const quizzesBack = subjectId
        ? subjectHash(subjectId, 'classwork', { type: 'quiz', id: quiz.quiz_id })
        : '#student/my-subjects';
    const subjectBack = subjectId
        ? `#student/subject?subject_id=${subjectId}`
        : '#student/my-subjects';
    const questions  = res.data.questions || [];
    const answers    = {};
    const oneAtATime = !!quiz.one_at_a_time;
    let currentQ = 0;

    if (questions.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:80px">
                <div style="width:64px;height:64px;background:#f3f4f6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;color:#737373">?</div>
                <h3 style="color:#262626;margin-bottom:8px;font-size:18px">No Questions Available</h3>
                <p style="color:#737373;font-size:14px;margin-bottom:20px">This quiz doesn't have any questions yet.</p>
                <a href="${quizzesBack}" style="color:#1B4D3E;font-weight:600;font-size:14px">Back to Quizzes</a>
            </div>`;
        return;
    }

    let timeLeft = (quiz.time_limit || 30) * 60;
    let timerInterval;
    let startTime = 0;
    const totalPoints = questions.reduce((s, q) => s + (parseInt(q.points) || 1), 0);
    let quizEnded = false;
    let endedReason = '';

    function renderQuiz() {
        container.innerHTML = `
            <style>
                .tq-wrap { max-width:960px; margin:0 auto; }

                /* Header */
                .tq-header { background:#00461B; border-radius:16px; padding:20px 28px; color:#fff; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
                .tq-header-left h3 { font-size:20px; font-weight:700; margin:0 0 4px; }
                .tq-header-left p { font-size:13px; opacity:.85; margin:0; }
                .tq-timer { background:rgba(0,0,0,.2); padding:10px 18px; border-radius:12px; font-size:24px; font-weight:800; font-family:'Courier New',monospace; letter-spacing:2px; min-width:90px; text-align:center; }
                .tq-timer.warn { color:#FCD34D; }
                .tq-timer.danger { color:#FCA5A5; animation:tq-pulse 1s infinite; }
                @keyframes tq-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

                /* Progress */
                .tq-progress { background:#e5e7eb; height:4px; border-radius:2px; margin-bottom:20px; overflow:hidden; }
                .tq-progress-fill { height:100%; background:#1B4D3E; border-radius:2px; transition:width .3s ease; }

                /* Layout */
                .tq-body { display:grid; grid-template-columns:1fr 220px; gap:20px; align-items:start; }

                /* Question Card */
                .tq-question { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:28px; user-select:none; -webkit-user-select:none; }
                /* Allow typing inside inputs/textareas but not selecting question text */
                .tq-question input, .tq-question textarea { user-select:text; -webkit-user-select:text; }
                .tq-q-badge { display:inline-flex; align-items:center; gap:6px; margin-bottom:14px; }
                .tq-q-num { background:#1B4D3E; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }
                .tq-q-of { font-size:13px; color:#737373; }
                .tq-q-type { background:#f3f4f6; color:#404040; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; text-transform:capitalize; margin-left:8px; }
                .tq-q-text { font-size:16px; font-weight:600; color:#1a1a1a; line-height:1.6; margin-bottom:8px; }
                .tq-q-points { font-size:12px; color:#737373; margin-bottom:20px; }

                /* Options */
                .tq-options { display:flex; flex-direction:column; gap:10px; }
                .tq-opt { display:flex; align-items:center; gap:14px; padding:14px 18px; border:2px solid #e5e7eb; border-radius:12px; cursor:pointer; transition:all .15s ease; user-select:none; }
                .tq-opt:hover { border-color:#93c5b8; background:#f0fdf4; }
                .tq-opt.selected { border-color:#1B4D3E; background:#ecfdf5; }
                .tq-opt-radio { width:22px; height:22px; border:2px solid #d1d5db; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .15s; }
                .tq-opt.selected .tq-opt-radio { border-color:#1B4D3E; background:#1B4D3E; }
                .tq-opt.selected .tq-opt-radio::after { content:''; width:8px; height:8px; background:#fff; border-radius:50%; }
                .tq-opt-letter { width:28px; height:28px; border-radius:8px; background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#404040; flex-shrink:0; }
                .tq-opt.selected .tq-opt-letter { background:#1B4D3E; color:#fff; }
                .tq-opt-text { font-size:14px; color:#262626; line-height:1.4; flex:1; }

                /* Navigation Buttons */
                .tq-nav-btns { display:flex; justify-content:space-between; margin-top:24px; padding-top:20px; border-top:1px solid #f0f0f0; }
                .tq-btn { padding:10px 22px; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid #e0e0e0; background:#fff; color:#404040; transition:all .15s; display:inline-flex; align-items:center; gap:6px; }
                .tq-btn:hover { background:#f5f5f5; }
                .tq-btn:disabled { opacity:.35; cursor:not-allowed; }
                .tq-btn.primary { background:#1B4D3E; color:#fff; border-color:#1B4D3E; }
                .tq-btn.primary:hover { background:#155c3a; }

                /* Navigator Panel */
                .tq-nav { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:20px; position:sticky; top:20px; }
                .tq-nav-title { font-size:12px; font-weight:700; color:#737373; text-transform:uppercase; letter-spacing:.8px; margin-bottom:14px; }
                .tq-nav-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin-bottom:16px; }
                .tq-nav-num { width:100%; aspect-ratio:1; border-radius:8px; border:1.5px solid #e5e7eb; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; cursor:pointer; background:#fff; color:#6b7280; transition:all .15s; }
                .tq-nav-num:hover { border-color:#93c5b8; }
                .tq-nav-num.current { background:#1B4D3E; color:#fff; border-color:#1B4D3E; }
                .tq-nav-num.answered { background:#dcfce7; color:#166534; border-color:#86efac; }
                .tq-nav-num.answered.current { background:#1B4D3E; color:#fff; border-color:#1B4D3E; }

                .tq-nav-stats { margin-bottom:16px; }
                .tq-nav-stat-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 0; }
                .tq-nav-stat-label { color:#737373; }
                .tq-nav-stat-value { font-weight:700; color:#262626; }

                .tq-nav-progress { background:#e5e7eb; height:6px; border-radius:3px; margin-bottom:16px; overflow:hidden; }
                .tq-nav-progress-fill { height:100%; background:#1B4D3E; border-radius:3px; transition:width .3s; }

                .tq-submit-btn { width:100%; padding:12px; border:none; border-radius:12px; background:#00461B; color:#fff; font-size:14px; font-weight:700; cursor:pointer; transition:all .2s; }
                .tq-submit-btn:hover { box-shadow:0 4px 14px rgba(0,70,27,.3); transform:translateY(-1px); }

                /* Confirm Modal */
                /* Text-answer question types */
                .tq-text-answer { display:flex; flex-direction:column; gap:8px; }
                .tq-text-label { font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.6px; margin-bottom:2px; }
                .tq-text-input { padding:12px 16px; border:2px solid #e5e7eb; border-radius:10px; font-size:15px; outline:none; transition:border-color .15s; width:100%; box-sizing:border-box; }
                .tq-text-input:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }
                .tq-textarea { padding:12px 16px; border:2px solid #e5e7eb; border-radius:10px; font-size:14px; line-height:1.7; outline:none; resize:vertical; font-family:inherit; width:100%; box-sizing:border-box; transition:border-color .15s; }
                .tq-textarea:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }
                .tq-essay { min-height:200px; }
                .tq-char-count { font-size:11px; color:#9ca3af; text-align:right; margin-top:2px; }
                .tq-type-hint { display:flex; align-items:flex-start; gap:8px; padding:10px 14px; border-radius:8px; font-size:12.5px; margin-bottom:16px; }
                .tq-type-hint.fill  { background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE; }
                .tq-type-hint.short { background:#F0FDF4; color:#166534; border:1px solid #BBF7D0; }
                .tq-type-hint.essay { background:#FEF9C3; color:#854D0E; border:1px solid #FDE68A; }
                .tq-inline-blank { display:inline-block; border:none; border-bottom:2.5px solid #1B4D3E; outline:none; padding:2px 10px; font-size:16px; font-weight:700; color:#1B4D3E; min-width:130px; max-width:260px; background:rgba(27,77,62,.07); border-radius:4px 4px 0 0; text-align:center; transition:background .15s; vertical-align:middle; margin:0 4px; }
                .tq-inline-blank:focus { background:rgba(27,77,62,.14); }

                .tq-modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
                .tq-modal { background:#fff; border-radius:16px; padding:32px; max-width:400px; width:90%; text-align:center; }
                .tq-modal h3 { font-size:18px; font-weight:700; color:#262626; margin-bottom:8px; }
                .tq-modal p { font-size:14px; color:#737373; margin-bottom:6px; }
                .tq-modal .warn-text { color:#B45309; font-weight:600; font-size:13px; margin-bottom:20px; }
                .tq-modal-btns { display:flex; gap:12px; justify-content:center; }

                /* Paste-blocked toast */
                .tq-paste-toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%) translateY(20px); background:#1e293b; color:#fff; padding:10px 20px; border-radius:10px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px; z-index:9999; opacity:0; transition:opacity .2s, transform .2s; pointer-events:none; white-space:nowrap; }
                .tq-paste-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
                .tq-paste-toast .tq-pt-icon { font-size:15px; }

                /* Tab-switch warning banner */
                .tq-tabwarn { position:fixed; top:0; left:0; right:0; z-index:9999; padding:13px 24px; display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13.5px; font-weight:600; animation:tq-slidein .3s ease forwards; }
                .tq-tabwarn.mild   { background:#FEF3C7; color:#92400E; border-bottom:2px solid #FCD34D; }
                .tq-tabwarn.danger { background:#FEE2E2; color:#991B1B; border-bottom:2px solid #FCA5A5; }
                @keyframes tq-slidein { from{transform:translateY(-100%)} to{transform:translateY(0)} }
                .tq-tabwarn-msg { display:flex; align-items:center; gap:10px; }
                .tq-tabwarn-close { background:none; border:none; cursor:pointer; font-size:18px; color:inherit; padding:0 4px; line-height:1; }
                /* Tab-switch count badge in sidebar */
                .tq-switch-badge { display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 0; margin-top:4px; }
                .tq-switch-badge-label { color:#B45309; font-weight:600; }
                .tq-switch-badge-val   { background:#FEF3C7; color:#B45309; border-radius:12px; padding:1px 9px; font-weight:800; font-size:11px; }
                .tq-switch-badge.danger .tq-switch-badge-label { color:#b91c1c; }
                .tq-switch-badge.danger .tq-switch-badge-val   { background:#FEE2E2; color:#b91c1c; }

                /* Screenshot / capture deterrent */
                .tq-wrap.tq-blurred, .tq-pre.tq-blurred { filter:blur(18px); pointer-events:none; user-select:none; }
                body.tq-secure-mode { -webkit-touch-callout:none; }
                body.tq-secure-mode .tq-wrap { -webkit-user-select:none; user-select:none; }
                @media print { body.tq-secure-mode #page-content, body.tq-secure-mode .tq-wrap { display:none !important; } }

                @media(max-width:768px) {
                    .tq-body { grid-template-columns:1fr; }
                    .tq-nav { position:static; order:-1; }
                    .tq-nav-grid { grid-template-columns:repeat(10,1fr); }
                    .tq-header { padding:16px 20px; }
                }
            </style>

            <div class="tq-wrap">
                <div class="tq-header">
                    <div class="tq-header-left">
                        <h3>${esc(quiz.title)}</h3>
                        <p>${questions.length} questions &middot; ${totalPoints} points &middot; ${quiz.passing_rate}% to pass${quiz.attempts_remaining != null ? ` &middot; ${quiz.attempts_remaining} attempt(s) left` : ''}${isProctored ? ` &middot; ${icon('eyeOff', inl)} Proctored` : isPractice ? ' &middot; Practice (no lockdown)' : ''}</p>
                        <p style="font-size:12px;opacity:.9;margin-top:6px;">${isProctored
                            ? 'Stay on this tab. Switching tabs asks you to confirm — leaving may submit this attempt.'
                            : 'Switching tabs or pages asks you to confirm before you leave.'}</p>
                    </div>
                    <div class="tq-timer" id="tq-timer">${formatTime(timeLeft)}</div>
                </div>

                <div class="tq-progress"><div class="tq-progress-fill" id="tq-progress-fill" style="width:0%"></div></div>

                <div class="tq-body">
                    <div class="tq-question" id="tq-question"></div>
                    <div class="tq-nav">
                        ${oneAtATime ? `
                        <div class="tq-nav-title">Progress</div>
                        <div style="text-align:center;padding:10px 0 6px;">
                            <span style="font-size:32px;font-weight:800;color:#1B4D3E;" id="tq-aat-num">1</span>
                            <span style="font-size:16px;color:#9ca3af;font-weight:600;"> / ${questions.length}</span>
                        </div>
                        <div style="font-size:11px;color:#9ca3af;text-align:center;margin-bottom:10px;">questions</div>
                        <div class="tq-nav-progress" style="margin-bottom:16px;"><div class="tq-nav-progress-fill" id="tq-nav-progress-fill" style="width:${100/questions.length}%"></div></div>
                        <div class="tq-nav-stats">
                            <div class="tq-nav-stat-row"><span class="tq-nav-stat-label">Answered</span><span class="tq-nav-stat-value" id="tq-answered-count">0 / ${questions.length}</span></div>
                            <div class="tq-switch-badge" id="tq-switch-badge" style="display:none;">
                                <span class="tq-switch-badge-label">${L.warning} Tab switches</span>
                                <span class="tq-switch-badge-val" id="tq-switch-count">0</span>
                            </div>
                        </div>
                        <button type="button" class="tq-submit-btn" id="tq-submit">Submit Quiz</button>
                        ` : `
                        <div class="tq-nav-title">Questions</div>
                        <div class="tq-nav-grid" id="tq-nav-grid">
                            ${questions.map((q, i) => `<div class="tq-nav-num" data-idx="${i}">${i + 1}</div>`).join('')}
                        </div>
                        <div class="tq-nav-stats">
                            <div class="tq-nav-stat-row"><span class="tq-nav-stat-label">Answered</span><span class="tq-nav-stat-value" id="tq-answered-count">0 / ${questions.length}</span></div>
                            <div class="tq-nav-stat-row"><span class="tq-nav-stat-label">Remaining</span><span class="tq-nav-stat-value" id="tq-remaining-count">${questions.length}</span></div>
                            <div class="tq-switch-badge" id="tq-switch-badge" style="display:none;">
                                <span class="tq-switch-badge-label">${L.warning} Tab switches</span>
                                <span class="tq-switch-badge-val" id="tq-switch-count">0</span>
                            </div>
                        </div>
                        <div class="tq-nav-progress"><div class="tq-nav-progress-fill" id="tq-nav-progress-fill" style="width:0%"></div></div>
                        <button class="tq-submit-btn" id="tq-submit">Submit Quiz</button>
                        `}
                    </div>
                </div>
            </div>
        `;

        showQuestion(currentQ);
        startTimer();
        if (isProctored) {
            startProctoring();
        } else {
            startLeaveConfirmationGuard();
        }

        // Question navigator — disabled in one-at-a-time mode (can't jump around)
        if (!oneAtATime) {
            container.querySelectorAll('.tq-nav-num').forEach(n => {
                n.addEventListener('click', () => {
                    currentQ = parseInt(n.dataset.idx);
                    showQuestion(currentQ);
                });
            });
        }

        container.querySelector('#tq-submit')?.addEventListener('click', () => showSubmitConfirm());
        }

    function wireInlineSubmit(panel) {
        panel.querySelector('#tq-submit-inline')?.addEventListener('click', () => showSubmitConfirm());
    }

    function showQuestion(idx) {
        currentQ = idx;
        const q = questions[idx];
        const panel = container.querySelector('#tq-question');
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        const typeLabelMap = {
            multiple_choice:    'Multiple Choice',
            true_false:         'True / False',
            fill_blank:         'Fill in the Blank',
            fill_in_the_blank:  'Fill in the Blank',
            short_answer:       'Short Answer',
            essay:              'Essay'
        };
        const typeLabel  = typeLabelMap[q.question_type] || q.question_type;
        const cleanText  = cleanQuestionText(q.question_text);
        const curAnswer  = answers[q.questions_id] ?? '';
        const isTextType = ['fill_blank','fill_in_the_blank','short_answer','essay'].includes(q.question_type);

        // Build answer area based on type
        let answerHtml = '';
        if (q.question_type === 'fill_blank' || q.question_type === 'fill_in_the_blank') {
            // Blank pattern: _____ (3+ underscores) or [blank]
            const hasBlank = /_{3,}|\[blank\]/i.test(cleanText);
            if (hasBlank) {
                // Replace blank placeholder with inline input — shown inline in question text
                const inlineText = cleanText.replace(/_{3,}|\[blank\]/gi,
                    `<input type="text" class="tq-inline-blank" id="tq-text-ans"
                            placeholder="     ?" value="${esc(String(curAnswer))}"
                            autocomplete="off" spellcheck="false">`
                );
                // Override the question text rendered later
                q._inlineBlankHtml = inlineText;
            }
            answerHtml = hasBlank ? '' : `
                <div class="tq-type-hint fill">
                    ${icon('edit', inl)} &nbsp;Type your answer to complete the blank. Spelling matters.
                </div>
                <div class="tq-text-answer">
                    <label class="tq-text-label">Your Answer</label>
                    <input type="text" class="tq-text-input" id="tq-text-ans"
                           placeholder="Fill in the blank…"
                           value="${esc(String(curAnswer))}"
                           autocomplete="off" spellcheck="false">
                </div>`;
        } else if (q.question_type === 'short_answer') {
            const charMax = 500;
            answerHtml = `
                <div class="tq-type-hint short">
                    ${icon('quiz', inl)} &nbsp;Answer briefly and clearly — 1 to 3 sentences is ideal. &nbsp;<strong>${L.warning} Pasting is disabled.</strong>
                </div>
                <div class="tq-text-answer">
                    <label class="tq-text-label">Your Answer</label>
                    <textarea class="tq-textarea" id="tq-text-ans"
                              placeholder="Write your short answer here…"
                              rows="5" maxlength="${charMax}">${esc(String(curAnswer))}</textarea>
                    <div class="tq-char-count"><span id="tq-char-num">${String(curAnswer).length}</span>/${charMax} characters</div>
                </div>`;
        } else if (q.question_type === 'essay') {
            const charMax = 5000;
            const wordCount = String(curAnswer).trim() ? String(curAnswer).trim().split(/\s+/).length : 0;
            answerHtml = `
                <div class="tq-type-hint essay">
                    ${icon('document', inl)} &nbsp;Write a complete, well-structured response. Use paragraphs and support your ideas. &nbsp;<strong>${L.warning} Pasting is disabled.</strong>
                </div>
                <div class="tq-text-answer">
                    <label class="tq-text-label">Your Essay Response</label>
                    <textarea class="tq-textarea tq-essay" id="tq-text-ans"
                              placeholder="Write your essay here…"
                              rows="10" maxlength="${charMax}">${esc(String(curAnswer))}</textarea>
                    <div class="tq-char-count">
                        <span id="tq-word-num">${wordCount}</span> words &nbsp;·&nbsp;
                        <span id="tq-char-num">${String(curAnswer).length}</span>/${charMax} characters
                    </div>
                </div>`;
        } else {
            // Multiple choice / True-False
            answerHtml = `
                <div class="tq-options">
                    ${q.choices.map((c, ci) => `
                        <div class="tq-opt ${answers[q.questions_id] == c.option_id ? 'selected' : ''}" data-oid="${c.option_id}">
                            <div class="tq-opt-radio"></div>
                            <div class="tq-opt-letter">${letters[ci] || ci + 1}</div>
                            <div class="tq-opt-text">${esc(c.option_text)}</div>
                        </div>
                    `).join('')}
                </div>`;
        }

        panel.innerHTML = `
            <div class="tq-q-badge">
                <span class="tq-q-num">${idx + 1}</span>
                <span class="tq-q-of">of ${questions.length}</span>
                <span class="tq-q-type">${typeLabel}</span>
            </div>
            <div class="tq-q-text">${q._inlineBlankHtml || esc(cleanText)}</div>
            <div class="tq-q-points">${q.points} point${q.points > 1 ? 's' : ''}</div>
            ${answerHtml}
            <div class="tq-nav-btns">
                ${oneAtATime
                    ? `<span></span>
                       ${idx === questions.length - 1
                           ? `<button type="button" class="tq-btn primary" id="tq-submit-inline">${icon('check', inl)} Submit Quiz</button>`
                           : `<button type="button" class="tq-btn primary" id="tq-next">Next &#8594;</button>`
                       }`
                    : `<button type="button" class="tq-btn" id="tq-prev" ${idx === 0 ? 'disabled' : ''}>&#8592; Previous</button>
                       ${idx === questions.length - 1
                           ? `<button type="button" class="tq-btn primary" id="tq-submit-inline">${icon('check', inl)} Submit Quiz</button>`
                           : `<button type="button" class="tq-btn primary" id="tq-next">Next &#8594;</button>`
                       }`
                }
            </div>
        `;

        // Block copying question text / options (ignore events that originate inside inputs/textareas)
        panel.addEventListener('copy', e => {
            if (e.target.matches('input, textarea')) return; // student's own typed text — allow
            e.preventDefault();
        });
        panel.addEventListener('contextmenu', e => {
            if (e.target.matches('input, textarea')) return; // keep browser spellcheck etc.
            e.preventDefault();
        });
        panel.addEventListener('keydown', e => {
            // Block Ctrl+C / Cmd+C on question content (not inside answer fields)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !e.target.matches('input, textarea')) {
                e.preventDefault();
            }
            // Block Ctrl+A select-all on question content
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !e.target.matches('input, textarea')) {
                e.preventDefault();
            }
        });

        if (isTextType) {
            const inp = panel.querySelector('#tq-text-ans');
            inp.addEventListener('input', () => {
                answers[q.questions_id] = inp.value;
                updateNavigator();
                if (q.question_type === 'short_answer') {
                    panel.querySelector('#tq-char-num').textContent = inp.value.length;
                } else if (q.question_type === 'essay') {
                    const wc = inp.value.trim() ? inp.value.trim().split(/\s+/).length : 0;
                    panel.querySelector('#tq-word-num').textContent = wc;
                    panel.querySelector('#tq-char-num').textContent = inp.value.length;
                }
            });

            // Block copy-paste on text fields (all types when proctored; essay/short always)
            if (isProctored || q.question_type === 'essay' || q.question_type === 'short_answer') {
                inp.addEventListener('paste', e => {
                    e.preventDefault();
                    if (isProctored) requestViolationHold('paste');
                    else showPasteBlockedToast();
                });
                inp.addEventListener('copy', e => e.preventDefault());
                inp.addEventListener('cut',  e => e.preventDefault());
                if (isProctored) inp.addEventListener('contextmenu', e => e.preventDefault());
                inp.addEventListener('keydown', e => {
                    if ((e.ctrlKey || e.metaKey) && ['v','c','x'].includes(e.key.toLowerCase())) {
                        e.preventDefault();
                        if (e.key.toLowerCase() === 'v') {
                            if (isProctored) requestViolationHold('paste');
                            else showPasteBlockedToast();
                        }
                    }
                });
            }

            // Auto-focus for fill in the blank
            if (q.question_type === 'fill_blank' || q.question_type === 'fill_in_the_blank') {
                setTimeout(() => inp?.focus(), 50);
            }
        } else {
            panel.querySelectorAll('.tq-opt').forEach(opt => {
                opt.addEventListener('click', () => {
                    panel.querySelectorAll('.tq-opt').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    answers[q.questions_id] = parseInt(opt.dataset.oid);
                    updateNavigator();
                });
            });
        }

        panel.querySelector('#tq-prev')?.addEventListener('click', () => { if (idx > 0) showQuestion(idx - 1); });
        panel.querySelector('#tq-next')?.addEventListener('click', () => {
            if (idx < questions.length - 1) showQuestion(idx + 1);
        });
        wireInlineSubmit(panel);

        updateNavigator();
    }

    function updateNavigator() {
        const answered = Object.keys(answers).length;
        const pct      = Math.round((answered / questions.length) * 100);

        container.querySelector('#tq-answered-count').textContent = `${answered} / ${questions.length}`;
        container.querySelector('#tq-progress-fill').style.width  = pct + '%';
        container.querySelector('#tq-nav-progress-fill').style.width = pct + '%';

        if (oneAtATime) {
            // Update "X / total" counter in simplified sidebar
            const aaNum = container.querySelector('#tq-aat-num');
            if (aaNum) aaNum.textContent = currentQ + 1;
            // Progress bar shows how far through the quiz (by question position, not answered count)
            const posPct = Math.round(((currentQ + 1) / questions.length) * 100);
            container.querySelector('#tq-nav-progress-fill').style.width = posPct + '%';
        } else {
            container.querySelector('#tq-remaining-count').textContent = questions.length - answered;
            container.querySelectorAll('.tq-nav-num').forEach(n => {
                const i   = parseInt(n.dataset.idx);
                const q   = questions[i];
                const ans = answers[q.questions_id];
                const isAnswered = ans !== undefined && ans !== null && ans !== '';
                n.classList.toggle('current',  i === currentQ);
                n.classList.toggle('answered', isAnswered);
            });
        }
    }

    function startTimer() {
        const timerEl = container.querySelector('#tq-timer');
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitQuiz();
                return;
            }
            timerEl.textContent = formatTime(timeLeft);
            timerEl.className = 'tq-timer' + (timeLeft <= 60 ? ' danger' : timeLeft <= 300 ? ' warn' : '');
        }, 1000);
    }

    function showSubmitConfirm() {
        if (quizEnded || proctorEnded) return;
        const answered = Object.keys(answers).length;
        const unanswered = questions.length - answered;
        const overlay = document.createElement('div');
        overlay.className = 'tq-modal-overlay';
        overlay.innerHTML = `
            <div class="tq-modal">
                <h3>Submit Quiz?</h3>
                <p>You answered <strong>${answered}</strong> of <strong>${questions.length}</strong> questions.</p>
                ${unanswered > 0 ? `<div class="warn-text">${unanswered} question${unanswered > 1 ? 's' : ''} unanswered!</div>` : '<p style="color:#1B4D3E;font-weight:600;margin-bottom:20px">All questions answered!</p>'}
                <div class="tq-modal-btns">
                    <button class="tq-btn" id="tq-cancel-submit">Go Back</button>
                    <button class="tq-btn primary" id="tq-confirm-submit">Submit Quiz</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#tq-cancel-submit').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#tq-confirm-submit').addEventListener('click', () => {
            overlay.remove();
            submitQuiz();
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    async function submitQuiz(reason = '') {
        if (quizEnded) return;
        quizEnded = true;
        if (reason) endedReason = reason;

        clearInterval(timerInterval);
        cleanupProctoring();
        clearQuizProctoring();
        Api.post('/QuizAttemptsAPI.php?action=proctor-unlock', {}).catch(() => {});

        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        container.innerHTML = `
            <div style="text-align:center;padding:100px">
                <div style="width:48px;height:48px;border:4px solid #e5e7eb;border-top-color:#1B4D3E;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px"></div>
                <h3 style="color:#262626;font-size:18px;margin-bottom:8px">Submitting your answers...</h3>
                <p style="color:#737373;font-size:14px">Please wait while we grade your quiz.</p>
                <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            </div>`;

        try {
            const submitData = {
                quiz_id: parseInt(quiz.quiz_id),
                time_taken: timeTaken,
                tab_switches: tabSwitchCount,
                ended_reason: endedReason || undefined,
                answers: {}
            };
            for (const [qId, optId] of Object.entries(answers)) {
                submitData.answers[qId] = optId;
            }

            const res = await Api.post('/QuizAttemptsAPI.php?action=submit', submitData);
            if (res.success && res.data?.attempt_id) {
                window.location.hash = `#student/quiz-result?attempt_id=${res.data.attempt_id}`;
            } else if (res.success) {
                // Fallback: fetch latest attempt
                const historyRes = await Api.get('/QuizAttemptsAPI.php?action=history&quiz_id=' + quiz.quiz_id);
                if (historyRes.success && historyRes.data?.length > 0) {
                    window.location.hash = `#student/quiz-result?attempt_id=${historyRes.data[0].attempt_id}`;
                } else {
                    window.location.hash = quizzesBack;
                }
            } else {
                showError(friendlyError(res.message || 'Failed to submit quiz'));
            }
        } catch (err) {
            showError(friendlyError(err.message));
        }
    }

    function friendlyError(msg) {
        if (!msg || /SQLSTATE|column not found|field list|Unknown column/i.test(String(msg))) {
            return 'We could not submit your quiz. Please try again or contact your instructor.';
        }
        return msg;
    }

    function showError(msg) {
        showProctorNotice(container, {
            variant: 'danger',
            title: 'Could Not Submit Quiz',
            message: friendlyError(msg),
            details: [
                'Your answers may not have been saved.',
                'Check your quiz history or contact your instructor if this keeps happening.'
            ],
            backHref: quizzesBack,
            backLabel: 'Back to Quizzes'
        });
    }

    // ── Tab-switch tracking ───────────────────────────────────────────────────
    let tabSwitchCount  = 0;
    let lastLeaveTime   = 0;

    function updateSidebarBadge(count) {
        const badge    = document.getElementById('tq-switch-badge');
        const countEl  = document.getElementById('tq-switch-count');
        if (!badge || !countEl) return;
        badge.style.display = 'flex';
        countEl.textContent = count;
        if (count >= 3) badge.classList.add('danger');
    }

    // ── Leave confirmation (tab / window / in-app navigation) ─────────────────
    let proctorEnded = false;
    let violationHoldOpen = false;
    let pendingViolation = null;
    let violationCdTimer = null;
    let violationCdRemaining = 3;

    function exitAttemptHint() {
        const warn = formatQuizAttemptWarning();
        if (isProctored) {
            return `${warn} If you leave now, this attempt may be submitted automatically.`;
        }
        return `${warn} Stay on this tab to finish your attempt.`;
    }

    const VIOLATION_ACTIONS = {
        tab_switch: {
            confirmAction: 'exit this quiz',
            exitQuestion: 'Are you sure you want to exit the quiz?',
            preventHint: '',
            leaveLabel: 'Yes, exit quiz',
            stayLabel: 'No, continue quiz',
            leaveMsg: 'You exited the quiz. Your attempt has been submitted.'
        },
        window_switch: {
            confirmAction: 'exit this quiz',
            exitQuestion: 'Are you sure you want to exit the quiz?',
            preventHint: '',
            leaveLabel: 'Yes, exit quiz',
            stayLabel: 'No, continue quiz',
            leaveMsg: 'You left the quiz window. Your attempt has been submitted.'
        },
        navigation: {
            confirmAction: 'leave this quiz',
            exitQuestion: 'Are you sure you want to leave the quiz?',
            preventHint: '',
            leaveLabel: 'Yes, leave quiz',
            stayLabel: 'No, continue quiz',
            leaveMsg: 'You left the quiz. Your attempt has been submitted.'
        },
        paste: {
            confirmAction: 'paste into your answer',
            confirmYes: 'paste anyway',
            preventHint: 'Pasting answers is not allowed. This action was stopped before it applied.',
            leaveLabel: 'Yes, paste anyway',
            leaveMsg: 'Proctoring violation — your quiz has been submitted.'
        },
        copy: {
            confirmAction: 'copy quiz content',
            confirmYes: 'copy anyway',
            preventHint: 'Copying questions or answers is not allowed during this quiz.',
            leaveLabel: 'Yes, copy anyway',
            leaveMsg: 'Proctoring violation — your quiz has been submitted.'
        },
        screenshot: {
            confirmAction: 'take a screenshot',
            confirmYes: 'capture the screen',
            preventHint: 'Screenshots are not allowed during this proctored quiz.',
            leaveLabel: 'Yes, take a screenshot',
            leaveMsg: 'Proctoring violation — your quiz has been submitted.'
        }
    };

    function armPreventionFreeze() {
        document.body.classList.add('tq-proctor-frozen');
        blurQuizContent();
    }

    function disarmPreventionFreeze() {
        document.body.classList.remove('tq-proctor-frozen');
        document.getElementById('tq-prevention-freeze')?.remove();
    }

    function flashKeepTrying(onDone) {
        injectPreQuizStyles();
        document.getElementById('tq-violation-flash')?.remove();
        const flash = document.createElement('div');
        flash.id = 'tq-violation-flash';
        flash.className = 'tq-violation-flash';
        flash.innerHTML = `
            <div class="tq-violation-flash-inner">
                <div class="tq-violation-label">Keep Trying!</div>
                <div class="tq-violation-sub">${esc(quizSubtitle)}</div>
            </div>`;
        document.body.appendChild(flash);
        setTimeout(() => {
            flash.remove();
            onDone?.();
        }, 1400);
    }

    function blurQuizContent() {
        container.querySelector('.tq-wrap')?.classList.add('tq-blurred');
        container.querySelector('.tq-pre')?.classList.add('tq-blurred');
    }

    function unblurQuizContent() {
        container.querySelector('.tq-wrap')?.classList.remove('tq-blurred');
        container.querySelector('.tq-pre')?.classList.remove('tq-blurred');
    }

    function closeViolationHold() {
        violationHoldOpen = false;
        pendingViolation = null;
        clearInterval(violationCdTimer);
        violationCdTimer = null;
        document.getElementById('tq-violation-overlay')?.remove();
        disarmPreventionFreeze();
        unblurQuizContent();
    }

    function resolveViolationStay() {
        if (!violationHoldOpen) return;
        closeViolationHold();
        flashKeepTrying();
    }

    function resolveViolationLeave(violation) {
        if (proctorEnded || quizEnded) return;
        closeViolationHold();
        tabSwitchCount = Math.max(tabSwitchCount, 1);
        if (!isProctored) {
            updateSidebarBadge(tabSwitchCount);
            return;
        }
        proctorEnded = true;
        const cfg = VIOLATION_ACTIONS[violation?.type] || VIOLATION_ACTIONS.tab_switch;
        showQuizEndedOverlay(cfg.leaveMsg, 'tab_switch');
        submitQuiz(violation?.type || 'tab_switch');
    }

    function openViolationHold(violation, handlers = {}) {
        if (violationHoldOpen || proctorEnded || quizEnded) return;
        injectPreQuizStyles();
        violationHoldOpen = true;
        pendingViolation = violation;
        armPreventionFreeze();

        const cfg = VIOLATION_ACTIONS[violation.type] || VIOLATION_ACTIONS.tab_switch;
        const isExit = violation.type === 'tab_switch'
            || violation.type === 'window_switch'
            || violation.type === 'navigation';
        const attemptHint = exitAttemptHint();
        const question = cfg.exitQuestion
            ? `${cfg.exitQuestion} ${attemptHint}`
            : `Are you sure you want to ${cfg.confirmAction}? ${attemptHint}`;
        const preventHint = cfg.preventHint || attemptHint;
        const stayLabel = handlers.stayLabel || cfg.stayLabel || 'No, continue quiz';
        const onStay = handlers.onStay || (() => resolveViolationStay());
        const onLeave = handlers.onLeave || (() => resolveViolationLeave(violation));
        violationCdRemaining = isExit ? 0 : 3;

        document.getElementById('tq-violation-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tq-violation-overlay';
        overlay.className = 'tq-violation-overlay';
        overlay.innerHTML = `
            <div class="tq-violation-modal" role="alertdialog" aria-modal="true" aria-labelledby="tq-violation-q">
                <div class="tq-violation-hero">
                    <div class="tq-violation-hero-icon">${icon('warning', { size: 26 })}</div>
                    <p class="tq-violation-label">${isExit ? 'Tab change detected' : 'Confirm action'}</p>
                    <p class="tq-violation-sub">${esc(quizSubtitle)}</p>
                </div>
                <div class="tq-violation-body">
                    <h3 id="tq-violation-q" style="font-size:17px;font-weight:800;color:#1a1a1a;margin:0 0 8px;text-align:center;line-height:1.4;">
                        ${esc(question)}
                    </h3>
                    <p class="tq-violation-msg" style="margin-bottom:16px;">${esc(preventHint)}</p>
                    ${isExit ? '' : `<div class="tq-violation-cd-wrap">
                        <div class="tq-violation-cd-num" id="tq-violation-cd">${violationCdRemaining}</div>
                        <p class="tq-violation-cd-hint" id="tq-violation-cd-hint">Returning to quiz in ${violationCdRemaining}s — <strong>Keep Trying!</strong></p>
                    </div>`}
                    <div class="tq-violation-actions">
                        <button type="button" class="tq-violation-btn stay" id="tq-violation-stay">
                            ${icon('quiz', inl)} ${esc(stayLabel)}
                        </button>
                        <button type="button" class="tq-violation-btn leave" id="tq-violation-leave">
                            ${icon('close', inl)} ${esc(cfg.leaveLabel)}
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const finishStay = () => { if (violationHoldOpen) onStay(); };
        const finishLeave = () => { if (violationHoldOpen) onLeave(); };

        const stayBtn = overlay.querySelector('#tq-violation-stay');
        stayBtn.addEventListener('click', finishStay);
        overlay.querySelector('#tq-violation-leave').addEventListener('click', finishLeave);
        stayBtn.focus();

        clearInterval(violationCdTimer);
        if (!isExit) {
            violationCdTimer = setInterval(() => {
                violationCdRemaining--;
                const numEl = overlay.querySelector('#tq-violation-cd');
                const hintEl = overlay.querySelector('#tq-violation-cd-hint');
                if (violationCdRemaining <= 0) {
                    clearInterval(violationCdTimer);
                    violationCdTimer = null;
                    finishStay();
                    return;
                }
                if (numEl) numEl.textContent = violationCdRemaining;
                if (hintEl) {
                    hintEl.innerHTML = `Returning to quiz in ${violationCdRemaining}s — <strong>Keep Trying!</strong>`;
                }
            }, 1000);
        }
    }

    function requestViolationHold(type) {
        if (violationHoldOpen || proctorEnded || quizEnded) return;
        const now = Date.now();
        if (now - lastLeaveTime < 600) return;
        lastLeaveTime = now;

        if (type === 'tab_switch' || type === 'window_switch') {
            tabSwitchCount = Math.max(tabSwitchCount, 1);
        updateSidebarBadge(tabSwitchCount);
        }

        const violation = { type };
        if (document.hidden && (type === 'tab_switch' || type === 'window_switch')) {
            pendingViolation = violation;
            armPreventionFreeze();
            return;
        }
        openViolationHold(violation);
    }

    const onProctorPaste = (e) => {
        if (e.target?.matches?.('input[type="file"]')) return;
        e.preventDefault();
        e.stopPropagation();
        requestViolationHold('paste');
    };

    const onProctorCopy = (e) => {
        if (e.target?.matches?.('input[type="file"]')) return;
        if (e.target.closest('.tq-question input, .tq-question textarea')) return;
        e.preventDefault();
        e.stopPropagation();
        requestViolationHold('copy');
    };

    const onProctorVisibility = () => {
        if (proctorEnded || quizEnded) return;
        if (document.hidden) {
            requestViolationHold('tab_switch');
        } else if (pendingViolation && !violationHoldOpen) {
            openViolationHold(pendingViolation);
        }
    };

    const onProctorBlur = () => {
        if (proctorEnded || quizEnded || violationHoldOpen || document.hidden) return;
        requestViolationHold('window_switch');
    };

    const onProctorGuardKey = (e) => {
        if (violationHoldOpen || proctorEnded || quizEnded) return;
        const key = (e.key || '').toLowerCase();
        const inAnswerField = e.target?.closest?.('.tq-question input, .tq-question textarea');

        if (key === 'printscreen') {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard?.writeText('').catch(() => {});
            requestViolationHold('screenshot');
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's'].includes(key)) {
            e.preventDefault();
            e.stopPropagation();
            requestViolationHold('screenshot');
            return;
        }
        if (e.ctrlKey && key === 'tab') {
            e.preventDefault();
            e.stopPropagation();
            requestViolationHold('tab_switch');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && key === 'v' && inAnswerField) {
            e.preventDefault();
            e.stopPropagation();
            requestViolationHold('paste');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && key === 'c' && !inAnswerField) {
            e.preventDefault();
            e.stopPropagation();
            requestViolationHold('copy');
        }
    };

    const onLeaveBeforeUnload = (e) => {
        if (proctorEnded || quizEnded) return;
        e.preventDefault();
        e.returnValue = `Are you sure you want to exit the quiz? ${formatQuizAttemptWarning()}`;
    };

    function showQuizEndedOverlay(msg, reason = 'tab_switch') {
        injectPreQuizStyles();
        document.getElementById('tq-ended-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tq-ended-overlay';
        overlay.className = 'tq-modal-overlay';
        overlay.style.zIndex = '10001';
        const reasonDetails = reason === 'tab_switch'
            ? [
                'You left this tab or switched to another window.',
                'Your answers so far are being submitted automatically.',
                'You cannot retake this attempt unless your instructor allows another try.'
            ]
            : ['Your answers are being submitted.'];
        overlay.innerHTML = `
            <div class="tq-modal" style="max-width:440px;text-align:left;padding:0;overflow:hidden;border-radius:18px;">
                <div style="background:#6B0F1A;padding:22px 28px;color:#fff;text-align:center;">
                    <div style="font-size:36px;margin-bottom:8px;">${icon('siren', { size: 36 })}</div>
                    <h3 style="color:#fff;margin:0;font-size:18px;">Quiz Ended</h3>
                    <p style="margin:6px 0 0;font-size:13px;opacity:.88;">${esc(quizSubtitle)}</p>
                </div>
                <div style="padding:24px 28px 28px;">
                    <p style="font-size:14px;color:#262626;font-weight:600;margin:0 0 12px;line-height:1.5;">${esc(msg)}</p>
                    <ul class="tq-notice-detail" style="margin-bottom:16px;">
                        ${reasonDetails.map(d => `<li>${esc(d)}</li>`).join('')}
                    </ul>
                    <p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">Please wait while we save your work…</p>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    function startLeaveConfirmationGuard() {
        document.addEventListener('visibilitychange', onProctorVisibility);
        window.addEventListener('blur', onProctorBlur);
        window.addEventListener('beforeunload', onLeaveBeforeUnload);
    }

    function cleanupLeaveConfirmationGuard() {
        document.removeEventListener('visibilitychange', onProctorVisibility);
        window.removeEventListener('blur', onProctorBlur);
        window.removeEventListener('beforeunload', onLeaveBeforeUnload);
        closeViolationHold();
        disarmPreventionFreeze();
        pendingViolation = null;
    }

    function armQuizLeaveProtection() {
        setQuizInProgress(true);
        registerQuizLeaveHandlers({
            onConfirmLeave: (source, resolve) => {
                if (quizEnded || proctorEnded) {
                    resolve(true);
                    return;
                }
                const type = source === 'navigation' ? 'navigation' : 'tab_switch';
                openViolationHold({ type }, {
                    onStay: () => resolve(false),
                    onLeave: () => {
                        closeViolationHold();
                        resolve(true);
                    },
                });
            },
            onConfirmedExit: async () => {
                if (isProctored && !quizEnded && !proctorEnded) {
                    await submitQuiz('navigation');
                }
            },
        });
    }

    function startProctoring() {
        document.body.classList.add('tq-secure-mode');
        startLeaveConfirmationGuard();
        document.addEventListener('keydown', onProctorGuardKey, true);
        document.addEventListener('paste', onProctorPaste, true);
        document.addEventListener('copy', onProctorCopy, true);
        document.addEventListener('cut', onProctorPaste, true);
    }

    function cleanupProctoring() {
        document.body.classList.remove('tq-secure-mode');
        cleanupLeaveConfirmationGuard();
        document.removeEventListener('keydown', onProctorGuardKey, true);
        document.removeEventListener('paste', onProctorPaste, true);
        document.removeEventListener('copy', onProctorCopy, true);
        document.removeEventListener('cut', onProctorPaste, true);
        document.getElementById('tq-violation-flash')?.remove();
        document.getElementById('tq-ended-overlay')?.remove();
    }

    function showActionNotice(title, detail, variant = 'warn') {
        injectPreQuizStyles();
        let toast = document.getElementById('tq-action-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tq-action-toast';
            toast.className = 'tq-action-toast';
            document.body.appendChild(toast);
        }
        toast.className = 'tq-action-toast' + (variant === 'danger' ? ' danger' : '');
        toast.innerHTML = `
            <span class="tq-action-toast-icon">${icon(variant === 'danger' ? 'siren' : 'warning', { size: 20 })}</span>
            <div class="tq-action-toast-body">
                <strong>${esc(title)}</strong>
                <span>${esc(detail)}</span>
            </div>`;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');
        clearTimeout(pasteToastTimer);
        pasteToastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
    }

    function showSecurityToast(text) {
        showActionNotice('Action not allowed', text, 'warn');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Paste-block toast ─────────────────────────────────────────────────────
    let pasteToastTimer = null;
    function showPasteBlockedToast() {
        showActionNotice(
            'Paste blocked',
            'You must type your own answer. Copy and paste is disabled during this quiz.',
            'warn'
        );
    }
    // ─────────────────────────────────────────────────────────────────────────

    function showProctorBriefing(onContinue) {
        injectPreQuizStyles();
        const timeMins = quiz.time_limit || 30;
        container.innerHTML = `
            <div class="tq-pre">
                <div class="tq-pre-hero">
                    <div class="tq-pre-hero-badge">${icon('eyeOff', { size: 14 })} Proctored Quiz</div>
                    <h2>Before You Begin</h2>
                    <p>Read these rules carefully. You must follow them for the entire quiz.</p>
                </div>
                <div class="tq-pre-card">
                    <div class="tq-pre-body">
                        <p style="font-size:15px;font-weight:700;color:#1a1a1a;margin:0 0 16px;text-align:center;">${esc(quiz.title)}</p>
                        <div class="tq-pre-meta">
                            <div class="tq-pre-meta-item"><span class="tq-pre-meta-val">${questions.length}</span><span class="tq-pre-meta-lbl">Questions</span></div>
                            <div class="tq-pre-meta-item"><span class="tq-pre-meta-val">${totalPoints}</span><span class="tq-pre-meta-lbl">Points</span></div>
                            <div class="tq-pre-meta-item"><span class="tq-pre-meta-val">${timeMins} min</span><span class="tq-pre-meta-lbl">Time Limit</span></div>
                            <div class="tq-pre-meta-item"><span class="tq-pre-meta-val">${quiz.passing_rate}%</span><span class="tq-pre-meta-lbl">To Pass</span></div>
                            ${quiz.attempts_remaining != null
                                ? `<div class="tq-pre-meta-item"><span class="tq-pre-meta-val">${quiz.attempts_remaining}</span><span class="tq-pre-meta-lbl">Attempts Left</span></div>`
                                : ''}
                        </div>
                        <p class="tq-pre-section-title do-title">${icon('check', inl)} What you must do</p>
                        <ul class="tq-pre-rules">
                            <li class="tq-pre-rule do">
                                <span class="tq-pre-rule-icon">✓</span>
                                <div><strong>Stay on this browser tab</strong>Keep this window open and in focus for the whole quiz.</div>
                            </li>
                            <li class="tq-pre-rule do">
                                <span class="tq-pre-rule-icon">✓</span>
                                <div><strong>Answer on your own</strong>Use only your own knowledge. The AI assistant is turned off.</div>
                            </li>
                            <li class="tq-pre-rule do">
                                <span class="tq-pre-rule-icon">✓</span>
                                <div><strong>Complete in one sitting</strong>The timer starts after a short countdown. Submit before time runs out.</div>
                            </li>
                        </ul>
                        <p class="tq-pre-section-title dont-title">${icon('siren', inl)} What you must NOT do</p>
                        <ul class="tq-pre-rules">
                            <li class="tq-pre-rule dont">
                                <span class="tq-pre-rule-icon">✕</span>
                                <div><strong>Do not switch tabs without confirming</strong>If you open another tab, you will be asked whether you are sure you want to exit — ${esc(formatQuizAttemptWarning())}</div>
                            </li>
                            <li class="tq-pre-rule dont">
                                <span class="tq-pre-rule-icon">✕</span>
                                <div><strong>Do not copy, paste, or screenshot</strong>Pasting answers and taking screenshots are blocked.</div>
                            </li>
                            <li class="tq-pre-rule dont">
                                <span class="tq-pre-rule-icon">✕</span>
                                <div><strong>Do not leave this page</strong>Closing, refreshing, or navigating away may submit your attempt.</div>
                            </li>
                        </ul>
                        <ul class="tq-pre-rules" style="margin-top:-8px">
                            <li class="tq-pre-rule warn">
                                <span class="tq-pre-rule-icon">!</span>
                                <div><strong>Tab change notice</strong>Choose <strong>No, continue quiz</strong> to keep answering, or <strong>Yes, exit quiz</strong> to leave.</div>
                            </li>
                        </ul>
                        <div class="tq-pre-agree" id="tq-agree-wrap">
                            <input type="checkbox" id="tq-agree-cb">
                            <label for="tq-agree-cb">I understand these rules and I am ready to begin. I will stay on this tab and follow all proctoring requirements.</label>
                        </div>
                        <div class="tq-pre-actions">
                            <button type="button" class="tq-pre-btn ghost" id="tq-not-yet-btn">${icon('close', inl)} Not yet</button>
                            <button type="button" class="tq-pre-btn primary" id="tq-start-btn" disabled>${icon('quiz', inl)} I'm ready — start countdown</button>
                        </div>
                    </div>
                </div>
            </div>`;

        const cb = container.querySelector('#tq-agree-cb');
        const btn = container.querySelector('#tq-start-btn');
        cb.addEventListener('change', () => { btn.disabled = !cb.checked; });
        container.querySelector('#tq-agree-wrap').addEventListener('click', (e) => {
            if (e.target === cb || e.target.tagName === 'LABEL') return;
            cb.checked = !cb.checked;
            btn.disabled = !cb.checked;
        });
        btn.addEventListener('click', () => { if (cb.checked) onContinue(); });
        container.querySelector('#tq-not-yet-btn')?.addEventListener('click', () => {
            clearQuizProctoring();
            window.location.hash = subjectBack;
        });
    }

    function showPreQuizCountdown(seconds, onComplete) {
        let remaining = seconds;
        const total = seconds;
        let cdTimer = null;
        let cdAborted = false;
        let cdPaused = false;
        let cdPendingViolation = null;
        const ringR = 62;
        const ringC = 2 * Math.PI * ringR;

        const updateRing = () => {
            const fg = container.querySelector('#tq-cd-ring-fg');
            const num = container.querySelector('#tq-cd-num');
            const status = container.querySelector('#tq-cd-status');
            if (fg) fg.style.strokeDashoffset = String(ringC * (1 - remaining / total));
            if (num) num.textContent = remaining;
            if (status) {
                status.textContent = remaining > 1
                    ? `Starting in ${remaining} seconds…`
                    : remaining === 1 ? 'Starting in 1 second…' : 'Starting now…';
            }
        };

        const stopCdListeners = () => {
            document.removeEventListener('visibilitychange', onCdVisibility);
            window.removeEventListener('blur', onCdBlur);
        };

        const abortCountdown = (message) => {
            if (cdAborted) return;
            cdAborted = true;
            clearInterval(cdTimer);
            stopCdListeners();
            closeViolationHold();
            clearQuizProctoring();
            Api.post('/QuizAttemptsAPI.php?action=proctor-unlock', {}).catch(() => {});
            showProctorNotice(container, {
                variant: 'danger',
                title: 'Quiz Not Started',
                message,
                details: [
                    'You chose to leave before the quiz began.',
                    'Open the quiz again when you are ready and stay on this tab.'
                ],
                backHref: quizzesBack,
                backLabel: 'Try again when ready'
            });
        };

        const resumeCountdown = () => {
            cdPaused = false;
            cdPendingViolation = null;
            clearInterval(cdTimer);
            cdTimer = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(cdTimer);
                    stopCdListeners();
                    onComplete();
                } else {
                    updateRing();
                }
            }, 1000);
        };

        const showCdViolationHold = (type) => {
            clearInterval(cdTimer);
            cdPaused = true;
            openViolationHold({ type }, {
                stayLabel: 'Keep Trying! — Continue countdown',
                onStay: () => {
                    closeViolationHold();
                    flashKeepTrying(resumeCountdown);
                },
                onLeave: () => {
                    const msg = type === 'window_switch'
                        ? 'You chose to switch away before the quiz started.'
                        : 'You chose to leave this tab before the quiz started.';
                    abortCountdown(msg);
                }
            });
        };

        const onCdVisibility = () => {
            if (cdAborted || violationHoldOpen) return;
            if (document.hidden) {
                cdPendingViolation = { type: 'tab_switch' };
                clearInterval(cdTimer);
                cdPaused = true;
            } else if (cdPaused && cdPendingViolation) {
                showCdViolationHold(cdPendingViolation.type);
                cdPendingViolation = null;
            }
        };

        const onCdBlur = () => {
            if (document.hidden || cdAborted || violationHoldOpen || cdPaused) return;
            showCdViolationHold('window_switch');
        };

        container.innerHTML = `
            <div class="tq-pre">
                <div class="tq-pre-hero">
                    <div class="tq-pre-hero-badge">${icon('quiz', { size: 14 })} Starting Soon</div>
                    <h2>Get Ready</h2>
                    <p>${esc(quiz.title)}</p>
                </div>
                <div class="tq-pre-card">
                    <div class="tq-pre-body tq-cd-panel">
                        <div class="tq-cd-ring-wrap">
                            <svg viewBox="0 0 140 140" aria-hidden="true">
                                <circle class="tq-cd-ring-bg" cx="70" cy="70" r="${ringR}"></circle>
                                <circle class="tq-cd-ring-fg" id="tq-cd-ring-fg" cx="70" cy="70" r="${ringR}"
                                    stroke-dasharray="${ringC}" stroke-dashoffset="0"></circle>
                            </svg>
                            <div class="tq-cd-ring-num">
                                <span id="tq-cd-num">${remaining}</span>
                                <small>seconds</small>
                            </div>
                        </div>
                        <p class="tq-cd-status" id="tq-cd-status">Starting in ${remaining} seconds…</p>
                        <p class="tq-cd-sub">Do not move away from this screen. The quiz will begin automatically.</p>
                        <div class="tq-cd-warn-strip">
                            ${icon('warning', inl)} Stay on this tab — ${esc(formatQuizAttemptWarning())}
                        </div>
                    </div>
                </div>
            </div>`;

        document.addEventListener('visibilitychange', onCdVisibility);
        window.addEventListener('blur', onCdBlur);

        cdTimer = setInterval(() => {
            if (cdPaused) return;
            remaining--;
            if (remaining <= 0) {
                clearInterval(cdTimer);
                stopCdListeners();
                onComplete();
            } else {
                updateRing();
            }
        }, 1000);
    }

    function beginQuizSession() {
        if (!isProctored) armQuizLeaveProtection();
        startTime = Date.now();
    renderQuiz();
    }

    if (isProctored) {
        showProctorBriefing(() => {
            armQuizLeaveProtection();
            showPreQuizCountdown(3, beginQuizSession);
        });
    } else {
        beginQuizSession();
    }
}

function cleanQuestionText(text) {
    // Remove AI-generated prefixes like [1]:, [2]:, MC1:, TF1:, etc.
    return (text || '').replace(/^\s*\[?\d+\]?\s*[:.]?\s*/, '').replace(/^(MC|TF|FIB|SA|ESSAY)\d*\s*[:.]?\s*/i, '').trim();
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
