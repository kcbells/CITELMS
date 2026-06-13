/**
 * Student Announcements Page
 * Read-only view of instructor announcements
 */
import { Api }  from '../../api.js';
import { Auth } from '../../auth.js';
import { L, icon, iconLg } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:60px">
        <div style="width:36px;height:36px;border:3px solid #e8e8e8;border-top-color:#1B4D3E;border-radius:50%;animation:spin .8s linear infinite"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>`;

    const [annRes, subjRes] = await Promise.all([
        Api.get('/AnnouncementsAPI.php?action=student-list'),
        Api.get('/EnrollmentAPI.php?action=my-subjects')
    ]);

    const announcements = annRes.success ? annRes.data : [];
    const subjects      = subjRes.success ? subjRes.data : [];

    // Mark announcements as seen — clears the notification badge for this user
    try {
        const uid = Auth.user()?.id;
        if (uid) localStorage.setItem(`ann_last_seen_${uid}`, new Date().toISOString());
    } catch (_) {}

    renderPage(container, announcements, subjects, '');
}

function renderPage(container, allAnn, subjects, filterSubject) {
    // Apply filter: selected subject shows that subject's posts + "All Classes" global posts
    const list = filterSubject
        ? allAnn.filter(a => String(a.subject_id) === String(filterSubject) || !a.subject_offered_id)
        : allAnn;

    const newCount = list.filter(a => isNew(a)).length;

    container.innerHTML = `
        <style>
            /* Banner */
            .an-banner { background:#00461B; border-radius:16px; padding:24px 28px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }
            .an-banner::before { content:''; position:absolute; right:-30px; top:-30px; width:160px; height:160px; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
            .an-banner-left { position:relative; z-index:1; }
            .an-banner-left h2 { font-size:22px; font-weight:800; color:#fff; margin:0 0 4px; }
            .an-banner-left p  { font-size:13px; color:rgba(255,255,255,.75); margin:0; }
            .an-banner-right { position:relative; z-index:1; }
            .an-banner-stat { display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); border-radius:12px; padding:10px 18px; }
            .an-banner-stat-num { font-size:24px; font-weight:800; color:#fff; line-height:1; }
            .an-banner-stat-lbl { font-size:12px; color:rgba(255,255,255,.8); font-weight:600; }

            /* Filter bar */
            .an-filter-bar { background:#fff; border:1px solid #e8e8e8; border-radius:14px; padding:14px 20px; margin-bottom:20px; display:flex; align-items:center; gap:14px; box-shadow:0 1px 3px rgba(0,0,0,.05); flex-wrap:wrap; }
            .an-filter-label { font-size:13px; font-weight:700; color:#374151; white-space:nowrap; }
            .an-filter-wrap { position:relative; flex:1; max-width:340px; }
            .an-filter-wrap svg { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; color:#6b7280; }
            .an-filter-select { width:100%; padding:9px 36px 9px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:13px; font-weight:600; color:#111827; background:#fff; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; transition:border-color .15s; }
            .an-filter-select:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }
            .an-count-chip { margin-left:auto; background:#E8F5E9; color:#1B4D3E; padding:5px 14px; border-radius:20px; font-size:12px; font-weight:700; white-space:nowrap; }

            /* Cards */
            .an-list { display:flex; flex-direction:column; gap:12px; }
            @keyframes an-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
            .an-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; padding:0; overflow:hidden; transition:box-shadow .2s, transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.06); animation:an-fadein .2s ease both; }
            .an-card:hover { box-shadow:0 6px 20px rgba(0,0,0,.09); transform:translateY(-1px); }
            .an-card-body { padding:20px 22px 16px; }

            .an-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
            .an-card-title { font-size:16px; font-weight:700; color:#111827; flex:1; line-height:1.4; }
            .an-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:center; flex-shrink:0; }
            .an-badge { padding:3px 9px; border-radius:20px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.3px; white-space:nowrap; }
            .an-badge-subject { background:#DBEAFE; color:#1E40AF; }
            .an-badge-all     { background:#f3f4f6; color:#6b7280; }
            .an-badge-new     { background:#E8F5E9; color:#15803D; }
            .an-badge-urgent  { background:#FEE2E2; color:#B91C1C; }
            .an-badge-reminder{ background:#FEF3C7; color:#B45309; }
            .an-badge-event   { background:#EDE9FE; color:#6D28D9; }
            .an-badge-pinned  { background:#1B4D3E; color:#fff; }

            .an-content { font-size:14px; color:#374151; line-height:1.7; white-space:pre-line; margin-bottom:14px; }

            .an-card-footer { display:flex; justify-content:space-between; align-items:center; padding:10px 22px; background:#fafafa; border-top:1px solid #f1f5f9; font-size:12px; color:#9ca3af; }
            .an-author { font-weight:700; color:#374151; }
            .an-date { white-space:nowrap; }

            /* Empty */
            .an-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:64px 24px; background:#fff; border-radius:16px; border:2px dashed #e2e8f0; text-align:center; color:#9ca3af; }
            .an-empty-icon { font-size:40px; margin-bottom:14px; }
            .an-empty h3 { font-size:16px; font-weight:700; color:#374151; margin:0 0 6px; }
            .an-empty p  { font-size:13px; margin:0; }
        </style>

        <!-- Banner -->
        <div class="an-banner">
            <div class="an-banner-left">
                <h2>${icon('announce', { size: 22, className: 'ui-icon-inline' })} Announcements</h2>
                <p>Updates and notices from your instructors</p>
            </div>
            <div class="an-banner-right">
                <div class="an-banner-stat">
                    <div>
                        <div class="an-banner-stat-num">${allAnn.length}</div>
                        <div class="an-banner-stat-lbl">Total</div>
                    </div>
                    ${newCount > 0 ? `<div style="width:1px;height:30px;background:rgba(255,255,255,.2)"></div>
                    <div>
                        <div class="an-banner-stat-num" style="color:#FCD34D">${newCount}</div>
                        <div class="an-banner-stat-lbl">New</div>
                    </div>` : ''}
                </div>
            </div>
        </div>

        <!-- Filter bar -->
        <div class="an-filter-bar">
            <span class="an-filter-label">${L.book} Filter by Subject</span>
            <div class="an-filter-wrap">
                <select class="an-filter-select" id="an-filter">
                    <option value="">All Subjects</option>
                    ${subjects.map(s => `<option value="${s.subject_id}" ${filterSubject == s.subject_id ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                </select>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </div>
            <span class="an-count-chip">${list.length} announcement${list.length !== 1 ? 's' : ''}</span>
        </div>

        <!-- List -->
        <div class="an-list">
            ${list.length === 0
                ? `<div class="an-empty">
                       <div class="an-empty-icon">${iconLg('folder')}</div>
                       <h3>No announcements yet</h3>
                       <p>${filterSubject ? 'No announcements for this subject.' : 'Your instructors haven\'t posted anything yet.'}</p>
                   </div>`
                : list.map((a, i) => buildCard(a, i)).join('')
            }
        </div>
    `;

    container.querySelector('#an-filter').addEventListener('change', e => {
        renderPage(container, allAnn, subjects, e.target.value);
    });
}

function buildCard(a, i) {
    const newFlag     = isNew(a);
    const pinned      = a.is_pinned == 1;
    const annType     = a.announcement_type || 'general';
    const isUrgent    = annType === 'urgent';
    const cardClass   = pinned ? 'pinned' : isUrgent ? 'urgent' : '';
    const delay       = Math.min(i * 40, 200);

    const typeBadge = {
        general:  '',
        urgent:   `<span class="an-badge an-badge-urgent">${icon('siren', inl)} Urgent</span>`,
        reminder: `<span class="an-badge an-badge-reminder">${icon('clock', inl)} Reminder</span>`,
        event:    `<span class="an-badge an-badge-event">${L.event}</span>`,
    }[annType] || '';

    const authorName = [a.author_first, a.author_last].filter(Boolean).join(' ') || 'Instructor';
    const dateStr    = a.created_at
        ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '';

    return `
        <div class="an-card ${cardClass}" style="animation-delay:${delay}ms">
            <div class="an-card-body">
                <div class="an-card-top">
                    <div class="an-card-title">${esc(a.title)}</div>
                    <div class="an-badges">
                        ${a.subject_code
                            ? `<span class="an-badge an-badge-subject">${esc(a.subject_code)}</span>`
                            : `<span class="an-badge an-badge-all">All Classes</span>`
                        }
                        ${typeBadge}
                        ${pinned ? `<span class="an-badge an-badge-pinned">${icon('pin', inl)} Pinned</span>` : ''}
                        ${newFlag ? '<span class="an-badge an-badge-new">New</span>' : ''}
                    </div>
                </div>
                <div class="an-content">${esc(a.content)}</div>
            </div>
            <div class="an-card-footer">
                <span>By <span class="an-author">${esc(authorName)}</span></span>
                <span class="an-date">${dateStr}</span>
            </div>
        </div>`;
}

function isNew(a) {
    return a.created_at && (Date.now() - new Date(a.created_at).getTime()) < 3 * 24 * 60 * 60 * 1000;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
