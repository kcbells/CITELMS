/**
 * Class composer — announcement modal + upload-lesson modal triggered from a compose bar.
 */
import { Api } from '../api.js';
import { icon } from '../utils/icons.js';

const MAX_FILE_MB = 25;
const ALLOWED_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'zip', 'rar',
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
    'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'mp4', 'webm', 'mov',
];
const FILE_ACCEPT = ALLOWED_EXTENSIONS.map(e => `.${e}`).join(',');

const inl = { size: 14, className: 'ui-icon-inline' };

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function validateFile(file) {
    if (!file?.size) return 'The selected file appears to be empty.';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `".${ext}" is not allowed.`;
    if (file.size > MAX_FILE_MB * 1024 * 1024) return `File is too large. Max ${MAX_FILE_MB} MB.`;
    return null;
}

function validateUrl(url) {
    if (!url) return 'Please enter a URL.';
    try {
        const p = new URL(url);
        if (!['http:', 'https:'].includes(p.protocol)) return 'URL must start with http:// or https://';
        return null;
    } catch { return 'Please enter a valid URL.'; }
}

function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#00461B;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
}

function injectStyles() {
    if (document.getElementById('class-composer-styles')) return;
    const s = document.createElement('style');
    s.id = 'class-composer-styles';
    s.textContent = `
    /* ── Trigger bar ─────────────────────────────── */
    .cc-bar {
        display:flex; align-items:center; gap:12px;
        padding:12px 16px; background:#fff;
        border:1px solid #E8EAED; border-radius:14px;
        margin-bottom:20px;
        box-shadow:0 1px 3px rgba(0,0,0,.06);
    }
    .cc-bar-pill {
        flex:1; padding:10px 14px;
        border:1px solid #DADCE0; border-radius:24px;
        font-size:14px; color:#9AA0A6; background:#FAFAFA;
        cursor:pointer; text-align:left; font-family:inherit;
        transition:border-color .15s, background .15s;
    }
    .cc-bar-pill:hover { border-color:#00461B; background:#F8FDF9; color:#202124; }
    .cc-bar-actions {
        display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap;
    }
    .cc-bar-btn {
        display:inline-flex; align-items:center; gap:5px;
        padding:7px 12px; border-radius:20px;
        border:1px solid #DADCE0; background:#fff;
        font-size:12px; font-weight:600; color:#5F6368;
        cursor:pointer; font-family:inherit; white-space:nowrap;
        transition:all .15s;
    }
    .cc-bar-btn:hover { border-color:#00461B; color:#00461B; background:#F8FDF9; }
    .cc-bar-btn.cc-bar-btn--primary { border-color:#00461B; color:#00461B; }
    .cc-bar-btn.cc-bar-btn--primary:hover { background:#E8F5EC; }

    /* ── Modal backdrop & shell ─────────────────── */
    .cm-backdrop {
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        z-index:1200; display:flex; align-items:center; justify-content:center;
        padding:16px; animation:cmFadeIn .15s ease;
    }
    @keyframes cmFadeIn { from{opacity:0} to{opacity:1} }
    .cm-modal {
        background:#fff; border-radius:16px; width:100%; max-width:600px;
        max-height:90vh; display:flex; flex-direction:column;
        box-shadow:0 8px 40px rgba(0,0,0,.22);
        animation:cmSlideUp .18s ease;
    }
    @keyframes cmSlideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }

    /* ── Modal head ─────────────────────────────── */
    .cm-head {
        display:flex; align-items:center; gap:12px;
        padding:16px 20px; border-bottom:1px solid #E8EAED;
        flex-shrink:0;
    }
    .cm-head-icon {
        width:36px; height:36px; border-radius:10px;
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .cm-head-icon--ann { background:#F3F4F6; color:#111; }
    .cm-head-icon--les { background:#F3F4F6; color:#111; }
    .cm-head-title { font-size:16px; font-weight:700; color:#202124; margin:0; }
    .cm-head-sub   { font-size:12px; color:#5F6368; margin:2px 0 0; }
    .cm-head-close {
        margin-left:auto; background:none; border:none;
        font-size:22px; color:#9AA0A6; cursor:pointer;
        padding:4px 8px; border-radius:6px; flex-shrink:0; line-height:1;
    }
    .cm-head-close:hover { color:#202124; background:#F1F3F4; }

    /* ── Modal body ─────────────────────────────── */
    .cm-body { padding:20px; overflow-y:auto; flex:1; }
    .cm-field { margin-bottom:14px; }
    .cm-label {
        display:block; font-size:11px; font-weight:700;
        color:#5F6368; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px;
    }
    .cm-input {
        width:100%; padding:9px 12px; border:1px solid #DADCE0; border-radius:8px;
        font-size:13px; font-family:inherit; box-sizing:border-box;
        transition:border-color .15s;
    }
    .cm-input:focus { outline:none; border-color:#00461B; }
    .cm-textarea {
        width:100%; padding:11px 13px; border:1px solid #DADCE0; border-radius:8px;
        font-size:14px; font-family:inherit; box-sizing:border-box;
        min-height:100px; resize:vertical; transition:border-color .15s;
    }
    .cm-textarea:focus { outline:none; border-color:#00461B; }

    /* ── Who-receives / section panel ───────────── */
    .cm-who-panel { border:1px solid #E8EAED; border-radius:10px; overflow:hidden; margin-top:4px; }
    .cm-who-opt {
        display:flex; align-items:center; gap:10px;
        padding:11px 14px; cursor:pointer; background:#fff;
        border-bottom:1px solid #F0F0F0; font-size:13px;
    }
    .cm-who-opt:last-child { border-bottom:none; }
    .cm-who-opt input[type=radio] { accent-color:#00461B; }
    .cm-who-txt strong { display:block; font-size:13px; color:#202124; }
    .cm-who-txt span   { font-size:11px; color:#9AA0A6; }
    .cm-sec-checks {
        padding:10px 12px; background:#FAFAFA; display:flex; flex-direction:column; gap:6px;
    }
    .cm-sec-check {
        display:flex; align-items:center; gap:8px; padding:7px 10px;
        border:1px solid #E8EAED; border-radius:8px; background:#fff;
        font-size:12px; cursor:pointer;
    }
    .cm-sec-check input[type=checkbox] { accent-color:#00461B; }
    .cm-stu-loading { padding:12px 14px; font-size:12px; color:#9AA0A6; font-style:italic; }
    .cm-stu-section-hdr {
        font-size:10px; font-weight:700; color:#9AA0A6; text-transform:uppercase;
        letter-spacing:.5px; padding:8px 14px 4px; background:#FAFAFA;
    }
    .cm-hint { font-size:12px; color:#9AA0A6; padding:10px 14px; margin:0; font-style:italic; }

    /* ── File / link chips ──────────────────────── */
    .cm-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .cm-chip {
        display:inline-flex; align-items:center; gap:5px;
        padding:4px 10px; border-radius:20px;
        background:#E8F5EC; font-size:11px; font-weight:600; color:#00461B;
    }
    .cm-chip--link { background:#EEF2FF; color:#3730A3; }
    .cm-chip button {
        background:none; border:none; color:inherit;
        cursor:pointer; font-size:15px; line-height:1; padding:0; opacity:.7;
    }
    .cm-chip button:hover { opacity:1; }

    /* ── Attach / link toolbar ──────────────────── */
    .cm-attach-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    .cm-attach-btn {
        display:inline-flex; align-items:center; gap:5px;
        padding:7px 13px; border-radius:8px; border:1px solid #DADCE0;
        background:#fff; font-size:12px; font-weight:600; color:#5F6368;
        cursor:pointer; font-family:inherit; transition:all .15s;
    }
    .cm-attach-btn:hover { border-color:#00461B; color:#00461B; background:#F8FDF9; }

    /* ── Link input box ─────────────────────────── */
    .cm-link-box { margin-top:10px; }
    .cm-link-row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start; }
    .cm-link-row .cm-input { flex:1; min-width:100px; }
    .cm-link-add {
        padding:9px 14px; border-radius:8px; border:1px solid #00461B;
        background:#fff; color:#00461B; font-size:12px; font-weight:700;
        cursor:pointer; font-family:inherit; white-space:nowrap;
    }
    .cm-link-add:hover { background:#E8F5EC; }

    /* ── Drag-drop zone (lesson modal) ──────────── */
    .cm-drop {
        border:2px dashed #C5D9CB; border-radius:12px;
        padding:24px 16px; text-align:center; background:#F8FDF9;
        cursor:pointer; position:relative;
        transition:border-color .15s, background .15s;
    }
    .cm-drop.dragover { border-color:#00461B; background:#EEF7F0; }
    .cm-drop input[type=file] { position:absolute; inset:0; opacity:0; cursor:pointer; }
    .cm-drop-icon { color:#00461B; margin-bottom:8px; }
    .cm-drop p { margin:4px 0; font-size:13px; color:#5F6368; }
    .cm-drop strong { color:#202124; font-size:14px; }

    /* ── Alert / hint ───────────────────────────── */
    .cm-alert { font-size:12px; color:#b91c1c; margin-top:8px; }
    .cm-hint  { font-size:11px; color:#9AA0A6; margin-top:6px; }

    /* ── Modal footer ───────────────────────────── */
    .cm-foot {
        display:flex; align-items:center; justify-content:flex-end; gap:10px;
        padding:14px 20px; border-top:1px solid #E8EAED; flex-shrink:0;
    }
    .cm-cancel {
        padding:9px 18px; border-radius:20px; border:1px solid #DADCE0;
        background:#fff; font-size:13px; font-weight:600; color:#5F6368;
        cursor:pointer; font-family:inherit;
    }
    .cm-cancel:hover { background:#F1F3F4; }
    .cm-submit {
        padding:9px 22px; border-radius:20px; border:none;
        background:#00461B; font-size:13px; font-weight:700; color:#fff;
        cursor:pointer; font-family:inherit; transition:background .15s;
    }
    .cm-submit:hover:not(:disabled) { background:#006428; }
    .cm-submit:disabled { opacity:.5; cursor:not-allowed; }
    `;
    document.head.appendChild(s);
}

