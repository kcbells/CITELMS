/**
 * Admin Programs Page
 * Full CRUD for program management with client-side filters
 */
import { Api } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let departments  = [];
let allPrograms  = [];
let deptFilter   = '';

export async function render(container) {
    const hashQuery  = window.location.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashQuery);
    deptFilter       = hashParams.get('department_id') || '';

    const deptRes = await Api.get('/ProgramsAPI.php?action=departments');
    departments   = deptRes.success ? deptRes.data : [];
    await renderList(container);
}

async function renderList(container) {
    // Always fetch all programs, filter client-side
    const result  = await Api.get('/ProgramsAPI.php?action=list');
    allPrograms   = result.success ? result.data : [];

    container.innerHTML = `
        <style>
            /* ── Page Header ── */
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; margin:0; }
            .count-badge { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:7px; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            /* ── Filter Bar ── */
            .filter-bar {
                display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                background:#fff; border:1px solid #e8e8e8; border-radius:12px;
                padding:12px 16px; margin-bottom:20px;
            }
            .filter-search-wrap {
                flex:1; min-width:200px;
                display:flex; align-items:center; gap:8px;
                background:#f9fafb; border:1px solid #e8e8e8; border-radius:8px;
                padding:8px 12px;
            }
            .filter-search-wrap svg { flex-shrink:0; color:#9ca3af; }
            .filter-search-wrap input {
                border:none; outline:none; background:transparent;
                font-size:13.5px; width:100%; color:#262626;
            }
            .filter-search-wrap input::placeholder { color:#b0b8c4; }
            .filter-select {
                padding:8px 32px 8px 12px; border:1px solid #e8e8e8; border-radius:8px;
                font-size:13.5px; color:#374151; background:#f9fafb url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
                appearance:none; cursor:pointer; outline:none;
            }
            .filter-select:focus { border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
            .status-tabs { display:flex; gap:4px; }
            .status-tab {
                padding:7px 14px; border-radius:8px; font-size:13px; font-weight:600;
                border:1px solid #e8e8e8; background:#f9fafb; color:#6b7280;
                cursor:pointer; transition:all .15s; white-space:nowrap;
            }
            .status-tab:hover { border-color:#00461B; color:#00461B; }
            .status-tab.active { background:#E8F5E9; border-color:#1B4D3E; color:#1B4D3E; }
            .filter-divider { width:1px; background:#e8e8e8; height:28px; flex-shrink:0; }
            .btn-clear-filters {
                padding:7px 14px; border-radius:8px; font-size:13px; font-weight:500;
                border:1px solid #e8e8e8; background:#fff; color:#9ca3af;
                cursor:pointer; transition:all .15s; white-space:nowrap; display:none;
            }
            .btn-clear-filters.visible { display:block; }
            .btn-clear-filters:hover { border-color:#b91c1c; color:#b91c1c; }

            /* ── Results summary ── */
            .results-info { font-size:13px; color:#9ca3af; margin-bottom:16px; }
            .results-info strong { color:#374151; }

            /* ── Program Cards ── */
            .programs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:18px; }
            .program-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden; transition:all .2s; }
            .program-card:hover { border-color:#1B4D3E; box-shadow:0 6px 20px rgba(0,0,0,.09); transform:translateY(-2px); }
            .program-card-header { padding:18px 18px 0; display:flex; justify-content:space-between; align-items:flex-start; }
            .program-code { background:#E8F5E9; color:#1B4D3E; padding:5px 12px; border-radius:8px; font-family:monospace; font-weight:700; font-size:13.5px; letter-spacing:.5px; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-active { background:#E8F5E9; color:#1B4D3E; }
            .badge-inactive { background:#FEE2E2; color:#b91c1c; }
            .program-card-body { padding:14px 18px 18px; }
            .program-name { font-size:15.5px; font-weight:700; color:#262626; margin-bottom:4px; line-height:1.35; }
            .program-dept { font-size:12.5px; color:#9ca3af; margin-bottom:14px; display:flex; align-items:center; gap:6px; }
            .program-stats { display:flex; gap:10px; }
            .stat-item { text-align:center; flex:1; padding:10px 8px; background:#f9fafb; border-radius:8px; }
            .stat-num { display:block; font-size:20px; font-weight:800; color:#262626; }
            .stat-label { display:block; font-size:11px; color:#9ca3af; margin-top:2px; }

            /* ── Actions ── */
            .actions-cell { position:relative; }
            .btn-actions { background:none; border:1px solid #e0e0e0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
            .btn-actions:hover { background:#f5f5f5; }
            .actions-dropdown { display:none; position:fixed; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.15); min-width:160px; z-index:9999; overflow:hidden; }
            .actions-dropdown.show { display:block; }
            .actions-dropdown a { display:flex; align-items:center; gap:8px; padding:10px 16px; font-size:13px; color:#404040; cursor:pointer; text-decoration:none; }
            .actions-dropdown a:hover { background:#f5f5f5; }
            .actions-dropdown a.danger { color:#b91c1c; }
            .actions-dropdown .divider { height:1px; background:#f0f0f0; margin:4px 0; }

            /* ── Empty state ── */
            .empty-filtered { text-align:center; padding:60px 20px; color:#9ca3af; }
            .empty-filtered svg { margin-bottom:12px; opacity:.35; }
            .empty-filtered p { font-size:15px; font-weight:600; color:#6b7280; margin:0 0 6px; }
            .empty-filtered span { font-size:13px; }

            /* ── Modal ── */
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
            @media(max-width:768px) { .form-grid{grid-template-columns:1fr;} .programs-grid{grid-template-columns:1fr;} .filter-bar{flex-direction:column;align-items:stretch;} }
        </style>

        ${deptFilter ? `<a href="#admin/departments" style="display:inline-flex;align-items:center;gap:6px;color:#00461B;font-size:14px;font-weight:500;text-decoration:none;margin-bottom:16px;">← Back to Departments</a>` : ''}

        <div class="page-header">
            <h2>Programs <span class="count-badge" id="prog-count">${allPrograms.length}</span></h2>
            <button class="btn-primary" id="btn-add">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Program
            </button>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar">
            <div class="filter-search-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="filter-search" placeholder="Search by name or code…" autocomplete="off">
            </div>

            <select class="filter-select" id="filter-dept">
                <option value="">All Departments</option>
                ${departments.map(d => `<option value="${d.department_id}" ${String(d.department_id)===String(deptFilter)?'selected':''}>${esc(d.department_name)}</option>`).join('')}
            </select>

            <div class="filter-divider"></div>

            <div class="status-tabs">
                <button class="status-tab active" data-status="">All</button>
                <button class="status-tab" data-status="active">Active</button>
                <button class="status-tab" data-status="inactive">Inactive</button>
            </div>

            <div class="filter-divider"></div>
            <button class="btn-clear-filters" id="btn-clear">${icon('close', inl)} Clear</button>
        </div>

        <div class="results-info" id="results-info"></div>
        <div id="programs-grid-wrap"></div>
    `;

    // ── Wire up filter events ──────────────────────────────────────
    const searchEl  = container.querySelector('#filter-search');
    const deptEl    = container.querySelector('#filter-dept');
    const clearBtn  = container.querySelector('#btn-clear');
    const statusTabs = container.querySelectorAll('.status-tab');

    let activeStatus = '';

    // Pre-select dept from hash
    if (deptFilter) deptEl.value = deptFilter;

    function applyFilters() {
        const q      = searchEl.value.trim().toLowerCase();
        const dId    = deptEl.value;
        const status = activeStatus;

        const filtered = allPrograms.filter(p => {
            const matchSearch = !q ||
                p.program_name.toLowerCase().includes(q) ||
                p.program_code.toLowerCase().includes(q);
            const matchDept   = !dId || String(p.department_id) === String(dId);
            const matchStatus = !status || p.status === status;
            return matchSearch && matchDept && matchStatus;
        });

        // Show/hide clear button
        const hasFilter = q || dId || status;
        clearBtn.classList.toggle('visible', !!hasFilter);

        // Update count badge
        container.querySelector('#prog-count').textContent = filtered.length;

        // Results info
        const info = container.querySelector('#results-info');
        if (hasFilter) {
            info.innerHTML = `Showing <strong>${filtered.length}</strong> of <strong>${allPrograms.length}</strong> programs`;
        } else {
            info.innerHTML = '';
        }

        // Render cards
        renderCards(filtered);
    }

    function renderCards(programs) {
        const wrap = container.querySelector('#programs-grid-wrap');

        if (programs.length === 0) {
            wrap.innerHTML = `
                <div class="empty-filtered">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <p>No programs match your filters</p>
                    <span>Try adjusting your search or clearing filters</span>
                </div>`;
            return;
        }

        wrap.innerHTML = `
            <div class="programs-grid">
                ${programs.map(p => `
                    <div class="program-card">
                        <div class="program-card-header">
                            <span class="program-code">${esc(p.program_code)}</span>
                            <div class="actions-cell">
                                <button class="btn-actions" data-id="${p.program_id}">⋮</button>
                                <div class="actions-dropdown" data-dropdown="${p.program_id}">
                                    <a href="#" data-edit="${p.program_id}">${L.edit}</a>
                                    <div class="divider"></div>
                                    <a href="#" class="danger" data-delete="${p.program_id}" data-name="${esc(p.program_name)}">${L.deactivate}</a>
                                </div>
                            </div>
                        </div>
                        <div class="program-card-body">
                            <div class="program-name">${esc(p.program_name)}</div>
                            <div class="program-dept">
                                ${esc(p.department_name || 'No department')}
                                <span class="badge badge-${p.status}">${p.status}</span>
                            </div>
                            <div class="program-stats">
                                <div class="stat-item">
                                    <span class="stat-num">${p.student_count || 0}</span>
                                    <span class="stat-label">Students</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-num">${p.total_units || 0}</span>
                                    <span class="stat-label">Total Units</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;

        // Bind card events
        wrap.querySelectorAll('.btn-actions').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
                const dd = wrap.querySelector(`[data-dropdown="${btn.dataset.id}"]`);
                if (dd) {
                    const rect = btn.getBoundingClientRect();
                    dd.style.top   = (rect.bottom + 4) + 'px';
                    dd.style.right = (window.innerWidth - rect.right) + 'px';
                    dd.classList.add('show');
                }
            });
        });

        wrap.querySelectorAll('[data-edit]').forEach(a => {
            a.addEventListener('click', async (e) => {
                e.preventDefault();
                const res = await Api.get('/ProgramsAPI.php?action=get&id=' + a.dataset.edit);
                if (res.success) openModal(container, res.data);
            });
        });

        wrap.querySelectorAll('[data-delete]').forEach(a => {
            a.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!confirm(`Deactivate "${a.dataset.name}"?`)) return;
                const res = await Api.post('/ProgramsAPI.php?action=delete', { program_id: parseInt(a.dataset.delete) });
                if (res.success) renderList(container);
                else alert(res.message);
            });
        });
    }

    // Status tab clicks
    statusTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            statusTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeStatus = tab.dataset.status;
            applyFilters();
        });
    });

    searchEl.addEventListener('input', applyFilters);
    deptEl.addEventListener('change', applyFilters);

    clearBtn.addEventListener('click', () => {
        searchEl.value = '';
        deptEl.value   = '';
        activeStatus   = '';
        statusTabs.forEach(t => t.classList.toggle('active', t.dataset.status === ''));
        applyFilters();
    });

    // Add button
    container.querySelector('#btn-add').addEventListener('click', () => {
        const preselect = deptEl.value ? { department_id: deptEl.value } : (deptFilter ? { department_id: deptFilter } : null);
        openModal(container, null, preselect);
    });

    document.addEventListener('click', () => container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show')));

    // Initial render
    applyFilters();
}

