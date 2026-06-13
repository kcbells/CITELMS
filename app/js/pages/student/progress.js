/**
 * Student Progress Page — Professional Redesign
 * Track lesson completion and quiz scores per subject
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const filterSubject = params.get('subject_id') || '';

    const subjRes = await Api.get('/EnrollmentAPI.php?action=my-subjects');
    const subjects = subjRes.success ? subjRes.data : [];

    container.innerHTML = `
        <style>
            /* ─── Progress Page Layout ─── */
            .sp-wrap { max-width:100%; width:100%; }
            .sp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .sp-header h2 { font-size:22px; font-weight:700; color:#262626; margin:0; }
            .sp-select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:260px; background:#fff; }
            .sp-select:focus { outline:none; border-color:#1B4D3E; }

            /* ─── Subject Banner ─── */
            .sp-banner { background:#00461B; border-radius:14px; padding:28px 32px; margin-bottom:24px; color:#fff; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }
            .sp-banner-left h3 { font-size:20px; font-weight:700; margin:0 0 4px; }
            .sp-banner-left p { font-size:14px; margin:0; opacity:.85; }
            .sp-banner-ring { position:relative; width:90px; height:90px; flex-shrink:0; }
            .sp-banner-ring svg { width:90px; height:90px; transform:rotate(-90deg); }
            .sp-banner-ring .ring-text { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:800; color:#fff; }

            /* ─── Stat Cards Row ─── */
            .sp-stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(155px, 1fr)); gap:14px; margin-bottom:28px; }
            .sp-stat { background:#fff; border:1px solid #f1f5f9; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.07); padding:18px; display:flex; align-items:flex-start; gap:12px; }
            .sp-stat-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
            .sp-stat-icon.green { background:#E8F5E9; }
            .sp-stat-icon.blue { background:#DBEAFE; }
            .sp-stat-icon.purple { background:#EDE9FE; }
            .sp-stat-icon.amber { background:#FEF3C7; }
            .sp-stat-icon.red { background:#FEE2E2; }
            .sp-stat-body {}
            .sp-stat-val { font-size:22px; font-weight:800; color:#262626; line-height:1.1; }
            .sp-stat-label { font-size:12px; color:#737373; margin-top:2px; }

            /* ─── Two-Column Layout ─── */
            .sp-columns { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }

            /* ─── Section Cards ─── */
            .sp-section { background:#fff; border:1px solid #f1f5f9; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.07); overflow:hidden; }
            .sp-section-head { padding:16px 20px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; justify-content:space-between; }
            .sp-section-title { font-size:15px; font-weight:700; color:#262626; display:flex; align-items:center; gap:8px; }
            .sp-section-badge { font-size:11px; background:#f5f5f5; color:#737373; padding:2px 8px; border-radius:10px; font-weight:600; }
            .sp-section-body { padding:16px 20px; }

            /* ─── Lesson Timeline ─── */
            .sp-timeline { position:relative; padding-left:28px; }
            .sp-timeline::before { content:''; position:absolute; left:11px; top:8px; bottom:8px; width:2px; background:#e8e8e8; border-radius:1px; }
            .sp-tl-item { position:relative; padding:10px 0 10px 0; display:flex; align-items:center; gap:12px; }
            .sp-tl-dot { position:absolute; left:-28px; top:50%; transform:translateY(-50%); width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; z-index:1; }
            .sp-tl-dot.done { background:#1B4D3E; color:#fff; }
            .sp-tl-dot.pending { background:#fff; border:2px solid #d0d0d0; color:#d0d0d0; }
            .sp-tl-content { flex:1; min-width:0; }
            .sp-tl-title { font-size:14px; font-weight:600; color:#262626; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sp-tl-title.done-text { color:#1B4D3E; }
            .sp-tl-meta { font-size:11px; color:#a0a0a0; margin-top:1px; }
            .sp-tl-badge { padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700; flex-shrink:0; text-transform:uppercase; letter-spacing:.3px; }
            .sp-tl-badge.done { background:#E8F5E9; color:#1B4D3E; }
            .sp-tl-badge.pending { background:#FEF3C7; color:#B45309; }

            /* ─── Quiz Score Cards ─── */
            .sp-quiz-list { display:flex; flex-direction:column; gap:10px; }
            .sp-quiz { display:flex; align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid #f5f5f5; }
            .sp-quiz:last-child { border-bottom:none; }
            .sp-quiz-score-ring { position:relative; width:52px; height:52px; flex-shrink:0; }
            .sp-quiz-score-ring svg { width:52px; height:52px; transform:rotate(-90deg); }
            .sp-quiz-score-ring .ring-val { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:11px; font-weight:800; }
            .sp-quiz-info { flex:1; min-width:0; }
            .sp-quiz-name { font-size:14px; font-weight:600; color:#262626; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sp-quiz-meta { font-size:11px; color:#a0a0a0; margin-top:2px; display:flex; gap:10px; flex-wrap:wrap; }
            .sp-quiz-type { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; flex-shrink:0; }
            .sp-quiz-type.pre { background:#DBEAFE; color:#1E40AF; }
            .sp-quiz-type.post { background:#EDE9FE; color:#6D28D9; }
            .sp-quiz-type.regular { background:#f5f5f5; color:#737373; }
            .sp-quiz-status { padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700; text-transform:uppercase; flex-shrink:0; }
            .sp-quiz-status.passed { background:#E8F5E9; color:#1B4D3E; }
            .sp-quiz-status.failed { background:#FEE2E2; color:#b91c1c; }
            .sp-quiz-status.nottaken { background:#f5f5f5; color:#a0a0a0; }

            /* ─── Performance Bars ─── */
            .sp-perf-section { margin-bottom:28px; }
            .sp-perf-title { font-size:15px; font-weight:700; color:#262626; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
            .sp-perf-bars { display:flex; flex-direction:column; gap:12px; }
            .sp-bar-item { display:flex; align-items:center; gap:12px; }
            .sp-bar-label { font-size:13px; font-weight:600; color:#404040; width:140px; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .sp-bar-track { flex:1; height:24px; background:#f5f5f5; border-radius:12px; overflow:hidden; position:relative; }
            .sp-bar-fill { height:100%; border-radius:12px; display:flex; align-items:center; justify-content:flex-end; padding-right:10px; font-size:11px; font-weight:700; color:#fff; min-width:fit-content; transition:width .5s ease; }
            .sp-bar-fill.high { background:#1B4D3E; }
            .sp-bar-fill.mid { background:#B45309; }
            .sp-bar-fill.low { background:#b91c1c; }
            .sp-bar-val { font-size:12px; font-weight:700; color:#404040; width:52px; text-align:right; flex-shrink:0; }

            /* ─── Empty & Loading ─── */
            .sp-empty { text-align:center; padding:60px 20px; color:#a0a0a0; }
            .sp-empty-icon { font-size:40px; margin-bottom:12px; }
            .sp-empty-text { font-size:15px; font-weight:500; }
            .sp-empty-sub { font-size:13px; margin-top:4px; }
            .sp-loading { text-align:center; padding:60px; color:#737373; }

            /* ─── Responsive ─── */
            @media(max-width:860px) {
                .sp-columns { grid-template-columns:1fr; }
                .sp-stats { grid-template-columns:repeat(2, 1fr); }
                .sp-banner { flex-direction:column; text-align:center; }
            }
            @media(max-width:500px) {
                .sp-stats { grid-template-columns:1fr; }
                .sp-bar-label { width:90px; font-size:12px; }
            }

            .btn-back {
                display: inline-flex; align-items: center; gap: 6px;
                font-size: 13px; font-weight: 600; color: #6B7280;
                text-decoration: none; margin-bottom: 16px;
                transition: color .15s;
            }
            .btn-back:hover { color: #1B4D3E; }
        </style>

        <a href="#student/my-subjects" class="btn-back">← Back to My Subjects</a>

        <div class="sp-wrap">
            <div class="sp-header">
                <h2>My Progress</h2>
                <select class="sp-select" id="sp-filter">
                    <option value="">Select a subject...</option>
                    ${subjects.map(s => `<option value="${s.subject_id}" ${filterSubject==s.subject_id?'selected':''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                </select>
            </div>
            <div id="sp-content">
                ${filterSubject ? '<div class="sp-loading">Loading progress...</div>' :
                  `<div class="sp-empty">
                      <div class="sp-empty-icon">${iconLg('chart')}</div>
                      <div class="sp-empty-text">Select a subject to view your progress</div>
                      <div class="sp-empty-sub">Choose from the dropdown above to get started</div>
                  </div>`}
            </div>
        </div>
    `;

    container.querySelector('#sp-filter').addEventListener('change', (e) => {
        if (e.target.value) window.location.hash = `#student/progress?subject_id=${e.target.value}`;
    });

    if (filterSubject) loadProgress(container, filterSubject);
}

async function loadProgress(container, subjectId) {
    const content = container.querySelector('#sp-content');
    const res = await Api.get('/ProgressAPI.php?action=subject-progress&subject_id=' + subjectId);

    if (!res.success) {
        content.innerHTML = `<div class="sp-empty"><div class="sp-empty-icon">${iconLg('warning')}</div><div class="sp-empty-text">Failed to load progress</div></div>`;
        return;
    }

    const d = res.data;
    const lessons = d.lessons || [];
    const quizzes = d.quizzes || [];
    const subj = d.subject || {};
    const overallPct = d.progress || 0;
    const lessonPct = d.lesson_progress || 0;
    const completedLessons = d.completed_lessons || 0;
    const totalLessons = d.total_lessons || 0;
    const quizzesAttempted = d.quizzes_attempted || 0;
    const quizzesPassed = d.quizzes_passed || 0;
    const totalQuizzes = d.total_quizzes || 0;
    const avgScore = d.avg_score;

    content.innerHTML = `
        <!-- Subject Banner with Overall Progress Ring -->
        <div class="sp-banner">
            <div class="sp-banner-left">
                <h3>${esc(subj.subject_code || '')} — ${esc(subj.subject_name || '')}</h3>
                <p>${completedLessons} of ${totalLessons} lessons completed · ${quizzesPassed} of ${totalQuizzes} quizzes passed</p>
            </div>
            <div class="sp-banner-ring">
                ${buildRing(overallPct, 40, 5, 'rgba(255,255,255,0.2)', '#fff')}
                <span class="ring-text">${overallPct}%</span>
            </div>
        </div>

        <!-- Stat Cards -->
        <div class="sp-stats">
            <div class="sp-stat">
                <div class="sp-stat-icon green">${icon('lessons', { size: 22 })}</div>
                <div class="sp-stat-body">
                    <div class="sp-stat-val">${completedLessons}/${totalLessons}</div>
                    <div class="sp-stat-label">Lessons Done</div>
                </div>
            </div>
            <div class="sp-stat">
                <div class="sp-stat-icon blue">${icon('quiz', { size: 22 })}</div>
                <div class="sp-stat-body">
                    <div class="sp-stat-val">${quizzesAttempted}/${totalQuizzes}</div>
                    <div class="sp-stat-label">Quizzes Taken</div>
                </div>
            </div>
            <div class="sp-stat">
                <div class="sp-stat-icon green">${icon('check', { size: 22 })}</div>
                <div class="sp-stat-body">
                    <div class="sp-stat-val">${quizzesPassed}</div>
                    <div class="sp-stat-label">Quizzes Passed</div>
                </div>
            </div>
            <div class="sp-stat">
                <div class="sp-stat-icon purple">${icon('chart', { size: 22 })}</div>
                <div class="sp-stat-body">
                    <div class="sp-stat-val">${avgScore !== null ? avgScore + '%' : '—'}</div>
                    <div class="sp-stat-label">Avg Quiz Score</div>
                </div>
            </div>
            <div class="sp-stat">
                <div class="sp-stat-icon amber">${icon('checkCircle', { size: 22 })}</div>
                <div class="sp-stat-body">
                    <div class="sp-stat-val">${lessonPct}%</div>
                    <div class="sp-stat-label">Lesson Progress</div>
                </div>
            </div>
        </div>

        <!-- Two-Column: Lessons + Quizzes -->
        <div class="sp-columns">
            <!-- Lesson Timeline -->
            <div class="sp-section">
                <div class="sp-section-head">
                    <span class="sp-section-title">${icon('lessons', inl)} Learning Path</span>
                    <span class="sp-section-badge">${completedLessons}/${totalLessons} done</span>
                </div>
                <div class="sp-section-body">
                    ${lessons.length === 0 ?
                      '<div style="padding:20px;text-align:center;color:#a0a0a0;font-size:13px;">No lessons published yet</div>' :
                      `<div class="sp-timeline">
                          ${lessons.map(l => {
                              const done = l.is_completed == 1;
                              return `
                              <div class="sp-tl-item">
                                  <div class="sp-tl-dot ${done ? 'done' : 'pending'}">${done ? icon('check', { size: 12 }) : l.lesson_order}</div>
                                  <div class="sp-tl-content">
                                      <div class="sp-tl-title ${done ? 'done-text' : ''}">${esc(l.lesson_title)}</div>
                                      ${done && l.completed_at ?
                                          `<div class="sp-tl-meta">Completed ${fmtDate(l.completed_at)}</div>` :
                                          `<div class="sp-tl-meta">Not started</div>`}
                                  </div>
                                  <span class="sp-tl-badge ${done ? 'done' : 'pending'}">${done ? 'Done' : 'Pending'}</span>
                              </div>`;
                          }).join('')}
                      </div>`}
                </div>
            </div>

            <!-- Quiz Scores -->
            <div class="sp-section">
                <div class="sp-section-head">
                    <span class="sp-section-title">${icon('quiz', inl)} Quiz Results</span>
                    <span class="sp-section-badge">${quizzesPassed}/${totalQuizzes} passed</span>
                </div>
                <div class="sp-section-body">
                    ${quizzes.length === 0 ?
                      '<div style="padding:20px;text-align:center;color:#a0a0a0;font-size:13px;">No quizzes published yet</div>' :
                      `<div class="sp-quiz-list">
                          ${quizzes.map(q => {
                              const score = q.best_score !== null ? parseFloat(q.best_score) : null;
                              const passed = score !== null && score >= parseFloat(q.passing_rate);
                              const tCls = q.quiz_type === 'pre_test' ? 'pre' : q.quiz_type === 'post_test' ? 'post' : 'regular';
                              const tLabel = q.quiz_type === 'pre_test' ? 'Pre-Test' : q.quiz_type === 'post_test' ? 'Post-Test' : 'Quiz';
                              const ringColor = score === null ? '#e0e0e0' : passed ? '#1B4D3E' : '#b91c1c';
                              const ringBg = '#f0f0f0';
                              const statusCls = score === null ? 'nottaken' : passed ? 'passed' : 'failed';
                              const statusLabel = score === null ? 'Not Taken' : passed ? 'Passed' : 'Failed';
                              return `
                              <div class="sp-quiz">
                                  <div class="sp-quiz-score-ring">
                                      ${buildRing(score !== null ? score : 0, 22, 4, ringBg, ringColor)}
                                      <span class="ring-val" style="color:${ringColor}">${score !== null ? Math.round(score) + '%' : '—'}</span>
                                  </div>
                                  <div class="sp-quiz-info">
                                      <div class="sp-quiz-name">${esc(q.quiz_title)}</div>
                                      <div class="sp-quiz-meta">
                                          <span class="sp-quiz-type ${tCls}">${tLabel}</span>
                                          <span>Pass: ${q.passing_rate}%</span>
                                          ${q.attempts_used ? `<span>${q.attempts_used} attempt${q.attempts_used != 1 ? 's' : ''}</span>` : ''}
                                          ${q.best_earned !== null ? `<span>${q.best_earned}/${q.best_total} pts</span>` : ''}
                                      </div>
                                  </div>
                                  <span class="sp-quiz-status ${statusCls}">${statusLabel}</span>
                              </div>`;
                          }).join('')}
                      </div>`}
                </div>
            </div>
        </div>

        <!-- Performance Bars (only if quizzes attempted) -->
        ${quizzes.filter(q => q.best_score !== null).length > 0 ? `
        <div class="sp-section sp-perf-section">
            <div class="sp-section-head">
                <span class="sp-section-title">${icon('chart', inl)} Quiz Performance Overview</span>
            </div>
            <div class="sp-section-body">
                <div class="sp-perf-bars">
                    ${quizzes.filter(q => q.best_score !== null).map(q => {
                        const score = parseFloat(q.best_score);
                        const barCls = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
                        const width = Math.max(score, 8);
                        return `
                        <div class="sp-bar-item">
                            <span class="sp-bar-label" title="${esc(q.quiz_title)}">${esc(q.quiz_title)}</span>
                            <div class="sp-bar-track">
                                <div class="sp-bar-fill ${barCls}" style="width:${width}%">${score >= 20 ? score.toFixed(1) + '%' : ''}</div>
                                <div style="position:absolute;left:${q.passing_rate}%;top:0;bottom:0;width:2px;background:#262626;opacity:0.3;" title="Passing: ${q.passing_rate}%"></div>
                            </div>
                            <span class="sp-bar-val">${score.toFixed(1)}%</span>
                        </div>`;
                    }).join('')}
                </div>
                <div style="margin-top:10px;font-size:11px;color:#a0a0a0;display:flex;align-items:center;gap:14px;">
                    <span>■ <span style="color:#1B4D3E">75%+</span></span>
                    <span>■ <span style="color:#B45309">50-74%</span></span>
                    <span>■ <span style="color:#b91c1c">&lt;50%</span></span>
                    <span>│ Passing line</span>
                </div>
            </div>
        </div>` : ''}
    `;
}

/** Build an SVG ring */
function buildRing(pct, r, strokeW, bgColor, fgColor) {
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    const size = (r + strokeW) * 2;
    const center = r + strokeW;
    return `<svg viewBox="0 0 ${size} ${size}">
        <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="${bgColor}" stroke-width="${strokeW}"/>
        <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="${fgColor}" stroke-width="${strokeW}"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
    </svg>`;
}

function fmtDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
