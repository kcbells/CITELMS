/**
 * Shared manual quiz create/edit modal — section targeting like lessons.
 */
import { Api } from '../api.js';
import { gradingOptionsHtml, readGradingPayload, ensureGradingOptionStyles } from '../utils/quiz-grading-options.js';
import { gradingPeriodSelectHtml } from '../utils/gradebook-periods.js';

const MODAL_STYLES = `
    .qz-m-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2500; padding:20px; }
    .qz-m { background:#fff; border-radius:18px; width:100%; max-width:600px; max-height:92vh; overflow:hidden;
        display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.18); }
    .qz-m-hdr { padding:22px 24px; background:#00461B; color:#fff;
        display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .qz-m-hdr h3 { font-size:18px; font-weight:800; margin:0 0 4px; }
    .qz-m-hdr p { font-size:12px; margin:0; opacity:.85; }
    .qz-m-close { background:rgba(255,255,255,.15); border:none; color:#fff; width:32px; height:32px;
        border-radius:8px; font-size:20px; cursor:pointer; }
    .qz-m-body { padding:22px 24px; overflow-y:auto; flex:1; }
    .qz-m-ft { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:10px; background:#fafafa; }
    .qz-m-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }
    .qz-m-field { margin-bottom:16px; }
    .qz-m-input, .qz-m-select, .qz-m-textarea { width:100%; padding:11px 14px; border:1.5px solid #e5e7eb; border-radius:10px;
        font-size:14px; box-sizing:border-box; font-family:inherit; }
    .qz-m-input:focus, .qz-m-select:focus, .qz-m-textarea:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.12); }
    .qz-m-textarea { resize:vertical; min-height:70px; }
    .qz-m-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .qz-m-alert { background:#FEE2E2; color:#B91C1C; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
    .qz-m-btn-cancel { background:#fff; color:#374151; border:1px solid #e5e7eb; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer; }
    .qz-m-btn-save { background:#00461B; color:#fff; border:none; padding:10px 22px; border-radius:10px; font-weight:700; cursor:pointer; }
    .qz-m-btn-save:disabled { opacity:.6; cursor:not-allowed; }
    .qz-m-subj-badge { padding:11px 14px; background:#E8F5EC; border-radius:10px; font-size:14px; font-weight:700; color:#00461B; }
    .qz-m-behavior { border:1.5px solid #e5e7eb; border-radius:12px; padding:14px; background:#fafafa; }
    .qz-m-check { display:flex; align-items:flex-start; gap:10px; cursor:pointer; margin-bottom:10px; }
    .qz-m-check:last-child { margin-bottom:0; }
    .qz-m-check input { accent-color:#00461B; margin-top:3px; }
    .qz-m-check-title { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-m-check-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .qz-sec-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .qz-sec-opt { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; background:#fff; border-bottom:1px solid #f0f0f0; }
    .qz-sec-opt:last-of-type { border-bottom:none; }
    .qz-sec-opt input { accent-color:#00461B; width:16px; height:16px; }
    .qz-sec-opt-text { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-sec-opt-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .qz-sec-checks { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; gap:8px; }
    .qz-sec-check { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; cursor:pointer; font-size:13px; }
    .qz-sec-check input { accent-color:#00461B; }
    .qz-pub-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .qz-pub-opt { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; cursor:pointer; background:#fff; border-bottom:1px solid #f0f0f0; }
    .qz-pub-opt:last-child { border-bottom:none; }
    .qz-pub-opt input { accent-color:#00461B; margin-top:3px; }
    .qz-pub-title { font-size:13px; font-weight:600; color:#111827; display:block; }
    .qz-pub-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .qz-pub-extra { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb; display:none; }
    .qz-pub-extra.show { display:block; }
    @media(max-width:600px) { .qz-m-grid { grid-template-columns:1fr; } }
`;

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

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

