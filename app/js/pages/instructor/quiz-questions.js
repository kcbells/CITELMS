/**
 * Instructor Quiz Questions Page
 * Add/Edit/Delete questions for a specific quiz
 */
import { Api } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container, params = {}) {
    const quizId = params.quiz_id;
    if (!quizId) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">No quiz selected. <a href="#instructor/quizzes">Go to Quizzes</a></div>';
        return;
    }

    container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">Loading questions...</div>';
    await loadPage(container, quizId);
}

async function loadPage(container, quizId) {
    const res = await Api.get('/QuizzesAPI.php?action=list-questions&quiz_id=' + quizId);
    if (!res.success) {
        container.innerHTML = `<div style="text-align:center;padding:60px;color:#b91c1c">${res.message || 'Failed to load quiz'}</div>`;
        return;
    }

    const { quiz, questions } = res.data;

    container.innerHTML = `
        <style>
            .qq-back { display:inline-flex; align-items:center; gap:6px; color:#1B4D3E; font-size:14px; font-weight:500; text-decoration:none; margin-bottom:16px; cursor:pointer; }
            .qq-back:hover { text-decoration:underline; }

            .qq-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .qq-title { font-size:22px; font-weight:700; color:#262626; }
            .qq-meta { font-size:13px; color:#737373; margin-top:4px; }
            .qq-meta .code { background:#E8F5E9; color:#1B4D3E; padding:2px 8px; border-radius:4px; font-family:monospace; font-weight:600; font-size:12px; }
            .qq-count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-published { background:#E8F5E9; color:#1B4D3E; }
            .badge-draft { background:#FEF3C7; color:#B45309; }

            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .btn-bank { background:#fff; color:#1B4D3E; border:1px solid #1B4D3E; padding:9px 18px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; }
            .btn-bank:hover { background:#E8F5E9; }
            .btn-ai { background:#fff; color:#6D28D9; border:1px solid #6D28D9; padding:9px 18px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:6px; }
            .btn-ai:hover { background:#EDE9FE; }

            .bank-modal { max-width:780px; }
            .bank-filters { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
            .bank-filters input, .bank-filters select { padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; }
            .bank-filters input { flex:1; min-width:160px; }
            .bank-list { display:flex; flex-direction:column; gap:8px; max-height:440px; overflow-y:auto; }

            /* ── Subject folder groups ── */
            .bank-group { border:1px solid #e0e0e0; border-radius:12px; overflow:hidden; }
            .bank-group-header { display:flex; align-items:center; gap:10px; padding:11px 14px; background:#f8fdf9; cursor:pointer; border-bottom:1px solid #e8e8e8; user-select:none; }
            .bank-group-header:hover { background:#edf7f0; }
            .bank-group-header.is-closed { border-bottom:none; }
            .folder-icon { font-size:15px; flex-shrink:0; }
            .group-info { flex:1; display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden; }
            .group-code { background:#1B4D3E; color:#fff; padding:2px 8px; border-radius:5px; font-family:monospace; font-size:11px; font-weight:700; flex-shrink:0; }
            .group-name { font-size:13px; font-weight:600; color:#262626; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .group-count { font-size:11px; color:#737373; white-space:nowrap; flex-shrink:0; }
            .btn-copy-group { white-space:nowrap; padding:4px 11px; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; background:#E8F5E9; color:#1B4D3E; border:1px solid #a7d7b0; flex-shrink:0; }
            .btn-copy-group:hover { background:#d1f0d9; }
            .btn-copy-group:disabled { background:#f3f4f6; color:#9ca3af; border-color:#e5e7eb; cursor:not-allowed; }
            .group-chevron { font-size:11px; color:#9ca3af; flex-shrink:0; transition:transform .2s; }
            .bank-group-header.is-closed .group-chevron { transform:rotate(-90deg); }

            /* ── Question cards inside a folder ── */
            .bank-group-body { display:flex; flex-direction:column; }
            .bank-group-body.collapsed { display:none; }
            .bq-card { background:#fff; border:none; border-bottom:1px solid #f0f0f0; padding:12px 16px; display:flex; align-items:flex-start; gap:12px; }
            .bq-card:last-child { border-bottom:none; }
            .bq-card:hover { background:#f8fdf9; }
            .bq-body { flex:1; min-width:0; }
            .bq-text { font-size:13px; font-weight:600; color:#262626; margin-bottom:5px; line-height:1.4; }
            .bq-meta { font-size:11px; color:#737373; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
            .bq-tag { background:#f3f4f6; color:#404040; padding:2px 7px; border-radius:5px; font-size:11px; font-weight:600; }
            .bq-tag.mc { background:#EDE9FE; color:#5B21B6; }
            .bq-tag.tf { background:#FEF3C7; color:#B45309; }
            .bq-tag.sa { background:#DBEAFE; color:#1D4ED8; }
            .bq-tag.es { background:#FCE7F3; color:#9D174D; }
            .bq-opts { margin-top:7px; display:flex; flex-direction:column; gap:2px; }
            .bq-opt { font-size:12px; color:#404040; display:flex; align-items:center; gap:6px; }
            .bq-opt.correct { color:#1B4D3E; font-weight:600; }
            .btn-copy-q { white-space:nowrap; padding:6px 13px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; background:#1B4D3E; color:#fff; border:none; flex-shrink:0; }
            .btn-copy-q:hover { background:#006428; }
            .btn-copy-q:disabled { background:#ccc; cursor:not-allowed; }
            .bank-empty { text-align:center; padding:40px; color:#737373; font-size:14px; }
            .bank-loading { text-align:center; padding:40px; color:#737373; }

            .qq-list { display:flex; flex-direction:column; gap:12px; }
            .q-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; overflow:hidden; }
            .q-card:hover { border-color:#ccc; }
            .q-card-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; }
            .q-number { width:32px; height:32px; border-radius:50%; background:#E8F5E9; color:#1B4D3E; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
            .q-text { flex:1; margin:0 14px; font-size:14px; font-weight:600; color:#262626; line-height:1.4; }
            .q-info { display:flex; align-items:center; gap:8px; flex-shrink:0; }
            .q-type-badge { padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; background:#f3f4f6; color:#404040; text-transform:capitalize; white-space:nowrap; }
            .q-points { font-size:12px; color:#737373; font-weight:600; }

            .q-options { padding:0 20px 16px; padding-left:66px; }
            .q-opt { display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px; color:#404040; }
            .q-opt-marker { width:18px; height:18px; border-radius:50%; border:2px solid #e0e0e0; display:flex; align-items:center; justify-content:center; font-size:10px; flex-shrink:0; }
            .q-opt-marker.correct { background:#E8F5E9; border-color:#1B4D3E; color:#1B4D3E; }

            .q-actions { display:flex; gap:8px; }
            .btn-icon { width:32px; height:32px; border-radius:8px; border:1px solid #e0e0e0; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; }
            .btn-icon:hover { background:#f5f5f5; }
            .btn-icon.danger { color:#b91c1c; border-color:#fecaca; }
            .btn-icon.danger:hover { background:#FEE2E2; }

            .empty-questions { text-align:center; padding:60px 20px; background:#fff; border:2px dashed #e0e0e0; border-radius:14px; }
            .empty-questions h3 { font-size:18px; color:#262626; margin-bottom:8px; }
            .empty-questions p { font-size:14px; color:#737373; margin-bottom:20px; }

            .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
            .modal { background:#fff; border-radius:16px; width:92%; max-width:640px; max-height:90vh; overflow-y:auto; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }

            .form-group { margin-bottom:16px; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input, .form-select, .form-textarea { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; font-family:inherit; }
            .form-input:focus, .form-select:focus, .form-textarea:focus { outline:none; border-color:#00461B; }
            .form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

            .options-section { margin-top:8px; }
            .options-section h4 { font-size:13px; font-weight:600; color:#404040; margin-bottom:10px; }
            .opt-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
            .opt-row input[type="text"] { flex:1; padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; }
            .opt-row input[type="text"]:focus { outline:none; border-color:#00461B; }
            .opt-correct { display:flex; align-items:center; gap:4px; font-size:12px; color:#737373; white-space:nowrap; cursor:pointer; }
            .opt-correct input { cursor:pointer; }
            .btn-remove-opt { width:28px; height:28px; border-radius:6px; border:1px solid #fecaca; background:#fff; color:#b91c1c; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; }
            .btn-remove-opt:hover { background:#FEE2E2; }
            .btn-add-opt { background:none; border:1px dashed #ccc; padding:6px 14px; border-radius:8px; font-size:12px; color:#737373; cursor:pointer; }
            .btn-add-opt:hover { border-color:#1B4D3E; color:#1B4D3E; }

            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-error { background:#FEE2E2; color:#b91c1c; }

            @media(max-width:768px) { .q-card-header { flex-wrap:wrap; } .q-text { margin:8px 0; } .form-row { grid-template-columns:1fr; } }
        </style>

        <a class="qq-back" id="btn-back">&larr; Back to Quizzes</a>

        <div class="qq-header">
            <div>
                <div class="qq-title">${esc(quiz.quiz_title)} <span class="qq-count">${questions.length} questions</span></div>
                <div class="qq-meta"><span class="code">${esc(quiz.subject_id)}</span> <span class="badge badge-${quiz.status}">${quiz.status}</span> &middot; ${quiz.time_limit} min &middot; ${quiz.passing_rate}% to pass &middot; ${(quiz.max_attempts || 0) > 0 ? quiz.max_attempts + ' attempt' + (quiz.max_attempts !== 1 ? 's' : '') + '/student' : 'Unlimited attempts'}</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <button class="btn-ai" id="btn-ai-gen">${L.aiGenerate}</button>
                <button class="btn-bank" id="btn-copy-bank">${icon('clipboard', inl)} Copy from Bank</button>
                <button class="btn-primary" id="btn-add-q">+ Add Question</button>
            </div>
        </div>

        <div class="qq-list" id="qq-list">
            ${questions.length === 0 ? `
                <div class="empty-questions">
                    <h3>No Questions Yet</h3>
                    <p>Add questions to this quiz so students can take it.</p>
                    <button class="btn-primary" id="btn-add-q-empty">+ Add First Question</button>
                </div>
            ` : questions.map((q, i) => renderQuestionCard(q, i)).join('')}
        </div>
    `;

    // Events
    container.querySelector('#btn-back').addEventListener('click', () => {
        window.location.hash = '#instructor/quizzes';
    });

    container.querySelector('#btn-add-q').addEventListener('click', () => openQuestionModal(container, quizId));
    container.querySelector('#btn-copy-bank').addEventListener('click', () => openBankModal(container, quizId));

    // AI Generate — navigate to generator pre-linked to this quiz
    container.querySelector('#btn-ai-gen').addEventListener('click', () => {
        const title   = encodeURIComponent(quiz.quiz_title || '');
        const subject = encodeURIComponent(quiz.subject_id || '');
        window.location.hash = `#instructor/quiz-ai-generate?quiz_id=${quizId}&quiz_title=${title}&subject_id=${subject}`;
    });

    const emptyBtn = container.querySelector('#btn-add-q-empty');
    if (emptyBtn) emptyBtn.addEventListener('click', () => openQuestionModal(container, quizId));

    container.querySelectorAll('[data-edit-q]').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = questions.find(q => q.questions_id == btn.dataset.editQ);
            if (q) openQuestionModal(container, quizId, q);
        });
    });

    container.querySelectorAll('[data-delete-q]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this question? This cannot be undone.')) return;
            const res = await Api.post('/QuizzesAPI.php?action=delete-question', { questions_id: parseInt(btn.dataset.deleteQ) });
            if (res.success) loadPage(container, quizId);
            else alert(res.message);
        });
    });
}

