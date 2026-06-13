/**
 * Instructor - Lesson Bank (SPA module)
 * Browse, publish, and copy shared lessons
 */
import { Api } from '../../api.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let mySubjects = [];
let activeTab  = 'browse'; // 'browse' | 'my-bank'

export async function render(container) {
    const subjRes = await Api.get('/LessonsAPI.php?action=subjects');
    mySubjects = subjRes.success ? subjRes.data : [];

    container.innerHTML = `
        <style>
            .lb-banner { background:#00461B; border-radius:16px; padding:24px 28px; color:#fff; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
            .lb-banner h2 { font-size:20px; font-weight:700; margin:0; }
            .lb-banner p  { font-size:13px; opacity:.85; margin:4px 0 0; }
            .lb-banner-btn { padding:9px 18px; background:rgba(255,255,255,.18); color:#fff; border:1.5px solid rgba(255,255,255,.5); border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; transition:all .2s; }
            .lb-banner-btn:hover { background:rgba(255,255,255,.28); }

            .lb-tabs { display:flex; gap:4px; margin-bottom:20px; background:#f3f4f6; border-radius:10px; padding:4px; width:fit-content; }
            .lb-tab { padding:8px 20px; border-radius:7px; font-size:13px; font-weight:600; cursor:pointer; color:#555; border:none; background:none; transition:all .15s; }
            .lb-tab.active { background:#fff; color:#1B4D3E; box-shadow:0 1px 4px rgba(0,0,0,.08); }

            .lb-toolbar { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .lb-search { flex:1; min-width:220px; padding:9px 14px 9px 36px; border:1px solid #e0e0e0; border-radius:9px; font-size:13px; background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E") no-repeat 11px center; }
            .lb-search:focus { outline:none; border-color:#1B4D3E; }
            .lb-select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:9px; font-size:13px; cursor:pointer; }
            .lb-select:focus { outline:none; border-color:#1B4D3E; }

            .lb-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px,1fr)); gap:16px; }
            .lb-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:12px; transition:all .15s; }
            .lb-card:hover { border-color:#1B4D3E; box-shadow:0 3px 12px rgba(0,0,0,.06); }
            .lb-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
            .lb-card-title { font-size:15px; font-weight:700; color:#222; line-height:1.3; flex:1; }
            .lb-vis-badge { font-size:10px; font-weight:700; padding:3px 8px; border-radius:5px; white-space:nowrap; flex-shrink:0; }
            .lb-vis-badge.public  { background:#E8F5E9; color:#1B4D3E; }
            .lb-vis-badge.private { background:#FEF3C7; color:#B45309; }
            .lb-card-desc { font-size:13px; color:#666; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
            .lb-card-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
            .lb-subject-tag { background:#1B4D3E; color:#fff; font-size:10px; font-weight:700; padding:3px 8px; border-radius:5px; }
            .lb-meta-item { font-size:11px; color:#888; display:flex; align-items:center; gap:3px; }
            .lb-tags { display:flex; gap:5px; flex-wrap:wrap; }
            .lb-tag { background:#f3f4f6; color:#555; font-size:11px; padding:2px 8px; border-radius:4px; }
            .lb-card-footer { display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #f0f0f0; gap:8px; flex-wrap:wrap; }
            .lb-author { font-size:12px; color:#999; }
            .lb-author strong { color:#555; }
            .lb-actions { display:flex; gap:7px; }
            .lb-btn { padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:none; transition:all .15s; display:flex; align-items:center; gap:5px; }
            .lb-btn-copy   { background:#1B4D3E; color:#fff; }
            .lb-btn-copy:hover { background:#2D6A4F; }
            .lb-btn-view   { background:#f3f4f6; color:#333; border:1px solid #e0e0e0; }
            .lb-btn-view:hover { background:#eee; }
            .lb-btn-delete { background:#FEE2E2; color:#b91c1c; }
            .lb-btn-delete:hover { background:#fca5a5; }
            .lb-btn-edit   { background:#FEF3C7; color:#B45309; }
            .lb-btn-edit:hover { background:#fde68a; }

            .lb-empty { text-align:center; padding:60px 20px; background:#fafafa; border:1px dashed #ddd; border-radius:12px; }
            .lb-empty h3 { font-size:18px; font-weight:600; color:#333; margin:12px 0 6px; }
            .lb-empty p  { font-size:13px; color:#888; margin:0; }

            /* Modal */
            .lb-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; }
            .lb-modal { background:#fff; border-radius:16px; width:100%; max-width:640px; max-height:90vh; overflow-y:auto; animation:lbModalIn .2s ease-out; }
            @keyframes lbModalIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
            .lb-modal-header { display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:1px solid #e8e8e8; }
            .lb-modal-header h3 { margin:0; font-size:16px; font-weight:700; }
            .lb-modal-close { background:none; border:none; font-size:24px; color:#999; cursor:pointer; }
            .lb-modal-close:hover { color:#333; }
            .lb-modal-body { padding:24px; }
            .lb-modal-footer { padding:16px 24px; border-top:1px solid #e8e8e8; display:flex; justify-content:flex-end; gap:10px; }
            .lb-form-group { margin-bottom:16px; }
            .lb-form-group label { display:block; font-size:12px; font-weight:700; color:#444; margin-bottom:5px; text-transform:uppercase; letter-spacing:.4px; }
            .lb-input, .lb-textarea, .lb-form-select { width:100%; padding:9px 12px; border:1px solid #ddd; border-radius:8px; font-size:13px; font-family:inherit; box-sizing:border-box; }
            .lb-input:focus, .lb-textarea:focus, .lb-form-select:focus { outline:none; border-color:#1B4D3E; }
            .lb-textarea { resize:vertical; min-height:100px; }
            .lb-content-area { resize:vertical; min-height:160px; }
            .lb-row { display:flex; gap:12px; }
            .lb-row .lb-form-group { flex:1; }
            .btn-primary-sm { padding:9px 20px; background:#1B4D3E; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
            .btn-primary-sm:hover { background:#2D6A4F; }
            .btn-outline-sm { padding:9px 18px; background:#fff; border:1px solid #ddd; border-radius:8px; font-size:13px; cursor:pointer; font-weight:500; }

            /* Preview modal */
            .lb-preview-content { background:#f8f9fa; border-radius:8px; padding:16px; font-size:14px; line-height:1.7; color:#333; white-space:pre-wrap; max-height:300px; overflow-y:auto; }

            .copy-count-badge { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:#888; }
        </style>

        <div class="lb-banner">
            <div>
                <h2>${icon('book', { size: 22, className: 'ui-icon-inline' })} Lesson Bank</h2>
                <p>Browse shared lessons from other instructors, or publish your own for the community.</p>
            </div>
            <button class="lb-banner-btn" id="lb-publish-btn">
                + Publish a Lesson
            </button>
        </div>

        <div class="lb-tabs">
            <button class="lb-tab active" data-tab="browse">Browse Bank</button>
            <button class="lb-tab" data-tab="my-bank">My Lessons</button>
        </div>

        <div class="lb-toolbar" id="lb-toolbar">
            <input type="text" class="lb-search" id="lb-search" placeholder="Search lessons, tags...">
            <select class="lb-select" id="lb-subject">
                <option value="">All Subjects</option>
                ${mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
            </select>
        </div>

        <div id="lb-content"></div>
    `;

    // Tab switching
    container.querySelectorAll('.lb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            const toolbar = document.getElementById('lb-toolbar');
            toolbar.style.display = activeTab === 'browse' ? 'flex' : 'none';
            loadContent();
        });
    });

    // Search & filter
    let searchTimer;
    document.getElementById('lb-search').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadContent, 350);
    });
    document.getElementById('lb-subject').addEventListener('change', loadContent);

    // Publish button
    document.getElementById('lb-publish-btn').addEventListener('click', () => openPublishModal(container));

    loadContent();
}

