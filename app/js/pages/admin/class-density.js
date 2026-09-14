/**
 * Admin — Uploads
 * Three tabs:
 *   - Class Density — bulk-import instructors, students, subjects, sections,
 *     and class assignments from one Excel/CSV/Word/photo file (same engine
 *     as the Users page's "Import Excel" button — BulkImportAPI.php).
 *   - Class List — a registrar-style roster export (Session Name, Campus,
 *     Student ID, Student Name, Gender, College, Course, Curriculum,
 *     Subject, Section, Email) where each row already names its own
 *     Subject + Section. Only students are upserted here — the Subject and
 *     Section themselves must already exist and are matched exactly, never
 *     created (BulkImportAPI.php's class-list-import action).
 *   - Lesson Material — per-subject, per-module Teaching Guide & Student
 *     Activity Sheet uploads. Same Module Documents modal instructors
 *     already use from Global Gradebook (ModuleDocumentsAPI.php), just
 *     reachable admin-wide across every subject instead of only from within
 *     an instructor's own gradebook.
 *
 * The old "Subjects" tab (mark subjects as Global via upload) has moved off
 * the admin side — that's the Dean's call, not admin's, per plan.
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { mountBulkImportUI, bulkImportCss } from '../../components/bulk-import-ui.js';
import { openModuleDocumentsModal } from '../../components/module-documents-modal.js';
import { notify } from '../../utils/notify.js';

import { esc } from '../../utils/classroom-ui.js';
// esc() imported from classroom-ui.js (see import above)


let activeTab = 'density';

/** The same three-step reminder shown above each upload flow on this page. */
function stepsHtml() {
    return `
        <ol class="cd-steps">
            <li><span class="cd-step-n">1</span> Choose your file</li>
            <li><span class="cd-step-n">2</span> Check the preview</li>
            <li><span class="cd-step-n">3</span> Click <strong>Upload &amp; Import</strong></li>
        </ol>`;
}

