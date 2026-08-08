/**
 * Admin Departments Page — with Campus tab
 */
import { Api } from '../../api.js';
import { notify } from '../../utils/notify.js';
import { validatePassword, attachStrengthMeter } from '../../utils/password-change-otp.js';

let campuses = [];
let activeTab = 'departments';
let activeCampusId = null;

export async function render(container) {
    const campRes = await Api.get('/DepartmentsAPI.php?action=campuses');
    campuses = campRes.success ? campRes.data : [];
    renderShell(container);
    switchTab(container, activeTab);
}

// ── Shell (tabs + slot) ───────────────────────────────────────────────────────

function renderShell(container) {
    container.innerHTML = `
        <style>
            /* Dropdown switcher */
            .dp-switcher-wrap { margin-bottom:22px; }
            .dp-switcher {
                position:relative; display:inline-flex; align-items:center; gap:8px;
                background:#fff; border:1.5px solid #e5e7eb; border-radius:10px;
                padding:9px 16px; cursor:pointer; user-select:none;
                font-size:14px; font-weight:700; color:#111827;
                transition:border-color .15s, box-shadow .15s;
                min-width:180px; justify-content:space-between;
            }
            .dp-switcher:hover { border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.08); }
            .dp-switcher-arrow { flex-shrink:0; color:#9ca3af; transition:transform .2s; }
            .dp-switcher-menu {
                display:none; position:absolute; top:calc(100% + 6px); left:0;
                background:#fff; border:1px solid #e5e7eb; border-radius:10px;
                box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:100%; z-index:500;
                overflow:hidden;
            }
            .dp-switcher-menu.open { display:block; }
            .dp-switcher-item {
                padding:11px 16px; font-size:13.5px; font-weight:500; color:#374151;
                cursor:pointer; transition:background .15s;
            }
            .dp-switcher-item:hover  { background:#f9fafb; }
            .dp-switcher-item.active { color:#00461B; font-weight:700; background:#f0fdf4; }

            /* Header */
            .dp-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
            .dp-title  { font-size:22px; font-weight:700; color:#262626; }
            .dp-count  { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }

            /* Buttons */
            .btn-primary   { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; display:inline-flex; align-items:center; gap:7px; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .btn-secondary:hover { background:#e8e8e8; }

            /* ===== Clean table ===== */
            .table-wrap {
                background:#fff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;
            }
            .data-table { width:100%; border-collapse:collapse; font-size:13.5px; background:#fff; }
            .data-table th {
                background:#fafbfc; color:#9ca3af; font-size:11px; font-weight:700;
                text-transform:uppercase; letter-spacing:0.05em; padding:13px 20px;
                border-bottom:1px solid #e5e7eb; text-align:left;
            }
            .data-table tbody tr { border-bottom:1px solid #f0f0f0; transition:background .12s; }
            .data-table tbody tr:last-child { border-bottom:none; }
            .data-table tbody tr:hover { background:#fafbfc; }
            .data-table td { padding:14px 20px; vertical-align:middle; color:#374151; }

            .dept-cell { display:flex; align-items:center; gap:12px; }
            .dept-icon {
                width:38px; height:38px; border-radius:9px; background:#f3f4f6; color:#1f2937;
                display:flex; align-items:center; justify-content:center; flex-shrink:0;
                font-size:12px; font-weight:800; letter-spacing:.02em;
            }
            .dept-name { font-weight:700; color:#1f2937; font-size:13.5px; }
            .dept-code { font-size:11px; color:#9ca3af; font-weight:600; letter-spacing:.04em; text-transform:uppercase; margin-top:1px; }

            .program-badge { background:#DBEAFE; color:#1E40AF; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; text-decoration:none; cursor:pointer; }
            .dean-cell { display:flex; align-items:center; gap:9px; }
            .dean-avatar { width:30px; height:30px; border-radius:50%; background:#00461B; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .dean-name-text  { font-size:13px; font-weight:600; color:#262626; }
            .dean-email-text { font-size:11.5px; color:#9ca3af; }
            .dean-add-btn { font-size:12px; color:#00461B; font-weight:600; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:3px 10px; cursor:pointer; white-space:nowrap; }
            .dean-add-btn:hover { background:#dcfce7; }

            .status-pill { font-size:11.5px; font-weight:700; padding:4px 12px; border-radius:20px; display:inline-block; }
            .status-pill.active   { background:#dcfce7; color:#15803d; }
            .status-pill.inactive { background:#f3f4f6; color:#6b7280; }

            /* Actions */
            .actions-cell { text-align:right; position:relative; white-space:nowrap; }
            .btn-edit-tbl {
                background:#fff; color:#374151; border:1.5px solid #e5e7eb; padding:7px 16px;
                border-radius:8px; font-weight:600; font-size:12.5px; cursor:pointer; transition:all .15s;
            }
            .btn-edit-tbl:hover { border-color:#00461B; color:#00461B; background:#f0fdf4; }
            .btn-actions  { background:none; border:1px solid #e0e0e0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:18px; display:inline-flex; align-items:center; justify-content:center; margin-left:8px; vertical-align:middle; }
            .btn-actions:hover { background:#f5f5f5; }
            .actions-dropdown { display:none; position:fixed; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.15); min-width:170px; z-index:9999; overflow:hidden; }
            .actions-dropdown.show { display:block; }
            .actions-dropdown a { display:flex; align-items:center; gap:8px; padding:10px 16px; font-size:13px; color:#404040; cursor:pointer; text-decoration:none; }
            .actions-dropdown a:hover { background:#f5f5f5; }
            .actions-dropdown a.danger { color:#b91c1c; }
            .actions-dropdown .divider { height:1px; background:#f0f0f0; margin:4px 0; }

            /* Modal — matches sign-in / create-account style */
            @keyframes bdFadeIn   { from{opacity:0} to{opacity:1} }
            @keyframes modalSlide { from{opacity:0;transform:translateY(20px) scale(.97)} to{opacity:1;transform:none} }
            .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:10000; padding:16px; animation:bdFadeIn .15s; }
            .modal { background:#fff; border-radius:16px; width:100%; max-width:500px; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 32px 80px rgba(0,0,0,.28); animation:modalSlide .22s cubic-bezier(.4,0,.2,1); overflow:hidden; }
            /* header */
            .modal-hd { background:#fff; border-radius:16px 16px 0 0; padding:20px 24px; display:flex; align-items:center; gap:14px; flex-shrink:0; border-bottom:1px solid #e5e7eb; }
            .modal-hd-icon { width:44px; height:44px; border-radius:10px; background:#f0fdf4; display:flex; align-items:center; justify-content:center; color:#00461B; flex-shrink:0; }
            .modal-hd-text { flex:1; }
            .modal-hd-text h3 { margin:0 0 2px; font-size:17px; font-weight:800; color:#1f2937; }
            .modal-hd-text p  { margin:0; font-size:12px; color:#6b7280; }
            .modal-close { width:34px; height:34px; border-radius:50%; border:none; background:#f3f4f6; color:#6b7280; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; font-family:inherit; }
            .modal-close:hover { background:#e5e7eb; color:#1f2937; }
            /* body */
            .modal-bd { padding:22px 24px; overflow-y:auto; flex:1; }
            .modal-bd::-webkit-scrollbar { width:4px; }
            .modal-bd::-webkit-scrollbar-thumb { background:#d1d5db; border-radius:2px; }
            /* footer */
            .modal-ft { padding:14px 24px 18px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:10px; background:#f9fafb; border-radius:0 0 16px 16px; flex-shrink:0; }
            /* form groups */
            .fg { margin-bottom:14px; }
            .fg:last-child { margin-bottom:0; }
            .fg-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
            .fg > label { display:block; font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:7px; }
            /* icon-wrapped input */
            .fi-wrap { position:relative; }
            .fi-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9ca3af; display:flex; pointer-events:none; }
            .fi-input { width:100%; padding:11px 14px 11px 40px; border:1.5px solid #e5e7eb; border-radius:8px; font-size:14px; font-family:inherit; color:#1a1a1a; background:#f9fafb; outline:none; transition:border-color .15s,box-shadow .15s; box-sizing:border-box; }
            .fi-input:focus { border-color:#1B4D2E; box-shadow:0 0 0 3px rgba(27,77,46,.08); background:#fff; }
            .fi-input-bare { width:100%; padding:11px 14px; border:1.5px solid #e5e7eb; border-radius:8px; font-size:14px; font-family:inherit; color:#1a1a1a; background:#f9fafb; outline:none; transition:border-color .15s; box-sizing:border-box; }
            .fi-input-bare:focus { border-color:#1B4D2E; box-shadow:0 0 0 3px rgba(27,77,46,.08); background:#fff; }
            /* buttons */
            .btn-modal-submit { background:#C8941A; color:#0f2e1a; border:none; padding:12px 22px; border-radius:8px; font-weight:800; font-size:14px; font-family:inherit; cursor:pointer; transition:background .15s,transform .1s; }
            .btn-modal-submit:hover { background:#a8780f; transform:translateY(-1px); }
            .btn-modal-cancel { background:transparent; color:#6b7280; border:1.5px solid #d1d5db; padding:11px 22px; border-radius:8px; font-weight:600; font-size:13.5px; font-family:inherit; cursor:pointer; transition:background .15s; }
            .btn-modal-cancel:hover { background:#f3f4f6; }
            /* alerts */
            .modal-alert { padding:10px 14px; border-radius:8px; font-size:13px; line-height:1.5; margin-bottom:14px; }
            .modal-alert.err { background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; }
            .modal-alert.ok  { background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; }


            /* Campus filter pills */
            .campus-filter { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
            .campus-pill {
                padding:7px 16px; border-radius:20px; font-size:13px; font-weight:600;
                cursor:pointer; border:1.5px solid #e5e7eb; background:#fff; color:#6b7280;
                transition:all .15s; white-space:nowrap;
            }
            .campus-pill:hover { border-color:#00461B; color:#00461B; background:#f0fdf4; }
            .campus-pill.active { border-color:#00461B; color:#fff; background:#00461B; }

            .empty-state { text-align:center; padding:48px; color:#9ca3af; }
            @media(max-width:768px) { .fg-row { grid-template-columns:1fr; } }
        </style>

        <!-- Dropdown switcher -->
        <div class="dp-switcher-wrap">
            <div class="dp-switcher" id="dp-switcher">
                <span class="dp-switcher-label" id="dp-switcher-label">Departments</span>
                <svg class="dp-switcher-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>
                <div class="dp-switcher-menu" id="dp-switcher-menu">
                    <div class="dp-switcher-item active" data-tab="departments">Departments</div>
                    <div class="dp-switcher-item" data-tab="campuses">Campuses</div>
                </div>
            </div>
        </div>

        <!-- Content slot -->
        <div id="dp-slot"></div>
    `;

    const switcher = container.querySelector('#dp-switcher');
    const menu     = container.querySelector('#dp-switcher-menu');
    const label    = container.querySelector('#dp-switcher-label');

    const arrow = container.querySelector('.dp-switcher-arrow');
    switcher.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = menu.classList.toggle('open');
        arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
    });
    document.addEventListener('click', () => {
        menu.classList.remove('open');
        arrow.style.transform = '';
    });

    container.querySelectorAll('.dp-switcher-item').forEach(item => {
        item.addEventListener('click', () => {
            container.querySelectorAll('.dp-switcher-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            label.textContent = item.textContent;
            menu.classList.remove('open');
            activeTab = item.dataset.tab;
            switchTab(container, activeTab);
        });
    });
}

