/**
 * Instructor AI Quiz Generator
 * 4-step flow: Configure → Upload PDF/DOCX → Question Settings → Review & Edit
 */
import { Api, BASE_URL } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';
import { openQuizModal } from '../../components/quiz-modal.js';
import { showMcPopup } from '../../utils/mc-popup.js';
import { gradingOptionsHtml, readGradingPayload, ensureGradingOptionStyles } from '../../utils/quiz-grading-options.js';

const inl = { size: 14, className: 'ui-icon-inline' };

// Modal shell styles (for openAiQuizModal)
const AI_MODAL_SHELL_CSS = `
    .qzai-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2600; padding:20px; }
    .qzai-modal { background:#fff; border-radius:18px; width:100%; max-width:740px; max-height:92vh;
        overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.2);
        animation:qzaiIn .22s ease; }
    @keyframes qzaiIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
    .qzai-modal-hdr { padding:20px 24px; background:#00461B; color:#fff; flex-shrink:0;
        display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .qzai-modal-hdr h3 { font-size:18px; font-weight:800; margin:0 0 3px; }
    .qzai-modal-hdr p { font-size:12px; margin:0; opacity:.85; }
    .qzai-modal-close { background:rgba(255,255,255,.15); border:none; color:#fff; width:32px; height:32px;
        border-radius:8px; font-size:20px; cursor:pointer; flex-shrink:0; line-height:1; }
    .qzai-modal-body { overflow-y:auto; flex:1; padding:20px 24px; }
`;

let currentStep = 1;
let extractedText = '';
let generatedQuestions = null;
let formState = {
    subject_id: '', lessons_id: '', quiz_title: '', quiz_type: 'graded',
    all_sections: true, section_ids: [],
    publish_mode: 'draft', availability_start: '', due_date: '',
    objective_grading_mode: 'auto', subjective_grading_mode: 'ai_review',
};
let questionSettings = { num_mc: 5, num_tf: 5, num_fib: 0, num_sa: 0, num_essay: 0, difficulty: 'medium' };
let linkedQuizId = null;
let linkedQuizTitle = '';
let lockSubject = false;
let presetSectionId = null;
let subjectSections = [];
let backHref = '#instructor/my-classes';
let successBackHref = '#instructor/my-classes';
let classesDataForModal = [];
let isModalMode = false;
let modalCloseCallback = null;

export async function render(container, params = {}) {
    // Reset state
    currentStep = 1;
    extractedText = '';
    generatedQuestions = null;
    linkedQuizId = params.quiz_id ? parseInt(params.quiz_id) : null;
    linkedQuizTitle = params.quiz_title ? decodeURIComponent(params.quiz_title) : '';
    presetSectionId = params.section_id ? parseInt(params.section_id, 10) : null;
    lockSubject = !!params.subject_id && !linkedQuizId;

    const presetSubjectId = params.subject_id ? decodeURIComponent(params.subject_id) : '';
    formState = {
        subject_id: presetSubjectId,
        lessons_id: '',
        quiz_title: linkedQuizTitle || '',
        quiz_type: 'graded',
        all_sections: !presetSectionId,
        section_ids: presetSectionId ? [presetSectionId] : [],
        publish_mode: 'draft',
        availability_start: '',
        due_date: '',
        objective_grading_mode: 'auto',
        subjective_grading_mode: 'ai_review',
    };
    questionSettings = { num_mc: 5, num_tf: 5, num_fib: 0, num_sa: 0, num_essay: 0, difficulty: 'medium' };

    const [subjRes, classesRes] = await Promise.all([
        Api.get('/AIQuizAPI.php?action=subjects'),
        presetSubjectId ? Api.get('/SectionsAPI.php?action=instructor-classes') : Promise.resolve({ success: false }),
    ]);
    const subjects = subjRes.success ? subjRes.data : [];
    classesDataForModal = classesRes.success ? (classesRes.data || []) : [];
    if (presetSubjectId && classesRes.success) {
        const subj = classesDataForModal.find(s => String(s.subject_id) === String(presetSubjectId));
        subjectSections = subj?.sections || [];
    } else {
        subjectSections = [];
    }

    const backTarget = params.back || 'quizzes';
    if (backTarget === 'my-classes') {
        backHref = presetSubjectId ? `#instructor/my-classes?subject_id=${presetSubjectId}` : '#instructor/my-classes';
        successBackHref = backHref;
    } else if (backTarget === 'subject') {
        backHref = `#instructor/subject?subject_id=${presetSubjectId}${presetSectionId ? `&section_id=${presetSectionId}` : ''}`;
        successBackHref = backHref;
    } else {
        backHref = presetSubjectId ? `#instructor/subject?subject_id=${presetSubjectId}` : '#instructor/my-classes';
        successBackHref = backHref;
    }

    container.innerHTML = `
        <style>
            .aiq-header { background:#00461B; border-radius:16px; padding:28px; color:#fff; margin-bottom:24px; }
            .aiq-header h2 { font-size:22px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:10px; }
            .aiq-header p { font-size:14px; opacity:.85; }

            .stepper { display:flex; gap:4px; margin-bottom:28px; }
            .step { flex:1; text-align:center; padding:12px 8px; border-radius:10px; background:#f5f5f5; border:2px solid transparent; transition:all .2s; }
            .step .step-num { width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; background:#e0e0e0; color:#737373; margin-bottom:4px; }
            .step .step-label { font-size:11px; font-weight:600; color:#737373; display:block; }
            .step.active { background:#E8F5E9; border-color:#1B4D3E; }
            .step.active .step-num { background:#1B4D3E; color:#fff; }
            .step.active .step-label { color:#1B4D3E; }
            .step.done { background:#f0fdf4; }
            .step.done .step-num { background:#2D6A4F; color:#fff; }
            .step.done .step-label { color:#2D6A4F; }

            .step-panel { background:#fff; border:1px solid #e8e8e8; border-radius:14px; padding:28px; }
            .panel-title { font-size:18px; font-weight:700; color:#262626; margin-bottom:6px; }
            .panel-desc { font-size:13px; color:#737373; margin-bottom:20px; }

            .form-group { margin-bottom:18px; }
            .form-group label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-group select, .form-group input[type="text"] { width:100%; padding:10px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; }
            .form-group select:focus, .form-group input:focus { border-color:#1B4D3E; outline:none; box-shadow:0 0 0 3px rgba(27,77,62,.1); }
            .form-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }

            .type-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
            .type-opt { padding:12px; border:2px solid #e8e8e8; border-radius:10px; text-align:center; cursor:pointer; transition:all .15s; }
            .type-opt:hover { border-color:#1B4D3E; }
            .type-opt.selected { border-color:#1B4D3E; background:#E8F5E9; }
            .type-opt .t-label { font-size:13px; font-weight:600; display:block; }
            .type-opt .t-desc { font-size:10px; color:#737373; }

            .drop-zone { border:2px dashed #d0d0d0; border-radius:12px; padding:48px 24px; text-align:center; cursor:pointer; transition:all .2s; }
            .drop-zone:hover, .drop-zone.drag-over { border-color:#1B4D3E; background:#f0fdf4; }
            .drop-zone .dz-icon { font-size:40px; margin-bottom:8px; }
            .drop-zone .dz-text { font-size:15px; font-weight:600; color:#404040; }
            .drop-zone .dz-hint { font-size:12px; color:#737373; margin-top:4px; }
            .file-info { display:flex; align-items:center; gap:12px; padding:14px; background:#E8F5E9; border-radius:10px; margin-top:14px; }
            .file-info .fi-name { font-size:14px; font-weight:600; color:#1B4D3E; flex:1; }
            .file-info .fi-size { font-size:12px; color:#737373; }
            .file-info .fi-remove { background:none; border:none; color:#b91c1c; cursor:pointer; font-size:18px; font-weight:700; }
            .text-preview { margin-top:14px; background:#fafafa; border:1px solid #e8e8e8; border-radius:8px; padding:12px; max-height:200px; overflow-y:auto; font-size:12px; color:#404040; white-space:pre-wrap; line-height:1.5; }
            .text-preview-label { font-size:12px; font-weight:600; color:#737373; margin-top:14px; margin-bottom:6px; }
            .char-count { font-size:11px; color:#737373; margin-top:4px; }
            .or-divider { text-align:center; color:#737373; font-size:13px; margin:16px 0; }

            .qty-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
            .qty-item { background:#fafafa; border:1px solid #e8e8e8; border-radius:10px; padding:14px; text-align:center; }
            .qty-item label { font-size:12px; font-weight:600; color:#404040; display:block; margin-bottom:6px; }
            .qty-item input[type="number"] { width:60px; text-align:center; padding:6px; border:1px solid #e0e0e0; border-radius:6px; font-size:16px; font-weight:700; }
            .diff-group { display:flex; gap:8px; margin-top:16px; }
            .diff-btn { flex:1; padding:10px; border:2px solid #e8e8e8; border-radius:8px; text-align:center; cursor:pointer; font-size:13px; font-weight:600; background:#fff; transition:all .15s; }
            .diff-btn:hover { border-color:#1B4D3E; }
            .diff-btn.selected { border-color:#1B4D3E; background:#E8F5E9; color:#1B4D3E; }
            .total-strip { display:flex; justify-content:space-between; align-items:center; background:#E8F5E9; padding:10px 16px; border-radius:8px; margin-top:16px; font-size:14px; font-weight:700; color:#1B4D3E; }

            .q-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:18px; margin-bottom:14px; }
            .q-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
            .q-card-num { font-size:12px; font-weight:700; color:#1B4D3E; }
            .q-card-type { font-size:10px; font-weight:700; text-transform:uppercase; padding:3px 8px; border-radius:12px; }
            .q-card-type.mc { background:#DBEAFE; color:#1E40AF; }
            .q-card-type.tf { background:#FEF3C7; color:#B45309; }
            .q-card-type.fib { background:#E8F5E9; color:#1B4D3E; }
            .q-card-type.sa { background:#FEE2E2; color:#b91c1c; }
            .q-card-type.essay { background:#E8F5E9; color:#2D6A4F; }
            .q-card textarea { width:100%; border:1px solid #e8e8e8; border-radius:8px; padding:10px; font-size:14px; resize:vertical; min-height:50px; font-family:inherit; }
            .q-card textarea:focus { border-color:#1B4D3E; outline:none; }
            .q-card .opt-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
            .q-card .opt-row input[type="text"] { flex:1; padding:8px 10px; border:1px solid #e8e8e8; border-radius:6px; font-size:13px; }
            .q-card .opt-row input[type="radio"], .q-card .opt-row input[type="checkbox"] { accent-color:#1B4D3E; }
            .q-card .opt-label { font-size:11px; color:#737373; }
            .q-card .pts-row { display:flex; align-items:center; gap:8px; margin-top:8px; }
            .q-card .pts-row label { font-size:12px; color:#737373; }
            .q-card .pts-row input[type="number"] { width:50px; padding:4px; border:1px solid #e8e8e8; border-radius:4px; text-align:center; font-size:13px; }
            .q-card .btn-del-q { background:none; border:none; color:#b91c1c; cursor:pointer; font-size:14px; font-weight:700; }

            .btn-row { display:flex; justify-content:space-between; margin-top:24px; }
            .btn { padding:10px 22px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid #e0e0e0; background:#fff; color:#404040; transition:all .15s; }
            .btn:hover { background:#f5f5f5; }
            .btn:disabled { opacity:.4; cursor:not-allowed; }
            .btn-purple { background:#00461B; color:#fff; border-color:#1B4D3E; }
            .btn-purple:hover { box-shadow:0 4px 12px rgba(27,77,62,.3); }
            .btn-green { background:#00461B; color:#fff; border-color:#1B4D3E; }
            .btn-green:hover { box-shadow:0 4px 12px rgba(0,70,27,.3); }

            .spinner { display:inline-block; width:18px; height:18px; border:3px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:spin .6s linear infinite; vertical-align:middle; margin-right:6px; }
            @keyframes spin { to { transform:rotate(360deg); } }

            .gen-status { text-align:center; padding:48px 24px; }
            .gen-status .gs-icon { font-size:48px; margin-bottom:12px; }
            .gen-status .gs-text { font-size:16px; font-weight:600; color:#404040; }
            .gen-status .gs-sub { font-size:13px; color:#737373; margin-top:4px; }

            .save-result { text-align:center; padding:48px; }
            .save-result h3 { font-size:20px; font-weight:700; margin-bottom:8px; }
            .save-result p { font-size:14px; color:#737373; margin-bottom:16px; }

            .btn-back { display:inline-flex; align-items:center; gap:6px; color:#1B4D3E; font-size:13px; font-weight:600; text-decoration:none; margin-bottom:16px; }
            .btn-back:hover { text-decoration:underline; }
            .ai-sec-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; margin-top:4px; }
            .ai-sec-opt { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; background:#fff; border-bottom:1px solid #f0f0f0; }
            .ai-sec-opt:last-of-type { border-bottom:none; }
            .ai-sec-opt input { accent-color:#1B4D3E; width:16px; height:16px; }
            .ai-sec-opt-text { font-size:13px; font-weight:600; color:#111827; display:block; }
            .ai-sec-opt-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
            .ai-sec-checks { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; gap:8px; }
            .ai-sec-check { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; cursor:pointer; font-size:13px; }
            .ai-sec-check input { accent-color:#1B4D3E; }
            .ai-subj-badge { padding:11px 14px; background:#E8F5E9; border-radius:8px; font-size:14px; font-weight:700; color:#1B4D3E; }
            @media(max-width:768px) { .form-row, .type-grid, .qty-grid { grid-template-columns:1fr; } .stepper { flex-direction:column; } }
        </style>

        <a href="${backHref}" class="btn-back">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            ${backTarget === 'my-classes' ? 'Back to My Classes' : backTarget === 'subject' ? 'Back to Class' : 'Back to Quizzes'}
        </a>
        <div class="aiq-header">
            <h2>${icon('robot', { size: 22, className: 'ui-icon-inline' })} AI Quiz Generator</h2>
            <p>Upload a PDF/DOCX or paste text content, and AI will generate quiz questions for you</p>
        </div>

        ${linkedQuizId ? `<div style="background:#E8F5E9;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;"><span>${icon('link', { size: 18 })}</span><div><div style="font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;letter-spacing:.5px">Adding to existing quiz</div><div style="font-size:15px;color:#262626;font-weight:600">${esc(linkedQuizTitle)}</div></div></div>` : ''}

        <div class="stepper" id="stepper">
            <div class="step active" data-step="1"><span class="step-num">1</span><span class="step-label">Configure</span></div>
            <div class="step" data-step="2"><span class="step-num">2</span><span class="step-label">Content</span></div>
            <div class="step" data-step="3"><span class="step-num">3</span><span class="step-label">Settings</span></div>
            <div class="step" data-step="4"><span class="step-num">4</span><span class="step-label">Review</span></div>
        </div>

        <div id="step-content"></div>
    `;

    renderStep1(container, subjects);
}