export async function render(container) {
    container.innerHTML = `
        <style>${pageCss()}${bulkImportCss()}</style>
        <div class="cd-page">
            <header class="cd-hero">
                <span class="cd-pill">${icon('cloudUpload', { size: 13, className: 'ui-icon-inline' })} Uploads</span>
                <h1>Uploads</h1>
                <p class="cd-hero-sub">Upload a file to set up classes, enroll students, or add lesson materials.</p>
            </header>

            <div class="cd-tabs" role="tablist">
                <button type="button" class="cd-tab" data-tab="density" role="tab">
                    ${icon('cloudUpload', { size: 14, className: 'ui-icon-inline' })} Class Density
                </button>
                <button type="button" class="cd-tab" data-tab="classlist" role="tab">
                    ${icon('document', { size: 14, className: 'ui-icon-inline' })} Class List
                </button>
                <button type="button" class="cd-tab" data-tab="material" role="tab">
                    ${icon('folder', { size: 14, className: 'ui-icon-inline' })} Lesson Material
                </button>
            </div>

            <div id="cd-tab-body"></div>
        </div>`;

    const tabBtns = container.querySelectorAll('.cd-tab');
    const body = container.querySelector('#cd-tab-body');

    function showTab(tab) {
        activeTab = tab;
        tabBtns.forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
        if (tab === 'density') {
            body.innerHTML = `
                <div class="cd-guide">
                    <p class="cd-guide-lead"><strong>Upload your Class Density file here.</strong></p>
                    <p class="cd-guide-what">This sets up everything in one go — teacher and student accounts,
                        subjects, sections, and who teaches which class.</p>
                    <p class="cd-guide-when">${icon('info', { size: 13, className: 'ui-icon-inline' })}
                        Use this <strong>first</strong>, when setting up classes for a new term.</p>
                    ${stepsHtml()}
                </div>
                <div id="cd-import-host"></div>`;
            mountBulkImportUI(body.querySelector('#cd-import-host'));
        } else if (tab === 'material') {
            renderLessonMaterialTab(body);
        } else {
            body.innerHTML = `
                <div class="cd-guide">
                    <p class="cd-guide-lead"><strong>Upload your Class List here.</strong></p>
                    <p class="cd-guide-what">This enrolls students into classes that <strong>already exist</strong>.
                        It only adds students — it never creates new subjects, sections, or classes.</p>
                    <p class="cd-guide-when">${icon('info', { size: 13, className: 'ui-icon-inline' })}
                        Use this <strong>after</strong> the classes are already set up. If a row's subject or section
                        isn't found, that row is skipped and listed for you — nothing is invented.</p>
                    ${stepsHtml()}
                </div>
                <div id="cd-cl-import-host"></div>`;
            mountBulkImportUI(body.querySelector('#cd-cl-import-host'), {
                importAction: 'class-list-import',
                renderResult: renderClassListResult,
            });
        }
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
    showTab(activeTab);
}

// ── Lesson Material tab — per-subject Teaching Guide / SAS uploads ─────────
// Reuses the exact same Module Documents modal instructors get from Global
// Gradebook (openModuleDocumentsModal, ModuleDocumentsAPI.php) — no new
// upload logic, just a subject picker so admin can reach it for any subject.

let _lmSubjects = null; // cached for the session; search filters client-side

async function renderLessonMaterialTab(body) {
    body.innerHTML = `
        <div class="cd-lm-top">
            <p class="cd-tab-sub cd-lm-top-sub">Manage a subject's documents directly — upload, replace, publish, or
                schedule each module's Teaching Guide and Student Activity Sheet one at a time.</p>
            <button type="button" class="cd-lm-browse-btn" id="cd-lm-browse-btn">
                ${icon('folder', { size: 14, className: 'ui-icon-inline' })} Manage Documents…
            </button>
        </div>

        <div class="cd-lm-scan">
            <h3 class="cd-lm-scan-h">${icon('cloudUpload', { size: 15, className: 'ui-icon-inline' })} Scan &amp; Upload</h3>
            <p class="cd-tab-sub"><strong>Drop your Teaching Guide and Student Activity Sheet files here</strong>
                — PDF, Word, Excel, or text. You can drop many at once; the system reads each file's own header
                (Course Name and Module Number) to work out which subject and module it belongs to, so you don't
                have to sort them by hand.<br>
                Uploads stay <strong>hidden from students</strong> until the subject's instructor publishes them
                from <strong>Manage Documents</strong> above.</p>
            <div class="bi-dropzone" id="cd-lm-dropzone">
                <input type="file" id="cd-lm-file-input" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" multiple hidden>
                <div class="bi-dz-icon">${icon('cloudUpload', { size: 24, className: 'ui-icon-inline' })}</div>
                <p class="bi-dz-title"><strong>Click to choose files</strong> or drag them here</p>
                <p class="bi-dz-hint">PDF, Word, Excel, or text &middot; any number at once</p>
            </div>
            <div id="cd-lm-scan-rows" class="cd-lm-scan-rows"></div>
        </div>`;

    setupScanDropzone(body);
    body.querySelector('#cd-lm-browse-btn').addEventListener('click', openSubjectPickerModal);
}

/**
 * "Manage Documents…" — the search-and-pick-a-subject list used to sit
 * inline on the page at all times; it's now tucked behind this one button
 * (at the top of the tab) and only built when actually needed, opening as
 * its own modal. Picking a subject here opens the existing per-subject
 * Module Documents modal on top of it, same as before.
 */
async function openSubjectPickerModal() {
    document.getElementById('cd-sp-overlay')?.remove();

    if (!_lmSubjects) {
        // SubjectsAPI.php caps per_page at 200 server-side — plenty for the
        // current subject count; if the catalog ever grows past that, this
        // needs real pagination instead of one big fetch.
        const res = await Api.get('/SubjectsAPI.php?action=list&per_page=200');
        _lmSubjects = res.success ? (res.data || []) : [];
    }

    const overlay = document.createElement('div');
    overlay.id = 'cd-sp-overlay';
    overlay.innerHTML = `<style>${subjectPickerCss()}</style>
        <div class="cd-sp-modal" role="dialog" aria-label="Manage Documents">
            <div class="cd-sp-hdr">
                <h3>Manage Documents</h3>
                <button type="button" class="cd-sp-close" id="cd-sp-close" aria-label="Close">&#x2715;</button>
            </div>
            <div class="cd-sp-body">
                <div class="cd-lm-search">
                    ${icon('search', { size: 14, className: 'ui-icon-inline' })}
                    <input type="text" id="cd-lm-search" placeholder="Search by subject code or name…">
                </div>
                <div id="cd-lm-list" class="cd-lm-list"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#cd-sp-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const listEl = overlay.querySelector('#cd-lm-list');
    const searchEl = overlay.querySelector('#cd-lm-search');

    function draw(filter = '') {
        const q = filter.trim().toLowerCase();
        const rows = !q ? _lmSubjects : _lmSubjects.filter(s =>
            (s.subject_code || '').toLowerCase().includes(q) || (s.subject_name || '').toLowerCase().includes(q)
        );
        if (!rows.length) {
            listEl.innerHTML = `<div class="cd-lm-empty">No subjects match "${esc(filter)}".</div>`;
            return;
        }
        listEl.innerHTML = rows.map(s => `
            <div class="cd-lm-row">
                <div class="cd-lm-info">
                    <span class="cd-lm-code">${esc(s.subject_code)}</span>
                    <span class="cd-lm-name">${esc(s.subject_name)}</span>
                </div>
                <button type="button" class="cd-lm-btn" data-id="${s.subject_id}">
                    ${icon('folder', { size: 13, className: 'ui-icon-inline' })} Manage Documents
                </button>
            </div>`).join('');
        listEl.querySelectorAll('.cd-lm-btn').forEach(btn => {
            btn.addEventListener('click', () => openModuleDocumentsModal(btn.dataset.id, { canUpload: true }));
        });
    }

    draw();
    searchEl.focus();
    let debounce;
    searchEl.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => draw(searchEl.value), 200);
    });
}

function subjectPickerCss() {
    return `
        #cd-sp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9999;
            display:flex; align-items:center; justify-content:center; padding:20px; }
        .cd-sp-modal { background:#fff; border-radius:16px; width:100%; max-width:560px; max-height:82vh;
            display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
        .cd-sp-hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 22px;
            border-bottom:1.5px solid #E5E7EB; }
        .cd-sp-hdr h3 { margin:0; font-size:16px; font-weight:800; color:#111; }
        .cd-sp-close { background:none; border:none; font-size:16px; cursor:pointer; color:#6b7280; padding:4px 8px; }
        .cd-sp-close:hover { color:#111; }
        .cd-sp-body { padding:16px 22px 22px; overflow-y:auto; }
        .cd-sp-body .cd-lm-search { margin-bottom:14px; }
    `;
}

// ── Scan & Upload — figures out each file's subject, module, and doc type
// without the admin sorting them by hand. Detection itself runs server-side
// (ModuleDocumentsAPI.php?action=detect) so every format shares one set of
// rules and matches against the REAL subject list instead of requiring exact
// header wording: PDF/plain-text files are extracted in-browser (pdf.js —
// there's no server-side PDF reader in this project) and their text is sent
// up; .docx/.xlsx files are sent as-is and extracted server-side with the
// same DocxTableReader/XlsxReader helpers Class Density's own import trusts.
// Legacy binary .doc/.xls have no reader either side, so they still land in
// "needs review" for a quick manual pick — same safe fallback as an
// unreadable/unrecognized file of any type, never a hard failure.
const SCAN_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|txt|csv)$/i;
const SCANNABLE_TEXT_RE = /\.(txt|csv)$/i;
const SERVER_DETECTABLE_RE = /\.(docx|xlsx)$/i;

let _pdfJsLoaded = false;
function loadPdfJs() {
    if (_pdfJsLoaded || window.pdfjsLib) { _pdfJsLoaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            _pdfJsLoaded = true;
            resolve();
        };
        s.onerror = () => reject(new Error('Failed to load the PDF reader library.'));
        document.head.appendChild(s);
    });
}

/** Reads the first couple of pages' text — the header table with Course Name
 *  and Module Number is always on page 1 of these documents. */
async function extractPdfHeaderText(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    const pages = Math.min(2, pdf.numPages);
    for (let p = 1; p <= pages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
}

/**
 * Asks the server to figure out the subject/module/doc-type — either from
 * already-extracted text (PDF/plain-text callers, which pass `text`) or by
 * handing over the file itself for server-side extraction (.docx/.xlsx
 * callers, which pass `file` instead). See ModuleDocumentsAPI.php's
 * detectModuleDocInfo() for the actual matching rules; this never throws —
 * an unreadable/unrecognized file just comes back with everything blank, so
 * the row falls through to the existing manual review UI.
 */
async function detectDocInfoServer(file, text) {
    const fd = new FormData();
    if (text != null) {
        fd.append('text', text);
        fd.append('filename', file.name);
    } else {
        fd.append('file', file);
    }
    const blank = { courseCode: '', subject: null, moduleNumber: null, docType: '' };
    try {
        const res = await Api.postForm('/ModuleDocumentsAPI.php?action=detect', fd);
        if (!res.success || !res.data) return blank;
        const d = res.data;
        return {
            courseCode: d.course_code || '',
            subject: d.subject || null,
            moduleNumber: d.module_number ?? null,
            docType: d.doc_type || '',
        };
    } catch {
        return blank;
    }
}

function subjectOptionsHtml(selectedId) {
    const opts = _lmSubjects.map(s =>
        `<option value="${s.subject_id}" ${String(s.subject_id) === String(selectedId) ? 'selected' : ''}>
            ${esc(s.subject_code)} — ${esc(s.subject_name)}
        </option>`
    ).join('');
    return `<option value="">Select subject…</option>${opts}`;
}

function setupScanDropzone(body) {
    const dropzone  = body.querySelector('#cd-lm-dropzone');
    const fileInput = body.querySelector('#cd-lm-file-input');
    const rowsEl    = body.querySelector('#cd-lm-scan-rows');

    dropzone.addEventListener('click', () => fileInput.click());
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
            e.preventDefault(); e.stopPropagation();
            dropzone.classList.toggle('bi-drag-over', evt === 'dragover' || evt === 'dragenter');
        });
    });
    dropzone.addEventListener('drop', e => handleScanFiles([...e.dataTransfer.files], rowsEl));
    fileInput.addEventListener('change', () => {
        handleScanFiles([...fileInput.files], rowsEl);
        fileInput.value = '';
    });
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => reject(new Error('Could not read this file.'));
        reader.readAsText(file);
    });
}

/** The actual upload call, shared by the auto-detected path and the manual-review path. */
async function uploadDoc(subjectId, moduleNum, docType, file) {
    const fd = new FormData();
    fd.append('subject_id', subjectId);
    fd.append('module_number', moduleNum);
    fd.append('doc_type', docType);
    fd.append('file', file);
    return Api.postForm('/ModuleDocumentsAPI.php?action=upload', fd);
}

async function handleScanFiles(files, rowsEl) {
    const usable = files.filter(f => SCAN_EXT_RE.test(f.name));
    if (!usable.length) {
        rowsEl.insertAdjacentHTML('afterbegin', `<div class="cd-lm-scan-err">Only PDF, Word, Excel, or text files are supported.</div>`);
        return;
    }
    const needsPdfJs = usable.some(f => /\.pdf$/i.test(f.name));
    if (needsPdfJs) {
        try {
            await loadPdfJs();
        } catch (err) {
            rowsEl.insertAdjacentHTML('afterbegin', `<div class="cd-lm-scan-err">${esc(err.message)}</div>`);
            return;
        }
    }

    // Files the scanner is confident about upload themselves the instant
    // they're read — "only an upload", no form to fill in. Anything it
    // couldn't pin down still needs a human pick, tallied separately below.
    let autoUploaded = 0, autoFailed = 0, needsReviewCount = 0;

    for (const file of usable) {
        const rowId = `cd-lm-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        rowsEl.insertAdjacentHTML('beforeend', `
            <div class="cd-lm-scan-row" id="${rowId}">
                <span class="cd-lm-scan-name">${esc(file.name)}</span>
                <span class="cd-lm-scan-status">Reading file…</span>
            </div>`);
        const rowEl = document.getElementById(rowId);
        const isPdf = /\.pdf$/i.test(file.name);
        const isScannableText = SCANNABLE_TEXT_RE.test(file.name);
        const isServerDetectable = SERVER_DETECTABLE_RE.test(file.name);

        let info = { courseCode: '', subject: null, moduleNumber: null, docType: '' };
        if (isPdf) {
            let text;
            try {
                text = await extractPdfHeaderText(file);
            } catch (err) {
                rowEl.querySelector('.cd-lm-scan-status').textContent = 'Could not read this PDF — is it a scanned image?';
                renderScanReviewRow(rowEl, file, info);
                needsReviewCount++;
                continue;
            }
            info = await detectDocInfoServer(file, text);
        } else if (isScannableText) {
            try {
                info = await detectDocInfoServer(file, await readTextFile(file));
            } catch {
                // Fall through with blank info — still uploadable, just needs manual review.
            }
        } else if (isServerDetectable) {
            // .docx / .xlsx — no in-browser text extraction, so the file
            // itself goes up and the server extracts + matches it.
            info = await detectDocInfoServer(file, null);
        }
        // Legacy .doc/.xls have no reader on either side, so info stays
        // blank and the row asks for a manual pick, same as an unrecognized
        // or unreadable file of any other type.

        // Confident on all three: a real subject match, a module number,
        // and a doc type — nothing left for a human to pick, so it just
        // uploads. Anything less certain falls back to the review row.
        const confident = info.subject && info.moduleNumber && info.docType;
        if (confident) {
            rowEl.querySelector('.cd-lm-scan-status').textContent = 'Uploading…';
            const res = await uploadDoc(info.subject.subject_id, info.moduleNumber, info.docType, file);
            if (res.success) {
                autoUploaded++;
                rowEl.className = 'cd-lm-scan-row cd-lm-scan-done';
                rowEl.innerHTML = `
                    <span class="cd-lm-scan-name">${esc(file.name)}</span>
                    <span class="cd-lm-scan-badge">${icon('check', { size: 12, className: 'ui-icon-inline' })} ${esc(info.subject.subject_code)} &middot; Module ${info.moduleNumber} &middot; ${info.docType === 'teaching_guide' ? 'Teaching Guide' : 'SAS'}</span>
                    <span class="cd-lm-scan-status">Uploaded — hidden from students until published.</span>`;
            } else {
                autoFailed++;
                rowEl.querySelector('.cd-lm-scan-status').textContent = res.message || 'Upload failed.';
                renderScanReviewRow(rowEl, file, info);
            }
        } else {
            needsReviewCount++;
            renderScanReviewRow(rowEl, file, info);
        }
    }

    // One confirmation for the whole drop — the modal indicator the rest of
    // the system's uploads use too, not just this row's inline text.
    if (autoUploaded || autoFailed) {
        const parts = [];
        if (autoUploaded) parts.push(`${autoUploaded} file${autoUploaded !== 1 ? 's' : ''} uploaded automatically`);
        if (autoFailed) parts.push(`${autoFailed} failed`);
        if (needsReviewCount) parts.push(`${needsReviewCount} need${needsReviewCount === 1 ? 's' : ''} a quick manual check below`);
        await notify.alert(parts.join(', ') + '.', {
            title: autoFailed ? 'Upload Finished, With Errors' : 'Files Uploaded',
            type: autoFailed ? 'warning' : 'success',
        });
    } else if (needsReviewCount) {
        await notify.alert(
            `Couldn't confidently identify ${needsReviewCount} file${needsReviewCount !== 1 ? 's' : ''} — check the subject, module, and type below, then upload ${needsReviewCount !== 1 ? 'them' : 'it'} manually.`,
            { title: 'Needs a Quick Check', type: 'warning' }
        );
    }
}

function renderScanReviewRow(rowEl, file, info) {
    rowEl.className = 'cd-lm-scan-row cd-lm-scan-needs-review';
    rowEl.innerHTML = `
        <span class="cd-lm-scan-name">${esc(file.name)}</span>
        <select class="cd-lm-scan-subject">${subjectOptionsHtml(info.subject?.subject_id)}</select>
        <input type="number" class="cd-lm-scan-module" min="1" max="14" placeholder="Module #" value="${info.moduleNumber || ''}">
        <select class="cd-lm-scan-type">
            <option value="teaching_guide" ${info.docType === 'teaching_guide' ? 'selected' : ''}>Teaching Guide</option>
            <option value="sas" ${info.docType === 'sas' ? 'selected' : ''}>Student Activity Sheet</option>
        </select>
        <button type="button" class="cd-lm-scan-upload">${icon('upload', { size: 12, className: 'ui-icon-inline' })} Upload</button>
        <span class="cd-lm-scan-status">Couldn't confirm this one automatically — check the fields above</span>`;

    rowEl.querySelector('.cd-lm-scan-upload').addEventListener('click', async () => {
        const subjectId = rowEl.querySelector('.cd-lm-scan-subject').value;
        const moduleNum = parseInt(rowEl.querySelector('.cd-lm-scan-module').value, 10);
        const docType   = rowEl.querySelector('.cd-lm-scan-type').value;
        const statusEl  = rowEl.querySelector('.cd-lm-scan-status');
        const btn       = rowEl.querySelector('.cd-lm-scan-upload');

        if (!subjectId || !moduleNum || moduleNum < 1 || moduleNum > 14) {
            statusEl.textContent = 'Pick a subject and a module number (1–14) first.';
            return;
        }

        btn.disabled = true;
        statusEl.textContent = 'Uploading…';
        const res = await uploadDoc(subjectId, moduleNum, docType, file);
        if (res.success) {
            rowEl.className = 'cd-lm-scan-row cd-lm-scan-done';
            statusEl.textContent = 'Uploaded — hidden from students until published.';
            await notify.alert('Uploaded — hidden from students until published.', { title: 'File Uploaded', type: 'success' });
        } else {
            btn.disabled = false;
            statusEl.textContent = res.message || 'Upload failed.';
            await notify.alert(res.message || 'Upload failed. Please try again.', { title: 'Upload Failed', type: 'error' });
        }
    });
}

function renderClassListResult(d) {
    const stats = [
        ['Students created',    d.created_students],
        ['Students updated',    d.updated_students],
        ['Instructors created', d.created_instructors],
        ['Instructors updated', d.updated_instructors],
        ['Newly enrolled',      d.enrolled_students],
        ['Already enrolled',    d.already_enrolled],
    ];
    const logRows = [
        ...(d.notes    || []).map(m => ({ cls: '',     m })),
        ...(d.warnings || []).map(m => ({ cls: 'warn', m })),
        ...(d.errors   || []).map(m => ({ cls: 'err',  m })),
    ];
    return `
        <div class="bi-alert bi-alert-success">
            Used row ${d.header_row || 1} as the column headers.
            Processed ${d.rows_processed} row${d.rows_processed !== 1 ? 's' : ''}
            ${d.rows_skipped_blank ? ` (${d.rows_skipped_blank} blank row${d.rows_skipped_blank !== 1 ? 's' : ''} skipped)` : ''}.
            Recognized columns: ${d.matched_columns?.length ? esc(d.matched_columns.join(', ')) : 'none'}.
        </div>
        <div class="bi-summary">
            ${stats.map(([label, val]) => `<div class="bi-stat"><strong>${val}</strong><span>${label}</span></div>`).join('')}
        </div>
        ${logRows.length ? `<div class="bi-log">${logRows.map(r => `<div class="bi-log-row ${r.cls}">${esc(r.m)}</div>`).join('')}</div>` : ''}
    `;
}

function pageCss() {
    return `
        .cd-page { padding:4px; max-width:none; }

        /* ── Hero — flat white card, black border, dark-green accents.
               No gradient, no decoration — same language as the
               gradebook's own .gb-hero banner. ── */
        .cd-hero { background:#fff; border:1.5px solid #111; border-radius:14px; padding:22px 26px; margin-bottom:20px; }
        .cd-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:20px;
            font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; background:#00461B; color:#fff; }
        .cd-hero h1 { font-size:24px; font-weight:800; color:#111; margin:10px 0 4px; }
        .cd-hero-sub { font-size:13.5px; color:#6B7280; margin:0; max-width:640px; line-height:1.5; }

        /* ── Tabs — plain underline tabs, dark-green when active ─────────── */
        .cd-tabs { display:flex; gap:4px; border-bottom:1.5px solid #111; margin-bottom:20px; }
        .cd-tab { display:inline-flex; align-items:center; gap:6px; background:none; border:none;
            padding:10px 16px; font-size:13.5px; font-weight:600; color:#6B7280; cursor:pointer;
            font-family:inherit; border-bottom:2.5px solid transparent; margin-bottom:-1.5px; transition:color .15s, border-color .15s; }
        .cd-tab:hover { color:#00461B; }
        .cd-tab.is-active { color:#00461B; border-bottom-color:#00461B; font-weight:700; }

        .cd-tab-sub { font-size:13px; color:#6B7280; line-height:1.6; margin:0 0 18px; max-width:760px; }

        /* ── Plain-language guide above each upload flow ──────────────── */
        .cd-guide { max-width:760px; margin:0 0 20px; }
        .cd-guide-lead { font-size:15px; color:#111; margin:0 0 6px; }
        .cd-guide-what { font-size:13px; color:#374151; line-height:1.6; margin:0 0 8px; }
        .cd-guide-when { display:flex; align-items:flex-start; gap:6px; font-size:12.5px; color:#00461B;
            line-height:1.55; margin:0 0 14px; }
        .cd-guide-when svg { flex-shrink:0; margin-top:2px; }
        .cd-steps { display:flex; flex-wrap:wrap; gap:8px; list-style:none; margin:0; padding:0; }
        .cd-steps li { display:flex; align-items:center; gap:7px; font-size:12.5px; color:#374151;
            background:#fff; border:1.5px solid #111; border-radius:8px; padding:7px 12px; }
        .cd-step-n { display:flex; align-items:center; justify-content:center; width:19px; height:19px;
            border-radius:50%; background:#00461B; color:#fff; font-size:11px; font-weight:800; flex-shrink:0; }

        /* ── Lesson Material tab ──────────────────────────────────────── */
        .cd-lm-top { display:flex; align-items:flex-start; justify-content:space-between; gap:20px;
            margin-bottom:20px; padding-bottom:18px; border-bottom:1.5px solid #E5E7EB; }
        .cd-lm-top-sub { margin:0; max-width:520px; }
        .cd-lm-browse-btn { display:inline-flex; align-items:center; gap:7px; flex-shrink:0; background:#00461B;
            color:#fff; border:none; padding:10px 18px; border-radius:9px; font-size:13px; font-weight:700;
            cursor:pointer; font-family:inherit; transition:background .15s; white-space:nowrap; }
        .cd-lm-browse-btn:hover { background:#006428; }
        .cd-lm-search { display:flex; align-items:center; gap:8px; border:1.5px solid #111; border-radius:10px;
            padding:10px 14px; margin-bottom:16px; max-width:420px; background:#fff; }
        .cd-lm-search svg { color:#6B7280; flex-shrink:0; }
        .cd-lm-search input { border:none; outline:none; font-size:13.5px; font-family:inherit; width:100%; color:#111; }
        .cd-lm-list { display:flex; flex-direction:column; gap:8px; }
        .cd-lm-row { display:flex; align-items:center; justify-content:space-between; gap:14px;
            border:1.5px solid #E5E7EB; border-radius:10px; padding:12px 16px; transition:border-color .15s, background .15s; }
        .cd-lm-row:hover { border-color:#00461B; background:#F8FDF9; }
        .cd-lm-info { display:flex; align-items:baseline; gap:10px; min-width:0; }
        .cd-lm-code { font-size:13px; font-weight:800; color:#00461B; flex-shrink:0; }
        .cd-lm-name { font-size:13.5px; color:#374151; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cd-lm-btn { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; background:#fff;
            border:1.5px solid #111; color:#111; padding:7px 14px; border-radius:8px; font-size:12.5px;
            font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s, color .15s; }
        .cd-lm-btn:hover { background:#111; color:#fff; }
        .cd-lm-loading, .cd-lm-empty { display:flex; align-items:center; justify-content:center; gap:8px;
            padding:32px; color:#6B7280; font-size:13px; }

        /* ── Scan & Upload ─────────────────────────────────────────────── */
        .cd-lm-scan { margin-bottom:28px; padding-bottom:24px; border-bottom:1.5px solid #E5E7EB; }
        .cd-lm-scan-h { display:flex; align-items:center; gap:7px; font-size:14px; font-weight:800; color:#111; margin:0 0 6px; }
        .cd-lm-scan-h svg { color:#00461B; }
        #cd-lm-dropzone { padding:22px 20px; }
        .cd-lm-scan-rows { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
        .cd-lm-scan-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 12px;
            border:1.5px solid #E5E7EB; border-radius:9px; font-size:12.5px; background:#fff; }
        .cd-lm-scan-row.cd-lm-scan-needs-review { border-color:#FCD34D; background:#FFFBEB; }
        .cd-lm-scan-row.cd-lm-scan-done { border-color:#00461B; background:#00461B; }
        .cd-lm-scan-row.cd-lm-scan-done .cd-lm-scan-name,
        .cd-lm-scan-row.cd-lm-scan-done .cd-lm-scan-status { color:#fff; }
        .cd-lm-scan-badge { display:inline-flex; align-items:center; gap:5px; background:#fff; color:#00461B;
            padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; flex-shrink:0; }
        .cd-lm-scan-name { font-weight:700; color:#111; flex:1 1 180px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cd-lm-scan-subject { flex:1 1 220px; min-width:160px; border:1px solid #E5E7EB; border-radius:6px;
            padding:5px 7px; font-size:12px; font-family:inherit; }
        .cd-lm-scan-module { width:70px; border:1px solid #E5E7EB; border-radius:6px; padding:5px 7px; font-size:12px; font-family:inherit; }
        .cd-lm-scan-type { border:1px solid #E5E7EB; border-radius:6px; padding:5px 7px; font-size:12px; font-family:inherit; }
        .cd-lm-scan-upload { display:inline-flex; align-items:center; gap:5px; background:#00461B; color:#fff;
            border:none; padding:6px 13px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; }
        .cd-lm-scan-upload:hover { background:#006428; }
        .cd-lm-scan-upload:disabled { opacity:.5; cursor:default; }
        .cd-lm-scan-status { flex-basis:100%; color:#6B7280; font-size:11.5px; }
        .cd-lm-scan-err { padding:10px 12px; border:1.5px solid #FCA5A5; background:#7F1D1D; color:#fff;
            border-radius:9px; font-size:12.5px; margin-bottom:8px; }
    `;
}
