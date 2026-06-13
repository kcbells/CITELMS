/**
 * Admin Users Page
 * Full CRUD for user management
 */
import { Api } from '../../api.js';
import { L } from '../../utils/action-labels.js';

let departments = [];
let programs = [];

export async function render(container) {
    // Load dropdown data
    const [deptRes, progRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=departments'),
        Api.get('/UsersAPI.php?action=programs')
    ]);
    departments = deptRes.success ? deptRes.data : [];
    programs = progRes.success ? progRes.data : [];

    renderList(container);
}

async function renderList(container, filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);

    const result = await Api.get('/UsersAPI.php?action=list&' + params.toString());
    const users = result.success ? result.data.users : [];
    const total = result.success ? result.data.total : 0;

    container.innerHTML = `
        <style>
            .users-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .users-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .users-header .count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            .filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .filters input, .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; }
            .filters input { min-width:240px; }
            .filters .clear-btn { color:#00461B; font-size:13px; cursor:pointer; text-decoration:underline; }

            .users-table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; border:2px solid #1B4D3E; }
            .users-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .users-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .users-table tr:last-child td { border-bottom:none; }
            .users-table tr:hover td { background:#f9fffe; }

            .user-cell { display:flex; align-items:center; gap:12px; }
            .user-av { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
            .user-av.admin { background:#D1FAE5; color:#065F46; }
            .user-av.dean { background:#FEF3C7; color:#92400E; }
            .user-av.instructor { background:#DBEAFE; color:#1E40AF; }
            .user-av.student { background:#EDE9FE; color:#5B21B6; }
            .user-name { font-weight:600; color:#262626; display:block; }
            .user-email { font-size:12px; color:#737373; display:block; }

            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-admin { background:#D1FAE5; color:#065F46; }
            .badge-dean { background:#FEF3C7; color:#92400E; }
            .badge-instructor { background:#DBEAFE; color:#1E40AF; }
            .badge-student { background:#EDE9FE; color:#5B21B6; }
            .badge-active { background:#E8F5E9; color:#1B4D3E; }
            .badge-inactive { background:#FEE2E2; color:#b91c1c; }
            .badge-pending { background:#FEF3C7; color:#B45309; }

            .actions-cell { position:relative; }
            .btn-actions { background:none; border:1px solid #e0e0e0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
            .btn-actions:hover { background:#f5f5f5; }
            .actions-dropdown { display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:160px; z-index:50; overflow:hidden; }
            .actions-dropdown.show { display:block; }
            .actions-dropdown a { display:flex; align-items:center; gap:8px; padding:10px 16px; font-size:13px; color:#404040; cursor:pointer; text-decoration:none; }
            .actions-dropdown a:hover { background:#f5f5f5; }
            .actions-dropdown a.danger { color:#b91c1c; }
            .actions-dropdown .divider { height:1px; background:#f0f0f0; margin:4px 0; }

            /* Modal */
            .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
            .modal { background:#fff; border-radius:16px; width:90%; max-width:600px; max-height:90vh; overflow-y:auto; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; color:#262626; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; padding:0; line-height:1; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }

            .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .form-group { margin-bottom:16px; }
            .form-group.full { grid-column:1/-1; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input, .form-select { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; }
            .form-input:focus, .form-select:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
            .radio-group { display:flex; gap:16px; margin-top:6px; }
            .radio-group label { display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer; }
            .form-hint { font-size:12px; color:#737373; margin-top:4px; }

            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .btn-secondary:hover { background:#e8e8e8; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-success { background:#E8F5E9; color:#1B4D3E; border:1px solid #A7F3D0; }
            .alert-error { background:#FEE2E2; color:#b91c1c; border:1px solid #FECACA; }

            .empty-state-sm { text-align:center; padding:40px; color:#737373; }

            @media(max-width:768px) { .form-grid { grid-template-columns:1fr; } .filters { flex-direction:column; } .filters input { min-width:100%; } }
        </style>

        <div class="users-header">
            <h2>Users <span class="count">${total}</span></h2>
            <button class="btn-primary" id="btn-add-user">+ Add User</button>
        </div>

        <div class="filters">
            <input type="text" id="filter-search" placeholder="Search name, email, ID..." value="${esc(filters.search || '')}">
            <select id="filter-role">
                <option value="">All Roles</option>
                <option value="admin" ${filters.role==='admin'?'selected':''}>Admin</option>
                <option value="dean" ${filters.role==='dean'?'selected':''}>Dean</option>
                <option value="instructor" ${filters.role==='instructor'?'selected':''}>Instructor</option>
                <option value="student" ${filters.role==='student'?'selected':''}>Student</option>
            </select>
            <select id="filter-status">
                <option value="">All Status</option>
                <option value="active" ${filters.status==='active'?'selected':''}>Active</option>
                <option value="inactive" ${filters.status==='inactive'?'selected':''}>Inactive</option>
                <option value="pending" ${filters.status==='pending'?'selected':''}>Pending</option>
            </select>
            ${(filters.search || filters.role || filters.status) ? '<span class="clear-btn" id="clear-filters">Clear filters</span>' : ''}
        </div>

        <table class="users-table">
            <thead>
                <tr>
                    <th>User</th>
                    <th>ID</th>
                    <th>Role</th>
                    <th>Dept / Program</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${users.length === 0 ? '<tr><td colspan="7"><div class="empty-state-sm">No users found</div></td></tr>' :
                  users.map(u => {
                    const initials = ((u.first_name||'?')[0] + (u.last_name||'?')[0]).toUpperCase();
                    const id = u.employee_id || u.student_id || '—';
                    const deptProg = u.department_name || u.program_code || '—';
                    const date = new Date(u.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
                    return `
                        <tr>
                            <td><div class="user-cell"><div class="user-av ${u.role}">${initials}</div><div><span class="user-name">${esc(u.first_name+' '+u.last_name)}</span><span class="user-email">${esc(u.email)}</span></div></div></td>
                            <td>${esc(id)}</td>
                            <td><span class="badge badge-${u.role}">${u.role}</span></td>
                            <td>${esc(deptProg)}</td>
                            <td><span class="badge badge-${u.status}">${u.status}</span></td>
                            <td style="color:#737373;font-size:13px">${date}</td>
                            <td class="actions-cell">
                                <button class="btn-actions" data-id="${u.users_id}">⋮</button>
                                <div class="actions-dropdown" data-dropdown="${u.users_id}">
                                    <a href="#" data-edit="${u.users_id}">${L.editUser}</a>
                                    <div class="divider"></div>
                                    <a href="#" class="danger" data-delete="${u.users_id}" data-name="${esc(u.first_name+' '+u.last_name)}">${L.deactivate}</a>
                                </div>
                            </td>
                        </tr>`;
                  }).join('')}
            </tbody>
        </table>
    `;

    // Event: Add user
    container.querySelector('#btn-add-user').addEventListener('click', () => openModal(container));

    // Event: Filters
    let debounce;
    container.querySelector('#filter-search').addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            filters.search = e.target.value;
            renderList(container, filters);
        }, 400);
    });
    container.querySelector('#filter-role').addEventListener('change', (e) => {
        filters.role = e.target.value;
        renderList(container, filters);
    });
    container.querySelector('#filter-status').addEventListener('change', (e) => {
        filters.status = e.target.value;
        renderList(container, filters);
    });
    const clearBtn = container.querySelector('#clear-filters');
    if (clearBtn) clearBtn.addEventListener('click', () => renderList(container, {}));

    // Event: Actions dropdowns
    container.querySelectorAll('.btn-actions').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            container.querySelector(`[data-dropdown="${id}"]`).classList.toggle('show');
        });
    });
    document.addEventListener('click', () => {
        container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
    }, { once: true });

    // Event: Edit
    container.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            const res = await Api.get('/UsersAPI.php?action=get&id=' + a.dataset.edit);
            if (res.success) openModal(container, res.data);
        });
    });

    // Event: Delete
    container.querySelectorAll('[data-delete]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm(`Deactivate user "${a.dataset.name}"?`)) return;
            const res = await Api.post('/UsersAPI.php?action=delete', { users_id: parseInt(a.dataset.delete) });
            if (res.success) renderList(container, filters);
            else alert(res.message);
        });
    });
}

