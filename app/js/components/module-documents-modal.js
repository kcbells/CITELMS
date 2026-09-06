/**
 * Module Documents modal — Teaching Guide / Student Activity Sheet (SAS)
 * Shared by the instructor Global Gradebook (upload, both doc types) and the
 * student global grading summary (view-only, SAS only — see ModuleDocumentsAPI.php).
 */
import { Api, BASE_URL } from '../api.js';
import { openModuleQuizBuilder } from './module-quiz-builder.js';

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

function fileServeUrl(docId) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_token') : null;
    let url = `${BASE_URL}/api/ModuleDocumentsAPI.php?action=serve&doc_id=${encodeURIComponent(docId)}`;
    if (token) url += `&token=${encodeURIComponent(token)}`;
    return url;
}

function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Opens the Module Documents modal.
 * @param {number|string} subjectId
 * @param {{ canUpload?: boolean }} [opts]  canUpload comes back from the API too
 *        (can_upload) but callers may already know their role.
 */
export async function openModuleDocumentsModal(subjectId, opts = {}) {
    let overlay = document.getElementById('mdoc-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'mdoc-overlay';
    overlay.innerHTML = `<style>${css()}</style>
        <div class="mdoc-modal" role="dialog" aria-label="Module Documents">
            <div class="mdoc-hdr">
                <div>
                    <h3>Module Documents</h3>
                    <p class="mdoc-sub">Teaching Guide &amp; Student Activity Sheet, per module</p>
                </div>
                <button class="mdoc-close" id="mdoc-close" aria-label="Close">&#x2715;</button>
            </div>
            <div class="mdoc-body" id="mdoc-body">
                <div class="mdoc-loading"><div class="mdoc-spin"></div></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#mdoc-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    await loadAndRender(overlay, subjectId, opts);
}

async function loadAndRender(overlay, subjectId, opts) {
    const body = overlay.querySelector('#mdoc-body');
    const res = await Api.get(`/ModuleDocumentsAPI.php?action=list&subject_id=${subjectId}`, { ttl: 0 });

    if (!res.success) {
        body.innerHTML = `<div class="mdoc-empty">${esc(res.message || 'Could not load documents.')}</div>`;
        return;
    }

    const docs = res.data || {};
    const quizzes = res.quizzes || {};
    const canUpload = opts.canUpload ?? !!res.can_upload;
    const showTeachingGuide = canUpload; // students never receive teaching_guide rows from the API anyway

    const modules = Array.from({ length: 14 }, (_, i) => i + 1);
    body.innerHTML = `
        <div class="mdoc-list">
            ${modules.map(m => moduleRow(m, docs[m] || {}, quizzes[m] || {}, { canUpload, showTeachingGuide })).join('')}
        </div>`;

    if (canUpload) {
        body.querySelectorAll('.mdoc-quiz-build').forEach(btn => {
            btn.addEventListener('click', () => {
                const mod = parseInt(btn.dataset.mod, 10);
                const component = btn.dataset.component;
                openModuleQuizBuilder(subjectId, mod, component, {
                    onSaved: () => loadAndRender(overlay, subjectId, opts),
                });
            });
        });
    }

    if (canUpload) {
        body.querySelectorAll('.mdoc-upload-inp').forEach(inp => {
            inp.addEventListener('change', async () => {
                const file = inp.files?.[0];
                if (!file) return;
                const mod = inp.dataset.mod;
                const type = inp.dataset.type;
                const row = body.querySelector(`.mdoc-row[data-mod="${mod}"] .mdoc-slot[data-type="${type}"]`);
                const status = row?.querySelector('.mdoc-status');
                if (status) status.textContent = 'Uploading…';

                const fd = new FormData();
                fd.append('subject_id', subjectId);
                fd.append('module_number', mod);
                fd.append('doc_type', type);
                fd.append('file', file);

                const up = await Api.postForm('/ModuleDocumentsAPI.php?action=upload', fd);
                if (up.success) {
                    await loadAndRender(overlay, subjectId, opts);
                } else if (status) {
                    status.textContent = up.message || 'Upload failed';
                }
                inp.value = '';
            });
        });

        body.querySelectorAll('.mdoc-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remove this file?')) return;
                await Api.post('/ModuleDocumentsAPI.php?action=delete', { doc_id: parseInt(btn.dataset.docId, 10) });
                await loadAndRender(overlay, subjectId, opts);
            });
        });

        body.querySelectorAll('.mdoc-publish').forEach(row => {
            const docId = parseInt(row.dataset.docId, 10);
            const pubBtn = row.querySelector('.mdoc-pub-btn');
            const schedInput = row.querySelector('.mdoc-sched-input');
            const schedBtn = row.querySelector('.mdoc-sched-btn');
            const clearBtn = row.querySelector('.mdoc-sched-clear');

            pubBtn.addEventListener('click', async () => {
                const publishing = pubBtn.dataset.action === 'publish';
                pubBtn.disabled = true;
                await Api.post('/ModuleDocumentsAPI.php?action=set_publish', { doc_id: docId, is_published: publishing });
                await loadAndRender(overlay, subjectId, opts);
            });

            schedBtn.addEventListener('click', async () => {
                if (!schedInput.value) return;
                schedBtn.disabled = true;
                await Api.post('/ModuleDocumentsAPI.php?action=set_publish', {
                    doc_id: docId, is_published: false, publish_at: schedInput.value.replace('T', ' '),
                });
                await loadAndRender(overlay, subjectId, opts);
            });

            clearBtn?.addEventListener('click', async () => {
                clearBtn.disabled = true;
                await Api.post('/ModuleDocumentsAPI.php?action=set_publish', { doc_id: docId, publish_at: null });
                await loadAndRender(overlay, subjectId, opts);
            });
        });
    }
}

function moduleRow(moduleNum, docsForModule, quizzesForModule, { canUpload, showTeachingGuide }) {
    return `
    <div class="mdoc-row" data-mod="${moduleNum}">
        <div class="mdoc-mod-label">Module ${moduleNum}</div>
        <div class="mdoc-slots">
            ${showTeachingGuide ? docSlot(moduleNum, 'teaching_guide', 'Teaching Guide', docsForModule.teaching_guide, canUpload) : ''}
            ${docSlot(moduleNum, 'sas', 'Student Activity Sheet', docsForModule.sas, canUpload)}
        </div>
        ${docsForModule.sas ? moduleQuizRow(moduleNum, quizzesForModule, canUpload) : ''}
    </div>`;
}

/**
 * Let's Practice / Reflection / Wrap Up Quiz — each either offers to build a
 * quiz from the SAS (staff) or, once one exists and is published, lets the
 * student answer it in-app (student). See ModuleDocumentsAPI.php's
 * handleList() for the `quizzes[module][component]` shape.
 */
function moduleQuizRow(moduleNum, quizzesForModule, canUpload) {
    const components = ['lets_practice', 'reflection', 'wrap_up_quiz'];
    return `
    <div class="mdoc-quiz-row">
        ${components.map(c => moduleQuizChip(moduleNum, c, quizzesForModule[c], canUpload)).join('')}
    </div>`;
}

function moduleQuizChip(moduleNum, component, quiz, canUpload) {
    const label = COMPONENT_LABELS[component];
    if (canUpload) {
        return `<button type="button" class="mdoc-quiz-build" data-mod="${moduleNum}" data-component="${component}">
            ${quiz ? `${esc(label)} Quiz &#x270E;` : `+ Build ${esc(label)} Quiz`}
        </button>`;
    }
    if (!quiz) return `<span class="mdoc-quiz-chip mdoc-quiz-none">${esc(label)}: not ready yet</span>`;
    const attempt = quiz.my_attempt;
    if (!attempt) {
        return `<a class="mdoc-quiz-chip mdoc-quiz-answer" href="#student/take-quiz?quiz_id=${quiz.quiz_id}">Answer: ${esc(label)}</a>`;
    }
    if (attempt.status === 'completed') {
        return `<span class="mdoc-quiz-chip mdoc-quiz-done">${esc(label)}: submitted (${Number(attempt.percentage || 0).toFixed(0)}%)</span>`;
    }
    return `<a class="mdoc-quiz-chip mdoc-quiz-answer" href="#student/take-quiz?quiz_id=${quiz.quiz_id}">Continue: ${esc(label)}</a>`;
}

function docSlot(moduleNum, type, label, doc, canUpload) {
    const inputId = `mdoc-file-${moduleNum}-${type}`;
    // Publish/schedule only matters for SAS — Teaching Guide is never shown
    // to students regardless (staff-only doc type), so there's nothing to gate.
    const showPublish = canUpload && type === 'sas' && doc;
    return `
    <div class="mdoc-slot" data-type="${type}">
        <span class="mdoc-slot-label ${type === 'teaching_guide' ? 'mdoc-tg' : 'mdoc-sas'}">${label}</span>
        ${doc
            ? `<a class="mdoc-file-link" href="${fileServeUrl(doc.doc_id)}" target="_blank" rel="noopener">
                   ${esc(doc.original_name)} ${doc.file_size ? `<span class="mdoc-size">(${fmtSize(doc.file_size)})</span>` : ''}
               </a>
               ${canUpload ? `<button type="button" class="mdoc-delete-btn" data-doc-id="${doc.doc_id}" title="Remove">&#x2715;</button>` : ''}`
            : `<span class="mdoc-none">${canUpload ? 'Not uploaded yet' : 'Not available yet'}</span>`}
        ${canUpload ? `
        <label class="mdoc-upload-btn" for="${inputId}">${doc ? 'Replace' : 'Upload'}</label>
        <input type="file" id="${inputId}" class="mdoc-upload-inp" data-mod="${moduleNum}" data-type="${type}"
               accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv" hidden>
        <span class="mdoc-status"></span>` : ''}
    </div>
    ${showPublish ? publishRow(doc) : ''}`;
}

/** Publish-now / schedule controls for one SAS document — students can't see
 *  it until this says so (or its scheduled time arrives). */
function publishRow(doc) {
    const scheduled = doc.publish_at && !doc.is_published;
    const state = doc.is_published ? 'published' : scheduled ? 'scheduled' : 'hidden';
    const pillText = doc.is_published ? 'Visible to students'
        : scheduled ? `Scheduled: ${fmtWhen(doc.publish_at)}`
        : 'Hidden from students';
    return `
    <div class="mdoc-publish" data-doc-id="${doc.doc_id}">
        <span class="mdoc-pill mdoc-pill-${state}">${esc(pillText)}</span>
        <button type="button" class="mdoc-pub-btn" data-action="${doc.is_published ? 'hide' : 'publish'}">
            ${doc.is_published ? 'Unpublish' : 'Publish now'}
        </button>
        <label class="mdoc-sched-label">Schedule:
            <input type="datetime-local" class="mdoc-sched-input" value="${toLocalInputValue(doc.publish_at)}">
        </label>
        <button type="button" class="mdoc-sched-btn">Set</button>
        ${scheduled ? `<button type="button" class="mdoc-sched-clear">Clear schedule</button>` : ''}
    </div>`;
}

function fmtWhen(mysqlDateTime) {
    if (!mysqlDateTime) return '';
    const d = new Date(mysqlDateTime.replace(' ', 'T'));
    if (isNaN(d)) return mysqlDateTime;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** MySQL "YYYY-MM-DD HH:MM:SS" -> the value a <input type=datetime-local> expects. */
function toLocalInputValue(mysqlDateTime) {
    if (!mysqlDateTime) return '';
    const d = new Date(mysqlDateTime.replace(' ', 'T'));
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function css() {
    return `
    #mdoc-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9999;
        display:flex; align-items:center; justify-content:center; padding:20px; }
    .mdoc-modal { background:#fff; border-radius:16px; width:100%; max-width:760px; max-height:85vh;
        display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
    .mdoc-hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 22px;
        border-bottom:1px solid ${BORDER}; background:${GL}; }
    .mdoc-hdr h3 { margin:0; font-size:16px; font-weight:800; color:${G}; }
    .mdoc-sub { margin:2px 0 0; font-size:12px; color:#4b7a5a; }
    .mdoc-close { background:none; border:none; font-size:16px; cursor:pointer; color:#6b7280; padding:4px 8px; }
    .mdoc-close:hover { color:#111; }
    .mdoc-body { padding:14px 22px 22px; overflow-y:auto; }
    .mdoc-loading { display:flex; justify-content:center; padding:40px; }
    .mdoc-spin { width:28px; height:28px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:mdocSpin .75s linear infinite; }
    @keyframes mdocSpin { to { transform:rotate(360deg); } }
    .mdoc-empty { padding:24px; text-align:center; color:#6b7280; font-size:13px; }

    .mdoc-list { display:flex; flex-direction:column; gap:8px; }
    .mdoc-row { border:1px solid ${BORDER}; border-radius:10px; padding:10px 14px; }
    .mdoc-mod-label { font-size:12px; font-weight:800; color:${G}; text-transform:uppercase; letter-spacing:.4px; margin-bottom:8px; }
    .mdoc-slots { display:flex; flex-direction:column; gap:8px; }
    .mdoc-slot { display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:13px; }
    .mdoc-slot-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.3px;
        padding:3px 8px; border-radius:6px; flex-shrink:0; min-width:150px; text-align:center; }
    .mdoc-slot-label.mdoc-tg  { background:#EDE9FE; color:#6D28D9; }
    .mdoc-slot-label.mdoc-sas { background:${GL}; color:${G}; }
    .mdoc-file-link { color:${G}; text-decoration:none; font-weight:600; }
    .mdoc-file-link:hover { text-decoration:underline; }
    .mdoc-size { color:#9ca3af; font-weight:400; }
    .mdoc-none { color:#9ca3af; font-style:italic; }
    .mdoc-upload-btn { margin-left:auto; background:#fff; border:1.5px solid ${G}; color:${G};
        padding:4px 12px; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; }
    .mdoc-upload-btn:hover { background:${GL}; }
    .mdoc-delete-btn { background:none; border:none; color:#B91C1C; cursor:pointer; font-size:12px; padding:2px 4px; }
    .mdoc-status { font-size:11px; color:#6b7280; }

    /* ── Publish / schedule row (SAS only) ───────────────────────────── */
    .mdoc-publish { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:6px 0 0 0;
        padding:8px 10px; background:#FAFAFA; border:1px solid ${BORDER}; border-radius:8px; font-size:11.5px; }
    .mdoc-pill { padding:3px 9px; border-radius:20px; font-size:10.5px; font-weight:700; flex-shrink:0; }
    .mdoc-pill-published { background:${GL}; color:${G}; }
    .mdoc-pill-scheduled { background:#FEF3C7; color:#92400E; }
    .mdoc-pill-hidden { background:#F3F4F6; color:#6B7280; }
    .mdoc-pub-btn { background:#fff; border:1.5px solid ${G}; color:${G}; padding:4px 11px; border-radius:7px;
        font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; }
    .mdoc-pub-btn:hover { background:${GL}; }
    .mdoc-sched-label { display:flex; align-items:center; gap:6px; color:#6b7280; font-size:11px; }
    .mdoc-sched-input { border:1px solid ${BORDER}; border-radius:6px; padding:3px 6px; font-size:11px; font-family:inherit; }
    .mdoc-sched-btn, .mdoc-sched-clear { background:none; border:1.5px solid ${BORDER}; color:#374151;
        padding:4px 10px; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; flex-shrink:0; }
    .mdoc-sched-btn:hover { border-color:${G}; color:${G}; }
    .mdoc-sched-clear { color:#B91C1C; border-color:#FCA5A5; }
    .mdoc-sched-clear:hover { background:#FEF2F2; }

    /* ── Module quiz row (Let's Practice / Reflection / Wrap Up Quiz) ──── */
    .mdoc-quiz-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; padding-top:6px; border-top:1px dashed ${BORDER}; }
    .mdoc-quiz-build { background:#fff; border:1.5px dashed ${G}; color:${G}; padding:4px 10px; border-radius:7px;
        font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; }
    .mdoc-quiz-build:hover { background:${GL}; }
    .mdoc-quiz-chip { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-decoration:none; }
    .mdoc-quiz-none { background:#F3F4F6; color:#9ca3af; font-style:italic; }
    .mdoc-quiz-answer { background:${G}; color:#fff; }
    .mdoc-quiz-answer:hover { background:#006428; }
    .mdoc-quiz-done { background:${GL}; color:${G}; }

    @media(max-width:640px) {
        .mdoc-slot-label { min-width:auto; }
        .mdoc-upload-btn { margin-left:0; }
    }
    `;
}