/* ==================== STEP 1: CONFIGURATION ==================== */
function renderStep1(container, subjects) {
    currentStep = 1;
    updateStepper(container);
    ensureGradingOptionStyles();
    const panel = container.querySelector('#step-content');

    panel.innerHTML = `
        <div class="step-panel">
            <div class="panel-title">Quiz Configuration</div>
            <div class="panel-desc">Set up the basic details for your AI-generated quiz</div>

            <div class="form-row">
                <div class="form-group">
                    <label>Subject *</label>
                    ${lockSubject ? `
                        <div class="ai-subj-badge">${esc(subjects.find(s => String(s.subject_id) === String(formState.subject_id))?.subject_code || '')} — ${esc(subjects.find(s => String(s.subject_id) === String(formState.subject_id))?.subject_name || 'Selected subject')}</div>
                        <input type="hidden" id="ai-subject" value="${esc(formState.subject_id)}">
                    ` : `
                        <select id="ai-subject">
                            <option value="">Select subject</option>
                            ${subjects.map(s => `<option value="${s.subject_id}" ${String(formState.subject_id)===String(s.subject_id)?'selected':''}>${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('')}
                        </select>
                    `}
                </div>
                <div class="form-group">
                    <label>Link to Lesson (optional)</label>
                    <select id="ai-lesson" ${!formState.subject_id?'disabled':''}>
                        <option value="">General (no specific lesson)</option>
                    </select>
                </div>
            </div>
            ${!linkedQuizId && subjectSections.length ? `
            <div class="form-group">
                <label>Sections *</label>
                ${sectionTargetHtml(subjectSections, presetSectionId)}
            </div>
            ` : ''}
            <div class="form-group">
                <label>Quiz Title *</label>
                <input type="text" id="ai-title" placeholder="e.g. Chapter 3 Assessment" value="${esc(formState.quiz_title)}" ${linkedQuizId ? 'readonly style="background:#f5f5f5;color:#737373"' : ''}>
            </div>
            <div class="form-group">
                <label>Quiz Type</label>
                <div class="type-grid">
                    ${[['graded','Graded Quiz','Regular scored quiz'],['pre_test','Pre-Test','Before instruction'],['post_test','Post-Test','After instruction'],['practice','Practice','Ungraded practice']].map(([v,l,d]) =>
                        `<div class="type-opt ${formState.quiz_type===v?'selected':''}" data-type="${v}"><span class="t-label">${l}</span><span class="t-desc">${d}</span></div>`
                    ).join('')}
                </div>
            </div>

            <div class="form-group" id="ai-grading-wrap">
                <label>${icon('robot', inl)} AI &amp; Answer Checking</label>
                ${gradingOptionsHtml(formState, 'ai-grade')}
            </div>

            ${!linkedQuizId ? `
            <p style="font-size:13px;color:#737373;margin:16px 0 0;">
                Prefer to write questions yourself?
                <button type="button" id="ai-go-manual" style="background:none;border:none;color:#1B4D3E;font-weight:700;cursor:pointer;text-decoration:underline;padding:0;margin-left:4px;">Create quiz manually</button>
            </p>` : ''}

            <div class="btn-row">
                <span></span>
                <button class="btn btn-purple" id="btn-next1">Next: Add Content</button>
            </div>
        </div>
    `;

    // Load lessons if subject selected
    const subjectEl = panel.querySelector('#ai-subject');
    const lessonEl = panel.querySelector('#ai-lesson');

    if (formState.subject_id) loadLessons(formState.subject_id, lessonEl, formState.lessons_id);

    wireSectionTarget(panel);

    if (!lockSubject) {
        subjectEl.addEventListener('change', async () => {
            formState.subject_id = subjectEl.value;
            lessonEl.disabled = !subjectEl.value;
            if (subjectEl.value) loadLessons(subjectEl.value, lessonEl);
            else lessonEl.innerHTML = '<option value="">General (no specific lesson)</option>';
        });
    }

    lessonEl.addEventListener('change', () => { formState.lessons_id = lessonEl.value; });
    panel.querySelector('#ai-title').addEventListener('input', e => { formState.quiz_title = e.target.value; });

    panel.querySelectorAll('.type-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            panel.querySelectorAll('.type-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            formState.quiz_type = opt.dataset.type;
        });
    });

    panel.querySelector('#ai-go-manual')?.addEventListener('click', () => {
        if (isModalMode && modalCloseCallback) modalCloseCallback();
        openQuizModal({
            presetSubjectId: formState.subject_id,
            presetSectionId: presetSectionId,
            lockSubject: lockSubject,
            classesData: classesDataForModal,
            onSuccess: (quizId) => {
                if (quizId) window.location.hash = `#instructor/quiz-questions?quiz_id=${quizId}`;
            },
        });
    });

    panel.querySelector('#btn-next1').addEventListener('click', () => {
        if (!formState.subject_id) return showMcPopup('Please select a subject', { title: 'Required', type: 'info' });
        if (!formState.quiz_title.trim()) return showMcPopup('Please enter a quiz title', { title: 'Required', type: 'info' });
        Object.assign(formState, readGradingPayload(panel, 'ai-grade'));
        if (!linkedQuizId && subjectSections.length) {
            const mode = panel.querySelector('input[name="ai-sec-mode"]:checked')?.value || 'all';
            formState.all_sections = mode === 'all';
            formState.section_ids = mode === 'pick'
                ? [...panel.querySelectorAll('.ai-sec-pick:checked')].map(cb => parseInt(cb.value, 10))
                : [];
            if (!formState.all_sections && !formState.section_ids.length) {
                return showMcPopup('Select at least one section', { title: 'Required', type: 'info' });
            }
        }
        renderStep2(container, subjects);
    });
}

