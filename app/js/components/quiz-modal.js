/**
 * Shared manual quiz create/edit modal — 3-step wizard.
 */
import { Api } from '../api.js';
import { gradingPeriodPickerHtml, readGradingPeriod, normalizeGradingPeriod } from '../utils/gradebook-periods.js';
import { gradingOptionsHtml, readGradingPayload, ensureGradingOptionStyles } from '../utils/quiz-grading-options.js';

import { esc } from '../utils/classroom-ui.js';
const MODAL_STYLES = `
    .qz-m-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2500; padding:20px; }
    .qz-m { background:#fff; border-radius:18px; width:100%; max-width:600px; max-height:92vh; overflow:hidden;
        display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.18); animation:qzMIn .22s ease; }
    @keyframes qzMIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
    .qz-m-hdr { padding:20px 24px; background:#fff; border-bottom:1px solid #E5E7EB; color:#111; flex-shrink:0;
        display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .qz-m-hdr h3 { font-size:18px; font-weight:800; margin:0 0 3px; color:#111; }
    .qz-m-hdr p { font-size:12px; margin:0; color:#6B7280; }
    .qz-m-close { background:none; border:none; color:#374151; width:32px; height:32px;
        border-radius:8px; font-size:20px; cursor:pointer; flex-shrink:0; line-height:1; }
    .qz-m-close:hover { background:#F3F4F6; }

    /* Stepper */
    .qz-stepper { display:flex; align-items:center; padding:12px 24px; border-bottom:1px solid #f0f0f0;
        background:#fafafa; flex-shrink:0; gap:0; }
    .qz-step { display:flex; align-items:center; gap:6px; }
    .qz-step-num { width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center;
        justify-content:center; font-size:12px; font-weight:800; background:#e5e7eb; color:#9ca3af;
        transition:all .2s; flex-shrink:0; }
    .qz-step-label { font-size:11px; font-weight:600; color:#9ca3af; white-space:nowrap; }
    .qz-step-arrow { color:#d1d5db; font-size:13px; margin:0 8px; font-weight:700; flex-shrink:0; }
    .qz-step.active .qz-step-num { background:#00461B; color:#fff; }
    .qz-step.active .qz-step-label { color:#00461B; font-weight:700; }
    .qz-step.done .qz-step-num { background:#22c55e; color:#fff; }
    .qz-step.done .qz-step-label { color:#15803d; }

    .qz-m-body { padding:20px 24px; overflow-y:auto; flex:1; }
    .qz-m-ft { padding:14px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between;
        align-items:center; gap:10px; background:#fafafa; flex-shrink:0; }
    .qz-m-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px;
        text-transform:uppercase; letter-spacing:.4px; }
    .qz-m-field { margin-bottom:16px; }
    .qz-m-input, .qz-m-select, .qz-m-textarea { width:100%; padding:11px 14px; border:1.5px solid #e5e7eb;
        border-radius:10px; font-size:14px; box-sizing:border-box; font-family:inherit; }
    .qz-m-input:focus, .qz-m-select:focus, .qz-m-textarea:focus { outline:none; border-color:#00461B;
        box-shadow:0 0 0 3px rgba(0,70,27,.12); }
    .qz-m-textarea { resize:vertical; min-height:70px; }
    .qz-m-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .qz-m-alert { background:#7F1D1D; color:#fff; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
    .qz-m-btn-back { background:#fff; color:#374151; border:1px solid #e5e7eb; padding:10px 18px;
        border-radius:10px; font-weight:600; cursor:pointer; font-size:14px; }
    .qz-m-btn-next { background:#00461B; color:#fff; border:none; padding:10px 22px; border-radius:10px;
        font-weight:700; cursor:pointer; font-size:14px; transition:opacity .15s; }
    .qz-m-btn-next:disabled { opacity:.55; cursor:not-allowed; }
    .qz-m-subj-badge { padding:11px 14px; background:#E8F5EC; border-radius:10px; font-size:14px;
        font-weight:700; color:#00461B; }
    .qz-m-behavior { border:1.5px solid #e5e7eb; border-radius:12px; padding:14px; background:#fafafa; }
    .qz-m-check { display:flex; align-items:flex-start; gap:10px; cursor:pointer; margin-bottom:10px; }
    .qz-m-check:last-child { margin-bottom:0; }
    .qz-m-check input { accent-color:#00461B; margin-top:3px; }
    .qz-m-check-title { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-m-check-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .qz-sec-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .qz-sec-opt { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer;
        background:#fff; border-bottom:1px solid #f0f0f0; }
    .qz-sec-opt:last-of-type { border-bottom:none; }
    .qz-sec-opt input { accent-color:#00461B; width:16px; height:16px; }
    .qz-sec-opt-text { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-sec-opt-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .qz-sec-checks { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb;
        display:flex; flex-direction:column; gap:8px; }
    .qz-sec-check { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #e5e7eb;
        border-radius:8px; cursor:pointer; font-size:13px; }
    .qz-sec-check input { accent-color:#00461B; }
    .qz-pub-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .qz-pub-opt { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; cursor:pointer;
        background:#fff; border-bottom:1px solid #f0f0f0; }
    .qz-pub-opt:last-child { border-bottom:none; }
    .qz-pub-opt input { accent-color:#00461B; margin-top:3px; }
    .qz-pub-title { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-pub-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .qz-pub-extra { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb; display:none; }
    .qz-pub-extra.show { display:block; }
    @media(max-width:600px) { .qz-m-grid { grid-template-columns:1fr; }
        .qz-step-label { display:none; } .qz-step-arrow { margin:0 4px; } }
`;

