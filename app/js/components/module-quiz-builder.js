/**
 * Module Quiz Builder — turns a module's Student Activity Sheet (+ Teaching
 * Guide answer key) into an in-app quiz for Let's Practice / Reflection /
 * Wrap Up Quiz. AI extracts the real SAS items + TG answers for review; the
 * instructor/dean/program head can edit, remove, or add items by hand before
 * publishing. Saving reuses AIQuizAPI.php's existing `save` action (extended
 * with module_number/gradebook_component/source_doc_id so a finalized
 * student attempt auto-syncs into the Global Gradebook — see
 * QuizAttemptsAPI.php's syncModuleGradeFromQuiz()).
 */
import { Api } from '../api.js';
import { notify } from '../utils/notify.js';
import { openQuestionModal } from '../pages/instructor/quiz-questions.js';

import { esc } from '../utils/classroom-ui.js';
const G = '#00461B';
const BORDER = '#E5E7EB';

const COMPONENT_LABELS = {
    lets_practice: "Let's Practice",
    lets_practice_optional: "Let's Practice (Optional)",
    reflection: 'Reflection',
    wrap_up_quiz: 'Wrap Up Quiz',
};

// esc() imported from classroom-ui.js (see import above)

let seq = 0;
function uid() { return `mqb-${++seq}`; }

/**
 * @param {number|string} subjectId
 * @param {number} moduleNumber
 * @param {'lets_practice'|'lets_practice_optional'|'reflection'|'wrap_up_quiz'} component
 * @param {{ subjectCode?: string, onSaved?: Function }} [opts]
 */
/**
 * @param {{ subjectCode?: string, onSaved?: Function, quizId?: number }} [opts]
 *        Pass opts.quizId to EDIT an already-built quiz — its existing
 *        questions load straight in (no AI-vs-manual setup step, there's
 *        nothing to choose) and saving replaces its question set instead of
 *        creating a second copy or just appending onto the first one.
 */