function switchTab(container, tab) {
    if (tab === 'departments') renderDepts(container);
    else                       renderCampuses(container);
}

// ── Departments tab ───────────────────────────────────────────────────────────

async function renderDepts(container) {
    const slot = container.querySelector('#dp-slot');
    slot.innerHTML = '<div class="empty-state">Loading…</div>';

    const url  = activeCampusId
        ? `/DepartmentsAPI.php?action=list&campus_id=${activeCampusId}`
        : '/DepartmentsAPI.php?action=list';
    const res   = await Api.get(url);
    const depts = res.success ? res.data : [];

    const campusPills = campuses.length
        ? `<div class="campus-filter">
               <button class="campus-pill ${!activeCampusId ? 'active' : ''}" data-campus-id="">All Campuses</button>
               ${campuses.map(c =>
                   `<button class="campus-pill ${activeCampusId == c.campus_id ? 'active' : ''}" data-campus-id="${c.campus_id}">${esc(c.campus_name)}</button>`
               ).join('')}
           </div>`
        : '';

    slot.innerHTML = `
        ${campusPills}
        <div class="dp-header">
            <div class="dp-title">Departments <span class="dp-count">${depts.length}</span></div>
            <button class="btn-primary" id="btn-add-dept">+ Add Department</button>
        </div>

        ${depts.length === 0
            ? '<div class="empty-state">No departments found</div>'
            : `<div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Department</th>
                            <th>Dean</th>
                            <th>Programs</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${depts.map(d => {
                            const initials = deptInitials(d.department_code || d.department_name);
                            const addDeanPayload = JSON.stringify({
                                department_id: d.department_id,
                                department_name: d.department_name,
                                preset_campus_id: activeCampusId
                            });
                            const changeDeanPayload = JSON.stringify({
                                department_id: d.department_id,
                                department_name: d.department_name,
                                preset_campus_id: activeCampusId,
                                isChange: true,
                                current_dean: d.dean_name
                            });
                            const deanCell = d.dean_name
                                ? `<div class="dean-name-text">${esc(d.dean_name)}</div><div class="dean-email-text">${esc(d.dean_email || '')}</div>`
                                : `<button class="dean-add-btn" data-add-dean='${addDeanPayload}'>+ Add Dean</button>`;

                            const dropdownAddDean = d.dean_name
                                ? `<a href="#" data-add-dean='${changeDeanPayload}'><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> Change Dean</a><div class="divider"></div>`
                                : `<a href="#" data-add-dean='${addDeanPayload}'><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg> Add Dean</a><div class="divider"></div>`;

                            return `<tr>
                                <td>
                                    <div class="dept-cell">
                                        <div class="dept-icon">${esc(initials)}</div>
                                        <div>
                                            <div class="dept-name">${esc(d.department_name)}</div>
                                            <div class="dept-code">${esc(d.department_code || '')}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>${deanCell}</td>
                                <td><a class="program-badge" href="#admin/programs?department_id=${d.department_id}">${d.program_count} program${d.program_count != 1 ? 's' : ''}</a></td>
                                <td><span class="status-pill active">Active</span></td>
                                <td class="actions-cell">
                                    <button class="btn-edit-tbl" data-edit='${JSON.stringify({id:d.department_id,department_name:d.department_name})}'>Edit</button>
                                    <button class="btn-actions" data-id="${d.department_id}">⋮</button>
                                    <div class="actions-dropdown" data-dropdown="${d.department_id}">
                                        ${dropdownAddDean}
                                        <a href="#" class="danger" data-delete="${d.department_id}" data-name="${esc(d.department_name)}">Deactivate</a>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}
    `;

    // Campus pills
    slot.querySelectorAll('.campus-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            activeCampusId = pill.dataset.campusId ? parseInt(pill.dataset.campusId) : null;
            renderDepts(container);
        });
    });

    slot.querySelector('#btn-add-dept').addEventListener('click', () => openDeptModal(container));

    // Action dropdowns
    slot.querySelectorAll('.btn-actions').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const dd = slot.querySelector(`[data-dropdown="${btn.dataset.id}"]`);
            const open = dd.classList.contains('show');
            slot.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            if (!open) {
                const r = btn.getBoundingClientRect();
                dd.style.top   = (r.bottom + 4) + 'px';
                dd.style.right = (window.innerWidth - r.right) + 'px';
                dd.classList.add('show');
            }
        });
    });
    document.addEventListener('click', () => slot.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show')));

    slot.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            openDeptModal(container, JSON.parse(a.dataset.edit));
        });
    });

    slot.querySelectorAll('[data-delete]').forEach(a => {
        a.addEventListener('click', async e => {
            e.preventDefault();
            if (!await notify.confirm(`Deactivate "${a.dataset.name}"?`, { danger: true, confirmText: 'Deactivate' })) return;
            const r = await Api.post('/DepartmentsAPI.php?action=delete', { department_id: parseInt(a.dataset.delete) });
            if (r.success) renderDepts(container);
            else notify.error(r.message);
        });
    });

    slot.querySelectorAll('[data-add-dean]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            openDeanModal(container, JSON.parse(btn.dataset.addDean));
        });
    });
}

