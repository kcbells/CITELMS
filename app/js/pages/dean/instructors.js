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
        Api.get('/UsersAPI.php?action=list&role=instructor,program_head'),
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

            .di-table-wrap { background:#fff; border:1px solid #E5E7EB; border-radius:14px; overflow:hidden; }
            .di-table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; }
            .di-table th { background:#F9FAFB; color:#374151; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:12px 16px; border-bottom:1px solid #E5E7EB; text-align:left; }
            .di-table tbody tr { border-bottom:1px solid #F3F4F6; transition:background .15s; }
            .di-table tbody tr:last-child { border-bottom:none; }
            .di-table tbody tr:hover { background:#F9FAFB; }
            .di-table td { padding:12px 16px; vertical-align:middle; font-size:13px; color:#374151; }

            .di-user { display:flex; align-items:center; gap:12px; }
            .di-av { width:38px; height:38px; border-radius:50%; background:#00461B; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
            .di-name { font-weight:600; color:#262626; display:block; }
            .di-email { font-size:12px; color:#a0a0a0; display:block; margin-top:1px; }
            .di-empid { font-family:monospace; font-size:13px; color:#404040; }
            .di-prog { display:inline-block; padding:3px 10px; border-radius:8px; font-size:11px; font-weight:600; background:#EDE9FE; color:#5B21B6; }
            .di-prog.none { background:#f5f5f5; color:#a0a0a0; }
            .di-campus { font-size:11px; color:#1B4D3E; background:#E8F5E9; padding:2px 8px; border-radius:8px; font-weight:600; }
            .di-role-badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .di-role-badge.instructor { background:#DBEAFE; color:#1E40AF; }
            .di-role-badge.program_head { background:#FFE4D6; color:#9A3412; }

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
            .btn-row-edit { background:#F3F4F6; color:#374151; }
            .btn-row-edit:hover { background:#E5E7EB; }

            .di-empty { text-align:center; padding:48px 20px; color:#a0a0a0; }
            .di-empty-icon { font-size:36px; margin-bottom:10px; }
            .di-empty-text { font-size:15px; font-weight:500; }

            /* ── Add Faculty modal — simple, sign-in-style design ──
               NOTE: every class here is di-/fac- prefixed on purpose.
               Generic names like .modal/.form-input/.alert/.btn-primary
               collide with other SPA pages' styles since <style> tags
               are not scoped to their container — always prefix. */
            .di-modal-overlay { position:fixed; inset:0; background:rgba(17,24,39,.55); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
            .di-modal { background:#fff; border-radius:16px; width:100%; max-width:440px; max-height:92vh; overflow-y:auto; box-shadow:0 32px 80px rgba(0,0,0,.28); }
            .di-modal-header { padding:20px 24px; border-bottom:1.5px solid #e5e7eb; display:flex; align-items:center; gap:14px; }
            .di-modal-header-icon { width:42px; height:42px; border-radius:12px; background:#F3F4F6; color:#111; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .di-modal-header-text { flex:1; min-width:0; }
            .di-modal-header h3 { font-size:17px; font-weight:800; color:#1B4D2E; margin:0 0 2px; }
            .di-modal-header-text p { font-size:12px; color:#6b7280; margin:0; }
            .di-modal-close { width:32px; height:32px; border-radius:50%; border:none; background:#f3f4f6; color:#4b5563; font-size:17px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }
            .di-modal-close:hover { background:#e5e7eb; }
            .di-modal-body { padding:22px 24px; }
            .di-modal-footer { padding:14px 24px 20px; border-top:1px solid #f3f4f6; background:#fafafa; display:flex; gap:10px; border-radius:0 0 16px 16px; }

            .fac-role-row { display:flex; gap:10px; margin-bottom:20px; }
            .fac-role-pill { flex:1; padding:12px 8px; border:1.5px solid #e5e7eb; border-radius:10px; background:#f9fafb; cursor:pointer; text-align:center; font-size:13px; font-weight:700; color:#4b5563; transition:all .15s; }
            .fac-role-pill:hover { border-color:#c9ccd1; }
            .fac-role-pill.active { border-color:#1B4D2E; background:#E8F5E9; color:#1B4D2E; }

            .di-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
            .di-form-group { margin-bottom:16px; }
            .di-form-group.full { grid-column:1/-1; }
            .di-form-label { display:block; font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:7px; }
            .fac-wrap { position:relative; }
            .fac-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9ca3af; display:flex; pointer-events:none; }
            .di-form-input, .di-form-select { width:100%; padding:11px 14px 11px 40px; border:1.5px solid #e5e7eb; border-radius:8px; font-size:14px; font-family:inherit; color:#1a1a1a; background:#f9fafb; outline:none; box-sizing:border-box; transition:border-color .15s, box-shadow .15s; }
            .di-form-input:focus, .di-form-select:focus { border-color:#1B4D2E; box-shadow:0 0 0 3px rgba(27,77,46,.08); background:#fff; }
            .di-form-input.no-icon, .di-form-select.no-icon { padding-left:14px; }
            .di-readonly-field { background:#F3F4F6 !important; color:#6B7280; cursor:default; border-color:#E5E7EB !important; }
            .di-pw-wrap { position:relative; display:block; }
            .di-pw-wrap > .di-form-input { padding-right:40px; }
            .di-pw-eye { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#9CA3AF; padding:0; display:flex; align-items:center; transition:color .15s; }
            .di-pw-eye:hover { color:#1B4D3E; }

            .fac-scope-box { background:#FFFBEB; border:1.5px solid #FDE68A; border-radius:10px; padding:14px 16px; margin-bottom:16px; }
            .fac-scope-lbl { font-size:13px; font-weight:700; color:#92400E; margin-bottom:3px; }
            .fac-scope-hint { font-size:11.5px; color:#B45309; margin-bottom:12px; }
            .fac-year-row { display:flex; gap:8px; flex-wrap:wrap; }
            .fac-year-pill { padding:8px 16px; border:1.5px solid #FDE68A; border-radius:20px; background:#fff; cursor:pointer; font-size:13px; font-weight:700; color:#92400E; transition:all .15s; user-select:none; }
            .fac-year-pill:hover { border-color:#F59E0B; }
            .fac-year-pill.checked { border-color:#B45309; background:#B45309; color:#fff; }

            .di-alert { padding:11px 14px; border-radius:8px; margin-bottom:16px; font-size:13px; line-height:1.5; display:none; }
            .di-alert.di-alert-success { background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; display:block; }
            .di-alert.di-alert-error { background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; display:block; }
            .di-btn-secondary { background:transparent; color:#4b5563; border:1.5px solid #d1d5db; border-radius:8px; padding:11px 20px; font-weight:600; cursor:pointer; font-size:13.5px; }
            .di-btn-secondary:hover { background:#f3f4f6; }
            .di-btn-primary { flex:1; background:#1B4D2E; color:#fff; border:none; border-radius:8px; padding:11px 20px; font-size:14px; font-weight:700; cursor:pointer; transition:background .15s; }
            .di-btn-primary:hover { background:#00461B; }
            .di-btn-primary:disabled { opacity:.6; cursor:not-allowed; }

            @media(max-width:768px) {
                .di-filters { flex-direction:column; }
                .di-filters input, .di-filters select { min-width:100%; }
                .di-form-grid { grid-template-columns:1fr; }
            }
        </style>

        <div class="di-header">
            <h2>Faculty <span class="di-count" id="di-total">${allInstructors.length}</span></h2>
            <button class="btn-add-instructor" id="di-add-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Faculty
            </button>
        </div>

        <div class="di-filters">
            <input type="text" id="di-search" placeholder="Search name, email, or ID...">
            <select id="di-filter-role">
                <option value="">All Roles</option>
                <option value="instructor">Instructor</option>
                <option value="program_head">Program Head</option>
            </select>
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

        <div class="di-table-wrap">
            <table class="di-table">
                <thead>
                    <tr>
                        <th>Faculty</th>
                        <th>Employee ID</th>
                        <th>Role</th>
                        <th>Department / Program</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="di-tbody">
                    ${renderRows(allInstructors)}
                </tbody>
            </table>
        </div>
    `;

    // Filter logic
    let debounce;
    function filterAndRender() {
        const search      = container.querySelector('#di-search').value.toLowerCase();
        const roleFilter  = container.querySelector('#di-filter-role').value;
        const progFilter  = container.querySelector('#di-filter-program').value;
        const statusFilter = container.querySelector('#di-filter-status').value;
        const filtered = allInstructors.filter(i => {
            const matchSearch = !search ||
                (i.first_name + ' ' + i.last_name).toLowerCase().includes(search) ||
                (i.email || '').toLowerCase().includes(search) ||
                (i.employee_id || '').toLowerCase().includes(search);
            const matchRole   = !roleFilter   || i.role === roleFilter;
            const matchProg   = !progFilter   || String(i.program_id) === progFilter;
            const matchStatus = !statusFilter || i.status === statusFilter;
            return matchSearch && matchRole && matchProg && matchStatus;
        });
        container.querySelector('#di-tbody').innerHTML = renderRows(filtered);
        container.querySelector('#di-total').textContent = filtered.length;
        attachRowEvents();
    }

    container.querySelector('#di-search').addEventListener('input', () => {
        clearTimeout(debounce); debounce = setTimeout(filterAndRender, 300);
    });
    container.querySelector('#di-filter-role').addEventListener('change', filterAndRender);
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
        container.querySelectorAll('.di-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const inst = allInstructors.find(i => String(i.users_id) === String(btn.dataset.id));
                if (inst) openEditModal(inst);
            });
        });
    }
    attachRowEvents();

    // Add instructor modal
    container.querySelector('#di-add-btn').addEventListener('click', () => openModal());

    async function reload() {
        const r = await Api.get('/UsersAPI.php?action=list&role=instructor,program_head');
        allInstructors = r.success ? r.data.users : [];
        container.querySelector('#di-tbody').innerHTML = renderRows(allInstructors);
        container.querySelector('#di-total').textContent = allInstructors.length;
        attachRowEvents();
    }

    function openModal() {
        // If the dean has exactly one department (their own), lock it in
        const fixedDept = departmentsList.length === 1 ? departmentsList[0] : null;

        const deptField = fixedDept
            ? `<input type="text" class="di-form-input no-icon di-readonly-field" value="${esc(fixedDept.department_name)}" readonly tabindex="-1">
               <input type="hidden" id="di-dept" value="${fixedDept.department_id}">`
            : `<select id="di-dept" class="di-form-select no-icon">
                   <option value="">— Select Department —</option>
                   ${departmentsList.map(d => `<option value="${d.department_id}">${esc(d.department_name)}</option>`).join('')}
               </select>`;

        const progOptions = programsList.map(p =>
            `<option value="${p.program_id}">${esc(p.program_code)} — ${esc(p.program_name)}</option>`
        ).join('');

        let selectedRole = 'instructor';

        const overlay = document.createElement('div');
        overlay.className = 'di-modal-overlay';
        overlay.innerHTML = `
            <div class="di-modal">
                <div class="di-modal-header">
                    <div class="di-modal-header-icon">${icon('instructor', { size: 20 })}</div>
                    <div class="di-modal-header-text">
                        <h3>Add Faculty</h3>
                        <p>Create an instructor or program head account</p>
                    </div>
                    <button class="di-modal-close" id="di-close-modal">&times;</button>
                </div>
                <div class="di-modal-body">
                    <div class="di-alert" id="di-modal-msg"></div>

                    <div class="fac-role-row" id="di-role-row">
                        <button type="button" class="fac-role-pill active" data-role="instructor">Instructor</button>
                        <button type="button" class="fac-role-pill" data-role="program_head">Program Head</button>
                    </div>

                    <div class="di-form-grid">
                        <div class="di-form-group">
                            <label class="di-form-label">First Name *</label>
                            <div class="fac-wrap">
                                <span class="fac-icon">${icon('user', { size: 15 })}</span>
                                <input id="di-fn" type="text" class="di-form-input" placeholder="e.g. Juan">
                            </div>
                        </div>
                        <div class="di-form-group">
                            <label class="di-form-label">Last Name *</label>
                            <div class="fac-wrap">
                                <span class="fac-icon">${icon('user', { size: 15 })}</span>
                                <input id="di-ln" type="text" class="di-form-input" placeholder="e.g. Dela Cruz">
                            </div>
                        </div>
                    </div>
                    <div class="di-form-group">
                        <label class="di-form-label">Email Address *</label>
                        <div class="fac-wrap">
                            <span class="fac-icon">${icon('messages', { size: 15 })}</span>
                            <input id="di-email" type="email" class="di-form-input" placeholder="faculty@phinmaed.com">
                        </div>
                    </div>
                    <div class="di-form-grid">
                        <div class="di-form-group">
                            <label class="di-form-label">Employee ID *</label>
                            <div class="fac-wrap">
                                <span class="fac-icon">${icon('key', { size: 15 })}</span>
                                <input id="di-empid" type="text" class="di-form-input" placeholder="e.g. INS-2026-5">
                            </div>
                        </div>
                        <div class="di-form-group">
                            <label class="di-form-label">Department</label>
                            ${deptField}
                        </div>
                    </div>
                    <div class="di-form-group">
                        <label class="di-form-label">Program (optional)</label>
                        <select id="di-prog" class="di-form-select no-icon">
                            <option value="">— Select Program —</option>
                            ${progOptions}
                        </select>
                    </div>

                    <div class="fac-scope-box" id="di-scope-box" style="display:none;">
                        <div class="fac-scope-lbl">Handles Year Level(s)</div>
                        <div class="fac-scope-hint">e.g. 1st &amp; 2nd year of this program</div>
                        <div class="fac-year-row" id="di-year-row">
                            ${[1,2,3,4].map(y => `<button type="button" class="fac-year-pill" data-year="${y}">${y}${ordinal(y)}</button>`).join('')}
                        </div>
                    </div>

                    <div class="di-form-group">
                        <label class="di-form-label">Password *</label>
                        <div class="di-pw-wrap">
                            <input id="di-pw" type="password" class="di-form-input no-icon" placeholder="Min. 8 characters">
                            <button type="button" class="di-pw-eye" id="di-pw-eye" tabindex="-1" aria-label="Show password">
                                <svg id="di-eye-show" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <svg id="di-eye-hide" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="di-modal-footer">
                    <button class="di-btn-secondary" id="di-cancel-modal">Cancel</button>
                    <button class="di-btn-primary" id="di-save-modal">Create Faculty</button>
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

        // Role pills — instructor vs program head
        const scopeBox = overlay.querySelector('#di-scope-box');
        overlay.querySelectorAll('.fac-role-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                selectedRole = pill.dataset.role;
                overlay.querySelectorAll('.fac-role-pill').forEach(p => p.classList.toggle('active', p === pill));
                scopeBox.style.display = selectedRole === 'program_head' ? 'block' : 'none';
            });
        });

        // Year-level pills — toggle on click
        overlay.querySelectorAll('.fac-year-pill').forEach(pill => {
            pill.addEventListener('click', () => pill.classList.toggle('checked'));
        });

        const closeModal = () => overlay.remove();
        overlay.querySelector('#di-close-modal').addEventListener('click', closeModal);
        overlay.querySelector('#di-cancel-modal').addEventListener('click', closeModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

        overlay.querySelector('#di-save-modal').addEventListener('click', async () => {
            const msg    = overlay.querySelector('#di-modal-msg');
            const saveBtn = overlay.querySelector('#di-save-modal');
            msg.className = 'di-alert';

            const role   = selectedRole;
            const fn     = overlay.querySelector('#di-fn').value.trim();
            const ln     = overlay.querySelector('#di-ln').value.trim();
            const email  = overlay.querySelector('#di-email').value.trim();
            const empid  = overlay.querySelector('#di-empid').value.trim();
            const dept   = overlay.querySelector('#di-dept').value;
            const prog   = overlay.querySelector('#di-prog').value;
            const pw     = overlay.querySelector('#di-pw').value;

            const checkedYears = [...overlay.querySelectorAll('.fac-year-pill.checked')].map(p => parseInt(p.dataset.year));
            const yearFrom = checkedYears.length ? Math.min(...checkedYears) : null;
            const yearTo   = checkedYears.length ? Math.max(...checkedYears) : null;

            if (!fn || !ln || !email || !empid || !pw) {
                msg.textContent = 'Please fill in all required fields.';
                msg.className = 'di-alert di-alert-error'; return;
            }
            { const e = validatePassword(pw); if (e) { msg.textContent = e; msg.className = 'di-alert di-alert-error'; return; } }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Creating…';

            const res = await Api.post('/UsersAPI.php?action=create', {
                first_name:      fn,
                last_name:       ln,
                email,
                employee_id:     empid,
                department_id:   dept || null,
                program_id:      prog || null,
                password:        pw,
                role,
                status:          'active',
                year_level_from: role === 'program_head' ? yearFrom : null,
                year_level_to:   role === 'program_head' ? yearTo   : null,
            });

            if (res.success) {
                msg.textContent = res.message || 'Faculty account created successfully!';
                msg.className = 'di-alert di-alert-success';
                await reload();
                setTimeout(closeModal, 1400);
            } else {
                msg.textContent = res.message || 'Failed to create faculty account.';
                msg.className = 'di-alert di-alert-error';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Create Faculty';
            }
        });
    }

    function openEditModal(inst) {
        const roleLabel = inst.role === 'program_head' ? 'Program Head' : 'Instructor';
        const progOptions = programsList.map(p =>
            `<option value="${p.program_id}" ${String(p.program_id) === String(inst.program_id) ? 'selected' : ''}>${esc(p.program_code)} — ${esc(p.program_name)}</option>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'di-modal-overlay';
        overlay.innerHTML = `
            <div class="di-modal">
                <div class="di-modal-header">
                    <div class="di-modal-header-icon">${icon('edit', { size: 20 })}</div>
                    <div class="di-modal-header-text">
                        <h3>Edit Faculty</h3>
                        <p>Update account details, or set a new password</p>
                    </div>
                    <button class="di-modal-close" id="die-close-modal">&times;</button>
                </div>
                <div class="di-modal-body">
                    <div class="di-alert" id="die-modal-msg"></div>

                    <div class="di-form-group">
                        <label class="di-form-label">Role</label>
                        <input type="text" class="di-form-input no-icon di-readonly-field" value="${esc(roleLabel)}" readonly tabindex="-1">
                    </div>

                    <div class="di-form-grid">
                        <div class="di-form-group">
                            <label class="di-form-label">First Name *</label>
                            <div class="fac-wrap">
                                <span class="fac-icon">${icon('user', { size: 15 })}</span>
                                <input id="die-fn" type="text" class="di-form-input" value="${esc(inst.first_name)}">
                            </div>
                        </div>
                        <div class="di-form-group">
                            <label class="di-form-label">Last Name *</label>
                            <div class="fac-wrap">
                                <span class="fac-icon">${icon('user', { size: 15 })}</span>
                                <input id="die-ln" type="text" class="di-form-input" value="${esc(inst.last_name)}">
                            </div>
                        </div>
                    </div>
                    <div class="di-form-group">
                        <label class="di-form-label">Email Address *</label>
                        <div class="fac-wrap">
                            <span class="fac-icon">${icon('messages', { size: 15 })}</span>
                            <input id="die-email" type="email" class="di-form-input" value="${esc(inst.email)}">
                        </div>
                    </div>
                    <div class="di-form-group">
                        <label class="di-form-label">Employee ID</label>
                        <div class="fac-wrap">
                            <span class="fac-icon">${icon('key', { size: 15 })}</span>
                            <input id="die-empid" type="text" class="di-form-input" value="${esc(inst.employee_id || '')}">
                        </div>
                    </div>
                    <div class="di-form-group">
                        <label class="di-form-label">Program</label>
                        <select id="die-prog" class="di-form-select no-icon">
                            <option value="">— Select Program —</option>
                            ${progOptions}
                        </select>
                    </div>

                    <div class="di-form-group">
                        <label class="di-form-label">New Password (optional)</label>
                        <div class="di-pw-wrap">
                            <input id="die-pw" type="password" class="di-form-input no-icon" placeholder="Leave blank to keep current password">
                            <button type="button" class="di-pw-eye" id="die-pw-eye" tabindex="-1" aria-label="Show password">
                                <svg id="die-eye-show" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <svg id="die-eye-hide" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="di-modal-footer">
                    <button class="di-btn-secondary" id="die-cancel-modal">Cancel</button>
                    <button class="di-btn-primary" id="die-save-modal">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const pwInput = overlay.querySelector('#die-pw');
        attachStrengthMeter(pwInput);
        const pwWrap = overlay.querySelector('.di-pw-wrap');
        const meter  = pwWrap?.querySelector('.pw-strength-meter');
        if (meter) pwWrap.insertAdjacentElement('afterend', meter);

        overlay.querySelector('#die-pw-eye').addEventListener('click', () => {
            const show    = overlay.querySelector('#die-eye-show');
            const hide    = overlay.querySelector('#die-eye-hide');
            const visible = pwInput.type === 'text';
            pwInput.type       = visible ? 'password' : 'text';
            show.style.display = visible ? '' : 'none';
            hide.style.display = visible ? 'none' : '';
        });

        const closeModal = () => overlay.remove();
        overlay.querySelector('#die-close-modal').addEventListener('click', closeModal);
        overlay.querySelector('#die-cancel-modal').addEventListener('click', closeModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

        overlay.querySelector('#die-save-modal').addEventListener('click', async () => {
            const msg     = overlay.querySelector('#die-modal-msg');
            const saveBtn = overlay.querySelector('#die-save-modal');
            msg.className = 'di-alert';

            const fn    = overlay.querySelector('#die-fn').value.trim();
            const ln    = overlay.querySelector('#die-ln').value.trim();
            const email = overlay.querySelector('#die-email').value.trim();
            const empid = overlay.querySelector('#die-empid').value.trim();
            const prog  = overlay.querySelector('#die-prog').value;
            const pw    = overlay.querySelector('#die-pw').value;

            if (!fn || !ln || !email) {
                msg.textContent = 'Please fill in all required fields.';
                msg.className = 'di-alert di-alert-error'; return;
            }
            if (pw) {
                const e = validatePassword(pw);
                if (e) { msg.textContent = e; msg.className = 'di-alert di-alert-error'; return; }
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            const res = await Api.post('/UsersAPI.php?action=update', {
                users_id:      inst.users_id,
                first_name:    fn,
                last_name:     ln,
                email,
                employee_id:   empid,
                program_id:    prog || null,
                status:        inst.status,
                ...(pw ? { password: pw } : {}),
            });

            if (res.success) {
                msg.textContent = res.message || 'Faculty account updated successfully!';
                msg.className = 'di-alert di-alert-success';
                await reload();
                setTimeout(closeModal, 1200);
            } else {
                msg.textContent = res.message || 'Failed to update faculty account.';
                msg.className = 'di-alert di-alert-error';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        });
    }
}

function renderRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="6">
            <div class="di-empty">
                <div class="di-empty-icon">${iconLg('instructor')}</div>
                <div class="di-empty-text">No faculty found</div>
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
        const roleLabel = i.role === 'program_head' ? 'Program Head' : 'Instructor';
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
            <td><span class="di-role-badge ${i.role}">${esc(roleLabel)}</span></td>
            <td>${progLabel}${deptLabel}</td>
            <td><span class="badge badge-${i.status}">${i.status}</span></td>
            <td>
                <div class="di-actions">
                    <button class="btn-row btn-row-edit di-edit-btn" data-id="${i.users_id}">Edit</button>
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

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}
