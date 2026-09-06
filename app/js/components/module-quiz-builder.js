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

const G = '#00461B';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

const COMPONENT_LABELS = {
    lets_practice: "Let's Practice",
    lets_practice_optional: "Let's Practice (Optional)",
    reflection: 'Reflection',
    wrap_up_quiz: 'Wrap Up Quiz',
};

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}

let seq = 0;
function uid() { return `mqb-${++seq}`; }

/**
 * @param {number|string} subjectId
 * @param {number} moduleNumber
 * @param {'lets_practice'|'lets_practice_optional'|'reflection'|'wrap_up_quiz'} component
 * @param {{ subjectCode?: string, onSaved?: Function }} [opts]
 */
export async function openModuleQuizBuilder(subjectId, moduleNumber, component, opts = {}) {
    let overlay = document.getElementById('mqb-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'mqb-overlay';
    const label = COMPONENT_LABELS[component] || component;
    overlay.innerHTML = `<style>${css()}</style>
        <div class="mqb-modal" role="dialog" aria-label="Build Module Quiz">
            <div class="mqb-hdr">
                <div>
                    <h3>Module ${moduleNumber} · ${esc(label)}</h3>
                    <p class="mqb-sub">Built from the uploaded SAS &amp; Teaching Guide — review before publishing</p>
                </div>
                <button class="mqb-close" id="mqb-close" aria-label="Close">&#x2715;</button>
            </div>
            <div class="mqb-body" id="mqb-body">
                <div class="mqb-loading"><div class="mqb-spin"></div><span>Reading the SAS &amp; Teaching Guide…</span></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#mqb-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    let items = [];
    let sourceDocId = null;

    const body = overlay.querySelector('#mqb-body');

    const res = await Api.post('/AIQuizAPI.php?action=generate-from-module-docs', {
        subject_id: subjectId, module_number: moduleNumber, gradebook_component: component,
    });

    if (res.success) {
        items = (res.data?.questions || []).map(q => ({ ...q, id: uid() }));
        sourceDocId = res.data?.source_doc_id || null;
    } else if (!overlay.isConnected) {
        return; // closed while loading
    }

    renderBody({ res, items, subjectId, moduleNumber, component, sourceDocId, label, opts, overlay, body });
}

function renderBody(ctx) {
    const { res, items, label, overlay, body } = ctx;
    const warning = !res.success ? `<div class="mqb-warn">${esc(res.message || 'Could not auto-extract from the documents.')} You can still add questions manually below.</div>` : '';
    const empty = res.success && items.length === 0 ? `<div class="mqb-warn">No "${esc(label)}" items were found in the Student Activity Sheet. Add them manually, or double-check the uploaded file.</div>` : '';

    body.innerHTML = `
        ${warning}${empty}
        <div class="mqb-field">
            <label>Quiz title</label>
            <input type="text" id="mqb-title" value="Module ${ctx.moduleNumber} — ${esc(label)}">
        </div>
        <div class="mqb-items" id="mqb-items"></div>
        <button type="button" class="mqb-add-btn" id="mqb-add">+ Add question manually</button>
        <div class="mqb-field">
            <label>Grading</label>
            <select id="mqb-grading">
                <option value="ai_auto">AI grades automatically against the Teaching Guide (you still review before finalizing)</option>
                <option value="manual">I'll grade each answer manually</option>
            </select>
        </div>
        <div class="mqb-actions">
            <button type="button" class="mqb-cancel-btn" id="mqb-cancel">Cancel</button>
            <button type="button" class="mqb-save-btn" id="mqb-save">Save &amp; Publish</button>
        </div>`;

    const itemsEl = body.querySelector('#mqb-items');
    const renderItems = () => { itemsEl.innerHTML = items.map(itemHtml).join(''); wireItemEvents(); };
    const wireItemEvents = () => {
        itemsEl.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = items.findIndex(it => it.id === btn.dataset.remove);
                if (idx > -1) items.splice(idx, 1);
                renderItems();
            });
        });
        itemsEl.querySelectorAll('[data-type-sel]').forEach(sel => {
            sel.addEventListener('change', () => {
                const item = items.find(it => it.id === sel.dataset.typeSel);
                if (!item) return;
                item.type = sel.value;
                if (item.type === 'multiple_choice' && !item.options) { item.options = ['', '', '', '']; item.correct_index = 0; }
                if (item.type === 'true_false' && item.answer === undefined) item.answer = true;
                renderItems();
            });
        });
    };
    renderItems();

    body.querySelector('#mqb-add').addEventListener('click', () => {
        items.push({ id: uid(), type: 'short_answer', question: '', answer: '', points: 1 });
        renderItems();
    });

    body.querySelector('#mqb-cancel').addEventListener('click', () => overlay.remove());

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
            const row = { type: it.type, question: it.question.trim(), points: it.points || 1 };
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
            subjective_grading_mode: body.querySelector('#mqb-grading').value,
            publish_mode: 'now',
            all_sections: true,
            questions: { objective, subjective },
        };

        const save = await Api.post('/AIQuizAPI.php?action=save', payload);
        if (save.success) {
            await notify.alert(`"${payload.quiz_title}" is published — students will see it once the SAS is published for this module.`, { title: 'Quiz Saved', type: 'success' });
            overlay.remove();
            ctx.opts.onSaved?.(save.quiz_id);
        } else {
            notify.error(save.error || save.message || 'Could not save the quiz.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Publish';
        }
    });
}

function itemHtml(item) {
    const isSubjective = item.type === 'short_answer' || item.type === 'essay';
    return `
    <div class="mqb-item" data-id="${item.id}">
        <div class="mqb-item-top">
            <select data-type-sel="${item.id}">
                <option value="short_answer" ${item.type === 'short_answer' ? 'selected' : ''}>Short Answer</option>
                <option value="essay" ${item.type === 'essay' ? 'selected' : ''}>Essay</option>
                <option value="multiple_choice" ${item.type === 'multiple_choice' ? 'selected' : ''}>Multiple Choice</option>
                <option value="true_false" ${item.type === 'true_false' ? 'selected' : ''}>True/False</option>
            </select>
            <input type="number" class="mqb-points" data-points="${item.id}" min="1" max="20" value="${item.points || 1}" title="Points">
            <button type="button" class="mqb-remove-btn" data-remove="${item.id}" title="Remove">&#x2715;</button>
        </div>
        <textarea class="mqb-qtext" data-question="${item.id}" rows="2" placeholder="Question text">${esc(item.question || '')}</textarea>
        ${item.type === 'multiple_choice' ? mcOptionsHtml(item) : ''}
        ${item.type === 'true_false' ? `
            <label class="mqb-tf"><input type="radio" name="tf-${item.id}" data-tf="${item.id}" value="1" ${item.answer ? 'checked' : ''}> True</label>
            <label class="mqb-tf"><input type="radio" name="tf-${item.id}" data-tf="${item.id}" value="0" ${!item.answer ? 'checked' : ''}> False</label>
        ` : ''}
        ${isSubjective ? `<textarea class="mqb-answer" data-answer="${item.id}" rows="2" placeholder="Expected answer / rubric note (from the Teaching Guide)">${esc(item.answer || '')}</textarea>` : ''}
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
    #mqb-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:10000;
        display:flex; align-items:center; justify-content:center; padding:20px; }
    .mqb-modal { background:#fff; border-radius:16px; width:100%; max-width:720px; max-height:88vh;
        display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
    .mqb-hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 22px;
        border-bottom:1px solid ${BORDER}; background:${GL}; }
    .mqb-hdr h3 { margin:0; font-size:15px; font-weight:800; color:${G}; }
    .mqb-sub { margin:2px 0 0; font-size:11.5px; color:#4b7a5a; }
    .mqb-close { background:none; border:none; font-size:16px; cursor:pointer; color:#6b7280; padding:4px 8px; }
    .mqb-body { padding:16px 22px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
    .mqb-loading { display:flex; flex-direction:column; align-items:center; gap:10px; padding:50px; color:#6b7280; font-size:13px; }
    .mqb-spin { width:28px; height:28px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:mqbSpin .75s linear infinite; }
    @keyframes mqbSpin { to { transform:rotate(360deg); } }
    .mqb-warn { background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; border-radius:8px; padding:9px 12px; font-size:12px; }
    .mqb-field { display:flex; flex-direction:column; gap:5px; }
    .mqb-field label { font-size:11px; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:.3px; }
    .mqb-field input[type=text], .mqb-field select { border:1px solid ${BORDER}; border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; }
    .mqb-items { display:flex; flex-direction:column; gap:10px; }
    .mqb-item { border:1px solid ${BORDER}; border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:7px; background:#FAFAFA; }
    .mqb-item-top { display:flex; align-items:center; gap:8px; }
    .mqb-item-top select { border:1px solid ${BORDER}; border-radius:6px; padding:4px 6px; font-size:12px; font-family:inherit; }
    .mqb-points { width:52px; border:1px solid ${BORDER}; border-radius:6px; padding:4px 6px; font-size:12px; font-family:inherit; }
    .mqb-remove-btn { margin-left:auto; background:none; border:none; color:#B91C1C; cursor:pointer; font-size:13px; padding:2px 6px; }
    .mqb-qtext, .mqb-answer { width:100%; border:1px solid ${BORDER}; border-radius:7px; padding:7px 9px; font-size:12.5px; font-family:inherit; resize:vertical; box-sizing:border-box; }
    .mqb-answer { background:#F0FDF4; }
    .mqb-mc-opts { display:flex; flex-direction:column; gap:5px; }
    .mqb-mc-opt { display:flex; align-items:center; gap:7px; font-size:12.5px; }
    .mqb-mc-opt input[type=text] { flex:1; border:1px solid ${BORDER}; border-radius:6px; padding:5px 8px; font-size:12.5px; font-family:inherit; }
    .mqb-tf { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; margin-right:14px; }
    .mqb-add-btn { align-self:flex-start; background:#fff; border:1.5px dashed ${G}; color:${G}; padding:6px 14px;
        border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
    .mqb-add-btn:hover { background:${GL}; }
    .mqb-actions { display:flex; justify-content:flex-end; gap:10px; padding-top:6px; border-top:1px solid ${BORDER}; }
    .mqb-cancel-btn { background:#fff; border:1px solid ${BORDER}; color:#374151; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; }
    .mqb-save-btn { background:${G}; border:1px solid ${G}; color:#fff; padding:8px 18px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; }
    .mqb-save-btn:hover { background:#006428; }
    .mqb-save-btn:disabled { opacity:.6; cursor:default; }
    `;
}