async function loadContent() {
    const wrap = document.getElementById('lb-content');
    if (!wrap) return;
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Loading...</div>';

    if (activeTab === 'browse') {
        const search    = document.getElementById('lb-search')?.value  || '';
        const subjectId = document.getElementById('lb-subject')?.value || '';
        let url = '/LessonBankAPI.php?action=browse';
        if (search)    url += '&search='    + encodeURIComponent(search);
        if (subjectId) url += '&subject_id=' + subjectId;

        const res = await Api.get(url);
        renderBrowse(wrap, res.success ? res.data : []);
    } else {
        const res = await Api.get('/LessonBankAPI.php?action=my-bank');
        renderMyBank(wrap, res.success ? res.data : []);
    }
}

function renderBrowse(wrap, lessons) {
    if (lessons.length === 0) {
        wrap.innerHTML = `<div class="lb-empty">
            <div>${iconLg('folder')}</div>
            <h3>No lessons found</h3>
            <p>Try a different search, or be the first to publish a lesson!</p>
        </div>`;
        return;
    }

    wrap.innerHTML = `<div class="lb-grid">${lessons.map(l => lessonCard(l, false)).join('')}</div>`;

    wrap.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); openCopyModal(btn.dataset.copy, btn.dataset.title); });
    });
    wrap.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); openPreviewModal(lessons.find(l => l.bank_id == btn.dataset.view)); });
    });
    wrap.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); confirmDelete(btn.dataset.delete); });
    });
}

