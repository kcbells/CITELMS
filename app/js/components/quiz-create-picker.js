/**
 * Choose manual vs AI-assisted quiz creation.
 */
import { openQuizModal } from './quiz-modal.js';

const STYLES = `
    .qz-pick-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2600; padding:20px; }
    .qz-pick { background:#fff; border-radius:18px; width:100%; max-width:480px; overflow:hidden;
        box-shadow:0 24px 48px rgba(0,0,0,.2); animation:qzPickIn .25s ease; }
    @keyframes qzPickIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
    .qz-pick-hdr { padding:22px 24px; background:#00461B; color:#fff; }
    .qz-pick-hdr h3 { margin:0 0 4px; font-size:20px; font-weight:800; }
    .qz-pick-hdr p { margin:0; font-size:13px; opacity:.88; }
    .qz-pick-body { padding:20px 24px 24px; display:flex; flex-direction:column; gap:12px; }
    .qz-pick-opt { display:flex; align-items:flex-start; gap:14px; padding:16px; border:2px solid #e5e7eb;
        border-radius:14px; background:#fff; cursor:pointer; text-align:left; transition:border-color .15s, background .15s; width:100%; }
    .qz-pick-opt:hover { border-color:#00461B; background:#F8FDF9; }
    .qz-pick-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center;
        flex-shrink:0; font-size:22px; }
    .qz-pick-icon.manual { background:#E8F5EC; color:#00461B; }
    .qz-pick-icon.ai { background:#EDE9FE; color:#5B21B6; }
    .qz-pick-title { font-size:15px; font-weight:800; color:#111; display:block; margin-bottom:4px; }
    .qz-pick-desc { font-size:12px; color:#6B7280; line-height:1.45; display:block; }
    .qz-pick-cancel { width:100%; margin-top:4px; padding:10px; border:none; background:none; color:#6B7280;
        font-size:13px; font-weight:600; cursor:pointer; }
    .qz-pick-cancel:hover { color:#111; }
`;

/**
 * @param {Object} options
 * @param {string|number} [options.presetSubjectId]
 * @param {string|number} [options.presetSectionId]
 * @param {boolean} [options.lockSubject]
 * @param {Array} [options.classesData]
 * @param {string} [options.backTarget] — my-classes | subject | quizzes
 * @param {Function} [options.onSuccess]
 */
export function openQuizCreatePicker(options = {}) {
    const {
        presetSubjectId = '',
        presetSectionId = null,
        lockSubject = false,
        classesData = null,
        backTarget = 'quizzes',
        onSuccess = null,
    } = options;

    if (!document.getElementById('qz-pick-styles')) {
        const style = document.createElement('style');
        style.id = 'qz-pick-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.className = 'qz-pick-overlay';
    overlay.innerHTML = `
        <div class="qz-pick" role="dialog" aria-modal="true">
            <div class="qz-pick-hdr">
                <h3>Create Quiz</h3>
                <p>Choose how you want to build this quiz</p>
            </div>
            <div class="qz-pick-body">
                <button type="button" class="qz-pick-opt" data-mode="manual">
                    <span class="qz-pick-icon manual">✎</span>
                    <span>
                        <span class="qz-pick-title">Manual</span>
                        <span class="qz-pick-desc">Create the quiz shell, then add and edit each question yourself.</span>
                    </span>
                </button>
                <button type="button" class="qz-pick-opt" data-mode="ai">
                    <span class="qz-pick-icon ai">🤖</span>
                    <span>
                        <span class="qz-pick-title">AI Assisted</span>
                        <span class="qz-pick-desc">Upload a PDF or paste content — AI generates questions you can review and edit.</span>
                    </span>
                </button>
                <button type="button" class="qz-pick-cancel">Cancel</button>
            </div>
        </div>
    `;

    const close = () => overlay.remove();
    overlay.querySelector('.qz-pick-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('[data-mode="manual"]').addEventListener('click', () => {
        close();
        openQuizModal({
            presetSubjectId,
            presetSectionId,
            lockSubject,
            hidePublish: lockSubject,
            classesData,
            onSuccess: onSuccess || ((quizId) => {
                if (quizId) window.location.hash = `#instructor/quiz-questions?quiz_id=${quizId}`;
            }),
        });
    });

    overlay.querySelector('[data-mode="ai"]').addEventListener('click', () => {
        close();
        let hash = `#instructor/quiz-ai-generate?back=${encodeURIComponent(backTarget)}`;
        if (presetSubjectId) hash += `&subject_id=${presetSubjectId}`;
        if (presetSectionId) hash += `&section_id=${presetSectionId}`;
        window.location.hash = hash;
    });

    document.body.appendChild(overlay);
}