export function openModuleQuizBuilder(subjectId, moduleNumber, component, opts = {}) {
    // Same shape as the regular quiz flow: a small picker modal asks HOW to
    // build, then the full-page builder opens. Editing skips the picker —
    // there's nothing to choose when the questions already exist.
    const go = (mode) => {
        const p = new URLSearchParams({
            subject_id: String(subjectId),
            module: String(moduleNumber),
            component,
        });
        if (opts.quizId) p.set('quiz_id', String(opts.quizId));
        if (mode) p.set('mode', mode);
        if (opts.returnHash || window.location.hash) {
            p.set('back', (opts.returnHash || window.location.hash).replace(/^#/, ''));
        }
        window.location.hash = `#instructor/module-quiz?${p.toString()}`;
    };

    if (opts.quizId) { go(null); return; }
    openBuildModePicker(COMPONENT_LABELS[component] || component, moduleNumber, go);
}

/** The "how should this be built" chooser — a modal, like the regular quiz picker. */
function openBuildModePicker(label, moduleNumber, onPick) {
    const overlay = document.createElement('div');
    overlay.className = 'mqb-pick-overlay';
    overlay.innerHTML = `<style>${css()}</style>
        <div class="mqb-pick" role="dialog" aria-modal="true" aria-label="Build quiz">
            <div class="mqb-pick-hdr">
                <h3>Build ${esc(label)}</h3>
                <p>Module ${moduleNumber} — choose how you want to build this quiz</p>
            </div>
            <div class="mqb-pick-body">
                <button type="button" class="mqb-setup-opt" data-mode="ai">
                    <span class="mqb-setup-icon">🤖</span>
                    <span class="mqb-setup-text">
                        <span class="mqb-setup-title">Let AI generate it</span>
                        <span class="mqb-setup-desc">Pulls the real items from the Student Activity Sheet and pairs
                            them with answers from the Teaching Guide. You review and edit everything before saving.</span>
                    </span>
                </button>
                <button type="button" class="mqb-setup-opt" data-mode="manual">
                    <span class="mqb-setup-icon">✎</span>
                    <span class="mqb-setup-text">
                        <span class="mqb-setup-title">I'll build it myself</span>
                        <span class="mqb-setup-desc">Start from a blank quiz and add every question by hand.</span>
                    </span>
                </button>
                <button type="button" class="mqb-setup-cancel" id="mqb-pick-cancel">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#mqb-pick-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('.mqb-setup-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            close();
            onPick(btn.dataset.mode);
        });
    });
}

/**
 * Page entry point — rendered by pages/instructor/module-quiz.js.
 * @param {HTMLElement} container
 * @param {{subject_id?:string, module?:string, component?:string, quiz_id?:string, back?:string}} params
 */
export async function renderModuleQuizPage(container, params = {}) {
    const subjectId    = params.subject_id;
    const moduleNumber = parseInt(params.module, 10) || 0;
    const component    = params.component || '';
    const quizId       = params.quiz_id ? parseInt(params.quiz_id, 10) : null;
    const backHash     = params.back ? `#${params.back}` : '';

    const label  = COMPONENT_LABELS[component] || component;
    const isEdit = !!quizId;

    if (!subjectId || !moduleNumber || !component) {
        container.innerHTML = `<style>${css()}</style>
            <div class="mqb-page"><div class="mqb-warn">This quiz builder was opened without a subject or module.</div></div>`;
        return;
    }

    container.innerHTML = `<style>${css()}</style>
        <div class="mqb-page">
            <div class="mqb-hdr">
                <div>
                    <h3>Module ${moduleNumber} · ${esc(label)}</h3>
                    <p class="mqb-sub">${isEdit ? 'Editing the existing quiz — changes replace its current questions' : 'Saved as a draft first — you publish it to students separately'}</p>
                </div>
                <button class="mqb-close" id="mqb-close" aria-label="Back">&#x2715;</button>
            </div>
            <div class="mqb-body" id="mqb-body"></div>
        </div>`;

    // "Close" leaves the page rather than removing a node.
    const close = () => {
        if (backHash) window.location.hash = backHash;
        else window.history.back();
    };
    container.querySelector('#mqb-close').addEventListener('click', close);

    const body = container.querySelector('#mqb-body');
    const ctx = {
        subjectId, moduleNumber, component, label, body, quizId,
        opts: {},
        close,
        isAlive: () => container.isConnected,
    };

    if (isEdit) {
        await startFromExisting(ctx);
    } else if (params.mode === 'manual') {
        renderBody({ res: { success: true }, items: [], sourceDocId: null, ...ctx });
    } else if (params.mode === 'ai') {
        await startFromAi(ctx);
    } else {
        // No mode in the URL (e.g. someone hit the link directly) — fall back
        // to asking here rather than guessing.
        renderSetupStep(ctx);
    }
}

/** Loads an already-built quiz's real questions straight into the editable
 *  list — skips the AI-vs-manual setup step entirely, since editing isn't a
 *  "how should this be created" choice. */
async function startFromExisting(ctx) {
    ctx.body.innerHTML = `<div class="mqb-loading"><div class="mqb-spin"></div><span>Loading the existing quiz…</span></div>`;

    const res = await Api.get(`/QuizzesAPI.php?action=list-questions&quiz_id=${ctx.quizId}`, { ttl: 0 });
    if (!ctx.isAlive()) return; // closed while loading

    if (!res.success) {
        ctx.body.innerHTML = `<div class="mqb-warn">${esc(res.message || 'Could not load this quiz.')}</div>
            <div class="mqb-actions"><button type="button" class="mqb-cancel-btn" id="mqb-load-fail-close">Close</button></div>`;
        ctx.body.querySelector('#mqb-load-fail-close')?.addEventListener('click', ctx.close);
        return;
    }

    const items = (res.data?.questions || []).map(dbQuestionToItem);
    renderBody({
        res: { success: true }, items, sourceDocId: null,
        existingTitle: res.data?.quiz?.quiz_title || '',
        existingDueDate: toDateInput(res.data?.quiz?.due_date),
        ...ctx,
    });
}

/** MySQL "YYYY-MM-DD HH:MM:SS" -> the "YYYY-MM-DDTHH:MM" a datetime-local input wants. */
function toDateInput(value) {
    if (!value) return '';
    const s = String(value);
    const dt = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (dt) return `${dt[1]}T${dt[2]}`;
    const d = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return d ? `${d[1]}T23:59` : ''; // legacy date-only row meant end of day
}

/**
 * Replaces the full editor's Points field for the components the Global
 * Gradebook scores on its 0–3 rubric. Those don't total points at all — the
 * student's percentage across equally-weighted questions is what maps to
 * 3/2/1/0, so a Points box there would be a control that silently does
 * nothing. Wrap Up Quiz keeps real points (it maps to a percentage).
 */
function rubricPointsNote(isRubricScale, label) {
    return isRubricScale
        ? `${label} is scored 0–3 by the Global Gradebook — every question counts equally, so there are no per-question points.`
        : null;
}

/** The inverse of modalPayloadToItem — shapes one builder item the way
 *  openQuestionModal expects an existing question, so Edit opens pre-filled. */
function itemToModalQuestion(item) {
    let options = [];
    if (item.type === 'multiple_choice' || item.type === 'dropdown' || item.type === 'checkboxes') {
        options = (item.options || []).map((text, i) => ({
            option_text: text,
            is_correct: i === (item.correct_index ?? 0),
        }));
    } else if (item.type === 'true_false') {
        options = [
            { option_text: 'True',  is_correct: item.answer === true },
            { option_text: 'False', is_correct: item.answer !== true },
        ];
    } else if (item.answer) {
        options = [{ option_text: item.answer, is_correct: true }];
    }
    return {
        question_text: item.question || '',
        question_type: item.type,
        points: item.points || 1,
        options,
        media_type: item.media_type || 'none',
        media_url: item.media_url || '',
        media_name: item.media_name || '',
    };
}

/** Converts what openQuestionModal hands back (add-question payload shape)
 *  into this builder's editable item shape. Same mapping as dbQuestionToItem
 *  below, just from the payload's field names. */
function modalPayloadToItem(p) {
    const item = {
        id: uid(),
        type: p.question_type,
        question: p.question_text || '',
        points: p.points || 1,
        media_type: p.media_type && p.media_type !== 'none' ? p.media_type : undefined,
        media_url: p.media_url || undefined,
        media_name: p.media_name || undefined,
    };
    const opts = p.options || [];
    if (p.question_type === 'multiple_choice' || p.question_type === 'dropdown' || p.question_type === 'checkboxes') {
        item.options = opts.map(o => o.option_text);
        const idx = opts.findIndex(o => o.is_correct);
        item.correct_index = idx >= 0 ? idx : 0;
    } else if (p.question_type === 'true_false') {
        const correct = opts.find(o => o.is_correct);
        item.answer = correct ? /^true$/i.test(correct.option_text) : true;
    } else {
        item.answer = opts[0]?.option_text || '';
    }
    return item;
}

/** Converts one row from QuizzesAPI.php's list-questions response (DB shape:
 *  question_text/question_type/options[{option_text,is_correct}]) back into
 *  this builder's editable item shape (question/answer or
 *  options+correct_index) — the inverse of what the save handler below sends. */
function dbQuestionToItem(q) {
    const item = {
        id: uid(),
        type: q.question_type,
        question: q.question_text || '',
        points: q.points || 1,
        // Kept so re-saving an edited quiz doesn't drop an existing attachment.
        media_type: q.media_type && q.media_type !== 'none' ? q.media_type : undefined,
        media_url: q.media_url || undefined,
        media_name: q.media_name || undefined,
    };
    const options = q.options || [];
    if (q.question_type === 'multiple_choice' || q.question_type === 'dropdown') {
        item.options = options.map(o => o.option_text);
        const correctIdx = options.findIndex(o => Number(o.is_correct) === 1);
        item.correct_index = correctIdx >= 0 ? correctIdx : 0;
    } else if (q.question_type === 'true_false') {
        const correctOpt = options.find(o => Number(o.is_correct) === 1);
        item.answer = correctOpt ? /^true$/i.test(correctOpt.option_text) : true;
    } else {
        // short_answer / essay / fill_blank — the expected answer is stored
        // as the single question_option row (see saveQuiz()'s own subjective branch).
        item.answer = options[0]?.option_text || '';
    }
    return item;
}

/** First screen: the instructor explicitly chooses AI-generated vs a blank,
 *  hand-built quiz — generation no longer fires automatically on open. */
function renderSetupStep(ctx) {
    const { body, label, moduleNumber } = ctx;
    // Card-per-choice, matching the regular quiz creation picker
    // (components/quiz-create-picker.js) — picking a card IS the action, so
    // there's no separate Continue step to click through.
    body.innerHTML = `
        <div class="mqb-setup">
            <p class="mqb-setup-lede">How should the <strong>${esc(label)}</strong> quiz for Module ${moduleNumber} be created?</p>
            <button type="button" class="mqb-setup-opt" data-mode="ai">
                <span class="mqb-setup-icon">🤖</span>
                <span class="mqb-setup-text">
                    <span class="mqb-setup-title">Let AI generate it</span>
                    <span class="mqb-setup-desc">Pulls the real items from the Student Activity Sheet and pairs them
                        with answers from the Teaching Guide. You review and can edit everything before saving.</span>
                </span>
            </button>
            <button type="button" class="mqb-setup-opt" data-mode="manual">
                <span class="mqb-setup-icon">✎</span>
                <span class="mqb-setup-text">
                    <span class="mqb-setup-title">I'll build it myself</span>
                    <span class="mqb-setup-desc">Start from a blank quiz and add every question by hand.</span>
                </span>
            </button>
            <button type="button" class="mqb-setup-cancel" id="mqb-setup-cancel">Cancel</button>
        </div>`;

    body.querySelector('#mqb-setup-cancel').addEventListener('click', ctx.close);
    body.querySelectorAll('.mqb-setup-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mode === 'ai') startFromAi(ctx);
            else renderBody({ res: { success: true }, items: [], sourceDocId: null, ...ctx });
        });
    });
}