function sectionTargetHtml(sections, presetSecId = null) {
    const defaultAll = !presetSecId;
    return `
        <div class="ai-sec-panel" id="ai-sec-panel">
            <label class="ai-sec-opt">
                <input type="radio" name="ai-sec-mode" value="all" ${defaultAll ? 'checked' : ''}>
                <div><span class="ai-sec-opt-text">All sections</span><span class="ai-sec-opt-sub">Every section of this subject</span></div>
            </label>
            <label class="ai-sec-opt">
                <input type="radio" name="ai-sec-mode" value="pick" ${!defaultAll ? 'checked' : ''}>
                <div><span class="ai-sec-opt-text">Choose sections</span><span class="ai-sec-opt-sub">Assign to specific section(s)</span></div>
            </label>
            <div class="ai-sec-checks" id="ai-sec-checks" style="${defaultAll ? 'display:none' : ''}">
                ${sections.map(sec => `
                    <label class="ai-sec-check">
                        <input type="checkbox" class="ai-sec-pick" value="${sec.section_id}"
                            ${String(sec.section_id) === String(presetSecId) ? 'checked' : ''}>
                        <span>${esc(sec.section_name)}${sec.schedule ? ` <small style="color:#9ca3af">· ${esc(sec.schedule)}</small>` : ''}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function wireSectionTarget(panel) {
    const list = panel.querySelector('#ai-sec-checks');
    panel.querySelectorAll('input[name="ai-sec-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (list) list.style.display = radio.value === 'pick' && radio.checked ? '' : 'none';
        });
    });
}

async function loadLessons(subjectId, selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">Loading...</option>';
    const res = await Api.get('/AIQuizAPI.php?action=lessons&subject_id=' + subjectId);
    const lessons = res.success ? res.data : [];
    selectEl.innerHTML = '<option value="">General (no specific lesson)</option>' +
        lessons.map(l => `<option value="${l.lessons_id}" ${selectedId==l.lessons_id?'selected':''}>${esc(l.lesson_title)}</option>`).join('');
    selectEl.disabled = false;
}

/* ==================== STEP 2: UPLOAD CONTENT ==================== */
function renderStep2(container, subjects) {
    currentStep = 2;
    updateStepper(container);
    const panel = container.querySelector('#step-content');

    panel.innerHTML = `
        <div class="step-panel">
            <div class="panel-title">Add Content</div>
            <div class="panel-desc">Upload a PDF or Word document, or paste text that the AI will use to generate questions</div>

            <div class="drop-zone" id="drop-zone">
                <div class="dz-icon">${iconLg('document')}</div>
                <div class="dz-text">Drop PDF, DOCX, or TXT file here or click to browse</div>
                <div class="dz-hint">Supports PDF, Word (.docx), and text files up to 10MB</div>
            </div>
            <input type="file" id="file-input" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" style="display:none">
            <div id="file-info-area"></div>

            <div class="or-divider">— OR paste text directly —</div>

            <div class="form-group">
                <label>Content Text</label>
                <textarea id="content-text" rows="8" placeholder="Paste your lesson content, notes, or any educational text here..." style="width:100%;border:1px solid #e0e0e0;border-radius:8px;padding:12px;font-size:14px;resize:vertical;font-family:inherit">${esc(extractedText)}</textarea>
                <div class="char-count" id="char-count">${extractedText.length} / 8,000 characters</div>
            </div>

            ${extractedText ? `<div class="text-preview-label">Extracted text preview:</div><div class="text-preview">${esc(extractedText.substring(0, 500))}${extractedText.length > 500 ? '...' : ''}</div>` : ''}

            <div class="btn-row">
                <button class="btn" id="btn-back2">Back</button>
                <button class="btn btn-purple" id="btn-next2">Next: Question Settings</button>
            </div>
        </div>
    `;

    const dropZone = panel.querySelector('#drop-zone');
    const fileInput = panel.querySelector('#file-input');
    const textArea = panel.querySelector('#content-text');
    const charCount = panel.querySelector('#char-count');

    textArea.addEventListener('input', () => {
        extractedText = textArea.value;
        charCount.textContent = `${extractedText.length} / 8,000 characters`;
    });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleDocument(e.dataTransfer.files[0], panel, textArea, charCount); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleDocument(fileInput.files[0], panel, textArea, charCount); });

    panel.querySelector('#btn-back2').addEventListener('click', () => renderStep1(container, subjects));
    panel.querySelector('#btn-next2').addEventListener('click', () => {
        extractedText = textArea.value;
        if (!extractedText.trim()) return showMcPopup('Please add content text or upload a PDF or DOCX file', { title: 'Required', type: 'info' });
        renderStep3(container, subjects);
    });
}

async function handleDocument(file, panel, textArea, charCount) {
    const name = (file.name || '').toLowerCase();
    const isPdf  = file.type === 'application/pdf' || name.endsWith('.pdf');
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
    const isTxt  = file.type === 'text/plain' || name.endsWith('.txt');

    if (!isPdf && !isDocx && !isTxt) {
        return showMcPopup('Please upload a PDF, DOCX, or TXT file', { title: 'Invalid file', type: 'error' });
    }
    if (file.size > 10 * 1024 * 1024) {
        return showMcPopup('File size must be under 10MB', { title: 'File too large', type: 'error' });
    }

    const fileIcon = isDocx ? icon('quiz', inl) : icon('document', inl);
    const infoArea = panel.querySelector('#file-info-area');
    infoArea.innerHTML = `<div class="file-info"><span class="fi-name">${fileIcon} ${esc(file.name)}</span><span class="fi-size">${(file.size/1024).toFixed(0)} KB</span><span style="color:#737373;font-size:12px">Extracting text...</span></div>`;

    try {
        let text = '';
        let pageInfo = '';

        if (isTxt) {
            text = await file.text();
            pageInfo = 'TXT';
        } else {
            // Server-side extraction (works reliably on XAMPP without CDN libraries)
            const formData = new FormData();
            formData.append('file', file);
            const serverRes = await Api.postForm('/AIQuizAPI.php?action=extract-text', formData);

            if (serverRes.success && serverRes.data?.text) {
                text = serverRes.data.text;
                pageInfo = isPdf ? 'PDF' : 'DOCX';
            } else {
                // Browser fallback if server cannot read the file
                text = await extractTextClient(file, isPdf, isDocx);
                pageInfo = isPdf ? 'PDF (browser)' : 'DOCX (browser)';
                if (!text.trim() && serverRes.message) {
                    throw new Error(serverRes.message);
                }
            }
        }

        if (!text.trim()) {
            throw new Error('No readable text found. Paste your lesson content in the box below.');
        }

        extractedText = text.trim().substring(0, 8000);
        textArea.value = extractedText;
        charCount.textContent = `${extractedText.length} / 8,000 characters`;

        infoArea.innerHTML = `<div class="file-info"><span class="fi-name">${fileIcon} ${esc(file.name)}</span><span class="fi-size">${pageInfo} · ${extractedText.length} chars extracted</span><button class="fi-remove" id="btn-remove-file">${icon('close', inl)}</button></div>`;
        infoArea.querySelector('#btn-remove-file').addEventListener('click', () => {
            extractedText = '';
            textArea.value = '';
            charCount.textContent = '0 / 8,000 characters';
            infoArea.innerHTML = '';
        });
    } catch (err) {
        const msg = err?.message || String(err || '') || 'Could not read this file — paste your content manually below.';
        infoArea.innerHTML = `<div class="file-info" style="background:#FEE2E2"><span class="fi-name" style="color:#b91c1c">Failed to extract text: ${esc(msg)}</span></div>`;
        showMcPopup(msg, { title: 'Extract text', type: 'error' });
    }
}

