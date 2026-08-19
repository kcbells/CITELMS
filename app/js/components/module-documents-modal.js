/**
 * Module Documents modal — Teaching Guide / Student Activity Sheet (SAS)
 * Shared by the instructor Global Gradebook (upload, both doc types) and the
 * student global grading summary (view-only, SAS only — see ModuleDocumentsAPI.php).
 */
import { Api, BASE_URL } from '../api.js';

const G = '#00461B';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

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
    const canUpload = opts.canUpload ?? !!res.can_upload;
    const showTeachingGuide = canUpload; // students never receive teaching_guide rows from the API anyway

    const modules = Array.from({ length: 14 }, (_, i) => i + 1);
    body.innerHTML = `
        <div class="mdoc-list">
            ${modules.map(m => moduleRow(m, docs[m] || {}, { canUpload, showTeachingGuide })).join('')}
        </div>`;

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
    }
}

function moduleRow(moduleNum, docsForModule, { canUpload, showTeachingGuide }) {
    return `
    <div class="mdoc-row" data-mod="${moduleNum}">
        <div class="mdoc-mod-label">Module ${moduleNum}</div>
        <div class="mdoc-slots">
            ${showTeachingGuide ? docSlot(moduleNum, 'teaching_guide', 'Teaching Guide', docsForModule.teaching_guide, canUpload) : ''}
            ${docSlot(moduleNum, 'sas', 'Student Activity Sheet', docsForModule.sas, canUpload)}
        </div>
    </div>`;
}

function docSlot(moduleNum, type, label, doc, canUpload) {
    const inputId = `mdoc-file-${moduleNum}-${type}`;
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
               accept=".pdf,.doc,.docx,.ppt,.pptx" hidden>
        <span class="mdoc-status"></span>` : ''}
    </div>`;
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

    @media(max-width:640px) {
        .mdoc-slot-label { min-width:auto; }
        .mdoc-upload-btn { margin-left:0; }
    }
    `;
}