function audiencePanelHtml(sections, presetSectionId, pfx = 'cm') {
    const defaultAll = !presetSectionId;
    const secChecks = sections.length ? sections.map(sec => `
        <label class="cm-sec-check">
            <input type="checkbox" class="${pfx}-sec-pick" value="${sec.section_id}"
                ${String(sec.section_id) === String(presetSectionId) ? 'checked' : ''}>
            <span>${esc(sec.section_name)}${sec.schedule ? ` · ${esc(sec.schedule)}` : ''}</span>
        </label>`).join('') : '<p class="cm-hint">No sections found.</p>';
    return `
        <div class="cm-who-panel">
            <label class="cm-who-opt">
                <input type="radio" name="${pfx}-aud" value="all" ${defaultAll ? 'checked' : ''}>
                <span class="cm-who-txt">
                    <strong>All students</strong>
                    <span>Everyone enrolled in this subject</span>
                </span>
            </label>
            <label class="cm-who-opt">
                <input type="radio" name="${pfx}-aud" value="sections" ${!defaultAll ? 'checked' : ''}>
                <span class="cm-who-txt">
                    <strong>Specific section(s)</strong>
                    <span>Post to one or more class sections</span>
                </span>
            </label>
            <label class="cm-who-opt" style="border-bottom:none;">
                <input type="radio" name="${pfx}-aud" value="students">
                <span class="cm-who-txt">
                    <strong>Specific students</strong>
                    <span>Hand-pick individual students</span>
                </span>
            </label>
        </div>
        <div class="${pfx}-sec-checks cm-sec-checks" style="${defaultAll ? 'display:none' : ''}">${secChecks}</div>
        <div class="${pfx}-stu-list" style="display:none;">
            <div class="cm-stu-loading">Loading students…</div>
        </div>`;
}

