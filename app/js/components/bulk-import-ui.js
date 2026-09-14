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

import { esc } from '../utils/classroom-ui.js';
const API_URL = BASE_URL + '/api';

// esc() imported from classroom-ui.js (see import above)


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
function openImportProgressModal(fileName, opts = {}) {
    const overlay = document.createElement('div');
    overlay.id = 'bi-progress-overlay';
    overlay.innerHTML = `
        <div class="bi-pm-modal" role="alertdialog" aria-live="polite" aria-label="${esc(opts.title || 'Importing file')}">
            ${scanBoxHtml('bi-pm-scan')}
            <h3 id="bi-pm-title">${esc(opts.title || 'Importing your file')}</h3>
            <p class="bi-pm-file">${esc(fileName)}</p>
            <div class="bi-progress-track"><div class="bi-progress-fill" id="bi-pm-fill"></div></div>
            <div class="bi-progress-label">
                <span id="bi-pm-phase">Uploading&hellip;</span>
                <span id="bi-pm-pct">0%</span>
            </div>
            <p class="bi-pm-hint" id="bi-pm-hint">${esc(opts.hint || 'Please keep this tab open until it finishes.')}</p>
        </div>`;
    document.body.appendChild(overlay);

    const fill  = overlay.querySelector('#bi-pm-fill');
    const phase = overlay.querySelector('#bi-pm-phase');
    const pct   = overlay.querySelector('#bi-pm-pct');
    const scan  = overlay.querySelector('#bi-pm-scan');
    const title = overlay.querySelector('#bi-pm-title');
    const hint  = overlay.querySelector('#bi-pm-hint');

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
        // Swaps the scanning beam for a drawn-in checkmark and holds the
        // modal open briefly — a beat of visible confirmation that the scan
        // finished, before it closes and the fuller result summary appears.
        async showSuccess(counts) {
            scan.innerHTML = successCheckHtml();
            fill.style.width = '100%';
            fill.classList.remove('bi-progress-indeterminate');
            title.textContent = 'Import complete';
            phase.textContent = counts?.total ? `${counts.done.toLocaleString()} / ${counts.total.toLocaleString()} rows` : 'Done';
            pct.textContent = '100%';
            hint.textContent = 'Finishing up…';
            await new Promise(r => setTimeout(r, 750));
        },
        close() {
            overlay.remove();
        },
    };
}

/** A QR-scanner-style viewfinder (corner brackets) around a document, with a bright green laser line sweeping across it on loop. */
function scanBoxHtml(id) {
    return `
        <div class="bi-scan-box" id="${id}">
            <div class="bi-scan-frame">
                <span class="bi-scan-corner bi-scan-corner-tl"></span>
                <span class="bi-scan-corner bi-scan-corner-tr"></span>
                <span class="bi-scan-corner bi-scan-corner-bl"></span>
                <span class="bi-scan-corner bi-scan-corner-br"></span>
                <div class="bi-scan-doc">
                    <div class="bi-scan-doc-fold"></div>
                    <span class="bi-scan-doc-line"></span>
                    <span class="bi-scan-doc-line"></span>
                    <span class="bi-scan-doc-line"></span>
                    <span class="bi-scan-doc-line bi-scan-doc-line-short"></span>
                    <div class="bi-scan-beam"></div>
                </div>
            </div>
        </div>`;
}

/**
 * A dedicated "Import Successful" modal — big drawn-in checkmark, the same
 * size/weight as the scan popup it follows, with the real created/updated
 * counts right in it instead of a plain one-line alert. Resolves when
 * dismissed (OK, backdrop click, or Escape) — same contract as notify.alert.
 */
