/**
 * Admin Departments Page
 * Full CRUD for department management
 */
import { Api } from '../../api.js';
import { L } from '../../utils/action-labels.js';

let campuses = [];

export async function render(container) {
    const campRes = await Api.get('/DepartmentsAPI.php?action=campuses');
    campuses = campRes.success ? campRes.data : [];
    await renderList(container);
}

async function renderList(container) {
    const result = await Api.get('/DepartmentsAPI.php?action=list');
    const depts = result.success ? result.data : [];

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .page-header .count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            .table-wrap { border:2px solid #1B4D3E; border-radius:12px; overflow:hidden; background:#fff; }
            .data-table { width:100%; border-collapse:collapse; background:#fff; }
            .data-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .data-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .data-table tr:last-child td { border-bottom:none; }
            .data-table tr:hover td { background:#f9fffe; }

            .dept-code { background:#E8F5E9; color:#1B4D3E; padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:600; font-size:13px; letter-spacing:.5px; }
            .dept-name { font-weight:600; color:#262626; }
            .dept-desc { font-size:12px; color:#737373; margin-top:2px; }
            .program-badge { background:#DBEAFE; color:#1E40AF; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
            .dean-cell { display:flex; align-items:center; gap:9px; }
            .dean-avatar { flex-shrink:0; width:30px; height:30px; border-radius:50%; background:#1B4D3E; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }
            .dean-name-text { font-size:13px; font-weight:600; color:#262626; }
            .dean-email-text { font-size:11.5px; color:#9ca3af; }
            .dean-unassigned { font-size:12.5px; color:#9ca3af; font-style:italic; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-active { background:#E8F5E9; color:#1B4D3E; }
            .badge-inactive { background:#FEE2E2; color:#b91c1c; }

            .actions-cell { position:relative; text-align:right; }
            .btn-actions { background:none; border:1px solid #e0e0e0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; display:inline-flex; align-items:center; justify-content:center; }
            .btn-actions:hover { background:#f5f5f5; }
            .actions-dropdown { display:none; position:fixed; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.15); min-width:160px; z-index:9999; overflow:hidden; }
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
            .alert-error { background:#FEE2E2; color:#b91c1c; border:1px solid #FECACA; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
            @media(max-width:768px) { .form-grid { grid-template-columns:1fr; } }
        </style>

        <div class="page-header">
            <h2>Departments <span class="count">${depts.length}</span></h2>
            <button class="btn-primary" id="btn-add">+ Add Department</button>
        </div>

        <div class="table-wrap"><table class="data-table">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Department</th>
                    <th>Campus</th>
                    <th>Dean</th>
                    <th>Programs</th>
                    <th>Status</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${depts.length === 0 ? '<tr><td colspan="7"><div class="empty-state-sm">No departments found</div></td></tr>' :
                  depts.map(d => {
                    const initials = d.dean_name
                        ? d.dean_name.trim().split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
                        : '';
                    const deanCell = d.dean_name
                        ? `<div class="dean-cell">
                               <div class="dean-avatar">${initials}</div>
                               <div>
                                   <div class="dean-name-text">${esc(d.dean_name)}</div>
                                   <div class="dean-email-text">${esc(d.dean_email || '')}</div>
                               </div>
                           </div>`
                        : `<span class="dean-unassigned">No dean assigned</span>`;
                    return `
                    <tr>
                        <td><span class="dept-code">${esc(d.department_code)}</span></td>
                        <td><div class="dept-name">${esc(d.department_name)}</div>${d.description ? `<div class="dept-desc">${esc(d.description)}</div>` : ''}</td>
                        <td>${esc(d.campus_name || '—')}</td>
                        <td>${deanCell}</td>
                        <td><a class="program-badge" href="#admin/programs?department_id=${d.department_id}" style="cursor:pointer;text-decoration:none;">${d.program_count} programs</a></td>
                        <td><span class="badge badge-${d.status}">${d.status}</span></td>
                        <td class="actions-cell">
                            <button class="btn-actions" data-id="${d.department_id}">⋮</button>
                            <div class="actions-dropdown" data-dropdown="${d.department_id}">
                                <a href="#admin/programs?department_id=${d.department_id}" data-programs="${d.department_id}">${L.programs}</a>
                                <div class="divider"></div>
                                <a href="#" data-edit='${JSON.stringify({id:d.department_id,campus_id:d.campus_id,department_code:d.department_code,department_name:d.department_name,description:d.description||'',status:d.status})}'>${L.edit}</a>
                                <div class="divider"></div>
                                <a href="#" class="danger" data-delete="${d.department_id}" data-name="${esc(d.department_name)}">${L.deactivate}</a>
                            </div>
                        </td>
                    </tr>
                  `; }).join('')}
            </tbody>
        </table></div>
    `;

    // Events
    container.querySelector('#btn-add').addEventListener('click', () => openModal(container));

    container.querySelectorAll('.btn-actions').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = container.querySelector(`[data-dropdown="${btn.dataset.id}"]`);
            const isShown = dropdown.classList.contains('show');
            container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            if (!isShown) {
                const rect = btn.getBoundingClientRect();
                dropdown.style.top = (rect.bottom + 4) + 'px';
                dropdown.style.right = (window.innerWidth - rect.right) + 'px';
                dropdown.classList.add('show');
            }
        });
    });
    document.addEventListener('click', () => container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show')));

    container.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(container, JSON.parse(a.dataset.edit));
        });
    });

    container.querySelectorAll('[data-delete]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm(`Deactivate "${a.dataset.name}"?`)) return;
            const res = await Api.post('/DepartmentsAPI.php?action=delete', { department_id: parseInt(a.dataset.delete) });
            if (res.success) renderList(container);
            else alert(res.message);
        });
    });
}

function openModal(container, dept = null) {
    const isEdit = !!dept;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const campusOpts = campuses.map(c => `<option value="${c.campus_id}" ${dept && dept.campus_id==c.campus_id?'selected':''}>${esc(c.campus_name)}</option>`).join('');

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${isEdit ? 'Edit Department' : 'Add Department'}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Campus *</label>
                        <select class="form-select" id="m-campus"><option value="">Select Campus</option>${campusOpts}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Code *</label>
                        <input class="form-input" id="m-code" value="${esc(dept?.department_code||'')}" placeholder="e.g., CIT">
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Department Name *</label>
                        <input class="form-input" id="m-name" value="${esc(dept?.department_name||'')}" placeholder="e.g., College of Information Technology">
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Description</label>
                        <textarea class="form-textarea" id="m-desc" rows="3">${esc(dept?.description||'')}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="m-status">
                            <option value="active" ${dept?.status==='active'||!dept?'selected':''}>Active</option>
                            <option value="inactive" ${dept?.status==='inactive'?'selected':''}>Inactive</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update' : 'Create'} Department</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const payload = {
            campus_id: overlay.querySelector('#m-campus').value,
            department_code: overlay.querySelector('#m-code').value,
            department_name: overlay.querySelector('#m-name').value,
            description: overlay.querySelector('#m-desc').value,
            status: overlay.querySelector('#m-status').value,
        };
        if (isEdit) payload.department_id = dept.id;

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/DepartmentsAPI.php?action=${action}`, payload);

        if (res.success) {
            overlay.remove();
            renderList(container);
        } else {
            overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
