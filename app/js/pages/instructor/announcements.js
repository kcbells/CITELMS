/**
 * Instructor Announcements — with per-section targeting
 */
import { Api } from '../../api.js';
import { openAnnouncementModal } from '../../components/announcement-modal.js';

let subjects = [];
let classesData = [];

export async function render(container, params = {}) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const presetSubject = params?.subject_id || hashParams.get('subject_id') || '';

    const [subjRes, classesRes] = await Promise.all([
        Api.get('/LessonsAPI.php?action=subjects'),
        Api.get('/SectionsAPI.php?action=instructor-classes')
    ]);
    subjects = subjRes.success ? subjRes.data : [];
    classesData = classesRes.success ? classesRes.data : [];
    renderList(container, presetSubject, '');
}

async function renderList(container, filterSubject = '', filterStatus = '') {
    let params = '';
    if (filterSubject) params += '&subject_id=' + filterSubject;
    if (filterStatus) params += '&status=' + filterStatus;

    const res = await Api.get('/AnnouncementsAPI.php?action=instructor-list' + params);
    const announcements = res.success ? res.data : [];

    container.innerHTML = `
        <style>
            .ac-banner { background:#00461B; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .ac-banner-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
            .ac-banner-title { font-size:26px; font-weight:800; color:#fff; margin:0 0 4px; }
            .ac-banner-sub { font-size:14px; color:rgba(255,255,255,.75); margin:0; }
            .btn-primary { background:#fff; color:#1B4D3E; border:none; padding:10px 20px; border-radius:10px; font-weight:700; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
            .ac-filter-bar { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
            .ac-filter-bar select { padding:9px 14px; border:1px solid #e8ecef; border-radius:10px; font-size:13px; min-width:200px; background:#fff; }
            .ann-list { display:flex; flex-direction:column; gap:12px; }
            .ann-card { background:#fff; border:1px solid #f1f5f9; border-radius:14px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.07); }
            .ann-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:12px; }
            .ann-title { font-size:16px; font-weight:700; color:#111827; }
            .ann-badges { display:flex; gap:6px; flex-wrap:wrap; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
            .badge-published { background:#dcfce7; color:#16a34a; }
            .badge-draft { background:#FEF3C7; color:#B45309; }
            .badge-subject { background:#DBEAFE; color:#1E40AF; }
            .ann-content { font-size:14px; color:#374151; line-height:1.6; margin-bottom:12px; max-height:80px; overflow:hidden; }
            .ann-footer { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
            .ann-meta { font-size:12px; color:#9ca3af; }
            .ann-actions { display:flex; gap:8px; }
            .btn-sm { padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid #e8ecef; background:#fff; }
            .btn-sm.danger { color:#b91c1c; border-color:#fecaca; }
            .empty-state-sm { text-align:center; padding:40px; color:#9ca3af; }
        </style>

        <div class="ac-banner">
            <div class="ac-banner-inner">
                <div>
                    <h2 class="ac-banner-title">Announcements (${announcements.length})</h2>
                    <p class="ac-banner-sub">Post to all sections or choose specific sections</p>
                </div>
                <button class="btn-primary" id="btn-add">+ New Announcement</button>
            </div>
        </div>

        <div class="ac-filter-bar">
            <select id="filter-subject">
                <option value="">All Subjects</option>
                ${subjects.map(s => `<option value="${s.subject_id}" ${String(filterSubject) === String(s.subject_id) ? 'selected' : ''}>${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('')}
            </select>
            <select id="filter-status">
                <option value="" ${!filterStatus ? 'selected' : ''}>All Status</option>
                <option value="published" ${filterStatus === 'published' ? 'selected' : ''}>Published</option>
                <option value="draft" ${filterStatus === 'draft' ? 'selected' : ''}>Draft</option>
            </select>
        </div>

        <div class="ann-list">
            ${announcements.length === 0 ? '<div class="empty-state-sm">No announcements yet.</div>' :
              announcements.map(a => {
                const targetLabel = !a.subject_code
                    ? 'All Classes'
                    : a.all_sections
                        ? `${a.subject_code} — All Sections`
                        : a.section_names
                            ? `${a.subject_code} — ${a.section_names}`
                            : a.subject_code;
                return `
                <div class="ann-card">
                    <div class="ann-top">
                        <div class="ann-title">${esc(a.title)}</div>
                        <div class="ann-badges">
                            <span class="badge badge-subject">${esc(targetLabel)}</span>
                            <span class="badge badge-${a.status}">${a.status}</span>
                        </div>
                    </div>
                    <div class="ann-content">${esc(a.content)}</div>
                    <div class="ann-footer">
                        <span class="ann-meta">Posted ${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</span>
                        <div class="ann-actions">
                            <button class="btn-sm" data-edit="${a.announcement_id}">Edit</button>
                            <button class="btn-sm danger" data-delete="${a.announcement_id}" data-name="${esc(a.title)}">Delete</button>
                        </div>
                    </div>
                </div>`;
              }).join('')}
        </div>
    `;

    container.querySelector('#btn-add').addEventListener('click', () => {
        openAnnouncementModal({
            presetSubjectId: filterSubject,
            subjects,
            classesData,
            onSuccess: () => renderList(container, filterSubject, filterStatus),
        });
    });

    container.querySelector('#filter-subject').addEventListener('change', e => renderList(container, e.target.value, filterStatus));
    container.querySelector('#filter-status').addEventListener('change', e => renderList(container, filterSubject, e.target.value));

    container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = announcements.find(x => x.announcement_id == btn.dataset.edit);
            if (a) {
                openAnnouncementModal({
                    presetSubjectId: filterSubject,
                    ann: a,
                    subjects,
                    classesData,
                    onSuccess: () => renderList(container, filterSubject, filterStatus),
                });
            }
        });
    });

    container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm(`Delete "${btn.dataset.name}"?`)) return;
            const del = await Api.post('/AnnouncementsAPI.php?action=delete', { announcement_id: parseInt(btn.dataset.delete) });
            if (del.success) renderList(container, filterSubject, filterStatus);
            else alert(del.message);
        });
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
