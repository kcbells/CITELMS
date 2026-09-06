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

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}

let activeTab = 'density';

export async function render(container) {
    container.innerHTML = `
        <style>${pageCss()}${bulkImportCss()}</style>
        <div class="cd-page">
            <header class="cd-hero">
                <span class="cd-pill">${icon('cloudUpload', { size: 13, className: 'ui-icon-inline' })} Uploads</span>
                <h1>Uploads</h1>
                <p class="cd-hero-sub">Bulk-import class rosters, or enroll students from a registrar's class-list export.</p>
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
                <p class="cd-tab-sub">Upload one file to create/update instructor and student accounts, subjects,
                    sections, and class assignments in one pass — Excel, CSV/text, Word (.docx), or a clear photo of a table.</p>
                <div id="cd-import-host"></div>`;
            mountBulkImportUI(body.querySelector('#cd-import-host'));
        } else if (tab === 'material') {
            renderLessonMaterialTab(body);
        } else {
            body.innerHTML = `
                <p class="cd-tab-sub">Upload a class-list roster — each row already says which Subject and Section it
                    belongs to, so those must already exist in the system (Class List never creates subjects, sections,
                    or classes, only students and their enrollment).</p>
                <div id="cd-cl-import-host"></div>`;
            mountBulkImportUI(body.querySelector('#cd-cl-import-host'), {
                importAction: 'class-list-import',
                helpHtml: `
                    <ul>
                        <li>Accepted files: <strong>Excel (.xlsx)</strong>, <strong>CSV/text (.csv, .txt)</strong>,
                            a <strong>Word table (.docx)</strong>, or a clear <strong>photo (.jpg, .png)</strong></li>
                        <li>Built for a registrar-style export with columns like
                            <span class="bi-cols">Student ID &middot; Student Name &middot; Subject &middot; Section</span>
                            — plus optionally Campus/College, Course, Email, and more; anything not recognized is ignored</li>
                        <li>Each row's <strong>Subject</strong> (code or full name) and <strong>Section</strong> are matched
                            against classes that <strong>already exist</strong> — a row that can't be matched is skipped
                            and reported, never invented</li>
                        <li>Students without an account yet are created automatically with their <strong>Student ID as
                            the login ID</strong> and <strong>no password yet</strong> — same first-login flow as Class Density</li>
                    </ul>`,
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
        <div class="cd-lm-scan">
            <h3 class="cd-lm-scan-h">${icon('cloudUpload', { size: 15, className: 'ui-icon-inline' })} Scan &amp; Upload</h3>
            <p class="cd-tab-sub">Drop one or more Teaching Guide / Student Activity Sheet files — PDF, Word, Excel,
                or plain text — the system reads each file's own header ("Course Name" and "Module Number") to figure
                out which subject and module it belongs to and whether it's a Teaching Guide or an SAS, so you don't
                have to sort them by hand. Every upload starts <strong>hidden from students</strong> — the instructor,
                dean, or program head who teaches that subject decides when (or whether) to publish it, from the same
                document manager below.</p>
            <div class="bi-dropzone" id="cd-lm-dropzone">
                <input type="file" id="cd-lm-file-input" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" multiple hidden>
                <div class="bi-dz-icon">${icon('cloudUpload', { size: 24, className: 'ui-icon-inline' })}</div>
                <p class="bi-dz-title"><strong>Click to choose files</strong> or drag them here</p>
                <p class="bi-dz-hint">PDF, Word, Excel, or text &middot; any number at once</p>
            </div>
            <div id="cd-lm-scan-rows" class="cd-lm-scan-rows"></div>
        </div>

        <p class="cd-tab-sub">Or manage a subject's documents directly — upload, replace, publish, or schedule
            each module's Teaching Guide and Student Activity Sheet one at a time.</p>
        <div class="cd-lm-search">
            ${icon('search', { size: 14, className: 'ui-icon-inline' })}
            <input type="text" id="cd-lm-search" placeholder="Search by subject code or name…">
        </div>
        <div id="cd-lm-list" class="cd-lm-list">
            <div class="cd-lm-loading">${icon('cloudUpload', { size: 20, className: 'ui-icon-inline' })}<span>Loading subjects…</span></div>
        </div>`;

    if (!_lmSubjects) {
        // SubjectsAPI.php caps per_page at 200 server-side — plenty for the
        // current subject count; if the catalog ever grows past that, this
        // needs real pagination instead of one big fetch.
        const res = await Api.get('/SubjectsAPI.php?action=list&per_page=200');
        _lmSubjects = res.success ? (res.data || []) : [];
    }

    setupScanDropzone(body);

    const listEl = body.querySelector('#cd-lm-list');
    const searchEl = body.querySelector('#cd-lm-search');

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
    let debounce;
    searchEl.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => draw(searchEl.value), 200);
    });
}

// ── Scan & Upload — reads "Course Name" / "Module Number" out of each file ──
// so it lands in the right subject/module/doc-type slot without the admin
// sorting it by hand. Real text extraction covers PDF (text-based, no OCR —
// the reference Teaching Guide/SAS files are digitally generated, not scans)
// and plain text/CSV. Word/Excel files upload fine but skip auto-detection
// (no parser for those formats here) — they land in "needs review" for a
// quick manual subject/module/type pick instead of failing outright.
const SCAN_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|txt|csv)$/i;
const SCANNABLE_TEXT_RE = /\.(txt|csv)$/i;

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

/** Pulls the course code, module number, and doc type out of the header text. */
function detectDocInfo(text) {
    const courseMatch = text.match(/Course Name:\s*([A-Za-z]{2,6}\s?\d{2,4})/);
    const moduleMatch  = text.match(/Module Number:\s*(\d{1,2})/i);
    const head = text.slice(0, 400);
    const docType = /Teaching Guide/i.test(head) ? 'teaching_guide'
        : (/Student Activity Sheet/i.test(head) || /\bSAS\b/.test(head)) ? 'sas' : '';
    return {
        courseCode: courseMatch ? courseMatch[1].replace(/\s+/g, ' ').trim() : '',
        moduleNumber: moduleMatch ? parseInt(moduleMatch[1], 10) : null,
        docType,
    };
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

        let info = { courseCode: '', moduleNumber: null, docType: '' };
        if (isPdf) {
            try {
                info = detectDocInfo(await extractPdfHeaderText(file));
            } catch (err) {
                rowEl.querySelector('.cd-lm-scan-status').textContent = 'Could not read this PDF — is it a scanned image?';
                renderScanReviewRow(rowEl, file, info, null);
                continue;
            }
        } else if (isScannableText) {
            try {
                info = detectDocInfo(await readTextFile(file));
            } catch {
                // Fall through with blank info — still uploadable, just needs manual review.
            }
        }
        // Word/Excel files (.doc/.docx/.xls/.xlsx) have no in-browser text
        // extraction here, so info stays blank and the row asks for a manual pick.

        let matched = null;
        if (info.courseCode) {
            const m = await Api.get(`/ModuleDocumentsAPI.php?action=match_subject&code=${encodeURIComponent(info.courseCode)}`);
            if (m.success && m.data) matched = m.data;
        }

        renderScanReviewRow(rowEl, file, info, matched);
    }
}

function renderScanReviewRow(rowEl, file, info, matched) {
    const needsReview = !matched || !info.moduleNumber || !info.docType;
    rowEl.className = `cd-lm-scan-row${needsReview ? ' cd-lm-scan-needs-review' : ' cd-lm-scan-ready'}`;
    rowEl.innerHTML = `
        <span class="cd-lm-scan-name">${esc(file.name)}</span>
        <select class="cd-lm-scan-subject">${subjectOptionsHtml(matched?.subject_id)}</select>
        <input type="number" class="cd-lm-scan-module" min="1" max="14" placeholder="Module #" value="${info.moduleNumber || ''}">
        <select class="cd-lm-scan-type">
            <option value="teaching_guide" ${info.docType === 'teaching_guide' ? 'selected' : ''}>Teaching Guide</option>
            <option value="sas" ${info.docType === 'sas' ? 'selected' : ''}>Student Activity Sheet</option>
        </select>
        <button type="button" class="cd-lm-scan-upload">${icon('upload', { size: 12, className: 'ui-icon-inline' })} Upload</button>
        <span class="cd-lm-scan-status">${needsReview ? 'Needs review — check the fields above' : 'Detected — review and upload'}</span>`;

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
        const fd = new FormData();
        fd.append('subject_id', subjectId);
        fd.append('module_number', moduleNum);
        fd.append('doc_type', docType);
        fd.append('file', file);
        const res = await Api.postForm('/ModuleDocumentsAPI.php?action=upload', fd);
        if (res.success) {
            rowEl.className = 'cd-lm-scan-row cd-lm-scan-done';
            statusEl.textContent = 'Uploaded — hidden from students until published.';
        } else {
            btn.disabled = false;
            statusEl.textContent = res.message || 'Upload failed.';
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
        .cd-hero { margin-bottom:18px; }
        .cd-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:20px;
            font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; background:#E8F5EC; color:#00461B; }
        .cd-hero h1 { font-size:24px; font-weight:800; color:#111; margin:10px 0 4px; }
        .cd-hero-sub { font-size:13.5px; color:#6B7280; margin:0; max-width:640px; line-height:1.5; }

        .cd-tabs { display:flex; gap:4px; border-bottom:1.5px solid #E5E7EB; margin-bottom:20px; }
        .cd-tab { display:inline-flex; align-items:center; gap:6px; background:none; border:none;
            padding:10px 16px; font-size:13.5px; font-weight:600; color:#6B7280; cursor:pointer;
            font-family:inherit; border-bottom:2.5px solid transparent; margin-bottom:-1.5px; transition:color .15s, border-color .15s; }
        .cd-tab:hover { color:#00461B; }
        .cd-tab.is-active { color:#00461B; border-bottom-color:#00461B; }

        .cd-tab-sub { font-size:13px; color:#6B7280; line-height:1.6; margin:0 0 18px; max-width:760px; }

        /* ── Lesson Material tab ──────────────────────────────────────── */
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
        .cd-lm-scan-row.cd-lm-scan-ready { border-color:#A7D4B5; background:#F8FDF9; }
        .cd-lm-scan-row.cd-lm-scan-done { border-color:#00461B; background:#E8F5EC; }
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
        .cd-lm-scan-err { padding:10px 12px; border:1.5px solid #FCA5A5; background:#FEF2F2; color:#B91C1C;
            border-radius:9px; font-size:12.5px; margin-bottom:8px; }
    `;
}
