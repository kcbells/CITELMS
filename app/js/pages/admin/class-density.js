/**
 * Admin — Uploads
 * Two tabs:
 *   - Class Density — bulk-import instructors, students, subjects, sections,
 *     and class assignments from one Excel/CSV/Word/photo file (same engine
 *     as the Users page's "Import Excel" button — BulkImportAPI.php).
 *   - Subjects — a settings-style list of every subject, each with a
 *     Global Gradebook on/off toggle (SubjectOfferingsAPI.php's
 *     set-grading-type), so an admin can flip a subject's grading mode any
 *     time without going through the Subject Offerings management table.
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { notify } from '../../utils/notify.js';
import { mountBulkImportUI, bulkImportCss } from '../../components/bulk-import-ui.js';

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
                <p class="cd-hero-sub">Bulk-import class rosters, and manage which subjects use the Global Gradebook.</p>
            </header>

            <div class="cd-tabs" role="tablist">
                <button type="button" class="cd-tab" data-tab="density" role="tab">
                    ${icon('cloudUpload', { size: 14, className: 'ui-icon-inline' })} Class Density
                </button>
                <button type="button" class="cd-tab" data-tab="subjects" role="tab">
                    ${icon('document', { size: 14, className: 'ui-icon-inline' })} Subjects
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
        } else {
            renderSubjectsTab(body);
        }
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
    showTab(activeTab);
}

async function renderSubjectsTab(body) {
    body.innerHTML = `<div class="cd-subj-loading"><div class="bi-spin"></div></div>`;

    const res = await Api.get('/SubjectOfferingsAPI.php?action=list');
    const offerings = res.success ? res.data : [];

    body.innerHTML = `
        <p class="cd-tab-sub">Every subject's grading mode, in one place — <strong>Global</strong> switches a subject onto the
            14-module Global Gradebook; <strong>Raw Score</strong> is the default per-item grading. Existing grades are kept
            either way; this only changes which gradebook screen the instructor sees.</p>

        <div class="cd-gu-panel" id="cd-gu-panel">
            <button type="button" class="cd-gu-toggle" id="cd-gu-toggle">
                ${icon('cloudUpload', { size: 15, className: 'ui-icon-inline' })}
                <span>Upload a document, Excel, or photo to mark subjects as Global</span>
                ${icon('chevronDown', { size: 14, className: 'ui-icon-inline cd-gu-chevron' })}
            </button>
            <div class="cd-gu-body" id="cd-gu-body" hidden>
                <p class="cd-gu-hint">Upload anything with a <strong>Subject Code</strong> column or listing — a curriculum sheet
                    exported to Excel/CSV, a Word table, or a clear photo of one. Every subject it matches gets marked Global;
                    codes that don't match anything are reported back, never created.</p>
                <div class="cd-gu-dropzone" id="cd-gu-dropzone">
                    <input type="file" id="cd-gu-file-input" hidden>
                    <div id="cd-gu-dz-empty">
                        ${icon('cloudUpload', { size: 22, className: 'ui-icon-inline' })}
                        <p><strong>Click to choose a file</strong> or drag it here</p>
                    </div>
                    <div id="cd-gu-dz-file" style="display:none;">
                        ${icon('document', { size: 16, className: 'ui-icon-inline' })}
                        <span id="cd-gu-file-name"></span>
                        <button type="button" class="bi-file-clear" id="cd-gu-file-clear">&times;</button>
                    </div>
                </div>
                <div id="cd-gu-result"></div>
            </div>
        </div>

        <div class="cd-subj-search">
            ${icon('search', { size: 14, className: 'ui-icon-inline' })}
            <input type="text" id="cd-subj-search-input" placeholder="Search by subject code or name…">
        </div>

        <div class="cd-subj-list" id="cd-subj-list">
            <div class="cd-subj-empty">Type a subject code or name above to look it up.</div>
        </div>
    `;

    const listEl = body.querySelector('#cd-subj-list');

    // Only ever shows what matches the current search — nothing renders
    // until the admin actually types something, instead of dumping every
    // subject in the system on screen at once.
    body.querySelector('#cd-subj-search-input').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) {
            listEl.innerHTML = `<div class="cd-subj-empty">Type a subject code or name above to look it up.</div>`;
            return;
        }
        const matches = offerings.filter(o => `${o.subject_code} ${o.subject_name}`.toLowerCase().includes(q));
        listEl.innerHTML = matches.length
            ? matches.map(renderSubjectRow).join('')
            : `<div class="cd-subj-empty">No subjects match "${esc(e.target.value.trim())}".</div>`;
        wireGlobalToggles(body);
    });

    wireGlobalToggles(body);
    wireGlobalUploadPanel(body);
}

/** The "upload a file, we'll match subject codes and mark them Global" panel — separate from the per-row toggle above. */
function wireGlobalUploadPanel(body) {
    const toggleBtn = body.querySelector('#cd-gu-toggle');
    const panelBody = body.querySelector('#cd-gu-body');
    const dropzone   = body.querySelector('#cd-gu-dropzone');
    const fileInput  = body.querySelector('#cd-gu-file-input');
    const dzEmpty    = body.querySelector('#cd-gu-dz-empty');
    const dzFile     = body.querySelector('#cd-gu-dz-file');
    const fileNameEl = body.querySelector('#cd-gu-file-name');
    const clearBtn   = body.querySelector('#cd-gu-file-clear');
    const resultEl   = body.querySelector('#cd-gu-result');

    toggleBtn.addEventListener('click', () => {
        const willOpen = panelBody.hidden;
        panelBody.hidden = !willOpen;
        toggleBtn.classList.toggle('is-open', willOpen);
    });

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

    function setFile(file) {
        resultEl.innerHTML = '';
        if (file) {
            fileNameEl.textContent = file.name;
            dzEmpty.style.display = 'none';
            dzFile.style.display = 'flex';
            previewGlobalUpload(file);
        } else {
            dzEmpty.style.display = '';
            dzFile.style.display = 'none';
        }
    }

    async function previewGlobalUpload(file) {
        resultEl.innerHTML = `<div class="bi-preview-loading"><div class="bi-spin"></div> Reading file…</div>`;
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await Api.postForm('/BulkImportAPI.php?action=preview-global', fd);

            if (!res.success) {
                resultEl.innerHTML = `<div class="bi-alert bi-alert-error">${esc(res.message || 'Could not read this file.')}</div>`;
                return;
            }
            resultEl.innerHTML = renderGlobalPreview(res.data);
            resultEl.querySelector('#cd-gu-confirm-btn')?.addEventListener('click', () => applyGlobalUpload(file));
        } catch (err) {
            console.error('Global-upload preview error:', err);
            resultEl.innerHTML = `<div class="bi-alert bi-alert-error">Connection error while reading the file. Please try again.</div>`;
        }
    }

    async function applyGlobalUpload(file) {
        const btn = resultEl.querySelector('#cd-gu-confirm-btn');
        const subjectNames = [...resultEl.querySelectorAll('.cd-gu-matched-name')].map(el => el.textContent).join(', ');
        const confirmed = await notify.confirm(
            `Mark these subjects as Global — switching every existing class offering for them onto the 14-module Global Gradebook? ` +
            `Existing grades are kept, not deleted. Subjects: ${subjectNames}`,
            { confirmText: 'Mark as Global' }
        );
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = 'Marking Global…';
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await Api.postForm('/BulkImportAPI.php?action=apply-global', fd);

            if (!res.success) {
                notify.error(res.message || 'Failed to mark subjects as Global.');
                btn.disabled = false;
                btn.textContent = 'Mark as Global';
                return;
            }
            notify.success(
                `${res.data.subjects_matched} subject${res.data.subjects_matched !== 1 ? 's' : ''} marked Global — ` +
                `${res.data.offerings_updated} offering${res.data.offerings_updated !== 1 ? 's' : ''} updated.`
            );
            setFile(null);
            fileInput.value = '';
            renderSubjectsTab(body); // full refresh so the list below reflects the change
        } catch (err) {
            console.error('Global-upload apply error:', err);
            notify.error('Connection error. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Mark as Global';
        }
    }
}

