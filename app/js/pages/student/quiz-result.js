/**
 * Student Quiz Result Page
 * Display quiz attempt results with score and answer review
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { subjectHash } from './quizzes.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const attemptId = params.get('attempt_id');

    if (!attemptId) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">No attempt selected. <a href="#student/my-subjects" style="color:#1B4D3E">Go to My Subjects</a></div>';
        return;
    }

    const res = await Api.get('/ProgressAPI.php?action=quiz-result&attempt_id=' + attemptId);
    if (!res.success) {
        container.innerHTML = `<div style="text-align:center;padding:60px;color:#b91c1c">${res.message || 'Failed to load result'}</div>`;
        return;
    }

    const attempt = res.data.attempt;
    const answers = res.data.answers || [];
    const lessonsId = res.data.lessons_id || null;
    const lessonTitle = res.data.lesson_title || null;
    const pct = parseFloat(attempt.percentage || 0);
    const passed = attempt.passed == 1;
    const timeTaken = parseInt(attempt.time_spent || 0);
    const minutes = Math.floor(timeTaken / 60);
    const seconds = timeTaken % 60;

    container.innerHTML = `
        <style>
            .result-container { max-width:800px; margin:0 auto; }

            .result-hero { border-radius:16px; padding:40px; text-align:center; margin-bottom:24px; color:#fff; }
            .result-hero.pass { background:#00461B; }
            .result-hero.fail { background:#b91c1c; }
            .score-circle { width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
            .score-num { font-size:32px; font-weight:800; }
            .result-label { font-size:20px; font-weight:700; margin-bottom:4px; }
            .result-sub { opacity:.8; font-size:14px; }

            .stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
            .stat-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:16px; text-align:center; }
            .stat-card .num { font-size:20px; font-weight:800; color:#262626; }
            .stat-card .label { font-size:12px; color:#737373; margin-top:2px; }

            .actions-row { display:flex; gap:12px; margin-bottom:24px; justify-content:center; }
            .btn { padding:10px 20px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none; border:1px solid #e0e0e0; background:#fff; color:#404040; display:inline-block; }
            .btn:hover { background:#f5f5f5; }
            .btn.primary { background:#1B4D3E; color:#fff; border-color:#1B4D3E; }

            .review-section { margin-top:24px; }
            .review-title { font-size:18px; font-weight:700; color:#262626; margin-bottom:16px; }
            .answer-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:18px; margin-bottom:12px; }
            .ac-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
            .ac-num { font-size:13px; color:#737373; }
            .ac-badge { padding:3px 8px; border-radius:12px; font-size:11px; font-weight:600; }
            .ac-correct { background:#E8F5E9; color:#1B4D3E; }
            .ac-wrong { background:#FEE2E2; color:#b91c1c; }
            .ac-question { font-size:15px; font-weight:600; color:#262626; margin-bottom:12px; }
            .ac-options { display:flex; flex-direction:column; gap:6px; }
            .ac-option { padding:8px 12px; border-radius:8px; font-size:13px; display:flex; align-items:center; gap:8px; }
            .ac-option.correct-selected { background:#E8F5E9; border:1px solid #2D6A4F; color:#1B4D3E; }
            .ac-option.wrong-selected { background:#FEE2E2; border:1px solid #fca5a5; color:#b91c1c; }
            .ac-option.correct-answer { background:#f0fdf4; border:1px solid #bbf7d0; color:#1B4D3E; }
            .ac-option.neutral { background:#fafafa; border:1px solid #e8e8e8; color:#404040; }
            .ac-indicator { font-size:12px; font-weight:700; }

            .empty-state-sm { text-align:center; padding:20px; color:#737373; font-size:14px; }
            @media(max-width:768px) { .stats-row { grid-template-columns:1fr 1fr; } }
        </style>

        <div class="result-container">
            <div class="result-hero ${passed ? 'pass' : 'fail'}">
                <div class="score-circle"><span class="score-num">${pct.toFixed(1)}%</span></div>
                <div class="result-label">${passed ? 'Congratulations!' : 'Keep Trying!'}</div>
                <div class="result-sub">${esc(attempt.quiz_title)} · ${esc(attempt.subject_code)}</div>
            </div>

            <div class="stats-row">
                <div class="stat-card"><div class="num">${attempt.earned_points}/${attempt.total_points}</div><div class="label">Points</div></div>
                <div class="stat-card"><div class="num">${pct.toFixed(1)}%</div><div class="label">Score</div></div>
                <div class="stat-card"><div class="num">${minutes}:${String(seconds).padStart(2,'0')}</div><div class="label">Time</div></div>
                <div class="stat-card"><div class="num">${attempt.passing_rate}%</div><div class="label">Passing</div></div>
            </div>

            <div class="actions-row">
                ${attempt.subject_id ? `<a class="btn" href="${subjectHash(attempt.subject_id, 'classwork', { type: 'quiz', id: attempt.quiz_id })}">${icon('quiz', inl)} Back to Classwork</a>` : ''}
                ${passed ? `
                    ${lessonsId ? `<a class="btn primary" href="#student/lessons">${icon('checkCircle', inl)} Continue to Next Lesson</a>` : `<a class="btn primary" href="#student/lessons">Back to Lessons</a>`}
                ` : `
                    ${lessonsId ? `<a class="btn" style="background:#fff3cd;border-color:#f59e0b;color:#92400E" href="#student/lesson-view?id=${lessonsId}">${icon('lessons', inl)} Re-study: ${esc(lessonTitle || 'Lesson')} <span style="font-size:10px;opacity:.7;">(${esc(attempt.subject_code)})</span></a>` : `<a class="btn" style="background:#fff3cd;border-color:#f59e0b;color:#92400E" href="#student/lessons">${icon('lessons', inl)} Back to Lessons</a>`}
                `}
            </div>
            ${!passed ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#92400E;text-align:center;">
                <strong>You did not meet the passing rate of ${attempt.passing_rate}%.</strong><br>
                Please re-study the lesson and retake the quiz.
            </div>` : `<div style="background:#E8F5E9;border:1px solid #A7F3D0;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#065F46;text-align:center;">
                <strong>Congratulations! You passed.</strong>${lessonsId ? ' The next lesson is now unlocked.' : ''}
            </div>`}

            ${answers.length > 0 ? `
            <div class="review-section">
                <div class="review-title">Answer Review</div>
                ${answers.map((a, i) => {
                    const isCorrect = a.is_correct == 1;
                    return `
                    <div class="answer-card">
                        <div class="ac-header">
                            <span class="ac-num">Question ${i+1}</span>
                            <span class="ac-badge ${isCorrect ? 'ac-correct' : 'ac-wrong'}">${isCorrect ? 'Correct' : 'Wrong'} · ${a.points_earned}/${a.points} pts</span>
                        </div>
                        <div class="ac-question">${esc(a.question_text)}</div>
                        <div class="ac-options">
                            ${(a.options||[]).map(o => {
                                const isSelected = o.option_id == a.selected_option_id;
                                const isCorrectOpt = o.is_correct == 1;
                                let cls = 'neutral';
                                let indicator = '';
                                if (isSelected && isCorrectOpt) { cls = 'correct-selected'; indicator = `${icon('check', inl)} Your answer`; }
                                else if (isSelected && !isCorrectOpt) { cls = 'wrong-selected'; indicator = `${icon('close', inl)} Your answer`; }
                                else if (isCorrectOpt) { cls = 'correct-answer'; indicator = `${icon('check', inl)} Correct`; }
                                return `<div class="ac-option ${cls}">
                                    <span>${esc(o.option_text)}</span>
                                    ${indicator ? `<span class="ac-indicator">${indicator}</span>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>` : '<div class="empty-state-sm">Answer review is not available for this quiz</div>'}
        </div>
    `;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
