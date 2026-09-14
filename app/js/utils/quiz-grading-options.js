/**
 * Shared UI for quiz objective / subjective answer-checking modes.
 */

const GRADING_STYLES = `
    .qz-grade-section { margin-bottom:20px; }
    .qz-grade-hdr { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
    .qz-grade-hdr-icon { width:28px; height:28px; border-radius:8px; display:flex; align-items:center;
        justify-content:center; flex-shrink:0; background:#F3F4F6; color:#111; }
    .qz-grade-hdr-text { }
    .qz-grade-hdr-title { font-size:13px; font-weight:700; color:#111827; display:block; }
    .qz-grade-hdr-sub { font-size:11px; color:#9CA3AF; display:block; margin-top:1px; }

    .qz-grade-panel { border:1.5px solid #E5E7EB; border-radius:12px; overflow:hidden; }
    .qz-grade-opt { display:flex; align-items:flex-start; gap:10px; padding:11px 14px; cursor:pointer;
        background:#fff; border-bottom:1px solid #F3F4F6; transition:background .12s; }
    .qz-grade-opt:last-child { border-bottom:none; }
    .qz-grade-opt:hover { background:#FAFAFA; }
    .qz-grade-opt input[type=radio] { accent-color:#00461B; margin-top:3px; flex-shrink:0; }
    .qz-grade-opt-body { flex:1; min-width:0; }
    .qz-grade-opt-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .qz-grade-opt-title { font-size:13px; font-weight:600; color:#111827; }
    .qz-grade-tag { font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px;
        text-transform:uppercase; letter-spacing:.3px; white-space:nowrap; }
    .qz-grade-tag.instant { background:#00461B; color:#fff; }
    .qz-grade-tag.held    { background:#B45309; color:#fff; }
    .qz-grade-tag.required { background:#7F1D1D; color:#fff; }
    .qz-grade-tag.ai      { background:#1D4ED8; color:#fff; }
    .qz-grade-opt-desc { font-size:11px; color:#9CA3AF; margin-top:3px; line-height:1.45; }
`;

export function ensureGradingOptionStyles() {
    if (document.getElementById('qz-grade-styles')) return;
    const style = document.createElement('style');
    style.id = 'qz-grade-styles';
    style.textContent = GRADING_STYLES;
    document.head.appendChild(style);
}

const OBJ_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
const SUB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

/**
 * @param {Object|null} quiz
 * @param {string} prefix — input name prefix (e.g. 'qz' or 'ai-grade')
 */
export function gradingOptionsHtml(quiz = null, prefix = 'qz') {
    const obj = quiz?.objective_grading_mode || 'auto';
    // Only 'manual' and 'ai_review' are valid; remap legacy values
    const rawSub = quiz?.subjective_grading_mode || 'ai_review';
    const sub = ['manual', 'ai_review'].includes(rawSub) ? rawSub : 'ai_review';

    // [value, title, tag-html, description]
    const objOpts = [
        ['auto',      'Instant results',       '<span class="qz-grade-tag instant">Instant</span>',        'MC & T/F auto-scored; fill-in uses exact match. Students see scores right away.'],
        ['ai_auto',   'AI scores fill-in',     '<span class="qz-grade-tag ai">AI</span><span class="qz-grade-tag instant">Instant</span>', 'AI accepts synonyms & minor typos on fill-in. Released immediately after submit.'],
        ['ai_review', 'AI scores — you release', '<span class="qz-grade-tag ai">AI</span><span class="qz-grade-tag held">Held</span>',    'Scores are calculated but hidden from students until you review and release them.'],
        ['manual',    'You grade fill-in',     '<span class="qz-grade-tag held">Held</span>',              'Fill-in answers go to your grading queue. Scores released only after you grade.'],
    ];

    const subOpts = [
        ['manual',    'You grade',         '<span class="qz-grade-tag held">Held</span>',                                                        'Responses go to your grading queue. You score each answer and release results when ready.'],
        ['ai_review', 'AI grades, you approve', '<span class="qz-grade-tag ai">AI</span><span class="qz-grade-tag required">Your approval required</span>', 'AI suggests a score for each answer. Results stay hidden until you review and confirm before releasing.'],
    ];

    const radioRow = (name, opts, current) => opts.map(([val, title, tags, desc]) => `
        <label class="qz-grade-opt">
            <input type="radio" name="${name}" value="${val}" ${current === val ? 'checked' : ''}>
            <div class="qz-grade-opt-body">
                <div class="qz-grade-opt-row">
                    <span class="qz-grade-opt-title">${title}</span>
                    ${tags}
                </div>
                <div class="qz-grade-opt-desc">${desc}</div>
            </div>
        </label>
    `).join('');

    return `
        <div class="qz-grade-section">
            <div class="qz-grade-hdr">
                <div class="qz-grade-hdr-icon obj">${OBJ_ICON}</div>
                <div class="qz-grade-hdr-text">
                    <span class="qz-grade-hdr-title">MC, T/F &amp; Fill-in</span>
                    <span class="qz-grade-hdr-sub">When are objective scores released to students?</span>
                </div>
            </div>
            <div class="qz-grade-panel">${radioRow(`${prefix}-obj-grade`, objOpts, obj)}</div>
        </div>
        <div class="qz-grade-section">
            <div class="qz-grade-hdr">
                <div class="qz-grade-hdr-icon sub">${SUB_ICON}</div>
                <div class="qz-grade-hdr-text">
                    <span class="qz-grade-hdr-title">Essay &amp; Short Answer</span>
                    <span class="qz-grade-hdr-sub">Who checks written responses before scores are released?</span>
                </div>
            </div>
            <div class="qz-grade-panel">${radioRow(`${prefix}-sub-grade`, subOpts, sub)}</div>
        </div>
    `;
}

export function readGradingPayload(root, prefix = 'qz') {
    const el = root?.querySelector ? root : document;
    return {
        objective_grading_mode: el.querySelector(`input[name="${prefix}-obj-grade"]:checked`)?.value || 'auto',
        subjective_grading_mode: el.querySelector(`input[name="${prefix}-sub-grade"]:checked`)?.value || 'ai_review',
    };
}