// ── Add / Edit Department modal ───────────────────────────────────────────────

function openDeptModal(container, dept = null) {
    const isEdit = !!dept;

    const overlay = mkOverlay(`
        <div class="modal-hd">
            <div class="modal-hd-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div class="modal-hd-text">
                <h3>${isEdit ? 'Edit Department' : 'Add Department'}</h3>
                <p>${isEdit ? 'Update department information' : 'After saving you can assign a dean'}</p>
            </div>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-bd">
            <div id="dept-alert"></div>
            <div class="fg">
                <label>Department Name *</label>
                <div class="fi-wrap">
                    <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
                    <input class="fi-input" id="m-name" value="${esc(dept?.department_name || '')}" placeholder="e.g., College of Information Technology">
                </div>
            </div>
        </div>
        <div class="modal-ft">
            <button class="btn-modal-cancel modal-cancel">Cancel</button>
            <button class="btn-modal-submit" id="dept-save">${isEdit ? 'Update' : 'Create'} Department</button>
        </div>
    `);

    overlay.querySelector('#dept-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#dept-alert');
        const name = overlay.querySelector('#m-name').value.trim();
        if (!name) { showAlert(alertEl, 'Department name is required.', 'err'); return; }

        const payload = { department_name: name, campus_id: 1, status: 'active' };
        if (isEdit) payload.department_id = dept.id;

        const r = await Api.post(`/DepartmentsAPI.php?action=${isEdit ? 'update' : 'create'}`, payload);
        if (!r.success) { showAlert(alertEl, r.message, 'err'); return; }

        overlay.remove();
        if (!isEdit) {
            openDeanModal(container, { department_id: r.data?.id, department_name: name, preset_campus_id: activeCampusId });
        }
        renderDepts(container);
    });
}

