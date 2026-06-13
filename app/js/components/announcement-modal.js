/**
 * Shared announcement modal — all sections or pick sections (checkboxes)
 */
import { Api } from '../api.js';

const MODAL_STYLES = `
    .ann-m-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:2500; padding:20px; animation:annFadeIn .2s ease; }
    @keyframes annFadeIn { from { opacity:0; } to { opacity:1; } }
    .ann-m { background:#fff; border-radius:18px; width:100%; max-width:560px; max-height:92vh; overflow:hidden;
        display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.18); animation:annSlideUp .25s ease; }
    @keyframes annSlideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    .ann-m-hdr { padding:22px 24px; background:#00461B; color:#fff; display:flex;
        justify-content:space-between; align-items:flex-start; gap:12px; }
    .ann-m-hdr h3 { font-size:18px; font-weight:800; margin:0 0 4px; }
    .ann-m-hdr p { font-size:12px; margin:0; opacity:.85; }
    .ann-m-close { background:rgba(255,255,255,.15); border:none; color:#fff; width:32px; height:32px;
        border-radius:8px; font-size:20px; cursor:pointer; flex-shrink:0; line-height:1; }
    .ann-m-close:hover { background:rgba(255,255,255,.25); }
    .ann-m-body { padding:22px 24px; overflow-y:auto; flex:1; }
    .ann-m-ft { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:10px; background:#fafafa; }
    .ann-m-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }
    .ann-m-field { margin-bottom:16px; }
    .ann-m-input, .ann-m-select, .ann-m-textarea { width:100%; padding:11px 14px; border:1.5px solid #e5e7eb; border-radius:10px;
        font-size:14px; box-sizing:border-box; font-family:inherit; transition:border-color .15s, box-shadow .15s; }
    .ann-m-input:focus, .ann-m-select:focus, .ann-m-textarea:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.12); }
    .ann-m-textarea { resize:vertical; min-height:110px; }
    .ann-m-select:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
    .ann-m-alert { background:#FEE2E2; color:#B91C1C; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
    .ann-m-btn-cancel { background:#fff; color:#374151; border:1px solid #e5e7eb; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer; }
    .ann-m-btn-save { background:#00461B; color:#fff; border:none; padding:10px 22px; border-radius:10px; font-weight:700; cursor:pointer; }
    .ann-m-btn-save:hover { background:#006428; }
    .ann-m-btn-save:disabled { opacity:.6; cursor:not-allowed; }
    .ann-sec-panel { border:1.5px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fafafa; }
    .ann-sec-opt { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; background:#fff;
        border-bottom:1px solid #f0f0f0; transition:background .15s; }
    .ann-sec-opt:last-child { border-bottom:none; }
    .ann-sec-opt:hover { background:#f9fafb; }
    .ann-sec-opt input { accent-color:#00461B; width:16px; height:16px; flex-shrink:0; }
    .ann-sec-opt-text { font-size:13px; font-weight:600; color:#111827; }
    .ann-sec-opt-sub { font-size:11px; color:#9ca3af; font-weight:400; display:block; margin-top:1px; }
    .ann-sec-checks { padding:12px 14px; background:#fff; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; gap:8px; }
    .ann-sec-check { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #e5e7eb;
        border-radius:8px; cursor:pointer; font-size:13px; color:#374151; background:#fff; transition:border-color .15s; }
    .ann-sec-check:hover { border-color:#C5D9CB; background:#f8fdf9; }
    .ann-sec-check input { accent-color:#00461B; }
    .ann-sec-check span { flex:1; }
    .ann-sec-check small { color:#9ca3af; font-size:11px; }
    .ann-sec-empty { font-size:12px; color:#9ca3af; padding:8px 0; margin:0; }
`;

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function sectionTargetHtml(sections, ann = null) {
    const selectedIds = ann?.section_ids || [];
    const allSections = ann ? (ann.all_sections !== false && selectedIds.length === 0) : true;

    if (sections.length === 0) {
        return '<p class="ann-sec-empty">No sections yet. Create a section in My Classes first.</p>';
    }

    return `
        <div class="ann-sec-panel" id="ann-sec-panel">
            <label class="ann-sec-opt">
                <input type="radio" name="sec-mode" value="all" ${allSections ? 'checked' : ''}>
                <div>
                    <span class="ann-sec-opt-text">All sections</span>
                    <span class="ann-sec-opt-sub">Everyone enrolled in any section of this subject</span>
                </div>
            </label>
            <label class="ann-sec-opt">
                <input type="radio" name="sec-mode" value="pick" ${!allSections && selectedIds.length ? 'checked' : ''}>
                <div>
                    <span class="ann-sec-opt-text">Choose sections</span>
                    <span class="ann-sec-opt-sub">Pick one or more sections manually</span>
                </div>
            </label>
            <div class="ann-sec-checks" id="ann-sec-checks" style="${allSections ? 'display:none' : ''}">
                ${sections.map(sec => `
                    <label class="ann-sec-check">
                        <input type="checkbox" class="sec-pick" value="${sec.section_id}"
                            ${selectedIds.includes(Number(sec.section_id)) ? 'checked' : ''}>
                        <span>${esc(sec.section_name)}${sec.schedule ? ` <small>· ${esc(sec.schedule)}</small>` : ''}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function wireSectionTarget(overlay) {
    const list = overlay.querySelector('#ann-sec-checks');
    overlay.querySelectorAll('input[name="sec-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (list) list.style.display = radio.value === 'pick' && radio.checked ? '' : 'none';
        });
    });
}

/**
 * @param {Object} options
 * @param {string|number} [options.presetSubjectId]
 * @param {boolean} [options.lockSubject] - hide/lock subject when opened from a subject page
 * @param {Object} [options.ann] - existing announcement for edit
 * @param {Array} [options.subjects] - preloaded subjects list
 * @param {Array} [options.classesData] - instructor-classes data with sections
 * @param {Function} [options.onSuccess]
 */
export async function openAnnouncementModal(options = {}) {
    const {
        presetSubjectId = '',
        lockSubject = false,
        ann = null,
        onSuccess = null,
    } = options;

    let subjects = options.subjects;
    let classesData = options.classesData;

    if (!subjects || !classesData) {
        const [subjRes, classesRes] = await Promise.all([
            Api.get('/LessonsAPI.php?action=subjects'),
            Api.get('/SectionsAPI.php?action=instructor-classes'),
        ]);
        subjects = subjRes.success ? subjRes.data : [];
        classesData = classesRes.success ? classesRes.data : [];
    }

    const isEdit = !!ann;
    const initialSubject = ann?.subject_id || presetSubjectId || '';

    const getSections = (subjectId) => {
        const sub = classesData.find(s => String(s.subject_id) === String(subjectId));
        return sub?.sections || [];
    };

    if (!document.getElementById('ann-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'ann-modal-styles';
        style.textContent = MODAL_STYLES;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.className = 'ann-m-overlay';

    const subjOpts = subjects.map(s =>
        `<option value="${s.subject_id}" ${String(initialSubject) === String(s.subject_id) ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`
    ).join('');

    const lockedSubject = classesData.find(s => String(s.subject_id) === String(initialSubject));

    overlay.innerHTML = `
        <div class="ann-m" role="dialog" aria-modal="true">
            <div class="ann-m-hdr">
                <div>
                    <h3>${isEdit ? 'Edit Announcement' : 'Post Announcement'}</h3>
                    <p>Send to all sections or choose specific ones</p>
                </div>
                <button type="button" class="ann-m-close" aria-label="Close">&times;</button>
            </div>
            <div class="ann-m-body">
                <div id="ann-m-alert"></div>
                ${lockSubject && lockedSubject ? `
                    <div class="ann-m-field">
                        <span class="ann-m-label">Subject</span>
                        <div style="padding:11px 14px;background:#E8F5EC;border-radius:10px;font-size:14px;font-weight:700;color:#00461B;">
                            ${esc(lockedSubject.subject_code)} — ${esc(lockedSubject.subject_name)}
                        </div>
                        <input type="hidden" id="m-subject" value="${lockedSubject.subject_id}">
                    </div>
                ` : `
                    <div class="ann-m-field">
                        <label class="ann-m-label" for="m-subject">Target Subject</label>
                        <select class="ann-m-select" id="m-subject">
                            <option value="">All My Classes</option>
                            ${subjOpts}
                        </select>
                    </div>
                `}
                <div class="ann-m-field" id="sec-target-wrap">
                    <span class="ann-m-label">Who receives this?</span>
                    <div id="sec-target-inner">${sectionTargetHtml(getSections(initialSubject), ann)}</div>
                </div>
                <div class="ann-m-field">
                    <label class="ann-m-label" for="m-title">Title *</label>
                    <input class="ann-m-input" id="m-title" placeholder="Announcement title" value="${esc(ann?.title || '')}">
                </div>
                <div class="ann-m-field">
                    <label class="ann-m-label" for="m-content">Message *</label>
                    <textarea class="ann-m-textarea" id="m-content" placeholder="Write your announcement…">${esc(ann?.content || '')}</textarea>
                </div>
                <div class="ann-m-field">
                    <label class="ann-m-label" for="m-status">Status</label>
                    <select class="ann-m-select" id="m-status">
                        <option value="published" ${ann?.status === 'published' || !ann ? 'selected' : ''}>Published</option>
                        <option value="draft" ${ann?.status === 'draft' ? 'selected' : ''}>Draft</option>
                    </select>
                </div>
            </div>
            <div class="ann-m-ft">
                <button type="button" class="ann-m-btn-cancel modal-cancel">Cancel</button>
                <button type="button" class="ann-m-btn-save" id="ann-m-save">${isEdit ? 'Update' : 'Post Announcement'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.ann-m-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const subjSel = overlay.querySelector('#m-subject');
    const secWrap = overlay.querySelector('#sec-target-inner');

    const refreshSections = () => {
        const sid = subjSel?.value || subjSel?.getAttribute('value') || '';
        const targetWrap = overlay.querySelector('#sec-target-wrap');
        if (targetWrap) targetWrap.style.display = sid ? '' : 'none';
        if (secWrap) {
            secWrap.innerHTML = sectionTargetHtml(getSections(sid), null);
            wireSectionTarget(overlay);
        }
    };

    if (!lockSubject && subjSel?.tagName === 'SELECT') {
        subjSel.addEventListener('change', refreshSections);
    }
    wireSectionTarget(overlay);
    refreshSections();

    overlay.querySelector('#m-title')?.focus();

    overlay.querySelector('#ann-m-save').addEventListener('click', async () => {
        const subjectId = subjSel?.value || subjSel?.getAttribute('value') || null;
        const modeAll = overlay.querySelector('input[name="sec-mode"][value="all"]')?.checked;
        const sectionIds = [...overlay.querySelectorAll('.sec-pick:checked')].map(cb => parseInt(cb.value, 10));

        const payload = {
            subject_id: subjectId || null,
            title: overlay.querySelector('#m-title').value.trim(),
            content: overlay.querySelector('#m-content').value.trim(),
            status: overlay.querySelector('#m-status').value,
            all_sections: !subjectId || modeAll,
            section_ids: subjectId && !modeAll ? sectionIds : [],
        };

        if (!payload.title || !payload.content) {
            overlay.querySelector('#ann-m-alert').innerHTML = '<div class="ann-m-alert">Title and message are required.</div>';
            return;
        }
        if (subjectId && !modeAll && sectionIds.length === 0) {
            overlay.querySelector('#ann-m-alert').innerHTML = '<div class="ann-m-alert">Select at least one section, or choose All sections.</div>';
            return;
        }

        const btn = overlay.querySelector('#ann-m-save');
        btn.disabled = true;
        btn.textContent = isEdit ? 'Updating…' : 'Posting…';

        if (isEdit) payload.announcement_id = ann.announcement_id;
        const res = await Api.post(`/AnnouncementsAPI.php?action=${isEdit ? 'update' : 'create'}`, payload);

        if (res.success) {
            close();
            if (onSuccess) onSuccess();
            else toast('Announcement posted');
        } else {
            overlay.querySelector('#ann-m-alert').innerHTML = `<div class="ann-m-alert">${esc(res.message || 'Failed')}</div>`;
            btn.disabled = false;
            btn.textContent = isEdit ? 'Update' : 'Post Announcement';
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