function getSectionTarget(root, pfx = 'cm') {
    const mode = root.querySelector(`input[name="${pfx}-aud"]:checked`)?.value || 'all';
    if (mode === 'students') {
        const studentIds = [...root.querySelectorAll(`.${pfx}-stu-pick:checked`)].map(cb => parseInt(cb.value, 10));
        return { all_sections: false, section_ids: [], student_ids: studentIds };
    }
    const modeAll = mode === 'all';
    const sectionIds = [...root.querySelectorAll(`.${pfx}-sec-pick:checked`)].map(cb => parseInt(cb.value, 10));
    return { all_sections: modeAll, section_ids: modeAll ? [] : sectionIds, student_ids: [] };
}

async function loadStudentPicker(root, pfx, subjectId) {
    const container = root.querySelector(`.${pfx}-stu-list`);
    if (!container) return;
    container.innerHTML = '<div class="cm-stu-loading">Loading students…</div>';
    try {
        const res = await fetch(`${detectApiBase()}/ClassroomAPI.php?action=enrolled-students&subject_id=${subjectId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token') || ''}`, 'X-Requested-With': 'XMLHttpRequest' }
        });
        const data = await res.json();
        const students = data?.data || [];
        if (!students.length) {
            container.innerHTML = '<p class="cm-hint">No enrolled students found.</p>';
            return;
        }
        let lastSection = null;
        container.innerHTML = students.map(s => {
            const secHeader = s.section_name && s.section_name !== lastSection
                ? `<div class="cm-stu-section-hdr">${esc(s.section_name)}</div>`
                : '';
            lastSection = s.section_name;
            const name = `${s.first_name || ''} ${s.last_name || ''}`.trim();
            return `${secHeader}<label class="cm-sec-check">
                <input type="checkbox" class="${pfx}-stu-pick" value="${s.users_id}">
                <span>${esc(name)}${s.student_id ? ` <span style="color:#9AA0A6;font-size:10px;">${esc(s.student_id)}</span>` : ''}</span>
            </label>`;
        }).join('');
    } catch {
        container.innerHTML = '<p class="cm-hint" style="color:#C5221F;">Failed to load students.</p>';
    }
}

function detectApiBase() {
    const m = window.location.pathname.match(/^\/([^/]+)/);
    return (m ? '/' + m[1] : '') + '/api';
}

function wireAudiencePanel(root, pfx, subjectId) {
    let studentsLoaded = false;
    root.querySelectorAll(`input[name="${pfx}-aud"]`).forEach(radio => {
        radio.addEventListener('change', () => {
            const secDiv = root.querySelector(`.${pfx}-sec-checks`);
            const stuDiv = root.querySelector(`.${pfx}-stu-list`);
            if (secDiv) secDiv.style.display = radio.value === 'sections' ? '' : 'none';
            if (stuDiv) {
                stuDiv.style.display = radio.value === 'students' ? '' : 'none';
                if (radio.value === 'students' && !studentsLoaded) {
                    studentsLoaded = true;
                    loadStudentPicker(root, pfx, subjectId);
                }
            }
        });
    });
}

function openBackdrop() {
    const bd = document.createElement('div');
    bd.className = 'cm-backdrop';
    document.body.appendChild(bd);
    return bd;
}

function bindClose(bd, modal) {
    const close = () => bd.remove();
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    modal.querySelector('.cm-head-close')?.addEventListener('click', close);
    modal.querySelector('.cm-cancel')?.addEventListener('click', close);
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    return close;
}

