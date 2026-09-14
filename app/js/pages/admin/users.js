/**
 * Admin Users Page
 * Full CRUD for user management
 */
import { Api } from '../../api.js';
import { L } from '../../utils/action-labels.js';
import { notify } from '../../utils/notify.js';
import { validatePassword, attachStrengthMeter } from '../../utils/password-change-otp.js';
import { icon } from '../../utils/icons.js';

import { esc } from '../../utils/classroom-ui.js';
let departments = [];
let programs = [];
let campuses = [];

export async function render(container) {
    // Load dropdown data
    const [deptRes, progRes, campRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=departments'),
        Api.get('/UsersAPI.php?action=programs'),
        Api.get('/UsersAPI.php?action=campuses'),
    ]);
    departments = deptRes.success ? deptRes.data : [];
    programs    = progRes.success ? progRes.data : [];
    campuses    = campRes.success ? campRes.data : [];

    renderList(container);
}

async function renderList(container, filters = {}) {
    const page = filters.page || 1;
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);
    params.set('page', page);
    params.set('per_page', 20);

    const result = await Api.get('/UsersAPI.php?action=list&' + params.toString());
    const users = result.success ? result.data.users : [];
    const total = result.success ? result.data.total : 0;
    const totalPages = result.success ? (result.data.total_pages || 1) : 1;
    const currentPage = result.success ? (result.data.page || 1) : 1;

    container.innerHTML = `
        <style>
            .users-header { display:flex; justify-content:flex-end; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .users-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .users-header .count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            .filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .filters input, .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; }
            .filters input { min-width:240px; }
            .filters .clear-btn { color:#00461B; font-size:13px; cursor:pointer; text-decoration:underline; }

            .users-pagination { display:flex; justify-content:space-between; align-items:center; margin-top:16px; flex-wrap:wrap; gap:12px; }
            .up-info { font-size:13px; color:#6b7280; }
            .up-controls { display:flex; gap:8px; }
            .up-btn { background:#fff; border:1.5px solid #e5e7eb; color:#374151; padding:8px 16px; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; transition:all .15s; }
            .up-btn:hover:not(:disabled) { border-color:#00461B; color:#00461B; background:#f0fdf4; }
            .up-btn:disabled { opacity:.4; cursor:not-allowed; }

            /* Table look shared with the Dean's Faculty table (dean/instructors.js
               .di-table) so "list of user" tables read as the same component
               everywhere in the system — dark-green header, 2px outer border,
               row dividers, visible row-action buttons instead of a kebab menu. */
            .table-wrap { background:#fff; border:2px solid #111; border-radius:14px; overflow-x:auto; -webkit-overflow-scrolling:touch; }
            .users-table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; }
            .users-table th {
                background:#00461B; color:#fff; font-size:11px; font-weight:700;
                text-transform:uppercase; letter-spacing:0.4px; padding:12px 16px;
                border-bottom:2px solid #111; border-right:1px solid #111; text-align:left;
            }
            .users-table th:last-child { border-right:none; }
            .users-table tbody tr { border-bottom:1px solid #F3F4F6; transition:background .15s; }
            .users-table tbody tr:last-child { border-bottom:none; }
            .users-table tbody tr:hover { background:#F9FAFB; }
            .users-table td { padding:12px 16px; vertical-align:middle; font-size:13px; color:#374151; border-right:1px solid #E5E7EB; }
            .users-table td:last-child { border-right:none; }

            .user-cell { display:flex; align-items:center; gap:12px; }
            .user-av { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; background:none; color:#6B7280; }
            .user-name { font-weight:600; color:#262626; display:block; }
            .user-email { font-size:12px; color:#a0a0a0; display:block; margin-top:1px; }

            .badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:capitalize; }
            .badge-admin { background:#D1FAE5; color:#065F46; }
            .badge-dean { background:#FEF3C7; color:#92400E; }
            .badge-program_head { background:#FFE4D6; color:#9A3412; }
            .badge-instructor { background:#DBEAFE; color:#1E40AF; }
            .badge-student { background:#EDE9FE; color:#5B21B6; }
            .badge-active { background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .badge-inactive { background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .badge-pending { background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }

            .actions-cell { display:flex; gap:6px; }
            .btn-row { border:none; border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer; font-weight:600; }
            .btn-row-danger { background:#FEE2E2; color:#b91c1c; }
            .btn-row-danger:hover { background:#FECACA; }
            .btn-row-success { background:#E8F5E9; color:#1B4D3E; }
            .btn-row-success:hover { background:#C6F6D5; }
            .btn-row-edit { background:#F3F4F6; color:#374151; }
            .btn-row-edit:hover { background:#E5E7EB; }

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
            <button class="btn-primary" id="btn-add-user">+ Add User</button>
        </div>

        <div class="filters">
            <input type="text" id="filter-search" placeholder="Search name, email, ID..." value="${esc(filters.search || '')}">
            <select id="filter-role">
                <option value="">All Roles</option>
                <option value="admin" ${filters.role==='admin'?'selected':''}>Admin</option>
                <option value="dean" ${filters.role==='dean'?'selected':''}>Dean</option>
                <option value="program_head" ${filters.role==='program_head'?'selected':''}>Program Head</option>
                <option value="instructor" ${filters.role==='instructor'?'selected':''}>Instructor</option>
                <option value="student" ${filters.role==='student'?'selected':''}>Student</option>
            </select>
            <select id="filter-status">
                <option value="">All Status</option>
                <option value="active" ${filters.status==='active'?'selected':''}>Active</option>
                <option value="inactive" ${filters.status==='inactive'?'selected':''}>Inactive</option>
            </select>
            ${(filters.search || filters.role || filters.status) ? '<span class="clear-btn" id="clear-filters">Clear filters</span>' : ''}
        </div>

        <div class="table-wrap">
        <table class="users-table">
            <thead>
                <tr>
                    <th>User</th>
                    <th>ID</th>
                    <th>Role</th>
                    <th>Dept / Program</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.length === 0 ? '<tr><td colspan="7"><div class="empty-state-sm">No users found</div></td></tr>' :
                  users.map(u => {
                    const id = u.employee_id || u.student_id || '—';
                    const campusLabel = u.role === 'dean' && u.campus_name
                        ? `<span title="${esc(u.campus_name)}" style="font-size:11px;color:#6B7280;display:block;">${esc(u.campus_name)}</span>`
                        : '';
                    // Spell the program out — the sheet a user was imported from
                    // often carries only the short code ("BSIT"), but the table
                    // should read as the full program name.
                    const deptProg = u.department_name || u.program_name || u.program_code || '—';
                    const date = new Date(u.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
                    // Whether the person has actually set their own password yet — logged in
                    // and engaged with the account — vs still sitting on the system-issued
                    // temp password (NULL password = first-login-by-ID-only case;
                    // must_change_password=1 = bulk-import temp-password case). This takes
                    // priority over the raw account status: an account an admin marked
                    // 'active' that the person has never actually logged into is still,
                    // from anyone reading this table, "not activated" — showing both at
                    // once read as two contradictory statuses on the same row.
                    const notActivated = (u.never_logged_in == 1 || u.never_logged_in === true) || (u.on_temp_password == 1 || u.on_temp_password === true);
                    const isActive = u.status === 'active';
                    const statusBadge = notActivated
                        ? `<span class="badge badge-pending" title="Hasn't logged in and set a real password yet">Not activated</span>`
                        : `<span class="badge badge-${u.status}">${u.status}</span>`;
                    return `
                        <tr>
                            <td><div class="user-cell"><div class="user-av ${u.role}">${icon('user', { size: 18 })}</div><div><span class="user-name">${esc(u.first_name+' '+u.last_name)}</span><span class="user-email">${esc(u.email)}</span></div></div></td>
                            <td>${esc(id)}</td>
                            <td><span class="badge badge-${u.role}">${u.role === 'program_head' ? 'Program Head' : u.role}</span></td>
                            <td>${esc(deptProg)}${campusLabel}</td>
                            <td>${statusBadge}</td>
                            <td style="color:#737373;font-size:13px">${date}</td>
                            <td class="actions-cell">
                                <button class="btn-row btn-row-edit" data-edit="${u.users_id}">${L.editUser}</button>
                                <button class="btn-row btn-row-edit" data-chpw="${u.users_id}" data-name="${esc(u.first_name+' '+u.last_name)}" title="Change Password">${icon('key',{size:12,className:'ui-icon-inline'})}</button>
                                <button class="btn-row ${isActive ? 'btn-row-danger' : 'btn-row-success'}"
                                    data-toggle="${u.users_id}" data-active="${isActive}" data-name="${esc(u.first_name+' '+u.last_name)}">
                                    ${isActive ? L.deactivate : 'Activate'}
                                </button>
                            </td>
                        </tr>`;
                  }).join('')}
            </tbody>
        </table>
        </div>

        ${totalPages > 1 ? `
        <div class="users-pagination">
            <span class="up-info">Page ${currentPage} of ${totalPages} &middot; ${total} user${total !== 1 ? 's' : ''}</span>
            <div class="up-controls">
                <button class="up-btn" id="up-prev" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Prev</button>
                <button class="up-btn" id="up-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
            </div>
        </div>` : ''}
    `;

    // Event: Add user
    container.querySelector('#btn-add-user').addEventListener('click', () => openModal(container));

    // Event: Filters
    // renderList() rebuilds the whole container (including a brand-new
    // #filter-search element) every time it runs, which happens on every
    // debounce fire here — so the OLD input loses focus underneath the
    // user's cursor, and unless it's explicitly restored below, they have
    // to click back into the box before typing each next character (looked
    // like search only accepted "one letter at a time").
    let debounce;
    container.querySelector('#filter-search').addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            filters.search = e.target.value;
            filters.page = 1;
            await renderList(container, filters);
            const freshInput = container.querySelector('#filter-search');
            if (freshInput) {
                freshInput.focus();
                const pos = freshInput.value.length;
                freshInput.setSelectionRange(pos, pos);
            }
        }, 400);
    });
    container.querySelector('#filter-role').addEventListener('change', (e) => {
        filters.role = e.target.value;
        filters.page = 1;
        renderList(container, filters);
    });
    container.querySelector('#filter-status').addEventListener('change', (e) => {
        filters.status = e.target.value;
        filters.page = 1;
        renderList(container, filters);
    });
    const clearBtn = container.querySelector('#clear-filters');
    if (clearBtn) clearBtn.addEventListener('click', () => renderList(container, {}));

    // Event: Pagination
    const prevBtn = container.querySelector('#up-prev');
    const nextBtn = container.querySelector('#up-next');
    if (prevBtn) prevBtn.addEventListener('click', () => {
        filters.page = currentPage - 1;
        renderList(container, filters);
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        filters.page = currentPage + 1;
        renderList(container, filters);
    });

    // Event: Edit
    container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const res = await Api.get('/UsersAPI.php?action=get&id=' + btn.dataset.edit);
            if (res.success) openModal(container, res.data);
        });
    });

    // Event: Activate / Deactivate toggle (same UsersAPI.php?action=deactivate
    // endpoint the Dean's Faculty table uses — it flips `status` either way,
    // so it also covers reactivating a pending or previously-inactive account).
    container.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const active = btn.dataset.active === 'true';
            const verb = active ? 'Deactivate' : 'Activate';
            if (!await notify.confirm(`${verb} user "${btn.dataset.name}"?`, { danger: active, confirmText: verb })) return;
            btn.disabled = true;
            const res = await Api.post('/UsersAPI.php?action=deactivate', {
                users_id: parseInt(btn.dataset.toggle), status: active ? 'inactive' : 'active'
            });
            if (res.success) renderList(container, filters);
            else { notify.error(res.message); btn.disabled = false; }
        });
    });

    // Event: Change Password
    container.querySelectorAll('[data-chpw]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openChangePasswordModal(container, parseInt(a.dataset.chpw), a.dataset.name);
        });
    });
}

