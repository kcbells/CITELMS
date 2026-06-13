/**
 * Student quizzes — shown inside each subject (tab=quizzes on subject page)
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

/** Build hash for a subject page */
export function subjectHash(subjectId, tab = 'classwork', work = null) {
    const p = new URLSearchParams();
    p.set('subject_id', subjectId);
    if (tab && tab !== 'classwork') p.set('tab', tab);
    if (work?.type && work?.id) {
        p.set('work', work.type);
        p.set('work_id', work.id);
    }
    return `#student/subject?${p.toString()}`;
}

/** Legacy route — redirect into subject classwork */
export async function render() {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId = params.get('subject_id') || '';
    window.location.hash = subjectId
        ? subjectHash(subjectId, 'classwork')
        : '#student/my-subjects';
}

/**
 * @param {HTMLElement} container
 * @param {{ filterSubject?: string, embedded?: boolean }} opts
 */
export async function renderQuizzesPanel(container, opts = {}) {
    const filterSubject = opts.filterSubject || '';

    container.innerHTML = `<div class="ms-loading"><div class="ms-spin"></div></div>`;

    const quizRes = await Api.get('/ProgressAPI.php?action=student-quizzes' + (filterSubject ? `&subject_id=${filterSubject}` : ''));
    const quizzes = quizRes.success ? quizRes.data : [];

    const total = quizzes.length;
    const passed = quizzes.filter(q => q.quiz_status === 'passed').length;
    const attempted = quizzes.filter(q => q.quiz_status === 'attempted').length;
    const available = quizzes.filter(q => q.can_take).length;

    const quizGrid = quizzes.length === 0
        ? `<div class="qp-empty">
               <div class="qp-empty-icon">${iconLg('quiz')}</div>
               <h3>No quizzes available</h3>
               <p>Your instructor hasn't published any quizzes for this class yet.<br>Check back soon.</p>
           </div>`
        : `<div class="qp-grid">${quizzes.map(q => renderQuizCard(q)).join('')}</div>`;

    container.innerHTML = `
        <style>${quizStyles()}</style>
        <div class="qp-wrap">
            <div class="qp-stats-row">
                <div class="qp-stat-card">
                    <div class="qp-stat-val">${total}</div>
                    <div class="qp-stat-lbl">Total</div>
                </div>
                <div class="qp-stat-card green">
                    <div class="qp-stat-val">${passed}</div>
                    <div class="qp-stat-lbl">Passed</div>
                </div>
                <div class="qp-stat-card amber">
                    <div class="qp-stat-val">${attempted}</div>
                    <div class="qp-stat-lbl">Attempted</div>
                </div>
                <div class="qp-stat-card blue">
                    <div class="qp-stat-val">${available}</div>
                    <div class="qp-stat-lbl">Available</div>
                </div>
            </div>

            <div id="qp-body">${quizGrid}</div>
        </div>
    `;
}