async function uploadLessonMaterials(lessonId, files, links) {
    for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('lessons_id', lessonId);
        const res = await Api.postForm('/LessonsAPI.php?action=upload-material', fd);
        if (!res.success) throw new Error(res.message || `Failed to upload ${file.name}`);
    }
    for (const link of links) {
        const res = await Api.post('/LessonsAPI.php?action=add-link', {
            lessons_id: lessonId,
            url: link.url,
            title: link.title || '',
        });
        if (!res.success) throw new Error(res.message || 'Failed to add link');
    }
}

async function uploadAnnouncementMaterials(announcementId, files, links = []) {
    for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('announcement_id', announcementId);
        const res = await Api.postForm('/AnnouncementsAPI.php?action=upload-material', fd);
        if (!res.success) throw new Error(res.message || `Failed to upload ${file.name}`);
    }
    for (const link of links) {
        const res = await Api.post('/AnnouncementsAPI.php?action=add-link', {
            announcement_id: announcementId,
            url: link.url,
            title: link.title || '',
        });
        if (!res.success) throw new Error(res.message || 'Failed to add link');
    }
}

/* ═══════════════════════════════════════════════════════════════
   Announcement Modal
═══════════════════════════════════════════════════════════════ */
export function openAnnouncementModal({ subjectId, sectionId = null, sections = [], onSuccess = null, _openLink = false } = {}) {
    injectStyles();

    const pendingFiles = [];
    const pendingLinks = [];

    const bd = openBackdrop();
    bd.innerHTML = `
        <div class="cm-modal" id="cm-ann-modal">
            <div class="cm-head">
                <div class="cm-head-icon cm-head-icon--ann">${icon('announce', inl)}</div>
                <div>
                    <p class="cm-head-title">New Announcement</p>
                    <p class="cm-head-sub">Visible to your class · pinned to Calendar</p>
                </div>
                <button class="cm-head-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="cm-body">
                <div class="cm-field">
                    <label class="cm-label" for="cm-ann-title">Title</label>
                    <input class="cm-input" id="cm-ann-title" placeholder="e.g. Quiz this Friday!">
                </div>
                <div class="cm-field">
                    <label class="cm-label" for="cm-ann-msg">Message</label>
                    <textarea class="cm-textarea" id="cm-ann-msg" rows="4"
                        placeholder="Write your announcement here…"></textarea>
                </div>

                <div class="cm-attach-row">
                    <label class="cm-attach-btn">
                        ${icon('attach', inl)} Attach file
                        <input type="file" id="cm-ann-file" hidden multiple accept="${FILE_ACCEPT}">
                    </label>
                    <button type="button" class="cm-attach-btn" id="cm-ann-link-btn">
                        ${icon('link', inl)} Add link
                    </button>
                </div>

                <div class="cm-link-box" id="cm-ann-link-box" style="${_openLink ? '' : 'display:none'}">
                    <div class="cm-label" style="margin-top:10px;">Link</div>
                    <div class="cm-link-row">
                        <input class="cm-input" id="cm-ann-link-title" placeholder="Label (optional)">
                        <input class="cm-input" id="cm-ann-link-url" placeholder="https://…">
                        <button type="button" class="cm-link-add" id="cm-ann-link-add">Add</button>
                    </div>
                </div>

                <div class="cm-chips" id="cm-ann-chips"></div>
                <div class="cm-alert" id="cm-ann-alert" style="display:none"></div>

                <div class="cm-field" style="margin-top:16px;">
                    <span class="cm-label">Who receives this?</span>
                    ${audiencePanelHtml(sections, sectionId, 'ann')}
                </div>
            </div>
            <div class="cm-foot">
                <button type="button" class="cm-cancel">Cancel</button>
                <button type="button" class="cm-submit" id="cm-ann-submit">Post Announcement</button>
            </div>
        </div>`;

    const modal = bd.querySelector('#cm-ann-modal');
    const alertEl = modal.querySelector('#cm-ann-alert');
    bindClose(bd, modal);
    wireAudiencePanel(modal, 'ann', subjectId);

    function renderChips() {
        const chips = modal.querySelector('#cm-ann-chips');
        chips.innerHTML = [
            ...pendingFiles.map((f, i) => `<span class="cm-chip">${icon('document', inl)} ${esc(f.name)}<button data-rm-f="${i}">&times;</button></span>`),
            ...pendingLinks.map((l, i) => `<span class="cm-chip cm-chip--link">${icon('link', inl)} ${esc(l.title || l.url)}<button data-rm-l="${i}">&times;</button></span>`),
        ].join('');
        chips.querySelectorAll('[data-rm-f]').forEach(b => {
            b.addEventListener('click', () => { pendingFiles.splice(+b.dataset.rmF, 1); renderChips(); });
        });
        chips.querySelectorAll('[data-rm-l]').forEach(b => {
            b.addEventListener('click', () => { pendingLinks.splice(+b.dataset.rmL, 1); renderChips(); });
        });
    }

    modal.querySelector('#cm-ann-file').addEventListener('change', e => {
        for (const file of [...(e.target.files || [])]) {
            const err = validateFile(file);
            if (err) { alertEl.textContent = err; alertEl.style.display = ''; return; }
            pendingFiles.push(file);
        }
        e.target.value = '';
        alertEl.style.display = 'none';
        renderChips();
    });

    modal.querySelector('#cm-ann-link-btn').addEventListener('click', () => {
        const box = modal.querySelector('#cm-ann-link-box');
        const open = box.style.display === 'none' || !box.style.display;
        box.style.display = open ? '' : 'none';
        if (open) modal.querySelector('#cm-ann-link-url')?.focus();
    });

    modal.querySelector('#cm-ann-link-add').addEventListener('click', () => {
        const url = modal.querySelector('#cm-ann-link-url').value.trim();
        const title = modal.querySelector('#cm-ann-link-title').value.trim();
        const err = validateUrl(url);
        if (err) { alertEl.textContent = err; alertEl.style.display = ''; return; }
        pendingLinks.push({ url, title: title || url });
        modal.querySelector('#cm-ann-link-url').value = '';
        modal.querySelector('#cm-ann-link-title').value = '';
        modal.querySelector('#cm-ann-link-box').style.display = 'none';
        alertEl.style.display = 'none';
        renderChips();
    });

    modal.querySelector('#cm-ann-submit').addEventListener('click', async () => {
        const btn = modal.querySelector('#cm-ann-submit');
        const title = modal.querySelector('#cm-ann-title').value.trim();
        const msg   = modal.querySelector('#cm-ann-msg').value.trim();
        const { all_sections, section_ids, student_ids } = getSectionTarget(modal, 'ann');

        if (!title && !msg) {
            alertEl.textContent = 'Please enter a title or message.';
            alertEl.style.display = '';
            return;
        }
        const mode = modal.querySelector('input[name="ann-aud"]:checked')?.value || 'all';
        if (mode === 'sections' && section_ids.length === 0) {
            alertEl.textContent = 'Select at least one section.';
            alertEl.style.display = '';
            return;
        }
        if (mode === 'students' && student_ids.length === 0) {
            alertEl.textContent = 'Select at least one student.';
            alertEl.style.display = '';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Posting…';
        alertEl.style.display = 'none';

        try {
            const res = await Api.post('/AnnouncementsAPI.php?action=create', {
                subject_id: parseInt(subjectId, 10),
                title: title || msg.slice(0, 80) || 'Announcement',
                content: msg || title,
                status: 'published',
                all_sections,
                section_ids,
                student_ids,
            });
            if (!res.success) throw new Error(res.message || 'Failed to post announcement');

            if (pendingFiles.length || pendingLinks.length) {
                btn.textContent = 'Uploading…';
                const annId = res.data?.announcement_id;
                if (annId) await uploadAnnouncementMaterials(annId, pendingFiles, pendingLinks);
            }

            bd.remove();
            toast('Announcement posted');
            if (onSuccess) onSuccess();
        } catch (err) {
            alertEl.textContent = err.message || 'Failed to post';
            alertEl.style.display = '';
            btn.disabled = false;
            btn.textContent = 'Post Announcement';
        }
    });

    setTimeout(() => modal.querySelector('#cm-ann-title')?.focus(), 80);
}

/* ═══════════════════════════════════════════════════════════════
   Upload Lesson Modal
═══════════════════════════════════════════════════════════════ */
export function openUploadLessonModal({ subjectId, sectionId = null, sections = [], onSuccess = null } = {}) {
    injectStyles();

    const pendingFiles = [];
    const pendingLinks = [];

    const bd = openBackdrop();
    bd.innerHTML = `
        <div class="cm-modal" id="cm-les-modal">
            <div class="cm-head">
                <div class="cm-head-icon cm-head-icon--les">${icon('upload', inl)}</div>
                <div>
                    <p class="cm-head-title">Upload Lesson</p>
                    <p class="cm-head-sub">PDF, Word, Excel, PowerPoint, images, audio, video</p>
                </div>
                <button class="cm-head-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="cm-body">
                <div class="cm-field">
                    <label class="cm-label" for="cm-les-title">Lesson Title</label>
                    <input class="cm-input" id="cm-les-title" placeholder="e.g. Chapter 3 — Cell Division">
                </div>
                <div class="cm-field">
                    <label class="cm-label" for="cm-les-desc">Description / Instructions</label>
                    <textarea class="cm-textarea" id="cm-les-desc" rows="3"
                        placeholder="Optional notes for students…"></textarea>
                </div>

                <div class="cm-field">
                    <label class="cm-label">Files</label>
                    <div class="cm-drop" id="cm-les-drop">
                        <input type="file" id="cm-les-file" multiple accept="${FILE_ACCEPT}">
                        <div class="cm-drop-icon">${icon('upload', { size: 28, className: '' })}</div>
                        <strong>Drag & drop files here</strong>
                        <p>or click to browse · Max ${MAX_FILE_MB} MB each</p>
                    </div>
                    <div class="cm-chips" id="cm-les-file-chips"></div>
                </div>

                <div class="cm-attach-row">
                    <button type="button" class="cm-attach-btn" id="cm-les-link-btn">
                        ${icon('link', inl)} Add link
                    </button>
                </div>
                <div class="cm-link-box" id="cm-les-link-box" style="display:none">
                    <div class="cm-label" style="margin-top:10px;">Link</div>
                    <div class="cm-link-row">
                        <input class="cm-input" id="cm-les-link-title" placeholder="Label (optional)">
                        <input class="cm-input" id="cm-les-link-url" placeholder="https://…">
                        <button type="button" class="cm-link-add" id="cm-les-link-add">Add</button>
                    </div>
                </div>
                <div class="cm-chips" id="cm-les-link-chips"></div>

                <div class="cm-alert" id="cm-les-alert" style="display:none"></div>

                <div class="cm-field" style="margin-top:16px;">
                    <span class="cm-label">Who receives this?</span>
                    ${audiencePanelHtml(sections, sectionId, 'les')}
                </div>
            </div>
            <div class="cm-foot">
                <button type="button" class="cm-cancel">Cancel</button>
                <button type="button" class="cm-submit" id="cm-les-submit">Upload Lesson</button>
            </div>
        </div>`;

    const modal = bd.querySelector('#cm-les-modal');
    const alertEl = modal.querySelector('#cm-les-alert');
    bindClose(bd, modal);
    wireAudiencePanel(modal, 'les', subjectId);

    function renderFileChips() {
        const chips = modal.querySelector('#cm-les-file-chips');
        chips.innerHTML = pendingFiles.map((f, i) =>
            `<span class="cm-chip">${icon('document', inl)} ${esc(f.name)}<button data-rm="${i}">&times;</button></span>`
        ).join('');
        chips.querySelectorAll('[data-rm]').forEach(b => {
            b.addEventListener('click', () => { pendingFiles.splice(+b.dataset.rm, 1); renderFileChips(); });
        });
    }

    function renderLinkChips() {
        const chips = modal.querySelector('#cm-les-link-chips');
        chips.innerHTML = pendingLinks.map((l, i) =>
            `<span class="cm-chip cm-chip--link">${icon('link', inl)} ${esc(l.title || l.url)}<button data-rm="${i}">&times;</button></span>`
        ).join('');
        chips.querySelectorAll('[data-rm]').forEach(b => {
            b.addEventListener('click', () => { pendingLinks.splice(+b.dataset.rm, 1); renderLinkChips(); });
        });
    }

    const dropZone = modal.querySelector('#cm-les-drop');

    function addFiles(fileList) {
        for (const file of fileList) {
            const err = validateFile(file);
            if (err) { alertEl.textContent = err; alertEl.style.display = ''; return; }
            pendingFiles.push(file);
        }
        alertEl.style.display = 'none';
        renderFileChips();
    }

    modal.querySelector('#cm-les-file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        addFiles([...(e.dataTransfer?.files || [])]);
    });

    modal.querySelector('#cm-les-link-btn').addEventListener('click', () => {
        const box = modal.querySelector('#cm-les-link-box');
        const open = box.style.display === 'none' || !box.style.display;
        box.style.display = open ? '' : 'none';
        if (open) modal.querySelector('#cm-les-link-url')?.focus();
    });

    modal.querySelector('#cm-les-link-add').addEventListener('click', () => {
        const url = modal.querySelector('#cm-les-link-url').value.trim();
        const title = modal.querySelector('#cm-les-link-title').value.trim();
        const err = validateUrl(url);
        if (err) { alertEl.textContent = err; alertEl.style.display = ''; return; }
        pendingLinks.push({ url, title: title || url });
        modal.querySelector('#cm-les-link-url').value = '';
        modal.querySelector('#cm-les-link-title').value = '';
        modal.querySelector('#cm-les-link-box').style.display = 'none';
        alertEl.style.display = 'none';
        renderLinkChips();
    });

    modal.querySelector('#cm-les-submit').addEventListener('click', async () => {
        const btn = modal.querySelector('#cm-les-submit');
        const title = modal.querySelector('#cm-les-title').value.trim();
        const desc  = modal.querySelector('#cm-les-desc').value.trim();
        const { all_sections, section_ids, student_ids } = getSectionTarget(modal, 'les');
        const lesMode = modal.querySelector('input[name="les-aud"]:checked')?.value || 'all';

        if (!title && !pendingFiles.length && !pendingLinks.length) {
            alertEl.textContent = 'Add a title, file, or link before uploading.';
            alertEl.style.display = '';
            return;
        }
        if (lesMode === 'sections' && section_ids.length === 0) {
            alertEl.textContent = 'Select at least one section.';
            alertEl.style.display = '';
            return;
        }
        if (lesMode === 'students' && student_ids.length === 0) {
            alertEl.textContent = 'Select at least one student.';
            alertEl.style.display = '';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating…';
        alertEl.style.display = 'none';

        try {
            const res = await Api.post('/LessonsAPI.php?action=create', {
                subject_id: parseInt(subjectId, 10),
                lesson_title: title || 'Lesson',
                lesson_description: desc.slice(0, 300),
                lesson_content: desc,
                status: 'published',
                all_sections,
                section_ids,
                student_ids,
            });
            if (!res.success) throw new Error(res.message || 'Failed to create lesson');

            const lessonId = res.data?.lessons_id || res.data?.id;
            if (!lessonId) throw new Error('Lesson created but ID missing');

            if (pendingFiles.length || pendingLinks.length) {
                btn.textContent = 'Uploading…';
                await uploadLessonMaterials(lessonId, pendingFiles, pendingLinks);
            }

            bd.remove();
            toast('Lesson uploaded to Classwork');
            if (onSuccess) onSuccess();
        } catch (err) {
            alertEl.textContent = err.message || 'Failed to upload';
            alertEl.style.display = '';
            btn.disabled = false;
            btn.textContent = 'Upload Lesson';
        }
    });

    setTimeout(() => modal.querySelector('#cm-les-title')?.focus(), 80);
}

/* ═══════════════════════════════════════════════════════════════
   Create Activity Modal
═══════════════════════════════════════════════════════════════ */
export function openCreateActivityModal({ subjectId, sectionId = null, sections = [], onSuccess = null } = {}) {
    injectStyles();

    const pendingFiles = [];
    const pendingLinks = [];

    const bd = openBackdrop();
    bd.innerHTML = `
        <div class="cm-modal" id="cm-act-modal">
            <div class="cm-head">
                <div class="cm-head-icon" style="background:#F3F4F6;color:#111;">${icon('document', inl)}</div>
                <div>
                    <p class="cm-head-title">Create Activity</p>
                    <p class="cm-head-sub">Post an assignment or task for students to complete and submit</p>
                </div>
                <button class="cm-head-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="cm-body">
                <div class="cm-field">
                    <label class="cm-label" for="cm-act-title">Activity Title <span style="color:#C5221F">*</span></label>
                    <input class="cm-input" id="cm-act-title" placeholder="e.g. Lab Report — Cell Division">
                </div>
                <div class="cm-field">
                    <label class="cm-label" for="cm-act-desc">Instructions for Students</label>
                    <textarea class="cm-textarea" id="cm-act-desc" rows="4"
                        placeholder="Describe what students need to do, what to submit, and how they will be evaluated…"></textarea>
                </div>
                <div style="display:flex;gap:12px;">
                    <div class="cm-field" style="flex:1;">
                        <label class="cm-label" for="cm-act-due">Due Date &amp; Time (optional)</label>
                        <input class="cm-input" id="cm-act-due" type="datetime-local">
                    </div>
                    <div class="cm-field" style="flex:0 0 110px;">
                        <label class="cm-label" for="cm-act-points">Points</label>
                        <input class="cm-input" id="cm-act-points" type="number" min="0" step="1" placeholder="e.g. 100">
                    </div>
                </div>

                <div class="cm-field">
                    <label class="cm-label">Reference Materials (optional)</label>
                    <div class="cm-drop" id="cm-act-drop">
                        <input type="file" id="cm-act-file" multiple accept="${FILE_ACCEPT}">
                        <div class="cm-drop-icon">${icon('upload', { size: 24, className: '' })}</div>
                        <strong>Attach files students can reference</strong>
                        <p>or click to browse · Max ${MAX_FILE_MB} MB each</p>
                    </div>
                    <div class="cm-chips" id="cm-act-file-chips"></div>
                </div>

                <div class="cm-attach-row">
                    <button type="button" class="cm-attach-btn" id="cm-act-link-btn">
                        ${icon('link', inl)} Add reference link
                    </button>
                </div>
                <div class="cm-link-box" id="cm-act-link-box" style="display:none">
                    <div class="cm-label" style="margin-top:10px;">Link</div>
                    <div class="cm-link-row">
                        <input class="cm-input" id="cm-act-link-title" placeholder="Label (optional)">
                        <input class="cm-input" id="cm-act-link-url" placeholder="https://…">
                        <button type="button" class="cm-link-add" id="cm-act-link-add">Add</button>
                    </div>
                </div>
                <div class="cm-chips" id="cm-act-link-chips"></div>

                <div class="cm-alert" id="cm-act-alert" style="display:none"></div>

                <div class="cm-field" style="margin-top:16px;">
                    <span class="cm-label">Post to</span>
                    ${audiencePanelHtml(sections, sectionId, 'act')}
                </div>
            </div>
            <div class="cm-foot">
                <button type="button" class="cm-cancel">Cancel</button>
                <button type="button" class="cm-submit" id="cm-act-submit">Post Activity</button>
            </div>
        </div>`;

    const modal = bd.querySelector('#cm-act-modal');
    const alertEl = modal.querySelector('#cm-act-alert');
    bindClose(bd, modal);

    wireAudiencePanel(modal, 'act', subjectId);

    function renderFileChips() {
        const chips = modal.querySelector('#cm-act-file-chips');
        chips.innerHTML = pendingFiles.map((f, i) =>
            `<span class="cm-chip">${icon('document', inl)} ${esc(f.name)}<button data-rm="${i}">&times;</button></span>`
        ).join('');
        chips.querySelectorAll('[data-rm]').forEach(b => {
            b.addEventListener('click', () => { pendingFiles.splice(+b.dataset.rm, 1); renderFileChips(); });
        });
    }

    function renderLinkChips() {
        const chips = modal.querySelector('#cm-act-link-chips');
        chips.innerHTML = pendingLinks.map((l, i) =>
            `<span class="cm-chip cm-chip--link">${icon('link', inl)} ${esc(l.title || l.url)}<button data-rm="${i}">&times;</button></span>`
        ).join('');
        chips.querySelectorAll('[data-rm]').forEach(b => {
            b.addEventListener('click', () => { pendingLinks.splice(+b.dataset.rm, 1); renderLinkChips(); });
        });
    }

    const dropZone = modal.querySelector('#cm-act-drop');

    function addFiles(fileList) {
        for (const file of fileList) {
            const err = validateFile(file);
            if (err) { alertEl.textContent = err; alertEl.style.display = ''; return; }
            pendingFiles.push(file);
        }
        alertEl.style.display = 'none';
        renderFileChips();
    }

    modal.querySelector('#cm-act-file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        addFiles([...(e.dataTransfer?.files || [])]);
    });

    modal.querySelector('#cm-act-link-btn').addEventListener('click', () => {
        const box = modal.querySelector('#cm-act-link-box');
        const open = box.style.display === 'none' || !box.style.display;
        box.style.display = open ? '' : 'none';
        if (open) modal.querySelector('#cm-act-link-url')?.focus();
    });

    modal.querySelector('#cm-act-link-add').addEventListener('click', () => {
        const url = modal.querySelector('#cm-act-link-url').value.trim();
        const title = modal.querySelector('#cm-act-link-title').value.trim();
        const err = validateUrl(url);
        if (err) { alertEl.textContent = err; alertEl.style.display = ''; return; }
        pendingLinks.push({ url, title: title || url });
        modal.querySelector('#cm-act-link-url').value = '';
        modal.querySelector('#cm-act-link-title').value = '';
        modal.querySelector('#cm-act-link-box').style.display = 'none';
        alertEl.style.display = 'none';
        renderLinkChips();
    });

    modal.querySelector('#cm-act-submit').addEventListener('click', async () => {
        const btn = modal.querySelector('#cm-act-submit');
        const title = modal.querySelector('#cm-act-title').value.trim();
        const desc  = modal.querySelector('#cm-act-desc').value.trim();
        const dueVal = modal.querySelector('#cm-act-due').value;
        const ptsVal = modal.querySelector('#cm-act-points').value;
        const { all_sections, section_ids, student_ids } = getSectionTarget(modal, 'act');
        const actMode = modal.querySelector('input[name="act-aud"]:checked')?.value || 'all';

        if (!title) {
            alertEl.textContent = 'Activity title is required.';
            alertEl.style.display = '';
            return;
        }
        if (actMode === 'sections' && section_ids.length === 0) {
            alertEl.textContent = 'Select at least one section.';
            alertEl.style.display = '';
            return;
        }
        if (actMode === 'students' && student_ids.length === 0) {
            alertEl.textContent = 'Select at least one student.';
            alertEl.style.display = '';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Posting…';
        alertEl.style.display = 'none';

        try {
            const res = await Api.post('/LessonsAPI.php?action=create', {
                subject_id: parseInt(subjectId, 10),
                lesson_title: title,
                lesson_description: desc,
                lesson_content: desc,
                status: 'published',
                due_date: dueVal || null,
                total_points: ptsVal !== '' ? parseFloat(ptsVal) : null,
                all_sections,
                section_ids,
                student_ids,
            });
            if (!res.success) throw new Error(res.message || 'Failed to create activity');

            const lessonId = res.data?.lessons_id || res.data?.id;
            if (!lessonId) throw new Error('Activity created but ID missing');

            if (pendingFiles.length || pendingLinks.length) {
                btn.textContent = 'Uploading materials…';
                await uploadLessonMaterials(lessonId, pendingFiles, pendingLinks);
            }

            bd.remove();
            toast('Activity posted to Classwork');
            if (onSuccess) onSuccess();
        } catch (err) {
            alertEl.textContent = err.message || 'Failed to post activity';
            alertEl.style.display = '';
            btn.disabled = false;
            btn.textContent = 'Post Activity';
        }
    });

    setTimeout(() => modal.querySelector('#cm-act-title')?.focus(), 80);
}

/* ═══════════════════════════════════════════════════════════════
   Compose trigger bar
═══════════════════════════════════════════════════════════════ */
export function mountClassComposer(mountEl, options = {}) {
    if (!mountEl) return;
    injectStyles();

    const {
        subjectId,
        sectionId = null,
        sections = [],
        instructorInitials = 'IN',
        onCreateQuiz = null,
        onSuccess = null,
    } = options;

    const modalOpts = { subjectId, sectionId, sections, onSuccess };

    mountEl.innerHTML = `
        <div class="cc-bar">
            <div class="sc-avatar teacher-av"
                 style="width:40px;height:40px;font-size:14px;flex-shrink:0;">${esc(instructorInitials)}</div>
            <button type="button" class="cc-bar-pill" id="cc-pill">Write an announcement…</button>
            <div class="cc-bar-actions">
                <button type="button" class="cc-bar-btn" id="cc-bar-activity">
                    ${icon('document', inl)} Create Activity
                </button>
                <button type="button" class="cc-bar-btn" id="cc-bar-lesson">
                    ${icon('upload', inl)} Upload Lesson
                </button>
                ${onCreateQuiz ? `<button type="button" class="cc-bar-btn" id="cc-bar-quiz">${icon('quiz', inl)} Create Quiz</button>` : ''}
            </div>
        </div>`;

    mountEl.querySelector('#cc-pill').addEventListener('click', () => openAnnouncementModal(modalOpts));
    mountEl.querySelector('#cc-bar-activity').addEventListener('click', () => openCreateActivityModal(modalOpts));
    mountEl.querySelector('#cc-bar-lesson').addEventListener('click', () => openUploadLessonModal(modalOpts));
    mountEl.querySelector('#cc-bar-quiz')?.addEventListener('click', () => { if (onCreateQuiz) onCreateQuiz(); });
}
