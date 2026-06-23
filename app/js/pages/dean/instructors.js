/**
 * Dean Instructors Page
 * View, create, and manage instructors in dean's campus
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';
import { validatePassword, attachStrengthMeter } from '../../utils/password-change-otp.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let allInstructors = [];
let programsList   = [];
let departmentsList = [];

export async function render(container) {
    const [res, progRes, deptRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=list&role=instructor'),
        Api.get('/UsersAPI.php?action=programs'),
        Api.get('/UsersAPI.php?action=departments'),
    ]);
    allInstructors  = res.success     ? res.data.users : [];
    programsList    = progRes.success  ? progRes.data   : [];
    departmentsList = deptRes.success  ? deptRes.data   : [];

    const instructorPrograms = programsList.map(p => ({
        id: p.program_id, code: p.program_code, name: p.program_name
    }));

    container.innerHTML = `
        <style>
            .di-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .di-header h2 { font-size:22px; font-weight:700; color:#262626; margin:0; }
            .di-count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }

            .btn-add-instructor { background:#1B4D3E; color:#fff; border:none; border-radius:8px; padding:9px 18px; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; }
            .btn-add-instructor:hover { background:#00461B; }

            .di-filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .di-filters input, .di-filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; }
            .di-filters input:focus, .di-filters select:focus { outline:none; border-color:#1B4D3E; }
            .di-filters input { min-width:260px; }
            .di-filters select { min-width:180px; }

            .di-stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:14px; margin-bottom:24px; }
            .di-stat { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:16px; display:flex; align-items:center; gap:12px; }
            .di-stat-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
            .di-stat-icon.blue { background:#DBEAFE; }
            .di-stat-icon.green { background:#E8F5E9; }
            .di-stat-icon.amber { background:#FEF3C7; }
            .di-stat-val { font-size:22px; font-weight:800; color:#262626; line-height:1.1; }
            .di-stat-label { font-size:12px; color:#737373; margin-top:2px; }

            .di-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; border:1.5px solid #374151; }
            .di-table th { background:#2d6a4f; color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:8px 14px; border:1px solid #155534; text-align:left; }
            .di-table tbody tr:nth-child(even) { background:#f9fafb; }
            .di-table tbody tr:hover { background:#f0fdf4; }
            .di-table td { border:1px solid #d1d5db; padding:8px 12px; vertical-align:middle; font-size:13px; color:#374151; }

            .di-user { display:flex; align-items:center; gap:12px; }
            .di-av { width:40px; height:40px; border-radius:50%; background:#1e40af; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
            .di-name { font-weight:600; color:#262626; display:block; }
            .di-email { font-size:12px; color:#a0a0a0; display:block; margin-top:1px; }
            .di-empid { font-family:monospace; font-size:13px; color:#404040; }
            .di-prog { display:inline-block; padding:3px 10px; border-radius:8px; font-size:11px; font-weight:600; background:#EDE9FE; color:#5B21B6; }
            .di-prog.none { background:#f5f5f5; color:#a0a0a0; }
            .di-campus { font-size:11px; color:#1B4D3E; background:#E8F5E9; padding:2px 8px; border-radius:8px; font-weight:600; }

            .badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:capitalize; }
            .badge-active { background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .badge-inactive { background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .badge-pending { background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }

            .di-actions { display:flex; gap:6px; }
            .btn-row { border:none; border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer; font-weight:600; }
            .btn-row-danger { background:#FEE2E2; color:#b91c1c; }
            .btn-row-danger:hover { background:#FECACA; }
            .btn-row-success { background:#E8F5E9; color:#1B4D3E; }
            .btn-row-success:hover { background:#C6F6D5; }

            .di-empty { text-align:center; padding:48px 20px; color:#a0a0a0; }
            .di-empty-icon { font-size:36px; margin-bottom:10px; }
            .di-empty-text { font-size:15px; font-weight:500; }

            /* Modal — matches admin/sign-in design */
            .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
            .modal { background:#fff; border-radius:16px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; color:#262626; margin:0; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; padding:0; line-height:1; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }
            .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .form-group { margin-bottom:16px; }
            .form-group.full { grid-column:1/-1; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input, .form-select { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; background:#fff; }
            .form-input:focus, .form-select:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
            .di-readonly-field { background:#F3F4F6 !important; color:#6B7280; cursor:default; border-color:#E5E7EB !important; }
            .di-pw-wrap { position:relative; display:block; }
            .di-pw-wrap > .form-input { padding-right:40px; }
            .di-pw-eye { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#9CA3AF; padding:0; display:flex; align-items:center; transition:color .15s; }
            .di-pw-eye:hover { color:#1B4D3E; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; display:none; }
            .alert.alert-success { background:#E8F5E9; color:#1B4D3E; border:1px solid #A7F3D0; display:block; }
            .alert.alert-error { background:#FEE2E2; color:#b91c1c; border:1px solid #FECACA; display:block; }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .btn-secondary:hover { background:#e8e8e8; }
            .btn-primary { background:#1B4D3E; color:#fff; border:none; border-radius:8px; padding:9px 20px; font-size:14px; font-weight:600; cursor:pointer; }
            .btn-primary:hover { background:#00461B; }
            .btn-primary:disabled { opacity:.6; cursor:not-allowed; }

            @media(max-width:768px) {
                .di-filters { flex-direction:column; }
                .di-filters input, .di-filters select { min-width:100%; }
                .di-stats { grid-template-columns:1fr 1fr; }
                .form-grid { grid-template-columns:1fr; }
            }
        </style>

        <div class="di-header">
            <h2>Instructors <span class="di-count" id="di-total">${allInstructors.length}</span></h2>
            <button class="btn-add-instructor" id="di-add-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Instructor
            </button>
        </div>

        <div class="di-stats">
            <div class="di-stat">
                <div class="di-stat-icon blue">${icon('instructor', { size: 22 })}</div>
                <div>
                    <div class="di-stat-val">${allInstructors.length}</div>
                    <div class="di-stat-label">Total Instructors</div>
                </div>
            </div>
            <div class="di-stat">
                <div class="di-stat-icon green">${icon('check', { size: 22 })}</div>
                <div>
                    <div class="di-stat-val">${allInstructors.filter(i => i.status === 'active').length}</div>
                    <div class="di-stat-label">Active</div>
                </div>
            </div>
            <div class="di-stat">
                <div class="di-stat-icon amber">${icon('book', { size: 22 })}</div>
                <div>
                    <div class="di-stat-val">${instructorPrograms.length}</div>
                    <div class="di-stat-label">Programs</div>
                </div>
            </div>
        </div>

        <div class="di-filters">
            <input type="text" id="di-search" placeholder="Search name, email, or ID...">
            <select id="di-filter-program">
                <option value="">All Programs</option>
                ${instructorPrograms.map(p => `<option value="${p.id}">${esc(p.code)}${p.name ? ' — ' + esc(p.name) : ''}</option>`).join('')}
            </select>
            <select id="di-filter-status">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        </div>

        <table class="di-table">
            <thead>
                <tr>
                    <th>Instructor</th>
                    <th>Employee ID</th>
                    <th>Department / Program</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="di-tbody">
                ${renderRows(allInstructors)}
            </tbody>
        </table>
    `;

    // Filter logic
    let debounce;
    function filterAndRender() {
        const search      = container.querySelector('#di-search').value.toLowerCase();
        const progFilter  = container.querySelector('#di-filter-program').value;
        const statusFilter = container.querySelector('#di-filter-status').value;
        const filtered = allInstructors.filter(i => {
            const matchSearch = !search ||
                (i.first_name + ' ' + i.last_name).toLowerCase().includes(search) ||
                (i.email || '').toLowerCase().includes(search) ||
                (i.employee_id || '').toLowerCase().includes(search);
            const matchProg   = !progFilter   || String(i.program_id) === progFilter;
            const matchStatus = !statusFilter || i.status === statusFilter;
            return matchSearch && matchProg && matchStatus;
        });
        container.querySelector('#di-tbody').innerHTML = renderRows(filtered);
        container.querySelector('#di-total').textContent = filtered.length;
        attachRowEvents();
    }

    container.querySelector('#di-search').addEventListener('input', () => {
        clearTimeout(debounce); debounce = setTimeout(filterAndRender, 300);
    });
    container.querySelector('#di-filter-program').addEventListener('change', filterAndRender);
    container.querySelector('#di-filter-status').addEventListener('change', filterAndRender);

    // Row action events
    function attachRowEvents() {
        container.querySelectorAll('.di-toggle-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid    = btn.dataset.id;
                const active = btn.dataset.active === 'true';
                btn.disabled = true;
                const res = await Api.post('/UsersAPI.php?action=deactivate', {
                    users_id: uid, status: active ? 'inactive' : 'active'
                });
                if (res.success) { await reload(); }
                else { alert(res.message || 'Failed'); btn.disabled = false; }
            });
        });
    }
    attachRowEvents();

    // Add instructor modal
    container.querySelector('#di-add-btn').addEventListener('click', () => openModal());

    async function reload() {
        const r = await Api.get('/UsersAPI.php?action=list&role=instructor');
        allInstructors = r.success ? r.data.users : [];
        container.querySelector('#di-tbody').innerHTML = renderRows(allInstructors);
        container.querySelector('#di-total').textContent = allInstructors.length;
        attachRowEvents();
    }

    function openModal() {
        // If the dean has exactly one department (their own), lock it in
        const fixedDept = departmentsList.length === 1 ? departmentsList[0] : null;

        const deptField = fixedDept
            ? `<input type="text" class="form-input di-readonly-field" value="${esc(fixedDept.department_name)}" readonly tabindex="-1">
               <input type="hidden" id="di-dept" value="${fixedDept.department_id}">`
            : `<select id="di-dept" class="form-select">
                   <option value="">— Select Department —</option>
                   ${departmentsList.map(d => `<option value="${d.department_id}">${esc(d.department_name)}</option>`).join('')}
               </select>`;

        const progOptions = programsList.map(p =>
            `<option value="${p.program_id}">${esc(p.program_code)} — ${esc(p.program_name)}</option>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>Add Instructor</h3>
                    <button class="modal-close" id="di-close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="alert" id="di-modal-msg"></div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">First Name *</label>
                            <input id="di-fn" type="text" class="form-input" placeholder="e.g. Juan">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Last Name *</label>
                            <input id="di-ln" type="text" class="form-input" placeholder="e.g. Dela Cruz">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email Address *</label>
                        <input id="di-email" type="email" class="form-input" placeholder="instructor@phinmaed.com">
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Employee ID *</label>
                            <input id="di-empid" type="text" class="form-input" placeholder="e.g. INS-2026-5">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Department</label>
                            ${deptField}
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Program (optional)</label>
                        <select id="di-prog" class="form-select">
                            <option value="">— Select Program —</option>
                            ${progOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password *</label>
                        <div class="di-pw-wrap">
                            <input id="di-pw" type="password" class="form-input" placeholder="Min. 8 characters">
                            <button type="button" class="di-pw-eye" id="di-pw-eye" tabindex="-1" aria-label="Show password">
                                <svg id="di-eye-show" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <svg id="di-eye-hide" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="di-cancel-modal">Cancel</button>
                    <button class="btn-primary" id="di-save-modal">Create Instructor</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const pwInput = overlay.querySelector('#di-pw');
        attachStrengthMeter(pwInput);
        // Move the injected strength meter out of the flex wrapper so it sits below
        const pwWrap = overlay.querySelector('.di-pw-wrap');
        const meter  = pwWrap?.querySelector('.pw-strength-meter');
        if (meter) pwWrap.insertAdjacentElement('afterend', meter);

        // Eye toggle
        overlay.querySelector('#di-pw-eye').addEventListener('click', () => {
            const show    = overlay.querySelector('#di-eye-show');
            const hide    = overlay.querySelector('#di-eye-hide');
            const visible = pwInput.type === 'text';
            pwInput.type       = visible ? 'password' : 'text';
            show.style.display = visible ? '' : 'none';
            hide.style.display = visible ? 'none' : '';
        });

        const closeModal = () => overlay.remove();
        overlay.querySelector('#di-close-modal').addEventListener('click', closeModal);
        overlay.querySelector('#di-cancel-modal').addEventListener('click', closeModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

        overlay.querySelector('#di-save-modal').addEventListener('click', async () => {
            const msg    = overlay.querySelector('#di-modal-msg');
            const saveBtn = overlay.querySelector('#di-save-modal');
            msg.className = 'alert';

            const fn     = overlay.querySelector('#di-fn').value.trim();
            const ln     = overlay.querySelector('#di-ln').value.trim();
            const email  = overlay.querySelector('#di-email').value.trim();
            const empid  = overlay.querySelector('#di-empid').value.trim();
            const dept   = overlay.querySelector('#di-dept').value;
            const prog   = overlay.querySelector('#di-prog').value;
            const pw     = overlay.querySelector('#di-pw').value;

            if (!fn || !ln || !email || !empid || !pw) {
                msg.textContent = 'Please fill in all required fields.';
                msg.className = 'alert alert-error'; return;
            }
            { const e = validatePassword(pw); if (e) { msg.textContent = e; msg.className = 'alert alert-error'; return; } }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Creating…';

            const res = await Api.post('/UsersAPI.php?action=create', {
                first_name:    fn,
                last_name:     ln,
                email,
                employee_id:   empid,
                department_id: dept || null,
                program_id:    prog || null,
                password:      pw,
                role:          'instructor',
                status:        'active',
            });

            if (res.success) {
                msg.textContent = 'Instructor account created successfully!';
                msg.className = 'alert alert-success';
                await reload();
                setTimeout(closeModal, 1400);
            } else {
                msg.textContent = res.message || 'Failed to create instructor.';
                msg.className = 'alert alert-error';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Create Instructor';
            }
        });
    }
}

function renderRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="5">
            <div class="di-empty">
                <div class="di-empty-icon">${iconLg('instructor')}</div>
                <div class="di-empty-text">No instructors found</div>
            </div>
        </td></tr>`;
    }
    return list.map(i => {
        const initials  = ((i.first_name || '?')[0] + (i.last_name || '?')[0]).toUpperCase();
        const progLabel = i.program_code
            ? `<span class="di-prog">${esc(i.program_code)}</span>`
            : `<span class="di-prog none">—</span>`;
        const deptLabel = i.department_name
            ? `<div style="font-size:11px;color:#737373;margin-top:2px;">${esc(i.department_name)}</div>` : '';
        const isActive  = i.status === 'active';
        return `<tr>
            <td>
                <div class="di-user">
                    <div class="di-av">${initials}</div>
                    <div>
                        <span class="di-name">${esc(i.first_name)} ${esc(i.last_name)}</span>
                        <span class="di-email">${esc(i.email)}</span>
                    </div>
                </div>
            </td>
            <td><span class="di-empid">${esc(i.employee_id || '—')}</span></td>
            <td>${progLabel}${deptLabel}</td>
            <td><span class="badge badge-${i.status}">${i.status}</span></td>
            <td>
                <div class="di-actions">
                    <button class="btn-row ${isActive ? 'btn-row-danger' : 'btn-row-success'} di-toggle-btn"
                        data-id="${i.users_id}" data-active="${isActive}">
                        ${isActive ? 'Deactivate' : 'Activate'}
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