function renderGlobalPreview(d) {
    const matchedRows = d.matched.map(m => `
        <div class="cd-gu-row">
            <span class="subj-code">${esc(m.subject_code)}</span>
            <span class="cd-gu-matched-name">${esc(m.subject_name)}</span>
            <span class="cd-gu-row-status">${m.offering_count === 0
                ? 'no offerings yet'
                : m.already_global === m.offering_count
                    ? 'already Global'
                    : `${m.offering_count - m.already_global} of ${m.offering_count} offering${m.offering_count !== 1 ? 's' : ''} to update`}</span>
        </div>`).join('');

    return `
        ${d.is_ocr ? `
        <div class="bi-alert bi-alert-warn">
            ${icon('warning', { size: 14, className: 'ui-icon-inline' })}
            Read from a photo using OCR — double-check the matched subjects below before continuing.
        </div>` : ''}
        <div class="bi-alert bi-alert-success">
            Found ${d.total_codes} subject code${d.total_codes !== 1 ? 's' : ''} &middot;
            ${d.matched.length} matched an existing subject &middot;
            ${d.unmatched.length} not found.
        </div>
        ${matchedRows ? `<div class="cd-gu-matched-list">${matchedRows}</div>` : ''}
        ${d.unmatched.length ? `
            <p class="cd-gu-unmatched"><strong>Not found (skipped):</strong> ${d.unmatched.map(esc).join(', ')}</p>
        ` : ''}
        ${d.matched.length && d.offerings_to_update > 0 ? `
            <button type="button" class="bi-run-btn" id="cd-gu-confirm-btn">
                ${icon('cloudUpload', { size: 14, className: 'ui-icon-inline' })}
                Mark ${d.matched.length} Subject${d.matched.length !== 1 ? 's' : ''} as Global
            </button>
        ` : d.matched.length ? `<p class="cd-gu-unmatched">All matched subjects are already Global — nothing to do.</p>` : ''}
    `;
}

