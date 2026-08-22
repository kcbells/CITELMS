/**
 * Shared Bulk Import UI — drag/drop .xlsx upload, a preview of what was
 * parsed, then the real import + result report. Talks to BulkImportAPI.php.
 * Used by:
 *   - the admin Users page's "Import Excel" modal
 *   - the admin "Class Density" nav page (dedicated full-page version)
 * Rendering the chrome (modal vs. page) is left to the caller — this only
 * owns the dropzone/preview/run-button/result markup and its wiring.
 */
import { Api, BASE_URL } from '../api.js';
import { notify } from '../utils/notify.js';
import { icon } from '../utils/icons.js';

const API_URL = BASE_URL + '/api';

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}

/**
 * Same request Api.postForm() makes (same headers, same JSON handling), but
 * via XMLHttpRequest instead of fetch — fetch has no way to observe upload
 * progress, XHR's `upload.onprogress` does. Used only for the real import
 * (the big write), so the admin sees an actual percentage while the file is
 * being sent instead of a plain spinner.
 *
 * `onUploadDone` fires from `xhr.upload`'s own `load` event, not from
 * spotting `onprogress` reach 100 — small files (the common case, especially
 * over localhost) can transfer in a single chunk with only one `progress`
 * event that never lands on exactly 100%, so waiting for that would mean
 * the "now processing on the server" phase silently never triggers. The
 * upload's `load` event is guaranteed to fire exactly once, right when the
 * browser has finished sending the request body, regardless of how (or
 * whether) intermediate progress ticks landed.
 *
 * The response body itself can also be a stream, not one final blob — the
 * server (see startProgressStream()/emitProgress() in BulkImportAPI.php)
 * writes newline-delimited JSON: zero or more {"type":"progress",...} lines
 * while it works through the rows, then exactly one final line with the
 * normal {success, message, data} shape. `xhr.onprogress` (the *download*
 * one, on `xhr` itself — distinct from `xhr.upload.onprogress` above) fires
 * as those bytes arrive, so `onRowProgress` can be driven off real row
 * counts instead of a fake animation. Endpoints that don't stream (preview,
 * or an error echoed before the loop starts) just arrive as a single line,
 * which resolves exactly like before.
 */
function postFormWithProgress(endpoint, formData, { onProgress, onUploadDone, onRowProgress } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL + endpoint);
        xhr.withCredentials = true;
        const headers = Api._authHeaders();
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.upload.onload = () => { onUploadDone?.(); };

        let linesConsumed = 0;
        let finalResult = null;
        const consumeLines = (allComplete) => {
            let body = xhr.responseText || '';
            if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1); // strip BOM
            const parts = body.split('\n');
            // Unless this is the final call, the last element is either '' (body
            // ended exactly on a newline) or a still-arriving partial line — either
            // way, don't treat it as complete yet.
            const complete = allComplete ? parts.filter(l => l.trim() !== '') : parts.slice(0, -1);
            for (let i = linesConsumed; i < complete.length; i++) {
                const line = complete[i].trim();
                if (!line) continue;
                let obj;
                try { obj = JSON.parse(line); } catch { continue; }
                if (obj.type === 'progress') onRowProgress?.(obj.done, obj.total);
                else finalResult = obj;
            }
            linesConsumed = complete.length;
        };

        xhr.onprogress = () => { if (onRowProgress) consumeLines(false); };
        xhr.onload = () => {
            consumeLines(true);
            if (finalResult) { resolve(finalResult); return; }
            let body = xhr.responseText || '';
            if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                console.error('[BulkImport] Non-JSON response:', body.slice(0, 300));
                resolve({ success: false, message: 'Server returned an invalid response. Please refresh and try again.' });
            }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
    });
}

/**
 * A small blocking modal shown for the duration of the real import — the
 * admin can't lose track of it behind a scrolled-past progress bar, and
 * can't accidentally click something else on the page mid-import. No close
 * button and clicking the backdrop does nothing while it's up; it closes
 * itself the moment the import finishes (see close()).
 */
