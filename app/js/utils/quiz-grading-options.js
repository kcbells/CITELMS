/**
 * Shared UI for quiz objective / subjective answer-checking modes.
 */

const GRADING_STYLES = `
    .qz-grade-block { margin-bottom:18px; }
    .qz-grade-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:8px; text-transform:uppercase; letter-spacing:.4px; }
    .qz-grade-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .qz-grade-opt { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; cursor:pointer; background:#fff; border-bottom:1px solid #f0f0f0; }
    .qz-grade-opt:last-child { border-bottom:none; }
    .qz-grade-opt input { accent-color:#00461B; margin-top:3px; }
    .qz-grade-title { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-grade-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; line-height:1.4; }
    .qz-grade-hint { font-size:11px; color:#9ca3af; margin:8px 0 0; line-height:1.45; }
`;

export function ensureGradingOptionStyles() {
    if (document.getElementById('qz-grade-styles')) return;
    const style = document.createElement('style');
    style.id = 'qz-grade-styles';
    style.textContent = GRADING_STYLES;
    document.head.appendChild(style);
}

/**
 * @param {Object|null} quiz
 * @param {string} prefix — input name prefix (e.g. 'qz' or 'ai-grade')
 */
export function gradingOptionsHtml(quiz = null, prefix = 'qz') {
    const obj = quiz?.objective_grading_mode || 'auto';
    const sub = quiz?.subjective_grading_mode || 'ai_auto';
    const objOpts = [
        ['auto', 'Auto from correct answers', 'MC & T/F scored instantly; fill-in uses exact match only'],
        ['ai_auto', 'AI checks fill-in answers', 'AI accepts synonyms and minor typos on fill-in-the-blank'],
        ['ai_review', 'AI suggests — you review', 'AI scores fill-in answers but you approve before finalizing'],
        ['manual', 'You grade fill-in answers', 'Fill-in responses go to your grading queue'],
    ];
    const subOpts = [
        ['manual', 'You grade only', 'Essay & short answer go to your grading queue — no AI'],
        ['ai_auto', 'AI grades automatically', 'AI scores and finalizes essay & short answer on submit'],
        ['ai_review', 'AI grades — you review', 'AI suggests a score; you confirm or adjust before finalizing'],
        ['answer_key', 'Use model answers (answer key)', 'AI compares to model answers you set per question; missing keys need manual review'],
    ];
    const radioRow = (name, opts, current) => opts.map(([val, title, desc]) => `
        <label class="qz-grade-opt">
            <input type="radio" name="${name}" value="${val}" ${current === val ? 'checked' : ''}>
            <div><span class="qz-grade-title">${title}</span><span class="qz-grade-sub">${desc}</span></div>
        </label>
    `).join('');

    return `
        <div class="qz-grade-block">
            <span class="qz-grade-label">Answer checking — Objective (MC, T/F, fill-in)</span>
            <div class="qz-grade-panel">${radioRow(`${prefix}-obj-grade`, objOpts, obj)}</div>
            <p class="qz-grade-hint">Multiple choice and true/false are always auto-scored from the correct option.</p>
        </div>
        <div class="qz-grade-block">
            <span class="qz-grade-label">Answer checking — Subjective (essay &amp; short answer)</span>
            <div class="qz-grade-panel">${radioRow(`${prefix}-sub-grade`, subOpts, sub)}</div>
            <p class="qz-grade-hint">Set model answers on each question when using answer-key mode (Quiz Questions editor).</p>
        </div>
    `;
}

export function readGradingPayload(root, prefix = 'qz') {
    const el = root?.querySelector ? root : document;
    return {
        objective_grading_mode: el.querySelector(`input[name="${prefix}-obj-grade"]:checked`)?.value || 'auto',
        subjective_grading_mode: el.querySelector(`input[name="${prefix}-sub-grade"]:checked`)?.value || 'ai_auto',
    };
}