function wireSectionTarget(overlay) {
    const list = overlay.querySelector('#qz-sec-checks');
    overlay.querySelectorAll('input[name="qz-sec-mode"]').forEach(radio => {
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
        return { mode: 'draft', availability_start: '', due_date: quiz?.due_date ? String(quiz.due_date).slice(0, 10) : '' };
    }
    if (quiz.availability_start && new Date(String(quiz.availability_start).replace(' ', 'T')) > new Date()) {
        return {
            mode: 'scheduled',
            availability_start: toLocalDatetimeInput(quiz.availability_start),
            due_date: quiz?.due_date ? String(quiz.due_date).slice(0, 10) : '',
        };
    }
    return {
        mode: 'now',
        availability_start: '',
        due_date: quiz?.due_date ? String(quiz.due_date).slice(0, 10) : '',
    };
}

function publishOptionsHtml(quiz = null) {
    const pub = getPublishState(quiz);
    return `
        <div class="qz-m-field">
            <span class="qz-m-label">Release to Students</span>
            <div class="qz-pub-panel" id="qz-pub-panel">
                <label class="qz-pub-opt">
                    <input type="radio" name="qz-pub-mode" value="draft" ${pub.mode === 'draft' ? 'checked' : ''}>
                    <div><span class="qz-pub-title">Save as draft</span><span class="qz-pub-sub">Only you can see it until you publish later</span></div>
                </label>
                <label class="qz-pub-opt">
                    <input type="radio" name="qz-pub-mode" value="now" ${pub.mode === 'now' ? 'checked' : ''}>
                    <div><span class="qz-pub-title">Publish now</span><span class="qz-pub-sub">Students see it immediately in their class</span></div>
                </label>
                <label class="qz-pub-opt">
                    <input type="radio" name="qz-pub-mode" value="scheduled" ${pub.mode === 'scheduled' ? 'checked' : ''}>
                    <div><span class="qz-pub-title">Schedule release</span><span class="qz-pub-sub">Automatically appears for students at the chosen date &amp; time</span></div>
                </label>
                <div class="qz-pub-extra ${pub.mode === 'scheduled' ? 'show' : ''}" id="qz-pub-schedule-wrap">
                    <label class="qz-m-label" for="qz-availability">Go live at *</label>
                    <input type="datetime-local" class="qz-m-input" id="qz-availability" value="${pub.availability_start}">
                </div>
                <div class="qz-pub-extra show" id="qz-pub-due-wrap" style="border-top:1px solid #e5e7eb;">
                    <label class="qz-m-label" for="qz-due">Due date (optional)</label>
                    <input type="date" class="qz-m-input" id="qz-due" value="${pub.due_date}">
                </div>
            </div>
        </div>
    `;
}

function wirePublishOptions(overlay) {
    const scheduleWrap = overlay.querySelector('#qz-pub-schedule-wrap');
    const sync = () => {
        const mode = overlay.querySelector('input[name="qz-pub-mode"]:checked')?.value || 'draft';
        if (scheduleWrap) scheduleWrap.classList.toggle('show', mode === 'scheduled');
    };
    overlay.querySelectorAll('input[name="qz-pub-mode"]').forEach(r => r.addEventListener('change', sync));
    sync();
}

function readPublishPayload(overlay) {
    const mode = overlay.querySelector('input[name="qz-pub-mode"]:checked')?.value || 'draft';
    return {
        publish_mode: mode,
        availability_start: overlay.querySelector('#qz-availability')?.value || '',
        due_date: overlay.querySelector('#qz-due')?.value || '',
    };
}

function readSectionPayload(overlay) {
    const mode = overlay.querySelector('input[name="qz-sec-mode"]:checked')?.value || 'all';
    const allSections = mode === 'all';
    const sectionIds = allSections
        ? []
        : [...overlay.querySelectorAll('.qz-sec-pick:checked')].map(cb => parseInt(cb.value, 10));
    return { all_sections: allSections, section_ids: sectionIds };
}

/**
 * @param {Object} options
 * @param {string|number} [options.presetSubjectId]
 * @param {string|number} [options.presetSectionId]
 * @param {boolean} [options.lockSubject]
 * @param {Array} [options.classesData]
 * @param {Object} [options.quiz] — edit mode
 * @param {boolean} [options.hidePublish] — create as draft; publish later from classwork menu
 * @param {Function} [options.onSuccess] — (quizId) => void
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
    const subject = classesData.find(s => String(s.subject_id) === String(subjectId));
    const sections = subject?.sections || [];

    if (!document.getElementById('qz-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'qz-modal-styles';
        style.textContent = MODAL_STYLES;
        document.head.appendChild(style);
    }
    ensureGradingOptionStyles();

    const overlay = document.createElement('div');
    overlay.className = 'qz-m-overlay';
    overlay.innerHTML = `
        <div class="qz-m" role="dialog" aria-modal="true">
            <div class="qz-m-hdr">
                <div>
                    <h3>${isEdit ? 'Edit Quiz' : 'Create Quiz'}</h3>
                    <p>${isEdit ? 'Update quiz settings and section assignment' : 'Set up a quiz manually, then add questions'}</p>
                </div>
                <button type="button" class="qz-m-close" aria-label="Close">&times;</button>
            </div>
            <div class="qz-m-body">
                <div id="qz-m-alert"></div>
                ${lockSubject && subject ? `
                    <div class="qz-m-field">
                        <span class="qz-m-label">Subject</span>
                        <div class="qz-m-subj-badge">${esc(subject.subject_code)} — ${esc(subject.subject_name)}</div>
                        <input type="hidden" id="qz-subject" value="${subject.subject_id}">
                    </div>
                ` : `
                    <div class="qz-m-field">
                        <label class="qz-m-label" for="qz-subject">Subject *</label>
                        <select class="qz-m-select" id="qz-subject" ${isEdit ? 'disabled' : ''}>
                            <option value="">Select subject</option>
                            ${classesData.map(s => `<option value="${s.subject_id}" ${String(subjectId) === String(s.subject_id) ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                        </select>
                    </div>
                `}
                <div class="qz-m-field" id="qz-sec-wrap">
                    <span class="qz-m-label">Sections *</span>
                    <div id="qz-sec-inner">${sectionTargetHtml(sections, presetSectionId, quiz)}</div>
                </div>
                <div class="qz-m-field">
                    <label class="qz-m-label" for="qz-title">Quiz Title *</label>
                    <input class="qz-m-input" id="qz-title" value="${esc(quiz?.quiz_title || '')}" placeholder="e.g. Midterm Exam — Chapter 3">
                </div>
                ${gradingPeriodSelectHtml('qz-period', quiz?.grading_period || 'P1')}
                <div class="qz-m-field">
                    <label class="qz-m-label" for="qz-desc">Description</label>
                    <textarea class="qz-m-textarea" id="qz-desc" rows="2" placeholder="Instructions or overview for students">${esc(quiz?.quiz_description || '')}</textarea>
                </div>
                <div class="qz-m-grid">
                    <div class="qz-m-field">
                        <label class="qz-m-label" for="qz-time">Time Limit (min)</label>
                        <input type="number" class="qz-m-input" id="qz-time" value="${quiz?.time_limit ?? 30}" min="1">
                    </div>
                    <div class="qz-m-field">
                        <label class="qz-m-label" for="qz-pass">Passing Rate (%)</label>
                        <input type="number" class="qz-m-input" id="qz-pass" value="${quiz?.passing_rate ?? 60}" min="0" max="100">
                    </div>
                </div>
                <div class="qz-m-field">
                    <span class="qz-m-label">Student Attempts</span>
                    <div class="qz-m-behavior" style="margin-bottom:10px;">
                        <label class="qz-m-check">
                            <input type="checkbox" id="qz-unlimited-attempts" ${!quiz || (quiz.max_attempts ?? 3) == 0 ? 'checked' : ''}>
                            <div>
                                <span class="qz-m-check-title">Unlimited attempts</span>
                                <span class="qz-m-check-sub">Students can retake this quiz as many times as needed</span>
                            </div>
                        </label>
                    </div>
                    <label class="qz-m-label" for="qz-attempts" style="text-transform:none;font-size:11px;color:#6b7280;">Or set a limit per student</label>
                    <input type="number" class="qz-m-input" id="qz-attempts"
                        value="${quiz && (quiz.max_attempts ?? 3) > 0 ? quiz.max_attempts : 3}" min="1" max="99"
                        ${!quiz || (quiz.max_attempts ?? 3) == 0 ? 'disabled' : ''}>
                    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">Example: 1 = one try only, 3 = three tries. When the limit is reached, students cannot start the quiz again.</p>
                </div>
                ${showPublish ? publishOptionsHtml(quiz) : ''}
                <div class="qz-m-field">
                    <span class="qz-m-label">AI &amp; Answer Checking</span>
                    ${gradingOptionsHtml(quiz, 'qz')}
                </div>
                <div class="qz-m-field">
                    <span class="qz-m-label">Quiz Behavior</span>
                    <div class="qz-m-behavior">
                        <label class="qz-m-check">
                            <input type="checkbox" id="qz-randomize" ${quiz?.is_randomized ? 'checked' : ''}>
                            <div>
                                <span class="qz-m-check-title">Randomize questions &amp; answers</span>
                                <span class="qz-m-check-sub">Shuffle order for each student</span>
                            </div>
                        </label>
                        <label class="qz-m-check">
                            <input type="checkbox" id="qz-one-at-a-time" ${quiz?.one_at_a_time ? 'checked' : ''}>
                            <div>
                                <span class="qz-m-check-title">One question at a time</span>
                                <span class="qz-m-check-sub">Students cannot go back to previous questions</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            <div class="qz-m-ft">
                <button type="button" class="qz-m-btn-cancel">Cancel</button>
                <button type="button" class="qz-m-btn-save" id="qz-save">${isEdit ? 'Update Quiz' : 'Create Quiz'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.qz-m-close').addEventListener('click', close);
    overlay.querySelector('.qz-m-btn-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    wireSectionTarget(overlay);
    if (showPublish) wirePublishOptions(overlay);

    const unlimitedCb = overlay.querySelector('#qz-unlimited-attempts');
    const attemptsInput = overlay.querySelector('#qz-attempts');
    const syncAttempts = () => {
        if (!attemptsInput || !unlimitedCb) return;
        const unlimited = unlimitedCb.checked;
        attemptsInput.disabled = unlimited;
        if (unlimited) attemptsInput.classList.add('qz-m-input-disabled');
        else attemptsInput.classList.remove('qz-m-input-disabled');
    };
    unlimitedCb?.addEventListener('change', syncAttempts);
    syncAttempts();

    if (!lockSubject && !isEdit) {
        overlay.querySelector('#qz-subject')?.addEventListener('change', (e) => {
            const sid = e.target.value;
            const sub = classesData.find(s => String(s.subject_id) === String(sid));
            const inner = overlay.querySelector('#qz-sec-inner');
            if (inner) inner.innerHTML = sectionTargetHtml(sub?.sections || [], null, null);
            wireSectionTarget(overlay);
        });
    }

    overlay.querySelector('#qz-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#qz-m-alert');
        const title = overlay.querySelector('#qz-title')?.value?.trim();
        const subjectVal = isEdit
            ? quiz.subject_id
            : (overlay.querySelector('#qz-subject')?.value || presetSubjectId);

        if (!subjectVal) {
            alertEl.innerHTML = '<div class="qz-m-alert">Please select a subject.</div>';
            return;
        }
        if (!title) {
            alertEl.innerHTML = '<div class="qz-m-alert">Quiz title is required.</div>';
            return;
        }

        const secWrap = overlay.querySelector('#qz-sec-inner');
        const hasSectionUi = secWrap?.querySelector('input[name="qz-sec-mode"]');
        const sec = readSectionPayload(overlay);
        if (hasSectionUi && !sec.all_sections && !sec.section_ids.length) {
            alertEl.innerHTML = '<div class="qz-m-alert">Select at least one section.</div>';
            return;
        }

        const pub = showPublish
            ? readPublishPayload(overlay)
            : { publish_mode: 'draft', availability_start: '', due_date: overlay.querySelector('#qz-due')?.value || '' };
        if (showPublish && pub.publish_mode === 'scheduled' && !pub.availability_start) {
            alertEl.innerHTML = '<div class="qz-m-alert">Please choose a date and time for the scheduled release.</div>';
            return;
        }

        const payload = {
            subject_id: parseInt(subjectVal, 10),
            quiz_title: title,
            quiz_description: overlay.querySelector('#qz-desc')?.value?.trim() || '',
            grading_period: overlay.querySelector('#qz-period')?.value || 'P1',
            time_limit: parseInt(overlay.querySelector('#qz-time')?.value, 10) || 30,
            passing_rate: parseInt(overlay.querySelector('#qz-pass')?.value, 10) || 60,
            unlimited_attempts: !!overlay.querySelector('#qz-unlimited-attempts')?.checked,
            max_attempts: overlay.querySelector('#qz-unlimited-attempts')?.checked
                ? 0
                : (parseInt(overlay.querySelector('#qz-attempts')?.value, 10) || 3),
            ...pub,
            is_randomized: overlay.querySelector('#qz-randomize')?.checked ? 1 : 0,
            one_at_a_time: overlay.querySelector('#qz-one-at-a-time')?.checked ? 1 : 0,
            ...readGradingPayload(overlay, 'qz'),
            all_sections: sec.all_sections,
            section_ids: sec.section_ids,
        };

        const saveBtn = overlay.querySelector('#qz-save');
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
            alertEl.innerHTML = `<div class="qz-m-alert">${esc(res.message || 'Failed to save quiz')}</div>`;
            saveBtn.disabled = false;
            saveBtn.textContent = isEdit ? 'Update Quiz' : 'Create Quiz';
        }
    });
}
