/**
 * Admin Sections Page
 * Each section is a semester-specific cohort with program + year level context
 */
import { Api } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let _semesters      = [];
let _programs       = [];
let _departments    = [];
let _filterPrograms = [];  // programs for list filter bar (cascades from dept)
let _currentDeptId  = '';  // tracks selected department filter

export async function render(container) {
    const [semRes, progRes, deptRes] = await Promise.all([
        Api.get('/SectionsAPI.php?action=semesters'),
        Api.get('/SectionsAPI.php?action=programs'),
        Api.get('/SectionsAPI.php?action=departments')
    ]);
    _semesters      = semRes.success  ? semRes.data  : [];
    _programs       = progRes.success ? progRes.data : [];
    _departments    = deptRes.success ? deptRes.data : [];
    _filterPrograms = [..._programs];
    _currentDeptId  = '';
    renderList(container);
}

async function renderList(container, semesterId = '', programId = '', deptId = '') {
    _currentDeptId = deptId;
    let url = '/SectionsAPI.php?action=list';
    if (semesterId) url += '&semester_id=' + semesterId;
    if (programId)  url += '&program_id='  + programId;

    const result   = await Api.get(url);
    const sections = result.success ? result.data : [];

    // Active semester default for filter
    const activeSem = _semesters.find(s => s.status === 'active');
    const semOpts = _semesters.map(s =>
        `<option value="${s.semester_id}" ${String(semesterId) === String(s.semester_id) ? 'selected' : ''}>
            ${esc(s.semester_name)} – ${esc(s.academic_year)}${s.status === 'active' ? ' (Current)' : ''}
         </option>`
    ).join('');
    const deptFilterOpts = _departments.map(d =>
        `<option value="${d.department_id}" ${String(deptId) === String(d.department_id) ? 'selected' : ''}>
            ${esc(d.department_code ? d.department_code + ' – ' : '')}${esc(d.department_name)}
         </option>`
    ).join('');
    const progOpts = _filterPrograms.map(p =>
        `<option value="${p.program_id}" ${String(programId) === String(p.program_id) ? 'selected' : ''}>
            ${esc(p.program_code)}
         </option>`
    ).join('');

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .count-badge { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            /* Workflow banner */
            .workflow-banner { display:flex; align-items:center; gap:10px; margin-bottom:20px; padding:12px 20px; background:#f0faf4; border:1px solid #c3e6cb; border-radius:10px; flex-wrap:wrap; }
            .wf-step { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:90px; }
            .wf-num { width:28px; height:28px; background:#ccc; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
            .wf-step.wf-done .wf-num { background:#6aaa80; }
            .wf-step.wf-active .wf-num { background:#1B4D3E; }
            .wf-label { font-size:12px; font-weight:700; color:#1B4D3E; text-align:center; }
            .wf-sub { font-size:10px; color:#737373; text-align:center; }
            .wf-arrow { font-size:18px; color:#9ca3af; flex-shrink:0; }

            /* Filters */
            .filters { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .filters input { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:180px; flex:1; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; cursor:pointer; }

            /* Grid */
            .sections-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:20px; }
            .section-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden; transition:all .2s; }
            .section-card:hover { border-color:#00461B; box-shadow:0 4px 12px rgba(0,0,0,.06); }

            .section-top { padding:16px 20px; display:flex; justify-content:space-between; align-items:center; }
            .enrollment-code { background:#1B4D3E; color:#fff; padding:6px 12px; border-radius:8px; font-family:monospace; font-size:14px; font-weight:700; letter-spacing:1px; cursor:pointer; }
            .enrollment-code:hover { background:#006428; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
            .badge-active { background:#E8F5E9; color:#1B4D3E; }
            .badge-inactive { background:#FEE2E2; color:#b91c1c; }

            .kebab-wrap { position:relative; }
            .btn-kebab { width:32px; height:32px; border-radius:8px; border:1px solid #e8e8e8; background:#fff; cursor:pointer; font-size:18px; display:flex; align-items:center; justify-content:center; color:#737373; line-height:1; }
            .btn-kebab:hover { background:#f5f5f5; border-color:#ccc; color:#262626; }
            .kebab-menu { position:absolute; top:38px; right:0; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:140px; z-index:100; overflow:hidden; display:none; }
            .kebab-menu.open { display:block; }
            .kebab-item { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13px; font-weight:500; color:#404040; cursor:pointer; border:none; background:none; width:100%; text-align:left; }
            .kebab-item:hover { background:#f5f5f5; }
            .kebab-item.danger { color:#b91c1c; }
            .kebab-item.danger:hover { background:#fef2f2; }

            .section-body { padding:0 20px 8px; }
            .section-name { font-size:17px; font-weight:700; color:#262626; margin-bottom:8px; }

            /* Context pills */
            .section-ctx { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
            .ctx-pill { padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
            .ctx-sem  { background:#DBEAFE; color:#1E40AF; }
            .ctx-prog { background:#E8F5E9; color:#1B4D3E; }
            .ctx-year { background:#FEF3C7; color:#B45309; }

            .subjects-block { border-top:1px solid #f0f0f0; padding-top:12px; }
            .subjects-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
            .subjects-label { font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.7px; }
            .btn-add-subj { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border:1px dashed #1B4D3E; color:#1B4D3E; background:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; }
            .btn-add-subj:hover { background:#E8F5E9; }

            .subj-row { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid #fafafa; }
            .subj-row:last-child { border-bottom:none; }
            .subj-code-tag { background:#E8F5E9; color:#1B4D3E; padding:2px 7px; border-radius:4px; font-family:monospace; font-size:11px; font-weight:700; flex-shrink:0; margin-top:2px; }
            .subj-info { flex:1; min-width:0; }
            .subj-name { font-size:13px; font-weight:600; color:#262626; }
            .subj-detail { font-size:11px; color:#737373; margin-top:2px; display:flex; gap:8px; flex-wrap:wrap; }
            .btn-remove-subj { width:22px; height:22px; border-radius:5px; border:1px solid #fecaca; background:#fff; color:#b91c1c; cursor:pointer; font-size:13px; flex-shrink:0; display:flex; align-items:center; justify-content:center; margin-top:2px; }
            .btn-remove-subj:hover { background:#fef2f2; }
            .btn-edit-subj { width:22px; height:22px; border-radius:5px; border:1px solid #e8e8e8; background:#fff; color:#737373; cursor:pointer; font-size:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center; margin-top:2px; }
            .btn-edit-subj:hover { background:#f5f5f5; border-color:#ccc; }
            .no-sched { font-size:10px; color:#d97706; background:#FEF3C7; padding:1px 5px; border-radius:3px; }
            .bm-row:hover { background:#f9fafb; }
            .bm-chk { width:16px; height:16px; cursor:pointer; accent-color:#1B4D3E; flex-shrink:0; }
            .no-subjects { font-size:13px; color:#9ca3af; text-align:center; padding:12px 0; }

            .enrollment-bar { background:#f0f0f0; height:5px; border-radius:3px; overflow:hidden; margin:12px 0 4px; }
            .enrollment-fill { height:100%; border-radius:3px; background:#00461B; transition:width .3s; }
            .enrollment-text { font-size:11px; color:#737373; margin-bottom:12px; }

            .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
            .modal { background:#fff; border-radius:16px; width:90%; max-width:480px; max-height:90vh; overflow-y:auto; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; color:#262626; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }
            .form-group { margin-bottom:16px; }
            .form-label { display:block; font-size:12px; font-weight:700; color:#6b7280; margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }
            .form-input, .form-select { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; }
            .form-input:focus, .form-select:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
            .form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .alert { padding:10px 16px; border-radius:8px; margin-bottom:12px; font-size:13px; }
            .alert-error { background:#FEE2E2; color:#b91c1c; }
            .empty-state { text-align:center; padding:60px 20px; color:#737373; }
            .copied-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#1B4D3E; color:#fff; padding:10px 20px; border-radius:8px; font-size:14px; z-index:9999; }
            @media(max-width:768px) { .sections-grid { grid-template-columns:1fr; } .form-row { grid-template-columns:1fr; } .workflow-banner { gap:6px; } }
        </style>

        <div class="page-header">
            <h2>Sections <span class="count-badge">${sections.length}</span></h2>
            <button class="btn-primary" id="btn-add">+ Add Section</button>
        </div>

        <div class="workflow-banner">
            <div class="wf-step wf-done">
                <span class="wf-num">1</span>
                <span class="wf-label">Faculty Assignments</span>
                <span class="wf-sub">Assign instructors to subjects</span>
            </div>
            <span class="wf-arrow">→</span>
            <div class="wf-step wf-active">
                <span class="wf-num">2</span>
                <span class="wf-label">Sections</span>
                <span class="wf-sub">Create cohorts per semester</span>
            </div>
            <span class="wf-arrow">→</span>
            <div class="wf-step">
                <span class="wf-num">3</span>
                <span class="wf-label">Students Enroll</span>
                <span class="wf-sub">Via enrollment code</span>
            </div>
        </div>

        <div class="filters">
            <input type="text" id="filter-search" placeholder="Search section name...">
            <select id="filter-semester">
                <option value="">All Semesters</option>
                ${semOpts}
            </select>
            <select id="filter-dept">
                <option value="">All Departments</option>
                ${deptFilterOpts}
            </select>
            <select id="filter-program">
                <option value="">All Programs</option>
                ${progOpts}
            </select>
            <select id="filter-status">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        </div>

        ${sections.length === 0 ? '<div class="empty-state">No sections found. Create one to get started.</div>' : `
        <div class="sections-grid" id="sections-grid">
            ${sections.map(s => renderSectionCard(s)).join('')}
        </div>`}
    `;

    // Current filter state from dropdowns
    const getCurrentFilters = () => ({
        semId:  container.querySelector('#filter-semester')?.value || '',
        deptId: container.querySelector('#filter-dept')?.value     || '',
        progId: container.querySelector('#filter-program')?.value  || '',
    });

    // Add section button
    container.querySelector('#btn-add').addEventListener('click', () => {
        const { semId, progId } = getCurrentFilters();
        openSectionModal(container, null, semId, progId);
    });

    // Kebab menus
    container.querySelectorAll('.btn-kebab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            const isOpen = menu.classList.contains('open');
            container.querySelectorAll('.kebab-menu.open').forEach(m => m.classList.remove('open'));
            if (!isOpen) menu.classList.add('open');
        });
    });
    document.addEventListener('click', () => container.querySelectorAll('.kebab-menu.open').forEach(m => m.classList.remove('open')));

    // Copy enrollment code
    container.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.copy);
            const toast = document.createElement('div');
            toast.className = 'copied-toast';
            toast.textContent = 'Enrollment code copied!';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        });
    });

    // Edit section
    container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.kebab-menu.open').forEach(m => m.classList.remove('open'));
            const s = sections.find(x => x.section_id == btn.dataset.edit);
            if (s) openSectionModal(container, s, s.semester_id || '', s.program_id || '');
        });
    });

    // Delete section
    container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
            container.querySelectorAll('.kebab-menu.open').forEach(m => m.classList.remove('open'));
            const count = parseInt(btn.dataset.count) || 0;
            const warn = count > 0 ? `\n\nThis will also unenroll ${count} enrolled student(s).` : '';
            if (!confirm(`Delete section "${btn.dataset.name}"?${warn}`)) return;
            const res = await Api.post('/SectionsAPI.php?action=delete', { section_id: parseInt(btn.dataset.delete) });
            if (res.success) {
                const { semId, progId, deptId: curDeptId } = getCurrentFilters();
                renderList(container, semId, progId, curDeptId);
            } else alert(res.message);
        });
    });

    // Manage students
    container.querySelectorAll('[data-manage-students]').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.kebab-menu.open').forEach(m => m.classList.remove('open'));
            openManageStudentsModal(container, parseInt(btn.dataset.manageStudents), btn.dataset.sname);
        });
    });

    // Add subjects to section (bulk)
    container.querySelectorAll('[data-add-subject]').forEach(btn => {
        btn.addEventListener('click', () => openBulkSubjectModal(container, parseInt(btn.dataset.addSubject), getCurrentFilters()));
    });

    // Edit subject schedule/room
    container.querySelectorAll('[data-edit-secsubj]').forEach(btn => {
        btn.addEventListener('click', () => openEditSubjModal(container, btn, getCurrentFilters()));
    });

    // Remove subject from section
    container.querySelectorAll('[data-remove-secsubj]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this subject from the section?')) return;
            const res = await Api.post('/SectionsAPI.php?action=remove-subject', {
                section_subject_id: parseInt(btn.dataset.removeSecsubj)
            });
            if (res.success) {
                const { semId, progId, deptId: curDeptId } = getCurrentFilters();
                renderList(container, semId, progId, curDeptId);
            } else alert(res.message);
        });
    });

    // Dept filter: cascade to programs, then reload
    container.querySelector('#filter-dept').addEventListener('change', async function() {
        const newDeptId = this.value;
        const curSemId  = container.querySelector('#filter-semester')?.value || '';
        if (newDeptId) {
            const r = await Api.get('/SectionsAPI.php?action=programs&department_id=' + newDeptId);
            _filterPrograms = r.success ? r.data : [];
        } else {
            _filterPrograms = [..._programs];
        }
        renderList(container, curSemId, '', newDeptId);
    });

    // Semester / Program filter dropdowns → reload with server filter
    container.querySelector('#filter-semester').addEventListener('change', () => {
        const { semId, progId, deptId: curDeptId } = getCurrentFilters();
        renderList(container, semId, progId, curDeptId);
    });
    container.querySelector('#filter-program').addEventListener('change', () => {
        const { semId, progId, deptId: curDeptId } = getCurrentFilters();
        renderList(container, semId, progId, curDeptId);
    });

    // Search / status filters (client-side)
    function applyFilters() {
        const q    = container.querySelector('#filter-search').value.toLowerCase();
        const stat = container.querySelector('#filter-status').value.toLowerCase();
        container.querySelectorAll('.section-card').forEach(card => {
            const name  = card.querySelector('.section-name')?.textContent.toLowerCase() || '';
            const badge = card.querySelector('.badge')?.textContent.toLowerCase() || '';
            const show  = (!q || name.includes(q)) && (!stat || badge === stat);
            card.style.display = show ? '' : 'none';
        });
    }
    container.querySelector('#filter-search').addEventListener('input', applyFilters);
    container.querySelector('#filter-status').addEventListener('change', applyFilters);
}

function renderSectionCard(s) {
    const pct      = s.max_students > 0 ? Math.round((s.student_count / s.max_students) * 100) : 0;
    const subjects = s.subjects || [];
    const YEAR_LBL = { 1:'1st Year', 2:'2nd Year', 3:'3rd Year', 4:'4th Year' };

    const ctxPills = [
        s.semester_name ? `<span class="ctx-pill ctx-sem">${esc(s.academic_year || '')} ${esc(s.semester_name)}</span>` : '',
        s.program_code  ? `<span class="ctx-pill ctx-prog">${esc(s.program_code)}</span>` : '',
        s.year_level    ? `<span class="ctx-pill ctx-year">${YEAR_LBL[s.year_level] || 'Year ' + s.year_level}</span>` : '',
    ].filter(Boolean).join('');

    return `
    <div class="section-card">
        <div class="section-top">
            <span class="enrollment-code" data-copy="${esc(s.enrollment_code)}" title="Click to copy">${esc(s.enrollment_code)}</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="badge badge-${s.status}">${s.status}</span>
                <div class="kebab-wrap">
                    <button class="btn-kebab" title="Actions">&#8942;</button>
                    <div class="kebab-menu">
                        <button class="kebab-item" data-edit="${s.section_id}">${L.edit}</button>
                        <button class="kebab-item" data-manage-students="${s.section_id}" data-sname="${esc(s.section_name)}">${icon('users', inl)} Manage Students</button>
                        <button class="kebab-item danger" data-delete="${s.section_id}" data-name="${esc(s.section_name)}" data-count="${s.student_count}">${icon('trash', inl)} Delete</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="section-body">
            <div class="section-name">${esc(s.section_name)}</div>
            ${ctxPills ? `<div class="section-ctx">${ctxPills}</div>` : ''}

            <div class="subjects-block">
                <div class="subjects-header">
                    <span class="subjects-label">Subjects (${subjects.length})</span>
                    <button class="btn-add-subj" data-add-subject="${s.section_id}">+ Add Subjects</button>
                </div>
                ${subjects.length === 0
                    ? '<div class="no-subjects">No subjects yet — add one above</div>'
                    : subjects.map(subj => `
                        <div class="subj-row">
                            <span class="subj-code-tag">${esc(subj.subject_code)}</span>
                            <div class="subj-info">
                                <div class="subj-name">${esc(subj.subject_name)}</div>
                                <div class="subj-detail">
                                    ${subj.schedule ? `<span>${icon('clock', inl)} ${esc(subj.schedule)}</span>` : '<span class="no-sched">No schedule</span>'}
                                    ${subj.room ? `<span>${icon('pin', inl)} ${esc(subj.room)}</span>` : ''}
                                    ${subj.instructor_name ? `<span>${icon('user', inl)} ${esc(subj.instructor_name)}</span>` : '<span style="color:#9ca3af;font-size:11px">No instructor</span>'}
                                </div>
                            </div>
                            <button class="btn-edit-subj" data-edit-secsubj="${subj.section_subject_id}" data-schedule="${esc(subj.schedule||'')}" data-room="${esc(subj.room||'')}" title="Edit schedule/room">${icon('edit', inl)}</button>
                            <button class="btn-remove-subj" data-remove-secsubj="${subj.section_subject_id}" title="Remove">&times;</button>
                        </div>
                    `).join('')}
            </div>

            <div class="enrollment-bar"><div class="enrollment-fill" style="width:${pct}%"></div></div>
            <div class="enrollment-text">${s.student_count} / ${s.max_students} students (${pct}%)</div>
        </div>
    </div>`;
}

// ─── Create / Edit section modal ───────────────────────────────────────────

async function openSectionModal(container, sec = null, preSelSemId = '', preSelProgId = '') {
    const isEdit    = !!sec;
    const semesters = _semesters;
    const programs  = _programs;
    const departments = _departments;

    const activeSem = semesters.find(s => s.status === 'active');
    const defSemId  = sec?.semester_id || preSelSemId || activeSem?.semester_id || '';
    const defProgId = sec?.program_id  || preSelProgId || '';

    const semOpts = semesters.map(s =>
        `<option value="${s.semester_id}" ${String(defSemId) === String(s.semester_id) ? 'selected' : ''}>
            ${esc(s.semester_name)} – ${esc(s.academic_year)}${s.status === 'active' ? ' (Current)' : ''}
         </option>`
    ).join('');

    const deptOpts = departments.map(d =>
        `<option value="${d.department_id}">
            ${esc(d.department_code ? d.department_code + ' – ' : '')}${esc(d.department_name)}
         </option>`
    ).join('');

    // Show all programs initially; dept dropdown cascades to filter
    const progOpts = programs.map(p =>
        `<option value="${p.program_id}" ${String(defProgId) === String(p.program_id) ? 'selected' : ''}>
            ${esc(p.program_code)} – ${esc(p.program_name)}
         </option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${isEdit ? 'Edit Section' : 'New Section'}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-group">
                    <label class="form-label">Semester *</label>
                    <select class="form-select" id="m-semester">
                        <option value="">Select Semester...</option>
                        ${semOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Department</label>
                    <select class="form-select" id="m-dept">
                        <option value="">Select Department...</option>
                        ${deptOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Program</label>
                    <select class="form-select" id="m-program">
                        <option value="">Select Program...</option>
                        ${progOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Year Level</label>
                    <select class="form-select" id="m-year">
                        <option value="">Select Year Level...</option>
                        <option value="1" ${sec?.year_level == 1 ? 'selected' : ''}>1st Year</option>
                        <option value="2" ${sec?.year_level == 2 ? 'selected' : ''}>2nd Year</option>
                        <option value="3" ${sec?.year_level == 3 ? 'selected' : ''}>3rd Year</option>
                        <option value="4" ${sec?.year_level == 4 ? 'selected' : ''}>4th Year</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Section Name *</label>
                    <input class="form-input" id="m-name" value="${esc(sec?.section_name || '')}" placeholder="e.g., BSIT-1A">
                </div>
                <div class="form-group">
                    <label class="form-label">Max Students</label>
                    <input type="number" class="form-input" id="m-max" value="${sec?.max_students || 40}" min="1">
                </div>
                ${isEdit ? `
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-select" id="m-status">
                        <option value="active"   ${sec?.status === 'active'   ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${sec?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update' : 'Create'} Section</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Dept → Program cascade
    overlay.querySelector('#m-dept').addEventListener('change', async function() {
        const deptId  = this.value;
        const progSel = overlay.querySelector('#m-program');
        progSel.innerHTML = '<option value="">Loading...</option>';
        const url = deptId
            ? '/SectionsAPI.php?action=programs&department_id=' + deptId
            : '/SectionsAPI.php?action=programs';
        const r = await Api.get(url);
        const progs = r.success ? r.data : [];
        progSel.innerHTML = '<option value="">Select Program...</option>' +
            progs.map(p => `<option value="${p.program_id}">${esc(p.program_code)} – ${esc(p.program_name)}</option>`).join('');
    });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const semVal  = overlay.querySelector('#m-semester').value;
        const nameVal = overlay.querySelector('#m-name').value.trim();

        if (!nameVal) {
            overlay.querySelector('#modal-alert').innerHTML = '<div class="alert alert-error">Section name is required</div>';
            return;
        }
        if (!semVal) {
            overlay.querySelector('#modal-alert').innerHTML = '<div class="alert alert-error">Please select a semester</div>';
            return;
        }

        const payload = {
            section_name: nameVal,
            max_students: parseInt(overlay.querySelector('#m-max').value) || 40,
            semester_id:  semVal  || null,
            program_id:   overlay.querySelector('#m-program').value  || null,
            year_level:   overlay.querySelector('#m-year').value     || null,
        };
        if (isEdit) {
            payload.section_id = sec.section_id;
            payload.status     = overlay.querySelector('#m-status').value;
        }

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/SectionsAPI.php?action=${action}`, payload);
        if (res.success) {
            overlay.remove();
            renderList(container, semVal, payload.program_id || '', _currentDeptId);
        } else {
            overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });
}

// ─── Add subject to section modal ─────────────────────────────────────────

async function openBulkSubjectModal(container, sectionId, currentFilters = {}) {
    const res       = await Api.get(`/SectionsAPI.php?action=available-subjects&section_id=${sectionId}`);
    const available = res.success ? res.data : [];

    // Group by subject_id — one row per subject, multiple offerings = instructor picker
    const grouped = [];
    const seen    = new Map();
    available.forEach(s => {
        if (!seen.has(s.subject_id)) {
            const entry = { ...s, offerings: [{ id: s.subject_offered_id, name: s.instructor_name }] };
            seen.set(s.subject_id, entry);
            grouped.push(entry);
        } else {
            seen.get(s.subject_id).offerings.push({ id: s.subject_offered_id, name: s.instructor_name });
        }
    });

    function rowHtml(s) {
        const multi = s.offerings.length > 1;
        const instrHtml = multi
            ? `<select class="bm-instr-sel" style="font-size:12px;padding:4px 8px;border:1px solid #e0e0e0;border-radius:6px;color:#1B4D3E;background:#fff;cursor:pointer;max-width:170px;">
                   ${s.offerings.map(o => `<option value="${o.id}">${esc(o.name || 'No instructor')}</option>`).join('')}
               </select>`
            : s.offerings[0].name
                ? `<span style="font-size:11px;color:#1B4D3E;background:#E8F5E9;padding:2px 8px;border-radius:20px;flex-shrink:0;white-space:nowrap;">${icon('user', inl)} ${esc(s.offerings[0].name)}</span>`
                : `<span style="font-size:11px;color:#9ca3af;flex-shrink:0">No instructor</span>`;

        return `<div class="bm-row" data-code="${esc(s.subject_code)}" data-name="${esc(s.subject_name)}"
                     style="display:flex;align-items:center;gap:10px;padding:11px 20px;border-bottom:1px solid #f5f5f5;transition:background .1s;">
                    <input type="checkbox" class="bm-chk" value="${s.subject_id}"
                           style="width:16px;height:16px;cursor:pointer;accent-color:#1B4D3E;flex-shrink:0;">
                    <span style="background:#E8F5E9;color:#1B4D3E;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:11px;font-weight:700;flex-shrink:0;">${esc(s.subject_code)}</span>
                    <span style="flex:1;font-size:13px;font-weight:500;color:#262626;min-width:0;">${esc(s.subject_name)}</span>
                    ${instrHtml}
                </div>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:620px">
            <div class="modal-header">
                <h3>Add Subjects to Section</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="padding:0">
                ${grouped.length === 0
                    ? `<div style="padding:40px;text-align:center;color:#737373;font-size:13px;line-height:2">
                           No available subjects for this section.<br>
                           <strong>Make sure the section has a Program, Year Level, and Semester set.</strong>
                       </div>`
                    : `<div style="padding:12px 20px;border-bottom:1px solid #f0f0f0;display:flex;gap:10px;align-items:center;">
                           <input id="bm-search" placeholder="Search subjects..." style="flex:1;padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;outline:none;">
                           <button id="bm-selall" style="padding:6px 14px;font-size:12px;font-weight:600;border:1px solid #e0e0e0;border-radius:6px;background:#fff;cursor:pointer;white-space:nowrap;color:#404040;">Select All</button>
                       </div>
                       <div id="bm-list" style="max-height:400px;overflow-y:auto;">
                           ${grouped.map(rowHtml).join('')}
                       </div>`
                }
            </div>
            <div class="modal-footer" style="justify-content:space-between">
                <span id="bm-count" style="font-size:13px;color:#737373;align-self:center">0 selected</span>
                <div style="display:flex;gap:10px">
                    <button class="btn-secondary modal-cancel">Cancel</button>
                    <button class="btn-primary" id="bm-save" disabled>Add Subjects</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    if (grouped.length === 0) return;

    const countEl = overlay.querySelector('#bm-count');
    const saveBtn = overlay.querySelector('#bm-save');
    const allChks = () => [...overlay.querySelectorAll('.bm-chk')];
    const visRows = () => [...overlay.querySelectorAll('.bm-row:not([hidden])')];

    function updateCount() {
        const n = allChks().filter(c => c.checked).length;
        countEl.textContent = n ? `${n} subject${n !== 1 ? 's' : ''} selected` : '0 selected';
        saveBtn.textContent = n ? `Add ${n} Subject${n !== 1 ? 's' : ''}` : 'Add Subjects';
        saveBtn.disabled = n === 0;
    }

    // Checkbox change
    overlay.querySelectorAll('.bm-row').forEach(row => {
        row.querySelector('.bm-chk').addEventListener('change', updateCount);
        // Clicking anywhere on row toggles checkbox (except the instructor select)
        row.addEventListener('click', e => {
            if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
            const chk = row.querySelector('.bm-chk');
            chk.checked = !chk.checked;
            updateCount();
        });
        row.style.cursor = 'pointer';
        row.addEventListener('mouseenter', () => row.style.background = '#f9fafb');
        row.addEventListener('mouseleave', () => row.style.background = '');
        // Instructor dropdown updates the checkbox value
        const sel = row.querySelector('.bm-instr-sel');
        if (sel) sel.addEventListener('change', () => { row.querySelector('.bm-chk').value = sel.value; });
    });

    // Search
    overlay.querySelector('#bm-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        overlay.querySelectorAll('.bm-row').forEach(row => {
            row.hidden = q && !row.dataset.code.toLowerCase().includes(q) && !row.dataset.name.toLowerCase().includes(q);
        });
    });

    // Select all visible
    let allSel = false;
    overlay.querySelector('#bm-selall').addEventListener('click', () => {
        allSel = !allSel;
        visRows().forEach(row => row.querySelector('.bm-chk').checked = allSel);
        overlay.querySelector('#bm-selall').textContent = allSel ? 'Deselect All' : 'Select All';
        updateCount();
    });

    saveBtn.addEventListener('click', async () => {
        const ids = allChks().filter(c => c.checked).map(c => parseInt(c.value));
        if (!ids.length) return;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Adding...';
        const r = await Api.post('/SectionsAPI.php?action=bulk-add-subjects', {
            section_id: sectionId,
            subject_ids: ids
        });
        overlay.remove();
        if (r.success) {
            renderList(container, currentFilters.semId || '', currentFilters.progId || '', currentFilters.deptId || '');
        } else {
            alert(r.message || 'Failed to add subjects');
        }
    });
}

async function openEditSubjModal(container, btn, currentFilters = {}) {
    const ssId     = parseInt(btn.dataset.editSecsubj);
    const overlay  = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:400px">
            <div class="modal-header">
                <h3>Edit Schedule & Room</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Schedule</label>
                    <input class="form-input" id="es-sched" placeholder="e.g., MWF 7:30-9:00" value="${esc(btn.dataset.schedule)}">
                </div>
                <div class="form-group">
                    <label class="form-label">Room</label>
                    <input class="form-input" id="es-room" placeholder="e.g., CL-26" value="${esc(btn.dataset.room)}">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="es-save">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#es-save').addEventListener('click', async () => {
        const r = await Api.post('/SectionsAPI.php?action=update-section-subject', {
            section_subject_id: ssId,
            schedule: overlay.querySelector('#es-sched').value.trim(),
            room:     overlay.querySelector('#es-room').value.trim()
        });
        overlay.remove();
        if (r.success) {
            renderList(container, currentFilters.semId || '', currentFilters.progId || '', currentFilters.deptId || '');
        } else {
            alert(r.message || 'Failed to save');
        }
    });
}

// ─── Manage students modal ─────────────────────────────────────────────────

async function openManageStudentsModal(container, sectionId, sectionName) {
    const res      = await Api.get('/SectionsAPI.php?action=students&section_id=' + sectionId);
    const students = res.success ? res.data : [];

    const byStudent = new Map();
    for (const row of students) {
        if (!byStudent.has(row.user_student_id)) {
            byStudent.set(row.user_student_id, { ...row, subjects: [] });
        }
        byStudent.get(row.user_student_id).subjects.push({
            student_subject_id: row.student_subject_id,
            subject_code:       row.subject_code,
            subject_name:       row.subject_name
        });
    }
    const studentList = [...byStudent.values()];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <div class="modal-header">
                <h3>${icon('users', inl)} Students — ${esc(sectionName)}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" id="ms-body">
                ${studentList.length === 0
                    ? '<p style="color:#737373;text-align:center;padding:20px 0;">No students enrolled in this section.</p>'
                    : studentList.map(st => `
                        <div class="ms-student" id="ms-st-${st.user_student_id}" style="border:1px solid #e8e8e8;border-radius:10px;padding:14px;margin-bottom:10px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <div>
                                    <div style="font-size:14px;font-weight:700;color:#262626;">${esc(st.last_name + ', ' + st.first_name)}</div>
                                    <div style="font-size:11px;color:#737373;">${esc(st.student_id || '')}</div>
                                </div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:6px;">
                                ${st.subjects.map(subj => `
                                    <div style="display:flex;justify-content:space-between;align-items:center;background:#fafafa;border-radius:7px;padding:8px 10px;">
                                        <span style="font-size:12px;color:#555;">
                                            <span style="background:#E8F5E9;color:#1B4D3E;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:6px;">${esc(subj.subject_code)}</span>
                                            ${esc(subj.subject_name)}
                                        </span>
                                        <button class="btn-unenroll" data-ssid="${subj.student_subject_id}" data-stid="${st.user_student_id}" style="padding:4px 10px;font-size:11px;font-weight:700;color:#b91c1c;background:#FEE2E2;border:none;border-radius:6px;cursor:pointer;">Unenroll</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>`).join('')}
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Close</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.btn-unenroll').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Unenroll this student from this subject?')) return;
            btn.disabled = true; btn.textContent = '...';
            const r = await Api.post('/SectionsAPI.php?action=unenroll', {
                student_subject_id: parseInt(btn.dataset.ssid)
            });
            if (r.success) {
                btn.closest('div[style*="fafafa"]').remove();
                const stCard = document.getElementById('ms-st-' + btn.dataset.stid);
                if (stCard && stCard.querySelectorAll('.btn-unenroll').length === 0) stCard.remove();
                renderList(container);
            } else {
                btn.disabled = false; btn.textContent = 'Unenroll';
                alert(r.message || 'Failed to unenroll');
            }
        });
    });
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