function quizStyles() {
    return `
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .qp-wrap { animation: fadeUp .3s ease; }
        .qp-back {
            display:inline-flex; align-items:center; gap:6px;
            font-size:13px; font-weight:600; color:#6B7280;
            text-decoration:none; margin-bottom:20px;
        }
        .qp-back:hover { color:#00461B; }
        .qp-stats-row {
            display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px;
        }
        .qp-stat-card {
            background:#fff; border:1px solid #E5E7EB; border-radius:12px;
            padding:14px 20px; text-align:center; min-width:88px;
            box-shadow:0 1px 3px rgba(0,0,0,.04);
        }
        .qp-stat-val { font-size:22px; font-weight:800; color:#111827; line-height:1; }
        .qp-stat-lbl { font-size:11px; color:#6B7280; margin-top:4px; font-weight:600; text-transform:uppercase; }
        .qp-stat-card.green .qp-stat-val { color:#15803D; }
        .qp-stat-card.amber .qp-stat-val { color:#B45309; }
        .qp-stat-card.blue .qp-stat-val { color:#1D4ED8; }
        .qp-filter-note { font-size:13px; color:#6B7280; margin:0 0 16px; }
        .qp-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:24px; }
        .qp-tab {
            padding:7px 18px; border-radius:20px; font-size:13px; font-weight:600;
            border:1.5px solid #E5E7EB; color:#6B7280; background:#fff;
            cursor:pointer; transition:all .15s;
        }
        .qp-tab:hover { border-color:#00461B; color:#00461B; }
        .qp-tab.active { background:#00461B; color:#fff; border-color:#00461B; }
        .qp-group { margin-bottom:32px; }
        .qp-group-hdr {
            display:flex; align-items:center; gap:10px;
            margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #F3F4F6;
        }
        .qp-group-pill {
            background:#E8F5EC; color:#00461B; padding:4px 12px; border-radius:6px;
            font-size:12px; font-weight:800; font-family:ui-monospace,monospace;
        }
        .qp-group-name { font-size:15px; font-weight:700; color:#111827; }
        .qp-group-count { margin-left:auto; font-size:12px; color:#9CA3AF; }
        .qp-grid {
            display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px;
        }
        .qp-card {
            background:#fff; border-radius:14px; border:1px solid #F1F5F9;
            box-shadow:0 1px 4px rgba(0,0,0,.06); display:flex; flex-direction:column;
            transition:box-shadow .2s, transform .2s; overflow:hidden;
        }
        .qp-card:hover { box-shadow:0 8px 28px rgba(0,0,0,.1); transform:translateY(-2px); }
        .qp-card-top { height:5px; }
        .qp-card-top.passed { background:#00461B; }
        .qp-card-top.attempted { background:#B45309; }
        .qp-card-top.available { background:#2563EB; }
        .qp-card-top.none { background:#E5E7EB; }
        .qp-card-body { padding:20px; flex:1; }
        .qp-badge-row { display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; }
        .qp-badge {
            padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700;
            text-transform:uppercase;
        }
        .qp-badge.quiz { background:#F3F4F6; color:#374151; }
        .qp-badge.pre { background:#DBEAFE; color:#1D4ED8; }
        .qp-badge.post { background:#EDE9FE; color:#6D28D9; }
        .qp-badge.passed { background:#DCFCE7; color:#15803D; }
        .qp-badge.attempted { background:#FEF3C7; color:#92400E; }
        .qp-badge.available { background:#DBEAFE; color:#1D4ED8; }
        .qp-badge.locked { background:#F3F4F6; color:#9CA3AF; }
        .qp-title { font-size:15px; font-weight:700; color:#111827; margin-bottom:6px; }
        .qp-desc { font-size:13px; color:#9CA3AF; margin-bottom:14px; line-height:1.5; }
        .qp-meta { display:flex; gap:6px; flex-wrap:wrap; }
        .qp-meta-item {
            display:flex; align-items:center; gap:4px;
            background:#F8FAFC; border-radius:7px; padding:4px 10px; font-size:12px; color:#6B7280;
        }
        .qp-meta-item b { color:#111827; font-weight:700; }
        .qp-card-footer {
            padding:16px 20px; background:#FAFAFA; border-top:1px solid #F3F4F6;
            display:flex; align-items:center; justify-content:space-between; gap:12px;
        }
        .qp-score-lbl { font-size:10px; font-weight:700; text-transform:uppercase; color:#9CA3AF; margin-bottom:4px; }
        .qp-score-num { font-size:22px; font-weight:800; }
        .qp-score-num.pass { color:#00461B; }
        .qp-score-num.fail { color:#B91C1C; }
        .qp-score-num.none { font-size:13px; font-weight:500; color:#9CA3AF; }
        .qp-bar { height:4px; background:#E5E7EB; border-radius:2px; margin-top:6px; overflow:hidden; }
        .qp-btn {
            flex-shrink:0; display:inline-flex; align-items:center; gap:6px;
            padding:9px 18px; border-radius:9px; font-size:13px; font-weight:700;
            border:none; cursor:pointer; text-decoration:none; white-space:nowrap;
        }
        .qp-btn.take { background:#00461B; color:#fff; }
        .qp-btn.retake { background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; }
        .qp-btn.done { background:#DCFCE7; color:#15803D; border:1px solid #86EFAC; pointer-events:none; }
        .qp-btn.locked { background:#F3F4F6; color:#9CA3AF; pointer-events:none; }
        .qp-empty {
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            min-height:240px; text-align:center; padding:40px;
            background:#fff; border-radius:16px; border:2px dashed #E5E7EB;
        }
        .qp-empty h3 { font-size:16px; font-weight:700; color:#374151; margin:12px 0 6px; }
        .qp-empty p { font-size:13px; color:#9CA3AF; margin:0; }
        @media(max-width:640px) { .qp-grid { grid-template-columns:1fr; } }
    `;
}