function openModal(container, user = null) {
    const isEdit = !!user;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // Existing campus IDs for this dean (for edit mode)
    const existingCampusIds = (user?.campus_ids && user.campus_ids.length > 0)
        ? user.campus_ids
        : (user?.campus_id ? [user.campus_id] : []);
    const isMultiCampus = existingCampusIds.length > 1;

    const deptOptions = departments.map(d =>
        `<option value="${d.department_id}" ${user && user.department_id==d.department_id?'selected':''}>${esc(d.department_name)}${d.campus_name ? ` (${esc(d.campus_name)})` : ''}</option>`
    ).join('');
    const progOptions = programs.map(p =>
        `<option value="${p.program_id}" ${user && user.program_id==p.program_id?'selected':''}>${esc(p.program_code)} - ${esc(p.program_name)}</option>`
    ).join('');

    // Campus scope section (shown only for dean role)
    const campusCheckboxes = campuses.map(c => `
        <label class="cs-campus-check">
            <input type="checkbox" class="cs-campus-cb" value="${c.campus_id}"
                ${existingCampusIds.includes(c.campus_id) || existingCampusIds.includes(String(c.campus_id)) ? 'checked' : ''}>
            <span><strong>${esc(c.campus_name)}</strong>${c.campus_code ? ` <em>(${esc(c.campus_code)})</em>` : ''}</span>
        </label>`).join('');

    const campusScopeHtml = `
        <div class="form-group full" id="campus-scope-group" style="display:none;">
            <label class="form-label">Campus Scope</label>
            <div class="cs-scope-box">
                <div class="cs-radio-row">
                    <label class="cs-radio">
                        <input type="radio" name="cs-mode" value="single" ${!isMultiCampus ? 'checked' : ''}>
                        <span>
                            <strong>This campus only</strong>
                            <small>Dean manages their assigned campus</small>
                        </span>
                    </label>
                    <label class="cs-radio">
                        <input type="radio" name="cs-mode" value="multi" ${isMultiCampus ? 'checked' : ''}>
                        <span>
                            <strong>Multiple campuses</strong>
                            <small>Same department across 2 or 3 campuses</small>
                        </span>
                    </label>
                </div>
                <div id="cs-single-wrap" ${isMultiCampus ? 'style="display:none"' : ''}>
                    <select class="form-select" id="cs-single-campus">
                        <option value="">— Select campus —</option>
                        ${campuses.map(c => `<option value="${c.campus_id}" ${!isMultiCampus && String(user?.campus_id) === String(c.campus_id) ? 'selected' : ''}>${esc(c.campus_name)}${c.campus_code ? ` (${esc(c.campus_code)})` : ''}</option>`).join('')}
                    </select>
                </div>
                <div id="cs-multi-wrap" ${!isMultiCampus ? 'style="display:none"' : ''}>
                    <p style="font-size:12px;color:#6B7280;margin:0 0 8px;">Select 2 or 3 campuses that share the same department:</p>
                    <div class="cs-campus-list">${campusCheckboxes}</div>
                    <p class="cs-multi-hint" id="cs-multi-hint" style="display:none;"></p>
                </div>
            </div>
            <div class="form-hint">Controls which campuses this dean can manage. Department (above) sets the shared department across selected campuses.</div>
        </div>`;

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
                        <label class="form-label">Middle Name</label>
                        <input class="form-input" id="m-middle" value="${esc(user?.middle_name||'')}" placeholder="Optional">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name *</label>
                        <input class="form-input" id="m-last" value="${esc(user?.last_name||'')}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Extension / Suffix</label>
                        <input class="form-input" id="m-suffix" value="${esc(user?.suffix||'')}" placeholder="Jr., Sr., III…">
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
                            <option value="student"      ${user?.role==='student'     ?'selected':''}>Student</option>
                            <option value="instructor"   ${user?.role==='instructor'  ?'selected':''}>Instructor</option>
                            <option value="program_head" ${user?.role==='program_head'?'selected':''}>Program Head</option>
                            <option value="dean"         ${user?.role==='dean'        ?'selected':''}>Dean</option>
                            <option value="admin"        ${user?.role==='admin'       ?'selected':''}>Admin</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="m-status">
                            <option value="active"   ${user?.status==='active'  ?'selected':''}>Active</option>
                            <option value="inactive" ${user?.status==='inactive'?'selected':''}>Inactive</option>
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
                        <div class="form-hint">Required for Dean/Program Head/Instructor</div>
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
                    ${campusScopeHtml}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update User' : 'Create User'}</button>
            </div>
        </div>
        <style>
            .cs-scope-box {
                border:1px solid #E0E0E0; border-radius:10px; padding:14px 16px;
                background:#FAFAFA; display:flex; flex-direction:column; gap:12px;
            }
            .cs-radio-row { display:flex; gap:10px; flex-wrap:wrap; }
            .cs-radio {
                flex:1; min-width:180px; display:flex; align-items:flex-start; gap:10px;
                padding:10px 12px; border:1.5px solid #E0E0E0; border-radius:8px;
                cursor:pointer; background:#fff; transition:border-color .15s;
            }
            .cs-radio:has(input:checked) { border-color:#00461B; background:#F0FDF4; }
            .cs-radio input { accent-color:#00461B; margin-top:2px; flex-shrink:0; }
            .cs-radio strong { display:block; font-size:13px; color:#202124; }
            .cs-radio small  { display:block; font-size:11px; color:#9AA0A6; margin-top:1px; }
            .cs-campus-list {
                display:flex; flex-direction:column; gap:6px;
            }
            .cs-campus-check {
                display:flex; align-items:center; gap:8px;
                padding:8px 10px; border:1px solid #E5E7EB; border-radius:8px;
                background:#fff; cursor:pointer; font-size:13px; color:#374151;
            }
            .cs-campus-check:has(input:checked) { border-color:#00461B; background:#F0FDF4; }
            .cs-campus-check input { accent-color:#00461B; }
            .cs-campus-check em { font-style:normal; color:#9AA0A6; font-size:12px; }
            .cs-multi-hint { font-size:12px; margin:4px 0 0; }
            .cs-multi-hint.warn { color:#b45309; }
            .cs-multi-hint.ok   { color:#15803d; }
        </style>
    `;

    document.body.appendChild(overlay);

    const roleSelect       = overlay.querySelector('#m-role');
    const deptSelect       = overlay.querySelector('#m-dept');
    const progSelect       = overlay.querySelector('#m-prog');
    const scopeGroup       = overlay.querySelector('#campus-scope-group');
    const singleWrap       = overlay.querySelector('#cs-single-wrap');
    const multiWrap        = overlay.querySelector('#cs-multi-wrap');
    const singleSelect     = overlay.querySelector('#cs-single-campus');
    const multiHint        = overlay.querySelector('#cs-multi-hint');

    function updateRoleFields() {
        const r = roleSelect.value;
        overlay.querySelector('#emp-id-group').style.display = r === 'student' ? 'none' : '';
        overlay.querySelector('#stu-id-group').style.display = r === 'student' ? '' : 'none';
        overlay.querySelector('#year-group').style.display   = r === 'student' ? '' : 'none';
        scopeGroup.style.display = r === 'dean' ? '' : 'none';
    }

    function updateScopeMode() {
        const mode = overlay.querySelector('input[name="cs-mode"]:checked')?.value;
        singleWrap.style.display = mode === 'single' ? '' : 'none';
        multiWrap.style.display  = mode === 'multi'  ? '' : 'none';
        updateMultiHint();
    }

    function updateMultiHint() {
        const checked = [...overlay.querySelectorAll('.cs-campus-cb:checked')];
        if (checked.length === 0) {
            multiHint.className = 'cs-multi-hint warn'; multiHint.style.display = '';
            multiHint.textContent = 'Select at least 2 campuses.';
        } else if (checked.length === 1) {
            multiHint.className = 'cs-multi-hint warn'; multiHint.style.display = '';
            multiHint.textContent = 'Select at least 2 campuses for multi-campus scope.';
        } else {
            multiHint.className = 'cs-multi-hint ok'; multiHint.style.display = '';
            multiHint.textContent = `${checked.length} campuses selected — dean will manage this department across all ${checked.length} campuses.`;
        }
    }

    function filterPrograms() {
        const selectedDept = deptSelect.value;
        const currentProg = progSelect.value;
        const allOpts = programs.map(p => {
            const show = !selectedDept || String(p.department_id) === String(selectedDept);
            return show ? `<option value="${p.program_id}" ${currentProg==p.program_id?'selected':''}>${esc(p.program_code)} - ${esc(p.program_name)}</option>` : '';
        }).join('');
        progSelect.innerHTML = '<option value="">Select Program</option>' + allOpts;
    }

    function syncDeptFromProgram() {
        const selectedProg = progSelect.value;
        if (selectedProg) {
            const prog = programs.find(p => String(p.program_id) === String(selectedProg));
            if (prog && prog.department_id) deptSelect.value = prog.department_id;
        }
    }

    roleSelect.addEventListener('change', updateRoleFields);
    deptSelect.addEventListener('change', filterPrograms);
    progSelect.addEventListener('change', syncDeptFromProgram);
    overlay.querySelectorAll('input[name="cs-mode"]').forEach(r => r.addEventListener('change', updateScopeMode));
    overlay.querySelectorAll('.cs-campus-cb').forEach(cb => cb.addEventListener('change', updateMultiHint));

    updateRoleFields();
    filterPrograms();
    updateScopeMode();

    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    attachStrengthMeter(overlay.querySelector('#m-password'));

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#modal-alert');
        const pass    = overlay.querySelector('#m-password').value;
        const role    = overlay.querySelector('#m-role').value;

        if (pass) {
            const pwErr = validatePassword(pass);
            if (pwErr) { alertEl.innerHTML = `<div class="alert alert-error">${pwErr}</div>`; return; }
        } else if (!isEdit) {
            alertEl.innerHTML = `<div class="alert alert-error">Password is required.</div>`; return;
        }

        // Collect campus IDs for dean
        let campusId  = null;
        let campusIds = null;

        if (role === 'dean') {
            const mode = overlay.querySelector('input[name="cs-mode"]:checked')?.value;
            if (mode === 'multi') {
                campusIds = [...overlay.querySelectorAll('.cs-campus-cb:checked')].map(cb => parseInt(cb.value));
                if (campusIds.length < 2) {
                    alertEl.innerHTML = `<div class="alert alert-error">Select at least 2 campuses for multi-campus scope.</div>`; return;
                }
                campusId = campusIds[0];
            } else {
                campusId  = parseInt(singleSelect.value) || null;
                campusIds = campusId ? [campusId] : [];
            }
        }

        const payload = {
            first_name:    overlay.querySelector('#m-first').value.trim(),
            middle_name:   overlay.querySelector('#m-middle').value.trim() || null,
            last_name:     overlay.querySelector('#m-last').value.trim(),
            suffix:        overlay.querySelector('#m-suffix').value.trim() || null,
            email:         overlay.querySelector('#m-email').value,
            password:      pass,
            role,
            status:        overlay.querySelector('#m-status').value,
            employee_id:   overlay.querySelector('#m-empid').value,
            student_id:    overlay.querySelector('#m-stuid').value,
            department_id: overlay.querySelector('#m-dept').value || null,
            program_id:    overlay.querySelector('#m-prog').value || null,
            year_level:    overlay.querySelector('#m-year').value || null,
        };

        if (role === 'dean') {
            payload.campus_id  = campusId;
            payload.campus_ids = campusIds;
        } else {
            payload.campus_id  = null;
        }

        if (isEdit) payload.users_id = user.users_id;

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/UsersAPI.php?action=${action}`, payload);

        if (res.success) {
            overlay.remove();
            render(container);
        } else {
            alertEl.innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });
}

function openChangePasswordModal(container, userId, userName) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:420px;">
            <div class="modal-header">
                <h3>Change Password</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">Setting a new password for <strong>${esc(userName)}</strong>.</p>
                <div id="cp-alert"></div>
                <div class="form-group">
                    <label class="form-label">New Password *</label>
                    <input type="password" class="form-input" id="cp-pw" placeholder="Min. 8 characters" maxlength="128" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label class="form-label">Confirm New Password *</label>
                    <input type="password" class="form-input" id="cp-confirm" placeholder="Repeat new password" maxlength="128" autocomplete="new-password">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="cp-save">Update Password</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    attachStrengthMeter(overlay.querySelector('#cp-pw'));

    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#cp-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#cp-alert');
        const pw = overlay.querySelector('#cp-pw').value;
        const confirm = overlay.querySelector('#cp-confirm').value;
        const btn = overlay.querySelector('#cp-save');

        const pwErr = validatePassword(pw);
        if (pwErr) { alertEl.innerHTML = `<div class="alert alert-error">${pwErr}</div>`; return; }
        if (pw !== confirm) { alertEl.innerHTML = `<div class="alert alert-error">Passwords do not match.</div>`; return; }

        btn.disabled = true; btn.textContent = 'Saving...';
        const res = await Api.post('/UsersAPI.php?action=set-password', { users_id: userId, new_password: pw });
        btn.disabled = false; btn.textContent = 'Update Password';

        if (res.success) {
            overlay.remove();
            notify.success(res.message || 'Password updated successfully.');
        } else {
            alertEl.innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });
}
