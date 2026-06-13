/**
 * Instructor Sections Page (Option B — scoped to instructor's own subjects)
 * Shows only sections that contain at least one of the instructor's subject offerings.
 * When adding subjects, only the instructor's own offerings are shown.
 */
import { Api } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    renderList(container);
}

async function renderList(container) {
    const result = await Api.get('/SectionsAPI.php?action=instructor-list');
    const sections = result.success ? result.data : [];

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .count-badge { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }

            .filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .filters input { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:200px; flex:1; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; cursor:pointer; }

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
            .section-name { font-size:17px; font-weight:700; color:#262626; margin-bottom:12px; }

            .subjects-block { border-top:1px solid #f0f0f0; padding-top:12px; }
            .subjects-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
            .subjects-label { font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.7px; }
            .btn-add-subj { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border:1px dashed #1B4D3E; color:#1B4D3E; background:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; }
            .btn-add-subj:hover { background:#E8F5E9; }

            .subj-row { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid #fafafa; }
            .subj-row:last-child { border-bottom:none; }
            .subj-code-tag { background:#E8F5E9; color:#1B4D3E; padding:2px 7px; border-radius:4px; font-family:monospace; font-size:11px; font-weight:700; flex-shrink:0; margin-top:2px; }
            .subj-code-tag.other { background:#f3f4f6; color:#6b7280; }
            .subj-info { flex:1; min-width:0; }
            .subj-name { font-size:13px; font-weight:600; color:#262626; }
            .subj-detail { font-size:11px; color:#737373; margin-top:2px; display:flex; gap:8px; flex-wrap:wrap; }
            .subj-detail span { display:flex; align-items:center; gap:3px; }
            .mine-tag { font-size:10px; font-weight:700; color:#1B4D3E; background:#E8F5E9; padding:1px 6px; border-radius:4px; margin-left:4px; vertical-align:middle; }
            .btn-remove-subj { width:22px; height:22px; border-radius:5px; border:1px solid #fecaca; background:#fff; color:#b91c1c; cursor:pointer; font-size:13px; flex-shrink:0; display:flex; align-items:center; justify-content:center; margin-top:2px; }
            .btn-remove-subj:hover { background:#fef2f2; }
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
            .empty-state p { margin-top:8px; font-size:14px; }
            .copied-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#1B4D3E; color:#fff; padding:10px 20px; border-radius:8px; font-size:14px; z-index:9999; }
            @media(max-width:768px) { .sections-grid { grid-template-columns:1fr; } .form-row { grid-template-columns:1fr; } }
        </style>

        <div class="page-header">
            <h2>My Sections <span class="count-badge">${sections.length}</span></h2>
            <button class="btn-primary" id="btn-add">+ Add Section</button>
        </div>

        <div class="filters">
            <input type="text" id="filter-search" placeholder="Search section name...">
            <select id="filter-status">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        </div>

        ${sections.length === 0
            ? `<div class="empty-state">
                <div style="margin-bottom:12px;">${iconLg('school')}</div>
                <h3 style="color:#262626;font-size:18px;font-weight:700;">No sections yet</h3>
                <p>Create a section and add your subject offerings to it.<br>Students enroll using the section's enrollment code.</p>
               </div>`
            : `<div class="sections-grid" id="sections-grid">
                   ${sections.map(s => renderSectionCard(s)).join('')}
               </div>`}
    `;

    // Add section button
    container.querySelector('#btn-add').addEventListener('click', () => openSectionModal(container));

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
            if (s) openSectionModal(container, s);
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
            if (res.success) renderList(container);
            else alert(res.message);
        });
    });

    // Manage students
    container.querySelectorAll('[data-manage-students]').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.kebab-menu.open').forEach(m => m.classList.remove('open'));
            openManageStudentsModal(container, parseInt(btn.dataset.manageStudents), btn.dataset.sname);
        });
    });

    // Add subject to section
    container.querySelectorAll('[data-add-subject]').forEach(btn => {
        btn.addEventListener('click', () => openAddSubjectModal(container, parseInt(btn.dataset.addSubject)));
    });

    // Remove subject from section (only for instructor's own subjects)
    container.querySelectorAll('[data-remove-secsubj]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this subject from the section?')) return;
            const res = await Api.post('/SectionsAPI.php?action=remove-subject', {
                section_subject_id: parseInt(btn.dataset.removeSecsubj)
            });
            if (res.success) renderList(container);
            else alert(res.message);
        });
    });

    // Filters
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

            <div class="subjects-block">
                <div class="subjects-header">
                    <span class="subjects-label">Subjects (${subjects.length})</span>
                    <button class="btn-add-subj" data-add-subject="${s.section_id}">+ Add My Subject</button>
                </div>
                ${subjects.length === 0
                    ? '<div class="no-subjects">No subjects yet — add one above</div>'
                    : subjects.map(subj => `
                        <div class="subj-row">
                            <span class="subj-code-tag ${subj.is_mine ? '' : 'other'}">${esc(subj.subject_code)}</span>
                            <div class="subj-info">
                                <div class="subj-name">
                                    ${esc(subj.subject_name)}
                                    ${subj.is_mine ? '<span class="mine-tag">Mine</span>' : ''}
                                </div>
                                <div class="subj-detail">
                                    ${subj.schedule ? `<span>${icon('clock', inl)} ${esc(subj.schedule)}</span>` : ''}
                                    ${subj.room ? `<span>${icon('pin', inl)} ${esc(subj.room)}</span>` : ''}
                                    ${subj.instructor_name ? `<span>${icon('user', inl)} ${esc(subj.instructor_name)}</span>` : ''}
                                </div>
                            </div>
                            ${subj.is_mine
                                ? `<button class="btn-remove-subj" data-remove-secsubj="${subj.section_subject_id}" title="Remove">&times;</button>`
                                : '<div style="width:22px;flex-shrink:0;"></div>'}
                        </div>
                    `).join('')}
            </div>

            <div class="enrollment-bar"><div class="enrollment-fill" style="width:${pct}%"></div></div>
            <div class="enrollment-text">${s.student_count} / ${s.max_students} students (${pct}%)</div>
        </div>
    </div>`;
}

// ─── Create / Edit section modal ───────────────────────────────────────────

function openSectionModal(container, sec = null) {
    const isEdit = !!sec;
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
                        <option value="active" ${sec?.status === 'active' ? 'selected' : ''}>Active</option>
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

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const payload = {
            section_name: overlay.querySelector('#m-name').value.trim(),
            max_students: parseInt(overlay.querySelector('#m-max').value) || 40,
        };
        if (isEdit) {
            payload.section_id = sec.section_id;
            payload.status = overlay.querySelector('#m-status').value;
        }

        if (!payload.section_name) {
            overlay.querySelector('#modal-alert').innerHTML = '<div class="alert alert-error">Section name is required</div>';
            return;
        }

        const action = isEdit ? 'update' : 'create';
        const res = await Api.post(`/SectionsAPI.php?action=${action}`, payload);
        if (res.success) { overlay.remove(); renderList(container); }
        else overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${res.message}</div>`;
    });
}

// ─── Add subject modal — shows only subjects the dean assigned to this instructor ─

async function openAddSubjectModal(container, sectionId) {
    const YEAR_LABELS = { 1:'1st Year', 2:'2nd Year', 3:'3rd Year', 4:'4th Year' };
    const SEM_LABELS  = { 1:'1st Semester', 2:'2nd Semester', 3:'Summer' };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>Add Subject to Section</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-group">
                    <label class="form-label">My Assigned Subject *</label>
                    <select class="form-select" id="m-subject">
                        <option value="">Loading…</option>
                    </select>
                    <div id="m-subject-hint" style="font-size:12px;color:#737373;margin-top:4px;"></div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Schedule</label>
                        <input class="form-input" id="m-schedule" placeholder="e.g., MWF 7:30-9:00">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Room</label>
                        <input class="form-input" id="m-room" placeholder="e.g., Room 101">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save" disabled>Add Subject</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const subjSel  = overlay.querySelector('#m-subject');
    const subjHint = overlay.querySelector('#m-subject-hint');
    const saveBtn  = overlay.querySelector('#modal-save');

    // Fetch only subjects assigned to this instructor by the dean
    const res  = await Api.get(`/SectionsAPI.php?action=instructor-assigned-subjects&section_id=${sectionId}`);
    const list = res.success ? res.data : [];

    if (list.length === 0) {
        subjSel.innerHTML = '<option value="">No assigned subjects available</option>';
        subjHint.textContent = 'The dean has not assigned any subjects to you yet, or all your assigned subjects are already in this section.';
    } else {
        // Group by program for optgroup display
        const byProgram = {};
        list.forEach(s => {
            const key = s.program_code;
            if (!byProgram[key]) byProgram[key] = { name: s.program_name, code: s.program_code, items: [] };
            byProgram[key].items.push(s);
        });

        subjSel.innerHTML = `<option value="">— Select a subject (${list.length} available) —</option>` +
            Object.values(byProgram).map(prog => `
                <optgroup label="${esc(prog.code)} — ${esc(prog.name)}">
                    ${prog.items.map(s => {
                        const ctx = [YEAR_LABELS[s.year_level], SEM_LABELS[s.curriculum_semester]].filter(Boolean).join(' · ');
                        return `<option value="${s.subject_offered_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}${ctx ? ` (${ctx})` : ''}</option>`;
                    }).join('')}
                </optgroup>`).join('');
    }

    subjSel.addEventListener('change', () => { saveBtn.disabled = !subjSel.value; });

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const offeredId = parseInt(subjSel.value);
        if (!offeredId) {
            overlay.querySelector('#modal-alert').innerHTML = '<div class="alert alert-error">Please select a subject</div>';
            return;
        }
        const r = await Api.post('/SectionsAPI.php?action=add-subject', {
            section_id:         sectionId,
            subject_offered_id: offeredId,
            schedule:           overlay.querySelector('#m-schedule').value.trim(),
            room:               overlay.querySelector('#m-room').value.trim(),
        });
        if (r.success) { overlay.remove(); renderList(container); }
        else overlay.querySelector('#modal-alert').innerHTML = `<div class="alert alert-error">${r.message}</div>`;
    });
}

// ─── Manage students modal ──────────────────────────────────────────────────

async function openManageStudentsModal(container, sectionId, sectionName) {
    const res = await Api.get('/SectionsAPI.php?action=students&section_id=' + sectionId);
    const students = res.success ? res.data : [];

    // Group by student
    const byStudent = new Map();
    for (const row of students) {
        if (!byStudent.has(row.user_student_id)) {
            byStudent.set(row.user_student_id, { ...row, subjects: [] });
        }
        byStudent.get(row.user_student_id).subjects.push({
            student_subject_id: row.student_subject_id,
            subject_code: row.subject_code,
            subject_name: row.subject_name
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
                                        <span style="font-size:12px;color:#555;"><span style="background:#E8F5E9;color:#1B4D3E;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:6px;">${esc(subj.subject_code)}</span>${esc(subj.subject_name)}</span>
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
                if (stCard && stCard.querySelectorAll('.btn-unenroll').length === 0) {
                    stCard.remove();
                }
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