function openModal(container, user = null) {
    const isEdit = !!user;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const deptOptions = departments.map(d => `<option value="${d.department_id}" ${user && user.department_id==d.department_id?'selected':''}>${esc(d.department_name)}</option>`).join('');
    const progOptions = programs.map(p => `<option value="${p.program_id}" ${user && user.program_id==p.program_id?'selected':''}>${esc(p.program_code)} - ${esc(p.program_name)}</option>`).join('');

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${isEdit ? 'Edit User' : 'Add User'}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">First Name *</label>
                        <input class="form-input" id="m-first" value="${esc(user?.first_name||'')}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name *</label>
                        <input class="form-input" id="m-last" value="${esc(user?.last_name||'')}" required>
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Email *</label>
                        <input type="email" class="form-input" id="m-email" value="${esc(user?.email||'')}" required>
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Password ${isEdit ? '(leave blank to keep)' : '*'}</label>
                        <input type="password" class="form-input" id="m-password" ${isEdit?'':'required'}>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Role *</label>
                        <select class="form-select" id="m-role">
                            <option value="student" ${user?.role==='student'?'selected':''}>Student</option>
                            <option value="instructor" ${user?.role==='instructor'?'selected':''}>Instructor</option>
                            <option value="dean" ${user?.role==='dean'?'selected':''}>Dean</option>
                            <option value="admin" ${user?.role==='admin'?'selected':''}>Admin</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="m-status">
                            <option value="active" ${user?.status==='active'?'selected':''}>Active</option>
                            <option value="inactive" ${user?.status==='inactive'?'selected':''}>Inactive</option>
                            <option value="pending" ${user?.status==='pending'?'selected':''}>Pending</option>
                        </select>
                    </div>
                    <div class="form-group" id="emp-id-group">
                        <label class="form-label">Employee ID</label>
                        <input class="form-input" id="m-empid" value="${esc(user?.employee_id||'')}">
                    </div>
                    <div class="form-group" id="stu-id-group" style="display:none">
                        <label class="form-label">Student ID</label>
                        <input class="form-input" id="m-stuid" value="${esc(user?.student_id||'')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Department</label>
                        <select class="form-select" id="m-dept">
                            <option value="">Select Department</option>
                            ${deptOptions}
                        </select>
                        <div class="form-hint">Required for Dean/Instructor</div>
                    </div>
                    <div class="form-group" id="prog-group">
                        <label class="form-label">Program</label>
                        <select class="form-select" id="m-prog">
                            <option value="">Select Program</option>
                            ${progOptions}
                        </select>
                        <div class="form-hint">Required for Student</div>
                    </div>
                    <div class="form-group" id="year-group">
                        <label class="form-label">Year Level</label>
                        <select class="form-select" id="m-year">
                            <option value="">Not Set</option>
                            <option value="1" ${user?.year_level=='1'?'selected':''}>1st Year</option>
                            <option value="2" ${user?.year_level=='2'?'selected':''}>2nd Year</option>
                            <option value="3" ${user?.year_level=='3'?'selected':''}>3rd Year</option>
                            <option value="4" ${user?.year_level=='4'?'selected':''}>4th Year</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update User' : 'Create User'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Role change handler
    const roleSelect = overlay.querySelector('#m-role');
    const deptSelect = overlay.querySelector('#m-dept');
    const progSelect = overlay.querySelector('#m-prog');

    function updateRoleFields() {
        const r = roleSelect.value;
        overlay.querySelector('#emp-id-group').style.display = r === 'student' ? 'none' : '';
        overlay.querySelector('#stu-id-group').style.display = r === 'student' ? '' : 'none';
        overlay.querySelector('#year-group').style.display = r === 'student' ? '' : 'none';
        // Program and Department always visible for all roles
    }

    // Filter programs by selected department
    function filterPrograms() {
        const selectedDept = deptSelect.value;
        const currentProg = progSelect.value;
        const allOpts = programs.map(p => {
            const show = !selectedDept || String(p.department_id) === String(selectedDept);
            return show ? `<option value="${p.program_id}" ${currentProg==p.program_id?'selected':''}>${esc(p.program_code)} - ${esc(p.program_name)}</option>` : '';
        }).join('');
        progSelect.innerHTML = '<option value="">Select Program</option>' + allOpts;
    }

    // Auto-set department when program is selected
    function syncDeptFromProgram() {
        const selectedProg = progSelect.value;
        if (selectedProg) {
            const prog = programs.find(p => String(p.program_id) === String(selectedProg));
            if (prog && prog.department_id) {
                deptSelect.value = prog.department_id;
            }
        }
    }

    roleSelect.addEventListener('change', updateRoleFields);
    deptSelect.addEventListener('change', filterPrograms);
    progSelect.addEventListener('change', syncDeptFromProgram);
    updateRoleFields();
    filterPrograms();

    // Close
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Save
    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const payload = {
            first_name: overlay.querySelector('#m-first').value,
            last_name: overlay.querySelector('#m-last').value,
            email: overlay.querySelector('#m-email').value,
            password: overlay.querySelector('#m-password').value,
            role: overlay.querySelector('#m-role').value,
            status: overlay.querySelector('#m-status').value,
            employee_id: overlay.querySelector('#m-empid').value,
            student_id: overlay.querySelector('#m-stuid').value,
            department_id: overlay.querySelector('#m-dept').value || null,
            program_id: overlay.querySelector('#m-prog').value || null,
            year_level: overlay.querySelector('#m-year').value || null,
        };

        if (isEdit) payload.users_id = user.users_id;

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/UsersAPI.php?action=${action}`, payload);

        if (res.success) {
            overlay.remove();
            render(container);
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