// ── Add / Change Dean modal ────────────────────────────────────────────────────

function openDeanModal(container, info) {
    // info = { department_id, department_name, preset_campus_id?, isChange?, current_dean? }
    const isChange = !!info.isChange;
    const presetId = info.preset_campus_id ? parseInt(info.preset_campus_id) : null;

    const currentDeanNote = isChange && info.current_dean
        ? `<div style="background:#fef9ec;border:1px solid #fde68a;border-radius:9px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#92400e;">
               <strong>Current dean:</strong> ${esc(info.current_dean)} — the new account will replace this assignment.
           </div>`
        : '';

    const campusOptions = campuses.map(c =>
        `<option value="${c.campus_id}" ${presetId == c.campus_id ? 'selected' : ''}>${esc(c.campus_name)}</option>`
    ).join('');

    const campusChecks = campuses.map(c =>
        `<label class="cs-campus-check">
            <input type="checkbox" class="cs-campus-cb" value="${c.campus_id}" ${presetId == c.campus_id ? 'checked' : ''}>
            ${esc(c.campus_name)}
        </label>`
    ).join('');

    const overlay = mkOverlay(`
        <style>
            .cs-scope-box  { border:1.5px solid #e5e7eb; border-radius:8px; overflow:hidden; }
            .cs-radio-row  { display:flex; align-items:center; gap:10px; padding:11px 14px; cursor:pointer; font-size:14px; color:#374151; transition:background .12s; }
            .cs-radio-row:first-child { border-bottom:1px solid #e5e7eb; }
            .cs-radio-row:hover { background:#f9fafb; }
            .cs-radio      { accent-color:#1B4D2E; width:16px; height:16px; flex-shrink:0; }
            .cs-campus-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
            .cs-campus-check { display:flex; align-items:center; gap:10px; padding:9px 12px; border:1.5px solid #e5e7eb; border-radius:8px; cursor:pointer; font-size:13.5px; color:#374151; transition:all .12s; }
            .cs-campus-check:hover { border-color:#1B4D2E; background:#f0fdf4; }
            .cs-campus-check input[type=checkbox] { accent-color:#1B4D2E; width:15px; height:15px; flex-shrink:0; }
            .cs-multi-hint { margin-top:8px; font-size:12px; font-weight:600; padding:6px 10px; border-radius:6px; }
            .cs-multi-hint.warn { background:#fef9ec; color:#92400e; }
            .cs-multi-hint.ok   { background:#dcfce7; color:#15803d; }
            .dean-warn-note { background:#fef9ec; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#92400e; line-height:1.5; }
        </style>
        <div class="modal-hd">
            <div class="modal-hd-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </div>
            <div class="modal-hd-text">
                <h3>${isChange ? 'Change Dean' : 'Add Dean'}</h3>
                <p>${esc(info.department_name)}</p>
            </div>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-bd">
            <div id="dean-alert"></div>
            ${isChange && info.current_dean
                ? `<div class="dean-warn-note"><strong>Current dean:</strong> ${esc(info.current_dean)} — the new account will replace this assignment.</div>`
                : ''}

            <!-- Campus Scope -->
            <div class="fg">
                <label>Campus Scope</label>
                <div class="cs-scope-box">
                    <label class="cs-radio-row">
                        <input type="radio" name="d-scope" value="single" checked class="cs-radio">
                        This campus only
                    </label>
                    <label class="cs-radio-row">
                        <input type="radio" name="d-scope" value="multi" class="cs-radio">
                        Multiple campuses (2 or 3)
                    </label>
                </div>
            </div>

            <!-- Single campus dropdown -->
            <div class="fg" id="d-single-wrap">
                <label>Campus *</label>
                <div class="fi-wrap">
                    <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
                    <select class="fi-input" id="d-campus">
                        <option value="">Select campus…</option>
                        ${campusOptions}
                    </select>
                </div>
            </div>

            <!-- Multi campus checkboxes -->
            <div class="fg" id="d-multi-wrap" style="display:none;">
                <label>Select Campuses (2–3) *</label>
                <div class="cs-campus-list">${campusChecks}</div>
                <div id="d-multi-hint" class="cs-multi-hint"></div>
            </div>

            <!-- Name row 1: First + Middle -->
            <div class="fg-row" style="margin-bottom:14px;">
                <div class="fg" style="margin-bottom:0;">
                    <label>First Name *</label>
                    <div class="fi-wrap">
                        <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                        <input class="fi-input" id="d-fname" placeholder="First name">
                    </div>
                </div>
                <div class="fg" style="margin-bottom:0;">
                    <label>Middle Name <span style="font-weight:400;color:#9ca3af;font-size:12px;">— optional</span></label>
                    <div class="fi-wrap">
                        <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                        <input class="fi-input" id="d-mname" placeholder="Middle name">
                    </div>
                </div>
            </div>
            <!-- Name row 2: Last + Suffix -->
            <div class="fg-row" style="margin-bottom:14px;">
                <div class="fg" style="margin-bottom:0;">
                    <label>Last Name *</label>
                    <div class="fi-wrap">
                        <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                        <input class="fi-input" id="d-lname" placeholder="Last name">
                    </div>
                </div>
                <div class="fg" style="margin-bottom:0;">
                    <label>Extension / Suffix <span style="font-weight:400;color:#9ca3af;font-size:12px;">— optional</span></label>
                    <div class="fi-wrap">
                        <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                        <input class="fi-input" id="d-suffix" placeholder="Jr., Sr., III…">
                    </div>
                </div>
            </div>

            <!-- Email -->
            <div class="fg">
                <label>Email Address *</label>
                <div class="fi-wrap">
                    <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
                    <input class="fi-input" id="d-email" type="email" placeholder="dean@phinmaed.com">
                </div>
            </div>

            <!-- Employee ID -->
            <div class="fg">
                <label>Employee ID <span style="font-weight:400;color:#9ca3af;font-size:12px;">— optional</span></label>
                <div class="fi-wrap">
                    <span class="fi-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg></span>
                    <input class="fi-input" id="d-empid" placeholder="e.g. EMP-0001">
                </div>
            </div>

            <!-- Password notice -->
            <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:9px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;">
                <svg width="18" height="18" style="color:#16a34a;flex-shrink:0;margin-top:1px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div style="font-size:12.5px;color:#166534;line-height:1.55;">
                    <strong>No password needed.</strong> The dean will be asked to set their own secure password the first time they log in.
                </div>
            </div>
        </div>
        <div class="modal-ft">
            <button class="btn-modal-cancel modal-cancel">${isChange ? 'Cancel' : 'Skip for now'}</button>
            <button class="btn-modal-submit" id="dean-save">${isChange ? 'Change Dean' : 'Create Dean Account'}</button>
        </div>
    `);

    // Scope toggle
    const singleWrap = overlay.querySelector('#d-single-wrap');
    const multiWrap  = overlay.querySelector('#d-multi-wrap');
    const hintEl     = overlay.querySelector('#d-multi-hint');

    function updateHint() {
        const checked = overlay.querySelectorAll('.cs-campus-cb:checked').length;
        if (checked < 2) {
            hintEl.className = 'cs-multi-hint warn';
            hintEl.textContent = `Select at least 2 campuses (${checked} selected)`;
        } else {
            hintEl.className = 'cs-multi-hint ok';
            hintEl.textContent = `${checked} campus${checked > 1 ? 'es' : ''} selected`;
        }
    }

    overlay.querySelectorAll('[name="d-scope"]').forEach(r => {
        r.addEventListener('change', () => {
            const isMulti = overlay.querySelector('[name="d-scope"]:checked')?.value === 'multi';
            singleWrap.style.display = isMulti ? 'none' : '';
            multiWrap.style.display  = isMulti ? '' : 'none';
            if (isMulti) updateHint();
        });
    });
    overlay.querySelectorAll('.cs-campus-cb').forEach(cb => cb.addEventListener('change', updateHint));

    overlay.querySelector('#dean-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#dean-alert');
        const isMulti = overlay.querySelector('[name="d-scope"]:checked')?.value === 'multi';
        const fname   = overlay.querySelector('#d-fname').value.trim();
        const mname   = overlay.querySelector('#d-mname').value.trim();
        const lname   = overlay.querySelector('#d-lname').value.trim();
        const suffix  = overlay.querySelector('#d-suffix').value.trim();
        const email   = overlay.querySelector('#d-email').value.trim();
        const empId   = overlay.querySelector('#d-empid').value.trim();

        let campusId, campusIds;
        if (isMulti) {
            campusIds = [...overlay.querySelectorAll('.cs-campus-cb:checked')].map(cb => parseInt(cb.value));
            if (campusIds.length < 2) {
                showAlert(alertEl, 'Select at least 2 campuses for multi-campus scope.', 'err'); return;
            }
            campusId = campusIds[0];
        } else {
            campusId = parseInt(overlay.querySelector('#d-campus').value);
            if (!campusId) { showAlert(alertEl, 'Please select a campus.', 'err'); return; }
            campusIds = [campusId];
        }

        if (!fname || !lname || !email) {
            showAlert(alertEl, 'First name, last name, and email are required.', 'err'); return;
        }

        const r = await Api.post('/UsersAPI.php?action=create', {
            first_name:    fname,
            middle_name:   mname || null,
            last_name:     lname,
            suffix:        suffix || null,
            email,
            password:      null,
            role:          'dean',
            status:        'active',
            campus_id:     campusId,
            campus_ids:    campusIds,
            department_id: info.department_id,
            program_id:    null,
            employee_id:   empId || null,
        });

        if (r.success) {
            overlay.remove();
            renderDepts(container);
            const scopeLabel = isMulti ? ` (${campusIds.length} campuses)` : '';
            notify.success(isChange
                ? `Dean changed to ${fname} ${lname}${scopeLabel}`
                : `Dean account created for ${fname} ${lname}${scopeLabel}`);
        } else {
            showAlert(alertEl, r.message || 'Failed to create dean account.', 'err');
        }
    });
}

