/**
 * Shared lesson modal — section targeting, attachments, optional content bank
 */
import { Api } from '../api.js';
import { gradingPeriodSelectHtml } from '../utils/gradebook-periods.js';

const MAX_FILE_MB = 10;
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];

const MODAL_STYLES = `
    .lsn-m-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2500; padding:20px; }
    .lsn-m { background:#fff; border-radius:18px; width:100%; max-width:620px; max-height:92vh; overflow:hidden;
        display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.18); }
    .lsn-m-hdr { padding:22px 24px; background:#00461B; color:#fff;
        display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .lsn-m-hdr h3 { font-size:18px; font-weight:800; margin:0 0 4px; }
    .lsn-m-hdr p { font-size:12px; margin:0; opacity:.85; }
    .lsn-m-close { background:rgba(255,255,255,.15); border:none; color:#fff; width:32px; height:32px;
        border-radius:8px; font-size:20px; cursor:pointer; }
    .lsn-m-body { padding:22px 24px; overflow-y:auto; flex:1; }
    .lsn-m-ft { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:10px; background:#fafafa; }
    .lsn-m-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }
    .lsn-m-field { margin-bottom:16px; }
    .lsn-m-input, .lsn-m-select, .lsn-m-textarea { width:100%; padding:11px 14px; border:1.5px solid #e5e7eb; border-radius:10px;
        font-size:14px; box-sizing:border-box; font-family:inherit; }
    .lsn-m-input:focus, .lsn-m-select:focus, .lsn-m-textarea:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.12); }
    .lsn-m-textarea { resize:vertical; min-height:90px; }
    .lsn-m-alert { background:#FEE2E2; color:#B91C1C; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
    .lsn-m-btn-cancel { background:#fff; color:#374151; border:1px solid #e5e7eb; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer; }
    .lsn-m-btn-save { background:#00461B; color:#fff; border:none; padding:10px 22px; border-radius:10px; font-weight:700; cursor:pointer; }
    .lsn-m-btn-save:disabled { opacity:.6; cursor:not-allowed; }
    .lsn-sec-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .lsn-sec-opt { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; background:#fff; border-bottom:1px solid #f0f0f0; }
    .lsn-sec-opt:last-of-type { border-bottom:none; }
    .lsn-sec-opt input { accent-color:#00461B; width:16px; height:16px; }
    .lsn-sec-opt-text { font-size:13px; font-weight:600; color:#111827; display:block; }
    .lsn-sec-opt-sub { font-size:11px; color:#9ca3af; display:block; margin-top:1px; }
    .lsn-sec-checks { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; gap:8px; }
    .lsn-sec-check { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; cursor:pointer; font-size:13px; }
    .lsn-sec-check input { accent-color:#00461B; }
    .lsn-bank-box { border:1.5px solid #e5e7eb; border-radius:12px; padding:14px; background:#f9fafb; }
    .lsn-bank-toggle { display:flex; align-items:flex-start; gap:10px; cursor:pointer; }
    .lsn-bank-toggle input { accent-color:#00461B; margin-top:3px; }
    .lsn-bank-vis { margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb; }
    .lsn-att-box { border:1.5px dashed #d1d5db; border-radius:12px; padding:14px; background:#fafafa; }
    .lsn-att-actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
    .lsn-att-btn { padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;
        border:1px solid #e5e7eb; background:#fff; color:#374151; display:inline-flex; align-items:center; gap:6px; }
    .lsn-att-btn.green { background:#E8F5EC; color:#00461B; border-color:#C5D9CB; }
    .lsn-att-list { display:flex; flex-direction:column; gap:6px; }
    .lsn-att-item { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px;
        background:#fff; border:1px solid #e5e7eb; border-radius:8px; font-size:12px; }
    .lsn-att-item button { background:none; border:none; color:#b91c1c; cursor:pointer; font-size:11px; font-weight:700; }
    .lsn-link-form { display:none; margin-top:10px; padding:12px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; }
    .lsn-link-form.show { display:block; }
    .lsn-link-row { display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
    .lsn-link-row input { flex:1; min-width:140px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; }
    .lsn-subj-badge { padding:11px 14px; background:#E8F5EC; border-radius:10px; font-size:14px; font-weight:700; color:#00461B; }
`;

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB'];
    let i = 0;
    let s = bytes;
    while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
    return `${s.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function validateFile(file) {
    if (!file || file.size === 0) return 'The selected file appears to be empty.';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return `".${ext}" is not allowed. Use: ${ALLOWED_EXTENSIONS.slice(0, 8).join(', ')}…`;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
        return `File is too large (${formatSize(file.size)}). Max ${MAX_FILE_MB}MB.`;
    }
    return null;
}

function validateUrl(url) {
    if (!url) return 'Please enter a URL.';
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return 'URL must start with http:// or https://';
        return null;
    } catch {
        return 'Please enter a valid URL.';
    }
}

function sectionTargetHtml(sections, presetSectionId = null) {
    if (sections.length === 0) {
        return '<p style="font-size:12px;color:#9ca3af;margin:0;">No sections yet. Create a section first.</p>';
    }
    const defaultAll = !presetSectionId;
    return `
        <div class="lsn-sec-panel" id="lsn-sec-panel">
            <label class="lsn-sec-opt">
                <input type="radio" name="lsn-sec-mode" value="all" ${defaultAll ? 'checked' : ''}>
                <div><span class="lsn-sec-opt-text">All sections</span><span class="lsn-sec-opt-sub">Every section of this subject</span></div>
            </label>
            <label class="lsn-sec-opt">
                <input type="radio" name="lsn-sec-mode" value="pick" ${!defaultAll ? 'checked' : ''}>
                <div><span class="lsn-sec-opt-text">Choose sections</span><span class="lsn-sec-opt-sub">Pick one or more sections</span></div>
            </label>
            <div class="lsn-sec-checks" id="lsn-sec-checks" style="${defaultAll ? 'display:none' : ''}">
                ${sections.map(sec => `
                    <label class="lsn-sec-check">
                        <input type="checkbox" class="lsn-sec-pick" value="${sec.section_id}"
                            ${String(sec.section_id) === String(presetSectionId) ? 'checked' : ''}>
                        <span>${esc(sec.section_name)}${sec.schedule ? ` <small style="color:#9ca3af">· ${esc(sec.schedule)}</small>` : ''}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function wireSectionTarget(overlay) {
    const list = overlay.querySelector('#lsn-sec-checks');
    overlay.querySelectorAll('input[name="lsn-sec-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (list) list.style.display = radio.value === 'pick' && radio.checked ? '' : 'none';
        });
    });
}

function renderAttachList(overlay, pendingFiles, pendingLinks) {
    const list = overlay.querySelector('#lsn-att-list');
    if (!list) return;
    const items = [
        ...pendingFiles.map((f, i) => ({ type: 'file', label: f.name, meta: formatSize(f.size), idx: i })),
        ...pendingLinks.map((l, i) => ({ type: 'link', label: l.title || l.url, meta: 'Link', idx: i })),
    ];
    if (!items.length) {
        list.innerHTML = '<p style="font-size:12px;color:#9ca3af;margin:0;">No attachments yet. Add files or links below.</p>';
        return;
    }
    list.innerHTML = items.map(it => `
        <div class="lsn-att-item">
            <span><strong>${esc(it.label)}</strong> <span style="color:#9ca3af">${esc(it.meta)}</span></span>
            <button type="button" data-rm-${it.type}="${it.idx}">Remove</button>
        </div>
    `).join('');

    list.querySelectorAll('[data-rm-file]').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingFiles.splice(parseInt(btn.dataset.rmFile, 10), 1);
            renderAttachList(overlay, pendingFiles, pendingLinks);
        });
    });
    list.querySelectorAll('[data-rm-link]').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingLinks.splice(parseInt(btn.dataset.rmLink, 10), 1);
            renderAttachList(overlay, pendingFiles, pendingLinks);
        });
    });
}

async function uploadMaterials(lessonId, pendingFiles, pendingLinks) {
    for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('lessons_id', lessonId);
        const res = await Api.postForm('/LessonsAPI.php?action=upload-material', fd);
        if (!res.success) throw new Error(res.message || `Failed to upload ${file.name}`);
    }
    for (const link of pendingLinks) {
        const res = await Api.post('/LessonsAPI.php?action=add-link', {
            lessons_id: lessonId,
            url: link.url,
            title: link.title || '',
        });
        if (!res.success) throw new Error(res.message || 'Failed to add link');
    }
}

/**
 * @param {Object} options
 * @param {string|number} options.presetSubjectId
 * @param {string|number} [options.presetSectionId]
 * @param {boolean} [options.lockSubject]
 * @param {Array} [options.classesData]
 * @param {Function} [options.onSuccess]
 */
export async function openLessonModal(options = {}) {
    const {
        presetSubjectId = '',
        presetSectionId = null,
        lockSubject = false,
        onSuccess = null,
    } = options;

    let classesData = options.classesData;
    if (!classesData) {
        const res = await Api.get('/SectionsAPI.php?action=instructor-classes');
        classesData = res.success ? res.data : [];
    }

    const subject = classesData.find(s => String(s.subject_id) === String(presetSubjectId));
    const sections = subject?.sections || [];

    if (!document.getElementById('lsn-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'lsn-modal-styles';
        style.textContent = MODAL_STYLES;
        document.head.appendChild(style);
    }

    const pendingFiles = [];
    const pendingLinks = [];

    const overlay = document.createElement('div');
    overlay.className = 'lsn-m-overlay';

    overlay.innerHTML = `
        <div class="lsn-m" role="dialog" aria-modal="true">
            <div class="lsn-m-hdr">
                <div>
                    <h3>Add Lesson</h3>
                    <p>Choose sections, attach files, and optionally save to Content Bank</p>
                </div>
                <button type="button" class="lsn-m-close" aria-label="Close">&times;</button>
            </div>
            <div class="lsn-m-body">
                <div id="lsn-m-alert"></div>
                ${lockSubject && subject ? `
                    <div class="lsn-m-field">
                        <span class="lsn-m-label">Subject</span>
                        <div class="lsn-subj-badge">${esc(subject.subject_code)} — ${esc(subject.subject_name)}</div>
                        <input type="hidden" id="lsn-subject" value="${subject.subject_id}">
                    </div>
                ` : `
                    <div class="lsn-m-field">
                        <label class="lsn-m-label" for="lsn-subject">Subject *</label>
                        <select class="lsn-m-select" id="lsn-subject">
                            <option value="">Select subject</option>
                            ${classesData.map(s => `<option value="${s.subject_id}" ${String(presetSubjectId) === String(s.subject_id) ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                        </select>
                    </div>
                `}
                <div class="lsn-m-field" id="lsn-sec-wrap">
                    <span class="lsn-m-label">Sections *</span>
                    <div id="lsn-sec-inner">${sectionTargetHtml(sections, presetSectionId)}</div>
                </div>
                <div class="lsn-m-field">
                    <label class="lsn-m-label" for="lsn-title">Lesson Title *</label>
                    <input class="lsn-m-input" id="lsn-title" placeholder="e.g. Introduction to Programming">
                </div>
                ${gradingPeriodSelectHtml('lsn-period', 'P1')}
                <div class="lsn-m-field">
                    <label class="lsn-m-label" for="lsn-content">Lesson Content</label>
                    <textarea class="lsn-m-textarea" id="lsn-content" rows="4" placeholder="Main lesson text, instructions, or notes"></textarea>
                </div>
                <div class="lsn-m-field">
                    <label class="lsn-m-label" for="lsn-due">Due date (optional)</label>
                    <input class="lsn-m-input" type="date" id="lsn-due">
                </div>
                <div class="lsn-m-field">
                    <label class="lsn-m-label" for="lsn-status">Status</label>
                    <select class="lsn-m-select" id="lsn-status">
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                    </select>
                </div>
                <div class="lsn-m-field">
                    <span class="lsn-m-label">Attachments</span>
                    <div class="lsn-att-box">
                        <div class="lsn-att-actions">
                            <label class="lsn-att-btn green">
                                Upload File
                                <input type="file" id="lsn-file-input" hidden multiple
                                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.ogg,.m4a,.aac,.flac">
                            </label>
                            <button type="button" class="lsn-att-btn green" id="lsn-add-link-btn">Add Link</button>
                        </div>
                        <div class="lsn-link-form" id="lsn-link-form">
                            <div class="lsn-link-row">
                                <input type="text" id="lsn-link-title" placeholder="Title (optional)">
                                <input type="url" id="lsn-link-url" placeholder="https://...">
                            </div>
                            <div style="display:flex;gap:8px;justify-content:flex-end">
                                <button type="button" class="lsn-att-btn" id="lsn-link-cancel">Cancel</button>
                                <button type="button" class="lsn-att-btn green" id="lsn-link-save">Add</button>
                            </div>
                        </div>
                        <div class="lsn-att-list" id="lsn-att-list"></div>
                    </div>
                </div>
                <div class="lsn-m-field">
                    <span class="lsn-m-label">Content Bank</span>
                    <div class="lsn-bank-box">
                        <label class="lsn-bank-toggle">
                            <input type="checkbox" id="lsn-bank-check">
                            <div>
                                <span class="lsn-sec-opt-text">Also save to Content Bank</span>
                                <span class="lsn-sec-opt-sub">Reuse this lesson in other classes or share with instructors</span>
                            </div>
                        </label>
                        <div class="lsn-bank-vis" id="lsn-bank-vis" style="display:none">
                            <label class="lsn-m-label" for="lsn-bank-visibility">Bank visibility</label>
                            <select class="lsn-m-select" id="lsn-bank-visibility">
                                <option value="public">Public — all instructors can browse</option>
                                <option value="private">Private — only me</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div class="lsn-m-ft">
                <button type="button" class="lsn-m-btn-cancel modal-cancel">Cancel</button>
                <button type="button" class="lsn-m-btn-save" id="lsn-save">Create Lesson</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.lsn-m-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const subjSel = overlay.querySelector('#lsn-subject');
    const secInner = overlay.querySelector('#lsn-sec-inner');
    const secWrap = overlay.querySelector('#lsn-sec-wrap');

    const refreshSections = () => {
        const sid = subjSel?.value || subjSel?.getAttribute('value') || '';
        const sub = classesData.find(s => String(s.subject_id) === String(sid));
        const secs = sub?.sections || [];
        if (secWrap) secWrap.style.display = sid ? '' : 'none';
        if (secInner) {
            secInner.innerHTML = sectionTargetHtml(secs, presetSectionId && String(sid) === String(presetSubjectId) ? presetSectionId : null);
            wireSectionTarget(overlay);
        }
    };

    if (subjSel?.tagName === 'SELECT') {
        subjSel.addEventListener('change', refreshSections);
    }
    wireSectionTarget(overlay);
    refreshSections();
    renderAttachList(overlay, pendingFiles, pendingLinks);

    overlay.querySelector('#lsn-bank-check').addEventListener('change', (e) => {
        overlay.querySelector('#lsn-bank-vis').style.display = e.target.checked ? '' : 'none';
    });

    overlay.querySelector('#lsn-add-link-btn').addEventListener('click', () => {
        overlay.querySelector('#lsn-link-form').classList.toggle('show');
    });
    overlay.querySelector('#lsn-link-cancel').addEventListener('click', () => {
        overlay.querySelector('#lsn-link-form').classList.remove('show');
        overlay.querySelector('#lsn-link-url').value = '';
        overlay.querySelector('#lsn-link-title').value = '';
    });
    overlay.querySelector('#lsn-link-save').addEventListener('click', () => {
        const url = overlay.querySelector('#lsn-link-url').value.trim();
        const title = overlay.querySelector('#lsn-link-title').value.trim();
        const err = validateUrl(url);
        if (err) {
            overlay.querySelector('#lsn-m-alert').innerHTML = `<div class="lsn-m-alert">${esc(err)}</div>`;
            return;
        }
        pendingLinks.push({ url, title });
        overlay.querySelector('#lsn-link-form').classList.remove('show');
        overlay.querySelector('#lsn-link-url').value = '';
        overlay.querySelector('#lsn-link-title').value = '';
        overlay.querySelector('#lsn-m-alert').innerHTML = '';
        renderAttachList(overlay, pendingFiles, pendingLinks);
    });

    overlay.querySelector('#lsn-file-input').addEventListener('change', (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = '';
        for (const file of files) {
            const err = validateFile(file);
            if (err) {
                overlay.querySelector('#lsn-m-alert').innerHTML = `<div class="lsn-m-alert">${esc(err)}</div>`;
                return;
            }
            pendingFiles.push(file);
        }
        overlay.querySelector('#lsn-m-alert').innerHTML = '';
        renderAttachList(overlay, pendingFiles, pendingLinks);
    });

    overlay.querySelector('#lsn-title')?.focus();

    overlay.querySelector('#lsn-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#lsn-m-alert');
        const subjectId = subjSel?.value || subjSel?.getAttribute('value') || '';
        const modeAll = overlay.querySelector('input[name="lsn-sec-mode"][value="all"]')?.checked;
        const sectionIds = [...overlay.querySelectorAll('.lsn-sec-pick:checked')].map(cb => parseInt(cb.value, 10));
        const publishToBank = overlay.querySelector('#lsn-bank-check').checked;

        const dueVal = overlay.querySelector('#lsn-due')?.value || '';
        const payload = {
            subject_id: parseInt(subjectId, 10),
            lesson_title: overlay.querySelector('#lsn-title').value.trim(),
            lesson_description: '',
            lesson_content: overlay.querySelector('#lsn-content').value.trim(),
            status: overlay.querySelector('#lsn-status').value,
            grading_period: overlay.querySelector('#lsn-period')?.value || 'P1',
            due_date: dueVal || null,
            all_sections: modeAll,
            section_ids: !modeAll ? sectionIds : [],
        };

        if (!payload.subject_id || !payload.lesson_title) {
            alertEl.innerHTML = '<div class="lsn-m-alert">Subject and lesson title are required.</div>';
            return;
        }
        if (!modeAll && sectionIds.length === 0) {
            alertEl.innerHTML = '<div class="lsn-m-alert">Select at least one section, or choose All sections.</div>';
            return;
        }

        const btn = overlay.querySelector('#lsn-save');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        try {
            const res = await Api.post('/LessonsAPI.php?action=create', payload);
            if (!res.success) throw new Error(res.message || 'Failed to create lesson');

            const lessonId = res.data?.lessons_id || res.data?.id;
            if (!lessonId) throw new Error('Lesson created but ID missing');

            if (pendingFiles.length || pendingLinks.length) {
                btn.textContent = 'Uploading attachments…';
                await uploadMaterials(lessonId, pendingFiles, pendingLinks);
            }

            if (publishToBank) {
                btn.textContent = 'Saving to Content Bank…';
                const bankRes = await Api.post('/LessonBankAPI.php?action=publish', {
                    lessons_id: lessonId,
                    visibility: overlay.querySelector('#lsn-bank-visibility').value,
                });
                if (!bankRes.success) throw new Error(bankRes.message || 'Lesson saved but Content Bank publish failed');
            }

            close();
            toast(publishToBank ? 'Lesson created and added to Content Bank' : 'Lesson created');
            if (onSuccess) onSuccess();
        } catch (err) {
            alertEl.innerHTML = `<div class="lsn-m-alert">${esc(err.message || 'Failed')}</div>`;
            btn.disabled = false;
            btn.textContent = 'Create Lesson';
        }
    });
}

function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#00461B;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:3000;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}