async function startFromAi(ctx) {
    ctx.body.innerHTML = `<div class="mqb-loading"><div class="mqb-spin"></div><span>Reading the SAS &amp; Teaching Guide…</span></div>`;

    const res = await Api.post('/AIQuizAPI.php?action=generate-from-module-docs', {
        subject_id: ctx.subjectId, module_number: ctx.moduleNumber, gradebook_component: ctx.component,
    });

    if (!ctx.isAlive()) return; // closed while loading

    let items = [];
    let sourceDocId = null;
    if (res.success) {
        items = (res.data?.questions || []).map(q => ({ ...q, id: uid() }));
        sourceDocId = res.data?.source_doc_id || null;
    }
    renderBody({ res, items, sourceDocId, ...ctx });
}

function renderBody(ctx) {
    const { res, items, label, body } = ctx;
    const warning = !res.success ? `<div class="mqb-warn">${esc(res.message || 'Could not auto-extract from the documents.')} You can still add questions manually below.</div>` : '';
    const empty = res.success && items.length === 0 ? `<div class="mqb-warn">No "${esc(label)}" items were found in the Student Activity Sheet. Add them manually, or double-check the uploaded file.</div>` : '';
    // Let's Practice / Reflection are graded on the Global Gradebook's 0-3
    // rubric (syncModuleGradeFromQuiz() buckets the attempt's PERCENTAGE into
    // 0/1/2/3 — 100%->3, 80-99%->2, 60-79%->1, else 0), never raw points.
    // A per-question "points" input would misleadingly suggest some other,
    // more granular scoring is happening — every item is just an equal-weight
    // share of that one percentage. Wrap Up Quiz uses its own separate scale
    // and keeps the points input.
    const isRubricScale = ['lets_practice', 'lets_practice_optional', 'reflection'].includes(ctx.component);

    body.innerHTML = `
        ${warning}${empty}
        <div class="mqb-field">
            <label>Quiz title</label>
            <input type="text" id="mqb-title" value="${esc(ctx.existingTitle || `Module ${ctx.moduleNumber} — ${label}`)}">
        </div>
        <div class="mqb-field">
            <label>Due date <span class="mqb-opt">(optional)</span></label>
            <input type="datetime-local" id="mqb-due" value="${esc(ctx.existingDueDate || '')}">
            <p class="mqb-hint">Students can answer anytime up to this date and time. After it passes they can't
                start, and are told to ask you for an extension. Leave blank for no deadline — or leave it blank
                to use the module's own deadline if one is set.</p>
        </div>
        ${isRubricScale ? `<div class="mqb-rubric-note">${esc(label)} is graded on the Global Gradebook's 0–3 scale, not points — every question counts equally toward the percentage that determines the score (100% = 3, 80–99% = 2, 60–79% = 1, below 60% = 0).</div>` : ''}
        <div class="mqb-items" id="mqb-items"></div>
        <button type="button" class="mqb-add-btn" id="mqb-add">+ Add question manually</button>
        <div class="mqb-field">
            <label>Grading</label>
            <select id="mqb-grading">
                <option value="ai_auto">AI grades automatically against the Teaching Guide (you still review before finalizing)</option>
                <option value="manual">I'll grade each answer manually</option>
            </select>
        </div>
        <label class="mqb-consent" id="mqb-consent-row">
            <input type="checkbox" id="mqb-consent-cb">
            <span>I understand the AI will check student answers against the Teaching Guide, and that no AI-graded score is final until I personally review and approve it.</span>
        </label>
        <div class="mqb-actions">
            <button type="button" class="mqb-cancel-btn" id="mqb-cancel">Cancel</button>
            <button type="button" class="mqb-save-btn" id="mqb-save" disabled>${ctx.quizId ? 'Save Changes' : 'Save Quiz'}</button>
        </div>`;

    const itemsEl = body.querySelector('#mqb-items');
    const gradingSel = body.querySelector('#mqb-grading');
    const consentRow = body.querySelector('#mqb-consent-row');
    const consentCb = body.querySelector('#mqb-consent-cb');
    const saveBtnEl = body.querySelector('#mqb-save');
    const updateSaveGate = () => {
        const needsConsent = gradingSel.value === 'ai_auto';
        consentRow.style.display = needsConsent ? 'flex' : 'none';
        saveBtnEl.disabled = needsConsent && !consentCb.checked;
    };
    gradingSel.addEventListener('change', updateSaveGate);
    consentCb.addEventListener('change', updateSaveGate);
    updateSaveGate();
    const renderItems = () => { itemsEl.innerHTML = items.map(it => itemHtml(it, isRubricScale)).join(''); wireItemEvents(); };
    const wireItemEvents = () => {
        itemsEl.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = items.findIndex(it => it.id === btn.dataset.remove);
                if (idx > -1) items.splice(idx, 1);
                renderItems();
            });
        });
        itemsEl.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                readFormIntoItems(itemsEl, items); // keep edits typed inline
                const idx = items.findIndex(it => it.id === btn.dataset.edit);
                if (idx < 0) return;
                openQuestionModal(null, null, itemToModalQuestion(items[idx]), {
                    pointsNote: rubricPointsNote(isRubricScale, label),
                    onSubmit: (payload) => {
                        const replacement = modalPayloadToItem(payload);
                        replacement.id = items[idx].id; // keep its place in the list
                        items[idx] = replacement;
                        renderItems();
                    },
                });
            });
        });
        itemsEl.querySelectorAll('[data-type-sel]').forEach(sel => {
            sel.addEventListener('change', async () => {
                const item = items.find(it => it.id === sel.dataset.typeSel);
                if (!item) return;
                // Sync whatever's currently typed in the DOM into `items`
                // FIRST — item.question only gets updated by explicit syncs
                // like this one (no live listener on every keystroke), so
                // checking it before this ran an item the instructor had
                // just typed into but never triggered a sync for would
                // always look empty, silently skipping the AI conversion
                // below and leaving it in plain manual mode.
                readFormIntoItems(itemsEl, items);
                const previousType = item.type;
                item.type = sel.value;
                if (item.type === 'multiple_choice' && !item.options) { item.options = ['', '', '', '']; item.correct_index = 0; }
                if (item.type === 'true_false' && item.answer === undefined) item.answer = true;

                // Switching TO Fill in the Blank or Multiple Choice is AI's
                // job, not the instructor's — carving a ___ into an existing
                // sentence, or writing four plausible options and picking
                // which one is right, is exactly the kind of manual busywork
                // this builder exists to avoid. Only meaningful when there's
                // an existing question to convert from; a freshly-added
                // blank item has nothing for the AI to work with.
                const converters = {
                    fill_blank: {
                        endpoint: '/AIQuizAPI.php?action=convert-to-fill-blank',
                        apply: (item, data) => { item.question = data.question; item.answer = data.answer; },
                    },
                    multiple_choice: {
                        endpoint: '/AIQuizAPI.php?action=convert-to-multiple-choice',
                        apply: (item, data) => { item.options = data.options; item.correct_index = data.correct_index; },
                    },
                };
                const converter = converters[item.type];
                if (converter && item.question?.trim()) {
                    item._converting = true;
                    renderItems();
                    const res = await Api.post(converter.endpoint, {
                        question: item.question, answer: item.answer || '',
                    });
                    item._converting = false;
                    if (res.success) {
                        converter.apply(item, res.data);
                    } else {
                        item.type = previousType;
                        notify.error(res.message || 'Could not convert this question. Please try again.');
                    }
                }
                renderItems();
            });
        });
    };
    renderItems();

    body.querySelector('#mqb-add').addEventListener('click', () => {
        // Reuse the full question editor from the regular quiz builder (type
        // picker, image/audio/link attachment, per-option correct marking)
        // in offline mode — nothing is saved until the whole quiz is saved.
        readFormIntoItems(itemsEl, items); // don't lose edits already typed in
        openQuestionModal(null, null, null, {
            pointsNote: rubricPointsNote(isRubricScale, label),
            onSubmit: (payload) => {
                items.push(modalPayloadToItem(payload));
                renderItems();
            },
        });
    });

    body.querySelector('#mqb-cancel').addEventListener('click', ctx.close);

    body.querySelector('#mqb-save').addEventListener('click', async () => {
        readFormIntoItems(itemsEl, items);
        const cleaned = items.filter(it => it.question && it.question.trim());
        if (!cleaned.length) {
            notify.error('Add at least one question before saving.');
            return;
        }
        const saveBtn = body.querySelector('#mqb-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        const objective = [];
        const subjective = [];
        cleaned.forEach(it => {
            // Forced to 1 for rubric-scale components regardless of whatever
            // value the item happened to carry (e.g. from AI generation) —
            // there's no points UI to set it otherwise for these, and every
            // item must weigh equally toward the 0-3 percentage bucketing.
            const row = { type: it.type, question: it.question.trim(), points: isRubricScale ? 1 : (it.points || 1) };
            // Carry any image/audio/link attachment added in the full editor —
            // saveQuiz() stores these on the question, so dropping them here
            // would silently lose the attachment on save.
            if (it.media_type && it.media_type !== 'none') {
                row.media_type = it.media_type;
                row.media_url  = it.media_url || '';
                row.media_name = it.media_name || '';
            }
            if (it.type === 'multiple_choice') {
                row.options = (it.options || []).map(o => o || '');
                row.correct_index = it.correct_index || 0;
                objective.push(row);
            } else if (it.type === 'true_false') {
                row.answer = !!it.answer;
                objective.push(row);
            } else {
                row.answer = it.answer || '';
                subjective.push(row);
            }
        });

        const payload = {
            subject_id: ctx.subjectId,
            quiz_title: body.querySelector('#mqb-title').value.trim() || `Module ${ctx.moduleNumber} — ${label}`,
            quiz_type: 'graded',
            module_number: ctx.moduleNumber,
            gradebook_component: ctx.component,
            source_doc_id: ctx.sourceDocId,
            objective_grading_mode: 'auto',
            subjective_grading_mode: gradingSel.value,
            // Always saved as a draft — the instructor turns it on for students
            // explicitly (Publish toggle in Module Documents), independently of
            // the other two components, instead of this going live the moment
            // it's saved. Ignored entirely when editing an existing quiz (see
            // AIQuizAPI.php's saveQuiz() — the quiz_id branch never touches
            // publish status), so this never un-publishes something already live.
            publish_mode: 'draft',
            all_sections: true,
            questions: { objective, subjective },
        };
        const dueVal = body.querySelector('#mqb-due')?.value || '';
        if (dueVal) payload.due_date = dueVal;
        if (ctx.quizId) {
            payload.quiz_id = ctx.quizId;
            payload.replace_questions = true;
            // Editing an existing quiz takes the AIQuizAPI branch that only
            // replaces questions, so the date has to be sent as its own update.
            payload.update_due_date = true;
            payload.due_date = dueVal || null;
        }

        const save = await Api.post('/AIQuizAPI.php?action=save', payload);
        if (save.success) {
            const msg = ctx.quizId
                ? `"${payload.quiz_title}" has been updated.`
                : `"${payload.quiz_title}" is saved as a draft — students can't see it yet. Open Module Documents and hit Publish next to this quiz when you're ready.`;
            await notify.alert(msg, { title: ctx.quizId ? 'Quiz Updated' : 'Quiz Saved', type: 'success' });
            ctx.close();
            ctx.opts.onSaved?.(save.quiz_id);
        } else {
            notify.error(save.error || save.message || 'Could not save the quiz.');
            saveBtn.disabled = false;
            saveBtn.textContent = ctx.quizId ? 'Save Changes' : 'Save Quiz';
        }
    });
}

function itemHtml(item, isRubricScale = false) {
    const isFillBlank = item.type === 'fill_blank';
    const isSubjective = item.type === 'short_answer' || item.type === 'essay' || isFillBlank;
    const questionPlaceholder = isFillBlank
        ? 'Question text — use ___ (3+ underscores) where the blank goes, e.g. "A router operates at layer ___ of the OSI model."'
        : 'Question text';
    const answerPlaceholder = isFillBlank
        ? 'Correct word or phrase that fills the blank'
        : 'Expected answer / rubric note (from the Teaching Guide)';
    if (item._converting) {
        const targetLabel = item.type === 'multiple_choice' ? 'Multiple Choice' : 'Fill in the Blank';
        return `
    <div class="mqb-item mqb-item--converting" data-id="${item.id}">
        <div class="mqb-item-top">
            <select disabled>
                <option>${esc(targetLabel)}</option>
            </select>
            <span class="mqb-converting-label"><span class="mqb-mini-spin"></span> AI is converting this to ${item.type === 'multiple_choice' ? 'multiple choice' : 'a fill-in-the-blank'}…</span>
        </div>
    </div>`;
    }
    return `
    <div class="mqb-item" data-id="${item.id}">
        <div class="mqb-item-top">
            <select data-type-sel="${item.id}">
                <option value="short_answer" ${item.type === 'short_answer' ? 'selected' : ''}>Short Answer</option>
                <option value="essay" ${item.type === 'essay' ? 'selected' : ''}>Essay</option>
                <option value="fill_blank" ${isFillBlank ? 'selected' : ''}>Fill in the Blank</option>
                <option value="multiple_choice" ${item.type === 'multiple_choice' ? 'selected' : ''}>Multiple Choice</option>
                <option value="true_false" ${item.type === 'true_false' ? 'selected' : ''}>True/False</option>
            </select>
            ${isRubricScale ? '' : `<input type="number" class="mqb-points" data-points="${item.id}" min="1" max="20" value="${item.points || 1}" title="Points">`}
            <button type="button" class="mqb-edit-btn" data-edit="${item.id}" title="Open in the full editor">Edit</button>
            <button type="button" class="mqb-remove-btn" data-remove="${item.id}" title="Remove">&#x2715;</button>
        </div>
        <textarea class="mqb-qtext" data-question="${item.id}" rows="2" placeholder="${esc(questionPlaceholder)}">${esc(item.question || '')}</textarea>
        ${item.type === 'multiple_choice' ? mcOptionsHtml(item) : ''}
        ${item.type === 'true_false' ? `
            <label class="mqb-tf"><input type="radio" name="tf-${item.id}" data-tf="${item.id}" value="1" ${item.answer ? 'checked' : ''}> True</label>
            <label class="mqb-tf"><input type="radio" name="tf-${item.id}" data-tf="${item.id}" value="0" ${!item.answer ? 'checked' : ''}> False</label>
        ` : ''}
        ${isSubjective ? `<textarea class="mqb-answer" data-answer="${item.id}" rows="2" placeholder="${esc(answerPlaceholder)}">${esc(item.answer || '')}</textarea>` : ''}
    </div>`;
}

function mcOptionsHtml(item) {
    const opts = item.options && item.options.length ? item.options : ['', '', '', ''];
    return `<div class="mqb-mc-opts">
        ${opts.map((o, i) => `
        <label class="mqb-mc-opt">
            <input type="radio" name="mc-${item.id}" data-mc-correct="${item.id}" value="${i}" ${item.correct_index === i ? 'checked' : ''}>
            <input type="text" data-mc-opt="${item.id}" data-idx="${i}" value="${esc(o)}" placeholder="Option ${String.fromCharCode(65 + i)}">
        </label>`).join('')}
    </div>`;
}

/** Read the live DOM values in the items container back into the `items` array before saving. */
function readFormIntoItems(itemsEl, items) {
    items.forEach(item => {
        const q = itemsEl.querySelector(`[data-question="${item.id}"]`);
        if (q) item.question = q.value;
        const p = itemsEl.querySelector(`[data-points="${item.id}"]`);
        if (p) item.points = parseInt(p.value, 10) || 1;
        const a = itemsEl.querySelector(`[data-answer="${item.id}"]`);
        if (a) item.answer = a.value;
        if (item.type === 'multiple_choice') {
            const optInputs = itemsEl.querySelectorAll(`[data-mc-opt="${item.id}"]`);
            item.options = Array.from(optInputs).map(inp => inp.value);
            const checked = itemsEl.querySelector(`[data-mc-correct="${item.id}"]:checked`);
            item.correct_index = checked ? parseInt(checked.value, 10) : 0;
        }
        if (item.type === 'true_false') {
            const checked = itemsEl.querySelector(`[data-tf="${item.id}"]:checked`);
            item.answer = checked ? checked.value === '1' : true;
        }
    });
}

function css() {
    return `
    /* Build-mode picker — a small modal in front of the page, same shape as
       the regular quiz creation picker. */
    .mqb-pick-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); z-index:10000;
        display:flex; align-items:center; justify-content:center; padding:20px; }
    .mqb-pick { background:#fff; border:2px solid #111; border-radius:18px; width:100%; max-width:480px;
        overflow:hidden; box-shadow:0 24px 48px rgba(0,0,0,.2); }
    .mqb-pick-hdr { padding:20px 24px; border-bottom:2px solid #111; }
    .mqb-pick-hdr h3 { margin:0 0 4px; font-size:19px; font-weight:800; color:${G}; }
    .mqb-pick-hdr p { margin:0; font-size:12.5px; color:#6B7280; }
    .mqb-pick-body { padding:18px 22px 20px; display:flex; flex-direction:column; gap:12px; }

    /* Full-width working surface — no max-width, no boxed frame. Building a
       14-module quiz set shouldn't happen inside a narrow column. */
    .mqb-page { width:100%; background:#fff; }
    /* Sticks below the app topbar (which is itself sticky at top:0) so the
       title and close button stay reachable down a long question list. */
    .mqb-hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 4px 16px;
        border-bottom:2px solid #111; background:#fff; position:sticky; top:var(--topbar-height,64px); z-index:5; }
    .mqb-hdr h3 { margin:0; font-size:19px; font-weight:800; color:${G}; }
    .mqb-sub { margin:3px 0 0; font-size:12.5px; color:#6B7280; }
    .mqb-close { background:none; border:none; font-size:18px; cursor:pointer; color:#6b7280; padding:4px 10px; }
    .mqb-close:hover { color:#111; }
    .mqb-body { padding:22px 4px 40px; display:flex; flex-direction:column; gap:14px; }
    /* Questions can breathe now that height isn't capped by a modal. */
    .mqb-qtext { min-height:76px; }
    .mqb-answer { min-height:64px; }
    .mqb-loading { display:flex; flex-direction:column; align-items:center; gap:10px; padding:50px; color:#6b7280; font-size:13px; }
    .mqb-spin { width:28px; height:28px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:mqbSpin .75s linear infinite; }
    @keyframes mqbSpin { to { transform:rotate(360deg); } }
    .mqb-warn { background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; border-radius:8px; padding:9px 12px; font-size:12px; }
    /* White surface, black border, deep green reserved for text/accents. */
    .mqb-rubric-note { background:#fff; border:1.5px solid #111; color:${G}; border-radius:8px;
        padding:10px 13px; font-size:12px; line-height:1.5; font-weight:600; }
    .mqb-setup { display:flex; flex-direction:column; gap:12px; }
    .mqb-setup-lede { margin:0 0 4px; font-size:13px; color:#374151; }
    /* Same card shape as the regular quiz creation picker. */
    .mqb-setup-opt { display:flex; align-items:flex-start; gap:14px; width:100%; text-align:left;
        border:2px solid #111; border-radius:14px; padding:16px; background:#fff; cursor:pointer;
        font-family:inherit; transition:border-color .15s, background .15s; }
    .mqb-setup-opt:hover { border-color:${G}; background:#F3F4F6; }
    .mqb-setup-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center;
        justify-content:center; flex-shrink:0; font-size:22px; background:#F3F4F6; }
    .mqb-setup-text { display:block; }
    .mqb-setup-title { display:block; font-size:15px; font-weight:800; color:#111; margin-bottom:4px; }
    .mqb-setup-desc { display:block; font-size:12px; color:#6B7280; line-height:1.45; }
    .mqb-setup-cancel { width:100%; margin-top:2px; padding:10px; border:none; background:none;
        color:#6B7280; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
    .mqb-setup-cancel:hover { color:#111; }
    .mqb-consent { display:flex; align-items:flex-start; gap:9px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; padding:10px 12px; cursor:pointer; }
    .mqb-consent input[type=checkbox] { margin-top:2px; accent-color:${G}; flex-shrink:0; }
    .mqb-consent span { font-size:12px; color:#92400E; line-height:1.45; }
    .mqb-field { display:flex; flex-direction:column; gap:5px; }
    .mqb-field label { font-size:11px; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:.3px; }
    .mqb-field input[type=text], .mqb-field input[type=datetime-local], .mqb-field select { border:1px solid ${BORDER}; border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; }
    .mqb-opt { font-weight:600; color:#9CA3AF; text-transform:none; letter-spacing:0; }
    .mqb-hint { font-size:11.5px; color:#6B7280; line-height:1.55; margin:4px 0 0; }
    .mqb-items { display:flex; flex-direction:column; gap:10px; }
    .mqb-item { border:1px solid ${BORDER}; border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:7px; background:#FAFAFA; }
    .mqb-item-top { display:flex; align-items:center; gap:8px; }
    .mqb-item-top select { border:1px solid ${BORDER}; border-radius:6px; padding:4px 6px; font-size:12px; font-family:inherit; }
    .mqb-item--converting { background:#F3F4F6; }
    .mqb-converting-label { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; color:${G}; }
    .mqb-mini-spin { width:13px; height:13px; border:2px solid #cfe6d8; border-top-color:${G}; border-radius:50%; animation:mqbSpin .7s linear infinite; flex-shrink:0; }
    .mqb-points { width:52px; border:1px solid ${BORDER}; border-radius:6px; padding:4px 6px; font-size:12px; font-family:inherit; }
    .mqb-edit-btn { margin-left:auto; background:#fff; border:1.5px solid ${G}; color:${G}; cursor:pointer;
        font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:6px; font-family:inherit; }
    .mqb-edit-btn:hover { background:#F3F4F6; }
    .mqb-remove-btn { background:none; border:none; color:#B91C1C; cursor:pointer; font-size:13px; padding:2px 6px; }
    .mqb-qtext, .mqb-answer { width:100%; border:1px solid ${BORDER}; border-radius:7px; padding:7px 9px; font-size:12.5px; font-family:inherit; resize:vertical; box-sizing:border-box; }
    /* Marked as the answer field by a deep-green edge rather than a green fill. */
    .mqb-answer { background:#fff; border-left:4px solid ${G}; border-radius:0 7px 7px 0; }
    .mqb-mc-opts { display:flex; flex-direction:column; gap:5px; }
    .mqb-mc-opt { display:flex; align-items:center; gap:7px; font-size:12.5px; }
    .mqb-mc-opt input[type=text] { flex:1; border:1px solid ${BORDER}; border-radius:6px; padding:5px 8px; font-size:12.5px; font-family:inherit; }
    .mqb-tf { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; margin-right:14px; }
    .mqb-add-btn { align-self:flex-start; background:#fff; border:1.5px dashed ${G}; color:${G}; padding:6px 14px;
        border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
    .mqb-add-btn:hover { background:#F3F4F6; }
    .mqb-actions { display:flex; justify-content:flex-end; gap:10px; padding-top:6px; border-top:1px solid ${BORDER}; }
    .mqb-cancel-btn { background:#fff; border:1px solid ${BORDER}; color:#374151; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; }
    .mqb-save-btn { background:${G}; border:1px solid ${G}; color:#fff; padding:8px 18px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; }
    .mqb-save-btn:hover { background:#006428; }
    .mqb-save-btn:disabled { opacity:.6; cursor:default; }
    `;
}
