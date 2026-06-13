/**
 * Instructor AI Quiz Generator
 * 4-step flow: Configure → Upload PDF/DOCX → Question Settings → Review & Edit
 */
import { Api } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';
import { openQuizModal } from '../../components/quiz-modal.js';
import { showMcPopup } from '../../utils/mc-popup.js';
import { gradingOptionsHtml, readGradingPayload, ensureGradingOptionStyles } from '../../utils/quiz-grading-options.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let currentStep = 1;
let extractedText = '';
let generatedQuestions = null;
let formState = {
    subject_id: '', lessons_id: '', quiz_title: '', quiz_type: 'graded',
    all_sections: true, section_ids: [],
    publish_mode: 'draft', availability_start: '', due_date: '',
    objective_grading_mode: 'auto', subjective_grading_mode: 'ai_auto',
};
let questionSettings = { num_mc: 5, num_tf: 5, num_fib: 0, num_sa: 0, num_essay: 0, difficulty: 'medium' };
let linkedQuizId = null;
let linkedQuizTitle = '';
let lockSubject = false;
let presetSectionId = null;
let subjectSections = [];
let backHref = '#instructor/quizzes';
let successBackHref = '#instructor/quizzes';
let classesDataForModal = [];

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
        subjective_grading_mode: 'ai_auto',
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
        backHref = presetSubjectId ? `#instructor/quizzes?subject_id=${presetSubjectId}` : '#instructor/quizzes';
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
    const typeLabels = { multiple_choice: 'Multiple Choice', true_false: 'True/False', fill_blank: 'Fill in Blank', short_answer: 'Short Answer', essay: 'Essay' };
    const typeCls = { multiple_choice: 'mc', true_false: 'tf', fill_blank: 'fib', short_answer: 'sa', essay: 'essay' };

    let optionsHtml = '';
    if (q.type === 'multiple_choice' && q.options) {
        optionsHtml = q.options.map((opt, oi) => `
            <div class="opt-row">
                <input type="radio" name="correct-${idx}" value="${oi}" ${oi===q.correct_index?'checked':''} data-qidx="${idx}">
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

    return `
        <div class="q-card" data-qidx="${idx}">
            <div class="q-card-header">
                <span class="q-card-num">Q${idx + 1}</span>
                <span class="q-card-type ${typeCls[q.type] || ''}">${typeLabels[q.type] || q.type}</span>
                <button class="btn-del-q" data-idx="${idx}" title="Delete">${icon('close', inl)}</button>
            </div>
            <textarea class="q-text-input" data-qidx="${idx}" rows="2">${esc(q.question)}</textarea>
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
    // Update correct answers for MC
    panel.querySelectorAll('input[type="radio"][name^="correct-"]:checked').forEach(r => {
        const idx = parseInt(r.dataset.qidx);
        if (allQ[idx]) allQ[idx].correct_index = parseInt(r.value);
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
    const objective = allQ.filter(q => ['multiple_choice','true_false','fill_blank'].includes(q.type));
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
                panel.querySelector('#btn-new')?.addEventListener('click', () => render(container));
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