function openImportSuccessModal(data, { hasErrors = false } = {}) {
    const allStats = [
        ['Instructors created', data.created_instructors], ['Instructors updated', data.updated_instructors],
        ['Students created',    data.created_students],    ['Students updated',    data.updated_students],
        ['Subjects created',    data.created_subjects],     ['Subjects updated',    data.updated_subjects],
        ['Sections created',    data.created_sections],
        ['Classes linked',      data.linked_offerings],     ['Students enrolled',   data.enrolled_students],
    ].filter(([, val]) => val > 0);

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'bi-success-overlay';
        overlay.innerHTML = `
            <div class="bi-pm-modal" role="alertdialog" aria-modal="true" aria-label="${hasErrors ? 'Import finished, with errors' : 'Import successful'}">
                <svg class="bi-check-svg" viewBox="0 0 52 52">
                    <circle class="bi-check-circle" cx="26" cy="26" r="23" fill="none"/>
                    <path class="bi-check-mark" fill="none" d="M15 27l7.5 7.5L37 18"/>
                </svg>
                <h3>${hasErrors ? 'Import Finished, With Errors' : 'Import Successful'}</h3>
                <p class="bi-pm-file">${hasErrors
                    ? `${esc(String(data.errors?.length || 0))} row error${(data.errors?.length || 0) !== 1 ? 's' : ''} — see the log below for details.`
                    : `Processed ${esc(String(data.rows_processed ?? 0))} row${data.rows_processed === 1 ? '' : 's'} successfully.`}</p>
                ${allStats.length ? `<div class="bi-success-stats">${allStats.map(([label, val]) => `
                    <div class="bi-stat"><strong>${val}</strong><span>${esc(label)}</span></div>
                `).join('')}</div>` : ''}
                <button type="button" class="bi-run-btn bi-success-ok" id="bi-success-ok">OK</button>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => { overlay.remove(); resolve(); };
        overlay.querySelector('#bi-success-ok').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { document.removeEventListener('keydown', onKey); close(); } };
        document.addEventListener('keydown', onKey);
    });
}

/** A dark-green circle+checkmark that draws itself in — shown once a scan/import finishes. */
function successCheckHtml() {
    return `
        <svg class="bi-check-svg" viewBox="0 0 52 52">
            <circle class="bi-check-circle" cx="26" cy="26" r="23" fill="none"/>
            <path class="bi-check-mark" fill="none" d="M15 27l7.5 7.5L37 18"/>
        </svg>`;
}

/**
 * @param {HTMLElement} host  element to render into
 * @param {{ onImported?: (data: object) => void }} [opts]
 */
export function mountBulkImportUI(host, opts = {}) {
    // Class Density (default) creates/updates everything from one roster;
    // Class List (opts.importAction set) only ever enrolls students into a
    // class the caller already picked — same dropzone/preview/progress
    // chrome, different import endpoint, extra POST fields, and
    // result summary.
    const importAction = opts.importAction || 'import';
    host.innerHTML = `
        <div class="bi-layout">

            <div class="bi-main">
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
                        <div class="bi-dz-icon">${icon('cloudUpload', { size: 24, className: 'ui-icon-inline' })}</div>
                        <p class="bi-dz-title"><strong>Click to choose a file</strong> or drag it here</p>
                        <p class="bi-dz-hint">Excel, CSV/text, Word, or a photo &middot; up to 15MB</p>
                    </div>
                    <div id="bi-dropzone-file" style="display:none;">
                        <div class="bi-dz-file-icon">${icon('document', { size: 18, className: 'ui-icon-inline' })}</div>
                        <span id="bi-file-name"></span>
                        <button type="button" class="bi-file-clear" id="bi-file-clear" title="Remove file">${icon('close', { size: 13, className: 'ui-icon-inline' })}</button>
                    </div>
                </div>

                <div id="bi-preview"></div>

                <div class="bi-run-row">
                    <button class="bi-run-btn" id="bi-run" disabled>${icon('upload', { size: 14, className: 'ui-icon-inline' })} Upload &amp; Import</button>
                </div>

                <div id="bi-result"></div>
            </div>
        </div>
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

    let selectedFile = null;
    let previewOk = false;
    let knownTotalRows = 0; // from the preview response — lets the import step show a real "0 / N" the instant it starts, instead of waiting on the first streamed progress line (which can arrive too late to see on a fast/small import)

    const setFile = (file) => {
        selectedFile = file || null;
        previewOk = false;
        knownTotalRows = 0;
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
        previewEl.innerHTML = '';
        const modal = openImportProgressModal(file.name, { title: 'Reading your file', hint: 'Scanning for columns we recognize…' });

        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await postFormWithProgress('/BulkImportAPI.php?action=preview', fd, {
                onProgress: (pct) => modal.setProgress(pct, 'Uploading…'),
                onUploadDone: () => modal.setIndeterminate('Reading file…'),
            });
            modal.close();

            if (!res.success) {
                previewEl.innerHTML = `<div class="bi-alert bi-alert-error">${esc(res.message || 'Could not preview this file.')}</div>`;
                previewOk = false;
                runBtn.disabled = true;
                return;
            }

            previewEl.innerHTML = renderPreview(res.data);
            previewOk = true;
            knownTotalRows = res.data.total_data_rows || 0;
            runBtn.disabled = false;
        } catch (err) {
            console.error('Bulk import preview error:', err);
            modal.close();
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
        let lastRowProgress = null;

        try {
            const fd = new FormData();
            fd.append('file', selectedFile);
            Object.entries(extraFields).forEach(([k, v]) => fd.append(k, v));
            const res = await postFormWithProgress(`/BulkImportAPI.php?action=${importAction}`, fd, {
                onProgress: (pct) => modal.setProgress(pct, 'Uploading…'),
                // The file itself is fully sent — from here on the server is
                // parsing rows and writing to the database. We already know
                // the row count from the preview step, so show "0 / N" right
                // away instead of a vague "Processing rows…" — a fast/small
                // import can finish before the first real streamed progress
                // line ever reaches the browser, and this way there's always
                // a real count on screen, not just an animation.
                onUploadDone: () => knownTotalRows > 0 ? modal.setRowProgress(0, knownTotalRows) : modal.setIndeterminate('Processing rows…'),
                onRowProgress: (done, total) => { lastRowProgress = { done, total }; modal.setRowProgress(done, total); },
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
                modal.close(); // no success beat on failure — straight to the error
                resultEl.innerHTML = `<div class="bi-alert bi-alert-error">${esc(res.message || 'Import failed.')}</div>`;
                await notify.alert(res.message || 'Import failed. Please check the file and try again.', { title: 'Import Failed', type: 'error' });
                return;
            }

            // Prefer the last real streamed count; fall back to the known
            // preview total paired with the server's final processed count —
            // covers the fast-import case where no progress line ever arrived.
            const finalCounts = lastRowProgress || (knownTotalRows ? { done: res.data.rows_processed ?? knownTotalRows, total: knownTotalRows } : null);
            await modal.showSuccess(finalCounts); // brief scan-complete checkmark before the modal closes
            modal.close();

            resultEl.innerHTML = (opts.renderResult || renderImportResult)(res.data);
            attachUndoButton(resultEl, res.data.batch_id);
            // A completed import always gets its own centered confirmation —
            // not just a corner toast — since it's a real write to the
            // database the admin needs to consciously register, success or
            // failure, the same indicator used for every upload in the system.
            const errCount = res.data.errors?.length || 0;
            await openImportSuccessModal(res.data, { hasErrors: errCount > 0 });
            opts.onImported?.(res.data);
        } catch (err) {
            console.error('Bulk import error:', err);
            modal.close();
            resultEl.innerHTML = `<div class="bi-alert bi-alert-error">Connection error. Please try again.</div>`;
            await notify.alert('Connection error while importing. Please try again.', { title: 'Import Failed', type: 'error' });
        } finally {
            modal.close(); // no-op if already closed above — safe to call twice
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

/** Appends an "Undo this import" control after a successful run — removes
 *  only what THIS run created (see BulkImportAPI.php's handleUndoImport()
 *  doc comment); anything it merely updated, or any manually-created
 *  account/subject/section/enrollment, is never touched. */
function attachUndoButton(resultEl, batchId) {
    if (!batchId) return;
    resultEl.insertAdjacentHTML('beforeend', `
        <div class="bi-undo-row">
            <button type="button" class="bi-undo-btn" id="bi-undo-btn">
                ${icon('close', { size: 12, className: 'ui-icon-inline' })} Undo this import
            </button>
        </div>`);
    const btn = resultEl.querySelector('#bi-undo-btn');
    btn.addEventListener('click', async () => {
        const ok = await notify.confirm(
            'This removes only what this import just created — new accounts, subjects, sections, and enrollments. ' +
            'Anything it merely updated (an existing account gaining a missing email, etc.) is left as-is, and a ' +
            'record still in use elsewhere is kept and reported instead of being force-removed.',
            { title: 'Undo this import?', confirmText: 'Undo Import', danger: true }
        );
        if (!ok) return;
        btn.disabled = true;
        btn.textContent = 'Undoing…';
        const res = await Api.post('/BulkImportAPI.php?action=undo_import', { batch_id: batchId });
        if (res.success) {
            Api.invalidate('BulkImportAPI'); Api.invalidate('UsersAPI'); Api.invalidate('DashboardAPI');
            const { removed_count, kept_count } = res.data;
            notify.success(`Undone — removed ${removed_count} record${removed_count !== 1 ? 's' : ''}` +
                (kept_count ? `, kept ${kept_count} still in use elsewhere.` : '.'));
            resultEl.innerHTML = '';
        } else {
            notify.error(res.message || 'Undo failed.');
            btn.disabled = false;
            btn.innerHTML = `${icon('close', { size: 12, className: 'ui-icon-inline' })} Undo this import`;
        }
    });
}

export function bulkImportCss() {
    return `
        /* ── Layout ───────────────────────────────────────────────────────── */
        .bi-layout { display:flex; align-items:flex-start; gap:16px; }
        .bi-main { flex:1 1 auto; min-width:0; }


        /* ── Dropzone ─────────────────────────────────────────────────── */
        .bi-dropzone { border:2px dashed #111; border-radius:14px; padding:34px 24px; text-align:center;
            cursor:pointer; background:#FAFAFA; transition:border-color .15s, border-style .15s, background .15s, box-shadow .15s; }
        .bi-dropzone:hover { border-color:#00461B; background:#F8FDF9; }
        .bi-dropzone.bi-drag-over { border-style:solid; border-color:#00461B; background:#F8FDF9;
            box-shadow:0 0 0 4px rgba(0,70,27,.1); }
        .bi-dz-icon { width:52px; height:52px; margin:0 auto 14px; display:flex; align-items:center; justify-content:center;
            background:#111; border-radius:50%; transition:background .15s; }
        .bi-dz-icon svg { color:#fff; }
        .bi-dropzone:hover .bi-dz-icon, .bi-dropzone.bi-drag-over .bi-dz-icon { background:#00461B; }
        .bi-dz-title { margin:0 0 4px; font-size:14.5px; color:#111; }
        .bi-dz-title strong { font-weight:700; }
        .bi-dz-hint { color:#6B7280 !important; font-size:12px !important; margin:0 !important; }
        #bi-dropzone-file { display:flex; align-items:center; justify-content:center; gap:10px; }
        .bi-dz-file-icon { width:34px; height:34px; border-radius:9px; background:#00461B; color:#fff;
            display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #bi-file-name { font-size:13.5px; color:#111; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:320px; }
        .bi-file-clear { display:flex; align-items:center; justify-content:center; width:24px; height:24px;
            background:#fff; border:1.5px solid #111; border-radius:50%; cursor:pointer; color:#111; padding:0; flex-shrink:0; transition:background .15s, color .15s; }
        .bi-file-clear:hover { background:#111; color:#fff; }
        .bi-run-row { display:flex; justify-content:flex-end; margin-top:14px; }
        .bi-run-btn { display:inline-flex; align-items:center; gap:6px; background:#00461B; color:#fff; border:none;
            padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; font-family:inherit; }
        .bi-run-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }
        .bi-run-btn:disabled { opacity:.5; cursor:not-allowed; }
        #bi-result { margin-top:16px; }
        #bi-preview { margin-top:16px; }

        /* ── Import progress + success modals ──────────────────────────── */
        #bi-progress-overlay, #bi-success-overlay { position:fixed; inset:0; background:rgba(15,23,20,.5); z-index:9999;
            display:flex; align-items:center; justify-content:center; padding:20px; animation:biFadeIn .15s ease; }
        @keyframes biFadeIn { from { opacity:0; } to { opacity:1; } }
        .bi-pm-modal { background:#fff; border-radius:20px; width:100%; max-width:420px; padding:40px 32px 28px;
            box-shadow:0 20px 60px rgba(0,0,0,.3); text-align:center; }
        .bi-pm-modal h3 { margin:0 0 4px; font-size:19px; font-weight:800; color:#111; }
        .bi-pm-file { margin:0 0 22px; font-size:13px; color:#6B7280; word-break:break-all; }
        .bi-pm-hint { margin:12px 0 0; font-size:11px; color:#9CA3AF; }
        .bi-success-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px;
            margin:4px 0 22px; text-align:left; }
        .bi-success-ok { width:100%; justify-content:center; }
        .bi-progress-track { height:8px; border-radius:6px; background:#E5E7EB; overflow:hidden; position:relative; }
        .bi-progress-fill { height:100%; width:0%; background:#00461B; border-radius:6px; transition:width .2s ease; }
        .bi-progress-fill.bi-progress-indeterminate {
            width:35% !important; position:absolute; top:0; bottom:0;
            animation: biProgressSlide 1.1s ease-in-out infinite;
        }
        @keyframes biProgressSlide { 0% { left:-35%; } 100% { left:100%; } }
        .bi-progress-label { display:flex; justify-content:space-between; margin-top:7px; font-size:11.5px;
            color:#9CA3AF; font-variant-numeric:tabular-nums; }
        /* ── Scan animation — a QR-scanner-style viewfinder around a document, ──
           a bright laser line sweeping across it on loop */
        .bi-scan-box { width:140px; height:140px; margin:0 auto 22px; display:flex; align-items:center; justify-content:center; }
        .bi-scan-frame { position:relative; width:140px; height:140px; display:flex; align-items:center; justify-content:center; }
        .bi-scan-corner { position:absolute; width:22px; height:22px; border:3px solid #00461B; }
        .bi-scan-corner-tl { top:0;    left:0;   border-right:none;  border-bottom:none; border-radius:6px 0 0 0; }
        .bi-scan-corner-tr { top:0;    right:0;  border-left:none;   border-bottom:none; border-radius:0 6px 0 0; }
        .bi-scan-corner-bl { bottom:0; left:0;   border-right:none;  border-top:none;    border-radius:0 0 0 6px; }
        .bi-scan-corner-br { bottom:0; right:0;  border-left:none;   border-top:none;    border-radius:0 0 6px 0; }
        .bi-scan-doc { position:relative; width:84px; height:104px; background:#fff; border:1.5px solid #111;
            border-radius:5px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,.15); }
        .bi-scan-doc-fold { position:absolute; top:0; right:0; width:0; height:0;
            border-style:solid; border-width:0 14px 14px 0; border-color:transparent #E5E7EB transparent transparent; }
        .bi-scan-doc-line { display:block; height:3px; background:#D1D5DB; border-radius:2px; margin:14px 14px 0; }
        .bi-scan-doc-line-short { width:45%; }
        .bi-scan-beam { position:absolute; left:2px; right:2px; top:0; height:2.5px; border-radius:2px;
            background:#00461B; box-shadow:0 0 6px 1.5px #00461B, 0 0 16px 4px rgba(0,70,27,.75);
            animation: biScanSweep 1.6s cubic-bezier(.45,0,.55,1) infinite; }
        @keyframes biScanSweep { 0% { top:0; } 50% { top:calc(100% - 3px); } 100% { top:0; } }

        /* ── Success checkmark — draws itself in once a scan/import finishes ── */
        .bi-check-svg { width:92px; height:92px; display:block; margin:0 auto; }
        /* Success modal only — the scan box centres its own copy via flex, so
           the extra bottom gap belongs just to the standalone one. */
        .bi-pm-modal > .bi-check-svg { margin-bottom:18px; }
        .bi-check-circle { stroke:#00461B; stroke-width:3; stroke-miterlimit:10;
            stroke-dasharray:145; stroke-dashoffset:145; animation:biCheckCircle .5s ease-out forwards; }
        .bi-check-mark { stroke:#00461B; stroke-width:4; stroke-linecap:round; stroke-linejoin:round;
            stroke-dasharray:32; stroke-dashoffset:32; animation:biCheckMark .3s .4s ease-out forwards; }
        @keyframes biCheckCircle { to { stroke-dashoffset:0; } }
        @keyframes biCheckMark { to { stroke-dashoffset:0; } }
        .bi-spin { width:16px; height:16px; border:2px solid #eee; border-top-color:#00461B; border-radius:50%; animation:biSpin .75s linear infinite; flex-shrink:0; }
        @keyframes biSpin { to { transform:rotate(360deg); } }
        .bi-alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
        .bi-alert-success { background:#00461B; color:#fff; border:1px solid #A7F3D0; }
        .bi-alert-error { background:#7F1D1D; color:#fff; border:1px solid #FECACA; }
        .bi-alert-warn { background:#B45309; color:#fff; border:1px solid #FDE68A; }
        .bi-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:12px; }
        .bi-stat { background:#F8FDF9; border:1px solid #E5E7EB; border-radius:8px; padding:8px 10px; text-align:center; }
        .bi-stat strong { display:block; font-size:18px; color:#00461B; }
        .bi-stat span { font-size:10.5px; color:#6B7280; text-transform:uppercase; letter-spacing:.3px; }
        .bi-log { max-height:220px; overflow-y:auto; border:1px solid #E5E7EB; border-radius:8px; padding:8px 10px; font-size:12px; }
        .bi-log-row { padding:3px 0; border-bottom:1px solid #F3F4F6; }
        .bi-log-row:last-child { border-bottom:none; }
        .bi-log-row.warn { color:#B45309; }
        .bi-log-row.err { color:#B91C1C; }

        .bi-undo-row { display:flex; justify-content:flex-end; margin-top:12px; }
        .bi-undo-btn { display:inline-flex; align-items:center; gap:6px; background:#fff; border:1.5px solid #B91C1C;
            color:#B91C1C; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer;
            font-family:inherit; transition:background .15s, color .15s; }
        .bi-undo-btn:hover:not(:disabled) { background:#B91C1C; color:#fff; }
        .bi-undo-btn:disabled { opacity:.6; cursor:default; }

        .bi-preview-tablewrap { overflow-x:auto; border:1px solid #E5E7EB; border-radius:10px; max-height:320px; overflow-y:auto; }
        .bi-preview-table { width:100%; border-collapse:collapse; font-size:12.5px; white-space:nowrap; }
        .bi-preview-table th { position:sticky; top:0; background:#00461B; color:#fff; text-align:left;
            padding:8px 12px; border-bottom:2px solid #C5D9CB; font-weight:700; }
        .bi-prev-sheethdr { display:block; font-size:10px; font-weight:500; color:#9CA3AF; text-transform:none; margin-top:2px; }
        .bi-preview-table td { padding:7px 12px; border-bottom:1px solid #F3F4F6; color:#374151; }
        .bi-preview-table tbody tr:hover td { background:#FAFBFC; }
        .bi-prev-empty { text-align:center; color:#9CA3AF; padding:20px !important; }
        .bi-prev-more { font-size:11.5px; color:#9CA3AF; margin:6px 2px 0; }
        .bi-prev-hint { font-size:12.5px; color:#00461B; font-weight:600; margin:10px 2px 0; }
    `;
}