// esc() imported from classroom-ui.js (see import above)


function sectionTargetHtml(sections, presetSectionId = null, quiz = null) {
    if (sections.length === 0) {
        return `
            <input type="hidden" name="qz-sec-mode" value="all">
            <p style="font-size:12px;color:#9ca3af;margin:0;">No sections yet — quiz will apply to all sections when you add them.</p>
        `;
    }
    const picked = quiz?.section_ids?.length
        ? quiz.section_ids.map(String)
        : (presetSectionId ? [String(presetSectionId)] : []);
    const defaultAll = quiz ? !!quiz.all_sections : !presetSectionId;
    return `
        <div class="qz-sec-panel" id="qz-sec-panel">
            <label class="qz-sec-opt">
                <input type="radio" name="qz-sec-mode" value="all" ${defaultAll ? 'checked' : ''}>
                <div><span class="qz-sec-opt-text">All sections</span><span class="qz-sec-opt-sub">Every section of this subject</span></div>
            </label>
            <label class="qz-sec-opt">
                <input type="radio" name="qz-sec-mode" value="pick" ${!defaultAll ? 'checked' : ''}>
                <div><span class="qz-sec-opt-text">Choose sections</span><span class="qz-sec-opt-sub">Assign to specific section(s)</span></div>
            </label>
            <div class="qz-sec-checks" id="qz-sec-checks" style="${defaultAll ? 'display:none' : ''}">
                ${sections.map(sec => `
                    <label class="qz-sec-check">
                        <input type="checkbox" class="qz-sec-pick" value="${sec.section_id}"
                            ${picked.includes(String(sec.section_id)) ? 'checked' : ''}>
                        <span>${esc(sec.section_name)}${sec.schedule ? ` <small style="color:#9ca3af">· ${esc(sec.schedule)}</small>` : ''}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function wireSectionTarget(el) {
    const list = el.querySelector('#qz-sec-checks');
    el.querySelectorAll('input[name="qz-sec-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (list) list.style.display = radio.value === 'pick' && radio.checked ? '' : 'none';
        });
    });
}

