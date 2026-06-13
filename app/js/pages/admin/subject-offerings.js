/**
 * Admin Subject Offerings Page
 * CRUD for subject offerings
 */
import { Api } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let subjects = [];
let semesters = [];
let departments = [];
let programs = [];

export async function render(container) {
    // Read pre-filter from URL hash (e.g. #admin/subject-offerings?program_id=3)
    const hashQuery = window.location.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashQuery);
    const preProgram = hashParams.get('program_id') || '';

    const [subjRes, semRes, deptRes, progRes] = await Promise.all([
        Api.get('/SubjectOfferingsAPI.php?action=subjects'),
        Api.get('/SubjectOfferingsAPI.php?action=semesters'),
        Api.get('/SubjectOfferingsAPI.php?action=departments'),
        Api.get('/SubjectOfferingsAPI.php?action=programs'),
    ]);
    subjects    = subjRes.success ? subjRes.data : [];
    semesters   = semRes.success  ? semRes.data  : [];
    departments = deptRes.success ? deptRes.data : [];
    programs    = progRes.success ? progRes.data : [];
    renderList(container, '', '', preProgram);
}

async function renderList(container, semFilter = '', batchFilter = '', programFilter = '', statusFilter = '') {
    let params = semFilter    ? '&semester_id=' + semFilter : '';
    if (batchFilter)   params += '&batch='      + encodeURIComponent(batchFilter);
    if (programFilter) params += '&program_id=' + programFilter;
    if (statusFilter)  params += '&status='     + encodeURIComponent(statusFilter);
    const result = await Api.get('/SubjectOfferingsAPI.php?action=list' + params);
    const offerings = result.success ? result.data : [];

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .page-header .count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .filters { display:flex; gap:12px; margin-bottom:20px; align-items:center; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; min-width:220px; }

            .data-table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; border:2px solid #1B4D3E; }
            .data-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .data-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .data-table tr:last-child td { border-bottom:none; }
            .data-table tr:hover td { background:#f9fffe; }

            .subj-code { background:#E8F5E9; color:#1B4D3E; padding:3px 8px; border-radius:4px; font-family:monospace; font-size:12px; font-weight:600; margin-right:8px; }
            .meta-badge { background:#f3f4f6; color:#404040; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:500; display:inline-block; margin-right:4px; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-open { background:#E8F5E9; color:#1B4D3E; }
            .badge-closed { background:#FEE2E2; color:#b91c1c; }
            .badge-cancelled { background:#f3f4f6; color:#737373; }

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
            .modal { background:#fff; border-radius:16px; width:90%; max-width:520px; max-height:90vh; overflow-y:auto; }
            .filter-section { background:#f8fdf9; border:1px solid #d1e7d8; border-radius:10px; padding:14px 16px 6px; margin-bottom:16px; }
            .filter-section-label { font-size:11px; font-weight:700; color:#1B4D3E; text-transform:uppercase; letter-spacing:.6px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
            .filter-section .form-group { margin-bottom:10px; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; color:#262626; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; padding:0; line-height:1; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }
            .form-group { margin-bottom:16px; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-select { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; }
            .form-select:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
            .radio-group { display:flex; gap:16px; margin-top:6px; }
            .radio-group label { display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer; }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-error { background:#FEE2E2; color:#b91c1c; border:1px solid #FECACA; }
            .batch-badge { background:#DBEAFE; color:#1E40AF; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
        </style>

        <div class="page-header">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                ${programFilter ? `<a href="#admin/curriculum" style="color:#1B4D3E;font-size:13px;font-weight:600;text-decoration:none">← Back to Curriculum</a>` : ''}
                <h2>Subject Offerings <span class="count">${offerings.length}</span></h2>
            </div>
            <span style="font-size:12px;color:#737373">Offerings are auto-generated from the curriculum.</span>
        </div>

        <div class="filters">
            <select id="filter-sem">
                <option value="">All Semesters</option>
                ${semesters.map(s => `<option value="${s.semester_id}" ${semFilter==s.semester_id?'selected':''}>${esc(s.semester_name)} - ${esc(s.academic_year)}</option>`).join('')}
            </select>
            <select id="filter-program">
                <option value="">All Programs</option>
                ${programs.map(p => `<option value="${p.program_id}" ${programFilter==p.program_id?'selected':''}>${esc(p.program_code)} – ${esc(p.program_name)}</option>`).join('')}
            </select>
            <select id="filter-batch">
                <option value="">All Year Levels</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
            </select>
            <select id="filter-status">
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
            </select>
        </div>

        <table class="data-table">
            <thead><tr><th>Subject</th><th>Semester</th><th>Year Level</th><th>Units</th><th>Sections</th><th>Students</th><th>Status</th><th></th></tr></thead>
            <tbody>
                ${offerings.length === 0 ? '<tr><td colspan="8"><div class="empty-state-sm">No offerings found</div></td></tr>' :
                  offerings.map(o => `
                    <tr>
                        <td><span class="subj-code">${esc(o.subject_code)}</span>${esc(o.subject_name)}</td>
                        <td>${esc(o.semester_name || '—')} <span style="color:#737373;font-size:12px">${esc(o.academic_year || '')}</span></td>
                        <td>${o.batch ? `<span class="batch-badge">${esc(o.batch)}</span>` : '<span style="color:#aaa;font-size:12px">—</span>'}</td>
                        <td><span class="meta-badge">${o.units}</span></td>
                        <td><span class="meta-badge">${o.section_count}</span></td>
                        <td><span class="meta-badge">${o.student_count}</span></td>
                        <td><span class="badge badge-${o.status||'open'}">${o.status||'open'}</span></td>
                        <td class="actions-cell">
                            <button class="btn-actions" data-id="${o.subject_offered_id}">⋮</button>
                            <div class="actions-dropdown" data-dropdown="${o.subject_offered_id}">
                                <a href="#" data-edit="${o.subject_offered_id}" data-batch="${esc(o.batch||'')}" data-status="${o.status}">${L.editBatch}</a>
                                <a href="#" data-toggle="${o.subject_offered_id}" data-status="${o.status === 'open' ? 'closed' : 'open'}">${o.status === 'open' ? `${icon('lock', inl)} Close` : `${icon('lock', inl)} Open`}</a>
                                <div class="divider"></div>
                                <a href="#" class="danger" data-cancel="${o.subject_offered_id}" data-name="${esc(o.subject_code)}">${L.cancel}</a>
                            </div>
                        </td>
                    </tr>
                  `).join('')}
            </tbody>
        </table>
    `;

    function getFilters() {
        return {
            sem     : container.querySelector('#filter-sem').value,
            program : container.querySelector('#filter-program').value,
            batch   : container.querySelector('#filter-batch').value,
            status  : container.querySelector('#filter-status').value,
        };
    }
    ['#filter-sem','#filter-program','#filter-batch','#filter-status'].forEach(sel => {
        container.querySelector(sel).addEventListener('change', () => {
            const f = getFilters();
            renderList(container, f.sem, f.batch, f.program, f.status);
        });
    });

    container.querySelectorAll('.btn-actions').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            container.querySelector(`[data-dropdown="${btn.dataset.id}"]`).classList.toggle('show');
        });
    });
    document.addEventListener('click', () => container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show')), { once: true });

    container.querySelectorAll('[data-toggle]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            const res = await Api.post('/SubjectOfferingsAPI.php?action=update', { subject_offered_id: parseInt(a.dataset.toggle), status: a.dataset.status });
            if (res.success) renderList(container, semFilter, batchFilter);
            else alert(res.message);
        });
    });

    container.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            openEditBatchModal(container, parseInt(a.dataset.edit), a.dataset.batch, a.dataset.status, semFilter, batchFilter);
        });
    });

    container.querySelectorAll('[data-cancel]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm(`Cancel offering "${a.dataset.name}"?`)) return;
            const res = await Api.post('/SubjectOfferingsAPI.php?action=delete', { subject_offered_id: parseInt(a.dataset.cancel) });
            if (res.success) renderList(container, semFilter, batchFilter);
            else alert(res.message);
        });
    });
}

function openModal(container, semFilter) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header"><h3>Add Subject Offering</h3><button class="modal-close">&times;</button></div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-group">
                    <label class="form-label">Department</label>
                    <select class="form-select" id="m-department">
                        <option value="">All Departments</option>
                        ${departments.map(d => `<option value="${d.department_id}">${esc(d.department_code)} - ${esc(d.department_name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Program</label>
                    <select class="form-select" id="m-program">
                        <option value="">All Programs</option>
                        ${programs.map(p => `<option value="${p.program_id}" data-dept="${p.department_id}">${esc(p.program_code)} - ${esc(p.program_name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Subject *</label>
                    <select class="form-select" id="m-subject">
                        <option value="">Select Subject</option>
                        ${subjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Semester *</label>
                    <select class="form-select" id="m-semester"><option value="">Select Semester</option>${semesters.map(s => `<option value="${s.semester_id}">${esc(s.semester_name)} - ${esc(s.academic_year)}</option>`).join('')}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Batch (Year Level)</label>
                    <select class="form-select" id="m-batch">${batchOptions()}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label><input type="radio" name="m-status" value="open" checked> Open</label>
                        <label><input type="radio" name="m-status" value="closed"> Closed</label>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">Create Offering</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const deptSel    = overlay.querySelector('#m-department');
    const progSel    = overlay.querySelector('#m-program');
    const subjSel    = overlay.querySelector('#m-subject');

    // Department → filter program dropdown
    deptSel.addEventListener('change', () => {
        const deptId = deptSel.value;
        progSel.innerHTML = '<option value="">All Programs</option>' +
            programs
                .filter(p => !deptId || String(p.department_id) === deptId)
                .map(p => `<option value="${p.program_id}" data-dept="${p.department_id}">${esc(p.program_code)} - ${esc(p.program_name)}</option>`)
                .join('');
        progSel.dispatchEvent(new Event('change'));
    });

    // Program → fetch filtered subjects
    progSel.addEventListener('change', async () => {
        const programId = progSel.value;
        const url = programId
            ? `/SubjectOfferingsAPI.php?action=subjects&program_id=${programId}`
            : '/SubjectOfferingsAPI.php?action=subjects';
        const res = await Api.get(url);
        const list = res.success ? res.data : subjects;
        subjSel.innerHTML = '<option value="">Select Subject</option>' +
            list.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('');
    });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const payload = {
            subject_id:  subjSel.value,
            semester_id: overlay.querySelector('#m-semester').value,
            batch:       overlay.querySelector('#m-batch').value,
            status:      overlay.querySelector('input[name="m-status"]:checked').value,
        };
        const res = await Api.post('/SubjectOfferingsAPI.php?action=create', payload);
        if (res.success) { overlay.remove(); renderList(container, semFilter); }
        else overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${res.message}</div>`;
    });
}

const BATCHES = ['1st Year','2nd Year','3rd Year','4th Year'];

function batchOptions(selected = '') {
    return `<option value="">— No batch —</option>` +
        BATCHES.map(b => `<option value="${b}" ${selected===b?'selected':''}>${b}</option>`).join('');
}

function openEditBatchModal(container, id, currentBatch, currentStatus, semFilter, batchFilter) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header"><h3>Edit Offering</h3><button class="modal-close">&times;</button></div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-group">
                    <label class="form-label">Batch (Year Level)</label>
                    <select class="form-select" id="eb-batch">${batchOptions(currentBatch)}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <div class="radio-group">
                        <label><input type="radio" name="eb-status" value="open" ${currentStatus==='open'?'checked':''}> Open</label>
                        <label><input type="radio" name="eb-status" value="closed" ${currentStatus==='closed'?'checked':''}> Closed</label>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="eb-save">Save Changes</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#eb-save').addEventListener('click', async () => {
        const res = await Api.post('/SubjectOfferingsAPI.php?action=update', {
            subject_offered_id: id,
            batch:  overlay.querySelector('#eb-batch').value,
            status: overlay.querySelector('input[name="eb-status"]:checked').value,
        });
        if (res.success) { overlay.remove(); renderList(container, semFilter, batchFilter); }
        else overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${res.message}</div>`;
    });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