function openImportProgressModal(fileName) {
    const overlay = document.createElement('div');
    overlay.id = 'bi-progress-overlay';
    overlay.innerHTML = `
        <div class="bi-pm-modal" role="alertdialog" aria-live="polite" aria-label="Importing file">
            <div class="bi-pm-spin"></div>
            <h3>Importing your file</h3>
            <p class="bi-pm-file">${esc(fileName)}</p>
            <div class="bi-progress-track"><div class="bi-progress-fill" id="bi-pm-fill"></div></div>
            <div class="bi-progress-label">
                <span id="bi-pm-phase">Uploading&hellip;</span>
                <span id="bi-pm-pct">0%</span>
            </div>
            <p class="bi-pm-hint">Please keep this tab open until it finishes.</p>
        </div>`;
    document.body.appendChild(overlay);

    const fill  = overlay.querySelector('#bi-pm-fill');
    const phase = overlay.querySelector('#bi-pm-phase');
    const pct   = overlay.querySelector('#bi-pm-pct');

    return {
        setProgress(p, label) {
            fill.classList.remove('bi-progress-indeterminate');
            fill.style.width = `${Math.max(0, Math.min(100, p))}%`;
            pct.textContent = `${p}%`;
            if (label) phase.textContent = label;
        },
        setIndeterminate(label) {
            fill.classList.add('bi-progress-indeterminate');
            phase.textContent = label;
            pct.textContent = '';
        },
        // Real per-row counts, once the server starts streaming progress —
        // replaces the "still working, no idea how far" indeterminate bar
        // with an actual "1,240 / 10,000 rows" readout.
        setRowProgress(done, total) {
            fill.classList.remove('bi-progress-indeterminate');
            fill.style.width = `${total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0}%`;
            phase.textContent = `Importing rows… ${done.toLocaleString()} / ${total.toLocaleString()}`;
            pct.textContent = total ? `${Math.round((done / total) * 100)}%` : '';
        },
        close() {
            overlay.remove();
        },
    };
}

/**
 * @param {HTMLElement} host  element to render into
 * @param {{ onImported?: (data: object) => void }} [opts]
 */