// ── Campus tab ────────────────────────────────────────────────────────────────

async function renderCampuses(container) {
    const slot = container.querySelector('#dp-slot');
    slot.innerHTML = '<div class="empty-state">Loading…</div>';

    const res      = await Api.get('/CampusAPI.php?action=list');
    const campList = res.success ? res.data : [];

    slot.innerHTML = `
        <div class="dp-header">
            <div class="dp-title">Campuses <span class="dp-count">${campList.length}</span></div>
            <button class="btn-primary" id="btn-add-campus">+ Add Campus</button>
        </div>

        ${campList.length === 0
            ? '<div class="empty-state">No campuses found</div>'
            : `<div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Campus</th>
                            <th>Address</th>
                            <th>Contact</th>
                            <th>Email</th>
                            <th>Departments</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${campList.map(c => {
                            const phones = (c.contact_number || '').split('|').map(p => p.trim()).filter(Boolean);
                            const contactHtml = phones.length
                                ? phones.map(p => `<div style="font-size:12.5px;color:#525252;">${esc(p)}</div>`).join('')
                                : '<span style="color:#9ca3af;">—</span>';
                            const isActive = c.status !== 'inactive';
                            return `<tr>
                                <td>
                                    <div class="dept-cell">
                                        <div class="dept-icon">${esc(deptInitials(c.campus_code || c.campus_name))}</div>
                                        <div>
                                            <div class="dept-name">${esc(c.campus_name)}</div>
                                            <div class="dept-code">${esc(c.campus_code || '')}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style="font-size:12.5px;color:#525252;max-width:220px;">${esc(c.address || '—')}</td>
                                <td>${contactHtml}</td>
                                <td style="font-size:12.5px;color:#525252;">${esc(c.email || '—')}</td>
                                <td><span class="program-badge">${c.department_count} dept${c.department_count!=1?'s':''} · ${c.user_count ?? 0} users</span></td>
                                <td><span class="status-pill ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                                <td class="actions-cell">
                                    <button class="btn-edit-tbl" data-edit-campus='${JSON.stringify({campus_id:c.campus_id,campus_name:c.campus_name,campus_code:c.campus_code,address:c.address||'',contact_number:c.contact_number||'',email:c.email||'',status:c.status})}'>Edit</button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}
    `;

    slot.querySelector('#btn-add-campus').addEventListener('click', () => openCampusModal(container, null));

    slot.querySelectorAll('[data-edit-campus]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            openCampusModal(container, JSON.parse(a.dataset.editCampus));
        });
    });
}