function renderQuestionCard(q, index) {
    const typeLabels = { multiple_choice: 'Multiple Choice', true_false: 'True / False', short_answer: 'Short Answer', essay: 'Essay' };
    return `
        <div class="q-card">
            <div class="q-card-header">
                <div class="q-number">${index + 1}</div>
                <div class="q-text">${esc(q.question_text)}</div>
                <div class="q-info">
                    <span class="q-type-badge">${typeLabels[q.question_type] || q.question_type}</span>
                    <span class="q-points">${q.points} pt${q.points > 1 ? 's' : ''}</span>
                    <div class="q-actions">
                        <button class="btn-icon" data-edit-q="${q.questions_id}" title="Edit">&#9998;</button>
                        <button class="btn-icon danger" data-delete-q="${q.questions_id}" title="Delete">&times;</button>
                    </div>
                </div>
            </div>
            ${q.options && q.options.length > 0 ? `
                <div class="q-options">
                    ${q.options.map(o => `
                        <div class="q-opt">
                            <div class="q-opt-marker ${o.is_correct ? 'correct' : ''}">${o.is_correct ? '&#10003;' : ''}</div>
                            <span>${esc(o.option_text)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function openQuestionModal(container, quizId, question = null) {
    const isEdit = !!question;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const defaultOptions = question?.options || [
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false },
        { option_text: '', is_correct: false }
    ];

    const currentType = question?.question_type || 'multiple_choice';

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Add'} Question</h3><button class="modal-close">&times;</button></div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-group">
                    <label class="form-label">Question Text *</label>
                    <textarea class="form-textarea" id="m-qtext" rows="3" placeholder="Enter your question...">${esc(question?.question_text || '')}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Question Type</label>
                        <select class="form-select" id="m-qtype">
                            <option value="multiple_choice" ${currentType === 'multiple_choice' ? 'selected' : ''}>Multiple Choice</option>
                            <option value="true_false"      ${currentType === 'true_false'      ? 'selected' : ''}>True / False</option>
                            <option value="fill_blank"      ${currentType === 'fill_blank'      ? 'selected' : ''}>Fill in the Blank</option>
                            <option value="short_answer"    ${currentType === 'short_answer'    ? 'selected' : ''}>Short Answer</option>
                            <option value="essay"           ${currentType === 'essay'           ? 'selected' : ''}>Essay</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Points</label>
                        <input type="number" class="form-input" id="m-qpoints" value="${question?.points || 1}" min="1">
                    </div>
                </div>
                <div class="options-section" id="options-section">
                    <h4>Answer Options</h4>
                    <div id="options-list"></div>
                    <button class="btn-add-opt" id="btn-add-opt">+ Add Option</button>
                </div>
                <div id="model-answer-section" style="display:none;">
                    <div class="form-group" style="margin-top:12px;">
                        <label class="form-label" id="model-answer-label">Model Answer <span style="color:#737373;font-weight:400;font-size:11px;">(answer key — used when quiz checking is set to answer key or AI grading)</span></label>
                        <textarea class="form-textarea" id="m-model-answer" rows="4"
                            placeholder="Enter the expected answer or key points the student should cover..."
                            style="border-color:#1B4D3E;">${esc(question?.options?.find(o => o.is_correct)?.option_text || '')}</textarea>
                        <p style="font-size:11px;color:#737373;margin-top:4px;">The AI will score students based on how close their answer is to this.</p>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update' : 'Add'} Question</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const optionsList = overlay.querySelector('#options-list');
    const typeSelect = overlay.querySelector('#m-qtype');

    function renderOptions(opts) {
        const inputType = typeSelect.value === 'true_false' ? 'radio' : 'checkbox';
        optionsList.innerHTML = opts.map((o, i) => `
            <div class="opt-row">
                <input type="text" value="${esc(o.option_text || '')}" placeholder="Option ${i + 1}" data-opt-idx="${i}">
                <label class="opt-correct">
                    <input type="${inputType}" name="correct-opt" data-correct-idx="${i}" ${o.is_correct ? 'checked' : ''}>
                    Correct
                </label>
                ${opts.length > 2 ? `<button class="btn-remove-opt" data-remove-idx="${i}">&times;</button>` : ''}
            </div>
        `).join('');

        optionsList.querySelectorAll('.btn-remove-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                opts.splice(parseInt(btn.dataset.removeIdx), 1);
                renderOptions(opts);
            });
        });

        // For multiple choice with checkbox, handle toggling individually
        // For true_false with radio, ensure only one is correct
        if (inputType === 'radio') {
            optionsList.querySelectorAll('input[type="radio"]').forEach(r => {
                r.addEventListener('change', () => {
                    opts.forEach(o => o.is_correct = false);
                    const idx = parseInt(r.dataset.correctIdx);
                    opts[idx].is_correct = true;
                });
            });
        }
    }

    let options = defaultOptions.map(o => ({ ...o }));

    const optionsSection     = overlay.querySelector('#options-section');
    const modelAnswerSection = overlay.querySelector('#model-answer-section');
    const modelAnswerLabel   = overlay.querySelector('#model-answer-label');

    function isSubjective(type) {
        return ['short_answer', 'essay', 'fill_blank'].includes(type);
    }

    function applyTypeUI(type) {
        if (isSubjective(type)) {
            optionsSection.style.display     = 'none';
            modelAnswerSection.style.display = '';
            if (type === 'fill_blank') {
                modelAnswerLabel.childNodes[0].textContent = 'Correct Answer ';
                overlay.querySelector('#m-model-answer').placeholder = 'Enter the exact word or phrase that fills the blank…';
                overlay.querySelector('#m-model-answer').rows = 2;
            } else if (type === 'short_answer') {
                modelAnswerLabel.childNodes[0].textContent = 'Model Answer ';
                overlay.querySelector('#m-model-answer').placeholder = 'Enter a 1-3 sentence model answer with the key points expected…';
                overlay.querySelector('#m-model-answer').rows = 4;
            } else {
                modelAnswerLabel.childNodes[0].textContent = 'Model Answer ';
                overlay.querySelector('#m-model-answer').placeholder = 'Enter the key points and ideas a good essay response should cover…';
                overlay.querySelector('#m-model-answer').rows = 6;
            }
        } else {
            optionsSection.style.display     = '';
            modelAnswerSection.style.display = 'none';
            if (type === 'true_false') {
                options = [
                    { option_text: 'True',  is_correct: true  },
                    { option_text: 'False', is_correct: false }
                ];
                overlay.querySelector('#btn-add-opt').style.display = 'none';
            } else {
                if (options.length < 2) {
                    options = [
                        { option_text: '', is_correct: false },
                        { option_text: '', is_correct: false },
                        { option_text: '', is_correct: false },
                        { option_text: '', is_correct: false }
                    ];
                }
                overlay.querySelector('#btn-add-opt').style.display = '';
            }
            renderOptions(options);
        }
    }

    // Handle type change
    typeSelect.addEventListener('change', () => applyTypeUI(typeSelect.value));

    // Initial render
    applyTypeUI(currentType);

    overlay.querySelector('#btn-add-opt').addEventListener('click', () => {
        options.push({ option_text: '', is_correct: false });
        renderOptions(options);
    });

    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#modal-alert');

        // Gather option values from inputs
        const optInputs = optionsList.querySelectorAll('input[type="text"]');
        const correctInputs = optionsList.querySelectorAll('input[name="correct-opt"]');
        const finalOptions = [];
        optInputs.forEach((inp, i) => {
            finalOptions.push({
                option_text: inp.value.trim(),
                is_correct: correctInputs[i]?.checked ? true : false
            });
        });

        // For subjective types, model answer becomes the single correct option
        const qType = typeSelect.value;
        let finalPayloadOptions = finalOptions.filter(o => o.option_text !== '');
        if (isSubjective(qType)) {
            const modelAns = overlay.querySelector('#m-model-answer').value.trim();
            finalPayloadOptions = modelAns ? [{ option_text: modelAns, is_correct: true }] : [];
        }

        const payload = {
            quiz_id: quizId,
            question_text: overlay.querySelector('#m-qtext').value.trim(),
            question_type: qType,
            points: parseInt(overlay.querySelector('#m-qpoints').value) || 1,
            options: finalPayloadOptions
        };

        if (isEdit) payload.questions_id = question.questions_id;

        if (!payload.question_text) {
            alertEl.innerHTML = '<div class="alert alert-error">Question text is required</div>';
            return;
        }

        const action = isEdit ? 'update-question' : 'add-question';
        const saveBtn = overlay.querySelector('#modal-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const res = await Api.post(`/QuizzesAPI.php?action=${action}`, payload);
        if (res.success) {
            overlay.remove();
            loadPage(container, quizId);
        } else {
            alertEl.innerHTML = `<div class="alert alert-error">${res.message}</div>`;
            saveBtn.disabled = false;
            saveBtn.textContent = isEdit ? 'Update Question' : 'Add Question';
        }
    });
}

async function openBankModal(container, quizId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal bank-modal">
            <div class="modal-header">
                <h3>${icon('clipboard', inl)} Copy from Question Bank</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="bank-filters">
                    <input type="text" id="bank-search" placeholder="Search questions..." style="flex:1;min-width:140px;">
                    <select id="bank-subject" style="min-width:140px;">
                        <option value="">All Subjects</option>
                    </select>
                    <select id="bank-type">
                        <option value="">All Types</option>
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                        <option value="short_answer">Short Answer</option>
                        <option value="essay">Essay</option>
                    </select>
                </div>
                <div class="bank-list" id="bank-list"><div class="bank-loading">Loading...</div></div>
            </div>
            <div class="modal-footer" style="justify-content:space-between;align-items:center;">
                <span style="font-size:13px;color:#737373;" id="bank-status">Click <strong>Copy</strong> to add individually or use <strong>Copy All</strong></span>
                <button class="btn-primary" id="btn-copy-all" style="display:none;">Copy All</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    let searchTimer   = null;
    let allQuestions  = [];   // full result from API
    let currentQuestions = []; // after subject filter
    const searchInput   = overlay.querySelector('#bank-search');
    const subjectSelect = overlay.querySelector('#bank-subject');
    const typeSelect    = overlay.querySelector('#bank-type');
    const copyAllBtn    = overlay.querySelector('#btn-copy-all');
    const statusEl      = overlay.querySelector('#bank-status');

    const typeTagClass = { multiple_choice: 'mc', true_false: 'tf', short_answer: 'sa', essay: 'es' };
    const typeLabel    = { multiple_choice: 'Multiple Choice', true_false: 'True/False', short_answer: 'Short Answer', essay: 'Essay' };

    // ── Render questions grouped by subject folder ──────────────────
    function renderBank() {
        const listEl     = overlay.querySelector('#bank-list');
        const subjFilter = subjectSelect.value;

        currentQuestions = subjFilter
            ? allQuestions.filter(q => q.subject_code === subjFilter)
            : allQuestions;

        if (currentQuestions.length === 0) {
            listEl.innerHTML = '<div class="bank-empty">No questions match the selected filters.</div>';
            statusEl.innerHTML = 'No questions found.';
            copyAllBtn.style.display = 'none';
            return;
        }

        copyAllBtn.style.display = '';
        copyAllBtn.textContent = `Copy All (${currentQuestions.length})`;
        copyAllBtn.disabled = false;
        statusEl.innerHTML = `${currentQuestions.length} question${currentQuestions.length > 1 ? 's' : ''} found`;

        // Group questions by subject
        const groups = new Map();
        for (const q of currentQuestions) {
            const key = q.subject_code || '__none__';
            if (!groups.has(key)) {
                groups.set(key, { code: q.subject_code || '', name: q.subject_name || 'No Subject', questions: [] });
            }
            groups.get(key).questions.push(q);
        }

        let html = '';
        for (const [, group] of groups) {
            const gid = 'grp-' + (group.code || 'none').replace(/[^a-z0-9]/gi, '-');
            html += `
                <div class="bank-group">
                    <div class="bank-group-header" data-gid="${gid}">
                        <span class="folder-icon">${icon('folder', inl)}</span>
                        <div class="group-info">
                            ${group.code ? `<span class="group-code">${esc(group.code)}</span>` : ''}
                            <span class="group-name">${esc(group.name)}</span>
                        </div>
                        <span class="group-count">${group.questions.length} question${group.questions.length !== 1 ? 's' : ''}</span>
                        <button class="btn-copy-group" data-gid="${gid}">Copy All (${group.questions.length})</button>
                        <span class="group-chevron">▾</span>
                    </div>
                    <div class="bank-group-body" id="${gid}">
                        ${group.questions.map(q => `
                            <div class="bq-card" data-qbank="${q.qbank_id}">
                                <div class="bq-body">
                                    <div class="bq-text">${esc(q.question_text)}</div>
                                    <div class="bq-meta">
                                        <span class="bq-tag ${typeTagClass[q.question_type] || ''}">${typeLabel[q.question_type] || q.question_type}</span>
                                        <span>${q.points} pt${q.points > 1 ? 's' : ''}</span>
                                        <span>${icon('user', inl)} ${esc(q.first_name)} ${esc(q.last_name)}</span>
                                        ${q.copy_count > 0 ? `<span>Used ${q.copy_count}×</span>` : ''}
                                    </div>
                                    ${q.options && q.options.length > 0 ? `
                                        <div class="bq-opts">
                                            ${q.options.map(o => `<div class="bq-opt ${o.is_correct ? 'correct' : ''}">${o.is_correct ? icon('check', { size: 12 }) : '○'} ${esc(o.option_text)}</div>`).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                                <button class="btn-copy-q" data-qbank="${q.qbank_id}">Copy</button>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }
        listEl.innerHTML = html;

        // Toggle folder open/close
        listEl.querySelectorAll('.bank-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-copy-group')) return;
                const body = document.getElementById(header.dataset.gid);
                const isOpen = !body.classList.contains('collapsed');
                body.classList.toggle('collapsed', isOpen);
                header.classList.toggle('is-closed', isOpen);
            });
        });

        // Copy single question
        listEl.querySelectorAll('.btn-copy-q').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '...';
                const res = await Api.post('/QuestionBankAPI.php?action=copy', {
                    qbank_id: parseInt(btn.dataset.qbank),
                    quiz_id:  parseInt(quizId)
                });
                if (res.success) {
                    btn.innerHTML = `${icon('check', inl)} Copied`;
                    btn.style.background = '#1a6635';
                    loadPage(container, quizId);
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Copy';
                    alert(res.message || 'Failed to copy');
                }
            });
        });

        // Copy all questions in a folder
        listEl.querySelectorAll('.btn-copy-group').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const body    = document.getElementById(btn.dataset.gid);
                const cards   = body.querySelectorAll('.bq-card');
                btn.disabled  = true;
                btn.textContent = 'Copying...';
                let done = 0;
                for (const card of cards) {
                    const qbankId = parseInt(card.dataset.qbank);
                    const qBtn = card.querySelector('.btn-copy-q');
                    if (qBtn) { qBtn.disabled = true; qBtn.textContent = '...'; }
                    const res = await Api.post('/QuestionBankAPI.php?action=copy', {
                        qbank_id: qbankId,
                        quiz_id:  parseInt(quizId)
                    });
                    if (res.success) {
                        done++;
                        if (qBtn) { qBtn.innerHTML = icon('check', { size: 12 }); qBtn.style.background = '#1a6635'; }
                    } else {
                        if (qBtn) { qBtn.disabled = false; qBtn.textContent = 'Copy'; }
                    }
                }
                btn.innerHTML = `${icon('check', inl)} Done (${done})`;
                if (done > 0) loadPage(container, quizId);
            });
        });
    }

    // ── Fetch from API (search + type), then populate subject dropdown ──
    async function loadBank() {
        const listEl = overlay.querySelector('#bank-list');
        listEl.innerHTML = '<div class="bank-loading">Loading...</div>';
        copyAllBtn.style.display = 'none';
        allQuestions = [];
        currentQuestions = [];

        const search = searchInput.value.trim();
        const type   = typeSelect.value;
        let url = '/QuestionBankAPI.php?action=browse';
        if (search) url += '&search=' + encodeURIComponent(search);
        if (type)   url += '&type='   + encodeURIComponent(type);

        const res = await Api.get(url);
        allQuestions = res.success ? res.data : [];

        // Rebuild subject dropdown from fetched results
        const prevSubj = subjectSelect.value;
        const subjects = [...new Set(allQuestions.map(q => q.subject_code).filter(Boolean))].sort();
        subjectSelect.innerHTML = `<option value="">All Subjects</option>` +
            subjects.map(s => `<option value="${esc(s)}" ${prevSubj === s ? 'selected' : ''}>${esc(s)}</option>`).join('');

        if (allQuestions.length === 0) {
            listEl.innerHTML = '<div class="bank-empty">No questions found in the bank.</div>';
            statusEl.innerHTML = 'No questions found.';
            return;
        }

        renderBank();
    }

    // ── Copy All — copies only currently visible (filtered) questions ──
    copyAllBtn.addEventListener('click', async () => {
        if (!currentQuestions.length) return;
        copyAllBtn.disabled = true;
        copyAllBtn.textContent = 'Copying...';
        searchInput.disabled   = true;
        typeSelect.disabled    = true;
        subjectSelect.disabled = true;

        const copyBtns = overlay.querySelectorAll('.btn-copy-q');
        let done = 0, failed = 0;

        for (let i = 0; i < currentQuestions.length; i++) {
            const q   = currentQuestions[i];
            const btn = copyBtns[i];
            if (btn) { btn.disabled = true; btn.textContent = '...'; }

            const res = await Api.post('/QuestionBankAPI.php?action=copy', {
                qbank_id: q.qbank_id,
                quiz_id:  parseInt(quizId)
            });

            if (res.success) {
                done++;
                if (btn) { btn.innerHTML = icon('check', { size: 12 }); btn.style.background = '#1a6635'; }
            } else {
                failed++;
                if (btn) { btn.innerHTML = icon('close', { size: 12 }); btn.style.background = '#b91c1c'; btn.disabled = false; }
            }
            statusEl.textContent = `Copying… ${done + failed}/${currentQuestions.length}`;
        }

        statusEl.innerHTML = `<strong style="color:#1B4D3E;">${icon('check', inl)} ${done} copied${failed ? `, ${failed} failed` : ''}</strong>`;
        copyAllBtn.textContent = 'Done';
        searchInput.disabled   = false;
        typeSelect.disabled    = false;
        subjectSelect.disabled = false;
        loadPage(container, quizId);
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadBank, 350);
    });
    typeSelect.addEventListener('change', loadBank);
    // Subject filter is client-side only — no new API call needed
    subjectSelect.addEventListener('change', renderBank);

    loadBank();
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