export function mountBulkImportUI(host, opts = {}) {
    // Class Density (default) creates/updates everything from one roster;
    // Class List (opts.importAction set) only ever enrolls students into a
    // class the caller already picked — same dropzone/preview/progress
    // chrome, different help text, import endpoint, extra POST fields, and
    // result summary.
    const importAction = opts.importAction || 'import';
    host.innerHTML = `
        <div class="bi-help">
            <button type="button" class="bi-help-toggle" id="bi-help-toggle">
                ${icon('document', { size: 14, className: 'ui-icon-inline' })}
                <span>File format &amp; how accounts are created</span>
                ${icon('chevronDown', { size: 14, className: 'ui-icon-inline bi-help-chevron' })}
            </button>
            <div class="bi-help-body" id="bi-help-body" hidden>
                ${opts.helpHtml || `
                <p>Upload one file — <strong>Excel (.xlsx), CSV/text (.csv, .txt), a Word document with a table (.docx),
                    or a clear photo of a printed table (.jpg, .png)</strong>. The system reads the header row and matches
                    whichever of these it finds — the rest are simply ignored:</p>
                <p class="bi-cols">Employee ID &middot; Email &middot; Student ID &middot; Email &middot; Name &middot; Section &middot;
                    Program/Course &middot; Department &middot; Subject Code &middot; Subject Name &middot; Subject Type &middot;
                    Lect Hrs &middot; Lab Hrs &middot; Lect Units &middot; Lab Units &middot; Units &middot; Capacity</p>
                <p>Accounts that don't exist yet are created automatically with <strong>Employee ID / Student ID as the login ID</strong>
                    and <strong>no password yet</strong> — the first time they sign in, they log in with just that ID (no password needed),
                    then are asked to set a real password, and their <strong>@phinmaed.com email</strong> too if the sheet didn't have one.</p>
                <p>If a sheet has one shared <strong>"ID"</strong> column instead of separate Employee ID / Student ID columns,
                    each row is sorted automatically: an ID with any <strong>letters</strong> in it (e.g. "T-2024-015") is treated
                    as an instructor, a <strong>numbers-only</strong> ID (e.g. "21-0001") is treated as a student.</p>
                <p>A <strong>photo</strong> is read with OCR (text recognition), which is never as reliable as a real file —
                    double-check the preview below carefully before importing one, especially ID numbers.</p>
                `}
            </div>
        </div>

        <div class="bi-dropzone" id="bi-dropzone">
            <!-- No "accept" filter — some Windows file pickers grey out or
                 hide files whose reported type doesn't exactly match a
                 narrow filter (a common surprise with .xlsx exported by
                 non-Excel tools), so anything can be picked or dropped here.
                 The server accepts .xlsx/.csv/.txt/.docx/.jpg/.jpeg/.png/
                 .bmp/.gif — anything else gets a clear "unsupported file
                 type" message instead of silently being unpickable. -->
            <input type="file" id="bi-file-input" hidden>
            <div id="bi-dropzone-empty">
                ${icon('cloudUpload', { size: 28, className: 'ui-icon-inline' })}
                <p><strong>Click to choose a file</strong> or drag it here</p>
                <p class="bi-dz-hint">Excel, CSV/text, Word, or a photo — up to 15MB</p>
            </div>
            <div id="bi-dropzone-file" style="display:none;">
                ${icon('document', { size: 18, className: 'ui-icon-inline' })}
                <span id="bi-file-name"></span>
                <button type="button" class="bi-file-clear" id="bi-file-clear">&times;</button>
            </div>
        </div>

        <div id="bi-preview"></div>

        <div class="bi-run-row">
            <button class="bi-run-btn" id="bi-run" disabled>${icon('upload', { size: 14, className: 'ui-icon-inline' })} Upload &amp; Import</button>
        </div>

        <div id="bi-result"></div>
        <style>${bulkImportCss()}</style>`;

    const dropzone   = host.querySelector('#bi-dropzone');
    const fileInput  = host.querySelector('#bi-file-input');
    const emptyState = host.querySelector('#bi-dropzone-empty');
    const fileState  = host.querySelector('#bi-dropzone-file');
    const fileNameEl = host.querySelector('#bi-file-name');
    const clearBtn   = host.querySelector('#bi-file-clear');
    const runBtn     = host.querySelector('#bi-run');
    const previewEl  = host.querySelector('#bi-preview');
    const resultEl   = host.querySelector('#bi-result');

    const helpToggle = host.querySelector('#bi-help-toggle');
    const helpBody   = host.querySelector('#bi-help-body');
    helpToggle.addEventListener('click', () => {
        const willOpen = helpBody.hidden;
        helpBody.hidden = !willOpen;
        helpToggle.classList.toggle('is-open', willOpen);
    });

    let selectedFile = null;
    let previewOk = false;

    const setFile = (file) => {
        selectedFile = file || null;
        previewOk = false;
        resultEl.innerHTML = '';
        runBtn.disabled = true;
        if (selectedFile) {
            fileNameEl.textContent = selectedFile.name;
            emptyState.style.display = 'none';
            fileState.style.display = 'flex';
            runPreview(selectedFile);
        } else {
            emptyState.style.display = '';
            fileState.style.display = 'none';
            previewEl.innerHTML = '';
        }
    };

    async function runPreview(file) {
        previewEl.innerHTML = `
            <div class="bi-preview-loading">
                <div class="bi-progress-track bi-progress-track-sm"><div class="bi-progress-fill" id="bi-prev-fill"></div></div>
                <span id="bi-prev-loading-label">Uploading… 0%</span>
            </div>`;
        const fill  = previewEl.querySelector('#bi-prev-fill');
        const label = previewEl.querySelector('#bi-prev-loading-label');

        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await postFormWithProgress('/BulkImportAPI.php?action=preview', fd, {
                onProgress: (pct) => {
                    fill.style.width = `${pct}%`;
                    label.textContent = `Uploading… ${pct}%`;
                },
                onUploadDone: () => {
                    fill.classList.add('bi-progress-indeterminate');
                    label.textContent = 'Reading file…';
                },
            });

            if (!res.success) {
                previewEl.innerHTML = `<div class="bi-alert bi-alert-error">${esc(res.message || 'Could not preview this file.')}</div>`;
                previewOk = false;
                runBtn.disabled = true;
                return;
            }

            previewEl.innerHTML = renderPreview(res.data);
            previewOk = true;
            runBtn.disabled = false;
        } catch (err) {
            console.error('Bulk import preview error:', err);
            previewEl.innerHTML = `<div class="bi-alert bi-alert-error">Connection error while previewing. Please try again.</div>`;
            previewOk = false;
            runBtn.disabled = true;
        }
    }

    dropzone.addEventListener('click', (e) => { if (e.target !== clearBtn) fileInput.click(); });
    fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.value = ''; setFile(null); });
    ['dragover', 'dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.toggle('bi-drag-over', evt === 'dragover');
            if (evt === 'drop' && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        });
    });

    runBtn.addEventListener('click', async () => {
        if (!selectedFile || !previewOk) return;

        // Caller-supplied gate — e.g. Class List requires a class to be
        // picked first. Returns a plain object of extra POST fields to send,
        // or a string error message to abort with instead.
        let extraFields = {};
        if (opts.extraFields) {
            const result = opts.extraFields();
            if (typeof result === 'string') {
                notify.error(result);
                return;
            }
            extraFields = result || {};
        }

        runBtn.disabled = true;
        runBtn.textContent = 'Importing…';
        resultEl.innerHTML = '';

        const modal = openImportProgressModal(selectedFile.name);

        try {
            const fd = new FormData();
            fd.append('file', selectedFile);
            Object.entries(extraFields).forEach(([k, v]) => fd.append(k, v));
            const res = await postFormWithProgress(`/BulkImportAPI.php?action=${importAction}`, fd, {
                onProgress: (pct) => modal.setProgress(pct, 'Uploading…'),
                // The file itself is fully sent — from here on the server is
                // parsing rows and writing to the database. Start on an
                // animated "still working" bar in case the file is small
                // enough that the first real row-progress line takes a
                // moment; setRowProgress (below) takes over the instant the
                // server's first {"type":"progress"} line arrives, swapping
                // this for an actual "1,240 / 10,000 rows" count.
                onUploadDone: () => modal.setIndeterminate('Processing rows…'),
                onRowProgress: (done, total) => modal.setRowProgress(done, total),
            });

            // Bypassing Api.postForm() for the progress events above means its
            // usual auto-invalidation doesn't run — do it ourselves so stale
            // Users/Dashboard data doesn't linger after a bulk write. Every
            // import here creates/updates accounts (instructors, students, or
            // both), so the admin Users page's cached ?action=list must be
            // purged too — otherwise "just uploaded, but the new accounts
            // aren't in the Users table yet" for up to the cache's 45s TTL.
            Api.invalidate('BulkImportAPI');
            Api.invalidate('UsersAPI');
            Api.invalidate('DashboardAPI');

            if (!res.success) {
                resultEl.innerHTML = `<div class="bi-alert bi-alert-error">${esc(res.message || 'Import failed.')}</div>`;
                return;
            }

            resultEl.innerHTML = (opts.renderResult || renderImportResult)(res.data);
            notify.success('Import finished.');
            opts.onImported?.(res.data);
        } catch (err) {
            console.error('Bulk import error:', err);
            resultEl.innerHTML = `<div class="bi-alert bi-alert-error">Connection error. Please try again.</div>`;
        } finally {
            modal.close();
            runBtn.innerHTML = `${icon('upload', { size: 14, className: 'ui-icon-inline' })} Upload &amp; Import`;
            setFile(null);
            fileInput.value = '';
        }
    });
}