function renderQuizCard(q) {
    const status = q.quiz_status || 'none';
    const canTake = !!q.can_take;
    const hasScore = q.best_score !== null && q.best_score !== undefined;
    const scorePct = hasScore ? parseFloat(q.best_score) : 0;
    const isPassed = q.passed == 1;

    const stripClass = status === 'passed' ? 'passed'
        : status === 'attempted' ? 'attempted'
        : canTake ? 'available' : 'none';

    const typeCls = q.quiz_type === 'pre_test' ? 'pre' : q.quiz_type === 'post_test' ? 'post' : 'quiz';
    const typeLabel = q.quiz_type === 'pre_test' ? 'Pre-Test' : q.quiz_type === 'post_test' ? 'Post-Test' : 'Quiz';

    const stCls = status === 'passed' ? 'passed'
        : status === 'exhausted' ? 'locked'
        : status === 'attempted' ? 'attempted'
        : canTake ? 'available' : 'locked';
    const stLabel = status === 'passed' ? `${icon('check', inl)} Passed`
        : status === 'exhausted' ? 'No attempts left'
        : status === 'attempted' ? '↩ Attempted'
        : canTake ? 'Available' : 'Locked';

    const barColor = isPassed ? '#00461B' : '#EF4444';
    const attemptsMeta = (q.max_attempts || 0) > 0
        ? `${q.attempts_used || 0}/${q.max_attempts} tries`
        : 'Unlimited tries';

    let btn = '';
    if (status === 'passed') {
        btn = `<a class="qp-btn done" href="#student/take-quiz?quiz_id=${q.quiz_id}">${icon('check', inl)} Passed</a>`;
    } else if (status === 'exhausted' || (!canTake && q.attempts_remaining === 0 && (q.max_attempts || 0) > 0)) {
        btn = `<span class="qp-btn locked">${icon('lock', inl)} No attempts left</span>`;
    } else if (canTake && status === 'attempted') {
        btn = `<a class="qp-btn retake" href="#student/take-quiz?quiz_id=${q.quiz_id}">↩ Retake${q.attempts_remaining != null ? ` (${q.attempts_remaining} left)` : ''}</a>`;
    } else if (canTake) {
        btn = `<a class="qp-btn take" href="#student/take-quiz?quiz_id=${q.quiz_id}">▶ Take Quiz</a>`;
    } else {
        btn = `<span class="qp-btn locked">${icon('lock', inl)} Locked</span>`;
    }

    return `
        <div class="qp-card">
            <div class="qp-card-top ${stripClass}"></div>
            <div class="qp-card-body">
                <div class="qp-badge-row">
                    <span class="qp-badge ${typeCls}">${typeLabel}</span>
                    <span class="qp-badge ${stCls}">${stLabel}</span>
                </div>
                <div class="qp-title">${esc(q.quiz_title)}</div>
                ${q.quiz_description ? `<div class="qp-desc">${esc(q.quiz_description)}</div>` : ''}
                <div class="qp-meta">
                    <div class="qp-meta-item">${icon('quiz', inl)} <b>${q.question_count || 0}</b> questions</div>
                    <div class="qp-meta-item">${icon('timer', inl)} <b>${q.time_limit || '∞'}</b>${q.time_limit ? ' min' : ''}</div>
                    <div class="qp-meta-item">${icon('checkCircle', inl)} Pass at <b>${q.passing_rate || 0}%</b></div>
                    <div class="qp-meta-item">${icon('quiz', inl)} <b>${attemptsMeta}</b></div>
                </div>
            </div>
            <div class="qp-card-footer">
                <div class="qp-score-side">
                    <div class="qp-score-lbl">Best Score</div>
                    ${hasScore
                        ? `<div class="qp-score-num ${isPassed ? 'pass' : 'fail'}">${scorePct.toFixed(1)}%</div>
                           <div class="qp-bar"><div class="qp-bar-fill" style="width:${Math.min(scorePct, 100)}%;background:${barColor}"></div></div>`
                        : `<div class="qp-score-num none">Not taken yet</div>`}
                </div>
                ${btn}
            </div>
        </div>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
