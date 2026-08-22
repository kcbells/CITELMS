/**
 * Admin — Uploads
 * Two tabs:
 *   - Class Density — bulk-import instructors, students, subjects, sections,
 *     and class assignments from one Excel/CSV/Word/photo file (same engine
 *     as the Users page's "Import Excel" button — BulkImportAPI.php).
 *   - Class List — a registrar-style roster export (Session Name, Campus,
 *     Student ID, Student Name, Gender, College, Course, Curriculum,
 *     Subject, Section, Email) where each row already names its own
 *     Subject + Section. Only students are upserted here — the Subject and
 *     Section themselves must already exist and are matched exactly, never
 *     created (BulkImportAPI.php's class-list-import action).
 *
 * The old "Subjects" tab (mark subjects as Global via upload) has moved off
 * the admin side — that's the Dean's call, not admin's, per plan.
 */
import { icon } from '../../utils/icons.js';
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
                <p class="cd-hero-sub">Bulk-import class rosters, or enroll students from a registrar's class-list export.</p>
            </header>

            <div class="cd-tabs" role="tablist">
                <button type="button" class="cd-tab" data-tab="density" role="tab">
                    ${icon('cloudUpload', { size: 14, className: 'ui-icon-inline' })} Class Density
                </button>
                <button type="button" class="cd-tab" data-tab="classlist" role="tab">
                    ${icon('document', { size: 14, className: 'ui-icon-inline' })} Class List
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
            body.innerHTML = `
                <p class="cd-tab-sub">Upload a class-list roster — each row already says which Subject and Section it
                    belongs to, so those must already exist in the system (Class List never creates subjects, sections,
                    or classes, only students and their enrollment).</p>
                <div id="cd-cl-import-host"></div>`;
            mountBulkImportUI(body.querySelector('#cd-cl-import-host'), {
                importAction: 'class-list-import',
                helpHtml: `
                    <p>Upload one file — <strong>Excel (.xlsx), CSV/text (.csv, .txt), a Word document with a table (.docx),
                        or a clear photo of a printed table (.jpg, .png)</strong>. Built for a registrar-style export with
                        columns like <strong>Student ID, Student Name, Subject, Section</strong> — plus optionally
                        Campus/College, Course, Email, and more; anything not recognized is simply ignored.</p>
                    <p>Each row's <strong>Subject</strong> (code or full name) and <strong>Section</strong> are matched against
                        classes that <strong>already exist</strong> — a row whose subject or section can't be matched is
                        skipped and reported, never invented.</p>
                    <p>Students that don't have an account yet are created automatically with their <strong>Student ID as
                        the login ID</strong> and <strong>no password yet</strong> — same first-login flow as Class Density.</p>`,
                renderResult: renderClassListResult,
            });
        }
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
    showTab(activeTab);
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
    `;
}