/** Shows what the parser actually detected — before anything is written to the database. */
function renderPreview(d) {
    if (!d.columns.length) {
        return `<div class="bi-alert bi-alert-error">No recognizable columns found.</div>`;
    }

    const colHeaders = d.columns.map(c => `<th>${esc(c.label)}<span class="bi-prev-sheethdr">${esc(c.sheet_header)}</span></th>`).join('');
    const bodyRows = d.sample_rows.map(row => `
        <tr>${d.columns.map(c => `<td>${esc(row[c.field] ?? '')}</td>`).join('')}</tr>
    `).join('');

    return `
        ${d.is_ocr ? `
        <div class="bi-alert bi-alert-warn">
            ${icon('warning', { size: 14, className: 'ui-icon-inline' })}
            This was read from a <strong>photo using OCR</strong>, which can misread characters (especially in ID numbers).
            Check every row below carefully before importing.
        </div>` : ''}
        <div class="bi-alert bi-alert-success">
            Used row ${d.header_row} as the column headers &middot; recognized ${d.columns.length} column${d.columns.length !== 1 ? 's' : ''}
            &middot; ${d.total_data_rows} data row${d.total_data_rows !== 1 ? 's' : ''} found.
        </div>
        <div class="bi-preview-tablewrap">
            <table class="bi-preview-table">
                <thead><tr>${colHeaders}</tr></thead>
                <tbody>${bodyRows || `<tr><td colspan="${d.columns.length}" class="bi-prev-empty">No data rows to preview.</td></tr>`}</tbody>
            </table>
        </div>
        ${d.sample_rows.length < d.total_data_rows ? `<p class="bi-prev-more">Showing first ${d.sample_rows.length} of ${d.total_data_rows} rows.</p>` : ''}
        <p class="bi-prev-hint">Looks right? Click <strong>Upload &amp; Import</strong> below to commit these changes.</p>
    `;
}