function extractDocxTextFromXml(xml) {
    if (!xml) return '';

    const paragraphs = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/gi)];
    if (paragraphs.length) {
        const lines = [];
        for (const block of paragraphs) {
            const runs = [...block[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/gi)];
            const line = runs.map(m => m[1]).join('');
            if (line.trim()) lines.push(line.trim());
        }
        if (lines.length) return lines.join('\n');
    }

    const runs = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/gi)];
    if (runs.length) return runs.map(m => m[1]).join(' ').trim();

    return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function extractTextClient(file, isPdf, isDocx) {
    if (isPdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        if (!window.pdfjsLib) {
            throw new Error('PDF reader could not load. Check your internet connection or paste text manually.');
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n\n';
        }
        return text.trim();
    }

    if (isDocx) {
        await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        if (!window.JSZip) {
            throw new Error('DOCX reader could not load. Check your internet connection or paste text manually.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(arrayBuffer);
        const docFile = zip.file('word/document.xml');
        if (!docFile) {
            throw new Error('Invalid DOCX file — could not find document content.');
        }
        const docXml = await docFile.async('string');
        return extractDocxTextFromXml(docXml);
    }

    return '';
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Could not load ${src.split('/').pop()} — check your internet connection.`));
        document.head.appendChild(s);
    });
}

/* ==================== STEP 3: QUESTION SETTINGS ==================== */
function renderStep3(container, subjects) {
    currentStep = 3;
    updateStepper(container);
    const panel = container.querySelector('#step-content');
    const qs = questionSettings;
    const total = qs.num_mc + qs.num_tf + qs.num_fib + qs.num_sa + qs.num_essay;

    panel.innerHTML = `
        <div class="step-panel">
            <div class="panel-title">Question Settings</div>
            <div class="panel-desc">Configure how many questions of each type to generate</div>

            <div class="qty-grid">
                <div class="qty-item"><label>Multiple Choice</label><input type="number" id="qty-mc" min="0" max="20" value="${qs.num_mc}"></div>
                <div class="qty-item"><label>True / False</label><input type="number" id="qty-tf" min="0" max="20" value="${qs.num_tf}"></div>
                <div class="qty-item"><label>Fill in Blank</label><input type="number" id="qty-fib" min="0" max="10" value="${qs.num_fib}"></div>
                <div class="qty-item"><label>Short Answer</label><input type="number" id="qty-sa" min="0" max="10" value="${qs.num_sa}"></div>
                <div class="qty-item"><label>Essay</label><input type="number" id="qty-essay" min="0" max="5" value="${qs.num_essay}"></div>
            </div>

            <div class="total-strip"><span>Total Questions</span><span id="total-count">${total}</span></div>

            <div class="form-group" style="margin-top:20px">
                <label>Difficulty Level</label>
                <div class="diff-group">
                    ${['easy','medium','hard'].map(d => `<div class="diff-btn ${qs.difficulty===d?'selected':''}" data-diff="${d}">${d.charAt(0).toUpperCase()+d.slice(1)}</div>`).join('')}
                </div>
            </div>

            <div class="btn-row">
                <button class="btn" id="btn-back3">Back</button>
                <button class="btn btn-purple" id="btn-generate">Generate Questions</button>
            </div>
        </div>
    `;

    // Qty handlers
    const totalEl = panel.querySelector('#total-count');
    const updateTotal = () => {
        questionSettings.num_mc = parseInt(panel.querySelector('#qty-mc').value) || 0;
        questionSettings.num_tf = parseInt(panel.querySelector('#qty-tf').value) || 0;
        questionSettings.num_fib = parseInt(panel.querySelector('#qty-fib').value) || 0;
        questionSettings.num_sa = parseInt(panel.querySelector('#qty-sa').value) || 0;
        questionSettings.num_essay = parseInt(panel.querySelector('#qty-essay').value) || 0;
        totalEl.textContent = questionSettings.num_mc + questionSettings.num_tf + questionSettings.num_fib + questionSettings.num_sa + questionSettings.num_essay;
    };
    panel.querySelectorAll('input[type="number"]').forEach(inp => inp.addEventListener('input', updateTotal));

    panel.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            panel.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            questionSettings.difficulty = btn.dataset.diff;
        });
    });

    panel.querySelector('#btn-back3').addEventListener('click', () => renderStep2(container, subjects));
    panel.querySelector('#btn-generate').addEventListener('click', () => doGenerate(container, subjects));
}

/* ==================== GENERATE ==================== */
async function doGenerate(container, subjects) {
    const panel = container.querySelector('#step-content');
    const total = questionSettings.num_mc + questionSettings.num_tf + questionSettings.num_fib + questionSettings.num_sa + questionSettings.num_essay;
    if (total === 0) return showMcPopup('Please set at least 1 question', { title: 'Required', type: 'info' });

    panel.innerHTML = `
        <div class="step-panel">
            <div class="gen-status">
                <div class="gs-icon"><div class="spinner" style="width:48px;height:48px;border-width:5px"></div></div>
                <div class="gs-text">Generating ${total} questions with AI...</div>
                <div class="gs-sub">This may take 15-30 seconds depending on the content length</div>
            </div>
        </div>
    `;

    try {
        const res = await Api.post('/AIQuizAPI.php?action=generate', {
            text: extractedText,
            ...questionSettings
        });

        if (!res.success) {
            panel.innerHTML = `
                <div class="step-panel">
                    <div class="gen-status">
                        <div class="gs-icon">${iconLg('warning')}</div>
                        <div class="gs-text" style="color:#b91c1c">Generation Failed</div>
                        <div class="gs-sub">${esc(res.error || res.message || 'Unknown error')}</div>
                        <button class="btn btn-purple" style="margin-top:16px" id="btn-retry">Try Again</button>
                    </div>
                </div>
            `;
            panel.querySelector('#btn-retry').addEventListener('click', () => renderStep3(container, subjects));
            return;
        }

        generatedQuestions = res.questions;
        renderStep4(container, subjects);
    } catch (err) {
        panel.innerHTML = `
            <div class="step-panel">
                <div class="gen-status">
                    <div class="gs-icon">${iconLg('warning')}</div>
                    <div class="gs-text" style="color:#b91c1c">Connection Error</div>
                    <div class="gs-sub">${esc(err.message)}</div>
                    <button class="btn btn-purple" style="margin-top:16px" id="btn-retry">Try Again</button>
                </div>
            </div>
        `;
        panel.querySelector('#btn-retry').addEventListener('click', () => renderStep3(container, subjects));
    }
}

/* ==================== STEP 4: REVIEW & EDIT ==================== */
function renderStep4(container, subjects) {
    currentStep = 4;
    updateStepper(container);
    const panel = container.querySelector('#step-content');

    const allQ = [...(generatedQuestions.objective || []), ...(generatedQuestions.subjective || [])];

    const totalPts = allQ.reduce((s, q) => s + (q.points || 1), 0);

    panel.innerHTML = `
        <div class="step-panel">
            <div class="panel-title">Review & Edit Questions</div>
            <div class="panel-desc">Edit questions, change answers, adjust points, or delete questions before saving</div>

            <div class="total-strip" style="margin-bottom:20px">
                <span>${allQ.length} questions · ${totalPts} total points</span>
                <span>Quiz: ${esc(formState.quiz_title)}</span>
            </div>

            <div id="q-cards-list">
                ${allQ.map((q, i) => renderQuestionCard(q, i)).join('')}
            </div>

            ${allQ.length === 0 ? '<div style="text-align:center;padding:24px;color:#737373">No questions generated. Go back and try again.</div>' : ''}

            <div style="text-align:center;margin:16px 0;">
                <button class="btn" id="btn-manual-add-q" style="border-style:dashed;font-size:13px;padding:10px 20px;">+ Add Question Manually</button>
            </div>

            ${!linkedQuizId ? `
            <div style="margin-top:20px;padding:16px 18px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;">
                <div style="font-size:13px;font-weight:700;color:#00461B;margin-bottom:12px;">Release to Students</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
                    <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;">
                        <input type="radio" name="ai-pub-mode" value="draft" ${formState.publish_mode==='draft'?'checked':''} style="margin-top:3px;accent-color:#00461B;">
                        <span><strong>Save as draft</strong><br><span style="color:#737373;font-size:12px;">Publish later from quiz settings</span></span>
                    </label>
                    <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;">
                        <input type="radio" name="ai-pub-mode" value="now" ${formState.publish_mode==='now'?'checked':''} style="margin-top:3px;accent-color:#00461B;">
                        <span><strong>Publish now</strong><br><span style="color:#737373;font-size:12px;">Students see the quiz immediately</span></span>
                    </label>
                    <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;">
                        <input type="radio" name="ai-pub-mode" value="scheduled" ${formState.publish_mode==='scheduled'?'checked':''} style="margin-top:3px;accent-color:#00461B;">
                        <span><strong>Schedule release</strong><br><span style="color:#737373;font-size:12px;">Auto-publish at a chosen date &amp; time</span></span>
                    </label>
                </div>
                <div id="ai-pub-schedule" style="display:${formState.publish_mode==='scheduled'?'block':'none'};margin-bottom:10px;">
                    <label style="font-size:12px;font-weight:600;color:#404040;display:block;margin-bottom:4px;">Go live at *</label>
                    <input type="datetime-local" id="ai-availability" value="${formState.availability_start}" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="font-size:12px;font-weight:600;color:#404040;display:block;margin-bottom:4px;">Due date (optional)</label>
                    <input type="date" id="ai-due" value="${formState.due_date}" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;">
                </div>
            </div>` : ''}

            <!-- Publish to Question Bank option -->
            <div style="margin-top:20px;padding:14px 18px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1B4D3E;cursor:pointer;flex-shrink:0;">
                    <input type="checkbox" id="chk-publish-bank" style="width:16px;height:16px;accent-color:#1B4D3E;">
                    ${icon('bank', inl)} Also publish these questions to the Content Bank
                </label>
                <select id="bank-visibility" style="padding:7px 12px;border:1px solid #bbf7d0;border-radius:7px;font-size:12px;color:#1B4D3E;background:#fff;">
                    <option value="public">Public (anyone can copy)</option>
                    <option value="private">Private (only me)</option>
                </select>
            </div>

            <div class="btn-row">
                <button class="btn" id="btn-back4">Back to Settings</button>
                <div style="display:flex;gap:8px">
                    <button class="btn" id="btn-regenerate">Regenerate</button>
                    <button class="btn btn-green" id="btn-save" ${allQ.length===0?'disabled':''}>${linkedQuizId ? `Add ${allQ.length} Questions to Quiz` : `Save Quiz (${allQ.length} questions)`}</button>
                </div>
            </div>
        </div>
    `;

    // Manual add question
    panel.querySelector('#btn-manual-add-q')?.addEventListener('click', () => {
        openManualAddModal(container, subjects);
    });

    // Delete question handlers
    panel.querySelectorAll('.btn-del-q').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const objLen = (generatedQuestions.objective || []).length;
            if (idx < objLen) {
                generatedQuestions.objective.splice(idx, 1);
            } else {
                generatedQuestions.subjective.splice(idx - objLen, 1);
            }
            renderStep4(container, subjects);
        });
    });

    panel.querySelectorAll('input[name="ai-pub-mode"]').forEach(r => {
        r.addEventListener('change', () => {
            formState.publish_mode = r.value;
            const sched = panel.querySelector('#ai-pub-schedule');
            if (sched) sched.style.display = r.value === 'scheduled' ? 'block' : 'none';
        });
    });

    panel.querySelector('#btn-back4').addEventListener('click', () => renderStep3(container, subjects));
    panel.querySelector('#btn-regenerate').addEventListener('click', () => doGenerate(container, subjects));
    panel.querySelector('#btn-save')?.addEventListener('click', () => doSave(container, subjects, panel));
}

function renderQuestionCard(q, idx) {
    const typeLabels = { multiple_choice:'Multiple Choice', checkboxes:'Checkboxes', true_false:'True/False', dropdown:'Dropdown', fill_blank:'Fill in Blank', short_answer:'Short Answer', essay:'Essay' };
    const typeCls   = { multiple_choice:'mc', checkboxes:'mc', true_false:'tf', dropdown:'mc', fill_blank:'fib', short_answer:'sa', essay:'essay' };

    let optionsHtml = '';
    if ((q.type === 'multiple_choice' || q.type === 'dropdown') && q.options) {
        optionsHtml = q.options.map((opt, oi) => `
            <div class="opt-row">
                <input type="radio" name="correct-${idx}" value="${oi}" ${oi===q.correct_index?'checked':''} data-qidx="${idx}">
                <input type="text" value="${esc(opt)}" data-qidx="${idx}" data-oidx="${oi}" class="opt-text-input">
                <span class="opt-label">${String.fromCharCode(65+oi)}</span>
            </div>
        `).join('');
    } else if (q.type === 'checkboxes' && q.options) {
        const correctSet = new Set(q.correct_indices || []);
        optionsHtml = q.options.map((opt, oi) => `
            <div class="opt-row">
                <input type="checkbox" name="chk-${idx}" value="${oi}" ${correctSet.has(oi)?'checked':''} data-qidx="${idx}" data-ci="${oi}">
                <input type="text" value="${esc(opt)}" data-qidx="${idx}" data-oidx="${oi}" class="opt-text-input">
                <span class="opt-label">${String.fromCharCode(65+oi)}</span>
            </div>
        `).join('');
    } else if (q.type === 'true_false') {
        optionsHtml = `
            <div class="opt-row">
                <input type="radio" name="tf-${idx}" value="true" ${q.answer?'checked':''} data-qidx="${idx}"> <span class="opt-label">True</span>
                <input type="radio" name="tf-${idx}" value="false" ${!q.answer?'checked':''} data-qidx="${idx}" style="margin-left:16px"> <span class="opt-label">False</span>
            </div>
        `;
    } else if (q.type === 'fill_blank') {
        optionsHtml = `
            <div class="opt-row">
                <span class="opt-label" style="min-width:50px">Answer:</span>
                <input type="text" value="${esc(q.answer || '')}" data-qidx="${idx}" class="fib-answer-input">
            </div>
        `;
    }

    const mediaHtml = (() => {
        if (!q.media_type || q.media_type === 'none' || !q.media_url) return '';
        if (q.media_type === 'image') return `<div style="margin:8px 0;"><img src="${esc(q.media_url)}" style="max-width:220px;max-height:140px;border-radius:8px;object-fit:cover;border:1px solid #e8e8e8;display:block;"></div>`;
        if (q.media_type === 'audio') return `<div style="margin:8px 0;"><audio controls src="${esc(q.media_url)}" style="width:100%;max-width:300px;"></audio></div>`;
        if (q.media_type === 'link') return `<div style="margin:8px 0;font-size:12px;"><a href="${esc(q.media_url)}" target="_blank" style="color:#1B4D3E;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>${esc(q.media_name || q.media_url)}</a></div>`;
        return '';
    })();

    return `
        <div class="q-card" data-qidx="${idx}">
            <div class="q-card-header">
                <span class="q-card-num">Q${idx + 1}</span>
                <span class="q-card-type ${typeCls[q.type] || ''}">${typeLabels[q.type] || q.type}</span>
                <button class="btn-del-q" data-idx="${idx}" title="Delete">${icon('close', inl)}</button>
            </div>
            <textarea class="q-text-input" data-qidx="${idx}" rows="2">${esc(q.question)}</textarea>
            ${mediaHtml}
            ${optionsHtml}
            <div class="pts-row">
                <label>Points:</label>
                <input type="number" min="1" max="20" value="${q.points || 1}" data-qidx="${idx}" class="pts-input">
            </div>
        </div>
    `;
}