function renderMyBank(wrap, lessons) {
    if (lessons.length === 0) {
        wrap.innerHTML = `<div class="lb-empty">
            <div>${iconLg('edit')}</div>
            <h3>You haven't published anything yet</h3>
            <p>Click "Publish a Lesson" to share your lesson content with other instructors.</p>
        </div>`;
        return;
    }

    wrap.innerHTML = `<div class="lb-grid">${lessons.map(l => lessonCard(l, true)).join('')}</div>`;

    wrap.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); confirmDelete(btn.dataset.delete); });
    });
    wrap.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); openPreviewModal(lessons.find(l => l.bank_id == btn.dataset.view)); });
    });
}

function lessonCard(l, isOwn) {
    const tags  = (l.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const date  = l.created_at ? new Date(l.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '';
    const descr = l.lesson_description || 'No description provided.';

    return `<div class="lb-card">
        <div class="lb-card-head">
            <div class="lb-card-title">${esc(l.lesson_title)}</div>
            <span class="lb-vis-badge ${l.visibility}">${l.visibility}</span>
        </div>
        <div class="lb-card-desc">${esc(descr)}</div>
        ${tags.length ? `<div class="lb-tags">${tags.map(t => `<span class="lb-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="lb-card-meta">
            ${l.subject_code ? `<span class="lb-subject-tag">${esc(l.subject_code)}</span>` : ''}
            <span class="copy-count-badge">${icon('clipboard', inl)} ${l.copy_count ?? 0} copies</span>
            <span class="lb-meta-item">${date}</span>
        </div>
        <div class="lb-card-footer">
            <div class="lb-author">By <strong>${esc(l.first_name + ' ' + l.last_name)}</strong></div>
            <div class="lb-actions">
                <button class="lb-btn lb-btn-view" data-view="${l.bank_id}">Preview</button>
                ${!isOwn ? `<button class="lb-btn lb-btn-copy" data-copy="${l.bank_id}" data-title="${esc(l.lesson_title)}">Copy to My Class</button>` : ''}
                ${isOwn  ? `<button class="lb-btn lb-btn-delete" data-delete="${l.bank_id}">Remove</button>` : ''}
            </div>
        </div>
    </div>`;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function openPublishModal(container) {
    const overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML = `
        <div class="lb-modal">
            <div class="lb-modal-header">
                <h3>Publish Lesson to Bank</h3>
                <button class="lb-modal-close">&times;</button>
            </div>
            <div class="lb-modal-body">
                <div id="pub-alert"></div>
                <div class="lb-form-group">
                    <label>Lesson Title *</label>
                    <input type="text" class="lb-input" id="pub-title" placeholder="e.g. Introduction to Binary Numbers" maxlength="200">
                </div>
                <div class="lb-form-group">
                    <label>Short Description</label>
                    <textarea class="lb-textarea" id="pub-desc" placeholder="Brief summary of what this lesson covers..." rows="2"></textarea>
                </div>
                <div class="lb-form-group">
                    <label>Lesson Content</label>
                    <textarea class="lb-textarea lb-content-area" id="pub-content" placeholder="Paste or type the lesson content here..."></textarea>
                </div>
                <div class="lb-row">
                    <div class="lb-form-group">
                        <label>Subject (optional)</label>
                        <select class="lb-form-select" id="pub-subject">
                            <option value="">-- General / No subject --</option>
                            ${mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="lb-form-group">
                        <label>Visibility</label>
                        <select class="lb-form-select" id="pub-vis">
                            <option value="public">Public (anyone can copy)</option>
                            <option value="private">Private (only me)</option>
                        </select>
                    </div>
                </div>
                <div class="lb-form-group">
                    <label>Tags (comma-separated)</label>
                    <input type="text" class="lb-input" id="pub-tags" placeholder="e.g. intro, programming, basics">
                </div>
            </div>
            <div class="lb-modal-footer">
                <button class="btn-outline-sm pub-cancel">Cancel</button>
                <button class="btn-primary-sm" id="pub-save">Publish to Bank</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.lb-modal-close').addEventListener('click', close);
    overlay.querySelector('.pub-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#pub-save').addEventListener('click', async () => {
        const title = document.getElementById('pub-title').value.trim();
        if (!title) {
            document.getElementById('pub-alert').innerHTML = alertHtml('error', 'Lesson title is required.');
            return;
        }

        const btn = overlay.querySelector('#pub-save');
        btn.disabled = true; btn.textContent = 'Publishing...';

        const res = await Api.post('/LessonBankAPI.php?action=publish', {
            lesson_title:       title,
            lesson_description: document.getElementById('pub-desc').value.trim(),
            lesson_content:     document.getElementById('pub-content').value.trim(),
            subject_id:         document.getElementById('pub-subject').value || null,
            visibility:         document.getElementById('pub-vis').value,
            tags: document.getElementById('pub-tags').value.trim()
        });

        if (res.success) {
            close();
            loadContent();
        } else {
            btn.disabled = false; btn.textContent = 'Publish to Bank';
            document.getElementById('pub-alert').innerHTML = alertHtml('error', res.message || 'Failed to publish.');
        }
    });
}

function openCopyModal(bankId, lessonTitle) {
    const overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML = `
        <div class="lb-modal" style="max-width:480px;">
            <div class="lb-modal-header">
                <h3>Copy to My Class</h3>
                <button class="lb-modal-close">&times;</button>
            </div>
            <div class="lb-modal-body">
                <div id="copy-alert"></div>
                <p style="font-size:13px;color:#555;margin:0 0 16px;">
                    Copying: <strong>${esc(lessonTitle)}</strong><br>
                    <span style="color:#888;font-size:12px;">This creates an independent copy in your subject. You can edit it freely.</span>
                </p>
                <div class="lb-form-group">
                    <label>Copy into subject *</label>
                    <select class="lb-form-select" id="copy-subject">
                        <option value="">-- Select a subject --</option>
                        ${mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="lb-modal-footer">
                <button class="btn-outline-sm copy-cancel">Cancel</button>
                <button class="btn-primary-sm" id="copy-confirm">Copy Lesson</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.lb-modal-close').addEventListener('click', close);
    overlay.querySelector('.copy-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#copy-confirm').addEventListener('click', async () => {
        const subjectId = document.getElementById('copy-subject').value;
        if (!subjectId) {
            document.getElementById('copy-alert').innerHTML = alertHtml('error', 'Please select a subject.');
            return;
        }

        const btn = overlay.querySelector('#copy-confirm');
        btn.disabled = true; btn.textContent = 'Copying...';

        const res = await Api.post('/LessonBankAPI.php?action=copy', {
            bank_id:    parseInt(bankId),
            subject_id: parseInt(subjectId)
        });

        if (res.success) {
            close();
            // Show success toast
            showToast('Lesson copied! Find it in your Lessons page (saved as draft).');
            loadContent();
        } else {
            btn.disabled = false; btn.textContent = 'Copy Lesson';
            document.getElementById('copy-alert').innerHTML = alertHtml('error', res.message || 'Failed to copy.');
        }
    });
}

function openPreviewModal(lesson) {
    if (!lesson) return;
    const tags  = (lesson.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML = `
        <div class="lb-modal">
            <div class="lb-modal-header">
                <h3>${esc(lesson.lesson_title)}</h3>
                <button class="lb-modal-close">&times;</button>
            </div>
            <div class="lb-modal-body">
                <div class="lb-card-meta" style="margin-bottom:12px;">
                    ${lesson.subject_code ? `<span class="lb-subject-tag">${esc(lesson.subject_code)}</span>` : ''}
                    <span class="lb-meta-item">By <strong>${esc((lesson.first_name || '') + ' ' + (lesson.last_name || ''))}</strong></span>
                    <span class="copy-count-badge">${icon('clipboard', inl)} ${lesson.copy_count ?? 0} copies</span>
                </div>
                ${lesson.lesson_description ? `<p style="font-size:13px;color:#555;margin:0 0 14px;">${esc(lesson.lesson_description)}</p>` : ''}
                ${tags.length ? `<div class="lb-tags" style="margin-bottom:14px;">${tags.map(t => `<span class="lb-tag">${esc(t)}</span>`).join('')}</div>` : ''}
                <div class="lb-form-group">
                    <label>Lesson Content</label>
                    <div class="lb-preview-content">${lesson.lesson_content ? esc(lesson.lesson_content) : '<em style="color:#999">No content provided.</em>'}</div>
                </div>
            </div>
            <div class="lb-modal-footer">
                <button class="btn-outline-sm prev-close">Close</button>
                ${lesson.is_own != 1 ? `<button class="btn-primary-sm" id="prev-copy-btn">Copy to My Class</button>` : ''}
            </div>
        </div>`;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.lb-modal-close').addEventListener('click', close);
    overlay.querySelector('.prev-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const copyBtn = overlay.querySelector('#prev-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            close();
            openCopyModal(lesson.bank_id, lesson.lesson_title);
        });
    }
}

async function confirmDelete(bankId) {
    if (!confirm('Remove this lesson from the bank? Other instructors who already copied it keep their copy.')) return;

    const res = await Api.post('/LessonBankAPI.php?action=delete', { bank_id: parseInt(bankId) });
    if (res.success) {
        loadContent();
    } else {
        alert(res.message || 'Failed to remove lesson.');
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1B4D3E;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:lbModalIn .2s ease-out';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function alertHtml(type, msg) {
    const styles = type === 'error'
        ? 'background:#FEE2E2;color:#991b1b;'
        : 'background:#d1fae5;color:#065f46;';
    return `<div style="${styles}padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;font-weight:600;">${esc(msg)}</div>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