function renderSubjectRow(o) {
    const isGlobal = o.grading_type === 'global';
    const search = `${o.subject_code} ${o.subject_name}`.toLowerCase();
    return `
        <div class="cd-subj-row" data-search="${esc(search)}">
            <div class="cd-subj-info">
                <span class="subj-code">${esc(o.subject_code)}</span>
                <span class="cd-subj-name">${esc(o.subject_name)}</span>
                ${o.program_code ? `<span class="cd-subj-prog">${esc(o.program_code)}</span>` : ''}
            </div>
            ${o.subject_offered_id ? `
                <button type="button" class="grading-toggle-btn ${isGlobal ? 'is-global' : ''}"
                    data-grading-toggle="${o.subject_offered_id}"
                    data-current="${o.grading_type || 'raw_score'}"
                    data-name="${esc(o.subject_code)}"
                    title="Click to switch to ${isGlobal ? 'Raw Score' : 'Global Gradebook'}">
                    ${icon('document', { size: 12, className: 'ui-icon-inline' })} ${isGlobal ? 'Global' : 'Raw Score'}
                </button>
            ` : `<span class="cd-subj-nooffering">— no offering yet —</span>`}
        </div>`;
}

function wireGlobalToggles(body) {
    body.querySelectorAll('[data-grading-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const offeredId = parseInt(btn.dataset.gradingToggle, 10);
            const goingTo = btn.dataset.current === 'global' ? 'raw_score' : 'global';
            const label = goingTo === 'global' ? 'Global Gradebook' : 'Raw Score grading';
            const confirmed = await notify.confirm(
                `Switch "${btn.dataset.name}" to ${label}? The instructor's gradebook view for this offering will change; existing grades already entered are kept, not deleted.`,
                { confirmText: `Switch to ${goingTo === 'global' ? 'Global' : 'Raw Score'}` }
            );
            if (!confirmed) return;

            btn.disabled = true;
            const res = await Api.post('/SubjectOfferingsAPI.php?action=set-grading-type', {
                subject_offered_id: offeredId,
                grading_type: goingTo,
            });
            if (res.success) {
                notify.success(`"${btn.dataset.name}" is now on ${label}.`);
                renderSubjectsTab(body);
            } else {
                notify.error(res.message || 'Failed to update grading type.');
                btn.disabled = false;
            }
        });
    });
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

        .cd-gu-panel { border:1px solid #E5E7EB; border-radius:12px; background:#fff; margin-bottom:20px; overflow:hidden; }
        .cd-gu-toggle { display:flex; align-items:center; gap:8px; width:100%; background:none; border:none;
            padding:13px 16px; font-size:13.5px; font-weight:600; color:#374151; cursor:pointer; font-family:inherit; }
        .cd-gu-toggle:hover { background:#F8FDF9; }
        .cd-gu-toggle svg:first-child { color:#00461B; flex-shrink:0; }
        .cd-gu-toggle span { flex:1; text-align:left; }
        .cd-gu-chevron { transition:transform .15s; flex-shrink:0; color:#9CA3AF; }
        .cd-gu-toggle.is-open .cd-gu-chevron { transform:rotate(180deg); }
        .cd-gu-body { padding:0 16px 18px; border-top:1px solid #F3F4F6; }
        .cd-gu-hint { font-size:12px; color:#6B7280; line-height:1.6; margin:14px 0 12px; }
        .cd-gu-dropzone { border:2px dashed #d1d5db; border-radius:10px; padding:18px; text-align:center; cursor:pointer;
            transition:border-color .15s, background .15s; }
        .cd-gu-dropzone:hover, .cd-gu-dropzone.bi-drag-over { border-color:#00461B; background:#F8FDF9; }
        .cd-gu-dropzone svg { color:#00461B; margin-bottom:4px; }
        .cd-gu-dropzone p { margin:2px 0; font-size:13px; color:#374151; }
        #cd-gu-dz-file { display:flex; align-items:center; justify-content:center; gap:8px; font-size:13px; color:#00461B; font-weight:600; }
        #cd-gu-result { margin-top:14px; }
        .cd-gu-matched-list { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
        .cd-gu-row { display:flex; align-items:center; gap:10px; font-size:12.5px; padding:6px 2px; border-bottom:1px solid #F3F4F6; flex-wrap:wrap; }
        .cd-gu-matched-name { color:#374151; flex:1; min-width:120px; }
        .cd-gu-row-status { color:#9CA3AF; font-size:11.5px; flex-shrink:0; }
        .cd-gu-unmatched { font-size:12px; color:#B45309; line-height:1.6; margin:0 0 12px; }

        .cd-subj-loading { display:flex; justify-content:center; padding:60px 0; }
        .cd-subj-search { display:flex; align-items:center; gap:8px; background:#fff; border:1.5px solid #E5E7EB;
            border-radius:10px; padding:9px 14px; margin-bottom:14px; max-width:360px; }
        .cd-subj-search svg { color:#9CA3AF; flex-shrink:0; }
        .cd-subj-search input { border:none; outline:none; font-size:13.5px; font-family:inherit; flex:1; color:#374151; }

        .cd-subj-list { display:flex; flex-direction:column; gap:8px; }
        .cd-subj-row { display:flex; align-items:center; justify-content:space-between; gap:12px; background:#fff;
            border:1px solid #E5E7EB; border-radius:10px; padding:10px 14px; flex-wrap:wrap; }
        .cd-subj-info { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
        .cd-subj-info .subj-code { background:#E8F5E9; color:#1B4D3E; padding:3px 8px; border-radius:4px;
            font-family:monospace; font-size:12px; font-weight:600; flex-shrink:0; }
        .cd-subj-name { font-size:13.5px; color:#374151; font-weight:600; }
        .cd-subj-prog { font-size:11px; color:#9CA3AF; background:#F3F4F6; padding:2px 8px; border-radius:10px; }
        .cd-subj-nooffering { font-size:11.5px; color:#9CA3AF; font-style:italic; flex-shrink:0; }
        .cd-subj-empty { text-align:center; padding:40px; color:#9CA3AF; font-size:13px; }

        .grading-toggle-btn { display:inline-flex; align-items:center; gap:5px; border:1.5px solid #E5E7EB; background:#fff;
            color:#404040; padding:5px 12px; border-radius:20px; font-size:11.5px; font-weight:600; cursor:pointer;
            font-family:inherit; transition:border-color .15s, background .15s, color .15s; white-space:nowrap; flex-shrink:0; }
        .grading-toggle-btn:hover { border-color:#00461B; }
        .grading-toggle-btn.is-global { border-color:#00461B; background:#E8F5E9; color:#1B4D3E; }
        .grading-toggle-btn svg { width:12px; height:12px; flex-shrink:0; }
        .grading-toggle-btn:disabled { opacity:.5; cursor:not-allowed; }
    `;
}
