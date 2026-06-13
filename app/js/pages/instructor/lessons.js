/**
 * Instructor Lessons Page
 * CRUD for lessons grouped by subject, with materials (links, files) support
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let subjects = [];

export async function render(container) {
    const subjRes = await Api.get('/LessonsAPI.php?action=subjects');
    subjects = subjRes.success ? subjRes.data : [];
    const params    = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId = params.get('subject_id') || '';
    renderList(container, subjectId);
}

async function renderList(container, filterSubject = '') {
    const params = filterSubject ? '&subject_id=' + filterSubject : '';
    const res = await Api.get('/LessonsAPI.php?action=instructor-lessons' + params);
    const lessons = res.success ? res.data : [];

    // Group by subject
    const grouped = {};
    lessons.forEach(l => {
        const key = l.subject_id;
        if (!grouped[key]) grouped[key] = { code: l.subject_code, name: l.subject_name, lessons: [] };
        grouped[key].lessons.push(l);
    });

    container.innerHTML = `
        <style>
            .ls-banner { background:#00461B; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .ls-banner::before { content:''; position:absolute; top:-40px; right:-40px; width:180px; height:180px; border-radius:50%; background:rgba(255,255,255,.07); pointer-events:none; }
            .ls-banner::after { content:''; position:absolute; bottom:-60px; left:60px; width:220px; height:220px; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
            .ls-banner-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; position:relative; z-index:1; }
            .ls-banner-title { font-size:26px; font-weight:800; color:#fff; margin:0 0 4px; }
            .ls-banner-sub { font-size:14px; color:rgba(255,255,255,.75); margin:0; }
            .ls-banner-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
            .ls-back-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.25); border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; transition:all .15s; }
            .ls-back-btn:hover { background:rgba(255,255,255,.25); }
            .btn-primary { background:#fff; color:#1B4D3E; border:none; padding:10px 20px; border-radius:10px; font-weight:700; font-size:14px; cursor:pointer; transition:all .15s; }
            .btn-primary:hover { background:#f0fdf4; transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,.15); }

            .ls-filter-bar { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
            .ls-filter-bar select { padding:9px 14px; border:1px solid #e8ecef; border-radius:10px; font-size:13px; min-width:240px; background:#fff; color:#374151; cursor:pointer; outline:none; transition:border-color .15s; box-shadow:0 1px 2px rgba(0,0,0,.04); }
            .ls-filter-bar select:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }

            .subject-group { margin-bottom:28px; }
            .subject-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:2px solid #f1f5f9; }
            .subj-code { background:#E8F5E9; color:#1B4D3E; padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:700; font-size:13px; }
            .subj-name { font-size:16px; font-weight:700; color:#111827; }

            /* Fixed: Removed overflow:hidden so dropdowns aren't clipped */
            .data-table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; border:2px solid #1B4D3E; position:relative; }
            .data-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .data-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .data-table tr:hover td { background:#f9fffe; }

            /* Round top corners of the table manually since overflow is visible */
            .data-table tr:first-child th:first-child { border-top-left-radius: 12px; }
            .data-table tr:first-child th:last-child { border-top-right-radius: 12px; }

            .order-circle { width:28px; height:28px; border-radius:50%; background:#E8F5E9; color:#1B4D3E; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; }
            .lesson-title { font-weight:600; color:#262626; }
            .lesson-desc { font-size:12px; color:#737373; margin-top:2px; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-published { background:#E8F5E9; color:#1B4D3E; }
            .badge-draft { background:#FEF3C7; color:#B45309; }
            .meta-text { font-size:13px; color:#737373; }

            .actions-cell { position:relative; width:40px; }
            .btn-actions { background:none; border:1px solid #e0e0e0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:18px; display:flex; align-items:center; justify-content:center; color:#737373; }
            .btn-actions:hover { background:#f5f5f5; color:#262626; border-color:#d0d0d0; }
            
            .actions-dropdown { display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid #e8e8e8; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.12); min-width:140px; z-index:100; overflow:hidden; margin-top:4px; }
            .actions-dropdown.show { display:block; }
            
            /* Flip Logic: Opens menu upward for the last items in a list */
            .actions-dropdown.drop-up { top: auto; bottom: 100%; margin-top: 0; margin-bottom: 4px; }

            .actions-dropdown a { display:block; padding:10px 16px; font-size:13px; color:#404040; cursor:pointer; text-decoration:none; }
            .actions-dropdown a:hover { background:#f5f5f5; }
            .actions-dropdown a.danger { color:#b91c1c; }
            .actions-dropdown a.archive { color:#1B4D3E; font-weight:600; }

            .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
            .modal { background:#fff; border-radius:16px; width:90%; max-width:680px; max-height:90vh; overflow-y:auto; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }
            .form-group { margin-bottom:16px; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input, .form-select, .form-textarea { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; font-family:inherit; }
            .form-input:focus, .form-select:focus, .form-textarea:focus { outline:none; border-color:#00461B; }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-error { background:#FEE2E2; color:#b91c1c; }
            .alert-success { background:#E8F5E9; color:#1B4D3E; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }

            /* Materials Section */
            .mat-section { border-top:1px solid #f0f0f0; padding-top:16px; margin-top:8px; }
            .mat-section-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
            .mat-section-hd h4 { margin:0; font-size:14px; font-weight:700; color:#1f2937; display:flex; align-items:center; gap:6px; }
            .mat-actions { display:flex; gap:8px; }
            .mat-btn { padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid #e0e0e0; background:#fff; color:#404040; display:inline-flex; align-items:center; gap:6px; }
            .mat-btn:hover { background:#f5f5f5; }
            .mat-btn.green { background:#E8F5E9; color:#1B4D3E; border-color:#A7F3D0; }
            .mat-btn.green:hover { background:#D1FAE5; }

            .mat-link-form { display:none; background:#fafbfc; border:1px solid #e8e8e8; border-radius:10px; padding:14px; margin-bottom:12px; }
            .mat-link-form.show { display:block; }
            .mat-link-row { display:flex; gap:8px; margin-bottom:8px; }
            .mat-link-row input { flex:1; padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; }
            .mat-link-row input:focus { outline:none; border-color:#1B4D3E; }

            .mat-list { display:flex; flex-direction:column; gap:8px; }
            .mat-item {
                display:flex; align-items:center; gap:12px;
                padding:10px 14px; background:#fafbfc; border:1px solid #e8e8e8;
                border-radius:10px; font-size:13px;
            }
            .mat-item-icon {
                width:34px; height:34px; border-radius:8px;
                display:flex; align-items:center; justify-content:center;
                flex-shrink:0; font-size:16px;
            }
            .mat-item-icon.video { background:#FEE2E2; color:#b91c1c; }
            .mat-item-icon.document { background:#DBEAFE; color:#1E40AF; }
            .mat-item-icon.image { background:#D1FAE5; color:#059669; }
            .mat-item-icon.link { background:#EDE9FE; color:#5B21B6; }
            .mat-item-icon.audio { background:#FEF3C7; color:#B45309; }
            .mat-item-icon.other { background:#F3F4F6; color:#6B7280; }
            .mat-item-info { flex:1; min-width:0; }
            .mat-item-name { font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .mat-item-meta { font-size:11px; color:#9ca3af; }
            .mat-item-del { background:none; border:none; cursor:pointer; color:#d1d5db; padding:4px; border-radius:6px; }
            .mat-item-del:hover { color:#b91c1c; background:#FEE2E2; }

            .mat-empty { text-align:center; padding:20px; color:#9ca3af; font-size:13px; }
            .mat-save-hint { background:#FEF3C7; color:#92400E; padding:12px 16px; border-radius:10px; font-size:13px; text-align:center; }
        </style>

        <div class="ls-banner">
            <div class="ls-banner-inner">
                <div>
                    <h2 class="ls-banner-title">Lessons <span style="font-size:16px;font-weight:600;opacity:.8;">(${lessons.length})</span></h2>
                    <p class="ls-banner-sub">Manage and publish lessons for your classes</p>
                </div>
                <div class="ls-banner-actions">
                    <a href="#instructor/my-classes" class="ls-back-btn">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                        My Classes
                    </a>
                    <button class="btn-primary" id="btn-add">+ Create Lesson</button>
                </div>
            </div>
        </div>

        <div class="ls-filter-bar">
            <select id="filter-subject">
                <option value="">All Subjects</option>
                ${subjects.map(s => `<option value="${s.subject_id}" ${filterSubject==s.subject_id?'selected':''}>${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('')}
            </select>
        </div>

        ${Object.keys(grouped).length === 0 ? '<div class="empty-state-sm">No lessons yet. Create your first lesson!</div>' :
          Object.entries(grouped).map(([key, group]) => `
            <div class="subject-group">
                <div class="subject-header">
                    <span class="subj-code">${esc(group.code)}</span>
                    <span class="subj-name">${esc(group.name)}</span>
                </div>
                <table class="data-table">
                    <thead><tr><th style="width:40px">#</th><th>Lesson</th><th>Status</th><th>Completions</th><th>Updated</th><th></th></tr></thead>
                    <tbody>
                        ${group.lessons.map((l, index) => {
                            // Apply 'drop-up' class if this is the last lesson in the group
                            const isLast = index === group.lessons.length - 1;
                            return `
                            <tr>
                                <td><div class="order-circle">${l.lesson_order}</div></td>
                                <td><div class="lesson-title">${esc(l.lesson_title)}</div>${l.lesson_description ? `<div class="lesson-desc">${esc(l.lesson_description.substring(0,80))}</div>` : ''}</td>
                                <td><span class="badge badge-${l.status}">${l.status}</span></td>
                                <td class="meta-text">${l.completions||0} students</td>
                                <td class="meta-text">${new Date(l.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                                <td class="actions-cell">
                                    <button class="btn-actions" data-id="${l.lessons_id}">&#8942;</button>
                                    <div class="actions-dropdown ${isLast ? 'drop-up' : ''}" data-dropdown="${l.lessons_id}">
                                        <a href="#" data-edit="${l.lessons_id}" data-subj="${l.subject_id}" data-title="${esc(l.lesson_title)}" data-desc="${esc(l.lesson_description||'')}" data-content="${esc(l.lesson_content||'')}" data-status="${l.status}">Edit Lesson</a>
                                        <a href="#" class="archive" data-archive="${l.lessons_id}" data-subj="${l.subject_id}" data-subj-code="${esc(group.code)}" data-title="${esc(l.lesson_title)}" data-desc="${esc(l.lesson_description||'')}" data-content="${esc(l.lesson_content||'')}">${icon('folder', inl)} Archive to Bank</a>
                                        <a href="#" class="danger" data-delete="${l.lessons_id}" data-name="${esc(l.lesson_title)}">Delete</a>
                                    </div>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
          `).join('')}
    `;

    // Events
    container.querySelector('#btn-add').addEventListener('click', () => openModal(container, filterSubject));
    container.querySelector('#filter-subject').addEventListener('change', (e) => renderList(container, e.target.value));

    container.querySelectorAll('.btn-actions').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = container.querySelector(`[data-dropdown="${btn.dataset.id}"]`);
            const isShowing = dropdown.classList.contains('show');
            
            // Close all dropdowns first
            container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
            
            // Toggle current one
            if (!isShowing) dropdown.classList.add('show');
        });
    });
    
    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.remove('show'));
    }, { once: false });

    container.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(container, filterSubject, {
                lessons_id: parseInt(a.dataset.edit),
                subject_id: a.dataset.subj,
                lesson_title: a.dataset.title,
                lesson_description: a.dataset.desc,
                lesson_content: a.dataset.content,
                status: a.dataset.status,
            });
        });
    });

    container.querySelectorAll('[data-archive]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openArchiveModal({
                lessons_id:         a.dataset.archive,
                subject_id:         a.dataset.subj,
                subject_code:       a.dataset.subjCode,
                lesson_title:       a.dataset.title,
                lesson_description: a.dataset.desc,
                lesson_content:     a.dataset.content,
            });
        });
    });

    container.querySelectorAll('[data-delete]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm(`Delete "${a.dataset.name}"? This will also remove student progress.`)) return;
            const res = await Api.post('/LessonsAPI.php?action=delete', { lessons_id: parseInt(a.dataset.delete) });
            if (res.success) renderList(container, filterSubject);
            else alert(res.message);
        });
    });
}

function openModal(container, filterSubject, lesson = null) {
    const isEdit = !!lesson;
    let currentLessonId = lesson?.lessons_id || null;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const subjOpts = subjects.map(s => `<option value="${s.subject_id}" ${lesson ? lesson.subject_id==s.subject_id?'selected':'' : filterSubject==s.subject_id?'selected':''}>${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('');

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header"><h3>${isEdit ? 'Edit Lesson' : 'Create Lesson'}</h3><button class="modal-close">&times;</button></div>
            <div class="modal-body">
                <div id="modal-alert"></div>
                <div class="form-group">
                    <label class="form-label">Subject *</label>
                    <select class="form-select" id="m-subject" ${isEdit?'disabled':''}><option value="">Select Subject</option>${subjOpts}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Lesson Title *</label>
                    <input class="form-input" id="m-title" value="${esc(lesson?.lesson_title||'')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea class="form-textarea" id="m-desc" rows="2">${esc(lesson?.lesson_description||'')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Content</label>
                    <textarea class="form-textarea" id="m-content" rows="6">${esc(lesson?.lesson_content||'')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-select" id="m-status">
                        <option value="draft" ${lesson?.status==='draft'||!lesson?'selected':''}>Draft</option>
                        <option value="published" ${lesson?.status==='published'?'selected':''}>Published</option>
                    </select>
                </div>

                <div class="mat-section" id="mat-section">
                    <div class="mat-section-hd">
                        <h4>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"/></svg>
                            Materials & Attachments
                        </h4>
                        <div class="mat-actions" id="mat-btns" style="display:none">
                            <button class="mat-btn green" id="mat-add-link-btn">
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.5 8.25"/></svg>
                                Add Link
                            </button>
                            <label class="mat-btn green" id="mat-upload-btn">
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                                Upload File
                                <input type="file" id="mat-file-input" style="display:none" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.ogg,.m4a,.aac,.flac">
                            </label>
                        </div>
                    </div>

                    <div class="mat-link-form" id="mat-link-form">
                        <div class="mat-link-row">
                            <input type="text" id="mat-link-title" placeholder="Title (optional)">
                            <input type="url" id="mat-link-url" placeholder="https://youtube.com/watch?v=...">
                        </div>
                        <div style="display:flex;gap:8px;justify-content:flex-end">
                            <button class="mat-btn" id="mat-link-cancel">Cancel</button>
                            <button class="mat-btn green" id="mat-link-save">Add Link</button>
                        </div>
                    </div>

                    <div id="mat-upload-status" style="display:none"></div>

                    <div id="mat-list"></div>

                    <div id="mat-hint" style="display:none">
                        <div class="mat-save-hint">Save the lesson first, then you can add materials and attachments.</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="modal-save">${isEdit ? 'Update' : 'Create'} Lesson</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Materials state
    const matBtns = overlay.querySelector('#mat-btns');
    const matHint = overlay.querySelector('#mat-hint');
    const matList = overlay.querySelector('#mat-list');
    const matLinkForm = overlay.querySelector('#mat-link-form');
    const matUploadStatus = overlay.querySelector('#mat-upload-status');

    function showMaterialsUI() {
        if (currentLessonId) {
            matBtns.style.display = 'flex';
            matHint.style.display = 'none';
            loadMaterials();
        } else {
            matBtns.style.display = 'none';
            matHint.style.display = 'block';
            matList.innerHTML = '';
        }
    }

    async function loadMaterials() {
        const res = await Api.get(`/LessonsAPI.php?action=materials&lessons_id=${currentLessonId}`);
        const materials = res.success ? res.data : [];
        if (materials.length === 0) {
            matList.innerHTML = '<div class="mat-empty">No materials attached yet. Add links or upload files.</div>';
            return;
        }
        matList.innerHTML = '<div class="mat-list">' + materials.map(m => {
            const icon = getMatIcon(m);
            const meta = m.material_type === 'link' ? truncateUrl(m.file_path) : formatSize(m.file_size);
            return `
                <div class="mat-item">
                    <div class="mat-item-icon ${icon.cls}">${icon.svg}</div>
                    <div class="mat-item-info">
                        <div class="mat-item-name">${esc(m.original_name || m.file_name)}</div>
                        <div class="mat-item-meta">${esc(meta)}</div>
                    </div>
                    <button class="mat-item-del" data-mat-del="${m.material_id}" title="Delete">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                    </button>
                </div>`;
        }).join('') + '</div>';

        // Attach delete events
        matList.querySelectorAll('[data-mat-del]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this material?')) return;
                const r = await Api.post('/LessonsAPI.php?action=delete-material', { material_id: parseInt(btn.dataset.matDel) });
                if (r.success) loadMaterials();
                else alert(r.message);
            });
        });
    }

    // Add Link toggle
    overlay.querySelector('#mat-add-link-btn').addEventListener('click', () => {
        matLinkForm.classList.toggle('show');
        if (matLinkForm.classList.contains('show')) overlay.querySelector('#mat-link-url').focus();
    });
    overlay.querySelector('#mat-link-cancel').addEventListener('click', () => {
        matLinkForm.classList.remove('show');
        overlay.querySelector('#mat-link-url').value = '';
        overlay.querySelector('#mat-link-title').value = '';
    });
    overlay.querySelector('#mat-link-save').addEventListener('click', async () => {
        const url   = overlay.querySelector('#mat-link-url').value.trim();
        const title = overlay.querySelector('#mat-link-title').value.trim();

        const urlErr = validateUrl(url);
        if (urlErr) { showLinkError(overlay, urlErr); return; }
        clearLinkError(overlay);

        const r = await Api.post('/LessonsAPI.php?action=add-link', { lessons_id: currentLessonId, url, title });
        if (r.success) {
            matLinkForm.classList.remove('show');
            overlay.querySelector('#mat-link-url').value  = '';
            overlay.querySelector('#mat-link-title').value = '';
            clearLinkError(overlay);
            loadMaterials();
        } else {
            showLinkError(overlay, r.message);
        }
    });

    // File Upload
    overlay.querySelector('#mat-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fileErr = validateFile(file);
        if (fileErr) {
            matUploadStatus.style.display = 'block';
            matUploadStatus.innerHTML = `<div class="alert alert-error">${esc(fileErr)}</div>`;
            e.target.value = '';
            setTimeout(() => { matUploadStatus.style.display = 'none'; }, 5000);
            return;
        }

        matUploadStatus.style.display = 'block';
        matUploadStatus.innerHTML = `<div class="alert alert-success">Uploading <strong>${esc(file.name)}</strong> (${formatSize(file.size)})…</div>`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('lessons_id', currentLessonId);

        try {
            const resp = await fetch('/COC-LMS/api/LessonsAPI.php?action=upload-material', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const r = await resp.json();
            matUploadStatus.style.display = 'none';
            if (r.success) {
                loadMaterials();
            } else {
                matUploadStatus.style.display = 'block';
                matUploadStatus.innerHTML = `<div class="alert alert-error">${esc(r.message || 'Upload failed')}</div>`;
                setTimeout(() => { matUploadStatus.style.display = 'none'; }, 5000);
            }
        } catch (err) {
            matUploadStatus.style.display = 'block';
            matUploadStatus.innerHTML = '<div class="alert alert-error">Upload failed. Please check your connection and try again.</div>';
            setTimeout(() => { matUploadStatus.style.display = 'none'; }, 5000);
        }
        e.target.value = '';
    });

    // Show/hide materials UI
    showMaterialsUI();

    // Save lesson
    overlay.querySelector('#modal-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#modal-alert');
        const payload = {
            subject_id: isEdit ? lesson.subject_id : overlay.querySelector('#m-subject').value,
            lesson_title: overlay.querySelector('#m-title').value,
            lesson_description: overlay.querySelector('#m-desc').value,
            lesson_content: overlay.querySelector('#m-content').value,
            status: overlay.querySelector('#m-status').value,
        };

        if (!payload.subject_id || !payload.lesson_title) {
            alertEl.innerHTML = '<div class="alert alert-error">Subject and title are required</div>';
            return;
        }

        if (currentLessonId) payload.lessons_id = currentLessonId;

        const action = currentLessonId ? 'update' : 'create';
        const res = await Api.post(`/LessonsAPI.php?action=${action}`, payload);

        if (res.success) {
            if (!currentLessonId && res.data?.id) {
                // New lesson created — switch to edit mode to enable materials
                currentLessonId = res.data.id;
                overlay.querySelector('.modal-header h3').textContent = 'Edit Lesson';
                overlay.querySelector('#modal-save').textContent = 'Update Lesson';
                alertEl.innerHTML = '<div class="alert alert-success">Lesson created! You can now add materials below.</div>';
                showMaterialsUI();
            } else {
                overlay.remove();
                renderList(container, filterSubject);
            }
        } else {
            alertEl.innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });
}

// ─── Archive to Content Bank ────────────────────────────────

function openArchiveModal(lesson) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:560px;">
            <div class="modal-header">
                <h3>${icon('folder', inl)} Archive to Content Bank</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="arch-alert"></div>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 14px;font-size:13px;color:#1B4D3E;margin-bottom:16px;">
                    Creates a shareable copy in the Content Bank. Your original lesson stays unchanged.
                </div>
                <div class="form-group">
                    <label class="form-label">Subject</label>
                    <div style="background:#E8F5E9;color:#1B4D3E;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:700;display:inline-block;font-family:monospace;">${esc(lesson.subject_code)}</div>
                </div>
                <div class="form-group">
                    <label class="form-label">Lesson Title *</label>
                    <input class="form-input" id="arch-title" value="${esc(lesson.lesson_title)}">
                </div>
                <div class="form-group">
                    <label class="form-label">Short Description</label>
                    <textarea class="form-textarea" id="arch-desc" rows="2">${esc(lesson.lesson_description)}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Visibility</label>
                    <select class="form-select" id="arch-vis">
                        <option value="public">Public — visible to all instructors</option>
                        <option value="private">Private — only me</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary" id="arch-save">Archive to Bank</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#arch-save').addEventListener('click', async () => {
        const title   = overlay.querySelector('#arch-title').value.trim();
        const alertEl = overlay.querySelector('#arch-alert');
        if (!title) { alertEl.innerHTML = '<div class="alert alert-error">Title is required.</div>'; return; }

        const btn = overlay.querySelector('#arch-save');
        btn.disabled = true; btn.textContent = 'Archiving…';

        const res = await Api.post('/LessonBankAPI.php?action=publish', {
            lesson_title:       title,
            lesson_description: overlay.querySelector('#arch-desc').value.trim(),
            lesson_content:     lesson.lesson_content,
            subject_id:         lesson.subject_id || null,
            visibility:         overlay.querySelector('#arch-vis').value,
            attachment_type:    'none',
        });

        if (res.success) {
            overlay.remove();
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1B4D3E;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);';
            toast.innerHTML = `${icon('check', inl)} Lesson archived to Content Bank!`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3500);
        } else {
            btn.disabled = false; btn.textContent = 'Archive to Bank';
            alertEl.innerHTML = `<div class="alert alert-error">${esc(res.message || 'Failed to archive.')}</div>`;
        }
    });
}

// ─── Helpers ────────────────────────────────────────────────

function getMatIcon(m) {
    if (m.material_type === 'link') {
        if (m.file_type === 'youtube' || m.file_type === 'vimeo') {
            return { cls: 'video', svg: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>' };
        }
        return { cls: 'link', svg: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.5 8.25"/></svg>' };
    }
    if (m.material_type === 'image') {
        return { cls: 'image', svg: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M2.25 18.75h19.5V5.25H2.25v13.5z"/></svg>' };
    }
    if (m.material_type === 'document') {
        return { cls: 'document', svg: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>' };
    }
    if (m.material_type === 'audio') {
        return { cls: 'audio', svg: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"/></svg>' };
    }
    return { cls: 'other', svg: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32"/></svg>' };
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function truncateUrl(url) {
    if (!url) return '';
    try { return new URL(url).hostname + (url.length > 60 ? '...' : ''); } catch { return url.substring(0, 50); }
}

// ─── Material Validation ────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = ['pdf','doc','docx','ppt','pptx','xls','xlsx','txt','zip','jpg','jpeg','png','gif','webp','mp3','wav','ogg','m4a','aac','flac'];
const MAX_FILE_MB = 10;

/**
 * Returns an error string if the file is invalid, or null if it's OK.
 */
function validateFile(file) {
    if (!file || file.size === 0) return 'The selected file appears to be empty.';

    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return `".${ext}" files are not allowed. Accepted types: ${ALLOWED_EXTENSIONS.join(', ')}.`;
    }

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
        return `File is too large (${formatSize(file.size)}). Maximum allowed size is ${MAX_FILE_MB}MB.`;
    }

    return null;
}

/**
 * Returns an error string if the URL is invalid, or null if it's OK.
 */
function validateUrl(url) {
    if (!url) return 'Please enter a URL.';
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return 'URL must start with http:// or https://';
        }
        return null;
    } catch {
        return 'Please enter a valid URL (e.g. https://youtube.com/watch?v=...).';
    }
}

/** Show an inline error inside the link form. */
function showLinkError(overlay, msg) {
    let el = overlay.querySelector('#mat-link-error');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mat-link-error';
        el.style.cssText = 'background:#FEE2E2;color:#b91c1c;padding:8px 12px;border-radius:8px;font-size:12px;margin-top:8px;';
        overlay.querySelector('#mat-link-form').appendChild(el);
    }
    el.textContent = msg;
}

/** Remove the inline link-error element. */
function clearLinkError(overlay) {
    overlay.querySelector('#mat-link-error')?.remove();
}

// ────────────────────────────────────────────────────────────────────────────

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }