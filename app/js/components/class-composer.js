/**
 * Inline class composer — post announcements or lessons from the Classwork feed.
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
const FILE_TYPE_HINT = 'PDF, Word, Excel, PowerPoint, images, audio, video, ZIP';

const inl = { size: 14, className: 'ui-icon-inline' };

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
    if (!file?.size) return 'The selected file appears to be empty.';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return `".${ext}" is not allowed.`;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
        return `File is too large. Max ${MAX_FILE_MB}MB.`;
    }
    return null;
}

function validateUrl(url) {
    if (!url) return 'Please enter a URL.';
    try {
        const p = new URL(url);
        if (!['http:', 'https:'].includes(p.protocol)) return 'URL must start with http:// or https://';
        return null;
    } catch {
        return 'Please enter a valid URL.';
    }
}

function isYoutubeUrl(url) {
    return /youtube\.com|youtu\.be/i.test(url || '');
}

function injectStyles() {
    if (document.getElementById('class-composer-styles')) return;
    const s = document.createElement('style');
    s.id = 'class-composer-styles';
    s.textContent = `
        .sc-cw-compose-bar {
            display:flex; gap:16px; align-items:flex-start;
            padding:0 0 20px; margin-bottom:4px;
            border-bottom:1px solid #E8EAED;
        }
        .sc-cw-profile-col { flex-shrink:0; width:120px; text-align:center; padding-top:4px; }
        .sc-cw-profile-col .sc-avatar { width:48px; height:48px; font-size:16px; margin:0 auto 8px; }
        .sc-cw-profile-col .sc-cw-instructor-name { font-size:13px; font-weight:700; color:#202124; display:block; }
        .sc-cw-profile-col .sc-cw-instructor-role { font-size:11px; font-weight:600; color:#00461B; }
        .sc-cw-compose-col { flex:1; min-width:0; }
        .cc-box {
            border:1px solid #DADCE0; border-radius:12px; background:#fff;
            overflow:hidden; transition:border-color .15s, box-shadow .15s;
        }
        .cc-box:focus-within { border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
        .cc-textarea {
            width:100%; min-height:72px; max-height:200px; padding:14px 16px;
            border:none; resize:vertical; font-size:14px; font-family:inherit;
            box-sizing:border-box; outline:none; color:#202124;
        }
        .cc-textarea::placeholder { color:#9AA0A6; }
        .cc-toolbar {
            display:flex; flex-wrap:wrap; align-items:center; gap:8px;
            padding:10px 12px; background:#FAFAFA; border-top:1px solid #E8EAED;
        }
        .cc-tool-btn {
            display:inline-flex; align-items:center; gap:5px;
            padding:7px 12px; border-radius:8px; border:1px solid #DADCE0;
            background:#fff; font-size:12px; font-weight:600; color:#5F6368;
            cursor:pointer; font-family:inherit; transition:all .15s;
        }
        .cc-tool-btn:hover { border-color:#00461B; color:#00461B; background:#F8FDF9; }
        .cc-tool-btn.active { background:#E8F5EC; border-color:#00461B; color:#00461B; }
        .cc-post-btn {
            margin-left:auto; padding:8px 20px; border-radius:20px;
            border:none; background:#00461B; color:#fff;
            font-size:13px; font-weight:700; cursor:pointer; font-family:inherit;
        }
        .cc-post-btn:hover:not(:disabled) { background:#006428; }
        .cc-post-btn:disabled { opacity:.55; cursor:not-allowed; }
        .cc-quiz-btn {
            padding:8px 16px; border-radius:20px; border:1.5px solid #00461B;
            background:#fff; color:#00461B; font-size:13px; font-weight:700;
            cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px;
        }
        .cc-quiz-btn:hover { background:#F8FDF9; }
        .cc-attach-zone {
            margin:0 12px 10px; padding:14px 16px; border:1.5px dashed #C5D9CB;
            border-radius:10px; background:#F8FDF9; transition:border-color .15s, background .15s;
        }
        .cc-attach-zone.dragover { border-color:#00461B; background:#EEF7F0; }
        .cc-attach-zone[hidden] { display:none !important; }
        .cc-attach-zone-title { font-size:13px; font-weight:700; color:#00461B; margin:0 0 4px;
            display:flex; align-items:center; gap:6px; }
        .cc-attach-zone-types { font-size:11px; color:#5F6368; margin:0 0 10px; line-height:1.4; }
        .cc-attach-picker-btn {
            display:inline-flex; align-items:center; gap:6px; padding:8px 14px;
            border-radius:8px; border:1px solid #00461B; background:#fff;
            color:#00461B; font-size:12px; font-weight:700; cursor:pointer;
        }
        .cc-attach-picker-btn:hover { background:#E8F5EC; }
        .cc-attach-picker-btn input { display:none; }
        .cc-panel {
            display:none; padding:12px 14px; border-top:1px solid #E8EAED; background:#fff;
        }
        .cc-panel.open { display:block; }
        .cc-type-row { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
        .cc-type-opt {
            flex:1; min-width:140px; padding:10px 12px; border:2px solid #E8EAED;
            border-radius:10px; cursor:pointer; background:#fff; text-align:left;
            font-family:inherit; transition:border-color .15s;
        }
        .cc-type-opt:hover { border-color:#C5D9CB; }
        .cc-type-opt.selected { border-color:#00461B; background:#F8FDF9; }
        .cc-type-opt strong { display:block; font-size:13px; color:#202124; margin-bottom:2px; }
        .cc-type-opt span { font-size:11px; color:#5F6368; }
        .cc-field { margin-bottom:10px; }
        .cc-label { font-size:11px; font-weight:700; color:#5F6368; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px; display:block; }
        .cc-input {
            width:100%; padding:9px 12px; border:1px solid #DADCE0; border-radius:8px;
            font-size:13px; box-sizing:border-box; font-family:inherit;
        }
        .cc-input:focus { outline:none; border-color:#00461B; }
        .cc-sec-panel { border:1px solid #E8EAED; border-radius:10px; overflow:hidden; }
        .cc-sec-opt {
            display:flex; align-items:center; gap:10px; padding:10px 12px;
            cursor:pointer; background:#fff; border-bottom:1px solid #F0F0F0;
            font-size:13px;
        }
        .cc-sec-opt:last-child { border-bottom:none; }
        .cc-sec-opt input { accent-color:#00461B; }
        .cc-sec-checks { padding:10px 12px; background:#FAFAFA; display:flex; flex-direction:column; gap:6px; }
        .cc-sec-check {
            display:flex; align-items:center; gap:8px; padding:7px 10px;
            border:1px solid #E8EAED; border-radius:8px; background:#fff;
            font-size:12px; cursor:pointer;
        }
        .cc-sec-check input { accent-color:#00461B; }
        .cc-att-list { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
        .cc-att-chip {
            display:inline-flex; align-items:center; gap:6px;
            padding:5px 10px; background:#E8F5EC; border-radius:20px;
            font-size:11px; font-weight:600; color:#00461B;
        }
        .cc-att-chip button {
            border:none; background:none; color:#b91c1c; cursor:pointer;
            font-size:14px; line-height:1; padding:0;
        }
        .cc-link-row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
        .cc-link-row .cc-input { flex:1; min-width:120px; }
        .cc-alert { font-size:12px; color:#b91c1c; margin-top:8px; }
        .cc-hint { font-size:11px; color:#9AA0A6; margin-top:6px; }
        @media (max-width:700px) {
            .sc-cw-compose-bar { flex-direction:column; }
            .sc-cw-profile-col { width:100%; display:flex; align-items:center; gap:10px; text-align:left; }
            .sc-cw-profile-col .sc-avatar { margin:0; }
        }
    `;
    document.head.appendChild(s);
}

function sectionPanelHtml(sections, presetSectionId) {
    if (!sections.length) {
        return '<p class="cc-hint">No sections yet. Create a section in My Classes first.</p>';
    }
    const defaultAll = !presetSectionId;
    return `
        <div class="cc-sec-panel">
            <label class="cc-sec-opt">
                <input type="radio" name="cc-sec-mode" value="all" ${defaultAll ? 'checked' : ''}>
                <span><strong>All sections</strong> — everyone in this subject</span>
            </label>
            <label class="cc-sec-opt">
                <input type="radio" name="cc-sec-mode" value="pick" ${!defaultAll ? 'checked' : ''}>
                <span><strong>Choose sections</strong> — pick one or more</span>
            </label>
            <div class="cc-sec-checks" id="cc-sec-checks" style="${defaultAll ? 'display:none' : ''}">
                ${sections.map(sec => `
                    <label class="cc-sec-check">
                        <input type="checkbox" class="cc-sec-pick" value="${sec.section_id}"
                            ${String(sec.section_id) === String(presetSectionId) ? 'checked' : ''}>
                        <span>${esc(sec.section_name)}${sec.schedule ? ` · ${esc(sec.schedule)}` : ''}</span>
                    </label>
                `).join('')}
            </div>
        </div>`;
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

function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#00461B;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:3000;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
}

/**
 * @param {HTMLElement} mountEl
 * @param {Object} options
 * @param {string|number} options.subjectId
 * @param {string|number} [options.sectionId]
 * @param {Array} options.sections
 * @param {string} options.instructorName
 * @param {string} options.instructorInitials
 * @param {Function} [options.onCreateQuiz]
 * @param {Function} [options.onSuccess]
 */
export function mountClassComposer(mountEl, options = {}) {
    if (!mountEl) return;

    injectStyles();

    const {
        subjectId,
        sectionId = null,
        sections = [],
        instructorName = 'Instructor',
        instructorInitials = 'IN',
        onCreateQuiz = null,
        onSuccess = null,
    } = options;

    const pendingFiles = [];
    const pendingLinks = [];
    let postType = 'lesson';
    let panelOpen = false;

    function renderAttachChips(root) {
        const list = root.querySelector('#cc-att-list');
        if (!list) return;
        const chips = [
            ...pendingFiles.map((f, i) => ({ type: 'file', label: f.name, idx: i })),
            ...pendingLinks.map((l, i) => ({ type: 'link', label: l.title || l.url, idx: i })),
        ];
        list.innerHTML = chips.length
            ? chips.map(c => `
                <span class="cc-att-chip">
                    ${esc(c.label)}
                    <button type="button" data-rm-${c.type}="${c.idx}" aria-label="Remove">&times;</button>
                </span>`).join('')
            : '';
        list.querySelectorAll('[data-rm-file]').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingFiles.splice(parseInt(btn.dataset.rmFile, 10), 1);
                renderAttachChips(root);
            });
        });
        list.querySelectorAll('[data-rm-link]').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingLinks.splice(parseInt(btn.dataset.rmLink, 10), 1);
                renderAttachChips(root);
            });
        });
    }

    function getSectionTarget(root) {
        const modeAll = root.querySelector('input[name="cc-sec-mode"][value="all"]')?.checked;
        const sectionIds = [...root.querySelectorAll('.cc-sec-pick:checked')].map(cb => parseInt(cb.value, 10));
        return { all_sections: modeAll, section_ids: !modeAll ? sectionIds : [] };
    }

    function syncAttachZone(root) {
        const zone = root.querySelector('#cc-attach-zone');
        if (zone) zone.hidden = postType === 'announce';
    }

    function addFiles(root, fileList, alertEl) {
        for (const file of fileList) {
            const err = validateFile(file);
            if (err) {
                if (alertEl) {
                    alertEl.textContent = err;
                    alertEl.hidden = false;
                    alertEl.style.color = '#b91c1c';
                }
                return false;
            }
            pendingFiles.push(file);
        }
        if (pendingFiles.length && postType === 'announce') {
            postType = 'lesson';
            root.querySelectorAll('.cc-type-opt').forEach(b => {
                b.classList.toggle('selected', b.dataset.type === 'lesson');
            });
            if (alertEl) {
                alertEl.textContent = 'Files attached — switched to Upload Lesson so students can download them.';
                alertEl.hidden = false;
                alertEl.style.color = '#00461B';
            }
        }
        syncAttachZone(root);
        renderAttachChips(root);
        return true;
    }

    mountEl.innerHTML = `
        <div class="sc-cw-compose-bar">
            <div class="sc-cw-profile-col">
                <div class="sc-avatar teacher-av">${esc(instructorInitials)}</div>
                <span class="sc-cw-instructor-name">${esc(instructorName)}</span>
                <span class="sc-cw-instructor-role">Instructor</span>
            </div>
            <div class="sc-cw-compose-col">
                <div class="cc-box" id="cc-box">
                    <textarea class="cc-textarea" id="cc-text" rows="3"
                        placeholder="Write instructions or a message for your class…"></textarea>
                    <div class="cc-attach-zone" id="cc-attach-zone">
                        <p class="cc-attach-zone-title">${icon('attach', inl)} Attach lesson files</p>
                        <p class="cc-attach-zone-types">${FILE_TYPE_HINT} · max ${MAX_FILE_MB}MB each</p>
                        <label class="cc-attach-picker-btn">
                            ${icon('folder', inl)} Choose files
                            <input type="file" id="cc-file-zone" multiple accept="${FILE_ACCEPT}">
                        </label>
                    </div>
                    <div class="cc-att-list" id="cc-att-list"></div>
                    <div class="cc-toolbar">
                        <label class="cc-tool-btn" title="Attach file">
                            ${icon('attach', inl)} Attach
                            <input type="file" id="cc-file" hidden multiple accept="${FILE_ACCEPT}">
                        </label>
                        <button type="button" class="cc-tool-btn" id="cc-yt-btn" title="Add YouTube or link">
                            ${icon('video', inl)} Link
                        </button>
                        <button type="button" class="cc-tool-btn" id="cc-options-btn">
                            ${icon('settings', inl)} Options
                        </button>
                        ${onCreateQuiz ? `<button type="button" class="cc-quiz-btn" id="cc-create-quiz">${icon('quiz', inl)} Create Quiz</button>` : ''}
                        <button type="button" class="cc-post-btn" id="cc-post">Post</button>
                    </div>
                    <div class="cc-panel" id="cc-panel">
                        <div class="cc-type-row">
                            <button type="button" class="cc-type-opt selected" data-type="lesson">
                                <strong>${icon('document', inl)} Upload Lesson</strong>
                                <span>Post to Classwork with PDF, Word, Excel, PowerPoint & more</span>
                            </button>
                            <button type="button" class="cc-type-opt" data-type="announce">
                                <strong>${icon('announce', inl)} Announcement</strong>
                                <span>Shows on Calendar — newest posts appear first</span>
                            </button>
                        </div>
                        <div class="cc-field" id="cc-title-wrap">
                            <label class="cc-label" for="cc-title">Title</label>
                            <input class="cc-input" id="cc-title" placeholder="Lesson or announcement title">
                        </div>
                        <div class="cc-field">
                            <span class="cc-label">Post to sections</span>
                            <div id="cc-sec-inner">${sectionPanelHtml(sections, sectionId)}</div>
                        </div>
                        <div class="cc-link-form" id="cc-link-form" style="display:none">
                            <span class="cc-label">Add link (YouTube, website, etc.)</span>
                            <div class="cc-link-row">
                                <input class="cc-input" id="cc-link-title" placeholder="Title (optional)">
                                <input class="cc-input" id="cc-link-url" placeholder="https://youtube.com/...">
                                <button type="button" class="cc-tool-btn" id="cc-link-add">Add</button>
                            </div>
                        </div>
                        <p class="cc-hint" id="cc-type-hint">Lesson posts appear in Classwork (newest at top). Attach PDF, Word, Excel, PowerPoint, images, audio, or video.</p>
                        <div class="cc-alert" id="cc-alert" hidden></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const root = mountEl;

    root.querySelectorAll('input[name="cc-sec-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const list = root.querySelector('#cc-sec-checks');
            if (list) list.style.display = radio.value === 'pick' && radio.checked ? '' : 'none';
        });
    });

    root.querySelector('#cc-options-btn').addEventListener('click', () => {
        panelOpen = !panelOpen;
        root.querySelector('#cc-panel').classList.toggle('open', panelOpen);
        root.querySelector('#cc-options-btn').classList.toggle('active', panelOpen);
    });

    root.querySelectorAll('.cc-type-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            postType = btn.dataset.type;
            root.querySelectorAll('.cc-type-opt').forEach(b => b.classList.toggle('selected', b === btn));
            const hint = root.querySelector('#cc-type-hint');
            if (hint) {
                hint.textContent = postType === 'announce'
                    ? 'Announcements appear on the Calendar (newest first). Use Upload Lesson for file attachments.'
                    : 'Lesson posts appear in Classwork (newest at top). Attach PDF, Word, Excel, PowerPoint, images, audio, or video.';
            }
            syncAttachZone(root);
        });
    });

    root.querySelector('#cc-create-quiz')?.addEventListener('click', () => {
        if (onCreateQuiz) onCreateQuiz();
    });

    const attachZone = root.querySelector('#cc-attach-zone');
    ['dragenter', 'dragover'].forEach(evt => {
        attachZone?.addEventListener(evt, (e) => {
            e.preventDefault();
            attachZone.classList.add('dragover');
        });
    });
    attachZone?.addEventListener('dragleave', () => attachZone.classList.remove('dragover'));
    attachZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        attachZone.classList.remove('dragover');
        const alertEl = root.querySelector('#cc-alert');
        addFiles(root, [...(e.dataTransfer?.files || [])], alertEl);
    });

    const onFileInput = (e) => {
        const alertEl = root.querySelector('#cc-alert');
        if (addFiles(root, [...(e.target.files || [])], alertEl)) {
            alertEl.hidden = true;
        }
        e.target.value = '';
    };
    root.querySelector('#cc-file').addEventListener('change', onFileInput);
    root.querySelector('#cc-file-zone')?.addEventListener('change', onFileInput);

    root.querySelector('#cc-yt-btn').addEventListener('click', () => {
        panelOpen = true;
        root.querySelector('#cc-panel').classList.add('open');
        root.querySelector('#cc-options-btn').classList.add('active');
        const form = root.querySelector('#cc-link-form');
        form.style.display = '';
        root.querySelector('#cc-link-url')?.focus();
    });

    root.querySelector('#cc-link-add')?.addEventListener('click', () => {
        const url = root.querySelector('#cc-link-url').value.trim();
        const title = root.querySelector('#cc-link-title').value.trim();
        const err = validateUrl(url);
        const alertEl = root.querySelector('#cc-alert');
        if (err) {
            alertEl.textContent = err;
            alertEl.hidden = false;
            return;
        }
        pendingLinks.push({ url, title: title || (isYoutubeUrl(url) ? 'YouTube video' : 'Link') });
        root.querySelector('#cc-link-url').value = '';
        root.querySelector('#cc-link-title').value = '';
        root.querySelector('#cc-link-form').style.display = 'none';
        alertEl.hidden = true;
        renderAttachChips(root);
    });

    root.querySelector('#cc-post').addEventListener('click', async () => {
        const alertEl = root.querySelector('#cc-alert');
        const btn = root.querySelector('#cc-post');
        const text = root.querySelector('#cc-text').value.trim();
        let title = root.querySelector('#cc-title').value.trim();
        const { all_sections, section_ids } = getSectionTarget(root);

        if (!text && !title && !pendingFiles.length && !pendingLinks.length) {
            alertEl.textContent = 'Write a message or add a title before posting.';
            alertEl.hidden = false;
            alertEl.style.color = '#b91c1c';
            return;
        }

        if (!all_sections && section_ids.length === 0) {
            alertEl.textContent = 'Select at least one section, or choose All sections.';
            alertEl.hidden = false;
            alertEl.style.color = '#b91c1c';
            return;
        }

        if (!title) {
            title = text.split('\n')[0].slice(0, 80) || (postType === 'announce' ? 'Class announcement' : 'New lesson');
        }

        if (postType === 'announce' && pendingFiles.length) {
            alertEl.textContent = 'Switch to Upload Lesson to attach files, or remove file attachments.';
            alertEl.hidden = false;
            alertEl.style.color = '#b91c1c';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Posting…';
        alertEl.hidden = true;

        try {
            if (postType === 'announce') {
                let content = text;
                if (pendingLinks.length) {
                    const linksBlock = pendingLinks.map(l => `${l.title}: ${l.url}`).join('\n');
                    content = content ? `${content}\n\n${linksBlock}` : linksBlock;
                }
                const res = await Api.post('/AnnouncementsAPI.php?action=create', {
                    subject_id: parseInt(subjectId, 10),
                    title,
                    content: content || title,
                    status: 'published',
                    all_sections,
                    section_ids,
                });
                if (!res.success) throw new Error(res.message || 'Failed to post announcement');
                toast('Announcement posted — see Calendar tab');
            } else {
                const res = await Api.post('/LessonsAPI.php?action=create', {
                    subject_id: parseInt(subjectId, 10),
                    lesson_title: title,
                    lesson_description: text.slice(0, 300),
                    lesson_content: text,
                    status: 'published',
                    all_sections,
                    section_ids,
                });
                if (!res.success) throw new Error(res.message || 'Failed to create lesson');

                const lessonId = res.data?.lessons_id || res.data?.id;
                if (!lessonId) throw new Error('Lesson created but ID missing');

                if (pendingFiles.length || pendingLinks.length) {
                    btn.textContent = 'Uploading…';
                    await uploadLessonMaterials(lessonId, pendingFiles, pendingLinks);
                }
                toast('Lesson posted to classwork');
            }

            root.querySelector('#cc-text').value = '';
            root.querySelector('#cc-title').value = '';
            pendingFiles.length = 0;
            pendingLinks.length = 0;
            renderAttachChips(root);
            panelOpen = false;
            root.querySelector('#cc-panel').classList.remove('open');
            root.querySelector('#cc-options-btn').classList.remove('active');

            if (onSuccess) onSuccess();
        } catch (err) {
            alertEl.textContent = err.message || 'Failed to post';
            alertEl.hidden = false;
            alertEl.style.color = '#b91c1c';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Post';
        }
    });
}
