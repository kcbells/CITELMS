/**
 * Admin Subjects Page
 * Full CRUD for subject management
 */
import { Api } from '../../api.js';
import { L } from '../../utils/action-labels.js';
import { notify } from '../../utils/notify.js';

import { esc } from '../../utils/classroom-ui.js';
let programs    = [];
let departments = [];
let semesters   = [];

export async function render(container) {
    const [progRes, deptRes, semRes] = await Promise.all([
        Api.get('/SubjectsAPI.php?action=programs'),
        Api.get('/SubjectsAPI.php?action=departments'),
        Api.get('/SubjectsAPI.php?action=semesters'),
    ]);
    programs    = progRes.success ? progRes.data : [];
    departments = deptRes.success ? deptRes.data : [];
    semesters   = semRes.success  ? semRes.data  : [];
    renderList(container);
}

async function renderList(container, search = '', deptId = '', progId = '', semId = '', page = 1) {
    let params = search ? '&search=' + encodeURIComponent(search) : '';
    if (deptId) params += '&department_id=' + deptId;
    if (progId) params += '&program_id='    + progId;
    if (semId)  params += '&semester_id='   + semId;
    params += '&page=' + page + '&per_page=25';
    const result   = await Api.get('/SubjectsAPI.php?action=list' + params);
    const subjects = result.success ? result.data : [];
    const dbError  = !result.success && result.error ? result.error : null;
    const totalPages  = result.success ? (result.total_pages || 1) : 1;
    const currentPage = result.success ? (result.page || 1) : 1;
    const totalCount  = result.success ? (result.total ?? subjects.length) : 0;

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:flex-end; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .page-header .count { background:#00461B; color:#fff; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            .filters { display:flex; gap:12px; margin-bottom:20px; align-items:center; flex-wrap:wrap; }
            .filters input, .filters select { max-width:100%; box-sizing:border-box; }
            .tbl-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
            @media (max-width:640px) { .filters input, .filters select { min-width:0; flex:1 1 100%; } }
            .filters input { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:260px; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:200px; background:#fff; }
            .filters .clear-btn { color:#00461B; font-size:13px; cursor:pointer; text-decoration:underline; }

            .data-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; border:1.5px solid #374151; }
            .data-table th { background:#00461B; color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:8px 14px; border:1px solid #155534; text-align:left; }
            .data-table tbody tr:nth-child(even) { background:#f9fafb; }
            .data-table tbody tr:hover { background:#f0fdf4; }
            .data-table td { border:1px solid #d1d5db; padding:8px 12px; vertical-align:middle; font-size:13px; color:#374151; }

            .subj-code { background:#00461B; color:#fff; padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:600; font-size:13px; }
            .subj-name { font-weight:600; color:#262626; }
            .meta-text { color:#737373; font-size:13px; }
            .units-badge { background:#f3f4f6; color:#404040; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
            .badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:capitalize; }
            .badge-active { background:#00461B; color:#fff; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .badge-inactive { background:#7F1D1D; color:#fff; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }

            .actions-cell { position:relative; }
            .btn-actions { background:none; border:1px solid #e0e0e0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
            .btn-actions:hover { background:#f5f5f5; }
            .actions-dropdown { display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:160px; z-index:50; overflow:hidden; }
            .actions-dropdown.show { display:block; }
            .actions-dropdown a { display:flex; align-items:center; gap:8px; padding:10px 16px; font-size:13px; color:#404040; cursor:pointer; text-decoration:none; }
            .actions-dropdown a:hover { background:#f5f5f5; }
            .actions-dropdown a.danger { color:#b91c1c; }
            .actions-dropdown .divider { height:1px; background:#f0f0f0; margin:4px 0; }

            .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
            .modal { background:#fff; border-radius:16px; width:90%; max-width:560px; max-height:90vh; overflow-y:auto; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; color:#262626; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; padding:0; line-height:1; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }
            .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .form-group { margin-bottom:16px; }
            .form-group.full { grid-column:1/-1; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input, .form-select, .form-textarea { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; font-family:inherit; }
            .form-input:focus, .form-select:focus, .form-textarea:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .btn-secondary:hover { background:#e8e8e8; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-error { background:#7F1D1D; color:#fff; border:1px solid #FECACA; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
            .off-badge { padding:3px 8px; border-radius:20px; font-size:11px; font-weight:700; display:inline-block; }
            .off-open  { background:#00461B; color:#fff; }
            .off-none  { background:#f3f4f6; color:#9ca3af; }
            .off-warn  { background:#B45309; color:#fff; }
            .off-sec-pill { background:#1D4ED8; color:#fff; padding:2px 7px; border-radius:20px; font-size:10px; font-weight:600; margin-left:4px; }
            .off-sec-none { background:#B45309; color:#fff; }
            @media(max-width:768px) { .form-grid { grid-template-columns:1fr; } .filters { flex-direction:column; } }

            .subj-pagination { display:flex; justify-content:space-between; align-items:center; margin-top:16px; flex-wrap:wrap; gap:12px; }
            .sp-info { font-size:13px; color:#6b7280; }
            .sp-controls { display:flex; gap:8px; }
            .sp-btn { background:#fff; border:1.5px solid #e5e7eb; color:#374151; padding:8px 16px; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; transition:all .15s; }
            .sp-btn:hover:not(:disabled) { border-color:#00461B; color:#fff; background:#00461B; }
            .sp-btn:disabled { opacity:.4; cursor:not-allowed; }
        </style>

        <div class="page-header">
            <button class="btn-secondary" id="btn-export-csv">Export CSV</button>
            <button class="btn-secondary" id="btn-export-pdf">Export PDF</button>
            <button class="btn-primary" id="btn-add">+ Add Subject</button>
        </div>

        <div class="filters">
            <input type="text" id="filter-search" placeholder="Search subject code or name..." value="${esc(search)}">
            <select id="filter-dept">
                <option value="">All Departments</option>
                ${departments.map(d => `<option value="${d.department_id}" ${deptId==d.department_id?'selected':''}>${esc(d.department_code)} — ${esc(d.department_name)}</option>`).join('')}
            </select>
            <select id="filter-prog">
                <option value="">All Programs</option>
                ${(deptId ? programs.filter(p => p.department_id == deptId) : programs)
                    .map(p => `<option value="${p.program_id}" ${progId==p.program_id?'selected':''}>${esc(p.program_code)} — ${esc(p.program_name)}</option>`).join('')}
            </select>
            <select id="filter-sem">
                <option value="">All Semesters</option>
                ${semesters.map(s => `<option value="${s.semester_id}" ${semId==s.semester_id?'selected':''}>${esc(s.semester_name)} – ${esc(s.academic_year)}</option>`).join('')}
            </select>
            ${(search || deptId || progId || semId) ? '<span class="clear-btn" id="clear-search">Clear</span>' : ''}
        </div>

        <div class="tbl-scroll"><table class="data-table">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Subject Name</th>
                    <th>Program</th>
                    <th>Year</th>
                    <th>Semester</th>
                    <th>Units</th>
                    <th>This Semester</th>
                    <th>Status</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${subjects.length === 0 ? `<tr><td colspan="9"><div class="empty-state-sm">${dbError ? L.warning + ' DB Error: ' + esc(dbError) : 'No subjects found'}</div></td></tr>` :
                  subjects.map(s => {
                    const yr  = s.year_level ? s.year_level + 'Y' : '—';
                    const sem = s.semester == 1 ? '1st' : s.semester == 2 ? '2nd' : s.semester == 3 ? 'Sum' : '—';
                    const secCount = parseInt(s.current_section_count) || 0;
                    const offeringCell = !parseInt(s.is_offered)
                        ? `<span class="off-badge off-none">Not Offered</span>`
                        : `<span class="off-badge ${s.current_instructor ? 'off-open' : 'off-warn'}">Offered</span>
                           <span class="off-sec-pill ${secCount === 0 ? 'off-sec-none' : ''}">${secCount} section${secCount !== 1 ? 's' : ''}</span>
                           ${s.current_instructor ? `<div style="font-size:11px;color:#737373;margin-top:2px;">${esc(s.current_instructor)}</div>` : `<div style="font-size:11px;color:#B45309;margin-top:2px;">No instructor</div>`}`;
                    return `
                        <tr>
                            <td><span class="subj-code">${esc(s.subject_code)}</span></td>
                            <td><span class="subj-name">${esc(s.subject_name)}</span></td>
                            <td class="meta-text">${esc(s.program_code || 'General')}</td>
                            <td class="meta-text">${yr}</td>
                            <td class="meta-text">${sem}</td>
                            <td><span class="units-badge">${s.units}</span></td>
                            <td>${offeringCell}</td>
                            <td><span class="badge badge-${s.status}">${s.status}</span></td>
                            <td class="actions-cell">
                                <button class="btn-actions" data-id="${s.subject_id}">⋮</button>
                                <div class="actions-dropdown" data-dropdown="${s.subject_id}">
                                    <a href="#" data-edit="${s.subject_id}">${L.edit}</a>
                                    <div class="divider"></div>
                                    <a href="#" class="danger" data-delete="${s.subject_id}" data-name="${esc(s.subject_name)}">${L.deactivate}</a>
                                </div>
                            </td>
                        </tr>`;
                  }).join('')}
            </tbody>
        </table></div>

        ${totalPages > 1 ? `
        <div class="subj-pagination">
            <span class="sp-info">Page ${currentPage} of ${totalPages} &middot; ${totalCount} subject${totalCount !== 1 ? 's' : ''}</span>
            <div class="sp-controls">
                <button class="sp-btn" id="sp-prev" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Prev</button>
                <button class="sp-btn" id="sp-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
            </div>
        </div>` : ''}
    `;

    // Events
    container.querySelector('#btn-add').addEventListener('click', () => openModal(container));
    container.querySelector('#btn-export-csv').addEventListener('click', () => exportSubjects('csv', search, deptId, progId, semId));
    container.querySelector('#btn-export-pdf').addEventListener('click', () => exportSubjects('pdf', search, deptId, progId, semId));

    const getFilters = () => ({
        s:   container.querySelector('#filter-search').value,
        d:   container.querySelector('#filter-dept').value,
        p:   container.querySelector('#filter-prog').value,
        sem: container.querySelector('#filter-sem').value,
    });

    let debounce;
    container.querySelector('#filter-search').addEventListener('input', () => {
        clearTimeout(debounce);
        const { s, d, p, sem } = getFilters();
        debounce = setTimeout(() => renderList(container, s, d, p, sem, 1), 400);
    });
    // Department change → reset program filter
    container.querySelector('#filter-dept').addEventListener('change', () => {
        const { s, d, sem } = getFilters();
        renderList(container, s, d, '', sem, 1);
    });
    container.querySelector('#filter-prog').addEventListener('change', () => {
        const { s, d, p, sem } = getFilters();
        renderList(container, s, d, p, sem, 1);
    });
    container.querySelector('#filter-sem').addEventListener('change', () => {
        const { s, d, p, sem } = getFilters();
        renderList(container, s, d, p, sem, 1);
    });
    const clearBtn = container.querySelector('#clear-search');
    if (clearBtn) clearBtn.addEventListener('click', () => renderList(container, '', '', '', ''));

    // Pagination
    const prevBtn = container.querySelector('#sp-prev');
    const nextBtn = container.querySelector('#sp-next');
    if (prevBtn) prevBtn.addEventListener('click', () => renderList(container, search, deptId, progId, semId, currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => renderList(container, search, deptId, progId, semId, currentPage + 1));

    container.querySelectorAll('.btn-actions').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            const dd = container.querySelector(`[data-dropdown="${btn.dataset.id}"]`);
            dd.classList.toggle('show');
            // The table scrolls sideways on small screens, which would clip a menu
            // anchored inside it — pin the open menu to the screen under its button.
            if (dd.classList.contains('show')) {
                const r = btn.getBoundingClientRect();
                Object.assign(dd.style, { position: 'fixed', right: 'auto', zIndex: '1000', top: `${r.bottom + 4}px` });
                dd.style.left = `${Math.max(8, Math.min(r.right - dd.offsetWidth, window.innerWidth - dd.offsetWidth - 8))}px`;
                window.addEventListener('scroll', () => dd.classList.remove('show'), { once: true, capture: true });
            }
        });
    });
    document.addEventListener('click', () => container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show')), { once: true });

    container.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            const res = await Api.get('/SubjectsAPI.php?action=get&id=' + a.dataset.edit);
            if (res.success) openModal(container, res.data);
        });
    });

    container.querySelectorAll('[data-delete]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!await notify.confirm(`Deactivate "${a.dataset.name}"?`, { danger: true, confirmText: 'Deactivate' })) return;
            const res = await Api.post('/SubjectsAPI.php?action=delete', { subject_id: parseInt(a.dataset.delete) });
            if (res.success) { const { s, d, p, sem } = getFilters(); renderList(container, s, d, p, sem); }
            else notify.error(res.message);
        });
    });
}

function openModal(container, subj = null) {
    const isEdit = !!subj;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const progOpts = programs.map(p => `<option value="${p.program_id}" ${subj && subj.program_id==p.program_id?'selected':''}>${esc(p.program_code)} - ${esc(p.program_name)}</option>`).join('');

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${isEdit ? 'Edit Subject' : 'Add Subject'}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Subject Code *</label>
                        <input class="form-input" id="m-code" value="${esc(subj?.subject_code||'')}" placeholder="e.g., IT101">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Units</label>
                        <input type="number" class="form-input" id="m-units" value="${subj?.units||3}" min="1" max="12">
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Subject Name *</label>
                        <input class="form-input" id="m-name" value="${esc(subj?.subject_name||'')}" placeholder="e.g., Introduction to Computing">
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Program</label>
                        <select class="form-select" id="m-prog"><option value="">General (All Programs)</option>${progOpts}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Year Level</label>
                        <select class="form-select" id="m-year">
                            <option value="">Not Set</option>
                            <option value="1" ${subj?.year_level=='1'?'selected':''}>1st Year</option>
                            <option value="2" ${subj?.year_level=='2'?'selected':''}>2nd Year</option>
                            <option value="3" ${subj?.year_level=='3'?'selected':''}>3rd Year</option>
                            <option value="4" ${subj?.year_level=='4'?'selected':''}>4th Year</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Semester</label>
                        <select class="form-select" id="m-sem">
                            <option value="">Not Set</option>
                            <option value="1" ${subj?.semester=='1'?'selected':''}>1st Semester</option>
                            <option value="2" ${subj?.semester=='2'?'selected':''}>2nd Semester</option>
                            <option value="3" ${subj?.semester==3?'selected':''}>Summer</option>
                        </select>
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Description</label>
                        <textarea class="form-textarea" id="m-desc" rows="3">${esc(subj?.description||'')}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="m-status">
                            <option value="active" ${subj?.status==='active'||!subj?'selected':''}>Active</option>
                            <option value="inactive" ${subj?.status==='inactive'?'selected':''}>Inactive</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update' : 'Create'} Subject</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const payload = {
            subject_code: overlay.querySelector('#m-code').value,
            subject_name: overlay.querySelector('#m-name').value,
            units: parseInt(overlay.querySelector('#m-units').value) || 3,
            program_id: overlay.querySelector('#m-prog').value || null,
            year_level: overlay.querySelector('#m-year').value || null,
            semester: overlay.querySelector('#m-sem').value || null,
            description: overlay.querySelector('#m-desc').value,
            status: overlay.querySelector('#m-status').value,
        };
        if (isEdit) payload.subject_id = subj.subject_id;

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/SubjectsAPI.php?action=${action}`, payload);

        if (res.success) {
            overlay.remove();
            render(container);
        } else {
            overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });
}

// esc() imported from classroom-ui.js (see import above)


// ── Export (CSV / PDF) ──────────────────────────────────────────────────────
// Fetches every row matching the current filters (not just the current page).

async function fetchAllFilteredSubjects(search, deptId, progId, semId) {
    let params = search ? '&search=' + encodeURIComponent(search) : '';
    if (deptId) params += '&department_id=' + deptId;
    if (progId) params += '&program_id='    + progId;
    if (semId)  params += '&semester_id='   + semId;
    params += '&export=1';
    const res = await Api.get('/SubjectsAPI.php?action=list' + params);
    return res.success ? res.data : [];
}

async function exportSubjects(format, search, deptId, progId, semId) {
    const subjects = await fetchAllFilteredSubjects(search, deptId, progId, semId);
    if (!subjects.length) { notify.error('No subjects to export.'); return; }

    const yr  = s => s.year_level ? s.year_level + 'Y' : '—';
    const sem = s => s.semester == 1 ? '1st' : s.semester == 2 ? '2nd' : s.semester == 3 ? 'Sum' : '—';

    if (format === 'csv') {
        const headers = ['Code', 'Subject Name', 'Program', 'Year', 'Semester', 'Units', 'Status'];
        const rows = subjects.map(s => [s.subject_code, s.subject_name, s.program_code || 'General', yr(s), sem(s), s.units, s.status]);
        const csv = [headers, ...rows]
            .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `subjects_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
    }

    const rowsHtml = subjects.map(s => `<tr>
        <td>${esc(s.subject_code)}</td>
        <td>${esc(s.subject_name)}</td>
        <td>${esc(s.program_code || 'General')}</td>
        <td>${yr(s)}</td>
        <td>${sem(s)}</td>
        <td>${esc(String(s.units))}</td>
        <td>${esc(s.status)}</td>
    </tr>`).join('');

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { notify.error('Please allow pop-ups to export as PDF.'); return; }
    win.document.write(`
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Subjects Export — ${new Date().toLocaleDateString()}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #1f2937; }
                h1 { font-size: 18px; margin: 0 0 4px; }
                p.meta { font-size: 12px; color: #6b7280; margin: 0 0 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
                th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
                tr:nth-child(even) { background: #fafbfc; }
                @media print { body { margin: 12mm; } }
            </style>
        </head>
        <body>
            <h1>COC LMS — Subjects</h1>
            <p class="meta">Generated ${new Date().toLocaleString()} &middot; ${subjects.length} record${subjects.length !== 1 ? 's' : ''}</p>
            <table>
                <thead><tr><th>Code</th><th>Subject Name</th><th>Program</th><th>Year</th><th>Semester</th><th>Units</th><th>Status</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </body>
        </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
}