function openModal(container, prog = null, preselect = null) {
    const isEdit = !!prog;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const activeDeptId = prog?.department_id ?? preselect?.department_id ?? '';
    const deptOpts = departments.map(d => `<option value="${d.department_id}" ${activeDeptId && String(activeDeptId)==String(d.department_id)?'selected':''}>${esc(d.department_name)}</option>`).join('');

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${isEdit ? 'Edit Program' : 'Add Program'}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Program Code *</label>
                        <input class="form-input" id="m-code" value="${esc(prog?.program_code||'')}" placeholder="e.g., BSIT">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Total Units</label>
                        <input type="number" class="form-input" id="m-units" value="${prog?.total_units||150}" min="0">
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Program Name *</label>
                        <input class="form-input" id="m-name" value="${esc(prog?.program_name||'')}" placeholder="e.g., Bachelor of Science in Information Technology">
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Department *</label>
                        <select class="form-select" id="m-dept"><option value="">Select Department</option>${deptOpts}</select>
                    </div>
                    <div class="form-group full">
                        <label class="form-label">Description</label>
                        <textarea class="form-textarea" id="m-desc" rows="3">${esc(prog?.description||'')}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="m-status">
                            <option value="active" ${prog?.status==='active'||!prog?'selected':''}>Active</option>
                            <option value="inactive" ${prog?.status==='inactive'?'selected':''}>Inactive</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update' : 'Create'} Program</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const payload = {
            program_code: overlay.querySelector('#m-code').value,
            program_name: overlay.querySelector('#m-name').value,
            total_units: parseInt(overlay.querySelector('#m-units').value) || 150,
            department_id: overlay.querySelector('#m-dept').value,
            description: overlay.querySelector('#m-desc').value,
            status: overlay.querySelector('#m-status').value,
        };
        if (isEdit) payload.program_id = prog.program_id;

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/ProgramsAPI.php?action=${action}`, payload);

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