function renderImportResult(d) {
    const stats = [
        ['Instructors created', d.created_instructors], ['Instructors updated', d.updated_instructors],
        ['Students created',    d.created_students],    ['Students updated',    d.updated_students],
        ['Subjects created',    d.created_subjects],     ['Subjects updated',    d.updated_subjects],
        ['Sections created',    d.created_sections],
        ['Classes linked',      d.linked_offerings],     ['Students enrolled',   d.enrolled_students],
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
            Recognized columns: ${d.matched_columns.length ? esc(d.matched_columns.join(', ')) : 'none'}.
        </div>
        <div class="bi-summary">
            ${stats.map(([label, val]) => `<div class="bi-stat"><strong>${val}</strong><span>${label}</span></div>`).join('')}
        </div>
        ${logRows.length ? `<div class="bi-log">${logRows.map(r => `<div class="bi-log-row ${r.cls}">${esc(r.m)}</div>`).join('')}</div>` : ''}
    `;
}

export function bulkImportCss() {
    return `
        .bi-help { background:#F8FDF9; border:1px solid #C5D9CB; border-radius:10px; margin-bottom:16px; overflow:hidden; }
        .bi-help-toggle { display:flex; align-items:center; gap:8px; width:100%; background:none; border:none;
            padding:12px 14px; font-size:12.5px; font-weight:700; color:#00461B; cursor:pointer; font-family:inherit; }
        .bi-help-toggle:hover { background:rgba(0,70,27,.04); }
        .bi-help-toggle svg:first-child { color:#00461B; flex-shrink:0; }
        .bi-help-toggle span { flex:1; text-align:left; }
        .bi-help-chevron { transition:transform .15s; flex-shrink:0; color:#5B8A6B; }
        .bi-help-toggle.is-open .bi-help-chevron { transform:rotate(180deg); }
        .bi-help-body { padding:0 14px 14px; border-top:1px solid #E1EFE4; margin-top:0; }
        .bi-help-body p { font-size:12.5px; color:#374151; line-height:1.6; margin:12px 0 8px; }
        .bi-help-body p:first-child { margin-top:12px; }
        .bi-help-body p:last-child { margin-bottom:0; }
        .bi-cols { color:#00461B !important; font-weight:600; }
        .bi-dropzone { border:2px dashed #d1d5db; border-radius:12px; padding:24px; text-align:center; cursor:pointer; transition:border-color .15s, background .15s; }
        .bi-dropzone:hover, .bi-dropzone.bi-drag-over { border-color:#00461B; background:#F8FDF9; }
        .bi-dropzone svg { color:#00461B; margin-bottom:6px; }
        .bi-dropzone p { margin:2px 0; font-size:13px; color:#374151; }
        .bi-dz-hint { color:#9ca3af !important; font-size:11.5px !important; }
        #bi-dropzone-file { display:flex; align-items:center; justify-content:center; gap:8px; font-size:13px; color:#00461B; font-weight:600; }
        .bi-file-clear { background:none; border:none; font-size:18px; cursor:pointer; color:#9ca3af; line-height:1; padding:0 4px; }
        .bi-run-row { display:flex; justify-content:flex-end; margin-top:14px; }
        .bi-run-btn { display:inline-flex; align-items:center; gap:6px; background:#00461B; color:#fff; border:none;
            padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; font-family:inherit; }
        .bi-run-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }
        .bi-run-btn:disabled { opacity:.5; cursor:not-allowed; }
        #bi-result { margin-top:16px; }
        #bi-preview { margin-top:16px; }

        /* ── Import progress modal ─────────────────────────────────────── */
        #bi-progress-overlay { position:fixed; inset:0; background:rgba(15,23,20,.5); z-index:9999;
            display:flex; align-items:center; justify-content:center; padding:20px; animation:biFadeIn .15s ease; }
        @keyframes biFadeIn { from { opacity:0; } to { opacity:1; } }
        .bi-pm-modal { background:#fff; border-radius:16px; width:100%; max-width:360px; padding:28px 26px 24px;
            box-shadow:0 20px 60px rgba(0,0,0,.3); text-align:center; }
        .bi-pm-spin { width:32px; height:32px; margin:0 auto 14px; border:3px solid #E5E7EB; border-top-color:#00461B;
            border-radius:50%; animation:biSpin .8s linear infinite; }
        .bi-pm-modal h3 { margin:0 0 4px; font-size:16px; font-weight:800; color:#111; }
        .bi-pm-file { margin:0 0 18px; font-size:12.5px; color:#6B7280; word-break:break-all; }
        .bi-pm-hint { margin:12px 0 0; font-size:11px; color:#9CA3AF; }
        .bi-progress-track { height:8px; border-radius:6px; background:#E5E7EB; overflow:hidden; position:relative; }
        .bi-progress-fill { height:100%; width:0%; background:#00461B; border-radius:6px; transition:width .2s ease; }
        .bi-progress-fill.bi-progress-indeterminate {
            width:35% !important; position:absolute; top:0; bottom:0;
            animation: biProgressSlide 1.1s ease-in-out infinite;
        }
        @keyframes biProgressSlide { 0% { left:-35%; } 100% { left:100%; } }
        .bi-progress-label { display:flex; justify-content:space-between; margin-top:7px; font-size:11.5px;
            color:#9CA3AF; font-variant-numeric:tabular-nums; }
        .bi-preview-loading { padding:14px 2px; }
        .bi-preview-loading .bi-progress-track-sm { height:6px; }
        .bi-preview-loading span { display:block; margin-top:7px; font-size:11.5px; color:#6B7280; font-variant-numeric:tabular-nums; }
        .bi-spin { width:16px; height:16px; border:2px solid #eee; border-top-color:#00461B; border-radius:50%; animation:biSpin .75s linear infinite; flex-shrink:0; }
        @keyframes biSpin { to { transform:rotate(360deg); } }
        .bi-alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
        .bi-alert-success { background:#E8F5E9; color:#1B4D3E; border:1px solid #A7F3D0; }
        .bi-alert-error { background:#FEE2E2; color:#b91c1c; border:1px solid #FECACA; }
        .bi-alert-warn { background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; }
        .bi-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:12px; }
        .bi-stat { background:#F8FDF9; border:1px solid #E5E7EB; border-radius:8px; padding:8px 10px; text-align:center; }
        .bi-stat strong { display:block; font-size:18px; color:#00461B; }
        .bi-stat span { font-size:10.5px; color:#6B7280; text-transform:uppercase; letter-spacing:.3px; }
        .bi-log { max-height:220px; overflow-y:auto; border:1px solid #E5E7EB; border-radius:8px; padding:8px 10px; font-size:12px; }
        .bi-log-row { padding:3px 0; border-bottom:1px solid #F3F4F6; }
        .bi-log-row:last-child { border-bottom:none; }
        .bi-log-row.warn { color:#B45309; }
        .bi-log-row.err { color:#B91C1C; }

        .bi-preview-tablewrap { overflow-x:auto; border:1px solid #E5E7EB; border-radius:10px; max-height:320px; overflow-y:auto; }
        .bi-preview-table { width:100%; border-collapse:collapse; font-size:12.5px; white-space:nowrap; }
        .bi-preview-table th { position:sticky; top:0; background:#F8FDF9; color:#00461B; text-align:left;
            padding:8px 12px; border-bottom:2px solid #C5D9CB; font-weight:700; }
        .bi-prev-sheethdr { display:block; font-size:10px; font-weight:500; color:#9CA3AF; text-transform:none; margin-top:2px; }
        .bi-preview-table td { padding:7px 12px; border-bottom:1px solid #F3F4F6; color:#374151; }
        .bi-preview-table tbody tr:hover td { background:#FAFBFC; }
        .bi-prev-empty { text-align:center; color:#9CA3AF; padding:20px !important; }
        .bi-prev-more { font-size:11.5px; color:#9CA3AF; margin:6px 2px 0; }
        .bi-prev-hint { font-size:12.5px; color:#00461B; font-weight:600; margin:10px 2px 0; }
    `;
}