/* ==================== SAVE ==================== */
async function doSave(container, subjects, panel) {
    // Collect edited values from the DOM
    const allQ = [...(generatedQuestions.objective || []), ...(generatedQuestions.subjective || [])];

    panel.querySelectorAll('.q-text-input').forEach(ta => {
        const idx = parseInt(ta.dataset.qidx);
        if (allQ[idx]) allQ[idx].question = ta.value;
    });
    panel.querySelectorAll('.opt-text-input').forEach(inp => {
        const qi = parseInt(inp.dataset.qidx);
        const oi = parseInt(inp.dataset.oidx);
        if (allQ[qi] && allQ[qi].options) allQ[qi].options[oi] = inp.value;
    });
    panel.querySelectorAll('.pts-input').forEach(inp => {
        const idx = parseInt(inp.dataset.qidx);
        if (allQ[idx]) allQ[idx].points = parseInt(inp.value) || 1;
    });
    // Update correct answers for MC / dropdown
    panel.querySelectorAll('input[type="radio"][name^="correct-"]:checked').forEach(r => {
        const idx = parseInt(r.dataset.qidx);
        if (allQ[idx]) allQ[idx].correct_index = parseInt(r.value);
    });
    // Update checkboxes correct indices
    allQ.forEach((q, idx) => {
        if (q.type === 'checkboxes') {
            const checked = [...panel.querySelectorAll(`input[name="chk-${idx}"]:checked`)].map(cb => parseInt(cb.dataset.ci));
            q.correct_indices = checked;
        }
    });
    // Update TF answers
    panel.querySelectorAll('input[type="radio"][name^="tf-"]:checked').forEach(r => {
        const idx = parseInt(r.dataset.qidx);
        if (allQ[idx]) allQ[idx].answer = r.value === 'true';
    });
    // Update FIB answers
    panel.querySelectorAll('.fib-answer-input').forEach(inp => {
        const idx = parseInt(inp.dataset.qidx);
        if (allQ[idx]) allQ[idx].answer = inp.value;
    });

    // Rebuild objective/subjective
    const objective = allQ.filter(q => ['multiple_choice','checkboxes','dropdown','true_false','fill_blank'].includes(q.type));
    const subjective = allQ.filter(q => ['short_answer','essay'].includes(q.type));

    if (!linkedQuizId) {
        formState.publish_mode = panel.querySelector('input[name="ai-pub-mode"]:checked')?.value || 'draft';
        formState.availability_start = panel.querySelector('#ai-availability')?.value || '';
        formState.due_date = panel.querySelector('#ai-due')?.value || '';
        if (formState.publish_mode === 'scheduled' && !formState.availability_start) {
            return showMcPopup('Please choose a date and time for the scheduled release.', { title: 'Required', type: 'info' });
        }
    }

    const saveBtn = panel.querySelector('#btn-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        const res = await Api.post('/AIQuizAPI.php?action=save', {
            subject_id: formState.subject_id,
            lessons_id: formState.lessons_id || null,
            quiz_title: formState.quiz_title,
            quiz_type: formState.quiz_type,
            ...(linkedQuizId ? { quiz_id: linkedQuizId } : {}),
            ...(!linkedQuizId ? {
                publish_mode: formState.publish_mode,
                availability_start: formState.availability_start,
                due_date: formState.due_date,
            } : {}),
            ...(!linkedQuizId && subjectSections.length ? {
                all_sections: formState.all_sections,
                section_ids: formState.section_ids || [],
            } : {}),
            objective_grading_mode: formState.objective_grading_mode,
            subjective_grading_mode: formState.subjective_grading_mode,
            questions: { objective, subjective }
        });

        if (res.success) {
            // Optionally publish questions to the Content Bank
            const publishToBank = document.getElementById('chk-publish-bank')?.checked;
            const bankVisibility = document.getElementById('bank-visibility')?.value || 'public';
            let bankPublished = 0;

            if (publishToBank) {
                const allQ2 = [...(objective), ...(subjective)];
                const typeMap = { fill_blank: 'short_answer' }; // bank doesn't have fill_blank
                for (const q of allQ2) {
                    const qType = typeMap[q.type] || q.type;
                    const opts = [];
                    if (q.type === 'multiple_choice' && q.options) {
                        q.options.forEach((o, i) => opts.push({ option_text: o, is_correct: i === q.correct_index ? 1 : 0 }));
                    } else if (q.type === 'true_false') {
                        opts.push({ option_text: 'True',  is_correct: q.answer  ? 1 : 0 });
                        opts.push({ option_text: 'False', is_correct: !q.answer ? 1 : 0 });
                    }
                    const br = await Api.post('/QuestionBankAPI.php?action=publish', {
                        question_text: q.question,
                        question_type: qType,
                        points:        q.points || 1,
                        subject_id:    formState.subject_id || null,
                        lessons_id:    formState.lessons_id || null,
                        visibility:    bankVisibility,
                        options:       opts
                    });
                    if (br.success) bankPublished++;
                }
            }

            const bankNote = publishToBank
                ? `<p style="font-size:12px;color:#1B4D3E;margin:4px 0 0;">${icon('bank', inl)} ${bankPublished} question${bankPublished !== 1 ? 's' : ''} published to the Content Bank.</p>`
                : '';

            const editQuizHref = linkedQuizId
                ? `#instructor/quiz-questions?quiz_id=${linkedQuizId}`
                : `#instructor/quiz-questions?quiz_id=${res.quiz_id}`;
            const successButtons = linkedQuizId
                ? `<a href="${editQuizHref}" class="btn btn-green" style="text-decoration:none">Go to Quiz Questions</a>
                   <a href="${successBackHref}" class="btn" style="text-decoration:none">Back to Class</a>`
                : `<a href="${editQuizHref}" class="btn btn-green" style="text-decoration:none">Edit Quiz</a>
                   <a href="${successBackHref}" class="btn" style="text-decoration:none">Back to My Classes</a>
                   <button class="btn btn-purple" id="btn-new">Create Another</button>`;
            panel.innerHTML = `
                <div class="step-panel">
                    <div class="save-result">
                        <div style="margin-bottom:12px">${iconLg('checkCircle')}</div>
                        <h3 style="color:#1B4D3E">${esc(res.message || 'Quiz saved successfully!')}</h3>
                        <p>${linkedQuizId ? `Questions added to "<strong>${esc(linkedQuizTitle)}</strong>" successfully.` : 'Your AI-generated quiz has been saved as a draft. You can edit it further in the Quizzes page.'}</p>
                        ${bankNote}
                        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
                            ${successButtons}
                        </div>
                    </div>
                </div>
            `;
            if (!linkedQuizId) {
                panel.querySelector('#btn-new')?.addEventListener('click', () => {
                    if (isModalMode) {
                        currentStep = 1; extractedText = ''; generatedQuestions = null;
                        formState = { subject_id: formState.subject_id, lessons_id: '', quiz_title: '',
                            quiz_type: 'graded', all_sections: true, section_ids: [],
                            publish_mode: 'draft', availability_start: '', due_date: '',
                            objective_grading_mode: 'auto', subjective_grading_mode: 'ai_review' };
                        questionSettings = { num_mc: 5, num_tf: 5, num_fib: 0, num_sa: 0, num_essay: 0, difficulty: 'medium' };
                        renderStep1(container, subjects);
                    } else {
                        render(container);
                    }
                });
            }
        } else {
            saveBtn.disabled = false;
            saveBtn.innerHTML = linkedQuizId ? `Add ${allQ.length} Questions to Quiz` : `Save Quiz (${allQ.length} questions)`;
            showMcPopup(res.error || res.message || 'Unknown error', { title: 'Save failed', type: 'error' });
        }
    } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = linkedQuizId ? `Add ${allQ.length} Questions to Quiz` : `Save Quiz (${allQ.length} questions)`;
        showMcPopup(err.message || 'Could not save quiz', { title: 'Save error', type: 'error' });
    }
}