function openCampusModal(container, campus) {
    const isEdit   = !!campus;
    const phones   = (campus?.contact_number || '').split('|').map(p => p.trim());
    const mobile   = phones[0] || '';
    const landline = phones[1] || '';

    const overlay = mkOverlay(`
        <div class="modal-hd">
            <div class="modal-hd-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div class="modal-hd-text">
                <h3>${isEdit ? 'Edit Campus' : 'Add Campus'}</h3>
                <p>${isEdit ? 'Update campus information' : 'Add a new PHINMA COC campus'}</p>
            </div>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-bd">
            <div id="campus-alert"></div>
            <div class="fg">
                <label>Campus Name *</label>
                <input class="fi-input-bare" id="cm-name" value="${esc(campus?.campus_name || '')}" placeholder="e.g., Carmen Campus">
            </div>
            <div class="fg-row" style="margin-bottom:14px;">
                <div class="fg" style="margin-bottom:0;">
                    <label>Campus Code *</label>
                    <input class="fi-input-bare" id="cm-code" value="${esc(campus?.campus_code || '')}" placeholder="COC-CDO">
                </div>
                <div class="fg" style="margin-bottom:0;">
                    <label>Status</label>
                    <select class="fi-input-bare" id="cm-status">
                        <option value="active"   ${campus?.status !== 'inactive' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${campus?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </div>
            <div class="fg">
                <label>Address</label>
                <input class="fi-input-bare" id="cm-address" value="${esc(campus?.address || '')}" placeholder="Street, City">
            </div>
            <div class="fg-row" style="margin-bottom:14px;">
                <div class="fg" style="margin-bottom:0;">
                    <label>Mobile</label>
                    <input class="fi-input-bare" id="cm-mobile" value="${esc(mobile)}" placeholder="0917-xxx-xxxx">
                </div>
                <div class="fg" style="margin-bottom:0;">
                    <label>Landline</label>
                    <input class="fi-input-bare" id="cm-landline" value="${esc(landline)}" placeholder="(088) 858-xxxx">
                </div>
            </div>
            <div class="fg">
                <label>Email</label>
                <input class="fi-input-bare" id="cm-email" value="${esc(campus?.email || '')}" placeholder="info@phinmaed.com">
            </div>
        </div>
        <div class="modal-ft">
            <button class="btn-modal-cancel modal-cancel">Cancel</button>
            <button class="btn-modal-submit" id="campus-save">${isEdit ? 'Update' : 'Create'} Campus</button>
        </div>
    `);

    overlay.querySelector('#campus-save').addEventListener('click', async () => {
        const alertEl  = overlay.querySelector('#campus-alert');
        const mob      = overlay.querySelector('#cm-mobile').value.trim();
        const land     = overlay.querySelector('#cm-landline').value.trim();
        const payload = {
            campus_name:    overlay.querySelector('#cm-name').value.trim(),
            campus_code:    overlay.querySelector('#cm-code').value.trim(),
            address:        overlay.querySelector('#cm-address').value.trim(),
            contact_number: [mob, land].filter(Boolean).join(' | '),
            email:          overlay.querySelector('#cm-email').value.trim(),
            status:         overlay.querySelector('#cm-status').value,
        };
        if (isEdit) payload.campus_id = campus.campus_id;
        if (!payload.campus_name || !payload.campus_code) {
            showAlert(alertEl, 'Campus name and code are required.', 'err'); return;
        }
        const r = await Api.post(`/CampusAPI.php?action=${isEdit ? 'update' : 'create'}`, payload);
        if (r.success) {
            overlay.remove();
            const cr = await Api.get('/DepartmentsAPI.php?action=campuses');
            campuses = cr.success ? cr.data : campuses;
            renderCampuses(container);
        } else {
            showAlert(alertEl, r.message, 'err');
        }
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkOverlay(html) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return overlay;
}

function showAlert(el, msg, type) {
    el.innerHTML = `<div class="modal-alert ${type}">${esc(msg)}</div>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function deptInitials(str) {
    return (str || '?').trim().slice(0, 2).toUpperCase();
}