function toLocalDatetimeInput(value) {
    if (!value) return '';
    const d = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getPublishState(quiz) {
    if (!quiz || quiz.status === 'draft') {
        return { mode: 'draft', availability_start: '', due_date: quiz?.due_date ? toLocalDatetimeInput(quiz.due_date) : '' };
    }
    if (quiz.availability_start && new Date(String(quiz.availability_start).replace(' ', 'T')) > new Date()) {
        return {
            mode: 'scheduled',
            availability_start: toLocalDatetimeInput(quiz.availability_start),
            due_date: quiz?.due_date ? toLocalDatetimeInput(quiz.due_date) : '',
        };
    }
    return { mode: 'now', availability_start: '', due_date: quiz?.due_date ? toLocalDatetimeInput(quiz.due_date) : '' };
}

function publishOptionsHtml(pubState) {
    return `
        <div class="qz-m-field">
            <span class="qz-m-label">Release to Students</span>
            <div class="qz-pub-panel" id="qz-pub-panel">
                <label class="qz-pub-opt">
                    <input type="radio" name="qz-pub-mode" value="draft" ${pubState.mode === 'draft' ? 'checked' : ''}>
                    <div><span class="qz-pub-title">Save as draft</span><span class="qz-pub-sub">Only you can see it until you publish later</span></div>
                </label>
                <label class="qz-pub-opt">
                    <input type="radio" name="qz-pub-mode" value="now" ${pubState.mode === 'now' ? 'checked' : ''}>
                    <div><span class="qz-pub-title">Publish now</span><span class="qz-pub-sub">Students see it immediately in their class</span></div>
                </label>
                <label class="qz-pub-opt">
                    <input type="radio" name="qz-pub-mode" value="scheduled" ${pubState.mode === 'scheduled' ? 'checked' : ''}>
                    <div><span class="qz-pub-title">Schedule release</span><span class="qz-pub-sub">Automatically appears for students at the chosen date &amp; time</span></div>
                </label>
                <div class="qz-pub-extra ${pubState.mode === 'scheduled' ? 'show' : ''}" id="qz-pub-schedule-wrap">
                    <label class="qz-m-label" for="qz-availability">Go live at *</label>
                    <input type="datetime-local" class="qz-m-input" id="qz-availability" value="${pubState.availability_start}">
                </div>
                <div class="qz-pub-extra show" id="qz-pub-due-wrap" style="border-top:1px solid #e5e7eb;">
                    <label class="qz-m-label" for="qz-due">Deadline (optional)</label>
                    <input type="datetime-local" class="qz-m-input" id="qz-due" value="${pubState.due_date}">
                    <p style="font-size:11px;color:#6b7280;margin:6px 0 0;">Students cannot start the quiz after this date and time. Leave empty for no deadline.</p>
                </div>
            </div>
        </div>
    `;
}

function wirePublishOptions(el) {
    const scheduleWrap = el.querySelector('#qz-pub-schedule-wrap');
    const sync = () => {
        const mode = el.querySelector('input[name="qz-pub-mode"]:checked')?.value || 'draft';
        if (scheduleWrap) scheduleWrap.classList.toggle('show', mode === 'scheduled');
    };
    el.querySelectorAll('input[name="qz-pub-mode"]').forEach(r => r.addEventListener('change', sync));
    sync();
}

function readPublishPayload(el) {
    const mode = el.querySelector('input[name="qz-pub-mode"]:checked')?.value || 'draft';
    return {
        publish_mode: mode,
        availability_start: el.querySelector('#qz-availability')?.value || '',
        due_date: el.querySelector('#qz-due')?.value || '',
    };
}

function readSectionPayload(el) {
    const mode = el.querySelector('input[name="qz-sec-mode"]:checked')?.value || 'all';
    const allSections = mode === 'all';
    const sectionIds = allSections
        ? []
        : [...el.querySelectorAll('.qz-sec-pick:checked')].map(cb => parseInt(cb.value, 10));
    return { all_sections: allSections, section_ids: sectionIds };
}

function updateStepper(overlay, step) {
    overlay.querySelectorAll('.qz-step').forEach(s => {
        const n = parseInt(s.dataset.step);
        s.className = 'qz-step' + (n === step ? ' active' : n < step ? ' done' : '');
        const num = s.querySelector('.qz-step-num');
        if (num) num.textContent = n < step ? '✓' : String(n);
    });
}

/**
 * @param {Object} options
 * @param {string|number} [options.presetSubjectId]
 * @param {string|number} [options.presetSectionId]
 * @param {boolean} [options.lockSubject]
 * @param {Array} [options.classesData]
 * @param {Object} [options.quiz] — edit mode
 * @param {boolean} [options.hidePublish]
 * @param {Function} [options.onSuccess]
 */
export async function openQuizModal(options = {}) {
    const {
        presetSubjectId = '',
        presetSectionId = null,
        lockSubject = false,
        quiz = null,
        hidePublish = false,
        onSuccess = null,
    } = options;

    const isEdit = !!quiz;
    const showPublish = isEdit || !hidePublish;

    let classesData = options.classesData;
    if (!classesData) {
        const res = await Api.get('/SectionsAPI.php?action=instructor-classes');
        classesData = res.success ? res.data : [];
    }

    const subjectId = isEdit ? quiz.subject_id : presetSubjectId;
    let currentSubject = classesData.find(s => String(s.subject_id) === String(subjectId));
    let currentSections = currentSubject?.sections || [];

    if (!document.getElementById('qz-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'qz-modal-styles';
        style.textContent = MODAL_STYLES;
        document.head.appendChild(style);
    }
    ensureGradingOptionStyles();

    const pub0 = getPublishState(quiz);
    // Persisted form data across wizard steps
    let fd = {
        grading_period: normalizeGradingPeriod(quiz?.grading_period || 'P1'),
        subject_id: subjectId || '',
        quiz_title: quiz?.quiz_title || '',
        quiz_description: quiz?.quiz_description || '',
        all_sections: quiz ? !!quiz.all_sections : !presetSectionId,
        section_ids: quiz?.section_ids || (presetSectionId ? [presetSectionId] : []),
        time_limit: quiz?.time_limit ?? 30,
        passing_rate: quiz?.passing_rate ?? 60,
        unlimited_attempts: !quiz || (quiz.max_attempts ?? 3) == 0,
        max_attempts: quiz && (quiz.max_attempts ?? 3) > 0 ? quiz.max_attempts : 3,
        is_randomized: !!quiz?.is_randomized,
        one_at_a_time: !!quiz?.one_at_a_time,
        publish_mode: pub0.mode,
        availability_start: pub0.availability_start,
        due_date: pub0.due_date,
        objective_grading_mode: quiz?.objective_grading_mode || 'auto',
        subjective_grading_mode: quiz?.subjective_grading_mode || 'ai_review',
    };

    const overlay = document.createElement('div');
    overlay.className = 'qz-m-overlay';
    overlay.innerHTML = `
        <div class="qz-m" role="dialog" aria-modal="true">
            <div class="qz-m-hdr">
                <div>
                    <h3>${isEdit ? 'Edit Quiz' : 'Create Quiz'}</h3>
                    <p>${isEdit ? 'Update quiz settings and section assignment' : 'Set up a new quiz, then add questions'}</p>
                </div>
                <button type="button" class="qz-m-close" aria-label="Close">&times;</button>
            </div>
            <div class="qz-stepper">
                <div class="qz-step active" data-step="1">
                    <div class="qz-step-num">1</div>
                    <div class="qz-step-label">Setup</div>
                </div>
                <span class="qz-step-arrow">→</span>
                <div class="qz-step" data-step="2">
                    <div class="qz-step-num">2</div>
                    <div class="qz-step-label">Settings</div>
                </div>
                <span class="qz-step-arrow">→</span>
                <div class="qz-step" data-step="3">
                    <div class="qz-step-num">3</div>
                    <div class="qz-step-label">${showPublish ? 'Release' : 'Finish'}</div>
                </div>
            </div>
            <div class="qz-m-body" id="qz-m-body"></div>
            <div class="qz-m-ft">
                <button type="button" class="qz-m-btn-back" id="qz-btn-left">Cancel</button>
                <span style="flex:1"></span>
                <button type="button" class="qz-m-btn-back" id="qz-btn-save-now" hidden style="margin-right:8px;">Save now</button>
                <button type="button" class="qz-m-btn-next" id="qz-btn-right">Next: Settings →</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.qz-m-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    function goStep(step) {
        updateStepper(overlay, step);
        const body = overlay.querySelector('#qz-m-body');
        const leftBtn = overlay.querySelector('#qz-btn-left');
        const rightBtn = overlay.querySelector('#qz-btn-right');
        rightBtn.disabled = false;

        const saveNowBtn = overlay.querySelector('#qz-btn-save-now');
        if (saveNowBtn) saveNowBtn.hidden = !(isEdit && step === 1);
        if (step === 1) {
            leftBtn.textContent = 'Cancel';
            leftBtn.onclick = close;
            rightBtn.textContent = 'Next: Settings →';
            renderStep1(body, leftBtn, rightBtn);
        } else if (step === 2) {
            leftBtn.textContent = '← Back';
            rightBtn.textContent = showPublish ? 'Next: Release →' : (isEdit ? 'Update Quiz' : 'Create Quiz');
            renderStep2(body, leftBtn, rightBtn);
        } else {
            leftBtn.textContent = '← Back';
            rightBtn.textContent = isEdit ? 'Update Quiz' : 'Create Quiz';
            renderStep3(body, leftBtn, rightBtn);
        }
    }

    /* ── STEP 1: Setup ── */
    function renderStep1(body, leftBtn, rightBtn) {
        const secQuiz = { all_sections: fd.all_sections, section_ids: fd.section_ids };
        body.innerHTML = `
            <div id="qz-m-alert"></div>
            ${lockSubject && currentSubject ? `
                <div class="qz-m-field">
                    <span class="qz-m-label">Subject</span>
                    <div class="qz-m-subj-badge">${esc(currentSubject.subject_code)} — ${esc(currentSubject.subject_name)}</div>
                    <input type="hidden" id="qz-subject" value="${currentSubject.subject_id}">
                </div>
            ` : `
                <div class="qz-m-field">
                    <label class="qz-m-label" for="qz-subject">Subject *</label>
                    <select class="qz-m-select" id="qz-subject" ${isEdit ? 'disabled' : ''}>
                        <option value="">Select subject</option>
                        ${classesData.map(s => `<option value="${s.subject_id}" ${String(fd.subject_id) === String(s.subject_id) ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                    </select>
                </div>
            `}
            <div class="qz-m-field">
                <span class="qz-m-label">Sections *</span>
                <div id="qz-sec-inner">${sectionTargetHtml(currentSections, presetSectionId, secQuiz)}</div>
            </div>
            <div class="qz-m-field">
                <label class="qz-m-label" for="qz-title">Quiz Title *</label>
                <input class="qz-m-input" id="qz-title" value="${esc(fd.quiz_title)}" placeholder="e.g. Midterm Exam — Chapter 3">
            </div>
            <div class="qz-m-field">
                <label class="qz-m-label" for="qz-desc">Description</label>
                <textarea class="qz-m-textarea" id="qz-desc" rows="2" placeholder="Instructions or overview for students">${esc(fd.quiz_description)}</textarea>
            </div>
            ${isEdit ? `
            <div class="qz-m-field">
                <label class="qz-m-label" for="qz-due-s1">Deadline</label>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="datetime-local" class="qz-m-input" id="qz-due-s1" value="${esc(fd.due_date || '')}" style="flex:1;min-width:0;">
                    <button type="button" id="qz-due-clear" class="qz-m-btn-back" style="flex-shrink:0;padding:10px 12px;">Clear</button>
                </div>
                <p style="font-size:11px;color:#6b7280;margin:6px 0 0;">Change the date or time, then press <b>Save now</b>. Leave empty for no deadline.</p>
            </div>` : ''}
        `;

        wireSectionTarget(body);

        if (!lockSubject && !isEdit) {
            body.querySelector('#qz-subject')?.addEventListener('change', e => {
                const sid = e.target.value;
                currentSubject = classesData.find(s => String(s.subject_id) === String(sid));
                currentSections = currentSubject?.sections || [];
                const inner = body.querySelector('#qz-sec-inner');
                if (inner) inner.innerHTML = sectionTargetHtml(currentSections, null, null);
                wireSectionTarget(body);
            });
        }

        rightBtn.onclick = () => {
            const alertEl = body.querySelector('#qz-m-alert');
            const subjectVal = isEdit
                ? quiz.subject_id
                : (body.querySelector('#qz-subject')?.value || presetSubjectId);
            const title = body.querySelector('#qz-title')?.value?.trim();

            if (!subjectVal) { alertEl.innerHTML = '<div class="qz-m-alert">Please select a subject.</div>'; return; }
            if (!title) { alertEl.innerHTML = '<div class="qz-m-alert">Quiz title is required.</div>'; return; }

            const hasSectionUi = body.querySelector('input[name="qz-sec-mode"]');
            const sec = readSectionPayload(body);
            if (hasSectionUi && !sec.all_sections && !sec.section_ids.length) {
                alertEl.innerHTML = '<div class="qz-m-alert">Select at least one section.</div>';
                return;
            }

            Object.assign(fd, {
                subject_id: subjectVal,
                quiz_title: title,
                quiz_description: body.querySelector('#qz-desc')?.value?.trim() || '',
                all_sections: sec.all_sections,
                section_ids: sec.section_ids,
            });
            if (isEdit) fd.due_date = body.querySelector('#qz-due-s1')?.value || '';
            return true;
        };
        const readStep1 = rightBtn.onclick;
        rightBtn.onclick = () => { if (readStep1()) goStep(2); };

        body.querySelector('#qz-due-clear')?.addEventListener('click', () => {
            const inp = body.querySelector('#qz-due-s1');
            if (inp) inp.value = '';
        });

        // Editing only the deadline should not mean clicking through 3 pages.
        const saveNow = overlay.querySelector('#qz-btn-save-now');
        if (saveNow) {
            saveNow.hidden = !isEdit;
            saveNow.onclick = () => { if (readStep1()) doSave(body, saveNow); };
        }
    }

    /* ── STEP 2: Settings ── */
    function renderStep2(body, leftBtn, rightBtn) {
        body.innerHTML = `
            <div id="qz-m-alert"></div>
            <div class="qz-m-grid">
                <div class="qz-m-field">
                    <label class="qz-m-label" for="qz-time">Time Limit (min)</label>
                    <input type="number" class="qz-m-input" id="qz-time" value="${fd.time_limit}" min="1">
                </div>
                <div class="qz-m-field">
                    <label class="qz-m-label" for="qz-pass">Passing Rate (%)</label>
                    <input type="number" class="qz-m-input" id="qz-pass" value="${fd.passing_rate}" min="0" max="100">
                </div>
            </div>
            <div class="qz-m-field">
                <span class="qz-m-label">Student Attempts</span>
                <div class="qz-m-behavior" style="margin-bottom:10px;">
                    <label class="qz-m-check">
                        <input type="checkbox" id="qz-unlimited-attempts" ${fd.unlimited_attempts ? 'checked' : ''}>
                        <div>
                            <span class="qz-m-check-title">Unlimited attempts</span>
                            <span class="qz-m-check-sub">Students can retake this quiz as many times as needed</span>
                        </div>
                    </label>
                </div>
                <label class="qz-m-label" for="qz-attempts" style="text-transform:none;font-size:11px;color:#6b7280;">Or set a limit per student</label>
                <input type="number" class="qz-m-input" id="qz-attempts" value="${fd.max_attempts || 3}" min="1" max="99" ${fd.unlimited_attempts ? 'disabled' : ''}>
                <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">Example: 1 = one try only, 3 = three tries.</p>
            </div>
            <div class="qz-m-field">
                <span class="qz-m-label">Quiz Behavior</span>
                <div class="qz-m-behavior">
                    <label class="qz-m-check">
                        <input type="checkbox" id="qz-randomize" ${fd.is_randomized ? 'checked' : ''}>
                        <div>
                            <span class="qz-m-check-title">Randomize questions &amp; answers</span>
                            <span class="qz-m-check-sub">Shuffle order for each student</span>
                        </div>
                    </label>
                    <label class="qz-m-check">
                        <input type="checkbox" id="qz-one-at-a-time" ${fd.one_at_a_time ? 'checked' : ''}>
                        <div>
                            <span class="qz-m-check-title">One question at a time</span>
                            <span class="qz-m-check-sub">Students cannot go back to previous questions</span>
                        </div>
                    </label>
                </div>
            </div>
        `;

        const unlimitedCb = body.querySelector('#qz-unlimited-attempts');
        const attemptsInput = body.querySelector('#qz-attempts');
        unlimitedCb.addEventListener('change', () => { attemptsInput.disabled = unlimitedCb.checked; });

        const saveStep2 = () => {
            const unlimited = !!body.querySelector('#qz-unlimited-attempts')?.checked;
            Object.assign(fd, {
                time_limit: parseInt(body.querySelector('#qz-time')?.value, 10) || 30,
                passing_rate: parseInt(body.querySelector('#qz-pass')?.value, 10) || 60,
                unlimited_attempts: unlimited,
                max_attempts: unlimited ? 0 : (parseInt(body.querySelector('#qz-attempts')?.value, 10) || 3),
                is_randomized: !!body.querySelector('#qz-randomize')?.checked,
                one_at_a_time: !!body.querySelector('#qz-one-at-a-time')?.checked,
            });
        };

        leftBtn.onclick = () => { saveStep2(); goStep(1); };
        rightBtn.onclick = () => {
            saveStep2();
            if (showPublish) goStep(3);
            else doSave(body, rightBtn);
        };
    }

    /* ── STEP 3: Release ── */
    function renderStep3(body, leftBtn, rightBtn) {
        body.innerHTML = `
            <div id="qz-m-alert"></div>
            <div class="qz-m-field">
                <span class="qz-m-label">AI &amp; Answer Checking</span>
                ${gradingOptionsHtml(quiz, 'qz')}
            </div>
            <div class="qz-m-field">${gradingPeriodPickerHtml('qz-period', fd.grading_period)}</div>
            ${publishOptionsHtml({ mode: fd.publish_mode, availability_start: fd.availability_start, due_date: fd.due_date })}
        `;

        wirePublishOptions(body);

        const saveStep3 = () => {
            Object.assign(fd, readGradingPayload(body, 'qz'));
            Object.assign(fd, readPublishPayload(body));
            fd.grading_period = readGradingPeriod(body, 'qz-period');
        };

        leftBtn.onclick = () => { saveStep3(); goStep(2); };
        rightBtn.onclick = () => { saveStep3(); doSave(body, rightBtn); };
    }

    /* ── SAVE ── */
    async function doSave(body, saveBtn) {
        const alertEl = body.querySelector('#qz-m-alert');

        if (showPublish && fd.publish_mode === 'scheduled' && !fd.availability_start) {
            if (alertEl) alertEl.innerHTML = '<div class="qz-m-alert">Please choose a date and time for the scheduled release.</div>';
            return;
        }

        const payload = {
            subject_id: parseInt(fd.subject_id, 10) || fd.subject_id,
            quiz_title: fd.quiz_title,
            quiz_description: fd.quiz_description || '',
            time_limit: fd.time_limit,
            passing_rate: fd.passing_rate,
            unlimited_attempts: fd.unlimited_attempts,
            max_attempts: fd.max_attempts,
            is_randomized: fd.is_randomized ? 1 : 0,
            one_at_a_time: fd.one_at_a_time ? 1 : 0,
            all_sections: fd.all_sections,
            section_ids: fd.section_ids,
            publish_mode: fd.publish_mode || 'draft',
            availability_start: fd.availability_start || '',
            due_date: fd.due_date || '',
            grading_period: fd.grading_period || 'P1',
            objective_grading_mode: fd.objective_grading_mode || 'auto',
            subjective_grading_mode: fd.subjective_grading_mode || 'ai_review',
        };

        saveBtn.disabled = true;
        saveBtn.textContent = isEdit ? 'Updating…' : 'Creating…';

        const action = isEdit ? 'update' : 'create';
        if (isEdit) payload.quiz_id = quiz.quiz_id;

        const res = await Api.post(`/QuizzesAPI.php?action=${action}`, payload);
        if (res.success) {
            const quizId = isEdit ? quiz.quiz_id : (res.data?.id || res.data?.quiz_id);
            close();
            if (onSuccess) {
                onSuccess(quizId);
            } else if (!isEdit && quizId) {
                window.location.hash = `#instructor/quiz-questions?quiz_id=${quizId}`;
            }
        } else {
            if (alertEl) alertEl.innerHTML = `<div class="qz-m-alert">${esc(res.message || 'Failed to save quiz')}</div>`;
            saveBtn.disabled = false;
            saveBtn.textContent = isEdit ? 'Update Quiz' : 'Create Quiz';
        }
    }

    goStep(1);
}