/* ==================== MODAL ENTRY POINT ==================== */
/**
 * Open the AI quiz generator as a modal dialog.
 * @param {Object} options
 * @param {string|number} [options.presetSubjectId]
 * @param {string|number} [options.presetSectionId]
 * @param {boolean} [options.lockSubject]
 * @param {string} [options.backTarget]
 */
export async function openAiQuizModal(options = {}) {
    isModalMode = true;
    currentStep = 1;
    extractedText = '';
    generatedQuestions = null;
    linkedQuizId = null;
    linkedQuizTitle = '';

    const presetSubjectId = options.presetSubjectId ? String(options.presetSubjectId) : '';
    presetSectionId = options.presetSectionId ? parseInt(options.presetSectionId, 10) : null;
    lockSubject = !!options.lockSubject && !!presetSubjectId;

    formState = {
        subject_id: presetSubjectId,
        lessons_id: '',
        quiz_title: '',
        quiz_type: 'graded',
        all_sections: !presetSectionId,
        section_ids: presetSectionId ? [presetSectionId] : [],
        publish_mode: 'draft',
        availability_start: '',
        due_date: '',
        objective_grading_mode: 'auto',
        subjective_grading_mode: 'ai_review',
    };
    questionSettings = { num_mc: 5, num_tf: 5, num_fib: 0, num_sa: 0, num_essay: 0, difficulty: 'medium' };

    const [subjRes, classesRes] = await Promise.all([
        Api.get('/AIQuizAPI.php?action=subjects'),
        presetSubjectId ? Api.get('/SectionsAPI.php?action=instructor-classes') : Promise.resolve({ success: false }),
    ]);
    const subjects = subjRes.success ? subjRes.data : [];
    classesDataForModal = classesRes.success ? (classesRes.data || []) : [];

    if (presetSubjectId && classesRes.success) {
        const subj = classesDataForModal.find(s => String(s.subject_id) === String(presetSubjectId));
        subjectSections = subj?.sections || [];
    } else {
        subjectSections = [];
    }

    // Inject AI page styles to head
    if (!document.getElementById('aiq-page-styles')) {
        const style = document.createElement('style');
        style.id = 'aiq-page-styles';
        style.textContent = document.querySelector('style[data-aiq]')?.textContent || '';
        document.head.appendChild(style);
    }
    // Inject modal shell styles
    if (!document.getElementById('qzai-shell-styles')) {
        const style = document.createElement('style');
        style.id = 'qzai-shell-styles';
        style.textContent = AI_MODAL_SHELL_CSS;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.className = 'qzai-overlay';
    overlay.innerHTML = `
        <div class="qzai-modal" role="dialog" aria-modal="true">
            <div class="qzai-modal-hdr">
                <div>
                    <h3 style="display:flex;align-items:center;gap:8px;"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>AI Quiz Generator</h3>
                    <p>Upload a PDF/DOCX or paste text — AI generates quiz questions for you</p>
                </div>
                <button type="button" class="qzai-modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="qzai-modal-body">
                <style>
                    .stepper { display:flex; gap:4px; margin-bottom:20px; }
                    .step { flex:1; text-align:center; padding:10px 6px; border-radius:10px; background:#f5f5f5; border:2px solid transparent; transition:all .2s; }
                    .step .step-num { width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; background:#e0e0e0; color:#737373; margin-bottom:3px; }
                    .step .step-label { font-size:10px; font-weight:600; color:#737373; display:block; }
                    .step.active { background:#E8F5E9; border-color:#1B4D3E; }
                    .step.active .step-num { background:#1B4D3E; color:#fff; }
                    .step.active .step-label { color:#1B4D3E; }
                    .step.done { background:#f0fdf4; }
                    .step.done .step-num { background:#2D6A4F; color:#fff; }
                    .step.done .step-label { color:#2D6A4F; }
                    .step-panel { background:#fff; border:1px solid #e8e8e8; border-radius:14px; padding:24px; }
                    .panel-title { font-size:17px; font-weight:700; color:#262626; margin-bottom:4px; }
                    .panel-desc { font-size:13px; color:#737373; margin-bottom:18px; }
                    .form-group { margin-bottom:16px; }
                    .form-group label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
                    .form-group select, .form-group input[type="text"] { width:100%; padding:10px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; box-sizing:border-box; }
                    .form-group select:focus, .form-group input:focus { border-color:#1B4D3E; outline:none; box-shadow:0 0 0 3px rgba(27,77,62,.1); }
                    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
                    .type-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
                    .type-opt { padding:10px; border:2px solid #e8e8e8; border-radius:10px; text-align:center; cursor:pointer; transition:all .15s; }
                    .type-opt:hover { border-color:#1B4D3E; }
                    .type-opt.selected { border-color:#1B4D3E; background:#E8F5E9; }
                    .type-opt .t-label { font-size:12px; font-weight:600; display:block; }
                    .type-opt .t-desc { font-size:10px; color:#737373; }
                    .drop-zone { border:2px dashed #d0d0d0; border-radius:12px; padding:36px 20px; text-align:center; cursor:pointer; transition:all .2s; }
                    .drop-zone:hover, .drop-zone.drag-over { border-color:#1B4D3E; background:#f0fdf4; }
                    .drop-zone .dz-icon { font-size:36px; margin-bottom:8px; }
                    .drop-zone .dz-text { font-size:14px; font-weight:600; color:#404040; }
                    .drop-zone .dz-hint { font-size:12px; color:#737373; margin-top:4px; }
                    .file-info { display:flex; align-items:center; gap:12px; padding:12px; background:#E8F5E9; border-radius:10px; margin-top:12px; }
                    .file-info .fi-name { font-size:13px; font-weight:600; color:#1B4D3E; flex:1; }
                    .file-info .fi-size { font-size:12px; color:#737373; }
                    .file-info .fi-remove { background:none; border:none; color:#b91c1c; cursor:pointer; font-size:18px; font-weight:700; }
                    .text-preview { margin-top:12px; background:#fafafa; border:1px solid #e8e8e8; border-radius:8px; padding:10px; max-height:150px; overflow-y:auto; font-size:12px; color:#404040; white-space:pre-wrap; line-height:1.5; }
                    .char-count { font-size:11px; color:#737373; margin-top:4px; }
                    .or-divider { text-align:center; color:#737373; font-size:13px; margin:14px 0; }
                    .qty-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
                    .qty-item { background:#fafafa; border:1px solid #e8e8e8; border-radius:10px; padding:12px; text-align:center; }
                    .qty-item label { font-size:12px; font-weight:600; color:#404040; display:block; margin-bottom:6px; }
                    .qty-item input[type="number"] { width:56px; text-align:center; padding:6px; border:1px solid #e0e0e0; border-radius:6px; font-size:15px; font-weight:700; }
                    .diff-group { display:flex; gap:8px; margin-top:14px; }
                    .diff-btn { flex:1; padding:9px; border:2px solid #e8e8e8; border-radius:8px; text-align:center; cursor:pointer; font-size:13px; font-weight:600; background:#fff; transition:all .15s; }
                    .diff-btn:hover { border-color:#1B4D3E; }
                    .diff-btn.selected { border-color:#1B4D3E; background:#E8F5E9; color:#1B4D3E; }
                    .total-strip { display:flex; justify-content:space-between; align-items:center; background:#E8F5E9; padding:10px 14px; border-radius:8px; margin-top:14px; font-size:14px; font-weight:700; color:#1B4D3E; }
                    .q-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:16px; margin-bottom:12px; }
                    .q-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
                    .q-card-num { font-size:12px; font-weight:700; color:#1B4D3E; }
                    .q-card-type { font-size:10px; font-weight:700; text-transform:uppercase; padding:3px 8px; border-radius:12px; }
                    .q-card-type.mc { background:#DBEAFE; color:#1E40AF; }
                    .q-card-type.tf { background:#FEF3C7; color:#B45309; }
                    .q-card-type.fib { background:#E8F5E9; color:#1B4D3E; }
                    .q-card-type.sa { background:#FEE2E2; color:#b91c1c; }
                    .q-card-type.essay { background:#E8F5E9; color:#2D6A4F; }
                    .q-card textarea { width:100%; border:1px solid #e8e8e8; border-radius:8px; padding:9px; font-size:13px; resize:vertical; min-height:46px; font-family:inherit; box-sizing:border-box; }
                    .q-card textarea:focus { border-color:#1B4D3E; outline:none; }
                    .q-card .opt-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
                    .q-card .opt-row input[type="text"] { flex:1; padding:7px 10px; border:1px solid #e8e8e8; border-radius:6px; font-size:13px; }
                    .q-card .opt-row input[type="radio"], .q-card .opt-row input[type="checkbox"] { accent-color:#1B4D3E; }
                    .q-card .opt-label { font-size:11px; color:#737373; }
                    .q-card .pts-row { display:flex; align-items:center; gap:8px; margin-top:8px; }
                    .q-card .pts-row label { font-size:12px; color:#737373; }
                    .q-card .pts-row input[type="number"] { width:48px; padding:4px; border:1px solid #e8e8e8; border-radius:4px; text-align:center; font-size:13px; }
                    .q-card .btn-del-q { background:none; border:none; color:#b91c1c; cursor:pointer; font-size:13px; font-weight:700; }
                    .btn-row { display:flex; justify-content:space-between; margin-top:20px; }
                    .btn { padding:10px 20px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid #e0e0e0; background:#fff; color:#404040; transition:all .15s; }
                    .btn:hover { background:#f5f5f5; }
                    .btn:disabled { opacity:.4; cursor:not-allowed; }
                    .btn-purple { background:#00461B; color:#fff; border-color:#1B4D3E; }
                    .btn-purple:hover { box-shadow:0 4px 12px rgba(27,77,62,.3); }
                    .btn-green { background:#00461B; color:#fff; border-color:#1B4D3E; }
                    .spinner { display:inline-block; width:16px; height:16px; border:3px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:spin .6s linear infinite; vertical-align:middle; margin-right:6px; }
                    @keyframes spin { to { transform:rotate(360deg); } }
                    .gen-status { text-align:center; padding:40px 20px; }
                    .gen-status .gs-icon { font-size:40px; margin-bottom:10px; }
                    .gen-status .gs-text { font-size:15px; font-weight:600; color:#404040; }
                    .gen-status .gs-sub { font-size:13px; color:#737373; margin-top:4px; }
                    .save-result { text-align:center; padding:40px; }
                    .save-result h3 { font-size:19px; font-weight:700; margin-bottom:8px; }
                    .save-result p { font-size:14px; color:#737373; margin-bottom:14px; }
                    .ai-sec-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; margin-top:4px; }
                    .ai-sec-opt { display:flex; align-items:center; gap:10px; padding:11px 14px; cursor:pointer; background:#fff; border-bottom:1px solid #f0f0f0; }
                    .ai-sec-opt:last-of-type { border-bottom:none; }
                    .ai-sec-opt input { accent-color:#1B4D3E; width:16px; height:16px; }
                    .ai-sec-opt-text { font-size:13px; font-weight:600; color:#111827; display:block; }
                    .ai-sec-opt-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
                    .ai-sec-checks { padding:11px 14px; background:#fff; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; gap:8px; }
                    .ai-sec-check { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; cursor:pointer; font-size:13px; }
                    .ai-sec-check input { accent-color:#1B4D3E; }
                    .ai-subj-badge { padding:10px 14px; background:#E8F5E9; border-radius:8px; font-size:14px; font-weight:700; color:#1B4D3E; }
                    @media(max-width:600px) { .form-row, .type-grid, .qty-grid { grid-template-columns:1fr; } .stepper { flex-direction:column; } }
                </style>
                <div class="stepper" id="stepper">
                    <div class="step active" data-step="1"><span class="step-num">1</span><span class="step-label">Configure</span></div>
                    <div class="step" data-step="2"><span class="step-num">2</span><span class="step-label">Content</span></div>
                    <div class="step" data-step="3"><span class="step-num">3</span><span class="step-label">Settings</span></div>
                    <div class="step" data-step="4"><span class="step-num">4</span><span class="step-label">Review</span></div>
                </div>
                <div id="step-content"></div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); isModalMode = false; modalCloseCallback = null; };
    modalCloseCallback = close;
    overlay.querySelector('.qzai-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    ensureGradingOptionStyles();
    renderStep1(overlay, subjects);
}

/* ==================== MANUAL ADD QUESTION MODAL (step 4) ==================== */
function openManualAddModal(container, subjects) {
    const TYPE_DEFS = [
        ['multiple_choice','⊙','Multiple Choice'],
        ['true_false','◐','True / False'],
        ['fill_blank','___','Fill in the Blank'],
        ['short_answer','—','Short Answer'],
        ['essay','¶','Essay'],
    ];

    // Use same Google Forms style as quiz-questions.js openQuestionModal
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:3000;padding:16px;backdrop-filter:blur(2px);';
    overlay.innerHTML = `
        <style>
            .mam-card { background:#fff;border-radius:12px;border:1px solid #dde3ea;border-top:6px solid #00461B; }
            .mam-q-text { width:100%;font-size:16px;font-weight:500;color:#202124;border:none;border-bottom:2px solid #e0e0e0;border-radius:0;padding:8px 4px 6px;resize:none;min-height:52px;font-family:inherit;background:transparent;outline:none;transition:border-color .15s;box-sizing:border-box;line-height:1.45; }
            .mam-q-text:focus { border-bottom-color:#00461B; }
            .mam-q-text::placeholder { color:#9aa0a6; }
            .mam-type-sel { width:100%;padding:10px 12px;border:1px solid #dadce0;border-radius:8px;font-size:13px;font-weight:600;color:#202124;background:#fff;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6368' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;font-family:inherit; }
            .mam-type-sel:focus { outline:none;border-color:#00461B; }
            .mam-media-tab { display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:1.5px solid #e0e0e0;font-size:12px;font-weight:600;color:#5f6368;cursor:pointer;background:#fff;transition:all .15s; }
            .mam-media-tab:hover { border-color:#00461B;color:#00461B; }
            .mam-media-tab.act { border-color:#00461B;color:#00461B;background:#E8F5EC; }
            .mam-opt-row { display:flex;align-items:center;gap:10px;padding:6px 4px;border-radius:8px; }
            .mam-opt-row:hover { background:#f8f9fa; }
            .mam-opt-dot { width:20px;height:20px;flex-shrink:0;border-radius:50%;border:2px solid #dadce0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;transition:all .15s; }
            .mam-opt-dot.correct { background:#00461B;border-color:#00461B;color:#fff; }
            .mam-opt-inp { flex:1;border:none;border-bottom:1.5px solid transparent;padding:5px 4px;font-size:14px;font-family:inherit;color:#202124;background:transparent;outline:none;transition:border-color .15s; }
            .mam-opt-inp:focus { border-bottom-color:#00461B; }
            .mam-opt-inp::placeholder { color:#9aa0a6; }
            .mam-opt-del { width:28px;height:28px;border:none;background:transparent;color:#9aa0a6;cursor:pointer;font-size:18px;border-radius:50%;display:flex;align-items:center;justify-content:center; }
            .mam-opt-del:hover { background:#f1f3f4;color:#5f6368; }
            .mam-add-opt { display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer;font-size:13px;font-weight:600;color:#00461B;background:none;border:none;margin-top:2px; }
            .mam-answer-key { background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:14px 16px; }
            .mam-answer-ta { width:100%;border:none;border-bottom:1.5px solid #bbf7d0;padding:6px 4px;font-size:14px;font-family:inherit;background:transparent;resize:none;outline:none;min-height:44px;color:#202124;box-sizing:border-box; }
            .mam-answer-ta:focus { border-bottom-color:#00461B; }
            .mam-text-hint { padding:12px 16px;background:#f8f9fa;border:1.5px dashed #dadce0;border-radius:8px;font-size:13px;color:#9aa0a6;font-style:italic;margin-bottom:12px; }
            .mam-alert { background:#FEE2E2;color:#b91c1c;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:10px; }
            .mam-btn-cancel { background:#fff;color:#5f6368;border:1.5px solid #dadce0;padding:9px 20px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer; }
            .mam-btn-save { background:#00461B;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer; }
            .mam-btn-save:hover { background:#006428; }
        </style>
        <div style="background:#f0f4f9;border-radius:14px;width:100%;max-width:680px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:gfIn .2s ease;">
            <div style="padding:16px 22px;background:#00461B;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <h3 style="margin:0;font-size:16px;font-weight:700;">Add Question</h3>
                <button id="mam-close" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:7px;font-size:20px;cursor:pointer;">&times;</button>
            </div>
            <div style="overflow-y:auto;flex:1;padding:14px;display:flex;flex-direction:column;gap:12px;">
                <div id="mam-alert"></div>
                <div class="mam-card">
                    <div style="padding:20px 22px;">
                        <!-- Question text + type selector -->
                        <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:18px;">
                            <div style="flex:1;min-width:0;">
                                <textarea class="mam-q-text" id="mam-qtext" placeholder="Question" rows="2"></textarea>
                            </div>
                            <div style="flex-shrink:0;width:185px;">
                                <select class="mam-type-sel" id="mam-qtype">
                                    ${TYPE_DEFS.map(([v, ic, lb]) => `<option value="${v}">${ic} ${lb}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <!-- Media bar -->
                        <div style="display:flex;align-items:center;gap:6px;padding:8px 0 14px;border-bottom:1px solid #f1f3f4;margin-bottom:14px;flex-wrap:wrap;">
                            <span style="font-size:11px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.5px;margin-right:4px;">Attach:</span>
                            <button type="button" class="mam-media-tab act" data-mtype="none">None</button>
                            <button type="button" class="mam-media-tab" data-mtype="image"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg> Image</button>
                            <button type="button" class="mam-media-tab" data-mtype="audio"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg> Audio</button>
                            <button type="button" class="mam-media-tab" data-mtype="link"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg> Link</button>
                        </div>
                        <div id="mam-media-content"></div>
                        <!-- Options / Answer area -->
                        <div id="mam-options-area"></div>
                    </div>
                    <div style="display:flex;align-items:center;padding:12px 22px;border-top:1px solid #f1f3f4;">
                        <span style="font-size:13px;font-weight:600;color:#5f6368;margin-right:8px;">Points</span>
                        <input type="number" id="mam-pts" value="1" min="1" max="100" style="width:60px;padding:6px 10px;border:1.5px solid #dadce0;border-radius:8px;font-size:14px;font-weight:700;text-align:center;">
                    </div>
                </div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid #dde3ea;background:#fff;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                <button class="mam-btn-cancel" id="mam-cancel">Cancel</button>
                <button class="mam-btn-save" id="mam-save">Add to Quiz</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#mam-close').addEventListener('click', close);
    overlay.querySelector('#mam-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // ── Media ──
    let mediaState = { type: 'none', url: '', name: '' };
    let uploading = false;

    function renderMediaContent() {
        const wrap = overlay.querySelector('#mam-media-content');
        overlay.querySelectorAll('.mam-media-tab').forEach(b => b.classList.toggle('act', b.dataset.mtype === mediaState.type));
        if (mediaState.type === 'none') { wrap.innerHTML = ''; return; }
        if (mediaState.type === 'link') {
            wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
                <input type="url" id="mam-url-inp" placeholder="https://…" value="${esc(mediaState.url)}" style="width:100%;padding:9px 12px;border:1.5px solid #dadce0;border-radius:8px;font-size:13px;box-sizing:border-box;">
                <input type="text" id="mam-name-inp" placeholder="Label (optional)" value="${esc(mediaState.name)}" style="width:100%;padding:9px 12px;border:1.5px solid #dadce0;border-radius:8px;font-size:13px;box-sizing:border-box;">
            </div>`;
            wrap.querySelector('#mam-url-inp').addEventListener('input', e => { mediaState.url = e.target.value.trim(); });
            wrap.querySelector('#mam-name-inp').addEventListener('input', e => { mediaState.name = e.target.value.trim(); });
            return;
        }
        const accept = mediaState.type === 'image' ? 'image/*' : 'audio/*';
        if (mediaState.url) {
            const preview = mediaState.type === 'image'
                ? `<img src="${esc(mediaState.url)}" style="max-width:100%;max-height:160px;border-radius:8px;display:block;margin-top:8px;border:1px solid #e8e8e8;object-fit:cover;">`
                : `<audio controls src="${esc(mediaState.url)}" style="width:100%;margin-top:8px;"></audio>`;
            wrap.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#E8F5EC;border-radius:8px;font-size:13px;font-weight:600;color:#1B4D3E;margin-bottom:4px;">${mediaState.type === 'image' ? '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg>' : '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>'} ${esc(mediaState.name || mediaState.url.split('/').pop())}<button id="mam-rm" style="background:none;border:none;color:#b91c1c;cursor:pointer;font-size:18px;margin-left:auto;line-height:1;">×</button></div>${preview}`;
            wrap.querySelector('#mam-rm').addEventListener('click', () => { mediaState.url = ''; mediaState.name = ''; renderMediaContent(); });
        } else {
            wrap.innerHTML = `<div id="mam-dz" style="border:2px dashed #dadce0;border-radius:10px;padding:22px;text-align:center;cursor:pointer;margin-bottom:8px;transition:all .2s;"><div style="display:flex;justify-content:center;margin-bottom:6px;">${mediaState.type === 'image' ? '<svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg>' : '<svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>'}</div><div style="font-size:13px;font-weight:600;color:#374151;">Click or drag to upload ${mediaState.type === 'image' ? 'image' : 'audio'}</div><div style="font-size:11px;color:#9aa0a6;margin-top:3px;">${mediaState.type === 'image' ? 'JPG, PNG, GIF, WEBP' : 'MP3, WAV, OGG, AAC'} · max 10 MB</div></div><input type="file" id="mam-fi" accept="${accept}" style="display:none;"><div id="mam-upst"></div>`;
            const dz = wrap.querySelector('#mam-dz');
            const fi = wrap.querySelector('#mam-fi');
            dz.addEventListener('click', () => fi.click());
            dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#00461B'; dz.style.background = '#f0fdf4'; });
            dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; dz.style.background = ''; });
            dz.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]); });
            fi.addEventListener('change', () => { if (fi.files[0]) doUpload(fi.files[0]); });
        }
    }

    async function doUpload(file) {
        if (uploading) return;
        const st = overlay.querySelector('#mam-upst');
        if (st) st.innerHTML = '<div style="font-size:12px;color:#737373;padding:6px 0;">Uploading…</div>';
        uploading = true;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('media_type', mediaState.type);
        const res = await Api.postForm('/QuizzesAPI.php?action=upload-question-media', fd);
        uploading = false;
        if (res.success) { mediaState.url = BASE_URL + '/' + res.url; mediaState.name = res.name || file.name; renderMediaContent(); }
        else if (st) st.innerHTML = `<div style="color:#b91c1c;font-size:12px;margin-top:4px;">${esc(res.message || 'Upload failed')}</div>`;
    }

    overlay.querySelectorAll('.mam-media-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mtype === mediaState.type) return;
            mediaState = { type: btn.dataset.mtype, url: '', name: '' };
            renderMediaContent();
        });
    });

    // ── Options (Google Forms style) ──
    let options = [
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
    ];

    const typeSelect = overlay.querySelector('#mam-qtype');

    function syncOpts() {
        overlay.querySelectorAll('.mam-opt-inp').forEach(inp => {
            const i = parseInt(inp.dataset.oi);
            if (!isNaN(i)) options[i].option_text = inp.value;
        });
    }

    function repaintOpts(type) {
        const list = overlay.querySelector('#mam-opts');
        if (!list) return;
        list.innerHTML = options.map((o, i) => `
            <div class="mam-opt-row" data-oi="${i}">
                <div class="mam-opt-dot ${o.is_correct ? 'correct' : ''}" data-mark="${i}">${o.is_correct ? '✓' : ''}</div>
                <input class="mam-opt-inp" type="text" data-oi="${i}" value="${esc(o.option_text || '')}"
                    placeholder="${type === 'true_false' ? (o.option_text || 'Option ' + (i+1)) : 'Option ' + (i+1)}"
                    ${type === 'true_false' ? 'readonly style="color:#5f6368;"' : ''}>
                ${(type !== 'true_false' && options.length > 2) ? `<button class="mam-opt-del" data-del="${i}">×</button>` : '<div style="width:28px;"></div>'}
            </div>
        `).join('');
        list.querySelectorAll('[data-mark]').forEach(dot => {
            dot.addEventListener('click', () => {
                syncOpts();
                const i = parseInt(dot.dataset.mark);
                options.forEach((o, idx) => { o.is_correct = idx === i; });
                repaintOpts(type);
            });
        });
        list.querySelectorAll('.mam-opt-inp').forEach(inp => {
            inp.addEventListener('input', () => { options[parseInt(inp.dataset.oi)].option_text = inp.value; });
        });
        list.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', () => { syncOpts(); options.splice(parseInt(btn.dataset.del), 1); repaintOpts(type); });
        });
    }

    function renderOptionsArea(type) {
        const area = overlay.querySelector('#mam-options-area');
        if (type === 'multiple_choice' || type === 'true_false') {
            area.innerHTML = `<div id="mam-opts" style="display:flex;flex-direction:column;gap:4px;"></div>
                ${type === 'multiple_choice' ? `<button class="mam-add-opt" id="mam-add-opt">+ Add option</button>` : ''}`;
            repaintOpts(type);
            overlay.querySelector('#mam-add-opt')?.addEventListener('click', () => {
                syncOpts(); options.push({ option_text:'', is_correct:false }); repaintOpts(type);
                const inps = overlay.querySelectorAll('.mam-opt-inp'); inps[inps.length-1]?.focus();
            });
        } else if (type === 'fill_blank') {
            area.innerHTML = `<div class="mam-text-hint">Students will type their answer in a blank: <span style="display:inline-block;border-bottom:2px solid #00461B;min-width:100px;height:20px;"></span></div>
                <div class="mam-answer-key">
                    <div style="font-size:11px;font-weight:700;color:#1B4D3E;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">✓ Correct Answer</div>
                    <textarea class="mam-answer-ta" id="mam-model" rows="2" placeholder="Type the exact word or phrase…"></textarea>
                    <div style="font-size:11px;color:#6b7280;margin-top:6px;">Case-insensitive. AI grading can accept near-matches.</div>
                </div>`;
        } else if (type === 'short_answer') {
            area.innerHTML = `<div class="mam-text-hint">Students write a short response (1–3 sentences).</div>
                <div class="mam-answer-key">
                    <div style="font-size:11px;font-weight:700;color:#1B4D3E;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">✓ Model Answer (for grading)</div>
                    <textarea class="mam-answer-ta" id="mam-model" rows="3" placeholder="Key points expected in a correct answer…"></textarea>
                    <div style="font-size:11px;color:#6b7280;margin-top:6px;">AI will compare student answers against this.</div>
                </div>`;
        } else if (type === 'essay') {
            area.innerHTML = `<div class="mam-text-hint">Students write a full paragraph or essay response.</div>
                <div class="mam-answer-key">
                    <div style="font-size:11px;font-weight:700;color:#1B4D3E;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">✓ Model Answer / Rubric</div>
                    <textarea class="mam-answer-ta" id="mam-model" rows="4" placeholder="Describe what a complete, correct answer should include…"></textarea>
                    <div style="font-size:11px;color:#6b7280;margin-top:6px;">Used by AI to evaluate completeness and accuracy.</div>
                </div>`;
        }
    }

    typeSelect.addEventListener('change', () => {
        const t = typeSelect.value;
        if (t === 'true_false') options = [{ option_text:'True', is_correct:true }, { option_text:'False', is_correct:false }];
        else if (t === 'multiple_choice' && options.length < 2) options = [{ option_text:'', is_correct:false },{ option_text:'', is_correct:false },{ option_text:'', is_correct:false },{ option_text:'', is_correct:false }];
        renderOptionsArea(t);
    });

    renderMediaContent();
    renderOptionsArea('multiple_choice');

    // ── Save ──
    overlay.querySelector('#mam-save').addEventListener('click', () => {
        const alertEl = overlay.querySelector('#mam-alert');
        const type    = typeSelect.value;
        const text    = overlay.querySelector('#mam-qtext').value.trim();
        const pts     = parseInt(overlay.querySelector('#mam-pts').value) || 1;
        alertEl.innerHTML = '';

        if (!text) { alertEl.innerHTML = '<div class="mam-alert">Question text is required.</div>'; return; }

        // Sync option text from DOM
        syncOpts();

        const subjective = ['short_answer','essay','fill_blank'].includes(type);
        let newQ;

        if (subjective) {
            const modelAns = overlay.querySelector('#mam-model').value.trim();
            newQ = { type, question: text, answer: modelAns, points: pts };
        } else {
            const finalOpts = options.filter(o => o.option_text !== '');
            if (finalOpts.length < 2) { alertEl.innerHTML = '<div class="mam-alert">Add at least 2 options.</div>'; return; }
            if (!finalOpts.some(o => o.is_correct)) { alertEl.innerHTML = '<div class="mam-alert">Mark at least one correct answer.</div>'; return; }

            const optTexts = finalOpts.map(o => o.option_text);
            const correctIndex = finalOpts.findIndex(o => o.is_correct);
            newQ = { type, question: text, options: optTexts, correct_index: correctIndex, points: pts };
            if (type === 'true_false') newQ.answer = optTexts[correctIndex] === 'True';
        }

        // Attach media
        if (mediaState.type !== 'none' && mediaState.url) {
            newQ.media_type = mediaState.type;
            newQ.media_url  = mediaState.url;
            newQ.media_name = mediaState.name || '';
        } else if (mediaState.type === 'link' && !mediaState.url) {
            alertEl.innerHTML = '<div class="mam-alert">Enter a URL for the link attachment, or set attachment to None.</div>';
            return;
        }

        // Add to generatedQuestions
        if (subjective) {
            if (!generatedQuestions.subjective) generatedQuestions.subjective = [];
            generatedQuestions.subjective.push(newQ);
        } else {
            if (!generatedQuestions.objective) generatedQuestions.objective = [];
            generatedQuestions.objective.push(newQ);
        }

        overlay.remove();
        renderStep4(container, subjects);
    });
}

/* ==================== HELPERS ==================== */
function updateStepper(container) {
    container.querySelectorAll('.step').forEach(s => {
        const step = parseInt(s.dataset.step);
        s.classList.remove('active', 'done');
        if (step === currentStep) s.classList.add('active');
        else if (step < currentStep) s.classList.add('done');
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
